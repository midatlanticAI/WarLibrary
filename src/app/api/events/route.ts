import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

/**
 * Admin API route for War Library event management.
 *
 * GET  /api/events - Returns event counts and last update time
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

function readJSON(filePath: string): unknown[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
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

interface ConflictEvent {
  date: string;
  event_type: string;
  description: string;
  latitude: number;
  longitude: number;
  country: string;
  region?: string;
  actors?: string;
  fatalities?: number;
  source?: string;
}

function isValidEvent(event: unknown): event is ConflictEvent {
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
// GET /api/events
// ---------------------------------------------------------------------------

export async function GET() {
  const events = readJSON(EVENTS_FILE);
  const expanded = readJSON(EXPANDED_FILE);
  const latest = readJSON(LATEST_FILE);

  const lastUpdate = getFileMtime(LATEST_FILE);

  return NextResponse.json({
    counts: {
      events: events.length,
      events_expanded: expanded.length,
      events_latest: latest.length,
      total: events.length + expanded.length + latest.length,
    },
    last_updated: lastUpdate ? lastUpdate.toISOString() : null,
    files: {
      events: fs.existsSync(EVENTS_FILE),
      events_expanded: fs.existsSync(EXPANDED_FILE),
      events_latest: fs.existsSync(LATEST_FILE),
    },
  });
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
  const validEvents: ConflictEvent[] = [];
  const invalid: number[] = [];

  for (let i = 0; i < body.events.length; i++) {
    if (isValidEvent(body.events[i])) {
      validEvents.push(body.events[i] as ConflictEvent);
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
  const currentLatest = readJSON(LATEST_FILE) as ConflictEvent[];
  const updatedLatest = [...currentLatest, ...validEvents];

  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Write updated file
  try {
    fs.writeFileSync(
      LATEST_FILE,
      JSON.stringify(updatedLatest, null, 2),
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
    note: "Events written to events_latest.json. A rebuild (npm run build) and PM2 restart is required for changes to appear on the live site.",
    ...(invalid.length > 0 ? { invalid_indices: invalid } : {}),
  });
}
