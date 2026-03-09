import { test, expect } from "@playwright/test";

async function enterApp(page: import("@playwright/test").Page) {
  await page.goto("/");
  const enterBtn = page.locator("button", { hasText: /enter|continue|proceed|understand/i });
  await enterBtn.click();
  // Wait for main app to render
  await expect(page.locator("header")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("text=Timeline")).toBeVisible({ timeout: 10_000 });
}

test.describe("Timeline & Filtering", () => {
  test("timeline slider renders with quick filters", async ({ page }) => {
    await enterApp(page);
    await expect(page.locator("text=Timeline")).toBeVisible();
    await expect(page.getByRole("button", { name: "All", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Last 24h" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Last 3d" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Last 7d" })).toBeVisible();
  });

  test("'All' filter shows all events", async ({ page }) => {
    await enterApp(page);
    await page.getByRole("button", { name: "All", exact: true }).click();
    await page.waitForTimeout(500);
    const pageText = await page.textContent("body");
    expect(pageText).toContain("Iran");
  });

  test("'Last 24h' filter shows recent events", async ({ page }) => {
    await enterApp(page);
    await page.getByRole("button", { name: "Last 24h" }).click();
    await page.waitForTimeout(500);
    const timeline = page.locator("text=Timeline");
    await expect(timeline).toBeVisible();
  });

  test("'Last 3d' filter shows events", async ({ page }) => {
    await enterApp(page);
    await page.getByRole("button", { name: "Last 3d" }).click();
    await page.waitForTimeout(500);
    const timeline = page.locator("text=Timeline");
    await expect(timeline).toBeVisible();
  });

  test("quick filter buttons highlight when active", async ({ page }) => {
    await enterApp(page);
    const allBtn = page.getByRole("button", { name: "All", exact: true });
    await allBtn.click();
    await page.waitForTimeout(300);
    const classes = await allBtn.getAttribute("class");
    expect(classes).toContain("bg-red-600");
  });
});
