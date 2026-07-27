/**
 * Tests for scripts/update-events.js — the news-extraction pipeline.
 *
 * This file is the highest-risk code in the project (it is the only thing that
 * writes to the event dataset) and previously had no test coverage at all.
 *
 * These tests import the real functions from the real script rather than
 * re-implementing them, so a regression in the pipeline fails here.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

interface PipelineEvent {
  date: string;
  event_type: string;
  description: string;
  latitude: number;
  longitude: number;
  country: string;
  source_url: string;
  region?: string;
  fatalities?: number;
  location_precision?: string;
  approximate_location?: boolean;
}

interface PipelineModule {
  hasUsableCoords: (e: Partial<PipelineEvent>) => boolean;
  geocodeFallback: (e: Partial<PipelineEvent>) => void;
  haversineKm: (a: number, b: number, c: number, d: number) => number;
  isSpatiallyCompatible: (
    a: Partial<PipelineEvent>,
    b: Partial<PipelineEvent>
  ) => boolean;
  isValidEvent: (e: unknown) => boolean;
  findDuplicateMatch: (
    candidate: Partial<PipelineEvent>,
    existing: Partial<PipelineEvent>[]
  ) => { isDup: boolean; match: PipelineEvent | null; sim: number; method: string };
  KNOWN_LOCATIONS: Record<string, { lat: number; lng: number }>;
  COUNTRY_CENTROIDS: Record<string, { lat: number; lng: number }>;
  SUSPICIOUS_FATALITY_THRESHOLD: number;
  SAME_INCIDENT_RADIUS_KM: number;
  VALID_EVENT_TYPES: string[];
  EVENT_SCHEMA: Record<string, unknown>;
  MODEL: string;
  ADVISOR_MODEL: string;
  ADVISOR_BETA: string;
  ADVISOR_MAX_TOKENS: number;
  ADVISOR_MAX_USES: number;
  EXTRACTION_MAX_TOKENS: number;
}

const pipeline: PipelineModule = require("../../scripts/update-events.js");

let urlCounter = 0;

/**
 * Builds a valid event. Each gets a distinct source_url by default, because
 * dedup treats a shared URL as proof of duplication — sharing one across
 * fixtures would mask whichever rule the test is actually trying to exercise.
 */
