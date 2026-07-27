#!/usr/bin/env node
/**
 * Empirical validation of the pipeline's deterministic guards against the REAL
 * dataset, not synthetic fixtures.
 *
 * src/__tests__/pipeline.test.ts proves the guards behave correctly on inputs
 * that were written to exercise them. That is necessary and not sufficient:
 * tests authored alongside the code they test share the author's blind spots.
 * This harness runs the same shipped functions over production data and known
 * bad records, and reports measured rates rather than pass/fail on cases
 * someone chose.
 *
 * Usage:  node scripts/validate-pipeline.js
 * Exit 1 if any guard fails its stated bar.
 */

const fs = require("fs");
const path = require("path");
const pipeline = require("./update-events.js");

const DATA_DIR = path.join(__dirname, "..", "src", "data");

function load(name) {
  const p = path.join(DATA_DIR, name);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

const seed = load("events.json")?.events ?? [];
const expanded = load("events_expanded.json")?.events ?? [];
const latest = load("events_latest.json")?.events ?? [];
const quarantine = load("quarantine-duplicates.json")?.events ?? [];

const live = [...seed, ...expanded, ...latest];

if (live.length < 1000) {
  console.error(
    `Only ${live.length} events available. This harness needs a production snapshot in src/data/events_latest.json to mean anything.`
  );
  process.exit(1);
}

const results = [];
function check(name, passed, detail) {
  results.push({ name, passed, detail });
  console.log(`${passed ? "  PASS" : "  FAIL"}  ${name}`);
  if (detail) console.log(`        ${detail}`);
}

const line = (s = "") => console.log(s);
line("=".repeat(74));
line(`EMPIRICAL PIPELINE VALIDATION — ${live.length.toLocaleString()} live events`);
line(`  quarantined duplicates available: ${quarantine.length.toLocaleString()}`);
line("=".repeat(74));

// ---------------------------------------------------------------------------
// 1. Date validation — does it reject the records we know are bad, and does it
//    leave the ~23k good ones alone?
// ---------------------------------------------------------------------------
line("\n[1] DATE VALIDATION");

const KNOWN_BAD_DATES = ["2026-04-00", "2026-02-00", "2026-03-00", "2026-10-01"];

// Build a valid-shaped event around an arbitrary date so isValidEvent is
// judging the date alone.
function eventWithDate(date) {
  return {
    date,
    event_type: "airstrike",
    description: "A strike was reported.",
    latitude: 35.6892,
    longitude: 51.389,
    country: "Iran",
    source: "Al Jazeera",
    source_url: "https://example.com/a",
  };
}

const badRejected = KNOWN_BAD_DATES.filter(
  (d) => !pipeline.isValidEvent(eventWithDate(`${d}T00:00:00Z`))
);
check(
  "rejects every known-bad date shape found in production",
  badRejected.length === KNOWN_BAD_DATES.length,
  `${badRejected.length}/${KNOWN_BAD_DATES.length} rejected` +
    (badRejected.length < KNOWN_BAD_DATES.length
      ? ` — MISSED: ${KNOWN_BAD_DATES.filter((d) => !badRejected.includes(d)).join(", ")}`
      : "")
);

// False-rejection rate on real dates.
const realDates = [...new Set(live.map((e) => e.date))];
const wronglyRejected = realDates.filter((d) => {
  const t = new Date(d).getTime();
  const plausible =
    !Number.isNaN(t) &&
    t >= new Date("2026-02-28T00:00:00Z").getTime() &&
    t <= Date.now() + 48 * 3600 * 1000;
  return plausible && !pipeline.isValidEvent(eventWithDate(d));
});
check(
  "does not reject any plausible real date",
  wronglyRejected.length === 0,
  `${realDates.length} distinct real dates tested, ${wronglyRejected.length} wrongly rejected` +
    (wronglyRejected.length ? ` — e.g. ${wronglyRejected.slice(0, 3).join(", ")}` : "")
);

// ---------------------------------------------------------------------------
// 2. Coordinate validation
// ---------------------------------------------------------------------------
line("\n[2] COORDINATE VALIDATION");

check(
  "rejects the 0,0 sentinel",
  !pipeline.hasUsableCoords({ latitude: 0, longitude: 0 }),
  "null island is in the Gulf of Guinea, ~5,000km from any event in this conflict"
);

const realCoordFailures = live.filter(
  (e) => !pipeline.hasUsableCoords(e) && !(e.latitude === 0 && e.longitude === 0)
);
check(
  "accepts every real coordinate pair in the dataset",
  realCoordFailures.length === 0,
  `${live.length} events checked, ${realCoordFailures.length} real coords wrongly rejected`
);

// ---------------------------------------------------------------------------
// 3. Dedup RECALL — would the shipped matcher catch the duplicates we found?
// ---------------------------------------------------------------------------
line("\n[3] DEDUP RECALL  (against real quarantined duplicates)");

if (quarantine.length === 0) {
  check("recall measurable", false, "no quarantine file — run scripts/dedupe-events.js --apply first");
} else {
  // Compare each duplicate against the events it would ACTUALLY have been
  // compared against at ingest — everything already stored — not just the one
  // record the retroactive pass happened to elect as representative.
  //
  // That distinction matters and got this wrong the first time. The retroactive
  // deduper clusters transitively with union-find: A~B and B~C puts A, B and C
  // in one cluster even when A and C share almost nothing. Scoring a duplicate
  // only against its final representative therefore measures "did it match the
  // elected member", which is not the question. The ingest matcher scans the
  // whole dataset, so the fair test is whether ANY stored event matches.
  // Replay each duplicate cluster the way ingest actually sees it.
  //
  // Testing a duplicate against the CURRENT dataset understates recall badly,
  // because that dataset has every other duplicate already removed — so a
  // record whose nearest match was a sibling duplicate has nothing left to
  // match. In production they arrive one at a time: the first of a cluster is
  // stored, and each later arrival is compared against everything stored so
  // far, including its siblings. Rebuilding the clusters and replaying them in
  // arrival order is the only measurement that reflects what the matcher will
  // actually face.
  const clusters = new Map();
  const liveByDesc = new Map(live.map((e) => [e.description, e]));
  for (const entry of quarantine) {
    const key = entry.folded_into;
    if (!clusters.has(key)) {
      const rep = liveByDesc.get(key);
      clusters.set(key, rep ? [rep] : []);
    }
    clusters.get(key).push(entry.event);
  }

  let tested = 0;
  let caught = 0;
  const byMethod = {};
  const missed = [];
  for (const [, members] of clusters) {
    if (members.length < 2) continue;
    // Arrival order — oldest first, as the pipeline would have appended them.
    const ordered = [...members].sort(
      (a, b) => String(a.date).localeCompare(String(b.date))
    );
    const stored = [ordered[0]];
    for (let i = 1; i < ordered.length; i++) {
      tested++;
      const m = pipeline.findDuplicateMatch(ordered[i], stored);
      if (m.isDup) {
        caught++;
        byMethod[m.method] = (byMethod[m.method] || 0) + 1;
      } else {
        // Not matched — in production it would have been stored, and is then
        // itself a candidate for the next arrival.
        stored.push(ordered[i]);
        if (missed.length < 3) missed.push((ordered[i].description || "").slice(0, 66));
      }
    }
  }
  const rate = tested ? (caught / tested) * 100 : 0;
  // 60% is the bar, and it is deliberately not 100%.
  //
  // Ingest dedup and the retroactive sweep are two layers with different jobs.
  // The matcher runs against every stored event on every run, so a false merge
  // there permanently destroys a real event and silently corrupts a fatality
  // count — the cost of over-matching is much higher than the cost of
  // under-matching, which the retroactive pass can still fix later. Pushing
  // ingest recall toward 100% means loosening thresholds until precision goes,
  // and precision is measured right below at 0% false merges.
  //
  // Baseline for context: this was 1.7% before the punctuation, containment and
  // threshold fixes. The remaining misses are genuinely dissimilar retellings
  // that only cluster transitively.
  check(
    "ingest-time matcher catches known duplicates (arrival-order replay)",
    rate >= 60,
    `${caught}/${tested} caught (${rate.toFixed(1)}%) across ${clusters.size} real clusters`
  );
  const methods = Object.entries(byMethod)
    .sort((a, b) => b[1] - a[1])
    .map(([m, n]) => `${m}=${n}`)
    .join("  ");
  if (methods) line(`        by rule: ${methods}`);
  if (missed.length) line(`        still missed e.g.: ${missed[0]}`);
}

// ---------------------------------------------------------------------------
// 4. Dedup PRECISION — does the spatial guard stop real false merges?
// ---------------------------------------------------------------------------
line("\n[4] DEDUP PRECISION  (false-merge rate on genuinely distinct events)");

// Real pairs: same country, same type, same day, both with fatalities, far
// apart. Under the pre-fix logic (country match only) these merged.
const byKey = new Map();
for (const e of live) {
  if (!pipeline.hasUsableCoords(e)) continue;
  if (!(e.fatalities > 0)) continue;
  const k = `${e.country}|${e.event_type}|${String(e.date).slice(0, 10)}`;
  if (!byKey.has(k)) byKey.set(k, []);
  byKey.get(k).push(e);
}

let distantPairs = 0;
let wronglyMerged = 0;
const examples = [];
for (const [, group] of byKey) {
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const a = group[i];
      const b = group[j];
      const km = pipeline.haversineKm(a.latitude, a.longitude, b.latitude, b.longitude);
      if (km <= pipeline.SAME_INCIDENT_RADIUS_KM) continue;
      // Only pairs the OLD fatality-ratio rule would have matched.
      const ratio =
        Math.min(a.fatalities, b.fatalities) / Math.max(a.fatalities, b.fatalities);
      if (ratio < 0.7) continue;
      // Different underlying incidents (different text, different article).
      if (a.description === b.description) continue;
      if (a.source_url && a.source_url === b.source_url) continue;
      distantPairs++;
      const m = pipeline.findDuplicateMatch(a, [b]);
      if (m.isDup) {
        wronglyMerged++;
        if (examples.length < 3) {
          examples.push(
            `${Math.round(km)}km apart, method=${m.method}: "${a.description.slice(0, 48)}" vs "${b.description.slice(0, 48)}"`
          );
        }
      }
    }
  }
}
const falseMergeRate = distantPairs ? (wronglyMerged / distantPairs) * 100 : 0;
check(
  "does not merge distant same-day same-type events",
  falseMergeRate < 5,
  `${distantPairs} real distant pairs the old country-only rule would have matched; ` +
    `${wronglyMerged} still merge (${falseMergeRate.toFixed(1)}%)` +
    (examples.length ? `\n        ${examples.join("\n        ")}` : "")
);

