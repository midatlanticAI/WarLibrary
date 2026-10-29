import { describe, it, expect } from "vitest";
import * as nc from "@/lib/newsletter-core.cjs";
import { LOCALES } from "@/i18n/locale";

const secret = "a-long-enough-secret-for-tests";

describe("newsletter-core: tokens", () => {
  it("round-trips, lower-cases the address, and expires after 48 h", () => {
    const now = Date.parse("2026-10-29T12:00:00Z");
    const token = nc.signToken({ email: "Reader@Example.COM", lang: "fa" }, secret, now);
    expect(nc.verifyToken(token, secret, now + 1000)).toEqual({ email: "reader@example.com", lang: "fa", expires: now + nc.TOKEN_TTL_MS });
    expect(nc.verifyToken(token, secret, now + nc.TOKEN_TTL_MS + 1)).toBeNull();
  });

  it("rejects a tampered body, a tampered signature, the wrong secret and junk", () => {
    const token = nc.signToken({ email: "a@b.co", lang: "es" }, secret);
    const [body, sig] = token.split(".");
    const otherBody = Buffer.from(JSON.stringify({ e: "evil@b.co", l: "es", x: Date.now() + 1e9, n: "x" })).toString("base64url");
    expect(nc.verifyToken(`${otherBody}.${sig}`, secret)).toBeNull();
    // Flip the last signature character to one it is not already.
    const flipped = sig.slice(-1) === "A" ? "B" : "A";
    expect(nc.verifyToken(`${body}.${sig.slice(0, -1)}${flipped}`, secret)).toBeNull();
    expect(nc.verifyToken(token, "another-secret-of-decent-length")).toBeNull();
    expect(nc.verifyToken(token, undefined)).toBeNull();
    for (const junk of ["", ".", "abc", "abc.def", 42, null]) expect(nc.verifyToken(junk, secret)).toBeNull();
  });

  it("refuses a weak secret", () => {
    expect(() => nc.signToken({ email: "a@b.co", lang: "en" }, "short")).toThrow();
  });
});

describe("newsletter-core: addresses and segments", () => {
  it("validates addresses conservatively", () => {
    expect(nc.isValidEmail(" Person@Example.org ")).toBe(true);
    for (const bad of ["", "nope", "a@b", "a b@c.com", "@x.com", "a@.com", null, undefined]) expect(nc.isValidEmail(bad)).toBe(false);
  });

  it("names one segment per served language", () => {
    for (const l of LOCALES) expect(nc.segmentName(l)).toBe(`warlibrary-${l}`);
    expect(() => nc.segmentName("xx")).toThrow();
    expect(nc.LANGS).toEqual(LOCALES);
  });
});

describe("newsletter-core: rendering", () => {
  const dispatch = { kind: "daily", key: "2026-10-28", window: { label: "28 October 2026" }, stats: { events: 120, kinetic: 80, fatalities: 12, countries: 6 } };
  const text = {
    title: "Strikes across Yemen [ev:0123abcd4567]",
    lede: "Strikes hit Sanaa [ev:0123abcd4567].",
    sections: [{ heading: "Yemen", body: "Three strikes [ev:0123abcd4567].\n\nTalks <script>alert(1)</script> stalled." }],
    civilian_note: "Two civilians died [ev:0123abcd4567].",
  };

  it("renders a dispatch with citations stripped, HTML escaped and the unsubscribe placeholder", () => {
    const m = nc.renderDispatchEmail({ dispatch, text, lang: "en" });
    expect(m.subject).toBe("Strikes across Yemen — Daily dispatch, 28 October 2026");
    expect(m.html).not.toContain("[ev:");
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.html).toContain("{{{RESEND_UNSUBSCRIBE_URL}}}");
    expect(m.html).toContain("https://warlibrary.midatlantic.ai/dispatch/daily/2026-10-28");
    expect(m.html).toContain('dir="ltr"');
    expect(m.text).toContain("YEMEN");
    expect(m.text).toContain("{{{RESEND_UNSUBSCRIBE_URL}}}");
    expect(m.text).not.toContain("[ev:");
  });

  it("renders right-to-left languages with their own labels and digits", () => {
    const m = nc.renderDispatchEmail({ dispatch, text, lang: "ar" });
    expect(m.html).toContain('lang="ar" dir="rtl"');
    expect(m.subject).toContain("النشرة اليومية");
    expect(m.html).toMatch(/[٠-٩]/);
    const fa = nc.renderDispatchEmail({ dispatch, text, lang: "fa" });
    expect(fa.html).toMatch(/[۰-۹]/);
  });

  it("renders the confirmation email in every language", () => {
    for (const lang of LOCALES) {
      const m = nc.renderConfirmEmail({ lang, confirmUrl: "https://warlibrary.midatlantic.ai/api/newsletter/confirm?token=t" });
      expect(m.subject.length).toBeGreaterThan(5);
      expect(m.html).toContain("confirm?token=t");
      expect(m.text).toContain("confirm?token=t");
    }
  });
});
