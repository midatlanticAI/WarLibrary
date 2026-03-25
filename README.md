# War Library

A neutral, factual, open-source conflict tracker for the 2026 US-Israel war on Iran (Operation Epic Fury). Open to anyone in the world.

**Live at:** [warlibrary.midatlantic.ai](https://warlibrary.midatlantic.ai)

100% of monetization proceeds go to humanitarian aid.

---

## What It Does

- **Interactive conflict map** — Mapbox-powered map with event markers, country filtering, and a timeline slider to scrub through events by date
- **3,800+ verified events** across 28+ countries, sourced from Al Jazeera, BBC, NYT, France 24, The Guardian, DW News, CNN, Reuters, and 20+ other outlets
- **Automated news pipeline** — Ingests articles from RSS feeds and NewsData.io every 30 minutes, extracts structured events via Claude Haiku 4.5 with source attribution and confidence scoring
- **AI-powered Q&A** — Ask questions about the conflict and get sourced, guardrailed answers
- **Admin dashboard** — Pipeline monitoring, source health, analytics, controls (installable as separate mobile app)
- **Notification system** — In-app banners and browser push notifications for breaking events
- **Humanitarian aid page** — Comprehensive human cost data with source-attributed figures from UNHCR, UNICEF, WFP, CARE, IRC, and other agencies. Country-by-country casualty and displacement breakdowns. Dedicated children & education impact section. 8 verified donation organizations (ICRC, UNHCR, MSF, UNICEF, IRC, Direct Relief, WFP, Save the Children) with current response details
- **Analytics** — Privacy-respecting page view tracking, AI question counting, unique visitor tracking (no cookies, no PII — SHA-256 hashed IPs only)
- **PWA** — Installable as a native app on any device

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 16.1.6 / React 19 / TypeScript (strict) |
| Styling | Tailwind CSS 4 |
| Map | Mapbox GL JS via react-map-gl v8 |
| AI | Claude Haiku 4.5 via @anthropic-ai/sdk |
| News Ingestion | NewsData.io API, Google News RSS, outlet RSS feeds |
| Article Extraction | Mozilla Readability + jsdom |
| Testing | Vitest + Testing Library (176 tests); Playwright E2E |
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
npm test              # Unit tests (Vitest — 176 tests across 4 suites)
npx playwright test   # E2E tests (Playwright)
```

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
3. Sends top 20 articles to Claude Haiku 4.5 for structured event extraction
4. Validates events: schema checks, date range (post-Feb 28 only), fatality sanity (rejects cumulative totals, caps at 500)
5. Deduplicates against existing events via description similarity and spatio-temporal proximity
6. Appends new events to `events_latest.json` and sends in-app notification

**Source tiers**: Tier 1 sources (Reuters, AP, BBC, Al Jazeera, CNN, NYT) get confidence boosted. Tier 3 (unknown outlets) get penalized.

**Cost**: ~$7/month for pipeline at 48 runs/day using Haiku.

## Humanitarian Data

The Humanitarian Aid page provides comprehensive, source-attributed data on the human cost of the conflict:

- **Human Cost Summary** — Key displacement and casualty figures with source citations
- **Country-by-Country Breakdown** — Collapsible sections for Iran, Lebanon, Israel, US Military, Gulf States & Iraq with per-country stats
- **Children & Education** — 1,100+ children killed or injured regionally (UNICEF), the Minab school attack, 65+ schools damaged
- **Economic & Food Security** — Oil prices, Strait of Hormuz disruption, 45M additional people at risk of hunger (WFP)
- **Verified Organizations** — 8 independently rated orgs with current response details and direct donation links
- **Source Attribution** — 24 cited sources (UNHCR, UNICEF, WFP, Hengaw, Lebanon Health Ministry, US CENTCOM, etc.)

All figures include source organization and reporting date. Where government and independent figures conflict, both are presented with attribution.

## Data Integrity

- Per-event fatalities only — cumulative death toll reports are tagged as `strategic_development` with `fatalities=0` to prevent double-counting
- No pre-war events (before 2026-02-28)
- Every event has `confidence` (0-1), `verification_status` (confirmed/reported/claimed/disputed/unconfirmed), and `source_url`
- Single-event fatalities capped at 500 (no verified single strike exceeds this)

## AI Chat

The Ask AI feature uses a 3-tier cost model:

1. **Precomputed** — 12 suggested questions with instant, zero-cost answers
2. **Cached** — (planned)
3. **Live Claude** — Haiku 4.5 (~$0.001/question), rate limited to 10/hr per IP

All responses are guardrailed: jailbreak detection, off-topic rejection, weapon content blocking, output validation, daily 2M token spend cap.

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
