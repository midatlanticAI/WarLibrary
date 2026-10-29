import { describe, it, expect } from "vitest";
import * as core from "@/lib/dispatch-core.cjs";
import { stableEventId, getDataset } from "@/lib/event-store";

function ev(over: Partial<core.MinimalEvent> & { id: string }): core.MinimalEvent {
  return {
    date: "2026-10-28T10:00:00Z",
    event_type: "airstrike",
    description: "Strike on a depot",
    country: "Iran",
    region: "Tehran",
    fatalities: 0,
    confidence: 0.8,
    verification_status: "reported",
    civilian_impact: null,
    source: "Reuters",
    source_url: "https://example.com/a",
    ...over,
  };
}

describe("period keys and windows", () => {
  it("daily keys are UTC days and windows are one day", () => {
    const w = core.windowFor("daily", "2026-10-28")!;
    expect(w.from).toBe("2026-10-28T00:00:00.000Z");
    expect(w.to).toBe("2026-10-29T00:00:00.000Z");
    expect(w.prior).toEqual({ from: "2026-10-27T00:00:00.000Z", to: "2026-10-28T00:00:00.000Z" });
    expect(w.label).toBe("28 October 2026");
  });

  it("rejects impossible keys", () => {
    expect(core.windowFor("daily", "2026-02-30")).toBeNull();
    expect(core.windowFor("daily", "2026-13-01")).toBeNull();
    expect(core.windowFor("weekly", "2026-W54")).toBeNull();
    expect(core.windowFor("monthly", "2026-00")).toBeNull();
    expect(core.isValidKey("daily", "../etc")).toBe(false);
    expect(core.isValidKey("weird" as never, "2026-10-28")).toBe(false);
  });

  it("ISO weeks start on Monday and roll over years correctly", () => {
    expect(core.keyFor("weekly", new Date("2026-10-28T12:00:00Z"))).toBe("2026-W44");
    const w = core.windowFor("weekly", "2026-W44")!;
    expect(w.from).toBe("2026-10-26T00:00:00.000Z");
    expect(w.to).toBe("2026-11-02T00:00:00.000Z");
    // 1 Jan 2027 is a Friday, so it belongs to ISO week 53 of 2026.
    expect(core.keyFor("weekly", new Date("2027-01-01T00:00:00Z"))).toBe("2026-W53");
    expect(core.windowFor("weekly", "2026-W53")!.from).toBe("2026-12-28T00:00:00.000Z");
    expect(core.windowFor("weekly", "2027-W01")!.from).toBe("2027-01-04T00:00:00.000Z");
  });

  it("monthly windows handle year boundaries", () => {
    const w = core.windowFor("monthly", "2026-12")!;
    expect(w.to).toBe("2027-01-01T00:00:00.000Z");
    expect(w.prior.from).toBe("2026-11-01T00:00:00.000Z");
    expect(core.windowFor("monthly", "2027-01")!.prior.from).toBe("2026-12-01T00:00:00.000Z");
  });

  it("defaultKey is the period that just ended, whatever the day", () => {
    expect(core.defaultKey("daily", new Date("2026-10-29T06:00:00Z"))).toBe("2026-10-28");
    expect(core.defaultKey("daily", new Date("2026-10-29T00:30:00Z"))).toBe("2026-10-28");
    expect(core.defaultKey("weekly", new Date("2026-11-02T06:30:00Z"))).toBe("2026-W44");
    expect(core.defaultKey("weekly", new Date("2026-10-28T12:00:00Z"))).toBe("2026-W43"); // a Wednesday
    expect(core.defaultKey("monthly", new Date("2026-11-01T07:00:00Z"))).toBe("2026-10");
    expect(core.defaultKey("monthly", new Date("2026-10-15T12:00:00Z"))).toBe("2026-09");
  });

  it("rejects years outside the plausible span", () => {
    expect(core.isValidKey("monthly", "0026-10")).toBe(false);
    expect(core.isValidKey("daily", "0026-10-01")).toBe(false);
    expect(core.isValidKey("weekly", "2101-W01")).toBe(false);
  });

  it("child keys cover the parent window exactly", () => {
    expect(core.childKeys("weekly", "2026-W44")).toEqual([
      "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01",
    ]);
    const weeks = core.childKeys("monthly", "2026-10");
    expect(weeks[0]).toBe("2026-W40");
    expect(weeks[weeks.length - 1]).toBe("2026-W44");
    expect(core.childKeys("daily", "2026-10-28")).toEqual([]);
  });
});

