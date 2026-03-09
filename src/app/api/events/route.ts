import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

/**
 * Events API route for War Library.
 *
 * GET  /api/events - Returns all merged, deduplicated, sorted events (read from disk each request)
 * POST /api/events - Appends new events (requires wl_admin cookie)
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
  created_at: string;
}

function readJSONFile(filePath: string): RawEvent[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed: { events?: RawEvent[] } = JSON.parse(raw);
    return Array.isArray(parsed.events) ? parsed.events : [];
  } catch {
    return [];
  }
}

function getFileMtime(filePath: string): Date | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const stat = fs.statSync(filePath);
    return stat.mtime;
  } catch {
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

function toSerializedEvent(raw: RawEvent, index: number): SerializedEvent {
  return {
    id: String(index + 1),
    date: raw.date,
    event_type: raw.event_type,
    description: raw.description,
    latitude: raw.latitude,
    longitude: raw.longitude,
    country: raw.country,
    region: raw.region,
    actors: raw.actors,
    fatalities: raw.fatalities ?? null,
    source: raw.source,
    source_url: null,
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
  source?: string;
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
  ];
  for (const field of requiredFields) {
    if (e[field] === undefined || e[field] === null) return false;
  }
  if (typeof e.date !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(e.date))
    return false;
  if (typeof e.latitude !== "number" || typeof e.longitude !== "number")
    return false;
  return true;
}

// ---------------------------------------------------------------------------
// Auth check
// ---------------------------------------------------------------------------

function isAuthenticated(request: NextRequest): boolean {
  const adminCookie = request.cookies.get("wl_admin");
  return !!adminCookie?.value;
}

// ---------------------------------------------------------------------------
// GET /api/events — read from disk, merge, deduplicate, sort, return
// ---------------------------------------------------------------------------

export async function GET() {
  const seedEvents = readJSONFile(EVENTS_FILE);
  const expandedEvents = readJSONFile(EXPANDED_FILE);
  const latestEvents = readJSONFile(LATEST_FILE);

  // Merge all sources
  const allRaw = [...seedEvents, ...expandedEvents, ...latestEvents];

  // Deduplicate by description similarity
  const unique = deduplicateEvents(allRaw);

  // Sort chronologically — newest first
  unique.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  // Assign sequential IDs
  const events: SerializedEvent[] = unique.map(toSerializedEvent);

  const lastUpdate = getFileMtime(LATEST_FILE);

  return NextResponse.json(
    {
      data: events,
      meta: {
        total: events.length,
        last_updated: lastUpdate ? lastUpdate.toISOString() : null,
      },
    },
    {
      headers: {
        "Cache-Control": "public, max-age=60",
      },
    }
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

  // Write updated file
  try {
    fs.writeFileSync(
      LATEST_FILE,
      JSON.stringify({ events: updatedLatest }, null, 2),
      "utf-8"
    );
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to write events file.", details: String(err) },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    events_added: validEvents.length,
    events_rejected: invalid.length,
    total_latest: updatedLatest.length,
    note: "Events written to events_latest.json. Changes will appear within 60 seconds (no rebuild required).",
    ...(invalid.length > 0 ? { invalid_indices: invalid } : {}),
  });
}
