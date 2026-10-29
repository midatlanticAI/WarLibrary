"use client";

import { LOCALES, LOCALE_COOKIE, type Locale } from "@/i18n/locale";

/** Endonyms: a language's own name never needs translating. */
const ENDONYM: Record<Locale, string> = {
  en: "English",
  es: "Español",
  ar: "العربية",
  he: "עברית",
};

const STORAGE_KEY = "warlibrary_lang";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * Language switcher for the server-rendered pages, which have no client-side
 * i18n provider. Persists the choice the same way the map's switcher does
 * (cookie for the server, localStorage for the app) and reloads so the page
 * re-renders in the new language from the first byte.
 */
export default function LocaleSwitcher({ locale, label }: { locale: Locale; label: string }) {
  function change(next: string) {
    if (!(LOCALES as string[]).includes(next)) return;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode: the cookie still carries the choice */
    }
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
    window.location.reload();
  }
  return (
    <label className="flex items-center gap-1 text-xs text-zinc-400">
      <span className="sr-only">{label}</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
      <select
        value={locale}
        onChange={(e) => change(e.target.value)}
        aria-label={label}
        className="rounded-md border border-transparent bg-transparent py-1 pe-1 text-xs font-medium text-zinc-400 hover:text-zinc-200 focus:border-zinc-700 focus:outline-none"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} className="bg-[#111] text-zinc-200">
            {ENDONYM[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
