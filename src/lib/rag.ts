/**
 * RAG retrieval for War Library chat.
 *
 * Multi-signal scoring with:
 *   - Date-aware filtering (temporal queries like "today", "last 3 days", "March 5")
 *   - Event type boosting ("airstrikes" → prioritize airstrike events)
 *   - Country/region boosting
 *   - Phrase matching (higher weight than individual keywords)
 *   - Actor matching
 *   - Fatality-weighted relevance for casualty queries
 *   - Recency boost for ambiguous queries
 *   - Deduplication across event files
 */

import fs from "fs";
import path from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface EventRecord {
  id?: string;
  date?: string;
  event_type?: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  country?: string;
  region?: string;
  actors?: string[];
  fatalities?: number | null;
  source?: string;
  source_url?: string | null;
  confidence?: number;
  verification_status?: string;
  civilian_impact?: string;
  [key: string]: unknown;
}

interface ScoredEvent {
  event: EventRecord;
  score: number;
  matchReasons: string[];
}

// ─── Stop words ─────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would",
  "could", "should", "may", "might", "shall", "can",
  "a", "an", "and", "but", "or", "nor", "not", "no",
  "in", "on", "at", "to", "for", "of", "with", "by",
  "from", "up", "about", "into", "through", "during",
  "before", "after", "above", "below", "between",
  "this", "that", "these", "those", "it", "its",
  "what", "which", "who", "whom", "how", "when", "where", "why",
  "all", "each", "every", "both", "few", "more", "most",
  "some", "such", "than", "too", "very", "just",
  "i", "me", "my", "we", "our", "you", "your",
  "he", "she", "they", "them", "their", "his", "her",
  "if", "then", "so", "as", "also", "only",
  "tell", "know", "think", "many", "much", "any",
  "happen", "happened", "happening", "going",
]);

// ─── Event type aliases ─────────────────────────────────────────────────────

const EVENT_TYPE_MAP: Record<string, string> = {
  airstrike: "airstrike",
  airstrikes: "airstrike",
  "air strike": "airstrike",
  "air strikes": "airstrike",
  bombing: "airstrike",
  bombed: "airstrike",
  missile: "missile_attack",
  missiles: "missile_attack",
  "missile attack": "missile_attack",
  "missile strike": "missile_attack",
  ballistic: "missile_attack",
  drone: "drone_attack",
  drones: "drone_attack",
  "drone strike": "drone_attack",
  "drone attack": "drone_attack",
  uav: "drone_attack",
  battle: "battle",
  battles: "battle",
  ground: "battle",
  "ground war": "battle",
  fighting: "battle",
  combat: "battle",
  explosion: "explosion",
  explosions: "explosion",
  blast: "explosion",
  civilian: "violence_against_civilians",
  civilians: "violence_against_civilians",
  "civilian casualties": "violence_against_civilians",
  strategic: "strategic_development",
  development: "strategic_development",
  diplomatic: "strategic_development",
  protest: "protest",
  protests: "protest",
  demonstration: "protest",
};

// ─── Country aliases ────────────────────────────────────────────────────────

const COUNTRY_ALIASES: Record<string, string> = {
  us: "United States",
  usa: "United States",
  america: "United States",
  american: "United States",
  uk: "United Kingdom",
  britain: "United Kingdom",
  british: "United Kingdom",
  uae: "United Arab Emirates",
  emirates: "United Arab Emirates",
  ksa: "Saudi Arabia",
  saudi: "Saudi Arabia",
  persia: "Iran",
  iranian: "Iran",
  persian: "Iran",
  israeli: "Israel",
  lebanese: "Lebanon",
  iraqi: "Iraq",
  syrian: "Syria",
  yemeni: "Yemen",
  turkish: "Turkey",
  cypriot: "Cyprus",
  qatari: "Qatar",
  bahraini: "Bahrain",
  kuwaiti: "Kuwait",
  jordanian: "Jordan",
  pakistani: "Pakistan",
  indian: "India",
  russian: "Russia",
  chinese: "China",
  french: "France",
};

// ─── Temporal parsing ───────────────────────────────────────────────────────

interface DateFilter {
  after?: Date;
  before?: Date;
}

