/**
 * Country naming, shared by the server store and the client.
 *
 * The `country` field is free text written by the extraction model. Besides
 * the 190-odd real names it holds spelling variants ("US", "USA", "U.S."),
 * lists ("Iran, Yemen", "Kuwait; Bahrain", "Iraq/Jordan") and aggregates
 * ("Multiple (Gulf States)", "Gulf Region"). Hubs exist only for single,
 * canonical names; everything else stays in the dataset but gets no page.
 *
 * No Node imports here: HomeClient uses `slugifyCountry` in the browser.
 */

const ALIASES: Record<string, string> = {
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
export function canonicalCountry(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.replace(/\s+/g, " ").trim();
  if (trimmed === "") return null;
  const lower = trimmed.toLowerCase();
  if (NON_COUNTRY.has(lower)) return null;
  const alias = ALIASES[lower];
  if (alias) return alias;
  if (LIST_PATTERN.test(trimmed)) return null;
  return trimmed;
}

export function slugifyCountry(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Slug for an event's country, or null when it has no hub. */
export function countrySlug(raw: string | null | undefined): string | null {
  const name = canonicalCountry(raw);
  return name ? slugifyCountry(name) : null;
}

export function isCountryName(raw: string | null | undefined): boolean {
  return canonicalCountry(raw) !== null;
}

/** Region strings that mean "no region". */
const NON_REGION = new Set(["unknown", "none", "null", "n/a", "undefined", "various", ""]);

export function cleanRegion(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = raw.replace(/\s+/g, " ").trim();
  return NON_REGION.has(trimmed.toLowerCase()) ? "" : trimmed;
}
