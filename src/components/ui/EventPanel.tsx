"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import type { ConflictEvent } from "@/types";
import { EVENT_COLORS } from "@/lib/constants";
import { shareEvent } from "@/lib/share";
import { useI18n } from "@/i18n";

interface EventPanelProps {
  events: ConflictEvent[];
  selectedEvent: ConflictEvent | null;
  onSelectEvent: (event: ConflictEvent | null) => void;
  isOpen: boolean;
  onToggle: () => void;
  onBack?: () => void;
}

export default function EventPanel({
  events,
  selectedEvent,
  onSelectEvent,
  isOpen,
  onToggle,
  onBack,
}: EventPanelProps) {
  const { t } = useI18n();
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // Scroll event list to top when an event is selected (especially on mobile)
  useEffect(() => {
    if (selectedEvent && listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [selectedEvent]);

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
      {/* Panel */}
      <div
        className="flex h-full w-full flex-col border-l border-zinc-800 bg-[#0e0e0e]/95 backdrop-blur-md md:w-[380px]"
      >
        {/* Header */}
        <div className="border-b border-zinc-800 p-4">
          {onBack && (
            <button
              onClick={onBack}
              className="mb-2 flex items-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-zinc-200 md:hidden"
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 011.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
              </svg>
              {t("eventPanel.backToMap")}
            </button>
          )}
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
            {t("eventPanel.eventFeed")}
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            {sortedEvents.length}{activeFilter || searchQuery ? ` of ${events.length}` : ""} {t("header.events")} • {t("eventPanel.latestFirst")}
          </p>
        </div>

        {/* Search */}
        <div className="border-b border-zinc-800 px-3 py-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("eventPanel.searchEvents")}
            aria-label="Search events by description, country, or type"
            className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:border-zinc-600 focus:ring-2 focus:ring-zinc-500"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-1.5 border-b border-zinc-800 p-3">
          <FilterChip
            label={t("eventPanel.all")}
            active={activeFilter === null}
            count={events.length}
            onClick={() => setActiveFilter(null)}
          />
          {Object.entries(countByType(events)).map(([type, count]) => (
            <FilterChip
              key={type}
              label={t(`eventTypes.${type}`)}
              count={count}
              color={EVENT_COLORS[type]}
              active={activeFilter === type}
              onClick={() => setActiveFilter(activeFilter === type ? null : type)}
            />
          ))}
        </div>

        {/* Event List */}
        <div ref={listRef} className="flex-1 overflow-y-auto">
          {sortedEvents.map((event) => (
            <div
              key={event.id}
              onClick={() => onSelectEvent(event)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectEvent(event); } }}
              role="button"
              tabIndex={0}
              aria-label={`${t(`eventTypes.${event.event_type}`)}: ${event.description.slice(0, 80)}`}
              className={`w-full cursor-pointer select-text border-b border-zinc-800/50 p-3 text-left transition-colors hover:bg-zinc-800/50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-zinc-500 ${
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
                      {t(`eventTypes.${event.event_type}`)}
                    </span>
                    <span className="flex-shrink-0 text-xs text-zinc-500">
                      {formatRelativeDate(event.date, t)}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-zinc-400">
                    {event.description}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                    <span>
                      {event.region}, {event.country}
                    </span>
                    {event.fatalities !== null && event.fatalities > 0 && (
                      <span className="text-red-500">
                        {event.fatalities} {t("eventPanel.killed")}
                      </span>
                    )}
                    {event.verification_status && (
                      <VerificationBadge status={event.verification_status} />
                    )}
                    {event.location_precision === "country" && (
                      <span className="text-zinc-500 italic">{t("eventPanel.approximateLocation")}</span>
                    )}
                  </div>
                  {event.civilian_impact && (
                    <div className="mt-1 flex items-center gap-1 text-xs text-amber-400">
                      <span aria-hidden="true">&#9888;</span>
                      <span>{event.civilian_impact}</span>
                    </div>
                  )}
                  <ProvenanceRow event={event} />
                  <ShareButton event={event} />
                </div>
              </div>
            </div>
          ))}

          {sortedEvents.length === 0 && (
            <div className="p-8 text-center text-sm text-zinc-500">
              {t("eventPanel.noEvents")}
            </div>
          )}
        </div>

        {/* Stats footer */}
        <div className="border-t border-zinc-800 p-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <StatBox
              label={t("header.events")}
              value={events.length.toString()}
              color="text-zinc-200"
            />
            <StatBox
              label={t("stats.countriesText")}
              value={new Set(events.map((e) => e.country)).size.toString()}
              color="text-blue-400"
            />
            <StatBox
              label={t("eventPanel.fatalities")}
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
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors ${
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
      <span className="text-zinc-500">{count}</span>
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
      <div className="text-xs text-zinc-500">{label}</div>
    </div>
  );
}

function VerificationBadge({
  status,
}: {
  status: "confirmed" | "reported" | "claimed" | "disputed" | "unconfirmed";
}) {
  const { t } = useI18n();
  const config = {
    confirmed: { color: "bg-green-500", label: t("eventPanel.confirmed") },
    reported: { color: "bg-blue-500", label: t("eventPanel.reported") },
    claimed: { color: "bg-amber-500", label: t("eventPanel.claimed") },
    disputed: { color: "bg-red-500", label: t("eventPanel.disputed") },
    unconfirmed: { color: "bg-zinc-500", label: t("eventPanel.unconfirmed") },
  };

  const { color, label } = config[status];

  return (
    <span className="inline-flex items-center gap-1" title={label}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${color}`} />
      {(status === "disputed" || status === "unconfirmed") && (
        <span className="text-zinc-500">{label}</span>
      )}
    </span>
  );
}

function ProvenanceRow({ event }: { event: ConflictEvent }) {
  const { t } = useI18n();
  const parts: React.ReactNode[] = [];

  if (typeof event.confidence === "number") {
    parts.push(
      <span key="conf">{Math.round(event.confidence * 100)}% {t("eventPanel.confidence")}</span>
    );
  }

  if (event.source) {
    parts.push(
      event.source_url ? (
        <a
          key="src"
          href={event.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-zinc-600 hover:text-zinc-300"
          onClick={(e) => e.stopPropagation()}
        >
          {event.source}
        </a>
      ) : (
        <span key="src">{event.source}</span>
      )
    );
  }

  if (
    event.location_precision === "region" ||
    event.location_precision === "country"
  ) {
    parts.push(
      <span key="prec" className="italic">
        ~{event.location_precision}
      </span>
    );
  }

  if (parts.length === 0) return null;

  return (
    <div className="mt-1 text-xs text-zinc-500">
      {parts.reduce<React.ReactNode[]>((acc, part, i) => {
        if (i > 0) acc.push(<span key={`dot-${i}`}> · </span>);
        acc.push(part);
        return acc;
      }, [])}
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

function formatRelativeDate(iso: string, t: (key: string, params?: Record<string, string | number>) => string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMin = Math.floor((now - then) / 60000);
  const diffH = Math.floor((now - then) / 3600000);
  if (diffMin < 1) return t("time.justNow");
  if (diffH < 1) return t("time.minutesAgo", { n: diffMin });
  if (diffH < 24) return t("time.hoursAgo", { n: diffH });
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return t("time.yesterday");
  if (diffD < 7) return t("time.daysAgo", { n: diffD });
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

function ShareButton({ event }: { event: ConflictEvent }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await shareEvent(event);
        if (!navigator.share) {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }
      } catch {
        // User cancelled share dialog
      }
    },
    [event]
  );

  return (
    <button
      onClick={handleShare}
      className="mt-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-400"
      title={t("map.shareEvent")}
    >
      <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" className="shrink-0">
        <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" />
      </svg>
      {copied ? t("eventPanel.copied") : t("eventPanel.share")}
    </button>
  );
}
