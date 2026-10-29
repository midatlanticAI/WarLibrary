import { describe, it, expect } from "vitest";
import { localizeDispatch } from "@/lib/dispatch-i18n";
import type { Dispatch } from "@/lib/dispatch-core.cjs";

const base = {
  title: "Title",
  lede: "Lede [ev:0123abcd4567].",
  sections: [
    { heading: "A", body: "Body A [ev:0123abcd4567].", event_ids: ["0123abcd4567"] },
    { heading: "B", body: "Body B.", event_ids: [] },
  ],
  civilian_note: "Note.",
  translations: {
    fa: { title: "عنوان", lede: "لید [ev:0123abcd4567].", sections: [{ heading: "آ", body: "متن آ [ev:0123abcd4567]." }, { heading: "ب", body: "متن ب." }], civilian_note: "یادداشت." },
    fr: { title: "Titre", lede: "Chapeau.", sections: [{ heading: "A", body: "Corps A." }], civilian_note: null },
  },
} as unknown as Dispatch;

describe("localizeDispatch", () => {
  it("returns the translation with the English event ids attached", () => {
    const fa = localizeDispatch(base, "fa");
    expect(fa.translated).toBe(true);
    expect(fa.lang).toBe("fa");
    expect(fa.title).toBe("عنوان");
    expect(fa.sections[0].event_ids).toEqual(["0123abcd4567"]);
    expect(fa.civilian_note).toBe("یادداشت.");
  });

  it("falls back to English when there is no translation, the section count differs, or English is asked for", () => {
    for (const [locale, opts] of [["en", {}], ["ur", {}], ["fr", {}], ["fa", { original: true }]] as const) {
      const out = localizeDispatch(base, locale, opts);
      expect(out.translated).toBe(false);
      expect(out.lang).toBe("en");
      expect(out.title).toBe("Title");
      expect(out.sections).toBe(base.sections);
    }
  });

  it("drops a translated civilian note when the English has none", () => {
    const d = { ...base, civilian_note: null } as Dispatch;
    expect(localizeDispatch(d, "fa").civilian_note).toBeNull();
  });
});
