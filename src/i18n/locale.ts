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

export type Locale = "en" | "es" | "ar" | "he";

export const LOCALES: Locale[] = ["en", "es", "ar", "he"];

/**
 * The locale is mirrored into a cookie as well as localStorage so the server
 * can read it during SSR. Without it, every visit renders English/LTR first and
 * then flips after hydration — for an Arabic or Hebrew reader that means the
 * whole layout mirroring on every single page load.
 */
export const LOCALE_COOKIE = "wl_lang";

export function isLocale(value: string | undefined | null): value is Locale {
  return typeof value === "string" && (LOCALES as string[]).includes(value);
}

export function localeDir(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" || locale === "he" ? "rtl" : "ltr";
}

/** Best matching supported locale for a list of browser language tags. */
export function matchBrowserLocale(languages: readonly string[]): Locale | null {
  for (const tag of languages) {
    const base = tag.toLowerCase().split("-")[0];
    if (isLocale(base)) return base;
  }
  return null;
}
