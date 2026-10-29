/**
 * Newsletter: the pure parts.
 *
 * Shared by the subscribe API routes (double opt-in) and the broadcast
 * script (scripts/newsletter.js). Nothing here calls Resend or touches
 * the filesystem beyond reading the string files, so the token scheme and
 * the email rendering are unit-tested on their own. The Resend calls live
 * in src/lib/newsletter-resend.cjs.
 *
 * Design: one Resend segment per language ("warlibrary-fa"), so a reader
 * who subscribes from the Persian interface gets the Persian dispatch.
 * Confirmation is a signed, expiring link (HMAC over the email and
 * language), so no pending-subscriber table exists anywhere: the only
 * record of an address is the Resend contact created on confirmation.
 */
"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS by design: shared with scripts/newsletter.js outside the bundler */

const crypto = require("crypto");

const SITE_URL = "https://warlibrary.midatlantic.ai";
const SITE_NAME = "War Library";
const TOKEN_TTL_MS = 48 * 3600 * 1000;
const RTL = new Set(["ar", "fa", "ur", "he"]);
const LANGS = ["en", "es", "fr", "tr", "ar", "fa", "ur", "he"];
const KIND_KEY = { daily: "pages.dailyDispatch", weekly: "pages.weeklyDispatch", monthly: "pages.monthlyDispatch" };

const strings = {};
function loadStrings(lang) {
  if (!LANGS.includes(lang)) throw new Error(`Unsupported language ${lang}`);
  if (!strings[lang]) strings[lang] = require(`../i18n/${lang}.json`);
  if (!strings.en) strings.en = require("../i18n/en.json");
  return strings[lang];
}

/** Minimal translator over the JSON files, with English fallback and {{param}} interpolation. */
function makeT(lang) {
  const map = loadStrings(lang);
  const en = loadStrings("en");
  const lookup = (obj, parts) => parts.reduce((v, p) => (v && typeof v === "object" ? v[p] : undefined), obj);
  return (key, params) => {
    const parts = key.split(".");
    const value = lookup(map, parts) ?? lookup(en, parts);
    let out = typeof value === "string" ? value : key;
    if (params) for (const [k, v] of Object.entries(params)) out = out.split(`{{${k}}}`).join(String(v));
    return out;
  };
}

