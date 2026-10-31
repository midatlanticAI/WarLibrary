import { describe, it, expect } from "vitest";
import * as tc from "@/lib/translate-core.cjs";
import { CONTENT_LOCALES } from "@/i18n/locale";

describe("translate-core: languages", () => {
  it("translates into exactly the site's non-English locales", () => {
    expect(Object.keys(tc.LANGUAGES).sort()).toEqual([...CONTENT_LOCALES].sort());
    for (const lang of CONTENT_LOCALES) expect(tc.systemPrompt(lang)).toContain(tc.LANGUAGES[lang]);
  });
});

describe("translate-core: digits and numbers", () => {
  it("normalises Arabic-Indic and Persian digits", () => {
    expect(tc.normalizeDigits("٢٠٢٦ و ۱۲ و 7")).toBe("2026 و 12 و 7");
  });

  it("reads thousands separators of any convention as one number", () => {
    expect(tc.numberMultiset("1,444 killed and 18,551 injured")).toEqual(["1444", "18551"]);
    expect(tc.numberMultiset("1.444 morts et 18 551 blessés")).toEqual(["1444", "18551"]);
    expect(tc.numberMultiset("١٬٤٤٤ قتيلًا و١٨٬٥٥١ جريحًا")).toEqual(["1444", "18551"]);
    expect(tc.numberMultiset("۱٬۴۴۴ کشته و ۱۸٬۵۵۱ زخمی")).toEqual(["1444", "18551"]);
  });

  it("ignores the hex inside citation tokens", () => {
    expect(tc.numberMultiset("Twelve killed [ev:0123abcd4567].")).toEqual([]);
    expect(tc.numberMultiset("12 killed [ev:0123abcd4567].")).toEqual(["12"]);
  });
});

describe("translate-core: checkTranslation", () => {
  const src = "An Israeli airstrike on Bushehr killed 12 people on 28 March, Iranian state media said.";

  it("accepts a faithful translation", () => {
    expect(tc.checkTranslation(src, "حمله هوایی اسرائیل به بوشهر در ۲۸ مارس ۱۲ نفر را کشت، رسانه‌های دولتی ایران گفتند.")).toBeNull();
  });

  it("rejects a changed, added or dropped figure", () => {
    expect(tc.checkTranslation(src, "Une frappe sur Bushehr a tué 13 personnes le 28 mars, selon les médias d'État iraniens.")).toBe("numbers_differ");
    expect(tc.checkTranslation(src, "Une frappe sur Bushehr a tué 12 personnes le 28 mars, selon 3 médias d'État.")).toBe("numbers_differ");
    expect(tc.checkTranslation(src, "Une frappe sur Bushehr a tué des gens le 28 mars, selon les médias d'État iraniens.")).toBe("numbers_differ");
  });

  it("rejects empty, untranslated, absurdly long or short, and HTML output", () => {
    expect(tc.checkTranslation(src, "")).toBe("empty");
    expect(tc.checkTranslation(src, src)).toBe("untranslated");
    expect(tc.checkTranslation(src, "12 28.")).toMatch(/^length_ratio/);
    expect(tc.checkTranslation(src, `<p>${"x".repeat(400)} 12 28</p>`)).toMatch(/^length_ratio|^html/);
    expect(tc.checkTranslation(src, "Frappe <b>12</b> le 28 mars, Bushehr, selon les médias d'État iraniens, disent-ils encore.")).toBe("html");
  });

  it("keeps short identical strings (proper nouns) and empty sources", () => {
    expect(tc.checkTranslation("Yemen", "Yemen")).toBeNull();
    expect(tc.checkTranslation("", "")).toBeNull();
    expect(tc.checkTranslation("", "something")).toBe("source_empty");
  });

  it("requires the same citations when asked", () => {
    const s = "Strikes hit Sanaa [ev:0123abcd4567]. Two died [ev:89abcdef0123].";
    expect(tc.checkTranslation(s, "Des frappes ont touché Sanaa [ev:0123abcd4567]. Deux morts [ev:89abcdef0123].", { citations: true })).toBeNull();
    expect(tc.checkTranslation(s, "Des frappes ont touché Sanaa [ev:0123abcd4567]. Deux morts.", { citations: true })).toBe("citations_differ");
    expect(tc.checkTranslation(s, "Des frappes ont touché Sanaa [ev:0123abcd4567]. Deux morts [ev:0123abcd4567].", { citations: true })).toBe("citations_differ");
  });
});

