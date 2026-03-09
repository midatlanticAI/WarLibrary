import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import seedData from "@/data/events.json";
import expandedData from "@/data/events_expanded.json";
import latestData from "@/data/events_latest.json";

interface PipelineStats {
  last_run: string;
  articles_fetched: number;
  articles_by_source: Record<string, number>;
  events_extracted: number;
  events_valid: number;
  events_unique: number;
  events_rejected_invalid: number;
  events_rejected_duplicate: number;
  events_rejected_spatiotemporal: number;
  avg_confidence: number;
  source_mix: Record<string, number>;
  verification_breakdown: Record<string, number>;
  total_events_in_dataset: number;
  status: string;
}

function readPipelineStats(): PipelineStats | null {
  try {
    const statsPath = path.join(process.cwd(), "src", "data", "pipeline-stats.json");
    if (!fs.existsSync(statsPath)) return null;
    const raw = fs.readFileSync(statsPath, "utf-8");
    return JSON.parse(raw) as PipelineStats;
  } catch {
    return null;
  }
}

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
    pipeline: readPipelineStats(),
  });
}
