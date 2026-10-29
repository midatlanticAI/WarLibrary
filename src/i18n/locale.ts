/**
 * Locale primitives shared by server and client.
 *
 * These deliberately live outside `src/i18n/index.tsx`, which is a
 * `"use client"` module. The root layout is a server component and needs
 * `isLocale` / `localeDir` to emit the correct `lang` and `dir` on the first
 * byte; importing them from the client module made every server render throw
 * "Attempted to call isLocale() from the server but isLocale is on the client".
 *
 * That failure typechecked and built cleanly — it only appears at runtime,
 * which is why it reached CI rather than the compiler.
 *
 * Nothing here may import React or anything client-only.
 */

export type Locale = "en" | "es" | "fr" | "tr" | "ar" | "fa" | "ur" | "he";

/**
 * Order is the order of the language pickers: Latin-script languages first,
 * then the Arabic-script ones, then Hebrew. Adding a language means: this
 * list, `LOCALE_TAG`, `RTL_LOCALES` if right-to-left, `ENDONYM`, a JSON file
 * in this directory (parity is enforced by tests), a font in the root layout
 * when the script needs one, a `language.<code>` key in every JSON file, and
 * a chat directive in the chat route. Content translation (event
 * descriptions, dispatches) follows automatically from this list: the
 * translator scripts translate into every locale except English.
 */
export const LOCALES: Locale[] = ["en", "es", "fr", "tr", "ar", "fa", "ur", "he"];

/** A locale the content translators produce (everything but the source language). */
export type ContentLocale = Exclude<Locale, "en">;

export const CONTENT_LOCALES: ContentLocale[] = LOCALES.filter((l): l is ContentLocale => l !== "en");

const RTL_LOCALES: ReadonlySet<Locale> = new Set<Locale>(["ar", "fa", "ur", "he"]);

/**
 * A language's own name never needs translating: the reader who most needs
 * the picker is the one who cannot read the current interface language.
 */
export const ENDONYM: Record<Locale, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  tr: "Türkçe",
  ar: "العربية",
  fa: "فارسی",
  ur: "اردو",
  he: "עברית",
};

/** English names, for prompts and logs. */
export const LANGUAGE_NAME: Record<Locale, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  tr: "Turkish",
  ar: "Arabic",
  fa: "Persian",
  ur: "Urdu",
  he: "Hebrew",
};

/**
 * The locale is mirrored into a cookie as well as localStorage so the server
 * can read it during SSR. Without it, every visit renders English/LTR first and
 * then flips after hydration — for an Arabic or Hebrew reader that means the
 * whole layout mirroring on every single page load.
 */
export const LOCALE_COOKIE = "wl_lang";

/**
 * BCP 47 tags for every Intl call, server and client, so dates and numbers
 * render the same way everywhere. Arabic pins Arabic-Indic digits
 * (`nu-arab`) and Persian pins the extended set (`nu-arabext`, ۰-۹) because
 * the strings in those files use them; ICU's default for a bare tag differs
 * between Node and browsers, and a page that mixes ٢٠٢٦ in one sentence with
 * 2026 in the next looks careless. Urdu on the web overwhelmingly uses
 * Western digits, so `ur-PK` is left on its default (latn). Switching a
 * language's digit style is this one tag plus the digits in its JSON file.
 */
export const LOCALE_TAG: Record<Locale, string> = {
  en: "en-GB",
  es: "es",
  fr: "fr-FR",
  tr: "tr-TR",
  ar: "ar-u-nu-arab",
  fa: "fa-u-nu-arabext",
  ur: "ur-PK",
  he: "he-IL",
};

export function isLocale(value: string | undefined | null): value is Locale {
  return typeof value === "string" && (LOCALES as string[]).includes(value);
}

export function localeDir(locale: Locale): "ltr" | "rtl" {
  return RTL_LOCALES.has(locale) ? "rtl" : "ltr";
}

/**
 * `lang`/`dir` attributes for a run of content text inside a page. When the
 * text is in the page's own language nothing is needed; otherwise the run is
 * isolated with its own language and direction so the bidi algorithm cannot
 * reorder a mixed run like "Bushehr, Iran — 12 killed" inside an RTL page,
 * and screen readers switch voice.
 */
export function textAttrs(textLocale: Locale | string | null | undefined, pageLocale: Locale): { lang?: string; dir?: "ltr" | "rtl" } {
  const text = isLocale(textLocale) ? textLocale : "en";
  if (text === pageLocale) return {};
  return { lang: text, dir: localeDir(text) };
}

/** Best matching supported locale for a list of browser language tags. */
export function matchBrowserLocale(languages: readonly string[]): Locale | null {
  for (const tag of languages) {
    const base = tag.toLowerCase().split("-")[0];
    if (isLocale(base)) return base;
  }
  return null;
}
