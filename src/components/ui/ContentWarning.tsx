"use client";

import { useEffect, useMemo, useState } from "react";
import type { ConflictEvent } from "@/types";

type VisitState = "first-visit" | "return-visit" | "dismissed";

interface ContentWarningProps {
  events: ConflictEvent[];
  onDismiss: () => void;
}

const LAST_VISIT_KEY = "warlibrary_last_visit";
const SKIP_BRIEFING_KEY = "warlibrary_skip_briefing";
const CONFLICT_START = "2026-02-28";

export default function ContentWarning({
  events,
  onDismiss,
}: ContentWarningProps) {
  const [visitState, setVisitState] = useState<VisitState | null>(null);
  const [lastVisit, setLastVisit] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(LAST_VISIT_KEY);
    const skipBriefing = localStorage.getItem(SKIP_BRIEFING_KEY) === "true";

    if (!stored) {
      setVisitState("first-visit");
    } else if (skipBriefing) {
      handleDismiss();
    } else {
      setLastVisit(stored);
      setVisitState("return-visit");
    }
  }, []);

  const newEvents = useMemo(() => {
    if (!lastVisit || !events?.length) return [];
    return events
      .filter((e) => e.date > lastVisit || e.created_at > lastVisit)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [events, lastVisit]);

  const briefingBullets = useMemo(() => {
    if (newEvents.length === 0) return [];
    const bullets: string[] = [];
    const byType: Record<string, number> = {};
    const byCountry: Record<string, number> = {};
    let newFatalities = 0;

    for (const e of newEvents) {
      byType[e.event_type] = (byType[e.event_type] || 0) + 1;
      byCountry[e.country] = (byCountry[e.country] || 0) + 1;
      if (e.fatalities) newFatalities += e.fatalities;
    }

    // Top event types
    const topTypes = Object.entries(byType)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    for (const [type, count] of topTypes) {
      const label = type.replace(/_/g, " ");
      const countries = Object.entries(byCountry)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([c]) => c)
        .join(" and ");
      bullets.push(`${count} new ${label}${count > 1 ? "s" : ""} reported in ${countries}`);
    }

    if (newFatalities > 0) {
      bullets.push(`${newFatalities.toLocaleString()} additional fatalities reported`);
    }

    // Most significant single event
    const topEvent = newEvents.reduce((best, e) =>
      (e.fatalities || 0) > (best.fatalities || 0) ? e : best
    );
    if (topEvent.fatalities && topEvent.fatalities > 10) {
      bullets.push(topEvent.description);
    }

    return bullets.slice(0, 5);
  }, [newEvents]);

  // Auto-forward if no new events on return visit
  useEffect(() => {
    if (visitState === "return-visit" && newEvents.length === 0) {
      const timer = setTimeout(handleDismiss, 2000);
      return () => clearTimeout(timer);
    }
  }, [visitState, newEvents.length]);

  function handleDismiss() {
    localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString());
    setVisitState("dismissed");
    onDismiss();
  }

  function handleToggleSkip() {
    const current = localStorage.getItem(SKIP_BRIEFING_KEY) === "true";
    localStorage.setItem(SKIP_BRIEFING_KEY, String(!current));
  }

  const safeEvents = events ?? [];
  const totalKilled = safeEvents.reduce((sum, e) => sum + (e.fatalities || 0), 0);
  const countries = new Set(safeEvents.map((e) => e.country)).size;
  const startDate = new Date(CONFLICT_START);
  const daysOfConflict = Math.ceil(
    (Date.now() - startDate.getTime()) / 86400000
  );

  if (visitState === "dismissed" || visitState === null) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4">
      <div className="w-full max-w-lg">
        {visitState === "first-visit" ? (
          <FirstVisit
            totalKilled={totalKilled}
            countries={countries}
            daysOfConflict={daysOfConflict}
            eventCount={events.length}
            onEnter={handleDismiss}
          />
        ) : (
          <ReturnVisit
            lastVisit={lastVisit!}
            newEventCount={newEvents.length}
            bullets={briefingBullets}
            totalKilled={totalKilled}
            countries={countries}
            daysOfConflict={daysOfConflict}
            onContinue={handleDismiss}
            onToggleSkip={handleToggleSkip}
          />
        )}
      </div>
    </div>
  );
}

function StatsBar({
  totalKilled,
  countries,
  daysOfConflict,
}: {
  totalKilled: number;
  countries: number;
  daysOfConflict: number;
}) {
  return (
    <div className="grid grid-cols-3 gap-3 rounded-lg bg-zinc-900/80 p-3">
      <div className="text-center">
        <div className="text-lg font-bold text-red-400">
          {totalKilled.toLocaleString()}+
        </div>
        <div className="text-xs text-zinc-500">Killed</div>
      </div>
      <div className="text-center">
        <div className="text-lg font-bold text-blue-400">{countries}</div>
        <div className="text-xs text-zinc-500">Countries</div>
      </div>
      <div className="text-center">
        <div className="text-lg font-bold text-zinc-200">{daysOfConflict}</div>
        <div className="text-xs text-zinc-500">Days</div>
      </div>
    </div>
  );
}

