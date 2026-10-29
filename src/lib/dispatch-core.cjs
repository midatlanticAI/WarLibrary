/**
 * Dispatch core: the pure, dependency-free logic shared by the Next.js app
 * (pages, feed, sitemaps, admin) and the Node writer script.
 *
 * It is CommonJS on purpose. The writer runs under plain `node` from cron on
 * the droplet, where there is no bundler and no `@/` alias; the app imports
 * this same file through `src/lib/dispatch-core.d.cts`. One implementation
 * of the period maths, the statistics and the citation check means the page
 * can never disagree with the file the script wrote.
 *
 * Principle from the growth plan: the model narrates, the code counts.
 * Everything numeric on a dispatch comes from `computeStats`; the model is
 * never asked to add anything up, and `citationCheck` drops any sentence
 * that does not cite an event it was given.
 */
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS by design, see above */
const crypto = require("crypto");
const { canonicalCountry } = require("./country-rules.cjs");

const KINDS = ["daily", "weekly", "monthly"];
const STATUSES = ["draft", "published", "pulled"];

const KINETIC_TYPES = new Set([
  "airstrike",
  "missile_attack",
  "drone_attack",
  "battle",
  "explosion",
  "violence_against_civilians",
]);

const DISCLOSURE =
  "Automated digest from the War Library dataset. Figures are computed in code from source-attributed events; the narrative is model-generated and spot-checked. Every event mentioned links to its record and its source.";

const DAY_MS = 86_400_000;
/** Keys outside this span are malformed, whatever the regex says. */
const MIN_YEAR = 1970;
const MAX_YEAR = 2100;

// ---------------------------------------------------------------------------
// Event identity (must match src/lib/event-store.ts exactly)
// ---------------------------------------------------------------------------

/**
 * Content-derived event id: sha1 of date|lat|lng|description[0:120], first
 * 12 hex chars. The app's event store imports this so the two can never
 * drift.
 */
function stableEventId(raw) {
  const basis = [
    raw.date,
    raw.latitude,
    raw.longitude,
    (raw.description || "").trim().toLowerCase().slice(0, 120),
  ].join("|");
  return crypto.createHash("sha1").update(basis).digest("hex").slice(0, 12);
}

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

function pad2(n) {
  return String(n).padStart(2, "0");
}

function utcDay(date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/** ISO-8601 week of a date: { year, week } (week 1 contains 4 January). */
function isoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7; // Monday=1 … Sunday=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // Thursday of this week
  const year = d.getUTCFullYear();
  const yearStart = Date.UTC(year, 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / DAY_MS + 1) / 7);
  return { year, week };
}

/** Monday 00:00 UTC of ISO week `week` of ISO year `year`. */
function mondayOfIsoWeek(year, week) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4.getTime() - (jan4Day - 1) * DAY_MS);
  return new Date(week1Monday.getTime() + (week - 1) * 7 * DAY_MS);
}

const KEY_PATTERNS = {
  daily: /^(\d{4})-(\d{2})-(\d{2})$/,
  weekly: /^(\d{4})-W(\d{2})$/,
  monthly: /^(\d{4})-(\d{2})$/,
};

function isKind(kind) {
  return KINDS.includes(kind);
}

function isValidKey(kind, key) {
  if (!isKind(kind) || typeof key !== "string") return false;
  const m = KEY_PATTERNS[kind].exec(key);
  if (!m) return false;
  return windowFor(kind, key) !== null;
}

/** The period key that `date` falls in. */
function keyFor(kind, date) {
  if (kind === "daily") return utcDay(date);
  if (kind === "weekly") {
    const { year, week } = isoWeek(date);
    return `${year}-W${pad2(week)}`;
  }
  if (kind === "monthly") return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;
  throw new Error(`Unknown dispatch kind: ${kind}`);
}

/**
 * The most recently COMPLETED period as of `now`: yesterday, last week, last
 * month — whatever the day of the week or month. Cron runs each writer just
 * after its period ends, so this is the key it should write; the admin's
 * Generate box prefills the same.
 */
function defaultKey(kind, now = new Date()) {
  const current = windowFor(kind, keyFor(kind, now));
  return keyFor(kind, new Date(new Date(current.from).getTime() - 1));
}

