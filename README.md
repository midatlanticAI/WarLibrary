# War Library

A neutral, factual, open-source conflict tracker for the 2026 US-Israel war on Iran (Operation Epic Fury). Open to anyone in the world.

**Live at:** [warlibrary.midatlantic.ai](https://warlibrary.midatlantic.ai)

100% of monetization proceeds go to humanitarian aid.

---

## What It Does

- **Interactive conflict map** — Mapbox-powered map with event markers, country filtering, and a timeline slider to scrub through events by date
- **~23,000 events on the live instance**, sourced from Al Jazeera, BBC, NYT, France 24, The Guardian, DW News, CNN, Reuters, and 20+ other outlets. This repository ships **112 seed events**; the rest live only on the server, in a gitignored file the pipeline appends to. See [Data](#data) for what that means for counts.
- **Automated news pipeline** — Ingests articles from RSS feeds and NewsData.io every 30 minutes and extracts structured events with Claude Haiku 4.5, using [structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) so the response shape is guaranteed rather than parsed hopefully. A higher-capability [advisor model](https://platform.claude.com/docs/en/agents-and-tools/tool-use/advisor-tool) is consulted mid-extraction on the judgement calls — whether a casualty figure is a per-event count or a cumulative total, whether several articles describe one incident
- **AI-powered Q&A** — Ask questions about the conflict and get sourced, guardrailed answers
- **Admin dashboard** — Pipeline monitoring, source health, analytics, controls (installable as separate mobile app)
- **Notification system** — In-app banners and browser push notifications for breaking events
- **Humanitarian aid page** — Comprehensive human cost data with source-attributed figures from UNHCR, UNICEF, WFP, CARE, IRC, and other agencies. Country-by-country casualty and displacement breakdowns. Dedicated children & education impact section. 8 verified donation organizations (ICRC, UNHCR, MSF, UNICEF, IRC, Direct Relief, WFP, Save the Children) with current response details
- **Analytics** — Privacy-respecting page view tracking, AI question counting, unique visitor tracking (no cookies, no PII — SHA-256 hashed IPs only)
- **PWA** — Installable as a native app on any device

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 16.2 / React 19 / TypeScript (strict) |
| Styling | Tailwind CSS 4 |
| Map | Mapbox GL JS via react-map-gl v8, with native clustering |
| AI | Claude Haiku 4.5 (extraction + chat) with a Claude Opus 4.8 advisor, via @anthropic-ai/sdk |
| News Ingestion | NewsData.io API, Google News RSS, outlet RSS feeds |
| Article Extraction | Mozilla Readability + jsdom |
| Languages | English, Spanish, Arabic, Hebrew (RTL) |
| Testing | Vitest (6 suites, 274 tests); Playwright E2E (5 specs, 55 tests) |
| Hosting | DigitalOcean + PM2 |

## Getting Started

### Prerequisites

- Node.js 22+
- A [Mapbox access token](https://account.mapbox.com/access-tokens/) (free tier works)
- An [Anthropic API key](https://console.anthropic.com/) (required for pipeline + AI chat)

### Setup

```bash
git clone https://github.com/midatlanticAI/WarLibrary.git
cd WarLibrary
npm install

# Copy and edit environment variables
cp .env.example .env.local
# Required: NEXT_PUBLIC_MAPBOX_TOKEN, ANTHROPIC_API_KEY, ADMIN_SECRET
# Optional: NEWSDATA_API_KEY (enhances article content, free tier 200 req/day)

npm run dev
```

The app runs at `http://localhost:3000`.

### Running Tests

```bash
npm test              # Unit tests (Vitest — 6 suites)
npm run typecheck     # App TypeScript
npm run typecheck:e2e # Playwright specs (the app tsconfig excludes e2e/)
npm run lint
npx playwright test   # E2E tests (Playwright — 5 specs)
```

Two of the data-integrity tests fail against a production snapshot, by design:
five events carry dates that cannot be mechanically repaired (three unparseable,
including a day-zero `2026-04-00`; two dated months in the future). They are
annotated with `needs_review` rather than deleted, pending a human decision. The
suite passes on a fresh clone, because the file those events live in is
gitignored — which is exactly the blind spot that let them accumulate.

### Running the Pipeline

```bash
node scripts/update-events.js   # One-shot: fetch news, extract events
```

The pipeline runs automatically every 30 minutes via cron in production.

## Project Structure

```
src/
├── app/
│   ├── page.tsx                # Main page — tab router (map|feed|ask|donate|sources|about)
│   ├── layout.tsx              # Root layout, SEO, JSON-LD structured data
│   ├── admin/page.tsx          # Admin dashboard (tabbed: overview|events|analytics|controls|logs)
│   └── api/                    # API routes (events, chat, notifications, admin, analytics)
├── components/
│   ├── map/                    # ConflictMap + MapLegend (Mapbox GL)
│   ├── timeline/               # TimelineSlider with adaptive scales
│   ├── chat/                   # AskPanel (AI Q&A)
│   ├── pwa/                    # PWAProvider (install + notification prompts)
│   ├── seo/                    # JSON-LD structured data
│   └── ui/                     # Header, EventPanel, MobileNav, DonationPanel, etc.
├── data/                       # JSON data files (events, analytics, pipeline stats)
├── hooks/                      # useEvents, useNotifications
├── lib/                        # Auth, constants, API utilities
└── types/                      # TypeScript interfaces

scripts/
├── update-events.js            # Main news ingestion + event extraction pipeline
├── auto-update.sh              # Cron wrapper with flock + logging
├── backup-data.sh              # Data file backup utility
└── generate-icons.mjs          # PWA icon generator (Sharp)
```

## News Pipeline

The automated pipeline runs every 30 minutes and:

1. Fetches articles from NewsData.io API (25+), Google News RSS (3 queries), and 6 outlet RSS feeds (Al Jazeera, BBC, NYT, Guardian, France 24, DW)
2. Resolves Google News redirect URLs and extracts full article text via Mozilla Readability
3. Sends top 20 articles to Claude Haiku 4.5 for structured event extraction, with a Claude Opus 4.8 advisor available for ambiguous batches
4. Validates events: schema checks, date range (post-Feb 28, nothing unparseable, nothing in the future), coordinate sanity, fatality sanity (rejects cumulative totals, quarantines implausible counts)
5. Deduplicates against existing events via description similarity plus a 50 km spatial guard, so two strikes in different cities on the same day stay separate
6. Appends new events to `events_latest.json` and sends in-app notification

**Source tiers**: Tier 1 sources (Reuters, AP, BBC, Al Jazeera, CNN, NYT) get confidence boosted. Tier 3 (unknown outlets) get penalized. The `source` field is taken from our own fetch record rather than the model's output, so an extracted event cannot claim a reputable outlet it did not come from.

**Prompt injection**: article bodies are untrusted web text. Extraction rules live in the `system` parameter, never concatenated with article content, and every extracted event must cite a URL this run actually fetched — an event referencing anything else is discarded.

**Cost**: Haiku 4.5 is $1/$5 per million input/output tokens; the Opus 4.8 advisor is $5/$25 and is billed separately from top-level usage (it appears in `usage.iterations[]`, which the pipeline sums into its own stats). Budget by measuring your own runs rather than trusting a figure here.

## Humanitarian Data

The Humanitarian Aid page provides comprehensive, source-attributed data on the human cost of the conflict:

- **Human Cost Summary** — Key displacement and casualty figures with source citations
- **Country-by-Country Breakdown** — Collapsible sections for Iran, Lebanon, Israel, US Military, Gulf States & Iraq with per-country stats
- **Children & Education** — 1,100+ children killed or injured regionally (UNICEF), the Minab school attack, 65+ schools damaged
- **Economic & Food Security** — Oil prices, Strait of Hormuz disruption, 45M additional people at risk of hunger (WFP)
- **Verified Organizations** — 8 independently rated orgs with current response details and direct donation links
- **Source Attribution** — 24 cited sources (UNHCR, UNICEF, WFP, Hengaw, Lebanon Health Ministry, US CENTCOM, etc.)

All figures include source organization and reporting date. Where government and independent figures conflict, both are presented with attribution.

## Data

**What ships in this repository vs. what runs live.** `events.json` and
`events_expanded.json` hold **112 seed events** and are tracked in git.
`events_latest.json` — everything the pipeline has produced since — is
gitignored and exists only on the server. A fresh clone therefore has 112
events, not ~23,000. Counts quoted anywhere should say which of the two they
mean; this README's headline figure refers to the live instance.

**Counting countries is not currently meaningful.** `country` is free text
written by the extraction model, and the live dataset contains 198 distinct
values — roughly 125 that look like single country names and ~73 that are
aggregates or lists (`"Multiple"`, `"Global"`, `"International Waters"`,
`"Iran, Pakistan, Oman, Russia"`, and both `"Kuwait/Bahrain"` and
`"Bahrain/Kuwait"` as separate entries). Until that field is normalised to ISO
codes, any "N countries" claim is an artifact of string counting. Earlier
versions of this README, the site metadata, and the repository description each
published a different number for exactly this reason.

## Data Integrity

- Per-event fatalities only — cumulative death toll reports are tagged as `strategic_development` with `fatalities=0` to prevent double-counting
- No pre-war events (before 2026-02-28), no unparseable dates, and nothing dated more than 48 hours in the future
- Coordinates must be real and in range; `0,0` is rejected as a missing-value sentinel rather than plotted in the Gulf of Guinea
- Events placed only by country fall back to a country centroid and are marked `location_precision: "country"` with `approximate_location: true`, so the map can show them as approximate instead of pretending to a precision the source never had
- **Every event names its source. 99.4% also carry a direct link.**
  - Pipeline-extracted events carry a `source_url` to the specific article, plus `confidence` (0-1) and `verification_status` (confirmed / reported / claimed / disputed / unconfirmed). The schema validator rejects any extracted event without a URL, and that URL must be one the run actually fetched — so an event cannot cite an article the pipeline never read.
  - **131 events carry named outlets but no URL**: the 112 seed events that predate the pipeline, plus 19 early multi-outlet entries whose `source` lists several publications (`"Al Jazeera, RTE, Manila Times, Euronews"`). They are attributed and checkable, but less directly than a linked event — a reader has to search the outlet rather than click through. Backfilling links for those is tracked as outstanding work.
  - Measured across the live dataset: **100% have a named source**, 99.4% a direct URL, 99.7% a verification status. Those URLs span **954 distinct domains** and 22,145 distinct articles.
  - `src/__tests__/data-integrity.test.ts` asserts that no event has zero attribution, and that any `source_url` present is a real http(s) link.
- Single-event fatality counts at or above 500 are quarantined rather than zeroed: the claimed figure is preserved in `claimed_fatalities`, `fatalities` is set to 0, and the event is marked `disputed` with `needs_review`. Silently zeroing lost the evidence in both directions — a real mass-casualty event became a zero, and a hallucinated one stayed in the dataset looking ordinary

**Auditing and repair.** `scripts/audit-data.js` reports on the dataset and, with
`--fix`, applies non-destructive repairs (re-geocoding, precision labelling,
country normalisation). It never deletes. `scripts/dedupe-events.js` finds
near-duplicate clusters and, with `--apply`, moves them to a quarantine file that
`--restore` reverses. Both default to report-only.

## AI Chat

The Ask AI feature uses a 3-tier cost model:

1. **Precomputed** — 12 suggested questions with instant, zero-cost answers
2. **Cached** — (planned)
3. **Live Claude** — Haiku 4.5 (~$0.001/question), rate limited to 10/hr per IP

All responses are guardrailed: jailbreak detection, off-topic rejection, weapon content blocking, output validation, and a daily token spend cap (`MAX_DAILY_TOKENS` in `src/app/api/chat/route.ts` — check the constant rather than trusting a number here; it is process-local and resets on restart).

## Analytics

Privacy-respecting, cookie-free analytics:
- Page view tracking per tab (map, feed, ask, donate, sources, about)
- AI question counting (tracked from the chat API)
- Unique visitor tracking via SHA-256 hashed IPs (no PII stored)
- Persisted to disk, survives restarts
- Visible in admin dashboard

## Security

- API keys server-side only (`.env.local`, gitignored)
- Admin auth via httpOnly cookies + timing-safe SHA-256 comparison
- Input sanitization on all endpoints
- Rate limiting on all API routes
- UFW firewall (ports 22, 80, 443 only)
- fail2ban for brute force protection

## Editorial Policy

- **Neutral** — No sides taken. All perspectives presented with source attribution.
- **Verified** — Every event cites at least one source. Unconfirmed reports are labeled.
- **Accurate** — Per-event fatalities only. No cumulative double-counting.
- **Accessible** — Mobile-first. Available to anyone worldwide.
- **Humanitarian** — 100% of any monetization proceeds go to verified aid organizations.

## Contact

For errors, corrections, or feedback: john@midatlantic.ai

## License

MIT

---

Built with care during a difficult time. If this project helps you understand what's happening, please consider donating to one of the [humanitarian organizations](https://warlibrary.midatlantic.ai) listed on the site.
