"use client";

import { useState, useEffect, useMemo } from "react";
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
import { I18nProvider, useI18n } from "@/i18n";

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

/** A single parsed ticker headline plus its (validated) source link. */
type Headline = { text: string; url: string | null };

/** Tailwind's `md` breakpoint — the width at which the event panel is docked. */
const MD_BREAKPOINT = "(min-width: 768px)";

/** Ties the ticker landmark to its visible (and translated) "Breaking" badge. */
const TICKER_LABEL_ID = "ticker-label";

function toTab(t: MobileTab): Tab {
  return t === "feed" ? "map" : t;
}

/**
 * SSR-safe `window.matchMedia` subscription.
 *
 * Starts `false` on the server and on the very first client render so markup
 * matches, then settles on the real value in an effect. Used for the reduced
 * motion preference and for knowing whether the event panel is docked.
 */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

export default function Home() {
  return (
    <I18nProvider>
      <HomeContent />
    </I18nProvider>
  );
}

function HomeContent() {
  const { t } = useI18n();
  const { notification, dismiss: dismissNotif } = useNotifications();
  const { events, loading, error, lastUpdated } = useEvents();
  const [selectedEvent, setSelectedEvent] = useState<ConflictEvent | null>(
    null
  );
  const [showApp, setShowApp] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("map");
  const [mobileTab, setMobileTab] = useState<MobileTab>("map");
  // Explicit pause state for the breaking-news ticker (WCAG 2.2.2). Hover and
  // focus-within pause it too, but neither exists on a touch device.
  const [tickerPaused, setTickerPaused] = useState(false);
  const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  // The event panel is permanently docked from `md` up; below that it is only
  // presented when the reader is on the Feed tab.
  const isPanelDocked = useMediaQuery(MD_BREAKPOINT);
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

  // Breaking-news headlines, parsed once per notification body.
  //
  // The pipeline ships the body as a markdown-ish list ("- [Headline] |||url"),
  // and every entry runs a regex pass plus a `new URL()` construction. Doing
  // that inline made it re-run on *every* render of this page — including the
  // per-keystroke state changes coming out of the search field and the timeline
  // slider — for a value that only ever changes when a new notification lands.
  const notifBody = notification?.body ?? null;
  const headlines = useMemo<Headline[]>(() => {
    if (!notifBody) return [];
    return notifBody
      .split("- [")
      .filter(Boolean)
      .map((item) => {
        // Extract source URL if appended with ||| delimiter
        const pipeIdx = item.indexOf("|||");
        let url: string | null = pipeIdx !== -1 ? item.slice(pipeIdx + 3).trim() : null;
        // Clean URL: strip trailing brackets, parens, whitespace, punctuation
        if (url) {
          url = url.replace(/[\]\)\s,;:!?>'"]+$/, "");
          url = url.replace(/^["'<(\[]+/, "");
          if (url.startsWith("www.")) url = "https://" + url;
          // Reject obviously broken URLs (too short, no dots, pure base64 fragments)
          try {
            const parsed = new URL(url);
            if (!parsed.hostname.includes(".")) url = null;
          } catch { url = null; }
        }
        const text = (pipeIdx !== -1 ? item.slice(0, pipeIdx) : item)
          .replace(/^\[/, "")
          .replace(/\]/, " —")
          .trim();
        return { text, url };
      })
      .filter((item) => item.text.length > 5);
  }, [notifBody]);

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
          <p className="text-sm text-zinc-500">{t("app.loading")}</p>
          {error && (
            <p className="max-w-xs text-center text-xs text-red-400">{error}</p>
          )}
        </div>
      </div>
    );
  }

  const renderHeadline = (item: Headline, i: number, isDup = false) => {
    const key = isDup ? `dup-${i}` : i;
    const props = {
      className: "inline-block whitespace-nowrap px-8 hover:underline focus:underline focus:outline-none",
      ...(isDup ? { "aria-hidden": true as const, tabIndex: -1 } : {}),
    };
    if (item.url) {
      return (
        <a key={key} href={item.url} target="_blank" rel="noopener noreferrer" {...props}
          onClick={(e) => e.stopPropagation()}
        >
          {item.text}
        </a>
      );
    }
    return <span key={key} className="inline-block whitespace-nowrap px-8">{item.text}</span>;
  };

  // The ticker is a labelled landmark, not a live region: it used to carry
  // `aria-live="polite"` on the animated track, which makes a screen reader
  // re-announce headlines as they scroll past. The visible "Breaking" badge
  // supplies the accessible name, so it is translated with the rest of the UI
  // instead of being a hardcoded English `aria-label`.
  const notifBanner = notification && headlines.length > 0 ? (
    <div
      className="relative z-40 flex shrink-0 items-center bg-amber-600/90 text-sm text-white backdrop-blur-sm"
      role="region"
      aria-labelledby={TICKER_LABEL_ID}
    >
      <span
        id={TICKER_LABEL_ID}
        className="shrink-0 bg-red-700 px-3 py-2 text-xs font-bold uppercase tracking-wider"
      >
        {t("ticker.breaking")}
      </span>
      <div className="flex-1 min-w-0 overflow-hidden py-2">
        {/*
          Hover/focus-within pausing is kept for pointer and keyboard users;
          the inline play-state is only set while explicitly paused so it does
          not fight those rules the rest of the time.
        */}
        <div
          className="ticker-track hover:[animation-play-state:paused] focus-within:[animation-play-state:paused]"
          style={tickerPaused ? { animationPlayState: "paused" } : undefined}
        >
          {headlines.map((item, i) => renderHeadline(item, i))}
          {headlines.map((item, i) => renderHeadline(item, i, true))}
        </div>
      </div>
      {/*
        WCAG 2.2.2 — moving content needs a pause mechanism, and hover does not
        exist on touch. When the reader prefers reduced motion globals.css has
        already stopped the animation outright, so the control is redundant.
      */}
      {!prefersReducedMotion && (
        <button
          type="button"
          onClick={() => setTickerPaused((paused) => !paused)}
          aria-pressed={tickerPaused}
          className="shrink-0 px-3 py-2 text-xs hover:bg-white/20 focus:bg-white/20 focus:outline-none min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label={tickerPaused ? t("ticker.resume") : t("ticker.pause")}
        >
          <span aria-hidden="true">{tickerPaused ? "▶" : "❚❚"}</span>
        </button>
      )}
      <button
        type="button"
        onClick={dismissNotif}
        className="shrink-0 px-3 py-2 text-xs hover:bg-white/20 focus:bg-white/20 focus:outline-none min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label={t("ticker.dismiss")}
      >
        ✕
      </button>
    </div>
  ) : null;

  // Landing / briefing screen
  if (!showApp) {
    return (
      <>
        {/*
          ContentWarning is a `fixed inset-0 z-50` opaque overlay, so an
          in-flow banner renders *underneath* it and the reader sees nothing.
          On this one screen the ticker is pinned above the overlay instead —
          it has to be visible on every screen, landing page included.
        */}
        {notifBanner && (
          <div className="fixed inset-x-0 top-0 z-[60]">{notifBanner}</div>
        )}
        <ContentWarning events={events} onDismiss={() => setShowApp(true)} />
      </>
    );
  }

  // Full-page views
  if (activeTab === "sources") {
    return (
      <div className="relative flex h-dvh flex-col">
        <Header lastUpdated={lastUpdated} activeTab="sources" onTabChange={navigate} eventCount={events.length} dayCount={daysOfConflict} />
        {notifBanner}
        <SourcesPage onBack={() => navigate("map")} />
        <MobileNav active="sources" onChange={navigateMobile} />
      </div>
    );
  }

  if (activeTab === "about") {
    return (
      <div className="relative flex h-dvh flex-col">
        <Header lastUpdated={lastUpdated} activeTab="about" onTabChange={navigate} eventCount={events.length} dayCount={daysOfConflict} />
        {notifBanner}
        <AboutPage onBack={() => navigate("map")} />
        <MobileNav active="about" onChange={navigateMobile} />
      </div>
    );
  }

  if (activeTab === "ask") {
    return (
      <div className="relative flex h-dvh flex-col">
        <Header lastUpdated={lastUpdated} activeTab="ask" onTabChange={navigate} eventCount={events.length} dayCount={daysOfConflict} />
        {notifBanner}
        <AskPanel events={events} onBack={() => navigate("map")} />
        <MobileNav active="ask" onChange={navigateMobile} />
      </div>
    );
  }

  if (activeTab === "donate") {
    return (
      <div className="relative flex h-dvh flex-col">
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
    <div className="relative flex h-dvh w-screen flex-col overflow-hidden">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <Header lastUpdated={lastUpdated} activeTab="map" onTabChange={navigate} eventCount={events.length} dayCount={daysOfConflict} />
      {notifBanner}

      <OverviewBanner events={events} />

      <div id="main-content" className="relative flex flex-1 overflow-hidden" role="main">
        <div className={`flex flex-1 flex-col ${showMobileFeed ? "hidden sm:flex" : ""}`}>
          <div className="relative flex-1">
            <ConflictMap
              events={events}
              totalEventCount={events.length}
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

          {/* Mapbox attribution footer — sits below map, above mobile nav */}
          <div className="flex h-6 shrink-0 items-center gap-2 border-t border-zinc-800/50 bg-[#0a0a0a] px-2">
            <a
              href="https://www.mapbox.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-bold text-zinc-500 hover:text-zinc-400"
              aria-label="Mapbox"
            >
              Mapbox
            </a>
            <span className="text-[9px] text-zinc-600">
              © <a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-500">Mapbox</a>
              {" "}© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-500">OpenStreetMap</a>
            </span>
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
            /*
              The panel is presented whenever it is docked (md and up) or the
              reader is on the mobile Feed tab — anywhere else its container is
              `display: none`, and reporting it as open only makes the panel
              measure a zero-height viewport. `onToggle` collapses it back to
              the map / reopens the feed; EventPanel owns no toggle control of
              its own, so this is the parent honouring the props contract.
            */
            isOpen={isPanelDocked || showMobileFeed}
            onToggle={() => setMobileTab(showMobileFeed ? "map" : "feed")}
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
          {t("app.updating")}
        </div>
      )}

      <PWAProvider />
    </div>
  );
}