/**
 * Window for a key: `from` inclusive, `to` exclusive, both ISO strings, plus
 * the same for the prior period (for the change-vs-last-time numbers) and a
 * human label. Returns null for a malformed or impossible key.
 */
function windowFor(kind, key) {
  if (!isKind(kind) || typeof key !== "string") return null;
  const m = KEY_PATTERNS[kind].exec(key);
  if (!m) return null;
  const y = Number(m[1]);
  // Date.UTC maps two-digit years onto 1900–1999; a floor keeps "0026-10"
  // from quietly becoming October 1926.
  if (y < MIN_YEAR || y > MAX_YEAR) return null;
  let from;
  let to;
  let priorFrom;
  let label;
  if (kind === "daily") {
    const [mo, d] = [Number(m[2]), Number(m[3])];
    from = new Date(Date.UTC(y, mo - 1, d));
    if (from.getUTCFullYear() !== y || from.getUTCMonth() !== mo - 1 || from.getUTCDate() !== d) return null;
    to = new Date(from.getTime() + DAY_MS);
    priorFrom = new Date(from.getTime() - DAY_MS);
    label = formatDay(from);
  } else if (kind === "weekly") {
    const w = Number(m[2]);
    if (w < 1 || w > 53) return null;
    from = mondayOfIsoWeek(y, w);
    if (isoWeek(from).week !== w || isoWeek(from).year !== y) return null;
    to = new Date(from.getTime() + 7 * DAY_MS);
    priorFrom = new Date(from.getTime() - 7 * DAY_MS);
    label = `Week of ${formatDay(from)}`;
  } else {
    const mo = Number(m[2]);
    if (mo < 1 || mo > 12) return null;
    from = new Date(Date.UTC(y, mo - 1, 1));
    to = new Date(Date.UTC(y, mo, 1));
    priorFrom = new Date(Date.UTC(y, mo - 2, 1));
    label = from.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  }
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    prior: { from: priorFrom.toISOString(), to: from.toISOString() },
    label,
  };
}

