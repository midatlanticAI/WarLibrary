import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";

/**
 * POST /api/admin — authenticate as admin
 * Body: { "secret": "<ADMIN_SECRET>" }
 * Sets an httpOnly cookie that the chat route reads.
 *
 * GET /api/admin — check admin status
 */

function verify(input: string): boolean {
  const expected = process.env.ADMIN_SECRET;
  if (!expected || !input) return false;
  try {
    const a = createHash("sha256").update(expected).digest();
    const b = createHash("sha256").update(input).digest();
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const secret = String(body.secret || "");

    if (!verify(secret)) {
      return NextResponse.json({ error: "Invalid" }, { status: 403 });
    }

    // Set httpOnly, secure, sameSite cookie with the hash
    const hash = createHash("sha256").update(secret).digest("hex");
    const res = NextResponse.json({ ok: true, message: "Authenticated" });
    res.cookies.set("wl_admin", hash, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 30 * 86400, // 30 days
      path: "/",
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get("wl_admin")?.value;
  const secret = process.env.ADMIN_SECRET;
  if (!cookie || !secret) {
    return NextResponse.json({ admin: false });
  }
  const expectedHash = createHash("sha256").update(secret).digest("hex");
  const isAdmin = cookie === expectedHash;
  return NextResponse.json({ admin: isAdmin });
}
