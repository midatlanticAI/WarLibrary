import { describe, it, expect } from "vitest";
import { ldJson } from "@/components/seo/JsonLd";

describe("ldJson", () => {
  it("neutralises a closing script tag so the block cannot be broken out of", () => {
    const out = ldJson({ name: "</script><img src=x onerror=alert(1)>" });
    expect(out).not.toContain("</script");
    expect(out).not.toContain("<img");
  });

  it("escapes every angle bracket, not only the ones inside a script tag", () => {
    expect(ldJson({ a: "<b>" })).not.toMatch(/</);
  });

  it("round-trips to the original value, so search engines read what we wrote", () => {
    const value = { name: "War Library", note: "a < b </script>" };
    expect(JSON.parse(ldJson(value))).toEqual(value);
  });

  it("produces valid JSON for the real structured-data shapes", () => {
    const dataset = {
      "@context": "https://schema.org",
      "@type": "Dataset",
      keywords: ["conflict data", "OSINT"],
      isAccessibleForFree: true,
    };
    expect(() => JSON.parse(ldJson(dataset))).not.toThrow();
  });
});