function formatDay(date) {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** Keys of the sub-periods a bigger dispatch is built from. */
function childKeys(kind, key) {
  const win = windowFor(kind, key);
  if (!win) return [];
  if (kind === "daily") return [];
  if (kind === "weekly") {
    const keys = [];
    for (let t = new Date(win.from).getTime(); t < new Date(win.to).getTime(); t += DAY_MS) {
      keys.push(utcDay(new Date(t)));
    }
    return keys;
  }
  // monthly → every ISO week that overlaps the month
  const keys = [];
  const seen = new Set();
  for (let t = new Date(win.from).getTime(); t < new Date(win.to).getTime(); t += DAY_MS) {
    const k = keyFor("weekly", new Date(t));
    if (!seen.has(k)) {
      seen.add(k);
      keys.push(k);
    }
  }
  return keys;
}

function childKind(kind) {
  if (kind === "weekly") return "daily";
  if (kind === "monthly") return "weekly";
  return null;
}

// ---------------------------------------------------------------------------
// Selection and statistics
// ---------------------------------------------------------------------------

function eventTime(event) {
  const t = new Date(event.date).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Events whose date falls in [from, to). Events with unparseable dates are excluded. */
function eventsInWindow(events, from, to) {
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  return events.filter((e) => {
    const t = eventTime(e);
    return t !== null && t >= start && t < end;
  });
}

function isKinetic(event) {
  return KINETIC_TYPES.has(event.event_type);
}

function fatalitiesOf(event) {
  const n = Number(event.fatalities);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function sortCounts(map, limit) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

/**
 * Everything numeric a dispatch may state. Computed in code, never by the
 * model. `events` must already be the window's events.
 *
 * Countries are folded through the same rules as the country hubs: "US" and
 * "United States" are one row, and aggregates ("Multiple", "Global",
 * "Iran, Yemen") are not counted as countries at all — the events still
 * count everywhere else.
 */
function computeStats(events, { topCountries = 10 } = {}) {
  const byType = {};
  const byVerification = {};
  const byConflict = {};
  const countries = new Map();
  const outlets = new Set();
  let kinetic = 0;
  let fatalities = 0;
  let fatalEvents = 0;
  let civilianImpactEvents = 0;
  let confirmedOrReported = 0;
  let unplaced = 0;

  for (const e of events) {
    byType[e.event_type] = (byType[e.event_type] || 0) + 1;
    const v = e.verification_status || "unconfirmed";
    byVerification[v] = (byVerification[v] || 0) + 1;
    if (v === "confirmed" || v === "reported") confirmedOrReported++;
    const c = e.conflict_id || "epic-fury-2026";
    byConflict[c] = (byConflict[c] || 0) + 1;
    const k = isKinetic(e);
    if (k) kinetic++;
    const f = fatalitiesOf(e);
    if (f > 0) {
      fatalities += f;
      fatalEvents++;
    }
    if (e.civilian_impact && String(e.civilian_impact).trim()) civilianImpactEvents++;
    if (e.source) outlets.add(String(e.source).trim().toLowerCase());
    const name = canonicalCountry(e.country);
    if (name) {
      const row = countries.get(name) || { name, events: 0, kinetic: 0, fatalities: 0 };
      row.events++;
      if (k) row.kinetic++;
      row.fatalities += f;
      countries.set(name, row);
    } else {
      unplaced++;
    }
  }

  const countryRows = [...countries.values()].sort(
    (a, b) => b.kinetic - a.kinetic || b.events - a.events || a.name.localeCompare(b.name)
  );

  return {
    events: events.length,
    kinetic,
    developments: events.length - kinetic,
    fatalities,
    fatal_events: fatalEvents,
    civilian_impact_events: civilianImpactEvents,
    confirmed_or_reported: confirmedOrReported,
    outlets: outlets.size,
    countries: countryRows.length,
    /** Events whose country string is a list or an aggregate (not counted above). */
    unplaced_country: unplaced,
    by_type: Object.fromEntries(sortCounts(byType, 20)),
    by_verification: byVerification,
    by_conflict: byConflict,
    top_countries: countryRows.slice(0, topCountries),
  };
}

/** Signed change of the headline numbers against the prior period. */
function diffStats(current, prior) {
  const delta = (k) => current[k] - prior[k];
  const pct = (k) => (prior[k] === 0 ? null : Math.round(((current[k] - prior[k]) / prior[k]) * 100));
  return {
    events: delta("events"),
    events_pct: pct("events"),
    kinetic: delta("kinetic"),
    kinetic_pct: pct("kinetic"),
    fatalities: delta("fatalities"),
    fatalities_pct: pct("fatalities"),
  };
}

/**
 * Score used to pick which events the narrative may draw on: reliability
 * first, then human cost, with a nudge for kinetic events so a day of
 * statements does not crowd out the strike that mattered.
 */
function eventScore(event) {
  const confidence = Number(event.confidence) || 0;
  const f = fatalitiesOf(event);
  let score = confidence * (1 + Math.log1p(f));
  if (isKinetic(event)) score += 0.3;
  if (event.verification_status === "confirmed") score += 0.2;
  if (event.source_url) score += 0.1;
  if (event.civilian_impact) score += 0.05;
  return score;
}

/** Top `n` events by score, ties broken by date (newest first) then id. */
function selectTopEvents(events, n) {
  return [...events]
    .sort((a, b) => eventScore(b) - eventScore(a) || String(b.date).localeCompare(String(a.date)) || String(a.id).localeCompare(String(b.id)))
    .slice(0, n);
}

/** Compact form of an event for the prompt and for `top_events` on the dispatch. */
function compactEvent(event, descriptionMax = 220) {
  const desc = String(event.description || "").replace(/\s+/g, " ").trim();
  return {
    id: event.id,
    date: String(event.date || "").slice(0, 10),
    country: event.country || "",
    region: event.region || "",
    event_type: event.event_type,
    description: desc.length > descriptionMax ? `${desc.slice(0, descriptionMax - 1).trimEnd()}…` : desc,
    fatalities: fatalitiesOf(event),
    civilian_impact: event.civilian_impact ? String(event.civilian_impact).slice(0, 160) : null,
    verification_status: event.verification_status || null,
    source: event.source || "",
    source_url: event.source_url || null,
    conflict_id: event.conflict_id || "epic-fury-2026",
  };
}

// ---------------------------------------------------------------------------
// Post-checks on model output
// ---------------------------------------------------------------------------

/** A well-formed citation: twelve lowercase hex characters. */
const CITATION_RE = /\[ev:([0-9a-f]{12})\]/g;
/** Anything that looks like a citation, well-formed or not. */
const LOOSE_CITATION_RE = /\[ev:[^\]]*\]/gi;

/** Abbreviations whose full stop must not end a sentence. */
const ABBREVIATIONS = /\b(U\.S\.A|U\.S|U\.K|U\.N|U\.A\.E|E\.U|e\.g|i\.e|Mr|Mrs|Ms|Dr|St|Lt|Gen|Col|Maj|Sgt|Capt|Adm|Brig|Prof|Sen|Rep|Gov|No|vs|approx)\./g;
const DOT_MARK = "\u0001";

/**
 * Split prose into sentences, keeping each sentence's citations with it.
 * The model is told to end every sentence with its citation; it sometimes
 * puts the citation after the full stop ("Depot hit. [ev:a] Fire."), and a
 * naive split then hands that citation to the next sentence, so the wrong
 * sentence gets dropped. Citation runs that follow a terminator are moved
 * back in front of it before splitting.
 */
function splitSentences(text) {
  const prepared = String(text)
    .replace(ABBREVIATIONS, (m) => m.replace(/\./g, DOT_MARK))
    .replace(/([.!?])((?:\s*\[ev:[^\]]*\])+)/g, (m, stop, cites) => ` ${cites.trim().replace(/\s+/g, " ")}${stop}`);
  return prepared
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.replace(new RegExp(DOT_MARK, "g"), ".").trim())
    .filter(Boolean);
}

