import { describe, it, expect } from "vitest";
import { COUNTRIES, FIGURES_CHECKED_ON, HEADLINE, MINAB, SHIPPING, STATUS, allSources, type Figure } from "@/lib/humanitarian-figures";
import { LOCALES } from "@/i18n/locale";

const strings = Object.fromEntries(
  await Promise.all(LOCALES.map(async (l) => [l, (await import(`@/i18n/${l}.json`)).default.donate as Record<string, string>]))
);

const allFigures: Figure[] = [...HEADLINE, ...COUNTRIES.flatMap((c) => c.figures)];
const placeholders = (s: string) => (s.match(/\{\{(\w+)\}\}/g) ?? []).map((p) => p.slice(2, -2)).sort();
const ISO = /^\d{4}-\d{2}-\d{2}$/;

describe("humanitarian figures", () => {
  it("dates every figure, never after the day it was checked", () => {
    for (const f of allFigures) {
      expect(f.asOf).toMatch(ISO);
      expect(f.asOf <= FIGURES_CHECKED_ON).toBe(true);
    }
    for (const d of [MINAB.asOf, SHIPPING.hormuz.asOf, SHIPPING.hunger.asOf, STATUS.asOf]) expect(d <= FIGURES_CHECKED_ON).toBe(true);
  });

  it("links every source over https", () => {
    for (const s of allSources()) expect(s.url).toMatch(/^https:\/\//);
  });

  it("has every label, title and note in every language, with the placeholders the code fills", () => {
    const uses: { key: string; vars: string[] }[] = [
      ...allFigures.map((f) => ({ key: f.label, vars: Object.keys(f.labelVars ?? {}) })),
      ...allFigures.filter((f) => f.detail).map((f) => ({ key: f.detail!.key, vars: Object.keys(f.detail!.vars) })),
      ...COUNTRIES.map((c) => ({ key: c.title, vars: [] })),
      ...COUNTRIES.flatMap((c) => (c.notes ?? []).map((n) => ({ key: n.key, vars: Object.keys(n.vars ?? {}) }))),
    ];
    for (const locale of LOCALES) {
      for (const { key, vars } of uses) {
        const s = strings[locale][key];
        expect(s, `${locale}.donate.${key}`).toBeTruthy();
        expect(placeholders(s), `${locale}.donate.${key}`).toEqual([...vars].sort());
      }
    }
  });

  it("states the Minab toll as the UN mission reports it", () => {
    expect(strings.en.hcMinabText).toContain("({{boys}} boys and {{girls}} girls)");
    expect(strings.en.hcMinabText).not.toMatch(/primarily schoolgirls/);
  });
});
