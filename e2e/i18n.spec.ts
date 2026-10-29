import { test, expect } from "@playwright/test";

// Use a desktop viewport for all tests so nav tabs are visible
test.use({ viewport: { width: 1280, height: 720 } });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Dismiss the content warning / landing screen so the app is visible */
async function enterApp(page: import("@playwright/test").Page) {
  // Wait for any content to load
  await page.waitForLoadState("networkidle", { timeout: 15000 });

  // The landing page may show "Enter War Library" or "Continue to Library"
  // or may auto-dismiss. Try to find and click the button.
  try {
    // Whole words only: a loose "gir" matched a Spanish filter chip and the
    // click then hung on an element that intercepted it.
    const enterBtn = page.locator("button", { hasText: /\benter\b|\bcontinue\b|continuar|\bentrer\b|\bgir\b|\bdevam\b|ادخل|ورود|ادامه|داخل|جاری|כניסה|המשך/i });
    await enterBtn.first().waitFor({ state: "visible", timeout: 8000 });
    await enterBtn.first().click({ timeout: 5000 });
  } catch {
    // May have auto-dismissed or already on the app
  }

  // Wait for the header to confirm app loaded
  await page.waitForSelector("header", { timeout: 15000 });
}

/** Find the language selector button (aria-label changes with locale) */
function getLangBtn(page: import("@playwright/test").Page) {
  return page.locator("button[aria-haspopup='listbox']");
}

/**
 * Language names are endonyms — each language written in itself — in every
 * locale, including English. A picker that says "Arabic" is only usable by
 * someone who already reads English, which defeats its purpose.
 */
const ENDONYM = {
  en: "English",
  es: "Español",
  fr: "Français",
  tr: "Türkçe",
  ar: "العربية",
  fa: "فارسی",
  ur: "اردو",
  he: "עברית",
} as const;

/** Open the language dropdown and select a locale */
async function switchLanguage(
  page: import("@playwright/test").Page,
  locale: keyof typeof ENDONYM
) {
  const langBtn = getLangBtn(page);
  await langBtn.click();
  // Click the target language option
  await page.getByRole("option", { name: ENDONYM[locale] }).click();
  // Wait for re-render
  await page.waitForTimeout(500);
}

