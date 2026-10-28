import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getEventById,
  getRelatedEvents,
  isIndexable,
  isKinetic,
  countrySlug,
  getCountryBySlug,
} from "@/lib/event-store";
import {
  SITE_URL,
  SITE_NAME,
  eventTypeLabel,
  VERIFICATION_LABEL,
  PRECISION_LABEL,
  formatDate,
  excerpt,
  formatNumber,
} from "@/lib/site";
import { ldJson } from "@/components/seo/JsonLd";
import PageView from "@/components/analytics/PageView";
import SiteNav from "@/components/site/SiteNav";
import EventCard from "@/components/site/EventCard";

/**
 * One event, at a stable URL.
 *
 * Rendered per request (the root layout reads the locale cookie, so no page
 * on the site is statically cached; the edge caches these via
 * CDN-Cache-Control in next.config). Every event in the dataset has a page;
 * only those that clear the indexing gate (source link, confidence, location
 * precision) are marked indexable and listed in the sitemaps — the rest carry
 * `noindex` so a weak row can never be what a search engine shows.
 */
export const dynamicParams = true;

type Params = { params: Promise<{ id: string }> };

type EventRecord = NonNullable<ReturnType<typeof getEventById>>;

function placeName(event: EventRecord): string {
  return event.region && event.region !== event.country
    ? `${event.region}, ${event.country}`
    : event.country;
}

/** Short heading: type and place. */
function headline(event: EventRecord): string {
  return `${eventTypeLabel(event.event_type)} in ${placeName(event)}`;
}

/**
 * The <title>. Type + place + day alone repeated across thousands of pages
 * (47 pages once shared "Strategic development in Islamabad, Pakistan, 11
 * April 2026"), which is the duplicate-title pattern search engines punish.
 * The description's first clause makes each one specific.
 */
