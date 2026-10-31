# War Library — AI Coding Instructions

## Project Overview
War Library (warlibrary.midatlantic.ai) — a neutral, factual, living war library
tracking the 2026 US-Israel war on Iran (Operation Epic Fury). Open to anyone in
the world. 100% of monetization proceeds go to humanitarian aid.

**Live at:** https://warlibrary.midatlantic.ai

## Tech Stack
- **Frontend**: Next.js 16.2 / React 19 / TypeScript (strict) / Tailwind CSS 4
- **Map**: Mapbox GL JS via react-map-gl v8 (`import from "react-map-gl/mapbox"`)
- **AI Chat**: Claude Haiku 5.5 via @anthropic-ai/sdk (Next.js API route)
- **Pipeline**: Node.js script extracting events from news via Claude Haiku 5.5
- **News Sources**: NewsData.io API, Google News RSS, Al Jazeera, BBC, NYT, The Guardian, France 24, DW News
- **Article Extraction**: Mozilla Readability + jsdom for full article body text
- **Testing**: Vitest + Testing Library + happy-dom; Playwright E2E
- **PWA**: Service worker, web app manifest, install prompt, push notifications
- **Hosting**: DigitalOcean droplet (Ubuntu 24.04, 2GB RAM)
- **Process Manager**: PM2 (`warlibrary`, id 0)
- **Cron**: `*/30 * * * *` runs `scripts/auto-update.sh`
- **Repo**: https://github.com/midatlanticAI/WarLibrary (public, MIT)

## Architecture

### Frontend (src/)
```
src/
├── app/
│   ├── page.tsx              # Main page — tab router (map|feed|ask|donate|sources|about)
│   ├── layout.tsx            # Root layout, dark theme, Mapbox CSS, PWA meta
│   ├── globals.css           # Dark war-room aesthetic, custom scrollbars
│   ├── sitemap.xml/route.ts  # Sitemap index → /sitemaps/{pages,countries,events-N,dispatches,news}.xml
│   ├── event/[id]/           # One event (Article JSON-LD, evidence quote, sources, OG map card)
│   ├── country/[slug]/       # Country hub
│   ├── dispatch/             # /dispatch index, /dispatch/[kind]/[key] (NewsArticle), /dispatch/feed.xml
│   ├── codebook/page.tsx     # Every field, enum and rule, with changelog
│   ├── admin/
│   │   ├── page.tsx          # Admin dashboard (tabbed: overview|events|analytics|controls|logs)
│   │   └── layout.tsx        # Admin-specific manifest + icons (separate PWA)
│   └── api/
│       ├── chat/route.ts     # Claude AI chat endpoint (Haiku 5.5, guardrailed)
│       ├── admin/route.ts    # Admin auth (httpOnly cookie, timing-safe)
│       ├── admin/dashboard/route.ts # Dashboard API (pipeline stats, controls, logs)
│       ├── events/route.ts   # Event data API (merges 3 data files, deduplicates)
│       ├── analytics/route.ts # Persistent analytics tracking
│       ├── health/route.ts   # Health check endpoint
│       ├── notifications/route.ts # Notification endpoint (admin POST, client GET poll)
│       ├── push/route.ts     # Push subscription management
│       └── stats/route.ts    # Event statistics endpoint
├── components/
│   ├── map/
│   │   ├── ConflictMap.tsx   # Mapbox interactive map with markers, popups, filters
│   │   └── MapLegend.tsx     # Filter by event type and country
│   ├── timeline/
│   │   └── TimelineSlider.tsx # Date range filter with adaptive scales + histogram
│   ├── chat/
│   │   └── AskPanel.tsx      # Chat-style AI Q&A with markdown rendering
│   ├── pwa/
│   │   └── PWAProvider.tsx   # Install prompt + notification permission banners
│   ├── seo/
│   │   └── JsonLd.tsx        # Structured data (Organization, WebSite, Dataset, NewsMedia)
│   └── ui/
│       ├── Header.tsx        # Nav tabs + live indicator
│       ├── MobileNav.tsx     # Bottom tab bar (mobile only)
│       ├── EventPanel.tsx    # Scrollable event feed with search, filters, provenance
│       ├── ContentWarning.tsx # First-visit landing + briefing
│       ├── OverviewBanner.tsx # Situation summary + stats
│       ├── DonationPanel.tsx # Humanitarian aid — human cost data + 8 verified orgs
│       ├── SourcesPage.tsx   # Data source methodology
│       ├── AboutPage.tsx     # About + editorial policy
│       └── SourceFooter.tsx  # Footer with source links
├── data/
│   ├── events.json           # Base seed events (48)
│   ├── events_expanded.json  # Expanded events (64)
│   ├── events_latest.json    # Pipeline-appended events (gitignored, server-only, ~23k)
│   ├── notification.json     # Latest notification (persisted to disk)
│   ├── analytics.json        # Page view + AI question analytics (persisted unique visitors)
│   ├── pipeline-stats.json   # Current pipeline run stats
│   ├── pipeline-history.json # Last 100 pipeline runs
│   └── article-url-cache.json # Prevents duplicate article processing
├── hooks/
│   ├── useEvents.ts          # Fetches & merges all event data from API
│   └── useNotifications.ts   # Polls for notifications, shows in-app banner + push
├── lib/
│   ├── analytics-store.ts    # Shared singleton analytics (used by /api/analytics + /api/chat)
│   ├── auth.ts               # Shared admin auth (SHA-256, timing-safe, cookie + header)
│   ├── constants.ts          # EVENT_COLORS and shared constants
│   ├── api.ts                # API client utilities
│   ├── push.ts               # Web push notification helpers
│   ├── rag.ts                # RAG context builder for AI chat (event retrieval + grounding)
│   └── share.ts              # Social sharing utilities
└── types/
    └── index.ts              # ConflictEvent, Faction, MapViewState, etc.
```

