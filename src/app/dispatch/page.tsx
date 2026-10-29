import type { Metadata } from "next";
import Link from "next/link";
import { publishedDispatches, publishedAt } from "@/lib/dispatch-store";
import * as core from "@/lib/dispatch-core.cjs";
import type { Dispatch } from "@/lib/dispatch-core.cjs";
import { SITE_URL, SITE_NAME, excerpt } from "@/lib/site";
import { resolveLocale, makeT, formatDateFor, formatNumberFor, type Translate } from "@/i18n/server";
import type { Locale } from "@/i18n/locale";
import { ldJson } from "@/components/seo/JsonLd";
import PageView from "@/components/analytics/PageView";
import SiteNav from "@/components/site/SiteNav";
import NewsletterBox from "@/components/dispatch/NewsletterBox";

/**
 * Dispatch index: the latest daily on top, then every published daily,
 * weekly and monthly dispatch. Rendered per request; the edge caches it.
 * The chrome follows the reader's language; dispatch text is English.
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

const KIND_KEY = { daily: "pages.dailyDispatch", weekly: "pages.weeklyDispatch", monthly: "pages.monthlyDispatch" } as const;

function Row({ d, locale, t }: { d: Dispatch; locale: Locale; t: Translate }) {
  const published = new Date(publishedAt(d)).toISOString();
  const n = (v: number) => formatNumberFor(locale, v);
  return (
    <li>
      <Link href={core.dispatchUrlPath(d.kind, d.key)} className="block rounded-lg border border-zinc-800 bg-[#111] p-3 transition-colors hover:border-zinc-700 hover:bg-[#151515]">
        <div className="mb-1 flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
          <span className="font-medium text-zinc-300" lang="en">{d.window.label}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={published}>{formatDateFor(locale, published)}</time>
          <span aria-hidden="true">·</span>
          <span>{t("pages.eventsKinetic", { events: n(d.stats.events), kinetic: n(d.stats.kinetic) })}</span>
        </div>
        <p className="text-sm font-semibold leading-snug text-zinc-100" lang="en" dir="ltr">{core.stripCitations(d.title)}</p>
        <p className="mt-1 text-sm text-zinc-400" lang="en" dir="ltr">{excerpt(core.stripCitations(d.lede), 200)}</p>
      </Link>
    </li>
  );
}

export default async function DispatchIndexPage() {
  const locale = await resolveLocale();
  const t = makeT(locale);
  const n = (v: number) => formatNumberFor(locale, v);
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
      inLanguage: "en",
    })),
  };

  return (
    <div className="min-h-dvh bg-[#0a0a0a] text-zinc-200">
      <PageView page="dispatch" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(jsonLd) }} />
      <SiteNav />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100 sm:text-3xl">{t("pages.dispatches")}</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          {t("pages.dispatchIntro")}{" "}
          <Link href="/codebook#dispatches" className="underline-offset-2 hover:underline">{t("pages.howThisWorks")}</Link>
          {" · "}
          <a href="/dispatch/feed.xml" className="underline-offset-2 hover:underline">RSS</a>
        </p>
        {locale !== "en" && <p className="mt-2 text-xs text-zinc-500">{t("pages.englishContent")}</p>}

        {!latest && (
          <p className="mt-8 rounded-lg border border-zinc-800 bg-[#111] p-4 text-sm text-zinc-400">{t("pages.noDispatchYet")}</p>
        )}

        {latest && (
          <section className="mt-8">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-red-300">{t("pages.latest")}</h2>
            <Link href={core.dispatchUrlPath(latest.kind, latest.key)} className="block rounded-xl border border-zinc-700 bg-[#141414] p-5 transition-colors hover:border-zinc-600">
              <p className="text-xs text-zinc-500">{t(KIND_KEY[latest.kind])} · <span lang="en">{latest.window.label}</span></p>
              <p className="mt-1 text-xl font-bold leading-tight text-zinc-100" lang="en" dir="ltr">{core.stripCitations(latest.title)}</p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-300" lang="en" dir="ltr">{excerpt(core.stripCitations(latest.lede), 320)}</p>
              <p className="mt-3 text-xs text-zinc-500">
                {t("pages.summaryLine", { events: n(latest.stats.events), kinetic: n(latest.stats.kinetic), fatalities: n(latest.stats.fatalities), countries: n(latest.stats.countries) })}
              </p>
            </Link>
          </section>
        )}

        <NewsletterBox t={t} />

        {monthly.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">{t("pages.monthlyHeading")}</h2>
            <ul className="space-y-2">{monthly.map((d) => <Row key={d.key} d={d} locale={locale} t={t} />)}</ul>
          </section>
        )}
        {weekly.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">{t("pages.weeklyHeading")}</h2>
            <ul className="space-y-2">{weekly.map((d) => <Row key={d.key} d={d} locale={locale} t={t} />)}</ul>
          </section>
        )}
        {daily.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">{t("pages.dailyHeading")}</h2>
            <ul className="space-y-2">{daily.map((d) => <Row key={d.key} d={d} locale={locale} t={t} />)}</ul>
          </section>
        )}
      </main>
    </div>
  );
}
