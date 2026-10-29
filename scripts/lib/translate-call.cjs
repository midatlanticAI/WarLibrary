/**
 * The model-calling half of content translation, shared by
 * scripts/translate-events.js and scripts/translate-dispatch.js. The pure
 * rules (prompts, schemas, acceptance checks) live in
 * src/lib/translate-core.cjs so they are unit-tested without the network.
 *
 * Every call is structured output on Haiku 5.5 — the same model, price
 * and output contract as the extraction pipeline and the dispatch writer —
 * with a short retry on rate limits and transient errors. Cost is
 * accounted per call from `usage`, never estimated.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const tc = require("../../src/lib/translate-core.cjs");

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

const MODEL = "claude-haiku-5-5";
/** $/MTok, Haiku 5.5 standard tier. Verify against the price list before trusting a figure. */
const PRICE_IN_PER_MTOK = 0.1;
const PRICE_OUT_PER_MTOK = 0.5;
const MAX_TOKENS_EVENTS = 12000;
const MAX_TOKENS_DISPATCH = 8000;

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf-8").split("\n")) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trim().startsWith("#")) continue;
    if (process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv(path.join(PROJECT_ROOT, ".env.local"));

let client = null;
function getClient() {
  if (client) return client;
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set (expected in .env.local).");
  }
  const Anthropic = require("@anthropic-ai/sdk");
  // The SDK retries 429/5xx on its own; five attempts rides out a burst of
  // rate limiting during a backfill without the script giving up.
  client = new Anthropic({ maxRetries: 5 });
  return client;
}

function costUsd(usage) {
  const input = usage?.input_tokens || 0;
  const output = usage?.output_tokens || 0;
  return Math.round(((input * PRICE_IN_PER_MTOK + output * PRICE_OUT_PER_MTOK) / 1e6) * 1e6) / 1e6;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One structured call with a parsed answer, or a thrown error after the SDK's own retries. */
async function structuredCall({ system, user, schema, maxTokens }) {
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    output_config: { format: { type: "json_schema", schema } },
    messages: [{ role: "user", content: user }],
  });
  if (response.stop_reason === "max_tokens") {
    throw new Error(`truncated at max_tokens=${maxTokens}`);
  }
  let text = "";
  for (const block of response.content || []) if (block.type === "text" && block.text) text = block.text;
  return { output: JSON.parse(text), usage: response.usage || {} };
}

/**
 * Translate a batch of events into one language. Returns accepted rows,
 * rejected ids with reasons, the call's usage, and `failed` when the call
 * itself failed (after the SDK's retries plus one more pass here). A
 * failed call rejects the whole batch with `call_failed:…`; the caller
 * must not count that against the items, since it says nothing about
 * them. A batch that overflows the output cap is split in half and each
 * half retried once, so one long record cannot sink its neighbours.
 */
async function translateEventBatch(lang, items) {
  const system = tc.systemPrompt(lang);
  const user = tc.eventBatchPrompt(items);
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { output, usage } = await structuredCall({ system, user, schema: tc.EVENT_BATCH_SCHEMA, maxTokens: MAX_TOKENS_EVENTS });
      const { accepted, rejected } = tc.acceptEventBatch(items, output);
      return { accepted, rejected, usage, cost_usd: costUsd(usage), failed: false };
    } catch (err) {
      lastErr = err;
      if (/truncated at max_tokens/.test(err.message) && items.length > 1) {
        const mid = Math.ceil(items.length / 2);
        const [a, b] = await Promise.all([translateEventBatch(lang, items.slice(0, mid)), translateEventBatch(lang, items.slice(mid))]);
        return {
          accepted: [...a.accepted, ...b.accepted],
          rejected: [...a.rejected, ...b.rejected],
          usage: { input_tokens: (a.usage.input_tokens || 0) + (b.usage.input_tokens || 0), output_tokens: (a.usage.output_tokens || 0) + (b.usage.output_tokens || 0) },
          cost_usd: a.cost_usd + b.cost_usd,
          failed: a.failed && b.failed,
        };
      }
      await sleep(2000 * (attempt + 1));
    }
  }
  return {
    accepted: [],
    rejected: items.map((e) => ({ id: e.id, reason: `call_failed:${lastErr ? lastErr.message : "unknown"}` })),
    usage: {},
    cost_usd: 0,
    failed: true,
  };
}

/** Translate one dispatch narrative into one language; null translation when the checks reject it. */
async function translateDispatchText(lang, dispatch) {
  const system = tc.systemPrompt(lang);
  const user = tc.dispatchPrompt(dispatch);
  const { output, usage } = await structuredCall({ system, user, schema: tc.DISPATCH_SCHEMA, maxTokens: MAX_TOKENS_DISPATCH });
  const { translation, reasons } = tc.acceptDispatch(dispatch, output);
  return { translation, reasons, usage, cost_usd: costUsd(usage) };
}

module.exports = {
  MODEL,
  PRICE_IN_PER_MTOK,
  PRICE_OUT_PER_MTOK,
  PROJECT_ROOT,
  loadEnv,
  costUsd,
  translateEventBatch,
  translateDispatchText,
};
