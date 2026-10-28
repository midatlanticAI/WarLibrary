import { ImageResponse } from "next/og";
import { getEventById } from "@/lib/event-store";
import { eventTypeLabel, formatDate, excerpt, formatNumber } from "@/lib/site";
import { OG_WIDTH, OG_HEIGHT, pointMapUrl, fetchMapDataUrl } from "@/lib/og";
import { EVENT_COLORS } from "@/lib/constants";

export const runtime = "nodejs";
// No `revalidate`: the root layout reads the locale cookie, so nothing on the
// site is statically cached. The Mapbox backdrop is cached on disk in og.ts.
export const alt = "War Library event card";
export const size = { width: OG_WIDTH, height: OG_HEIGHT };
export const contentType = "image/png";

const ZOOM_BY_PRECISION: Record<string, number> = { exact: 9, city: 7, region: 5, country: 4 };

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = getEventById(id);
  const color = (event && EVENT_COLORS[event.event_type]?.replace("#", "")) || "ef4444";
  const zoom = event ? ZOOM_BY_PRECISION[event.location_precision ?? "region"] ?? 5 : 3;
  const backdrop = event
    ? await fetchMapDataUrl(pointMapUrl(event.longitude, event.latitude, zoom, color))
    : null;

  const title = event
    ? `${eventTypeLabel(event.event_type)} in ${event.region && event.region !== event.country ? `${event.region}, ${event.country}` : event.country}`
    : "Event not found";
  const line = event ? excerpt(event.description, 170) : "";
  const meta = event
    ? [formatDate(event.date), event.fatalities && event.fatalities > 0 ? `${formatNumber(event.fatalities)} killed` : null, event.source]
        .filter(Boolean)
        .join("  ·  ")
    : "";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          background: "#0a0a0a",
          position: "relative",
          fontFamily: "sans-serif",
        }}
      >
        {backdrop && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={backdrop} alt="" width={OG_WIDTH} height={OG_HEIGHT} style={{ position: "absolute", inset: 0, objectFit: "cover" }} />
        )}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            background: "linear-gradient(180deg, rgba(10,10,10,0.15) 0%, rgba(10,10,10,0.55) 45%, rgba(10,10,10,0.95) 100%)",
          }}
        />
        <div style={{ position: "absolute", top: 36, left: 48, display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: 2, color: "#f4f4f5", display: "flex" }}>WAR LIBRARY</div>
          <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: 2, color: "#fff", background: "#dc2626", padding: "4px 10px", borderRadius: 4, display: "flex" }}>LIVE</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", padding: "0 48px 44px 48px", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 14, height: 14, borderRadius: 7, background: `#${color}`, display: "flex" }} />
            <div style={{ fontSize: 22, color: "#d4d4d8", letterSpacing: 1, textTransform: "uppercase", display: "flex" }}>{meta}</div>
          </div>
          <div style={{ fontSize: 54, fontWeight: 800, color: "#fafafa", lineHeight: 1.1, display: "flex" }}>{title}</div>
          {line && <div style={{ fontSize: 26, color: "#d4d4d8", lineHeight: 1.35, display: "flex" }}>{line}</div>}
        </div>
      </div>
    ),
    { ...size }
  );
}
