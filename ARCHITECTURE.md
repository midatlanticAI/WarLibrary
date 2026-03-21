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
  └── events_latest.json   (2,798+ pipeline-appended events, growing)
        │
        ▼
  /api/events route
  (merges, deduplicates, sorts chronologically)
        │
        ▼
  useEvents.ts hook → 2,900+ ConflictEvent objects
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
  ├── .tsx files: happy-dom (via environmentMatchGlobs)
  └── @ alias mapped to src/

Test Suites (176 tests):
  ├── api-chat.test.ts        (83 tests) — guardrails, rate limiting, spend tracking
  ├── components.test.tsx     (30 tests) — AskPanel, EventPanel, useEvents hook
  ├── admin-dashboard.test.ts (47 tests) — auth, cron validation, pipeline history, cache
  └── data-integrity.test.ts  (16 tests) — event data structure, PWA manifest
```

## Security Architecture

### Layers
1. **Network**: UFW firewall (22/80/443 only)
2. **SSH**: Key-only, no password, max 3 attempts, fail2ban
3. **Transport**: Caddy auto-SSL, HSTS with preload
4. **Application**: CSP, X-Frame-Options DENY, no server fingerprinting
5. **API**: Rate limiting (per-IP), input sanitization, output validation
6. **AI**: Jailbreak detection (15 regex patterns), topic relevance check (130+ keywords), output guardrails, daily spend cap (2M tokens)
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
| Claude Haiku 4.5 | ~$0.001/question | $0.25/$1.25 per M tokens |
| Domain (midatlantic.ai) | ~$15/yr | GoDaddy |
| SSL | Free | Let's Encrypt via Caddy |
| **Estimated monthly** | **~$20-25/mo** | At moderate traffic |

## Future Roadmap
1. Live data pipeline (ACLED/GDELT via OpenClaw agents)
2. PostgreSQL/PostGIS backend (Docker Compose)
3. Claude Agent SDK for complex multi-step analysis
4. Prompt caching (90% cost reduction on repeated context)
5. GitHub Actions CI/CD (run tests on PR, auto-deploy on merge)
6. Multi-language support (Arabic, Farsi, Hebrew, French)
7. Marker clustering at low zoom levels
8. Sentry error tracking
9. DigitalOcean automated snapshots
