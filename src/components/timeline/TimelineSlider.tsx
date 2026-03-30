"use client";

import { useMemo, useCallback } from "react";
import type { ConflictEvent } from "@/types";
import { useI18n } from "@/i18n";

interface TimelineSliderProps {
  events: ConflictEvent[];
  dateRange: { start: string; end: string };
  onChange: (range: { start: string; end: string }) => void;
}

type BucketScale = "30min" | "6h" | "daily";

interface Bucket {
  key: string;       // ISO string for start of bucket
  label: string;     // Display label
  count: number;
}

export default function TimelineSlider({
  events,
  dateRange,
  onChange,
}: TimelineSliderProps) {
  const { t } = useI18n();
  // Determine the scale based on the selected range
  const scale = useMemo((): BucketScale => {
    const start = new Date(dateRange.start).getTime();
    const end = new Date(dateRange.end).getTime();
    const hours = (end - start) / (1000 * 60 * 60);
    if (hours <= 36) return "30min";
    if (hours <= 96) return "6h";
    return "daily";
  }, [dateRange]);

  const { minDate, maxDate, buckets, allBuckets } = useMemo(() => {
    if (events.length === 0)
      return { minDate: "", maxDate: "", buckets: [] as Bucket[], allBuckets: [] as Bucket[] };

    const timestamps = events.map((e) => new Date(e.date).getTime()).sort((a, b) => a - b);
    const min = new Date(timestamps[0]).toISOString();
    const max = new Date(timestamps[timestamps.length - 1]).toISOString();

    // Build buckets for the FULL range (for the slider)
    const allB = buildBuckets(events, min, max, "daily");
    // Build buckets for the SELECTED range (for display)
    const displayB = buildBuckets(events, dateRange.start, dateRange.end, scale);

    return { minDate: min, maxDate: max, buckets: displayB, allBuckets: allB };
  }, [events, dateRange, scale]);

  const maxCount = Math.max(...buckets.map((b) => b.count), 1);

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const idx = parseInt(e.target.value);
      if (allBuckets[idx]) {
        onChange({ start: allBuckets[idx].key, end: dateRange.end });
      }
    },
    [allBuckets, dateRange.end, onChange]
  );

  const sliderValue = useMemo(() => {
    const startTs = new Date(dateRange.start).getTime();
    let closest = 0;
    let minDiff = Infinity;
    for (let i = 0; i < allBuckets.length; i++) {
      const diff = Math.abs(new Date(allBuckets[i].key).getTime() - startTs);
      if (diff < minDiff) {
        minDiff = diff;
        closest = i;
      }
    }
    return closest;
  }, [allBuckets, dateRange.start]);

  if (buckets.length === 0) return null;

  // Compute tick labels for the x-axis
  const tickLabels = getTickLabels(buckets, scale);

  const quickFilters = [
    { label: t("timeline.all"), start: minDate, end: maxDate },
    { label: t("timeline.24h"), start: hoursAgoISO(24), end: nowISO() },
    { label: t("timeline.3d"), start: daysAgoISO(3), end: nowISO() },
    { label: t("timeline.7d"), start: daysAgoISO(7), end: nowISO() },
  ];

  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-black/70 backdrop-blur-sm">
      {/* Mobile: compact filter bar only */}
      <div className="flex gap-1.5 p-2 sm:hidden" role="group" aria-label="Time range filters">
        {quickFilters.map((preset) => {
          const isActive = isRangeMatch(dateRange, preset);
          return (
            <button
              key={preset.label}
              onClick={() =>
                onChange({ start: preset.start, end: preset.end })
              }
              className={`min-h-[44px] flex-1 rounded-md py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-500 ${
                isActive
                  ? "bg-red-600 text-white"
                  : "bg-zinc-800/80 text-zinc-400 active:bg-zinc-700"
              }`}
              aria-pressed={isActive}
              aria-label={`Show ${preset.label === "All" ? "all time" : `last ${preset.label}`}`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* Desktop: full timeline with histogram, slider, and filters */}
      <div className="hidden sm:flex sm:flex-col sm:gap-1.5 sm:p-3">
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span>{formatDateFull(dateRange.start)}</span>
          <span className="font-semibold text-zinc-200">{t("timeline.timeline")}</span>
          <span>{formatDateFull(dateRange.end)}</span>
        </div>

        {/* Scale indicator */}
        <div className="text-center text-[10px] text-zinc-500">
          {scale === "30min" && t("timeline.30minIntervals")}
          {scale === "6h" && t("timeline.6hIntervals")}
          {scale === "daily" && t("timeline.dailyIntervals")}
          {" · "}{buckets.reduce((s, b) => s + b.count, 0)} {t("timeline.eventsInRange")}
        </div>

        {/* Histogram */}
        <div className="flex h-10 items-end gap-px">
          {buckets.map((bucket) => {
            const height = bucket.count > 0 ? Math.max((bucket.count / maxCount) * 100, 8) : 3;
            return (
              <div
                key={bucket.key}
                className="group relative flex-1 cursor-pointer rounded-t-sm transition-colors hover:opacity-80"
                style={{
                  height: `${height}%`,
                  backgroundColor: bucket.count > 0 ? "#ef4444" : "#262626",
                  minWidth: "2px",
                }}
                title={`${bucket.label}: ${bucket.count} events`}
                onClick={() =>
                  onChange({ start: bucket.key, end: dateRange.end })
                }
              >
                {bucket.count > 0 && (
                  <div className="pointer-events-none absolute -top-7 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-200 shadow group-hover:block">
                    {bucket.count}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* X-axis tick labels */}
        <div className="relative flex h-3 items-start">
          {tickLabels.map((tick) => (
            <span
              key={tick.position}
              className="absolute text-[9px] text-zinc-500 -translate-x-1/2"
              style={{ left: `${tick.position}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>

        {/* Range slider */}
        <div className="relative">
          <input
            type="range"
            min={0}
            max={Math.max(allBuckets.length - 1, 0)}
            value={sliderValue}
            onChange={handleSliderChange}
            className="w-full accent-red-500"
          />
        </div>

        {/* Quick filters */}
        <div className="flex gap-1.5">
          {quickFilters.map((preset) => {
            const isActive = isRangeMatch(dateRange, preset);
            return (
              <button
                key={preset.label}
                onClick={() =>
                  onChange({ start: preset.start, end: preset.end })
                }
                className={`rounded px-3 py-1.5 text-xs transition-colors ${
                  isActive
                    ? "bg-red-600 text-white"
                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildBuckets(
  events: ConflictEvent[],
  rangeStart: string,
  rangeEnd: string,
  scale: BucketScale
): Bucket[] {
  const startTs = new Date(rangeStart).getTime();
  const endTs = new Date(rangeEnd).getTime();
  if (startTs >= endTs) return [];

  const intervalMs =
    scale === "30min" ? 30 * 60 * 1000 :
    scale === "6h" ? 6 * 60 * 60 * 1000 :
    24 * 60 * 60 * 1000;

  // Align start to interval boundary
  const alignedStart = alignToInterval(startTs, scale);

  const buckets: Bucket[] = [];
  let current = alignedStart;

  while (current <= endTs) {
    const bucketEnd = current + intervalMs;
    const key = new Date(current).toISOString();
    const label = formatBucketLabel(current, scale);
    const count = events.filter((e) => {
      const t = new Date(e.date).getTime();
      return t >= current && t < bucketEnd;
    }).length;
    buckets.push({ key, label, count });
    current = bucketEnd;
  }

  return buckets;
}

function alignToInterval(ts: number, scale: BucketScale): number {
  const d = new Date(ts);
  if (scale === "30min") {
    d.setMinutes(d.getMinutes() < 30 ? 0 : 30, 0, 0);
  } else if (scale === "6h") {
    d.setHours(Math.floor(d.getHours() / 6) * 6, 0, 0, 0);
  } else {
    d.setHours(0, 0, 0, 0);
  }
  return d.getTime();
}

function formatBucketLabel(ts: number, scale: BucketScale): string {
  const d = new Date(ts);
  if (scale === "30min") {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  }
  if (scale === "6h") {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
      " " + d.toLocaleTimeString("en-US", { hour: "numeric", hour12: true });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getTickLabels(buckets: Bucket[], scale: BucketScale): { label: string; position: number }[] {
  if (buckets.length === 0) return [];

  // Show ~5-7 evenly spaced labels
  const maxTicks = Math.min(7, buckets.length);
  const step = Math.max(1, Math.floor(buckets.length / maxTicks));
  const ticks: { label: string; position: number }[] = [];

  for (let i = 0; i < buckets.length; i += step) {
    const position = (i / (buckets.length - 1)) * 100;
    const d = new Date(buckets[i].key);
    let label: string;

    if (scale === "30min") {
      label = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    } else if (scale === "6h") {
      label = d.toLocaleDateString("en-US", { weekday: "short" }) +
        " " + d.toLocaleTimeString("en-US", { hour: "numeric", hour12: true });
    } else {
      label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }

    ticks.push({ label, position });
  }

  return ticks;
}

function formatDateFull(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function isRangeMatch(
  current: { start: string; end: string },
  preset: { start: string; end: string }
): boolean {
  // Fuzzy match — within 1 minute tolerance (for "now" presets)
  const cs = new Date(current.start).getTime();
  const ce = new Date(current.end).getTime();
  const ps = new Date(preset.start).getTime();
  const pe = new Date(preset.end).getTime();
  const tolerance = 60 * 1000;
  return Math.abs(cs - ps) < tolerance && Math.abs(ce - pe) < tolerance;
}

function nowISO(): string {
  return new Date().toISOString();
}

function hoursAgoISO(n: number): string {
  return new Date(Date.now() - n * 60 * 60 * 1000).toISOString();
}

function daysAgoISO(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}
