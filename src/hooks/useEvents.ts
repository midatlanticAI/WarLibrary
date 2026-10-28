"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ConflictEvent } from "@/types";

interface EventsApiResponse {
  data: ConflictEvent[];
  meta: {
    total: number;
    last_updated: string | null;
  };
}

interface UseEventsReturn {
  events: ConflictEvent[];
  /** True only while the very first load is in flight. */
  loading: boolean;
  /** True while a background poll is in flight, after the first load. */
  refreshing: boolean;
  /**
   * True once the whole history is on the client. Until then `events` holds
   * only the recent window and anything older is still downloading.
   */
  complete: boolean;
  error: string | null;
  lastUpdated: string | null;
  /** Set when a poll failed and the events on screen may be out of date. */
  stale: boolean;
  refresh: () => void;
}

const POLL_INTERVAL_MS = 60_000;
/**
 * Hard ceiling on a single request. The dataset is several MB compressed, so
 * this is deliberately generous — it exists to release a hung socket, not to
 * cut off a slow but progressing download.
 */
const REQUEST_TIMEOUT_MS = 120_000;
/**
 * The first request asks only for this many days. Measured on the live
 * dataset the whole history is ~6.8 MB on the wire and the last 30 days about
 * 0.6 MB, and the map opens on the last 24 hours — so the reader sees a working
 * map after the small request and the rest streams in behind it.
 */
const RECENT_WINDOW_DAYS = 30;

function recentWindowStart(): string {
  return new Date(Date.now() - RECENT_WINDOW_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * The last complete dataset this tab downloaded, kept for the life of the
 * page's JavaScript. Navigating to /about and back remounts the map, and
 * without this it re-downloaded the whole history every time.
 */
let fullCache: { events: ConflictEvent[]; etag: string | null; lastUpdated: string | null } | null = null;

/**
 * Loads the merged event dataset and keeps it fresh.
 *
 * Load order: the recent window first (small, fast), then the full history,
 * then a conditional poll of the full history every minute. The poll holds
 * the ETag from the last successful full response and sends it back as
 * `If-None-Match`; the pipeline only writes every 30 minutes, so the
 * overwhelming majority of polls come back `304 Not Modified` with an empty
 * body instead of re-downloading the whole dataset. The poll is also the
 * retry: a failed or timed-out full load is simply attempted again a minute
 * later.
 */
export function useEvents(): UseEventsReturn {
  const [events, setEvents] = useState<ConflictEvent[]>(() => fullCache?.events ?? []);
  const [loading, setLoading] = useState(() => fullCache === null);
  const [refreshing, setRefreshing] = useState(false);
  const [complete, setComplete] = useState(() => fullCache !== null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(() =>
    fullCache?.lastUpdated ? new Date(fullCache.lastUpdated).toLocaleString() : null
  );
  const [stale, setStale] = useState(false);

  const etagRef = useRef<string | null>(fullCache?.etag ?? null);
  const hasLoadedRef = useRef(fullCache !== null);
  // Tracks the in-flight request so an earlier, slower response can never
  // overwrite the result of a later one.
  const inFlightRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);

  const fetchEvents = useCallback(
    async ({
      supersede = true,
      scope = "full",
    }: { supersede?: boolean; scope?: "recent" | "full" } = {}) => {
      // A background poll must never cancel a request that is still running.
      //
      // The dataset is several MB compressed; on a slow connection the full
      // load can legitimately take longer than the poll interval. Aborting and
      // restarting it on every tick meant `loading` never cleared and the user
      // sat on a spinner forever — precisely the low-bandwidth audience this
      // site exists to serve.
      if (inFlightRef.current && !supersede) return;

      inFlightRef.current?.abort();
      const controller = new AbortController();
      inFlightRef.current = controller;
      const seq = ++requestSeqRef.current;

      // Belt and braces: release a hung socket rather than pinning forever.
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const isCurrent = () => seq === requestSeqRef.current;

      if (hasLoadedRef.current) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const headers: HeadersInit = {};
        // Only the full history is polled conditionally; the recent window is
        // a one-off and its ETag would never match the full request anyway.
        if (scope === "full" && etagRef.current) {
          headers["If-None-Match"] = etagRef.current;
        }

        const url =
          scope === "recent"
            ? `/api/events?from=${recentWindowStart()}`
            : "/api/events";

        const res = await fetch(url, {
          cache: "no-store",
          headers,
          signal: controller.signal,
        });

        // A newer request started while this one was in flight — discard.
        if (!isCurrent()) return;

        // Nothing changed since the last successful fetch; no body was sent.
        if (res.status === 304) {
          hasLoadedRef.current = true;
          setError(null);
          setStale(false);
          return;
        }

        if (!res.ok) {
          throw new Error(`Failed to load events (${res.status})`);
        }

        // Optional-chained: a proxy may strip the header, and we must never let
        // a missing ETag turn a good response into a thrown error. Only
        // overwrite a known-good ETag when the server actually sent one —
        // clearing it would silently disable conditional requests for the rest
        // of the session and go back to re-downloading everything each minute.
        const etag = res.headers?.get?.("etag") ?? null;
        const json: EventsApiResponse = await res.json();

        if (!isCurrent()) return;

        if (!Array.isArray(json.data)) {
          throw new Error("Malformed response from events API");
        }

        if (scope === "full") {
          if (etag) etagRef.current = etag;
          fullCache = { events: json.data, etag: etagRef.current, lastUpdated: json.meta?.last_updated ?? null };
          setComplete(true);
        }
        hasLoadedRef.current = true;
        setEvents(json.data);
        setLastUpdated(
          json.meta?.last_updated
            ? new Date(json.meta.last_updated).toLocaleString()
            : `${json.meta?.total ?? json.data.length} events`
        );
        setError(null);
        setStale(false);
      } catch (err) {
        if (!isCurrent()) return;
        const aborted = err instanceof DOMException && err.name === "AbortError";

        const message = aborted
          ? "Loading timed out"
          : err instanceof Error
            ? err.message
            : "Failed to load events";
        setError(message);
        // `stale` means "what you are looking at may be out of date", so it only
        // applies when there is something on screen. A first-load failure is a
        // hard error, not stale data — note hasLoadedRef is NOT set here, so the
        // page keeps showing its loading/error state rather than rendering as a
        // fully-working app with zero events.
        if (hasLoadedRef.current) setStale(true);
      } finally {
        clearTimeout(timeout);
        if (inFlightRef.current === controller) {
          inFlightRef.current = null;
        }
        if (isCurrent()) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    []
  );

  const refresh = useCallback(() => {
    void fetchEvents({ supersede: true, scope: "full" });
  }, [fetchEvents]);

  useEffect(() => {
    let cancelled = false;

    // Recent window first, then the whole history behind it. If the small
    // request fails the full one still runs, so a transient error on the first
    // hop never leaves the reader without data. With a cached full set from an
    // earlier mount, go straight to a conditional poll instead.
    (async () => {
      if (fullCache === null) {
        await fetchEvents({ supersede: true, scope: "recent" });
        if (cancelled) return;
      }
      await fetchEvents({ supersede: true, scope: "full" });
    })();

    // Polls never supersede: if the previous request is still running, skip
    // this tick rather than restarting it. A poll before the full history has
    // arrived is the retry for a failed or timed-out full load.
    const interval = setInterval(() => {
      void fetchEvents({ supersede: false, scope: "full" });
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
      inFlightRef.current?.abort();
    };
  }, [fetchEvents]);

  return {
    events,
    loading,
    refreshing,
    complete,
    error,
    lastUpdated,
    stale,
    refresh,
  };
}
