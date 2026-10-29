import { NextRequest, NextResponse } from "next/server";
import { pagesSitemap, countriesSitemap, eventsSitemap, dispatchesSitemap, newsSitemap } from "@/lib/sitemaps";

/**
 * /sitemaps/pages.xml, /sitemaps/countries.xml, /sitemaps/events-N.xml,
 * /sitemaps/dispatches.xml, /sitemaps/news.xml. Listed by the index at
 * /sitemap.xml.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ name: string }> }
) {
  const { name } = await context.params;
  let xml: string | null = null;

  if (name === "pages.xml") xml = pagesSitemap();
  else if (name === "countries.xml") xml = countriesSitemap();
  else if (name === "dispatches.xml") xml = dispatchesSitemap();
  else if (name === "news.xml") xml = newsSitemap();
  else {
    const match = /^events-(\d{1,4})\.xml$/.exec(name);
    if (match) xml = eventsSitemap(Number.parseInt(match[1], 10));
  }

  if (xml === null) {
    return new NextResponse("Not found", { status: 404 });
  }
  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // The news sitemap must reflect a publish within minutes.
      "Cache-Control": name === "news.xml" ? "public, max-age=300" : "public, max-age=1800, stale-while-revalidate=3600",
    },
  });
}
