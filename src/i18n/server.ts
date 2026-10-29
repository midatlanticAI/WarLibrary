import { cookies, headers } from "next/headers";
import en from "./en.json";
import es from "./es.json";
import fr from "./fr.json";
import tr from "./tr.json";
import ar from "./ar.json";
import fa from "./fa.json";
import ur from "./ur.json";
import he from "./he.json";
import { LOCALE_COOKIE, LOCALE_TAG, isLocale, matchBrowserLocale, type Locale } from "./locale";

export { LOCALE_TAG };

/**
 * Server-side locale resolution and translation.
 *
 * The client provider (`src/i18n/index.tsx`) owns the interactive app; this
 * module serves the server-rendered pages (event, country, dispatch) and
 * the root layout. Both read the same JSON files, so a key exists in one
 * place and nowhere else.
 *
 * Resolution order: the reader's saved choice (cookie) wins; a first-time
 * visitor gets the best match for their browser's Accept-Language; English
 * otherwise. Doing this on the server means the first byte already carries
 * the right `lang`, `dir` and strings, so an Arabic or Hebrew reader never
 * sees the page flip after hydration.
 */

type TranslationMap = typeof en;
const translations: Record<Locale, TranslationMap> = { en, es, fr, tr, ar, fa, ur, he };

/** Parse an Accept-Language header into tags in preference order. */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const weight = q ? Number(q.slice(2)) : 1;
      return { tag: tag.trim(), weight: Number.isFinite(weight) ? weight : 0 };
    })
    .filter((x) => x.tag && x.tag !== "*" && x.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .map((x) => x.tag);
}

export async function resolveLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const saved = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;
  const headerStore = await headers();
  const detected = matchBrowserLocale(parseAcceptLanguage(headerStore.get("accept-language")));
  return detected ?? "en";
}

function lookup(map: unknown, parts: string[]): unknown {
  let value = map;
  for (const part of parts) {
    if (value && typeof value === "object" && part in (value as Record<string, unknown>)) {
      value = (value as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return value;
}

export type Translate = (key: string, params?: Record<string, string | number>) => string;

/** A `t()` for one locale, with English fallback and `{{param}}` interpolation. */
export function makeT(locale: Locale): Translate {
  return (key, params) => {
    const parts = key.split(".");
    const value = lookup(translations[locale], parts) ?? lookup(translations.en, parts);
    let result = typeof value === "string" ? value : key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
      }
    }
    return result;
  };
}

/** "29 October 2026" / "29 de octubre de 2026" / "٢٩ أكتوبر ٢٠٢٦", in UTC. */
export function formatDateFor(locale: Locale, iso: string): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return iso;
  return new Date(time).toLocaleDateString(LOCALE_TAG[locale], {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatNumberFor(locale: Locale, n: number): string {
  return n.toLocaleString(LOCALE_TAG[locale]);
}
