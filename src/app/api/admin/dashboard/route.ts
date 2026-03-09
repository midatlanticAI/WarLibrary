import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DATA_DIR = join(process.cwd(), "src", "data");
const LOG_PATH = "/var/log/warlibrary-updates.log";
const UPDATE_SCRIPT = join(process.cwd(), "scripts", "auto-update.sh");

function readJsonFile<T = unknown>(filename: string): T | null {
  try {
    const filePath = join(DATA_DIR, filename);
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function runCommand(cmd: string, timeoutMs = 10_000): string {
  try {
    return execSync(cmd, { timeout: timeoutMs, encoding: "utf-8" }).trim();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return `ERROR: ${message}`;
  }
}

interface EventFile {
  events: unknown[];
}

function countEvents(filename: string): number {
  const data = readJsonFile<EventFile>(filename);
  return data?.events?.length ?? 0;
}

// ---------------------------------------------------------------------------
// GET /api/admin/dashboard
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Pipeline stats
  const pipelineStats = readJsonFile("pipeline-stats.json");

  // 2. Pipeline history
  const pipelineHistory = readJsonFile<unknown[]>("pipeline-history.json");

  // 3. Article URL cache (it's a JSON array of URL strings)
  let articleCacheSize = 0;
  try {
    const cacheRaw = readJsonFile<unknown>("article-url-cache.json");
    if (Array.isArray(cacheRaw)) articleCacheSize = cacheRaw.length;
    else if (cacheRaw && typeof cacheRaw === "object") articleCacheSize = Object.keys(cacheRaw).length;
  } catch (err) { console.error("[dashboard] Failed to read article cache:", err); }

  // 4. PM2 process info
  let pm2Processes: unknown[] = [];
  try {
    const pm2Raw = runCommand("pm2 jlist", 15_000);
    if (!pm2Raw.startsWith("ERROR:")) {
      pm2Processes = JSON.parse(pm2Raw) as unknown[];
    }
  } catch (err) {
    console.error("[dashboard] Failed to get PM2 info:", err);
    pm2Processes = [];
  }

  // 5. Crontab entries
  const crontabRaw = runCommand("crontab -l");
  const crontabEntries = crontabRaw.startsWith("ERROR:")
    ? []
    : crontabRaw
        .split("\n")
        .filter((line) => line.trim() && !line.startsWith("#"));

  // 6. Last 50 lines of update log
  let logLines: string[] = [];
  if (existsSync(LOG_PATH)) {
    try {
      logLines = runCommand(`tail -n 50 ${LOG_PATH}`)
        .split("\n")
        .filter(Boolean);
    } catch (err) {
      console.error("[dashboard] Failed to read logs:", err);
      logLines = [];
    }
  }

  // 7. System info
  const uptimeSeconds = parseFloat(runCommand("cat /proc/uptime").split(" ")[0]) || 0;

  const memRaw = runCommand("free -b");
  let memoryInfo = { total: 0, used: 0, available: 0 };
  try {
    const memLine = memRaw.split("\n").find((l) => l.startsWith("Mem:"));
    if (memLine) {
      const parts = memLine.split(/\s+/);
      memoryInfo = {
        total: parseInt(parts[1], 10),
        used: parseInt(parts[2], 10),
        available: parseInt(parts[6], 10),
      };
    }
  } catch (err) {
    console.error("[dashboard] Failed to parse memory info:", err);
  }

  const diskRaw = runCommand("df -B1 /");
  let diskInfo = { total: 0, used: 0, available: 0, use_percent: "" };
  try {
    const diskLine = diskRaw.split("\n")[1];
    if (diskLine) {
      const parts = diskLine.split(/\s+/);
      diskInfo = {
        total: parseInt(parts[1], 10),
        used: parseInt(parts[2], 10),
        available: parseInt(parts[3], 10),
        use_percent: parts[4],
      };
    }
  } catch (err) {
    console.error("[dashboard] Failed to parse disk info:", err);
  }

  // 8. Event counts from all 3 files
  const eventCounts = {
    seed: countEvents("events.json"),
    expanded: countEvents("events_expanded.json"),
    latest: countEvents("events_latest.json"),
    total: 0,
  };
  eventCounts.total =
    eventCounts.seed + eventCounts.expanded + eventCounts.latest;

  // 9. Latest 10 events from events_latest.json
  let latestEvents: unknown[] = [];
  try {
    const latestData = readJsonFile<EventFile>("events_latest.json");
    if (latestData?.events) {
      latestEvents = latestData.events.slice(-10);
    }
  } catch (err) {
    console.error("[dashboard] Failed to read latest events:", err);
    latestEvents = [];
  }

  return NextResponse.json({
    data: {
      pipeline: {
        stats: pipelineStats,
        history: pipelineHistory ?? [],
      },
      articles: {
        cache_size: articleCacheSize,
      },
      pm2: pm2Processes.map((p: unknown) => {
        const proc = p as Record<string, unknown>;
        const monit = (proc.monit ?? {}) as Record<string, unknown>;
        const pm2Env = (proc.pm2_env ?? {}) as Record<string, unknown>;
        return {
          name: proc.name,
          pid: proc.pid,
          status: pm2Env.status,
          cpu: monit.cpu,
          memory: monit.memory,
          uptime: pm2Env.pm_uptime,
          restarts: pm2Env.restart_time,
        };
      }),
      crontab: {
        raw: crontabRaw.startsWith("ERROR:") ? crontabRaw : undefined,
        entries: crontabEntries,
      },
      logs: {
        last_50_lines: logLines,
      },
      system: {
        uptime_seconds: uptimeSeconds,
        memory: {
          total_mb: Math.round(memoryInfo.total / 1024 / 1024),
          used_mb: Math.round(memoryInfo.used / 1024 / 1024),
          available_mb: Math.round(memoryInfo.available / 1024 / 1024),
        },
        disk: {
          total_gb: Math.round(diskInfo.total / 1024 / 1024 / 1024),
          used_gb: Math.round(diskInfo.used / 1024 / 1024 / 1024),
          available_gb: Math.round(diskInfo.available / 1024 / 1024 / 1024),
          use_percent: diskInfo.use_percent,
        },
        node_version: process.version,
        process_uptime_seconds: Math.round(process.uptime()),
        memory_rss_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      },
      events: {
        counts: eventCounts,
        latest: latestEvents,
      },
    },
    timestamp: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// POST /api/admin/dashboard — admin actions
// ---------------------------------------------------------------------------

interface ActionBody {
  action: string;
  interval?: string;
  title?: string;
  body?: string;
}

const CRON_INTERVALS: Record<string, string> = {
  "10m": "*/10 * * * *",
  "30m": "*/30 * * * *",
  "1h": "0 * * * *",
  "2h": "0 */2 * * *",
  "4h": "0 */4 * * *",
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ActionBody;
  try {
    body = (await req.json()) as ActionBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { action } = body;

  // -----------------------------------------------------------------------
  // trigger_update — run auto-update.sh in background
  // -----------------------------------------------------------------------
  if (action === "trigger_update") {
    try {
      execSync(
        `nohup bash ${UPDATE_SCRIPT} >> ${LOG_PATH} 2>&1 &`,
        { timeout: 5_000, encoding: "utf-8" },
      );
      return NextResponse.json({
        ok: true,
        message: "Update triggered in background. Check logs for progress.",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: `Failed to trigger update: ${message}` },
        { status: 500 },
      );
    }
  }

  // -----------------------------------------------------------------------
  // clear_cache — wipe article-url-cache.json
  // -----------------------------------------------------------------------
  if (action === "clear_cache") {
    try {
      const cachePath = join(DATA_DIR, "article-url-cache.json");
      let before = 0;
      if (existsSync(cachePath)) {
        try {
          const raw = JSON.parse(readFileSync(cachePath, "utf-8"));
          before = Array.isArray(raw) ? raw.length : Object.keys(raw).length;
        } catch { /* ignore */ }
      }
      writeFileSync(cachePath, "[]", "utf-8");
      return NextResponse.json({
        ok: true,
        message: `Cache cleared. Removed ${before} entries.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: `Failed to clear cache: ${message}` },
        { status: 500 },
      );
    }
  }

  // -----------------------------------------------------------------------
  // update_cron — change the auto-update cron interval
  // -----------------------------------------------------------------------
  if (action === "update_cron") {
    const interval = body.interval;
    if (!interval || !CRON_INTERVALS[interval]) {
      return NextResponse.json(
        {
          error: `Invalid interval. Must be one of: ${Object.keys(CRON_INTERVALS).join(", ")}`,
        },
        { status: 400 },
      );
    }

    const cronSchedule = CRON_INTERVALS[interval];
    const cronLine = `${cronSchedule} ${UPDATE_SCRIPT} >> ${LOG_PATH} 2>&1`;

    try {
      // Read existing crontab, remove old warlibrary entries, add new one
      let existing = "";
      try {
        existing = execSync("crontab -l", {
          timeout: 5_000,
          encoding: "utf-8",
        });
      } catch {
        // No existing crontab
      }

      const filtered = existing
        .split("\n")
        .filter(
          (line) =>
            !line.includes("auto-update.sh") &&
            !line.includes("warlibrary-updates"),
        )
        .join("\n")
        .trim();

      const newCrontab = filtered
        ? `${filtered}\n${cronLine}\n`
        : `${cronLine}\n`;

      execSync(`echo ${JSON.stringify(newCrontab)} | crontab -`, {
        timeout: 5_000,
        encoding: "utf-8",
      });

      return NextResponse.json({
        ok: true,
        message: `Cron updated to run every ${interval}.`,
        cron_expression: cronSchedule,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: `Failed to update cron: ${message}` },
        { status: 500 },
      );
    }
  }

  // -----------------------------------------------------------------------
  // send_notification — push a notification via the notifications API
  // -----------------------------------------------------------------------
  if (action === "send_notification") {
    const title = body.title?.slice(0, 100) || "War Library Update";
    const notifBody =
      body.body?.slice(0, 300) || "New conflict events reported.";

    try {
      // Call the internal notifications endpoint
      const baseUrl =
        process.env.NEXT_PUBLIC_BASE_URL ||
        process.env.VERCEL_URL ||
        "http://localhost:3000";
      const url = `${baseUrl}/api/notifications`;

      const secret = process.env.ADMIN_SECRET;
      if (!secret) {
        return NextResponse.json(
          { error: "ADMIN_SECRET not configured" },
          { status: 500 },
        );
      }

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": secret,
        },
        body: JSON.stringify({ title, body: notifBody }),
      });

      const result = await res.json();

      if (!res.ok) {
        return NextResponse.json(
          { error: "Notification API error", details: result },
          { status: res.status },
        );
      }

      return NextResponse.json({
        ok: true,
        message: "Notification sent.",
        notification: result.data,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: `Failed to send notification: ${message}` },
        { status: 500 },
      );
    }
  }

  return NextResponse.json(
    {
      error: `Unknown action: ${action}. Valid actions: trigger_update, clear_cache, update_cron, send_notification`,
    },
    { status: 400 },
  );
}
