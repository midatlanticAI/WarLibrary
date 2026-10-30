#!/usr/bin/env node
/**
 * War Library event translator.
 *
 *   node scripts/translate-events.js                 # newest untranslated events, every language, up to --limit
 *   node scripts/translate-events.js --all           # the whole archive (backfill); resumable, idempotent
 *   node scripts/translate-events.js --lang fa       # one language only
 *   node scripts/translate-events.js --dry-run       # count what would be sent and estimate the cost; no API call
 *   node scripts/translate-events.js --limit 60 --batch 25 --concurrency 3
 *
 * Writes one JSON line per event and language to
 * src/data/translations/<lang>.jsonl (TRANSLATIONS_DIR overrides). The
 * English record is never touched; the site reads the sidecar and falls
 * back to English for any event not in it. Runs after every pipeline run
 * from scripts/auto-update.sh, so new events are in every language within
 * the half hour; the same script with --all is the one-off backfill.
 *
 * Safety: every translation passes src/lib/translate-core.cjs's checks
 * (same numbers, sane length, not left in English) before it is written.
 * A rejected event stays English and is retried on the next run; after
 * MAX_ATTEMPTS rejections it is left alone and listed in the stats so a
 * human can look at it rather than the script burning money on it forever.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const core = require("../src/lib/dispatch-core.cjs");
const tc = require("../src/lib/translate-core.cjs");
const call = require("./lib/translate-call.cjs");

const PROJECT_ROOT = call.PROJECT_ROOT;
const DATA_DIR = path.join(PROJECT_ROOT, "src", "data");
const TRANSLATIONS_DIR = process.env.TRANSLATIONS_DIR || path.join(DATA_DIR, "translations");
const STATS_FILE = path.join(TRANSLATIONS_DIR, "stats.json");
const ATTEMPTS_FILE = path.join(TRANSLATIONS_DIR, "attempts.json");
const MAX_ATTEMPTS = 3;

const DEFAULTS = { limit: 60, batch: 25, concurrency: 3, sinceHours: 72 };
const BACKFILL_LOCK = path.join(TRANSLATIONS_DIR, ".backfill.lock");

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

function readEvents(file) {
  if (!fs.existsSync(file)) return [];
  const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
  return Array.isArray(parsed) ? parsed : parsed.events || [];
}

/**
 * Same merge as the app's event store and the dispatch writer: three files
 * in order, duplicates by description dropped, ids derived from content,
 * collisions suffixed in newest-first order exactly as the store does so
 * the sidecar key matches the id the site serves.
 */
function loadDataset() {
  const files = ["events.json", "events_expanded.json", "events_latest.json"].map((f) => path.join(DATA_DIR, f));
  const seen = new Set();
  const raws = [];
  for (const file of files) {
    for (const raw of readEvents(file)) {
      const key = String(raw.description || "").trim().toLowerCase().slice(0, 120);
      if (seen.has(key)) continue;
      seen.add(key);
      raws.push(raw);
    }
  }
  const withTime = raws.map((raw) => ({ raw, time: new Date(raw.date).getTime() }));
  withTime.sort((a, b) => {
    const aBad = Number.isNaN(a.time);
    const bBad = Number.isNaN(b.time);
    if (aBad && bBad) return 0;
    if (aBad) return 1;
    if (bBad) return -1;
    return b.time - a.time;
  });
  const used = new Set();
  return withTime.map(({ raw }) => {
    let id = core.stableEventId(raw);
    if (used.has(id)) {
      let suffix = 2;
      while (used.has(`${id}-${suffix}`)) suffix++;
      id = `${id}-${suffix}`;
    }
    used.add(id);
    const reported = new Date(raw.first_reported_at || raw.date).getTime();
    return { id, description: String(raw.description || ""), civilian_impact: raw.civilian_impact || null, date: raw.date, reported };
  });
}

function readTranslatedIds(lang) {
  const file = tc.translationFile(TRANSLATIONS_DIR, lang);
  const ids = new Set();
  if (!fs.existsSync(file)) return ids;
  for (const line of fs.readFileSync(file, "utf-8").split("\n")) {
    const row = line.trim() ? tc.decodeRow(line) : null;
    if (row) ids.add(row.id);
  }
  return ids;
}

