# War Library growth, experience and admin plan (2026-10-28)

Written the day the April build was finally replaced. Companion to
`AUDIT-2026-10-28.md` (what was wrong) and `CLOUDFLARE-MIGRATION.md`
(where hosting goes next). This document is the *what to build next and
why* for the public site, the content engine and the admin console.

## 1. Where we actually stand

Measured today, after the deploy:

| Signal | Value | Source |
|---|---|---|
| Human visitors, last 7 days | ~178 distinct IPs, 235 homepage loads | Caddy access log, bot UAs excluded |
| Googlebot requests, last 7 days | 29 | Caddy access log |
| Pages Google can index | 1 (the homepage) | `sitemap.ts`, hash-fragment tabs |
| `site:warlibrary.midatlantic.ai` results | none found | web search 2026-10-28 |
| In-app analytics, last 30 days | 5 days with 1 visitor each | `src/data/analytics.json` on the droplet |
| Lifetime in-app views / AI questions | 2,028 / 76 | same |
| Push subscribers | 1 | `push-subscriptions.json` |
| Live dataset | 37,529 events, +~4,300/month | `/api/health` |

Three conclusions:

1. **The site is invisible to search.** Everything lives under one URL; About,
   Sources, Ask and Donate are client tabs. There is nothing for Google to
   rank, nothing to share with a stable link, nothing for Discover to show.
2. **The analytics beacon undercounts by roughly 25x.** The access log shows
   ~25 human IPs/day; the store recorded one visitor on five days this
   month. The admin Analytics tab is therefore showing wrong numbers.
   Likely causes: beacon fires after the 6.8 MB payload, bot filter too
   broad, or the visitor-hash dedupe collapsing everyone behind Cloudflare.
   To be diagnosed, not guessed.
3. **The dataset is the asset.** 37k source-attributed, geocoded, verified
   events is exactly the kind of unique data Google's own guidance says
   survives its scaled-content and helpful-content systems. Nobody can get
   this from a template. We just never gave it URLs.

## 2. What the guidance actually says (checked today)

- **Scaled content abuse** (Google spam policies): targets "many pages
  mainly to manipulate rankings", "little to no value to users",
  regardless of method; explicitly lists generative AI used to mass-produce
  pages *without adding value*. The policy is about value and scale, not
  about AI per se. Implication: daily/weekly/monthly digests whose numbers
  are computed in code, whose every claim links to a source event, and
  which are published at news cadence (one a day, not thousands) are a data
  product, not scaled abuse. Per-event pages at 37k are the risk surface
  and need a quality gate (section 4).
- **Discover**: no submission, no special markup. Eligible once indexed and
  policy-compliant. Needs `max-image-preview:large`, an image at least
  1200 px wide with more than 300k pixels, 16:9 recommended, set via
  `og:image` or schema; no logos or text-heavy images; no sensational
  previews. Timely content that "tells a story well" is what it favors.
  Treat as a supplement to search.
- **News sitemap**: separate file; only articles from the last 2 days;
  at most 1,000 entries; requires `news:name` (must match the name shown on
  news.google.com), `news:language`, original `news:publication_date`,
  `news:title`. Enrollment in Publisher Center is separate.
- **Next.js self-hosting**: ISR and `use cache` work on a single `next start`
  instance with the on-disk cache in `.next/cache`; no Redis needed on one
  droplet. Cache Components work self-hosted. OpenNext on Workers also
  supports both, so pages built this way port to Cloudflare.

## 3. Public site: the URL layer (prerequisite for everything else)

Build real routes. Every one is rendered from data we already have.

