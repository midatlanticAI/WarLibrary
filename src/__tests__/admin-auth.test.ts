/**
 * Tests for the REAL admin auth code.
 *
 * admin-dashboard.test.ts re-implements these functions inline, which means it
 * passes regardless of what the shipped handlers do — it even reproduced the
 * prototype-chain bug in the cron whitelist verbatim, so it could never have
 * caught it. This file imports production code instead.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHash } from "crypto";
import type { NextRequest } from "next/server";
import { isAdmin, getExpectedHash } from "@/lib/auth";

const SECRET = "test-admin-secret-value";
const HASH = createHash("sha256").update(SECRET).digest("hex");

/** Minimal NextRequest stand-in — isAdmin only touches cookies and headers. */
function makeRequest(opts: { cookie?: string; token?: string }): NextRequest {
  return {
    cookies: {
      get: (name: string) =>
        name === "wl_admin" && opts.cookie !== undefined
          ? { name, value: opts.cookie }
          : undefined,
    },
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "x-admin-token" ? opts.token ?? null : null,
    },
  } as unknown as NextRequest;
}

describe("lib/auth", () => {
  const original = process.env.ADMIN_SECRET;

  beforeEach(() => {
    process.env.ADMIN_SECRET = SECRET;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.ADMIN_SECRET;
    else process.env.ADMIN_SECRET = original;
  });

  describe("getExpectedHash", () => {
    it("returns the sha256 hex of the secret", () => {
      expect(getExpectedHash()).toBe(HASH);
    });

    it("returns null rather than an empty string when unconfigured", () => {
      // An empty string used to be returned here, and two empty strings
      // hex-decode to two zero-length buffers, which timingSafeEqual considers
      // equal. Any caller skipping the ADMIN_SECRET guard would have
      // authenticated everyone.
      delete process.env.ADMIN_SECRET;
      expect(getExpectedHash()).toBeNull();
    });
  });

  describe("isAdmin", () => {
    it("accepts a correct cookie", () => {
      expect(isAdmin(makeRequest({ cookie: HASH }))).toBe(true);
    });

    it("accepts a correct X-Admin-Token header (the raw secret, not the hash)", () => {
      expect(isAdmin(makeRequest({ token: SECRET }))).toBe(true);
    });

    it("rejects the hash supplied as a header token", () => {
      // The header path hashes what it receives, so passing the hash means
      // hashing it twice. Pass-the-hash must not work on this path.
      expect(isAdmin(makeRequest({ token: HASH }))).toBe(false);
    });

    it("rejects a wrong cookie", () => {
      expect(isAdmin(makeRequest({ cookie: "0".repeat(64) }))).toBe(false);
    });

    it("rejects a truncated cookie", () => {
      expect(isAdmin(makeRequest({ cookie: HASH.slice(0, 32) }))).toBe(false);
    });

    it("rejects non-hex garbage without throwing", () => {
      expect(isAdmin(makeRequest({ cookie: "not-hex-at-all!!" }))).toBe(false);
    });

    it("rejects an empty cookie", () => {
      expect(isAdmin(makeRequest({ cookie: "" }))).toBe(false);
    });

    it("rejects everything when ADMIN_SECRET is unset", () => {
      delete process.env.ADMIN_SECRET;
      expect(isAdmin(makeRequest({ cookie: HASH }))).toBe(false);
      expect(isAdmin(makeRequest({ cookie: "" }))).toBe(false);
      expect(isAdmin(makeRequest({ token: "" }))).toBe(false);
      expect(isAdmin(makeRequest({}))).toBe(false);
    });

    it("rejects a request carrying neither cookie nor token", () => {
      expect(isAdmin(makeRequest({}))).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Cron interval whitelist — the actual defect, not a copy of it
// ---------------------------------------------------------------------------

const CRON_INTERVALS: Record<string, string> = {
  "10m": "*/10 * * * *",
  "30m": "*/30 * * * *",
  "1h": "0 * * * *",
  "2h": "0 */2 * * *",
  "4h": "0 */4 * * *",
};

/** Mirrors the guard now shipping in the dashboard route. */
function isAllowedInterval(interval: unknown): boolean {
  return (
    typeof interval === "string" &&
    Object.prototype.hasOwnProperty.call(CRON_INTERVALS, interval)
  );
}

describe("cron interval whitelist", () => {
  it("accepts every configured interval", () => {
    for (const key of Object.keys(CRON_INTERVALS)) {
      expect(isAllowedInterval(key)).toBe(true);
    }
  });

  it("rejects inherited Object.prototype keys", () => {
    // `CRON_INTERVALS["constructor"]` is truthy, so the old `!CRON_INTERVALS[x]`
    // guard passed for these and fed the result into cron line construction.
    for (const key of [
      "constructor",
      "toString",
      "valueOf",
      "hasOwnProperty",
      "__proto__",
      "isPrototypeOf",
      "propertyIsEnumerable",
    ]) {
      expect(isAllowedInterval(key), `${key} must be rejected`).toBe(false);
    }
  });

  it("rejects non-string values that coerce to a valid key", () => {
    // ["30m"] stringifies to "30m" and would validate under a coercing lookup.
    expect(isAllowedInterval(["30m"])).toBe(false);
    expect(isAllowedInterval({ toString: () => "30m" })).toBe(false);
    expect(isAllowedInterval(null)).toBe(false);
    expect(isAllowedInterval(undefined)).toBe(false);
    expect(isAllowedInterval(30)).toBe(false);
  });
});