describe("translate-core: event batches", () => {
  const items = [
    { id: "a1", description: "Drone strike on a depot killed 3 soldiers.", civilian_impact: null },
    { id: "b2", description: "Shelling displaced 500 residents.", civilian_impact: "500 displaced; clinic damaged" },
  ];

  it("accepts good rows, rejects bad ones, and reports missing ids", () => {
    const out = {
      items: [
        { id: "a1", description: "Un drone a frappé un dépôt, tuant 3 soldats.", civilian_impact: "" },
        { id: "b2", description: "Des bombardements ont déplacé 500 habitants.", civilian_impact: "500 déplacés ; clinique endommagée" },
        { id: "zz", description: "ghost", civilian_impact: "" },
      ],
    };
    const r = tc.acceptEventBatch(items, out);
    expect(r.accepted.map((x) => x.id)).toEqual(["a1", "b2"]);
    expect(r.accepted[0].civilian_impact).toBeNull();
    expect(r.accepted[1].civilian_impact).toBe("500 déplacés ; clinique endommagée");
    expect(r.rejected).toEqual([{ id: "zz", reason: "unknown_id" }]);
  });

  it("rejects an item whose civilian impact changed a figure, and a duplicated id", () => {
    const out = {
      items: [
        { id: "b2", description: "Des bombardements ont déplacé 500 habitants.", civilian_impact: "50 déplacés" },
        { id: "a1", description: "Un drone a frappé un dépôt, tuant 3 soldats.", civilian_impact: "" },
        { id: "a1", description: "Un drone a frappé un dépôt, tuant 3 soldats.", civilian_impact: "" },
      ],
    };
    const r = tc.acceptEventBatch(items, out);
    expect(r.accepted.map((x) => x.id)).toEqual(["a1"]);
    expect(r.rejected).toEqual([
      { id: "b2", reason: "civilian_impact:numbers_differ" },
      { id: "a1", reason: "duplicate" },
    ]);
  });

  it("treats garbage output as every item missing", () => {
    const r = tc.acceptEventBatch(items, null);
    expect(r.accepted).toEqual([]);
    expect(r.rejected.map((x) => x.reason)).toEqual(["missing", "missing"]);
  });

  it("builds a prompt that carries every id", () => {
    const p = tc.eventBatchPrompt(items);
    expect(p).toContain("ID: a1");
    expect(p).toContain("ID: b2");
    expect(p).toContain("civilian_impact: (none)");
  });
});

describe("translate-core: dispatches", () => {
  const d = {
    title: "Strikes across Yemen as talks stall",
    lede: "Strikes hit Sanaa [ev:0123abcd4567]. Talks stalled [ev:89abcdef0123].",
    sections: [
      { heading: "Yemen", body: "Three strikes hit Sanaa [ev:0123abcd4567]. Two people died [ev:0123abcd4567]." },
      { heading: "Diplomacy", body: "Talks in Muscat stalled [ev:89abcdef0123]." },
    ],
    civilian_note: "Two civilians died in Sanaa [ev:0123abcd4567].",
  };
  const good = {
    title: "Frappes au Yémen alors que les pourparlers piétinent",
    lede: "Des frappes ont touché Sanaa [ev:0123abcd4567]. Les pourparlers ont piétiné [ev:89abcdef0123].",
    sections: [
      { heading: "Yémen", body: "Trois frappes ont touché Sanaa [ev:0123abcd4567]. Deux personnes sont mortes [ev:0123abcd4567]." },
      { heading: "Diplomatie", body: "Les pourparlers à Mascate ont piétiné [ev:89abcdef0123]." },
    ],
    civilian_note: "Deux civils sont morts à Sanaa [ev:0123abcd4567].",
  };

  it("accepts a complete, faithful translation", () => {
    const r = tc.acceptDispatch(d, good);
    expect(r.reasons).toEqual([]);
    expect(r.translation?.sections.length).toBe(2);
    expect(r.translation?.civilian_note).toContain("[ev:0123abcd4567]");
  });

  it("is all-or-nothing: one bad section rejects the dispatch", () => {
    const bad = { ...good, sections: [good.sections[0], { heading: "Diplomatie", body: "Les pourparlers ont piétiné." }] };
    const r = tc.acceptDispatch(d, bad);
    expect(r.translation).toBeNull();
    expect(r.reasons).toEqual(["section2.body:citations_differ"]);
  });

  it("rejects a changed section count and a missing civilian note", () => {
    expect(tc.acceptDispatch(d, { ...good, sections: [good.sections[0]] }).reasons).toContain("section_count");
    expect(tc.acceptDispatch(d, { ...good, civilian_note: "" }).reasons).toContain("civilian_note:empty");
  });

  it("a dispatch without a civilian note accepts an empty one", () => {
    const r = tc.acceptDispatch({ ...d, civilian_note: null }, { ...good, civilian_note: "" });
    expect(r.reasons).toEqual([]);
    expect(r.translation?.civilian_note).toBeNull();
  });
});

