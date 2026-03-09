#!/usr/bin/env node

/**
 * War Library — Ask AI Section Audit
 *
 * Spawns a Claude agent via the Agent SDK to audit the Ask AI feature
 * for UX, accessibility, security, edge cases, mobile responsiveness,
 * error handling, and performance concerns.
 *
 * Usage: node scripts/audit-ask-ai.mjs
 *
 * Cost: Uses claude-haiku-4-5 (~$0.10 budget cap)
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import path from "path";

// Required for nested Claude sessions — unblock the spawned agent
delete process.env.CLAUDECODE;

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");

const systemPrompt = `You are a senior frontend engineer performing a thorough code audit of the "Ask AI" feature in a Next.js application (War Library — a neutral conflict tracker).

YOUR TASK:
1. Read these two files:
   - src/components/chat/AskPanel.tsx (the chat UI component)
   - src/app/api/chat/route.ts (the API route handling Claude Haiku calls)

2. After reading both files, audit them for ALL of the following categories:

   A. UX ISSUES — confusing flows, missing loading states, poor feedback, unclear errors
   B. ACCESSIBILITY — missing ARIA labels, keyboard navigation gaps, screen reader issues, color contrast
   C. SECURITY GAPS — XSS vectors, prompt injection, missing input sanitization, secret exposure
   D. EDGE CASES — empty states, long inputs, rapid submissions, network failures, malformed responses
   E. MOBILE RESPONSIVENESS — touch targets too small, overflow issues, viewport problems, keyboard overlap
   F. ERROR HANDLING — uncaught exceptions, missing try/catch, silent failures, unhelpful error messages
   G. PERFORMANCE — unnecessary re-renders, missing memoization, large bundle concerns, memory leaks

3. SPECIFICALLY CHECK these areas in detail:
   - Rate limiting logic: Is it correct? Bypassable? Edge cases?
   - Guardrail effectiveness: Can users jailbreak the AI? Are input/output filters solid?
   - Markdown rendering: Does it handle all markdown elements? Code blocks? Links? XSS via markdown?
   - Scroll behavior: Auto-scroll on new messages? Scroll-to-bottom? Scroll position preservation?
   - Input validation: Max length? Empty submissions? Special characters? Unicode edge cases?

4. Also use Grep/Glob to check for related files that might affect the Ask AI feature (hooks, types, utilities, CSS).

5. Return a STRUCTURED AUDIT REPORT in this exact format:

## Ask AI Audit Report

### Critical Issues (must fix)
- [CRITICAL-1] Category: Description of the issue, file:line if applicable, and recommended fix.

### Warnings (should fix)
- [WARN-1] Category: Description and recommendation.

### Info (nice to have)
- [INFO-1] Category: Observation and suggestion.

### Summary
- Total issues found: X critical, Y warnings, Z info
- Overall security posture: [rating]
- Overall UX quality: [rating]
- Overall accessibility: [rating]

Be thorough but precise. Every finding must reference specific code. Do not fabricate issues — only report what you actually observe in the code.`;

console.log("╔══════════════════════════════════════════════╗");
console.log("║   War Library — Ask AI Audit (Agent SDK)    ║");
console.log("╠══════════════════════════════════════════════╣");
console.log("║  Model:  claude-haiku-4-5                   ║");
console.log("║  Budget: $0.10 max                          ║");
console.log("║  Turns:  12 max                             ║");
console.log("╚══════════════════════════════════════════════╝");
console.log();

try {
  let assistantText = "";

  for await (const message of query({
    prompt: "Read the Ask AI source files and perform a full audit. Return the structured report.",
    options: {
      cwd: PROJECT_ROOT,
      allowedTools: ["Read", "Glob", "Grep"],
      systemPrompt,
      model: "claude-haiku-4-5",
      maxTurns: 12,
      maxBudgetUsd: 0.10,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
    },
  })) {
    if (message.type === "assistant") {
      // Extract text blocks from assistant messages
      const content = message.message?.content || [];
      for (const block of content) {
        if (block.type === "text" && block.text) {
          assistantText += block.text;
          process.stdout.write(block.text);
        }
      }
    } else if (message.type === "result") {
      // Final result — print cost and turn info
      console.log("\n");
      console.log("═".repeat(48));
      console.log(`  Cost:  $${message.total_cost_usd?.toFixed(4) ?? "unknown"}`);
      console.log(`  Turns: ${message.num_turns ?? "unknown"}`);
      console.log("═".repeat(48));
    }
  }

  // Exit cleanly if no text was produced
  if (!assistantText.trim()) {
    console.warn("\nWarning: Agent returned no text output.");
    process.exit(1);
  }
} catch (err) {
  console.error("\nAudit failed:", err.message);
  console.error(err.stack?.split("\n").slice(0, 5).join("\n"));
  process.exit(1);
}
