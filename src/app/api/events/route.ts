import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import crypto from "crypto";
import fs from "fs";
import {
  DATA_DIR,
  LATEST_FILE,
  countrySlug,
  getDataset,
  invalidateDataset,
  readJSONFile,
  toLite,
} from "@/lib/event-store";
import { isContentLanguage, localizeEvents, translationSignature } from "@/lib/translation-store";

/**
 * Events API route for War Library.
 *
 * GET  /api/events - Returns merged, deduplicated, sorted events.
 * POST /api/events - Appends new events (requires wl_admin cookie)
 *
 * The merged dataset is built once and cached in module scope by
 * `@/lib/event-store`, keyed on the mtime+size of the three source files.
 * Rebuilding it means parsing ~30MB of JSON and sorting tens of thousands of
 * events, which blocks the single Node process serving the whole site — so it
 * must not happen per request.
 *
 * GET query parameters (all optional; a bare GET returns the full dataset for
 * backward compatibility with already-deployed clients and service workers):
 *   summary=1        Aggregate counts + daily histogram only. ~50KB instead of ~29MB.
 *   from=ISO,to=ISO  Restrict to an inclusive event-date window.
 *   country=slug     Only events whose country resolves to this hub slug
 *                    (aliases fold in: "us" and "usa" are united-states).
 *   limit,offset     Page through the (newest-first) result set.
 *   fields=lite      Drop the long-form narrative fields; enough to render the map.
 *
 * Responses carry a strong-ish ETag derived from the source-file signature and
 * the query, so the client's poll can be answered with a 304 and an empty body
 * whenever the dataset has not changed.
 */

// ---------------------------------------------------------------------------
// Admin POST validation
// ---------------------------------------------------------------------------

interface AdminConflictEvent {
  date: string;
  event_type: string;
  description: string;
  latitude: number;
  longitude: number;
  country: string;
  region?: string;
  actors?: string[];
  fatalities?: number;
  /** Required. A named outlet, or a comma-separated list for cross-referenced events. */
  source: string;
  /** Optional — cross-referenced events name outlets instead of linking one article. */
  source_url?: string;
}