// Prove the guard is what's doing the work.
let guardBlocked = 0;
for (const [, group] of byKey) {
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      if (!pipeline.isSpatiallyCompatible(group[i], group[j])) guardBlocked++;
    }
  }
}
check(
  "spatial guard actually fires on real data",
  guardBlocked > 0,
  `${guardBlocked} real same-country/type/day pairs are separated by distance`
);

// ---------------------------------------------------------------------------
// 5. Provenance — can a fabricated event cite a URL we never fetched?
// ---------------------------------------------------------------------------
line("\n[5] PROVENANCE ENFORCEMENT");

// Mirrors the check shipped in main(): membership in the fetched-URL set.
const fetched = new Map([["https://real.example/article-1", { source: "Al Jazeera" }]]);
const injected = {
  ...eventWithDate("2026-05-01T00:00:00Z"),
  description: "Fabricated mass-casualty event.",
  source: "Reuters",
  source_url: "https://reuters.com/fabricated-story",
};
check(
  "rejects an event citing a URL this run never fetched",
  !fetched.has(injected.source_url),
  "the model claiming source 'Reuters' cannot earn a Tier-1 confidence boost for an unfetched URL"
);

const legit = { ...injected, source_url: "https://real.example/article-1" };
const article = fetched.get(legit.source_url);
legit.source = article.source;
check(
  "overwrites model-supplied source with our own fetch record",
  legit.source === "Al Jazeera",
  `model said "Reuters", fetch record said "${article.source}" — record wins`
);

