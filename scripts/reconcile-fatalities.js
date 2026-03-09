#!/usr/bin/env node

/**
 * War Library - Fatality Reconciliation Script
 *
 * Fetches authoritative death toll data from real news sources,
 * then uses Claude to reconcile our existing event fatality numbers
 * against verified reporting.
 *
 * This does NOT hardcode any numbers — it reads real articles and
 * lets Claude update fatalities based on what the articles actually say.
 *
 * Usage:
 *   node scripts/reconcile-fatalities.js
 */

const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(PROJECT_ROOT, "src", "data");
const ENV_FILE = path.join(PROJECT_ROOT, ".env.local");

// Load .env.local
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

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error("ERROR: ANTHROPIC_API_KEY not found.");
  process.exit(1);
}

const Anthropic = require("@anthropic-ai/sdk");
const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const MODEL = "claude-haiku-4-5-20251001";

// ---------------------------------------------------------------------------
// Authoritative sources to fetch for death toll data
// ---------------------------------------------------------------------------
const AUTHORITATIVE_URLS = [
  // Death toll trackers
  "https://www.aljazeera.com/news/2026/3/1/us-israel-attacks-on-iran-death-toll-and-injuries-live-tracker",
  "https://en.wikipedia.org/wiki/Casualties_of_the_Twelve-Day_War",
  "https://en.wikipedia.org/wiki/2026_Iran_war",
  "https://en.wikipedia.org/wiki/2026_Hezbollah%E2%80%93Israel_strikes",
  "https://en.wikipedia.org/wiki/List_of_attacks_during_the_2026_Iran_war",
  // Day-by-day coverage
  "https://www.aljazeera.com/news/2026/3/7/iran-war-what-is-happening-on-day-eight-of-us-israel-attacks",
  "https://www.aljazeera.com/news/2026/3/6/iran-war-what-is-happening-on-day-seven-of-us-israel-attacks",
  "https://www.aljazeera.com/news/2026/3/5/iran-war-what-is-happening-on-day-six-of-us-israel-attacks",
  "https://www.aljazeera.com/news/2026/3/4/death-toll-in-iran-surpasses-1000-as-israel-us-strikes-continue",
  "https://www.aljazeera.com/news/2026/3/2/iran-death-toll-reaches-555-as-us-israel-escalate-attacks",
  // Lebanon
  "https://www.aljazeera.com/news/2026/3/6/death-toll-in-israels-lebanon-attacks-over-120-as-beirut-south-east-hit",
  "https://eu.detroitnews.com/story/news/world/2026/03/08/iran-crisis-lebanon/89052569007/",
  "https://www.rte.ie/news/middle-east/2026/0308/1562203-lebanon-middle-east/",
  // US military
  "https://www.militarytimes.com/news/your-military/2026/03/08/seventh-us-service-member-killed-in-action-during-operation-epic-fury/",
  "https://www.cnn.com/2026/03/02/politics/six-soldiers-killed-in-iranian-strike-kuwait",
  // Overviews
  "https://www.cnn.com/2026/03/04/middleeast/us-israel-iran-war-what-we-know-intl-hnk",
  "https://www.npr.org/2026/03/02/g-s1-112151/iran-war-widens-threatens-to-engulf-lebanon",
];

/**
 * Fetch article body text from a URL.
 */
async function fetchArticleBody(url) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; WarLibrary/1.0; +https://warlibrary.midatlantic.ai)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });
    if (!res.ok) return `[Failed to fetch: HTTP ${res.status}]`;
    const html = await res.text();
    const paragraphs = [];
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let m;
    while ((m = pRegex.exec(html)) !== null) {
      const text = m[1].replace(/<[^>]*>/g, "").trim();
      if (text.length > 30) paragraphs.push(text);
    }
    return paragraphs.join("\n").slice(0, 5000);
  } catch (err) {
    return `[Fetch error: ${err.message}]`;
  }
}

function readJSON(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return [];
  }
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

