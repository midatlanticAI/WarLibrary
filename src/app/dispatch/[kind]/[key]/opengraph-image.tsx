import { ImageResponse } from "next/og";
import { readDispatch } from "@/lib/dispatch-store";
import * as core from "@/lib/dispatch-core.cjs";
import type { DispatchKind } from "@/lib/dispatch-core.cjs";
import { OG_WIDTH, OG_HEIGHT } from "@/lib/og";
import { DISPATCH_KIND_LABEL, formatNumber } from "@/lib/site";

export const runtime = "nodejs";
export const alt = "War Library dispatch card";
export const size = { width: OG_WIDTH, height: OG_HEIGHT };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ kind: string; key: string }> }) {
  const { kind, key } = await params;
  const d = core.isKind(kind) && core.isValidKey(kind, key) ? readDispatch(kind as DispatchKind, key) : null;
  const published = d ? core.isPublished(d) : false;
  const title = d && published ? core.stripCitations(d.title) : "Dispatch";
  const label = d && published ? `${DISPATCH_KIND_LABEL[d.kind]} · ${d.window.label}` : "";
  const tiles = d && published
    ? [
        ["Events", formatNumber(d.stats.events)],
        ["Kinetic", formatNumber(d.stats.kinetic)],
        ["Fatalities as reported", formatNumber(d.stats.fatalities)],
        ["Countries", formatNumber(d.stats.countries)],
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
          justifyContent: "space-between",
          background: "linear-gradient(160deg, #0a0a0a 0%, #151010 60%, #1a0b0b 100%)",
          padding: "44px 52px",
          fontFamily: "sans-serif",
          color: "#fafafa",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: 2, display: "flex" }}>WAR LIBRARY</div>
          <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: 2, color: "#fff", background: "#dc2626", padding: "4px 10px", borderRadius: 4, display: "flex" }}>DISPATCH</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 22, color: "#fca5a5", letterSpacing: 1, textTransform: "uppercase", display: "flex" }}>{label}</div>
          <div style={{ fontSize: title.length > 70 ? 44 : 54, fontWeight: 800, lineHeight: 1.1, display: "flex" }}>{title}</div>
        </div>
        <div style={{ display: "flex", gap: 18 }}>
          {tiles.map(([name, value]) => (
            <div key={name} style={{ display: "flex", flexDirection: "column", background: "rgba(255,255,255,0.06)", borderRadius: 12, padding: "14px 20px", minWidth: 200 }}>
              <div style={{ fontSize: 36, fontWeight: 800, display: "flex" }}>{value}</div>
              <div style={{ fontSize: 16, color: "#d4d4d8", display: "flex" }}>{name}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
