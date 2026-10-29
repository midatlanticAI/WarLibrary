import { describe, it, expect } from "vitest";
import {
  getDataset,
  getEventById,
  getCountries,
  getCountryBySlug,
  countryStats,
  getRelatedEvents,
  getIndexableEvents,
  isIndexable,
  isKinetic,
  slugifyCountry,
  isCountryName,
  countrySlug,
  type SerializedEvent,
} from "@/lib/event-store";
import { cleanRegion } from "@/lib/country";
import { pagesSitemap, countriesSitemap, eventsSitemap } from "@/lib/sitemaps";
import { excerpt, xmlEscape } from "@/lib/site";

// These run against whatever is in src/data: the two seed files in CI, plus
// events_latest.json wherever one exists. Every assertion therefore has to
// hold for any dataset, not a fixture.

function sample(): SerializedEvent {
  return {
    id: "abc123def456",
    date: "2026-05-01T10:00:00Z",
    event_type: "airstrike",
    description: "Test strike on a depot",
    latitude: 35.7,
    longitude: 51.4,
    country: "Iran",
    region: "Tehran",
    actors: ["IDF"],
    fatalities: 3,
    source: "Reuters",
    source_url: "https://example.com/a",
    confidence: 0.9,
    verification_status: "confirmed",
    civilian_impact: null,
    location_precision: "city",
    created_at: "2026-05-01T10:00:00Z",
    conflict_id: "epic-fury-2026",
    sub_event_type: null,
    evidence_quote: null,
    fatalities_min: 3,
    fatalities_max: 3,
    fatalities_attribution: null,
    sources: [{ name: "Reuters", url: "https://example.com/a" }],
    source_count: 1,
    actor1: "IDF",
    actor2: null,
    actor1_type: "unknown",
    actor2_type: null,
    geo_source: "article",
    first_reported_at: null,
    revision: 1,
    updated_at: null,
  };
}

describe("slugifyCountry / isCountryName / canonicalCountry", () => {
  it("slugs ordinary names", () => {
    expect(slugifyCountry("United Arab Emirates")).toBe("united-arab-emirates");
    expect(slugifyCountry("Côte d'Ivoire")).toBe("cote-d-ivoire");
    expect(slugifyCountry("  Iran ")).toBe("iran");
    expect(slugifyCountry("Bosnia & Herzegovina")).toBe("bosnia-and-herzegovina");
  });
  it("rejects placeholders, lists and aggregates", () => {
    expect(isCountryName("Multiple")).toBe(false);
    expect(isCountryName("Multiple (Gulf States)")).toBe(false);
    expect(isCountryName("Global")).toBe(false);
    expect(isCountryName("Gulf Region")).toBe(false);
    expect(isCountryName("Iran, Yemen")).toBe(false);
    expect(isCountryName("Kuwait; Bahrain")).toBe(false);
    expect(isCountryName("Iraq/Jordan")).toBe(false);
    expect(isCountryName("Iran and Israel")).toBe(false);
    expect(isCountryName("")).toBe(false);
    expect(isCountryName(null)).toBe(false);
    expect(isCountryName("International Waters")).toBe(true);
    expect(isCountryName("Iran")).toBe(true);
    expect(isCountryName("Trinidad and Tobago")).toBe(false); // known cost of the list rule
  });
  it("folds aliases into one hub", () => {
    expect(countrySlug("US")).toBe("united-states");
    expect(countrySlug("USA")).toBe("united-states");
    expect(countrySlug("U.S.")).toBe("united-states");
    expect(countrySlug("United States")).toBe("united-states");
    expect(countrySlug("UK")).toBe("united-kingdom");
    expect(countrySlug("UAE")).toBe("united-arab-emirates");
    expect(countrySlug("Türkiye")).toBe("turkey");
    expect(countrySlug("Gaza Strip")).toBe("palestine");
    expect(countrySlug("Strait of Hormuz")).toBe("international-waters");
    expect(countrySlug("Iran, Yemen")).toBeNull();
  });
  it("cleans placeholder regions", () => {
    expect(cleanRegion("Unknown")).toBe("");
    expect(cleanRegion("null")).toBe("");
    expect(cleanRegion(null)).toBe("");
    expect(cleanRegion("  Tehran  ")).toBe("Tehran");
  });
});

describe("isIndexable", () => {
  it("accepts a well-attributed, well-located event", () => {
    expect(isIndexable(sample())).toBe(true);
  });
  it("rejects each missing leg of the gate", () => {
    expect(isIndexable({ ...sample(), source_url: null })).toBe(false);
    expect(isIndexable({ ...sample(), confidence: 0.69 })).toBe(false);
    expect(isIndexable({ ...sample(), confidence: null })).toBe(false);
    expect(isIndexable({ ...sample(), location_precision: "country" })).toBe(false);
    expect(isIndexable({ ...sample(), location_precision: null })).toBe(false);
    expect(isIndexable({ ...sample(), date: "2026-04-00" })).toBe(false);
    expect(isIndexable({ ...sample(), latitude: 0, longitude: 0 })).toBe(false);
    expect(isIndexable({ ...sample(), country: "Multiple" })).toBe(false);
  });
});

