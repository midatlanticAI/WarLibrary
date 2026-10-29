/**
 * Country naming rules, shared by the app (src/lib/country.ts) and the
 * CommonJS dispatch core that runs from cron without a bundler. One table,
 * so the country hubs and the dispatch statistics fold the same spellings
 * and reject the same aggregates.
 *
 * The `country` field is free text written by the extraction model. Besides
 * the 190-odd real names it holds spelling variants ("US", "USA", "U.S."),
 * lists ("Iran, Yemen", "Kuwait; Bahrain", "Iraq/Jordan") and aggregates
 * ("Multiple (Gulf States)", "Gulf Region"). A canonical name exists only
 * for a single place.
 */
"use strict";

const ALIASES = {
  "us": "United States",
  "usa": "United States",
  "u.s.": "United States",
  "u.s.a.": "United States",
  "united states of america": "United States",
  "america": "United States",
  "uk": "United Kingdom",
  "u.k.": "United Kingdom",
  "britain": "United Kingdom",
  "great britain": "United Kingdom",
  "uae": "United Arab Emirates",
  "u.a.e.": "United Arab Emirates",
  "emirates": "United Arab Emirates",
  "turkiye": "Turkey",
  "türkiye": "Turkey",
  "ksa": "Saudi Arabia",
  "kingdom of saudi arabia": "Saudi Arabia",
  "occupied palestinian territories": "Palestine",
  "palestinian territories": "Palestine",
  "gaza": "Palestine",
  "gaza strip": "Palestine",
  "west bank": "Palestine",
  "drc": "Democratic Republic of the Congo",
  "dr congo": "Democratic Republic of the Congo",
  "congo (drc)": "Democratic Republic of the Congo",
  "czechia": "Czech Republic",
  "russian federation": "Russia",
  "syrian arab republic": "Syria",
  "islamic republic of iran": "Iran",
  "iran (islamic republic of)": "Iran",
  "lebanese republic": "Lebanon",
  "state of israel": "Israel",
  "republic of yemen": "Yemen",
  "republic of iraq": "Iraq",
  "mediterranean sea": "International Waters",
  "red sea": "International Waters",
  "persian gulf": "International Waters",
  "arabian sea": "International Waters",
  "gulf of oman": "International Waters",
  "strait of hormuz": "International Waters",
  "international": "International Waters",
};

/** Placeholders and aggregates that are not a place. */
const NON_COUNTRY = new Set([
  "multiple",
  "multiple countries",
  "global",
  "unknown",
  "various",
  "n/a",
  "none",
  "null",
  "regional",
  "worldwide",
  "world",
  "gulf region",
  "gulf states",
  "arab states",
  "middle east",
  "region",
  "",
]);

/** Lists and compound names: "Iran, Yemen", "Kuwait; Bahrain", "Iraq/Jordan". */
const LIST_PATTERN = /[,;/(]|\band\b|&|^multiple\b/i;

/**
 * The display name a raw country string maps to, or null when it is not a
 * single place. Trims, applies the alias table, rejects lists.
 */
function canonicalCountry(raw) {
  if (!raw) return null;
  const trimmed = String(raw).replace(/\s+/g, " ").trim();
  if (trimmed === "") return null;
  const lower = trimmed.toLowerCase();
  if (NON_COUNTRY.has(lower)) return null;
  const alias = ALIASES[lower];
  if (alias) return alias;
  if (LIST_PATTERN.test(trimmed)) return null;
  return trimmed;
}

module.exports = { ALIASES, NON_COUNTRY, LIST_PATTERN, canonicalCountry };
