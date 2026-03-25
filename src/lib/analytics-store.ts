import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Shared in-memory analytics store — singleton across all routes in the same
// PM2 process.  Both /api/analytics and /api/chat import this so the chat
// route can increment aiQuestions directly (no fire-and-forget HTTP call).
// ---------------------------------------------------------------------------

const VALID_PAGES = ["map", "feed", "ask", "donate", "sources", "about"] as const;
type PageName = (typeof VALID_PAGES)[number];
export { VALID_PAGES };
export type { PageName };

const ANALYTICS_PATH = path.join(process.cwd(), "src", "data", "analytics.json");
export { ANALYTICS_PATH };

export interface DailyEntry {
  date: string;
  views: Record<PageName, number>;
  uniqueVisitors: number;
}

interface PersistedData {
  totalViews: number;
  aiQuestions: number;
  pageViews: Record<PageName, number>;
  daily: DailyEntry[];
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
  pageViews: { map: 0, feed: 0, ask: 0, donate: 0, sources: 0, about: 0 } as Record<PageName, number>,
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
    if (data.pageViews) {
      for (const key of VALID_PAGES) {
        store.pageViews[key] = data.pageViews[key] || 0;
      }
    }
    if (data.daily) {
      for (const day of data.daily) {
        store.dailyStats.set(day.date, {
          date: day.date,
          views: { ...day.views },
          visitors: new Set(),
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
    const daily: DailyEntry[] = [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().split("T")[0];

    for (const [date, day] of store.dailyStats) {
      if (date >= cutoffStr) {
        daily.push({
          date: day.date,
          views: { ...day.views },
          uniqueVisitors: Math.max(day.restoredUniqueCount, day.visitors.size),
        });
      }
    }
    daily.sort((a, b) => b.date.localeCompare(a.date));

    const data: PersistedData = {
      totalViews: store.totalViews,
      aiQuestions: store.aiQuestions,
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
