import { NextResponse } from "next/server";
import { getDataset, isKinetic, isIndexable } from "@/lib/event-store";
import { SITE_URL, SITE_NAME, eventTypeLabel, excerpt, xmlEscape } from "@/lib/site";

/**
 * RSS 2.0 of the latest indexable kinetic events. Daily/weekly/monthly
 * dispatches get their own feed when they ship; this one exists so OSINT
 * readers and aggregators can follow the raw event stream today.
 */
export const dynamic = "force-dynamic";

const ITEMS = 50;

function rfc822(iso: string): string {
  const time = new Date(iso).getTime();
  return new Date(Number.isNaN(time) ? Date.now() : time).toUTCString();
}

export async function GET() {
  const dataset = getDataset();
  const items = dataset.events
    .filter((event) => isKinetic(event) && isIndexable(event))
    .slice(0, ITEMS);

  const lastBuild = rfc822(dataset.lastUpdated ?? new Date().toISOString());

  const body = items
    .map((event) => {
      const where = event.region && event.region !== event.country ? `${event.region}, ${event.country}` : event.country;
      const title = `${eventTypeLabel(event.event_type)} in ${where}`;
      const link = `${SITE_URL}/event/${event.id}`;
      const description = excerpt(event.description, 400) + (event.source ? ` (${event.source})` : "");
      return (
        `    <item>\n` +
        `      <title>${xmlEscape(title)}</title>\n` +
        `      <link>${xmlEscape(link)}</link>\n` +
        `      <guid isPermaLink="true">${xmlEscape(link)}</guid>\n` +
        `      <pubDate>${rfc822(event.date)}</pubDate>\n` +
        `      <category>${xmlEscape(event.country)}</category>\n` +
        `      <description>${xmlEscape(description)}</description>\n` +
        (event.source_url ? `      <source url="${xmlEscape(event.source_url)}">${xmlEscape(event.source)}</source>\n` : "") +
        `    </item>`
      );
    })
    .join("\n");

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n` +
    `  <channel>\n` +
    `    <title>${xmlEscape(SITE_NAME)}: latest verified conflict events</title>\n` +
    `    <link>${SITE_URL}/</link>\n` +
    `    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>\n` +
    `    <description>Source-attributed conflict events as they are recorded by the War Library pipeline. Each item links to the event's page and names its source.</description>\n` +
    `    <language>en</language>\n` +
    `    <lastBuildDate>${lastBuild}</lastBuildDate>\n` +
    `    <ttl>30</ttl>\n` +
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