describe("statistics (the code counts)", () => {
  const events = [
    ev({ id: "a", fatalities: 3, verification_status: "confirmed", civilian_impact: "homes hit" }),
    ev({ id: "b", event_type: "strategic_development", country: "Israel", source: "BBC" }),
    ev({ id: "c", fatalities: 2, country: "Yemen", event_type: "drone_attack", source: "reuters " }),
    ev({ id: "d", date: "not a date" }),
    ev({ id: "e", date: "2026-10-29T00:00:00Z" }),
  ];

  it("selects events strictly inside the window", () => {
    const inWin = core.eventsInWindow(events, "2026-10-28T00:00:00Z", "2026-10-29T00:00:00Z");
    expect(inWin.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("adds up what it should and nothing else", () => {
    const stats = core.computeStats(core.eventsInWindow(events, "2026-10-28T00:00:00Z", "2026-10-29T00:00:00Z"));
    expect(stats.events).toBe(3);
    expect(stats.kinetic).toBe(2);
    expect(stats.developments).toBe(1);
    expect(stats.fatalities).toBe(5);
    expect(stats.fatal_events).toBe(2);
    expect(stats.civilian_impact_events).toBe(1);
    expect(stats.outlets).toBe(2); // "Reuters" and "reuters " fold
    expect(stats.countries).toBe(3);
    expect(stats.top_countries[0]).toEqual({ name: "Iran", events: 1, kinetic: 1, fatalities: 3 });
    expect(stats.by_verification).toEqual({ confirmed: 1, reported: 2 });
  });

  it("folds country spellings and never counts aggregates as countries", () => {
    const stats = core.computeStats([
      ev({ id: "a", country: "US" }),
      ev({ id: "b", country: "United States" }),
      ev({ id: "c", country: "Multiple (Kuwait, Bahrain)" }),
      ev({ id: "d", country: "Iran, Yemen" }),
      ev({ id: "e", country: "Global" }),
    ]);
    expect(stats.events).toBe(5);
    expect(stats.countries).toBe(1);
    expect(stats.unplaced_country).toBe(3);
    expect(stats.top_countries).toEqual([{ name: "United States", events: 2, kinetic: 2, fatalities: 0 }]);
  });

  it("diff is signed with a null percentage from zero", () => {
    const a = core.computeStats([ev({ id: "x", fatalities: 4 })]);
    const b = core.computeStats([]);
    const d = core.diffStats(a, b);
    expect(d.events).toBe(1);
    expect(d.events_pct).toBeNull();
    expect(core.diffStats(b, a).fatalities).toBe(-4);
    expect(core.diffStats(a, a).events_pct).toBe(0);
  });

  it("ranks reliable, deadly, kinetic events first", () => {
    const top = core.selectTopEvents(
      [ev({ id: "weak", confidence: 0.4 }), ev({ id: "deadly", fatalities: 20, confidence: 0.9 }), ev({ id: "statement", event_type: "strategic_development", confidence: 0.95 })],
      2
    );
    expect(top.map((e) => e.id)).toEqual(["deadly", "statement"]);
  });
});

describe("citation check", () => {
  const allowed = ["aaaaaaaaaaaa", "bbbbbbbbbbbb"];

  it("drops sentences citing unknown ids and sections with no citation", () => {
    const r = core.citationCheck(
      [
        { heading: "Iran", body: "Strikes hit a depot [ev:aaaaaaaaaaaa]. A made-up claim [ev:cccccccccccc]. Follow-up fire [ev:bbbbbbbbbbbb].", event_ids: ["aaaaaaaaaaaa", "zzzzzzzzzzzz"] },
        { heading: "Nowhere", body: "Nothing cited here at all.", event_ids: [] },
      ],
      allowed
    );
    expect(r.sections).toHaveLength(1);
    expect(r.sections[0].body).toBe("Strikes hit a depot [ev:aaaaaaaaaaaa]. Follow-up fire [ev:bbbbbbbbbbbb].");
    expect(r.sections[0].event_ids).toEqual(["aaaaaaaaaaaa"]);
    expect(r.cited).toEqual(["aaaaaaaaaaaa", "bbbbbbbbbbbb"]);
    expect(r.dropped_sentences).toBe(2); // one unknown citation, one uncited
    expect(r.uncited_sentences).toBe(1);
    expect(r.dropped_sections).toBe(1);
    expect(r.unknown_citations).toBe(1);
  });

  it("drops uncited sentences even when the section lists event_ids", () => {
    const r = core.citationCheck(
      [{ heading: "h", body: "Plain uncited sentence. Cited one [ev:bbbbbbbbbbbb].", event_ids: ["aaaaaaaaaaaa"] }],
      allowed
    );
    expect(r.sections[0].body).toBe("Cited one [ev:bbbbbbbbbbbb].");
    expect(r.uncited_sentences).toBe(1);
    expect(r.cited).toEqual(["aaaaaaaaaaaa", "bbbbbbbbbbbb"]);
    const gone = core.citationCheck([{ heading: "h", body: "Only uncited prose here.", event_ids: ["aaaaaaaaaaaa"] }], allowed);
    expect(gone.sections).toHaveLength(0);
    expect(gone.dropped_sections).toBe(1);
  });

  it("keeps a trailing citation with the sentence it follows", () => {
    const r = core.citationCheck(
      [{ heading: "h", body: "Depot hit. [ev:aaaaaaaaaaaa] Invented thing. [ev:cccccccccccc] Fire followed. [ev:bbbbbbbbbbbb]", event_ids: [] }],
      allowed
    );
    expect(r.sections[0].body).toBe("Depot hit [ev:aaaaaaaaaaaa]. Fire followed [ev:bbbbbbbbbbbb].");
    expect(r.unknown_citations).toBe(1);
  });

  it("does not split on abbreviations", () => {
    expect(core.splitSentences("The U.S. Navy struck the port [ev:aaaaaaaaaaaa]. Dr. Lee spoke [ev:bbbbbbbbbbbb].")).toEqual([
      "The U.S. Navy struck the port [ev:aaaaaaaaaaaa].",
      "Dr. Lee spoke [ev:bbbbbbbbbbbb].",
    ]);
  });

  it("treats malformed or uppercase tokens as unknown citations and strips them everywhere", () => {
    const r = core.citationCheck([{ heading: "h", body: "Fake claim [ev:AAAAAAAAAAAA]. Short [ev:abc]. Real [ev:aaaaaaaaaaaa].", event_ids: [] }], allowed);
    expect(r.sections[0].body).toBe("Real [ev:aaaaaaaaaaaa].");
    expect(r.unknown_citations).toBe(2);
    expect(core.stripCitations("Title [ev:AAAAAAAAAAAA] here [ev:abc].")).toBe("Title here.");
  });
});

describe("number guard", () => {
  it("flags figures that were never in the input", () => {
    const stats = core.computeStats([ev({ id: "a", fatalities: 12, description: "At least 12 killed in the 3rd district" })]);
    const allowed = core.allowedNumbers(stats, [ev({ id: "a", fatalities: 12, description: "At least 12 killed" })]);
    expect(core.numberGuard("12 killed on 28 October 2026 in 1 strike.", allowed)).toEqual([]);
    expect(core.numberGuard("Some 1,500 people fled and 40 were hurt.", allowed)).toEqual([1500, 40]);
  });

  it("never reads digits inside citation ids as figures", () => {
    const allowed = new Set<number>();
    expect(core.numberGuard("A strike hit a depot [ev:642037156abc]. Fire followed [ev:9143433ab77c].", allowed)).toEqual([]);
  });
});

describe("publishing state", () => {
  it("auto-publishes a clean draft after its window, never a flagged one", () => {
    const base = { status: "draft" as const, publish_after: "2026-10-30T06:30:00Z", needs_review: [] as string[] };
    expect(core.effectiveStatus(base, new Date("2026-10-30T06:00:00Z"))).toBe("draft");
    expect(core.effectiveStatus(base, new Date("2026-10-30T07:00:00Z"))).toBe("published");
    expect(core.effectiveStatus({ ...base, needs_review: ["unverified_numbers:40"] }, new Date("2026-11-30T00:00:00Z"))).toBe("draft");
    expect(core.effectiveStatus({ ...base, status: "pulled" }, new Date("2026-11-30T00:00:00Z"))).toBe("pulled");
    expect(core.effectiveStatus({ ...base, publish_after: null }, new Date("2026-11-30T00:00:00Z"))).toBe("draft");
  });

  it("social text strips citations and carries the link", () => {
    const text = core.socialText({ title: "Quiet day [ev:aaaaaaaaaaaa]", lede: "Few strikes [ev:aaaaaaaaaaaa]." }, "https://x/y");
    expect(text).not.toContain("[ev:");
    expect(text.endsWith("https://x/y")).toBe(true);
  });
});

describe("event ids", () => {
  it("the core id equals the store id for every event in the dataset", () => {
    const dataset = getDataset();
    for (const e of dataset.events.slice(0, 200)) {
      expect(core.stableEventId(e)).toBe(e.id);
      expect(stableEventId(e)).toBe(e.id);
    }
  });
});
