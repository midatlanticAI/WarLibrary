#!/usr/bin/env node
/**
 * Retroactive near-duplicate finder for the existing event dataset.
 *
 * The pipeline's dedup runs at ingest time and is fatality-gated, so it never
 * fires on the `strategic_development` events that make up ~71% of the dataset.
 * The result is clusters like 125 "Iran / strategic_development" events on a
 * single day — the same story re-extracted from reworded headlines.
 *
 * This script finds those clusters after the fact.
 *
 * SAFETY: nothing is ever deleted. `--apply` MOVES duplicates into
 * src/data/quarantine-duplicates.json, keeping one representative per cluster
 * in the live dataset. The quarantine file records the full original event plus
 * which event it was folded into, so any decision here is reversible with
 * `--restore`.
 *
 * Usage:
 *   node scripts/dedupe-events.js                  # report only (default)
 *   node scripts/dedupe-events.js --verbose        # show sample clusters
 *   node scripts/dedupe-events.js --apply          # quarantine duplicates
 *   node scripts/dedupe-events.js --restore        # put everything back
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "src", "data");
const LATEST_FILE = path.join(DATA_DIR, "events_latest.json");
const QUARANTINE_FILE = path.join(DATA_DIR, "quarantine-duplicates.json");

const APPLY = process.argv.includes("--apply");
const RESTORE = process.argv.includes("--restore");
const VERBOSE = process.argv.includes("--verbose");

// ---------------------------------------------------------------------------
// Similarity
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  "a","an","the","and","or","but","in","on","at","to","for","of","with","by",
  "from","is","was","are","were","be","been","being","has","had","have","do",
  "does","did","will","would","could","should","may","might","must","can",
  "that","this","these","those","it","its","as","after","before","during",
  "over","under","near","into","out","up","down","about","against","between",
  "more","than","also","said","says","reported","reports","according",
]);

function normalize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function significantWords(text) {
  return new Set(
    normalize(text)
      .split(" ")
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  );
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / (a.size + b.size - shared);
}

/** Overlap coefficient — catches one description being a fuller retelling of another. */
function containment(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / Math.min(a.size, b.size);
}

// Deliberately conservative. These thresholds were chosen by inspecting the
// clusters they produce on the live dataset; loosening them starts folding
// together genuinely distinct events in the same country on the same day.
const JACCARD_THRESHOLD = 0.55;
const CONTAINMENT_THRESHOLD = 0.8;
const MIN_WORDS_FOR_CONTAINMENT = 6;

