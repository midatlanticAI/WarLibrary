import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import crypto from "crypto";
import fs from "fs";
import path from "path";

/**
 * Events API route for War Library.
 *
 * GET  /api/events - Returns merged, deduplicated, sorted events.
 * POST /api/events - Appends new events (requires wl_admin cookie)
 *
 * The merged dataset is built once and cached in module scope, keyed on the
 * mtime+size of the three source files. Rebuilding it means parsing ~20MB of
 * JSON and sorting tens of thousands of events, which blocks the single Node
 * process serving the whole site — so it must not happen per request.
 *
 * GET query parameters (all optional; a bare GET returns the full dataset for
 * backward compatibility with already-deployed clients and service workers):
 *   summary=1        Aggregate counts + daily histogram only. ~50KB instead of ~19MB.
 *   from=ISO,to=ISO  Restrict to an inclusive event-date window.
 *   limit,offset     Page through the (newest-first) result set.
 *   fields=lite      Drop the long-form narrative fields; enough to render the map.
 *
 * Responses carry a strong-ish ETag derived from the source-file signature and
 * the query, so the client's poll can be answered with a 304 and an empty body
 * whenever the dataset has not changed.
 */

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const DATA_DIR = path.join(process.cwd(), "src", "data");
const EVENTS_FILE = path.join(DATA_DIR, "events.json");
const EXPANDED_FILE = path.join(DATA_DIR, "events_expanded.json");
const LATEST_FILE = path.join(DATA_DIR, "events_latest.json");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface RawEvent {
  date: string;
  event_type: string;
  description: string;
  latitude: number;
  longitude: number;
  country: string;
  region: string;
  actors: string[];
  fatalities: number | null;
  source: string;
  source_url?: string | null;
  confidence?: number | null;
  verification_status?: string | null;
  civilian_impact?: string | null;
  location_precision?: string | null;
}

interface SerializedEvent {
  id: string;
  date: string;
  event_type: string;
  description: string;
  latitude: number;
  longitude: number;
  country: string;
  region: string;
  actors: string[];
  fatalities: number | null;
  source: string;
  source_url: string | null;
  confidence: number | null;
  verification_status: string | null;
  civilian_impact: string | null;
  location_precision: string | null;
  created_at: string;
}

class EventFileReadError extends Error {}

/**
 * Read one event file.
 *
 * A missing file is a legitimate empty result (events_latest.json does not
 * exist on a fresh checkout). A file that exists but cannot be read or parsed
 * is NOT — it is a transient failure, and treating it as "zero events" would
 * let a truncated read be cached as though it were the real dataset.
 */
function readJSONFile(filePath: string): RawEvent[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed: { events?: RawEvent[] } = JSON.parse(raw);
    return Array.isArray(parsed.events) ? parsed.events : [];
  } catch (err) {
    console.error(`[events] Failed to read ${filePath}:`, err);
    throw new EventFileReadError(`Unreadable event file: ${path.basename(filePath)}`);
  }
}

function getFileMtime(filePath: string): Date | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const stat = fs.statSync(filePath);
    return stat.mtime;
  } catch (err) {
    console.error(`[events] Failed to stat ${filePath}:`, err);
    return null;
  }
}

/** Simple deduplication: normalize description to lowercase trimmed, skip duplicates */
function deduplicateEvents(events: RawEvent[]): RawEvent[] {
  const seen = new Set<string>();
  const unique: RawEvent[] = [];
  for (const ev of events) {
    const key = ev.description.trim().toLowerCase().slice(0, 120);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(ev);
    }
  }
  return unique;
}

/**
 * Content-derived event id.
 *
 * These ids were previously the post-sort array index, which meant every id
 * shifted the moment the pipeline appended an event — so a shared link or a
 * client-side selection silently pointed at a different event later. Deriving
 * the id from immutable content keeps it stable across pipeline runs.
 */
