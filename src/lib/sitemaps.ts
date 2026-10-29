import { getCountries, countryStats, getIndexableEvents, getDataset } from "@/lib/event-store";
import { publishedDispatches, recentlyPublished, publishedAt } from "@/lib/dispatch-store";
import { stripCitations } from "@/lib/dispatch-core.cjs";
import { SITE_URL, PUBLICATION_NAME, xmlEscape } from "@/lib/site";

/** Google's cap is 50,000 URLs per file; smaller files regenerate faster. */
export const EVENTS_PER_SITEMAP = 5000;
/** Country hubs below this many events are rendered but not listed. */
export const COUNTRY_INDEX_MIN_EVENTS = 20;
/** Google News only reads articles published in the last two days. */
export const NEWS_SITEMAP_WINDOW_MS = 2 * 24 * 3600 * 1000;
export const NEWS_SITEMAP_MAX = 1000;

interface UrlEntry {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
}

function urlset(entries: UrlEntry[]): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    entries
      .map((e) => {
        const parts = [`<loc>${xmlEscape(e.loc)}</loc>`];
        if (e.lastmod) parts.push(`<lastmod>${e.lastmod}</lastmod>`);
        if (e.changefreq) parts.push(`<changefreq>${e.changefreq}</changefreq>`);
        if (e.priority) parts.push(`<priority>${e.priority}</priority>`);
        return `  <url>${parts.join("")}</url>`;
      })
      .join("\n") +
    `\n</urlset>\n`
  );
}

function isoDay(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

export function pagesSitemap(): string {
  const lastmod = getDataset().lastUpdated ?? new Date().toISOString();
  return urlset([
    { loc: `${SITE_URL}/`, lastmod, changefreq: "hourly", priority: "1.0" },
    { loc: `${SITE_URL}/dispatch`, lastmod, changefreq: "daily", priority: "0.9" },
    { loc: `${SITE_URL}/country`, lastmod, changefreq: "hourly", priority: "0.8" },
    { loc: `${SITE_URL}/about`, changefreq: "monthly", priority: "0.5" },
    { loc: `${SITE_URL}/sources`, changefreq: "monthly", priority: "0.5" },
    { loc: `${SITE_URL}/codebook`, changefreq: "monthly", priority: "0.5" },
    { loc: `${SITE_URL}/support`, changefreq: "monthly", priority: "0.5" },
  ]);
}

export function countriesSitemap(): string {
  const entries: UrlEntry[] = [];
  for (const entry of getCountries()) {
    const stats = countryStats(entry);
    if (stats.total < COUNTRY_INDEX_MIN_EVENTS) continue;
    entries.push({
      loc: `${SITE_URL}/country/${entry.slug}`,
      lastmod: isoDay(stats.lastDate),
      changefreq: stats.last7 > 0 ? "hourly" : "weekly",
      priority: stats.last30 > 0 ? "0.8" : "0.5",
    });
  }
  return urlset(entries);
}

/** `chunk` is 1-based. Returns null when the chunk is past the end. */
export function eventsSitemap(chunk: number): string | null {
  const indexable = getIndexableEvents();
  const start = (chunk - 1) * EVENTS_PER_SITEMAP;
  if (chunk < 1 || start >= indexable.length) return null;
  const slice = indexable.slice(start, start + EVENTS_PER_SITEMAP);
  return urlset(
    slice.map((event) => ({
      loc: `${SITE_URL}/event/${event.id}`,
      lastmod: isoDay(event.date),
      changefreq: "monthly",
      priority: "0.4",
    }))
  );
}

/** Every published dispatch. Null when there are none (so the index never lists an empty file). */
export function dispatchesSitemap(): string | null {
  const items = publishedDispatches();
  if (items.length === 0) return null;
  return urlset(
    items.map((d) => ({
      loc: `${SITE_URL}/dispatch/${d.kind}/${d.key}`,
      lastmod: new Date(publishedAt(d)).toISOString(),
      changefreq: d.kind === "daily" ? "never" : "weekly",
      priority: d.kind === "daily" ? "0.7" : "0.8",
    }))
  );
}

/**
 * Google News sitemap: dispatches published in the last two days, newest
 * first, at most 1,000 entries, with the news namespace. Null when empty.
 */
export function newsSitemap(now = Date.now()): string | null {
  const recent = recentlyPublished(NEWS_SITEMAP_MAX).filter((d) => now - publishedAt(d) <= NEWS_SITEMAP_WINDOW_MS);
  if (recent.length === 0) return null;
  const body = recent
    .map((d) => {
      const loc = `${SITE_URL}/dispatch/${d.kind}/${d.key}`;
      const date = new Date(publishedAt(d)).toISOString();
      return (
        `  <url>\n` +
        `    <loc>${xmlEscape(loc)}</loc>\n` +
        `    <news:news>\n` +
        `      <news:publication><news:name>${xmlEscape(PUBLICATION_NAME)}</news:name><news:language>en</news:language></news:publication>\n` +
        `      <news:publication_date>${date}</news:publication_date>\n` +
        `      <news:title>${xmlEscape(stripCitations(d.title))}</news:title>\n` +
        `    </news:news>\n` +
        `  </url>`
      );
    })
    .join("\n");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n` +
    `${body}\n</urlset>\n`
  );
}