function makeEvent(overrides: Partial<PipelineEvent> = {}): PipelineEvent {
  return {
    date: "2026-04-15T12:00:00Z",
    event_type: "airstrike",
    description: "An airstrike hit a residential building, killing civilians.",
    latitude: 35.6892,
    longitude: 51.389,
    country: "Iran",
    source_url: `https://example.com/story-${++urlCounter}`,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Coordinate validation
// ---------------------------------------------------------------------------

describe("hasUsableCoords", () => {
  it("accepts a normal coordinate pair", () => {
    expect(pipeline.hasUsableCoords({ latitude: 35.68, longitude: 51.38 })).toBe(true);
  });

  it("rejects null island (0,0)", () => {
    // 217 events in the live dataset sit at 0,0 — in the Gulf of Guinea,
    // thousands of miles from this conflict.
    expect(pipeline.hasUsableCoords({ latitude: 0, longitude: 0 })).toBe(false);
  });

  it("accepts a real coordinate that merely has a zero component", () => {
    expect(pipeline.hasUsableCoords({ latitude: 0, longitude: 51.38 })).toBe(true);
    expect(pipeline.hasUsableCoords({ latitude: 35.68, longitude: 0 })).toBe(true);
  });

  it("rejects missing, non-numeric and NaN coordinates", () => {
    expect(pipeline.hasUsableCoords({})).toBe(false);
    expect(pipeline.hasUsableCoords({ latitude: NaN, longitude: 12 })).toBe(false);
    expect(
      pipeline.hasUsableCoords({
        latitude: "35.6" as unknown as number,
        longitude: 51.3,
      })
    ).toBe(false);
  });

  it("rejects out-of-range coordinates", () => {
    expect(pipeline.hasUsableCoords({ latitude: 91, longitude: 0.5 })).toBe(false);
    expect(pipeline.hasUsableCoords({ latitude: 12, longitude: 181 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Geocoding
// ---------------------------------------------------------------------------

describe("geocodeFallback", () => {
  it("leaves existing coordinates untouched", () => {
    const event = makeEvent({ latitude: 1.5, longitude: 2.5 });
    pipeline.geocodeFallback(event);
    expect(event.latitude).toBe(1.5);
    expect(event.longitude).toBe(2.5);
  });

  it("fills in a named city and marks it region precision", () => {
    const event = makeEvent({
      latitude: undefined as unknown as number,
      longitude: undefined as unknown as number,
      description: "Explosions reported in Tehran overnight.",
    });
    pipeline.geocodeFallback(event);
    expect(event.latitude).toBeCloseTo(35.6892, 3);
    expect(event.longitude).toBeCloseTo(51.389, 3);
    expect(event.location_precision).toBe("region");
    expect(event.approximate_location).toBeUndefined();
  });

  it("prefers the most specific named place over a shorter substring match", () => {
    const event = makeEvent({
      latitude: undefined as unknown as number,
      longitude: undefined as unknown as number,
      country: "Lebanon",
      description: "Strikes across southern Lebanon.",
    });
    pipeline.geocodeFallback(event);
    // "southern lebanon" (33.2721) must win over the "lebanon" centroid (33.8547)
    expect(event.latitude).toBeCloseTo(33.2721, 3);
    expect(event.location_precision).toBe("region");
  });

  it("marks country-centroid fallbacks as approximate, not as real locations", () => {
    // This is the bug that put ~4,900 events — one in five in the entire live
    // dataset — on a single coordinate at the centre of Iran.
    const event = makeEvent({
      latitude: undefined as unknown as number,
      longitude: undefined as unknown as number,
      region: "",
      country: "Iran",
      description: "Officials announced new economic measures.",
    });
    pipeline.geocodeFallback(event);
    expect(event.latitude).toBeCloseTo(32.4279, 3);
    expect(event.location_precision).toBe("country");
    expect(event.approximate_location).toBe(true);
  });

  it("overrides an over-confident model claim of exact precision", () => {
    const event = makeEvent({
      latitude: undefined as unknown as number,
      longitude: undefined as unknown as number,
      region: "",
      country: "Yemen",
      description: "Statement issued regarding the conflict.",
      location_precision: "exact",
    });
    pipeline.geocodeFallback(event);
    expect(event.location_precision).toBe("country");
  });

  it("replaces null-island coordinates rather than trusting them", () => {
    const event = makeEvent({
      latitude: 0,
      longitude: 0,
      description: "Blast reported in Beirut.",
    });
    pipeline.geocodeFallback(event);
    expect(event.latitude).toBeCloseTo(33.8938, 3);
  });

  it("keeps city and country tables disjoint", () => {
    const cityKeys = Object.keys(pipeline.KNOWN_LOCATIONS);
    const countryKeys = Object.keys(pipeline.COUNTRY_CENTROIDS);
    const overlap = cityKeys.filter((k) => countryKeys.includes(k));
    expect(overlap).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Distance / spatial compatibility
// ---------------------------------------------------------------------------

describe("haversineKm", () => {
  it("returns zero for identical points", () => {
    expect(pipeline.haversineKm(35.6892, 51.389, 35.6892, 51.389)).toBeCloseTo(0, 6);
  });

  it("computes a known distance (Tehran to Isfahan is ~340km)", () => {
    const km = pipeline.haversineKm(35.6892, 51.389, 32.6546, 51.668);
    expect(km).toBeGreaterThan(320);
    expect(km).toBeLessThan(360);
  });
});

describe("isSpatiallyCompatible", () => {
  it("treats nearby points as the same incident", () => {
    const a = makeEvent({ latitude: 35.6892, longitude: 51.389 });
    const b = makeEvent({ latitude: 35.72, longitude: 51.42 });
    expect(pipeline.isSpatiallyCompatible(a, b)).toBe(true);
  });

  it("treats Tehran and Isfahan as different places", () => {
    const a = makeEvent({ latitude: 35.6892, longitude: 51.389 });
    const b = makeEvent({ latitude: 32.6546, longitude: 51.668 });
    expect(pipeline.isSpatiallyCompatible(a, b)).toBe(false);
  });

  it("does not use distance to separate approximate placeholders", () => {
    const a = makeEvent({ latitude: 32.4279, longitude: 53.688, approximate_location: true });
    const b = makeEvent({ latitude: 35.6892, longitude: 51.389 });
    expect(pipeline.isSpatiallyCompatible(a, b)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

describe("isValidEvent", () => {
  it("accepts a well-formed event", () => {
    expect(pipeline.isValidEvent(makeEvent())).toBe(true);
  });

  it("rejects a zero day — the '2026-04-00' case found in live data", () => {
    expect(pipeline.isValidEvent(makeEvent({ date: "2026-04-00T00:00:00Z" }))).toBe(false);
  });

  it("rejects a zero month", () => {
    expect(pipeline.isValidEvent(makeEvent({ date: "2026-00-14T00:00:00Z" }))).toBe(false);
  });

  it("rejects an impossible month", () => {
    expect(pipeline.isValidEvent(makeEvent({ date: "2026-13-01T00:00:00Z" }))).toBe(false);
  });

  it("rejects malformed date strings", () => {
    expect(pipeline.isValidEvent(makeEvent({ date: "not-a-date" }))).toBe(false);
    expect(pipeline.isValidEvent(makeEvent({ date: "2026-4-1" }))).toBe(false);
  });

  it("rejects null-island coordinates", () => {
    expect(pipeline.isValidEvent(makeEvent({ latitude: 0, longitude: 0 }))).toBe(false);
  });

  it("rejects unknown event types", () => {
    expect(pipeline.isValidEvent(makeEvent({ event_type: "vibes" }))).toBe(false);
  });

  it("rejects a non-http source_url", () => {
    expect(pipeline.isValidEvent(makeEvent({ source_url: "javascript:alert(1)" }))).toBe(false);
  });

  it("rejects events missing required fields", () => {
    for (const field of ["date", "event_type", "description", "country", "source_url"]) {
      const event = makeEvent() as unknown as Record<string, unknown>;
      delete event[field];
      expect(pipeline.isValidEvent(event)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

describe("findDuplicateMatch", () => {
  it("catches an exact description repeat", () => {
    const existing = makeEvent();
    const candidate = makeEvent({
      date: "2026-05-01T09:00:00Z",
      country: "Lebanon",
      description: existing.description,
    });
    const result = pipeline.findDuplicateMatch(candidate, [existing]);
    expect(result.isDup).toBe(true);
    expect(result.method).toBe("exact_description");
  });

  it("catches two reports sharing a source URL", () => {
    const existing = makeEvent({ source_url: "https://news.example/a" });
    const candidate = makeEvent({
      source_url: "https://news.example/a",
      description: "Completely different wording about the same article.",
    });
    expect(pipeline.findDuplicateMatch(candidate, [existing]).isDup).toBe(true);
  });

  it("does NOT merge two distinct strikes in different cities on the same day", () => {
    // The core regression: same country, same type, same day, similar tolls —
    // but Tehran and Isfahan are ~340km apart and are not one event.
    const tehran = makeEvent({
      latitude: 35.6892,
      longitude: 51.389,
      fatalities: 10,
      description: "Airstrike destroys an apartment block in the capital.",
    });
    const isfahan = makeEvent({
      latitude: 32.6546,
      longitude: 51.668,
      fatalities: 12,
      description: "Air raid hits an industrial site in the central province.",
    });
    const result = pipeline.findDuplicateMatch(isfahan, [tehran]);
    expect(result.isDup).toBe(false);
  });

  it("still merges the same incident reported with different wording", () => {
    const first = makeEvent({
      latitude: 35.6892,
      longitude: 51.389,
      fatalities: 10,
      description: "Airstrike destroys an apartment block in the capital.",
    });
    const second = makeEvent({
      latitude: 35.7,
      longitude: 51.4,
      fatalities: 11,
      date: "2026-04-15T20:00:00Z",
      description: "Air raid levels a residential tower in the capital city.",
    });
    const result = pipeline.findDuplicateMatch(second, [first]);
    expect(result.isDup).toBe(true);
  });

  it("does not merge distant mass-casualty events in the same country", () => {
    const north = makeEvent({
      country: "Lebanon",
      latitude: 34.4381,
      longitude: 35.8308,
      fatalities: 85,
      description: "Strikes on a northern town kill dozens.",
    });
    const south = makeEvent({
      country: "Lebanon",
      latitude: 33.2721,
      longitude: 35.2033,
      fatalities: 180,
      date: "2026-04-16T12:00:00Z",
      description: "Bombardment of a southern village causes mass casualties.",
    });
    const result = pipeline.findDuplicateMatch(south, [north]);
    expect(result.isDup).toBe(false);
  });

  it("returns no match against an empty dataset", () => {
    expect(pipeline.findDuplicateMatch(makeEvent(), []).isDup).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Constants the docs make claims about
// ---------------------------------------------------------------------------

describe("pipeline constants", () => {
  it("uses a 50km same-incident radius", () => {
    expect(pipeline.SAME_INCIDENT_RADIUS_KM).toBe(50);
  });

  it("quarantines single-event fatality counts at or above 500", () => {
    expect(pipeline.SUSPICIOUS_FATALITY_THRESHOLD).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Structured output schema
// ---------------------------------------------------------------------------

interface JsonSchema {
  type: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  additionalProperties?: boolean;
  enum?: string[];
}

describe("EVENT_SCHEMA", () => {
  const schema = pipeline.EVENT_SCHEMA as unknown as JsonSchema;
  const item = schema.properties?.events?.items as JsonSchema;

  it("wraps events in an object root", () => {
    expect(schema.type).toBe("object");
    expect(schema.required).toContain("events");
    expect(schema.properties?.events?.type).toBe("array");
  });

  it("sets additionalProperties false everywhere, as structured outputs require", () => {
    expect(schema.additionalProperties).toBe(false);
    expect(item.additionalProperties).toBe(false);
  });

  it("constrains event_type to exactly the pipeline's valid types", () => {
    expect(item.properties?.event_type?.enum).toEqual(pipeline.VALID_EVENT_TYPES);
  });

  it("constrains verification_status and location_precision by enum", () => {
    expect(item.properties?.verification_status?.enum).toEqual([
      "confirmed",
      "reported",
      "claimed",
      "disputed",
      "unconfirmed",
    ]);
    expect(item.properties?.location_precision?.enum).toEqual([
      "exact",
      "city",
      "region",
      "country",
    ]);
  });

  it("requires provenance fields on every event", () => {
    expect(item.required).toContain("source_url");
    expect(item.required).toContain("source");
    expect(item.required).toContain("confidence");
    expect(item.required).toContain("verification_status");
  });

  it("uses no unsupported JSON Schema keywords", () => {
    // Structured outputs reject minimum/maximum/minLength/maxLength/multipleOf.
    const banned = ["minimum", "maximum", "minLength", "maxLength", "multipleOf"];
    const serialized = JSON.stringify(schema);
    for (const keyword of banned) {
      expect(serialized).not.toContain(`"${keyword}"`);
    }
  });
});

// ---------------------------------------------------------------------------
// Advisor configuration
// ---------------------------------------------------------------------------

describe("advisor configuration", () => {
  it("pairs a Haiku executor with a valid advisor model", () => {
    // Per the compatibility table, a Haiku 4.5 executor may use any of
    // Fable 5 / Mythos 5 / Opus 5 / 4.8 / 4.7 / 4.6 / Sonnet 4.6 as advisor.
    const validAdvisors = [
      "claude-fable-5",
      "claude-mythos-5",
      "claude-opus-5",
      "claude-opus-4-8",
      "claude-opus-4-7",
      "claude-opus-4-6",
      "claude-sonnet-4-6",
    ];
    expect(pipeline.MODEL).toContain("claude-haiku-4-5");
    expect(validAdvisors).toContain(pipeline.ADVISOR_MODEL);
  });

  it("uses an advisor that returns readable advice", () => {
    // Opus 5, Fable 5 and Mythos 5 return `advisor_redacted_result` — an
    // encrypted blob the client cannot read. This dataset publishes provenance,
    // so the advice that shaped an event has to be loggable.
    const encryptedAdvisors = ["claude-opus-5", "claude-fable-5", "claude-mythos-5"];
    expect(encryptedAdvisors).not.toContain(pipeline.ADVISOR_MODEL);
  });

  it("caps advisor output at or above the API minimum", () => {
    expect(pipeline.ADVISOR_MAX_TOKENS).toBeGreaterThanOrEqual(1024);
  });

  it("bounds advisor calls per request", () => {
    expect(pipeline.ADVISOR_MAX_USES).toBeGreaterThan(0);
    expect(pipeline.ADVISOR_MAX_USES).toBeLessThanOrEqual(5);
  });

  it("uses the correct beta flag", () => {
    expect(pipeline.ADVISOR_BETA).toBe("advisor-tool-2026-03-01");
  });

  it("gives extraction enough headroom to avoid routine truncation", () => {
    // 8192 was low enough that hitting max_tokens was an expected path.
    // Haiku 4.5 caps at 64K.
    expect(pipeline.EXTRACTION_MAX_TOKENS).toBeGreaterThan(8192);
    expect(pipeline.EXTRACTION_MAX_TOKENS).toBeLessThanOrEqual(64000);
  });
});
