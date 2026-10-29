import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { readDispatch, neighbours, publishedAt } from "@/lib/dispatch-store";
import * as core from "@/lib/dispatch-core.cjs";
import type { Dispatch, DispatchKind } from "@/lib/dispatch-core.cjs";
import { countrySlug } from "@/lib/event-store";
import { SITE_URL, SITE_NAME, PUBLICATION_NAME, DISPATCH_KIND_LABEL, excerpt } from "@/lib/site";
import { resolveLocale, makeT, formatDateFor, formatNumberFor } from "@/i18n/server";
import { localeDir, textAttrs } from "@/i18n/locale";
import { localizeDispatch } from "@/lib/dispatch-i18n";
import { localizeEvent } from "@/lib/translation-store";
import { ldJson } from "@/components/seo/JsonLd";
import PageView from "@/components/analytics/PageView";
import SiteNav from "@/components/site/SiteNav";
import Cited from "@/components/dispatch/Cited";
import StatsTable from "@/components/dispatch/StatsTable";
import NewsletterBox from "@/components/dispatch/NewsletterBox";

/**
 * One dispatch. Only published dispatches render here (drafts are reviewed
 * in the admin); a draft or pulled dispatch is a 404 to the public, so a
 * pulled URL also drops out of the index on the next crawl. The narrative is
 * English and marked as such; headings, tables, dates and numbers follow the
 * reader's language.
 */
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ kind: string; key: string }>;
  /** `?original=1` shows the English record under a non-English interface. */
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const KIND_KEY = { daily: "pages.dailyDispatch", weekly: "pages.weeklyDispatch", monthly: "pages.monthlyDispatch" } as const;
const PRIOR_KEY = { daily: "pages.priorDay", weekly: "pages.priorWeek", monthly: "pages.priorMonth" } as const;

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

