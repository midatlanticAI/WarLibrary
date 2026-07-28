import { createHash, timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";

function safeEqual(a: string, b: string): boolean {
  // Two empty strings hex-decode to two zero-length buffers, and
  // timingSafeEqual considers those equal. isAdmin() guards against an unset
  // ADMIN_SECRET before reaching here, but getExpectedHash is exported and the
  // next caller that skips that guard would otherwise authenticate everyone.
  if (!a || !b) return false;
  try {
    const bufA = Buffer.from(a, "hex");
    const bufB = Buffer.from(b, "hex");
    if (bufA.length === 0 || bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/** The expected cookie value, or null when ADMIN_SECRET is not configured. */
export function getExpectedHash(): string | null {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return null;
  return createHash("sha256").update(secret).digest("hex");
}

/**
 * Check if request is from an authenticated admin.
 * Supports two methods:
 * 1. httpOnly cookie `wl_admin` (set via /api/admin login)
 * 2. X-Admin-Token header (for API/curl usage)
 */
export function isAdmin(req: NextRequest): boolean {
  const expected = getExpectedHash();
  if (!expected) return false;

  // Method 1: httpOnly cookie
  const cookie = req.cookies.get("wl_admin")?.value;
  if (cookie && safeEqual(cookie, expected)) return true;

  // Method 2: X-Admin-Token header
  const token = req.headers.get("x-admin-token");
  if (token) {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    return safeEqual(tokenHash, expected);
  }

  return false;
}
