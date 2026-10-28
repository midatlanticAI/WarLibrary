import crypto from "crypto";
import fs from "fs";
import path from "path";

/**
 * Helpers for the per-page social images (1200x630).
 *
 * The map backdrop comes from the Mapbox Static Images API, so a shared
 * event or country card shows where it happened rather than a logo. The
 * token is the same public token the browser map uses. When it is missing
 * (CI, a fresh checkout) the cards render without a map.
 *
 * Every page on this site renders per request (the root layout reads the
 * locale cookie, which opts the whole tree out of static caching), so the
 * Mapbox PNGs are cached on disk here, keyed by the request URL, for a day.
 * Without that, each crawler or social fetch of a card would be a live
 * Mapbox call and a Satori render on the droplet.
 */
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const STYLE = "mapbox/dark-v11";
const CACHE_DIR = path.join(process.cwd(), ".cache", "og-maps");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function token(): string | null {
  return process.env.NEXT_PUBLIC_MAPBOX_TOKEN || null;
}

export function pointMapUrl(lon: number, lat: number, zoom: number, color = "ef4444"): string | null {
  const t = token();
  if (!t) return null;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  const pin = `pin-l+${color}(${lon.toFixed(4)},${lat.toFixed(4)})`;
  return `https://api.mapbox.com/styles/v1/${STYLE}/static/${pin}/${lon.toFixed(4)},${lat.toFixed(4)},${zoom},0/${OG_WIDTH}x${OG_HEIGHT}?access_token=${encodeURIComponent(t)}&attribution=false&logo=false`;
}

/**
 * Up to `limit` points over a viewport fitted to those points (with
 * padding). Points go in as a GeoJSON overlay, which Mapbox renders as small
 * markers. One point, or points that all share a coordinate, fall back to a
 * single pin at a fixed zoom: a zero-area bounding box is rejected upstream.
 */
export function pointsMapUrl(
  points: { lon: number; lat: number; color?: string }[],
  limit = 60
): string | null {
  const t = token();
  if (!t) return null;
  const valid = points.filter((p) => Number.isFinite(p.lon) && Number.isFinite(p.lat));
  if (valid.length === 0) return null;
  const lons = valid.map((p) => p.lon);
  const lats = valid.map((p) => p.lat);
  const span = Math.max(Math.max(...lons) - Math.min(...lons), Math.max(...lats) - Math.min(...lats));
  if (valid.length === 1 || span < 0.05) {
    return pointMapUrl(valid[0].lon, valid[0].lat, 6, valid[0].color);
  }
  const features = valid.slice(0, limit).map((p) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [Number(p.lon.toFixed(3)), Number(p.lat.toFixed(3))] },
    properties: { "marker-color": `#${p.color ?? "ef4444"}`, "marker-size": "small" },
  }));
  const overlay = `geojson(${encodeURIComponent(JSON.stringify({ type: "FeatureCollection", features }))})`;
  const url = `https://api.mapbox.com/styles/v1/${STYLE}/static/${overlay}/auto/${OG_WIDTH}x${OG_HEIGHT}?padding=80&access_token=${encodeURIComponent(t)}&attribution=false&logo=false`;
  // The static API rejects URLs past ~8 KB; fall back to fewer points.
  if (url.length > 7500 && limit > 10) return pointsMapUrl(points, Math.floor(limit / 2));
  return url;
}

function cachePath(url: string): string {
  // The token is part of the URL; hash it so it never lands on disk in clear.
  const key = crypto.createHash("sha1").update(url).digest("hex");
  return path.join(CACHE_DIR, `${key}.bin`);
}

function readCache(file: string): string | null {
  try {
    const stat = fs.statSync(file);
    if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) return null;
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function writeCache(file: string, dataUrl: string): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, dataUrl, "utf8");
    fs.renameSync(tmp, file);
  } catch (err) {
    console.warn("[og] map cache write failed:", err instanceof Error ? err.message : err);
  }
}

/** Fetch the backdrop as a data URL so Satori never does its own network I/O. */
export async function fetchMapDataUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  const file = cachePath(url);
  const cached = readCache(file);
  if (cached) return cached;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000), cache: "no-store" });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const dataUrl = `data:${res.headers.get("content-type") ?? "image/png"};base64,${buf.toString("base64")}`;
    writeCache(file, dataUrl);
    return dataUrl;
  } catch {
    return null;
  }
}
