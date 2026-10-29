import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Shared in-memory analytics store — singleton across all routes in the same
// PM2 process.  Both /api/analytics and /api/chat import this so the chat
// route can increment aiQuestions directly (no fire-and-forget HTTP call).
// ---------------------------------------------------------------------------

// "landing" is the overlay every visitor sees before entering the app; it was
// never counted, so the store under-reported visitors by roughly 25x against
// the access log. "event" and "country" are the server-rendered pages.
const VALID_PAGES = [
  "landing",
  "map",
  "feed",
  "ask",
  "donate",
  "sources",
  "about",
  "event",
  "country",
  "dispatch",
  "codebook",
] as const;
type PageName = (typeof VALID_PAGES)[number];
export { VALID_PAGES };
export type { PageName };

export function emptyViews(): Record<PageName, number> {
  const views = {} as Record<PageName, number>;
  for (const page of VALID_PAGES) views[page] = 0;
  return views;
}

const ANALYTICS_PATH = path.join(process.cwd(), "src", "data", "analytics.json");
export { ANALYTICS_PATH };

export interface DailyEntry {
  date: string;
  views: Record<PageName, number>;
  uniqueVisitors: number;
}

interface PersistedDailyEntry {
  date: string;
  views: Record<PageName, number>;
  uniqueVisitors: number;
  visitorHashes?: string[];
}

interface PersistedData {
  totalViews: number;
  aiQuestions: number;
  botViews?: number;
  pageViews: Record<PageName, number>;
  daily: PersistedDailyEntry[];
}

export interface MemoryDay {
  date: string;
  views: Record<PageName, number>;
  visitors: Set<string>;
  restoredUniqueCount: number;
}

// In-memory store (singleton — Node caches modules)
export const store = {
  totalViews: 0,
  aiQuestions: 0,
  botViews: 0,
  pageViews: emptyViews(),
  dailyStats: new Map<string, MemoryDay>(),
  viewsSinceFlush: 0,
  lastFlush: Date.now(),
};

function loadFromDisk(): void {
  try {
    if (!fs.existsSync(ANALYTICS_PATH)) return;
    const raw = fs.readFileSync(ANALYTICS_PATH, "utf-8");
    const data: PersistedData = JSON.parse(raw);
    store.totalViews = data.totalViews || 0;
    store.aiQuestions = data.aiQuestions || 0;
    store.botViews = data.botViews || 0;
    if (data.pageViews) {
      for (const key of VALID_PAGES) {
        store.pageViews[key] = data.pageViews[key] || 0;
      }
    }
    if (data.daily) {
      for (const day of data.daily) {
        store.dailyStats.set(day.date, {
          date: day.date,
          // Days persisted before a page name existed lack its key; a bare
          // spread would leave it undefined and the first `++` would make NaN.
          views: { ...emptyViews(), ...day.views },
          visitors: new Set(day.visitorHashes || []),
          restoredUniqueCount: day.uniqueVisitors || 0,
        });
      }
    }
  } catch (err) {
    console.error("[analytics] Failed to load from disk:", err);
  }
}

export function flushToDisk(): void {
  try {
    const daily: PersistedDailyEntry[] = [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().split("T")[0];

    for (const [date, day] of store.dailyStats) {
      if (date >= cutoffStr) {
        daily.push({
          date: day.date,
          views: { ...day.views },
          uniqueVisitors: Math.max(day.restoredUniqueCount, day.visitors.size),
          visitorHashes: Array.from(day.visitors),
        });
      }
    }
    daily.sort((a, b) => b.date.localeCompare(a.date));

    const data: PersistedData = {
      totalViews: store.totalViews,
      aiQuestions: store.aiQuestions,
      botViews: store.botViews,
      pageViews: { ...store.pageViews },
      daily,
    };
    fs.writeFileSync(ANALYTICS_PATH, JSON.stringify(data, null, 2), "utf-8");
    store.viewsSinceFlush = 0;
    store.lastFlush = Date.now();
  } catch (err) {
    console.error("[analytics] Failed to flush to disk:", err);
  }
}

/** Increment AI question counter — call from chat route directly */
export function trackAiQuestion(): void {
  store.aiQuestions++;
  store.viewsSinceFlush++;
  if (store.viewsSinceFlush >= 50) flushToDisk();
}

// Load on module init
loadFromDisk();

// Flush every 5 minutes
setInterval(flushToDisk, 5 * 60 * 1000);
