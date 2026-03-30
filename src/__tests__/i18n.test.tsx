// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Import i18n system
// ---------------------------------------------------------------------------
import {
  I18nProvider,
  useI18n,
  LOCALES,
  AI_SYSTEM_PROMPTS,
  type Locale,
} from "@/i18n";
import en from "@/i18n/en.json";
import es from "@/i18n/es.json";
import ar from "@/i18n/ar.json";
import he from "@/i18n/he.json";

const allTranslations: Record<string, Record<string, unknown>> = { en, es, ar, he };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively collect all leaf key paths from a nested object */
function collectKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      keys.push(...collectKeys(v as Record<string, unknown>, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

const enKeys = collectKeys(en);

function wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>;
}

// ---------------------------------------------------------------------------
// 1. Translation file structure & completeness
// ---------------------------------------------------------------------------
describe("Translation file completeness", () => {
  const locales = ["es", "ar", "he"] as const;

  for (const locale of locales) {
    describe(`${locale} translations`, () => {
      const localeKeys = collectKeys(
        allTranslations[locale] as Record<string, unknown>
      );

      it("has every key that English has", () => {
        const missing = enKeys.filter((k) => !localeKeys.includes(k));
        expect(missing).toEqual([]);
      });

      it("has no extra keys that English does not have", () => {
        const extra = localeKeys.filter((k) => !enKeys.includes(k));
        expect(extra).toEqual([]);
      });

      it("every value is a non-empty string", () => {
        for (const key of localeKeys) {
          const parts = key.split(".");
          let val: unknown = allTranslations[locale];
          for (const p of parts) {
            val = (val as Record<string, unknown>)[p];
          }
          expect(typeof val).toBe("string");
          expect((val as string).length).toBeGreaterThan(0);
        }
      });
    });
  }

  it("English has at least 100 translation keys", () => {
    expect(enKeys.length).toBeGreaterThanOrEqual(100);
  });

  it("all LOCALES are represented in translation files", () => {
    for (const locale of LOCALES) {
      expect(allTranslations[locale]).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Translation values — no untranslated English left in non-EN locales
// ---------------------------------------------------------------------------
describe("Translation values are actually translated", () => {
  // We can't check every single value (some short words like "24h" are the
  // same) but we CAN check that major sections differ from English.
  const sectionRoots = [
    "nav",
    "header",
    "ticker",
    "stats",
    "eventPanel",
    "ask",
    "landing",
    "language",
  ];

  for (const locale of ["es", "ar", "he"] as const) {
    it(`${locale}: major sections differ from English`, () => {
      let identicalCount = 0;
      let totalChecked = 0;
      for (const section of sectionRoots) {
        const sectionKeys = enKeys.filter((k) => k.startsWith(`${section}.`));
        for (const key of sectionKeys) {
          const parts = key.split(".");
          let enVal: unknown = en;
          let localeVal: unknown = allTranslations[locale];
          for (const p of parts) {
            enVal = (enVal as Record<string, unknown>)[p];
            localeVal = (localeVal as Record<string, unknown>)[p];
          }
          totalChecked++;
          if (enVal === localeVal) identicalCount++;
        }
      }
      // Allow up to 30% identical (some short strings like "AI" or "24H" may match)
      const identicalPct = identicalCount / totalChecked;
      expect(identicalPct).toBeLessThan(0.3);
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Suggested questions (q1–q12) are translated
// ---------------------------------------------------------------------------
describe("AI suggested questions are translated", () => {
  const questionKeys = Array.from({ length: 12 }, (_, i) => `ask.q${i + 1}`);

  for (const locale of ["es", "ar", "he"] as const) {
    it(`${locale}: all 12 suggested questions differ from English`, () => {
      for (const key of questionKeys) {
        const parts = key.split(".");
        let enVal: unknown = en;
        let localeVal: unknown = allTranslations[locale];
        for (const p of parts) {
          enVal = (enVal as Record<string, unknown>)[p];
          localeVal = (localeVal as Record<string, unknown>)[p];
        }
        expect(localeVal).not.toBe(enVal);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 4. AI system prompts
// ---------------------------------------------------------------------------
describe("AI system prompts", () => {
  it("every locale has a system prompt entry", () => {
    for (const locale of LOCALES) {
      expect(AI_SYSTEM_PROMPTS[locale]).toBeDefined();
      expect(typeof AI_SYSTEM_PROMPTS[locale]).toBe("string");
    }
  });

  it("English prompt is empty (uses the default chat route prompt)", () => {
    expect(AI_SYSTEM_PROMPTS.en).toBe("");
  });

  it("non-English prompts are substantial (>200 chars)", () => {
    for (const locale of ["es", "ar", "he"] as const) {
      expect(AI_SYSTEM_PROMPTS[locale].length).toBeGreaterThan(200);
    }
  });

  it("Spanish prompt is in Spanish", () => {
    expect(AI_SYSTEM_PROMPTS.es).toContain("REGLAS");
    expect(AI_SYSTEM_PROMPTS.es).toContain("español");
  });

  it("Arabic prompt is in Arabic", () => {
    expect(AI_SYSTEM_PROMPTS.ar).toMatch(/[\u0600-\u06FF]/); // Arabic Unicode range
  });

  it("Hebrew prompt is in Hebrew", () => {
    expect(AI_SYSTEM_PROMPTS.he).toMatch(/[\u0590-\u05FF]/); // Hebrew Unicode range
  });
});

// ---------------------------------------------------------------------------
// 5. RTL configuration
// ---------------------------------------------------------------------------
describe("RTL configuration", () => {
  it("Arabic is an RTL locale", () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    act(() => result.current.setLocale("ar"));
    expect(result.current.dir).toBe("rtl");
  });

  it("Hebrew is an RTL locale", () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    act(() => result.current.setLocale("he"));
    expect(result.current.dir).toBe("rtl");
  });

  it("English is an LTR locale", () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    act(() => result.current.setLocale("en"));
    expect(result.current.dir).toBe("ltr");
  });

  it("Spanish is an LTR locale", () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    act(() => result.current.setLocale("es"));
    expect(result.current.dir).toBe("ltr");
  });

  it("sets document.dir when locale changes", () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    act(() => result.current.setLocale("ar"));
    expect(document.documentElement.dir).toBe("rtl");
    act(() => result.current.setLocale("en"));
    expect(document.documentElement.dir).toBe("ltr");
  });

  it("sets document.lang when locale changes", () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    act(() => result.current.setLocale("he"));
    expect(document.documentElement.lang).toBe("he");
    act(() => result.current.setLocale("es"));
    expect(document.documentElement.lang).toBe("es");
  });
});

// ---------------------------------------------------------------------------
// 6. useI18n hook — t() function behavior
// ---------------------------------------------------------------------------
describe("useI18n hook — t() function", () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { localStorage.clear(); });

  it("returns English translation by default", () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.t("app.title")).toBe("WAR LIBRARY");
  });

  it("returns Spanish translation after switching locale", () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    act(() => result.current.setLocale("es"));
    expect(result.current.t("app.live")).toBe("En vivo");
  });

  it("returns Arabic translation after switching locale", () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    act(() => result.current.setLocale("ar"));
    expect(result.current.t("app.live")).toBe("مباشر");
  });

  it("returns Hebrew translation after switching locale", () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    act(() => result.current.setLocale("he"));
    expect(result.current.t("app.live")).toBe("שידור חי");
  });

  it("falls back to English for missing keys", () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    act(() => result.current.setLocale("es"));
    // If we use a key that somehow only exists in English, it should fall back
    expect(result.current.t("app.title")).toBe("WAR LIBRARY");
  });

  it("returns the key string for completely unknown keys", () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.t("nonexistent.key.path")).toBe(
      "nonexistent.key.path"
    );
  });

  it("handles deeply nested keys", () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.t("modal.civilianFatalitiesLabel")).toBe(
      "Civilian Fatalities"
    );
  });
});

