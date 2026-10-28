import type { Metadata } from "next";
import Link from "next/link";
import { getCountries, countryStats } from "@/lib/event-store";
import { SITE_URL, formatNumber } from "@/lib/site";
import SiteNav from "@/components/site/SiteNav";

// Rendered per request: a build-time prerender would freeze whatever data the
// build machine had (the seed file in CI, or a stale snapshot) until the first
// revalidation. Ranking ~250 countries over the cached dataset is milliseconds.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Countries",
  description:
    "Every country with recorded conflict events, ranked by activity, with kinetic events, developments and reported fatalities for each.",
  alternates: { canonical: "/country" },
  openGraph: {
    title: "Countries | War Library",
    description: "Every country with recorded conflict events, ranked by activity.",
    url: `${SITE_URL}/country`,
    type: "website",
  },
};

export default function CountriesPage() {
  const rows = getCountries().map((entry) => ({ entry, stats: countryStats(entry) }));
  return (
    <div className="min-h-dvh bg-[#0a0a0a] text-zinc-200">
      <SiteNav />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:py-10">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-100">Countries</h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-400">
          Ranked by total recorded events. Kinetic events are strikes, attacks, battles and violence
          against civilians; developments are statements, deployments, sanctions and diplomacy.
        </p>
        <div className="mt-6 overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-[#111] text-xs uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-start">Country</th>
                <th className="px-3 py-2 text-end">Kinetic</th>
                <th className="px-3 py-2 text-end">Developments</th>
                <th className="px-3 py-2 text-end">Last 30 days</th>
                <th className="px-3 py-2 text-end">Fatalities</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ entry, stats }) => (
                <tr key={entry.slug} className="border-t border-zinc-800/70 hover:bg-[#111]">
                  <td className="px-3 py-2">
                    <Link href={`/country/${entry.slug}`} className="text-zinc-100 underline-offset-2 hover:underline">
                      {entry.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-end tabular-nums text-red-300">{formatNumber(stats.kinetic)}</td>
                  <td className="px-3 py-2 text-end tabular-nums text-zinc-400">{formatNumber(stats.developments)}</td>
                  <td className="px-3 py-2 text-end tabular-nums">{formatNumber(stats.last30)}</td>
                  <td className="px-3 py-2 text-end tabular-nums text-red-400">{formatNumber(stats.fatalities)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
