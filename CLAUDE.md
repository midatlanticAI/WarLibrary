# War Library — AI Coding Instructions

## Project Overview
War Library (warlibrary.midatlantic.ai) — a neutral, factual, living war library
tracking the 2026 US-Israel war on Iran (Operation Epic Fury). Open to anyone in
the world. 100% of monetization proceeds go to humanitarian aid.

**Live at:** https://warlibrary.midatlantic.ai

## Tech Stack
- **Frontend**: Next.js 16.2 / React 19 / TypeScript (strict) / Tailwind CSS 4
- **Map**: Mapbox GL JS via react-map-gl v8 (`import from "react-map-gl/mapbox"`)
- **AI Chat**: Claude Haiku 4.5 via @anthropic-ai/sdk (Next.js API route)
- **Pipeline**: Node.js script extracting events from news via Claude Haiku 4.5
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
│   ├── sitemap.ts            # Dynamic sitemap for SEO
│   ├── admin/
│   │   ├── page.tsx          # Admin dashboard (tabbed: overview|events|analytics|controls|logs)
│   │   └── layout.tsx        # Admin-specific manifest + icons (separate PWA)
│   └── api/
│       ├── chat/route.ts     # Claude AI chat endpoint (Haiku 4.5, guardrailed)
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
│   - Sends to Claude Haiku 4.5 for structured event extraction (8192 max tokens)
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

### Event Pipeline
- Runs every 30 minutes via cron
- Pulls from 3 source types: NewsData.io API (25+ articles), Google News RSS (3 queries), Outlet RSS (6 feeds)
- 20 articles max, 800 chars body per article, `EXTRACTION_MAX_TOKENS` output cap
- Source tiers: Tier 1 (Reuters, AP, BBC, etc.) get confidence boost; Tier 3 penalized. `source` is taken from our fetch record, never from model output

**Executor + advisor.** Extraction runs Haiku 4.5 as executor with a Claude Opus
4.8 **advisor** (`advisor_20260301`, beta `advisor-tool-2026-03-01`, via
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

**Cost.** Haiku 4.5 is $1/$5 per MTok; the Opus 4.8 advisor is $5/$25. Advisor
tokens do **not** appear in top-level `usage` — they are in `usage.iterations[]`
with `type: "advisor_message"`, and the pipeline sums them into its own stats.
Measure your own runs rather than trusting a figure written here.

### AI Chat System (3-tier cost model)
1. **Tier 1 — Precomputed** (12 suggested questions): Zero cost, instant
2. **Tier 2 — Cached**: (future)
3. **Tier 3 — Live Claude**: Haiku 4.5 (~$0.001/question), rate limited 10/hr/IP

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
```

## Key Principles
- **Human-first**: Center the human cost. Event descriptions lead with who was affected, not operational details. People are not statistics.
- **Accurate**: Per-event fatalities only — no cumulative double-counting. Discrepancies with verified cumulative totals acknowledged via disclaimers.
- **Accessible**: Anyone in the world can read this. Mobile-first.
- **Verified**: Every event has a source. Distinguish confirmed vs unconfirmed.
- **Budget-conscious**: Haiku for chat/extraction, token-optimized prompts, aggressive caching.
- **Humanitarian**: 100% of proceeds to verified aid organizations.
