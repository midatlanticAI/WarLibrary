"use client";

import { useEffect, useMemo, useState } from "react";
import type { ConflictEvent } from "@/types";

const CONFLICT_START = "2026-02-28";

interface OverviewBannerProps {
  events: ConflictEvent[];
}

export default function OverviewBanner({ events }: OverviewBannerProps) {
  // Start collapsed on mobile to maximize map space
  const [collapsed, setCollapsed] = useState(true);
  useEffect(() => {
    if (window.innerWidth >= 640) setCollapsed(false);
  }, []);

  const stats = useMemo(() => {
    // Sum individual event fatalities
    const summedFatalities = events.reduce(
      (sum, e) => sum + (e.fatalities || 0),
      0
    );

    // Also check for cumulative death toll reports in event descriptions
    // These are more accurate than summing individual events
    let reportedTotal = 0;
    for (const e of events) {
      const desc = (e.description || "").toLowerCase();
      // Match patterns like "death toll exceeds 1,300" or "1,332 killed" or "toll reaches 555"
      const tollMatch = desc.match(/(?:death toll|toll|casualties).*?(\d[\d,]+)\s*(?:killed|dead|people)/i)
        || desc.match(/(?:death toll|toll).*?(?:reaches|exceeds|surpasses|passes|tops)\s*(\d[\d,]+)/i)
        || (e.description || "").match(/(\d[\d,]+)\+?\s*(?:fatalities|killed|dead)\s*(?:reported|confirmed)/i);
      if (tollMatch) {
        const num = parseInt(tollMatch[1].replace(/,/g, ""), 10);
        if (num > reportedTotal) reportedTotal = num;
      }
    }

    // Use the higher of: summed individual fatalities vs reported cumulative total
    const totalKilled = Math.max(summedFatalities, reportedTotal);
    const countries = new Set(events.map((e) => e.country)).size;
    const countryList = [...new Set(events.map((e) => e.country))];
    const startDate = new Date(CONFLICT_START);
    const daysOfConflict = Math.ceil(
      (Date.now() - startDate.getTime()) / 86400000
    );
    const missiles = events.filter(
      (e) => e.event_type === "missile_attack"
    ).length;
    const airstrikes = events.filter(
      (e) => e.event_type === "airstrike"
    ).length;
    const drones = events.filter(
      (e) => e.event_type === "drone_attack"
    ).length;
    const battles = events.filter(
      (e) => e.event_type === "battle"
    ).length;
    const strategicDevs = events.filter(
      (e) => e.event_type === "strategic_development"
    ).length;

    // Count events in last 24h
    const now = Date.now();
    const recentEvents = events.filter(
      (e) => now - new Date(e.date).getTime() < 86400000
    ).length;

    // Top 3 most-affected countries by event count
    const byCountry: Record<string, number> = {};
    for (const e of events) {
      byCountry[e.country] = (byCountry[e.country] || 0) + 1;
    }
    const topCountries = Object.entries(byCountry)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([c]) => c);

    const latestEvent = [...events].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )[0];

    const civilianImpactEvents = events.filter(
      (e) =>
        e.event_type === "violence_against_civilians" ||
        (e.civilian_impact && e.civilian_impact.length > 0)
    ).length;

    return {
      totalKilled,
      countries,
      countryList,
      topCountries,
      daysOfConflict,
      missiles,
      airstrikes,
      drones,
      battles,
      strategicDevs,
      recentEvents,
      totalEvents: events.length,
      latestEvent,
      civilianImpactEvents,
    };
  }, [events]);

  return (
    <div className="border-b border-zinc-800 bg-[#0e0e0e]">
      {/* Collapsible toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between px-4 py-2 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Situation Overview
          </span>
          {collapsed && (
            <span className="text-xs text-zinc-600">
              Day {stats.daysOfConflict} ·{" "}
              <span className="text-red-400">{stats.totalKilled.toLocaleString()}+</span> killed ·{" "}
              {stats.totalEvents} events · {stats.countries} countries
            </span>
          )}
        </div>
        <svg
          className={`h-4 w-4 text-zinc-600 transition-transform ${
            collapsed ? "" : "rotate-180"
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {!collapsed && (
        <div className="space-y-2 px-4 pb-3 sm:space-y-3">
          {/* Summary text — hidden on mobile for space, shown on sm+ */}
          <p className="hidden text-sm leading-relaxed text-zinc-300 sm:block">
            <span className="font-semibold text-zinc-100">
              Operation Epic Fury: Day {stats.daysOfConflict}.
            </span>{" "}
            {stats.totalEvents} verified events across {stats.countries} countries
            ({stats.topCountries.join(", ")}). {stats.airstrikes} airstrikes,{" "}
            {stats.missiles} missile attacks, {stats.drones} drone strikes
            {stats.battles > 0 ? `, ${stats.battles} ground engagements` : ""}
            {stats.strategicDevs > 0 ? `, ${stats.strategicDevs} strategic developments` : ""}.{" "}
            {stats.totalKilled > 0
              ? `${stats.totalKilled.toLocaleString()}+ fatalities reported.`
              : "Casualty figures being compiled."}{" "}
            {stats.recentEvents > 0
              ? `${stats.recentEvents} event${stats.recentEvents !== 1 ? "s" : ""} in the last 24 hours.`
              : ""}
          </p>

          {/* Stats grid */}
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7 sm:gap-2">
            <StatChip label="Killed" value={`${(stats.totalKilled / 1000).toFixed(1)}k+`} color="text-red-400" />
            <StatChip label="Countries" value={String(stats.countries)} color="text-blue-400" />
            <StatChip label="Airstrikes" value={String(stats.airstrikes)} color="text-red-300" />
            <StatChip label="Missiles" value={String(stats.missiles)} color="text-orange-400" />
            <StatChip label="Drones" value={String(stats.drones)} color="text-yellow-400" className="hidden sm:block" />
            <StatChip label="Civilian" value={String(stats.civilianImpactEvents)} color="text-amber-400" className="hidden sm:block" />
            <StatChip label="Events" value={String(stats.totalEvents)} color="text-zinc-300" className="hidden sm:block" />
          </div>

          {/* Latest event — compact on mobile */}
          {stats.latestEvent && (
            <div className="flex items-start gap-2 rounded-lg bg-zinc-900/50 p-2 sm:p-2.5">
              <span className="relative mt-0.5 flex h-2 w-2 flex-shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </span>
              <div className="min-w-0">
                <div className="text-xs font-medium text-zinc-400">
                  Latest:{" "}
                  <span className="capitalize text-zinc-300">
                    {stats.latestEvent.event_type.replace(/_/g, " ")}
                  </span>{" "}
                  — {stats.latestEvent.region}, {stats.latestEvent.country}
                </div>
                <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500 sm:line-clamp-2">
                  {stats.latestEvent.description}
                </p>
                <span className="mt-0.5 hidden text-[10px] text-zinc-600 sm:inline-block">
                  Source: {stats.latestEvent.source}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatChip({
  label,
  value,
  color,
  className,
}: {
  label: string;
  value: string;
  color: string;
  className?: string;
}) {
  return (
    <div className={`rounded-md bg-zinc-900/60 px-1.5 py-1.5 text-center sm:px-2 ${className ?? ""}`}>
      <div className={`text-xs font-bold sm:text-sm ${color}`}>{value}</div>
      <div className="text-[10px] text-zinc-600">{label}</div>
    </div>
  );
}
