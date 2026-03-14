import webpush from "web-push";
import fs from "fs";
import path from "path";

const SUBS_FILE = path.join(process.cwd(), "src", "data", "push-subscriptions.json");

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

/**
 * Send a push notification to all subscribers.
 * Automatically removes expired/invalid subscriptions.
 */
export async function sendPushToAll(payload: {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}): Promise<{ sent: number; failed: number; removed: number }> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!publicKey || !privateKey) {
    console.warn("[push] VAPID keys not configured, skipping push notifications");
    return { sent: 0, failed: 0, removed: 0 };
  }

  webpush.setVapidDetails("mailto:contact@warlibrary.com", publicKey, privateKey);

  const subs = readSubs();
  if (subs.length === 0) {
    return { sent: 0, failed: 0, removed: 0 };
  }

  const message = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  const expired: string[] = [];

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          message,
          { TTL: 86400 } // 24 hour TTL
        );
        sent++;
      } catch (err: unknown) {
        failed++;
        const statusCode = (err as { statusCode?: number }).statusCode;
        // 404 or 410 = subscription expired/unsubscribed
        if (statusCode === 404 || statusCode === 410) {
          expired.push(sub.endpoint);
        }
      }
    })
  );

  // Clean up expired subscriptions
  if (expired.length > 0) {
    const cleaned = subs.filter((s) => !expired.includes(s.endpoint));
    writeSubs(cleaned);
  }

  return { sent, failed, removed: expired.length };
}