// ---------------------------------------------------------------------------
// 7. useI18n hook — locale persistence
// ---------------------------------------------------------------------------
describe("useI18n hook — locale persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("saves locale to localStorage on setLocale", () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    act(() => result.current.setLocale("ar"));
    expect(localStorage.getItem("warlibrary_lang")).toBe("ar");
  });

  it("reads saved locale from localStorage on mount", () => {
    localStorage.setItem("warlibrary_lang", "es");
    const { result } = renderHook(() => useI18n(), { wrapper });
    // The useEffect runs asynchronously in happy-dom
    // After the effect fires, locale should be "es"
    expect(result.current.locale).toBe("es");
  });

  it("ignores invalid localStorage values", () => {
    localStorage.setItem("warlibrary_lang", "xx");
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.locale).toBe("en"); // stays default
  });
});

// ---------------------------------------------------------------------------
// 8. LOCALES constant
// ---------------------------------------------------------------------------
describe("LOCALES constant", () => {
  it("contains exactly en, es, ar, he", () => {
    expect(LOCALES).toEqual(["en", "es", "ar", "he"]);
  });

  it("matches the keys in AI_SYSTEM_PROMPTS", () => {
    const promptKeys = Object.keys(AI_SYSTEM_PROMPTS).sort();
    const localesSorted = [...LOCALES].sort();
    expect(promptKeys).toEqual(localesSorted);
  });
});

