#!/usr/bin/env node
/**
 * Backfill the conflict registry and the grounded fields onto existing rows.
 *
 *   node scripts/backfill-registry.js                 # all three event files
 *   node scripts/backfill-registry.js --dry-run       # report only
 *   node scripts/backfill-registry.js --file src/data/events_latest.json
 *   node scripts/backfill-registry.js --backup-dir /opt/backups/warlibrary
 *
 * Every row that predates the registry was extracted for the Iran war, so it
 * gets `conflict_id: "epic-fury-2026"`. The grounded fields are added with
 * honest values: nothing is invented. A legacy row has no evidence quote, its
 * single source becomes a one-entry `sources` list, and its `geo_source` is
 * "centroid" when it sits on a country centroid and "legacy" otherwise (we
 * cannot tell after the fact whether the model placed it from the article).
 * Verification status is NOT changed retroactively: the two-outlet rule for
 * "confirmed" applies to rows extracted from 2026-10-29 on, and the codebook
 * says so.
 *
 * Idempotent: a second run changes nothing. Writes are atomic and a backup
 * copy of each file is taken first.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(PROJECT_ROOT, "src", "data");
const DEFAULT_CONFLICT_ID = "epic-fury-2026";
const DEFAULT_FILES = ["events.json", "events_expanded.json", "events_latest.json"];

/** Returns true when the row was changed. */
function backfillEvent(e) {
  let changed = false;
  const set = (field, value) => {
    if (e[field] === undefined) {
      e[field] = value;
      changed = true;
    }
  };

  set("conflict_id", DEFAULT_CONFLICT_ID);
  set("revision", 1);
  set("first_reported_at", e.created_at || e.date || null);
  set("updated_at", null);

  if (!Array.isArray(e.sources)) {
    e.sources = [{ name: e.source || "Unknown", url: e.source_url || null }];
    changed = true;
  }
  if (e.source_count !== e.sources.length) {
    e.source_count = e.sources.length;
    changed = true;
  }

  set("evidence_quote", null);
  set("sub_event_type", null);

  const f = typeof e.fatalities === "number" && Number.isFinite(e.fatalities) ? e.fatalities : null;
  set("fatalities_min", f);
  set("fatalities_max", f);
  set("fatalities_attribution", null);

  const actors = Array.isArray(e.actors) ? e.actors.filter((a) => typeof a === "string" && a.trim()) : [];
  set("actor1", actors[0] || null);
  set("actor2", actors[1] || null);
  set("actor1_type", actors[0] ? "unknown" : null);
  set("actor2_type", actors[1] ? "unknown" : null);

  if (e.geo_source === undefined) {
    e.geo_source = e.approximate_location === true || e.location_precision === "country" ? "centroid" : "legacy";
    changed = true;
  }
  return changed;
}

function backfillFile(file, { dryRun = false, backupDir = null } = {}) {
  if (!fs.existsSync(file)) return { file, skipped: "missing" };
  const raw = fs.readFileSync(file, "utf-8");
  const parsed = JSON.parse(raw);
  const events = Array.isArray(parsed) ? parsed : parsed.events;
  if (!Array.isArray(events)) throw new Error(`${file}: no events array`);

  let changed = 0;
  for (const e of events) if (backfillEvent(e)) changed++;

  if (changed === 0 || dryRun) return { file, total: events.length, changed, written: false };

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = backupDir && fs.existsSync(backupDir) ? backupDir : path.dirname(file);
  const backup = path.join(dir, `${path.basename(file, ".json")}.backup-prebackfill-${stamp}.json`);
  fs.copyFileSync(file, backup);

  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(parsed, null, 2) + "\n", "utf-8");
  // Sanity: the file we are about to install must parse and keep every row.
  const check = JSON.parse(fs.readFileSync(tmp, "utf-8"));
  const checkEvents = Array.isArray(check) ? check : check.events;
  if (!Array.isArray(checkEvents) || checkEvents.length !== events.length) {
    fs.unlinkSync(tmp);
    throw new Error(`${file}: rewrite lost rows (${checkEvents?.length} vs ${events.length}); aborted, original untouched`);
  }
  fs.renameSync(tmp, file);
  return { file, total: events.length, changed, written: true, backup };
}

function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const fileIdx = argv.indexOf("--file");
  const backupIdx = argv.indexOf("--backup-dir");
  const backupDir = backupIdx !== -1 ? argv[backupIdx + 1] : null;
  const files = fileIdx !== -1 ? [path.resolve(argv[fileIdx + 1])] : DEFAULT_FILES.map((f) => path.join(DATA_DIR, f));

  for (const file of files) {
    const r = backfillFile(file, { dryRun, backupDir });
    if (r.skipped) console.log(`${path.basename(file)}: ${r.skipped}`);
    else console.log(`${path.basename(file)}: ${r.changed} of ${r.total} rows ${dryRun ? "would change" : r.written ? "updated" : "already current"}${r.backup ? ` (backup ${r.backup})` : ""}`);
  }
}

module.exports = { backfillEvent, backfillFile, DEFAULT_CONFLICT_ID };

if (require.main === module) main();
