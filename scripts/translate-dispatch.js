#!/usr/bin/env node
/**
 * Translate one dispatch's narrative into every served language and write
 * the result into the dispatch file under `translations`.
 *
 *   node scripts/translate-dispatch.js --kind daily --key 2026-10-28
 *   node scripts/translate-dispatch.js --kind daily --key 2026-10-28 --lang fa --force
 *
 * Called by scripts/write-dispatch.js after it writes a dispatch, and by
 * the admin API after an edit (an edited title or lede makes the old
 * translations wrong, so the admin clears them and re-runs this).
 * Idempotent: a language already present is skipped unless --force.
 *
 * All-or-nothing per language: a translation that fails the checks
 * (citation set changed, a number changed, a section lost) is not stored,
 * and that language's readers see the English record with a notice. A
 * dispatch is never shown half-translated.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const core = require("../src/lib/dispatch-core.cjs");
const tc = require("../src/lib/translate-core.cjs");
const call = require("./lib/translate-call.cjs");

const DISPATCH_DIR = process.env.DISPATCH_DIR || path.join(call.PROJECT_ROOT, "src", "data", "dispatches");

function fileFor(kind, key) {
  if (!core.isKind(kind) || !core.isValidKey(kind, key)) throw new Error(`Invalid dispatch ${kind}/${key}`);
  return path.join(DISPATCH_DIR, core.dispatchFileName(kind, key));
}

function readDispatch(kind, key) {
  const file = fileFor(kind, key);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

/**
 * Re-read, merge, write. The writer or the admin may have changed the file
 * while the model was answering (a publish, a pull, an edit); merging the
 * translations into the current file rather than writing back the copy we
 * started from keeps those changes.
 */
function mergeTranslations(kind, key, translations, revision) {
  const file = fileFor(kind, key);
  const current = JSON.parse(fs.readFileSync(file, "utf-8"));
  if ((current.revision || 1) !== revision) {
    return { written: false, reason: `revision changed ${revision} -> ${current.revision}` };
  }
  current.translations = { ...(current.translations || {}), ...translations };
  current.translated_at = new Date().toISOString();
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(current, null, 2), "utf-8");
  fs.renameSync(tmp, file);
  return { written: true };
}

function parseArgs(argv) {
  const args = { kind: null, key: null, langs: Object.keys(tc.LANGUAGES), force: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--kind") args.kind = argv[++i];
    else if (a === "--key") args.key = argv[++i];
    else if (a === "--lang") {
      const l = argv[++i];
      if (!tc.isLanguage(l)) throw new Error(`Unknown language ${l}`);
      args.langs = [l];
    } else if (a === "--force") args.force = true;
    else if (a === "--dry-run") args.dryRun = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!core.isKind(args.kind) || !core.isValidKey(args.kind, args.key)) throw new Error("--kind and a valid --key are required");
  return args;
}

/**
 * Translate a dispatch in place. Returns a summary; never throws for a
 * single language's failure. Exported so the writer can call it in-process.
 */
async function translateDispatch({ kind, key, langs = Object.keys(tc.LANGUAGES), force = false, dryRun = false, log = console.log }) {
  const d = readDispatch(kind, key);
  if (!d) throw new Error(`No dispatch ${kind}/${key}`);
  const source = { title: d.title, lede: d.lede, sections: (d.sections || []).map((s) => ({ heading: s.heading, body: s.body })), civilian_note: d.civilian_note || null };
  const existing = d.translations || {};
  const todo = langs.filter((l) => force || !existing[l]);
  log(`Translating ${kind} ${key} (revision ${d.revision || 1}) into ${todo.length ? todo.join(", ") : "nothing (all present)"}`);
  if (todo.length === 0) return { translated: [], failed: [], cost_usd: 0 };
  if (dryRun) {
    log(`--- prompt (${tc.dispatchPrompt(source).length} chars) ---\n${tc.dispatchPrompt(source).slice(0, 1500)}…`);
    return { translated: [], failed: [], cost_usd: 0, dryRun: true };
  }

  const results = await Promise.all(
    todo.map(async (lang) => {
      try {
        const r = await call.translateDispatchText(lang, source);
        return { lang, ...r };
      } catch (err) {
        return { lang, translation: null, reasons: [`call_failed:${err.message}`], usage: {}, cost_usd: 0 };
      }
    })
  );

  const translations = {};
  const translated = [];
  const failed = [];
  let cost = 0;
  for (const r of results) {
    cost += r.cost_usd || 0;
    if (r.translation) {
      translations[r.lang] = { ...r.translation, model: call.MODEL, at: new Date().toISOString() };
      translated.push(r.lang);
    } else {
      failed.push({ lang: r.lang, reasons: r.reasons });
      log(`  ${r.lang}: rejected (${r.reasons.join("; ")})`);
    }
  }
  if (translated.length > 0) {
    const merged = mergeTranslations(kind, key, translations, d.revision || 1);
    if (!merged.written) {
      log(`  Not written: ${merged.reason}. Re-run after the current edit.`);
      return { translated: [], failed: [...failed, ...translated.map((lang) => ({ lang, reasons: [merged.reason] }))], cost_usd: cost };
    }
  }
  log(`  Translated into ${translated.length ? translated.join(", ") : "none"}; ${failed.length} failed; cost $${cost.toFixed(4)}`);
  return { translated, failed, cost_usd: Math.round(cost * 1e6) / 1e6 };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await translateDispatch(args);
  console.log(`STATUS: ${result.dryRun ? "DRY_RUN" : "TRANSLATED"} ok=${result.translated.length} failed=${result.failed.length}`);
}

module.exports = { translateDispatch, parseArgs, DISPATCH_DIR };

if (require.main === module) {
  main().catch((err) => {
    console.error("FATAL:", err);
    process.exit(1);
  });
}
