import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "War Library — Live Conflict Tracker";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Grid pattern overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            opacity: 0.08,
            backgroundImage:
              "linear-gradient(rgba(245,158,11,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(245,158,11,0.5) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />

        {/* Amber glow top-left */}
        <div
          style={{
            position: "absolute",
            top: -80,
            left: -80,
            width: 400,
            height: 400,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(245,158,11,0.15) 0%, transparent 70%)",
            display: "flex",
          }}
        />

        {/* Red glow bottom-right */}
        <div
          style={{
            position: "absolute",
            bottom: -100,
            right: -100,
            width: 500,
            height: 500,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(220,38,38,0.12) 0%, transparent 70%)",
            display: "flex",
          }}
        />

        {/* Main content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "60px 80px",
            height: "100%",
            position: "relative",
          }}
        >
          {/* Badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 24,
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "#ef4444",
                display: "flex",
              }}
            />
            <span
              style={{
                color: "#ef4444",
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
              }}
            >
              LIVE CONFLICT TRACKER
            </span>
          </div>

          {/* Title */}
          <div
            style={{
              fontSize: 82,
              fontWeight: 800,
              color: "#ffffff",
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              marginBottom: 24,
              display: "flex",
            }}
          >
            War Library
          </div>

          {/* Description */}
          <div
            style={{
              fontSize: 26,
              color: "#a1a1aa",
              lineHeight: 1.4,
              maxWidth: 700,
              display: "flex",
            }}
          >
            Real-time mapping of every verified conflict event across 60+ countries. Source-attributed. Open data.
          </div>

          {/* Stats bar */}
          <div
            style={{
              display: "flex",
              gap: 48,
              marginTop: 40,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span
                style={{
                  fontSize: 40,
                  fontWeight: 800,
                  color: "#f59e0b",
                }}
              >
                4,600+
              </span>
              <span style={{ fontSize: 15, color: "#71717a", marginTop: 2 }}>
                Verified Events
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span
                style={{
                  fontSize: 40,
                  fontWeight: 800,
                  color: "#f59e0b",
                }}
              >
                60+
              </span>
              <span style={{ fontSize: 15, color: "#71717a", marginTop: 2 }}>
                Countries
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span
                style={{
                  fontSize: 40,
                  fontWeight: 800,
                  color: "#f59e0b",
                }}
              >
                24/7
              </span>
              <span style={{ fontSize: 15, color: "#71717a", marginTop: 2 }}>
                Live Updates
              </span>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 4,
            background: "linear-gradient(90deg, #f59e0b, #ef4444, #f59e0b)",
            display: "flex",
          }}
        />

        {/* URL */}
        <div
          style={{
            position: "absolute",
            bottom: 24,
            right: 80,
            fontSize: 16,
            color: "#52525b",
            display: "flex",
          }}
        >
          warlibrary.midatlantic.ai
        </div>
      </div>
    ),
    { ...size }
  );
}