function isValidEvent(event: unknown): event is AdminConflictEvent {
  if (!event || typeof event !== "object") return false;
  const e = event as Record<string, unknown>;
  const requiredFields = [
    "date",
    "event_type",
    "description",
    "latitude",
    "longitude",
    "country",
    // Attribution is the whole premise of this dataset, and this admin path was
    // the one route into it that did not enforce any. The pipeline rejects an
    // extracted event without a source_url; a hand-posted event could arrive
    // with no attribution whatsoever. Every event in the live dataset has a
    // named source — that invariant is now enforced here too.
    "source",
  ];
  for (const field of requiredFields) {
    if (e[field] === undefined || e[field] === null) return false;
  }
  if (typeof e.date !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(e.date))
    return false;
  if (typeof e.latitude !== "number" || typeof e.longitude !== "number")
    return false;
  // A named outlet, or several — cross-referenced events name every outlet that
  // reported them rather than privileging one link, which is the stricter form
  // of attribution, not a weaker one.
  if (typeof e.source !== "string" || e.source.trim() === "") return false;
  // A source_url is optional (cross-referenced events legitimately have none),
  // but if one is supplied it has to actually be a link.
  if (e.source_url !== undefined && e.source_url !== null) {
    if (typeof e.source_url !== "string" || !/^https?:\/\//.test(e.source_url)) {
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Auth check
// ---------------------------------------------------------------------------

function isAuthenticated(request: NextRequest): boolean {
  return isAdmin(request);
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

function parseBoundedInt(
  value: string | null,
  fallback: number,
  min: number,
  max: number
): number {
  if (value === null) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

/**
 * Parse a date-window param.
 *
 * A bare `YYYY-MM-DD` is treated as covering the whole day, so
 * `?from=2026-07-01&to=2026-07-01` returns that day's events rather than only
 * the ones stamped exactly midnight UTC. Bare dates are pinned to UTC so the
 * result does not depend on the server's timezone.
 *
 * Returns `undefined` for an absent value and `null` for an unparseable one, so
 * the caller can tell "not supplied" from "supplied but wrong".
 */
function parseDateParam(
  value: string | null,
  edge: "start" | "end"
): number | null | undefined {
  if (value === null || value === "") return undefined;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const iso = dateOnly
    ? `${value}T${edge === "start" ? "00:00:00.000" : "23:59:59.999"}Z`
    : value;
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? null : time;
}

// ---------------------------------------------------------------------------
// GET /api/events
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const dataset = getDataset();

  // lang=xx swaps each event's description (and civilian impact) for the
  // machine translation in that language where one exists, and says so on
  // the event (`description_lang`, `translated`). English, or no param,
  // returns the record as written. An unknown code is a 400 like any other
  // malformed parameter, not a silent fallback to English.
  const langParam = searchParams.get("lang");
  const lang = langParam && langParam !== "en" ? langParam : null;
  if (lang !== null && !isContentLanguage(lang)) {
    return NextResponse.json(
      { error: "Invalid 'lang' parameter. Use one of the site's language codes (es, fr, tr, ar, fa, ur, he) or omit it for English." },
      { status: 400 }
    );
  }

  // ETag covers the underlying data, the translation table in play and the
  // shape of this specific query. Without the translation signature a poll
  // after new translations landed would be answered 304 with the English
  // text still on screen.
  const etag = `W/"${crypto
    .createHash("sha1")
    .update(`${dataset.signature}|${lang ? translationSignature(lang) : ""}|${searchParams.toString()}`)
    .digest("hex")
    .slice(0, 20)}"`;

  const baseHeaders: Record<string, string> = {
    ETag: etag,
    "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    Vary: "Accept-Encoding",
  };

  // Unchanged since the client last asked — answer with no body at all.
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: baseHeaders });
  }

  const meta = {
    total: dataset.summary.total,
    last_updated: dataset.lastUpdated,
  };

  // --- summary mode ---------------------------------------------------------
  if (searchParams.get("summary") === "1") {
    return NextResponse.json(
      { data: dataset.summary, meta },
      { headers: baseHeaders }
    );
  }

  // --- windowed / paged mode ------------------------------------------------
  let events = dataset.events;

  const from = parseDateParam(searchParams.get("from"), "start");
  const to = parseDateParam(searchParams.get("to"), "end");

  // Reject a malformed window rather than silently ignoring it and returning
  // the entire dataset, which looks to the caller like a filter that matched
  // everything.
  if (from === null || to === null) {
    return NextResponse.json(
      {
        error:
          "Invalid 'from' or 'to' parameter. Use YYYY-MM-DD or a full ISO 8601 timestamp.",
      },
      { status: 400 }
    );
  }

  if (from !== undefined || to !== undefined) {
    events = events.filter((event) => {
      const time = new Date(event.date).getTime();
      if (Number.isNaN(time)) return false;
      if (from !== undefined && time < from) return false;
      if (to !== undefined && time > to) return false;
      return true;
    });
  }

  const country = searchParams.get("country");
  if (country !== null && country !== "") {
    const wanted = country.toLowerCase();
    if (!/^[a-z0-9-]{1,80}$/.test(wanted)) {
      return NextResponse.json(
        { error: "Invalid 'country' parameter. Use a hub slug such as iran or united-states." },
        { status: 400 }
      );
    }
    events = events.filter((event) => countrySlug(event.country) === wanted);
  }

  const matched = events.length;
  const offset = parseBoundedInt(searchParams.get("offset"), 0, 0, matched);
  // No limit param means "everything", preserving the original contract.
  const limit = parseBoundedInt(
    searchParams.get("limit"),
    matched,
    0,
    matched
  );

  const page = localizeEvents(events.slice(offset, offset + limit), lang);
  const data =
    searchParams.get("fields") === "lite"
      ? page.map((e) => ({ ...toLite(e), description_lang: e.description_lang, translated: e.translated }))
      : page;

  return NextResponse.json(
    {
      data,
      meta: {
        ...meta,
        matched,
        returned: data.length,
        offset,
      },
    },
    { headers: baseHeaders }
  );
}

// ---------------------------------------------------------------------------
// POST /api/events
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // Auth check
  if (!isAuthenticated(request)) {
    return NextResponse.json(
      { error: "Unauthorized. Admin access required (wl_admin cookie)." },
      { status: 401 }
    );
  }

  // Parse body
  let body: { events?: unknown[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!body.events || !Array.isArray(body.events)) {
    return NextResponse.json(
      { error: 'Request body must include an "events" array.' },
      { status: 400 }
    );
  }

  if (body.events.length === 0) {
    return NextResponse.json(
      { error: "Events array is empty." },
      { status: 400 }
    );
  }

  // Validate each event
  const validEvents: AdminConflictEvent[] = [];
  const invalid: number[] = [];

  for (let i = 0; i < body.events.length; i++) {
    if (isValidEvent(body.events[i])) {
      validEvents.push(body.events[i] as AdminConflictEvent);
    } else {
      invalid.push(i);
    }
  }

  if (validEvents.length === 0) {
    return NextResponse.json(
      {
        error: "No valid events in the request.",
        invalid_indices: invalid,
        required_fields: [
          "date (YYYY-MM-DD)",
          "event_type",
          "description",
          "latitude (number)",
          "longitude (number)",
          "country",
          "source (named outlet, or comma-separated list for cross-referenced events)",
        ],
        optional_fields: [
          "source_url (must be http(s) if supplied; omit for cross-referenced events)",
        ],
      },
      { status: 400 }
    );
  }

  // Read current latest events and append
  const currentLatest = readJSONFile(LATEST_FILE);
  const updatedLatest = [...currentLatest, ...validEvents];

  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Write updated file atomically (tmp + rename), so a reader can never observe
  // a half-written file and treat it as an empty dataset.
  try {
    // Unique tmp name per writer. The pipeline (scripts/update-events.js) writes
    // the same target via `${filePath}.tmp`; sharing that exact path meant a
    // concurrent pipeline run and admin POST could interleave into one tmp file
    // and publish a corrupt 20MB dataset.
    const tmpFile = `${LATEST_FILE}.api-${process.pid}-${Date.now()}.tmp`;
    fs.writeFileSync(
      tmpFile,
      JSON.stringify({ events: updatedLatest }, null, 2),
      "utf-8"
    );
    fs.renameSync(tmpFile, LATEST_FILE);
  } catch (err) {
    // Log the detail server-side; don't return filesystem paths to the caller.
    console.error("[events] Failed to write events file:", err);
    return NextResponse.json(
      { error: "Failed to write events file." },
      { status: 500 }
    );
  }

  invalidateDataset();

  return NextResponse.json({
    success: true,
    events_added: validEvents.length,
    events_rejected: invalid.length,
    total_latest: updatedLatest.length,
    note: "Events written to events_latest.json. Changes will appear within 60 seconds (no rebuild required).",
    ...(invalid.length > 0 ? { invalid_indices: invalid } : {}),
  });
}
