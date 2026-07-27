"use client";

import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import type { ConflictEvent } from "@/types";
import { EVENT_COLORS } from "@/lib/constants";
import { shareEvent } from "@/lib/share";
import { useI18n, type Locale } from "@/i18n";

// --- Feed tuning -----------------------------------------------------------
// The live dataset is ~25k events, so the list is windowed: only the rows in
// or near the viewport are mounted, with spacer <li>s holding the scrollbar
// geometry. Rows are variable height (2-line description clamp, optional
// civilian-impact and provenance lines), so this is an estimate rather than a
// measurement — the overscan buffer absorbs the drift while scrolling.
//
// The estimate must track the *typical* row, not the shortest one. Every time
// the window's first index changes, each mounted row's offset shifts by
// (estimate - actual height); when the estimate is far below reality that shows
// up as the content visibly jumping on every window boundary — roughly once per
// `estimate` pixels of scrolling. Measuring the rendered rows and feeding the
// average back in keeps that delta near zero.
//
// The seed value is the measured minimum row against the live dataset: 1px
// border + 12px top padding + 16px header + 41px two-line clamped description +
// 20px meta line + 12px bottom padding + 20px provenance + 26px share control.
// Rows carrying civilian impact (about 40% of them) are taller, which is what
// the runtime measurement corrects for.
const ESTIMATED_ROW_HEIGHT = 148;
const OVERSCAN_ROWS = 8;
// Used until the container is measured (and in test/SSR environments where
// clientHeight is 0) — deliberately tall so no row is missing on first paint.
const FALLBACK_VIEWPORT_HEIGHT = 900;
// Typing re-filters at most once per this interval instead of per keystroke.
const SEARCH_DEBOUNCE_MS = 200;
// Below this many events a filter pass is cheap, so the debounce would only
// add latency — the query is applied immediately instead.
const SEARCH_DEBOUNCE_MIN_EVENTS = 500;

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
  // `onToggle` stays part of the public props API (the parent owns the panel's
  // open/close state), but this panel renders no toggle control of its own, so
  // it is intentionally not destructured here.
  onBack,
}: EventPanelProps) {
  const { t } = useI18n();
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  // Derived, debounced copy of the query — the input itself stays controlled
  // by `searchQuery` so typing never feels laggy.
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(FALLBACK_VIEWPORT_HEIGHT);
  const listRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<HTMLUListElement>(null);
  const rafRef = useRef<number | null>(null);
  const [measuredRowHeight, setMeasuredRowHeight] = useState(
    ESTIMATED_ROW_HEIGHT
  );

  // Scroll event list to top when an event is selected (especially on mobile)
  useEffect(() => {
    if (selectedEvent && listRef.current) {
      listRef.current.scrollTop = 0;
      setScrollTop(0);
    }
  }, [selectedEvent]);

  // Debounce the *filtering*, not the typed value
  useEffect(() => {
    if (events.length < SEARCH_DEBOUNCE_MIN_EVENTS) {
      setDebouncedQuery(searchQuery);
      return;
    }
    const timer = window.setTimeout(
      () => setDebouncedQuery(searchQuery),
      SEARCH_DEBOUNCE_MS
    );
    return () => window.clearTimeout(timer);
  }, [searchQuery, events.length]);

  // Track the scroll container's height so the window stays correct across
  // resizes / orientation changes. A collapsed panel is not worth observing.
  useEffect(() => {
    const el = listRef.current;
    if (!el || !isOpen) return;
    const measure = () =>
      setViewportHeight(el.clientHeight || FALLBACK_VIEWPORT_HEIGHT);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [isOpen]);

  // Correct the row-height estimate from what actually rendered.
  //
  // Row height varies with content (the description clamps to two lines, but
  // civilian impact and provenance lines are optional), and a fixed estimate
  // that is wrong in either direction makes the content shift by
  // (estimate - actual) every time the window's first index changes. Averaging
  // the mounted rows drives that delta toward zero within a frame of scrolling.
  useEffect(() => {
    const el = rowsRef.current;
    if (!el) return;
    const rows = el.querySelectorAll<HTMLElement>("[data-event-row]");
    if (rows.length === 0) return;
    let total = 0;
    for (const row of rows) total += row.offsetHeight;
    const average = total / rows.length;
    if (!Number.isFinite(average) || average <= 0) return;
    // Ignore sub-pixel churn; only react to a real shift.
    setMeasuredRowHeight((prev) =>
      Math.abs(prev - average) > 2 ? Math.round(average) : prev
    );
  });

  // Scroll events fire far faster than we need to re-window; coalesce to one
  // state update per animation frame.
  const handleScroll = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (listRef.current) setScrollTop(listRef.current.scrollTop);
    });
  }, []);

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  const filtered = useMemo(
    () =>
      events.filter((e) => {
        if (activeFilter && e.event_type !== activeFilter) return false;
        if (debouncedQuery) {
          const q = debouncedQuery.toLowerCase();
          return (
            e.description.toLowerCase().includes(q) ||
            e.country.toLowerCase().includes(q) ||
            e.region.toLowerCase().includes(q) ||
            e.event_type.replace(/_/g, " ").toLowerCase().includes(q) ||
            (e.actors && e.actors.some((a) => a.toLowerCase().includes(q)))
          );
        }
        return true;
      }),
    [events, activeFilter, debouncedQuery]
  );

  // Decorate-sort-undecorate: each ISO date is parsed once, then the
  // comparator only ever compares numbers.
  const sortedEvents = useMemo(() => {
    const decorated = filtered.map((event) => ({
      event,
      time: new Date(event.date).getTime(),
    }));
    decorated.sort((a, b) => b.time - a.time);
    return decorated.map((d) => d.event);
  }, [filtered]);

  // Header/footer aggregates walk every event, so they are memoized too —
  // otherwise each keystroke would re-scan the whole dataset three times.
  const typeCounts = useMemo(() => countByType(events), [events]);
  const countryCount = useMemo(
    () => new Set(events.map((e) => e.country)).size,
    [events]
  );
  const totalFatalities = useMemo(
    () => events.reduce((sum, e) => sum + (e.fatalities || 0), 0),
    [events]
  );

  // --- Windowing ----------------------------------------------------------
  const totalCount = sortedEvents.length;
  const rowHeight = measuredRowHeight;
  const totalHeight = totalCount * rowHeight;
  // Clamp: after a filter shrinks the list the browser corrects scrollTop
  // asynchronously, and we must not window past the end in the meantime.
  const clampedScrollTop = Math.min(
    scrollTop,
    Math.max(0, totalHeight - viewportHeight)
  );
  const startIndex = Math.max(
    0,
    Math.floor(clampedScrollTop / rowHeight) - OVERSCAN_ROWS
  );
  const endIndex = Math.min(
    totalCount,
    Math.ceil((clampedScrollTop + viewportHeight) / rowHeight) + OVERSCAN_ROWS
  );
  const visibleEvents = useMemo(
    () => sortedEvents.slice(startIndex, endIndex),
    [sortedEvents, startIndex, endIndex]
  );
  const topSpacerHeight = startIndex * rowHeight;
  const bottomSpacerHeight = Math.max(0, (totalCount - endIndex) * rowHeight);

  // Stable identity so memoized rows don't re-render on every scroll frame
  const handleSelect = useCallback(
    (event: ConflictEvent) => onSelectEvent(event),
    [onSelectEvent]
  );

  // Routed through i18n rather than hardcoded English; reuses the existing
  // search key (no new strings) minus its trailing ellipsis.
  const searchLabel = useMemo(
    () => t("eventPanel.searchEvents").replace(/[.…]+$/, ""),
    [t]
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
              {/* "Back" points toward the start of the reading direction, so
                  the glyph has to mirror in Arabic/Hebrew. */}
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="rtl:rotate-180">
                <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 011.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
              </svg>
              {t("eventPanel.backToMap")}
            </button>
          )}
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
            {t("eventPanel.eventFeed")}
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            {sortedEvents.length}{activeFilter || debouncedQuery ? ` of ${events.length}` : ""} {t("header.events")} • {t("eventPanel.latestFirst")}
          </p>
        </div>

        {/* Search */}
        <div className="border-b border-zinc-800 px-3 py-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("eventPanel.searchEvents")}
            aria-label={searchLabel}
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
          {Object.entries(typeCounts).map(([type, count]) => (
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

        {/* Event List — windowed: only rows near the viewport are mounted */}
        <div
          ref={listRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto"
        >
          {totalCount > 0 && (
            <ul ref={rowsRef} role="list" className="list-none">
              {topSpacerHeight > 0 && (
                <li aria-hidden="true" style={{ height: topSpacerHeight }} />
              )}
              {visibleEvents.map((event, i) => (
                <EventRow
                  key={event.id}
                  event={event}
                  position={startIndex + i + 1}
                  total={totalCount}
                  isSelected={selectedEvent?.id === event.id}
                  onSelect={handleSelect}
                />
              ))}
              {bottomSpacerHeight > 0 && (
                <li aria-hidden="true" style={{ height: bottomSpacerHeight }} />
              )}
            </ul>
          )}

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
              value={countryCount.toString()}
              color="text-blue-400"
            />
            <StatBox
              label={t("eventPanel.fatalities")}
              value={formatNumber(totalFatalities)}
              color="text-red-400"
            />
          </div>
        </div>
      </div>
    </>
  );
}

// A row used to be a role="button" div wrapping a link (ProvenanceRow) and a
// button (ShareButton) — interactive content nested inside a control, which
// screen readers cannot present. It is now a list item whose *summary* is the
// activation control, with the link and share button as siblings outside it.
// aria-posinset/aria-setsize restore the real position in the windowed list.
const EventRow = React.memo(function EventRow({
  event,
  position,
  total,
  isSelected,
  onSelect,
}: {
  event: ConflictEvent;
  position: number;
  total: number;
  isSelected: boolean;
  onSelect: (event: ConflictEvent) => void;
}) {
  const { t, locale } = useI18n();
  // Native <button>: click, Enter and Space all activate for free.
  const handleClick = useCallback(() => onSelect(event), [onSelect, event]);

  return (
    <li
      data-event-row
      aria-posinset={position}
      aria-setsize={total}
      className={`border-b border-zinc-800/50 transition-colors hover:bg-zinc-800/50 ${
        isSelected ? "bg-zinc-800/70" : ""
      }`}
    >
      <button
        type="button"
        onClick={handleClick}
        aria-current={isSelected ? "true" : undefined}
        aria-label={`${t(`eventTypes.${event.event_type}`)}: ${event.description.slice(0, 80)}`}
        className="flex w-full cursor-pointer select-text items-start gap-2 px-3 pt-3 text-start focus:outline-none focus:ring-2 focus:ring-inset focus:ring-zinc-500"
      >
        <span
          className="mt-1.5 inline-block h-2 w-2 flex-shrink-0 rounded-full"
          style={{
            backgroundColor: EVENT_COLORS[event.event_type] || "#ef4444",
          }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium capitalize text-zinc-300">
              {t(`eventTypes.${event.event_type}`)}
            </span>
            <span className="flex-shrink-0 text-xs text-zinc-500">
              {formatRelativeDate(event.date, t, locale)}
            </span>
          </div>
          {/* Descriptions, civilian impact and place names come straight from
              an English-language news pipeline. Inside an RTL document the
              bidi algorithm reorders mixed runs like "Bushehr, Iran — 12
              killed", so each pipeline string is isolated as its own LTR
              English node. */}
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-zinc-400">
            <span lang="en" dir="ltr">{event.description}</span>
          </p>
          <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
            <span lang="en" dir="ltr">
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
              <span lang="en" dir="ltr">{event.civilian_impact}</span>
            </div>
          )}
        </div>
      </button>
      {/* Interactive extras live beside the control, not inside it. ps-7
          keeps them aligned with the summary's text column (p-3 + dot + gap)
          on both sides of the reading direction. */}
      <div className="pb-3 pe-3 ps-7">
        <ProvenanceRow event={event} />
        <ShareButton event={event} />
      </div>
    </li>
  );
});

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

// `locale` is passed in rather than read from a hook: this is a plain module
// helper, not a component.
function formatRelativeDate(
  iso: string,
  t: (key: string, params?: Record<string, string | number>) => string,
  locale: Locale
): string {
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
  return new Date(iso).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
  });
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

function ShareButton({ event }: { event: ConflictEvent }) {
  const { t, locale } = useI18n();
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await shareEvent(event, locale);
        if (!navigator.share) {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }
      } catch {
        // User cancelled share dialog
      }
    },
    [event, locale]
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
