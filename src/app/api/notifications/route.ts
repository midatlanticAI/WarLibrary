import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";

// In-memory store of latest event notification
// Clients poll this to check for new events
let latestNotification: {
  id: string;
  title: string;
  body: string;
  timestamp: number;
  url: string;
} | null = null;

// GET — clients poll for latest notification
export async function GET(req: NextRequest) {
  const since = req.nextUrl.searchParams.get("since");
  const sinceTs = since ? parseInt(since, 10) : 0;

  if (!latestNotification || latestNotification.timestamp <= sinceTs) {
    return NextResponse.json({ data: null });
  }

  return NextResponse.json({ data: latestNotification });
}

// POST — admin pushes a new notification
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const title = String(body.title || "War Library Update").slice(0, 100);
  const notifBody = String(body.body || "New conflict events reported.").slice(0, 300);

  latestNotification = {
    id: Date.now().toString(36),
    title,
    body: notifBody,
    timestamp: Date.now(),
    url: body.url || "/",
  };

  return NextResponse.json({ data: latestNotification });
}
