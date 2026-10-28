import fs from "fs";
import path from "path";

/**
 * Row counts for the three event files, cached per file on mtime + size.
 *
 * `/api/health` and `/api/stats` used to parse all three files on every call
 * to count rows. On the live instance `events_latest.json` is ~29 MB, so an
 * uptime monitor pinging the health check was costing a full JSON parse —
 * about a second of blocked event loop — per ping. The pipeline rewrites the
 * file at most every 30 minutes, so the count only needs recomputing when the
 * file's signature changes.
 */
const DATA_DIR = path.join(process.cwd(), "src", "data");

export const EVENT_FILES = {
  seed: path.join(DATA_DIR, "events.json"),
  expanded: path.join(DATA_DIR, "events_expanded.json"),
  latest: path.join(DATA_DIR, "events_latest.json"),
} as const;

interface CountEntry {
  signature: string;
  count: number;
}

const cache = new Map<string, CountEntry>();

function signatureOf(filePath: string): string | null {
  try {
    const stat = fs.statSync(filePath);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return null;
  }
}

function parseCount(filePath: string): number {
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed: { events?: unknown[] } = JSON.parse(raw);
  return Array.isArray(parsed.events) ? parsed.events.length : 0;
}

/** Number of events in one file; 0 for a missing or unreadable file. */
export function readEventCount(filePath: string): number {
  const signature = signatureOf(filePath);
  if (signature === null) return 0;

  const hit = cache.get(filePath);
  if (hit && hit.signature === signature) return hit.count;

  try {
    const count = parseCount(filePath);
    cache.set(filePath, { signature, count });
    return count;
  } catch (err) {
    console.error(`[event-counts] Failed to read ${filePath}:`, err);
    // A transient read failure must not be cached as "zero events".
    return hit ? hit.count : 0;
  }
}

export function readAllEventCounts(): {
  seed: number;
  expanded: number;
  latest: number;
  total: number;
} {
  const seed = readEventCount(EVENT_FILES.seed);
  const expanded = readEventCount(EVENT_FILES.expanded);
  const latest = readEventCount(EVENT_FILES.latest);
  return { seed, expanded, latest, total: seed + expanded + latest };
}