/**
 * Enforce "every sentence cites an event it was given".
 *
 * - A sentence with no citation is dropped.
 * - A sentence carrying a citation to an unknown id, or a malformed citation
 *   token, is dropped.
 * - `event_ids` on a section are filtered to known ids; they do not rescue
 *   an uncited sentence.
 * - A section left with no sentence is dropped.
 *
 * Returns the cleaned sections, the ids actually cited (sorted) and counts of
 * what was removed, so the dispatch can carry a review flag when the model
 * tried to cite something it was not given.
 */
function citationCheck(sections, allowedIds) {
  const allowed = allowedIds instanceof Set ? allowedIds : new Set(allowedIds);
  const cited = new Set();
  let droppedSentences = 0;
  let uncitedSentences = 0;
  let droppedSections = 0;
  let unknownCitations = 0;
  const cleaned = [];

  for (const section of sections || []) {
    const body = String(section.body || "");
    const kept = [];
    for (const sentence of splitSentences(body)) {
      let bad = false;
      let good = 0;
      for (const token of sentence.match(LOOSE_CITATION_RE) || []) {
        const strict = /^\[ev:([0-9a-f]{12})\]$/.exec(token);
        if (strict && allowed.has(strict[1])) {
          cited.add(strict[1]);
          good++;
        } else {
          bad = true;
          unknownCitations++;
        }
      }
      if (bad) droppedSentences++;
      else if (good === 0) {
        droppedSentences++;
        uncitedSentences++;
      } else kept.push(sentence);
    }
    const ids = [...new Set((section.event_ids || []).filter((id) => allowed.has(id)))];
    if (kept.length === 0) {
      droppedSections++;
      continue;
    }
    for (const id of ids) cited.add(id);
    cleaned.push({
      heading: String(section.heading || "").trim(),
      body: kept.join(" ").trim(),
      event_ids: ids,
    });
  }

  return {
    sections: cleaned,
    cited: [...cited].sort(),
    dropped_sentences: droppedSentences,
    uncited_sentences: uncitedSentences,
    dropped_sections: droppedSections,
    unknown_citations: unknownCitations,
  };
}

/**
 * Numbers the narrative is allowed to contain: everything in the stats, the
 * fatalities of the events it was given, and calendar numbers. Any other
 * integer of 10 or more is a figure the model made up or added up itself,
 * and the dispatch is flagged for review rather than auto-published.
 */
