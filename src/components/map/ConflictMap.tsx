"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, {
  Source,
  Layer,
  Popup,
  NavigationControl,
  ScaleControl,
  MapRef,
  MapMouseEvent,
} from "react-map-gl/mapbox";
import type { ExpressionSpecification, GeoJSONSource } from "mapbox-gl";
import type { FeatureCollection, Point } from "geojson";
import type { ConflictEvent } from "@/types";
import { EVENT_COLORS } from "@/lib/constants";
import { shareEvent } from "@/lib/share";
import { useI18n } from "@/i18n";
import MapLegend from "./MapLegend";
import "mapbox-gl/dist/mapbox-gl.css";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// Source / layer ids — referenced by interactiveLayerIds and by getSource() on click
const EVENTS_SOURCE_ID = "conflict-events";
const CLUSTER_LAYER_ID = "conflict-clusters";
const CLUSTER_COUNT_LAYER_ID = "conflict-cluster-count";
const POINT_LAYER_ID = "conflict-points";

// Coincident coordinates are the norm in this dataset (thousands of events land on
// country/city centroids), so keep clustering active almost all the way in.
const CLUSTER_MAX_ZOOM = 14;
/**
 * A cluster larger than this that refuses to expand is a coincident pile —
 * events sharing one fallback coordinate rather than a real concentration.
 */
const COINCIDENT_PILE_THRESHOLD = 20;
const CLUSTER_RADIUS = 50;

// Only the properties the style expressions need — the full ConflictEvent is looked
// up by id from a lookup table, so nothing heavy is serialized into GeoJSON.
interface EventFeatureProperties {
  id: string;
  event_type: string;
  fatalities: number;
}

// Mapbox `match` expression built from the shared EVENT_COLORS map so point colors
// can never drift from the legend. Default is the airstrike red, as before.
const EVENT_COLOR_MATCH: ExpressionSpecification = [
  "match",
  ["get", "event_type"],
  ...Object.entries(EVENT_COLORS).flatMap(([type, color]) => [type, color]),
  "#ef4444",
];

// Bigger circles for deadlier events, scaled by zoom — the expression equivalent of
// the old per-marker getMarkerSize(), evaluated on the GPU instead of in React.
const POINT_RADIUS: ExpressionSpecification = [
  "interpolate",
  ["linear"],
  ["zoom"],
  2,
  ["step", ["get", "fatalities"], 3, 10, 4.5, 100, 6],
  6,
  ["step", ["get", "fatalities"], 5, 10, 7, 100, 9],
  12,
  ["step", ["get", "fatalities"], 7, 10, 10, 100, 14],
];

/**
 * Locale-aware formatting for everything the map prints: counts, dates and
 * count phrases.
 *
 * Plurals go through Intl.PluralRules instead of an English `n === 1` ternary.
 * Arabic selects between six cardinal forms (zero/one/two/few/many/other) and
 * Hebrew between four, so the locale files carry one key per CLDR category
 * under `base` and the right one is picked at render time. A category a
 * language never selects is still present in the bundles, but the `other`
 * fallback keeps a future locale from printing a raw key.
 */