| Route | What it is | Why |
|---|---|---|
| `/event/[id]` | One event: description, date, place, actors, fatalities, verification, civilian impact, source link, static map thumbnail, "nearby in time and place" | Shareable permalink; the unit of citation; opens the map centered on the event |
| `/country/[slug]` (about 60) | Country hub: 30/90/365-day counts, trend sparkline, event-type mix, latest 50 events, map viewport | The programmatic layer with real unique data per page; the pages people actually search for ("Sudan conflict map") |
| `/dispatch/daily/YYYY-MM-DD` | The daily digest (section 4) | News cadence, Discover, news sitemap |
| `/dispatch/weekly/YYYY-Www` | Weekly digest | |
| `/dispatch/monthly/YYYY-MM` | Monthly digest | |
| `/dispatch` | Archive index, paginated | Internal linking spine |
| `/about`, `/sources`, `/support` | The existing tabs as real pages | Indexable, linkable, cheap |
| `/feed.xml` | RSS 2.0 of dispatches | Newsletter feed, Postiz feed, aggregators |
| `/news-sitemap.xml` | Last 48h of dispatches | Google News |
| `/sitemap.xml` | Index sitemap pointing at countries, dispatches, gated events | Replaces the one-URL sitemap |
| `/llms.txt`, `/api/docs` | Dataset description + API reference | AI crawlers already allowed in robots.txt; give them something to read; researchers cite |

Map state goes in the URL: `/?c=sudan&from=2026-10-01&to=2026-10-28&e=<id>`.
Today a shared link loses everything. Back/forward and deep links from the
new pages depend on this.

Rendering: countries, dispatches and gated event pages are ISR with
revalidate of 1h/24h; the pipeline calls `revalidateTag` after each run
so the country pages and the current daily move within minutes. Dynamic
per-page `opengraph-image` (the existing route generalized) renders a map
crop with the day's events at 1200x630 for Discover and social cards.

Structured data: `NewsArticle` on dispatches, `Dataset` on the homepage and
`/api/docs`, `Place` and `Event` on event pages, `BreadcrumbList` everywhere.

## 4. The content engine: daily, weekly, monthly dispatches

**Principle: the model narrates, the code counts.** Every number on a
dispatch (event count, fatalities, countries, change vs prior period,
verification mix) is computed from the dataset in code and injected; the
model is never asked to add anything up. Every sentence the model writes
must cite event IDs it was given; a post-check drops any sentence that
cites an ID not in the input. Each dispatch carries a disclosure line:
"Automated digest from the War Library dataset. Figures computed from
source-attributed events; narrative generated and spot-checked."

| Dispatch | When | Input | Output | Est. cost on Haiku 5.5 |
|---|---|---|---|---|
| Daily | 06:00 UTC for the prior UTC day | that day's events (about 140), prior-day stats | 400-700 words: lede, 3-6 regional sections, civilian-impact note, "by the numbers" table, 5-10 linked events | about $0.01 |
| Weekly | Monday 06:30 UTC | the 7 daily digests + computed week stats + top 25 events by confidence x fatalities | 900-1,400 words with a trend paragraph per active theater | about $0.05 |
| Monthly | 1st, 07:00 UTC | the 4-5 weeklies + month stats + country league table | 1,500-2,500 words, with the country table rendered from data | about $0.10 |

Monthly is built from weeklies, weekly from dailies, so the big ones never
need the whole month's raw events in a prompt and the cost stays in the
cheap 100K-token tier.

Storage: `src/data/dispatches/<kind>/<key>.json` on the droplet (gitignored,
covered by the existing backup cron), written by a new
`scripts/write-dispatch.js` the pipeline calls after a successful run.
Behind a small `lib/dispatch-store.ts` so the Cloudflare port swaps files
for a D1 table without touching the pages.

Publishing states: `draft`, `published`, `pulled`. Decision in section 7
on which cadences auto-publish.

Distribution, all driven by `/feed.xml`:

- **Email**: RSS-to-email (Buttondown or Kit free tier) gives a daily/weekly
  newsletter with zero sending code. The signup box lives on every dispatch
  and the country pages.
- **Social**: Postiz already runs locally; a dispatch-to-Postiz draft hook
  (title, lede, OG image, link) is a small script. Nothing posts without a
  click, same as the content pipeline rule.