export default async function DispatchPage({ params, searchParams }: Params) {
  const { kind, key } = await params;
  const d = load(kind, key);
  if (!d) notFound();

  const locale = await resolveLocale();
  const t = makeT(locale);
  const query = searchParams ? await searchParams : {};
  // The narrative in the reader's language when the translator produced one.
  // `d` keeps the English record for metadata, JSON-LD and the feed.
  const text = localizeDispatch(d, locale, { original: query.original === "1" });
  const n = (v: number) => formatNumberFor(locale, v);
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
  const priorLabel = t(PRIOR_KEY[d.kind]);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: core.stripCitations(d.title),
    description: excerpt(core.stripCitations(d.lede), 300),
    datePublished: published.toISOString(),
    dateModified: d.edited_at ?? published.toISOString(),
    inLanguage: "en",
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
          <Link href="/" className="hover:text-zinc-300">{t("app.title")}</Link>
          <span className="mx-1.5">/</span>
          <Link href="/dispatch" className="hover:text-zinc-300">{t("pages.dispatches")}</Link>
          <span className="mx-1.5">/</span>
          <span className="text-zinc-400" lang="en">{d.window.label}</span>
        </nav>

        <p className="text-xs font-semibold uppercase tracking-widest text-red-300">{t(KIND_KEY[d.kind])}</p>
        <h1 className="mt-1 text-2xl font-bold leading-tight tracking-tight text-zinc-100 sm:text-3xl" lang={text.lang} dir={localeDir(text.lang)}>
          {core.stripCitations(text.title)}
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          <span lang="en">{d.window.label}</span> · {t("pages.published")} <time dateTime={published.toISOString()}>{formatDateFor(locale, published.toISOString())}</time>
          {d.edited_at && <> · {t("pages.edited")} {formatDateFor(locale, d.edited_at)}</>}
        </p>
        {locale !== "en" && (
          <p className="mt-2 text-xs text-zinc-500">
            {text.translated ? (
              <>
                {t("pages.machineTranslated")}{" "}
                <Link href={`${core.dispatchUrlPath(d.kind, d.key)}?original=1`} className="underline-offset-2 hover:underline">{t("pages.readInEnglish")}</Link>
              </>
            ) : (
              t("pages.englishContent")
            )}
          </p>
        )}

        <div lang={text.lang} dir={localeDir(text.lang)}>
          <p className="mt-5 text-base leading-relaxed text-zinc-200 sm:text-lg">
            <Cited text={text.lede} index={index} />
          </p>

          {text.sections.map((s, si) => (
            <section key={d.sections[si]?.heading ?? si} className="mt-8">
              <h2 className="mb-2 text-lg font-semibold text-zinc-100">{s.heading}</h2>
              {s.body.split(/\n{2,}/).map((para, i) => (
                <p key={i} className="mb-3 leading-relaxed text-zinc-300">
                  <Cited text={para} index={index} />
                </p>
              ))}
            </section>
          ))}

          {text.civilian_note && (
            <section className="mt-8 rounded-lg border border-amber-900/40 bg-amber-950/20 p-4">
              <h2 className="mb-1 text-sm font-semibold text-amber-200" lang={locale} dir={localeDir(locale)}>{t("pages.humanCost")}</h2>
              <p className="text-sm leading-relaxed text-amber-100/80"><Cited text={text.civilian_note} index={index} /></p>
            </section>
          )}
        </div>

        <section className="mt-10 rounded-xl border border-zinc-800 bg-[#111] p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">{t("pages.byTheNumbers")}</h2>
          <StatsTable stats={d.stats} diff={d.diff} priorLabel={priorLabel} locale={locale} t={t} />
          {d.stats.top_countries.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">{t("pages.mostActive")}</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-zinc-500">
                    <th className="py-1 text-start font-medium">{t("pages.thCountry")}</th>
                    <th className="py-1 text-end font-medium">{t("pages.thKinetic")}</th>
                    <th className="py-1 text-end font-medium">{t("pages.thAll")}</th>
                    <th className="py-1 text-end font-medium">{t("pages.thFatalities")}</th>
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
                        <td className="py-1 text-end text-zinc-100">{n(row.kinetic)}</td>
                        <td className="py-1 text-end text-zinc-100">{n(row.events)}</td>
                        <td className="py-1 text-end text-zinc-100">{n(row.fatalities)}</td>
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
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">{t("pages.eventsCited")}</h2>
            <ol className="space-y-2 text-sm">
              {citedList.map((e, i) => (
                <li key={order[i]} className="flex gap-3 rounded-lg border border-zinc-800 bg-[#111] p-3">
                  <span className="w-5 shrink-0 text-end font-mono text-xs text-zinc-500">{n(i + 1)}</span>
                  {e ? (
                    <div className="min-w-0">
                      <Link href={`/event/${e.id}`} className="text-zinc-100 underline-offset-2 hover:underline">
                        {t(`eventTypes.${e.event_type}`)} · {e.region && e.region !== e.country ? `${e.region}, ${e.country}` : e.country}
                      </Link>
                      <span className="text-zinc-500"> · {formatDateFor(locale, e.date)}{e.fatalities > 0 ? ` · ${t("pages.killedN", { n: n(e.fatalities) })}` : ""}</span>
                      <p className="mt-0.5 text-zinc-400" {...textAttrs(localizeEvent(e, locale).description_lang, locale)}>{excerpt(localizeEvent(e, locale).description, 180)}</p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {e.source_url ? <a href={e.source_url} target="_blank" rel="noopener noreferrer nofollow" className="underline-offset-2 hover:underline">{e.source}</a> : e.source}
                      </p>
                    </div>
                  ) : (
                    <Link href={`/event/${order[i]}`} className="text-zinc-300 underline-offset-2 hover:underline">{t("pages.eventId")} {order[i]}</Link>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        <nav aria-label="Other dispatches" className="mt-10 flex flex-wrap justify-between gap-3 text-sm">
          {prev ? (
            <Link href={core.dispatchUrlPath(prev.kind, prev.key)} className="rounded-lg border border-zinc-700 px-4 py-2 text-zinc-200 hover:bg-zinc-900">← <span lang="en">{prev.window.label}</span></Link>
          ) : <span />}
          {next ? (
            <Link href={core.dispatchUrlPath(next.kind, next.key)} className="rounded-lg border border-zinc-700 px-4 py-2 text-zinc-200 hover:bg-zinc-900"><span lang="en">{next.window.label}</span> →</Link>
          ) : (
            <Link href="/dispatch" className="rounded-lg border border-zinc-700 px-4 py-2 text-zinc-200 hover:bg-zinc-900">{t("pages.allDispatches")}</Link>
          )}
        </nav>

        <NewsletterBox t={t} locale={locale} />

        <p className="mt-10 border-t border-zinc-800 pt-4 text-xs leading-relaxed text-zinc-500">
          <span lang="en">{d.disclosure}</span>{" "}
          <Link href="/codebook#dispatches" className="underline-offset-2 hover:underline">{t("pages.howMade")}</Link>.
        </p>
      </main>
    </div>
  );
}
