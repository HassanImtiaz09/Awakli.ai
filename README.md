# Awakli — AI Manga-to-Anime Platform

Awakli lets creators turn text prompts into manga panels and animated episodes using AI image and video generation. The platform handles the full pipeline: script → character extraction → panel generation → video assembly.

## Quick Start

```bash
pnpm install
pnpm dev          # starts dev server on port 3000
pnpm test         # runs vitest suite
pnpm build        # production build
```

## Architecture Overview

```
client/           React 19 + Tailwind 4 + tRPC hooks
server/           Express 4 + tRPC 11 procedures
  _core/          Auth (Manus OAuth), env validation, rate limiting, observability
  character-bible/ Character extraction, reference sheets, QA gate, LoRA training
  image-router/   Multi-provider routing, A/B testing, budget tracking, canary probes
  stripe/         Subscription billing, credit packs, webhooks
  observability/  Structured logging, request timing, health endpoint
drizzle/          Schema + SQL migrations (TiDB/MySQL)
shared/           Constants and types shared between client and server
```

## Key Subsystems

### Authentication
- **Manus OAuth** with CSRF-safe nonce flow (session-bound nonce cookie)
- Session cookies: `SameSite=lax`, `Secure=true`, `HttpOnly=true`
- Role-based access: `publicProcedure`, `protectedProcedure`, `adminProcedure`
- Tier-gated access: `requireTier("creator")`, `creatorProcedure`, `studioProcedure`

### Image Generation Pipeline
1. **Character Extraction** — LLM extracts characters from script with visual profiles
2. **Reference Sheet Generation** — Triple-pose reference with auto-selection ranking
3. **Identity Lock** — IP-Adapter (weight 0.65) or LoRA for character consistency
4. **Shot Planning** — Height-ratio skeletons, depth maps, regional prompting
5. **QA Gate** — Face similarity, height-ratio compliance, style coherence checks

### Provider Router
- Multi-provider support: Runware, TensorArt, Fal, Kling, MiniMax, Runway
- A/B testing engine with traffic splitting and statistical significance
- DB-backed budget tracking with daily org ceiling circuit breaker
- Idempotency dedup (24h TTL) to prevent duplicate generation requests
- Canary probes (guarded behind `ENABLE_CANARIES=true` env)

### Billing (Stripe)
- Subscription tiers: Free Trial → Creator → Creator Pro → Studio → Enterprise
- Credit packs (one-time purchases)
- Webhook handlers: subscription lifecycle, invoice payments, refunds, disputes
- 14-day no-questions refund policy (consumed credits excluded)

### Observability
- Structured JSON logging via `Logger` class (module-scoped)
- Request timing middleware with `X-Response-Time` header
- Health endpoint: `GET /api/health` (DB connectivity + uptime)
- Pre-configured loggers: `serverLog`, `stripeLog`, `authLog`, `pipelineLog`, `qaLog`

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | MySQL/TiDB connection string |
| `JWT_SECRET` | Yes | Session cookie signing (min 16 chars) |
| `VITE_APP_ID` | Yes | Manus OAuth application ID |
| `OAUTH_SERVER_URL` | Yes | Manus OAuth backend base URL |
| `STRIPE_SECRET_KEY` | Yes | Stripe API secret key |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe webhook signing secret |
| `ENABLE_CANARIES` | No | Set to `true` to enable provider health probes |
| `LOG_LEVEL` | No | Minimum log level: `debug`, `info`, `warn`, `error` |

See `server/_core/env.ts` for the full validated list.

## Database Migrations

Schema lives in `drizzle/schema.ts`. To add or modify tables:

1. Edit `drizzle/schema.ts`
2. Run `pnpm drizzle-kit generate` to produce migration SQL
3. Apply the SQL via `webdev_execute_sql` or your DB client
4. Keep the TypeScript schema and actual database in sync

## Testing

```bash
pnpm test                          # run all tests
pnpm vitest run server/auth        # run specific test file
pnpm vitest run --reporter=verbose # verbose output
```

Tests use Vitest with module mocking. See `server/auth.logout.test.ts` for the reference pattern.

### QA Fixture Mode

Append `?qa=script` or `?qa=panels` to the create-flow URLs to render the Script and Panels stages with deterministic fixture data. No tRPC calls are made, no project ID is required, and all components render with realistic demo content.

```
/create/script?qa=script    → ScriptEditor with 3 scenes, drag-and-drop, RegenPopover, CharacterChip drawer
/create/panels?qa=panels    → PanelGrid (12 panels), PanelLightbox, PanelBatchBar, StyleDrift, ConsistencyReport
```

Fixture data lives in `client/src/fixtures/qaFixtures.ts`. The QA branches are guarded by the `isQA` flag and short-circuit before any data fetching, so they are safe to use in production builds.

## Security Notes

- JWT_SECRET and KEK (derived from JWT_SECRET) are validated at boot — server refuses to start without them
- Provider encryption keys use AES-256-GCM with a boot-time canary self-test
- Rate limiting: auth (20/5min), image gen (30/hr), character extraction (10/hr), default (300/min)
- OAuth state uses session-bound nonce (not predictable `btoa(redirectUri)`)
- No `OWNER_OPEN_ID` admin bypass — admin role is set explicitly in the database

## License

Proprietary. All rights reserved.