### Scripts
```
scripts/
├── update-events.js          # Main pipeline (~1800 lines)
│   - Fetches from NewsData.io API, Google News RSS, outlet RSS feeds (all parallel)
│   - Resolves Google News redirect URLs
│   - Extracts article bodies via Mozilla Readability
│   - Sends to Claude Haiku 5.5 for structured event extraction (EXTRACTION_MAX_TOKENS)
│   - Truncation recovery: salvages partial JSON if response hits token limit
│   - Validates: schema, date range (post-Feb 28), fatality sanity checks
│   - Deduplicates: canonical fingerprint + spatio-temporal proximity
│   - Rejects cumulative death toll reports (prevents double-counting)
│   - Rejects pre-war events (before 2026-02-28)
│   - Caps suspicious single-event fatalities (>500 = zeroed)
│   - Source tier confidence adjustment (Tier 1 boost, Tier 3 penalty)
│   - Geocode fallback for missing coordinates
│   - Atomic writes (tmp + rename) to prevent data corruption
│   - Sends notification on new events
│   - 180-second execution timeout
├── auto-update.sh            # Cron wrapper with flock + logging
├── backup-data.sh            # Data file backup utility
├── write-dispatch.js         # Daily/weekly/monthly dispatch writer (Haiku 5.5, structured output)
├── dispatch.sh               # Cron wrapper for the writer (06:00 daily, Mon 06:30, 1st 07:00 UTC)
├── backfill-registry.js      # Adds conflict_id + grounded fields to legacy rows (idempotent, backs up first)
├── translate-events.js       # Event descriptions into every served language (incremental after each pipeline run; --all = archive backfill)
├── translate-dispatch.js     # One dispatch's narrative into every language (run by the writer and after admin edits)
├── newsletter.js / newsletter.sh  # Resend broadcasts per language: `sweep` (hourly cron + after the daily writer), `send`, `status`
├── lib/translate-call.cjs    # The model-calling half of translation (Haiku 5.5, structured output, retries)
├── indexnow.js               # IndexNow ping (--sitemap or explicit URLs)
└── generate-icons.mjs        # PWA icon generator (Sharp)
```

