import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import seedData from "@/data/events.json";
import expandedData from "@/data/events_expanded.json";
import latestData from "@/data/events_latest.json";

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

  const seedCount = (seedData as { events: unknown[] }).events.length;
  const expandedCount = (expandedData as { events: unknown[] }).events.length;
  const latestCount = (latestData as { events: unknown[] }).events.length;

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
