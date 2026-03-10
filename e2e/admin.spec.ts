import { test, expect } from "@playwright/test";
import fs from "fs";

// Read ADMIN_SECRET from .env.local
function getAdminSecret(): string {
  const envPath = "/opt/warlibrary/.env.local";
  const content = fs.readFileSync(envPath, "utf-8");
  const match = content.match(/ADMIN_SECRET=(.+)/);
  return match ? match[1].trim() : "";
}

test.describe("Admin Dashboard", () => {
  test("/admin loads login screen", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.locator("text=War Library Admin")).toBeVisible();
    await expect(page.locator("input[type='password']")).toBeVisible();
    await expect(page.locator("button", { hasText: "Login" })).toBeVisible();
  });

  test("invalid secret shows error", async ({ page }) => {
    await page.goto("/admin");
    await page.fill("input[type='password']", "wrong-secret");
    await page.click("button", { hasText: "Login" } as { hasText: string });
    await expect(page.locator("text=Invalid secret")).toBeVisible({ timeout: 5_000 });
  });

  test("POST /api/admin with wrong secret returns 403", async ({ request }) => {
    const res = await request.post("/api/admin", {
      data: { secret: "wrong" },
    });
    expect(res.status()).toBe(403);
  });

  test("valid login shows dashboard with tabs", async ({ page }) => {
    const secret = getAdminSecret();
    if (!secret) { test.skip(); return; }

    await page.goto("/admin");
    await page.fill("input[type='password']", secret);
    await page.click("button:has-text('Login')");

    // Should see tabbed layout with Overview tab active by default
    await expect(page.locator("text=Total Events")).toBeVisible({ timeout: 10_000 });
    // Should see all tab buttons
    await expect(page.getByRole("button", { name: "Overview" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Events" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Controls" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Logs" })).toBeVisible();
  });

  test("dashboard overview shows pipeline stats", async ({ page }) => {
    const secret = getAdminSecret();
    if (!secret) { test.skip(); return; }

    await page.goto("/admin");
    await page.fill("input[type='password']", secret);
    await page.click("button:has-text('Login')");

    // Overview tab shows quick stats
    await expect(page.locator("text=Total Events")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=Last Run")).toBeVisible();
    await expect(page.locator("text=Confidence")).toBeVisible();
  });

  test("events tab shows event counts", async ({ page }) => {
    const secret = getAdminSecret();
    if (!secret) { test.skip(); return; }

    await page.goto("/admin");
    await page.fill("input[type='password']", secret);
    await page.click("button:has-text('Login')");

    await expect(page.locator("text=Total Events")).toBeVisible({ timeout: 10_000 });

    // Switch to Events tab
    await page.getByRole("button", { name: "Events" }).click();
    await expect(page.locator("text=Seed")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("text=Expanded")).toBeVisible();
    await expect(page.locator("text=Latest")).toBeVisible();
  });

  test("dashboard API returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/admin/dashboard");
    expect(res.status()).toBe(401);
  });

  test("controls tab has pipeline actions", async ({ page }) => {
    const secret = getAdminSecret();
    if (!secret) { test.skip(); return; }

    await page.goto("/admin");
    await page.fill("input[type='password']", secret);
    await page.click("button:has-text('Login')");

    await expect(page.locator("text=Total Events")).toBeVisible({ timeout: 10_000 });

    // Switch to Controls tab
    await page.getByRole("button", { name: "Controls" }).click();
    await expect(page.locator("button", { hasText: "Run Update Now" })).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("button", { hasText: /Clear.*Cache/i })).toBeVisible();
    await expect(page.locator("select")).toBeVisible(); // cron interval
  });
});
