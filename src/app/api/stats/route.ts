import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "src", "data");

function readEventCount(filePath: string): number {
  try {
    if (!fs.existsSync(filePath)) return 0;
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed: { events?: unknown[] } = JSON.parse(raw);
    return Array.isArray(parsed.events) ? parsed.events.length : 0;
  } catch {
    return 0;
  }
}

// Simple in-memory page view counter (resets on restart, but that's fine)
const pageViews = {
  total: 0,
  today: 0,
  todayDate: new Date().toISOString().split("T")[0],
  aiQuestions: 0,
};

// Called by middleware or client to increment
export async function POST(req: NextRequest) {
  const today = new Date().toISOString().split("T")[0];
  if (today !== pageViews.todayDate) {
    pageViews.today = 0;
    pageViews.todayDate = today;
  }

  const body = await req.json().catch(() => ({}));
  if (body.type === "view") {
    pageViews.total++;
    pageViews.today++;
  } else if (body.type === "ai_question") {
    pageViews.aiQuestions++;
  }

  return NextResponse.json({ ok: true });
}

// Admin-only stats endpoint
export async function GET(req: NextRequest) {
  // Check admin cookie
  const cookie = req.cookies.get("wl_admin")?.value;
  const secret = process.env.ADMIN_SECRET;
  if (!cookie || !secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const expectedHash = createHash("sha256").update(secret).digest("hex");
  if (cookie !== expectedHash) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const seedCount = readEventCount(path.join(DATA_DIR, "events.json"));
  const expandedCount = readEventCount(path.join(DATA_DIR, "events_expanded.json"));
  const latestCount = readEventCount(path.join(DATA_DIR, "events_latest.json"));

  return NextResponse.json({
    data: {
      events: {
        total: seedCount + expandedCount + latestCount,
        seed: seedCount,
        expanded: expandedCount,
        latest: latestCount,
      },
      traffic: {
        total_views: pageViews.total,
        today_views: pageViews.today,
        ai_questions: pageViews.aiQuestions,
        note: "Resets on server restart. For persistent analytics, check Caddy logs.",
      },
      server: {
        uptime_seconds: process.uptime(),
        node_version: process.version,
        memory_mb: Math.round(process.memoryUsage.rss() / 1024 / 1024),
      },
    },
  });
}
