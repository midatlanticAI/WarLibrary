/**
 * Country naming, shared by the server store and the client.
 *
 * The rules themselves (alias table, aggregate list, list pattern and
 * `canonicalCountry`) live in country-rules.cjs so the CommonJS dispatch
 * core, which runs from cron without a bundler, applies exactly the same
 * folding when it counts countries. This module adds the slug and region
 * helpers the app needs.
 *
 * No Node imports here: HomeClient uses `slugifyCountry` in the browser.
 */
import { canonicalCountry } from "@/lib/country-rules.cjs";

export { canonicalCountry };

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
