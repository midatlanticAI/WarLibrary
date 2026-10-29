import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createRequire } from "module";

/**
 * The writer's pure parts: input assembly from a dataset and turning canned
 * model output into a dispatch record. No API call. DISPATCH_DIR is pointed
 * at a temp directory so child-dispatch lookups and the store round-trip
 * never touch src/data.
 */
const require = createRequire(import.meta.url);

/* eslint-disable @typescript-eslint/no-explicit-any -- the writer is plain JS; its shapes are asserted below */
type Inputs = {
  win: { from: string; to: string; label: string };
  events: { id: string }[];
  stats: Record<string, any>;
  prior: Record<string, any>;
  diff: Record<string, any>;
  childDispatches: { key: string }[];
  inputEvents: { id: string }[];
  usedFallback: boolean;
};
type Writer = {
  buildInputs: (kind: string, key: string, dataset: Record<string, unknown>[]) => Inputs;
  assemble: (opts: Record<string, unknown>) => import("@/lib/dispatch-core.cjs").Dispatch & {
    check: { dropped_sentences: number; uncited_sentences: number; dropped_sections: number; unverified_numbers: number[] };
  };
};

let tmp: string;
let writer: Writer;
let store: typeof import("@/lib/dispatch-store");

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), "wl-dispatch-"));
  process.env.DISPATCH_DIR = tmp;
  writer = require("../../scripts/write-dispatch.js");
  store = await import("@/lib/dispatch-store");
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function event(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    date: "2026-10-28T09:00:00Z",
    event_type: "airstrike",
    description: `Strike ${id} hit a depot and 4 workers were killed`,
    latitude: 35.7,
    longitude: 51.4,
    country: "Iran",
    region: "Tehran",
    actors: ["IDF"],
    fatalities: 4,
    source: "Reuters",
    source_url: `https://example.com/${id}`,
    confidence: 0.85,
    verification_status: "reported",
    civilian_impact: "workers killed",
    ...over,
  };
}

const dataset = [
  event("aaaaaaaaaaaa"),
  event("bbbbbbbbbbbb", { country: "Yemen", event_type: "drone_attack", fatalities: 0 }),
  event("cccccccccccc", { event_type: "strategic_development", fatalities: 0, description: "Minister statement on talks" }),
  event("dddddddddddd", { date: "2026-10-27T09:00:00Z", fatalities: 9 }),
];

describe("buildInputs", () => {
  it("windows the dataset, computes stats and prior, and compacts events", () => {
    const inputs = writer.buildInputs("daily", "2026-10-28", dataset);
    expect(inputs.events.map((e) => e.id).sort()).toEqual(["aaaaaaaaaaaa", "bbbbbbbbbbbb", "cccccccccccc"]);
    expect(inputs.stats.events).toBe(3);
    expect(inputs.stats.fatalities).toBe(4);
    expect(inputs.prior.fatalities).toBe(9);
    expect(inputs.diff.fatalities).toBe(-5);
    expect(inputs.inputEvents[0]).toHaveProperty("id");
    expect(inputs.childDispatches).toEqual([]);
    expect(inputs.usedFallback).toBe(false);
  });

  it("a weekly with no dailies falls back to raw events", () => {
    const inputs = writer.buildInputs("weekly", "2026-W44", dataset);
    expect(inputs.usedFallback).toBe(true);
    expect(inputs.events.length).toBe(4);
  });
});

