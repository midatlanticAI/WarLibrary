#!/usr/bin/env node

/**
 * War Library — Agent SDK Test: Event Update Agent
 *
 * Tests the Claude Agent SDK with a Haiku-powered agent that:
 * 1. Reads current events from events_latest.json
 * 2. Uses WebSearch to find real news about the 2026 Iran war
 * 3. Generates new events in the correct schema
 * 4. Writes them to a test file (not the real data)
 *
 * Usage: node scripts/test-update-agent.mjs
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(PROJECT_ROOT, "src", "data");

// Load .env.local
const envFile = path.join(PROJECT_ROOT, ".env.local");
if (fs.existsSync(envFile)) {
  const lines = fs.readFileSync(envFile, "utf-8").split("\n");
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

// Read current events for context
const latestFile = path.join(DATA_DIR, "events_latest.json");
const latestRaw = JSON.parse(fs.readFileSync(latestFile, "utf-8"));
const latestEvents = latestRaw.events || [];
const recentEvents = latestEvents.slice(-10);

console.log("=== Agent SDK Test: Event Update Agent ===");
console.log(`Current events in latest: ${latestEvents.length}`);
console.log(`Sending ${recentEvents.length} recent events as context\n`);

const systemPrompt = `You are a conflict data analyst for War Library, tracking the 2026 US-Israel war on Iran (Operation Epic Fury) which began February 28, 2026.

Your job: search the web for the latest news about this conflict, then generate new event entries in JSON format.

SCOPE: ONLY events related to this specific conflict — US/Israeli strikes on Iran, Iranian retaliatory strikes, Hezbollah-Israel fighting, Houthi activity, Strait of Hormuz disruptions, diplomatic developments, humanitarian impact.

DO NOT include events from Ukraine, Sudan, Myanmar, or unrelated conflicts.

EXISTING RECENT EVENTS (do NOT duplicate):
${JSON.stringify(recentEvents, null, 2)}

JSON SCHEMA for each event:
{
  "date": "2026-03-09T00:00:00Z",
  "event_type": "airstrike|missile_attack|drone_attack|battle|explosion|violence_against_civilians|strategic_development|protest",
  "description": "1-3 sentences, factual",
  "latitude": 35.69,
  "longitude": 51.39,
  "country": "Iran",
  "region": "Tehran",
  "actors": ["US Air Force", "IRGC"],
  "fatalities": 0,
  "source": "Reuters"
}

INSTRUCTIONS:
1. Search the web for latest news about the 2026 Iran war / Operation Epic Fury
2. Write a JSON array of 3-5 new events to a file called test_new_events.json in the current directory
3. Only include events you found real sources for
4. Return a summary of what you found`;

try {
  for await (const message of query({
    prompt: "Search the web for the latest news about the 2026 US-Iran war (Operation Epic Fury) and generate new conflict events. Write them to test_new_events.json.",
    options: {
      cwd: DATA_DIR,
      allowedTools: ["WebSearch", "WebFetch", "Read", "Write", "Bash"],
      systemPrompt,
      model: "claude-haiku-4-5",
      maxTurns: 10,
      maxBudgetUsd: 0.05,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
    },
  })) {
    if ("result" in message) {
      console.log("\n=== Agent Result ===");
      console.log(message.result);
    } else if (message.type === "assistant" && message.message?.content) {
      // Stream assistant text
      for (const block of message.message.content) {
        if (block.type === "text") {
          process.stdout.write(block.text);
        }
      }
    }
  }
} catch (err) {
  console.error("\nAgent error:", err.message);
  if (err.message?.includes("not a function") || err.message?.includes("is not")) {
    console.log("\nNote: The Agent SDK may need a different import pattern. Checking...");
  }
}

// Check if the agent wrote anything
const testFile = path.join(DATA_DIR, "test_new_events.json");
if (fs.existsSync(testFile)) {
  const result = JSON.parse(fs.readFileSync(testFile, "utf-8"));
  const events = Array.isArray(result) ? result : result.events || [];
  console.log(`\n✓ Agent generated ${events.length} test events`);
  for (const e of events) {
    console.log(`  [${e.date}] ${e.country} - ${e.event_type}: ${e.description?.slice(0, 80)}`);
  }
  // Clean up test file
  fs.unlinkSync(testFile);
  console.log("\n✓ Test file cleaned up");
} else {
  console.log("\n⚠ No test file was created by the agent");
}
