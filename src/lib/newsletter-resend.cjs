/**
 * Newsletter: the Resend half.
 *
 * Everything that talks to Resend is here and nowhere else, so the API
 * routes and the broadcast script share one client, one `from` address
 * and one way of finding the per-language segment. Configuration comes
 * from the environment (RESEND_API_KEY, NEWSLETTER_FROM, optional
 * NEWSLETTER_REPLY_TO); `isConfigured()` is what the page checks before
 * it shows the form at all, so an unconfigured site never shows a dead
 * form.
 *
 * Segment ids are cached in src/data/newsletter.json (NEWSLETTER_STATE
 * overrides) next to a per-language count of confirmed subscribers. The
 * count is a local tally for deciding which languages to broadcast; the
 * truth about who is subscribed lives in Resend (unsubscribes happen
 * there), so the count is never shown as a fact.
 */
"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS by design: shared with scripts/newsletter.js outside the bundler */

const fs = require("fs");
const path = require("path");
const core = require("./newsletter-core.cjs");

// Resolved from this file, not the working directory, so a hand run of the
// script from another directory still finds the real tally.
const STATE_FILE = process.env.NEWSLETTER_STATE || path.join(__dirname, "..", "data", "newsletter.json");

function isConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.NEWSLETTER_FROM);
}

function fromAddress() {
  const from = process.env.NEWSLETTER_FROM;
  if (!from) throw new Error("NEWSLETTER_FROM is not set (e.g. \"War Library <dispatch@example.com>\" on a domain verified in Resend)");
  return from;
}

let client = null;
function getResend() {
  if (client) return client;
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set");
  const { Resend } = require("resend");
  client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

/** Throw a readable error for the SDK's `{ data, error }` shape. */
function unwrap(result, what) {
  if (result && result.error) {
    const e = result.error;
    const err = new Error(`${what}: ${e.message || e.name || JSON.stringify(e)}`);
    err.resend = e;
    throw err;
  }
  return result ? result.data : null;
}

// ---------------------------------------------------------------------------
// Local state
// ---------------------------------------------------------------------------

function readState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
      return { segments: parsed.segments || {}, subscribers: parsed.subscribers || {}, updated_at: parsed.updated_at || null };
    }
  } catch (err) {
    console.error("[newsletter] state unreadable, starting fresh:", err.message);
  }
  return { segments: {}, subscribers: {}, updated_at: null };
}

function writeState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  const tmp = `${STATE_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ ...state, updated_at: new Date().toISOString() }, null, 2), "utf-8");
  fs.renameSync(tmp, STATE_FILE);
}

// ---------------------------------------------------------------------------
// Segments
// ---------------------------------------------------------------------------

/**
 * The segment id for a language, creating the segment on first use.
 * Looks the name up in Resend before creating so a lost state file never
 * produces a second "warlibrary-fa".
 */
async function ensureSegment(lang) {
  const state = readState();
  if (state.segments[lang]) return state.segments[lang];
  const name = core.segmentName(lang);
  const resend = getResend();
  const list = unwrap(await resend.segments.list({ limit: 100 }), "segments.list");
  const found = (list && list.data ? list.data : []).find((s) => s.name === name);
  let id = found ? found.id : null;
  if (!id) {
    const created = unwrap(await resend.segments.create({ name }), "segments.create");
    id = created.id;
  }
  const fresh = readState();
  fresh.segments[lang] = id;
  writeState(fresh);
  return id;
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

/**
 * Add a confirmed address to the language's segment. An address Resend
 * already knows is re-subscribed and added to the segment rather than
 * failing, so confirming twice, or confirming after unsubscribing, works.
 */
async function subscribeContact(email, lang) {
  const segmentId = await ensureSegment(lang);
  const resend = getResend();
  const created = await resend.contacts.create({ email, unsubscribed: false, segments: [{ id: segmentId }] });
  if (!created.error) {
    bump(lang);
    return { id: created.data.id, existed: false };
  }
  const message = String(created.error.message || "").toLowerCase();
  if (!/exist|already|duplicate|conflict/.test(message) && created.error.name !== "validation_error") {
    unwrap(created, "contacts.create");
  }
  unwrap(await resend.contacts.update({ email, unsubscribed: false }), "contacts.update");
  const added = await resend.contacts.segments.add({ email, segmentId });
  if (added.error && !/exist|already|duplicate/.test(String(added.error.message || "").toLowerCase())) {
    unwrap(added, "contacts.segments.add");
  }
  // A re-confirmation (replayed link, re-subscribe) is not a new reader;
  // the tally only ever counted first confirmations.
  return { id: null, existed: true };
}

function bump(lang) {
  const state = readState();
  state.subscribers[lang] = (state.subscribers[lang] || 0) + 1;
  writeState(state);
}

/**
 * Whether a language's segment has at least one contact, asked of Resend
 * (unsubscribes happen there, so the local tally can only over-count).
 * Returns null when the question could not be answered, and the caller
 * falls back to the tally.
 */
async function segmentHasContacts(lang) {
  const state = readState();
  const segmentId = state.segments[lang];
  if (!segmentId) return false;
  try {
    const list = unwrap(await getResend().contacts.list({ segmentId, limit: 1 }), "contacts.list");
    return Boolean(list && Array.isArray(list.data) && list.data.length > 0);
  } catch (err) {
    console.error(`[newsletter] contacts.list failed for ${lang}: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

async function sendConfirmation({ to, subject, html, text }) {
  const resend = getResend();
  const data = unwrap(
    await resend.emails.send({
      from: fromAddress(),
      to,
      subject,
      html,
      text,
      replyTo: process.env.NEWSLETTER_REPLY_TO || undefined,
      headers: { "X-Entity-Ref-ID": `confirm-${Date.now()}` },
    }),
    "emails.send"
  );
  return data ? data.id : null;
}

/** Create and send a broadcast to one language's segment; returns the broadcast id. */
async function sendBroadcast({ lang, subject, html, text, name }) {
  const segmentId = await ensureSegment(lang);
  const resend = getResend();
  const data = unwrap(
    await resend.broadcasts.create({
      segmentId,
      from: fromAddress(),
      subject,
      html,
      text,
      name,
      replyTo: process.env.NEWSLETTER_REPLY_TO || undefined,
      send: true,
    }),
    "broadcasts.create"
  );
  return data ? data.id : null;
}

module.exports = {
  STATE_FILE,
  isConfigured,
  fromAddress,
  readState,
  writeState,
  ensureSegment,
  subscribeContact,
  segmentHasContacts,
  sendConfirmation,
  sendBroadcast,
};