- **Google News / Publisher Center**: submit once the news sitemap and
  `NewsArticle` markup are live and a week of dispatches exists.
- **Search Console + Bing Webmaster + IndexNow**: verify the domain, submit
  the sitemap index, ping IndexNow from the pipeline after each publish.
- **Backlink surfaces**: an embeddable country map (`/embed/country/sudan`,
  iframe, attribution link), monthly CSV export per country on the country
  page, and a Hugging Face dataset mirror refreshed monthly. These are what
  journalists, OSINT accounts and researchers link to and cite.

## 5. Experience improvements (public)

Ordered by impact per hour of work.

1. **Load**: switch the client to `fields=lite` plus on-demand event detail
   (already queued; about 4x smaller first load). Then a Cloudflare cache
   rule on `/api/events` with ETag respected.
2. **Land on the story, not the globe**: a "Today" strip above the map with
   the daily lede, the three numbers, and "read the dispatch". New visitors
   get context in two seconds instead of 37k dots.
3. **URL state and share** (section 3): shareable views; the share button
   copies a link that restores the view.
4. **Search**: a text search over description, actors and country,
   client-side on the lite set, with the result list driving the map.
5. **Timeline presets**: 24h / 7d / 30d / 90d / all; the slider stays for
   fine control.
6. **Country pages as the navigation**: clicking a country name anywhere
   goes to its hub; the hub's "open on map" returns with state.
7. **Feed virtualization and marker clustering** on the map at low zoom
   (one React marker per event is still the pattern; clustering via the
   Mapbox source layer, not 37k React components).
8. **Push notifications that mean something**: threshold on fatalities or
   verification=confirmed in a followed country; the daily dispatch as the
   default push.
9. **Accessibility pass**: keyboard navigation of the feed, focus order,
   contrast on the dark theme, reduced-motion on the globe.
10. **Light theme and font-size control** (cheap, often requested on
    data-heavy dark sites).

## 6. Admin console: from status page to control room

What exists: five tabs (Overview, Events, Analytics, Controls, Logs) over a
30-second dashboard snapshot; actions are run-update, clear-cache, change
cron interval, send push; cookie auth with rate-limited attempts.
Everything is read-only except those four buttons, and the analytics tab
shows numbers that are wrong by about 25x (section 1).

Proposed tabs and what each needs server-side:

| Tab | What the operator sees and can do | Backend |
|---|---|---|
| **Overview** | Keep; add "cost today / this month" and "dispatch status" tiles | pipeline-stats x model price table |
| **Dispatches** (new) | Draft queue with preview, inline edit of title/lede/sections, publish / pull / regenerate, "send to Postiz", history | dispatch-store CRUD; regenerate re-runs the writer for one key |
| **Data quality** (new) | The audit section 2 lists live: invalid/future dates, 0,0 coords, centroid-only, duplicate clusters, sources erroring; per row: quarantine, fix date/coords, merge dupes; every change logged with who/when/before/after | `src/data/quarantine.json` + append-only `audit-log.jsonl`; events route excludes quarantined IDs; **never deletes** |
| **Event editor** (new) | Open any event by ID or from Data quality; edit verification status, coordinates, country, fatalities; "re-extract from source" button | same audit log; re-extract calls the pipeline's single-article path |
| **Sources** (new) | Per-source 30-day health strip, last error text, enable/disable, add RSS URL; article cache size | source config moves from constants to `src/data/sources.json` with the pipeline reading it |
| **Cost & models** (new) | Per-run tokens and dollars; advisor on/off; model picker (Haiku 5.5 / Sonnet 5.5) with "effective next run"; chat daily budget | a `runtime-config.json` the pipeline and chat route read, so no `.env.local` edits over SSH |
| **Analytics** | Fix the beacon (diagnose section 1), then show server-side numbers from the Caddy log (humans vs bots, top countries by visitor, top pages, referrers, Googlebot crawl rate) and Search Console clicks once verified | nightly log parser writing `analytics-server.json`; GSC API optional |
| **Controls** | Keep run-update / clear-cache / cron; add "revalidate pages", "rebuild sitemaps", "ping IndexNow", backup-now, restore-from-backup picker (lists `/opt/backups/warlibrary`) | small shell-outs, same pattern as today |
| **Logs** | Keep; add filter by run and level, tail follow | |

