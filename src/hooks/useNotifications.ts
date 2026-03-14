"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface NotificationData {
  id: string;
  title: string;
  body: string;
  timestamp: number;
  url: string;
}

function getLastSeen(): number {
  if (typeof window === "undefined") return Date.now();
  const stored = localStorage.getItem("wl_notif_seen");
  return stored ? parseInt(stored, 10) : 0;
}

/**
 * Poll for new notifications every 30 seconds.
 * Uses localStorage to track dismissed notifications so they persist across reloads.
 */
export function useNotifications() {
  const lastSeenRef = useRef(0);
  const [notification, setNotification] = useState<NotificationData | null>(null);

  const dismiss = useCallback(() => {
    setNotification(null);
    if (typeof window !== "undefined") {
      const now = Date.now();
      localStorage.setItem("wl_notif_seen", now.toString());
      lastSeenRef.current = now;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    lastSeenRef.current = getLastSeen();

    const poll = async () => {
      try {
        const res = await fetch(`/api/notifications?since=${lastSeenRef.current}`);
        if (!res.ok) return;
        const json = await res.json();
        if (!json.data) return;

        // Show in-app banner (push notifications are handled server-side)
        setNotification(json.data);
      } catch {
        // Silently fail — polling is non-critical
      }
    };

    poll();
    const interval = setInterval(poll, 30_000);
    return () => clearInterval(interval);
  }, []);

  return { notification, dismiss };
}
