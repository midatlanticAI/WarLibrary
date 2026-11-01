import { describe, it, expect } from "vitest";
import { isNoCivilianImpact, cleanCivilianImpact } from "@/lib/civilian-impact.cjs";
import { computeStats } from "@/lib/dispatch-core.cjs";
import { toSerializedEvent, type RawEvent } from "@/lib/event-store";

// Every case below is a note taken from the live archive (2026-10-31).
const NONE = [
  "None",
  "None reported",
  "None reported.",
  "Unknown",
  "N/A",
  "No civilian impact reported",
  "No direct civilian impact",
  "No civilian casualties reported",
  "Not specified",
  "None; diplomatic development",
  "None - diplomatic statement",
  "None (strategic metric)",
  "No civilian impact reported; military base targeted",
  "None; military personnel injured",
  "No casualties reported; interception prevented potential civilian harm",
  "Unknown; refinery facility strike with no immediate civilian casualty reports",
  "Unknown; civilian casualties not reported",
  "No US personnel injured; no civilian casualties reported.",
  "Unknown number of US troops lightly wounded",
  "Unknown number of civilians potentially affected; settlements targeted with rocket fire",
  "Not applicable; this is a cumulative count of US military deaths, not a single incident.",
  "",
];

const HARM = [
  "12 civilians killed including 3 children; hospital partially destroyed",
  "Two people injured",
  "No power in Tehran after strike",
  "No water for 50,000 residents",
  "Unknown number of civilians killed or wounded; vehicle destroyed on coastal highway",
  "Unspecified casualties from missile and drone attacks on civilian areas",
  "Unknown number of casualties in deadliest Israeli attack on southern Lebanon since June",
  "No injuries reported; residents evacuated safely",
  "No immediate casualties reported; residential home struck in Qana",
  "None reported; religious/residential compound damaged",
  "Unknown civilian casualties; building damaged in residential area",
  "Unknown casualties; sports hall and school targeted",
  "Civilian casualties reported but number unclear",
  "One US service member killed",
];

describe("isNoCivilianImpact", () => {
  it.each(NONE)("treats %j as no civilian harm", (note) => {
    expect(isNoCivilianImpact(note)).toBe(true);
  });

  it.each(HARM)("keeps %j as a note on harm", (note) => {
    expect(isNoCivilianImpact(note)).toBe(false);
  });

  it("handles null and non-strings", () => {
    expect(isNoCivilianImpact(null)).toBe(true);
    expect(isNoCivilianImpact(undefined)).toBe(true);
    expect(cleanCivilianImpact(null)).toBeNull();
  });
});

describe("cleanCivilianImpact", () => {
  it("nulls a placeholder and trims a real note", () => {
    expect(cleanCivilianImpact("None reported.")).toBeNull();
    expect(cleanCivilianImpact("  Two people injured ")).toBe("Two people injured");
  });
});

describe("where the rule applies", () => {
  const base: RawEvent = {
    date: "2026-10-30T12:00:00Z",
    event_type: "airstrike",
    description: "Strike on a base",
    latitude: 32,
    longitude: 51,
    country: "Iran",
    source: "Reuters",
  } as RawEvent;

  it("publishes a placeholder note as null", () => {
    expect(toSerializedEvent({ ...base, civilian_impact: "None reported" }, "a").civilian_impact).toBeNull();
    expect(toSerializedEvent({ ...base, civilian_impact: "Two people injured" }, "b").civilian_impact).toBe("Two people injured");
  });

  it("does not count placeholder notes as civilian-impact events in dispatch stats", () => {
    const stats = computeStats([
      { ...base, id: "1", civilian_impact: "None" },
      { ...base, id: "2", civilian_impact: "No civilian casualties reported; military base targeted" },
      { ...base, id: "3", civilian_impact: "Two people injured" },
    ]);
    expect(stats.civilian_impact_events).toBe(1);
  });
});
