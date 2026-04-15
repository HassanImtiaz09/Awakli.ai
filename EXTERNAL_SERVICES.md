# Awakli — External Services & API Keys Guide

This document lists every external service the Awakli platform depends on, grouped by priority. **Built-in services** (provided by the Manus platform) are already configured and require no action. **External services** require you to create accounts and provide API keys.

---

## Already Configured (Built-In — No Action Needed)

These services are provided by the Manus platform and are automatically injected as environment variables.

| Service | Purpose | Env Variable(s) | Status |
|---------|---------|-----------------|--------|
| Manus OAuth | User authentication (Google, etc.) | `VITE_APP_ID`, `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL` | Active |
| Manus LLM (OpenAI-compatible) | Story generation, script writing, AI chat | `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY` | Active |
| Manus Image Generation | Manga panel generation, character art | `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY` | Active |
| Manus S3 Storage | File uploads, generated assets | Preconfigured in `server/storage.ts` | Active |
| TiDB Database | All application data | `DATABASE_URL` | Active |
| JWT Session | Cookie-based auth sessions | `JWT_SECRET` | Active |
| Stripe (Test Sandbox) | Payments, subscriptions, tips | `STRIPE_SECRET_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | Test Mode |

---

## Integrated & Active

These external services have been fully integrated with real API calls replacing all placeholders.

### 1. ElevenLabs — Voice Generation & Cloning (ACTIVE)

**Status:** Fully integrated. Creator tier account with 110,000 characters available.

**Used for:** Character voice acting, narrator voice, text-to-speech, voice cloning, voice library browsing

**Service module:** `server/elevenlabs.ts`

**Endpoints replaced:**
- `server/pipelineOrchestrator.ts` — Real TTS with voice selection for character dialogue
- `server/pipelineAgents.ts` — Narrator uses "Roger" voice with narrator preset
- `server/routers.ts` — Voice cloning via `instantVoiceClone`, voice testing via real TTS
- `server/routers-preproduction.ts` — Voice auditions with S3 upload, voice library browsing via `browseSharedVoices`, voice cloning via `instantVoiceClone`

**Env variable:** `ELEVENLABS_API_KEY` — Set and validated

**Pricing:** Creator tier. Starter plan ($5/mo) includes 30,000 characters. Scale plan ($22/mo) for production use.

---

### 2. Kling AI — Manga-to-Anime Video Generation (ACTIVE)

**Status:** Fully integrated. JWT auth, image-to-video, text-to-video, and task polling all working.

**Used for:** Converting static manga panels into animated anime clips, style previews, sneak peeks

**Service module:** `server/kling.ts`

**Endpoints replaced:**
- `server/pipelineOrchestrator.ts` — Real Kling image-to-video with polling for panel animation
- `server/routers-freemium.ts` — Async Kling generation with S3 storage for anime previews
- `server/routers-phase13.ts` — Async Kling generation for sneak peek clips
- `server/routers-preproduction.ts` — Kling image-to-video for style previews, real image generation for character sheets and environment concept art

**Env variables:** `KLING_ACCESS_KEY`, `KLING_SECRET_KEY` — Set and validated

**Pricing:** ~$0.10-0.30 per 5s clip.

---

### 3. MiniMax Music 2.6 — Music & Background Score Generation (ACTIVE)

**Status:** Fully integrated. Lyrics generation and instrumental music generation confirmed working (130s track, 4.2MB MP3).

**Used for:** Opening/ending themes, background music, custom soundtracks, scene BGM, lyrics generation

**Service module:** `server/minimax-music.ts`

**Endpoints replaced:**
- `server/pipelineOrchestrator.ts` — `generateSceneBGM` for pipeline music_gen node
- `server/routers-music.ts` — `generateTheme`, `refineTheme`, `generateOst`, `generateCustomTrack`, `regenerateTrack` (5 endpoints)

**Env variable:** `MINIMAX_API_KEY` — Set and validated (sk-api-* format)

**Pricing:** Pay-as-you-go. Free tier available with `music-2.6-free` model.

---

### 4. Cloudflare Stream — Video Hosting & Delivery (ACTIVE)

**Status:** Fully integrated. API token verified active, Stream access confirmed.

**Used for:** Hosting demo video on landing page, CDN delivery for pipeline-produced anime videos

**Service module:** `server/cloudflare-stream.ts`

**Endpoints integrated:**
- `server/routers-phase6.ts` — Admin endpoints: `uploadDemoVideo`, `checkStreamStatus`, `listStreamVideos`, `deleteStreamVideo`
- `server/pipelineOrchestrator.ts` — Assembly agent uploads final video to Cloudflare Stream for CDN delivery
- `server/routers.ts` — Public `getDemoVideo` endpoint returns stream ID, embed URL, poster URL
- `client/src/components/awakli/DemoShowcase.tsx` — Cloudflare Stream iframe embed with poster, autoplay, bandwidth detection

**Env variables:** `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_STREAM_TOKEN` — Set and validated

**Pricing:** $5/mo for 1,000 minutes of storage + $1 per 1,000 minutes of video delivered.

---

### 5. Puppeteer — Screen Recording (Dev Dependency)

**Used for:** Automated recording of the `/demo-recording` page

**Where it's referenced:**
- `scripts/record-demo.mjs` — Puppeteer-based frame capture

**How to install:**
```bash
pnpm add -D puppeteer
```

**Pricing:** Free (open source). Runs locally.

---

## Priority 3: Production Polish

These services enhance the platform but are not blocking core functionality.

### 6. Lip Sync Service (SadTalker / Wav2Lip)

**Used for:** Syncing character mouth movements to voice audio

**Where it's referenced:**
- `server/pipelineOrchestrator.ts` — Lip sync step in pipeline

**Current state:** Returns placeholder video buffers (lip sync is the only remaining placeholder in the pipeline)

**Options:**
- Self-hosted SadTalker/Wav2Lip (requires GPU server)
- [D-ID](https://www.d-id.com) — Talking head API (`DID_API_KEY`)
- [Synthesia](https://www.synthesia.io) — Video generation with lip sync

**Pricing:** D-ID: $5.90/mo for 5 minutes. Self-hosted: GPU server costs.

---

## Priority 4: Stripe Live Mode

### 7. Stripe Live Keys

**Current state:** Test sandbox is active. Users can test with card `4242 4242 4242 4242`.

**To go live:**
1. Claim your Stripe sandbox at: https://dashboard.stripe.com/claim_sandbox/YWNjdF8xVExlVGRCQlZxcnNHVkgzLDE3NzY3MzYzMjEv100SZEonXJo (before 2026-06-13)
2. Complete Stripe KYC verification
3. Once verified, enter live keys in **Settings → Payment** in the Manus Management UI
4. A 99% discount promo code is available for live mode testing (min $0.50 USD)

---

## Environment Variables Summary

| Variable | Service | Priority | Status |
|----------|---------|----------|--------|
| `ELEVENLABS_API_KEY` | ElevenLabs | P1 | **Active** — Voice acting, TTS, voice cloning |
| `KLING_ACCESS_KEY` | Kling AI | P1 | **Active** — Manga-to-anime video generation |
| `KLING_SECRET_KEY` | Kling AI | P1 | **Active** — Manga-to-anime video generation |
| `MINIMAX_API_KEY` | MiniMax Music | P1 | **Active** — Music & BGM generation |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare | P1 | **Active** — Video hosting & CDN delivery |
| `CLOUDFLARE_STREAM_TOKEN` | Cloudflare | P1 | **Active** — Video hosting & CDN delivery |
| `DID_API_KEY` | D-ID (optional) | P3 | Optional — Lip sync |

---

## Remaining Placeholders

Only **one placeholder** remains in the entire pipeline:

1. **Lip sync** (`server/pipelineOrchestrator.ts` — `lipSyncAgent`) — Returns placeholder video. Requires D-ID API key or self-hosted SadTalker/Wav2Lip.

All other pipeline nodes (video generation, voice generation, music generation, image generation) now use real API calls.
