/**
 * Tests for admin dashboard validation logic.
 *
 * We re-implement the pure functions (auth check, cron validation,
 * pipeline history tracking, file reading) inline so we can test them
 * without importing Next.js route handlers.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHash } from "crypto";

// ---------------------------------------------------------------------------
// Re-implemented auth logic (mirrors src/app/api/admin/dashboard/route.ts)
// ---------------------------------------------------------------------------

function isAdmin(cookie: string | undefined, secret: string | undefined): boolean {
  if (!cookie || !secret) return false;
  const expectedHash = createHash("sha256").update(secret).digest("hex");
  return cookie === expectedHash;
}

function verify(input: string, expected: string | undefined): boolean {
  if (!expected || !input) return false;
  try {
    const a = createHash("sha256").update(expected).digest();
    const b = createHash("sha256").update(input).digest();
    // timingSafeEqual equivalent for test — just compare buffers
    return a.equals(b);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Re-implemented cron interval validation
// ---------------------------------------------------------------------------

const CRON_INTERVALS: Record<string, string> = {
  "10m": "*/10 * * * *",
  "30m": "*/30 * * * *",
  "1h": "0 * * * *",
  "2h": "0 */2 * * *",
  "4h": "0 */4 * * *",
};

function validateCronInterval(interval: string | undefined): {
  valid: boolean;
  expression?: string;
  error?: string;
} {
  if (!interval || !CRON_INTERVALS[interval]) {
    return {
      valid: false,
      error: `Invalid interval. Must be one of: ${Object.keys(CRON_INTERVALS).join(", ")}`,
    };
  }
  return { valid: true, expression: CRON_INTERVALS[interval] };
}

// ---------------------------------------------------------------------------
// Re-implemented pipeline stats reading logic
// ---------------------------------------------------------------------------

function readJsonFile<T = unknown>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Re-implemented pipeline history append logic
// (mirrors scripts/update-events.js appendPipelineHistory)
// ---------------------------------------------------------------------------

interface PipelineStats {
  last_run: string;
  articles_fetched: number;
  events_extracted: number;
  status: string;
  [key: string]: unknown;
}

function appendPipelineHistory(
  existingHistory: unknown,
  stats: PipelineStats,
  maxEntries = 100,
): PipelineStats[] {
  let history: PipelineStats[] = [];
  if (Array.isArray(existingHistory)) {
    history = existingHistory;
  }
  history.push(stats);
  if (history.length > maxEntries) {
    history = history.slice(-maxEntries);
  }
  return history;
}

// ---------------------------------------------------------------------------
// Re-implemented article cache size logic
// ---------------------------------------------------------------------------

function getArticleCacheSize(cacheRaw: unknown): number {
  if (Array.isArray(cacheRaw)) return cacheRaw.length;
  if (cacheRaw && typeof cacheRaw === "object") return Object.keys(cacheRaw).length;
  return 0;
}

// ===========================================================================
// TESTS
// ===========================================================================

describe("Dashboard auth (isAdmin)", () => {
  const SECRET = "my-super-secret";
  const VALID_HASH = createHash("sha256").update(SECRET).digest("hex");

  it("returns false when cookie is undefined", () => {
    expect(isAdmin(undefined, SECRET)).toBe(false);
  });

  it("returns false when secret is undefined", () => {
    expect(isAdmin(VALID_HASH, undefined)).toBe(false);
  });

  it("returns false when both are undefined", () => {
    expect(isAdmin(undefined, undefined)).toBe(false);
  });

  it("returns false when cookie does not match secret hash", () => {
    expect(isAdmin("wrong-hash-value", SECRET)).toBe(false);
  });

  it("returns true when cookie matches SHA-256 hash of secret", () => {
    expect(isAdmin(VALID_HASH, SECRET)).toBe(true);
  });

  it("returns false when cookie is empty string", () => {
    expect(isAdmin("", SECRET)).toBe(false);
  });

  it("returns false when secret is empty string", () => {
    expect(isAdmin(VALID_HASH, "")).toBe(false);
  });
});

describe("Admin POST auth (verify)", () => {
  const SECRET = "admin-password-123";

  it("returns false when input is empty", () => {
    expect(verify("", SECRET)).toBe(false);
  });

  it("returns false when expected is undefined", () => {
    expect(verify("something", undefined)).toBe(false);
  });

  it("returns false when input does not match expected", () => {
    expect(verify("wrong-password", SECRET)).toBe(false);
  });

  it("returns true when input matches expected", () => {
    expect(verify(SECRET, SECRET)).toBe(true);
  });

  it("is case-sensitive", () => {
    expect(verify("Admin-Password-123", SECRET)).toBe(false);
  });
});