function useMapFormat() {
  const { t, locale } = useI18n();

  const numberFormat = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const pluralRules = useMemo(() => new Intl.PluralRules(locale), [locale]);

  const num = useCallback(
    (n: number) => numberFormat.format(n),
    [numberFormat]
  );

  const plural = useCallback(
    (base: string, n: number) => {
      const params = { n: numberFormat.format(n) };
      const key = `${base}.${pluralRules.select(n)}`;
      const phrase = t(key, params);
      // t() echoes an unknown key straight back — fall through to `other`.
      return phrase === key ? t(`${base}.other`, params) : phrase;
    },
    [t, numberFormat, pluralRules]
  );

  const date = useCallback(
    (iso: string) => new Date(iso).toLocaleDateString(locale),
    [locale]
  );

  return { t, num, plural, date };
}

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
  const { t, num, plural } = useMapFormat();
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

  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());
  const [hiddenCountries, setHiddenCountries] = useState<Set<string>>(
    new Set()
  );
  const [legendOpen, setLegendOpen] = useState(false);
  const [coincidentPile, setCoincidentPile] = useState<{
    longitude: number;
    latitude: number;
    count: number;
  } | null>(null);

  // Move the camera when an event is selected elsewhere — most importantly from
  // the event feed, which is the only keyboard-accessible way to reach an
  // event. Without this the popup renders wherever the event is, which may be
  // entirely outside the current viewport: on mobile, tapping a feed row
  // switches to the map tab and would otherwise land on a view showing nothing.
  useEffect(() => {
    if (!selectedEvent) return;
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({
      center: [selectedEvent.longitude, selectedEvent.latitude],
      zoom: Math.max(map.getZoom(), 7),
      duration: 800,
    });
  }, [selectedEvent]);

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

  // Filtered events → GeoJSON. Mapbox owns rendering and clustering from here;
  // React renders three <Layer>s instead of one DOM node per event.
  const eventsGeoJSON = useMemo<
    FeatureCollection<Point, EventFeatureProperties>
  >(
    () => ({
      type: "FeatureCollection",
      features: filteredEvents.map((event) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [event.longitude, event.latitude],
        },
        properties: {
          id: event.id,
          event_type: event.event_type,
          // null fatalities would break the numeric `step` expression
          fatalities: event.fatalities ?? 0,
        },
      })),
    }),
    [filteredEvents]
  );

  // Click handling only carries an id across the GeoJSON boundary; the full event
  // (actors, description, source) comes back out of this lookup.
  const eventsById = useMemo(() => {
    const lookup: Record<string, ConflictEvent> = {};
    for (const event of filteredEvents) lookup[event.id] = event;
    return lookup;
  }, [filteredEvents]);

  const flyToEvent = useCallback(
    (event: ConflictEvent) => {
      onSelectEvent(event);
      // Read zoom off the map instance rather than React state — the map is
      // uncontrolled, so nothing re-renders on pan/zoom.
      const currentZoom = mapRef.current?.getZoom() ?? 4.5;
      mapRef.current?.flyTo({
        center: [event.longitude, event.latitude],
        zoom: Math.max(currentZoom, 7),
        duration: 800,
      });
    },
    [onSelectEvent]
  );

  const handleMapClick = useCallback(
    (e: MapMouseEvent) => {
      const feature = e.features?.[0];
      if (!feature || feature.geometry.type !== "Point") return;

      // Cluster → zoom to the level where it breaks apart
      const clusterId = feature.properties?.cluster_id;
      if (typeof clusterId === "number") {
        const source =
          mapRef.current?.getSource<GeoJSONSource>(EVENTS_SOURCE_ID);
        if (!source) return;
        const [longitude, latitude] = feature.geometry.coordinates;
        source.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err || typeof zoom !== "number") return;

          // Thousands of events share a handful of coordinates, because the
          // pipeline falls back to country centroids when it can't place an
          // event (over 5,000 sit on Iran's centroid alone). Those points are
          // exactly coincident, so they never separate no matter how far you
          // zoom — getClusterExpansionZoom just returns the max zoom, and the
          // "expanded" cluster renders as a single indistinguishable dot with
          // every event but one unreachable.
          //
          // Detect that case and say so instead of performing a zoom that
          // cannot help.
          const pointCount = feature.properties?.point_count;
          if (
            zoom >= CLUSTER_MAX_ZOOM &&
            typeof pointCount === "number" &&
            pointCount > COINCIDENT_PILE_THRESHOLD
          ) {
            setCoincidentPile({
              longitude,
              latitude,
              count: pointCount,
            });
            return;
          }

          mapRef.current?.easeTo({
            center: [longitude, latitude],
            zoom,
            duration: 600,
          });
        });
        return;
      }

      // Unclustered point → same popup as the old markers
      const eventId = feature.properties?.id;
      if (typeof eventId !== "string") return;
      const clicked = eventsById[eventId];
      if (clicked) flyToEvent(clicked);
    },
    [eventsById, flyToEvent]
  );

  // Cursor feedback without React state — a hover-driven re-render would defeat
  // the point of moving markers off the DOM.
  const setCursor = useCallback((cursor: string) => {
    const canvas = mapRef.current?.getCanvas();
    if (canvas) canvas.style.cursor = cursor;
  }, []);

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

  // No token = a dead black rectangle. Explain it instead, and point at the feed.
  if (!MAPBOX_TOKEN) {
    return (
      <div
        ref={containerRef}
        className="relative flex h-full w-full items-center justify-center bg-[#0a0a0a] p-6"
      >
        <div className="max-w-sm space-y-2 rounded-lg border border-zinc-800 bg-black/60 p-5 text-center">
          <p className="text-sm font-semibold text-zinc-200">
            {t("map.unavailableTitle")}
          </p>
          <p className="text-xs leading-relaxed text-zinc-400">
            {t("map.unavailableBody", {
              events: plural("map.eventCount", totalEventCount),
            })}
          </p>
          <p className="font-mono text-[11px] text-zinc-600">
            {t("map.unavailableToken")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full"
      role="region"
      aria-label={t("map.regionLabel")}
    >
      {/* Clustered points are drawn to a WebGL canvas — they cannot hold focus or
          expose a name, so no fake interactive roles are attached to them. The
          event feed is the keyboard- and screen-reader-accessible equivalent. */}
      <p className="sr-only">
        {t("map.srSummary", {
          events: plural("map.eventCount", filteredEvents.length),
        })}{" "}
        {t("map.srKeyboard")}
      </p>

      <Map
        ref={mapRef}
        initialViewState={{
          longitude: 49.0,
          latitude: 32.0,
          zoom: 4.5,
          pitch: 0,
          bearing: 0,
        }}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        style={{ width: "100%", height: "100%" }}
        maxZoom={18}
        minZoom={2}
        attributionControl={false}
        interactiveLayerIds={[CLUSTER_LAYER_ID, POINT_LAYER_ID]}
        onClick={handleMapClick}
        onMouseEnter={() => setCursor("pointer")}
        onMouseLeave={() => setCursor("")}
      >
        <NavigationControl position="top-left" showCompass={false} />
        <ScaleControl position="bottom-right" />

        <Source
          id={EVENTS_SOURCE_ID}
          type="geojson"
          data={eventsGeoJSON}
          cluster
          clusterMaxZoom={CLUSTER_MAX_ZOOM}
          clusterRadius={CLUSTER_RADIUS}
        >
          {/* Cluster bubbles — size and heat both step with event count */}
          <Layer
            id={CLUSTER_LAYER_ID}
            type="circle"
            filter={["has", "point_count"]}
            paint={{
              "circle-color": [
                "step",
                ["get", "point_count"],
                "#fbbf24",
                25,
                "#f97316",
                150,
                "#ef4444",
                750,
                "#b91c1c",
              ],
              "circle-radius": [
                "step",
                ["get", "point_count"],
                14,
                25,
                18,
                150,
                24,
                750,
                32,
              ],
              "circle-opacity": 0.85,
              "circle-stroke-width": 2,
              "circle-stroke-color": "rgba(255,255,255,0.3)",
            }}
          />

          {/* Cluster counts */}
          <Layer
            id={CLUSTER_COUNT_LAYER_ID}
            type="symbol"
            filter={["has", "point_count"]}
            layout={{
              "text-field": ["get", "point_count_abbreviated"],
              "text-font": ["DIN Pro Medium", "Arial Unicode MS Bold"],
              "text-size": 12,
              "text-allow-overlap": true,
            }}
            paint={{
              "text-color": "#0a0a0a",
            }}
          />

          {/* Individual events — colored by type from EVENT_COLORS */}
          <Layer
            id={POINT_LAYER_ID}
            type="circle"
            filter={["!", ["has", "point_count"]]}
            paint={{
              "circle-color": EVENT_COLOR_MATCH,
              "circle-radius": POINT_RADIUS,
              "circle-opacity": 0.85,
              "circle-stroke-width": 1.5,
              "circle-stroke-color": "rgba(255,255,255,0.3)",
            }}
          />
        </Source>

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

        {coincidentPile && (
          <Popup
            longitude={coincidentPile.longitude}
            latitude={coincidentPile.latitude}
            anchor="bottom"
            onClose={() => setCoincidentPile(null)}
            closeOnClick={false}
            maxWidth="300px"
          >
            <div className="p-1 text-xs">
              <p className="mb-1 font-semibold text-amber-400">
                {t("map.pileTitle", {
                  events: plural("map.eventCount", coincidentPile.count),
                })}
              </p>
              <p className="text-zinc-300">{t("map.pileBody")}</p>
              <p className="mt-1.5 text-zinc-400">{t("map.pileHint")}</p>
            </div>
          </Popup>
        )}
      </Map>

      {/* Event count badge — uses totalEventCount from parent for consistency with stats bar */}
      <div className="absolute left-3 top-12 rounded-lg bg-black/70 px-3 py-1.5 text-xs font-mono backdrop-blur-sm">
        <span className="text-red-400">{num(totalEventCount)}</span>
        <span className="text-zinc-400"> {plural("map.eventsLabel", totalEventCount)}</span>
        {(hiddenTypes.size > 0 || hiddenCountries.size > 0) && (
          <span className="text-yellow-500">
            {" "}
            · {t("map.shown", { n: num(filteredEvents.length) })}
          </span>
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

function EventPopup({ event }: { event: ConflictEvent }) {
  const { t, plural, date } = useMapFormat();

  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{
            backgroundColor: EVENT_COLORS[event.event_type] || "#ef4444",
          }}
        />
        {/* No `capitalize` here: the label is already cased by the translator,
            and forcing title case mangles it outside English. */}
        <span className="font-semibold text-white">
          {t(`eventTypes.${event.event_type}`)}
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
        <span>{date(event.date)}</span>
      </div>
      {event.fatalities !== null && event.fatalities > 0 && (
        <div className="text-xs text-red-400">
          {plural("map.fatalityCount", event.fatalities)}
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-500">
          {t("map.sourceLabel", { name: event.source })}
        </span>
        <PopupShareButton event={event} />
      </div>
    </div>
  );
}

function PopupShareButton({ event }: { event: ConflictEvent }) {
  const { t } = useI18n();
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
      {copied ? t("eventPanel.copied") : t("eventPanel.share")}
    </button>
  );
}
