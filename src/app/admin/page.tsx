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
  if (status === "timeout") return "TIMEOUT";
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
    <div className="rounded-lg border border-[#262626] bg-[#141414] p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400">{title}</h2>
      {children}
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color === "text-green-500" ? "bg-green-500" : color === "text-yellow-500" ? "bg-yellow-500" : "bg-red-500"}`} />;
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-lg font-semibold text-zinc-200">{value}</div>
      {sub && <div className="text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

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
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg border border-[#262626] bg-[#141414] p-8">
        <h1 className="mb-6 text-center text-xl font-bold text-zinc-200">War Library Admin</h1>
        <label className="mb-2 block text-xs text-zinc-500">Admin Secret</label>
        <input
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          className="mb-4 w-full rounded border border-[#262626] bg-[#0a0a0a] px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-amber-600"
          placeholder="Enter admin secret..."
          autoFocus
        />
        {error && <p className="mb-3 text-xs text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={loading || !secret}
          className="w-full rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-500 disabled:opacity-50"
        >
          {loading ? "Authenticating..." : "Login"}
        </button>
      </form>
    </div>
  );
}

// ─── Dashboard ──────────────────────────────────────────────────────────────

function Dashboard() {
  const [resp, setResp] = useState<DashboardResponse | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [fetchErr, setFetchErr] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState("");
  const [cronInterval, setCronInterval] = useState("30m");
  const [notifTitle, setNotifTitle] = useState("");
  const [notifBody, setNotifBody] = useState("");
  const logsRef = useRef<HTMLDivElement>(null);

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
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
        <div className="text-red-400">Error: {fetchErr}</div>
      </div>
    );
  }

  if (!resp) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-amber-500" />
      </div>
    );
  }

  const { data } = resp;
  const stats = data.pipeline.stats;
  const history = data.pipeline.history || [];
  const pm2 = data.pm2?.[0] || null;
  const sys = data.system;
  const ev = data.events;
  const logs = data.logs.last_50_lines;

  const sourceNames = ["GDELT", "Google News", "Al Jazeera", "BBC News", "New York Times", "Reuters"];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-300">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-[#262626] bg-[#0a0a0a]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <a href="/" className="text-xs text-zinc-500 transition hover:text-amber-500">&larr; Site</a>
            <h1 className="text-lg font-bold text-zinc-200">War Library Admin</h1>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-500">
            <span>Server: <span className="text-zinc-300">{fmtUptime(sys.uptime_seconds)}</span></span>
            <span>Mem: <span className="text-zinc-300">{sys.memory.used_mb}MB</span> / {sys.memory.total_mb}MB</span>
            <span>Node <span className="text-zinc-300">{sys.node_version}</span></span>
            <span>Last run: <span className={stats?.last_run ? "text-zinc-300" : "text-red-400"}>{relativeTime(stats?.last_run ?? null)}</span></span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        {fetchErr && (
          <div className="rounded border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
            Refresh error: {fetchErr} (showing stale data)
          </div>
        )}

        {/* ── Pipeline Status ── */}
        <Card title="Pipeline Status">
          {stats ? (
            <>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <div>
                  <div className="mb-2 text-xs text-zinc-500">Status</div>
                  <div className={`inline-block rounded border px-3 py-1.5 text-sm font-mono font-semibold ${statusBg(stats.status)} ${statusColor(stats.status)}`}>
                    {stats.status}
                  </div>
                  <div className="mt-2 text-xs text-zinc-500">Duration: {stats.duration_ms}ms</div>
                  {stats.api_input_tokens > 0 && (
                    <div className="mt-1 text-xs text-zinc-500">
                      Tokens: {stats.api_input_tokens.toLocaleString()} in / {stats.api_output_tokens.toLocaleString()} out
                    </div>
                  )}
                </div>

                <div>
                  <div className="mb-2 text-xs text-zinc-500">Articles Fetched</div>
                  <div className="space-y-1 text-sm">
                    {Object.entries(stats.articles_by_source).map(([k, v]) => (
                      <div key={k} className="flex justify-between">
                        <span className="text-zinc-500">{k}</span>
                        <span className="text-zinc-300">{v}</span>
                      </div>
                    ))}
                    <div className="flex justify-between border-t border-[#262626] pt-1 font-medium">
                      <span className="text-zinc-400">Total</span>
                      <span className="text-zinc-200">{stats.articles_fetched}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-xs text-zinc-500">Event Funnel</div>
                  <div className="flex items-center gap-2 text-sm">
                    <div className="text-center">
                      <div className="text-lg font-bold text-zinc-200">{stats.events_extracted}</div>
                      <div className="text-[10px] text-zinc-500">Extracted</div>
                    </div>
                    <span className="text-zinc-600">&rarr;</span>
                    <div className="text-center">
                      <div className="text-lg font-bold text-zinc-200">{stats.events_valid}</div>
                      <div className="text-[10px] text-zinc-500">Valid</div>
                    </div>
                    <span className="text-zinc-600">&rarr;</span>
                    <div className="text-center">
                      <div className="text-lg font-bold text-green-400">{stats.events_unique}</div>
                      <div className="text-[10px] text-zinc-500">New</div>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-zinc-500">
                    Rejected: {stats.events_rejected_invalid} invalid, {stats.events_rejected_duplicate} dup, {stats.events_rejected_spatiotemporal} spatial
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-xs text-zinc-500">Confidence</div>
                  <div className={`text-2xl font-bold ${confColor(stats.avg_confidence)}`}>
                    {stats.avg_confidence > 0 ? stats.avg_confidence.toFixed(2) : "N/A"}
                  </div>
                  <div className="mt-2 text-xs text-zinc-500">Verification</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {Object.entries(stats.verification_breakdown).filter(([, v]) => v > 0).map(([k, v]) => (
                      <span key={k} className="rounded bg-[#0a0a0a] px-1.5 py-0.5 text-[10px] text-zinc-400">{k}: {v}</span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Errors */}
              {stats.errors.length > 0 && (
                <div className="mt-4 rounded border border-red-500/20 bg-red-500/5 p-3">
                  <div className="mb-1 text-xs font-medium text-red-400">Pipeline Errors</div>
                  {stats.errors.map((err, i) => (
                    <div key={i} className="text-xs text-red-300">{err}</div>
                  ))}
                </div>
              )}

              {/* Source mix */}
              {Object.keys(stats.source_mix).length > 0 && (
                <div className="mt-4 border-t border-[#262626] pt-3">
                  <div className="mb-2 text-xs text-zinc-500">Source Mix</div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(stats.source_mix).sort((a, b) => b[1] - a[1]).map(([src, n]) => (
                      <span key={src} className="rounded border border-[#262626] bg-[#0a0a0a] px-2 py-1 text-xs text-zinc-400">
                        {src}: <span className="text-zinc-200">{n}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-zinc-500">No pipeline data yet. Run an update first.</div>
          )}
        </Card>

        {/* ── Event Data ── */}
        <Card title="Event Data">
          <div className="mb-4 flex gap-6">
            <Stat label="Total" value={ev.counts.total} />
            <Stat label="Seed" value={ev.counts.seed} />
            <Stat label="Expanded" value={ev.counts.expanded} />
            <Stat label="Latest" value={ev.counts.latest} />
          </div>
          {ev.latest.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#262626] text-zinc-500">
                    <th className="pb-2 pr-3 font-medium">Date</th>
                    <th className="pb-2 pr-3 font-medium">Country</th>
                    <th className="pb-2 pr-3 font-medium">Type</th>
                    <th className="pb-2 pr-3 font-medium">Description</th>
                    <th className="pb-2 font-medium">Conf</th>
                  </tr>
                </thead>
                <tbody>
                  {ev.latest.map((e, i) => (
                    <tr key={i} className="border-b border-[#262626]/50">
                      <td className="py-1.5 pr-3 whitespace-nowrap text-zinc-400">
                        {new Date(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </td>
                      <td className="py-1.5 pr-3 whitespace-nowrap text-zinc-400">{e.country}</td>
                      <td className="py-1.5 pr-3 whitespace-nowrap text-zinc-400">{e.event_type}</td>
                      <td className="py-1.5 pr-3 max-w-xs truncate text-zinc-300">{e.description}</td>
                      <td className="py-1.5">
                        {e.confidence != null && (
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold ${e.confidence >= 0.8 ? "bg-green-500/20 text-green-400" : e.confidence >= 0.6 ? "bg-yellow-500/20 text-yellow-400" : "bg-red-500/20 text-red-400"}`}>
                            {e.confidence.toFixed(2)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* ── Pipeline History ── */}
        <Card title="Pipeline History">
          {history.length > 0 ? (
            <>
              <div className="mb-3">
                <div className="mb-1 text-xs text-zinc-500">Events Added (last {history.length} runs)</div>
                <div className="font-mono text-lg leading-none tracking-widest text-green-400">
                  {sparkBars(history.map((h) => h.events_unique))}
                </div>
              </div>
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-[#141414]">
                    <tr className="border-b border-[#262626] text-zinc-500">
                      <th className="pb-2 pr-3 font-medium">Time</th>
                      <th className="pb-2 pr-3 font-medium">Status</th>
                      <th className="pb-2 pr-3 font-medium">Articles</th>
                      <th className="pb-2 pr-3 font-medium">Events</th>
                      <th className="pb-2 pr-3 font-medium">Tokens</th>
                      <th className="pb-2 pr-3 font-medium">Duration</th>
                      <th className="pb-2 font-medium">Sources</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...history].reverse().map((run, i) => (
                      <tr key={i} className="border-b border-[#262626]/50">
                        <td className="py-1.5 pr-3 whitespace-nowrap text-zinc-400">{relativeTime(run.last_run)}</td>
                        <td className={`py-1.5 pr-3 font-mono whitespace-nowrap ${statusColor(run.status)}`}>{run.status.replace("SKIPPED_NO_NEW_ARTICLES", "CACHED")}</td>
                        <td className="py-1.5 pr-3 text-zinc-300">{run.articles_fetched}</td>
                        <td className="py-1.5 pr-3 text-zinc-300">{run.events_unique}</td>
                        <td className="py-1.5 pr-3 text-zinc-500">{run.api_input_tokens ? `${Math.round(run.api_input_tokens / 1000)}k` : "-"}</td>
                        <td className="py-1.5 pr-3 text-zinc-500">{run.duration_ms ? `${(run.duration_ms / 1000).toFixed(1)}s` : "-"}</td>
                        <td className="py-1.5">
                          <div className="flex gap-1">
                            {sourceNames.map((name) => {
                              const h = run.source_health?.[name];
                              return <span key={name} title={`${name}: ${h || "unknown"}`}><Dot color={healthIcon(h)} /></span>;
                            })}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="text-sm text-zinc-500">No history yet. Pipeline history builds after the first run with the new tracking.</div>
          )}
        </Card>

        {/* ── Site Analytics ── */}
        <Card title="Site Analytics">
          {analytics ? (
            <>
              <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
                <Stat label="Total Views" value={analytics.totalViews.toLocaleString()} />
                <Stat label="Today Views" value={analytics.todayViews.toLocaleString()} />
                <Stat label="Unique Today" value={analytics.todayUnique.toLocaleString()} />
                <Stat label="AI Questions" value={analytics.aiQuestions.toLocaleString()} />
              </div>

              {/* Page popularity bar chart */}
              <div className="mb-4">
                <div className="mb-2 text-xs text-zinc-500">Page Popularity</div>
                <div className="space-y-2">
                  {Object.entries(analytics.pageViews)
                    .sort((a, b) => b[1] - a[1])
                    .map(([page, views]) => {
                      const maxViews = Math.max(...Object.values(analytics.pageViews), 1);
                      const pct = (views / maxViews) * 100;
                      return (
                        <div key={page} className="flex items-center gap-3">
                          <span className="w-16 text-xs text-zinc-400 capitalize">{page}</span>
                          <div className="flex-1 h-5 bg-[#0a0a0a] rounded overflow-hidden">
                            <div
                              className="h-full bg-amber-600/60 rounded"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="w-12 text-right text-xs text-zinc-300">{views.toLocaleString()}</span>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Daily breakdown */}
              {analytics.daily.length > 0 && (
                <div>
                  <div className="mb-2 text-xs text-zinc-500">Last 7 Days</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#262626] text-zinc-500">
                          <th className="pb-2 pr-3 font-medium">Date</th>
                          <th className="pb-2 pr-3 font-medium">Views</th>
                          <th className="pb-2 pr-3 font-medium">Unique</th>
                          <th className="pb-2 font-medium">Top Page</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.daily.slice(0, 7).map((day) => {
                          const totalViews = Object.values(day.views).reduce((a, b) => a + b, 0);
                          const topPage = Object.entries(day.views).sort((a, b) => b[1] - a[1])[0];
                          return (
                            <tr key={day.date} className="border-b border-[#262626]/50">
                              <td className="py-1.5 pr-3 text-zinc-400">{day.date}</td>
                              <td className="py-1.5 pr-3 text-zinc-300">{totalViews}</td>
                              <td className="py-1.5 pr-3 text-zinc-300">{day.uniqueVisitors}</td>
                              <td className="py-1.5 text-zinc-400 capitalize">{topPage ? `${topPage[0]} (${topPage[1]})` : "-"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-zinc-500">No analytics data yet. Views are tracked automatically.</div>
          )}
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* ── Controls ── */}
          <Card title="Controls">
            <div className="space-y-4">
              {actionMsg && (
                <div className="rounded border border-[#262626] bg-[#0a0a0a] px-3 py-2 text-xs text-zinc-300">{actionMsg}</div>
              )}

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => postAction({ action: "trigger_update" })}
                  disabled={!!actionLoading}
                  className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-500 disabled:opacity-50"
                >
                  {actionLoading === "trigger_update" ? "Running..." : "Run Update Now"}
                </button>
                <button
                  onClick={() => postAction({ action: "clear_cache" })}
                  disabled={!!actionLoading}
                  className="rounded border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/20 disabled:opacity-50"
                >
                  {actionLoading === "clear_cache" ? "Clearing..." : `Clear Cache (${data.articles.cache_size})`}
                </button>
              </div>

              <div>
                <label className="mb-1 block text-xs text-zinc-500">Cron Interval</label>
                <div className="flex gap-2">
                  <select
                    value={cronInterval}
                    onChange={(e) => setCronInterval(e.target.value)}
                    className="rounded border border-[#262626] bg-[#0a0a0a] px-3 py-1.5 text-sm text-zinc-300 outline-none focus:border-amber-600"
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
                    className="rounded bg-zinc-700 px-3 py-1.5 text-sm text-zinc-200 transition hover:bg-zinc-600 disabled:opacity-50"
                  >
                    Set
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs text-zinc-500">Send Notification</label>
                <input
                  type="text"
                  placeholder="Title"
                  value={notifTitle}
                  onChange={(e) => setNotifTitle(e.target.value)}
                  className="mb-2 w-full rounded border border-[#262626] bg-[#0a0a0a] px-3 py-1.5 text-sm text-zinc-300 placeholder-zinc-600 outline-none focus:border-amber-600"
                />
                <textarea
                  placeholder="Body"
                  value={notifBody}
                  onChange={(e) => setNotifBody(e.target.value)}
                  rows={2}
                  className="mb-2 w-full resize-none rounded border border-[#262626] bg-[#0a0a0a] px-3 py-1.5 text-sm text-zinc-300 placeholder-zinc-600 outline-none focus:border-amber-600"
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
                  className="rounded bg-amber-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-amber-500 disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            </div>
          </Card>

          {/* ── Source Health ── */}
          <Card title="Source Health">
            <div className="space-y-3">
              {sourceNames.map((name) => {
                const h = stats?.source_health?.[name];
                return (
                  <div key={name} className="flex items-center justify-between">
                    <span className="text-sm text-zinc-400">{name}</span>
                    <div className="flex items-center gap-2">
                      <Dot color={healthIcon(h)} />
                      <span className={`text-xs ${healthIcon(h)}`}>{healthLabel(h)}</span>
                    </div>
                  </div>
                );
              })}
              <div className="border-t border-[#262626] pt-3 flex justify-between">
                <span className="text-sm text-zinc-400">Article Cache</span>
                <span className="text-sm text-zinc-200">{data.articles.cache_size.toLocaleString()} URLs</span>
              </div>
            </div>
          </Card>
        </div>

        {/* ── Logs ── */}
        <Card title="Logs (Last 50 Lines)">
          <div ref={logsRef} className="max-h-80 overflow-y-auto rounded border border-[#262626] bg-[#0a0a0a] p-3 font-mono text-xs leading-relaxed">
            {logs.length === 0 ? (
              <div className="text-zinc-600">No logs available.</div>
            ) : (
              logs.map((line, i) => (
                <div key={i} className={logColor(line)}>{line}</div>
              ))
            )}
          </div>
        </Card>

        {/* ── System ── */}
        <Card title="System">
          <div className="grid gap-6 md:grid-cols-3">
            <div>
              <div className="mb-2 text-xs text-zinc-500">PM2 Process</div>
              {pm2 ? (
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Status</span>
                    <span className={pm2.status === "online" ? "text-green-400" : "text-red-400"}>{pm2.status}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Uptime</span>
                    <span className="text-zinc-300">{pm2.uptime ? fmtUptime((Date.now() - pm2.uptime) / 1000) : "N/A"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Restarts</span>
                    <span className={pm2.restarts > 10 ? "text-red-400" : "text-zinc-300"}>{pm2.restarts}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Memory</span>
                    <span className="text-zinc-300">{Math.round((pm2.memory || 0) / 1024 / 1024)}MB</span>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-zinc-500">Not running</div>
              )}
            </div>

            <div>
              <div className="mb-2 text-xs text-zinc-500">Cron Schedule</div>
              {data.crontab.entries.map((line, i) => (
                <div key={i} className="mb-1 font-mono text-xs text-zinc-400 break-all">{line}</div>
              ))}
            </div>

            <div>
              <div className="mb-2 text-xs text-zinc-500">Disk</div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Used</span>
                  <span className="text-zinc-300">{sys.disk.used_gb}GB / {sys.disk.total_gb}GB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Usage</span>
                  <span className={parseInt(sys.disk.use_percent) > 80 ? "text-red-400" : "text-zinc-300"}>{sys.disk.use_percent}</span>
                </div>
              </div>
              <div className="mt-3 text-xs text-zinc-500">Memory</div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Used</span>
                  <span className="text-zinc-300">{sys.memory.used_mb}MB / {sys.memory.total_mb}MB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">App RSS</span>
                  <span className="text-zinc-300">{sys.memory_rss_mb}MB</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </main>

      <footer className="border-t border-[#262626] py-4 text-center text-xs text-zinc-600">
        Auto-refreshing every 30s
      </footer>
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
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-amber-500" />
      </div>
    );
  }

  if (!authed) return <LoginScreen onAuth={() => setAuthed(true)} />;
  return <Dashboard />;
}
