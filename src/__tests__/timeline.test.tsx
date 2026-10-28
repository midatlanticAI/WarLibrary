// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import TimelineSlider from "@/components/timeline/TimelineSlider";
import type { ConflictEvent } from "@/types";

function event(date: string, id: string): ConflictEvent {
  return {
    id,
    date,
    event_type: "airstrike",
    description: `Event ${id}`,
    latitude: 35,
    longitude: 51,
    country: "Iran",
    region: "Tehran",
    actors: [],
    fatalities: 0,
    source: "Test",
    source_url: null,
    created_at: date,
  };
}

describe("TimelineSlider", () => {
  it("renders when the dataset contains calendar-invalid dates", () => {
    // The live dataset holds rows like "2026-04-00". The API sorts them to
    // the end, so a NaN timestamp used to land at the end of the slider's
    // range and `new Date(NaN).toISOString()` threw, unmounting the map.
    const events = [
      event("2026-05-01T10:00:00Z", "a"),
      event("2026-05-02T10:00:00Z", "b"),
      event("2026-04-00", "bad"),
    ];
    expect(() =>
      render(
        <TimelineSlider
          events={events}
          dateRange={{ start: "2026-04-30T00:00:00Z", end: "2026-05-03T00:00:00Z" }}
          onChange={() => {}}
        />
      )
    ).not.toThrow();
    expect(screen.getByRole("slider")).toBeTruthy();
  });

  it("renders with only invalid dates", () => {
    expect(() =>
      render(
        <TimelineSlider
          events={[event("2026-02-00", "x")]}
          dateRange={{ start: "2026-04-30T00:00:00Z", end: "2026-05-03T00:00:00Z" }}
          onChange={() => {}}
        />
      )
    ).not.toThrow();
  });
});
