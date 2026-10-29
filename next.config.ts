import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Short, guessable URLs for the two in-app tabs and the old tab name.
      { source: "/ask", destination: "/?tab=ask", permanent: true },
      { source: "/donate", destination: "/support", permanent: true },
      { source: "/feed", destination: "/?tab=feed", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      // Every page renders per request because the root layout reads the
      // locale cookie, and Next stamps dynamic pages `Cache-Control: private,
      // no-store`. Cloudflare honours CDN-Cache-Control independently, so the
      // public, locale-free pages are cached at the edge for a while anyway.
      // The pipeline writes every 30 minutes; these windows match that.
      ...[
        "/event/:id",
        "/country",
        "/country/:slug",
        "/event/:id/opengraph-image",
        "/country/:slug/opengraph-image",
        "/dispatch",
        "/dispatch/:kind/:key",
        "/dispatch/:kind/:key/opengraph-image",
        "/codebook",
      ].map((source) => ({
        source,
        headers: [{ key: "CDN-Cache-Control", value: "public, max-age=1800, stale-while-revalidate=3600" }],
      })),
      ...["/sitemap.xml", "/sitemaps/:name", "/feed.xml", "/dispatch/feed.xml", "/llms.txt"].map((source) => ({
        source,
        headers: [{ key: "CDN-Cache-Control", value: "public, max-age=1800, stale-while-revalidate=3600" }],
      })),
    ];
  },
};

export default nextConfig;