Cross-cutting:

- **Mobile layout**: the admin is desktop-only today. Cards stack, tabs
  become a bottom bar, actions are thumb-sized.
- **Auth hardening without friction**: keep the cookie, add a 30-day
  "remember this device", and an optional TOTP second factor. The admin is
  the one place that can write to the dataset.
- **Every write goes through the audit log.** This is also what makes the
  Cloudflare port safe: the log is the migration's reconciliation record.

## 7. Decisions

1. **Publish gate for dispatches.** Recommendation: daily auto-publishes
   at 06:00 UTC with a "pull" button in admin; weekly and monthly land as
   drafts and auto-publish 24h later if untouched (so a missed review never
   silences the site).
2. **Event pages.** Recommendation: index only events with confidence of
   0.7 or more, a source URL, and location precision better than country
   centroid (today roughly 60% of the set); the rest render but carry
   `noindex`. All 37k indexable on day one is the scaled-content risk
   surface.
3. **Newsletter provider.** Buttondown (RSS-to-email, free to 100
   subscribers, no card) vs Kit. Recommendation: Buttondown.
4. **Social.** Hook dispatches into the local Postiz as drafts, yes/no.
5. **Build order.** Recommendation: section 3 URL layer and section 4
   engine on the droplet now, with the storage seam, then migrate to
   Cloudflare carrying dispatches as a D1 table. Building these on Workers
   first would park growth behind the migration for weeks.
6. **Name.** "Dispatches" for the digest series (route `/dispatch/...`),
   or something else. It also becomes the `news:name`.

## 8. Sequence

| Phase | Scope | Rough size |
|---|---|---|
| A | URL state; `/event/[id]`; `/country/[slug]`; About/Sources/Support as pages; sitemaps; RSS; `llms.txt`; dynamic OG; `fields=lite` client; GSC/Bing/IndexNow verified; analytics beacon diagnosed and fixed; Cloudflare Web Analytics added | 3-4 days |
| B | Dispatch engine (daily, then weekly, then monthly), writer with citation check, ISR + revalidate from pipeline, news sitemap, `NewsArticle` markup, Buttondown feed, Postiz draft hook, admin Dispatches tab | 3-4 days |
| C | Admin: Data quality, Event editor, Sources, Cost & models, server-side analytics, mobile layout, audit log | 3-4 days |
| D | Experience: Today strip, search, timeline presets, clustering, push thresholds, accessibility, light theme | 2-3 days |
| E | Cloudflare migration per `CLOUDFLARE-MIGRATION.md`, now carrying dispatches, quarantine and audit log into D1 | per that doc |

## 9. Expansion beyond the Iran war (discussion 2026-10-28)

What the live file says today (37,417 events in `events_latest.json`):

| Fact | Value |
|---|---|
| Google News queries in the pipeline | 7, all Iran-themed |
| Extraction prompt | hard-coded to "the 2026 US-Israel war on Iran", start date 2026-02-28 |
| Chat system prompt | hard-coded Operation Epic Fury background |
| `strategic_development` share | 26,906 of 37,417 (72%): statements, diplomacy, sanctions, not kinetic events |
| Location precision | country 14,938 / region 11,388 / city 10,043 / exact 1,028 |
| Verification | reported 24,140 / confirmed 11,128 / claimed 1,932 / disputed 189 |
| Top countries, last 30 days | Iran 824, Saudi Arabia 530, Yemen 484, United States 361, Israel 143 |

So the product is one conflict, mostly non-kinetic items, mostly placed at
region or country level. Expansion is a schema and pipeline change, not
just more feeds.

