import { NextResponse } from "next/server";
import { getDataset, getIndexableEvents } from "@/lib/event-store";
import { publishedDispatches, recentlyPublished, publishedAt } from "@/lib/dispatch-store";
import { SITE_URL, xmlEscape } from "@/lib/site";
import { EVENTS_PER_SITEMAP, NEWS_SITEMAP_WINDOW_MS } from "@/lib/sitemaps";

/**
 * Sitemap index. Points at the pages sitemap, the countries sitemap, one
 * events sitemap per EVENTS_PER_SITEMAP indexable events, the dispatches
 * sitemap and (when something was published in the last two days) the
 * Google News sitemap. The old `sitemap.ts` listed exactly one URL — the
 * homepage — because the whole site was client-side tabs.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const dataset = getDataset();
  const lastmod = dataset.lastUpdated ?? new Date().toISOString();
  // Zero indexable events (a fresh checkout, CI) means no events sitemap at
  // all; listing an empty chunk would point the index at a 404.
  const eventCount = getIndexableEvents().length;
  const chunks = Math.ceil(eventCount / EVENTS_PER_SITEMAP);
  const hasDispatches = publishedDispatches(undefined, 1).length > 0;
  const now = Date.now();
  const hasNews = recentlyPublished(1).some((d) => now - publishedAt(d) <= NEWS_SITEMAP_WINDOW_MS);

  const entries = [
    `${SITE_URL}/sitemaps/pages.xml`,
    `${SITE_URL}/sitemaps/countries.xml`,
    ...Array.from({ length: chunks }, (_, i) => `${SITE_URL}/sitemaps/events-${i + 1}.xml`),
    ...(hasDispatches ? [`${SITE_URL}/sitemaps/dispatches.xml`] : []),
    ...(hasNews ? [`${SITE_URL}/sitemaps/news.xml`] : []),
  ];

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    entries
      .map((loc) => `  <sitemap><loc>${xmlEscape(loc)}</loc><lastmod>${lastmod}</lastmod></sitemap>`)
      .join("\n") +
    `\n</sitemapindex>\n`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=1800, stale-while-revalidate=3600",
    },
  });
}