function stableEventId(raw: RawEvent): string {
  const basis = [
    raw.date,
    raw.latitude,
    raw.longitude,
    (raw.description || "").trim().toLowerCase().slice(0, 120),
  ].join("|");
  return crypto.createHash("sha1").update(basis).digest("hex").slice(0, 12);
}

function toSerializedEvent(raw: RawEvent, id: string): SerializedEvent {
  return {
    id,
    date: raw.date,
    event_type: raw.event_type,
    description: raw.description,
    latitude: raw.latitude,
    longitude: raw.longitude,
    country: raw.country,
    // 14% of live events have a null region while ConflictEvent types it as a
    // string, so consumers do things like `e.region.toLowerCase()` and throw.
    // Normalize here, the same as every sibling optional field.
    region: raw.region ?? "",
    actors: raw.actors,
    fatalities: raw.fatalities ?? null,
    source: raw.source,
    source_url: raw.source_url ?? null,
    confidence: raw.confidence ?? null,
    verification_status: raw.verification_status ?? null,
    civilian_impact: raw.civilian_impact ?? null,
    location_precision: raw.location_precision ?? null,
    created_at: raw.date,
  };
}

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
// Merged-dataset cache
// ---------------------------------------------------------------------------

interface EventSummary {
  total: number;
  total_fatalities: number;
  countries: number;
  by_type: Record<string, number>;
  by_country: Record<string, number>;
  daily: { date: string; count: number; fatalities: number }[];
  /** Events whose date could not be parsed; excluded from `daily` and the range. */
  invalid_dates: number;
  first_date: string | null;
  last_date: string | null;
}

interface EventCacheEntry {
  /** Signature of the source files this entry was built from. */
  signature: string;
  events: SerializedEvent[];
  summary: EventSummary;
  lastUpdated: string | null;
}

let cachedDataset: EventCacheEntry | null = null;

/**
 * Cheap fingerprint of the three source files. Any pipeline write changes an
 * mtime, which invalidates the cache without us having to re-read anything.
 */
function sourceSignature(): string {
  return [EVENTS_FILE, EXPANDED_FILE, LATEST_FILE]
    .map((file) => {
      try {
        const stat = fs.statSync(file);
        return `${stat.mtimeMs}:${stat.size}`;
      } catch {
        return "0:0";
      }
    })
    .join("|");
}

