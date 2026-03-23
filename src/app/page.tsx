"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import type { ConflictEvent } from "@/types";
import { useEvents } from "@/hooks/useEvents";
import Header from "@/components/ui/Header";
import EventPanel from "@/components/ui/EventPanel";
import TimelineSlider from "@/components/timeline/TimelineSlider";
import ContentWarning from "@/components/ui/ContentWarning";
import OverviewBanner from "@/components/ui/OverviewBanner";
import SourceFooter from "@/components/ui/SourceFooter";
import SourcesPage from "@/components/ui/SourcesPage";
import AboutPage from "@/components/ui/AboutPage";
import DonationPanel from "@/components/ui/DonationPanel";
import AskPanel from "@/components/chat/AskPanel";
import MobileNav from "@/components/ui/MobileNav";
import PWAProvider from "@/components/pwa/PWAProvider";
import { useNotifications } from "@/hooks/useNotifications";

const ConflictMap = dynamic(() => import("@/components/map/ConflictMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#0a0a0a]">
      <div className="text-sm text-zinc-600">Loading map...</div>
    </div>
  ),
});

const CONFLICT_START = "2026-02-28";

type Tab = "map" | "ask" | "donate" | "sources" | "about";
type MobileTab = "map" | "feed" | "ask" | "donate" | "sources" | "about";

function toTab(t: MobileTab): Tab {
  return t === "feed" ? "map" : t;
}

