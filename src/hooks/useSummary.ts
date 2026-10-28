"use client";

import { useEffect, useState } from "react";

export interface EventSummaryData {
  total: number;
  total_fatalities: number;
  countries: number;
  by_type: Record<string, number>;
  by_country: Record<string, number>;
  daily: { date: string; count: number; fatalities: number }[];
  invalid_dates: number;
  first_date: string | null;
  last_date: string | null;
}

/**
 * The dataset's aggregate numbers, from `/api/events?summary=1` (a few KB).
 *
 * The landing screen used to wait for the entire event list before it could
 * print "N events, M killed, K countries" — on the live dataset that was a
 * multi-megabyte download before the first thing a visitor sees. The summary
 * carries the same numbers and arrives in milliseconds.
 */
export function useSummary(): EventSummaryData | null {
  const [summary, setSummary] = useState<EventSummaryData | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/events?summary=1", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json && json.data && typeof json.data.total === "number") {
          setSummary(json.data as EventSummaryData);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  return summary;
}
