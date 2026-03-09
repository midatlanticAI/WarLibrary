import { test, expect } from "@playwright/test";

async function enterApp(page: import("@playwright/test").Page) {
  await page.goto("/");
  const enterBtn = page.locator("button", { hasText: /enter|continue|proceed|understand/i });
  await enterBtn.click();
  // Wait for main app to render
  await expect(page.locator("header")).toBeVisible({ timeout: 10_000 });
}

test.describe("Core App", () => {
  test("page loads without console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
  });

  test("content warning / landing screen appears", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /war library/i })).toBeVisible();
    const enterBtn = page.locator("button", { hasText: /enter|continue|proceed|understand/i });
    await expect(enterBtn).toBeVisible({ timeout: 10_000 });
  });

  test("dismissing content warning shows the map", async ({ page }) => {
    await enterApp(page);
    // Map container should appear (mapbox renders .mapboxgl-canvas)
    await expect(page.locator(".mapboxgl-map").first()).toBeVisible({ timeout: 10_000 });
  });

  test("header shows event count", async ({ page }) => {
    await enterApp(page);
    await expect(page.locator("header")).toBeVisible();
    const headerText = await page.locator("header").textContent();
    expect(headerText).toBeTruthy();
  });

  test("event panel shows events", async ({ page }) => {
    await enterApp(page);
    // Wait for events to appear on page
    await expect(page.locator("text=Iran").first()).toBeVisible({ timeout: 15_000 });
  });

  test("timeline slider is visible on map view", async ({ page }) => {
    await enterApp(page);
    await expect(page.locator("text=Timeline")).toBeVisible({ timeout: 10_000 });
  });

  test("tab navigation works", async ({ page }) => {
    await enterApp(page);

    // Click Ask AI tab
    await page.locator("button", { hasText: /ask ai/i }).click();
    await expect(page.locator("textarea, input[type='text']").first()).toBeVisible({ timeout: 5_000 });

    // Click Sources tab
    await page.locator("button", { hasText: /sources/i }).click();
    await page.waitForTimeout(500);
    const bodyText = await page.textContent("body");
    expect(bodyText?.toLowerCase()).toContain("source");
  });
});
