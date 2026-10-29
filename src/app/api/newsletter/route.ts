import { NextRequest, NextResponse } from "next/server";
import * as core from "@/lib/newsletter-core.cjs";
import * as resend from "@/lib/newsletter-resend.cjs";
import { isLocale } from "@/i18n/locale";
import { SITE_URL } from "@/lib/site";

/**
 * POST /api/newsletter  { email, lang, website? }
 *
 * Step one of double opt-in: send a confirmation email carrying a signed,
 * expiring link. Nothing is stored for a pending address; the link is the
 * only state. The confirm route (./confirm) creates the Resend contact.
 *
 * `website` is a honeypot: the form renders it hidden, humans leave it
 * empty, bots fill it. A filled honeypot gets the same success response
 * and no email, so the bot learns nothing.
 *
 * Rate limited per IP: a handful of requests an hour is plenty for a
 * person and keeps the free plan's 100 emails a day from being spent on
 * someone else's address.
 */

const WINDOW_MS = 3600_000;
const MAX_PER_WINDOW = 5;
const attempts = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    if (attempts.size > 5000) {
      for (const [k, v] of attempts) if (v.resetAt < now) attempts.delete(k);
    }
    return false;
  }
  entry.count++;
  return entry.count > MAX_PER_WINDOW;
}

/**
 * Same rule as the admin route: Cloudflare's header first, else the
 * RIGHTMOST forwarded hop, which is the one our own proxy appended. The
 * leftmost hop is whatever the client chose to send.
 */
function clientIp(req: NextRequest): string {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff.split(",").map((h) => h.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  return req.headers.get("x-real-ip") || "unknown";
}

/**
 * Process-wide fuse on confirmation mail: the free plan allows 100 emails a
 * day in total, and the daily dispatch must still go out. Resets at UTC
 * midnight.
 */
const DAILY_CONFIRMATION_CAP = 40;
let confirmationsToday = { day: "", count: 0 };
function confirmationBudgetLeft(): boolean {
  const day = new Date().toISOString().slice(0, 10);
  if (confirmationsToday.day !== day) confirmationsToday = { day, count: 0 };
  if (confirmationsToday.count >= DAILY_CONFIRMATION_CAP) return false;
  confirmationsToday.count++;
  return true;
}

function secret(): string | undefined {
  const s = process.env.NEWSLETTER_SECRET || process.env.ADMIN_SECRET;
  // signToken refuses a short secret; treat that as "not configured" here
  // rather than letting it throw into a 500 on every subscribe.
  return s && s.length >= 16 ? s : undefined;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!resend.isConfigured() || !secret()) {
    return NextResponse.json({ error: "Email subscriptions are not configured on this deployment." }, { status: 503 });
  }

  // Same-origin only: the form lives on this site.
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (rateLimited(clientIp(req))) {
    return NextResponse.json({ error: "Too many requests. Try again in an hour." }, { status: 429 });
  }

  let body: { email?: unknown; lang?: unknown; website?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = core.normalizeEmail(body.email);
  if (!core.isValidEmail(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  const lang = isLocale(typeof body.lang === "string" ? body.lang : "") ? (body.lang as string) : "en";

  // Honeypot: pretend it worked.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return NextResponse.json({ ok: true });
  }

  if (!confirmationBudgetLeft()) {
    return NextResponse.json({ error: "Too many subscription requests today. Try again tomorrow." }, { status: 429 });
  }

  const mail = core.renderConfirmEmail({
    lang,
    confirmUrl: `${SITE_URL}/api/newsletter/confirm?token=${encodeURIComponent(core.signToken({ email, lang }, secret() as string))}`,
  });
  try {
    await resend.sendConfirmation({ to: email, subject: mail.subject, html: mail.html, text: mail.text });
  } catch (err) {
    console.error("[newsletter] confirmation send failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
