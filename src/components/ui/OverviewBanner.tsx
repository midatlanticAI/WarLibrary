"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConflictEvent } from "@/types";
import { EVENT_COLORS } from "@/lib/constants";
import { useI18n } from "@/i18n";

const CONFLICT_START = "2026-02-28";

type StatKey = "killed" | "events" | "countries" | "airstrikes" | "missiles" | "drones" | "civilian" | "24h";

interface OverviewBannerProps {
  events: ConflictEvent[];
}

export default function OverviewBanner({ events }: OverviewBannerProps) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(true);
  const [activeModal, setActiveModal] = useState<StatKey | null>(null);

  useEffect(() => {
    if (window.innerWidth >= 640) setCollapsed(false);
  }, []);

  const stats = useMemo(() => {
    const summedFatalities = events.reduce((sum, e) => sum + (e.fatalities || 0), 0);
    let reportedTotal = 0;
    for (const e of events) {
      const desc = (e.description || "").toLowerCase();
      const tollMatch = desc.match(/(?:death toll|toll|casualties).*?(\d[\d,]+)\s*(?:killed|dead|people)/i)
        || desc.match(/(?:death toll|toll).*?(?:reaches|exceeds|surpasses|passes|tops)\s*(\d[\d,]+)/i)
        || (e.description || "").match(/(\d[\d,]+)\+?\s*(?:fatalities|killed|dead)\s*(?:reported|confirmed)/i);
      if (tollMatch) {
        const num = parseInt(tollMatch[1].replace(/,/g, ""), 10);
        if (num > reportedTotal) reportedTotal = num;
      }
    }
    const totalKilled = Math.max(summedFatalities, reportedTotal);
    const countries = new Set(events.map((e) => e.country)).size;
    const topCountries = Object.entries(
      events.reduce<Record<string, number>>((acc, e) => { acc[e.country] = (acc[e.country] || 0) + 1; return acc; }, {})
    ).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c]) => c);

    const startDate = new Date(CONFLICT_START);
    const daysOfConflict = Math.ceil((Date.now() - startDate.getTime()) / 86400000);
    const missiles = events.filter((e) => e.event_type === "missile_attack").length;
    const airstrikes = events.filter((e) => e.event_type === "airstrike").length;
    const drones = events.filter((e) => e.event_type === "drone_attack").length;
    const battles = events.filter((e) => e.event_type === "battle").length;
    const strategicDevs = events.filter((e) => e.event_type === "strategic_development").length;
    const now = Date.now();
    const recentEvents = events.filter((e) => now - new Date(e.date).getTime() < 86400000);
    const latestEvent = [...events].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    const civilianImpactEvents = events.filter(
      (e) => e.event_type === "violence_against_civilians" || (e.civilian_impact && e.civilian_impact.length > 0)
    );

    return {
      totalKilled, summedFatalities, reportedTotal, countries, topCountries, daysOfConflict,
      missiles, airstrikes, drones, battles, strategicDevs,
      recentEvents, totalEvents: events.length, latestEvent, civilianImpactEvents,
    };
  }, [events]);

  const openModal = useCallback((key: StatKey) => setActiveModal(key), []);
  const closeModal = useCallback(() => setActiveModal(null), []);

  return (
    <div className="border-b border-zinc-800 bg-[#0e0e0e]">
      {/* ── Mobile: compact two-row grid (no scrolling) ── */}
      <div className="grid grid-cols-4 sm:hidden" role="region" aria-label="Conflict statistics">
        <MobileStat label={t("stats.day")} value={String(stats.daysOfConflict)} color="text-zinc-100" />
        <MobileStat label={t("stats.killed")} value={`${(stats.totalKilled / 1000).toFixed(1)}k+`} color="text-red-400" onClick={() => openModal("killed")} />
        <MobileStat label={t("stats.events")} value={String(stats.totalEvents)} color="text-zinc-200" onClick={() => openModal("events")} />
        <MobileStat label={t("stats.countries")} value={String(stats.countries)} color="text-blue-400" onClick={() => openModal("countries")} />
        <MobileStat label={t("stats.airstrikes")} value={String(stats.airstrikes)} color="text-red-300" onClick={() => openModal("airstrikes")} />
        <MobileStat label={t("stats.missiles")} value={String(stats.missiles)} color="text-orange-400" onClick={() => openModal("missiles")} />
        <MobileStat label={t("stats.drones")} value={String(stats.drones)} color="text-yellow-400" onClick={() => openModal("drones")} />
        <MobileStat label={stats.recentEvents.length > 0 ? t("stats.24h") : t("stats.civilian")} value={stats.recentEvents.length > 0 ? String(stats.recentEvents.length) : String(stats.civilianImpactEvents.length)} color={stats.recentEvents.length > 0 ? "text-green-400" : "text-amber-400"} onClick={() => openModal(stats.recentEvents.length > 0 ? "24h" : "civilian")} />
      </div>

      {/* ── Desktop: collapsible accordion ── */}
      <div className="hidden sm:block">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex w-full items-center justify-between px-4 py-2 text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-zinc-600"
          aria-expanded={!collapsed}
          aria-label="Toggle situation overview"
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              {t("stats.situationOverview")}
            </span>
            {collapsed && (
              <span className="text-xs text-zinc-500">
                {t("stats.day")} {stats.daysOfConflict} ·{" "}
                <span className="text-red-400">{stats.totalKilled.toLocaleString()}+</span> {t("stats.killed").toLowerCase()} ·{" "}
                {stats.totalEvents} {t("stats.events").toLowerCase()} · {stats.countries} {t("stats.countriesText")}
              </span>
            )}
          </div>
          <svg className={`h-4 w-4 text-zinc-600 transition-transform ${collapsed ? "" : "rotate-180"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {!collapsed && (
          <div className="space-y-3 px-4 pb-3">
            <p className="text-sm leading-relaxed text-zinc-300">
              <span className="font-semibold text-zinc-100">
                {t("stats.operationEpicFury")}: {t("stats.day")} {stats.daysOfConflict}.
              </span>{" "}
              {stats.totalEvents} {t("stats.verifiedEvents")} {stats.countries} {t("stats.countriesText")}
              ({stats.topCountries.join(", ")}). {stats.airstrikes} {t("stats.airstrikesStat")},{" "}
              {stats.missiles} {t("stats.missileAttacks")}, {stats.drones} {t("stats.droneStrikes")}
              {stats.battles > 0 ? `, ${stats.battles} ${t("stats.groundEngagements")}` : ""}
              {stats.strategicDevs > 0 ? `, ${stats.strategicDevs} ${t("stats.strategicDevelopments")}` : ""}.{" "}
              {stats.totalKilled > 0
                ? `${stats.totalKilled.toLocaleString()}+ ${t("stats.fatalitiesReported")}`
                : t("stats.casualtiesBeing")}{" "}
              {stats.recentEvents.length > 0
                ? `${stats.recentEvents.length} event${stats.recentEvents.length !== 1 ? "s" : ""} ${t("stats.eventsInLast24h")}`
                : ""}
            </p>

            <div className="grid grid-cols-7 gap-2">
              <StatChip label={t("stats.killed")} value={`${(stats.totalKilled / 1000).toFixed(1)}k+`} color="text-red-400" onClick={() => openModal("killed")} />
              <StatChip label={t("stats.countries")} value={String(stats.countries)} color="text-blue-400" onClick={() => openModal("countries")} />
              <StatChip label={t("stats.airstrikes")} value={String(stats.airstrikes)} color="text-red-300" onClick={() => openModal("airstrikes")} />
              <StatChip label={t("stats.missiles")} value={String(stats.missiles)} color="text-orange-400" onClick={() => openModal("missiles")} />
              <StatChip label={t("stats.drones")} value={String(stats.drones)} color="text-yellow-400" onClick={() => openModal("drones")} />
              <StatChip label={t("stats.civilian")} value={String(stats.civilianImpactEvents.length)} color="text-amber-400" onClick={() => openModal("civilian")} />
              <StatChip label={t("stats.events")} value={String(stats.totalEvents)} color="text-zinc-300" onClick={() => openModal("events")} />
            </div>

            {stats.latestEvent && (
              <div className="flex items-start gap-2 rounded-lg bg-zinc-900/50 p-2.5">
                <span className="relative mt-0.5 flex h-2 w-2 flex-shrink-0" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-zinc-400">
                    {t("stats.latest")}:{" "}
                    <span className="capitalize text-zinc-300">
                      {stats.latestEvent.event_type.replace(/_/g, " ")}
                    </span>{" "}
                    — {stats.latestEvent.region}, {stats.latestEvent.country}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">
                    {stats.latestEvent.description}
                  </p>
                  <span className="mt-0.5 text-[10px] text-zinc-500">
                    {t("stats.source")}: {stats.latestEvent.source}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Breakdown Modal ── */}
      {activeModal && (
        <BreakdownModal
          statKey={activeModal}
          events={events}
          stats={stats}
          onClose={closeModal}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* ── Breakdown Modal                                                      ── */
/* ═══════════════════════════════════════════════════════════════════════════ */

interface StatsData {
  totalKilled: number;
  summedFatalities: number;
  reportedTotal: number;
  countries: number;
  topCountries: string[];
  daysOfConflict: number;
  missiles: number;
  airstrikes: number;
  drones: number;
  battles: number;
  strategicDevs: number;
  recentEvents: ConflictEvent[];
  totalEvents: number;
  latestEvent: ConflictEvent | undefined;
  civilianImpactEvents: ConflictEvent[];
}

interface BreakdownModalProps {
  statKey: StatKey;
  events: ConflictEvent[];
  stats: StatsData;
  onClose: () => void;
}

function BreakdownModal({ statKey, events, stats, onClose }: BreakdownModalProps) {
  const { t } = useI18n();
  const MODAL_TITLES: Record<StatKey, string> = {
    killed: t("modal.killedTitle"),
    events: t("modal.eventsTitle"),
    countries: t("modal.countriesTitle"),
    airstrikes: t("modal.airstrikesTitle"),
    missiles: t("modal.missilesTitle"),
    drones: t("modal.dronesTitle"),
    civilian: t("modal.civilianTitle"),
    "24h": t("modal.24hTitle"),
  };

  const backdropRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Focus trap — focus the panel on open
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose();
  }, [onClose]);

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={MODAL_TITLES[statKey]}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="w-full max-h-[80vh] overflow-y-auto rounded-t-2xl border border-zinc-800 bg-[#111] sm:max-w-lg sm:rounded-2xl focus:outline-none"
      >
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between border-b border-zinc-800 bg-[#111] px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-200">{MODAL_TITLES[statKey]}</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-600"
            aria-label={t("modal.close")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          {statKey === "killed" && <KilledBreakdown events={events} stats={stats} />}
          {statKey === "events" && <EventsBreakdown events={events} />}
          {statKey === "countries" && <CountriesBreakdown events={events} />}
          {statKey === "airstrikes" && <MilitaryBreakdown events={events} type="airstrike" />}
          {statKey === "missiles" && <MilitaryBreakdown events={events} type="missile_attack" />}
          {statKey === "drones" && <MilitaryBreakdown events={events} type="drone_attack" />}
          {statKey === "civilian" && <CivilianBreakdown events={events} civilianEvents={stats.civilianImpactEvents} />}
          {statKey === "24h" && <RecentBreakdown recentEvents={stats.recentEvents} />}
        </div>

        {/* Source attribution */}
        <div className="border-t border-zinc-800 px-4 py-2">
          <p className="text-[10px] text-zinc-500">
            {t("modal.dataSourced")}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Killed Breakdown ── */
function KilledBreakdown({ events, stats }: { events: ConflictEvent[]; stats: StatsData }) {
  const { t } = useI18n();
  const byCountry = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of events) {
      if (e.fatalities && e.fatalities > 0) {
        map[e.country] = (map[e.country] || 0) + e.fatalities;
      }
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [events]);

  const totalCivilian = events.filter(
    (e) => (e.event_type === "violence_against_civilians" || e.civilian_impact) && e.fatalities
  ).reduce((s, e) => s + (e.fatalities || 0), 0);

  return (
    <>
      <div className="rounded-lg bg-zinc-900/60 p-3 text-center">
        <div className="text-2xl font-bold text-red-400">{stats.totalKilled.toLocaleString()}+</div>
        <div className="text-xs text-zinc-500">{t("modal.totalReportedFatalities")}</div>
        <div className="mt-1 text-[10px] text-zinc-500">
          {stats.summedFatalities.toLocaleString()} {t("modal.individuallyAttributed")}
          {stats.reportedTotal > stats.summedFatalities && ` · ${stats.reportedTotal.toLocaleString()} ${t("modal.inAggregateReports")}`}
        </div>
      </div>

      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{t("modal.byCountry")}</h3>
      <div className="space-y-1">
        {byCountry.map(([country, count]) => (
          <div key={country} className="flex items-center justify-between rounded bg-zinc-900/40 px-3 py-2">
            <span className="text-sm text-zinc-300">{country}</span>
            <span className="text-sm font-semibold text-red-400">{count.toLocaleString()}</span>
          </div>
        ))}
      </div>

      {totalCivilian > 0 && (
        <div className="rounded-lg border border-amber-900/30 bg-amber-950/10 p-3">
          <div className="text-xs font-semibold text-amber-400">{t("modal.civilianFatalities")}</div>
          <div className="text-lg font-bold text-amber-300">{totalCivilian.toLocaleString()}</div>
          <div className="text-[10px] text-zinc-500">{t("modal.fromEvents")}</div>
        </div>
      )}

      <p className="text-[10px] text-zinc-500">
        {t("modal.dataSourced")}
      </p>
    </>
  );
}

/* ── Events Breakdown ── */
function EventsBreakdown({ events }: { events: ConflictEvent[] }) {
  const { t } = useI18n();
  const byType = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of events) map[e.event_type] = (map[e.event_type] || 0) + 1;
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [events]);

  return (
    <>
      <div className="rounded-lg bg-zinc-900/60 p-3 text-center">
        <div className="text-2xl font-bold text-zinc-200">{events.length}</div>
        <div className="text-xs text-zinc-500">{t("modal.totalVerifiedEvents")}</div>
      </div>

      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{t("modal.byType")}</h3>
      <div className="space-y-1">
        {byType.map(([type, count]) => {
          const pct = ((count / events.length) * 100).toFixed(1);
          return (
            <div key={type} className="flex items-center gap-2 rounded bg-zinc-900/40 px-3 py-2">
              <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: EVENT_COLORS[type] || "#666" }} />
              <span className="flex-1 text-sm text-zinc-300">{t(`eventTypes.${type}`) !== `eventTypes.${type}` ? t(`eventTypes.${type}`) : type.replace(/_/g, " ")}</span>
              <span className="text-xs text-zinc-500">{pct}%</span>
              <span className="min-w-[40px] text-right text-sm font-semibold text-zinc-200">{count}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ── Countries Breakdown ── */
function CountriesBreakdown({ events }: { events: ConflictEvent[] }) {
  const { t } = useI18n();
  const [sortBy, setSortBy] = useState<"events" | "fatalities">("events");

  const byCountry = useMemo(() => {
    const map: Record<string, { events: number; fatalities: number }> = {};
    for (const e of events) {
      if (!map[e.country]) map[e.country] = { events: 0, fatalities: 0 };
      map[e.country].events++;
      map[e.country].fatalities += e.fatalities || 0;
    }
    return Object.entries(map).sort((a, b) =>
      sortBy === "events" ? b[1].events - a[1].events : b[1].fatalities - a[1].fatalities
    );
  }, [events, sortBy]);

  return (
    <>
      <div className="rounded-lg bg-zinc-900/60 p-3 text-center">
        <div className="text-2xl font-bold text-blue-400">{byCountry.length}</div>
        <div className="text-xs text-zinc-500">{t("modal.countriesAffected")}</div>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setSortBy("events")} className={`rounded px-3 py-1.5 text-xs ${sortBy === "events" ? "bg-zinc-700 text-zinc-200" : "bg-zinc-900 text-zinc-500"}`} aria-pressed={sortBy === "events"}>
          {t("modal.sortByEvents")}
        </button>
        <button onClick={() => setSortBy("fatalities")} className={`rounded px-3 py-1.5 text-xs ${sortBy === "fatalities" ? "bg-zinc-700 text-zinc-200" : "bg-zinc-900 text-zinc-500"}`} aria-pressed={sortBy === "fatalities"}>
          {t("modal.sortByFatalities")}
        </button>
      </div>

      <div className="space-y-1">
        {byCountry.map(([country, data]) => (
          <div key={country} className="flex items-center justify-between rounded bg-zinc-900/40 px-3 py-2">
            <span className="text-sm text-zinc-300">{country}</span>
            <div className="flex gap-3 text-sm">
              <span className="text-zinc-400">{data.events} {t("modal.eventsLabel")}</span>
              {data.fatalities > 0 && <span className="text-red-400">{data.fatalities} {t("modal.killedLabel")}</span>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ── Military Breakdown (Airstrikes / Missiles / Drones) ── */
function MilitaryBreakdown({ events, type }: { events: ConflictEvent[]; type: string }) {
  const { t } = useI18n();
  const filtered = useMemo(
    () => events.filter((e) => e.event_type === type).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [events, type]
  );

  const label = t(`eventTypes.${type}`) !== `eventTypes.${type}` ? t(`eventTypes.${type}`) : type.replace(/_/g, " ");
  const totalFatalities = filtered.reduce((s, e) => s + (e.fatalities || 0), 0);

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-zinc-900/60 p-3 text-center">
          <div className="text-xl font-bold" style={{ color: EVENT_COLORS[type] }}>{filtered.length}</div>
          <div className="text-xs text-zinc-500">{t("modal.totalLabel")} {label}</div>
        </div>
        <div className="rounded-lg bg-zinc-900/60 p-3 text-center">
          <div className="text-xl font-bold text-red-400">{totalFatalities}</div>
          <div className="text-xs text-zinc-500">{t("modal.fatalities")}</div>
        </div>
      </div>

      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{t("modal.recent")} {label}</h3>
      <div className="space-y-1.5">
        {filtered.slice(0, 15).map((e) => (
          <div key={e.id} className="rounded bg-zinc-900/40 px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400">{e.region}, {e.country}</span>
              <span className="text-xs text-zinc-500">{new Date(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
            </div>
            <p className="mt-0.5 line-clamp-2 text-xs text-zinc-300">{e.description}</p>
            <div className="mt-0.5 flex items-center gap-2 text-[10px] text-zinc-500">
              {e.fatalities !== null && e.fatalities > 0 && <span className="text-red-400">{e.fatalities} {t("modal.killedLabel")}</span>}
              <span>{t("stats.source")}: {e.source}</span>
            </div>
          </div>
        ))}
      </div>
      {filtered.length > 15 && (
        <p className="text-center text-xs text-zinc-500">{t("modal.showing")} 15 {t("modal.of")} {filtered.length} {t("modal.eventsLabel")}</p>
      )}
    </>
  );
}

/* ── Civilian Breakdown ── */
function CivilianBreakdown({ events, civilianEvents }: { events: ConflictEvent[]; civilianEvents: ConflictEvent[] }) {
  const { t } = useI18n();
  const totalCivKilled = civilianEvents.reduce((s, e) => s + (e.fatalities || 0), 0);

  const IMPACT_KEYS: Record<string, string> = {
    displaced: "modal.displaced",
    healthcare: "modal.healthcareAffected",
    schools: "modal.schoolsEducation",
    infrastructure: "modal.infrastructureDamaged",
    aid: "modal.aidDisrupted",
  };

  const impactCategories = useMemo(() => {
    const cats: Record<string, number> = {};
    for (const e of civilianEvents) {
      if (e.civilian_impact) {
        const ci = e.civilian_impact.toLowerCase();
        if (ci.includes("displac")) cats["displaced"] = (cats["displaced"] || 0) + 1;
        if (ci.includes("hospital") || ci.includes("medical")) cats["healthcare"] = (cats["healthcare"] || 0) + 1;
        if (ci.includes("school") || ci.includes("education")) cats["schools"] = (cats["schools"] || 0) + 1;
        if (ci.includes("infrastructure")) cats["infrastructure"] = (cats["infrastructure"] || 0) + 1;
        if (ci.includes("aid") || ci.includes("humanitarian")) cats["aid"] = (cats["aid"] || 0) + 1;
      }
    }
    return Object.entries(cats).sort((a, b) => b[1] - a[1]);
  }, [civilianEvents]);

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-zinc-900/60 p-3 text-center">
          <div className="text-xl font-bold text-amber-400">{civilianEvents.length}</div>
          <div className="text-xs text-zinc-500">{t("modal.civilianImpactEvents")}</div>
        </div>
        <div className="rounded-lg bg-zinc-900/60 p-3 text-center">
          <div className="text-xl font-bold text-red-400">{totalCivKilled}</div>
          <div className="text-xs text-zinc-500">{t("modal.civilianFatalitiesLabel")}</div>
        </div>
      </div>

      {impactCategories.length > 0 && (
        <>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{t("modal.impactCategories")}</h3>
          <div className="space-y-1">
            {impactCategories.map(([cat, count]) => (
              <div key={cat} className="flex items-center justify-between rounded bg-zinc-900/40 px-3 py-2">
                <span className="text-sm text-zinc-300">{t(IMPACT_KEYS[cat] || cat)}</span>
                <span className="text-sm font-semibold text-amber-400">{count} {t("modal.eventsLabel")}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{t("modal.recentCivilianEvents")}</h3>
      <div className="space-y-1.5">
        {civilianEvents
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 10)
          .map((e) => (
          <div key={e.id} className="rounded bg-zinc-900/40 px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400">{e.region}, {e.country}</span>
              <span className="text-xs text-zinc-500">{new Date(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
            </div>
            <p className="mt-0.5 line-clamp-2 text-xs text-zinc-300">{e.description}</p>
            {e.civilian_impact && (
              <p className="mt-0.5 text-[10px] text-amber-400">{e.civilian_impact}</p>
            )}
            <span className="text-[10px] text-zinc-500">{t("stats.source")}: {e.source}</span>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-zinc-500">
        {t("modal.figuresNote")}
      </p>
    </>
  );
}

/* ── 24H Breakdown ── */
function RecentBreakdown({ recentEvents }: { recentEvents: ConflictEvent[] }) {
  const { t } = useI18n();
  const sorted = useMemo(
    () => [...recentEvents].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [recentEvents]
  );
  const totalFatalities = sorted.reduce((s, e) => s + (e.fatalities || 0), 0);

  const byType = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of sorted) map[e.event_type] = (map[e.event_type] || 0) + 1;
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [sorted]);

  if (sorted.length === 0) {
    return <p className="py-8 text-center text-sm text-zinc-500">{t("modal.noEventsIn24h")}</p>;
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-zinc-900/60 p-3 text-center">
          <div className="text-xl font-bold text-green-400">{sorted.length}</div>
          <div className="text-xs text-zinc-500">{t("modal.eventsIn24h")}</div>
        </div>
        <div className="rounded-lg bg-zinc-900/60 p-3 text-center">
          <div className="text-xl font-bold text-red-400">{totalFatalities}</div>
          <div className="text-xs text-zinc-500">{t("modal.fatalitiesIn24h")}</div>
        </div>
      </div>

      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{t("modal.byType")}</h3>
      <div className="flex flex-wrap gap-1.5">
        {byType.map(([type, count]) => (
          <span key={type} className="flex items-center gap-1 rounded-full bg-zinc-900/60 px-2.5 py-1 text-xs text-zinc-300">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: EVENT_COLORS[type] || "#666" }} />
            {t(`eventTypes.${type}`) !== `eventTypes.${type}` ? t(`eventTypes.${type}`) : type.replace(/_/g, " ")}: {count}
          </span>
        ))}
      </div>

      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{t("modal.timeline")}</h3>
      <div className="space-y-1.5">
        {sorted.map((e) => (
          <div key={e.id} className="rounded bg-zinc-900/40 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: EVENT_COLORS[e.event_type] || "#666" }} />
              <span className="flex-1 text-xs capitalize text-zinc-400">{e.event_type.replace(/_/g, " ")}</span>
              <span className="text-xs text-zinc-500">
                {new Date(e.date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </span>
            </div>
            <p className="mt-0.5 line-clamp-2 pl-4 text-xs text-zinc-300">{e.description}</p>
            <div className="mt-0.5 flex items-center gap-2 pl-4 text-[10px] text-zinc-500">
              <span>{e.region}, {e.country}</span>
              {e.fatalities !== null && e.fatalities > 0 && <span className="text-red-400">{e.fatalities} {t("modal.killedLabel")}</span>}
              <span>{t("stats.source")}: {e.source}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* ── Sub-components                                                       ── */
/* ═══════════════════════════════════════════════════════════════════════════ */

/* ── Mobile stat cell (grid, tappable) ── */
function MobileStat({
  label,
  value,
  color,
  onClick,
}: {
  label: string;
  value: string;
  color: string;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`flex flex-col items-center border-b border-r border-zinc-800/50 px-1 py-1.5 last:border-r-0 [&:nth-child(4)]:border-r-0 ${
        onClick ? "cursor-pointer active:bg-zinc-800/50 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-zinc-600" : ""
      }`}
      {...(onClick ? { "aria-label": `${label}: ${value}. Tap for details` } : {})}
    >
      <span className={`text-xs font-bold leading-tight ${color}`}>{value}</span>
      <span className="text-[8px] font-medium uppercase tracking-wider text-zinc-600">{label}</span>
    </Tag>
  );
}

/* ── Desktop stat chip (tappable) ── */
function StatChip({
  label,
  value,
  color,
  onClick,
}: {
  label: string;
  value: string;
  color: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-md bg-zinc-900/60 px-2 py-1.5 text-center transition-colors hover:bg-zinc-800/80 active:bg-zinc-700/60 focus:outline-none focus:ring-2 focus:ring-zinc-600 cursor-pointer"
      aria-label={`${label}: ${value}. Click for details`}
    >
      <div className={`text-sm font-bold ${color}`}>{value}</div>
      <div className="text-[10px] text-zinc-500">{label}</div>
    </button>
  );
}
