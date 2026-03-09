import { createHash, timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";

function safeEqual(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, "hex");
    const bufB = Buffer.from(b, "hex");
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export function getExpectedHash(): string {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return "";
  return createHash("sha256").update(secret).digest("hex");
}

/**
 * Check if request is from an authenticated admin.
 * Supports two methods:
 * 1. httpOnly cookie `wl_admin` (set via /api/admin login)
 * 2. X-Admin-Token header (for API/curl usage)
 */
export function isAdmin(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;

  const expected = getExpectedHash();

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
