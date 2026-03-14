"use client";

import { useState, useEffect, useCallback, useRef, FormEvent } from "react";

// ─── Types matching GET /api/admin/dashboard response ─────────────────────

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
  errors: string[];
  source_health: Record<string, string>;
  duration_ms: number;
  api_input_tokens: number;
  api_output_tokens: number;
}

interface PM2Process {
  name: string;
  pid: number;
  status: string;
  cpu: number;
  memory: number;
  uptime: number;
  restarts: number;
}

interface LatestEvent {
  date: string;
  event_type: string;
  description: string;
  country: string;
  confidence?: number;
  verification_status?: string;
  source?: string;
}

interface AnalyticsData {
  totalViews: number;
  todayViews: number;
  todayUnique: number;
  aiQuestions: number;
  pageViews: Record<string, number>;
  daily: Array<{
    date: string;
    views: Record<string, number>;
    uniqueVisitors: number;
  }>;
}

interface DashboardResponse {
  data: {
    pipeline: {
      stats: PipelineStats | null;
      history: PipelineStats[];
    };
    articles: { cache_size: number };
    pm2: PM2Process[];
    crontab: { raw?: string; entries: string[] };
    logs: { last_50_lines: string[] };
    system: {
      uptime_seconds: number;
      memory: { total_mb: number; used_mb: number; available_mb: number };
      disk: { total_gb: number; used_gb: number; available_gb: number; use_percent: string };
      node_version: string;
      process_uptime_seconds: number;
      memory_rss_mb: number;
    };
    events: {
      counts: { seed: number; expanded: number; latest: number; total: number };
      latest: LatestEvent[];
    };
  };
  timestamp: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "just now";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

function statusColor(s: string): string {
  if (s === "EVENTS_ADDED") return "text-green-400";
  if (s === "SKIPPED_NO_NEW_ARTICLES") return "text-blue-400";
  if (s === "NO_NEW_EVENTS") return "text-yellow-400";
  return "text-red-400";
}

function statusBg(s: string): string {
  if (s === "EVENTS_ADDED") return "bg-green-500/10 border-green-500/30";
  if (s === "SKIPPED_NO_NEW_ARTICLES") return "bg-blue-500/10 border-blue-500/30";
  if (s === "NO_NEW_EVENTS") return "bg-yellow-500/10 border-yellow-500/30";
  return "bg-red-500/10 border-red-500/30";
}

function confColor(n: number): string {
  if (n >= 0.8) return "text-green-400";
  if (n >= 0.6) return "text-yellow-400";
  return "text-red-400";
}

function healthIcon(status: string | undefined): string {
  if (status === "ok") return "text-green-500";
  if (status === "timeout") return "text-yellow-500";
  return "text-red-500";
}

function healthLabel(status: string | undefined): string {
  if (status === "ok") return "UP";
  if (status === "timeout") return "SLOW";
  return "DOWN";
}

function logColor(line: string): string {
  const l = line.toLowerCase();
  if (l.includes("error") || l.includes("fatal")) return "text-red-400";
  if (l.includes("warn")) return "text-yellow-400";
  if (l.includes("skip")) return "text-orange-400";
  if (l.includes("events_added") || l.includes("new events")) return "text-green-400";
  return "text-zinc-500";
}

function sparkBars(values: number[]): string {
  if (!values.length) return "";
  const max = Math.max(...values, 1);
  const chars = [" ", "\u2581", "\u2582", "\u2583", "\u2584", "\u2585", "\u2586", "\u2587", "\u2588"];
  return values.map((v) => chars[Math.round((v / max) * (chars.length - 1))]).join("");
}

// ─── Components ──────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#1e1e1e] bg-[#141414] p-5 sm:p-6">
      <h2 className="mb-5 text-xs font-semibold uppercase tracking-widest text-zinc-500">{title}</h2>
      {children}
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return <span className={`inline-block h-2 w-2 rounded-full ${color === "text-green-500" ? "bg-green-500" : color === "text-yellow-500" ? "bg-yellow-500" : "bg-red-500"}`} />;
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg bg-[#0e0e0e] p-3">
      <div className="text-[10px] uppercase tracking-wider text-zinc-600">{label}</div>
      <div className="mt-1 text-xl font-bold text-zinc-100">{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-zinc-600">{sub}</div>}
    </div>
  );
}

type AdminTab = "overview" | "events" | "analytics" | "controls" | "logs";

const TABS: { id: AdminTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "events", label: "Events" },
  { id: "analytics", label: "Analytics" },
  { id: "controls", label: "Controls" },
  { id: "logs", label: "Logs" },
];