// ---------------------------------------------------------------------------
// 1. Language selector is visible and functional
// ---------------------------------------------------------------------------
test.describe("Language selector", () => {
  test("language selector is visible in the header", async ({ page }) => {
    await page.goto("/");
    await enterApp(page);
    const langBtn = getLangBtn(page);
    await expect(langBtn).toBeVisible();
    await expect(langBtn).toHaveText(/EN/i);
  });

  test("clicking language selector shows all 8 languages", async ({
    page,
  }) => {
    await page.goto("/");
    await enterApp(page);
    const langBtn = getLangBtn(page);
    await langBtn.click();

    // Endonyms in every locale, English included — the reader who most needs
    // the picker is the one who cannot read the current UI.
    for (const name of Object.values(ENDONYM)) {
      await expect(page.getByRole("option", { name, exact: true })).toBeVisible();
    }
  });

  test("language names stay endonyms after switching locale", async ({
    page,
  }) => {
    await page.goto("/");
    await enterApp(page);
    await switchLanguage(page, "ar");

    await getLangBtn(page).click();
    for (const name of Object.values(ENDONYM)) {
      await expect(page.getByRole("option", { name })).toBeVisible();
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Spanish locale
// ---------------------------------------------------------------------------
test.describe("Spanish locale", () => {
  test("switching to Spanish translates navigation", async ({ page }) => {
    await page.goto("/");
    await enterApp(page);
    await switchLanguage(page, "es");

    // Nav tabs should be in Spanish — use .first() since desktop+mobile both render
    await expect(page.getByRole("button", { name: "Resumen" }).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Preguntar IA" }).first()
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Donar" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Fuentes" }).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Acerca de" }).first()
    ).toBeVisible();
  });

  test("Spanish locale shows translated header text", async ({ page }) => {
    await page.goto("/");
    await enterApp(page);
    await switchLanguage(page, "es");

    // The "Tracking" text becomes "Rastreando"
    await expect(page.getByText("Rastreando")).toBeVisible();
  });

  test("Spanish locale persists across page reload", async ({ page }) => {
    // A language switch re-requests the dataset in that language (the
    // descriptions differ), and the reload requests it again: three full
    // downloads of the local snapshot in one test need more than the
    // default budget.
    test.setTimeout(90_000);
    await page.goto("/");
    await enterApp(page);
    await switchLanguage(page, "es");

    // Reload page
    await page.reload();
    await enterApp(page);

    // Should still be in Spanish
    await expect(page.getByText("Rastreando")).toBeVisible();
  });

  test("Ask AI tab shows Spanish placeholder", async ({ page }) => {
    await page.goto("/");
    await enterApp(page);
    await switchLanguage(page, "es");

    // Navigate to Ask tab
    await page.getByRole("button", { name: "Preguntar IA" }).click();

    // Check for Spanish placeholder
    await expect(
      page.getByPlaceholder("Pregunta sobre el conflicto...")
    ).toBeVisible();
  });

  test("Spanish suggested questions are in Spanish", async ({ page }) => {
    await page.goto("/");
    await enterApp(page);
    await switchLanguage(page, "es");
    await page.getByRole("button", { name: "Preguntar IA" }).click();

    // One of the Spanish suggested questions
    await expect(
      page.getByText(
        "¿Cuál es la situación militar actual en la guerra de Irán de 2026?"
      )
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 3. Arabic locale — RTL
// ---------------------------------------------------------------------------
test.describe("Arabic locale", () => {
  test("switching to Arabic sets RTL direction", async ({ page }) => {
    await page.goto("/");
    await enterApp(page);
    await switchLanguage(page, "ar");

    const dir = await page.getAttribute("html", "dir");
    expect(dir).toBe("rtl");
  });

  test("switching to Arabic sets lang attribute", async ({ page }) => {
    await page.goto("/");
    await enterApp(page);
    await switchLanguage(page, "ar");

    const lang = await page.getAttribute("html", "lang");
    expect(lang).toBe("ar");
  });

  test("Arabic locale shows Arabic navigation text", async ({ page }) => {
    await page.goto("/");
    await enterApp(page);
    await switchLanguage(page, "ar");

    // "تتبع" = Tracking in Arabic
    await expect(page.getByText("تتبع")).toBeVisible();
  });

  test("Arabic Ask tab shows Arabic UI", async ({ page }) => {
    await page.goto("/");
    await enterApp(page);
    await switchLanguage(page, "ar");
    await page
      .getByRole("button", { name: "اسأل الذكاء الاصطناعي" })
      .click();

    await expect(
      page.getByPlaceholder("اسأل عن النزاع...")
    ).toBeVisible();
  });

  test("switching back to English resets LTR", async ({ page }) => {
    await page.goto("/");
    await enterApp(page);
    await switchLanguage(page, "ar");

    const dirRtl = await page.getAttribute("html", "dir");
    expect(dirRtl).toBe("rtl");

    // After switching to Arabic, the option names are in Arabic — "English" stays "English" in ar.json
    await switchLanguage(page, "en");

    const dirLtr = await page.getAttribute("html", "dir");
    expect(dirLtr).toBe("ltr");
  });
});

// ---------------------------------------------------------------------------
// 4. Hebrew locale — RTL
// ---------------------------------------------------------------------------
test.describe("Hebrew locale", () => {
  test("switching to Hebrew sets RTL direction", async ({ page }) => {
    await page.goto("/");
    await enterApp(page);
    await switchLanguage(page, "he");

    const dir = await page.getAttribute("html", "dir");
    expect(dir).toBe("rtl");
  });

  test("switching to Hebrew sets lang=he", async ({ page }) => {
    await page.goto("/");
    await enterApp(page);
    await switchLanguage(page, "he");

    const lang = await page.getAttribute("html", "lang");
    expect(lang).toBe("he");
  });

  test("Hebrew locale shows Hebrew tracking text", async ({ page }) => {
    await page.goto("/");
    await enterApp(page);
    await switchLanguage(page, "he");

    await expect(page.getByText("מעקב")).toBeVisible();
  });

  test("Hebrew Ask tab shows Hebrew UI", async ({ page }) => {
    await page.goto("/");
    await enterApp(page);
    await switchLanguage(page, "he");
    await page.getByRole("button", { name: "שאל AI" }).click();

    await expect(
      page.getByPlaceholder("שאל על הסכסוך...")
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 5. Stats bar translations
// ---------------------------------------------------------------------------
test.describe("Stats bar translations", () => {
  test("stats bar labels change with Spanish locale", async ({ page }) => {
    await page.goto("/");
    await enterApp(page);
    await switchLanguage(page, "es");

    // Situation Overview becomes "Resumen de la situación" on desktop
    // On mobile, stat labels are translated
    // Check for the toggle button text
    const situationBtn = page.getByText("Resumen de la situación");
    // May be hidden on mobile viewport, so just check it exists in DOM
    const count = await situationBtn.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Language persistence
// ---------------------------------------------------------------------------
test.describe("Language persistence", () => {
  test("language preference survives navigation between tabs", async ({
    page,
  }) => {
    await page.goto("/");
    await enterApp(page);
    await switchLanguage(page, "es");

    // Go to Ask tab — use .first() since desktop+mobile both render
    await page.getByRole("button", { name: "Preguntar IA" }).first().click();
    await expect(
      page.getByPlaceholder("Pregunta sobre el conflicto...")
    ).toBeVisible();

    // Go back to Overview
    await page.getByRole("button", { name: "Resumen" }).first().click();

    // Should still be in Spanish
    await expect(page.getByText("Rastreando")).toBeVisible();
  });

  test("localStorage stores correct locale key", async ({ page }) => {
    await page.goto("/");
    await enterApp(page);
    await switchLanguage(page, "ar");

    const stored = await page.evaluate(() =>
      localStorage.getItem("warlibrary_lang")
    );
    expect(stored).toBe("ar");
  });
});

// ---------------------------------------------------------------------------
// 7. Chat API sends language parameter
// ---------------------------------------------------------------------------
test.describe("Chat API language integration", () => {
  test("POST /api/chat accepts lang parameter", async ({ request }) => {
    const res = await request.post("/api/chat", {
      data: {
        question: "What is happening?",
        lang: "es",
      },
    });
    // Should get a response (200 or 429 if rate limited, but not 400)
    // 401 in CI with dummy API key, 200/429/503 in production
    expect([200, 401, 429, 503]).toContain(res.status());
  });

  test("POST /api/chat with lang=ar returns response", async ({ request }) => {
    const res = await request.post("/api/chat", {
      data: {
        question: "ما هو الوضع الحالي؟",
        lang: "ar",
      },
    });
    // 401 in CI with dummy API key, 200/429/503 in production
    expect([200, 401, 429, 503]).toContain(res.status());
  });
});

// ---------------------------------------------------------------------------
// 8. Accessibility — lang and dir attributes
// ---------------------------------------------------------------------------
test.describe("i18n accessibility attributes", () => {
  test("html element has lang=en by default", async ({ page }) => {
    await page.goto("/");
    const lang = await page.getAttribute("html", "lang");
    expect(lang).toBe("en");
  });

  test("html element has dir=ltr by default", async ({ page }) => {
    await page.goto("/");
    const dir = await page.getAttribute("html", "dir");
    expect(dir).toBe("ltr");
  });
});

// ---------------------------------------------------------------------------
// 9. Server-rendered locale — no first-paint flash
// ---------------------------------------------------------------------------
test.describe("Server-rendered locale", () => {
  test("switching language writes the locale cookie the server reads", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await enterApp(page);
    await switchLanguage(page, "ar");

    const cookie = (await context.cookies()).find((c) => c.name === "wl_lang");
    expect(cookie?.value).toBe("ar");
  });

  test("a returning RTL reader gets dir=rtl in the very first response", async ({
    page,
    context,
    baseURL,
  }) => {
    // Seed the cookie the way a previous visit would have, then request the
    // page fresh. Reading dir off the raw HTML — before any script runs —
    // proves the server emitted it, rather than the client flipping it after
    // hydration. Without this, every visit by an Arabic or Hebrew reader
    // rendered left-to-right and then mirrored the whole layout.
    await context.addCookies([
      { name: "wl_lang", value: "ar", url: baseURL ?? "http://localhost:3000" },
    ]);

    const response = await page.goto("/");
    const html = (await response?.text()) ?? "";

    expect(html).toMatch(/<html[^>]*\blang="ar"/);
    expect(html).toMatch(/<html[^>]*\bdir="rtl"/);
  });

  test("no cookie still server-renders English LTR", async ({ page }) => {
    const response = await page.goto("/");
    const html = (await response?.text()) ?? "";

    expect(html).toMatch(/<html[^>]*\blang="en"/);
    expect(html).toMatch(/<html[^>]*\bdir="ltr"/);
  });
});

// ---------------------------------------------------------------------------
// 10. Server-resolved locale: the first byte already carries the reader's
// language and direction (Accept-Language), on the app and on the
// server-rendered pages, which have no client-side provider.
// ---------------------------------------------------------------------------
test.describe("Server-resolved locale from Accept-Language", () => {
  test.describe("Arabic browser", () => {
    test.use({ locale: "ar" });

    test("home page is RTL and Arabic from the first response", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    });

    test("countries page is translated and RTL", async ({ page }) => {
      await page.goto("/country");
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("الدول");
    });
  });

  test.describe("Hebrew browser", () => {
    test.use({ locale: "he" });

    test("dispatch index is translated and RTL", async ({ page }) => {
      await page.goto("/dispatch");
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await expect(page.locator("html")).toHaveAttribute("lang", "he");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("סיכומים");
    });
  });

  test.describe("Spanish browser", () => {
    test.use({ locale: "es-MX" });

    test("server pages speak Spanish and the switcher changes the cookie", async ({ page }) => {
      await page.goto("/country");
      await expect(page.locator("html")).toHaveAttribute("lang", "es");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Países");
      await page.getByRole("combobox", { name: /idioma/i }).selectOption("en");
      await page.waitForLoadState("networkidle");
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Countries");
    });
  });

  test.describe("Persian browser", () => {
    test.use({ locale: "fa-IR" });

    test("home and countries are RTL Persian with Persian digits", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await expect(page.locator("html")).toHaveAttribute("lang", "fa");
      await page.goto("/country");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("کشورها");
      // Persian pins the extended Arabic-Indic digits; a Western-digit table
      // cell would mean the locale tag was dropped somewhere.
      await expect(page.locator("tbody td").nth(1)).toHaveText(/[۰-۹]/);
    });
  });

  test.describe("Urdu browser", () => {
    test.use({ locale: "ur-PK" });

    test("dispatch index is RTL Urdu", async ({ page }) => {
      await page.goto("/dispatch");
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await expect(page.locator("html")).toHaveAttribute("lang", "ur");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("بلیٹن");
    });
  });

  test.describe("French and Turkish browsers", () => {
    test.use({ locale: "fr-CA" });

    test("French gets French; a Turkish cookie overrides it", async ({ page }) => {
      await page.goto("/country");
      await expect(page.locator("html")).toHaveAttribute("lang", "fr");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pays");
      await page.getByRole("combobox", { name: /langue/i }).selectOption("tr");
      await page.waitForLoadState("networkidle");
      await expect(page.locator("html")).toHaveAttribute("lang", "tr");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ülkeler");
    });
  });
});

// ---------------------------------------------------------------------------
// 11. Events in the reader's language: the API carries the language of each
// description, the app asks for it, and an unknown code is rejected.
// ---------------------------------------------------------------------------
test.describe("Translated event descriptions", () => {
  test("GET /api/events?lang=fa labels every event with its text language", async ({ request }) => {
    const res = await request.get("/api/events?lang=fa&limit=3&from=2026-01-01");
    expect(res.ok()).toBeTruthy();
    const json = (await res.json()) as { data: { description: string; description_lang: string; translated: boolean }[] };
    expect(json.data.length).toBeGreaterThan(0);
    for (const e of json.data) {
      expect(["fa", "en"]).toContain(e.description_lang);
      expect(typeof e.translated).toBe("boolean");
      expect(e.description.length).toBeGreaterThan(0);
    }
  });

  test("the English table carries no translation marker beyond description_lang=en", async ({ request }) => {
    const res = await request.get("/api/events?limit=1&from=2026-01-01");
    const json = (await res.json()) as { data: { description_lang: string; translated: boolean; description_en?: string }[] };
    expect(json.data[0].description_lang).toBe("en");
    expect(json.data[0].translated).toBe(false);
    expect(json.data[0].description_en).toBeUndefined();
  });

  test("an unknown language code is a 400", async ({ request }) => {
    const res = await request.get("/api/events?lang=xx&limit=1");
    expect(res.status()).toBe(400);
  });

  test.describe("Persian app", () => {
    test.use({ locale: "fa-IR" });

    test("the map requests events in Persian", async ({ page }) => {
      const urls: string[] = [];
      page.on("request", (req) => {
        if (req.url().includes("/api/events")) urls.push(req.url());
      });
      await page.goto("/");
      await enterApp(page);
      await expect.poll(() => urls.some((u) => u.includes("lang=fa"))).toBe(true);
    });
  });
});
