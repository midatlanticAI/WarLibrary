import crypto from "crypto";
import fs from "fs";
import path from "path";
import {
  canonicalCountry,
  cleanRegion,
  countrySlug,
  isCountryName,
  slugifyCountry,
} from "@/lib/country";

export { canonicalCountry, countrySlug, isCountryName, slugifyCountry };

/**
 * Server-side event store.
 *
 * One merged, deduplicated, sorted copy of the dataset lives in module scope
 * for the life of the Node process, keyed on the mtime+size of the three
 * source files. Rebuilding it means parsing ~30 MB of JSON and sorting tens
 * of thousands of events, which blocks the single process serving the whole
 * site — so it happens once per pipeline write, never per request.
 *
 * This used to live inside the /api/events route. It moved here so the
 * server-rendered pages (/event/[id], /country/[slug], the sitemaps and the
 * feed) read the same cached dataset instead of parsing the files again.
 */

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
export const DATA_DIR = path.join(process.cwd(), "src", "data");
export const EVENTS_FILE = path.join(DATA_DIR, "events.json");
export const EXPANDED_FILE = path.join(DATA_DIR, "events_expanded.json");
export const LATEST_FILE = path.join(DATA_DIR, "events_latest.json");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RawEvent {
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

export interface SerializedEvent {
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

/** Narrative fields omitted by `fields=lite`. */
export type LiteEvent = Omit<
  SerializedEvent,
  "civilian_impact" | "actors" | "region" | "location_precision" | "created_at"
>;

export interface EventSummary {
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

export interface CountryEntry {
  /** Display name exactly as it appears in the data. */
  name: string;
  /** URL slug; several raw spellings can map to one slug. */
  slug: string;
  /** All events, newest first. */
  events: SerializedEvent[];
}

export interface EventDataset {
  /** Signature of the source files this entry was built from. */
  signature: string;
  events: SerializedEvent[];
  summary: EventSummary;
  lastUpdated: string | null;
  byId: Map<string, SerializedEvent>;
  /** Keyed by slug, ordered by event count descending. */
  countries: Map<string, CountryEntry>;
}

export class EventFileReadError extends Error {}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * Event types that describe something that physically happened, as opposed to
 * a statement, a sanction or a deployment. The public headline count, the map
 * default and the fatality statistics are built from these; the rest is the
 * "developments" stream.
 */
export const KINETIC_EVENT_TYPES = new Set([
  "airstrike",
  "missile_attack",
  "drone_attack",
  "battle",
  "explosion",
  "violence_against_civilians",
]);

export function isKinetic(event: Pick<SerializedEvent, "event_type">): boolean {
  return KINETIC_EVENT_TYPES.has(event.event_type);
}

/**
 * The quality gate for search indexing. An event page is always rendered,
 * but only events that clear this bar are linked from the sitemaps and marked
 * indexable; everything else carries `noindex`. The bar: a source link, a
 * confidence of 0.7 or more, a location better than a country centroid, a
 * parseable date and real coordinates.
 */
export const INDEX_MIN_CONFIDENCE = 0.7;

export function isIndexable(event: SerializedEvent): boolean {
  if (!event.source_url) return false;
  if ((event.confidence ?? 0) < INDEX_MIN_CONFIDENCE) return false;
  const precision = event.location_precision;
  if (precision !== "exact" && precision !== "city" && precision !== "region") return false;
  if (Number.isNaN(new Date(event.date).getTime())) return false;
  if (event.latitude === 0 && event.longitude === 0) return false;
  if (!isCountryName(event.country)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// File reading
// ---------------------------------------------------------------------------

/**
 * Read one event file.
 *
 * A missing file is a legitimate empty result (events_latest.json does not
 * exist on a fresh checkout). A file that exists but cannot be read or parsed
 * is NOT — it is a transient failure, and treating it as "zero events" would
 * let a truncated read be cached as though it were the real dataset.
 */
export function readJSONFile(filePath: string): RawEvent[] {
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
    return fs.statSync(filePath).mtime;
  } catch (err) {
    console.error(`[events] Failed to stat ${filePath}:`, err);
    return null;
  }
}

/** Simple deduplication: normalize description to lowercase trimmed, skip duplicates */
export function deduplicateEvents(events: RawEvent[]): RawEvent[] {
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
export function stableEventId(raw: RawEvent): string {
  const basis = [
    raw.date,
    raw.latitude,
    raw.longitude,
    (raw.description || "").trim().toLowerCase().slice(0, 120),
  ].join("|");
  return crypto.createHash("sha1").update(basis).digest("hex").slice(0, 12);
}

export function toSerializedEvent(raw: RawEvent, id: string): SerializedEvent {
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
    // Normalize here, the same as every sibling optional field. "Unknown",
    // "None" and "null" (108 live rows) mean no region, not a place called
    // Unknown — they produced titles like "Airstrike in Unknown, Iran".
    region: cleanRegion(raw.region),
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

export function toLite(event: SerializedEvent): LiteEvent {
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

// ---------------------------------------------------------------------------
// Dataset cache
// ---------------------------------------------------------------------------

let cachedDataset: EventDataset | null = null;

/**
 * Cheap fingerprint of the three source files. Any pipeline write changes an
 * mtime, which invalidates the cache without us having to re-read anything.
 */
export function sourceSignature(): string {
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

export function buildSummary(events: SerializedEvent[]): EventSummary {
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

function buildCountryIndex(events: SerializedEvent[]): Map<string, CountryEntry> {
  const bySlug = new Map<string, CountryEntry>();
  for (const event of events) {
    // Aliases ("US", "USA", "U.S.") fold into one hub; lists ("Iran, Yemen")
    // and aggregates ("Gulf Region") get none.
    const name = canonicalCountry(event.country);
    if (!name) continue;
    const slug = slugifyCountry(name);
    let entry = bySlug.get(slug);
    if (!entry) {
      entry = { name, slug, events: [] };
      bySlug.set(slug, entry);
    }
    entry.events.push(event); // `events` is already newest-first
  }
  return new Map(
    [...bySlug.entries()].sort((a, b) => b[1].events.length - a[1].events.length)
  );
}

function buildDataset(signature: string): EventDataset {
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
  const byId = new Map<string, SerializedEvent>();
  const events: SerializedEvent[] = withTime.map(({ raw }) => {
    let id = stableEventId(raw);
    if (usedIds.has(id)) {
      let suffix = 2;
      while (usedIds.has(`${id}-${suffix}`)) suffix++;
      id = `${id}-${suffix}`;
    }
    usedIds.add(id);
    const event = toSerializedEvent(raw, id);
    byId.set(id, event);
    return event;
  });

  const lastUpdate = getFileMtime(LATEST_FILE);

  return {
    signature,
    events,
    summary: buildSummary(events),
    lastUpdated: lastUpdate ? lastUpdate.toISOString() : null,
    byId,
    countries: buildCountryIndex(events),
  };
}

export function getDataset(): EventDataset {
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
export function invalidateDataset(): void {
  cachedDataset = null;
}

// ---------------------------------------------------------------------------
// Lookups used by the server-rendered pages
// ---------------------------------------------------------------------------

export function getEventById(id: string): SerializedEvent | null {
  return getDataset().byId.get(id) ?? null;
}

export function getCountries(): CountryEntry[] {
  return [...getDataset().countries.values()];
}

export function getCountryBySlug(slug: string): CountryEntry | null {
  return getDataset().countries.get(slug) ?? null;
}

export interface CountryStats {
  total: number;
  kinetic: number;
  developments: number;
  fatalities: number;
  last7: number;
  last30: number;
  kineticLast30: number;
  fatalitiesLast30: number;
  byType: Record<string, number>;
  byVerification: Record<string, number>;
  firstDate: string | null;
  lastDate: string | null;
  /** [minLon, minLat, maxLon, maxLat] over events with real coordinates. */
  bbox: [number, number, number, number] | null;
}

export function countryStats(entry: CountryEntry, now: number = Date.now()): CountryStats {
  const sevenDays = now - 7 * 86_400_000;
  const thirtyDays = now - 30 * 86_400_000;
  const stats: CountryStats = {
    total: entry.events.length,
    kinetic: 0,
    developments: 0,
    fatalities: 0,
    last7: 0,
    last30: 0,
    kineticLast30: 0,
    fatalitiesLast30: 0,
    byType: {},
    byVerification: {},
    firstDate: null,
    lastDate: null,
    bbox: null,
  };
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  let hasBox = false;
  for (const event of entry.events) {
    const kinetic = isKinetic(event);
    if (kinetic) stats.kinetic++;
    else stats.developments++;
    const fatalities = event.fatalities ?? 0;
    stats.fatalities += fatalities;
    stats.byType[event.event_type] = (stats.byType[event.event_type] || 0) + 1;
    const verification = event.verification_status ?? "unset";
    stats.byVerification[verification] = (stats.byVerification[verification] || 0) + 1;

    const time = new Date(event.date).getTime();
    if (!Number.isNaN(time)) {
      if (stats.firstDate === null || event.date < stats.firstDate) stats.firstDate = event.date;
      if (stats.lastDate === null || event.date > stats.lastDate) stats.lastDate = event.date;
      if (time >= sevenDays && time <= now) stats.last7++;
      if (time >= thirtyDays && time <= now) {
        stats.last30++;
        if (kinetic) stats.kineticLast30++;
        stats.fatalitiesLast30 += fatalities;
      }
    }
    if (
      (event.latitude !== 0 || event.longitude !== 0) &&
      event.location_precision !== "country" &&
      Number.isFinite(event.latitude) &&
      Number.isFinite(event.longitude)
    ) {
      hasBox = true;
      if (event.longitude < minLon) minLon = event.longitude;
      if (event.longitude > maxLon) maxLon = event.longitude;
      if (event.latitude < minLat) minLat = event.latitude;
      if (event.latitude > maxLat) maxLat = event.latitude;
    }
  }
  if (hasBox) stats.bbox = [minLon, minLat, maxLon, maxLat];
  return stats;
}

/**
 * Events near this one in place and time: same country, within ±3 days,
 * closest in time first. Used for the "nearby" list on an event page.
 */
export function getRelatedEvents(event: SerializedEvent, limit = 8): SerializedEvent[] {
  const slug = countrySlug(event.country);
  const entry = slug ? getCountryBySlug(slug) : null;
  if (!entry) return [];
  const anchor = new Date(event.date).getTime();
  if (Number.isNaN(anchor)) return [];
  const window = 3 * 86_400_000;
  return entry.events
    .filter((other) => {
      if (other.id === event.id) return false;
      const time = new Date(other.date).getTime();
      return !Number.isNaN(time) && Math.abs(time - anchor) <= window;
    })
    .map((other) => ({ other, distance: Math.abs(new Date(other.date).getTime() - anchor) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map(({ other }) => other);
}

/** Every event that clears the indexing gate, newest first. */
export function getIndexableEvents(): SerializedEvent[] {
  return getDataset().events.filter(isIndexable);
}

/** Events with a parseable date on or after `since` (ms), newest first. */
export function getEventsSince(since: number): SerializedEvent[] {
  return getDataset().events.filter((event) => {
    const time = new Date(event.date).getTime();
    return !Number.isNaN(time) && time >= since;
  });
}
