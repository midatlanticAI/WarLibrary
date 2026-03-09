"use client";

import { useMemo } from "react";
import type { ConflictEvent } from "@/types";

interface TimelineSliderProps {
  events: ConflictEvent[];
  dateRange: { start: string; end: string };
  onChange: (range: { start: string; end: string }) => void;
}

export default function TimelineSlider({
  events,
  dateRange,
  onChange,
}: TimelineSliderProps) {
  const { minDate, maxDate, dayBuckets } = useMemo(() => {
    if (events.length === 0)
      return { minDate: "", maxDate: "", dayBuckets: [] };

    const dates = events.map((e) => e.date.split("T")[0]).sort();
    const min = dates[0];
    const max = dates[dates.length - 1];

    const buckets: { date: string; count: number }[] = [];
    const counts: Record<string, number> = {};
    for (const d of dates) {
      counts[d] = (counts[d] || 0) + 1;
    }

    const current = new Date(min);
    const end = new Date(max);
    while (current <= end) {
      const key = current.toISOString().split("T")[0];
      buckets.push({ date: key, count: counts[key] || 0 });
      current.setDate(current.getDate() + 1);
    }

    return { minDate: min, maxDate: max, dayBuckets: buckets };
  }, [events]);

  const maxCount = Math.max(...dayBuckets.map((b) => b.count), 1);

  if (dayBuckets.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-black/70 p-3 backdrop-blur-sm">
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <span>{formatDate(dateRange.start)}</span>
        <span className="font-semibold text-zinc-200">Timeline</span>
        <span>{formatDate(dateRange.end)}</span>
      </div>

      {/* Mini histogram */}
      <div className="flex h-8 items-end gap-px">
        {dayBuckets.map((bucket) => {
          const height = bucket.count > 0 ? (bucket.count / maxCount) * 100 : 2;
          const inRange =
            bucket.date >= dateRange.start && bucket.date <= dateRange.end;
          return (
            <div
              key={bucket.date}
              className="flex-1 cursor-pointer rounded-t-sm transition-colors"
              style={{
                height: `${height}%`,
                backgroundColor: inRange
                  ? bucket.count > 0
                    ? "#ef4444"
                    : "#333"
                  : "#1a1a1a",
                opacity: inRange ? 1 : 0.4,
                minWidth: "3px",
              }}
              title={`${formatDate(bucket.date)}: ${bucket.count} events`}
              onClick={() =>
                onChange({ start: bucket.date, end: dateRange.end })
              }
            />
          );
        })}
      </div>

      {/* Range slider */}
      <div className="relative">
        <input
          type="range"
          min={0}
          max={dayBuckets.length - 1}
          value={dayBuckets.findIndex((b) => b.date >= dateRange.start)}
          onChange={(e) => {
            const idx = parseInt(e.target.value);
            if (dayBuckets[idx]) {
              onChange({ start: dayBuckets[idx].date, end: dateRange.end });
            }
          }}
          className="w-full accent-red-500"
        />
      </div>

      {/* Quick filters */}
      <div className="flex gap-1.5">
        {[
          { label: "All", start: minDate, end: maxDate },
          { label: "Last 24h", start: daysAgoISO(1), end: todayISO() },
          { label: "Last 3d", start: daysAgoISO(3), end: maxDate },
          { label: "Last 7d", start: daysAgoISO(7), end: maxDate },
        ].map((preset) => (
          <button
            key={preset.label}
            onClick={() =>
              onChange({ start: preset.start, end: preset.end })
            }
            className={`rounded px-3 py-1.5 text-xs transition-colors ${
              dateRange.start === preset.start && dateRange.end === preset.end
                ? "bg-red-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}
