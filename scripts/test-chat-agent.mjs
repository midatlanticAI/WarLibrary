#!/usr/bin/env node

/**
 * War Library — Agent SDK Test: Chat Agent
 *
 * Tests the Claude Agent SDK with a chat agent that can:
 * 1. Read event data files
 * 2. Search the web for supplementary info
 * 3. Answer user questions about the 2026 Iran war
 *
 * Usage: node scripts/test-chat-agent.mjs "your question here"
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

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

// Agent SDK spawns claude CLI — unblock nested sessions
delete process.env.CLAUDECODE;

const question = process.argv[2] || "What are the latest developments in the Iran war?";

console.log("=== Agent SDK Test: Chat Agent ===");
console.log(`Question: "${question}"\n`);

const systemPrompt = `You are War Library's AI analyst — a neutral, factual conflict analyst covering the 2026 US-Israel war on Iran (Operation Epic Fury), which began February 28, 2026.

RULES:
- Stay strictly on topic: the 2026 Iran war and directly related events
- Be factual and cite sources when possible
- If you don't know something, say so — never fabricate
- Present all sides neutrally
- Include specific dates, locations, and verified casualty figures when available

EVENT DATA FILES (read these to answer questions):
- src/data/events.json (48 base events)
- src/data/events_expanded.json (64 expanded events)
- src/data/events_latest.json (latest events from auto-updates)

Each file has structure: { "events": [...] } where each event has: date, event_type, description, latitude, longitude, country, region, actors, fatalities, source.

Read the relevant data files first, then answer the user's question. If the question is off-topic (not about the Iran war), politely redirect.`;

try {
  for await (const message of query({
    prompt: question,
    options: {
      cwd: PROJECT_ROOT,
      allowedTools: ["Read", "Glob", "Grep"],
      systemPrompt,
      model: "claude-haiku-4-5",
      maxTurns: 8,
      maxBudgetUsd: 0.03,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
    },
  })) {
    if (message.type === "result") {
      console.log("\n=== Agent Answer ===");
      console.log(message.result || message.text || message.content || "(checking keys...)");
      if (!message.result && !message.text) {
        console.log("Result message keys:", Object.keys(message));
      }
      console.log(`\nCost: $${message.total_cost_usd?.toFixed(4) || "?"} | Turns: ${message.num_turns || "?"}`);
    } else if (message.type === "assistant") {
      // Print assistant text blocks
      const content = message.message?.content || [];
      for (const block of content) {
        if (block.type === "text" && block.text) {
          process.stdout.write(block.text);
        }
      }
    }
  }
} catch (err) {
  console.error("\nAgent error:", err.message);
  console.error(err.stack?.split("\n").slice(0, 5).join("\n"));
}