export default function Home() {
  const { notification, dismiss: dismissNotif } = useNotifications();
  const { events, loading, error, lastUpdated } = useEvents();
  const [selectedEvent, setSelectedEvent] = useState<ConflictEvent | null>(
    null
  );
  const [showApp, setShowApp] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("map");
  const [mobileTab, setMobileTab] = useState<MobileTab>("map");
  const [panelOpen, setPanelOpen] = useState(false);
  const [dateRange, setDateRange] = useState(() => {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 86400000);
    return {
      start: oneDayAgo.toISOString(),
      end: now.toISOString(),
    };
  });

  const daysOfConflict = Math.ceil(
    (Date.now() - new Date(CONFLICT_START).getTime()) / 86400000
  );

  // If no events in default 24h window, expand to show all
  const [hasExpandedFallback, setHasExpandedFallback] = useState(false);
  useEffect(() => {
    if (hasExpandedFallback || events.length === 0) return;
    const startTs = new Date(dateRange.start).getTime();
    const endTs = new Date(dateRange.end).getTime();
    const inRange = events.filter((e) => {
      const t = new Date(e.date).getTime();
      return t >= startTs && t <= endTs;
    });
    if (inRange.length === 0) {
      setDateRange({ start: "2026-02-28T00:00:00Z", end: new Date().toISOString() });
      setHasExpandedFallback(true);
    }
  }, [events, dateRange, hasExpandedFallback]);

  // Privacy-respecting analytics — fire-and-forget page view tracking
  useEffect(() => {
    if (!showApp) return;
    fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: activeTab }),
    }).catch(() => {});
  }, [activeTab, showApp]);

  function navigate(tab: Tab) {
    setActiveTab(tab);
    setMobileTab(tab === "map" ? "map" : tab);
  }

  function navigateMobile(tab: MobileTab) {
    setMobileTab(tab);
    setActiveTab(toTab(tab));
  }

  // Initial loading state while events are fetched from the API
  if (loading && events.length === 0) {
    return (
      <div className="flex h-dvh w-screen items-center justify-center bg-[#0a0a0a]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-amber-500" />
          <p className="text-sm text-zinc-500">Loading events...</p>
          {error && (
            <p className="max-w-xs text-center text-xs text-red-400">{error}</p>
          )}
        </div>
      </div>
    );
  }

  // Notification banner — scrolling ticker with clickable headlines
  const headlines: { text: string; url: string | null }[] = notification
    ? notification.body
        .split("- [")
        .filter(Boolean)
        .map((item) => {
          // Extract source URL if appended with ||| delimiter
          const pipeIdx = item.indexOf("|||");
          const url = pipeIdx !== -1 ? item.slice(pipeIdx + 3).trim() : null;
          const text = (pipeIdx !== -1 ? item.slice(0, pipeIdx) : item)
            .replace(/^\[/, "")
            .replace(/\]/, " —")
            .trim();
          return { text, url };
        })
        .filter((item) => /[.!?)"'\d]$/.test(item.text))
    : [];

  const notifBanner = notification ? (
    <div className="relative z-40 flex items-center bg-amber-600/90 text-sm text-white backdrop-blur-sm">
      <span className="shrink-0 bg-red-700 px-3 py-2 text-xs font-bold uppercase tracking-wider">
        Breaking
      </span>
      <div className="flex-1 min-w-0 overflow-hidden py-2">
        <div className="ticker-track hover:[animation-play-state:paused]">
          {headlines.map((item, i) =>
            item.url ? (
              <a
                key={i}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block whitespace-nowrap px-8 hover:underline"
              >
                {item.text}
              </a>
            ) : (
              <span key={i} className="inline-block whitespace-nowrap px-8">
                {item.text}
              </span>
            )
          )}
          {headlines.map((item, i) =>
            item.url ? (
              <a
                key={`dup-${i}`}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block whitespace-nowrap px-8 hover:underline"
                aria-hidden="true"
              >
                {item.text}
              </a>
            ) : (
              <span key={`dup-${i}`} className="inline-block whitespace-nowrap px-8" aria-hidden="true">
                {item.text}
              </span>
            )
          )}
        </div>
      </div>
      <button
        onClick={dismissNotif}
        className="shrink-0 px-3 py-2 text-xs hover:bg-white/20"
        aria-label="Dismiss notification"
      >
        ✕
      </button>
    </div>
  ) : null;

  // Landing / briefing screen
  if (!showApp) {
    return (
      <>
        {notifBanner}
        <ContentWarning events={events} onDismiss={() => setShowApp(true)} />
      </>
    );
  }

  // Full-page views
  if (activeTab === "sources") {
    return (
      <div className="flex h-dvh flex-col">
        <Header lastUpdated={lastUpdated} activeTab="sources" onTabChange={navigate} eventCount={events.length} dayCount={daysOfConflict} />
        {notifBanner}
        <SourcesPage onBack={() => navigate("map")} />
        <MobileNav active="sources" onChange={navigateMobile} />
      </div>
    );
  }

  if (activeTab === "about") {
    return (
      <div className="flex h-dvh flex-col">
        <Header lastUpdated={lastUpdated} activeTab="about" onTabChange={navigate} eventCount={events.length} dayCount={daysOfConflict} />
        {notifBanner}
        <AboutPage onBack={() => navigate("map")} />
        <MobileNav active="about" onChange={navigateMobile} />
      </div>
    );
  }

  if (activeTab === "ask") {
    return (
      <div className="flex h-dvh flex-col">
        <Header lastUpdated={lastUpdated} activeTab="ask" onTabChange={navigate} eventCount={events.length} dayCount={daysOfConflict} />
        {notifBanner}
        <AskPanel events={events} onBack={() => navigate("map")} />
        <MobileNav active="ask" onChange={navigateMobile} />
      </div>
    );
  }

  if (activeTab === "donate") {
    return (
      <div className="flex h-dvh flex-col">
        <Header lastUpdated={lastUpdated} activeTab="donate" onTabChange={navigate} eventCount={events.length} dayCount={daysOfConflict} />
        {notifBanner}
        <DonationPanel onBack={() => navigate("map")} />
        <MobileNav active="donate" onChange={navigateMobile} />
      </div>
    );
  }

  // Main map view
  const showMobileFeed = mobileTab === "feed";

  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden">
      <Header lastUpdated={lastUpdated} activeTab="map" onTabChange={navigate} eventCount={events.length} dayCount={daysOfConflict} />
      {notifBanner}

      <OverviewBanner events={events} />

      <div className="relative flex flex-1 overflow-hidden">
        <div className={`flex-1 ${showMobileFeed ? "hidden sm:block" : ""}`}>
          <ConflictMap
            events={events}
            selectedEvent={selectedEvent}
            onSelectEvent={setSelectedEvent}
            dateRange={dateRange}
          />

          {/* Full timeline on desktop, compact filter bar on mobile */}
          <div className="absolute bottom-0 left-0 right-0 p-2 sm:p-3 sm:pb-3 md:right-[380px]">
            <TimelineSlider
              events={events}
              dateRange={dateRange}
              onChange={setDateRange}
            />
          </div>
        </div>

        <div
          className={`${
            showMobileFeed
              ? "flex w-full flex-col"
              : "hidden md:flex md:w-[380px] md:flex-col"
          }`}
        >
          <EventPanel
            events={events}
            selectedEvent={selectedEvent}
            onSelectEvent={(e) => {
              setSelectedEvent(e);
              if (e) setMobileTab("map");
            }}
            isOpen={true}
            onToggle={() => setPanelOpen(!panelOpen)}
            onBack={() => setMobileTab("map")}
          />
        </div>
      </div>

      <div className="hidden sm:block">
        <SourceFooter
          lastUpdated={lastUpdated}
          onSourcesClick={() => navigate("sources")}
          onAboutClick={() => navigate("about")}
        />
      </div>

      <MobileNav active={mobileTab} onChange={navigateMobile} />

      {loading && (
        <div className="absolute left-1/2 top-14 z-30 -translate-x-1/2 rounded-full bg-black/80 px-4 py-1.5 text-xs text-zinc-400 backdrop-blur-sm">
          Updating...
        </div>
      )}

      <PWAProvider />
    </div>
  );
}
