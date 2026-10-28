import { NextResponse } from "next/server";
import { getDataset, getIndexableEvents } from "@/lib/event-store";
import { SITE_URL, xmlEscape } from "@/lib/site";
import { EVENTS_PER_SITEMAP } from "@/lib/sitemaps";

/**
 * Sitemap index. Points at the pages sitemap, the countries sitemap and one
 * events sitemap per EVENTS_PER_SITEMAP indexable events. The old
 * `sitemap.ts` listed exactly one URL — the homepage — because the whole site
 * was client-side tabs. Rebuilt whenever the dataset changes.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const dataset = getDataset();
  const lastmod = dataset.lastUpdated ?? new Date().toISOString();
  // Zero indexable events (a fresh checkout, CI) means no events sitemap at
  // all; listing an empty chunk would point the index at a 404.
  const eventCount = getIndexableEvents().length;
  const chunks = Math.ceil(eventCount / EVENTS_PER_SITEMAP);

  const entries = [
    `${SITE_URL}/sitemaps/pages.xml`,
    `${SITE_URL}/sitemaps/countries.xml`,
    ...Array.from({ length: chunks }, (_, i) => `${SITE_URL}/sitemaps/events-${i + 1}.xml`),
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
