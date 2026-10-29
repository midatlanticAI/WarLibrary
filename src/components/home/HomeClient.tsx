"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import type { ConflictEvent } from "@/types";
import { useEvents } from "@/hooks/useEvents";
import { useSummary } from "@/hooks/useSummary";
import Header from "@/components/ui/Header";
import EventPanel from "@/components/ui/EventPanel";
import TimelineSlider from "@/components/timeline/TimelineSlider";
import ContentWarning from "@/components/ui/ContentWarning";
import OverviewBanner from "@/components/ui/OverviewBanner";
import SourceFooter from "@/components/ui/SourceFooter";
import AskPanel from "@/components/chat/AskPanel";
import MobileNav from "@/components/ui/MobileNav";
import PWAProvider from "@/components/pwa/PWAProvider";
import BreakingTicker, { useMediaQuery } from "@/components/home/BreakingTicker";
import { I18nProvider, useI18n, type Locale } from "@/i18n";
import { CONFLICT_START, pathForTab, type Tab, type MobileTab } from "@/lib/navigation";
import { countrySlug } from "@/lib/country";

const ConflictMap = dynamic(() => import("@/components/map/ConflictMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#0a0a0a]">
      <div className="text-sm text-zinc-600">Loading map...</div>
    </div>
  ),
});

/** Tailwind's `md` breakpoint — the width at which the event panel is docked. */
const MD_BREAKPOINT = "(min-width: 768px)";

/** Only the in-page tabs; everything else is a real route. */
type HomeTab = "map" | "ask";
type HomeMobileTab = "map" | "feed" | "ask";