// ─── Login ──────────────────────────────────────────────────────────────────

function LoginScreen({ onAuth }: { onAuth: () => void }) {
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ secret }),
      });
      if (res.ok) onAuth();
      else setError("Invalid secret");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#0a0a0a] p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-xl border border-[#1e1e1e] bg-[#141414] p-8">
        <h1 className="mb-8 text-center text-xl font-bold text-zinc-200">War Library Admin</h1>
        <label className="mb-2 block text-xs text-zinc-500">Admin Secret</label>
        <input
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          className="mb-4 w-full rounded-lg border border-[#262626] bg-[#0a0a0a] px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-amber-600"
          placeholder="Enter admin secret..."
          autoFocus
        />
        {error && <p className="mb-3 text-xs text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={loading || !secret}
          className="w-full rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-amber-500 disabled:opacity-50"
        >
          {loading ? "Authenticating..." : "Login"}
        </button>
      </form>
    </div>
  );
}

// ─── Tab: Overview ──────────────────────────────────────────────────────────

function OverviewTab({ data, stats, sourceNames }: {
  data: DashboardResponse["data"];
  stats: PipelineStats | null;
  sourceNames: string[];
}) {
  const history = data.pipeline.history || [];
  const pm2 = data.pm2?.[0] || null;
  const sys = data.system;

  return (
    <div className="space-y-6">
      {/* Quick stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total Events" value={data.events.counts.total} />
        <Stat label="Last Run" value={relativeTime(stats?.last_run ?? null)} />
        <Stat label="Confidence" value={stats?.avg_confidence ? stats.avg_confidence.toFixed(2) : "N/A"} />
        <Stat
          label="Status"
          value={pm2?.status === "online" ? "Online" : "Offline"}
          sub={pm2?.uptime ? `Up ${fmtUptime((Date.now() - pm2.uptime) / 1000)}` : undefined}
        />
      </div>

      {/* Pipeline status */}
      {stats && (
        <Card title="Last Pipeline Run">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className={`inline-block rounded-lg border px-3 py-1.5 text-xs font-mono font-semibold ${statusBg(stats.status)} ${statusColor(stats.status)}`}>
                {stats.status}
              </span>
              <span className="text-xs text-zinc-600">{stats.duration_ms}ms</span>
              {stats.api_input_tokens > 0 && (
                <span className="text-xs text-zinc-600">
                  {stats.api_input_tokens.toLocaleString()} in / {stats.api_output_tokens.toLocaleString()} out tokens
                </span>
              )}
            </div>

            {/* Funnel */}
            <div className="flex items-center gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-zinc-200">{stats.articles_fetched}</div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-600">Articles</div>
              </div>
              <span className="text-zinc-700">&#8594;</span>
              <div>
                <div className="text-2xl font-bold text-zinc-200">{stats.events_extracted}</div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-600">Extracted</div>
              </div>
              <span className="text-zinc-700">&#8594;</span>
              <div>
                <div className="text-2xl font-bold text-zinc-200">{stats.events_valid}</div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-600">Valid</div>
              </div>
              <span className="text-zinc-700">&#8594;</span>
              <div>
                <div className="text-2xl font-bold text-green-400">{stats.events_unique}</div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-600">Added</div>
              </div>
            </div>

            {stats.errors.length > 0 && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                {stats.errors.map((err, i) => (
                  <div key={i} className="text-xs text-red-300">{err}</div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Source health + system side by side */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Source Health">
          <div className="space-y-3">
            {sourceNames.map((name) => {
              const h = stats?.source_health?.[name];
              return (
                <div key={name} className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">{name}</span>
                  <div className="flex items-center gap-2">
                    <Dot color={healthIcon(h)} />
                    <span className={`text-xs font-medium ${healthIcon(h)}`}>{healthLabel(h)}</span>
                  </div>
                </div>
              );
            })}
            <div className="border-t border-[#1e1e1e] pt-3 flex justify-between">
              <span className="text-sm text-zinc-500">Article Cache</span>
              <span className="text-sm text-zinc-300">{data.articles.cache_size.toLocaleString()} URLs</span>
            </div>
          </div>
        </Card>

        <Card title="System">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Server Uptime" value={fmtUptime(sys.uptime_seconds)} />
              <Stat label="App Memory" value={`${sys.memory_rss_mb}MB`} />
              <Stat label="Disk" value={sys.disk.use_percent} sub={`${sys.disk.used_gb}GB / ${sys.disk.total_gb}GB`} />
              <Stat label="RAM" value={`${sys.memory.used_mb}MB`} sub={`of ${sys.memory.total_mb}MB`} />
            </div>
            {pm2 && (
              <div className="flex items-center justify-between rounded-lg bg-[#0e0e0e] px-3 py-2 text-xs">
                <span className="text-zinc-500">PM2 Restarts</span>
                <span className={pm2.restarts > 10 ? "font-medium text-red-400" : "text-zinc-300"}>{pm2.restarts}</span>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Pipeline history sparkline */}
      {history.length > 0 && (
        <Card title="Pipeline History">
          <div className="mb-4">
            <div className="mb-1 text-xs text-zinc-600">Events added per run (last {history.length})</div>
            <div className="font-mono text-xl leading-none tracking-widest text-green-400">
              {sparkBars(history.map((h) => h.events_unique))}
            </div>
          </div>
          <div className="overflow-x-auto max-h-48 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-[#141414]">
                <tr className="border-b border-[#1e1e1e] text-zinc-600">
                  <th className="pb-2 pr-3 font-medium">Time</th>
                  <th className="pb-2 pr-3 font-medium">Status</th>
                  <th className="pb-2 pr-3 font-medium">New</th>
                  <th className="pb-2 pr-3 font-medium hidden sm:table-cell">Tokens</th>
                  <th className="pb-2 font-medium hidden sm:table-cell">Duration</th>
                </tr>
              </thead>
              <tbody>
                {[...history].reverse().map((run, i) => (
                  <tr key={i} className="border-b border-[#1e1e1e]/50">
                    <td className="py-2 pr-3 whitespace-nowrap text-zinc-400">{relativeTime(run.last_run)}</td>
                    <td className={`py-2 pr-3 font-mono whitespace-nowrap ${statusColor(run.status)}`}>
                      {run.status.replace("SKIPPED_NO_NEW_ARTICLES", "CACHED")}
                    </td>
                    <td className="py-2 pr-3 text-zinc-300">{run.events_unique}</td>
                    <td className="py-2 pr-3 text-zinc-600 hidden sm:table-cell">{run.api_input_tokens ? `${Math.round(run.api_input_tokens / 1000)}k` : "-"}</td>
                    <td className="py-2 text-zinc-600 hidden sm:table-cell">{run.duration_ms ? `${(run.duration_ms / 1000).toFixed(1)}s` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Tab: Events ────────────────────────────────────────────────────────────

function EventsTab({ data, stats }: { data: DashboardResponse["data"]; stats: PipelineStats | null }) {
  const ev = data.events;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total" value={ev.counts.total} />
        <Stat label="Seed" value={ev.counts.seed} />
        <Stat label="Expanded" value={ev.counts.expanded} />
        <Stat label="Latest" value={ev.counts.latest} />
      </div>

      {/* Source mix */}
      {stats && Object.keys(stats.source_mix).length > 0 && (
        <Card title="Source Mix (Last Run)">
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.source_mix).sort((a, b) => b[1] - a[1]).map(([src, n]) => (
              <span key={src} className="rounded-lg border border-[#1e1e1e] bg-[#0e0e0e] px-3 py-1.5 text-xs text-zinc-400">
                {src} <span className="font-semibold text-zinc-200">{n}</span>
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Verification breakdown */}
      {stats && (
        <Card title="Verification Breakdown">
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.verification_breakdown).filter(([, v]) => v > 0).map(([k, v]) => (
              <span key={k} className="rounded-lg bg-[#0e0e0e] px-3 py-1.5 text-xs capitalize text-zinc-400">
                {k} <span className="font-semibold text-zinc-200">{v}</span>
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Recent events table */}
      {ev.latest.length > 0 && (
        <Card title="Recent Events">
          <div className="space-y-3">
            {ev.latest.map((e, i) => (
              <div key={i} className="rounded-lg bg-[#0e0e0e] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium capitalize text-zinc-300">
                    {e.event_type.replace(/_/g, " ")}
                  </span>
                  <div className="flex items-center gap-2">
                    {e.confidence != null && (
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold ${e.confidence >= 0.8 ? "bg-green-500/20 text-green-400" : e.confidence >= 0.6 ? "bg-yellow-500/20 text-yellow-400" : "bg-red-500/20 text-red-400"}`}>
                        {e.confidence.toFixed(2)}
                      </span>
                    )}
                    <span className="text-[10px] text-zinc-600">
                      {new Date(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">{e.description}</p>
                <div className="mt-1.5 flex items-center gap-2 text-[10px] text-zinc-600">
                  <span>{e.country}</span>
                  {e.source && <span>via {e.source}</span>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Tab: Analytics ─────────────────────────────────────────────────────────

function AnalyticsTab({ analytics }: { analytics: AnalyticsData | null }) {
  if (!analytics) {
    return <div className="py-12 text-center text-sm text-zinc-600">No analytics data yet. Views are tracked automatically.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total Views" value={analytics.totalViews.toLocaleString()} />
        <Stat label="Today" value={analytics.todayViews.toLocaleString()} />
        <Stat label="Unique Today" value={analytics.todayUnique.toLocaleString()} />
        <Stat label="AI Questions" value={analytics.aiQuestions.toLocaleString()} />
      </div>

      <Card title="Page Popularity">
        <div className="space-y-3">
          {Object.entries(analytics.pageViews)
            .sort((a, b) => b[1] - a[1])
            .map(([page, views]) => {
              const maxViews = Math.max(...Object.values(analytics.pageViews), 1);
              const pct = (views / maxViews) * 100;
              return (
                <div key={page} className="flex items-center gap-3">
                  <span className="w-16 text-xs text-zinc-400 capitalize">{page}</span>
                  <div className="flex-1 h-6 bg-[#0e0e0e] rounded-lg overflow-hidden">
                    <div className="h-full bg-amber-600/50 rounded-lg" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-12 text-right text-xs font-medium text-zinc-300">{views.toLocaleString()}</span>
                </div>
              );
            })}
        </div>
      </Card>

      {analytics.daily.length > 0 && (
        <Card title="Last 7 Days">
          <div className="space-y-2">
            {analytics.daily.slice(0, 7).map((day) => {
              const totalViews = Object.values(day.views).reduce((a, b) => a + b, 0);
              const topPage = Object.entries(day.views).sort((a, b) => b[1] - a[1])[0];
              return (
                <div key={day.date} className="flex items-center justify-between rounded-lg bg-[#0e0e0e] px-3 py-2 text-xs">
                  <span className="text-zinc-400">{day.date}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-zinc-300">{totalViews} views</span>
                    <span className="text-zinc-500">{day.uniqueVisitors} unique</span>
                    {topPage && <span className="text-zinc-600 capitalize">{topPage[0]}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Tab: Controls ──────────────────────────────────────────────────────────

function ControlsTab({
  data,
  postAction,
  actionLoading,
  actionMsg,
}: {
  data: DashboardResponse["data"];
  postAction: (body: Record<string, string>) => void;
  actionLoading: string | null;
  actionMsg: string;
}) {
  const [cronInterval, setCronInterval] = useState("30m");
  const [notifTitle, setNotifTitle] = useState("");
  const [notifBody, setNotifBody] = useState("");

  return (
    <div className="space-y-6">
      {actionMsg && (
        <div className="rounded-lg border border-[#1e1e1e] bg-[#141414] px-4 py-3 text-sm text-zinc-300">{actionMsg}</div>
      )}

      <Card title="Pipeline Actions">
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => postAction({ action: "trigger_update" })}
            disabled={!!actionLoading}
            className="rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-amber-500 disabled:opacity-50"
          >
            {actionLoading === "trigger_update" ? "Running..." : "Run Update Now"}
          </button>
          <button
            onClick={() => postAction({ action: "clear_cache" })}
            disabled={!!actionLoading}
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-5 py-2.5 text-sm font-medium text-red-400 transition hover:bg-red-500/20 disabled:opacity-50"
          >
            {actionLoading === "clear_cache" ? "Clearing..." : `Clear Cache (${data.articles.cache_size})`}
          </button>
        </div>
      </Card>

      <Card title="Cron Schedule">
        <div className="flex items-center gap-3">
          <select
            value={cronInterval}
            onChange={(e) => setCronInterval(e.target.value)}
            className="rounded-lg border border-[#262626] bg-[#0e0e0e] px-3 py-2 text-sm text-zinc-300 outline-none focus:border-amber-600"
          >
            <option value="10m">Every 10 min</option>
            <option value="30m">Every 30 min</option>
            <option value="1h">Every 1 hour</option>
            <option value="2h">Every 2 hours</option>
            <option value="4h">Every 4 hours</option>
          </select>
          <button
            onClick={() => postAction({ action: "update_cron", interval: cronInterval })}
            disabled={!!actionLoading}
            className="rounded-lg bg-zinc-700 px-4 py-2 text-sm text-zinc-200 transition hover:bg-zinc-600 disabled:opacity-50"
          >
            Set
          </button>
        </div>
        <div className="mt-3 space-y-1">
          {data.crontab.entries.map((line, i) => (
            <div key={i} className="font-mono text-xs text-zinc-500 break-all">{line}</div>
          ))}
        </div>
      </Card>

      <Card title="Send Notification">
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Title"
            value={notifTitle}
            onChange={(e) => setNotifTitle(e.target.value)}
            className="w-full rounded-lg border border-[#262626] bg-[#0e0e0e] px-3 py-2.5 text-sm text-zinc-300 placeholder-zinc-600 outline-none focus:border-amber-600"
          />
          <textarea
            placeholder="Body"
            value={notifBody}
            onChange={(e) => setNotifBody(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-lg border border-[#262626] bg-[#0e0e0e] px-3 py-2.5 text-sm text-zinc-300 placeholder-zinc-600 outline-none focus:border-amber-600"
          />
          <button
            onClick={() => {
              if (notifTitle.trim()) {
                postAction({ action: "send_notification", title: notifTitle, body: notifBody });
                setNotifTitle("");
                setNotifBody("");
              }
            }}
            disabled={!!actionLoading || !notifTitle.trim()}
            className="rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-amber-500 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </Card>
    </div>
  );
}

// ─── Tab: Logs ──────────────────────────────────────────────────────────────

function LogsTab({ logs }: { logs: string[] }) {
  const logsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <Card title="Pipeline Logs">
      <div
        ref={logsRef}
        className="h-[calc(100dvh-220px)] overflow-y-auto rounded-lg border border-[#1e1e1e] bg-[#0a0a0a] p-4 font-mono text-xs leading-relaxed"
      >
        {logs.length === 0 ? (
          <div className="text-zinc-600">No logs available.</div>
        ) : (
          logs.map((line, i) => (
            <div key={i} className={`py-0.5 ${logColor(line)}`}>{line}</div>
          ))
        )}
      </div>
    </Card>
  );
}

// ─── Dashboard ──────────────────────────────────────────────────────────────

function Dashboard() {
  const [resp, setResp] = useState<DashboardResponse | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [fetchErr, setFetchErr] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState("");
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");

  const fetchData = useCallback(async () => {
    try {
      const [dashRes, analyticsRes] = await Promise.all([
        fetch("/api/admin/dashboard", { credentials: "include" }),
        fetch("/api/analytics", { credentials: "include" }),
      ]);
      if (dashRes.status === 401) { window.location.reload(); return; }
      if (!dashRes.ok) throw new Error(`${dashRes.status}`);
      const json: DashboardResponse = await dashRes.json();
      setResp(json);
      if (analyticsRes.ok) {
        const aJson = await analyticsRes.json();
        setAnalytics(aJson.data);
      }
      setFetchErr("");
    } catch (e) {
      setFetchErr(e instanceof Error ? e.message : "Failed to fetch");
    }
  }, []);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 30000);
    return () => clearInterval(iv);
  }, [fetchData]);

  async function postAction(body: Record<string, string>) {
    setActionLoading(body.action);
    setActionMsg("");
    try {
      const res = await fetch("/api/admin/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const json = await res.json();
      setActionMsg(json.message || json.error || "Done");
      setTimeout(fetchData, 2000);
    } catch {
      setActionMsg("Action failed");
    } finally {
      setActionLoading(null);
    }
  }

  if (!resp && fetchErr) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#0a0a0a]">
        <div className="text-red-400">Error: {fetchErr}</div>
      </div>
    );
  }

  if (!resp) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#0a0a0a]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-amber-500" />
      </div>
    );
  }

  const { data } = resp;
  const stats = data.pipeline.stats;
  const logs = data.logs.last_50_lines;
  const sourceNames = [
    "Google News", "NewsData",
    "Al Jazeera", "BBC News", "New York Times", "The Guardian", "France 24", "DW News",
    "Washington Post", "NPR", "CNN", "Fox News", "CBS News", "ABC News",
    "Reuters", "UN News", "Times of Israel", "Middle East Eye",
  ];

  return (
    <div className="flex h-dvh flex-col bg-[#0a0a0a] text-zinc-300">
      {/* Header */}
      <header className="shrink-0 border-b border-[#1e1e1e] bg-[#0a0a0a]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <a href="/" className="text-xs text-zinc-600 transition hover:text-amber-500">&larr;</a>
            <h1 className="text-sm font-bold text-zinc-200">Admin</h1>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-zinc-600">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${stats?.last_run ? "bg-green-500" : "bg-red-500"}`} />
            <span>{relativeTime(stats?.last_run ?? null)}</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="mx-auto max-w-5xl overflow-x-auto px-4">
          <div className="flex gap-1 pb-px">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap rounded-t-lg px-4 py-2 text-xs font-medium transition ${
                  activeTab === tab.id
                    ? "bg-[#141414] text-zinc-200"
                    : "text-zinc-600 hover:text-zinc-400"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-4 py-6 pb-24">
          {fetchErr && (
            <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-400">
              Refresh error: {fetchErr}
            </div>
          )}

          {activeTab === "overview" && <OverviewTab data={data} stats={stats} sourceNames={sourceNames} />}
          {activeTab === "events" && <EventsTab data={data} stats={stats} />}
          {activeTab === "analytics" && <AnalyticsTab analytics={analytics} />}
          {activeTab === "controls" && <ControlsTab data={data} postAction={postAction} actionLoading={actionLoading} actionMsg={actionMsg} />}
          {activeTab === "logs" && <LogsTab logs={logs} />}
        </div>
      </main>
    </div>
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/admin", { credentials: "include" })
      .then((r) => r.json())
      .then((j) => setAuthed(j.admin === true))
      .catch(() => setAuthed(false));
  }, []);

  if (authed === null) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#0a0a0a]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-amber-500" />
      </div>
    );
  }

  if (!authed) return <LoginScreen onAuth={() => setAuthed(true)} />;
  return <Dashboard />;
}