function segmentName(lang) {
  if (!LANGS.includes(lang)) throw new Error(`Unsupported language ${lang}`);
  return `warlibrary-${lang}`;
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

/** Deliberately simple: one @, something either side, no spaces, a dot in the domain, sane length. */
function isValidEmail(value) {
  const e = normalizeEmail(value);
  return e.length >= 6 && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}

// ---------------------------------------------------------------------------
// Confirmation tokens
// ---------------------------------------------------------------------------

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

function hmac(secret, data) {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

/** Token = base64url(JSON{e,l,x,n}) + "." + HMAC. `x` is the expiry in ms. */
function signToken({ email, lang }, secret, now = Date.now()) {
  if (!secret || secret.length < 16) throw new Error("newsletter secret too short");
  const payload = { e: normalizeEmail(email), l: lang, x: now + TOKEN_TTL_MS, n: crypto.randomBytes(6).toString("base64url") };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${hmac(secret, body)}`;
}

/** The payload when the signature and expiry hold, else null. */
function verifyToken(token, secret, now = Date.now()) {
  if (typeof token !== "string" || !secret) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = hmac(secret, body);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload.e !== "string" || !LANGS.includes(payload.l) || typeof payload.x !== "number") return null;
  if (payload.x < now) return null;
  if (!isValidEmail(payload.e)) return null;
  return { email: payload.e, lang: payload.l, expires: payload.x };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function stripCitations(text) {
  return String(text ?? "").replace(/\[ev:[^\]]*\]/gi, "").replace(/\s+([.,;:!?])/g, "$1").replace(/ {2,}/g, " ").trim();
}

function formatDate(lang, iso) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const tag = { en: "en-GB", es: "es", fr: "fr-FR", tr: "tr-TR", ar: "ar-u-nu-arab", fa: "fa-u-nu-arabext", ur: "ur-PK", he: "he-IL" }[lang] || "en-GB";
  return new Date(t).toLocaleDateString(tag, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function formatNumber(lang, n) {
  const tag = { en: "en-GB", es: "es", fr: "fr-FR", tr: "tr-TR", ar: "ar-u-nu-arab", fa: "fa-u-nu-arabext", ur: "ur-PK", he: "he-IL" }[lang] || "en-GB";
  return Number(n).toLocaleString(tag);
}

function shell({ lang, title, bodyHtml, footerHtml }) {
  const dir = RTL.has(lang) ? "rtl" : "ltr";
  const align = dir === "rtl" ? "right" : "left";
  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#0a0a0a;color:#e4e4e7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#111;border:1px solid #27272a;border-radius:12px;">
<tr><td style="padding:20px 24px 8px;text-align:${align};font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#a1a1aa;">${escapeHtml(SITE_NAME)}</td></tr>
<tr><td style="padding:0 24px 20px;text-align:${align};font-size:16px;line-height:1.6;">${bodyHtml}</td></tr>
<tr><td style="padding:16px 24px 20px;border-top:1px solid #27272a;text-align:${align};font-size:12px;line-height:1.5;color:#71717a;">${footerHtml}</td></tr>
</table></td></tr></table>
</body></html>`;
}

/**
 * The dispatch as an email, in one language. `text` is the narrative in
 * that language (see src/lib/dispatch-i18n.ts for how it is chosen);
 * `dispatch` carries the stats and the key. The unsubscribe link is
 * Resend's broadcast placeholder, substituted per recipient on send.
 */
function renderDispatchEmail({ dispatch, text, lang }) {
  const t = makeT(lang);
  const url = `${SITE_URL}/dispatch/${dispatch.kind}/${dispatch.key}`;
  const kindLabel = t(KIND_KEY[dispatch.kind] || "pages.dailyDispatch");
  const title = stripCitations(text.title);
  const subject = `${title} — ${kindLabel}, ${dispatch.window && dispatch.window.label ? dispatch.window.label : dispatch.key}`;
  const s = dispatch.stats || {};
  const statsLine = t("pages.summaryLine", {
    events: formatNumber(lang, s.events || 0),
    kinetic: formatNumber(lang, s.kinetic || 0),
    fatalities: formatNumber(lang, s.fatalities || 0),
    countries: formatNumber(lang, s.countries || 0),
  });

  const sectionsHtml = (text.sections || [])
    .map((sec) => `<h2 style="margin:20px 0 6px;font-size:16px;color:#fafafa;">${escapeHtml(sec.heading)}</h2>` +
      stripCitations(sec.body).split(/\n{2,}/).map((p) => `<p style="margin:0 0 10px;color:#d4d4d8;">${escapeHtml(p)}</p>`).join(""))
    .join("");
  const civilianHtml = text.civilian_note
    ? `<div style="margin:20px 0;padding:12px 14px;border:1px solid #78350f;border-radius:8px;background:#1c1007;color:#fde68a;"><strong>${escapeHtml(t("pages.humanCost"))}</strong><br>${escapeHtml(stripCitations(text.civilian_note))}</div>`
    : "";
  const bodyHtml =
    `<p style="margin:0 0 4px;font-size:12px;color:#f87171;letter-spacing:.1em;text-transform:uppercase;">${escapeHtml(kindLabel)} · <span lang="en">${escapeHtml(dispatch.window && dispatch.window.label ? dispatch.window.label : dispatch.key)}</span></p>` +
    `<h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:#fafafa;">${escapeHtml(title)}</h1>` +
    `<p style="margin:0 0 16px;color:#e4e4e7;">${escapeHtml(stripCitations(text.lede))}</p>` +
    sectionsHtml +
    civilianHtml +
    `<p style="margin:16px 0 0;font-size:13px;color:#a1a1aa;">${escapeHtml(statsLine)}</p>` +
    `<p style="margin:20px 0 0;"><a href="${url}" style="display:inline-block;padding:10px 16px;background:#f4f4f5;color:#09090b;border-radius:8px;text-decoration:none;font-weight:600;">${escapeHtml(t("pages.readOnSite"))}</a></p>`;
  const footerHtml =
    `${escapeHtml(t("pages.emailFooter"))} <a href="${url}" style="color:#a1a1aa;">${escapeHtml(url)}</a><br>` +
    `<a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#a1a1aa;">${escapeHtml(t("pages.unsubscribe"))}</a>`;
  const html = shell({ lang, title: subject, bodyHtml, footerHtml });

  const textLines = [
    `${SITE_NAME} — ${kindLabel} · ${dispatch.window && dispatch.window.label ? dispatch.window.label : dispatch.key}`,
    "",
    title,
    "",
    stripCitations(text.lede),
    "",
    ...(text.sections || []).flatMap((sec) => [sec.heading.toUpperCase(), stripCitations(sec.body), ""]),
    ...(text.civilian_note ? [t("pages.humanCost"), stripCitations(text.civilian_note), ""] : []),
    statsLine,
    "",
    `${t("pages.readOnSite")}: ${url}`,
    "",
    t("pages.emailFooter"),
    `${t("pages.unsubscribe")}: {{{RESEND_UNSUBSCRIBE_URL}}}`,
  ];
  return { subject, html, text: textLines.join("\n") };
}

/** The double opt-in message. */
function renderConfirmEmail({ lang, confirmUrl }) {
  const t = makeT(lang);
  const subject = t("pages.confirmSubject");
  const bodyHtml =
    `<h1 style="margin:0 0 12px;font-size:20px;color:#fafafa;">${escapeHtml(subject)}</h1>` +
    `<p style="margin:0 0 16px;">${escapeHtml(t("pages.confirmBody"))}</p>` +
    `<p style="margin:0;"><a href="${confirmUrl}" style="display:inline-block;padding:10px 16px;background:#f4f4f5;color:#09090b;border-radius:8px;text-decoration:none;font-weight:600;">${escapeHtml(t("pages.confirmButton"))}</a></p>` +
    `<p style="margin:16px 0 0;font-size:12px;color:#71717a;word-break:break-all;"><span lang="en">${escapeHtml(confirmUrl)}</span></p>`;
  const footerHtml = escapeHtml(SITE_URL);
  const html = shell({ lang, title: subject, bodyHtml, footerHtml });
  const text = [subject, "", t("pages.confirmBody"), "", `${t("pages.confirmButton")}: ${confirmUrl}`, "", SITE_URL].join("\n");
  return { subject, html, text };
}

module.exports = {
  SITE_URL,
  SITE_NAME,
  LANGS,
  RTL,
  TOKEN_TTL_MS,
  makeT,
  segmentName,
  normalizeEmail,
  isValidEmail,
  signToken,
  verifyToken,
  escapeHtml,
  stripCitations,
  formatDate,
  renderDispatchEmail,
  renderConfirmEmail,
};
