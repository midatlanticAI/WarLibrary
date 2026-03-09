import { test, expect } from "@playwright/test";

test.describe("Data Freshness", () => {
  test("GET /api/events returns valid data", async ({ request }) => {
    const res = await request.get("/api/events");
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data).toBeDefined();
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data.length).toBeGreaterThan(100);
    expect(json.meta.total).toBe(json.data.length);
  });

  test("events have required fields", async ({ request }) => {
    const res = await request.get("/api/events");
    const json = await res.json();
    const event = json.data[0];
    expect(event.date).toBeTruthy();
    expect(event.event_type).toBeTruthy();
    expect(event.description).toBeTruthy();
    expect(event.country).toBeTruthy();
    expect(typeof event.latitude).toBe("number");
    expect(typeof event.longitude).toBe("number");
  });

  test("GET /api/health returns ok with correct count", async ({ request }) => {
    const healthRes = await request.get("/api/health");
    expect(healthRes.status()).toBe(200);
    const health = await healthRes.json();
    expect(health.status).toBe("ok");
    expect(health.events).toBeGreaterThan(100);

    // CRITICAL: health count must match events count (catches stale import bug)
    const eventsRes = await request.get("/api/events");
    const events = await eventsRes.json();
    expect(health.events).toBe(events.meta.total);
  });

  test("events endpoint has correct cache headers", async ({ request }) => {
    const res = await request.get("/api/events");
    const cacheControl = res.headers()["cache-control"];
    expect(cacheControl).toContain("max-age=60");
  });

  test("last_updated is recent (within 24 hours)", async ({ request }) => {
    const res = await request.get("/api/events");
    const json = await res.json();
    if (json.meta.last_updated) {
      const updated = new Date(json.meta.last_updated).getTime();
      const now = Date.now();
      const hoursDiff = (now - updated) / (1000 * 60 * 60);
      expect(hoursDiff).toBeLessThan(24);
    }
  });

  test("events include today or recent dates", async ({ request }) => {
    const res = await request.get("/api/events");
    const json = await res.json();
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    const recentEvents = json.data.filter((e: { date: string }) => {
      const d = e.date.split("T")[0];
      return d >= yesterday;
    });
    expect(recentEvents.length).toBeGreaterThan(0);
  });

  test("GET /api/notifications returns 200", async ({ request }) => {
    const res = await request.get("/api/notifications");
    expect(res.status()).toBe(200);
  });

  test("GET /api/stats without auth returns 401", async ({ request }) => {
    const res = await request.get("/api/stats");
    expect(res.status()).toBe(401);
  });
});
