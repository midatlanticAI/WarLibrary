#!/usr/bin/env node

/**
 * War Library - Human-First Description Migration
 *
 * Rewrites event descriptions to lead with human impact.
 * Processes events in batches to manage API costs.
 *
 * Usage:
 *   node scripts/migrate-human-first.js [--dry-run] [--batch-size=20] [--file=events_latest.json]
 *
 * Options:
 *   --dry-run       Show what would change without writing
 *   --batch-size=N  Process N events per API call (default: 20)
 *   --file=FILE     Which data file to process (default: events_latest.json)
 *   --skip=N        Skip first N events (for resuming)
 */

const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(PROJECT_ROOT, "src", "data");
const ENV_FILE = path.join(PROJECT_ROOT, ".env.local");

// Load env
function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv(ENV_FILE);

const Anthropic = require("@anthropic-ai/sdk");
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Parse args
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const batchSizeArg = args.find((a) => a.startsWith("--batch-size="));
const batchSize = batchSizeArg ? parseInt(batchSizeArg.split("=")[1]) : 20;
const fileArg = args.find((a) => a.startsWith("--file="));
const targetFile = fileArg ? fileArg.split("=")[1] : "events_latest.json";
const skipArg = args.find((a) => a.startsWith("--skip="));
const skipCount = skipArg ? parseInt(skipArg.split("=")[1]) : 0;

async function main() {
  const filePath = path.join(DATA_DIR, targetFile);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const events = raw.events || [];
  console.log(`Loaded ${events.length} events from ${targetFile}`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Batch size: ${batchSize}, Skip: ${skipCount}`);

  // Only rewrite events that have fatalities > 0 or civilian_impact
  const candidates = events
    .map((e, idx) => ({ event: e, idx }))
    .filter(({ idx }) => idx >= skipCount)
    .filter(({ event }) => {
      return (
        (event.fatalities && event.fatalities > 0) ||
        (event.civilian_impact && event.civilian_impact.length > 0)
      );
    });

  console.log(`${candidates.length} events with human impact to rewrite\n`);

  let totalRewritten = 0;
  let totalTokens = 0;

  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    console.log(`\n--- Batch ${Math.floor(i / batchSize) + 1} (${batch.length} events) ---`);

    const prompt = `Rewrite these event descriptions to lead with HUMAN IMPACT. For each event, return a JSON array of objects with "idx" and "description" fields.

RULES:
- Lead with WHO was affected (civilians, children, families, workers, sailors, soldiers, etc.)
- Then WHAT happened to them (killed, wounded, displaced, trapped, etc.)
- Then HOW (airstrike, missile, explosion, etc.)
- Then WHERE (location)
- Keep the same factual content — do NOT add or remove information
- Keep descriptions concise (1-2 sentences max)
- If the event has 0 fatalities but has civilian_impact, lead with the civilian impact
- For military-only casualties (soldiers, sailors), still lead with the human cost
- Do NOT change fatality numbers or any other fields

EVENTS TO REWRITE:
${JSON.stringify(batch.map(({ event, idx }) => ({
  idx,
  description: event.description,
  fatalities: event.fatalities,
  civilian_impact: event.civilian_impact,
  country: event.country,
  event_type: event.event_type,
})), null, 2)}

Return ONLY a valid JSON array like: [{"idx": 0, "description": "new description"}, ...]`;

    if (dryRun) {
      console.log(`  Would send ${batch.length} events to Claude for rewriting`);
      batch.forEach(({ event, idx }) => {
        console.log(`  [${idx}] ${event.description?.slice(0, 80)}...`);
      });
      continue;
    }

    try {
      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      });

      const tokens = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);
      totalTokens += tokens;

      const text = response.content[0]?.text || "";
      let results;
      try {
        results = JSON.parse(text);
      } catch {
        const match = text.match(/\[[\s\S]*\]/);
        if (match) results = JSON.parse(match[0]);
        else {
          console.error("  Failed to parse response");
          continue;
        }
      }

      if (!Array.isArray(results)) {
        console.error("  Response is not an array");
        continue;
      }

      for (const r of results) {
        if (typeof r.idx === "number" && r.description) {
          const original = events[r.idx];
          if (original) {
            console.log(`  [${r.idx}] BEFORE: ${original.description?.slice(0, 80)}`);
            console.log(`  [${r.idx}] AFTER:  ${r.description.slice(0, 80)}`);
            original.description = r.description;
            totalRewritten++;
          }
        }
      }

      console.log(`  Batch done. ${results.length} rewritten. Tokens: ${tokens}`);
    } catch (err) {
      console.error(`  API error: ${err.message}`);
    }

    // Small delay between batches to avoid rate limits
    if (i + batchSize < candidates.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  if (!dryRun && totalRewritten > 0) {
    fs.writeFileSync(filePath, JSON.stringify(raw, null, 2), "utf-8");
    console.log(`\nWrote ${totalRewritten} rewritten descriptions to ${targetFile}`);
  }

  console.log(`\nDone. ${totalRewritten} events rewritten. Total tokens: ${totalTokens}`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
