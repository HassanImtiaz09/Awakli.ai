# Awakli Platform Audit — Findings

## 1. Homepage (/)
- **Status:** Renders correctly
- **Hero:** "TONIGHT, YOUR IDEA BECOMES ANIME" — visible, compelling
- **Nav links:** Discover, Create, Characters, Vote, LoRA Market, Pricing, Search, Sign in, Get Started — all present
- **CTA buttons:** "Write the first scene", "Watch what the community made", Daily Prompt — all present
- **Demo video:** Play button present ("See how the magic happens HERE AT AWAKLI")
- **Content sections:** 5-step pipeline explainer, "Powered by best AI", community showcase, footer with social links
- **Footer links:** Terms, Privacy, Refund, X/Discord/YouTube
- **Issues to check:** Need to verify each nav link navigates correctly

## 2. Navigation Link Audit
Testing each nav link...

### Vote (/vote) — **404 PAGE NOT FOUND** — CRITICAL BUG
The Vote nav link in the header points to /vote which returns a 404. The page also renders with a white background (light theme) instead of the dark theme used everywhere else.


## 2. Navigation Link Audit

| Page | URL | Status | Notes |
|------|-----|--------|-------|
| Homepage | / | OK | Hero, CTA, demo video, pipeline explainer, community showcase all render |
| Discover | /discover | OK | Browse All, Just Created, Rising Stars sections render with seed data |
| Create | /create | OK | Auth gate — shows "Sign in to create" with Sign In button (expected) |
| Characters | /characters | OK | Auth gate — shows "Sign in to access your Character Library" (expected) |
| Vote | /leaderboard | OK | "Road to Anime" leaderboard with Rising/Earned Anime/Completed tabs, vote progress |
| LoRA Market | /marketplace | OK | Page renders but shows "No LoRAs found" (expected — no user-published LoRAs yet) |
| Pricing | /pricing | OK | 3 tiers (Apprentice $0, Mangaka $19, Studio $49), Monthly/Annual toggle, FAQ |
| Project Detail | /watch/:slug | OK | Cover art, episodes list, Road to Anime voting, About section |
| Episode Viewer | /watch/:slug/:ep | OK | Shows "No panels generated yet" for seed data (expected — no real panels) |

## 3. Key Issues Found

### Vote nav link → /leaderboard (WORKS)
The "Vote" nav link in the header actually navigates to `/leaderboard` (not `/vote`). The leaderboard page renders correctly with "Road to Anime" community voting, Rising/Earned Anime/Completed tabs, and vote progress bars. No issue here — my earlier manual test of `/vote` was incorrect.

### Episode viewer shows empty state for seed projects
The seed projects (Starlight Sparks, etc.) have episodes but no generated panels, so the viewer shows "No panels generated yet." This is expected behavior for demo data but may confuse new users browsing the discover page.


## 4. Pricing Page Audit

| Tier | Display Name | Monthly | Annual | Credits | Status |
|------|-------------|---------|--------|---------|--------|
| free_trial | Apprentice | $0/forever | $0 | 15 | OK |
| creator | Mangaka | $19/mo | $15/mo | 200 | OK |
| creator_pro | Studio | $49/mo | $39/mo | 600 | OK |
| studio | Studio Pro | $149/mo | $119/mo | 2000 | Not shown on pricing page (only 3 tiers displayed) |
| enterprise | Enterprise | Custom | Custom | Custom | Not shown on pricing page |

**Note:** The pricing page only shows 3 tiers (Apprentice, Mangaka, Studio). Studio Pro ($149) and Enterprise are defined in the catalog but not displayed on the pricing cards. This may be intentional (simplify the public offering) or an oversight.

**Pricing consistency:** Stripe products.ts imports from shared/pricingCatalog.ts — prices are consistent across frontend and backend.

## 5. API Integration Audit