### Public
```
public/
├── sw.js                     # Service worker (network-first, push notifications)
├── manifest.webmanifest      # Main app PWA manifest
├── admin/manifest.webmanifest # Admin PWA manifest (separate installable app)
├── robots.txt                # Search engine + AI crawler directives
└── icons/
    ├── icon-192.png, icon-512.png           # Main app icons
    ├── icon-maskable-192.png, icon-maskable-512.png
    ├── admin-icon-192.png, admin-icon-512.png  # Admin icons (red theme)
    ├── admin-maskable-192.png, admin-maskable-512.png
    ├── apple-touch-icon.png
    └── favicon-16.png, favicon-32.png
```

### Data: 112 seed events in-repo; ~23,000 on the live instance

**Always distinguish the two.** `events.json` + `events_expanded.json` (112
events) are tracked in git. `events_latest.json` is gitignored and exists only on
the droplet. A fresh clone, and therefore CI, sees 112 events — which is why the
data-integrity suite passed for months while unvalidated records accumulated in
production. Do not quote a single event count without saying which set it means.

**Do not quote a country count.** `country` is free text from the extraction
model: ~198 distinct values, of which roughly 73 are aggregates or lists
(`"Multiple"`, `"Global"`, `"Iran, Pakistan, Oman, Russia"`, and both
`"Kuwait/Bahrain"` and `"Bahrain/Kuwait"`). Normalising it to ISO codes is
outstanding work; until then any "N countries" figure is string-counting.
Sources: Al Jazeera, BBC, NYT, France 24, The Guardian, DW News, CNN, Washington Post,
Reuters, NPR, Times of Israel, Axios, PBS, Naval News, UN News, and more.

Per-event fatalities are summed from individual event attributions only —
cumulative tolls are tracked separately as `strategic_development` with
`fatalities=0`. Read the current figure from the data, don't hardcode it.

### Conflict registry and grounded fields (2026-10-29)

`src/data/conflicts.json` is the registry (typed by `src/lib/conflicts.ts`).
Only `status: "active"` entries are fetched; the pipeline builds its Google
News and NewsData queries, the extraction framing, per-conflict start-date
checks and `conflict_id` from it, and the chat/RAG background text comes from
each entry's `background[]`. Sudan and the Sahel are prepared as `planned`:
activating one is a status flip plus a review of its first week.

Every extracted row carries the grounded fields documented at `/codebook`:
`evidence_quote` (verbatim; the pipeline drops it unless it finds it in the
fetched article), `fatalities_min/max/attribution`, `sub_event_type`,
`actor1/actor2` + types, `geo_source` (article/gazetteer/centroid/legacy),
`sources[]`/`source_count`, `first_reported_at`, `updated_at`, `revision`.
`confirmed` requires two outlets: a single run awards at most `reported`, and
a duplicate from another outlet is merged into `sources` (and upgrades the
status) rather than discarded. Legacy rows are backfilled by
`scripts/backfill-registry.js` with null/derived values and are NOT
downgraded retroactively. `src/lib/event-store.ts` normalises all of this in
`toSerializedEvent`; `fields=lite` strips it.

### Dispatches

"The model narrates, the code counts." `src/lib/dispatch-core.cjs` (CommonJS
so the cron script and the app share one implementation; types in
`dispatch-core.d.cts`) holds the period maths (daily key `YYYY-MM-DD`, weekly
`YYYY-Www` ISO, monthly `YYYY-MM`), `computeStats`, `citationCheck` (every
sentence must cite `[ev:<id>]` from the input; unknown citations are dropped)
and `numberGuard` (any figure ≥10 not in the input flags the dispatch).
`scripts/write-dispatch.js` builds the inputs, calls Haiku 5.5 with a JSON
schema, assembles the record and writes `src/data/dispatches/<kind>/<key>.json`
(gitignored, droplet-only, behind `src/lib/dispatch-store.ts`). Daily
publishes on generation when clean; weekly/monthly are drafts that
auto-publish after 24 h unless pulled or edited (`effectiveStatus`). Admin
tab "Dispatches" → `/api/admin/dispatches` (generate/regenerate run the
writer detached; publish pings IndexNow; nothing deletes). Pages:
`/dispatch`, `/dispatch/[kind]/[key]`, `/dispatch/feed.xml`,
`/sitemaps/news.xml` (last 48 h, Google News namespace).

