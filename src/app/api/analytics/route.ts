import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";

// ---------------------------------------------------------------------------
// Privacy-respecting analytics — no PII, no cookies, no fingerprinting
// All data is in-memory (resets on server restart)
// ---------------------------------------------------------------------------

const VALID_PAGES = ["map", "feed", "ask", "donate", "sources", "about"] as const;
type PageName = (typeof VALID_PAGES)[number];

interface DailyStats {
  date: string;
  views: Record<PageName, number>;
  uniqueVisitors: Set<string>;
}

interface AnalyticsStore {
  totalViews: number;
  pageViews: Record<PageName, number>;
  dailyStats: Map<string, DailyStats>;
}

const store: AnalyticsStore = {
  totalViews: 0,
  pageViews: { map: 0, feed: 0, ask: 0, donate: 0, sources: 0, about: 0 },
  dailyStats: new Map(),
};

// Rate limit: 1 hit per page per IP per minute
const rateLimitMap = new Map<string, number>();

// Clean up old rate limit entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [key, timestamp] of rateLimitMap) {
    if (timestamp < cutoff) rateLimitMap.delete(key);
  }
}, 300_000);

// Clean up daily stats older than 30 days
function pruneOldDays(): void {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().split("T")[0];
  for (const [date] of store.dailyStats) {
    if (date < cutoffStr) store.dailyStats.delete(date);
  }
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/** Hash IP + date so we never store raw IPs */
function hashVisitor(ip: string, date: string): string {
  return createHash("sha256").update(`${ip}:${date}`).digest("hex").slice(0, 16);
}

function isAdmin(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;

  // Method 1: httpOnly cookie (set via /api/admin)
  const cookie = req.cookies.get("wl_admin")?.value;
  if (cookie) {
    const expectedHash = createHash("sha256").update(secret).digest("hex");
    if (cookie === expectedHash) return true;
  }

  // Method 2: X-Admin-Token header (for API/curl usage)
  const token = req.headers.get("x-admin-token");
  if (!token) return false;
  try {
    const a = createHash("sha256").update(secret).digest();
    const b = createHash("sha256").update(token).digest();
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
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
      uniqueVisitors: new Set(),
    };
    store.dailyStats.set(today, day);
    pruneOldDays();
  }
  day.views[page]++;
  day.uniqueVisitors.add(hashVisitor(ip, today));

  return NextResponse.json({ ok: true });
}

// ---------------------------------------------------------------------------
// GET /api/analytics — admin-only aggregate stats
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Build daily breakdown (serialize Sets to counts)
  const daily: Array<{
    date: string;
    views: Record<PageName, number>;
    uniqueVisitors: number;
  }> = [];

  for (const [, day] of store.dailyStats) {
    daily.push({
      date: day.date,
      views: { ...day.views },
      uniqueVisitors: day.uniqueVisitors.size,
    });
  }
  daily.sort((a, b) => b.date.localeCompare(a.date)); // newest first

  return NextResponse.json({
    data: {
      totalViews: store.totalViews,
      pageViews: { ...store.pageViews },
      daily,
      note: "In-memory only. Resets on server restart.",
    },
  });
}