function allowedNumbers(stats, events, extra = []) {
  const allowed = new Set(extra);
  const walk = (v) => {
    if (typeof v === "number" && Number.isFinite(v)) allowed.add(Math.abs(Math.round(v)));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(stats);
  for (const e of events || []) {
    allowed.add(fatalitiesOf(e));
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(e.date || ""));
    if (m) {
      allowed.add(Number(m[1]));
      allowed.add(Number(m[2]));
      allowed.add(Number(m[3]));
    }
    // Figures quoted in the description are fair game to repeat.
    for (const n of numbersInText(e.description)) allowed.add(n);
    for (const n of numbersInText(e.civilian_impact)) allowed.add(n);
  }
  for (let y = 1990; y <= 2100; y++) allowed.add(y);
  for (let d = 1; d <= 31; d++) allowed.add(d);
  return allowed;
}

/** Integers in a piece of prose (citation tokens removed first). */
function numbersInText(text) {
  const out = [];
  if (!text) return out;
  const prose = String(text).replace(LOOSE_CITATION_RE, " ");
  for (const raw of prose.match(/\d[\d,]*/g) || []) {
    const n = Number(raw.replace(/,/g, ""));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/**
 * Integers ≥ 10 in `text` that are not in `allowed`. Citation tokens are
 * removed first: event ids are hex, and a run like `[ev:642037156abc]` would
 * otherwise read as a six-hundred-million-casualty claim.
 */
function numberGuard(text, allowed) {
  const offenders = new Set();
  for (const n of numbersInText(text)) {
    if (n < 10) continue;
    if (!allowed.has(n)) offenders.add(n);
  }
  return [...offenders];
}

/** All narrative text of a dispatch, for guards and search. */
function narrativeText(dispatch) {
  const parts = [dispatch.title, dispatch.lede, dispatch.civilian_note];
  for (const s of dispatch.sections || []) parts.push(s.heading, s.body);
  return parts.filter(Boolean).join("\n");
}

// ---------------------------------------------------------------------------
// Publishing state
// ---------------------------------------------------------------------------

/**
 * Daily dispatches publish on generation unless flagged. Weekly and monthly
 * land as drafts with `publish_after` set 24 h out and go live on their own
 * if nobody touches them, so a missed review never silences the site. A
 * draft that was edited or pulled keeps its explicit state.
 */
function effectiveStatus(dispatch, now = new Date()) {
  if (!dispatch) return "draft";
  if (dispatch.status === "draft" && dispatch.publish_after && !dispatch.needs_review?.length) {
    if (new Date(dispatch.publish_after).getTime() <= now.getTime()) return "published";
  }
  return dispatch.status;
}

function isPublished(dispatch, now = new Date()) {
  return effectiveStatus(dispatch, now) === "published";
}

function dispatchUrlPath(kind, key) {
  return `/dispatch/${kind}/${key}`;
}

function dispatchFileName(kind, key) {
  return `${kind}/${key}.json`;
}

/** Plain text for a social post: title, lede, link. Code-built, not model-built. */
function socialText(dispatch, url) {
  const lede = stripCitations(dispatch.lede || "");
  const short = lede.length > 200 ? `${lede.slice(0, 199).trimEnd()}…` : lede;
  return `${stripCitations(dispatch.title || "")}\n\n${short}\n\n${url}`.replace(/ {2,}/g, " ");
}

/** Strip `[ev:…]` markers (well-formed or not) for places that cannot render links. */
function stripCitations(text) {
  return String(text).replace(LOOSE_CITATION_RE, "").replace(/\s+([.,;:!?])/g, "$1").replace(/ {2,}/g, " ").trim();
}

module.exports = {
  KINDS,
  STATUSES,
  KINETIC_TYPES,
  DISCLOSURE,
  DAY_MS,
  CITATION_RE,
  LOOSE_CITATION_RE,
  stableEventId,
  utcDay,
  isoWeek,
  mondayOfIsoWeek,
  isKind,
  isValidKey,
  keyFor,
  defaultKey,
  windowFor,
  childKeys,
  childKind,
  eventsInWindow,
  isKinetic,
  fatalitiesOf,
  computeStats,
  diffStats,
  eventScore,
  selectTopEvents,
  compactEvent,
  splitSentences,
  citationCheck,
  allowedNumbers,
  numbersInText,
  numberGuard,
  narrativeText,
  effectiveStatus,
  isPublished,
  dispatchUrlPath,
  dispatchFileName,
  socialText,
  stripCitations,
};
