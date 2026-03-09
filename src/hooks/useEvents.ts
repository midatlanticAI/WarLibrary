"use client";

import { useCallback, useEffect, useState } from "react";
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
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
  refresh: () => void;
}

export function useEvents(): UseEventsReturn {
  const [events, setEvents] = useState<ConflictEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/events");
      if (!res.ok) {
        throw new Error(`Failed to load events (${res.status})`);
      }
      const json: EventsApiResponse = await res.json();
      if (json.data && json.data.length > 0) {
        setEvents(json.data);
        setLastUpdated(
          json.meta.last_updated
            ? new Date(json.meta.last_updated).toLocaleString()
            : `${json.meta.total} events`
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load events";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  return { events, loading, error, lastUpdated, refresh: fetchEvents };
}
