# War Library — Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        USERS                                 │
│         (browser / mobile / PWA installed app)                │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                      CLOUDFLARE                               │
│         DNS, DDoS protection, CDN, SSL termination            │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              DIGITALOCEAN DROPLET (Ubuntu 24.04)              │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐     │
│  │  CADDY (reverse proxy)                               │     │
│  │  - Auto-SSL (Let's Encrypt)                          │     │
│  │  - HSTS, CSP, security headers                       │     │
│  │  - Gzip compression                                  │     │
│  │  - warlibrary.midatlantic.ai → localhost:3000        │     │
│  └──────────────────────┬──────────────────────────────┘     │
│                         │                                     │
│  ┌──────────────────────▼──────────────────────────────┐     │
│  │  NEXT.JS 16 (PM2 managed)                           │     │
│  │                                                      │     │
│  │  Static Pages:                                       │     │
│  │  └── / (main app — map, feed, ask, donate, etc.)    │     │
│  │                                                      │     │
│  │  API Routes (server-side):                           │     │
│  │  ├── /api/chat          → Claude Haiku 4.5          │     │
│  │  ├── /api/admin         → Admin auth (httpOnly)     │     │
│  │  ├── /api/events        → Event data API            │     │
│  │  ├── /api/notifications → Push notifications        │     │
│  │  ├── /api/analytics     → Page views + AI questions │     │
│  │  ├── /api/push          → Push subscription mgmt   │     │
│  │  ├── /api/stats         → Event statistics          │     │
│  │  └── /api/health        → Health check              │     │
│  │                                                      │     │
│  │  PWA Assets:                                         │     │
│  │  ├── /sw.js             → Service worker            │     │
│  │  ├── /manifest.webmanifest → App manifest           │     │
│  │  └── /icons/            → App icons (7 sizes)       │     │
│  └──────────────────────┬──────────────────────────────┘     │
│                         │                                     │
│  ┌──────────────────────▼──────────────────────────────┐     │
│  │  SECURITY LAYER                                      │     │
│  │  ├── fail2ban (SSH, API abuse, bad bots)            │     │
│  │  ├── UFW (ports 22, 80, 443 only)                   │     │
│  │  ├── SSH key-only auth                               │     │
│  │  └── Kernel hardening (SYN flood, anti-spoof)       │     │
│  └─────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘

External Services:
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   MAPBOX     │  │  ANTHROPIC   │  │  CLOUDFLARE  │
│  (map tiles) │  │  (Claude AI) │  │  (DNS/CDN)   │
│  Client-side │  │  Server-side │  │   Proxy      │
└──────────────┘  └──────────────┘  └──────────────┘
```

## Data Flow

### Event Data (live pipeline — runs every 30 min)
```
JSON files (src/data/)
  ├── events.json          (48 seed events)
  ├── events_expanded.json (64 expanded events)
  └── events_latest.json   (pipeline-appended, ~23k — GITIGNORED, server-only)
        │
        ▼
  /api/events route
  (merges, deduplicates, sorts chronologically)
        │
        ▼
  useEvents.ts hook → ConflictEvent objects (polls conditionally via ETag)
  (shared across all components)

Pipeline sources:
  NewsData.io API ──┐
  Google News RSS ──┤──→ update-events.js ──→ events_latest.json ──→ API ──→ Frontend
  6 Outlet RSS ─────┘    (every 30 min via cron)
```

### AI Chat Flow
```
User question
      │
      ▼
  ┌─ Precomputed? (12 suggested questions)
  │   YES → Return instantly (zero cost)
  │   NO ↓
  ├─ Rate limited? (10/hr per IP, admin exempt)
  │   YES → Return 429
  │   NO ↓
  ├─ Input guardrails pass?
  │   NO → Return filtered response
  │   YES ↓
  ├─ Claude Haiku 4.5 API call
  │   (system prompt + events database as context)
  │   (~$0.001 per question)
  │       │
  │       ▼
  ├─ Output guardrails pass?
  │   NO → Return filtered response
  │   YES ↓
  └─ Daily spend cap exceeded?
      YES → Return 503
      NO → Return answer + sources
```

## Frontend Tab Architecture
```
page.tsx (tab router)
  │
  ├── "map"     → ConflictMap + EventPanel + TimelineSlider + OverviewBanner
  ├── "ask"     → AskPanel (chat-style AI Q&A with markdown rendering)
  ├── "donate"  → DonationPanel (human cost data + 8 verified humanitarian orgs)
  ├── "sources" → SourcesPage (methodology + source list)
  └── "about"   → AboutPage (mission, limitations, editorial policy)

Mobile adds:
  └── "feed"    → EventPanel (full screen on mobile)

Navigation:
  ├── Header.tsx      → Desktop nav tabs (hidden on mobile)
  └── MobileNav.tsx   → Bottom tab bar (hidden on desktop)

Overlays:
  ├── ContentWarning  → First-visit landing + return briefing
  └── PWAProvider     → Install prompt (after 30s) + notification permission (after 2min)
```

## PWA Architecture
```
Service Worker (public/sw.js):
  ├── Network-first caching (skips /api/ and Mapbox tile requests)
  ├── Push notification handler (action buttons: View update / Dismiss)
  └── Notification click → opens app or focuses existing window

Manifest (public/manifest.webmanifest):
  ├── Standalone display, dark theme (#0a0a0a)
  └── Icons: 192x192, 512x512 + maskable variants

Client (PWAProvider.tsx):
  ├── Install prompt banner (appears after 30s, dismissible, remembers choice)
  ├── Notification permission banner (appears after 2min)
  └── Preferences stored in localStorage (wl_install_dismissed, wl_notif_enabled)

Notification polling (useNotifications.ts):
  └── Polls /api/notifications every 30s when enabled
```

## Test Architecture
```
vitest.config.ts
  ├── Default environment: node
  ├── .tsx suites opt into happy-dom via a // @vitest-environment docblock
  └── @ alias mapped to src/

Unit suites (6 files, 274 tests):
  ├── api-chat.test.ts        — guardrails, rate limiting, spend tracking
  ├── components.test.tsx     — AskPanel, EventPanel, useEvents hook
  ├── admin-dashboard.test.ts — auth, cron validation, pipeline history, cache
  ├── data-integrity.test.ts  — event data structure, PWA manifest
  ├── i18n.test.tsx           — key parity across 4 locales, dir/lang, plurals
  └── pipeline.test.ts        — geocoding, dedup spatial guard, date validation,
                                 extraction schema, advisor pairing

E2E specs (5 files, 55 tests): app, admin, timeline, data-freshness, i18n
```

Two caveats a reader should know:

- **`api-chat.test.ts` and `admin-dashboard.test.ts` test re-implemented copies
  of the route logic**, not the routes themselves — both files say so at the
  top. A regression in the real handler will not fail them. Extracting those
  pure functions into `src/lib/` so the tests import production code is
  outstanding work.
- **The data-integrity suite only sees 112 events in CI**, because
  `events_latest.json` is gitignored. Its assertions are correct and do catch
  real defects — they simply never ran against the data that has them. Run it
  against a production snapshot to exercise it properly.

Typechecking is split: `npm run typecheck` covers the app, `npm run
typecheck:e2e` covers Playwright specs and configs, which the app tsconfig
excludes. Both run in CI.

## Security Architecture

### Layers
1. **Network**: UFW firewall (22/80/443 only)
2. **SSH**: Key-only, no password, max 3 attempts, fail2ban
3. **Transport**: Caddy auto-SSL, HSTS with preload
4. **Application**: CSP, X-Frame-Options DENY, no server fingerprinting
5. **API**: Rate limiting (per-IP), input sanitization, output validation
6. **AI**: Jailbreak detection (15 regex patterns), topic relevance check (130+ keywords), output guardrails, daily spend cap (`MAX_DAILY_TOKENS`, process-local — resets on restart)
7. **Admin**: httpOnly secure cookie, timing-safe comparison, separate from rate limits
8. **Secrets**: .env.local only (chmod 600), no NEXT_PUBLIC_ prefix, gitignored

### Admin Auth Flow
```
POST /api/admin { secret: "..." }
  → timing-safe compare against ADMIN_SECRET env var
  → set httpOnly cookie (wl_admin = sha256(secret))
  → 30-day expiry, secure in prod, sameSite strict

Subsequent requests:
  /api/chat reads cookie → if valid hash, skip rate limit
```

## Production Environment
- **Server**: DigitalOcean droplet, 2GB RAM, 2 vCPU, 60GB disk, Ubuntu 24.04
- **Domain**: warlibrary.midatlantic.ai (Cloudflare DNS → origin server)
- **SSL**: Let's Encrypt via Caddy (auto-renewal), Cloudflare Full (strict)
- **Process**: PM2 (auto-restart on crash/reboot)
- **App path**: /opt/warlibrary
- **Env file**: /opt/warlibrary/.env.local (chmod 600)
- **Logs**: /var/log/caddy/warlibrary.log (JSON format)
- **Deploy**: `bash deploy.sh` (requires DEPLOY_SERVER env var)
- **Repo**: https://github.com/midatlanticAI/WarLibrary (public)

## Cost Model
| Component | Cost | Notes |
|-----------|------|-------|
| DigitalOcean droplet | $18/mo | 2GB/2vCPU |
| Mapbox | Free tier | 50K map loads/mo |
| Claude Haiku 4.5 | $1 / $5 per MTok | Chat + extraction executor |
| Claude Opus 4.8 | $5 / $25 per MTok | Extraction advisor. Billed separately — advisor tokens appear in `usage.iterations[]`, not in top-level `usage` |
| Domain (midatlantic.ai) | ~$15/yr | GoDaddy |
| SSL | Free | Let's Encrypt via Caddy |

Deliberately no monthly total. The previous one was computed at $0.25/$1.25 per
MTok — roughly a quarter of Haiku 4.5's actual rate — and predated the advisor
entirely. Measure real runs from `pipeline-stats.json`, which now records
executor and advisor tokens separately.

## Prompt caching, and why it is not enabled

Haiku 4.5's minimum cacheable prefix is **4,096 tokens**. The pipeline's stable
instruction block is roughly 1,200–1,500, so a `cache_control` breakpoint there
would silently never cache — no error, no savings, no signal. Caching the
extraction prompt requires either deliberately growing the static preamble past
4K or moving the executor to a model with a lower minimum. The advisor tool has
its own separate `caching` option, worth enabling only for conversations
expecting three or more advisor calls; this pipeline caps at two.

## Roadmap

**Shipped since this document was first written** — these were previously listed
as future work:

- GitHub Actions CI (lint, typecheck, e2e typecheck, unit tests, build, gated security audit)
- Multi-language support — English, Spanish, Arabic, Hebrew (note: Farsi and French were planned, and are not what shipped)
- Marker clustering at low zoom (Mapbox-native, replacing per-event DOM markers)

**Outstanding:**

1. Backfill `source_url` for the 131 events that name outlets but carry no link (112 seed + ~19 early multi-outlet entries). Every event is attributed; these are just not one-click checkable
2. Normalise `country` to ISO codes — until then no country count is meaningful
3. Resolve the 5 events with unrepairable dates (annotated `needs_review`)
3. Extract chat/admin guardrail functions to `src/lib/` so tests import production code instead of copies
4. Run the data-integrity suite against live data on a schedule, not just against the 112 seed events
5. Persist the chat spend cap and rate-limit state (both reset on PM2 restart)
6. Trust-boundary fix for per-IP rate limiting (currently reads the attacker-controlled leftmost `X-Forwarded-For`)
7. Sync the event feed to the timeline range — map and feed currently show different datasets
8. Live data pipeline (ACLED/GDELT)
9. PostgreSQL/PostGIS backend
10. Sentry error tracking
11. DigitalOcean automated snapshots
