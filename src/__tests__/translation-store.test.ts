import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wl-translations-"));
process.env.TRANSLATIONS_DIR = dir;

const store = await import("@/lib/translation-store");
const tc = await import("@/lib/translate-core.cjs");

const row = (id: string, d: string, c: string | null = null) =>
  tc.encodeRow({ id, description: d, civilian_impact: c, at: "2026-10-29T00:00:00Z", model: "test" });

beforeAll(() => {
  fs.writeFileSync(path.join(dir, "fa.jsonl"), [row("e1", "اول", "آسیب"), row("e2", "دوم"), "{broken", row("e1", "اول (اصلاح‌شده)")].join("\n") + "\n");
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("translation-store", () => {
  it("reads a language table; the last line for an id wins; broken lines are skipped", () => {
    store.invalidateTranslations();
    expect(store.translationCount("fa")).toBe(2);
    expect(store.getTranslation("fa", "e1")).toEqual({ description: "اول (اصلاح‌شده)", civilian_impact: null });
    expect(store.getTranslation("fa", "e2")).toEqual({ description: "دوم", civilian_impact: null });
    expect(store.getTranslation("fa", "nope")).toBeNull();
  });

  it("a language without a file is empty, not an error", () => {
    expect(store.translationCount("ur")).toBe(0);
    expect(store.translationSignature("ur")).toBe("0:0");
  });

  it("localizes an event and keeps the English", () => {
    const e = { id: "e1", description: "First", civilian_impact: "harm", country: "Iran" };
    const fa = store.localizeEvent(e, "fa");
    expect(fa.description).toBe("اول (اصلاح‌شده)");
    expect(fa.description_lang).toBe("fa");
    expect(fa.translated).toBe(true);
    expect(fa.description_en).toBe("First");
    // The latest row for e1 carries no civilian impact, so the English stays.
    expect(fa.civilian_impact).toBe("harm");
    expect(fa.civilian_impact_en).toBeUndefined();
    expect(fa.country).toBe("Iran");
  });

  it("falls back to English for a missing translation, an unknown language and English itself", () => {
    const e = { id: "e9", description: "Ninth", civilian_impact: null };
    for (const lang of ["fa", "en", "xx", null, undefined]) {
      const out = store.localizeEvent(e, lang);
      expect(out.description).toBe("Ninth");
      expect(out.description_lang).toBe("en");
      expect(out.translated).toBe(false);
      expect(out.description_en).toBeUndefined();
    }
  });

  it("localizes a list with one table load and picks up appended rows", () => {
    const list = [
      { id: "e1", description: "First", civilian_impact: null },
      { id: "e3", description: "Third", civilian_impact: "x" },
    ];
    expect(store.localizeEvents(list, "fa").map((x) => x.description_lang)).toEqual(["fa", "en"]);
    // Append, then make the file look quiet (an old mtime) so the signature
    // changes and the table reloads.
    const file = path.join(dir, "fa.jsonl");
    const before = store.translationSignature("fa");
    fs.appendFileSync(file, row("e3", "سوم", "ایکس") + "\n");
    const later = new Date(Date.now() - 120_000);
    fs.utimesSync(file, later, later);
    expect(store.translationSignature("fa")).not.toBe(before);
    const after = store.localizeEvents(list, "fa");
    expect(after[1].description).toBe("سوم");
    expect(after[1].civilian_impact).toBe("ایکس");
    expect(after[1].civilian_impact_en).toBe("x");
  });
});

describe("translation-store: signature debounce", () => {
  it("holds the last quiet signature while the file is being appended to", () => {
    store.invalidateTranslations();
    const file = path.join(dir, "fa.jsonl");
    const quiet = new Date(Date.now() - 120_000);
    fs.utimesSync(file, quiet, quiet);
    const first = store.translationSignature("fa");
    expect(first).not.toBe("0:0");
    expect(store.getTranslation("fa", "e1")).not.toBeNull(); // table loaded at the quiet signature
    // A fresh append: mtime is now, so the signature stays at the quiet value
    // and the loaded table is kept…
    fs.appendFileSync(file, row("e7", "هفتم") + "\n");
    expect(store.translationSignature("fa")).toBe(first);
    expect(store.getTranslation("fa", "e7")).toBeNull();
    // …until the file has been quiet long enough.
    const later = Date.now() + 61_000;
    expect(store.translationSignature("fa", later)).not.toBe(first);
  });

  it("a file that never goes quiet still refreshes after the hold limit", () => {
    store.invalidateTranslations();
    const file = path.join(dir, "fa.jsonl");
    const quiet = new Date(Date.now() - 120_000);
    fs.utimesSync(file, quiet, quiet);
    const t0 = Date.now();
    const first = store.translationSignature("fa", t0);
    // Simulate a backfill: the file keeps changing (mtime always "just now").
    fs.appendFileSync(file, row("e8", "هشتم") + "\n");
    const busy = new Date(t0 + 30 * 60_000);
    fs.utimesSync(file, busy, busy);
    expect(store.translationSignature("fa", t0 + 5 * 60_000)).toBe(first);
    expect(store.translationSignature("fa", t0 + 11 * 60_000)).not.toBe(first);
  });

  it("rejects prototype keys as languages", () => {
    expect(store.isContentLanguage("constructor")).toBe(false);
    expect(store.isContentLanguage("__proto__")).toBe(false);
    expect(store.localizeEvent({ id: "e1", description: "x" }, "constructor").description_lang).toBe("en");
  });
});