| Integration | Status | Env Vars | Notes |
|-------------|--------|----------|-------|
| LLM (Script/Panel Gen) | **WORKING** | BUILT_IN_FORGE_API_KEY, BUILT_IN_FORGE_API_URL | Uses invokeLLM helper |
| Image Generation | **WORKING** | Via Forge API | Uses generateImage helper |
| Kling AI (Video) | **CONFIGURED** | KLING_ACCESS_KEY, KLING_SECRET_KEY | Both SET. Subject library + video gen |
| Runway (Video fallback) | **CONFIGURED** | RUNWAY_API_KEY | SET |
| FAL (Image models) | **CONFIGURED** | FAL_API_KEY | SET |
| ElevenLabs (Voice) | **CONFIGURED** | ELEVENLABS_API_KEY | Clone + TTS + voice library |
| Fish Audio (Voice) | **CONFIGURED** | FISH_AUDIO_API_KEY | SET |
| Cloudflare Stream | **WORKING** | CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_STREAM_TOKEN | Both SET. Upload, delivery, captions all wired |
| Stripe | **CONFIGURED** | STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, VITE_STRIPE_PUBLISHABLE_KEY | Webhook at /api/stripe/webhook. **SANDBOX NOT CLAIMED** |
| S3 Storage | **WORKING** | Via Forge API | storagePut/storageGet helpers |
| MiniMax | **CONFIGURED** | MINIMAX_API_KEY | SET |
| TensorArt | **CONFIGURED** | TENSORART_API_KEY | SET |
| Runware | **CONFIGURED** | RUNWARE_API_KEY | SET |
| Modal | **CONFIGURED** | MODAL_TOKEN_ID, MODAL_TOKEN_SECRET | SET |
| **Print API** | **MISSING** | None | **No print service integrated. Zero references to Lulu/Blurb/BookBaby/Printful.** |

## 6. HITL (Human-in-the-Loop) Gate Architecture

| Stage | Name | Gate Type | Auto-Advance Threshold | Status |
|-------|------|-----------|----------------------|--------|
| 1 | Manga Analysis | ambient | 70 | Implemented |
| 2 | Scene Planning | advisory | 70 | Implemented |
| 3 | Character Sheet Gen | **blocking** | 85 | Implemented — user must approve |
| 4 | Keyframe Generation | **blocking** | 85 | Implemented — user must approve |
| 5 | Video Generation | advisory | 80 | Implemented |
| 6 | Voice Synthesis | advisory | 85 | Implemented |
| 7 | Music Scoring | advisory | 75 | Implemented |
| 8 | SFX & Foley | ambient | 70 | Implemented |
| 9 | Audio Mix | advisory | 80 | Implemented |
| 10 | Video Composite | **blocking** | 85 | Implemented — user must approve |
| 11 | Subtitle Render | ambient | 70 | Implemented |
| 12 | Episode Publish | **blocking** | 90 | Implemented — user must approve, locked |

**Gate decisions available:** pending, approved, rejected, regenerate, regenerate_with_edits, auto_approved, auto_rejected, escalated, timed_out

**Cascade rewind:** Implemented — can rewind pipeline to any earlier stage

**Frontend pages:** GateReview, BatchGateReview, AdminGateAnalytics all registered in App.tsx

## 7. Creation Wizard Flow

8 stages registered in CreateWizardLayout:
1. Input → prompt entry
2. Script → AI screenplay generation
3. Panels → manga panel generation
4. Storyboard → panel arrangement/editing
5. Publish → publish manga to community
6. Anime Gate → voting threshold check
7. Setup → anime production configuration
8. Video → anime video generation

## 8. Test Suite Status

- **127 test files, 4310 tests total**
- **108 passed, 19 failed** (98.7% pass rate)
- **58 individual test failures** — mostly stale spec tests asserting old values:
  - Old pricing ($29/$99/$499 vs current $19/$49/$149)
  - Old tier names and color tokens
  - Old video URL (v3 → v4 update)
  - Old wizard stage count (7 → 8)
  - These are NOT application bugs — the tests need updating to match current state

## 9. Stripe Sandbox Status

**CRITICAL ACTION REQUIRED:** The Stripe sandbox has been provisioned but NOT claimed.
Claim URL: https://dashboard.stripe.com/claim_sandbox/YWNjdF8xVExlVGRCQlZxcnNHVkgzLDE3NzY3MzYzMjEv100SZEonXJo
Expiry: 2026-06-13T01:52:01.000Z

Without claiming the sandbox, payment processing will not work in test mode.

## 10. Print API — MISSING

**No manga printing integration exists.** The platform has no way for users to order physical copies of their manga. This was mentioned as a requirement. Options:
- Lulu Direct API (print-on-demand, manga-friendly)
- Blurb API
- BookBaby
- Printful (custom merchandise + books)

