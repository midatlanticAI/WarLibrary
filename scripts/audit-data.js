#!/usr/bin/env node
/**
 * Dataset auditor and repairer for War Library.
 *
 * The pipeline fixes in update-events.js prevent NEW bad records. This script
 * deals with records already in the dataset.
 *
 * It is report-only by default. `--fix` applies repairs, and every repair is
 * ADDITIVE or CORRECTIVE — it annotates, re-geocodes, or normalizes. Nothing in
 * this script ever deletes an event. Duplicate clusters are reported for human
 * review and deliberately left alone: collapsing them is a judgement call about
 * the historical record, not a mechanical fix.
 *
 * Usage:
 *   node scripts/audit-data.js            # report only
 *   node scripts/audit-data.js --fix      # apply non-destructive repairs
 *   node scripts/audit-data.js --json     # machine-readable report
 */

const fs = require("fs");
const path = require("path");

const pipeline = require("./update-events.js");

const DATA_DIR = path.join(__dirname, "..", "src", "data");
const FILES = ["events.json", "events_expanded.json", "events_latest.json"];

const APPLY_FIX = process.argv.includes("--fix");
const AS_JSON = process.argv.includes("--json");

const CONFLICT_START = new Date("2026-02-28T00:00:00Z").getTime();
const MAX_FUTURE_MS = 48 * 3600 * 1000;

function loadFile(name) {
  const filePath = path.join(DATA_DIR, name);
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (!Array.isArray(parsed.events)) return null;
    return { filePath, wrapper: parsed, events: parsed.events };
  } catch (err) {
    console.error(`ERROR: cannot parse ${name}: ${err.message}`);
    return null;
  }
}

function writeFileAtomic(filePath, data) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, filePath);
}

const report = {
  scanned: 0,
  invalid_dates: [],
  future_dates: [],
  pre_war_dates: [],
  null_island: [],
  regeocoded: [],
  unresolvable_coords: [],
  centroid_pinned: {},
  centroid_total: 0,
  precision_corrected: 0,
  country_normalized: [],
  missing_source_url: 0,
  missing_confidence: 0,
  missing_verification: 0,
  duplicate_clusters: [],
  changed_files: [],
};

// Reverse lookup of the country centroids so already-stored events pinned to a
// centroid can be identified and marked approximate.
const CENTROID_KEYS = new Map();
for (const [country, c] of Object.entries(pipeline.COUNTRY_CENTROIDS)) {
  CENTROID_KEYS.set(`${c.lat},${c.lng}`, country);
}

const loaded = FILES.map(loadFile).filter(Boolean);
if (loaded.length === 0) {
  console.error("No readable data files found.");
  process.exit(1);
}

for (const file of loaded) {
  let dirty = false;

  for (const event of file.events) {
    report.scanned++;

    // --- dates ---------------------------------------------------------
    const time = new Date(event.date).getTime();
    if (Number.isNaN(time)) {
      report.invalid_dates.push({ date: event.date, description: (event.description || "").slice(0, 80) });
      if (APPLY_FIX && event.needs_review !== "invalid_date") {
        event.needs_review = "invalid_date";
        dirty = true;
      }
    } else if (time > Date.now() + MAX_FUTURE_MS) {
      report.future_dates.push({ date: event.date, description: (event.description || "").slice(0, 80) });
      if (APPLY_FIX && event.needs_review !== "future_date") {
        event.needs_review = "future_date";
        dirty = true;
      }
    } else if (time < CONFLICT_START) {
      report.pre_war_dates.push({ date: event.date, description: (event.description || "").slice(0, 80) });
      if (APPLY_FIX && event.needs_review !== "pre_war_date") {
        event.needs_review = "pre_war_date";
        dirty = true;
      }
    }

    // --- coordinates ---------------------------------------------------
    const atNullIsland = event.latitude === 0 && event.longitude === 0;
    if (atNullIsland) {
      report.null_island.push({
        country: event.country,
        description: (event.description || "").slice(0, 80),
      });
      if (APPLY_FIX) {
        // Clear the sentinel so the geocoder will treat it as missing, then
        // try to place it properly.
        delete event.latitude;
        delete event.longitude;
        pipeline.geocodeFallback(event);
        if (pipeline.hasUsableCoords(event)) {
          report.regeocoded.push({
            to: `${event.latitude},${event.longitude}`,
            precision: event.location_precision,
          });
        } else {
          // Could not resolve — restore the original values rather than
          // leaving the record without coordinates, and flag it.
          event.latitude = 0;
          event.longitude = 0;
          event.needs_review = "unresolvable_location";
          report.unresolvable_coords.push((event.description || "").slice(0, 80));
        }
        dirty = true;
      }
    }

    // --- country-centroid pinning --------------------------------------
    const coordKey = `${event.latitude},${event.longitude}`;
    const centroidCountry = CENTROID_KEYS.get(coordKey);
    if (centroidCountry) {
      report.centroid_pinned[centroidCountry] = (report.centroid_pinned[centroidCountry] || 0) + 1;
      report.centroid_total++;
      // These coordinates carry no real spatial information. Mark them so the
      // map can render them honestly instead of as precise points.
      if (event.location_precision !== "country" || event.approximate_location !== true) {
        if (APPLY_FIX) {
          event.location_precision = "country";
          event.approximate_location = true;
          dirty = true;
        }
        report.precision_corrected++;
      }
    }

    // --- country normalization -----------------------------------------
    const normalized = pipeline.normalizeCountry(event.country);
    if (normalized && normalized !== event.country) {
      report.country_normalized.push({ from: event.country, to: normalized });
      if (APPLY_FIX) {
        event.country = normalized;
        dirty = true;
      }
    }

    // --- provenance -----------------------------------------------------
    if (!event.source_url) report.missing_source_url++;
    if (event.confidence === undefined || event.confidence === null) report.missing_confidence++;
    if (!event.verification_status) report.missing_verification++;
  }

  if (APPLY_FIX && dirty) {
    writeFileAtomic(file.filePath, file.wrapper);
    report.changed_files.push(path.basename(file.filePath));
  }
}

