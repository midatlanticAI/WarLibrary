import { readFileSync, writeFileSync, renameSync } from "fs";
import { join } from "path";
import { sendPushToAll } from "@/lib/push";

/**
 * Shared notification store.
 *
 * This lives in a module rather than inside the notifications route because
 * two call sites need it: the public `POST /api/notifications` endpoint and the
 * admin dashboard's "send notification" control.
 *
 * The dashboard used to reach it by making an HTTP request to its own process,
 * carrying the plaintext ADMIN_SECRET in an `x-admin-token` header, to a URL
 * built from `NEXT_PUBLIC_BASE_URL` — a build-time, client-visible variable.
 * That put the secret on the wire to reach a function in the same process, and
 * pointed it wherever that variable happened to say. Calling in-process removes
 * both problems.
 */

const NOTIF_FILE = join(process.cwd(), "src", "data", "notification.json");

export interface NotificationData {
  id: string;
  title: string;
  body: string;
  timestamp: number;
  url: string;
}

export interface PushResult {
  sent: number;
  failed: number;
  removed: number;
}

let latestNotification: NotificationData | null = null;

function loadFromDisk(): NotificationData | null {
  try {
    return JSON.parse(readFileSync(NOTIF_FILE, "utf-8")) as NotificationData;
  } catch {
    return null;
  }
}

function saveToDisk(data: NotificationData) {
  try {
    // tmp + rename, so a reader can never observe a half-written file and
    // treat it as absent.
    const tmp = `${NOTIF_FILE}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
    renameSync(tmp, NOTIF_FILE);
  } catch (err) {
    console.error("[notifications] Failed to persist notification:", err);
  }
}

// Restore on module load so notifications survive a restart.
latestNotification = loadFromDisk();

export function getLatestNotification(): NotificationData | null {
  return latestNotification;
}

/**
 * Normalise the click-through target.
 *
 * This value is persisted, served to every polling client, and handed to
 * `clients.openWindow()` in the service worker. It was previously stored
 * unvalidated (`body.url || "/"`), so a `javascript:` or off-site URL would be
 * fanned out to every reader. Only same-origin paths are accepted.
 */
function safeUrl(raw: unknown): string {
  if (typeof raw !== "string" || raw === "") return "/";
  // Reject anything with a scheme or protocol-relative prefix.
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("//")) return "/";
  return raw.startsWith("/") ? raw : `/${raw}`;
}

/**
 * Publish a notification: persist it and push to all subscribers.
 *
 * Push failures are logged and reported but never throw — a broadcast that
 * partly failed is still a published notification.
 */
export async function publishNotification(input: {
  title?: unknown;
  body?: unknown;
  url?: unknown;
}): Promise<{ notification: NotificationData; push: PushResult }> {
  const title = String(input.title ?? "War Library Update").slice(0, 100);
  const body = String(input.body ?? "New conflict events reported.").slice(0, 300);
  const url = safeUrl(input.url);

  const notification: NotificationData = {
    id: Date.now().toString(36),
    title,
    body,
    timestamp: Date.now(),
    url,
  };

  latestNotification = notification;
  saveToDisk(notification);

  let push: PushResult = { sent: 0, failed: 0, removed: 0 };
  try {
    push = await sendPushToAll({ title, body, url, tag: notification.id });
  } catch (err) {
    console.error("[notifications] Push send failed:", err);
  }

  return { notification, push };
}
