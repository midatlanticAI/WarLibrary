import { NextRequest, NextResponse } from "next/server";
import * as core from "@/lib/newsletter-core.cjs";
import * as resend from "@/lib/newsletter-resend.cjs";
import { LOCALE_COOKIE } from "@/i18n/locale";
import { SITE_URL } from "@/lib/site";

/**
 * GET /api/newsletter/confirm?token=…
 *
 * Step two of double opt-in. A valid, unexpired token creates (or
 * re-subscribes) the Resend contact in the language's segment and sends
 * the reader to the dispatch index with a confirmation notice, in the
 * language they subscribed from. Anything else lands on the same page
 * with an "expired" notice and no detail about why — the token is the
 * reader's, and a guessing bot gets nothing from the difference.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.NEWSLETTER_SECRET || process.env.ADMIN_SECRET;
  const token = req.nextUrl.searchParams.get("token");
  const payload = core.verifyToken(token, secret);
  // Absolute, from the site's own URL: behind Caddy `req.nextUrl.origin` is
  // the process's own `localhost:3000`, which would send every confirmed
  // subscriber to a dead page and set their cookie on the wrong host.
  const dest = new URL("/dispatch", SITE_URL);

  if (!payload || !resend.isConfigured()) {
    dest.searchParams.set("subscribe", "expired");
    return NextResponse.redirect(dest, 303);
  }

  try {
    await resend.subscribeContact(payload.email, payload.lang);
  } catch (err) {
    console.error("[newsletter] subscribe failed:", err instanceof Error ? err.message : err);
    dest.searchParams.set("subscribe", "error");
    return NextResponse.redirect(dest, 303);
  }

  dest.searchParams.set("subscribe", "ok");
  const res = NextResponse.redirect(dest, 303);
  // The reader confirmed from an email, possibly on another device: show
  // the notice in the language they subscribed in.
  res.cookies.set(LOCALE_COOKIE, payload.lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  return res;
}