### Languages (en, es, fr, tr, ar, fa, ur, he)

One set of JSON files (`src/i18n/*.json`, parity enforced by tests) feeds two
translators: the client provider in `src/i18n/index.tsx` for the app, and
`makeT()` in `src/i18n/server.ts` for the server-rendered pages. The locale
is resolved on the server by `resolveLocale()` (cookie `wl_lang`, then
`Accept-Language`, then English) and passed as `initialLocale` to every
`I18nProvider`, so the first byte is already in the reader's language and
direction. All `Intl` calls use `LOCALE_TAG` from `src/i18n/locale.ts`
(Arabic pins Arabic-Indic digits, Persian the extended set; Urdu stays on
Western digits). Fonts: Noto Sans Arabic, Vazirmatn (fa), Noto Nastaliq
Urdu (ur, with raised line height in globals.css), Noto Sans Hebrew. Use
logical Tailwind classes (`ms-`, `end-`, `text-start`) never physical ones.
Sentences with numbers are whole strings with `{{placeholders}}` (plural
forms via `Intl.PluralRules` keys zero/one/two/few/many/other), never
fragments glued around a number. Adding a language: `LOCALES`, `LOCALE_TAG`,
`ENDONYM`, `LANGUAGE_NAME` and the RTL set in `locale.ts`; a JSON file; a
`language.<code>` key in every file; a font if the script needs one; a
directive in `LANGUAGE_DIRECTIVES` (chat route); `LANGUAGES` in
`translate-core.cjs` (a test ties it to `CONTENT_LOCALES`).

**Content in the reader's language.** English stays the canonical record.
`scripts/translate-events.js` (Haiku 5.5, structured output) translates
`description` and `civilian_impact` into every non-English locale and
appends one JSON line per event and language to
`src/data/translations/<lang>.jsonl` (gitignored, droplet-only, excluded
from deploys; `TRANSLATIONS_DIR` overrides). It runs after every pipeline
run from `auto-update.sh` (bounded by `--limit`) and `--all` is the
resumable archive backfill (measured about $7 per language for the 37k-event archive). Every translation passes
`src/lib/translate-core.cjs` checks before it is written: same multiset of
numbers (Arabic-Indic and Persian digits normalised), sane length ratio,
not left in English, no HTML; a rejected item stays English and is retried
up to three times. `src/lib/translation-store.ts` reads the sidecar lazily
per language (cached on mtime+size) and `localizeEvent()` swaps the text in,
adding `description_lang`, `translated` and `description_en`. `/api/events`
takes `lang=`; the ETag includes the translation file signature;
`useEvents(locale)` requests it and caches per language. Every component
that renders a description uses `textAttrs(event.description_lang, locale)`
so a run not in the page's language is isolated with its own `lang`/`dir`.
Dispatches: `scripts/translate-dispatch.js` writes `translations[lang]`
into the dispatch file (all-or-nothing per language: citation multiset and
numbers must match); the writer calls it after writing, the admin edit
action clears and re-runs it; pages read it through
`src/lib/dispatch-i18n.ts` and offer `?original=1`. Evidence quotes,
metadata, JSON-LD, feeds and sitemaps stay English. The AI analyst uses one
registry-driven prompt plus a language directive per language
(`LANGUAGE_DIRECTIVES` in the chat route). Audit and roadmap:
`docs/I18N-AUDIT-2026-10-29.md`.

