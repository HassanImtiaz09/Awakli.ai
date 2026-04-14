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

## Priority 1: Critical for Core Features

These services are needed to replace placeholder implementations and enable real functionality.

### 1. ElevenLabs — Voice Generation & Cloning

**Used for:** Character voice acting, narrator voice, text-to-speech, voice cloning

**Where it's referenced:**
- `server/pipelineOrchestrator.ts` — Voice generation step in anime pipeline
- `server/pipelineAgents.ts` — Narrator voice clips
- `server/routers.ts` — Voice cloning endpoint
- `server/routers-preproduction.ts` — Voice auditions, voice library browsing

**Current state:** All voice endpoints return placeholder buffers (`Buffer.from("TTS: ...")`)

**API Key needed:**
- `ELEVENLABS_API_KEY` — Your ElevenLabs API key

**How to get it:**
1. Go to [elevenlabs.io](https://elevenlabs.io) and create an account
2. Navigate to **Profile** → **API Keys**
3. Click **Create API Key**
4. Copy the key

**Pricing:** Starter plan ($5/mo) includes 30,000 characters. Scale plan ($22/mo) for production use. Professional ($99/mo) for voice cloning.

---

### 2. Kling AI (or RunwayML / Pika) — Manga-to-Anime Video Generation

**Used for:** Converting static manga panels into animated anime clips

**Where it's referenced:**
- `server/pipelineOrchestrator.ts` — Panel animation step
- `server/routers-preproduction.ts` — Animation style preview with `klingModifier`
- `server/routers-phase13.ts` — Full anime pipeline

**Current state:** Returns placeholder video buffers

**API Key needed:**
- `KLING_API_KEY` — Kling AI API key (or equivalent video generation service)

**How to get it:**
1. Go to [klingai.com](https://klingai.com) and create an account
2. Navigate to API settings
3. Generate an API key

**Alternatives:**
- [RunwayML](https://runwayml.com) — Gen-3 Alpha for image-to-video (`RUNWAY_API_KEY`)
- [Pika](https://pika.art) — Image-to-video generation (`PIKA_API_KEY`)
- [Luma AI](https://lumalabs.ai) — Dream Machine for video generation (`LUMA_API_KEY`)

**Pricing:** Varies by provider. Kling: ~$0.10-0.30 per 5s clip. Runway: $0.05 per second of video.

---

### 3. Suno AI — Music & Background Score Generation

**Used for:** Opening/ending themes, background music, custom soundtracks

**Where it's referenced:**
- `server/routers-music.ts` — Theme generation, BGM generation, custom music, refinement
- `server/pipelineOrchestrator.ts` — Background music step in pipeline

**Current state:** Returns placeholder audio buffers with `sunoGenerationId` stubs

**API Key needed:**
- `SUNO_API_KEY` — Suno API key

**How to get it:**
1. Go to [suno.com](https://suno.com) and create an account
2. Navigate to API/Developer settings
3. Generate an API key

**Alternative:** [Udio](https://udio.com) for music generation

**Pricing:** Pro plan ($10/mo) for 500 songs. Premier ($30/mo) for commercial use.

---

## Priority 2: Demo Video Pipeline

These services are needed for the automated demo video production pipeline.

### 4. Cloudflare Stream — Video Hosting & Delivery

**Used for:** Hosting the demo video on the landing page, video CDN

**Where it's referenced:**
- `client/src/components/awakli/DemoShowcase.tsx` — Video player embed
- `server/demo-assets.ts` — Upload destination for processed demo video

**API Key needed:**
- `CLOUDFLARE_ACCOUNT_ID` — Your Cloudflare account ID
- `CLOUDFLARE_STREAM_TOKEN` — API token with Stream permissions

**How to get it:**
1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) and create an account
2. Navigate to **Stream** in the sidebar
3. Your Account ID is in the URL or right sidebar
4. Go to **My Profile** → **API Tokens** → **Create Token**
5. Use the "Cloudflare Stream" template or create custom with Stream:Edit permissions

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

**Current state:** Returns placeholder video buffers

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

Add these to your project via **Settings → Secrets** in the Manus Management UI:

| Variable | Service | Priority | Required For |
|----------|---------|----------|-------------|
| `ELEVENLABS_API_KEY` | ElevenLabs | P1 | Voice acting, TTS, voice cloning |
| `KLING_API_KEY` | Kling AI | P1 | Manga-to-anime video generation |
| `SUNO_API_KEY` | Suno | P1 | Music & BGM generation |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare | P2 | Demo video hosting |
| `CLOUDFLARE_STREAM_TOKEN` | Cloudflare | P2 | Demo video hosting |
| `DID_API_KEY` | D-ID (optional) | P3 | Lip sync |

---

## Integration Workflow

Once you have the API keys, provide them to me and I will:

1. **Add each key** as an environment variable via the Secrets system
2. **Replace placeholder implementations** in the pipeline orchestrator and routers with real API calls
3. **Write integration tests** to verify each service connection
4. **Update the pipeline** to use real voice generation, video generation, and music generation
5. **Configure Cloudflare Stream** for demo video hosting
6. **Run the full demo pipeline** end-to-end

The platform is architecturally ready for all these integrations — the placeholder code follows the exact same data flow that the real implementations will use, so swapping in real APIs is straightforward.
