import { describe, it, expect } from "vitest";
import { createRequire } from "module";

/**
 * Grounded-field rules in the pipeline and the backfill, exercised without
 * the network or the API.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- plain JS modules under test; shapes asserted below */
const require = createRequire(import.meta.url);
const pipeline = require("../../scripts/update-events.js");
const backfill = require("../../scripts/backfill-registry.js");

type Row = Record<string, any>;

const article = {
  title: "Strikes hit Isfahan depot",
  description: "",
  body: "At least twelve workers were killed when strikes hit a fuel depot near Isfahan on Tuesday, the provincial governor said. “The fire burned for hours,” he added.",
};

function fresh(): Row {
  return {
    date: "2026-10-28T00:00:00Z",
    event_type: "airstrike",
    description: "12 workers killed when strikes hit a fuel depot near Isfahan",
    latitude: 32.65,
    longitude: 51.68,
    country: "Iran",
    region: "Isfahan",
    actors: ["Israeli Air Force", "Iran"],
    fatalities: 12,
    source: "Reuters",
    source_url: "https://example.com/isfahan",
    confidence: 0.9,
    verification_status: "confirmed",
    location_precision: "city",
    civilian_impact: "workers killed",
    conflict_id: "epic-fury-2026",
    sub_event_type: "manned_aircraft",
    evidence_quote: "At least twelve workers were killed when strikes hit a fuel depot near Isfahan on Tuesday, the provincial governor said.",
    fatalities_min: 12,
    fatalities_max: 12,
    fatalities_attribution: "provincial governor",
    actor1: "Israeli Air Force",
    actor2: "Iran",
    actor1_type: "state",
    actor2_type: "state",
  };
}

describe("schema", () => {
  it("adds the grounded fields with their enums", () => {
    const item = pipeline.EVENT_SCHEMA.properties.events.items;
    for (const f of ["conflict_id", "sub_event_type", "evidence_quote", "fatalities_min", "fatalities_max", "fatalities_attribution", "actor1", "actor2", "actor1_type", "actor2_type"]) {
      expect(item.required).toContain(f);
    }
    expect(item.properties.conflict_id.enum).toEqual(pipeline.CONFLICT_IDS);
    expect(item.properties.actor1_type.enum).toEqual(pipeline.VALID_ACTOR_TYPES);
    expect(item.properties.sub_event_type.enum).toContain("statement");
    expect(item.properties.sub_event_type.enum).toContain("unspecified");
    // Structured outputs forbid min/max constraints; enums carry validation.
    expect(item.properties.fatalities_min.minimum).toBeUndefined();
  });

  it("queries come from the registry", () => {
    expect(pipeline.ACTIVE_CONFLICTS.length).toBeGreaterThan(0);
    expect(pipeline.CONFLICT_START_MS).toBe(new Date("2026-02-28T00:00:00Z").getTime());
  });
});

describe("verifyEvidenceQuote", () => {
  it("accepts a verbatim quote despite whitespace and curly quotes", () => {
    expect(pipeline.verifyEvidenceQuote("“The fire burned   for hours,” he added", article)).toBe("“The fire burned for hours,” he added");
  });
  it("rejects paraphrase, short strings and missing articles", () => {
    expect(pipeline.verifyEvidenceQuote("Twelve workers died at a depot", article)).toBeNull();
    expect(pipeline.verifyEvidenceQuote("Isfahan", article)).toBeNull();
    expect(pipeline.verifyEvidenceQuote("anything", null)).toBeNull();
    expect(pipeline.verifyEvidenceQuote(42, article)).toBeNull();
  });
});

