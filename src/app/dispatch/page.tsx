import type { Metadata } from "next";
import Link from "next/link";
import { publishedDispatches, publishedAt } from "@/lib/dispatch-store";
import * as core from "@/lib/dispatch-core.cjs";
import type { Dispatch } from "@/lib/dispatch-core.cjs";
import { SITE_URL, SITE_NAME, DISPATCH_KIND_LABEL, formatDate, excerpt, formatNumber } from "@/lib/site";
import { ldJson } from "@/components/seo/JsonLd";
import PageView from "@/components/analytics/PageView";
import SiteNav from "@/components/site/SiteNav";
import NewsletterBox from "@/components/dispatch/NewsletterBox";

/**
 * Dispatch index: the latest daily on top, then every published daily,
 * weekly and monthly dispatch. Rendered per request; the edge caches it.
 */
export const dynamic = "force-dynamic";

const DAILY_LIMIT = 90;

export const metadata: Metadata = {
  title: "Dispatches: daily, weekly and monthly conflict digests",
  description:
    "Automated digests of the War Library dataset. Every number is computed from source-attributed events; the narrative is model-written, citation-checked and linked to the events it rests on.",
  alternates: { canonical: "/dispatch" },
  robots: { index: true, follow: true },
  openGraph: { title: "War Library dispatches", description: "Daily, weekly and monthly conflict digests, every figure computed from the data.", url: `${SITE_URL}/dispatch`, type: "website", siteName: SITE_NAME },
};

function Row({ d }: { d: Dispatch }) {
  const published = new Date(publishedAt(d)).toISOString();
  return (
    <li>
      <Link href={core.dispatchUrlPath(d.kind, d.key)} className="block rounded-lg border border-zinc-800 bg-[#111] p-3 transition-colors hover:border-zinc-700 hover:bg-[#151515]">
        <div className="mb-1 flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
          <span className="font-medium text-zinc-300">{d.window.label}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={published}>{formatDate(published)}</time>
          <span aria-hidden="true">·</span>
          <span>{formatNumber(d.stats.events)} events, {formatNumber(d.stats.kinetic)} kinetic</span>
        </div>
        <p className="text-sm font-semibold leading-snug text-zinc-100">{core.stripCitations(d.title)}</p>
        <p className="mt-1 text-sm text-zinc-400">{excerpt(core.stripCitations(d.lede), 200)}</p>
      </Link>
    </li>
  );
}

export default function DispatchIndexPage() {
  const daily = publishedDispatches("daily", DAILY_LIMIT);
  const weekly = publishedDispatches("weekly");
  const monthly = publishedDispatches("monthly");
  const latest = daily[0] ?? weekly[0] ?? monthly[0] ?? null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "War Library dispatches",
    url: `${SITE_URL}/dispatch`,
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
    hasPart: [...daily.slice(0, 10), ...weekly.slice(0, 4), ...monthly.slice(0, 2)].map((d) => ({
      "@type": "NewsArticle",
      headline: core.stripCitations(d.title),
      url: `${SITE_URL}${core.dispatchUrlPath(d.kind, d.key)}`,
      datePublished: new Date(publishedAt(d)).toISOString(),
    })),
  };

  return (
    <div className="min-h-dvh bg-[#0a0a0a] text-zinc-200">
      <PageView page="dispatch" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(jsonLd) }} />
      <SiteNav />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100 sm:text-3xl">Dispatches</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          A daily digest at 06:00 UTC, a weekly one on Mondays and a monthly one on the first of the month.
          The numbers are computed from the dataset in code; the narrative is model-written, every sentence
          must cite the event it rests on, and any sentence that does not is dropped before publication.{" "}
          <Link href="/codebook#dispatches" className="underline-offset-2 hover:underline">How this works</Link>
          {" · "}
          <a href="/dispatch/feed.xml" className="underline-offset-2 hover:underline">RSS</a>
        </p>

        {!latest && (
          <p className="mt-8 rounded-lg border border-zinc-800 bg-[#111] p-4 text-sm text-zinc-400">
            No dispatch has been published yet. The first daily dispatch appears the morning after the engine goes live.
          </p>
        )}

        {latest && (
          <section className="mt-8">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-red-300">Latest</h2>
            <Link href={core.dispatchUrlPath(latest.kind, latest.key)} className="block rounded-xl border border-zinc-700 bg-[#141414] p-5 transition-colors hover:border-zinc-600">
              <p className="text-xs text-zinc-500">{DISPATCH_KIND_LABEL[latest.kind]} · {latest.window.label}</p>
              <p className="mt-1 text-xl font-bold leading-tight text-zinc-100">{core.stripCitations(latest.title)}</p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-300">{excerpt(core.stripCitations(latest.lede), 320)}</p>
              <p className="mt-3 text-xs text-zinc-500">
                {formatNumber(latest.stats.events)} events · {formatNumber(latest.stats.kinetic)} kinetic · {formatNumber(latest.stats.fatalities)} fatalities as reported · {formatNumber(latest.stats.countries)} countries
              </p>
            </Link>
          </section>
        )}

        <NewsletterBox />

        {monthly.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Monthly</h2>
            <ul className="space-y-2">{monthly.map((d) => <Row key={d.key} d={d} />)}</ul>
          </section>
        )}
        {weekly.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Weekly</h2>
            <ul className="space-y-2">{weekly.map((d) => <Row key={d.key} d={d} />)}</ul>
          </section>
        )}
        {daily.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Daily</h2>
            <ul className="space-y-2">{daily.map((d) => <Row key={d.key} d={d} />)}</ul>
          </section>
        )}
      </main>
    </div>
  );
}
