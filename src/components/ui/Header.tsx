"use client";

import { useCallback, useEffect, useState } from "react";

type Tab = "map" | "ask" | "donate" | "sources" | "about";

interface HeaderProps {
  lastUpdated: string | null;
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  eventCount: number;
  dayCount: number;
}

export default function Header({
  lastUpdated,
  activeTab,
  onTabChange,
  eventCount,
  dayCount,
}: HeaderProps) {
  const [pushState, setPushState] = useState<"idle" | "subscribed" | "denied" | "unsupported">("idle");

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
      setPushState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setPushState("denied");
      return;
    }
    // Check for a real push subscription, not just localStorage
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        setPushState("subscribed");
      }
    }).catch(() => {});
  }, []);

  const handleSubscribe = useCallback(async () => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setPushState("denied");
      return;
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (vapidKey) {
          const padding = "=".repeat((4 - (vapidKey.length % 4)) % 4);
          const base64 = (vapidKey + padding).replace(/-/g, "+").replace(/_/g, "/");
          const rawData = atob(base64);
          const applicationServerKey = new Uint8Array(rawData.length);
          for (let i = 0; i < rawData.length; i++) {
            applicationServerKey[i] = rawData.charCodeAt(i);
          }
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey,
          });
        }
      }

      if (sub) {
        await fetch("/api/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: sub.toJSON() }),
        });
        localStorage.setItem("wl_notif_enabled", "true");
        setPushState("subscribed");
      }
    } catch (err) {
      console.warn("Push subscription failed:", err);
    }
  }, []);

  return (
    <header className="flex h-12 flex-shrink-0 items-center justify-between border-b border-zinc-800 bg-[#0e0e0e]/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="flex items-center gap-4">
        {/* Logo */}
        <button
          onClick={() => onTabChange("map")}
          className="flex items-center gap-1.5"
        >
          <span className="text-base font-bold tracking-tight text-zinc-100">
            WAR LIBRARY
          </span>
          <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
            Live
          </span>
        </button>

        {/* Nav tabs — hidden on small mobile */}
        <nav className="hidden items-center gap-1 sm:flex">
          <NavTab
            label="Overview"
            active={activeTab === "map"}
            onClick={() => onTabChange("map")}
          />
          <NavTab
            label="Ask AI"
            active={activeTab === "ask"}
            onClick={() => onTabChange("ask")}
          />
          <NavTab
            label="Donate"
            active={activeTab === "donate"}
            onClick={() => onTabChange("donate")}
          />
          <NavTab
            label="Sources"
            active={activeTab === "sources"}
            onClick={() => onTabChange("sources")}
          />
          <NavTab
            label="About"
            active={activeTab === "about"}
            onClick={() => onTabChange("about")}
          />
        </nav>
      </div>

      <div className="flex items-center gap-3">
        {/* Subscribe button */}
        {pushState === "idle" && (
          <button
            onClick={handleSubscribe}
            className="flex shrink-0 items-center gap-1.5 rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-red-500"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            Alerts
          </button>
        )}
        {pushState === "subscribed" && (
          <span className="flex shrink-0 items-center gap-1.5 rounded-md bg-zinc-800 px-2.5 py-1 text-xs text-green-400">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            Alerts on
          </span>
        )}

        {/* Summary — hidden on mobile */}
        <span className="hidden text-xs text-zinc-600 md:inline">
          Day {dayCount} · {eventCount} events
        </span>

        {lastUpdated && (
          <span className="hidden text-xs text-zinc-600 lg:inline">
            Updated {lastUpdated}
          </span>
        )}

        {/* Live indicator */}
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
          <span className="hidden text-xs text-zinc-500 sm:inline">Tracking</span>
        </div>
      </div>
    </header>
  );
}

function NavTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-zinc-800 text-zinc-200"
          : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
      }`}
    >
      {label}
    </button>
  );
}