describe("groundEvent", () => {
  it("keeps grounded values, downgrades single-source confirmed, stamps provenance", () => {
    const e = fresh();
    const notes = pipeline.groundEvent(e, article, "2026-10-29T06:00:00Z");
    expect(e.evidence_quote).toContain("twelve workers");
    expect(e.verification_status).toBe("reported");
    expect(notes).toContain("confirmed_downgraded_single_source");
    expect(e.sources).toEqual([{ name: "Reuters", url: "https://example.com/isfahan", fetched_at: "2026-10-29T06:00:00Z" }]);
    expect(e.source_count).toBe(1);
    expect(e.revision).toBe(1);
    expect(e.first_reported_at).toBe("2026-10-29T06:00:00Z");
    expect(e.geo_source).toBe("article");
    expect(e.sub_event_type).toBe("manned_aircraft");
    expect(e.actor1_type).toBe("state");
  });

  it("nulls a quote the article does not contain and a sub-type of the wrong family", () => {
    const e = { ...fresh(), evidence_quote: "Something the article never said at all here", sub_event_type: "statement" };
    const notes = pipeline.groundEvent(e, article, "2026-10-29T06:00:00Z");
    expect(e.evidence_quote).toBeNull();
    expect(e.sub_event_type).toBeNull();
    expect(notes).toContain("evidence_quote_unverified");
    expect(notes).toContain("sub_type_mismatch");
  });

  it("repairs an inconsistent fatality range and drops attribution without a figure", () => {
    const e = { ...fresh(), fatalities: 12, fatalities_min: 30, fatalities_max: 20, fatalities_attribution: "x" };
    pipeline.groundEvent(e, article, "t");
    expect([e.fatalities_min, e.fatalities_max]).toEqual([12, 30]);
    const z = { ...fresh(), fatalities: 0, fatalities_min: 0, fatalities_max: 0, fatalities_attribution: "ministry" };
    pipeline.groundEvent(z, article, "t");
    expect(z.fatalities_attribution).toBeNull();
  });

  it("falls back to actors[] and unknown types, and defaults the conflict", () => {
    const e = { ...fresh(), actor1: "", actor2: "", actor1_type: "nope", actor2_type: "", conflict_id: "mars-2030" };
    const notes = pipeline.groundEvent(e, article, "t");
    expect(e.actor1).toBe("Israeli Air Force");
    expect(e.actor2).toBe("Iran");
    expect(e.actor1_type).toBe("unknown");
    expect(e.conflict_id).toBe("epic-fury-2026");
    expect(notes).toContain("conflict_defaulted");
  });

  it("respects geocode provenance when the fallback placed the event", () => {
    const e = { ...fresh(), geo_source: "centroid", location_precision: "country" };
    pipeline.groundEvent(e, article, "t");
    expect(e.geo_source).toBe("centroid");
  });
});

describe("fatality overrides", () => {
  it("zeroes the range and attribution with the figure, stashing claimed values on quarantine", () => {
    const e: Row = { fatalities: 10000, fatalities_min: 10000, fatalities_max: 12000, fatalities_attribution: "ministry" };
    pipeline.clearFatalityFigure(e, { stashAsClaimed: true });
    expect([e.fatalities, e.fatalities_min, e.fatalities_max, e.fatalities_attribution]).toEqual([0, 0, 0, null]);
    expect([e.claimed_fatalities, e.claimed_fatalities_min, e.claimed_fatalities_max, e.claimed_fatalities_attribution]).toEqual([10000, 10000, 12000, "ministry"]);
    const c: Row = { fatalities: 1300, fatalities_min: 1300, fatalities_max: 1300, fatalities_attribution: "health ministry" };
    pipeline.clearFatalityFigure(c);
    expect([c.fatalities, c.fatalities_max, c.fatalities_attribution]).toEqual([0, 0, null]);
    expect(c.claimed_fatalities).toBeUndefined();
  });

  it("raising a figure widens the range and keeps the low end", () => {
    const e: Row = { fatalities: 12, fatalities_min: 12, fatalities_max: 12 };
    pipeline.raiseFatalities(e, 30);
    expect([e.fatalities, e.fatalities_min, e.fatalities_max]).toEqual([30, 12, 30]);
    const legacy: Row = { fatalities: 5 };
    pipeline.raiseFatalities(legacy, 9);
    expect([legacy.fatalities, legacy.fatalities_min, legacy.fatalities_max]).toEqual([9, 9, 9]);
  });

  it("accepts a quote wrapped in quote marks or opened with an ellipsis", () => {
    expect(pipeline.verifyEvidenceQuote('"At least twelve workers were killed when strikes hit a fuel depot"', article)).not.toBeNull();
    expect(pipeline.verifyEvidenceQuote("…strikes hit a fuel depot near Isfahan on Tuesday, the provincial governor said.", article)).not.toBeNull();
  });
});

