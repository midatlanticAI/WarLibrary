import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { readAllEventCounts } from "@/lib/event-counts";

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
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const counts = readAllEventCounts();

  return NextResponse.json({
    data: {
      events: counts,
      traffic: {
        total_views: pageViews.total,
        today_views: pageViews.today,
        ai_questions: pageViews.aiQuestions,
        note: "Resets on server restart. For persistent analytics, check Caddy logs.",
      },
      server: {
        uptime_seconds: process.uptime(),
        node_version: process.version,
        memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      },
    },
  });
}