### Newsletter (Resend)

`src/lib/newsletter-core.cjs` (pure: HMAC-signed 48 h confirmation tokens,
address validation, email rendering per language with Resend's
`{{{RESEND_UNSUBSCRIBE_URL}}}` placeholder) and `newsletter-resend.cjs`
(the only module that talks to Resend: one segment per language named
`warlibrary-<lang>`, created on first use and cached with a local
subscriber tally in `src/data/newsletter.json`). Double opt-in: `POST
/api/newsletter` (rate limited per IP, honeypot field, same-origin) emails a
signed link; `GET /api/newsletter/confirm` creates or re-subscribes the
contact and redirects to `/dispatch?subscribe=ok` setting the reader's
language cookie. `NewsletterBox` renders the form only when `RESEND_API_KEY`
and `NEWSLETTER_FROM` are set. `scripts/newsletter.js sweep` (hourly cron,
and after the daily writer) sends one broadcast per published dispatch per
language that has subscribers, using the dispatch's translation, and
records it under `emailed[lang]` in the dispatch file, so it is idempotent;
a weekly or monthly that auto-publishes 24 h after generation is caught by
the hourly sweep. Admin publish starts a sweep. Free plan: 3,000 emails a
month, 100 a day, 1,000 contacts.

### Event Pipeline
- Runs every 30 minutes via cron
- Pulls from 3 source types: NewsData.io API (25+ articles), Google News RSS (3 queries), Outlet RSS (6 feeds)
- 20 articles max, 800 chars body per article, `EXTRACTION_MAX_TOKENS` output cap
- Source tiers: Tier 1 (Reuters, AP, BBC, etc.) get confidence boost; Tier 3 penalized. `source` is taken from our fetch record, never from model output

**Executor + advisor.** Extraction runs Haiku 5.5 as executor with a Claude Opus
4.8 **advisor** (kill switch `ADVISOR_ENABLED=false`; off in production since
2026-10-28 to measure whether Haiku 5.5 needs it at all) (`advisor_20260301`, beta `advisor-tool-2026-03-01`, via
`client.beta.messages.create`). The advisor is consulted mid-generation on
judgement calls — is this figure cumulative or per-event, are these three
articles one incident, is this article's text trying to instruct us.

> **Do not "upgrade" the advisor to Opus 5 or Fable 5.** Those return
> `advisor_redacted_result`, an encrypted blob the client cannot read. Opus 4.8
> returns plaintext `advisor_result`, which is persisted alongside the events it
> shaped. This dataset publishes provenance; unreadable advice would break that.
> `src/__tests__/pipeline.test.ts` asserts this and will fail if it changes.

**Structured outputs.** The response is constrained by `EVENT_SCHEMA` via
`output_config.format`. Truncation is now a hard failure — the previous
salvage-a-truncated-array path silently dropped every event past the cut point
and reported success. Schema rules: no `minimum`/`maximum`/`minLength`,
`additionalProperties: false` on every object, enums carry the validation.

**Untrusted input.** Article bodies are arbitrary web text. Extraction rules live
in the `system` parameter and are never concatenated with article content, and
every extracted event must cite a URL fetched in that same run.

**Cost.** Haiku 5.5 is $0.10/$0.50 per MTok for prompts up to 100K tokens
($0.50/$2.50 beyond); the Opus 4.8 advisor is $5/$25. Advisor
tokens do **not** appear in top-level `usage` — they are in `usage.iterations[]`
with `type: "advisor_message"`, and the pipeline sums them into its own stats.
Measure your own runs rather than trusting a figure written here.

### AI Chat System (3-tier cost model)
1. **Tier 1 — Precomputed** (12 suggested questions): Zero cost, instant
2. **Tier 2 — Cached**: (future)
3. **Tier 3 — Live Claude**: Haiku 5.5 (well under $0.001/question), rate limited 10/hr/IP

