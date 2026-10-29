"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import en from "./en.json";
import es from "./es.json";
import ar from "./ar.json";
import he from "./he.json";

// Locale primitives live in ./locale so server components can use them. This
// module is "use client"; anything a server component imports must not come
// from here. Re-exported for the many client call sites that import from "@/i18n".
import {
  LOCALE_COOKIE,
  LOCALES,
  isLocale,
  localeDir,
  matchBrowserLocale,
  type Locale,
} from "./locale";

export {
  LOCALE_COOKIE,
  LOCALES,
  isLocale,
  localeDir,
  matchBrowserLocale,
  type Locale,
};

type TranslationMap = typeof en;
const translations: Record<Locale, TranslationMap> = { en, es, ar, he };

const STORAGE_KEY = "warlibrary_lang";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  dir: "ltr" | "rtl";
  isRTL: boolean;
}

const I18nContext = createContext<I18nContextType>({
  locale: "en",
  setLocale: () => {},
  t: (key: string) => key,
  dir: "ltr",
  isRTL: false,
});

export function I18nProvider({
  children,
  initialLocale = "en",
}: {
  children: ReactNode;
  /**
   * Locale resolved on the server (cookie, else Accept-Language) so the first
   * paint is correct. Every server wrapper passes it; the default is only for
   * tests and stories.
   */
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  // Resolve the reader's language preference.
  //
  // Order: an explicit saved choice always wins; otherwise fall back to the
  // browser's own languages. The server already applied the same order from
  // the cookie and Accept-Language, so this only changes anything when a
  // saved choice exists in localStorage but the cookie was lost.
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) {
      setLocaleState(saved);
      return;
    }
    const detected = matchBrowserLocale(navigator.languages ?? [navigator.language]);
    if (detected && detected !== initialLocale) {
      setLocaleState(detected);
    }
  }, [initialLocale]);

  // Apply RTL dir and lang to document
  useEffect(() => {
    document.documentElement.dir = localeDir(locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem(STORAGE_KEY, l);
    // Mirror to a cookie so the next SSR render starts in the right language.
    document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
  }, []);

  // Nested key lookup: t("app.title") -> translations[locale].app.title
  // Supports interpolation: t("time.hoursAgo", { n: 3 }) -> "3h ago"
  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    const parts = key.split(".");
    let value: unknown = translations[locale];
    for (const part of parts) {
      if (value && typeof value === "object" && part in value) {
        value = (value as Record<string, unknown>)[part];
      } else {
        // Fallback to English
        let fallback: unknown = translations.en;
        for (const p of parts) {
          if (fallback && typeof fallback === "object" && p in fallback) {
            fallback = (fallback as Record<string, unknown>)[p];
          } else {
            return key; // Key not found at all
          }
        }
        value = fallback;
        break;
      }
    }
    let result = typeof value === "string" ? value : key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
      }
    }
    return result;
  }, [locale]);

  const dir = localeDir(locale);
  // Derived from dir so the two can never disagree. This previously read
  // `locale === "ar"`, which reported Hebrew as left-to-right while `dir` said
  // otherwise.
  const isRTL = dir === "rtl";

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, dir, isRTL }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

// The per-language AI system prompts that used to live here were dead code:
// the chat route builds its own prompt from the conflict registry and adds a
// short language directive (see src/app/api/chat/route.ts).
