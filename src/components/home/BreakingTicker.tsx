"use client";

import { useEffect, useMemo, useState } from "react";
import { useNotifications } from "@/hooks/useNotifications";
import { useI18n } from "@/i18n";

/** A single parsed ticker headline plus its (validated) source link. */
type Headline = { text: string; url: string | null };

/** Ties the ticker landmark to its visible (and translated) "Breaking" badge. */
const TICKER_LABEL_ID = "ticker-label";

/**
 * SSR-safe `window.matchMedia` subscription.
 *
 * Starts `false` on the server and on the very first client render so markup
 * matches, then settles on the real value in an effect.
 */
export function useMediaQuery(query: string): boolean {
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

/**
 * The breaking-news ticker. It shows on every screen — map, landing, Ask AI
 * and the content pages — which is why it lives in its own component rather
 * than inside the map page.
 *
 * The pipeline ships the body as a markdown-ish list ("- [Headline] |||url"),
 * and every entry runs a regex pass plus a `new URL()` construction, so the
 * parse is memoised on the body text.
 */
export default function BreakingTicker({ pinned = false }: { pinned?: boolean }) {
  const { t } = useI18n();
  const { notification, dismiss } = useNotifications();
  // Explicit pause state for the ticker (WCAG 2.2.2). Hover and focus-within
  // pause it too, but neither exists on a touch device.
  const [paused, setPaused] = useState(false);
  const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

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

  if (!notification || headlines.length === 0) return null;

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

  // The ticker is a labelled landmark, not a live region: `aria-live` on the
  // animated track makes a screen reader re-announce headlines as they scroll
  // past. The visible "Breaking" badge supplies the accessible name, so it is
  // translated with the rest of the UI instead of being a hardcoded English
  // `aria-label`.
  const banner = (
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
          style={paused ? { animationPlayState: "paused" } : undefined}
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
          onClick={() => setPaused((p) => !p)}
          aria-pressed={paused}
          className="shrink-0 px-3 py-2 text-xs hover:bg-white/20 focus:bg-white/20 focus:outline-none min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label={paused ? t("ticker.resume") : t("ticker.pause")}
        >
          <span aria-hidden="true">{paused ? "▶" : "❚❚"}</span>
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 px-3 py-2 text-xs hover:bg-white/20 focus:bg-white/20 focus:outline-none min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label={t("ticker.dismiss")}
      >
        ✕
      </button>
    </div>
  );

  // The landing overlay is `fixed inset-0 z-50`, so an in-flow banner renders
  // underneath it; on that screen the ticker is pinned above it instead.
  return pinned ? <div className="fixed inset-x-0 top-0 z-[60]">{banner}</div> : banner;
}
