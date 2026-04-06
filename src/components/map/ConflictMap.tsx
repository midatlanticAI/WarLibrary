"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, {
  Marker,
  Popup,
  NavigationControl,
  ScaleControl,
  MapRef,
} from "react-map-gl/mapbox";
import type { ConflictEvent } from "@/types";
import { EVENT_COLORS } from "@/lib/constants";
import { shareEvent } from "@/lib/share";
import MapLegend from "./MapLegend";
import "mapbox-gl/dist/mapbox-gl.css";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

const EVENT_ICONS: Record<string, string> = {
  airstrike: "💥",
  missile_attack: "🚀",
  drone_attack: "✈️",
  battle: "⚔️",
  explosion: "💣",
  violence_against_civilians: "🔴",
  strategic_development: "📍",
  protest: "✊",
};

interface ConflictMapProps {
  events: ConflictEvent[];
  totalEventCount: number;
  selectedEvent: ConflictEvent | null;
  onSelectEvent: (event: ConflictEvent | null) => void;
  dateRange: { start: string; end: string } | null;
}

export default function ConflictMap({
  events,
  totalEventCount,
  selectedEvent,
  onSelectEvent,
  dateRange,
}: ConflictMapProps) {
  const mapRef = useRef<MapRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Resize map when container dimensions change (e.g. banner collapse)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      mapRef.current?.resize();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const [viewState, setViewState] = useState({
    longitude: 49.0,
    latitude: 32.0,
    zoom: 4.5,
    pitch: 0,
    bearing: 0,
  });
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());
  const [hiddenCountries, setHiddenCountries] = useState<Set<string>>(
    new Set()
  );
  const [legendOpen, setLegendOpen] = useState(false);

  const filteredEvents = useMemo(() => {
    let filtered = events;
    if (dateRange) {
      const startTs = new Date(dateRange.start).getTime();
      const endTs = new Date(dateRange.end).getTime();
      filtered = filtered.filter((e) => {
        const t = new Date(e.date).getTime();
        return t >= startTs && t <= endTs;
      });
    }
    if (hiddenTypes.size > 0) {
      filtered = filtered.filter((e) => !hiddenTypes.has(e.event_type));
    }
    if (hiddenCountries.size > 0) {
      filtered = filtered.filter((e) => !hiddenCountries.has(e.country));
    }
    return filtered;
  }, [events, dateRange, hiddenTypes, hiddenCountries]);

  const handleMarkerClick = useCallback(
    (event: ConflictEvent) => {
      onSelectEvent(event);
      mapRef.current?.flyTo({
        center: [event.longitude, event.latitude],
        zoom: Math.max(viewState.zoom, 7),
        duration: 800,
      });
    },
    [onSelectEvent, viewState.zoom]
  );

  const toggleType = useCallback((type: string) => {
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const toggleCountry = useCallback((country: string) => {
    setHiddenCountries((prev) => {
      const next = new Set(prev);
      if (next.has(country)) next.delete(country);
      else next.add(country);
      return next;
    });
  }, []);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <Map
        ref={mapRef}
        {...viewState}
        onMove={(evt) => setViewState(evt.viewState)}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        style={{ width: "100%", height: "100%" }}
        maxZoom={18}
        minZoom={2}
        attributionControl={false}
      >
        <NavigationControl position="top-left" showCompass={false} />
        <ScaleControl position="bottom-right" />

        {filteredEvents.map((event) => (
          <Marker
            key={event.id}
            longitude={event.longitude}
            latitude={event.latitude}
            anchor="center"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              handleMarkerClick(event);
            }}
          >
            <div
              className="flex cursor-pointer items-center justify-center rounded-full transition-transform hover:scale-125"
              style={{
                width: getMarkerSize(event, viewState.zoom),
                height: getMarkerSize(event, viewState.zoom),
                backgroundColor:
                  EVENT_COLORS[event.event_type] || "#ef4444",
                opacity: 0.85,
                border: "2px solid rgba(255,255,255,0.3)",
                fontSize: viewState.zoom > 6 ? "14px" : "10px",
              }}
              role="button"
              aria-label={`${event.event_type.replace(/_/g, " ")}: ${event.region}, ${event.country}${event.fatalities ? ` — ${event.fatalities} fatalities` : ""}`}
              title={event.description}
            >
              {viewState.zoom > 5 && (
                <span>{EVENT_ICONS[event.event_type] || "⚡"}</span>
              )}
            </div>
          </Marker>
        ))}

        {selectedEvent && (
          <Popup
            longitude={selectedEvent.longitude}
            latitude={selectedEvent.latitude}
            anchor="bottom"
            onClose={() => onSelectEvent(null)}
            closeOnClick={false}
            maxWidth="320px"
            focusAfterOpen={false}
          >
            <EventPopup event={selectedEvent} />
          </Popup>
        )}
      </Map>

      {/* Event count badge — uses totalEventCount from parent for consistency with stats bar */}
      <div className="absolute left-3 top-12 rounded-lg bg-black/70 px-3 py-1.5 text-xs font-mono backdrop-blur-sm">
        <span className="text-red-400">{totalEventCount}</span>
        <span className="text-zinc-400"> events</span>
        {(hiddenTypes.size > 0 || hiddenCountries.size > 0) && (
          <span className="text-yellow-500 text-zinc-400"> · {filteredEvents.length} shown</span>
        )}
      </div>

      {/* Legend & filters */}
      <MapLegend
        events={events}
        hiddenTypes={hiddenTypes}
        onToggleType={toggleType}
        hiddenCountries={hiddenCountries}
        onToggleCountry={toggleCountry}
        isOpen={legendOpen}
        onToggle={() => setLegendOpen(!legendOpen)}
      />
    </div>
  );
}

function getMarkerSize(event: ConflictEvent, zoom: number): number {
  const base = zoom > 7 ? 28 : zoom > 5 ? 20 : 14;
  if (event.fatalities && event.fatalities > 100) return base + 8;
  if (event.fatalities && event.fatalities > 10) return base + 4;
  return base;
}

function EventPopup({ event }: { event: ConflictEvent }) {
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{
            backgroundColor: EVENT_COLORS[event.event_type] || "#ef4444",
          }}
        />
        <span className="font-semibold capitalize text-white">
          {event.event_type.replace(/_/g, " ")}
        </span>
      </div>
      <p className="leading-relaxed text-zinc-300">{event.description}</p>
      <div className="flex flex-wrap gap-1">
        {event.actors.map((actor) => (
          <span
            key={actor}
            className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300"
          >
            {actor}
          </span>
        ))}
      </div>
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>
          {event.region}, {event.country}
        </span>
        <span>{new Date(event.date).toLocaleDateString()}</span>
      </div>
      {event.fatalities !== null && event.fatalities > 0 && (
        <div className="text-xs text-red-400">
          {event.fatalities}{" "}
          {event.fatalities === 1 ? "fatality" : "fatalities"} reported
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-500">
          Source: {event.source}
        </span>
        <PopupShareButton event={event} />
      </div>
    </div>
  );
}

function PopupShareButton({ event }: { event: ConflictEvent }) {
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(async () => {
    try {
      await shareEvent(event);
      if (!navigator.share) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // cancelled
    }
  }, [event]);

  return (
    <button
      onClick={handleShare}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-zinc-500 transition-colors hover:bg-zinc-700 hover:text-zinc-300"
    >
      <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
        <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" />
      </svg>
      {copied ? "Copied!" : "Share"}
    </button>
  );
}
