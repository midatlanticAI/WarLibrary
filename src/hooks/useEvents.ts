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
 * Loads the merged event dataset and keeps it fresh.
 *
 * The dataset is large (tens of thousands of events, several MB compressed), so
 * the poll is conditional: we hold the ETag from the last successful response
 * and send it back as `If-None-Match`. The pipeline only writes every 30
 * minutes, so the overwhelming majority of polls come back `304 Not Modified`
 * with an empty body instead of re-downloading the whole dataset every minute.
 */
export function useEvents(): UseEventsReturn {
  const [events, setEvents] = useState<ConflictEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  const etagRef = useRef<string | null>(null);
  const hasLoadedRef = useRef(false);
  // Tracks the in-flight request so an earlier, slower response can never
  // overwrite the result of a later one.
  const inFlightRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);

  const fetchEvents = useCallback(
    async ({ supersede = true }: { supersede?: boolean } = {}) => {
      // A background poll must never cancel a request that is still running.
      //
      // The dataset is several MB compressed; on a slow connection the first
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
        if (etagRef.current) {
          headers["If-None-Match"] = etagRef.current;
        }

        const res = await fetch("/api/events", {
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

        if (etag) etagRef.current = etag;
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
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!isCurrent()) return;

        const message =
          err instanceof Error ? err.message : "Failed to load events";
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
    void fetchEvents({ supersede: true });
  }, [fetchEvents]);

  useEffect(() => {
    void fetchEvents({ supersede: true });

    // Polls never supersede: if the previous request is still running, skip
    // this tick rather than restarting it.
    const interval = setInterval(() => {
      void fetchEvents({ supersede: false });
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      inFlightRef.current?.abort();
    };
  }, [fetchEvents]);

  return {
    events,
    loading,
    refreshing,
    error,
    lastUpdated,
    stale,
    refresh,
  };
}