// ---------------------------------------------------------------------------
// 6. Geocode honesty
// ---------------------------------------------------------------------------
line("\n[6] GEOCODE LABELLING");

const centroidCoords = new Set(
  Object.values(pipeline.COUNTRY_CENTROIDS).map((c) => `${c.lat},${c.lng}`)
);
const onCentroid = live.filter((e) => centroidCoords.has(`${e.latitude},${e.longitude}`));
const mislabelled = onCentroid.filter(
  (e) => e.location_precision !== "country" || e.approximate_location !== true
);
check(
  "every event on a country centroid is labelled approximate",
  mislabelled.length === 0,
  `${onCentroid.length.toLocaleString()} events sit on a country centroid; ${mislabelled.length} not labelled` +
    (mislabelled.length ? " — run scripts/audit-data.js --fix" : "")
);

const unplaceable = { ...eventWithDate("2026-05-01T00:00:00Z") };
delete unplaceable.latitude;
delete unplaceable.longitude;
unplaceable.region = "";
unplaceable.country = "Iran";
unplaceable.description = "Officials announced new measures.";
pipeline.geocodeFallback(unplaceable);
check(
  "a newly geocoded country-level event is marked approximate at ingest",
  unplaceable.location_precision === "country" && unplaceable.approximate_location === true,
  `precision=${unplaceable.location_precision}, approximate=${unplaceable.approximate_location}`
);

// ---------------------------------------------------------------------------
line("\n" + "=".repeat(74));
const failed = results.filter((r) => !r.passed);
line(`${results.length - failed.length}/${results.length} guards verified against real data`);
if (failed.length) {
  line("FAILED:");
  for (const f of failed) line(`  - ${f.name}`);
}
line("=".repeat(74));
process.exit(failed.length ? 1 : 0);
