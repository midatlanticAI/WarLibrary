import type { Metadata } from "next";
import Link from "next/link";
import { getConflicts, conflictLabel } from "@/lib/conflicts";
import { SITE_URL, SITE_NAME } from "@/lib/site";
import { INDEX_MIN_CONFIDENCE } from "@/lib/event-store";
import { DISCLOSURE } from "@/lib/dispatch-core.cjs";
import PageView from "@/components/analytics/PageView";
import SiteNav from "@/components/site/SiteNav";

/**
 * The codebook: what every field means, every allowed value, every rule the
 * pipeline applies, and a changelog. ACLED's codebook is the model; this one
 * is shorter and links to the evidence quotes. Static content, rendered per
 * request like everything else.
 */
export const metadata: Metadata = {
  title: "Codebook: fields, values and rules of the War Library dataset",
  description:
    "Every field in a War Library event record, its allowed values, how verification, fatalities, locations and sources are recorded, how dispatches are generated, and a changelog of the schema.",
  alternates: { canonical: "/codebook" },
  robots: { index: true, follow: true },
  openGraph: { title: "War Library codebook", description: "Fields, values and rules of the dataset.", url: `${SITE_URL}/codebook`, type: "article", siteName: SITE_NAME },
};

const FIELDS: { name: string; type: string; meaning: string; since?: string }[] = [
  { name: "id", type: "string (12 hex)", meaning: "Content-derived identifier: SHA-1 of date, latitude, longitude and the first 120 characters of the description. Stable across pipeline runs." },
  { name: "conflict_id", type: "registry id", meaning: "Which conflict in the registry the event belongs to. Rows that predate the registry are epic-fury-2026.", since: "2026-10-29" },
  { name: "date", type: "ISO 8601, UTC", meaning: "When the event happened. The article's publication day unless the article states another day; T00:00:00Z when only the day is known. Publisher timestamps are taken as given, so a time of day can be off by the publisher's offset." },
  { name: "event_type", type: "enum", meaning: "airstrike, missile_attack, drone_attack, battle, explosion, violence_against_civilians, strategic_development, protest. The first six are kinetic; the last two are the developments stream." },
  { name: "sub_event_type", type: "enum or null", meaning: "A finer class under the type, for example statement, sanction, diplomacy, deployment, ceasefire, interception, casualty_toll under strategic_development, or ballistic, cruise, rocket under missile_attack. Null when the source does not say or on legacy rows.", since: "2026-10-29" },
  { name: "description", type: "text", meaning: "One or two sentences, written by the extraction model from the source. When people were hurt, it leads with who was affected." },
  { name: "evidence_quote", type: "text or null", meaning: "The sentence or sentences of the source article the event was extracted from, copied verbatim. The pipeline keeps the quote only if it finds it in the article it fetched; anything else becomes null. Legacy rows have none.", since: "2026-10-29" },
  { name: "latitude, longitude", type: "decimal degrees", meaning: "Where. Never 0,0 on new rows." },
  { name: "location_precision", type: "enum", meaning: "exact, city, region, country. Country means a centroid placement and is badged approximate everywhere." },
  { name: "geo_source", type: "enum", meaning: "article (placed by the model from the text), gazetteer (matched to a named place in the pipeline's table), centroid (country centroid), legacy (placed before this field existed).", since: "2026-10-29" },
  { name: "country, region", type: "text", meaning: "Country as written by the model and normalised by the pipeline; the country hubs fold aliases (US, USA, U.S.) and reject lists (\"Iran, Yemen\"). Region is free text; placeholders are blanked." },
  { name: "actors", type: "string[]", meaning: "Every party named in the source." },
  { name: "actor1, actor2, actor1_type, actor2_type", type: "text, enum", meaning: "The party acting and the party acted upon, with a type: state, non_state, coalition, civilians, unknown. Legacy rows take the first two actors with type unknown.", since: "2026-10-29" },
  { name: "fatalities", type: "integer or null", meaning: "Killed in this event only, as the source reported at the time. Cumulative tolls are never written here; they become strategic_development with fatalities 0. Figures at or above 500 in one event are quarantined as disputed." },
  { name: "fatalities_min, fatalities_max", type: "integer or null", meaning: "The range the source gave for this event (\"at least 12\" is 12 to 12; \"between 20 and 30\" is 20 to 30). Equal to fatalities on legacy rows.", since: "2026-10-29" },
  { name: "fatalities_attribution", type: "text or null", meaning: "Who gave the figure: a ministry, a military, an NGO, the outlet's own reporters.", since: "2026-10-29" },
  { name: "civilian_impact", type: "text or null", meaning: "Plain-language note on harm to civilians, when the source describes any." },
  { name: "source, source_url", type: "text, URL", meaning: "The outlet and article the event was extracted from. The outlet name comes from our fetch record, never from the model, and the URL must be one the pipeline fetched in that run." },
  { name: "sources, source_count", type: "list", meaning: "Every outlet that reported the event. When a later run finds the same incident in another outlet, that report is added here instead of being discarded.", since: "2026-10-29" },
  { name: "confidence", type: "0 to 1", meaning: "The model's confidence, adjusted by source tier: wire services and major outlets +0.1, unknown outlets −0.15." },
  { name: "verification_status", type: "enum", meaning: "confirmed, reported, claimed, disputed, unconfirmed. See the verification rule below." },
  { name: "first_reported_at, updated_at, revision", type: "timestamps, integer", meaning: "When the pipeline first recorded the event, when it last changed it, and how many times. A corroborating source or a raised fatality figure bumps the revision.", since: "2026-10-29" },
];

