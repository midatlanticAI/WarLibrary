/** Type declarations for translate-core.cjs (shared with the Node translator scripts). */

export type ContentLanguage = "es" | "fr" | "tr" | "ar" | "fa" | "ur" | "he";

export interface EventTranslationInput {
  id: string;
  description: string;
  civilian_impact?: string | null;
}

export interface EventTranslation {
  id: string;
  description: string;
  civilian_impact: string | null;
}

export interface TranslationRow extends EventTranslation {
  at: string | null;
  model: string | null;
}

export interface DispatchTranslation {
  title: string;
  lede: string;
  sections: { heading: string; body: string }[];
  civilian_note: string | null;
}

export const LANGUAGES: Record<ContentLanguage, string>;
export const DIGIT_STYLE: Record<ContentLanguage, string>;
export function isLanguage(value: unknown): value is ContentLanguage;
export function normalizeDigits(text: string | null | undefined): string;
export function isPlaceholderImpact(text: string | null | undefined): boolean;
export function numberMultiset(text: string | null | undefined): string[];
export function citationMultiset(text: string | null | undefined): string[];
export function checkTranslation(
  source: string | null | undefined,
  translated: string | null | undefined,
  opts?: { citations?: boolean; minRatio?: number; maxRatio?: number }
): string | null;
export function systemPrompt(lang: ContentLanguage): string;
export const EVENT_BATCH_SCHEMA: Record<string, unknown>;
export function eventBatchPrompt(items: EventTranslationInput[]): string;
export function acceptEventBatch(
  items: EventTranslationInput[],
  output: unknown
): { accepted: EventTranslation[]; rejected: { id: string; reason: string }[] };
export const DISPATCH_SCHEMA: Record<string, unknown>;
export function dispatchPrompt(dispatch: { title: string; lede: string; sections: { heading: string; body: string }[]; civilian_note: string | null }): string;
export function acceptDispatch(
  dispatch: { title: string; lede: string; sections: { heading: string; body: string }[]; civilian_note: string | null },
  output: unknown
): { translation: DispatchTranslation | null; reasons: string[] };
export function translationFile(dir: string, lang: ContentLanguage): string;
export function encodeRow(row: { id: string; description: string; civilian_impact?: string | null; at: string; model: string }): string;
export function decodeRow(line: string): TranslationRow | null;
export function estimateCostUsd(n: number, opts?: { inPerEvent?: number; outPerEvent?: number; priceIn?: number; priceOut?: number }): number;
