import { ImageResponse } from "next/og";
import { getCountryBySlug, countryStats, isKinetic } from "@/lib/event-store";
import { formatNumber } from "@/lib/site";
import { OG_WIDTH, OG_HEIGHT, pointsMapUrl, fetchMapDataUrl } from "@/lib/og";
import { EVENT_COLORS } from "@/lib/constants";

export const runtime = "nodejs";
// No `revalidate`: the root layout reads the locale cookie, so nothing on the
// site is statically cached. The Mapbox backdrop is cached on disk in og.ts.
export const alt = "War Library country card";
export const size = { width: OG_WIDTH, height: OG_HEIGHT };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = getCountryBySlug(slug);
  const stats = entry ? countryStats(entry) : null;
  const thirtyDays = Date.now() - 30 * 86_400_000;
  const points = entry
    ? entry.events
        .filter((e) => isKinetic(e) && e.location_precision !== "country" && !(e.latitude === 0 && e.longitude === 0))
        .filter((e) => {
          const t = new Date(e.date).getTime();
          return !Number.isNaN(t) && t >= thirtyDays;
        })
        .map((e) => ({ lon: e.longitude, lat: e.latitude, color: EVENT_COLORS[e.event_type]?.replace("#", "") }))
    : [];
  const backdrop = entry ? await fetchMapDataUrl(pointsMapUrl(points)) : null;

  const name = entry?.name ?? "Country not found";
  const tiles = stats
    ? [
        { label: "KINETIC EVENTS", value: formatNumber(stats.kinetic), color: "#fca5a5" },
        { label: "LAST 30 DAYS", value: formatNumber(stats.last30), color: "#fafafa" },
        { label: "REPORTED FATALITIES", value: formatNumber(stats.fatalities), color: "#f87171" },
      ]
    : [];

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
            background: "linear-gradient(180deg, rgba(10,10,10,0.15) 0%, rgba(10,10,10,0.5) 50%, rgba(10,10,10,0.95) 100%)",
          }}
        />
        <div style={{ position: "absolute", top: 36, left: 48, display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: 2, color: "#f4f4f5", display: "flex" }}>WAR LIBRARY</div>
          <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: 2, color: "#fff", background: "#dc2626", padding: "4px 10px", borderRadius: 4, display: "flex" }}>LIVE</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", padding: "0 48px 44px 48px", gap: 22 }}>
          <div style={{ fontSize: 24, color: "#a1a1aa", letterSpacing: 2, display: "flex" }}>CONFLICT TRACKER</div>
          <div style={{ fontSize: 72, fontWeight: 800, color: "#fafafa", lineHeight: 1.05, display: "flex" }}>{name}</div>
          <div style={{ display: "flex", gap: 40 }}>
            {tiles.map((tile) => (
              <div key={tile.label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontSize: 44, fontWeight: 800, color: tile.color, display: "flex" }}>{tile.value}</div>
                <div style={{ fontSize: 16, color: "#a1a1aa", letterSpacing: 2, display: "flex" }}>{tile.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