function pageTitle(event: EventRecord): string {
  return `${headline(event)}, ${formatDate(event.date)}: ${excerpt(event.description, 70)}`;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const event = getEventById(id);
  if (!event) return { title: "Event not found" };
  const title = pageTitle(event);
  const description = excerpt(event.description, 160);
  const url = `${SITE_URL}/event/${event.id}`;
  const indexable = isIndexable(event);
  return {
    title,
    description,
    alternates: { canonical: `/event/${event.id}` },
    robots: indexable
      ? { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } }
      : { index: false, follow: true },
    openGraph: {
      title,
      description,
      url,
      type: "article",
      siteName: SITE_NAME,
      publishedTime: Number.isNaN(new Date(event.date).getTime()) ? undefined : new Date(event.date).toISOString(),
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function EventPage({ params }: Params) {
  const { id } = await params;
  const event = getEventById(id);
  if (!event) notFound();

  const related = getRelatedEvents(event, 8);
  const slug = countrySlug(event.country);
  const country = slug ? getCountryBySlug(slug) : null;
  const title = pageTitle(event);
  const url = `${SITE_URL}/event/${event.id}`;
  const dateValid = !Number.isNaN(new Date(event.date).getTime());
  const day = dateValid ? event.date.slice(0, 10) : null;
  const mapHref = day
    ? `/?e=${event.id}&from=${day}&to=${day}${slug ? `&c=${slug}` : ""}`
    : `/?e=${event.id}`;
  const kinetic = isKinetic(event);

  // Article, not schema.org/Event: that type is for organised, attendable
  // events, and stamping it on tens of thousands of strike reports reads as
  // spammy structured data. This page is a dated record about a place.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: headline(event),
    description: excerpt(event.description, 300),
    datePublished: dateValid ? event.date : undefined,
    about: {
      "@type": "Place",
      name: placeName(event),
      address: { "@type": "PostalAddress", addressCountry: event.country },
      geo: {
        "@type": "GeoCoordinates",
        latitude: event.latitude,
        longitude: event.longitude,
      },
    },
    mainEntityOfPage: url,
    url,
    isAccessibleForFree: true,
    citation: event.source_url ?? undefined,
    author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
  };

  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: SITE_NAME, item: SITE_URL },
      ...(country
        ? [{ "@type": "ListItem", position: 2, name: country.name, item: `${SITE_URL}/country/${country.slug}` }]
        : []),
      { "@type": "ListItem", position: country ? 3 : 2, name: headline(event), item: url },
    ],
  };

  return (
    <div className="min-h-dvh bg-[#0a0a0a] text-zinc-200">
      <PageView page="event" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(breadcrumbs) }} />
      <SiteNav />

      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
        <nav aria-label="Breadcrumb" className="mb-4 text-xs text-zinc-500">
          <Link href="/" className="hover:text-zinc-300">War Library</Link>
          {country && (
            <>
              <span className="mx-1.5">/</span>
              <Link href={`/country/${country.slug}`} className="hover:text-zinc-300">{country.name}</Link>
            </>
          )}
          <span className="mx-1.5">/</span>
          <span className="text-zinc-400">{formatDate(event.date)}</span>
        </nav>

        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded px-2 py-0.5 font-semibold uppercase tracking-wider ${kinetic ? "bg-red-900/50 text-red-300" : "bg-blue-900/40 text-blue-300"}`}>
            {eventTypeLabel(event.event_type)}
          </span>
          {event.verification_status && (
            <span className="rounded border border-zinc-800 px-2 py-0.5 text-zinc-400">
              {VERIFICATION_LABEL[event.verification_status] ?? event.verification_status}
            </span>
          )}
          {!kinetic && (
            <span className="text-zinc-500">Development, not a kinetic event</span>
          )}
        </div>

        <h1 className="text-2xl font-bold leading-tight tracking-tight text-zinc-100 sm:text-3xl">
          {headline(event)}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">{formatDate(event.date)}</p>

        <p className="mt-5 text-base leading-relaxed text-zinc-300 sm:text-lg">
          {event.description}
        </p>

        {event.civilian_impact && (
          <p className="mt-4 rounded-lg border border-amber-900/40 bg-amber-950/20 p-3 text-sm text-amber-200/80">
            <span className="font-semibold">Civilian impact:</span> {event.civilian_impact}
          </p>
        )}

        <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-3 rounded-xl border border-zinc-800 bg-[#111] p-4 text-sm sm:grid-cols-2">
          <Row label="Date">
            {dateValid ? <time dateTime={event.date}>{formatDate(event.date)}</time> : event.date}
          </Row>
          <Row label="Country">
            {country ? <Link href={`/country/${country.slug}`} className="text-zinc-100 underline-offset-2 hover:underline">{country.name}</Link> : event.country}
          </Row>
          {event.region && <Row label="Region">{event.region}</Row>}
          <Row label="Coordinates">
            <span className="font-mono text-xs">{event.latitude.toFixed(4)}, {event.longitude.toFixed(4)}</span>
            {event.location_precision && (
              <span className="ms-2 text-xs text-zinc-500">{PRECISION_LABEL[event.location_precision] ?? event.location_precision}</span>
            )}
          </Row>
          <Row label="Fatalities">
            {event.fatalities && event.fatalities > 0 ? formatNumber(event.fatalities) : "None reported"}
          </Row>
          {event.actors && event.actors.length > 0 && (
            <Row label="Actors">{event.actors.join(", ")}</Row>
          )}
          {typeof event.confidence === "number" && (
            <Row label="Extraction confidence">{Math.round(event.confidence * 100)}%</Row>
          )}
          <Row label="Source">
            {event.source_url ? (
              <a href={event.source_url} target="_blank" rel="noopener noreferrer nofollow" className="text-zinc-100 underline-offset-2 hover:underline">
                {event.source}
              </a>
            ) : (
              event.source
            )}
          </Row>
        </dl>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={mapHref}
            className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-black hover:bg-white"
          >
            Open on the map
          </Link>
          {country && (
            <Link
              href={`/country/${country.slug}`}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-900"
            >
              All events in {country.name}
            </Link>
          )}
        </div>

        {related.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Nearby in time and place
            </h2>
            <ul className="space-y-2">
              {related.map((other) => (
                <li key={other.id}>
                  <EventCard event={other} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-10 border-t border-zinc-800 pt-4 text-xs leading-relaxed text-zinc-500">
          This record was extracted from the linked report by the War Library
          pipeline and carries its own source, confidence and verification
          status. Figures are as reported at the time; see{" "}
          <Link href="/sources" className="underline-offset-2 hover:underline">how events are verified</Link>.
          Event ID <span className="font-mono">{event.id}</span>.
        </p>
      </main>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-wider text-zinc-500">{label}</dt>
      <dd className="text-zinc-200">{children}</dd>
    </div>
  );
}
