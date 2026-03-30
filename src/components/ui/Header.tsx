"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n, LOCALES, type Locale } from "@/i18n";

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
  const { t, locale, setLocale } = useI18n();
  const [pushState, setPushState] = useState<"idle" | "subscribed" | "denied" | "unsupported">("idle");
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);

  // Close language dropdown when clicking outside
  useEffect(() => {
    if (!langOpen) return;
    function handleClick(e: MouseEvent | TouchEvent) {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("touchstart", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("touchstart", handleClick);
    };
  }, [langOpen]);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
      setPushState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setPushState("denied");
      return;
    }
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
    <header className="flex h-12 flex-shrink-0 items-center justify-between border-b border-zinc-800 bg-[#0e0e0e]/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md" role="banner">
      <div className="flex items-center gap-4">
        {/* Logo */}
        <button
          onClick={() => onTabChange("map")}
          className="flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-zinc-600 rounded"
          aria-label={`${t("app.title")} - ${t("nav.overview")}`}
        >
          <span className="text-base font-bold tracking-tight text-zinc-100">
            {t("app.title")}
          </span>
          <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
            {t("app.live")}
          </span>
        </button>

        {/* Nav tabs — hidden on small mobile */}
        <nav className="hidden items-center gap-1 sm:flex" aria-label="Main navigation">
          <NavTab label={t("nav.overview")} active={activeTab === "map"} onClick={() => onTabChange("map")} />
          <NavTab label={t("nav.askAi")} active={activeTab === "ask"} onClick={() => onTabChange("ask")} />
          <NavTab label={t("nav.donate")} active={activeTab === "donate"} onClick={() => onTabChange("donate")} />
          <NavTab label={t("nav.sources")} active={activeTab === "sources"} onClick={() => onTabChange("sources")} />
          <NavTab label={t("nav.about")} active={activeTab === "about"} onClick={() => onTabChange("about")} />
        </nav>
      </div>

      <div className="flex items-center gap-2">
        {/* Language selector */}
        <div className="relative" ref={langRef}>
          <button
            onClick={() => setLangOpen(!langOpen)}
            className="flex items-center gap-1 rounded-md border border-zinc-700 px-2 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-600 sm:border-transparent sm:py-1 sm:text-zinc-400"
            aria-expanded={langOpen}
            aria-haspopup="listbox"
            aria-label={t("language.label")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 sm:hidden" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M2 12h20" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            {locale.toUpperCase()}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {langOpen && (
            <div
              className="absolute end-0 top-full z-50 mt-1 min-w-[140px] rounded-lg border border-zinc-800 bg-[#111] py-1 shadow-xl"
              role="listbox"
              aria-label={t("language.label")}
            >
              {LOCALES.map((l: Locale) => (
                <button
                  key={l}
                  onClick={() => { setLocale(l); setLangOpen(false); }}
                  role="option"
                  aria-selected={l === locale}
                  className={`flex w-full items-center gap-2 px-4 py-3 text-sm transition-colors sm:py-2 sm:text-xs ${
                    l === locale ? "bg-zinc-800 text-zinc-200" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                  }`}
                >
                  {t(`language.${l}`)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Subscribe button */}
        {pushState === "idle" && (
          <button
            onClick={handleSubscribe}
            className="flex shrink-0 items-center gap-1.5 rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-400"
            aria-label={t("header.alerts")}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0" aria-hidden="true">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {t("header.alerts")}
          </button>
        )}
        {pushState === "subscribed" && (
          <span className="flex shrink-0 items-center gap-1.5 rounded-md bg-zinc-800 px-2.5 py-1 text-xs text-green-400">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            {t("header.alertsOn")}
          </span>
        )}

        {/* Summary — hidden on mobile */}
        <span className="hidden text-xs text-zinc-600 md:inline">
          {t("header.day")} {dayCount} · {eventCount} {t("header.events")}
        </span>

        {lastUpdated && (
          <span className="hidden text-xs text-zinc-600 lg:inline">
            {t("header.updated")} {lastUpdated}
          </span>
        )}

        {/* Live indicator */}
        <div className="flex items-center gap-1.5" aria-label={t("app.tracking")}>
          <span className="relative flex h-2 w-2" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
          <span className="hidden text-xs text-zinc-500 sm:inline">{t("app.tracking")}</span>
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
      aria-current={active ? "page" : undefined}
      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-600 ${
        active
          ? "bg-zinc-800 text-zinc-200"
          : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
      }`}
    >
      {label}
    </button>
  );
}
