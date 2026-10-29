import { NextResponse } from "next/server";
import { recentlyPublished, publishedAt } from "@/lib/dispatch-store";
import * as core from "@/lib/dispatch-core.cjs";
import { SITE_URL, SITE_NAME, DISPATCH_KIND_LABEL, xmlEscape, formatNumber } from "@/lib/site";

/**
 * RSS 2.0 of published dispatches. This is the feed the RSS-to-email
 * newsletter and the social draft hook read, so each item carries the full
 * lede and the headline numbers, not just a title.
 */
export const dynamic = "force-dynamic";

const ITEMS = 50;

export async function GET() {
  const items = recentlyPublished(ITEMS);
  const lastBuild = new Date(items[0] ? publishedAt(items[0]) : Date.now()).toUTCString();

  const body = items
    .map((d) => {
      const link = `${SITE_URL}${core.dispatchUrlPath(d.kind, d.key)}`;
      const numbers = `${formatNumber(d.stats.events)} events, ${formatNumber(d.stats.kinetic)} kinetic, ${formatNumber(d.stats.fatalities)} fatalities as reported, ${formatNumber(d.stats.countries)} countries.`;
      const description = `${core.stripCitations(d.lede)} ${numbers}`;
      return (
        `    <item>\n` +
        `      <title>${xmlEscape(`${core.stripCitations(d.title)} (${DISPATCH_KIND_LABEL[d.kind]}, ${d.window.label})`)}</title>\n` +
        `      <link>${xmlEscape(link)}</link>\n` +
        `      <guid isPermaLink="true">${xmlEscape(link)}</guid>\n` +
        `      <pubDate>${new Date(publishedAt(d)).toUTCString()}</pubDate>\n` +
        `      <category>${xmlEscape(DISPATCH_KIND_LABEL[d.kind])}</category>\n` +
        `      <description>${xmlEscape(description)}</description>\n` +
        `    </item>`
      );
    })
    .join("\n");

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n` +
    `  <channel>\n` +
    `    <title>${xmlEscape(SITE_NAME)} dispatches</title>\n` +
    `    <link>${SITE_URL}/dispatch</link>\n` +
    `    <atom:link href="${SITE_URL}/dispatch/feed.xml" rel="self" type="application/rss+xml"/>\n` +
    `    <description>Daily, weekly and monthly digests of the War Library conflict dataset. Figures computed from source-attributed events; narrative model-generated and citation-checked.</description>\n` +
    `    <language>en</language>\n` +
    `    <lastBuildDate>${lastBuild}</lastBuildDate>\n` +
    `    <ttl>60</ttl>\n` +
    `${body}\n` +
    `  </channel>\n` +
    `</rss>\n`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=900, stale-while-revalidate=3600",
    },
  });
}
