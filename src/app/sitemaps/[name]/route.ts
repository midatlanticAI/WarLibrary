import { NextRequest, NextResponse } from "next/server";
import { pagesSitemap, countriesSitemap, eventsSitemap } from "@/lib/sitemaps";

/**
 * /sitemaps/pages.xml, /sitemaps/countries.xml, /sitemaps/events-N.xml
 * Listed by the index at /sitemap.xml.
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
      "Cache-Control": "public, max-age=1800, stale-while-revalidate=3600",
    },
  });
}
