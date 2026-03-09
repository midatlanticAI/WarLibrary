import { NextResponse } from "next/server";
import seedData from "@/data/events.json";
import expandedData from "@/data/events_expanded.json";
import latestData from "@/data/events_latest.json";

// Health check endpoint for uptime monitoring
export async function GET() {
  const seed = (seedData as { events: unknown[] }).events.length;
  const expanded = (expandedData as { events: unknown[] }).events.length;
  const latest = (latestData as { events: unknown[] }).events.length;

  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    events: seed + expanded + latest,
    uptime_seconds: Math.floor(process.uptime()),
  });
}
