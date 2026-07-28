import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getLatestNotification, publishNotification } from "@/lib/notifications";

// GET — clients poll for latest notification
export async function GET(req: NextRequest) {
  const since = req.nextUrl.searchParams.get("since");
  const parsed = since ? parseInt(since, 10) : 0;
  const sinceTs = Number.isFinite(parsed) ? parsed : 0;

  const latest = getLatestNotification();
  if (!latest || latest.timestamp <= sinceTs) {
    return NextResponse.json({ data: null });
  }

  return NextResponse.json({ data: latest });
}

// POST — admin pushes a new notification
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Every other route in the app wraps this; a malformed body from an
  // authenticated-but-sloppy caller previously threw inside the handler and
  // surfaced as an opaque 500.
  let body: { title?: unknown; body?: unknown; url?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { notification, push } = await publishNotification(body);

  return NextResponse.json({ data: notification, push });
}