function readJson(file, fallback) {
  try {
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf-8")) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, file);
}

/** Append rows for one language. Append is atomic per write on a local disk, so a concurrent reader sees whole lines. */
function appendRows(lang, rows, model) {
  if (rows.length === 0) return;
  const file = tc.translationFile(TRANSLATIONS_DIR, lang);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const at = new Date().toISOString();
  const text = rows.map((r) => tc.encodeRow({ ...r, at, model })).join("\n") + "\n";
  fs.appendFileSync(file, text, "utf-8");
}

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { all: false, langs: Object.keys(tc.LANGUAGES), dryRun: false, ...DEFAULTS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--all") args.all = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--lang") {
      const l = argv[++i];
      if (!tc.isLanguage(l)) throw new Error(`Unknown language ${l}; one of ${Object.keys(tc.LANGUAGES).join(", ")}`);
      args.langs = [l];
    } else if (a === "--limit") args.limit = Math.max(1, Number(argv[++i]) || DEFAULTS.limit);
    else if (a === "--batch") args.batch = Math.min(50, Math.max(1, Number(argv[++i]) || DEFAULTS.batch));
    else if (a === "--concurrency") args.concurrency = Math.min(8, Math.max(1, Number(argv[++i]) || DEFAULTS.concurrency));
    else if (a === "--since-hours") {
      const n = Number(argv[++i]);
      args.sinceHours = Number.isFinite(n) && n > 0 ? n : DEFAULTS.sinceHours;
    } else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/** One backfill at a time: O_EXCL lock file holding the pid; stale when that pid is gone. */
function acquireBackfillLock() {
  fs.mkdirSync(TRANSLATIONS_DIR, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.writeFileSync(BACKFILL_LOCK, String(process.pid), { flag: "wx" });
      const release = () => {
        try {
          if (fs.readFileSync(BACKFILL_LOCK, "utf-8").trim() === String(process.pid)) fs.unlinkSync(BACKFILL_LOCK);
        } catch {
          /* already gone */
        }
      };
      process.on("exit", release);
      for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { release(); process.exit(130); });
      return true;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      let alive = false;
      try {
        process.kill(Number(fs.readFileSync(BACKFILL_LOCK, "utf-8").trim()), 0);
        alive = true;
      } catch (e) {
        alive = e.code === "EPERM";
      }
      if (alive) return false;
      try {
        fs.unlinkSync(BACKFILL_LOCK);
      } catch {
        /* raced another cleaner */
      }
    }
  }
  return false;
}

