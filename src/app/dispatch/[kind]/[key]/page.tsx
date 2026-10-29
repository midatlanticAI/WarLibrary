import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { readDispatch, neighbours, publishedAt } from "@/lib/dispatch-store";
import * as core from "@/lib/dispatch-core.cjs";
import type { Dispatch, DispatchKind } from "@/lib/dispatch-core.cjs";
import { countrySlug } from "@/lib/event-store";
import { SITE_URL, SITE_NAME, PUBLICATION_NAME, DISPATCH_KIND_LABEL, formatDate, excerpt, formatNumber, eventTypeLabel } from "@/lib/site";
import { ldJson } from "@/components/seo/JsonLd";
import PageView from "@/components/analytics/PageView";
import SiteNav from "@/components/site/SiteNav";
import Cited from "@/components/dispatch/Cited";
import StatsTable from "@/components/dispatch/StatsTable";
import NewsletterBox from "@/components/dispatch/NewsletterBox";

/**
 * One dispatch. Only published dispatches render here (drafts are reviewed
 * in the admin); a draft or pulled dispatch is a 404 to the public, so a
 * pulled URL also drops out of the index on the next crawl.
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ kind: string; key: string }> };

function load(kind: string, key: string): Dispatch | null {
  if (!core.isKind(kind) || !core.isValidKey(kind, key)) return null;
  const dispatch = readDispatch(kind as DispatchKind, key);
  if (!dispatch || !core.isPublished(dispatch)) return null;
  return dispatch;
}

function pageTitle(d: Dispatch): string {
  return `${core.stripCitations(d.title)} — ${DISPATCH_KIND_LABEL[d.kind]}, ${d.window.label}`;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { kind, key } = await params;
  const d = load(kind, key);
  if (!d) return { title: "Dispatch not found", robots: { index: false, follow: false } };
  const title = pageTitle(d);
  const description = excerpt(core.stripCitations(d.lede), 160);
  const url = `${SITE_URL}${core.dispatchUrlPath(d.kind, d.key)}`;
  const published = new Date(publishedAt(d)).toISOString();
  return {
    title,
    description,
    alternates: { canonical: core.dispatchUrlPath(d.kind, d.key) },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
    openGraph: { title, description, url, type: "article", siteName: SITE_NAME, publishedTime: published, modifiedTime: d.edited_at ?? published },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function DispatchPage({ params }: Params) {
  const { kind, key } = await params;
  const d = load(kind, key);
  if (!d) notFound();

  const url = `${SITE_URL}${core.dispatchUrlPath(d.kind, d.key)}`;
  const published = new Date(publishedAt(d));
  const { prev, next } = neighbours(d);

  // Number the cited events in order of first appearance so every superscript
  // on the page points at a row in the list below.
  const order: string[] = [];
  const seen = new Set<string>();
  const re = new RegExp(core.CITATION_RE.source, "g");
  for (const text of [d.lede, ...d.sections.map((s) => s.body), d.civilian_note ?? ""]) {
    for (const m of text.matchAll(re)) {
      if (!seen.has(m[1])) {
        seen.add(m[1]);
        order.push(m[1]);
      }
    }
  }
  for (const s of d.sections) for (const id of s.event_ids) if (!seen.has(id)) { seen.add(id); order.push(id); }
  const index: Record<string, number> = {};
  order.forEach((id, i) => { index[id] = i + 1; });
  const byId = new Map(d.top_events.map((e) => [e.id, e]));
  const citedList = order.map((id) => byId.get(id) ?? null);
  const priorLabel = d.kind === "daily" ? "the day before" : d.kind === "weekly" ? "the week before" : "the month before";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: core.stripCitations(d.title),
    description: excerpt(core.stripCitations(d.lede), 300),
    datePublished: published.toISOString(),
    dateModified: d.edited_at ?? published.toISOString(),
    image: [`${url}/opengraph-image`],
    mainEntityOfPage: url,
    url,
    isAccessibleForFree: true,
    articleSection: DISPATCH_KIND_LABEL[d.kind],
    author: { "@type": "Organization", name: PUBLICATION_NAME, url: SITE_URL },
    publisher: { "@type": "Organization", name: PUBLICATION_NAME, url: SITE_URL, logo: { "@type": "ImageObject", url: `${SITE_URL}/icons/icon-512.png` } },
    citation: d.top_events.map((e) => `${SITE_URL}/event/${e.id}`),
  };
  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: SITE_NAME, item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Dispatches", item: `${SITE_URL}/dispatch` },
      { "@type": "ListItem", position: 3, name: core.stripCitations(d.title), item: url },
    ],
  };

  return (
    <div className="min-h-dvh bg-[#0a0a0a] text-zinc-200">
      <PageView page="dispatch" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(breadcrumbs) }} />
      <SiteNav />

      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
        <nav aria-label="Breadcrumb" className="mb-4 text-xs text-zinc-500">
          <Link href="/" className="hover:text-zinc-300">War Library</Link>
          <span className="mx-1.5">/</span>
          <Link href="/dispatch" className="hover:text-zinc-300">Dispatches</Link>
          <span className="mx-1.5">/</span>
          <span className="text-zinc-400">{d.window.label}</span>
        </nav>

        <p className="text-xs font-semibold uppercase tracking-widest text-red-300">{DISPATCH_KIND_LABEL[d.kind]}</p>
        <h1 className="mt-1 text-2xl font-bold leading-tight tracking-tight text-zinc-100 sm:text-3xl">
          {core.stripCitations(d.title)}
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          {d.window.label} · published <time dateTime={published.toISOString()}>{formatDate(published.toISOString())}</time>
          {d.edited_at && <> · edited {formatDate(d.edited_at)}</>}
        </p>

        <p className="mt-5 text-base leading-relaxed text-zinc-200 sm:text-lg">
          <Cited text={d.lede} index={index} />
        </p>

        {d.sections.map((s) => (
          <section key={s.heading} className="mt-8">
            <h2 className="mb-2 text-lg font-semibold text-zinc-100">{s.heading}</h2>
            {s.body.split(/\n{2,}/).map((para, i) => (
              <p key={i} className="mb-3 leading-relaxed text-zinc-300">
                <Cited text={para} index={index} />
              </p>
            ))}
          </section>
        ))}

        {d.civilian_note && (
          <section className="mt-8 rounded-lg border border-amber-900/40 bg-amber-950/20 p-4">
            <h2 className="mb-1 text-sm font-semibold text-amber-200">The human cost</h2>
            <p className="text-sm leading-relaxed text-amber-100/80"><Cited text={d.civilian_note} index={index} /></p>
          </section>
        )}

        <section className="mt-10 rounded-xl border border-zinc-800 bg-[#111] p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">By the numbers</h2>
          <StatsTable stats={d.stats} diff={d.diff} priorLabel={priorLabel} />
          {d.stats.top_countries.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">Most active countries</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-zinc-500">
                    <th className="py-1 font-medium">Country</th>
                    <th className="py-1 text-right font-medium">Kinetic</th>
                    <th className="py-1 text-right font-medium">All events</th>
                    <th className="py-1 text-right font-medium">Fatalities</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {d.stats.top_countries.map((row) => {
                    const slug = countrySlug(row.name);
                    return (
                      <tr key={row.name}>
                        <td className="py-1 text-zinc-300">
                          {slug ? <Link href={`/country/${slug}`} className="underline-offset-2 hover:underline">{row.name}</Link> : row.name}
                        </td>
                        <td className="py-1 text-right text-zinc-100">{formatNumber(row.kinetic)}</td>
                        <td className="py-1 text-right text-zinc-100">{formatNumber(row.events)}</td>
                        <td className="py-1 text-right text-zinc-100">{formatNumber(row.fatalities)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {citedList.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Events cited</h2>
            <ol className="space-y-2 text-sm">
              {citedList.map((e, i) => (
                <li key={order[i]} className="flex gap-3 rounded-lg border border-zinc-800 bg-[#111] p-3">
                  <span className="w-5 shrink-0 text-right font-mono text-xs text-zinc-500">{i + 1}</span>
                  {e ? (
                    <div className="min-w-0">
                      <Link href={`/event/${e.id}`} className="text-zinc-100 underline-offset-2 hover:underline">
                        {eventTypeLabel(e.event_type)} in {e.region && e.region !== e.country ? `${e.region}, ${e.country}` : e.country}
                      </Link>
                      <span className="text-zinc-500"> · {formatDate(e.date)}{e.fatalities > 0 ? ` · ${formatNumber(e.fatalities)} killed` : ""}</span>
                      <p className="mt-0.5 text-zinc-400">{excerpt(e.description, 180)}</p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {e.source_url ? <a href={e.source_url} target="_blank" rel="noopener noreferrer nofollow" className="underline-offset-2 hover:underline">{e.source}</a> : e.source}
                      </p>
                    </div>
                  ) : (
                    <Link href={`/event/${order[i]}`} className="text-zinc-300 underline-offset-2 hover:underline">Event {order[i]}</Link>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        <nav aria-label="Other dispatches" className="mt-10 flex flex-wrap justify-between gap-3 text-sm">
          {prev ? (
            <Link href={core.dispatchUrlPath(prev.kind, prev.key)} className="rounded-lg border border-zinc-700 px-4 py-2 text-zinc-200 hover:bg-zinc-900">← {prev.window.label}</Link>
          ) : <span />}
          {next ? (
            <Link href={core.dispatchUrlPath(next.kind, next.key)} className="rounded-lg border border-zinc-700 px-4 py-2 text-zinc-200 hover:bg-zinc-900">{next.window.label} →</Link>
          ) : (
            <Link href="/dispatch" className="rounded-lg border border-zinc-700 px-4 py-2 text-zinc-200 hover:bg-zinc-900">All dispatches</Link>
          )}
        </nav>

        <NewsletterBox />

        <p className="mt-10 border-t border-zinc-800 pt-4 text-xs leading-relaxed text-zinc-500">
          {d.disclosure} Read{" "}
          <Link href="/codebook#dispatches" className="underline-offset-2 hover:underline">how dispatches are made</Link>.
        </p>
      </main>
    </div>
  );
}
