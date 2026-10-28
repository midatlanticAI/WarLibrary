import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCountryBySlug, countryStats, isKinetic, isIndexable } from "@/lib/event-store";
import { COUNTRY_INDEX_MIN_EVENTS } from "@/lib/sitemaps";
import { SITE_URL, SITE_NAME, eventTypeLabel, formatDate, formatNumber } from "@/lib/site";
import { ldJson } from "@/components/seo/JsonLd";
import PageView from "@/components/analytics/PageView";
import SiteNav from "@/components/site/SiteNav";
import EventCard from "@/components/site/EventCard";

/**
 * Country hub: the numbers, the trend, the latest events, and a way into the
 * map with this country in view. Rendered per request (see the note in
 * event/[id]/page.tsx); the edge caches it for 30 minutes, the pipeline's
 * cadence.
 */
export const dynamicParams = true;

type Params = { params: Promise<{ slug: string }> };

const LATEST_LIMIT = 50;

/** Gate and title must use the same number; "0 events" on an indexed hub was the alternative. */
function hubTitle(name: string, stats: ReturnType<typeof countryStats>): string {
  return `${name} conflict tracker: ${formatNumber(stats.kinetic)} kinetic events, ${formatNumber(stats.developments)} developments`;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const entry = getCountryBySlug(slug);
  if (!entry) return { title: "Country not found" };
  const stats = countryStats(entry);
  const title = hubTitle(entry.name, stats);
  const description = `${formatNumber(stats.kinetic)} kinetic events and ${formatNumber(stats.developments)} developments recorded in ${entry.name} since ${stats.firstDate ? formatDate(stats.firstDate) : "the start of tracking"}, ${formatNumber(stats.last30)} in the last 30 days. Every event is source-attributed with a confidence and verification status.`;
  return {
    title,
    description,
    alternates: { canonical: `/country/${entry.slug}` },
    robots: stats.total >= COUNTRY_INDEX_MIN_EVENTS
      ? { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } }
      : { index: false, follow: true },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/country/${entry.slug}`,
      type: "website",
      siteName: SITE_NAME,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function CountryPage({ params }: Params) {
  const { slug } = await params;
  const entry = getCountryBySlug(slug);
  if (!entry) notFound();

  const stats = countryStats(entry);
  const latest = entry.events.slice(0, LATEST_LIMIT);
  const latestKinetic = entry.events.filter(isKinetic).slice(0, LATEST_LIMIT);
  const indexableCount = entry.events.filter(isIndexable).length;
  const typeRows = Object.entries(stats.byType).sort((a, b) => b[1] - a[1]);
  const maxType = typeRows[0]?.[1] ?? 1;
  const url = `${SITE_URL}/country/${entry.slug}`;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const mapHref = `/?c=${entry.slug}&from=${thirtyDaysAgo}&to=${today}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: `${entry.name} conflict events`,
    description: `Source-attributed conflict events recorded in ${entry.name} by War Library.`,
    url,
    isPartOf: { "@type": "Dataset", name: "War Library Conflict Events Dataset", url: `${SITE_URL}/api/events` },
    temporalCoverage: stats.firstDate && stats.lastDate ? `${stats.firstDate.slice(0, 10)}/${stats.lastDate.slice(0, 10)}` : undefined,
    spatialCoverage: { "@type": "Place", name: entry.name },
    isAccessibleForFree: true,
    license: "https://opensource.org/licenses/MIT",
    creator: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
  };
  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: SITE_NAME, item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Countries", item: `${SITE_URL}/country` },
      { "@type": "ListItem", position: 3, name: entry.name, item: url },
    ],
  };

  return (
    <div className="min-h-dvh bg-[#0a0a0a] text-zinc-200">
      <PageView page="country" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(breadcrumbs) }} />
      <SiteNav />

      <main className="mx-auto max-w-4xl px-4 py-6 sm:py-10">
        <nav aria-label="Breadcrumb" className="mb-4 text-xs text-zinc-500">
          <Link href="/" className="hover:text-zinc-300">War Library</Link>
          <span className="mx-1.5">/</span>
          <Link href="/country" className="hover:text-zinc-300">Countries</Link>
          <span className="mx-1.5">/</span>
          <span className="text-zinc-400">{entry.name}</span>
        </nav>

        <h1 className="text-3xl font-bold tracking-tight text-zinc-100 sm:text-4xl">{entry.name}</h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-400">
          Conflict events recorded in {entry.name}
          {stats.firstDate ? ` since ${formatDate(stats.firstDate)}` : ""}, updated every 30 minutes
          from source-attributed reporting. Kinetic events are strikes, attacks, battles and violence
          against civilians; developments are statements, deployments, sanctions and diplomacy.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Kinetic events" value={formatNumber(stats.kinetic)} tone="text-red-300" />
          <Stat label="Developments" value={formatNumber(stats.developments)} tone="text-blue-300" />
          <Stat label="Last 30 days" value={formatNumber(stats.last30)} sub={`${formatNumber(stats.last7)} in the last 7`} />
          <Stat label="Reported fatalities" value={formatNumber(stats.fatalities)} sub={`${formatNumber(stats.fatalitiesLast30)} in the last 30 days`} tone="text-red-400" />
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <Link href={mapHref} className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-black hover:bg-white">
            Open {entry.name} on the map (last 30 days)
          </Link>
          <a href={`/api/events?country=${entry.slug}&from=${thirtyDaysAgo}`} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-900">
            JSON for {entry.name}, last 30 days
          </a>
        </div>

        <section className="mt-10 grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">By event type</h2>
            <ul className="space-y-2">
              {typeRows.map(([type, count]) => (
                <li key={type} className="text-sm">
                  <div className="mb-1 flex justify-between text-zinc-300">
                    <span>{eventTypeLabel(type)}</span>
                    <span className="tabular-nums text-zinc-500">{formatNumber(count)}</span>
                  </div>
                  <div className="h-1.5 w-full rounded bg-zinc-900">
                    <div className="h-1.5 rounded bg-zinc-600" style={{ width: `${Math.max(2, (count / maxType) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Verification</h2>
            <ul className="space-y-1.5 text-sm">
              {Object.entries(stats.byVerification).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
                <li key={status} className="flex justify-between text-zinc-300">
                  <span className="capitalize">{status}</span>
                  <span className="tabular-nums text-zinc-500">{formatNumber(count)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs leading-relaxed text-zinc-500">
              {formatNumber(indexableCount)} of these events carry a source link, a confidence of 0.7 or
              higher and a location more precise than the country centroid. Those are the ones listed in
              the sitemaps; every event still has its own page.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Latest kinetic events
          </h2>
          {latestKinetic.length === 0 ? (
            <p className="text-sm text-zinc-500">No kinetic events recorded.</p>
          ) : (
            <ul className="space-y-2">
              {latestKinetic.map((event) => (
                <li key={event.id}><EventCard event={event} /></li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-10">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Latest developments and all events
          </h2>
          <ul className="space-y-2">
            {latest.filter((event) => !isKinetic(event)).slice(0, 25).map((event) => (
              <li key={event.id}><EventCard event={event} /></li>
            ))}
          </ul>
        </section>

        <p className="mt-10 border-t border-zinc-800 pt-4 text-xs leading-relaxed text-zinc-500">
          Counts are computed from the dataset at render time. Fatality figures are the sum of what
          each source reported per event and are not de-duplicated across reports of the same
          incident. See <Link href="/sources" className="underline-offset-2 hover:underline">sources and verification</Link>.
        </p>
      </main>
    </div>
  );
}

function Stat({ label, value, sub, tone = "text-zinc-100" }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-[#111] p-3">
      <div className={`text-2xl font-bold tabular-nums ${tone}`}>{value}</div>
      <div className="text-xs text-zinc-500">{label}</div>
      {sub && <div className="mt-0.5 text-[11px] text-zinc-600">{sub}</div>}
    </div>
  );
}
