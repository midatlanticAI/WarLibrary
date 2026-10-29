import { describe, it, expect, vi } from "vitest";

// next/headers is only available inside a request; stub it so the pure
// helpers can be imported and the resolver exercised with controlled inputs.
const cookieJar = new Map<string, string>();
const headerBag = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (k: string) => (cookieJar.has(k) ? { value: cookieJar.get(k) } : undefined) }),
  headers: async () => ({ get: (k: string) => headerBag.get(k.toLowerCase()) ?? null }),
}));

const { parseAcceptLanguage, resolveLocale, makeT, formatDateFor, formatNumberFor } = await import("@/i18n/server");

describe("parseAcceptLanguage", () => {
  it("orders by q weight and drops wildcards", () => {
    expect(parseAcceptLanguage("fr-CH, fr;q=0.9, en;q=0.8, de;q=0.7, *;q=0.5")).toEqual(["fr-CH", "fr", "en", "de"]);
    expect(parseAcceptLanguage("ar-EG,ar;q=0.9,en-US;q=0.8")).toEqual(["ar-EG", "ar", "en-US"]);
    expect(parseAcceptLanguage("")).toEqual([]);
    expect(parseAcceptLanguage(null)).toEqual([]);
    expect(parseAcceptLanguage("he;q=0")).toEqual([]);
  });
});

describe("resolveLocale", () => {
  it("prefers the cookie, then Accept-Language, then English", async () => {
    cookieJar.clear();
    headerBag.clear();
    expect(await resolveLocale()).toBe("en");
    headerBag.set("accept-language", "he-IL,he;q=0.9,en;q=0.5");
    expect(await resolveLocale()).toBe("he");
    headerBag.set("accept-language", "fr-FR,fr;q=0.9");
    expect(await resolveLocale()).toBe("en");
    headerBag.set("accept-language", "fr-FR,es;q=0.9");
    expect(await resolveLocale()).toBe("es");
    cookieJar.set("wl_lang", "ar");
    expect(await resolveLocale()).toBe("ar");
    cookieJar.set("wl_lang", "xx");
    expect(await resolveLocale()).toBe("es");
  });
});

describe("makeT", () => {
  it("translates, interpolates and falls back to English", () => {
    const es = makeT("es");
    expect(es("pages.countries")).toBe("Países");
    expect(es("pages.revision", { n: 3 })).toBe("Revisión 3");
    expect(es("eventTypes.airstrike")).toBe("Ataque aéreo");
    expect(makeT("ar")("pages.sourcesN", { n: "٢" })).toBe("المصادر (٢)");
    expect(makeT("he")("nope.missing")).toBe("nope.missing");
  });

  it("every pages.* key exists in every locale", async () => {
    const en = (await import("@/i18n/en.json")).default as Record<string, unknown>;
    const pages = en.pages as Record<string, unknown>;
    for (const locale of ["es", "ar", "he"] as const) {
      const t = makeT(locale);
      for (const key of Object.keys(pages)) {
        if (typeof pages[key] === "string") {
          expect(t(`pages.${key}`), `${locale} pages.${key}`).not.toBe(`pages.${key}`);
        }
      }
    }
  });
});

describe("formatters", () => {
  it("formats dates and numbers per locale, in UTC", () => {
    expect(formatDateFor("en", "2026-10-29T23:30:00Z")).toBe("29 October 2026");
    expect(formatDateFor("es", "2026-10-29T23:30:00Z")).toBe("29 de octubre de 2026");
    expect(formatDateFor("ar", "2026-10-29T23:30:00Z")).toMatch(/٢٩/);
    expect(formatDateFor("he", "2026-10-29T23:30:00Z")).toMatch(/2026/);
    expect(formatDateFor("en", "not a date")).toBe("not a date");
    expect(formatNumberFor("en", 12345)).toBe("12,345");
    expect(formatNumberFor("ar", 12)).toMatch(/[٠-٩]/);
  });
});
