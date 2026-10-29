/** Type declarations for dispatch-core.cjs (shared with the Node writer). */

export type DispatchKind = "daily" | "weekly" | "monthly";
export type DispatchStatus = "draft" | "published" | "pulled";

export interface DispatchWindow {
  from: string;
  to: string;
  prior: { from: string; to: string };
  label: string;
}

export interface CountryRow {
  name: string;
  events: number;
  kinetic: number;
  fatalities: number;
}

export interface DispatchStats {
  events: number;
  kinetic: number;
  developments: number;
  fatalities: number;
  fatal_events: number;
  civilian_impact_events: number;
  confirmed_or_reported: number;
  outlets: number;
  countries: number;
  unplaced_country: number;
  by_type: Record<string, number>;
  by_verification: Record<string, number>;
  by_conflict: Record<string, number>;
  top_countries: CountryRow[];
}

export interface StatsDiff {
  events: number;
  events_pct: number | null;
  kinetic: number;
  kinetic_pct: number | null;
  fatalities: number;
  fatalities_pct: number | null;
}

export interface DispatchSection {
  heading: string;
  body: string;
  event_ids: string[];
}

export interface CompactEvent {
  id: string;
  date: string;
  country: string;
  region: string;
  event_type: string;
  description: string;
  fatalities: number;
  civilian_impact: string | null;
  verification_status: string | null;
  source: string;
  source_url: string | null;
  conflict_id: string;
}

export interface DispatchUsage {
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  model: string;
}

/** A dispatch narrative in one language (see src/lib/translate-core.cjs). */
export interface DispatchTranslationText {
  title: string;
  lede: string;
  sections: { heading: string; body: string }[];
  civilian_note: string | null;
}

/** One email broadcast of a dispatch, per language. */
export interface DispatchEmailRecord {
  broadcast_id: string;
  at: string;
  lang: string;
}

export interface Dispatch {
  kind: DispatchKind;
  key: string;
  title: string;
  window: DispatchWindow;
  generated_at: string;
  status: DispatchStatus;
  publish_after: string | null;
  published_at: string | null;
  pulled_at: string | null;
  needs_review: string[];
  lede: string;
  sections: DispatchSection[];
  civilian_note: string | null;
  stats: DispatchStats;
  prior_stats: DispatchStats;
  diff: StatsDiff;
  top_events: CompactEvent[];
  cited_ids: string[];
  inputs: { source: "events" | "dispatches"; keys: string[]; event_count: number };
  usage: DispatchUsage;
  disclosure: string;
  revision: number;
  edited_at: string | null;
  /**
   * Machine translations of the narrative, keyed by locale, written by
   * scripts/translate-dispatch.js. Absent until the translator has run;
   * cleared by the writer when the narrative is regenerated.
   */
  translations?: Record<string, DispatchTranslationText> | null;
  /** Model and time of the translations, for the admin and the record. */
  translated_at?: string | null;
  /** Email broadcasts sent for this dispatch, keyed by language. */
  emailed?: Record<string, DispatchEmailRecord> | null;
}

export interface CitationResult {
  sections: DispatchSection[];
  cited: string[];
  dropped_sentences: number;
  uncited_sentences: number;
  dropped_sections: number;
  unknown_citations: number;
}

export interface MinimalEvent {
  id: string;
  date: string;
  event_type: string;
  description?: string;
  country?: string;
  region?: string;
  fatalities?: number | null;
  confidence?: number | null;
  verification_status?: string | null;
  civilian_impact?: string | null;
  source?: string;
  source_url?: string | null;
  conflict_id?: string | null;
}

export const KINDS: DispatchKind[];
export const STATUSES: DispatchStatus[];
export const KINETIC_TYPES: Set<string>;
export const DISCLOSURE: string;
export const DAY_MS: number;
export const CITATION_RE: RegExp;
export const LOOSE_CITATION_RE: RegExp;
export function splitSentences(text: string): string[];
export function numbersInText(text: string | null | undefined): number[];

export function stableEventId(raw: { date: string; latitude: number; longitude: number; description?: string }): string;
export function utcDay(date: Date): string;
export function isoWeek(date: Date): { year: number; week: number };
export function mondayOfIsoWeek(year: number, week: number): Date;
export function isKind(kind: unknown): kind is DispatchKind;
export function isValidKey(kind: unknown, key: unknown): boolean;
export function keyFor(kind: DispatchKind, date: Date): string;
export function defaultKey(kind: DispatchKind, now?: Date): string;
export function windowFor(kind: DispatchKind, key: string): DispatchWindow | null;
export function childKeys(kind: DispatchKind, key: string): string[];
export function childKind(kind: DispatchKind): DispatchKind | null;
export function eventsInWindow<T extends MinimalEvent>(events: T[], from: string, to: string): T[];
export function isKinetic(event: { event_type: string }): boolean;
export function fatalitiesOf(event: { fatalities?: number | null }): number;
export function computeStats(events: MinimalEvent[], opts?: { topCountries?: number }): DispatchStats;
export function diffStats(current: DispatchStats, prior: DispatchStats): StatsDiff;
export function eventScore(event: MinimalEvent): number;
export function selectTopEvents<T extends MinimalEvent>(events: T[], n: number): T[];
export function compactEvent(event: MinimalEvent, descriptionMax?: number): CompactEvent;
export function citationCheck(sections: Partial<DispatchSection>[], allowedIds: Iterable<string>): CitationResult;
export function allowedNumbers(stats: DispatchStats, events: MinimalEvent[], extra?: number[]): Set<number>;
export function numberGuard(text: string, allowed: Set<number>): number[];
export function narrativeText(dispatch: Pick<Dispatch, "title" | "lede" | "civilian_note" | "sections">): string;
export function effectiveStatus(dispatch: Pick<Dispatch, "status" | "publish_after" | "needs_review"> | null, now?: Date): DispatchStatus;
export function isPublished(dispatch: Pick<Dispatch, "status" | "publish_after" | "needs_review">, now?: Date): boolean;
export function dispatchUrlPath(kind: DispatchKind, key: string): string;
export function dispatchFileName(kind: DispatchKind, key: string): string;
export function socialText(dispatch: Pick<Dispatch, "title" | "lede">, url: string): string;
export function stripCitations(text: string): string;
