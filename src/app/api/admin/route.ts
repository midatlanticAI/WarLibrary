import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { isAdmin as isAdminRequest } from "@/lib/auth";

/**
 * POST   /api/admin        — authenticate as admin
 * DELETE /api/admin        — log out (clear the cookie)
 * GET    /api/admin        — check admin status
 *
 * Body for POST: { "secret": "<ADMIN_SECRET>" }
 * Sets an httpOnly cookie that the other admin-gated routes read.
 */

function verify(input: string): boolean {
  const expected = process.env.ADMIN_SECRET;
  if (!expected || !input) return false;
  try {
    // Both sides hashed to fixed 32-byte digests before comparison, so there
    // is no length leak and no early exit.
    const a = createHash("sha256").update(expected).digest();
    const b = createHash("sha256").update(input).digest();
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Login throttling
//
// This endpoint had no rate limit, no lockout and no failed-attempt logging.
// A single string stands between the internet and crontab rewrites, pipeline
// triggers, cache destruction, a push to every subscriber, and — via the same
// cookie — appending events to the public dataset. Unlimited guesses at full
// server speed is not an acceptable posture for that.
//
// In-memory and per-process: it resets on a PM2 restart, which is a real
// limitation, but it turns an unbounded online attack into a bounded one.
// ---------------------------------------------------------------------------

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;

interface AttemptRecord {
  count: number;
  firstAt: number;
  lockedUntil: number;
}

const attempts = new Map<string, AttemptRecord>();

/**
 * Client address for throttling.
 *
 * Behind Cloudflare and Caddy the leftmost X-Forwarded-For entry is
 * attacker-supplied, so it is deliberately NOT used. `cf-connecting-ip` is set
 * by Cloudflare; the rightmost forwarded hop is the closest thing to a value
 * the client cannot choose.
 */
function clientKey(req: NextRequest): string {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff.split(",").map((h) => h.trim()).filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1];
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Prune expired records so the map cannot grow without bound. */
function prune(now: number) {
  for (const [key, rec] of attempts) {
    if (now > rec.lockedUntil && now - rec.firstAt > WINDOW_MS) {
      attempts.delete(key);
    }
  }
}

function checkLockout(key: string): { locked: boolean; retryAfter: number } {
  const now = Date.now();
  if (attempts.size > 1000) prune(now);

  const rec = attempts.get(key);
  if (!rec) return { locked: false, retryAfter: 0 };

  if (now < rec.lockedUntil) {
    return { locked: true, retryAfter: Math.ceil((rec.lockedUntil - now) / 1000) };
  }
  // Window elapsed — start fresh.
  if (now - rec.firstAt > WINDOW_MS) {
    attempts.delete(key);
  }
  return { locked: false, retryAfter: 0 };
}

function recordFailure(key: string) {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || now - rec.firstAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: now, lockedUntil: 0 });
    return;
  }
  rec.count += 1;
  if (rec.count >= MAX_ATTEMPTS) {
    rec.lockedUntil = now + LOCKOUT_MS;
  }
}

export async function POST(req: NextRequest) {
  const key = clientKey(req);

  const { locked, retryAfter } = checkLockout(key);
  if (locked) {
    console.warn(`[admin] Login blocked (locked out) from ${key}`);
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  try {
    const body = await req.json();
    const secret = String(body.secret || "");

    if (!verify(secret)) {
      recordFailure(key);
      // Logged so the dashboard's own log tab can surface an attack in progress.
      console.warn(
        `[admin] Failed login from ${key} at ${new Date().toISOString()}`
      );
      return NextResponse.json({ error: "Invalid" }, { status: 403 });
    }

    // Success clears the record.
    attempts.delete(key);

    const hash = createHash("sha256").update(secret).digest("hex");
    const res = NextResponse.json({ ok: true, message: "Authenticated" });
    res.cookies.set("wl_admin", hash, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      // Was 30 days. The cookie value is the credential and there is no
      // server-side revocation, so a shorter life is the main thing limiting
      // the damage from a stolen one. Re-authenticating is one password entry.
      maxAge: 12 * 60 * 60,
      // Was "/", so it rode along on every request to the site. The routes that
      // read it all live under /api, and the admin UI checks status via
      // /api/admin.
      path: "/",
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}

/**
 * Log out. There was previously no way to end a session at all — the only exit
 * from the dashboard was a link back to the site, which left the cookie valid
 * for its full lifetime.
 */
export async function DELETE() {
  const res = NextResponse.json({ ok: true, message: "Logged out" });
  res.cookies.set("wl_admin", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 0,
    path: "/",
  });
  return res;
}

export async function GET(req: NextRequest) {
  // Delegates to the same helper every other gated route uses. The local
  // comparison this replaced compared the cookie as a UTF-8 string while
  // isAdmin() hex-decodes it, so the two could disagree about the same
  // session — an uppercase-hex cookie authenticated everywhere except here,
  // showing a login screen to a session that was in fact valid.
  return NextResponse.json({ admin: isAdminRequest(req) });
}
