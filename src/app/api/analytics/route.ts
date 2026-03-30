import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { isAdmin } from "@/lib/auth";
import {
  store,
  flushToDisk,
  trackAiQuestion,
  VALID_PAGES,
  type PageName,
  type DailyEntry,
} from "@/lib/analytics-store";

// ---------------------------------------------------------------------------
// Privacy-respecting analytics — no PII, no cookies, no fingerprinting
// Persisted to disk so data survives restarts
// ---------------------------------------------------------------------------

// Bot detection — filter known crawlers/bots from analytics without blocking them
const BOT_PATTERNS = [
  /bot\b/i, /crawl/i, /spider/i, /slurp/i, /mediapartners/i,
  /googlebot/i, /bingbot/i, /yandex/i, /baiduspider/i, /duckduckbot/i,
  /facebookexternalhit/i, /twitterbot/i, /linkedinbot/i, /whatsapp/i,
  /telegrambot/i, /discordbot/i, /slackbot/i, /applebot/i,
  /semrushbot/i, /ahrefsbot/i, /mj12bot/i, /dotbot/i, /petalbot/i,
  /bytespider/i, /gptbot/i, /claudebot/i, /anthropic/i, /ccbot/i,
  /ia_archiver/i, /archive\.org/i, /wget/i, /curl/i, /httpie/i,
  /python-requests/i, /python-urllib/i, /java\//i, /okhttp/i,
  /go-http-client/i, /node-fetch/i, /axios/i, /postman/i, /insomnia/i,
  /lighthouse/i, /pagespeed/i, /gtmetrix/i, /pingdom/i, /uptimerobot/i,
  /headlesschrome/i, /phantomjs/i, /selenium/i, /puppeteer/i,
];

function isBot(req: NextRequest): boolean {
  const ua = req.headers.get("user-agent") || "";
  if (!ua || ua.length < 10) return true; // Empty/suspiciously short UA
  return BOT_PATTERNS.some((p) => p.test(ua));
}

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
    req.headers.get("cf-connecting-ip") ||
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
    trackAiQuestion();
    return NextResponse.json({ ok: true });
  }

  if (!isValidPage(page)) {
    return NextResponse.json(
      { error: "Invalid page. Must be one of: " + VALID_PAGES.join(", ") },
      { status: 400 }
    );
  }

  // Track bot traffic separately — bots can still access the site
  if (isBot(req)) {
    store.botViews++;
    return NextResponse.json({ ok: true });
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
      botViews: store.botViews,
      pageViews: { ...store.pageViews },
      daily,
    },
  });
}
