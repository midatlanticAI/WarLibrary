"use client";

import { useCallback, useEffect, useState } from "react";
import type { ConflictEvent } from "@/types";
import seedData from "@/data/events.json";
import expandedData from "@/data/events_expanded.json";
import latestData from "@/data/events_latest.json";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface RawEvent {
  date: string;
  event_type: string;
  description: string;
  latitude: number;
  longitude: number;
  country: string;
  region: string;
  actors: string[];
  fatalities: number | null;
  source: string;
}

function toConflictEvent(raw: RawEvent, index: number): ConflictEvent {
  return {
    id: String(index + 1),
    date: raw.date,
    event_type: raw.event_type as ConflictEvent["event_type"],
    description: raw.description,
    latitude: raw.latitude,
    longitude: raw.longitude,
    country: raw.country,
    region: raw.region,
    actors: raw.actors,
    fatalities: raw.fatalities ?? null,
    source: raw.source,
    source_url: null,
    created_at: raw.date,
  };
}

// Merge both seed files, deduplicate by description similarity, sort by date
const allRawEvents = [
  ...(seedData.events as RawEvent[]),
  ...(expandedData.events as RawEvent[]),
  ...(latestData.events as RawEvent[]),
];

// Sort chronologically
allRawEvents.sort(
  (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
);

const SEED_EVENTS: ConflictEvent[] = allRawEvents.map(toConflictEvent);

interface UseEventsReturn {
  events: ConflictEvent[];
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
  refresh: () => void;
}

export function useEvents(): UseEventsReturn {
  const [events, setEvents] = useState<ConflictEvent[]>(SEED_EVENTS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(
    `seed data — ${SEED_EVENTS.length} events`
  );

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/events?limit=1000`);
      if (res.ok) {
        const json = await res.json();
        if (json.data && json.data.length > 0) {
          setEvents(json.data);
          setLastUpdated("just now");
        }
      }
    } catch {
      // Backend not available yet — use seed data
      setLastUpdated(`seed data — ${SEED_EVENTS.length} events`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  return { events, loading, error, lastUpdated, refresh: fetchEvents };
}
