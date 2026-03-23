import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

/**
 * Push subscription management.
 *
 * POST /api/push         — Subscribe (store push subscription)
 * DELETE /api/push       — Unsubscribe (remove push subscription)
 * GET /api/push          — Check subscription count (admin only)
 */

const SUBS_FILE = path.join(process.cwd(), "src", "data", "push-subscriptions.json");
const MAX_SUBSCRIPTIONS = 10_000; // Hard cap to prevent disk exhaustion

interface PushSub {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  createdAt: number;
}

function readSubs(): PushSub[] {
  try {
    if (!fs.existsSync(SUBS_FILE)) return [];
    return JSON.parse(fs.readFileSync(SUBS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function writeSubs(subs: PushSub[]) {
  fs.writeFileSync(SUBS_FILE, JSON.stringify(subs, null, 2));
}

// POST — store a new push subscription
export async function POST(req: NextRequest) {
  let body: { subscription?: PushSub };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sub = body.subscription;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return NextResponse.json(
      { error: "Invalid push subscription object" },
      { status: 400 }
    );
  }

  const subs = readSubs();

  // Deduplicate by endpoint
  const exists = subs.some((s) => s.endpoint === sub.endpoint);
  if (!exists) {
    if (subs.length >= MAX_SUBSCRIPTIONS) {
      return NextResponse.json(
        { error: "Subscription limit reached" },
        { status: 429 },
      );
    }
    subs.push({
      endpoint: sub.endpoint,
      keys: sub.keys,
      createdAt: Date.now(),
    });
    writeSubs(subs);
  }

  return NextResponse.json({
    success: true,
    total_subscribers: subs.length,
  });
}

// DELETE — remove a push subscription
export async function DELETE(req: NextRequest) {
  let body: { endpoint?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.endpoint) {
    return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  }

  const subs = readSubs();
  const filtered = subs.filter((s) => s.endpoint !== body.endpoint);
  writeSubs(filtered);

  return NextResponse.json({ success: true, removed: subs.length - filtered.length });
}

// GET — subscriber count
export async function GET() {
  const subs = readSubs();
  return NextResponse.json({ subscribers: subs.length });
}
