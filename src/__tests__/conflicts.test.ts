import { describe, it, expect } from "vitest";
import { getConflicts, getActiveConflicts, getConflict, conflictForEvent, earliestActiveStart, conflictLabel, DEFAULT_CONFLICT_ID } from "@/lib/conflicts";

describe("conflict registry", () => {
  const all = getConflicts();

  it("has the default conflict and at least one active entry", () => {
    expect(getConflict(DEFAULT_CONFLICT_ID)).not.toBeNull();
    expect(getActiveConflicts().length).toBeGreaterThanOrEqual(1);
  });

  it("every entry is well formed", () => {
    const ids = new Set<string>();
    for (const c of all) {
      expect(c.id).toMatch(/^[a-z0-9-]+$/);
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
      expect(["active", "planned", "dormant"]).toContain(c.status);
      expect(c.start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(new Date(`${c.start_date}T00:00:00Z`).getTime())).toBe(false);
      if (c.tracking_from) expect(c.tracking_from >= c.start_date).toBe(true);
      expect(c.bbox).toHaveLength(4);
      const [minLon, minLat, maxLon, maxLat] = c.bbox;
      expect(minLon).toBeLessThan(maxLon);
      expect(minLat).toBeLessThan(maxLat);
      expect(c.countries.length).toBeGreaterThan(0);
      expect(c.actors.length).toBeGreaterThan(0);
      for (const a of c.actors) expect(["state", "non_state", "coalition", "civilians", "unknown"]).toContain(a.type);
      expect(c.queries.google_news.length).toBeGreaterThan(0);
      expect(c.queries.newsdata.length).toBeGreaterThan(0);
      expect(c.background.length).toBeGreaterThan(0);
      expect(c.description.length).toBeGreaterThan(20);
    }
  });

  it("active entries have a tracking start", () => {
    for (const c of getActiveConflicts()) expect(c.tracking_from).not.toBeNull();
  });

  it("resolves events to conflicts with a legacy fallback", () => {
    expect(conflictForEvent({})?.id).toBe(DEFAULT_CONFLICT_ID);
    expect(conflictForEvent({ conflict_id: null })?.id).toBe(DEFAULT_CONFLICT_ID);
    expect(conflictForEvent({ conflict_id: "sudan-2023" })?.id).toBe("sudan-2023");
    expect(conflictForEvent({ conflict_id: "nope" })).toBeNull();
  });

  it("earliest active start is a real timestamp", () => {
    expect(earliestActiveStart()).toBe(new Date("2026-02-28T00:00:00Z").getTime());
  });

  it("labels include the operation name when there is one", () => {
    expect(conflictLabel(getConflict("epic-fury-2026")!)).toContain("Operation Epic Fury");
    expect(conflictLabel(getConflict("sudan-2023")!)).toBe("Sudan civil war");
  });
});
