# War Library — AI Coding Instructions

## Project Overview
War Library (warlibrary.midatlantic.ai) — a neutral, factual, living war library
tracking the 2026 US-Israel war on Iran (Operation Epic Fury). Open to anyone in
the world. 100% of monetization proceeds go to humanitarian aid.

**Live at:** https://warlibrary.midatlantic.ai

## Tech Stack
- **Frontend**: Next.js 16.1.6 / React 19 / TypeScript (strict) / Tailwind CSS 4
- **Map**: Mapbox GL JS via react-map-gl v8 (`import from "react-map-gl/mapbox"`)
- **AI Chat**: Claude Haiku 4.5 via @anthropic-ai/sdk (Next.js API route)
- **Testing**: Vitest + Testing Library + happy-dom (129 tests, 3 suites)
- **PWA**: Service worker, web app manifest, install prompt, push notifications
- **Backend**: Python 3.12+ / FastAPI / SQLAlchemy (async) / PostGIS (scaffolded, not yet active)
- **Database**: Seed JSON files in src/data/ (PostGIS planned)
- **Hosting**: DigitalOcean droplet (Ubuntu 24.04, 2GB RAM)
- **Reverse Proxy**: Caddy (auto-SSL via Let's Encrypt)
- **CDN/DNS**: Cloudflare (DNS, DDoS protection, caching)
- **Process Manager**: PM2
- **Domain**: warlibrary.midatlantic.ai (DNS via Cloudflare, registrar GoDaddy)
- **Repo**: https://github.com/midatlanticAI/WarLibrary (public, MIT)

## Architecture

### Frontend (src/)
```
src/
├── app/
│   ├── page.tsx              # Main page — tab router (map|ask|donate|sources|about)
│   ├── layout.tsx            # Root layout, dark theme, Mapbox CSS, PWA meta
│   ├── globals.css           # Dark war-room aesthetic, custom scrollbars
│   └── api/
│       ├── chat/route.ts     # Claude AI chat endpoint (Haiku 4.5, guardrailed)
│       ├── admin/route.ts    # Admin auth (httpOnly cookie, timing-safe)
│       ├── events/route.ts   # Event data API (for future backend)
│       ├── health/route.ts   # Health check endpoint
│       ├── notifications/route.ts # Push notification endpoint (admin POST, client GET)
│       └── stats/route.ts    # Event statistics endpoint
├── components/
│   ├── map/
│   │   ├── ConflictMap.tsx   # Mapbox interactive map with markers
│   │   └── MapLegend.tsx     # Filter by event type and country
│   ├── timeline/
│   │   └── TimelineSlider.tsx # Date range filter with histogram
│   ├── chat/
│   │   └── AskPanel.tsx      # Chat-style AI Q&A with markdown rendering
│   ├── pwa/
│   │   └── PWAProvider.tsx   # Install prompt + notification permission banners
│   └── ui/
│       ├── Header.tsx        # Nav tabs + live indicator
│       ├── MobileNav.tsx     # Bottom tab bar (mobile only)
│       ├── EventPanel.tsx    # Scrollable event feed sidebar
│       ├── ContentWarning.tsx # First-visit landing + return briefing
│       ├── OverviewBanner.tsx # Situation summary + stats
│       ├── DonationPanel.tsx # 8 verified humanitarian orgs
│       ├── SourcesPage.tsx   # Data source methodology
│       ├── AboutPage.tsx     # About + editorial policy
│       └── SourceFooter.tsx  # Footer with source links
├── __tests__/
│   ├── setup.ts              # Test setup (conditional jest-dom import)
│   ├── api-chat.test.ts      # 83 tests: guardrails, rate limiting, spend tracking
│   ├── components.test.tsx   # 30 tests: AskPanel, EventPanel, useEvents
│   └── data-integrity.test.ts # 16 tests: event data, PWA manifest validation
├── data/
│   ├── events.json           # 48 original events (Feb 28 – Mar 8)
│   ├── events_expanded.json  # 64 expanded events (15+ countries)
│   └── events_latest.json    # 12 latest verified events (Mar 8)
├── hooks/
│   ├── useEvents.ts          # Merges all 3 event files, sorts chronologically
│   └── useNotifications.ts   # Polls for push notifications, shows via SW
├── lib/
│   └── api.ts                # API client (for future backend)
└── types/
    └── index.ts              # ConflictEvent, Faction, etc.

public/
├── sw.js                     # Service worker (network-first cache, push)
├── manifest.webmanifest      # PWA manifest (installable, standalone)
├── icons/                    # PWA icons (192, 512, maskable variants)
└── robots.txt                # Search engine directives

scripts/
├── audit-ask-ai.mjs          # Agent SDK audit of Ask AI section
├── generate-icons.mjs         # PWA icon generator (sharp)
├── auto-update.sh             # Automated event update pipeline
├── update-events.js           # Event data update script
├── test-chat-agent.mjs        # Chat agent test script
└── test-update-agent.mjs      # Update agent test script
```

### Data: 124 verified events across 17+ countries
Sources: Al Jazeera, CNN, BBC, Reuters, NPR, Washington Post, Times of Israel,
Axios, PBS, France 24, Naval News, UN News, ACLED, and more.

### AI Chat System (3-tier cost model)
1. **Tier 1 — Precomputed** (12 suggested questions): Zero cost, instant
2. **Tier 2 — Cached**: Cheap (future)
3. **Tier 3 — Live Claude**: Haiku 4.5 (~$0.001/question), rate limited 10/hr/IP

### Security
- API keys in .env.local only (gitignored, server-side only, chmod 600)
- No NEXT_PUBLIC_ prefix on secrets — never sent to browser
- Admin auth: httpOnly cookie + timing-safe comparison
- Input guardrails: jailbreak detection, off-topic rejection, weapon content blocked
- Output guardrails: catches if Claude goes off-rails
- Daily spend cap: 2M tokens/day hard limit
- CSP, HSTS, X-Frame-Options DENY, no server fingerprinting
- fail2ban: SSH brute force, API abuse, bad bot jails
- UFW: only ports 22, 80, 443
- SSH: key-only, no password, max 3 attempts
- Kernel hardened: SYN flood protection, anti-spoofing, no source routing
- Auto security updates via unattended-upgrades

## Coding Conventions

### TypeScript (Frontend)
- Strict mode. No `any`. No untyped functions.
- Functional components only. No class components.
- Use `@/` import alias for all internal imports.
- Tailwind for styling. No CSS modules. No styled-components.
- Mobile-first responsive design. Always.
- Components: PascalCase files. Hooks: use prefix.
- react-map-gl v8: MUST import from `react-map-gl/mapbox` NOT `react-map-gl`

### Python (Backend — future)
- Type hints on ALL function signatures.
- Async by default for all I/O.
- Pydantic models for all API validation.
- SQLAlchemy ORM only — never raw SQL from user input.

### API Design
- All responses: `{ data, meta, errors }` envelope.
- Rate limited: all endpoints, stricter on AI.
- Parameterized queries only. Never interpolate user input.

### Security Rules
- NEVER commit .env files or API keys.
- NEVER expose ANTHROPIC_API_KEY or ADMIN_SECRET to client.
- Sanitize ALL user input before passing to AI models.
- Rate limit everything. Especially AI endpoints.
- CSP headers on all pages.

### Git Conventions
- Commit messages: imperative mood, < 72 chars first line.
- Branch naming: feature/*, fix/*, data/*
- No force pushes to main.

## Deployment
```bash
# Local dev
cd frontend && npm run dev  # runs on port 3001 (3000 used by other app)

# Run tests
npm test

# Production deploy (one command)
bash deploy.sh  # requires DEPLOY_SERVER env var (e.g. root@your-server-ip)

# Manual production deploy
tar --exclude='node_modules' --exclude='.next' --exclude='.env.local' -czf /tmp/warlibrary.tar.gz .
scp /tmp/warlibrary.tar.gz root@$SERVER_IP:/opt/warlibrary.tar.gz
ssh root@$SERVER_IP "cd /opt/warlibrary && tar xzf /opt/warlibrary.tar.gz && rm /opt/warlibrary.tar.gz && npm install && npm run build && pm2 restart warlibrary"
```

## Key Principles
- **Neutral**: No sides. All perspectives presented. Source-attributed.
- **Accessible**: Anyone in the world can read this. Mobile-first.
- **Verified**: Every event has a source. Distinguish confirmed vs unconfirmed.
- **Budget-conscious**: Haiku for chat, precomputed answers, aggressive caching.
- **Humanitarian**: 100% of proceeds to verified aid organizations.
