#!/usr/bin/env node
/**
 * War Library newsletter broadcasts.
 *
 *   node scripts/newsletter.js sweep                       # email every published dispatch not yet emailed (last --since-days)
 *   node scripts/newsletter.js send --kind daily --key 2026-10-28 [--lang fa] [--force]
 *   node scripts/newsletter.js sweep --dry-run             # say what would be sent
 *   node scripts/newsletter.js status                      # segments and local subscriber tallies
 *
 * One broadcast per dispatch per language, to that language's Resend
 * segment, using the dispatch's translation when the translator produced
 * one. A language whose segment has no contacts (asked of Resend; the
 * local tally is the fallback) is skipped (--all-langs overrides). Every
 * send is recorded in the dispatch file under `emailed[lang]`, so a sweep
 * is idempotent. A lock file makes two sweeps (cron, the daily writer,
 * an admin publish) run one after the other, never together.
 *
 * Translation grace: a dispatch is written before its translations are,
 * so a sweep that runs in that window would email English to Persian
 * readers and record it as sent. For a non-English language with no
 * translation the sweep waits while the dispatch is young (TRANSLATION_GRACE_MS
 * since it was generated or edited) and only then falls back to English.
 *
 * Why a sweep and not a hook: weekly and monthly dispatches go live on
 * their own 24 h after generation with no process running at that
 * moment. The hourly sweep is what notices.
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const dcore = require("../src/lib/dispatch-core.cjs");
const ncore = require("../src/lib/newsletter-core.cjs");
const { loadEnv, PROJECT_ROOT } = require("./lib/translate-call.cjs");

loadEnv(path.join(PROJECT_ROOT, ".env.local"));
const resend = require("../src/lib/newsletter-resend.cjs");

const DISPATCH_DIR = process.env.DISPATCH_DIR || path.join(PROJECT_ROOT, "src", "data", "dispatches");
const DEFAULT_SINCE_DAYS = 3;
const TRANSLATION_GRACE_MS = 30 * 60_000;
const LOCK_FILE = path.join(os.tmpdir(), "warlibrary-newsletter.js.lock");
const LOCK_STALE_MS = 15 * 60_000;

function parseArgs(argv) {
  const args = { cmd: argv[0] || "sweep", kind: null, key: null, langs: null, dryRun: false, allLangs: false, sinceDays: DEFAULT_SINCE_DAYS, force: false };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--kind") args.kind = argv[++i];
    else if (a === "--key") args.key = argv[++i];
    else if (a === "--lang") args.langs = [argv[++i]];
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--all-langs") args.allLangs = true;
    else if (a === "--force") args.force = true;
    else if (a === "--since-days") {
      const n = Number(argv[++i]);
      args.sinceDays = Number.isFinite(n) && n >= 0 ? n : DEFAULT_SINCE_DAYS;
    } else throw new Error(`Unknown argument: ${a}`);
  }
  if (!["sweep", "send", "status"].includes(args.cmd)) throw new Error("command must be sweep, send or status");
  if (args.cmd === "send" && (!dcore.isKind(args.kind) || !dcore.isValidKey(args.kind, args.key))) throw new Error("send needs --kind and a valid --key");
  if (args.langs && !ncore.LANGS.includes(args.langs[0])) throw new Error(`Unknown language ${args.langs[0]}`);
  return args;
}

// ---------------------------------------------------------------------------
// Lock: O_EXCL create, holder pid inside, stale after LOCK_STALE_MS or when
// the pid is gone. Works for every caller (cron via newsletter.sh, the
// writer, the admin's detached spawn) without needing flock around it.
// ---------------------------------------------------------------------------

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

function acquireLock() {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.writeFileSync(LOCK_FILE, `${process.pid} ${Date.now()}`, { flag: "wx" });
      return true;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      let stale = false;
      try {
        const [pid, at] = fs.readFileSync(LOCK_FILE, "utf-8").trim().split(" ").map(Number);
        stale = !pidAlive(pid) || Date.now() - at > LOCK_STALE_MS;
      } catch {
        stale = true;
      }
      if (!stale) return false;
      try {
        fs.unlinkSync(LOCK_FILE);
      } catch {
        /* lost the race to another cleaner; retry once */
      }
    }
  }
  return false;
}

function releaseLock() {
  try {
    if (fs.readFileSync(LOCK_FILE, "utf-8").startsWith(`${process.pid} `)) fs.unlinkSync(LOCK_FILE);
  } catch {
    /* already gone */
  }
}

// ---------------------------------------------------------------------------
// Dispatch files
// ---------------------------------------------------------------------------

function listDispatches() {
  const out = [];
  for (const kind of dcore.KINDS) {
    const dir = path.join(DISPATCH_DIR, kind);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".json")) continue;
      try {
        const d = JSON.parse(fs.readFileSync(path.join(dir, name), "utf-8"));
        if (d && d.kind === kind && dcore.isValidKey(kind, d.key)) out.push(d);
      } catch (err) {
        console.error(`  unreadable ${name}: ${err.message}`);
      }
    }
  }
  return out;
}

function readDispatch(kind, key) {
  const file = path.join(DISPATCH_DIR, dcore.dispatchFileName(kind, key));
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf-8")) : null;
}

/** Record a send in the dispatch file: re-read, merge, atomic write. */
function recordEmailed(kind, key, lang, broadcastId) {
  const file = path.join(DISPATCH_DIR, dcore.dispatchFileName(kind, key));
  const current = JSON.parse(fs.readFileSync(file, "utf-8"));
  current.emailed = { ...(current.emailed || {}), [lang]: { broadcast_id: broadcastId, at: new Date().toISOString(), lang } };
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(current, null, 2), "utf-8");
  fs.renameSync(tmp, file);
}

