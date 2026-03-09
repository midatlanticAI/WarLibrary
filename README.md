# War Library

A neutral, factual, open-source conflict tracker for the 2026 US-Israel war on Iran (Operation Epic Fury). Open to anyone in the world.

**Live at:** [warlibrary.midatlantic.ai](https://warlibrary.midatlantic.ai)

100% of monetization proceeds go to humanitarian aid.

---

## What It Does

- **Interactive conflict map** — Mapbox-powered map with event markers, country filtering, and a timeline slider to scrub through events by date
- **124 verified events** across 17+ countries, sourced from Al Jazeera, CNN, BBC, Reuters, NPR, Washington Post, and 20+ other outlets
- **AI-powered Q&A** — Ask questions about the conflict and get sourced, guardrailed answers via Claude Haiku 4.5
- **Donation directory** — 8 verified humanitarian organizations (ICRC, UNHCR, MSF, UNICEF, IRC, Direct Relief, WFP, Save the Children)
- **PWA** — Installable as a native app on any device, with push notification support
- **Mobile-first** — Designed for phones, fully responsive

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 16.1.6 / React 19 / TypeScript (strict) |
| Styling | Tailwind CSS 4 |
| Map | Mapbox GL JS via react-map-gl v8 |
| AI Chat | Claude Haiku 4.5 via @anthropic-ai/sdk |
| Testing | Vitest + Testing Library (129 tests) |
| Hosting | DigitalOcean + Caddy (auto-SSL) + PM2 |

## Getting Started

### Prerequisites

- Node.js 20+
- A [Mapbox access token](https://account.mapbox.com/access-tokens/) (free tier works)
- An [Anthropic API key](https://console.anthropic.com/) (for AI chat — optional)

### Setup

```bash
# Clone
git clone https://github.com/midatlanticAI/WarLibrary.git
cd WarLibrary

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local
# Edit .env.local with your Mapbox token and (optionally) Anthropic API key

# Run dev server
npm run dev
```

The app runs at `http://localhost:3000` by default.

### Running Tests

```bash
npm test            # Run all 129 tests
npm run test:watch  # Watch mode
```

## Project Structure

```
src/
├── app/
│   ├── page.tsx                # Main page — tab router
│   ├── layout.tsx              # Root layout, dark theme
│   └── api/
│       ├── chat/route.ts       # Claude AI chat endpoint (guardrailed)
│       ├── notifications/      # Push notification endpoint
│       └── admin/route.ts      # Admin auth
├── components/
│   ├── map/                    # ConflictMap + MapLegend
│   ├── timeline/               # TimelineSlider with histogram
│   ├── chat/                   # AskPanel (AI Q&A interface)
│   ├── pwa/                    # PWAProvider (install + notifications)
│   └── ui/                     # Header, EventPanel, DonationPanel, etc.
├── data/
│   ├── events.json             # 48 original events
│   ├── events_expanded.json    # 64 expanded events
│   └── events_latest.json     # 12 latest verified events
├── hooks/                      # useEvents, useNotifications
├── lib/                        # API client
└── types/                      # TypeScript types
```

## AI Chat System

The Ask AI feature uses a 3-tier cost model:

1. **Precomputed** — 12 suggested questions with instant, zero-cost answers
2. **Cached** — (planned) Frequently asked questions served from cache
3. **Live Claude** — Haiku 4.5 responses (~$0.001/question), rate limited to 10/hr per IP

All AI responses are guardrailed:
- Jailbreak detection (prompt injection, role-play attempts)
- Off-topic rejection (non-conflict questions filtered)
- Weapon/violence content blocking
- Output validation (catches off-rails responses)
- Daily spend cap (2M tokens/day)

## Security

- API keys server-side only — never sent to browser
- Admin auth via httpOnly cookies with timing-safe comparison
- Input sanitization on all user-facing endpoints
- Rate limiting on all API routes (stricter on AI)
- CSP, HSTS, X-Frame-Options headers

## Editorial Policy

- **Neutral** — No sides taken. All perspectives presented with source attribution.
- **Verified** — Every event cites at least one source. Unconfirmed reports are labeled.
- **Accessible** — Plain language. Mobile-first. Available to anyone worldwide.
- **Humanitarian** — 100% of any monetization proceeds go to verified aid organizations.

## Contributing

Contributions welcome. Please:

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit with clear messages
4. Open a PR

For event data contributions, include source URLs for verification.

## License

MIT

---

Built with care during a difficult time. If this project helps you understand what's happening, please consider donating to one of the [humanitarian organizations](https://warlibrary.midatlantic.ai) listed on the site.