async function runPool(tasks, concurrency) {
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (next < tasks.length) {
      const i = next++;
      await tasks[i]();
    }
  });
  await Promise.all(workers);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const started = Date.now();
  console.log(`=== War Library translate-events (${args.all ? "backfill" : "incremental"}; ${args.langs.join(",")}) ===`);

  const dataset = loadDataset();
  console.log(`Dataset: ${dataset.length} events`);
  const attempts = readJson(ATTEMPTS_FILE, {});

  // Work per language: newest events without a translation, skipping ones
  // that have failed the checks MAX_ATTEMPTS times.
  // Incremental runs (every pipeline tick) only look at recently reported
  // events. The archive is the backfill's job; without this window the
  // half-hourly run would chase the backfill's frontier and pay twice for
  // the same events.
  const floor = Date.now() - args.sinceHours * 3600_000;
  const plan = [];
  let skippedExhausted = 0;
  for (const lang of args.langs) {
    const done = readTranslatedIds(lang);
    const todo = [];
    for (const e of dataset) {
      if (done.has(e.id) || !e.description.trim()) continue;
      if (!args.all && !(e.reported >= floor)) continue;
      if ((attempts[`${lang}:${e.id}`] || 0) >= MAX_ATTEMPTS) {
        skippedExhausted++;
        continue;
      }
      todo.push(e);
      if (!args.all && todo.length >= args.limit) break;
    }
    plan.push({ lang, todo, already: done.size });
  }

  let totalTodo = 0;
  for (const p of plan) {
    totalTodo += p.todo.length;
    console.log(`  ${p.lang}: ${p.already} translated, ${p.todo.length} to do`);
  }
  if (skippedExhausted > 0) console.log(`  (${skippedExhausted} event/language pairs skipped after ${MAX_ATTEMPTS} rejections; see ${path.relative(PROJECT_ROOT, STATS_FILE)})`);
  console.log(`Estimated cost: $${tc.estimateCostUsd(totalTodo).toFixed(2)} for ${totalTodo} event-translations`);

  if (totalTodo === 0) {
    console.log("STATUS: NOTHING_TO_DO");
    return;
  }
  if (args.dryRun) {
    console.log("STATUS: DRY_RUN");
    return;
  }
  if (args.all && !acquireBackfillLock()) {
    console.log("A backfill is already running; not starting a second one.");
    console.log("STATUS: LOCKED");
    return;
  }

  const stats = { started_at: new Date(started).toISOString(), model: call.MODEL, by_lang: {}, cost_usd: 0, accepted: 0, rejected: 0, call_failures: 0, calls: 0, rejections: [] };
  // An outage must not spend hours failing batch after batch: after this
  // many consecutive failed calls the run stops and the next one retries.
  const MAX_CONSECUTIVE_FAILURES = 5;
  let consecutiveFailures = 0;
  let aborted = false;
  const queues = [];
  for (const { lang, todo } of plan) {
    stats.by_lang[lang] = { accepted: 0, rejected: 0, cost_usd: 0 };
    const queue = [];
    queues.push(queue);
    for (let i = 0; i < todo.length; i += args.batch) {
      const items = todo.slice(i, i + args.batch);
      queue.push(async () => {
        if (aborted) return;
        const result = await call.translateEventBatch(lang, items);
        stats.calls++;
        if (result.failed) {
          stats.call_failures++;
          consecutiveFailures++;
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES && !aborted) {
            aborted = true;
            console.error(`  ${MAX_CONSECUTIVE_FAILURES} consecutive call failures; stopping this run (nothing is marked exhausted).`);
          }
        } else {
          consecutiveFailures = 0;
        }
        appendRows(lang, result.accepted, call.MODEL);
        stats.accepted += result.accepted.length;
        stats.rejected += result.rejected.length;
        stats.cost_usd += result.cost_usd;
        stats.by_lang[lang].accepted += result.accepted.length;
        stats.by_lang[lang].rejected += result.rejected.length;
        stats.by_lang[lang].cost_usd += result.cost_usd;
        for (const r of result.rejected) {
          // Only a rejection by the checks says something about the item.
          // A failed call says nothing, and counting it would let an
          // outage retire events for good.
          if (!r.reason.startsWith("call_failed:")) {
            const key = `${lang}:${r.id}`;
            attempts[key] = (attempts[key] || 0) + 1;
          }
          if (stats.rejections.length < 200) stats.rejections.push({ lang, id: r.id, reason: r.reason });
        }
        const doneSoFar = stats.accepted + stats.rejected;
        if (stats.calls % 10 === 0 || doneSoFar >= totalTodo) {
          console.log(`  ${doneSoFar}/${totalTodo} (${stats.rejected} rejected) $${stats.cost_usd.toFixed(4)} ${Math.round((Date.now() - started) / 1000)}s`);
        }
      });
    }
  }

  // Round-robin across languages: the newest events reach every language
  // first, instead of Spanish finishing the whole archive before Persian
  // starts.
  const tasks = [];
  for (let i = 0; queues.some((q) => i < q.length); i++) {
    for (const q of queues) if (i < q.length) tasks.push(q[i]);
  }

  // Persist attempts every so often during a long backfill so a kill keeps the record.
  const ticker = setInterval(() => writeJson(ATTEMPTS_FILE, attempts), 60_000);
  try {
    await runPool(tasks, args.concurrency);
  } finally {
    clearInterval(ticker);
    writeJson(ATTEMPTS_FILE, attempts);
  }

  stats.finished_at = new Date().toISOString();
  stats.duration_ms = Date.now() - started;
  stats.cost_usd = Math.round(stats.cost_usd * 1e4) / 1e4;
  for (const l of Object.keys(stats.by_lang)) stats.by_lang[l].cost_usd = Math.round(stats.by_lang[l].cost_usd * 1e4) / 1e4;
  // Keep a short history so the admin can show the last runs.
  const prev = readJson(STATS_FILE, { runs: [] });
  const runs = Array.isArray(prev.runs) ? prev.runs : [];
  runs.push(stats);
  writeJson(STATS_FILE, { runs: runs.slice(-50) });

  console.log(`Done: ${stats.accepted} accepted, ${stats.rejected} rejected (${stats.call_failures} failed calls), ${stats.calls} calls, $${stats.cost_usd.toFixed(4)}, ${Math.round(stats.duration_ms / 1000)}s${aborted ? " — ABORTED after consecutive failures" : ""}`);
  if (stats.rejections.length > 0) {
    const reasons = {};
    for (const r of stats.rejections) reasons[r.reason.split(":").slice(0, 2).join(":")] = (reasons[r.reason.split(":").slice(0, 2).join(":")] || 0) + 1;
    console.log(`  Rejection reasons: ${JSON.stringify(reasons)}`);
  }
  console.log(`STATUS: TRANSLATED accepted=${stats.accepted} rejected=${stats.rejected}`);
}

module.exports = { loadDataset, parseArgs, readTranslatedIds, appendRows, TRANSLATIONS_DIR };

if (require.main === module) {
  main().catch((err) => {
    console.error("FATAL:", err);
    process.exit(1);
  });
}
