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

  test("valid login shows dashboard", async ({ page }) => {
    const secret = getAdminSecret();
    if (!secret) { test.skip(); return; }

    await page.goto("/admin");
    await page.fill("input[type='password']", secret);
    await page.click("button:has-text('Login')");

    // Should see dashboard content
    await expect(page.locator("text=Pipeline Status")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=Event Data")).toBeVisible();
    await expect(page.locator("text=Controls")).toBeVisible();
  });

  test("dashboard shows pipeline data", async ({ page }) => {
    const secret = getAdminSecret();
    if (!secret) { test.skip(); return; }

    await page.goto("/admin");
    await page.fill("input[type='password']", secret);
    await page.click("button:has-text('Login')");

    await expect(page.locator("text=Pipeline Status")).toBeVisible({ timeout: 10_000 });

    // Should show event data section
    await expect(page.locator("text=Event Data")).toBeVisible();
    await expect(page.locator("text=Total").first()).toBeVisible();
  });

  test("dashboard API returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/admin/dashboard");
    expect(res.status()).toBe(401);
  });

  test("dashboard controls exist", async ({ page }) => {
    const secret = getAdminSecret();
    if (!secret) { test.skip(); return; }

    await page.goto("/admin");
    await page.fill("input[type='password']", secret);
    await page.click("button:has-text('Login')");

    await expect(page.locator("text=Controls")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("button", { hasText: "Run Update Now" })).toBeVisible();
    await expect(page.locator("button", { hasText: /Clear.*Cache/i })).toBeVisible();
    await expect(page.locator("select")).toBeVisible(); // cron interval
  });
});
