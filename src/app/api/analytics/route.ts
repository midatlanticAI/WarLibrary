import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { isAdmin } from "@/lib/auth";
import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Privacy-respecting analytics — no PII, no cookies, no fingerprinting
// Persisted to disk so data survives restarts
// ---------------------------------------------------------------------------

const VALID_PAGES = ["map", "feed", "ask", "donate", "sources", "about"] as const;
type PageName = (typeof VALID_PAGES)[number];

const ANALYTICS_PATH = path.join(process.cwd(), "src", "data", "analytics.json");

interface DailyEntry {
  date: string;
  views: Record<PageName, number>;
  uniqueVisitors: number;
  // In-memory only (not persisted — hashes are ephemeral per day)
}

interface PersistedData {
  totalViews: number;
  aiQuestions: number;
  pageViews: Record<PageName, number>;
  daily: DailyEntry[];
}

interface MemoryDay {
  date: string;
  views: Record<PageName, number>;
  visitors: Set<string>;
  restoredUniqueCount: number; // persisted count from before last restart
}

// In-memory store
const store = {
  totalViews: 0,
  aiQuestions: 0,
  pageViews: { map: 0, feed: 0, ask: 0, donate: 0, sources: 0, about: 0 } as Record<PageName, number>,
  dailyStats: new Map<string, MemoryDay>(),
  viewsSinceFlush: 0,
  lastFlush: Date.now(),
};

// Load from disk on startup
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
          restoredUniqueCount: day.uniqueVisitors || 0, // preserve count from disk
        });
      }
    }
  } catch (err) {
    console.error("[analytics] Failed to load from disk:", err);
  }
}

function flushToDisk(): void {
  try {
    const daily: DailyEntry[] = [];
    // Keep last 30 days
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

// Load on module init
loadFromDisk();

// Flush every 5 minutes
setInterval(flushToDisk, 5 * 60 * 1000);

// Rate limit: 1 hit per page per IP per minute
const rateLimitMap = new Map<string, number>();

// Clean up old rate limit entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [key, timestamp] of rateLimitMap) {
    if (timestamp < cutoff) rateLimitMap.delete(key);
  }
}, 300_000);

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function hashVisitor(ip: string, date: string): string {
  return createHash("sha256").update(`${ip}:${date}`).digest("hex").slice(0, 16);
}

function isValidPage(page: string): page is PageName {
  return (VALID_PAGES as readonly string[]).includes(page);
}

// ---------------------------------------------------------------------------
// POST /api/analytics — record a page view
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body: Record<string, unknown> = await req.json().catch(() => ({}));
  const page = typeof body.page === "string" ? body.page : "";
  const type = typeof body.type === "string" ? body.type : "";

  // Track AI questions
  if (type === "ai_question") {
    store.aiQuestions++;
    store.viewsSinceFlush++;
    if (store.viewsSinceFlush >= 50) flushToDisk();
    return NextResponse.json({ ok: true });
  }

  if (!isValidPage(page)) {
    return NextResponse.json(
      { error: "Invalid page. Must be one of: " + VALID_PAGES.join(", ") },
      { status: 400 }
    );
  }

  const ip = getClientIp(req);
  const today = new Date().toISOString().split("T")[0];

  // Rate limit: 1 hit per page per IP per minute
  const rateLimitKey = `${ip}:${page}`;
  const lastHit = rateLimitMap.get(rateLimitKey);
  if (lastHit && Date.now() - lastHit < 60_000) {
    return NextResponse.json({ ok: true }); // silently accept, don't count
  }
  rateLimitMap.set(rateLimitKey, Date.now());

  // Increment counters
  store.totalViews++;
  store.pageViews[page]++;

  // Daily stats
  let day = store.dailyStats.get(today);
  if (!day) {
    day = {
      date: today,
      views: { map: 0, feed: 0, ask: 0, donate: 0, sources: 0, about: 0 },
      visitors: new Set(),
      restoredUniqueCount: 0,
    };
    store.dailyStats.set(today, day);
  }
  day.views[page]++;
  day.visitors.add(hashVisitor(ip, today));

  // Flush to disk every 50 views or 5 minutes
  store.viewsSinceFlush++;
  if (store.viewsSinceFlush >= 50 || Date.now() - store.lastFlush > 5 * 60 * 1000) {
    flushToDisk();
  }

  return NextResponse.json({ ok: true });
}

// ---------------------------------------------------------------------------
// GET /api/analytics — admin-only aggregate stats
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().split("T")[0];
  const todayStats = store.dailyStats.get(today);

  const daily: DailyEntry[] = [];
  for (const [, day] of store.dailyStats) {
    daily.push({
      date: day.date,
      views: { ...day.views },
      uniqueVisitors: Math.max(day.restoredUniqueCount, day.visitors.size),
    });
  }
  daily.sort((a, b) => b.date.localeCompare(a.date));

  return NextResponse.json({
    data: {
      totalViews: store.totalViews,
      todayViews: todayStats ? Object.values(todayStats.views).reduce((a, b) => a + b, 0) : 0,
      todayUnique: todayStats ? Math.max(todayStats.restoredUniqueCount, todayStats.visitors.size) : 0,
      aiQuestions: store.aiQuestions,
      pageViews: { ...store.pageViews },
      daily,
    },
  });
}