/** A bare date or ISO timestamp from the URL, or null. */
function parseUrlDate(value: string | null, edge: "start" | "end"): string | null {
  if (!value) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T${edge === "start" ? "00:00:00.000" : "23:59:59.999"}Z`
    : value;
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function defaultDateRange() {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 86400000);
  return { start: oneDayAgo.toISOString(), end: now.toISOString() };
}

export default function HomeClient({ initialLocale = "en" }: { initialLocale?: Locale }) {
  return (
    <I18nProvider initialLocale={initialLocale}>
      <HomeContent />
    </I18nProvider>
  );
}

function HomeContent() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Events arrive in the reader's language: descriptions are swapped for the
  // machine translation where one exists, and each event says which
  // language its text is in (`description_lang`).
  const { events, loading, refreshing, complete, error, stale, lastUpdated } = useEvents(locale);
  const summary = useSummary();
  const [selectedEvent, setSelectedEvent] = useState<ConflictEvent | null>(null);
  const [showApp, setShowApp] = useState(false);
  const initialTab: HomeTab = searchParams.get("tab") === "ask" ? "ask" : "map";
  const initialMobile: HomeMobileTab =
    searchParams.get("tab") === "feed" ? "feed" : initialTab;
  const [activeTab, setActiveTab] = useState<HomeTab>(initialTab);
  const [mobileTab, setMobileTab] = useState<HomeMobileTab>(initialMobile);
  // The event panel is permanently docked from `md` up; below that it is only
  // presented when the reader is on the Feed tab.
  const isPanelDocked = useMediaQuery(MD_BREAKPOINT);

  // A country hub's "open on the map" link scopes the view to that country.
  const [countryFilter, setCountryFilter] = useState<string | null>(() => {
    const c = searchParams.get("c");
    return c && /^[a-z0-9-]{1,80}$/.test(c) ? c : null;
  });

  // The date window comes from the URL when a shared link carries one, and is
  // written back whenever it changes so the link in the address bar always
  // restores the current view.
  const urlFrom = parseUrlDate(searchParams.get("from"), "start");
  const urlTo = parseUrlDate(searchParams.get("to"), "end");
  const [dateRange, setDateRange] = useState(() =>
    urlFrom && urlTo ? { start: urlFrom, end: urlTo } : defaultDateRange()
  );
  // Once the reader (or a link) has chosen a window, it is written to the URL.
  const [rangeChosen, setRangeChosen] = useState(Boolean(urlFrom && urlTo));

  const daysOfConflict = Math.ceil(
    (Date.now() - new Date(CONFLICT_START).getTime()) / 86400000
  );

  const visibleEvents = useMemo(
    () => (countryFilter ? events.filter((e) => countrySlug(e.country) === countryFilter) : events),
    [events, countryFilter]
  );

  // If no events in default 24h window, expand to show all. Not applied when
  // the window was chosen by the link: an empty window is then a true answer.
  useEffect(() => {
    if (rangeChosen || visibleEvents.length === 0) return;
    const startTs = new Date(dateRange.start).getTime();
    const endTs = new Date(dateRange.end).getTime();
    const inRange = visibleEvents.filter((e) => {
      const t = new Date(e.date).getTime();
      return t >= startTs && t <= endTs;
    });
    if (inRange.length === 0) {
      setDateRange({ start: `${CONFLICT_START}T00:00:00Z`, end: new Date().toISOString() });
      setRangeChosen(true);
    }
  }, [visibleEvents, dateRange, rangeChosen]);

  // --- Deep link: ?e=<id> selects an event ----------------------------------
  //
  // The recent window arrives first, so the event may not be on the client
  // yet. Look it up locally when the loaded set changes; if the whole history
  // has arrived and it is still missing, ask the API for that one id. Until
  // it resolves the `e` parameter is kept in the URL.
  const wantedEventId = searchParams.get("e");
  const [deepLinkResolved, setDeepLinkResolved] = useState(!wantedEventId);
  const resolvedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!wantedEventId || resolvedIdRef.current === wantedEventId) return;
    const local = events.find((e) => e.id === wantedEventId);
    if (local) {
      resolvedIdRef.current = wantedEventId;
      setSelectedEvent(local);
      setDeepLinkResolved(true);
      return;
    }
    if (!complete) return;
    resolvedIdRef.current = wantedEventId;
    fetch(`/api/events/${encodeURIComponent(wantedEventId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.data) setSelectedEvent(json.data as ConflictEvent);
      })
      .catch(() => {})
      .finally(() => setDeepLinkResolved(true));
  }, [wantedEventId, events, complete]);

  // When a linked event sits outside the current window, widen the window so
  // the reader actually sees it on the map and in the feed.
  useEffect(() => {
    if (!selectedEvent || !wantedEventId || selectedEvent.id !== wantedEventId) return;
    const time = new Date(selectedEvent.date).getTime();
    if (Number.isNaN(time)) return;
    const start = new Date(dateRange.start).getTime();
    const end = new Date(dateRange.end).getTime();
    if (time < start || time > end) {
      setDateRange({
        start: new Date(Math.min(start, time - 86400000)).toISOString(),
        end: new Date(Math.max(end, time + 86400000)).toISOString(),
      });
      setRangeChosen(true);
    }
    // Only when the linked selection first resolves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEvent?.id, wantedEventId]);

  // `?tab=feed` is a phone concept; docked panels have no feed tab, and
  // honouring it from `md` up collapsed the map column to nothing.
  useEffect(() => {
    if (isPanelDocked && mobileTab === "feed") setMobileTab("map");
  }, [isPanelDocked, mobileTab]);

  // --- Write view state back to the URL ---------------------------------------
  //
  // replaceState, not push: moving the timeline or picking an event is not a
  // navigation the back button should unwind. The state argument is null on
  // purpose: Next.js patches replaceState and only syncs `useSearchParams`
  // when the call does not carry its own internal state object.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (activeTab === "ask") params.set("tab", "ask");
    else if (mobileTab === "feed" && !isPanelDocked) params.set("tab", "feed");
    else params.delete("tab");
    if (selectedEvent) params.set("e", selectedEvent.id);
    else if (deepLinkResolved) params.delete("e");
    if (countryFilter) params.set("c", countryFilter);
    else params.delete("c");
    if (rangeChosen) {
      params.set("from", dateRange.start.slice(0, 10));
      params.set("to", dateRange.end.slice(0, 10));
    } else {
      params.delete("from");
      params.delete("to");
    }
    const query = params.toString();
    const next = `${window.location.pathname}${query ? `?${query}` : ""}`;
    if (next !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, "", next);
    }
  }, [activeTab, mobileTab, isPanelDocked, selectedEvent, deepLinkResolved, countryFilter, dateRange, rangeChosen]);

  // Privacy-respecting analytics — fire-and-forget page view tracking.
  //
  // The landing overlay is counted on its own: it is the first thing every
  // visitor sees, and until it was counted the store under-reported visitors
  // by roughly 25x against the access log.
  useEffect(() => {
    fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: "landing" }),
      keepalive: true,
    }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!showApp) return;
    fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: activeTab }),
    }).catch(() => {});
  }, [activeTab, showApp]);

  // Header and mobile nav speak in the full tab vocabulary; the content pages
  // are real routes, the two in-page tabs stay here.
  const navigate = useCallback(
    (tab: Tab) => {
      if (tab === "map" || tab === "ask") {
        setActiveTab(tab);
        setMobileTab(tab);
        return;
      }
      router.push(pathForTab(tab));
    },
    [router]
  );

  const navigateMobile = useCallback(
    (tab: MobileTab) => {
      if (tab === "map" || tab === "ask" || tab === "feed") {
        setMobileTab(tab);
        setActiveTab(tab === "feed" ? "map" : tab);
        return;
      }
      router.push(pathForTab(tab));
    },
    [router]
  );

  // Numbers: once the whole history is loaded, everything comes from `events`.
  // Before that the server's aggregates stand in for the parts not yet here.
  const summaryForDisplay = complete ? null : summary;
  const headerCount = complete ? events.length : Math.max(events.length, summary?.total ?? 0);

  // Initial loading state: nothing to show yet. "Nothing" means no events on
  // the client and the full history not yet here — the recent window can be
  // legitimately empty.
  if ((loading || !complete) && events.length === 0) {
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

  // Landing / briefing screen
  if (!showApp) {
    return (
      <>
        <BreakingTicker pinned />
        <ContentWarning
          events={events}
          summary={summary}
          complete={complete}
          onDismiss={() => setShowApp(true)}
        />
      </>
    );
  }

  if (activeTab === "ask") {
    return (
      <div className="relative flex h-dvh flex-col">
        <Header lastUpdated={lastUpdated} activeTab="ask" onTabChange={navigate} eventCount={headerCount} dayCount={daysOfConflict} />
        <BreakingTicker />
        <AskPanel events={events} onBack={() => navigate("map")} />
        <MobileNav active="ask" onChange={navigateMobile} />
      </div>
    );
  }

  // Main map view
  const showMobileFeed = mobileTab === "feed" && !isPanelDocked;
  const historyNote = !complete
    ? (error || stale ? t("app.historyFailed") : t("app.loadingHistory"))
    : null;

  return (
    <div className="relative flex h-dvh w-screen flex-col overflow-hidden">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <Header lastUpdated={lastUpdated} activeTab="map" onTabChange={navigate} eventCount={headerCount} dayCount={daysOfConflict} />
      <BreakingTicker />

      <OverviewBanner events={events} summary={summaryForDisplay} />

      {countryFilter && (
        <div className="flex items-center gap-2 border-b border-zinc-800 bg-[#0e0e0e] px-3 py-1.5 text-xs text-zinc-300">
          <span>
            {t("map.showingCountry")}{" "}
            <span className="font-semibold text-zinc-100">{countryFilter.replace(/-/g, " ")}</span>
            {" "}· {visibleEvents.length}
          </span>
          <button
            type="button"
            onClick={() => setCountryFilter(null)}
            className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
          >
            {t("map.clearCountry")}
          </button>
        </div>
      )}

      <div id="main-content" className="relative flex flex-1 overflow-hidden" role="main">
        <div className={`flex flex-1 flex-col ${showMobileFeed ? "hidden sm:flex" : ""}`}>
          <div className="relative flex-1">
            <ConflictMap
              events={visibleEvents}
              totalEventCount={headerCount}
              selectedEvent={selectedEvent}
              onSelectEvent={setSelectedEvent}
              dateRange={dateRange}
            />

            {/* Full timeline on desktop, compact filter bar on mobile */}
            {/* `end-` not `right-`: the side panel mirrors to the left in RTL, and the overlay must clear it there too. */}
            <div className="absolute bottom-0 left-0 right-0 p-2 sm:p-3 sm:pb-3 md:end-[380px]">
              <TimelineSlider
                events={visibleEvents}
                dateRange={dateRange}
                onChange={(range) => {
                  setDateRange(range);
                  setRangeChosen(true);
                }}
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
            {historyNote && (
              <span className="ms-auto truncate text-[9px] text-zinc-500" role="status">{historyNote}</span>
            )}
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
            events={visibleEvents}
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

      {(loading || refreshing) && (
        <div className="absolute left-1/2 top-14 z-30 -translate-x-1/2 rounded-full bg-black/80 px-4 py-1.5 text-xs text-zinc-400 backdrop-blur-sm">
          {t("app.updating")}
        </div>
      )}

      <PWAProvider />
    </div>
  );
}
