#!/usr/bin/env node

/**
 * War Library - Automated Event Update Script
 *
 * Uses Claude Haiku 4.5 to generate new conflict events based on its knowledge,
 * deduplicates against existing events, and appends to events_latest.json.
 *
 * Usage:
 *   node scripts/update-events.js
 *
 * Environment:
 *   ANTHROPIC_API_KEY - loaded from .env.local
 */

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Resolve project root (works whether invoked from project root or scripts/)
// ---------------------------------------------------------------------------
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(PROJECT_ROOT, "src", "data");
const ENV_FILE = path.join(PROJECT_ROOT, ".env.local");

// ---------------------------------------------------------------------------
// Load .env.local manually (no extra dependency)
// ---------------------------------------------------------------------------
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
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnv(ENV_FILE);

// ---------------------------------------------------------------------------
// Validate API key
// ---------------------------------------------------------------------------
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error(
    "ERROR: ANTHROPIC_API_KEY not found. Ensure it is set in .env.local or the environment."
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Anthropic SDK
// ---------------------------------------------------------------------------
const Anthropic = require("@anthropic-ai/sdk");
const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const MODEL = "claude-haiku-4-5-20251001";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readJSON(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`WARN: ${filePath} not found, returning empty array.`);
    return [];
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  try {
    return JSON.parse(raw);
  } catch {
    console.warn(`WARN: Failed to parse ${filePath}, returning empty array.`);
    return [];
  }
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * Simple similarity check between two strings.
 * Returns a ratio between 0 and 1 (1 = identical).
 */
function similarity(a, b) {
  if (!a || !b) return 0;
  const al = a.toLowerCase().trim();
  const bl = b.toLowerCase().trim();
  if (al === bl) return 1;

  // Jaccard similarity on word sets
  const setA = new Set(al.split(/\s+/));
  const setB = new Set(bl.split(/\s+/));
  let intersection = 0;
  for (const w of setA) {
    if (setB.has(w)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Check if a candidate event is a duplicate of any existing event.
 * Uses description similarity (threshold 0.7) and exact date+country match.
 */
function isDuplicate(candidate, existingEvents) {
  for (const existing of existingEvents) {
    // Exact description match
    if (
      candidate.description &&
      existing.description &&
      candidate.description.toLowerCase().trim() ===
        existing.description.toLowerCase().trim()
    ) {
      return true;
    }
    // High similarity + same date + same country
    if (
      candidate.date === existing.date &&
      candidate.country === existing.country &&
      similarity(candidate.description, existing.description) > 0.7
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Validate that an event object has the required schema fields.
 */
function isValidEvent(event) {
  const requiredFields = [
    "date",
    "event_type",
    "description",
    "latitude",
    "longitude",
    "country",
  ];
  for (const field of requiredFields) {
    if (event[field] === undefined || event[field] === null) return false;
  }
  // Date should look like a date string
  if (!/^\d{4}-\d{2}-\d{2}/.test(event.date)) return false;
  // Lat/lng should be numbers
  if (typeof event.latitude !== "number" || typeof event.longitude !== "number")
    return false;
  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== War Library Event Update ===");
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Data dir: ${DATA_DIR}`);

  // 1. Read existing events from all 3 files
  const eventsFile = path.join(DATA_DIR, "events.json");
  const expandedFile = path.join(DATA_DIR, "events_expanded.json");
  const latestFile = path.join(DATA_DIR, "events_latest.json");

  const eventsRaw = readJSON(eventsFile);
  const expandedRaw = readJSON(expandedFile);
  const latestRaw = readJSON(latestFile);

  // Extract .events array from each file (they wrap in { events: [...] })
  const events = Array.isArray(eventsRaw) ? eventsRaw : (eventsRaw.events || []);
  const eventsExpanded = Array.isArray(expandedRaw) ? expandedRaw : (expandedRaw.events || []);
  const eventsLatest = Array.isArray(latestRaw) ? latestRaw : (latestRaw.events || []);

  // Combine all events for deduplication
  const allEvents = [...events, ...eventsExpanded, ...eventsLatest];
  console.log(
    `Existing events: ${events.length} (base) + ${eventsExpanded.length} (expanded) + ${eventsLatest.length} (latest) = ${allEvents.length} total`
  );

  // 2. Get the last 20 events as context (sorted by date descending)
  const sortedEvents = [...allEvents].sort((a, b) => {
    const da = a.date || "";
    const db = b.date || "";
    return db.localeCompare(da);
  });
  const recentEvents = sortedEvents.slice(0, 20);

  // 3. Build the prompt — SCOPED TO THE 2026 IRAN WAR ONLY
  const schemaExample = {
    date: "2026-03-09T00:00:00Z",
    event_type: "airstrike",
    description:
      "Factual description of what happened, with location and outcome details",
    latitude: 35.69,
    longitude: 51.39,
    country: "Iran",
    region: "Tehran",
    actors: ["US Air Force", "IRGC"],
    fatalities: 0,
    source: "Al Jazeera",
  };

  const prompt = `You are a conflict data analyst for War Library, tracking ONLY the 2026 US-Israel war on Iran (Operation Epic Fury) which began February 28, 2026.

SCOPE: ONLY events related to this specific conflict — including:
- US/Israeli strikes on Iran
- Iranian retaliatory strikes on Israel, Gulf states, US bases
- Hezbollah-Israel fighting in Lebanon
- Houthi activity related to this war
- Strait of Hormuz/shipping disruptions
- Diplomatic developments (UN, ceasefire talks)
- Humanitarian impact (displacement, civilian casualties)
- Economic impact (oil prices, sanctions) directly tied to this war
- Protests related to this conflict
- NATO/European military deployments in response

DO NOT include events from Ukraine, Sudan, Myanmar, Gaza (unless directly tied to the Iran war), or any other unrelated conflict.

IMPORTANT RULES:
- Only report events you are confident are real and sourced from: Al Jazeera, CNN, BBC, Reuters, NPR, AP, Washington Post, Times of Israel, Axios, France 24, Naval News, or other credible outlets
- Follow the EXACT JSON schema below
- Do NOT duplicate events already in our database (the most recent 20 are listed below)
- actors field must be a JSON array of strings, not a semicolon-separated string
- Return ONLY a valid JSON array — no markdown, no code fences, no explanation text

JSON SCHEMA:
${JSON.stringify(schemaExample, null, 2)}

Field notes:
- date: ISO 8601 format (2026-03-09T00:00:00Z)
- event_type: MUST be one of: "airstrike", "missile_attack", "drone_attack", "battle", "explosion", "violence_against_civilians", "strategic_development", "protest"
- description: 1-3 sentences, factual, includes location specifics and outcomes
- latitude/longitude: Real geographic coordinates (numbers)
- country: Full country name
- region: City or province
- actors: JSON array of strings — parties involved
- fatalities: Integer (use 0 if unknown, null if not applicable)
- source: News outlet name(s)

EXISTING RECENT EVENTS (do NOT duplicate these):
${JSON.stringify(recentEvents, null, 2)}

Generate 5-10 new events related to Operation Epic Fury / the 2026 Iran war. Return ONLY a JSON array.`;

  // 4. Call Claude
  console.log("Calling Claude Haiku 4.5 for new events...");

  let response;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });
  } catch (err) {
    console.error("ERROR calling Anthropic API:", err.message);
    process.exit(1);
  }

  const rawText =
    response.content &&
    response.content[0] &&
    response.content[0].type === "text"
      ? response.content[0].text
      : "";

  if (!rawText) {
    console.error("ERROR: Empty response from Claude.");
    process.exit(1);
  }

  // 5. Parse the response
  let newEvents;
  try {
    // Try direct parse first
    newEvents = JSON.parse(rawText);
  } catch {
    // Try extracting JSON array from the response
    const match = rawText.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        newEvents = JSON.parse(match[0]);
      } catch {
        console.error("ERROR: Could not parse JSON from Claude response.");
        console.error("Raw response:", rawText.slice(0, 500));
        process.exit(1);
      }
    } else {
      console.error("ERROR: No JSON array found in Claude response.");
      console.error("Raw response:", rawText.slice(0, 500));
      process.exit(1);
    }
  }

  if (!Array.isArray(newEvents)) {
    console.error("ERROR: Response is not an array.");
    process.exit(1);
  }

  console.log(`Claude returned ${newEvents.length} candidate events.`);

  // 6. Validate and deduplicate
  const validEvents = newEvents.filter((e) => {
    if (!isValidEvent(e)) {
      console.log(`  SKIP (invalid schema): ${e.description?.slice(0, 60)}...`);
      return false;
    }
    return true;
  });

  const uniqueEvents = validEvents.filter((e) => {
    if (isDuplicate(e, allEvents)) {
      console.log(`  SKIP (duplicate): ${e.description?.slice(0, 60)}...`);
      return false;
    }
    return true;
  });

  console.log(
    `After validation: ${validEvents.length} valid, ${uniqueEvents.length} unique new events.`
  );

  // 7. Append to events_latest.json
  if (uniqueEvents.length === 0) {
    console.log("No new events to add.");
    // Exit with code 0 but signal no changes via a special message
    console.log("STATUS: NO_NEW_EVENTS");
    process.exit(0);
  }

  const updatedLatest = [...eventsLatest, ...uniqueEvents];
  const latestWrapper = {
    events: updatedLatest,
    metadata: {
      generated: new Date().toISOString().split("T")[0],
      source: "multiple",
      note: `Auto-updated. ${updatedLatest.length} total events in latest file.`,
    },
  };
  writeJSON(latestFile, latestWrapper);

  console.log(
    `Added ${uniqueEvents.length} new events to events_latest.json (total: ${updatedLatest.length}).`
  );
  console.log("\nNew events added:");
  for (const e of uniqueEvents) {
    console.log(
      `  [${e.date}] ${e.country} - ${e.event_type}: ${e.description?.slice(0, 80)}`
    );
  }
  console.log(`\nSTATUS: EVENTS_ADDED=${uniqueEvents.length}`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
