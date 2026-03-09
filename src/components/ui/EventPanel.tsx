"use client";

import { useState } from "react";
import type { ConflictEvent } from "@/types";

const EVENT_COLORS: Record<string, string> = {
  airstrike: "#ef4444",
  missile_attack: "#f97316",
  drone_attack: "#eab308",
  battle: "#dc2626",
  explosion: "#f59e0b",
  violence_against_civilians: "#a855f7",
  strategic_development: "#3b82f6",
  protest: "#22c55e",
};

interface EventPanelProps {
  events: ConflictEvent[];
  selectedEvent: ConflictEvent | null;
  onSelectEvent: (event: ConflictEvent | null) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export default function EventPanel({
  events,
  selectedEvent,
  onSelectEvent,
  isOpen,
  onToggle,
}: EventPanelProps) {
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = events.filter((e) => {
    if (activeFilter && e.event_type !== activeFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        e.description.toLowerCase().includes(q) ||
        e.country.toLowerCase().includes(q) ||
        e.region.toLowerCase().includes(q) ||
        e.event_type.replace(/_/g, " ").toLowerCase().includes(q) ||
        (e.actors && e.actors.some((a) => a.toLowerCase().includes(q)))
      );
    }
    return true;
  });

  const sortedEvents = [...filtered].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <>
      {/* Mobile toggle button */}
      <button
        onClick={onToggle}
        className="fixed right-3 top-3 z-30 rounded-lg bg-black/80 p-2 text-zinc-300 backdrop-blur-sm md:hidden"
        aria-label="Toggle event panel"
      >
        {isOpen ? (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 10.5a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10z" />
          </svg>
        )}
      </button>

      {/* Panel */}
      <div
        className={`fixed right-0 top-0 z-20 flex h-full w-full flex-col border-l border-zinc-800 bg-[#0e0e0e]/95 backdrop-blur-md transition-transform duration-300 md:relative md:w-[380px] md:translate-x-0 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="border-b border-zinc-800 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
            Event Feed
          </h2>
          <p className="mt-1 text-xs text-zinc-600">
            {sortedEvents.length}{activeFilter || searchQuery ? ` of ${events.length}` : ""} events • latest first
          </p>
        </div>

        {/* Search */}
        <div className="border-b border-zinc-800 px-3 py-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search events..."
            className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-600"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-1.5 border-b border-zinc-800 p-3">
          <FilterChip
            label="All"
            active={activeFilter === null}
            count={events.length}
            onClick={() => setActiveFilter(null)}
          />
          {Object.entries(countByType(events)).map(([type, count]) => (
            <FilterChip
              key={type}
              label={type.replace(/_/g, " ")}
              count={count}
              color={EVENT_COLORS[type]}
              active={activeFilter === type}
              onClick={() => setActiveFilter(activeFilter === type ? null : type)}
            />
          ))}
        </div>

        {/* Event List */}
        <div className="flex-1 overflow-y-auto">
          {sortedEvents.map((event) => (
            <button
              key={event.id}
              onClick={() => onSelectEvent(event)}
              className={`w-full border-b border-zinc-800/50 p-3 text-left transition-colors hover:bg-zinc-800/50 ${
                selectedEvent?.id === event.id ? "bg-zinc-800/70" : ""
              }`}
            >
              <div className="flex items-start gap-2">
                <span
                  className="mt-1.5 inline-block h-2 w-2 flex-shrink-0 rounded-full"
                  style={{
                    backgroundColor:
                      EVENT_COLORS[event.event_type] || "#ef4444",
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium capitalize text-zinc-300">
                      {event.event_type.replace(/_/g, " ")}
                    </span>
                    <span className="flex-shrink-0 text-xs text-zinc-600">
                      {formatRelativeDate(event.date)}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-zinc-400">
                    {event.description}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-zinc-600">
                    <span>
                      {event.region}, {event.country}
                    </span>
                    {event.fatalities !== null && event.fatalities > 0 && (
                      <span className="text-red-500">
                        {event.fatalities} killed
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))}

          {sortedEvents.length === 0 && (
            <div className="p-8 text-center text-sm text-zinc-600">
              No events in selected range
            </div>
          )}
        </div>

        {/* Stats footer */}
        <div className="border-t border-zinc-800 p-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <StatBox
              label="Events"
              value={events.length.toString()}
              color="text-zinc-200"
            />
            <StatBox
              label="Countries"
              value={new Set(events.map((e) => e.country)).size.toString()}
              color="text-blue-400"
            />
            <StatBox
              label="Fatalities"
              value={formatNumber(
                events.reduce((sum, e) => sum + (e.fatalities || 0), 0)
              )}
              color="text-red-400"
            />
          </div>
        </div>
      </div>
    </>
  );
}

function FilterChip({
  label,
  count,
  color,
  active,
  onClick,
}: {
  label: string;
  count: number;
  color?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-colors ${
        active
          ? "bg-zinc-700 text-zinc-200"
          : "bg-zinc-900 text-zinc-500 hover:bg-zinc-800"
      }`}
    >
      {color && (
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
      <span className="capitalize">{label}</span>
      <span className="text-zinc-600">{count}</span>
    </button>
  );
}

function StatBox({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-xs text-zinc-600">{label}</div>
    </div>
  );
}

function countByType(events: ConflictEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of events) {
    counts[e.event_type] = (counts[e.event_type] || 0) + 1;
  }
  return counts;
}

function formatRelativeDate(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffH = Math.floor((now - then) / 3600000);
  if (diffH < 1) return "just now";
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "yesterday";
  if (diffD < 7) return `${diffD}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}