### Admin Dashboard
- Accessible at `/admin` (requires `ADMIN_SECRET` env var)
- **Tabbed layout**: Overview, Events, Analytics, Controls, Logs
- **Controls**: trigger pipeline updates, clear article cache, adjust cron interval, send notifications
- **Installable as separate PWA** on mobile (distinct red icon)
- Auto-refreshes every 30 seconds

### Notification System
- Pipeline sends POST to `/api/notifications` when new events are added
- Persisted to `src/data/notification.json` (survives restarts)
- Frontend polls every 30 seconds via `useNotifications` hook
- Shows amber banner on ALL screens (including landing page)
- Dismissed state tracked in localStorage (won't re-show same notification)
- Browser push notifications if permission granted (requires HTTPS)

### Security
- API keys in .env.local only (gitignored, server-side only)
- No NEXT_PUBLIC_ prefix on secrets — never sent to browser
- Admin auth: httpOnly cookie + X-Admin-Token header, SHA-256 timing-safe comparison
- Input guardrails: jailbreak detection, off-topic rejection, weapon content blocked
- Output guardrails: catches if Claude goes off-rails
- Daily spend cap: see `MAX_DAILY_TOKENS` in `src/app/api/chat/route.ts`. Note it is process-local and resets on every PM2 restart, so it is not a true daily cap
- UFW firewall: only ports 22, 80, 443 open
- fail2ban for SSH brute force protection

## Coding Conventions

### TypeScript (Frontend)
- Strict mode. No `any`. No untyped functions.
- Functional components only. No class components.
- Use `@/` import alias for all internal imports.
- Tailwind for styling. No CSS modules. No styled-components.
- Mobile-first responsive design. Always.
- Components: PascalCase files. Hooks: use prefix.
- react-map-gl v8: MUST import from `react-map-gl/mapbox` NOT `react-map-gl`

### Pipeline (Node.js)
- No fabricated events — every event must trace to a real article URL.
- Fatalities = per-event only. NEVER use cumulative death toll numbers.
- No events before conflict start date (2026-02-28).
- Source tiering for confidence adjustment.
- Deduplication via description similarity + spatio-temporal proximity.

### API Design
- Rate limited: all endpoints, stricter on AI.
- Parameterized queries only.

### Security Rules
- NEVER commit .env files or API keys.
- NEVER expose ANTHROPIC_API_KEY or ADMIN_SECRET to client.
- Sanitize ALL user input before passing to AI models.
- Rate limit everything. Especially AI endpoints.

### Git Conventions
- Commit messages: imperative mood, < 72 chars first line.
- Branch naming: feature/*, fix/*, data/*
- No force pushes to main.

## Environment Variables (.env.local)
```
NEXT_PUBLIC_MAPBOX_TOKEN=...
ANTHROPIC_API_KEY=...
ADMIN_SECRET=...
NEWSDATA_API_KEY=...  # Optional, enhances article content quality
RESEND_API_KEY=...    # Newsletter; with NEWSLETTER_FROM the subscribe form appears
NEWSLETTER_FROM="War Library <dispatch@example.com>"  # Verified Resend domain
NEWSLETTER_REPLY_TO=... # Optional
NEWSLETTER_SECRET=...   # Optional; signs confirmation links (defaults to ADMIN_SECRET)
TRANSLATE_DISPATCHES=false  # Optional kill switch for dispatch translation
```

## Key Principles
- **Human-first**: Center the human cost. Event descriptions lead with who was affected, not operational details. People are not statistics.
- **Accurate**: Per-event fatalities only — no cumulative double-counting. Discrepancies with verified cumulative totals acknowledged via disclaimers.
- **Accessible**: Anyone in the world can read this. Mobile-first.
- **Verified**: Every event has a source. Distinguish confirmed vs unconfirmed.
- **Budget-conscious**: Haiku for chat/extraction, token-optimized prompts, aggressive caching.
- **Humanitarian**: 100% of proceeds to verified aid organizations.
