"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface NotificationData {
  id: string;
  title: string;
  body: string;
  timestamp: number;
  url: string;
}

/**
 * Poll for new notifications every 30 seconds.
 * Returns the latest notification for in-app display.
 * Also shows browser push notifications if permission is granted.
 */
export function useNotifications() {
  const lastSeenRef = useRef(Date.now() - 5 * 60 * 1000); // Check last 5 minutes on load
  const [notification, setNotification] = useState<NotificationData | null>(null);

  const dismiss = useCallback(() => setNotification(null), []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Request notification permission on first visit (non-blocking)
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    const poll = async () => {
      try {
        const res = await fetch(`/api/notifications?since=${lastSeenRef.current}`);
        if (!res.ok) return;
        const json = await res.json();
        if (!json.data) return;

        lastSeenRef.current = json.data.timestamp;

        // Always show in-app notification
        setNotification(json.data);

        // Also show browser notification if permitted
        if ("Notification" in window && Notification.permission === "granted") {
          try {
            const reg = await navigator.serviceWorker?.ready;
            if (reg) {
              reg.showNotification(json.data.title, {
                body: json.data.body,
                icon: "/icons/icon-192.png",
                badge: "/icons/icon-192.png",
                tag: json.data.id,
                data: { url: json.data.url },
              } as NotificationOptions);
            } else {
              new Notification(json.data.title, {
                body: json.data.body,
                icon: "/icons/icon-192.png",
                tag: json.data.id,
              });
            }
          } catch {
            // Browser notification failed, in-app still shows
          }
        }
      } catch {
        // Silently fail — notification polling is non-critical
      }
    };

    // Poll immediately on mount, then every 30 seconds
    poll();
    const interval = setInterval(poll, 30_000);
    return () => clearInterval(interval);
  }, []);

  return { notification, dismiss };
}