// ---------------------------------------------------------------------------
// 9. Language selector rendering
// ---------------------------------------------------------------------------
describe("Language selector in Header", () => {
  let Header: typeof import("@/components/ui/Header").default;

  beforeEach(async () => {
    const mod = await import("@/components/ui/Header");
    Header = mod.default;
  });

  it("renders a language selector button", () => {
    render(
      <I18nProvider>
        <Header
          lastUpdated="just now"
          activeTab="map"
          onTabChange={() => {}}
          eventCount={100}
          dayCount={30}
        />
      </I18nProvider>
    );
    // The button shows the current locale abbreviation
    const langBtn = screen.getByLabelText(/language/i);
    expect(langBtn).toBeInTheDocument();
    expect(langBtn).toHaveTextContent("EN");
  });

  it("opens dropdown with all languages on click", () => {
    render(
      <I18nProvider>
        <Header
          lastUpdated="just now"
          activeTab="map"
          onTabChange={() => {}}
          eventCount={100}
          dayCount={30}
        />
      </I18nProvider>
    );
    const langBtn = screen.getByLabelText(/language/i);
    fireEvent.click(langBtn);

    // In English locale, language names are in English
    expect(screen.getByText("English")).toBeInTheDocument();
    expect(screen.getByText("Spanish")).toBeInTheDocument();
    expect(screen.getByText("Arabic")).toBeInTheDocument();
    expect(screen.getByText("Hebrew")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 10. AskPanel uses translations
// ---------------------------------------------------------------------------
describe("AskPanel respects locale", () => {
  let AskPanel: typeof import("@/components/chat/AskPanel").default;

  beforeEach(async () => {
    vi.stubGlobal("fetch", vi.fn());
    const mod = await import("@/components/chat/AskPanel");
    AskPanel = mod.default;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders Spanish placeholder when locale is es", () => {
    localStorage.setItem("warlibrary_lang", "es");
    render(
      <I18nProvider>
        <AskPanel events={[]} />
      </I18nProvider>
    );
    expect(
      screen.getByPlaceholderText("Pregunta sobre el conflicto...")
    ).toBeInTheDocument();
    localStorage.clear();
  });

  it("renders Arabic placeholder when locale is ar", () => {
    localStorage.setItem("warlibrary_lang", "ar");
    render(
      <I18nProvider>
        <AskPanel events={[]} />
      </I18nProvider>
    );
    expect(
      screen.getByPlaceholderText("اسأل عن النزاع...")
    ).toBeInTheDocument();
    localStorage.clear();
  });

  it("renders Hebrew placeholder when locale is he", () => {
    localStorage.setItem("warlibrary_lang", "he");
    render(
      <I18nProvider>
        <AskPanel events={[]} />
      </I18nProvider>
    );
    expect(
      screen.getByPlaceholderText("שאל על הסכסוך...")
    ).toBeInTheDocument();
    localStorage.clear();
  });

  it("sends lang parameter in fetch body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: { answer: "resp", sources: [], remaining: 9 },
        }),
    });
    vi.stubGlobal("fetch", fetchMock);
    localStorage.setItem("warlibrary_lang", "es");

    render(
      <I18nProvider>
        <AskPanel events={[]} />
      </I18nProvider>
    );

    const input = screen.getByPlaceholderText("Pregunta sobre el conflicto...");
    fireEvent.change(input, { target: { value: "Test" } });
    fireEvent.click(screen.getByLabelText("Enviar"));

    // Wait for fetch
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: "Test", lang: "es" }),
      });
    });
    localStorage.clear();
  });
});

// ---------------------------------------------------------------------------
// 11. Translation string quality checks
// ---------------------------------------------------------------------------
describe("Translation string quality", () => {
  it("no translation value contains raw HTML tags", () => {
    for (const locale of LOCALES) {
      const keys = collectKeys(allTranslations[locale] as Record<string, unknown>);
      for (const key of keys) {
        const parts = key.split(".");
        let val: unknown = allTranslations[locale];
        for (const p of parts) val = (val as Record<string, unknown>)[p];
        if (typeof val === "string") {
          expect(val).not.toMatch(/<[a-z]+[\s>]/i);
        }
      }
    }
  });

  it("no translation value contains template literal placeholders like ${", () => {
    for (const locale of LOCALES) {
      const keys = collectKeys(allTranslations[locale] as Record<string, unknown>);
      for (const key of keys) {
        const parts = key.split(".");
        let val: unknown = allTranslations[locale];
        for (const p of parts) val = (val as Record<string, unknown>)[p];
        if (typeof val === "string") {
          expect(val).not.toContain("${");
        }
      }
    }
  });

  it("language.label key exists in every locale", () => {
    for (const locale of LOCALES) {
      const t = allTranslations[locale] as Record<string, Record<string, string>>;
      expect(t.language.label).toBeDefined();
      expect(t.language.label.length).toBeGreaterThan(0);
    }
  });

  it("every locale lists all locale names in language section", () => {
    for (const locale of LOCALES) {
      const t = allTranslations[locale] as Record<string, Record<string, string>>;
      for (const l of LOCALES) {
        expect(t.language[l]).toBeDefined();
        expect(t.language[l].length).toBeGreaterThan(0);
      }
    }
  });
});