export default function CodebookPage() {
  const conflicts = getConflicts();
  return (
    <div className="min-h-dvh bg-[#0a0a0a] text-zinc-200">
      <PageView page="codebook" />
      <SiteNav />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100 sm:text-3xl">Codebook</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          What every field in a War Library event record means, which values it can take, and the rules the pipeline
          applies before a row is published. The dataset is MIT-licensed and available as JSON from{" "}
          <code className="text-zinc-300">/api/events</code>. Companion pages:{" "}
          <Link href="/sources" className="underline-offset-2 hover:underline">sources and method</Link> and{" "}
          <Link href="/about" className="underline-offset-2 hover:underline">about</Link>.
        </p>

        <nav aria-label="Sections" className="mt-6 flex flex-wrap gap-2 text-xs">
          {[["#conflicts", "Conflicts"], ["#fields", "Fields"], ["#verification", "Verification"], ["#evidence", "Evidence quotes"], ["#locations", "Locations"], ["#dedup", "Duplicates"], ["#indexing", "Indexing gate"], ["#dispatches", "Dispatches"], ["#changelog", "Changelog"]].map(([href, label]) => (
            <a key={href} href={href} className="rounded border border-zinc-800 px-2 py-1 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200">{label}</a>
          ))}
        </nav>

        <Section id="conflicts" title="Conflicts tracked">
          <p>
            The registry lists every conflict the pipeline knows about. Only active entries are fetched and extracted;
            planned entries are prepared and switched on after a review of their first week of extractions.
          </p>
          <ul className="mt-3 space-y-2">
            {conflicts.map((c) => (
              <li key={c.id} className="rounded-lg border border-zinc-800 bg-[#111] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-zinc-100">{conflictLabel(c)}</span>
                  <code className="text-xs text-zinc-500">{c.id}</code>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${c.status === "active" ? "bg-red-900/50 text-red-300" : "bg-zinc-800 text-zinc-400"}`}>{c.status}</span>
                </div>
                <p className="mt-1 text-xs text-zinc-400">
                  Since {c.start_date}{c.tracking_from ? `, tracked from ${c.tracking_from}` : ""}. {c.description}
                </p>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="fields" title="Fields">
          <dl className="divide-y divide-zinc-800/70">
            {FIELDS.map((f) => (
              <div key={f.name} className="py-3">
                <dt className="flex flex-wrap items-baseline gap-2">
                  <code className="text-sm text-zinc-100">{f.name}</code>
                  <span className="text-xs text-zinc-500">{f.type}</span>
                  {f.since && <span className="rounded border border-zinc-800 px-1.5 text-[10px] text-zinc-500">since {f.since}</span>}
                </dt>
                <dd className="mt-1 text-sm leading-relaxed text-zinc-400">{f.meaning}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section id="verification" title="Verification rule">
          <ul className="list-disc space-y-1.5 ps-5">
            <li><strong className="text-zinc-200">confirmed</strong>: two or more independent outlets. A single pipeline run sees one article per event, so it can award at most <em>reported</em>; a later run that finds the same incident in another outlet adds that source and upgrades the row.</li>
            <li><strong className="text-zinc-200">reported</strong>: one outlet&apos;s own reporting.</li>
            <li><strong className="text-zinc-200">claimed</strong>: the only source is a party to the conflict.</li>
            <li><strong className="text-zinc-200">disputed</strong>: parties contradict each other, or the pipeline quarantined an implausible figure.</li>
            <li><strong className="text-zinc-200">unconfirmed</strong>: nothing above applies.</li>
          </ul>
          <p className="mt-3">
            Rows extracted before 29 October 2026 keep the status the model assigned at the time, with a single recorded
            source. They were not downgraded retroactively; the two-outlet rule applies from that date forward.
          </p>
        </Section>

        <Section id="evidence" title="Evidence quotes">
          <p>
            Every new row carries the sentence or sentences of the source it was extracted from. The model is asked to copy
            them verbatim; the pipeline then searches the article it fetched for that text (ignoring whitespace and quote-mark
            differences) and discards any quote it cannot find. A row with no quote means the quote failed that check or the
            row predates the field. The quote is shown on the event page next to the source link so a reader can check the
            extraction against the report.
          </p>
        </Section>

        <Section id="locations" title="Locations">
          <p>
            The model places an event from the article text (<code>geo_source: article</code>). When it cannot, the pipeline
            matches named places from a short table (<code>gazetteer</code>), and failing that uses the country centroid
            (<code>centroid</code>), which is always badged approximate on the map and the event page. Centroid rows are never
            listed in the sitemaps and never carry a precision better than <em>country</em>.
          </p>
        </Section>

        <Section id="dedup" title="Duplicates and corroboration">
          <p>
            A candidate event is compared with every existing row by a canonical fingerprint and by spatio-temporal proximity
            (same incident within 50 km and a short time window, with similar wording). A match from the same article is
            discarded. A match from a different outlet is corroboration: the outlet is added to <code>sources</code>, the
            revision increments and a <em>reported</em> row becomes <em>confirmed</em>. A match with a higher per-event
            fatality figure raises the figure, up to the 500 quarantine threshold. Every decision is written to a dedup log.
          </p>
        </Section>

        <Section id="indexing" title="Indexing gate">
          <p>
            Every event has a page, but only events with a source link, confidence of {INDEX_MIN_CONFIDENCE} or more, a
            location better than a country centroid, a valid date, real coordinates and a single canonical country are listed
            in the sitemaps and marked indexable. The rest render with <code>noindex</code>. Country hubs are listed once they
            hold 20 events.
          </p>
        </Section>

        <Section id="dispatches" title="Dispatches">
          <p>
            A daily dispatch is generated at 06:00 UTC for the previous UTC day, a weekly one on Monday for the ISO week just
            ended, and a monthly one on the first for the month just ended. The rule is <em>the model narrates, the code
            counts</em>:
          </p>
          <ul className="mt-2 list-disc space-y-1.5 ps-5">
            <li>Every number in the &quot;by the numbers&quot; table and in the change-against-last-period column is computed from the dataset in code. The model is never asked to add anything up.</li>
            <li>The model receives the period&apos;s statistics and the top events by reliability and human cost, and must end every sentence with the id of the event it rests on. Sentences citing an event it was not given are deleted; sections left without a citation are deleted.</li>
            <li>Any figure of 10 or more in the prose that is not in the statistics or in a cited event&apos;s text flags the dispatch for review instead of publishing it.</li>
            <li>Daily dispatches publish on generation when they pass those checks. Weekly and monthly dispatches are drafts for 24 hours, then publish on their own unless an editor pulls or edits them. A pulled dispatch returns 404.</li>
            <li>Weekly dispatches are written from the week&apos;s dailies plus the week&apos;s statistics; monthly from the weeklies. When fewer than three dailies exist the writer falls back to the raw events.</li>
          </ul>
          <p className="mt-3 text-zinc-500">Disclosure line on every dispatch: &quot;{DISCLOSURE}&quot;</p>
        </Section>

        <Section id="changelog" title="Changelog">
          <ul className="space-y-3">
            <li>
              <p className="font-semibold text-zinc-200">2026-10-29</p>
              <ul className="mt-1 list-disc space-y-1 ps-5 text-zinc-400">
                <li>Conflict registry added; <code>conflict_id</code> on every row (legacy rows backfilled to epic-fury-2026).</li>
                <li>Grounded fields added: <code>evidence_quote</code>, <code>fatalities_min/max/attribution</code>, <code>sub_event_type</code>, <code>actor1/actor2</code> with types, <code>geo_source</code>, <code>sources[]</code>, <code>first_reported_at</code>, <code>updated_at</code>, <code>revision</code>. Legacy rows carry null or derived values as described above.</li>
                <li>Two-outlet rule for <em>confirmed</em>; corroborating reports merged into <code>sources</code> instead of discarded.</li>
                <li>Dispatches (daily, weekly, monthly) launched with the citation check and the number guard.</li>
              </ul>
            </li>
            <li>
              <p className="font-semibold text-zinc-200">2026-10-28</p>
              <ul className="mt-1 list-disc space-y-1 ps-5 text-zinc-400">
                <li>Stable URLs for every event and country; sitemaps, RSS and the indexing gate.</li>
                <li>Extraction moved to Claude Haiku 5.5 with the advisor off to measure whether it is still needed.</li>
              </ul>
            </li>
          </ul>
        </Section>
      </main>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-10 scroll-mt-16">
      <h2 className="mb-3 text-lg font-semibold text-zinc-100">{title}</h2>
      <div className="text-sm leading-relaxed text-zinc-400">{children}</div>
    </section>
  );
}