function isDuplicatePair(a, b) {
  // Identical text after normalization.
  if (a.norm && a.norm === b.norm) return "identical_text";
  // Same article.
  if (a.event.source_url && a.event.source_url === b.event.source_url) {
    return "same_source_url";
  }
  const j = jaccard(a.words, b.words);
  if (j >= JACCARD_THRESHOLD) return "word_overlap";
  if (
    a.words.size >= MIN_WORDS_FOR_CONTAINMENT &&
    b.words.size >= MIN_WORDS_FOR_CONTAINMENT &&
    containment(a.words, b.words) >= CONTAINMENT_THRESHOLD
  ) {
    return "containment";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Representative selection — keep the most useful record in each cluster
// ---------------------------------------------------------------------------

function score(event) {
  let s = 0;
  if (event.source_url) s += 1000;
  if (event.verification_status && event.verification_status !== "unconfirmed") s += 200;
  if (typeof event.confidence === "number") s += Math.round(event.confidence * 100);
  if (typeof event.fatalities === "number" && event.fatalities > 0) s += 150;
  if (event.civilian_impact) s += 50;
  if (event.location_precision && event.location_precision !== "country") s += 75;
  // Longer descriptions usually carry more detail, but cap the contribution so
  // verbosity alone can't beat a properly-sourced record.
  s += Math.min((event.description || "").length, 300) / 10;
  return s;
}

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

if (RESTORE) {
  if (!fs.existsSync(QUARANTINE_FILE)) {
    console.error("Nothing to restore — no quarantine file found.");
    process.exit(1);
  }
  const quarantine = JSON.parse(fs.readFileSync(QUARANTINE_FILE, "utf-8"));
  const live = JSON.parse(fs.readFileSync(LATEST_FILE, "utf-8"));
  const restored = quarantine.events.map((entry) => entry.event);
  live.events = [...live.events, ...restored];
  const tmp = `${LATEST_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(live, null, 2), "utf-8");
  fs.renameSync(tmp, LATEST_FILE);
  fs.unlinkSync(QUARANTINE_FILE);
  console.log(`Restored ${restored.length} events. Dataset is back to ${live.events.length}.`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

if (!fs.existsSync(LATEST_FILE)) {
  console.error(`No ${path.basename(LATEST_FILE)} found — nothing to dedupe.`);
  process.exit(1);
}
const wrapper = JSON.parse(fs.readFileSync(LATEST_FILE, "utf-8"));
const events = wrapper.events || [];
console.log(`Loaded ${events.length} events from ${path.basename(LATEST_FILE)}`);

// Precompute once — this dominates the runtime otherwise.
const records = events.map((event, index) => ({
  index,
  event,
  norm: normalize(event.description),
  words: significantWords(event.description),
}));

// ---------------------------------------------------------------------------
// Cluster within blocking keys
// ---------------------------------------------------------------------------

/**
 * Blocking key limits pairwise comparison to plausible candidates. Country +
 * event_type + day matches how the duplicates actually cluster, and keeps this
 * O(sum of block² ) rather than O(n²) across 24k events.
 */
function blockKey(event) {
  return `${event.country}|${event.event_type}|${String(event.date).slice(0, 10)}`;
}

const blocks = new Map();
for (const rec of records) {
  const key = blockKey(rec.event);
  if (!blocks.has(key)) blocks.set(key, []);
  blocks.get(key).push(rec);
}

// Union-find over record indices.
const parent = new Map();
function find(x) {
  if (!parent.has(x)) parent.set(x, x);
  while (parent.get(x) !== x) {
    parent.set(x, parent.get(parent.get(x)));
    x = parent.get(x);
  }
  return x;
}
function union(a, b) {
  const ra = find(a);
  const rb = find(b);
  if (ra !== rb) parent.set(ra, rb);
}

const methodCounts = {};
let comparisons = 0;

for (const [, group] of blocks) {
  if (group.length < 2) continue;
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      comparisons++;
      const method = isDuplicatePair(group[i], group[j]);
      if (method) {
        methodCounts[method] = (methodCounts[method] || 0) + 1;
        union(group[i].index, group[j].index);
      }
    }
  }
}

// Collect clusters.
const clusters = new Map();
for (const rec of records) {
  const root = find(rec.index);
  if (!clusters.has(root)) clusters.set(root, []);
  clusters.get(root).push(rec);
}

const dupClusters = [...clusters.values()].filter((c) => c.length > 1);
dupClusters.sort((a, b) => b.length - a.length);

const keep = new Set();
const drop = [];
for (const cluster of dupClusters) {
  const best = cluster.reduce((a, b) => (score(b.event) > score(a.event) ? b : a));
  keep.add(best.index);
  for (const rec of cluster) {
    if (rec.index !== best.index) {
      drop.push({ rec, keptIndex: best.index, keptDescription: best.event.description });
    }
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log("");
console.log("=".repeat(72));
console.log(APPLY ? "DEDUPE — APPLYING (quarantine, not delete)" : "DEDUPE — REPORT ONLY (use --apply)");
console.log("=".repeat(72));
console.log(`blocking groups:            ${blocks.size}`);
console.log(`pairwise comparisons:       ${comparisons.toLocaleString()}`);
console.log(`duplicate clusters found:   ${dupClusters.length}`);
console.log(`events that would be kept:  ${events.length - drop.length}`);
console.log(`events to quarantine:       ${drop.length}  (${((drop.length / events.length) * 100).toFixed(1)}% of dataset)`);
console.log("");
console.log("matches by rule:");
for (const [m, n] of Object.entries(methodCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`   ${String(n).padStart(7)}  ${m}`);
}

const sizes = dupClusters.map((c) => c.length);
if (sizes.length) {
  console.log("");
  console.log(`largest cluster:            ${Math.max(...sizes)} events`);
  console.log(`clusters of 2:              ${sizes.filter((s) => s === 2).length}`);
  console.log(`clusters of 3-5:            ${sizes.filter((s) => s >= 3 && s <= 5).length}`);
  console.log(`clusters of 6+:             ${sizes.filter((s) => s >= 6).length}`);
}

if (VERBOSE) {
  console.log("");
  console.log("SAMPLE CLUSTERS (largest first)");
  for (const cluster of dupClusters.slice(0, 6)) {
    const best = cluster.reduce((a, b) => (score(b.event) > score(a.event) ? b : a));
    console.log("");
    console.log(`  [${cluster.length} events] ${blockKey(best.event)}`);
    console.log(`   KEEP: ${(best.event.description || "").slice(0, 110)}`);
    for (const rec of cluster.filter((r) => r.index !== best.index).slice(0, 4)) {
      console.log(`   drop: ${(rec.event.description || "").slice(0, 110)}`);
    }
    if (cluster.length > 5) console.log(`   ... and ${cluster.length - 5} more`);
  }
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

if (!APPLY) {
  console.log("");
  console.log("No files modified. Re-run with --apply to quarantine the duplicates.");
  console.log("Quarantine is reversible: node scripts/dedupe-events.js --restore");
  process.exit(0);
}

const dropIndices = new Set(drop.map((d) => d.rec.index));
const remaining = records.filter((r) => !dropIndices.has(r.index)).map((r) => r.event);

const quarantine = {
  generated: new Date().toISOString(),
  note:
    "Near-duplicate events removed from events_latest.json by scripts/dedupe-events.js. " +
    "Nothing here has been deleted — restore with `node scripts/dedupe-events.js --restore`.",
  thresholds: {
    jaccard: JACCARD_THRESHOLD,
    containment: CONTAINMENT_THRESHOLD,
  },
  events: drop.map((d) => ({
    event: d.rec.event,
    folded_into: d.keptDescription,
  })),
};

function writeAtomic(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, file);
}

writeAtomic(QUARANTINE_FILE, quarantine);
writeAtomic(LATEST_FILE, { ...wrapper, events: remaining });

console.log("");
console.log(`Quarantined ${drop.length} events -> ${path.basename(QUARANTINE_FILE)}`);
console.log(`Live dataset is now ${remaining.length} events.`);
console.log("Reverse with: node scripts/dedupe-events.js --restore");
