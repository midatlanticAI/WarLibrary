import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { publishNotification } from "@/lib/notifications";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { execFile, execSync } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

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

/**
 * Run a system command for the dashboard.
 *
 * Two deliberate properties:
 *
 * 1. **argv array, no shell.** This used to take a single command string and
 *    hand it to `execSync`, which runs it through a shell. Nothing interpolated
 *    request input into it, so there was no injection *today* — but a string
 *    API is one careless template literal away from RCE on a box that also
 *    holds the Anthropic key. `execFile` with an argv array cannot be talked
 *    into running a second command.
 *
 * 2. **Async.** These ran synchronously on the single Node process that serves
 *    every public request, and the dashboard polls this route every 30 seconds.
 *    A slow `pm2 jlist` (15s timeout) blocked the entire site for its duration:
 *    the map, the events API, everything. Awaiting them frees the event loop.
 */
async function runCommand(
  file: string,
  args: string[] = [],
  timeoutMs = 10_000
): Promise<string> {
  try {
    const { stdout } = await execFileAsync(file, args, {
      timeout: timeoutMs,
      encoding: "utf-8",
      // Bound the output so a runaway command cannot exhaust memory on a 2GB box.
      maxBuffer: 2 * 1024 * 1024,
    });
    return stdout.trim();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return `ERROR: ${message}`;
  }
}

/**
 * Dashboard payload cache.
 *
 * The UI polls every 30 seconds and each poll shells out six times. Serving a
 * recent snapshot costs the operator nothing in practice and takes that load
 * off a process that is also serving readers.
 */
const DASHBOARD_CACHE_MS = 10_000;
let dashboardCache: { at: number; payload: unknown } | null = null;

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

  // Serve a recent snapshot rather than shelling out six times per poll.
  if (dashboardCache && Date.now() - dashboardCache.at < DASHBOARD_CACHE_MS) {
    return NextResponse.json(dashboardCache.payload, {
      headers: { "X-Dashboard-Cache": "hit" },
    });
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

  // 4-7. System probes, gathered concurrently. These are independent reads, so
  // there is no reason to pay for them serially — and none of them can block
  // the event loop now that they are awaited rather than execSync'd.
  const [pm2Raw, crontabRaw, logRaw, uptimeRaw, memRaw, diskRaw] =
    await Promise.all([
      runCommand("pm2", ["jlist"], 15_000),
      runCommand("crontab", ["-l"]),
      existsSync(LOG_PATH)
        ? runCommand("tail", ["-n", "50", LOG_PATH])
        : Promise.resolve(""),
      runCommand("cat", ["/proc/uptime"]),
      runCommand("free", ["-b"]),
      runCommand("df", ["-B1", "/"]),
    ]);

  let pm2Processes: unknown[] = [];
  if (!pm2Raw.startsWith("ERROR:")) {
    try {
      pm2Processes = JSON.parse(pm2Raw) as unknown[];
    } catch (err) {
      console.error("[dashboard] Failed to parse PM2 output:", err);
    }
  }

  const crontabEntries = crontabRaw.startsWith("ERROR:")
    ? []
    : crontabRaw
        .split("\n")
        .filter((line) => line.trim() && !line.startsWith("#"));

  const logLines = logRaw.startsWith("ERROR:")
    ? []
    : logRaw.split("\n").filter(Boolean);

  const uptimeSeconds = parseFloat(uptimeRaw.split(" ")[0]) || 0;
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

  const payload = {
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
  };

  dashboardCache = { at: Date.now(), payload };
  return NextResponse.json(payload, {
    headers: { "X-Dashboard-Cache": "miss" },
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
  // CSRF protection.
  //
  // This used to run only `if (origin && host)`, so a request that simply
  // omitted the Origin header skipped the check entirely — it read as a
  // defence while providing none. Origin is now required. `sameSite: "strict"`
  // on the cookie is what actually made the old version low-impact, but a
  // check that fails open is worse than no check, because it stops anyone
  // looking.
  const origin = req.headers.get("origin");
  const secFetchSite = req.headers.get("sec-fetch-site");
  const host = req.headers.get("host");

  if (secFetchSite && secFetchSite !== "same-origin") {
    return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  }
  if (!origin) {
    // Browsers always send Origin on a state-changing fetch. Absence means a
    // non-browser client, which has no business driving admin controls.
    return NextResponse.json(
      { error: "Origin header required" },
      { status: 403 }
    );
  }
  try {
    const originHost = new URL(origin).host;
    if (!host || originHost !== host) {
      return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

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
    // `CRON_INTERVALS[interval]` reads the prototype chain: "constructor",
    // "toString", "__proto__" and friends all return truthy values, so the
    // whitelist everyone assumed was guarding command construction did not
    // hold. Sending {"interval":"constructor"} produced a cron line beginning
    // "function Object() { [native code] }". It died on a crontab parse error
    // rather than executing — but a validation gate one line away from command
    // construction has to actually validate.
    if (
      typeof interval !== "string" ||
      !Object.prototype.hasOwnProperty.call(CRON_INTERVALS, interval)
    ) {
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
      // Read the existing crontab.
      //
      // This used to swallow every failure as "no existing crontab", which
      // meant a 5s timeout, EAGAIN, a busy cron daemon or a permissions error
      // all produced an empty string — and the code below then installed a
      // crontab containing ONLY the warlibrary line, silently wiping every
      // other job on the box with no backup. `crontab -l` exits 1 with "no
      // crontab for <user>" when there genuinely is none; anything else is a
      // real error and must abort.
      let existing = "";
      try {
        existing = execSync("crontab -l", {
          timeout: 5_000,
          encoding: "utf-8",
        });
      } catch (err) {
        const e = err as { status?: number; stderr?: string | Buffer; message?: string };
        const stderr = String(e.stderr ?? e.message ?? "");
        const isGenuinelyEmpty = e.status === 1 && /no crontab for/i.test(stderr);
        if (!isGenuinelyEmpty) {
          console.error("[dashboard] crontab -l failed, refusing to rewrite:", stderr);
          return NextResponse.json(
            {
              error:
                "Could not read the existing crontab, so it was not modified. Rewriting it now would risk destroying unrelated jobs.",
            },
            { status: 500 },
          );
        }
      }

      // Back up whatever is there before replacing it.
      if (existing.trim()) {
        try {
          const backupPath = join(
            DATA_DIR,
            `crontab.backup-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`
          );
          writeFileSync(backupPath, existing, "utf-8");
        } catch (err) {
          console.error("[dashboard] Could not write crontab backup:", err);
        }
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

      execSync("crontab -", {
        input: newCrontab,
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
      // Published in-process. This previously POSTed to its own server with
      // the plaintext ADMIN_SECRET in a header, at a URL derived from
      // NEXT_PUBLIC_BASE_URL — a build-time, client-visible variable — in order
      // to reach a function running in this same process. The self-request also
      // re-entered the single Node process while this handler awaited it.
      const { notification, push } = await publishNotification({
        title,
        body: notifBody,
      });

      return NextResponse.json({
        ok: true,
        message: `Notification sent to ${push.sent} subscriber(s).`,
        notification,
        push,
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
