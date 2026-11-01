/**
 * Civilian-impact notes: telling a note about harm from a note about none.
 *
 * The codebook defines `civilian_impact` as a plain-language note on harm to
 * civilians, when the source describes any. The extraction model often
 * fills it anyway: "None", "None reported", "Unknown", "No civilian
 * casualties reported; military base targeted". Measured on the live archive
 * (2026-10-31), about 3,400 of 14,700 notes were of that kind, and every one
 * of them was counted in the CIVILIAN headline figure and shown on the event
 * with a warning sign.
 *
 * A note means "no harm described" when its lead clause is a negation or an
 * unknown ("none", "no civilian casualties reported", "unknown", "n/a") and
 * nothing after it describes civilians being harmed. Deprivation ("no power
 * in Tehran", "no water for 50,000 people") is harm, not a negation, and an
 * unknown that still asserts harm ("unknown number of civilians killed") is
 * harm with an unknown count. When in doubt the note is kept.
 *
 * CommonJS so the cron scripts, the dispatch writer and the app share it,
 * the same as dispatch-core.cjs.
 */
"use strict";

/** Lead words that negate or disclaim. */
const NEGATION_LEAD = /^(none|nil|n\/?a|no|not|nothing|unknown|unclear|unspecified|undetermined|civilian (impact|casualties|harm) (not|unknown|unclear|unspecified))\b/;

/** "no power", "no water": a deprivation, which is itself civilian harm. */
const DEPRIVATION =
  /^no (power|electricity|water|running water|food|fuel|gas|heating|internet|phone|communications?|access|shelter|medicine|medical (care|supplies)|aid|humanitarian aid|services|supplies|safe passage|escape|way out)\b/;

/** Where the lead clause ends and any qualifier starts. */
const CLAUSE_BREAK = /\s*(?:;|:|\s[-–—]\s|\(|\.\s|,?\s+(?:but|however|though|although|while|yet|despite|except)\b)\s*/;

/** People and places whose harm makes a note a civilian-impact note. */
const CIVILIAN_SUBJECT =
  /\b(civilians?|people|persons?|residents?|inhabitants|child(ren)?|kids|minors|famil(y|ies)|women|girls?|boys?|infants?|bab(y|ies)|elderly|homes?|houses?|housing|residential|apartments?|hospitals?|clinics?|schools?|universit(y|ies)|students?|patients?|workers?|journalists?|reporters?|aid workers?|medics?|paramedics?|passengers?|worshippers?|mosques?|churches?|synagogues?|neighbou?rhoods?|villages?|villagers|towns?|communit(y|ies)|population|refugees?|displaced)\b/;

/** Words that say harm happened. */
const HARM =
  /\b(killed|dead|died|deaths?|injur\w*|wound\w*|hurt|harmed|casualt\w*|damaged|destroyed|displac\w*|evacu\w*|fled|flee\w*|homeless|trapped|missing|targeted|attacked|struck|hit|affected|disrupt\w*|cut off|without (power|water|electricity)|outages?|shortages?)\b/;

/** Words that make a clause hypothetical rather than a report of harm. */
const SPECULATIVE = /\b(prevent\w*|avert\w*|potential(ly)?|possibl[ey]|could|may|might|risks?|threat\w*|feared|fears?|anticipated|expected|likely)\b/;

/** A qualifier that itself denies harm: "no civilian casualties mentioned". */
const NEGATED = /\b(no|not|none|without|zero|neither|nor|den(y|ied|ies|ying))\b/;

/** An unknown that still asserts harm: "unknown number of civilians killed". */
const ASSERTED_UNKNOWN = /^(unknown number of|unspecified number of|unspecified casualties|an unknown number)\b/;

function normalize(text) {
  return String(text ?? "").trim().toLowerCase().replace(/[.!\s]+$/, "");
}

function describesCivilianHarm(clause) {
  if (NEGATED.test(clause) && !DEPRIVATION.test(clause)) return false;
  return CIVILIAN_SUBJECT.test(clause) && HARM.test(clause) && !SPECULATIVE.test(clause);
}

/**
 * True when the note says no civilian harm, or that it is unknown, and
 * nothing in it describes civilians being harmed. Empty notes count as none.
 */
function isNoCivilianImpact(text) {
  const s = normalize(text);
  if (!s) return true;
  if (!NEGATION_LEAD.test(s) || DEPRIVATION.test(s)) return false;
  const [lead, ...rest] = s.split(CLAUSE_BREAK);
  // "Unknown number of civilians killed" asserts harm with an unknown count;
  // "unknown number of troops wounded" asserts harm, but not to civilians.
  if (ASSERTED_UNKNOWN.test(lead) && !SPECULATIVE.test(lead) && (/\bcasualt/.test(lead) || describesCivilianHarm(lead))) return false;
  return !rest.some((clause) => clause && describesCivilianHarm(clause));
}

/** The note as published: null when it describes no civilian harm. */
function cleanCivilianImpact(text) {
  if (typeof text !== "string") return null;
  return isNoCivilianImpact(text) ? null : text.trim();
}

module.exports = { isNoCivilianImpact, cleanCivilianImpact };
