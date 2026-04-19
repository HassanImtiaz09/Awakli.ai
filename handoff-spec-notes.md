# Awakli Handoff Prompts Summary

## Pre-work Decisions (need user input for some)
- D1: Password form → delete for beta (OAuth-only) or implement real auth
- D2: Legal pages → generator service, lawyer, or placeholder
- D3: Refund policy → 14-day no-questions on sub, no refund on consumed credits
- D4: Fabricated stats → remove counters and mock cards

## Prompt 1a — C-1 CRITICAL: Remove OWNER_OPEN_ID admin bypass
- Location: server/db.ts ~line 81
- Remove auto-admin promotion based on OWNER_OPEN_ID env var
- Add one-shot SQL migration to promote existing owner by literal user ID
- Remove from .env.example

## Prompt 1b — C-2 CRITICAL: JWT_SECRET fail-fast
- Location: server/_core/env.ts ~line 3
- Require JWT_SECRET non-empty, min 32 chars, fail at boot
- Use zod schema validation
- All downstream must import from env.ts validated export

## Prompt 1c — C-3 CRITICAL: Provider-router KEK fail-fast
- Location: server/provider-router/registry.ts ~line 202
- Remove all-zeros fallback for encryption key
- Add boot-time self-test (encrypt/decrypt canary)
- Add to env.ts zod schema

## Prompt 1d — H-2 + H-4: Cookie policy + Rate limiting
- H-2: server/_core/cookies.ts → SameSite=lax, Secure=true, HttpOnly=true
- H-4: Rate limiting middleware on tRPC:
  - auth.*: 20/5min per IP
  - image/panel gen: 30/hour per user
  - character-bible extraction: 10/hour per user
  - default: 300/min per user
  - Return 429 with Retry-After header

## Prompt 2 — Pipeline integrity (C-4, C-6, C-7, H-5, H-6)
- C-4: Redis/DB-backed budget store (replace in-memory Map) + circuit breaker
- C-7: Idempotency dedup table (userId, idempotencyKey, 24h TTL)
- C-6: Real ControlNet pose + depth maps (OpenPose 0.55, depth 0.35)
- H-5: Real ArcFace face similarity (fail <0.72, warn <0.80, pass >=0.80)
- H-6: Auto-retry loop on QA fail (max 3 attempts, exponential backoff, then human_review)

## Prompt 3 — Monetisation & trust (C-5, H-3, H-7, H-8, H-10, M-2)
- C-5: Wire TAMS LoRA training into pipeline (gate on creator/studio tier)
- H-3: Stripe refund + dispute handlers
- H-7: Delete password form (OAuth-only for beta)
- H-8: Server-side tier gating (requireTier middleware)
- H-10: Legal pages (Privacy, Terms, Cookies, DMCA)
- M-2: Remove fabricated social proof

## Prompt 4 — Polish & observability (M-6, M-7, L-2, L-5, L-6, L-7)
- M-6: Schedule canary probes every 60s
- M-7: Static routing table (version-controlled constant)
- L-2: Fix social handle links
- L-5: Structured logging with pino
- L-6: OpenTelemetry spans on image pipeline
- L-7: README, CONTRIBUTING, RUNBOOK docs

## Prompt 5 — Final re-audit (Claude, not Manus)