describe("translate-core: rows", () => {
  it("round-trips a row and drops malformed lines", () => {
    const line = tc.encodeRow({ id: "abc", description: "x y", civilian_impact: null, at: "2026-10-29T00:00:00Z", model: "m" });
    expect(tc.decodeRow(line)).toEqual({ id: "abc", description: "x y", civilian_impact: null, at: "2026-10-29T00:00:00Z", model: "m" });
    expect(tc.decodeRow("{not json")).toBeNull();
    expect(tc.decodeRow(JSON.stringify({ id: "a", d: "" }))).toBeNull();
    expect(tc.translationFile("/tmp/x", "fa")).toBe("/tmp/x/fa.jsonl");
    expect(() => tc.translationFile("/tmp/x", "xx" as never)).toThrow();
  });

  it("estimates cost in the expected range", () => {
    // Measured: about $0.00019 per translation, so ~$7 for 37,500 events in one language.
    expect(tc.estimateCostUsd(35_424)).toBeGreaterThan(6);
    expect(tc.estimateCostUsd(35_424)).toBeLessThan(7.5);
  });
});

describe("translate-core: review follow-ups", () => {
  it("keeps a list like 'aged 2, 3' as two numbers and still joins real thousands", () => {
    expect(tc.numberMultiset("Two children aged 2, 3 were killed")).toEqual(["2", "3"]);
    expect(tc.checkTranslation("Two children aged 2, 3 were killed in the strike on the town", "Deux enfants de 23 ans ont été tués dans la frappe sur la ville")).toBe("numbers_differ");
    expect(tc.checkTranslation("Two children aged 2, 3 were killed in the strike on the town", "Deux enfants de 2 et 3 ans ont été tués dans la frappe sur la ville")).toBeNull();
    expect(tc.numberMultiset("1 444 morts, 18 551 blessés, 2026")).toEqual(["1444", "18551", "2026"]);
    expect(tc.numberMultiset("3 killed، 4 wounded")).toEqual(["3", "4"]);
    expect(tc.numberMultiset("confidence 0.7 and ۰٫۷")).toEqual(["0", "0", "7", "7"]);
  });

  it("citations are compared case-sensitively, matching the renderer", () => {
    const s = "Strikes hit Sanaa [ev:0123abcd4567].";
    expect(tc.checkTranslation(s, "Des frappes ont touché Sanaa [ev:0123ABCD4567].", { citations: true })).toBe("citations_differ");
  });

  it("prototype keys are not languages", () => {
    for (const bad of ["constructor", "__proto__", "toString", "hasOwnProperty", "", null, 42]) {
      expect(tc.isLanguage(bad)).toBe(false);
      expect(() => tc.translationFile("/tmp/x", bad as never)).toThrow();
    }
    expect(tc.isLanguage("fa")).toBe(true);
  });
});

describe("translate-core: placeholder civilian-impact notes", () => {
  it("recognises the extraction model's placeholders and nothing else", () => {
    for (const p of ["None", "None reported", "None reported.", "None specified", "N/A", "None in this event", "None reported in the article.", "No civilian impact reported", "Not reported in source", "", null]) {
      expect(tc.isPlaceholderImpact(p)).toBe(true);
    }
    for (const real of ["3 civilians killed", "No civilian casualties reported; 2 soldiers wounded in the attack on the depot", "Hospital damaged", "Nonetheless, 40 families were displaced"]) {
      expect(tc.isPlaceholderImpact(real)).toBe(false);
    }
  });

  it("accepts an empty translation for a placeholder note and stores none", () => {
    const items = [{ id: "p1", description: "Talks resumed in Muscat.", civilian_impact: "None reported" }];
    const r = tc.acceptEventBatch(items, { items: [{ id: "p1", description: "Les pourparlers ont repris à Mascate.", civilian_impact: "" }] });
    expect(r.rejected).toEqual([]);
    expect(r.accepted[0].civilian_impact).toBeNull();
    expect(tc.eventBatchPrompt(items)).toContain("civilian_impact: (none)");
  });
});
