/**
 * Site-wide constants and small formatting helpers shared by the
 * server-rendered pages, the sitemaps and the feed.
 */
export const SITE_URL = "https://warlibrary.midatlantic.ai";
export const SITE_NAME = "War Library";
/** Publication name for Google News; must match what the site shows. */
export const PUBLICATION_NAME = "War Library";

export const EVENT_TYPE_LABEL: Record<string, string> = {
  airstrike: "Airstrike",
  missile_attack: "Missile attack",
  drone_attack: "Drone attack",
  battle: "Battle",
  explosion: "Explosion",
  violence_against_civilians: "Violence against civilians",
  strategic_development: "Strategic development",
  protest: "Protest",
};

export function eventTypeLabel(type: string): string {
  return EVENT_TYPE_LABEL[type] ?? type.replace(/_/g, " ");
}

export const VERIFICATION_LABEL: Record<string, string> = {
  confirmed: "Confirmed by multiple outlets",
  reported: "Reported",
  claimed: "Claimed by a party to the conflict",
  disputed: "Disputed",
  unconfirmed: "Unconfirmed",
};

export const PRECISION_LABEL: Record<string, string> = {
  exact: "Exact location",
  city: "City level",
  region: "Region level",
  country: "Country centroid (approximate)",
};

export const GEO_SOURCE_LABEL: Record<string, string> = {
  article: "Placed from the article text",
  gazetteer: "Matched to a named place",
  centroid: "Country centroid, approximate",
  legacy: "Placed before provenance was recorded",
};

export const ACTOR_TYPE_LABEL: Record<string, string> = {
  state: "state",
  non_state: "non-state",
  coalition: "coalition",
  civilians: "civilians",
  unknown: "type not recorded",
};

/** "one_way_attack_drone" → "One-way attack drone". */
export function subTypeLabel(value: string): string {
  const words = value.replace(/_/g, " ");
  const fixed = words.replace(/\bone way\b/, "one-way").replace(/\bied\b/, "IED").replace(/\buav\b/, "UAV");
  return fixed.charAt(0).toUpperCase() + fixed.slice(1);
}

export const DISPATCH_KIND_LABEL: Record<string, string> = {
  daily: "Daily dispatch",
  weekly: "Weekly dispatch",
  monthly: "Monthly dispatch",
};

/** "28 October 2026" in UTC, or the raw string when it cannot be parsed. */
export function formatDate(iso: string): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return iso;
  return new Date(time).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Trim a description to a sentence-ish length for titles and previews. */
export function excerpt(text: string, max = 150): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 60 ? lastSpace : max).trim()}…`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * Escape for text nodes and attribute values in hand-built XML. Also strips
 * characters XML 1.0 forbids outright: descriptions are model output over
 * scraped text, and one stray control character would make a whole
 * 5,000-URL sitemap chunk or the feed unparseable.
 */
export function xmlEscape(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