async function main() {
  console.log("=== War Library Fatality Reconciliation ===");
  console.log(`Time: ${new Date().toISOString()}\n`);

  // 1. Read all existing events
  const files = [
    { path: path.join(DATA_DIR, "events.json"), name: "events.json" },
    { path: path.join(DATA_DIR, "events_expanded.json"), name: "events_expanded.json" },
    { path: path.join(DATA_DIR, "events_latest.json"), name: "events_latest.json" },
  ];

  const fileData = [];
  for (const f of files) {
    const raw = readJSON(f.path);
    const events = Array.isArray(raw) ? raw : raw.events || [];
    fileData.push({ ...f, raw, events, isWrapped: !Array.isArray(raw) });
    console.log(`${f.name}: ${events.length} events`);
  }

  // 2. Fetch authoritative sources
  console.log(`\nFetching ${AUTHORITATIVE_URLS.length} authoritative sources...`);
  const sourceTexts = [];
  for (const url of AUTHORITATIVE_URLS) {
    console.log(`  Fetching: ${url.slice(0, 80)}...`);
    const body = await fetchArticleBody(url);
    if (body && !body.startsWith("[")) {
      sourceTexts.push(`SOURCE: ${url}\n${body}`);
      console.log(`    Got ${body.length} chars`);
    } else {
      console.log(`    ${body}`);
    }
  }

  if (sourceTexts.length === 0) {
    console.error("ERROR: Could not fetch any authoritative sources.");
    process.exit(1);
  }

  const sourceMaterial = sourceTexts.join("\n\n---\n\n");

  // 3. For each file, send events + sources to Claude for reconciliation
  for (const f of fileData) {
    if (f.events.length === 0) continue;

    console.log(`\nReconciling ${f.name} (${f.events.length} events)...`);

    // Build a compact representation of events for verification
    const eventList = f.events.map((e, i) => ({
      index: i,
      date: e.date,
      country: e.country,
      region: e.region,
      event_type: e.event_type,
      fatalities: e.fatalities,
      description: (e.description || "").slice(0, 300),
      actors: e.actors || [],
      source: e.source || "",
      civilian_impact: e.civilian_impact || null,
      verification_status: e.verification_status || null,
      latitude: e.latitude,
      longitude: e.longitude,
    }));

    const prompt = `You are a data quality analyst for War Library, a neutral conflict tracker.

Your task: Compare our existing event data against AUTHORITATIVE NEWS SOURCES and fix ANY inaccuracies — not just fatalities, but descriptions, dates, countries, regions, actors, event types, coordinates, and civilian impact.

RULES:
1. For each event, check if the authoritative sources corroborate, contradict, or provide more detail
2. Fix fatality numbers where sources clearly state different numbers for the SAME specific event
3. Fix descriptions where our text contains factual errors vs what sources report
4. Fix actors if sources name different parties involved
5. Fix event_type if misclassified (e.g., we say "airstrike" but source says it was a "missile_attack")
6. Fix dates if our date doesn't match what sources report for the same event
7. Fix regions/locations if sources give a more specific or different location
8. Add or fix civilian_impact from source details (displacement numbers, infrastructure damage, etc.)
9. If our event fatalities=0 but sources clearly report deaths for that SPECIFIC event, update it
10. Do NOT redistribute cumulative totals. Only fix individual events where sources give a number for THAT event
11. Update verification_status based on source corroboration:
    - "confirmed" if 2+ independent sources verify it
    - "reported" if one credible source reports it
    - "claimed" if based on claims by one party
    - "disputed" if sources conflict
12. Do NOT change events that sources don't cover — leave them as-is
13. Do NOT invent information. Only use what's explicitly stated in the sources.

Return ONLY a JSON array of corrections. Each correction object:
{
  "index": <number>,
  "fatalities": <new number or null if unchanged>,
  "description": "<corrected text or null if unchanged>",
  "civilian_impact": "<text or null>",
  "actors": ["array"] or null if unchanged,
  "event_type": "<corrected type or null if unchanged>",
  "region": "<corrected region or null if unchanged>",
  "verification_status": "<status or null if unchanged>",
  "reason": "<brief explanation citing which source>"
}

Only include fields that need changing. Always include index and reason.
If no corrections are needed, return [].

OUR EVENTS:
${JSON.stringify(eventList, null, 2)}

AUTHORITATIVE SOURCES:
${sourceMaterial.slice(0, 30000)}

Return ONLY a JSON array. No markdown, no code fences.`;

    let response;
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: 8192,
        messages: [{ role: "user", content: prompt }],
      });
    } catch (err) {
      console.error(`  ERROR calling API for ${f.name}: ${err.message}`);
      continue;
    }

    const rawText =
      response.content?.[0]?.type === "text" ? response.content[0].text : "";

    let corrections;
    try {
      corrections = JSON.parse(rawText);
    } catch {
      const match = rawText.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          corrections = JSON.parse(match[0]);
        } catch {
          console.error(`  Could not parse corrections for ${f.name}`);
          continue;
        }
      } else {
        console.error(`  No JSON found in response for ${f.name}`);
        continue;
      }
    }

    if (!Array.isArray(corrections) || corrections.length === 0) {
      console.log(`  No corrections needed for ${f.name}.`);
      continue;
    }

    // Apply corrections
    let applied = 0;
    for (const corr of corrections) {
      const idx = corr.index;
      if (typeof idx !== "number" || idx < 0 || idx >= f.events.length) continue;

      const event = f.events[idx];
      let changed = false;

      if (typeof corr.fatalities === "number" && corr.fatalities !== event.fatalities) {
        console.log(
          `  [${event.date?.slice(0, 10)}] ${event.country}: fatalities ${event.fatalities} → ${corr.fatalities}`
        );
        event.fatalities = corr.fatalities;
        changed = true;
      }

      if (corr.description && corr.description !== event.description) {
        console.log(
          `  [${event.date?.slice(0, 10)}] ${event.country}: description updated`
        );
        event.description = corr.description;
        changed = true;
      }

      if (corr.event_type && corr.event_type !== event.event_type) {
        console.log(
          `  [${event.date?.slice(0, 10)}] ${event.country}: event_type ${event.event_type} → ${corr.event_type}`
        );
        event.event_type = corr.event_type;
        changed = true;
      }

      if (corr.region && corr.region !== event.region) {
        console.log(
          `  [${event.date?.slice(0, 10)}] ${event.country}: region ${event.region} → ${corr.region}`
        );
        event.region = corr.region;
        changed = true;
      }

      if (corr.actors && Array.isArray(corr.actors)) {
        event.actors = corr.actors;
        changed = true;
      }

      if (corr.civilian_impact) {
        event.civilian_impact = corr.civilian_impact;
        changed = true;
      }

      if (corr.verification_status) {
        event.verification_status = corr.verification_status;
        changed = true;
      }

      if (changed) {
        console.log(`    Reason: ${corr.reason}`);
        applied++;
      }
    }

    if (applied > 0) {
      // Write back
      if (f.isWrapped) {
        const wrapper = { ...f.raw, events: f.events };
        writeJSON(f.path, wrapper);
      } else {
        writeJSON(f.path, f.events);
      }
      console.log(`  Applied ${applied} corrections to ${f.name}.`);
    }
  }

  // 4. Print final totals
  console.log("\n=== Final Fatality Totals ===");
  const byCountry = {};
  let total = 0;
  for (const f of fileData) {
    for (const e of f.events) {
      if (e.fatalities) {
        total += e.fatalities;
        byCountry[e.country] = (byCountry[e.country] || 0) + e.fatalities;
      }
    }
  }
  const sorted = Object.entries(byCountry).sort((a, b) => b[1] - a[1]);
  for (const [country, count] of sorted) {
    console.log(`  ${country}: ${count}`);
  }
  console.log(`  TOTAL: ${total}`);
  console.log("\nDone. Review changes and deploy.");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