describe("Pipeline stats file reading", () => {
  it("parses valid pipeline-stats JSON", () => {
    const raw = JSON.stringify({
      last_run: "2026-03-09T12:00:00Z",
      articles_fetched: 100,
      events_extracted: 5,
      status: "SUCCESS",
    });
    const result = readJsonFile<PipelineStats>(raw);
    expect(result).not.toBeNull();
    expect(result!.last_run).toBe("2026-03-09T12:00:00Z");
    expect(result!.articles_fetched).toBe(100);
    expect(result!.status).toBe("SUCCESS");
  });

  it("returns null for invalid JSON", () => {
    expect(readJsonFile("not valid json {{{")).toBeNull();
  });

  it("returns null for null input (file not found)", () => {
    expect(readJsonFile(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(readJsonFile("")).toBeNull();
  });

  it("handles JSON with extra fields gracefully", () => {
    const raw = JSON.stringify({
      last_run: "2026-03-09T12:00:00Z",
      articles_fetched: 50,
      events_extracted: 2,
      status: "NO_NEW_EVENTS",
      unexpected_field: "hello",
    });
    const result = readJsonFile<PipelineStats>(raw);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("NO_NEW_EVENTS");
  });
});

describe("Pipeline history tracking (appendPipelineHistory)", () => {
  const makeStats = (overrides: Partial<PipelineStats> = {}): PipelineStats => ({
    last_run: "2026-03-09T12:00:00Z",
    articles_fetched: 100,
    events_extracted: 5,
    status: "SUCCESS",
    ...overrides,
  });

  it("appends to an empty history", () => {
    const stats = makeStats();
    const result = appendPipelineHistory([], stats);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(stats);
  });

  it("appends to existing history", () => {
    const existing = [makeStats({ last_run: "2026-03-08T12:00:00Z" })];
    const newStats = makeStats({ last_run: "2026-03-09T12:00:00Z" });
    const result = appendPipelineHistory(existing, newStats);
    expect(result).toHaveLength(2);
    expect(result[1].last_run).toBe("2026-03-09T12:00:00Z");
  });

  it("handles non-array existing history (falls back to empty)", () => {
    const result = appendPipelineHistory("not-an-array", makeStats());
    expect(result).toHaveLength(1);
  });

  it("handles null existing history", () => {
    const result = appendPipelineHistory(null, makeStats());
    expect(result).toHaveLength(1);
  });

  it("caps history at maxEntries (default 100)", () => {
    const existing: PipelineStats[] = [];
    for (let i = 0; i < 100; i++) {
      existing.push(makeStats({ last_run: `2026-03-01T${String(i).padStart(2, "0")}:00:00Z` }));
    }
    expect(existing).toHaveLength(100);

    const newStats = makeStats({ last_run: "2026-03-09T23:00:00Z" });
    const result = appendPipelineHistory(existing, newStats);
    expect(result).toHaveLength(100);
    // The first entry should have been dropped
    expect(result[0].last_run).toBe("2026-03-01T01:00:00Z");
    // The last entry should be the new one
    expect(result[99].last_run).toBe("2026-03-09T23:00:00Z");
  });

  it("respects custom maxEntries", () => {
    const existing = [
      makeStats({ last_run: "2026-03-01T00:00:00Z" }),
      makeStats({ last_run: "2026-03-02T00:00:00Z" }),
      makeStats({ last_run: "2026-03-03T00:00:00Z" }),
    ];
    const result = appendPipelineHistory(existing, makeStats(), 3);
    expect(result).toHaveLength(3);
    // First entry dropped, new one appended
    expect(result[0].last_run).toBe("2026-03-02T00:00:00Z");
  });
});

describe("Article URL cache clearing", () => {
  it("counts array cache entries", () => {
    const cache = ["https://example.com/1", "https://example.com/2"];
    expect(getArticleCacheSize(cache)).toBe(2);
  });

  it("counts object cache entries by keys", () => {
    const cache = { url1: true, url2: true, url3: true };
    expect(getArticleCacheSize(cache)).toBe(3);
  });

  it("returns 0 for empty array", () => {
    expect(getArticleCacheSize([])).toBe(0);
  });

  it("returns 0 for empty object", () => {
    expect(getArticleCacheSize({})).toBe(0);
  });

  it("returns 0 for null", () => {
    expect(getArticleCacheSize(null)).toBe(0);
  });

  it("returns 0 for non-object types", () => {
    expect(getArticleCacheSize(undefined)).toBe(0);
    expect(getArticleCacheSize(42)).toBe(0);
    expect(getArticleCacheSize("string")).toBe(0);
  });
});

describe("Cron interval validation", () => {
  it("accepts valid interval '10m'", () => {
    const result = validateCronInterval("10m");
    expect(result.valid).toBe(true);
    expect(result.expression).toBe("*/10 * * * *");
  });

  it("accepts valid interval '30m'", () => {
    const result = validateCronInterval("30m");
    expect(result.valid).toBe(true);
    expect(result.expression).toBe("*/30 * * * *");
  });

  it("accepts valid interval '1h'", () => {
    const result = validateCronInterval("1h");
    expect(result.valid).toBe(true);
    expect(result.expression).toBe("0 * * * *");
  });

  it("accepts valid interval '2h'", () => {
    const result = validateCronInterval("2h");
    expect(result.valid).toBe(true);
    expect(result.expression).toBe("0 */2 * * *");
  });

  it("accepts valid interval '4h'", () => {
    const result = validateCronInterval("4h");
    expect(result.valid).toBe(true);
    expect(result.expression).toBe("0 */4 * * *");
  });

  it("rejects invalid interval '5m'", () => {
    const result = validateCronInterval("5m");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid interval");
  });

  it("rejects invalid interval '12h'", () => {
    const result = validateCronInterval("12h");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid interval");
  });

  it("rejects undefined interval", () => {
    const result = validateCronInterval(undefined);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid interval");
  });

  it("rejects empty string interval", () => {
    const result = validateCronInterval("");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid interval");
  });

  it("rejects arbitrary cron expression (only named intervals allowed)", () => {
    const result = validateCronInterval("*/5 * * * *");
    expect(result.valid).toBe(false);
  });

  it("error message lists all valid intervals", () => {
    const result = validateCronInterval("invalid");
    expect(result.error).toContain("10m");
    expect(result.error).toContain("30m");
    expect(result.error).toContain("1h");
    expect(result.error).toContain("2h");
    expect(result.error).toContain("4h");
  });
});