/** When the dispatch went public, for the recency window. */
function publishedAtMs(d) {
  for (const v of [d.published_at, d.publish_after, d.generated_at]) {
    const t = v ? new Date(v).getTime() : NaN;
    if (!Number.isNaN(t)) return t;
  }
  return 0;
}

/** When the narrative last changed: an edit or the generation itself. */
function narrativeChangedAtMs(d) {
  for (const v of [d.edited_at, d.generated_at]) {
    const t = v ? new Date(v).getTime() : NaN;
    if (!Number.isNaN(t)) return t;
  }
  return 0;
}

function narrativeFor(d, lang) {
  const tr = lang !== "en" && d.translations && d.translations[lang];
  if (tr && Array.isArray(tr.sections) && tr.sections.length === (d.sections || []).length) {
    return { title: tr.title, lede: tr.lede, sections: tr.sections, civilian_note: d.civilian_note ? tr.civilian_note : null, translated: true };
  }
  return { title: d.title, lede: d.lede, sections: d.sections || [], civilian_note: d.civilian_note || null, translated: false };
}

/**
 * Hold a non-English send while the translator may still be running:
 * no translation for this language, the translator has not reported
 * (`translated_at` null), and the narrative is younger than the grace.
 */
function awaitingTranslation(d, lang, now = Date.now()) {
  if (lang === "en") return false;
  if (d.translations && d.translations[lang]) return false;
  if (d.translated_at && new Date(d.translated_at).getTime() >= narrativeChangedAtMs(d)) return false;
  return now - narrativeChangedAtMs(d) < TRANSLATION_GRACE_MS;
}

async function sendOne(d, lang, { dryRun }) {
  const text = narrativeFor(d, lang);
  const mail = ncore.renderDispatchEmail({ dispatch: d, text, lang });
  const name = `${d.kind} ${d.key} ${lang}${text.translated ? "" : " (en text)"}`;
  if (dryRun) {
    console.log(`  would send ${name}: "${mail.subject}" (${mail.html.length} bytes)`);
    return null;
  }
  const id = await resend.sendBroadcast({ lang, subject: mail.subject, html: mail.html, text: mail.text, name: `WarLibrary ${name}` });
  recordEmailed(d.kind, d.key, lang, id || "unknown");
  console.log(`  sent ${name}: broadcast ${id}`);
  return id;
}

/** Languages worth sending to: Resend's answer first, the local tally when Resend cannot be asked. */
async function languagesWithReaders(state, allLangs) {
  if (allLangs) return ncore.LANGS.slice();
  const out = [];
  for (const l of ncore.LANGS) {
    if (!state.segments[l]) continue;
    const has = await resend.segmentHasContacts(l);
    if (has === true || (has === null && (state.subscribers[l] || 0) > 0)) out.push(l);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.cmd === "status") {
    const state = resend.readState();
    console.log(JSON.stringify({ configured: resend.isConfigured(), state_file: resend.STATE_FILE, ...state }, null, 2));
    return;
  }
  if (!resend.isConfigured()) {
    console.log("Newsletter not configured (RESEND_API_KEY / NEWSLETTER_FROM); nothing to do.");
    console.log("STATUS: NOT_CONFIGURED");
    return;
  }
  if (!args.dryRun && !acquireLock()) {
    console.log("Another newsletter run holds the lock; nothing to do.");
    console.log("STATUS: LOCKED");
    return;
  }
  try {
    const state = resend.readState();
    const langs = args.langs || (await languagesWithReaders(state, args.allLangs));
    const now = new Date();

    let candidates;
    if (args.cmd === "send") {
      const d = readDispatch(args.kind, args.key);
      if (!d) throw new Error(`No dispatch ${args.kind}/${args.key}`);
      if (!dcore.isPublished(d, now) && !args.force) {
        throw new Error(`${args.kind} ${args.key} is not published (status ${d.status}); pass --force to email it anyway`);
      }
      candidates = [d];
    } else {
      const floor = now.getTime() - args.sinceDays * 86_400_000;
      candidates = listDispatches().filter((d) => dcore.isPublished(d, now) && publishedAtMs(d) >= floor);
    }
    console.log(`=== newsletter ${args.cmd}: ${candidates.length} dispatch(es), languages ${langs.length ? langs.join(",") : "none with subscribers"} ===`);

    let sent = 0;
    let skipped = 0;
    let waiting = 0;
    for (const d of candidates) {
      for (const lang of langs) {
        if (!args.force && d.emailed && d.emailed[lang]) {
          skipped++;
          continue;
        }
        if (!args.force && awaitingTranslation(d, lang, now.getTime())) {
          waiting++;
          console.log(`  waiting for ${lang} translation of ${d.kind} ${d.key} (next sweep)`);
          continue;
        }
        try {
          await sendOne(d, lang, { dryRun: args.dryRun });
          sent++;
        } catch (err) {
          console.error(`  FAILED ${d.kind} ${d.key} ${lang}: ${err.message}`);
        }
      }
    }
    console.log(`STATUS: ${args.dryRun ? "DRY_RUN" : "DONE"} sent=${sent} skipped=${skipped} waiting=${waiting}`);
  } finally {
    if (!args.dryRun) releaseLock();
  }
}

module.exports = { parseArgs, narrativeFor, awaitingTranslation, listDispatches, DISPATCH_DIR, TRANSLATION_GRACE_MS };

if (require.main === module) {
  main().catch((err) => {
    console.error("FATAL:", err);
    process.exit(1);
  });
}