// --- duplicate clusters (reported only, never modified) -----------------
const allEvents = loaded.flatMap((f) => f.events);
const clusters = new Map();
for (const e of allEvents) {
  if (!e.date) continue;
  const key = `${e.country}|${e.event_type}|${String(e.date).slice(0, 10)}`;
  if (!clusters.has(key)) clusters.set(key, 0);
  clusters.set(key, clusters.get(key) + 1);
}
report.duplicate_clusters = [...clusters.entries()]
  .filter(([, n]) => n >= 10)
  .sort((a, b) => b[1] - a[1])
  .map(([key, n]) => ({ key, count: n }));

// --- output --------------------------------------------------------------
if (AS_JSON) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const line = (s = "") => console.log(s);
line("=".repeat(72));
line(`War Library dataset audit — ${APPLY_FIX ? "FIX MODE" : "REPORT ONLY (use --fix to apply)"}`);
line("=".repeat(72));
line(`Events scanned: ${report.scanned}`);
line();

line("DATES");
line(`  unparseable:        ${report.invalid_dates.length}`);
report.invalid_dates.slice(0, 5).forEach((d) => line(`     ${JSON.stringify(d.date)}  ${d.description}`));
line(`  impossible future:  ${report.future_dates.length}`);
report.future_dates.slice(0, 5).forEach((d) => line(`     ${d.date}  ${d.description}`));
line(`  pre-war:            ${report.pre_war_dates.length}`);
line();

line("COORDINATES");
line(`  at null island (0,0):        ${report.null_island.length}`);
if (APPLY_FIX) {
  line(`     re-geocoded:              ${report.regeocoded.length}`);
  line(`     still unresolvable:       ${report.unresolvable_coords.length}`);
}
line(`  pinned to country centroid:  ${report.centroid_total}`);
Object.entries(report.centroid_pinned)
  .sort((a, b) => b[1] - a[1])
  .forEach(([c, n]) => line(`     ${String(n).padStart(6)}  ${c}`));
line(`  precision mislabelled:       ${report.precision_corrected}${APPLY_FIX ? " (corrected)" : " (would correct)"}`);
line();

line("COUNTRY NAMES");
line(`  values needing normalization: ${report.country_normalized.length}`);
const normPairs = new Map();
report.country_normalized.forEach(({ from, to }) => normPairs.set(`${from} -> ${to}`, (normPairs.get(`${from} -> ${to}`) || 0) + 1));
[...normPairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
  .forEach(([pair, n]) => line(`     ${String(n).padStart(6)}  ${pair}`));
line();

line("PROVENANCE");
line(`  missing source_url:          ${report.missing_source_url}`);
line(`  missing confidence:          ${report.missing_confidence}`);
line(`  missing verification_status: ${report.missing_verification}`);
line();

line("POSSIBLE DUPLICATE CLUSTERS  (reported only — never auto-removed)");
line(`  country+type+day groups with 10 or more events: ${report.duplicate_clusters.length}`);
report.duplicate_clusters.slice(0, 10).forEach(({ key, count }) => line(`     ${String(count).padStart(5)}  ${key}`));
line();

if (APPLY_FIX) {
  line(`FILES REWRITTEN: ${report.changed_files.length ? report.changed_files.join(", ") : "none"}`);
} else {
  line("No files were modified. Re-run with --fix to apply the corrections above.");
  line("Duplicate clusters are never modified by this script in either mode.");
}
