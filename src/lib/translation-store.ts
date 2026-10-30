import fs from "fs";
import path from "path";
import * as tc from "@/lib/translate-core.cjs";
import type { ContentLanguage, TranslationRow } from "@/lib/translate-core.cjs";
import { isLocale, type Locale } from "@/i18n/locale";

/**
 * Event translations, read side.
 *
 * The translator script (scripts/translate-events.js) appends one JSON
 * line per event and language to `src/data/translations/<lang>.jsonl`.
 * The English record in the event files stays the only canonical text;
 * this is a sidecar keyed by the event's content-derived id, so nothing
 * in the pipeline's own files changes shape and a translation can be
 * redone (a later line for the same id wins) without touching the record.
 *
 * Each language is loaded lazily on first request and cached for the life
 * of the process, keyed on the file's mtime and size. Most visitors read
 * one language, so a 2 GB box holds one or two tables, not seven.
 * Appends change the mtime, which reloads that language on the next read.
 */

export const TRANSLATIONS_DIR =
  process.env.TRANSLATIONS_DIR || path.join(process.cwd(), "src", "data", "translations");

export interface EventTranslationText {
  description: string;
  civilian_impact: string | null;
}

interface Table {
  signature: string;
  rows: Map<string, EventTranslationText>;
  lastUsed: number;
}

const tables = new Map<string, Table>();

/**
 * A file still being appended to (the translator writes a batch every few
 * seconds during a backfill) is left alone until it has been quiet for
 * this long. Otherwise every request would reparse the whole table and the
 * ETag would never repeat, so no polling client would get a 304 for the
 * hours the backfill runs.
 */
const QUIET_MS = 60_000;
/**
 * Upper bound on holding a signature while the file keeps changing. A
 * backfill appends for hours and is never quiet; without this bound the
 * site would show no new translations until it finished. With it, the
 * table reloads (and the ETag changes) at most once per interval.
 */
const MAX_HOLD_MS = 10 * 60_000;
/** Tables no request has touched for this long are dropped (a 37k-row table is ~30 MB). */
const IDLE_EVICT_MS = 30 * 60_000;
const stableSignature = new Map<string, { sig: string; at: number }>();

export function isContentLanguage(value: unknown): value is ContentLanguage {
  return tc.isLanguage(value);
}

function fileFor(lang: ContentLanguage): string {
  return tc.translationFile(TRANSLATIONS_DIR, lang);
}

/**
 * Fingerprint of one language's file: "0:0" when absent; otherwise the
 * mtime and size, held at the last quiet value while the file is being
 * appended to (see QUIET_MS). Used for the cache and for the /api/events
 * ETag, so both change together.
 */
export function translationSignature(lang: ContentLanguage, now: number = Date.now()): string {
  let current: string;
  let quiet = true;
  try {
    const stat = fs.statSync(/*turbopackIgnore: true*/ fileFor(lang));
    current = `${stat.mtimeMs}:${stat.size}`;
    quiet = now - stat.mtimeMs >= QUIET_MS;
  } catch {
    current = "0:0";
  }
  const stable = stableSignature.get(lang);
  if (quiet || stable === undefined || now - stable.at >= MAX_HOLD_MS) {
    if (stable?.sig !== current || stable === undefined) stableSignature.set(lang, { sig: current, at: now });
    return current;
  }
  return stable.sig;
}

function evictIdle(now: number): void {
  for (const [lang, table] of tables) {
    if (now - table.lastUsed > IDLE_EVICT_MS) tables.delete(lang);
  }
}

function load(lang: ContentLanguage): Table {
  const now = Date.now();
  evictIdle(now);
  const signature = translationSignature(lang, now);
  const cached = tables.get(lang);
  if (cached && cached.signature === signature) {
    cached.lastUsed = now;
    return cached;
  }
  const rows = new Map<string, EventTranslationText>();
  if (signature !== "0:0") {
    let text = "";
    try {
      text = fs.readFileSync(/*turbopackIgnore: true*/ fileFor(lang), "utf-8");
    } catch (err) {
      console.error(`[translations] Failed to read ${lang}:`, err);
      // Keep whatever was cached rather than serving nothing.
      if (cached) return cached;
    }
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      const row: TranslationRow | null = tc.decodeRow(line);
      if (row) rows.set(row.id, { description: row.description, civilian_impact: row.civilian_impact });
    }
  }
  const table = { signature, rows, lastUsed: now };
  tables.set(lang, table);
  return table;
}

/** Drop every cached table and remembered signature; used by tests and after a bulk write. */
export function invalidateTranslations(): void {
  tables.clear();
  stableSignature.clear();
}

export function getTranslation(lang: ContentLanguage, id: string): EventTranslationText | null {
  return load(lang).rows.get(id) ?? null;
}

export function translationCount(lang: ContentLanguage): number {
  return load(lang).rows.size;
}

/** Fields a localised event carries beyond the record. */
export interface LocalizedFields {
  /** Language of `description` (and `civilian_impact` when translated). "en" when no translation exists. */
  description_lang: Locale;
  /** True when `description` is a machine translation of `description_en`. */
  translated: boolean;
  /** The canonical English description, present only when translated. */
  description_en?: string;
  civilian_impact_en?: string | null;
}

/**
 * Return a copy of `event` with `description` (and `civilian_impact`) in
 * `lang` when a translation exists, plus the fields that say which language
 * the text is in. English, or a language without a translation for this
 * event, returns the record with `description_lang: "en"`.
 */
export function localizeEvent<T extends { id: string; description: string; civilian_impact?: string | null }>(
  event: T,
  lang: Locale | string | null | undefined
): T & LocalizedFields {
  if (!isContentLanguage(lang) || !isLocale(lang)) {
    return { ...event, description_lang: "en", translated: false };
  }
  const tr = getTranslation(lang, event.id);
  if (!tr) return { ...event, description_lang: "en", translated: false };
  const out: T & LocalizedFields = {
    ...event,
    description: tr.description,
    description_lang: lang,
    translated: true,
    description_en: event.description,
  };
  if (event.civilian_impact && tr.civilian_impact) {
    out.civilian_impact = tr.civilian_impact;
    out.civilian_impact_en = event.civilian_impact;
  }
  return out;
}

export function localizeEvents<T extends { id: string; description: string; civilian_impact?: string | null }>(
  events: T[],
  lang: Locale | string | null | undefined
): (T & LocalizedFields)[] {
  if (!isContentLanguage(lang)) return events.map((e) => ({ ...e, description_lang: "en" as Locale, translated: false }));
  // Load once, then look up per event.
  const table = load(lang);
  return events.map((e) => {
    const tr = table.rows.get(e.id);
    if (!tr) return { ...e, description_lang: "en" as Locale, translated: false };
    const out: T & LocalizedFields = { ...e, description: tr.description, description_lang: lang, translated: true, description_en: e.description };
    if (e.civilian_impact && tr.civilian_impact) {
      out.civilian_impact = tr.civilian_impact;
      out.civilian_impact_en = e.civilian_impact;
    }
    return out;
  });
}