function FirstVisit({
  totalKilled,
  countries,
  daysOfConflict,
  eventCount,
  onEnter,
}: {
  totalKilled: number;
  countries: number;
  daysOfConflict: number;
  eventCount: number;
  onEnter: () => void;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-zinc-800 bg-[#111] p-4 sm:space-y-5 sm:p-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
          WAR LIBRARY
        </h1>
        <p className="mt-1 text-sm font-medium text-red-400/80">
          2026 Iran War — Live Conflict Tracker
        </p>
      </div>

      <p className="text-center text-sm leading-relaxed text-zinc-400">
        A real-time, interactive map of the 2026 US-Israel war on Iran
        (Operation Epic Fury). Every airstrike, missile launch, and
        development — sourced, verified, and plotted on a live map
        with an AI analyst you can ask questions.
      </p>

      <StatsBar
        totalKilled={totalKilled}
        countries={countries}
        daysOfConflict={daysOfConflict}
      />

      <div className="rounded-lg border border-amber-900/40 bg-amber-950/20 p-3">
        <p className="text-xs leading-relaxed text-amber-200/70">
          <span className="font-semibold">Content Warning:</span> This
          application contains real-time reports of armed conflict, including
          military strikes, civilian casualties, and displacement. All data is
          sourced from verified reporting.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-1.5 text-center text-xs text-zinc-500 sm:gap-2">
        <div className="rounded bg-zinc-900/60 px-1.5 py-2 sm:p-2">
          <div className="font-medium text-zinc-300">Map</div>
          <div className="hidden sm:block">Every event plotted with details</div>
        </div>
        <div className="rounded bg-zinc-900/60 px-1.5 py-2 sm:p-2">
          <div className="font-medium text-zinc-300">Ask AI</div>
          <div className="hidden sm:block">Question the data directly</div>
        </div>
        <div className="rounded bg-zinc-900/60 px-1.5 py-2 sm:p-2">
          <div className="font-medium text-zinc-300">Feed</div>
          <div className="hidden sm:block">Chronological event timeline</div>
        </div>
      </div>

      <button
        onClick={onEnter}
        className="w-full rounded-lg bg-zinc-100 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-white"
      >
        Enter War Library
      </button>

      <div className="text-center text-[11px] leading-relaxed text-zinc-600 sm:text-xs">
        <span className="font-medium">{eventCount} verified events</span> from{" "}
        <span className="font-medium">
          Al Jazeera, CNN, BBC, Reuters, AP
        </span>{" "}
        and more
      </div>
    </div>
  );
}

function ReturnVisit({
  lastVisit,
  newEventCount,
  bullets,
  totalKilled,
  countries,
  daysOfConflict,
  onContinue,
  onToggleSkip,
}: {
  lastVisit: string;
  newEventCount: number;
  bullets: string[];
  totalKilled: number;
  countries: number;
  daysOfConflict: number;
  onContinue: () => void;
  onToggleSkip: () => void;
}) {
  const lastDate = new Date(lastVisit);
  const timeAgo = formatTimeAgo(lastDate);

  if (newEventCount === 0) {
    return (
      <div className="space-y-4 rounded-xl border border-zinc-800 bg-[#111] p-6 text-center">
        <h2 className="text-lg font-bold text-zinc-200">Welcome back</h2>
        <p className="text-sm text-zinc-500">
          No new events reported since your last visit ({timeAgo}).
        </p>
        <p className="text-xs text-zinc-600">Continuing to library...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-zinc-800 bg-[#111] p-6">
      <div>
        <h2 className="text-lg font-bold text-zinc-200">Since your last visit</h2>
        <p className="text-xs text-zinc-500">
          Last checked: {lastDate.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })} ({timeAgo})
        </p>
      </div>

      <div className="rounded-lg bg-zinc-900/60 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          {newEventCount} new event{newEventCount !== 1 ? "s" : ""}
        </div>
        <ul className="space-y-1.5">
          {bullets.map((bullet, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-sm text-zinc-300"
            >
              <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-500" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      </div>

      <StatsBar
        totalKilled={totalKilled}
        countries={countries}
        daysOfConflict={daysOfConflict}
      />

      <button
        onClick={onContinue}
        className="w-full rounded-lg bg-zinc-100 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-white"
      >
        Continue to Library
      </button>

      <label className="flex cursor-pointer items-center justify-center gap-2 text-xs text-zinc-600">
        <input
          type="checkbox"
          onChange={onToggleSkip}
          className="rounded accent-zinc-600"
        />
        Skip briefing on return visits
      </label>
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
}
