"use client";

import { useEffect, useRef } from "react";

// Poll for new notifications every 60 seconds
// When a new notification arrives, show it via the Notifications API
export function useNotifications() {
  const lastSeenRef = useRef(Date.now());

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;

    // Only poll if notifications are enabled
    const enabled = localStorage.getItem("wl_notif_enabled");
    if (!enabled && Notification.permission !== "granted") return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/notifications?since=${lastSeenRef.current}`);
        if (!res.ok) return;
        const json = await res.json();
        if (!json.data) return;

        lastSeenRef.current = json.data.timestamp;

        // Show notification if permission granted
        if (Notification.permission === "granted") {
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
        }
      } catch {
        // Silently fail — notification polling is non-critical
      }
    };

    const interval = setInterval(poll, 60_000);
    return () => clearInterval(interval);
  }, []);
}
