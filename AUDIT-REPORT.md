# Awakli Platform Audit Report

**Date:** April 23, 2026
**Scope:** Full platform readiness assessment — pipeline, integrations, navigation, HITL workflow, payments, and print API
**Verdict:** **Not ready for public advertising.** Core pipeline is architecturally sound, but three blockers and several high-priority issues must be resolved first.

---

## Executive Summary

Awakli is an ambitious AI-powered manga-to-anime platform with a 12-stage HITL pipeline, 70+ tRPC sub-routers, and integrations with Kling AI, ElevenLabs, Cloudflare Stream, Stripe, and multiple image/video generation providers. The codebase is large (2,400+ lines in the main router alone, 127 test files with 4,310 tests) and the architecture is well-structured.

However, the platform has **three blockers** that prevent it from being advertised to a wider audience, plus several high-priority issues that would damage credibility with early adopters.

---

## Blocker Issues (Must Fix Before Launch)

### B1: Stripe Sandbox Not Claimed

The Stripe test sandbox was provisioned but has **never been claimed**. Until the sandbox is claimed, no payment processing works — not even in test mode. Users who click "Upgrade to Mangaka" or "Go Studio" on the pricing page will hit a dead end.

> **Action required:** Claim the sandbox at [this URL](https://dashboard.stripe.com/claim_sandbox/YWNjdF8xVExlVGRCQlZxcnNHVkgzLDE3NzY3MzYzMjEv100SZEonXJo) before **June 13, 2026**. After claiming, test with card number `4242 4242 4242 4242`.

### B2: Print API Not Integrated

There is **zero** print-on-demand integration in the codebase. No references to Lulu, Blurb, BookBaby, Printful, or any print service exist in either the server or client code. Users cannot order physical copies of their manga. This was identified as a required feature.

> **Action required:** Integrate a print-on-demand API (Lulu Direct is recommended for manga-format books). This requires a new router, database table for print orders, and a frontend order flow.

### B3: End-to-End Pipeline Not Validated with Real Content

While all 12 HITL stages are architecturally implemented and the pipeline orchestrator connects them, the platform has **only seed data** — no real user has completed the full prompt-to-anime pipeline. The seed projects (Starlight Sparks, Sky-Color Diary, etc.) have episodes but **zero generated panels**, meaning the episode viewer shows "No panels generated yet" for every project on the Discover page.

> **Action required:** Complete at least one full pipeline run (prompt → script → panels → storyboard → anime) to validate that all stages work end-to-end with real API calls.

---

## High-Priority Issues

### H1: Pricing Discrepancy Between Code and Tests

The pricing catalog shows three public tiers (Apprentice $0, Mangaka $19/mo, Studio $49/mo), but the internal `stripe/products.ts` defines five tiers including Studio Pro ($149/mo) and Enterprise (custom). The pricing page only displays three tiers. Meanwhile, 19 test files (58 individual tests) fail because they assert old pricing values ($29/$99/$499). While these are stale tests rather than application bugs, they should be updated to prevent confusion during development.

| Tier | Display Name | Monthly | Annual | Credits/mo | Shown on Pricing Page |
|------|-------------|---------|--------|------------|----------------------|
| free_trial | Apprentice | $0 | $0 | 15 | Yes |
| creator | Mangaka | $19/mo | $15/mo | 200 | Yes |
| creator_pro | Studio | $49/mo | $39/mo | 600 | Yes |
| studio | Studio Pro | $149/mo | $119/mo | 2,000 | No |
| enterprise | Enterprise | Custom | Custom | Custom | No |

### H2: Demo Video Quality Issues

The user has already flagged that the current homepage demo video "has quite a lot of issues." The V4 recording was assembled from Puppeteer screenshots and while it shows the correct content (manga-to-anime crossfade, WebSocket dashboard, LoRA marketplace), the visual quality and timing may need refinement. This is the first thing new visitors see.

### H3: Stale Test Suite (58 Failures)

The test suite has a 98.7% pass rate (4,252 passed / 58 failed across 19 files), but the failures are all stale assertions from earlier development phases — old pricing, old tier names, old video URLs, old wizard stage counts. These are not application bugs but they make the CI pipeline unreliable and could mask real regressions.

---

## Working Systems (Verified)

### Navigation and Page Rendering

All primary navigation links work correctly. The "Vote" link navigates to `/leaderboard` which renders the "Road to Anime" community voting page with Rising/Earned Anime/Completed tabs.

| Page | URL | Status |
|------|-----|--------|
| Homepage | / | Working — hero, CTA, demo video, pipeline explainer, community showcase |
| Discover | /discover | Working — Browse All, Just Created, Rising Stars with seed data |
| Create | /create | Working — auth gate, redirects to sign-in |
| Characters | /characters | Working — auth gate, redirects to sign-in |
| Vote (Leaderboard) | /leaderboard | Working — Road to Anime voting with progress bars |
| LoRA Market | /marketplace | Working — renders correctly, empty state for no published LoRAs |
| Pricing | /pricing | Working — 3 tiers, Monthly/Annual toggle, FAQ accordion |
| Project Detail | /watch/:slug | Working — cover art, episodes, voting, about section |
| Episode Viewer | /watch/:slug/:ep | Working — empty state for seed data (expected) |
| Marketplace Detail | /marketplace/:id | Working — gallery, reviews, fork workflow |

### API Integrations

| Integration | Status | Notes |
|-------------|--------|-------|
| LLM (Forge API) | Configured and wired | Script generation, panel descriptions, character extraction |
| Image Generation (Forge) | Configured and wired | Panel generation, character sheets, upscaling |
| Kling AI | Env vars SET | Video generation, subject library, lip sync |
| Runway | Env var SET | Video generation fallback |
| FAL | Env var SET | Image model routing |
| ElevenLabs | Env var SET | Voice cloning, TTS, voice library |
| Fish Audio | Env var SET | Alternative voice provider |
| Cloudflare Stream | Fully working | Upload, delivery, captions, embed URLs all verified |
| S3 Storage | Fully working | storagePut/storageGet helpers operational |
| Stripe | Configured but unclaimed | Webhook at /api/stripe/webhook, checkout sessions, subscriptions |
| MiniMax | Env var SET | Music generation |
| TensorArt | Env var SET | Image generation |
| Runware | Env var SET | Image generation |
| Modal | Env vars SET | Compute infrastructure |

### HITL Gate Architecture

The 12-stage Human-in-the-Loop pipeline is fully implemented with three gate types (blocking, advisory, ambient), cascade rewind capability, and configurable auto-advance thresholds. Frontend pages for gate review, batch review, and admin analytics are all registered and routed.

| Stage | Gate Type | User Action Required |
|-------|-----------|---------------------|
| 1. Manga Analysis | Ambient | No — auto-advances |
| 2. Scene Planning | Advisory | Optional review |
| 3. Character Sheet Gen | **Blocking** | Must approve to continue |
| 4. Keyframe Generation | **Blocking** | Must approve to continue |
| 5. Video Generation | Advisory | Optional review |
| 6. Voice Synthesis | Advisory | Optional review |
| 7. Music Scoring | Advisory | Optional review |
| 8. SFX & Foley | Ambient | No — auto-advances |
| 9. Audio Mix | Advisory | Optional review |
| 10. Video Composite | **Blocking** | Must approve to continue |
| 11. Subtitle Render | Ambient | No — auto-advances |
| 12. Episode Publish | **Blocking** | Must approve, locked |

Gate decisions include: approve, reject, regenerate, regenerate with edits, and escalate. Timeout actions are configurable per stage (auto-approve, auto-reject, or auto-pause after 24 hours).

### Credit System

The credit gateway implements a hold-commit-release pattern: credits are held before generation starts, committed on success, and released on failure. Credit costs are defined per action (e.g., video_5s_budget = 1 credit, lora_train = 10 credits). Top-up credit packs range from Spark (100 credits, $9.90) to Supernova (15,000 credits, $749.90).

### Creation Wizard

The 8-stage wizard flow is complete: Input → Script → Panels → Storyboard → Publish → Anime Gate → Setup → Video. Both "Quick Create" and "Smart Create" paths are implemented.

### WebSocket Real-Time Updates

The generation dashboard uses WebSocket connections for live DAG node animation during rendering. Events include slice_started, slice_complete, slice_failed, progress_update, and episode_complete.

### LoRA Marketplace

Browse, detail, review, and "Fork & Fine-tune" workflows are implemented. The marketplace detail page includes an image gallery, star ratings, review submission, and a fork button that navigates to character setup with the base LoRA pre-selected.

---

## Recommended Pre-Launch Checklist

| Priority | Item | Effort | Status |
|----------|------|--------|--------|
| **BLOCKER** | Claim Stripe sandbox | 5 min | User action required |
| **BLOCKER** | Integrate Print API (Lulu Direct recommended) | 2-3 days | Not started |
| **BLOCKER** | Complete one full pipeline run with real content | 1-2 hours | Not started |
| HIGH | Fix 58 stale test assertions | 2-3 hours | Not started |
| HIGH | Improve demo video quality | 1-2 days | User flagged issues |
| MEDIUM | Add Studio Pro tier to pricing page (or remove from catalog) | 1 hour | Inconsistency |
| MEDIUM | Add generated panels to seed projects so Discover page shows real content | 2-3 hours | Empty states visible |
| LOW | Wire baseLoraId query param into character setup wizard | 1 hour | Fork flow incomplete |
| LOW | Add WebVTT captions to demo video | 30 min | Accessibility |

---

## Verdict

**The platform is NOT ready for public advertising.** The architecture is solid and the feature set is impressive, but three blockers must be resolved:

1. **Claim the Stripe sandbox** so payments work (5-minute user action).
2. **Integrate a print API** so users can order physical manga copies (2-3 day development effort).
3. **Validate the full pipeline** with at least one real prompt-to-anime run to confirm all 12 stages execute correctly with real API calls (1-2 hour test).

Once these three items are resolved and the stale tests are updated, the platform would be in a strong position for a public beta launch.