function parseTemporalQuery(query: string): DateFilter | null {
  const q = query.toLowerCase();
  const now = new Date();

  // "today" or "right now"
  if (/\btoday\b|\bright now\b|\bcurrently\b/.test(q)) {
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    return { after: dayStart };
  }

  // "yesterday"
  if (/\byesterday\b/.test(q)) {
    const start = new Date(now);
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return { after: start, before: end };
  }

  // "last N hours/days/week"
  const lastN = q.match(/\blast\s+(\d+)\s*(hour|day|week|month)/);
  if (lastN) {
    const n = parseInt(lastN[1]);
    const unit = lastN[2];
    const ms =
      unit.startsWith("hour") ? n * 3600_000 :
      unit.startsWith("day") ? n * 86400_000 :
      unit.startsWith("week") ? n * 7 * 86400_000 :
      n * 30 * 86400_000;
    return { after: new Date(now.getTime() - ms) };
  }

  // "last week" (no number)
  if (/\blast week\b/.test(q)) {
    return { after: new Date(now.getTime() - 7 * 86400_000) };
  }

  // "last 24 hours" or "past 24 hours"
  if (/\b(?:last|past)\s+24\s*(?:h|hour)/.test(q)) {
    return { after: new Date(now.getTime() - 86400_000) };
  }

  // "this week"
  if (/\bthis week\b/.test(q)) {
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    return { after: weekStart };
  }

  // "recent" or "latest" — last 3 days
  if (/\brecent\b|\blatest\b|\bnew\b|\bnewest\b/.test(q)) {
    return { after: new Date(now.getTime() - 3 * 86400_000) };
  }

  // Specific date: "March 5", "march 5th", "3/5", "2026-03-05"
  const monthDay = q.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (monthDay) {
    const months: Record<string, number> = {
      jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
      apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
      aug: 7, august: 7, sep: 8, september: 8, oct: 9, october: 9,
      nov: 10, november: 10, dec: 11, december: 11,
    };
    const m = months[monthDay[1]];
    const d = parseInt(monthDay[2]);
    if (m !== undefined) {
      const start = new Date(2026, m, d, 0, 0, 0, 0);
      const end = new Date(2026, m, d, 23, 59, 59, 999);
      return { after: start, before: end };
    }
  }

  return null;
}

// ─── Keyword extraction ─────────────────────────────────────────────────────