function buildSummary(events: SerializedEvent[]): EventSummary {
  const byType: Record<string, number> = {};
  const byCountry: Record<string, number> = {};
  const dailyMap = new Map<string, { count: number; fatalities: number }>();
  let totalFatalities = 0;
  let invalidDates = 0;
  let earliest: string | null = null;
  let latest: string | null = null;

  for (const event of events) {
    byType[event.event_type] = (byType[event.event_type] || 0) + 1;
    byCountry[event.country] = (byCountry[event.country] || 0) + 1;

    const fatalities = event.fatalities ?? 0;
    totalFatalities += fatalities;

    // Events with unparseable dates are counted, but must not enter the daily
    // histogram — a "2026-04-00" bucket sorts to the front lexicographically and
    // is Invalid Date for any consumer that parses it — nor define the range.
    if (Number.isNaN(new Date(event.date).getTime())) {
      invalidDates++;
      continue;
    }

    if (earliest === null || event.date < earliest) earliest = event.date;
    if (latest === null || event.date > latest) latest = event.date;

    const day = event.date.slice(0, 10);
    const bucket = dailyMap.get(day);
    if (bucket) {
      bucket.count += 1;
      bucket.fatalities += fatalities;
    } else {
      dailyMap.set(day, { count: 1, fatalities });
    }
  }

  const daily = [...dailyMap.entries()]
    .map(([date, v]) => ({ date, count: v.count, fatalities: v.fatalities }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  return {
    total: events.length,
    total_fatalities: totalFatalities,
    countries: Object.keys(byCountry).length,
    by_type: byType,
    by_country: byCountry,
    daily,
    invalid_dates: invalidDates,
    first_date: earliest,
    last_date: latest,
  };
}

function buildDataset(signature: string): EventCacheEntry {
  const allRaw = [
    ...readJSONFile(EVENTS_FILE),
    ...readJSONFile(EXPANDED_FILE),
    ...readJSONFile(LATEST_FILE),
  ];

  const unique = deduplicateEvents(allRaw);

  // Sort chronologically — newest first. Parse each date once rather than
  // allocating two Date objects per comparison.
  //
  // Unparseable dates exist in the live data ("2026-04-00" — day zero). Their
  // timestamp is NaN, and `b.time - a.time` on a NaN yields NaN, which makes the
  // comparator inconsistent and puts those events at arbitrary positions in a
  // "newest first" list. Sort them deterministically to the end instead.
  const withTime = unique.map((raw) => ({
    raw,
    time: new Date(raw.date).getTime(),
  }));
  withTime.sort((a, b) => {
    const aBad = Number.isNaN(a.time);
    const bBad = Number.isNaN(b.time);
    if (aBad && bBad) return 0;
    if (aBad) return 1;
    if (bBad) return -1;
    return b.time - a.time;
  });

  // Content-derived ids, with a guard so a hash collision can never make two
  // events share an id.
  const usedIds = new Set<string>();
  const events: SerializedEvent[] = withTime.map(({ raw }) => {
    let id = stableEventId(raw);
    if (usedIds.has(id)) {
      let suffix = 2;
      while (usedIds.has(`${id}-${suffix}`)) suffix++;
      id = `${id}-${suffix}`;
    }
    usedIds.add(id);
    return toSerializedEvent(raw, id);
  });

  const lastUpdate = getFileMtime(LATEST_FILE);

  return {
    signature,
    events,
    summary: buildSummary(events),
    lastUpdated: lastUpdate ? lastUpdate.toISOString() : null,
  };
}

function getDataset(): EventCacheEntry {
  const signature = sourceSignature();
  if (cachedDataset && cachedDataset.signature === signature) {
    return cachedDataset;
  }
  // Build into a local first. If a source file is momentarily unreadable we must
  // NOT cache the degraded result: the cache is keyed on file signatures, and a
  // failed read does not change them — so a single transient error would pin a
  // truncated dataset until something wrote to one of the files. For the two
  // seed files, which nothing ever rewrites, that means until a process restart.
  try {
    const next = buildDataset(signature);
    cachedDataset = next;
    return next;
  } catch (err) {
    if (err instanceof EventFileReadError && cachedDataset) {
      // Serving the last known-good dataset beats serving a truncated one.
      console.error("[events] Keeping previous dataset after read failure:", err.message);
      return cachedDataset;
    }
    throw err;
  }
}

/** Drop the cache so the next read rebuilds — used after POST appends. */
function invalidateDataset(): void {
  cachedDataset = null;
}

// ---------------------------------------------------------------------------
// GET /api/events
// ---------------------------------------------------------------------------

/** Narrative fields omitted by `fields=lite`. */
type LiteEvent = Omit<
  SerializedEvent,
  "civilian_impact" | "actors" | "region" | "location_precision" | "created_at"
>;

function toLite(event: SerializedEvent): LiteEvent {
  const {
    civilian_impact: _civilianImpact,
    actors: _actors,
    region: _region,
    location_precision: _locationPrecision,
    created_at: _createdAt,
    ...lite
  } = event;
  return lite;
}

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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const dataset = getDataset();

  // ETag covers both the underlying data and the shape of this specific query.
  const etag = `W/"${crypto
    .createHash("sha1")
    .update(`${dataset.signature}|${searchParams.toString()}`)
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

  const matched = events.length;
  const offset = parseBoundedInt(searchParams.get("offset"), 0, 0, matched);
  // No limit param means "everything", preserving the original contract.
  const limit = parseBoundedInt(
    searchParams.get("limit"),
    matched,
    0,
    matched
  );

  const page = events.slice(offset, offset + limit);
  const data =
    searchParams.get("fields") === "lite" ? page.map(toLite) : page;

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
