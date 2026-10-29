import registry from "@/data/conflicts.json";

/**
 * The conflict registry, typed. One file (`src/data/conflicts.json`) drives
 * the pipeline's queries and extraction framing, the chat background, the
 * event pages and the dispatches. This module has no Node imports so it can
 * be used from client components too.
 */

export type ConflictStatus = "active" | "planned" | "dormant";
export type ActorType = "state" | "non_state" | "coalition" | "civilians" | "unknown";

export interface ConflictActor {
  name: string;
  type: ActorType;
}

export interface Conflict {
  id: string;
  name: string;
  short_name: string;
  operation_name: string | null;
  status: ConflictStatus;
  /** First day of the conflict (ISO date). Events before it are rejected. */
  start_date: string;
  /** First day this site tracked it; null until activated. */
  tracking_from: string | null;
  end_date: string | null;
  timezone: string;
  /** [minLon, minLat, maxLon, maxLat] */
  bbox: [number, number, number, number];
  countries: string[];
  actors: ConflictActor[];
  queries: { google_news: string[]; newsdata: string[] };
  extra_feeds: string[];
  spillover_hint: string;
  description: string;
  background: string[];
}

interface Registry {
  version: number;
  updated: string;
  conflicts: Conflict[];
}

const REGISTRY = registry as unknown as Registry;

/** Rows that predate the registry were all extracted for this conflict. */
export const DEFAULT_CONFLICT_ID = "epic-fury-2026";

export function getConflicts(): Conflict[] {
  return REGISTRY.conflicts;
}

export function getActiveConflicts(): Conflict[] {
  return REGISTRY.conflicts.filter((c) => c.status === "active");
}

export function getConflict(id: string | null | undefined): Conflict | null {
  if (!id) return null;
  return REGISTRY.conflicts.find((c) => c.id === id) ?? null;
}

/** The conflict an event belongs to; legacy rows fall back to the default. */
export function conflictForEvent(event: { conflict_id?: string | null }): Conflict | null {
  return getConflict(event.conflict_id ?? DEFAULT_CONFLICT_ID);
}

/** Earliest start date across active conflicts, as a timestamp. */
export function earliestActiveStart(): number {
  const active = getActiveConflicts();
  if (active.length === 0) return 0;
  return Math.min(...active.map((c) => new Date(`${c.start_date}T00:00:00Z`).getTime()));
}

/** "the US-Israel war on Iran (Operation Epic Fury)" style label. */
export function conflictLabel(conflict: Conflict): string {
  return conflict.operation_name ? `${conflict.name} (${conflict.operation_name})` : conflict.name;
}