describe("mergeSourceIntoExisting", () => {
  it("tolerates malformed legacy sources and never confirms from an unnamed outlet", () => {
    const broken: Row = { source: "Reuters", source_url: "https://example.com/a", sources: [null, "x"], verification_status: "reported" };
    expect(pipeline.mergeSourceIntoExisting(broken, { source: "BBC News", source_url: "https://example.com/b" }, "t")).toBe(true);
    expect(broken.sources.map((s: { name: string }) => s.name)).toEqual(["Reuters", "BBC News"]);
    expect(broken.verification_status).toBe("confirmed");
    const unnamed: Row = { source_url: "https://example.com/a", verification_status: "reported" };
    pipeline.mergeSourceIntoExisting(unnamed, { source: "BBC News", source_url: "https://example.com/b" }, "t");
    expect(unnamed.verification_status).toBe("reported");
    expect(unnamed.source_count).toBe(2);
    const named: Row = { source: "Reuters", source_url: "https://example.com/a", verification_status: "reported" };
    pipeline.mergeSourceIntoExisting(named, { source: "", source_url: "https://example.com/c" }, "t");
    expect(named.verification_status).toBe("reported");
  });

  it("adds a new outlet, upgrades to confirmed, bumps revision; ignores the same URL", () => {
    const existing: Row = { source: "Reuters", source_url: "https://example.com/a", verification_status: "reported", revision: 1 };
    const candidate = { source: "BBC News", source_url: "https://example.com/b" };
    expect(pipeline.mergeSourceIntoExisting(existing, candidate, "t1")).toBe(true);
    expect(existing.sources.map((s: { name: string }) => s.name)).toEqual(["Reuters", "BBC News"]);
    expect(existing.verification_status).toBe("confirmed");
    expect(existing.revision).toBe(2);
    expect(existing.updated_at).toBe("t1");
    expect(pipeline.mergeSourceIntoExisting(existing, candidate, "t2")).toBe(false);
    expect(existing.revision).toBe(2);
  });

  it("the same outlet twice is recorded but does not confirm", () => {
    const existing: Row = { source: "Reuters", source_url: "https://example.com/a", verification_status: "reported" };
    pipeline.mergeSourceIntoExisting(existing, { source: "reuters", source_url: "https://example.com/a2" }, "t");
    expect(existing.verification_status).toBe("reported");
    expect(existing.source_count).toBe(2);
  });

  it("never touches claimed or disputed rows' status", () => {
    const existing: Row = { source: "IRNA", source_url: "https://example.com/a", verification_status: "claimed" };
    pipeline.mergeSourceIntoExisting(existing, { source: "BBC News", source_url: "https://example.com/b" }, "t");
    expect(existing.verification_status).toBe("claimed");
  });
});

describe("backfillEvent", () => {
  it("adds every field honestly and is idempotent", () => {
    const e: Record<string, unknown> = { date: "2026-03-01T00:00:00Z", description: "x", actors: ["A", "B"], fatalities: 3, source: "BBC", source_url: "https://example.com", location_precision: "country" };
    expect(backfill.backfillEvent(e)).toBe(true);
    expect(e.conflict_id).toBe("epic-fury-2026");
    expect(e.geo_source).toBe("centroid");
    expect(e.sources).toEqual([{ name: "BBC", url: "https://example.com" }]);
    expect(e.source_count).toBe(1);
    expect(e.fatalities_min).toBe(3);
    expect(e.fatalities_max).toBe(3);
    expect(e.evidence_quote).toBeNull();
    expect(e.actor1).toBe("A");
    expect(e.actor2_type).toBe("unknown");
    expect(e.revision).toBe(1);
    expect(e.first_reported_at).toBeNull();
    expect(backfill.backfillEvent(e)).toBe(false);
  });

  it("does not invent a recording time, repairs an earlier date-based one, and dedups actors", () => {
    const e: Record<string, unknown> = { date: "2026-03-01T00:00:00Z", description: "x", actors: ["IDF", "IDF"], fatalities: 0, source: "S", first_reported_at: "2026-03-01T00:00:00Z", conflict_id: "epic-fury-2026" };
    expect(backfill.backfillEvent(e)).toBe(true);
    expect(e.first_reported_at).toBeNull();
    expect(e.actor1).toBe("IDF");
    expect(e.actor2).toBeNull();
    const withCreated: Record<string, unknown> = { date: "d", created_at: "2026-03-02T10:00:00Z", description: "x", actors: [], fatalities: 0, source: "S" };
    backfill.backfillEvent(withCreated);
    expect(withCreated.first_reported_at).toBe("2026-03-02T10:00:00Z");
  });

  it("marks non-centroid legacy rows as legacy and keeps null fatalities null", () => {
    const e: Record<string, unknown> = { date: "d", description: "x", actors: [], fatalities: null, source: "S", location_precision: "city" };
    backfill.backfillEvent(e);
    expect(e.geo_source).toBe("legacy");
    expect(e.fatalities_min).toBeNull();
    expect(e.actor1).toBeNull();
    expect(e.sources).toEqual([{ name: "S", url: null }]);
  });
});