**Mechanics: a conflict registry.** `src/data/conflicts.json`: slug, name,
start date, bounding box, actor list, Google News queries, extra feeds,
timezone, status (active/dormant). Each event gets `conflict_id`; the
37k existing rows are backfilled to `epic-fury-2026`. The extraction
prompt, the chat background, the country hubs, the dispatches and the D1
schema all read the registry. Adding a conflict becomes a JSON entry plus
a review of its first week.

**Tighter data, so more variables do not mean more exposure.** Every new
field is grounded in the source text or it does not exist:

- `evidence_quote`: the sentence(s) in the article the event was extracted
  from. Shown on the event page next to the source link. This is the single
  strongest answer to "AI slop": a reader can check every row.
- `fatalities_min` / `fatalities_max` / `fatalities_attribution` (who
  reported the figure) replace the single number. Today every row has a
  number and no provenance.
- `sources[]` with `source_count`; `confirmed` requires two independent
  outlets, `reported` one, `claimed` a party to the conflict only.
- `sub_event_type` under the eight types (e.g. airstrike: manned / drone
  / missile; strategic_development: statement / sanction / diplomacy /
  deployment / ceasefire), so the 72% bucket becomes usable and maps and
  stats can default to kinetic events only.
- `actor1`, `actor2` with `actor_type` (state, non-state, coalition,
  civilians), consistent with the existing `Faction` type.
- `geo_source` (article text / gazetteer / centroid) alongside
  `location_precision`; centroid placements are badged on the map, never
  silently exact.
- `first_reported_at`, `revision` and a corrections log, so retractions
  update rather than duplicate.
- A published codebook and methodology page, with a changelog. ACLED's
  codebook is the model; ours is shorter and links to the evidence quotes.

**Which conflicts next.** Criteria: heavy English-language wire coverage
(so extraction stays accurate), a real gap in free, map-first, daily
trackers, and search demand. Recommendation for the first two: **Sudan**
(SAF/RSF; under-served by map-first free sites, strong UN/Reuters/Al
Jazeera coverage) and the **Sahel** (Mali, Burkina Faso, Niger; almost no
free daily tracker). **Ukraine** has the most search demand but the most
competition (ISW, DeepState, Liveuamap) and goes third, where our angle
is the cross-conflict comparison nobody else offers. Candidates after
that: eastern DRC, Myanmar, Haiti, Somalia.

**Cost.** Each conflict adds its own query set and extraction calls; the
pipeline already fetches ~550 articles a run and extracts from the few
that pass the filter, so cost scales with matched articles, not feeds.
On Haiku 5.5 a second conflict is cents a day.

**Order.** Registry + backfill + the grounded fields first on the Iran
data (Phase A/B work), then the second conflict, so the new conflict is
born on the tight schema rather than migrated to it.

Sources checked 2026-10-28: Google Search Central spam policies
(scaled content abuse), Google Discover documentation, Google News
sitemap documentation, Next.js self-hosting guide (updated 2026-10-15),
Caddy access log and `analytics.json` on the droplet.

## 10. Status log

- **2026-10-29 02:10 UTC — Phase A live.** Deployed 645ba74 + 2cc049a.
  The first deploy took the site down for about an hour: deploy.sh untars
  over the old tree and never removed the deleted `src/app/sitemap.ts`, so
  `next build` refused ("Conflicting route and metadata at /sitemap.xml")
  and the error was hidden by `| tail -3`. deploy.sh now ships a manifest,
  quarantines files that left the repo to `/opt/warlibrary-stale/<ts>/`,
  logs the server build and aborts before restart on failure, and keeps the
  previous `.next` to put back. Verified on production: 60-check smoke
  script green, headless probe shows the map rendering, IndexNow accepted
  48 sitemap URLs, pipeline ran at 02:00 UTC and added 2 events.
  Sitemaps: 5 pages, 43 country hubs, 12,778 indexable events in 3 chunks.
  Open: production's 30-day first-stage window is 2.4 MB (the July snapshot
  measured 0.6 MB); consider a 14-day window for stage one.