function extractKeywords(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

// ─── Phrase extraction ──────────────────────────────────────────────────────

const KNOWN_PHRASES = [
  "strait of hormuz", "red sea", "persian gulf", "epic fury",
  "operation epic fury", "air defense", "nuclear facility",
  "ballistic missile", "cruise missile", "iron dome",
  "death toll", "civilian casualties", "ground invasion",
  "no-fly zone", "carrier strike group", "irgc",
  "revolutionary guard", "islamic revolutionary guard",
  "southern suburbs", "dahieh", "double tap",
  "al asad", "ain al asad", "natanz", "isfahan", "bushehr",
  "strait of hormuz", "bab el mandeb", "suez canal",
];

function extractPhrases(query: string): string[] {
  const qLower = query.toLowerCase();
  return KNOWN_PHRASES.filter((p) => qLower.includes(p));
}

// ─── Detect if query is about casualties/fatalities ─────────────────────────

function isCasualtyQuery(query: string): boolean {
  return /\b(kill|killed|dead|death|died|fatali|casualt|toll|victims?|body count)\b/i.test(query);
}

// ─── Score a single event ───────────────────────────────────────────────────

function scoreEvent(
  event: EventRecord,
  keywords: string[],
  phrases: string[],
  eventTypeFilter: string | null,
  countryFilter: string | null,
  isCasualty: boolean
): ScoredEvent {
  const desc = (event.description || "").toLowerCase();
  const country = (event.country || "").toLowerCase();
  const region = (event.region || "").toLowerCase();
  const eventType = (event.event_type || "").toLowerCase();
  const actors = (event.actors || []).map((a) => a.toLowerCase()).join(" ");
  const civilianImpact = (event.civilian_impact || "").toLowerCase();

  const searchable = `${desc} ${country} ${region} ${eventType.replace(/_/g, " ")} ${actors} ${civilianImpact}`;

  let score = 0;
  const reasons: string[] = [];

  // 1. Phrase matches (high weight: 5 per phrase)
  for (const phrase of phrases) {
    if (searchable.includes(phrase)) {
      score += 5;
      reasons.push(`phrase:${phrase}`);
    }
  }

  // 2. Event type match (weight: 4)
  if (eventTypeFilter && eventType === eventTypeFilter) {
    score += 4;
    reasons.push(`type:${eventType}`);
  }

  // 3. Country match (weight: 3)
  if (countryFilter && country.toLowerCase() === countryFilter.toLowerCase()) {
    score += 3;
    reasons.push(`country:${country}`);
  }

  // 4. Keyword matches in description (weight: 2 per keyword)
  for (const kw of keywords) {
    if (desc.includes(kw)) {
      score += 2;
      reasons.push(`desc:${kw}`);
    }
  }

  // 5. Keyword matches in other fields (weight: 1)
  for (const kw of keywords) {
    if (!desc.includes(kw)) {
      if (country.includes(kw) || region.includes(kw)) {
        score += 1;
        reasons.push(`loc:${kw}`);
      } else if (actors.includes(kw)) {
        score += 1;
        reasons.push(`actor:${kw}`);
      } else if (eventType.replace(/_/g, " ").includes(kw)) {
        score += 1;
        reasons.push(`type-kw:${kw}`);
      }
    }
  }

  // 6. Casualty query boost — events with higher fatalities score more
  if (isCasualty && event.fatalities && event.fatalities > 0) {
    score += Math.min(3, Math.log10(event.fatalities + 1));
    reasons.push(`fatalities:${event.fatalities}`);
  }

  // 7. Confidence boost — higher confidence events preferred
  if (event.confidence && event.confidence > 0.8) {
    score += 0.5;
  }

  // 8. Verification boost — confirmed events preferred
  if (event.verification_status === "confirmed") {
    score += 0.3;
  }

  return { event, score, matchReasons: reasons };
}

// ─── Main retrieval function ────────────────────────────────────────────────

export function retrieveEvents(
  query: string,
  events: EventRecord[],
  limit: number = 25
): { events: EventRecord[]; meta: RetrievalMeta } {
  const keywords = extractKeywords(query);
  const phrases = extractPhrases(query);
  const dateFilter = parseTemporalQuery(query);
  const isCasualty = isCasualtyQuery(query);

  // Detect event type from query
  let eventTypeFilter: string | null = null;
  const qLower = query.toLowerCase();
  for (const [alias, type] of Object.entries(EVENT_TYPE_MAP)) {
    if (qLower.includes(alias)) {
      eventTypeFilter = type;
      break;
    }
  }

  // Detect country from query
  let countryFilter: string | null = null;
  for (const [alias, country] of Object.entries(COUNTRY_ALIASES)) {
    if (qLower.includes(alias.toLowerCase())) {
      countryFilter = country;
      break;
    }
  }
  // Also check direct country name mentions
  if (!countryFilter) {
    const countries = [...new Set(events.map((e) => e.country || ""))].filter(Boolean);
    for (const c of countries) {
      if (qLower.includes(c.toLowerCase())) {
        countryFilter = c;
        break;
      }
    }
  }

  // Step 1: Apply date filter
  let pool = events;
  if (dateFilter) {
    pool = events.filter((e) => {
      if (!e.date) return false;
      const d = new Date(e.date);
      if (dateFilter.after && d < dateFilter.after) return false;
      if (dateFilter.before && d > dateFilter.before) return false;
      return true;
    });

    // If date filter returns nothing, fall back to full pool
    // (user might be asking about a date with no events)
    if (pool.length === 0) {
      pool = events;
    }
  }

  // Step 2: Score all events
  const scored = pool.map((event) =>
    scoreEvent(event, keywords, phrases, eventTypeFilter, countryFilter, isCasualty)
  );

  // Step 3: Sort by score, then by date (newest first for tiebreaker)
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.event.date || "").localeCompare(a.event.date || "");
  });

  // Step 4: Take top results — but ensure minimum quality
  const matched = scored.filter((s) => s.score > 0);

  let results: EventRecord[];
  if (matched.length >= 3) {
    results = matched.slice(0, limit).map((s) => s.event);
  } else if (dateFilter && pool.length > 0) {
    // Date-filtered but few keyword matches — return all events in date range
    results = pool
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .slice(0, limit);
  } else {
    // No good matches — return most recent + any partial matches
    const recent = [...events]
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .slice(0, 10);
    const partial = matched.slice(0, 5).map((s) => s.event);
    const seen = new Set<string>();
    results = [];
    for (const e of [...partial, ...recent]) {
      const key = e.id || `${e.date}-${e.description?.slice(0, 50)}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push(e);
      }
    }
    results = results.slice(0, limit);
  }

  const meta: RetrievalMeta = {
    totalEvents: events.length,
    retrievedCount: results.length,
    dateFiltered: !!dateFilter,
    eventTypeFilter,
    countryFilter,
    topScore: scored[0]?.score || 0,
    queryKeywords: keywords,
    queryPhrases: phrases,
  };

  return { events: results, meta };
}

export interface RetrievalMeta {
  totalEvents: number;
  retrievedCount: number;
  dateFiltered: boolean;
  eventTypeFilter: string | null;
  countryFilter: string | null;
  topScore: number;
  queryKeywords: string[];
  queryPhrases: string[];
}

// ─── Context formatting ─────────────────────────────────────────────────────

export function buildContext(
  retrievedEvents: EventRecord[],
  meta: RetrievalMeta,
  allEventsCount: number,
  dbSummary: string
): string {
  let context = dbSummary + "\n";
  context += `Retrieved ${meta.retrievedCount} of ${allEventsCount} total events`;

  const filters: string[] = [];
  if (meta.dateFiltered) filters.push("date-filtered");
  if (meta.eventTypeFilter) filters.push(`type: ${meta.eventTypeFilter.replace(/_/g, " ")}`);
  if (meta.countryFilter) filters.push(`country: ${meta.countryFilter}`);
  if (filters.length > 0) context += ` (${filters.join(", ")})`;
  context += ".\n\n";

  // Group events by date for clarity — prevents AI from conflating events across days
  const byDate = new Map<string, EventRecord[]>();
  for (const e of retrievedEvents) {
    const dateKey = (e.date || "unknown").split("T")[0];
    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
    byDate.get(dateKey)!.push(e);
  }

  // Sort dates newest first
  const sortedDates = [...byDate.keys()].sort().reverse();

  for (const dateKey of sortedDates) {
    const dayEvents = byDate.get(dateKey)!;
    context += `── ${dateKey} ──\n`;

    for (const e of dayEvents) {
      const type = (e.event_type || "unknown").replace(/_/g, " ").toUpperCase();
      const loc = `${e.region || "?"}, ${e.country || "?"}`;
      const desc = e.description || "No description";
      const fat = (e.fatalities && e.fatalities > 0) ? ` | ${e.fatalities} killed` : "";
      const actors = Array.isArray(e.actors) && e.actors.length > 0 ? ` | Actors: ${e.actors.join(", ")}` : "";
      const src = e.source ? ` | Source: ${e.source}` : "";
      const status = e.verification_status ? ` [${e.verification_status}]` : "";
      const civilian = e.civilian_impact ? ` | Civilian impact: ${e.civilian_impact}` : "";

      context += `• ${type} — ${loc}: ${desc}${fat}${civilian}${actors}${src}${status}\n`;
    }
    context += "\n";
  }

  return context;
}

// ─── Event loading with deduplication ────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), "src", "data");
let _cachedEvents: EventRecord[] = [];
let _cachedSummary = "";
let _cacheTime = 0;

function readEventsFile(filePath: string): EventRecord[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed: { events?: EventRecord[] } = JSON.parse(raw);
    return Array.isArray(parsed.events) ? parsed.events : [];
  } catch {
    return [];
  }
}

export function getAllEvents(): EventRecord[] {
  const now = Date.now();
  if (_cachedEvents.length > 0 && now - _cacheTime < 30_000) return _cachedEvents;

  const raw = [
    ...readEventsFile(path.join(DATA_DIR, "events.json")),
    ...readEventsFile(path.join(DATA_DIR, "events_expanded.json")),
    ...readEventsFile(path.join(DATA_DIR, "events_latest.json")),
  ];

  // Deduplicate by id, then by description similarity
  const seen = new Map<string, EventRecord>();
  for (const e of raw) {
    const key = e.id || `${e.date}-${(e.description || "").slice(0, 80)}`;
    if (!seen.has(key)) {
      seen.set(key, e);
    }
  }

  _cachedEvents = [...seen.values()];
  _cacheTime = now;
  _cachedSummary = "";
  return _cachedEvents;
}

export function getDatabaseSummary(): string {
  const allEvents = getAllEvents();
  if (_cachedSummary) return _cachedSummary;

  const countries = [...new Set(allEvents.map((e) => String(e.country)))];
  const totalFatalities = allEvents.reduce(
    (sum, e) => sum + (Number(e.fatalities) || 0),
    0
  );
  const eventTypes = [...new Set(allEvents.map((e) => String(e.event_type)))];
  const dates = allEvents.map((e) => e.date?.split("T")[0]).filter(Boolean).sort();
  const dateRange = dates.length > 0 ? `${dates[0]} – ${dates[dates.length - 1]}` : "unknown";

  _cachedSummary = `CONFLICT DATABASE — Operation Epic Fury (US-Israel War on Iran)\n`;
  _cachedSummary += `Period: ${dateRange} | ${allEvents.length} verified events | ${totalFatalities.toLocaleString()}+ fatalities reported\n`;
  _cachedSummary += `Countries affected: ${countries.join(", ")}\n`;
  _cachedSummary += `Event types: ${eventTypes.map((t) => t.replace(/_/g, " ")).join(", ")}\n`;

  return _cachedSummary;
}
