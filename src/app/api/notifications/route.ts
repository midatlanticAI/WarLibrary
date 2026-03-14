import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { sendPushToAll } from "@/lib/push";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const NOTIF_FILE = join(process.cwd(), "src", "data", "notification.json");

interface NotificationData {
  id: string;
  title: string;
  body: string;
  timestamp: number;
  url: string;
}

// Load from disk on startup so notifications survive restarts
let latestNotification: NotificationData | null = null;

function loadFromDisk(): NotificationData | null {
  try {
    const raw = readFileSync(NOTIF_FILE, "utf-8");
    return JSON.parse(raw) as NotificationData;
  } catch {
    return null;
  }
}

function saveToDisk(data: NotificationData) {
  try {
    writeFileSync(NOTIF_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Failed to persist notification:", err);
  }
}

// Initialize from disk
latestNotification = loadFromDisk();

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

  saveToDisk(latestNotification);

  // Fire real push notifications to all subscribers
  let pushResult = { sent: 0, failed: 0, removed: 0 };
  try {
    pushResult = await sendPushToAll({
      title,
      body: notifBody,
      url: body.url || "/",
      tag: latestNotification.id,
    });
  } catch (err) {
    console.error("[notifications] Push send failed:", err);
  }

  return NextResponse.json({
    data: latestNotification,
    push: pushResult,
  });
}