describe("assemble", () => {
  const inputs = () => writer.buildInputs("daily", "2026-10-28", dataset);
  const output = {
    title: "Strikes on Tehran depots as Yemen drone activity continues",
    lede: "Workers were killed when a strike hit a depot in Tehran [ev:aaaaaaaaaaaa]. A drone attack was reported in Yemen [ev:bbbbbbbbbbbb].",
    sections: [
      { heading: "Iran", body: "Four workers were killed at a depot [ev:aaaaaaaaaaaa]. A minister spoke about talks [ev:cccccccccccc].", event_ids: ["aaaaaaaaaaaa", "cccccccccccc"] },
      { heading: "Yemen", body: "A drone attack was reported [ev:bbbbbbbbbbbb]. An invented event was also reported [ev:ffffffffffff].", event_ids: ["bbbbbbbbbbbb"] },
    ],
    civilian_note: "Workers died in Tehran [ev:aaaaaaaaaaaa].",
  };

  it("publishes a clean daily, cites only given ids, and prices the call", () => {
    const d = writer.assemble({ kind: "daily", key: "2026-10-28", inputs: inputs(), output: { ...output, sections: output.sections.slice(0, 1) }, usage: { input_tokens: 10_000, output_tokens: 2_000 }, now: new Date("2026-10-29T06:00:00Z") });
    expect(d.status).toBe("published");
    expect(d.needs_review).toEqual([]);
    expect(d.cited_ids).toEqual(["aaaaaaaaaaaa", "bbbbbbbbbbbb", "cccccccccccc"]);
    expect(d.usage.cost_usd).toBeCloseTo(0.002, 6);
    expect(d.revision).toBe(1);
    expect(d.top_events.map((e) => e.id)).toContain("aaaaaaaaaaaa");
    expect(d.disclosure).toContain("Automated digest");
  });

  it("drops the sentence that cites an unknown id and flags the dispatch", () => {
    const d = writer.assemble({ kind: "daily", key: "2026-10-28", inputs: inputs(), output, usage: null, now: new Date("2026-10-29T06:00:00Z") });
    expect(d.sections[1].body).toBe("A drone attack was reported [ev:bbbbbbbbbbbb].");
    expect(d.needs_review).toContain("unknown_citations:1");
    expect(d.status).toBe("draft");
    expect(d.check.dropped_sentences).toBe(1);
  });

  it("flags invented numbers", () => {
    const d = writer.assemble({
      kind: "daily",
      key: "2026-10-28",
      inputs: inputs(),
      output: { ...output, sections: [{ heading: "Iran", body: "Roughly 350 people were displaced [ev:aaaaaaaaaaaa].", event_ids: [] }] },
      usage: null,
      now: new Date("2026-10-29T06:00:00Z"),
    });
    expect(d.needs_review.some((r) => r.startsWith("unverified_numbers:350"))).toBe(true);
    expect(d.status).toBe("draft");
  });

  it("weekly lands as a draft that auto-publishes 24 h later; a pulled one regenerates as draft", () => {
    const now = new Date("2026-11-02T06:30:00Z");
    const d = writer.assemble({ kind: "weekly", key: "2026-W44", inputs: writer.buildInputs("weekly", "2026-W44", dataset), output: { ...output, sections: output.sections.slice(0, 1) }, usage: null, now });
    expect(d.status).toBe("draft");
    expect(d.publish_after).toBe("2026-11-03T06:30:00.000Z");
    const again = writer.assemble({ kind: "daily", key: "2026-10-28", inputs: inputs(), output: { ...output, sections: output.sections.slice(0, 1) }, usage: null, now, existing: { status: "pulled", revision: 3 } });
    expect(again.status).toBe("draft");
    expect(again.revision).toBe(4);
  });

  it("regenerating a live dispatch keeps it live; a flagged regeneration does not", () => {
    const now = new Date("2026-10-29T06:00:00Z");
    const clean = { ...output, sections: output.sections.slice(0, 1) };
    const live = { status: "published", published_at: "2026-10-29T06:00:00.000Z", revision: 1 };
    const again = writer.assemble({ kind: "weekly", key: "2026-W44", inputs: writer.buildInputs("weekly", "2026-W44", dataset), output: clean, usage: null, now, existing: live });
    expect(again.status).toBe("published");
    expect(again.published_at).toBe("2026-10-29T06:00:00.000Z");
    // A draft that auto-published counts as live too.
    const autoLive = { status: "draft", publish_after: "2026-10-28T06:30:00.000Z", needs_review: [], revision: 1 };
    expect(writer.assemble({ kind: "weekly", key: "2026-W44", inputs: writer.buildInputs("weekly", "2026-W44", dataset), output: clean, usage: null, now, existing: autoLive }).status).toBe("published");
    const flagged = writer.assemble({ kind: "daily", key: "2026-10-28", inputs: inputs(), output, usage: null, now, existing: live });
    expect(flagged.status).toBe("draft");
  });

  it("a lede with no surviving citation holds the dispatch; uncited sentences never publish", () => {
    const d = writer.assemble({ kind: "daily", key: "2026-10-28", inputs: inputs(), output: { ...output, sections: output.sections.slice(0, 1), lede: "An uncited summary of the day." }, usage: null, now: new Date("2026-10-29T06:00:00Z") });
    expect(d.lede).toBe("");
    expect(d.needs_review).toContain("no_lede");
    expect(d.status).toBe("draft");
    const mixed = writer.assemble({ kind: "daily", key: "2026-10-28", inputs: inputs(), output: { ...output, sections: [{ heading: "Iran", body: "Cited [ev:aaaaaaaaaaaa]. This sentence invents a claim with no source.", event_ids: [] }] }, usage: null, now: new Date("2026-10-29T06:00:00Z") });
    expect(mixed.sections[0].body).toBe("Cited [ev:aaaaaaaaaaaa].");
    expect(mixed.check.uncited_sentences).toBe(1);
  });

  it("weekly prose may repeat a figure that a daily already cited", () => {
    const now = new Date("2026-11-02T06:30:00Z");
    // A daily for 2026-10-28 whose cited text carries "40 wounded"; the
    // weekly's own inputs do not include that event's text.
    const daily = writer.assemble({ kind: "daily", key: "2026-10-28", inputs: inputs(), output: { ...output, sections: [{ heading: "Iran", body: "Four workers were killed and 40 wounded at a depot [ev:aaaaaaaaaaaa].", event_ids: [] }] }, usage: null, now });
    daily.needs_review = [];
    store.writeDispatch(daily);
    const wInputs = writer.buildInputs("weekly", "2026-W44", dataset);
    expect(wInputs.childDispatches.map((c) => c.key)).toContain("2026-10-28");
    const weekly = writer.assemble({ kind: "weekly", key: "2026-W44", inputs: wInputs, output: { ...output, sections: [{ heading: "Iran", body: "The week's worst strike left 40 wounded [ev:aaaaaaaaaaaa].", event_ids: [] }] }, usage: null, now });
    expect(weekly.needs_review.some((r) => r.startsWith("unverified_numbers"))).toBe(false);
  });

  it("round-trips through the store, honours publish state, and refuses bad keys", () => {
    const d = writer.assemble({ kind: "daily", key: "2026-10-28", inputs: inputs(), output: { ...output, sections: output.sections.slice(0, 1) }, usage: null, now: new Date("2026-10-29T06:00:00Z") });
    store.writeDispatch(d);
    expect(existsSync(join(tmp, "daily", "2026-10-28.json"))).toBe(true);
    expect(JSON.parse(readFileSync(join(tmp, "daily", "2026-10-28.json"), "utf-8")).title).toBe(d.title);
    expect(store.readDispatch("daily", "2026-10-28")?.key).toBe("2026-10-28");
    expect(store.publishedDispatches("daily").map((x) => x.key)).toContain("2026-10-28");
    expect(store.readDispatch("daily", "../../etc/passwd")).toBeNull();
    expect(() => store.writeDispatch({ ...d, key: "../x" })).toThrow();
    // Now the weekly for that week sees the daily as an input.
    const weekly = writer.buildInputs("weekly", "2026-W44", dataset);
    expect(weekly.childDispatches.map((c) => c.key)).toEqual(["2026-10-28"]);
  });
});