describe("isKinetic", () => {
  it("separates strikes from statements", () => {
    expect(isKinetic({ event_type: "airstrike" })).toBe(true);
    expect(isKinetic({ event_type: "violence_against_civilians" })).toBe(true);
    expect(isKinetic({ event_type: "strategic_development" })).toBe(false);
    expect(isKinetic({ event_type: "protest" })).toBe(false);
  });
});

describe("dataset lookups", () => {
  it("builds once and exposes consistent indexes", () => {
    const a = getDataset();
    const b = getDataset();
    expect(b).toBe(a);
    expect(a.events.length).toBeGreaterThan(0);
    expect(a.byId.size).toBe(a.events.length);
    for (const event of a.events.slice(0, 50)) {
      expect(getEventById(event.id)).toBe(event);
    }
    expect(getEventById("nope")).toBeNull();
  });

  it("indexes every country-named event under exactly one slug", () => {
    const dataset = getDataset();
    const countries = getCountries();
    const total = countries.reduce((n, c) => n + c.events.length, 0);
    const named = dataset.events.filter((e) => isCountryName(e.country)).length;
    expect(total).toBe(named);
    // No two hubs may collapse to the same name (aliases fold, never split).
    const names = countries.map((c) => c.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    for (const c of countries) expect(c.events.every((e) => countrySlug(e.country) === c.slug)).toBe(true);
    // Sorted by event count, descending.
    for (let i = 1; i < countries.length; i++) {
      expect(countries[i - 1].events.length).toBeGreaterThanOrEqual(countries[i].events.length);
    }
    const first = countries[0];
    expect(getCountryBySlug(first.slug)).toBe(first);
    expect(getCountryBySlug("definitely-not-a-country")).toBeNull();
  });

  it("country stats add up", () => {
    const first = getCountries()[0];
    const stats = countryStats(first);
    expect(stats.kinetic + stats.developments).toBe(stats.total);
    expect(stats.total).toBe(first.events.length);
    expect(Object.values(stats.byType).reduce((a, b) => a + b, 0)).toBe(stats.total);
    expect(stats.last7).toBeLessThanOrEqual(stats.last30);
    expect(stats.last30).toBeLessThanOrEqual(stats.total);
    expect(stats.fatalitiesLast30).toBeLessThanOrEqual(stats.fatalities);
    if (stats.bbox) {
      const [minLon, minLat, maxLon, maxLat] = stats.bbox;
      expect(minLon).toBeLessThanOrEqual(maxLon);
      expect(minLat).toBeLessThanOrEqual(maxLat);
    }
  });

  it("related events are same-country, within three days, and never the event itself", () => {
    const event = getDataset().events.find((e) => !Number.isNaN(new Date(e.date).getTime()) && isCountryName(e.country));
    expect(event).toBeDefined();
    const related = getRelatedEvents(event!, 8);
    expect(related.length).toBeLessThanOrEqual(8);
    const anchor = new Date(event!.date).getTime();
    for (const other of related) {
      expect(other.id).not.toBe(event!.id);
      expect(countrySlug(other.country)).toBe(countrySlug(event!.country));
      expect(Math.abs(new Date(other.date).getTime() - anchor)).toBeLessThanOrEqual(3 * 86_400_000);
    }
  });

  it("indexable events all pass the gate", () => {
    for (const event of getIndexableEvents()) expect(isIndexable(event)).toBe(true);
  });
});

describe("sitemaps", () => {
  it("pages sitemap lists the fixed routes", () => {
    const xml = pagesSitemap();
    expect(xml).toContain("<loc>https://warlibrary.midatlantic.ai/</loc>");
    expect(xml).toContain("<loc>https://warlibrary.midatlantic.ai/country</loc>");
    expect(xml).toContain("/about</loc>");
    expect(xml).toContain("/sources</loc>");
    expect(xml).toContain("/support</loc>");
  });
  it("countries sitemap only lists hubs above the size floor", () => {
    const xml = countriesSitemap();
    const listed = (xml.match(/<url>/g) || []).length;
    const eligible = getCountries().filter((c) => c.events.length >= 20).length;
    expect(listed).toBe(eligible);
  });
  it("events sitemap chunks and 404s past the end", () => {
    const first = eventsSitemap(1);
    const indexable = getIndexableEvents().length;
    if (indexable === 0) {
      // No indexable events (seed data in CI): no events sitemap at all, and
      // the index must not list one, or it would point at a 404.
      expect(first).toBeNull();
    } else {
      expect((first!.match(/<url>/g) || []).length).toBe(Math.min(5000, indexable));
    }
    expect(eventsSitemap(0)).toBeNull();
    expect(eventsSitemap(10_000)).toBeNull();
  });
});

describe("site helpers", () => {
  it("escapes XML", () => {
    expect(xmlEscape(`a & b < c > "d" 'e'`)).toBe("a &amp; b &lt; c &gt; &quot;d&quot; &apos;e&apos;");
  });
  it("excerpts on a word boundary", () => {
    const text = "word ".repeat(100).trim();
    const cut = excerpt(text, 50);
    expect(cut.length).toBeLessThanOrEqual(51);
    expect(cut.endsWith("…")).toBe(true);
    expect(excerpt("short", 50)).toBe("short");
  });
});
