AWAKLI
Prompt 25
Multi-Surface Image Generation Router
Runware (primary) + Tensor.Art (training/discovery) + fal.ai (video + select image) with vault-backed secrets, budget governance, and health-check failover
Version 1.0  |  April 2026

Contents
1. Why this prompt exists — the single-provider risk
2. Target architecture — 3-surface routed stack
3. Provider role matrix — who owns which workload
4. Secrets vault schema — keys, scopes, rotation policy
5. Job schema & cost attribution — every generation is a tagged row
6. Router logic — routing rules + code skeleton
7. Budget governance — per-provider caps, alerts, kill-switch
8. Health checks & failover — detection, fallback chain, recovery
9. Compatibility with Prompts 16-24 — what this touches, what it doesn't
10. Evaluation gates — M1-M12 acceptance criteria
11. Rollout plan — 4-phase staged migration
12. Atomic Manus action items — 18 concrete tasks
13. Risk register & mitigations
14. Unit economics — cost model and payback

1. Why this prompt exists
1.1 The current state
Awakli's image-generation pipeline today routes 100% of traffic through fal.ai. fal.ai is excellent for what it is — serverless, low-ops, great for hosted models — but using it as the single provider for all image workloads creates three compounding problems.
Cost per image at production volume
fal.ai's image pricing is competitive for low-volume usage but becomes a material line item at manga-chapter scale. Runware sits roughly 20-50x cheaper per image for comparable models; Tensor.Art is also materially cheaper via its credit-based billing. At Awakli's projected volume of approximately 400-800 finished panels per chapter, the cost delta between fal.ai-only and a routed stack compounds into the primary cost-of-goods for the image layer.
Single point of failure
If fal.ai has an outage — they have had multi-hour incidents in the past year — Awakli's entire image pipeline stops. For a customer-facing manga platform, that is a production-down event. No fallback path exists today.
LoRA provenance friction
The Kaelis character LoRA stack (appearance LoRA from Prompt 20-22, motion LoRA from Prompt 24) is SDXL-native. fal.ai can host custom LoRAs via their deploy flow but that path is heavier than Runware's native custom-LoRA URL parameter or Tensor.Art's built-in LoRA library. Keeping the LoRA integration on a provider that treats it as a first-class primitive reduces deploy friction and tightens the iteration loop for art direction.
1.2 Why now
Three prior decisions make this the right moment. First, GPU API keys (RunPod + Modal) from the previous conversation enable a self-host path as the eventual Tier-4 option. Second, Prompt 24's motion-LoRA work formalizes the character-LoRA stack as a first-class Awakli primitive — it needs a home that treats it as such. Third, the manga-to-video pipeline cost analysis already identified image generation as the largest fixed cost per chapter. Moving the image layer first compounds savings into every downstream step.

2. Target architecture
2.1 Three-surface stack
The target architecture is explicit and simple. There are three external surfaces, each owning a workload type. A single router component inside Awakli's backend decides which surface handles which job. No provider selection happens anywhere else in the codebase.
                  ┌─────────────────────────────────┐
                  │   Awakli Backend (Node/Python)  │
                  │                                 │
  Generation ──▶  │   ┌──────────────────────────┐  │
  job               │   │  image_router.ts       │  │
                  │   │  (routes by workload)  │  │
                  │   └──────┬──────┬──────┬───┘  │
                  └──────────┼──────┼──────┼──────┘
                             │      │      │
                 ┌───────────┘      │      └──────────────┐
                 ▼                  ▼                     ▼
            ┌─────────┐        ┌──────────┐         ┌──────────┐
            │Runware  │        │Tensor.Art│         │ fal.ai   │
            │(primary)│        │(training │         │ (video + │
            │         │        │ +discov) │         │ select   │
            │SDXL+LoRA│        │LoRA train│         │ image)   │
            └─────────┘        └──────────┘         └──────────┘
               PANELS            KAELIS_V2+           Wan 2.6
              (default)          discovery            HunyuanVideo
2.2 Hard rules the router must obey
These are not heuristics. They are fixed routing rules that ship in the initial implementation. Clever provider-picking comes later, only after baseline routing is stable and cost-attributed.
2.3 The router is the only provider-aware component
Every other piece of Awakli's backend talks to the router via a provider-agnostic job interface. Workers receive a normalized generation job with a workload-type tag; they do not know which provider fulfilled it. This is the single most important architectural constraint — it means Awakli can swap providers (or add a fourth) without touching worker code, retry code, queue code, or storage code.

3. Provider role matrix
3.1 Runware — primary image backend
Endpoint: https://api.runware.ai/v1 (REST + WebSocket supported)
Pricing anchor: From $0.0006 per image on the cheapest inference tier. Videos from $0.14/clip. Pricing is pay-per-job with no monthly minimum.
Model catalog: 400,000+ pre-loaded models including Illustrious XL, Animagine XL, FLUX-base, FLUX anime LoRAs, SDXL base, Pony Diffusion, and all common community anime checkpoints.
Custom LoRA: Native. Upload .safetensors to their model store, reference by ID in the generation request. Kaelis LoRA stack (appearance + motion) drops in directly.
ControlNet: Full suite — OpenPose, Canny, Depth, HED, Normal, Scribble, Lineart, Tile — all callable via the generation task API.
SDK: Official JS, Python, and Go clients. Runware's 'Sonic Inference Engine' exposes a unified API across all 400k+ models so switching checkpoints is a parameter change.
Why primary: Cheapest per image at Awakli's projected volume, widest model catalog, ControlNet-complete, accepts Kaelis LoRAs natively. The only material concern is that Runware is a newer platform than Replicate/fal.ai so the uptime track record is shorter — which is exactly why the router has a Tensor.Art fallback.
3.2 Tensor.Art — training, discovery, fallback
Endpoint: https://tensor.art/api (REST, credit-based)
Pricing anchor: Paid tiers from $5/mo (Basic) to $92/mo (Pro). PAYG credit packs available. 1 credit ≈ 1 standard image.
Model catalog: 10,000+ models including the newest FLUX anime checkpoints, Illustrious XL, Animagine XL 4.0, and Wan video models.
Custom LoRA: Native, plus browser-based LoRA training on user datasets. This is the differentiator — Awakli's art-direction team can iterate on new character LoRAs without leaving the platform.
ControlNet: OpenPose, Canny, Depth, supported via API.
Why secondary: Two roles. (a) LoRA training and character-discovery iteration for the art team — browser-based LoRA trainer is materially faster than spinning up Modal/RunPod jobs for each experiment. (b) Automatic failover target when Runware is degraded — the overlap in model availability means most workloads can be served from either.
3.3 fal.ai — video + select image (already integrated)
Endpoint: https://fal.run/ (REST), already wired into Awakli via existing API key
Pricing anchor: $0.10/sec (720p) to $0.15/sec (1080p) for Wan 2.6; Flash variants from $0.05/sec. Image models priced per-request.
Model catalog: Wan 2.6 (T2V, R2V, I2V), HunyuanVideo, FLUX, Stable Diffusion 3.5, plus fal-exclusive fine-tunes.
Custom LoRA: Supported via fal's deploy flow; heavier than Runware's inline LoRA referencing.
Why tertiary (but not removed): Owns video generation for Awakli. Don't duplicate what Runware covers better, but keep fal.ai for (a) all Wan 2.6 / HunyuanVideo video calls, (b) image models that are fal-exclusive or run materially better on fal's infrastructure, (c) the motion-LoRA inference path from Prompt 24 which is already wired to fal-ai/wan-pro.
3.4 Explicitly excluded (do not add)
This exclusion list is load-bearing. The temptation to add a fifth or sixth provider because 'it might be useful someday' is how multi-surface stacks become unmanageable. Only add a provider when a documented workload cannot be served by one of the three primary surfaces.

4. Secrets vault schema
4.1 Vault choice
Use one secrets vault for everything. Acceptable options, in order of preference for Awakli's current scale: Doppler (cheapest, easiest), AWS Secrets Manager (if Awakli is already on AWS), 1Password Vault (if the team prefers a UI-first workflow). Do not mix vaults. Do not store any of these keys in .env files checked into git, in Manus's own repo, or in Vercel/Cloudflare environment variables without a pointer back to the vault.
4.2 Required secrets (initial rollout)
4.3 Secrets access policy
The router is the only service with read access to provider API keys. All other services — worker pools, queue consumers, CDN uploaders, billing pipeline — read their own non-provider secrets (database URLs, webhook signing keys, etc.) but never the generation provider keys. This narrows the blast radius of a service-level compromise.
4.4 Key rotation playbook
# Rotation steps (run on a 90-day cadence per provider)
 
1. Generate new key in provider dashboard
   - Runware: app.runware.ai/settings/api-keys
   - Tensor.Art: tensor.art/settings/api
   - fal.ai: fal.ai/dashboard/keys
   - Modal: modal.com/settings/tokens
   - RunPod: runpod.io/console/user/settings
 
2. Store new key in vault under a versioned alias
   - e.g., RUNWARE_API_KEY_PROD_v2
 
3. Update router's vault-reference to point at _v2
 
4. Deploy router (rolling, with canary)
 
5. Monitor error rates for 15 min
 
6. Revoke old key in provider dashboard
 
7. Delete _v1 alias from vault
4.5 Kill-switch script
Checked into a separate ops-tools repository that Awakli controls, not in the main Awakli repo and not accessible to Manus. The script does four things in order: revokes all listed provider keys via their dashboard APIs where available, rotates vault aliases to null, forces the router to enter a hard-fail state that returns an explicit 'service temporarily unavailable' response, and pages the on-call channel.

5. Job schema & cost attribution
5.1 Normalized generation job
Every generation request flowing through Awakli's backend is serialized into a single job shape. The router consumes this shape; workers emit this shape; telemetry stores this shape. No provider-specific fields leak past the router boundary.
// File: src/types/generationJob.ts
 
export interface GenerationJob {
  // Identity
  jobId: string;              // uuid v4
  chapterId: string;          // foreign key to chapter
  panelId: string | null;     // null for non-panel jobs (covers, training)
  requestedBy: string;        // user id or "system"
 
  // Workload classification (drives router)
  workload: WorkloadType;     // see enum below
  characterRefs: string[];    // LoRA IDs, in load order (Kaelis, etc.)
  aspectRatio: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
  qualityTier: "preview" | "standard" | "hero";
 
  // Prompt + controls
  prompt: string;
  negativePrompt: string;
  seed: number | null;
  steps: number;
  cfgScale: number;
  controlNets: ControlNetSpec[];    // empty array if none
 
  // Output requirements
  resolution: { width: number; height: number };
  outputCount: number;              // default 1
 
  // Routing hints (optional, set by router)
  provider?: "runware" | "tensorart" | "fal";
  providerEndpoint?: string;
  providerRequestId?: string;
 
  // Cost attribution (populated after completion)
  actualCostUsd?: number;
  actualLatencyMs?: number;
  providerInvoiceId?: string;
 
  // Status
  status: "queued" | "routing" | "in_flight" | "complete" | "failed";
  createdAt: string;                // ISO8601
  completedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}
 
export enum WorkloadType {
  MANGA_PANEL_CHARACTER,
  MANGA_PANEL_BACKGROUND,
  COVER_HERO,
  LORA_TRAINING,
  CHARACTER_DISCOVERY,
  VIDEO_CLIP_CHARACTER,
  VIDEO_CLIP_BACKGROUND,
  CONTROLNET_PANEL,
  AESTHETIC_REFERENCE
}
5.2 Cost attribution table
Every completed job writes a row to generation_costs. This is the single source of truth for 'how much did this chapter cost to generate.' Without it, providers can raise prices or change model pricing and you won't notice until the credit card bill arrives.
-- schema: generation_costs
CREATE TABLE generation_costs (
  job_id            UUID PRIMARY KEY,
  chapter_id        UUID NOT NULL REFERENCES chapters(id),
  workload          VARCHAR(40) NOT NULL,
  provider          VARCHAR(20) NOT NULL,
  model_id          VARCHAR(120),
  actual_cost_usd   NUMERIC(10, 6) NOT NULL,
  estimated_cost_usd NUMERIC(10, 6),  -- pre-generation estimate for variance tracking
  latency_ms        INTEGER,
  character_refs    TEXT[],
  succeeded         BOOLEAN NOT NULL,
  completed_at      TIMESTAMPTZ NOT NULL,
  provider_invoice_id VARCHAR(120)
);
 
CREATE INDEX idx_gc_chapter ON generation_costs(chapter_id);
CREATE INDEX idx_gc_provider ON generation_costs(provider, completed_at);
CREATE INDEX idx_gc_workload ON generation_costs(workload, completed_at);
5.3 Derived dashboards
Three dashboards must exist before launch. Each is driven off generation_costs with simple aggregations. No ML, no anomaly detection in v1 — just rollups.

6. Router logic
6.1 Decision flow
The router has four phases: (1) map workload type to primary + fallback provider list, (2) check provider health, (3) check budget cap is not breached, (4) dispatch. If all primary and fallback providers are unhealthy or capped, the router returns a hard failure rather than silently degrading.
// File: src/router/imageRouter.ts (skeleton)
 
import { GenerationJob, WorkloadType } from "../types/generationJob";
import { getSecret } from "../secrets/vault";
import { isProviderHealthy } from "./health";
import { getRemainingBudget } from "./budget";
import { RunwareAdapter } from "./adapters/runware";
import { TensorArtAdapter } from "./adapters/tensorart";
import { FalAdapter } from "./adapters/fal";
 
type Provider = "runware" | "tensorart" | "fal";
 
const ROUTING_TABLE: Record<WorkloadType, Provider[]> = {
  [WorkloadType.MANGA_PANEL_CHARACTER]:   ["runware", "tensorart"],
  [WorkloadType.MANGA_PANEL_BACKGROUND]:  ["runware", "tensorart"],
  [WorkloadType.COVER_HERO]:              ["runware", "tensorart"],
  [WorkloadType.CONTROLNET_PANEL]:        ["runware", "tensorart"],
  [WorkloadType.CHARACTER_DISCOVERY]:     ["tensorart", "runware"],
  [WorkloadType.AESTHETIC_REFERENCE]:     ["tensorart"],
  [WorkloadType.VIDEO_CLIP_CHARACTER]:    ["fal"],
  [WorkloadType.VIDEO_CLIP_BACKGROUND]:   ["fal"],
  [WorkloadType.LORA_TRAINING]:           ["modal", "runpod"] as any // handled by training orchestrator
};
 
export async function route(job: GenerationJob): Promise<Provider> {
  const candidates = ROUTING_TABLE[job.workload];
  if (!candidates) throw new Error(`No routing rule for ${job.workload}`);
 
  for (const provider of candidates) {
    const healthy = await isProviderHealthy(provider);
    if (!healthy) continue;
 
    const remaining = await getRemainingBudget(provider);
    const estimate = estimateCost(job, provider);
    if (remaining < estimate) continue;
 
    return provider;
  }
 
  throw new RouterError(
    "ALL_PROVIDERS_UNAVAILABLE",
    `No healthy, in-budget provider for workload ${job.workload}`
  );
}
 
function estimateCost(job: GenerationJob, provider: Provider): number {
  // Lookup table: provider x model x resolution -> USD per output
  // Populated from provider pricing pages; updated on rotation cadence
  return PROVIDER_COST_TABLE[provider][job.qualityTier] * job.outputCount;
}
6.2 Adapter interface
Each provider has an adapter implementing a narrow interface. The router never sees provider-specific request shapes — adapters translate the normalized GenerationJob into the provider's native payload, dispatch, and translate the response back.
// File: src/router/adapters/base.ts
 
export interface ProviderAdapter {
  readonly id: "runware" | "tensorart" | "fal";
 
  submit(job: GenerationJob): Promise<AdapterResult>;
  healthCheck(): Promise<HealthStatus>;
  estimateCost(job: GenerationJob): number; // USD
  getInvoiceId(providerResponse: unknown): string | null;
}
 
export interface AdapterResult {
  providerRequestId: string;
  imageUrls: string[];
  actualCostUsd: number;
  latencyMs: number;
  rawResponse: unknown; // preserved for debug
}
 
export interface HealthStatus {
  healthy: boolean;
  checkedAt: string;
  errorRate5min?: number;
  p95LatencyMs?: number;
  reason?: string;
}
6.3 Idempotency
If the router dispatches to Runware, Runware accepts the job, but the adapter loses the response due to a network hiccup, retrying the job should not result in a duplicate generation (and a duplicate charge). Solve this with a provider-side idempotency key derived from the jobId: each adapter sends Awakli's jobId as an idempotency header on the initial submit and again on any retry. All three providers respect idempotency keys per their API docs — use them.

7. Budget governance
7.1 Per-provider spend caps
Before the first production call, set explicit spend caps at the provider dashboard level. Do not rely on Awakli's internal budget tracker as the only line of defense — a bug in the tracker should not become a bug in the bill.
7.2 Internal tracker
In addition to the provider-side caps, Awakli's router maintains its own rolling spend counter per provider, updated on every completed job. The counter is checked before every dispatch (step 3 in the router decision flow). This gives Awakli a second line of defense and enables pre-emptive alerting before a cap is hit.
// File: src/router/budget.ts
 
import { redis } from "../infra/redis";
 
const MONTHLY_CAPS_USD: Record<string, number> = {
  runware:   parseFloat(process.env.BUDGET_RUNWARE_MONTHLY!),
  tensorart: parseFloat(process.env.BUDGET_TENSORART_MONTHLY!),
  fal:       parseFloat(process.env.BUDGET_FAL_MONTHLY!)
};
 
export async function getRemainingBudget(provider: string): Promise<number> {
  const spentKey = `budget:${provider}:${monthKey()}`;
  const spent = parseFloat(await redis.get(spentKey) || "0");
  return MONTHLY_CAPS_USD[provider] - spent;
}
 
export async function recordSpend(provider: string, amountUsd: number) {
  const spentKey = `budget:${provider}:${monthKey()}`;
  const total = await redis.incrbyfloat(spentKey, amountUsd);
 
  // Alert thresholds (fire once per threshold per month)
  if (total / MONTHLY_CAPS_USD[provider] >= 0.8) alert("80pct", provider, total);
  if (total / MONTHLY_CAPS_USD[provider] >= 0.95) alert("95pct", provider, total);
}
 
function monthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
7.3 Alerts

8. Health checks & failover
8.1 What 'unhealthy' means
A provider is considered unhealthy when any of the following are true: error rate over the last 5 minutes exceeds 10%, p95 latency exceeds 3x the baseline, the provider's public status page reports an incident, or Awakli's last 3 consecutive jobs to that provider failed.
8.2 Health probe
Every 60 seconds, a background worker sends a canary generation request to each provider — a tiny, deterministic job (fixed seed, small resolution, known prompt) that costs less than $0.01. Latency and success are recorded to a time-series store.
// File: src/router/health.ts
 
import { providerAdapters } from "./adapters";
import { metrics } from "../infra/metrics";
 
const CANARY_PROMPT = "test pattern, solid color swatch, 128x128";
const HEALTH_WINDOW_MS = 5 * 60 * 1000;
 
export async function runHealthProbe() {
  for (const adapter of providerAdapters) {
    const start = Date.now();
    let ok = false;
    try {
      await adapter.submit({
        /* minimal canary job */
        prompt: CANARY_PROMPT, seed: 42, steps: 4,
        resolution: { width: 128, height: 128 }, outputCount: 1,
        /* ... */
      } as any);
      ok = true;
    } catch (e) {
      metrics.increment("router.health.error", { provider: adapter.id });
    }
    metrics.timing("router.health.latency", Date.now() - start, { provider: adapter.id });
    metrics.increment(ok ? "router.health.ok" : "router.health.fail", { provider: adapter.id });
  }
}
 
export async function isProviderHealthy(provider: string): Promise<boolean> {
  const errorRate = await metrics.rate("router.health.error", provider, HEALTH_WINDOW_MS);
  const p95 = await metrics.p95("router.health.latency", provider, HEALTH_WINDOW_MS);
  const baseline = BASELINE_LATENCY_MS[provider];
  if (errorRate > 0.10) return false;
  if (p95 > baseline * 3) return false;
  return true;
}
8.3 Failover behavior
When the primary provider for a workload is unhealthy, the router silently dispatches to the fallback. The job metadata records which provider actually served it. If both primary and fallback are unhealthy, the router returns the ALL_PROVIDERS_UNAVAILABLE error — the caller must decide whether to queue for retry or surface a user-facing error.
8.4 Recovery
When a provider's health returns to healthy (error rate < 5%, p95 < 1.5x baseline, sustained for 5 minutes), the router resumes routing new jobs to it as primary. In-flight jobs already on the fallback are not migrated — they complete where they started. This prevents thrashing during partial recoveries.

9. Compatibility with Prompts 16-24
This prompt modifies Awakli's provider-routing layer. It does not modify any pipeline stage, worker, queue, storage, or character-consistency logic. Below is the full list of prior prompts and how each interacts with this change.

10. Evaluation gates
These are the M1-M12 acceptance criteria. All 12 must pass before Prompt 25 is considered shipped. Each gate has an explicit owner, test procedure, and pass/fail threshold.

11. Rollout plan
Phase 1 — Infrastructure (week 1)
Provision vault, generate scoped API keys for all three providers, wire vault into Awakli's backend via the existing secrets accessor, write health probe infrastructure, set provider-side spend caps at the conservative initial levels in Section 7.1. No routing logic yet — just the substrate.
Phase 2 — Router in shadow mode (week 2)
Deploy the router with adapters for all three providers, but in shadow mode: every production job still flows through the existing fal.ai path, AND a parallel copy is dispatched through the router. The router's outputs are recorded but not returned to users. Compare router output against the production output on 1000 production jobs. Validate M3, M4, M5, M11 gates on shadow traffic.
Phase 3 — Canary 5% (week 3)
Cut over 5% of production traffic to the router. Watch error rates, latency, cost attribution, and user-visible quality metrics. Hold for 72 hours. If error rate exceeds 0.5% or p95 latency regresses more than 20%, roll back to 0% and investigate.
Phase 4 — Ramped cutover (week 4)
25% → 50% → 100% over 5 business days with 24-hour hold at each step. Validate M1, M2, M6, M10 gates under real traffic. Mark rollout complete when 100% traffic has been on the router for 72 hours with all 12 gates passing.

12. Atomic Manus action items
These are the atomic tasks Manus should execute, in order. Each is scoped small enough to ship in a single PR. Do not batch them — sequencing matters for rollout safety.

13. Risk register

14. Unit economics
14.1 Baseline (fal.ai-only)
Current per-chapter image cost on fal.ai, assuming 500 panels at standard resolution with moderate ControlNet usage:
500 panels × $0.015/image (fal.ai blended rate) = $7.50 per chapter
+ ControlNet overhead (est. 20% of panels) ~ $0.50
TOTAL (baseline):                              ~$8.00 per chapter
ANNUAL (52 chapters):                          ~$416 per title
14.2 Target (routed stack)
Same 500-panel chapter, routed through Runware primary with ~5% fallback to Tensor.Art:
475 panels × $0.0008/image (Runware blended) = $0.38
 25 panels × $0.005/image (Tensor.Art fallback) = $0.125
+ ControlNet overhead (~20% of panels, Runware) ~ $0.10
+ Router infra (health probes, budget tracker)  ~ $0.05
TOTAL (routed):                                 ~$0.65 per chapter
ANNUAL (52 chapters):                           ~$33.80 per title
14.3 Savings
Savings projection uses Runware's public per-image pricing floor ($0.0006). Actual blended cost will be somewhat higher once you factor in larger resolutions, higher step counts on hero panels, and ControlNet surcharges — $0.0008 is a realistic blended midpoint. Even at a doubled estimate ($0.0016 blended) the cost per chapter is still ~$0.90, still an 88% reduction vs. baseline.
14.4 Engineering cost
Rough effort estimate for the 18 atomic tasks in Section 12: approximately 80-120 engineering hours. At Awakli's blended rate of ~$150/hr that is $12,000-$18,000 of engineering investment. Payback is reached at approximately 30-45 completed chapters across the catalog — for a platform producing regular chapter output, that is 2-6 months of runtime.

Footer — what Manus should do next
This document is complete and implementation-ready. No clarifying questions should need to go back to the product owner before starting T1-T3. If ambiguity is encountered during implementation, default to the more conservative option (smaller budget cap, longer rollout hold time, more gates enforced strictly) and file a clarification ticket rather than expanding scope.
Status updates expected weekly during Phases 1-3, then daily during Phase 4 rollout. Post-rollout report required within 7 days of Phase 4 completion, documenting actual vs. projected cost reduction and any gate failures with their resolutions.


--- TABLES ---


### Table 1
| TL;DR for Manus Stop sending all image-generation traffic to a single provider. Build a router that sends Awakli's manga panel generation to Runware by default (~$0.0006/image, 400k+ models, accepts Kaelis LoRAs), uses Tensor.Art for LoRA training and model discovery, and keeps fal.ai as the owner of video generation plus any fal-only image models. Three non-negotiable engineering prerequisites: (1) a vault-backed secrets layer so no API keys live in code, (2) per-provider budget caps and cost attribution so spend is knowable and cap-able per job, (3) a health-check loop so provider outages fail over without manual intervention. Expected impact: ~60-80% reduction in image-generation cost per chapter versus the current fal.ai-only image path, with better character-consistency control (Kaelis LoRAs run natively on Runware and Tensor.Art) and higher resilience (no single point of failure). |


### Table 2
| What this prompt is NOT This is not a recommendation to leave fal.ai. fal.ai stays as the owner of video generation (Wan 2.6, HunyuanVideo) and any image models it hosts uniquely. The existing fal.ai API key and integration stays in place and active. This is not a request for Manus to pick the 'best' provider per request. The routing rules are explicit and config-driven; the goal is predictability, not cleverness. This is not a rewrite of the generation-job pipeline. The existing job queue, retry logic, and worker model stay intact. The change is a provider-routing layer that sits in front of them. |


### Table 3
| Workload type | Primary provider | Fallback provider | Never route to |
| Manga panel (signature character) | Runware | Tensor.Art | NovelAI (no LoRA), PixAI, Leonardo |
| Manga panel (background / no character) | Runware | Tensor.Art | — |
| Cover page / hero illustration | Runware | Tensor.Art | — |
| LoRA training job | Modal (GPU) | RunPod (GPU) | Any pay-per-image provider |
| Character discovery / style prototyping | Tensor.Art | Runware | — |
| Video clip (signature character) | fal.ai (Wan 2.6) | Self-host via Modal | Runway Gen-3 (cost) |
| Video clip (no character) | fal.ai (Wan 2.6 / HunyuanVideo) | Self-host via Modal | — |
| ControlNet-heavy panel composition | Runware (full CN suite) | Tensor.Art | NovelAI (limited CN) |
| One-off aesthetic reference (art team) | Tensor.Art | PixAI | — |


### Table 4
| Enforcement Grep the repo on every CI run for hard-coded provider URLs or API-key references outside the router module and secrets-vault accessor. Fail the build on any match. Code review checklist includes 'does this touch provider logic outside the router?' — answer must be no unless the PR is explicitly modifying the router itself. |


### Table 5
| Provider | Why excluded |
| NovelAI | No external LoRA support — cannot carry Kaelis stack; aesthetic-only value |
| PixAI | Overlaps with Runware/Tensor.Art functionality; no unique capability that justifies a fourth surface |
| Niji Journey / Midjourney | No official public API; Discord automation violates ToS |
| Leonardo.AI | 'Elements' LoRA alternative is proprietary; would force parallel character consistency pipeline |
| Replicate | ~20-50x more expensive per image than Runware for comparable models |


### Table 6
| Secret name | Scope | Used by | Rotation cadence |
| RUNWARE_API_KEY_PROD | Production image gen | Router (prod) | 90 days |
| RUNWARE_API_KEY_STAGING | Staging + CI | Router (staging) | 90 days |
| TENSORART_API_KEY_PROD | Production LoRA train + fallback image | Router (prod) | 90 days |
| TENSORART_API_KEY_STAGING | Staging + CI | Router (staging) | 90 days |
| FAL_KEY_PROD | Production video + select image | Router (prod) | 90 days |
| FAL_KEY_STAGING | Staging + CI | Router (staging) | 90 days |
| MODAL_TOKEN_ID / SECRET | LoRA training jobs | Training orchestrator | 90 days |
| RUNPOD_API_KEY_TRAIN | Warm pod deployments | Training orchestrator | 90 days |


### Table 7
| Dashboard | Aggregation | Refresh |
| Per-chapter cost | SUM(actual_cost_usd) GROUP BY chapter_id | On chapter completion |
| Per-provider burn | SUM(actual_cost_usd) GROUP BY provider, DATE(completed_at) | Every 5 min |
| Workload cost mix | SUM(actual_cost_usd) GROUP BY workload, week | Daily at 00:00 UTC |


### Table 8
| Provider | Cap surface | Initial cap (month 1) | Cap increment trigger |
| Runware | Dashboard → Billing → Spend Limits | $500 | Sustained 80% utilization 2 weeks |
| Tensor.Art | Dashboard → Subscription → Hard Limit | $100 | Sustained 80% utilization 2 weeks |
| fal.ai | Dashboard → Billing → Usage Cap | Existing cap (video-dominant) | Video volume growth |
| Modal | Dashboard → Workspace → Spend Limit | $200 | New LoRA training campaign |
| RunPod | Dashboard → Account → Usage Cap | $150 | New warm pod deployment |


### Table 9
| Trigger | Notification channel | Action required |
| 50% of monthly cap reached | Slack #awakli-ops (informational) | Review expected burn trajectory |
| 80% of monthly cap reached | Slack #awakli-ops + email to Hassan | Decide: raise cap or throttle |
| 95% of monthly cap reached | Slack + email + PagerDuty (sev-2) | Immediate: raise cap or pause workload |
| 100% of cap (router blocks dispatch) | PagerDuty (sev-1) + auto-page on-call | Emergency: raise cap or accept degraded service |
| Per-job cost exceeds $0.50 | Slack immediate | Investigate runaway-cost job |


### Table 10
| Do not auto-retry during an outage When a provider is flapping (health checks are intermittent), it is tempting to have the router automatically retry failed jobs. Do not do this without a backoff. A flapping provider that keeps accepting-then-failing jobs will burn budget on failed generations. The router should fail fast to the fallback rather than retry the unhealthy primary. Job-level retries happen at the queue layer with exponential backoff, not at the router layer. This is a hard separation. |


### Table 11
| Prompt | Interaction with Prompt 25 | Action required |
| P16 — Aspect & resolution policy | Passes through unchanged; router respects GenerationJob.resolution | None |
| P17 — Negative-prompt library | Passes through unchanged; router respects GenerationJob.negativePrompt | None |
| P18 — Seed governance | Passes through unchanged | None |
| P19 — EBU R128 audio bus | Audio-unrelated | None |
| P20 — Kaelis appearance LoRA v1 | Kaelis_v1 must be uploaded to Runware model store | 1-time upload |
| P21 — Character-consistency eval harness | Eval harness calls through router like any other job | None |
| P22 — Provider-unification per scene | This prompt implements it at the routing layer | Supersedes P22 rule |
| P23 — Aspect-routing fix | Still owned by prompt builder; router consumes resolution | None |
| P24 — Motion-LoRA conditioning (v1.1) | Motion LoRA lives on fal.ai/wan-pro for video; image motion-LoRA preview lives on Runware | Upload kaelis_motion_v1 to Runware |


### Table 12
| Prompt 22 is superseded Prompt 22's 'provider-unification per scene' rule — pick one provider per scene and stay on it — is now implemented at the routing layer. The router guarantees provider-unification by default because each scene's jobs share the same workload type. The P22 manual rule is retired. The enforcement behavior it was protecting (no mid-scene provider switches that cause identity drift) is preserved by the routing rules in Section 2. |


### Table 13
| Gate | Description | Pass criterion |
| M1 | Router dispatches manga-panel jobs to Runware by default | 100% of MANGA_PANEL_* jobs route to Runware when healthy |
| M2 | Fallback to Tensor.Art fires on Runware outage | Simulated Runware outage: 100% of in-flight manga jobs complete via Tensor.Art within 60s |
| M3 | Kaelis LoRA renders identically on Runware vs. fal.ai baseline | CLIP similarity ≥ 0.92 vs. existing fal.ai Kaelis output on 50-prompt eval set |
| M4 | ControlNet-heavy panels render correctly on Runware | Pose-match accuracy ≥ 90% on 20-panel ControlNet eval set |
| M5 | Cost attribution row written for every completed job | 100% of jobs in 24h production sample have a generation_costs row |
| M6 | Budget tracker matches provider invoice within 5% | Month-1 invoice from each provider matches internal tracker total ±5% |
| M7 | Secrets never appear in logs or error messages | Grep against 7-day log archive returns 0 matches for any partial key prefix |
| M8 | Kill-switch executes in <30s end-to-end | Dry-run: all 3 provider keys rotated and router returns 503 within 30s |
| M9 | Rolling key rotation causes zero dropped jobs | Staging rotation test: 1000 in-flight jobs during rotation, 0 dropped or duplicated |
| M10 | Per-chapter cost reduction ≥ 60% vs. fal.ai baseline | Measured on 5 production chapters vs. pre-routing baseline |
| M11 | Router latency overhead < 50ms p95 | Measured router-internal time from receive to dispatch |
| M12 | All 3 provider adapters pass a 10k-job soak test | 24h soak at 10k jobs/provider: error rate < 0.5%, p95 latency within SLO |


### Table 14
| Rollback trigger conditions Error rate exceeds 1.0% for any 15-minute window at any phase p95 latency regresses more than 50% vs. fal.ai-only baseline Cost attribution drift exceeds 10% (internal tracker vs. provider invoice) Any single job exceeds $1.00 actual cost (runaway-cost detection) Kaelis identity-hold CLIP similarity drops below 0.90 on the eval set |


### Table 15
| ID | Task |
| T1 | Provision secrets vault (Doppler workspace 'awakli-prod'); seed with placeholder values for all 8 secret names in Section 4.2 |
| T2 | Generate scoped production API keys for Runware, Tensor.Art, Modal, RunPod; store in vault; rotate out any existing keys that are committed anywhere |
| T3 | Implement `src/secrets/vault.ts` that reads from Doppler at runtime; add grep-CI rule that fails build on any literal provider key pattern |
| T4 | Define `GenerationJob` type in `src/types/generationJob.ts` per Section 5.1; migrate one existing call site as reference |
| T5 | Create `generation_costs` table with schema from Section 5.2; add migration to staging and production |
| T6 | Implement `ProviderAdapter` interface (`src/router/adapters/base.ts`) per Section 6.2 |
| T7 | Implement `RunwareAdapter` with full ControlNet + custom LoRA support; unit test against Runware staging key |
| T8 | Implement `TensorArtAdapter`; unit test against Tensor.Art staging key |
| T9 | Refactor existing fal.ai integration into `FalAdapter` conforming to the same interface |
| T10 | Implement router core (`src/router/imageRouter.ts`) per Section 6.1 skeleton, including ROUTING_TABLE constant |
| T11 | Implement `src/router/budget.ts` (Section 7.2); wire `recordSpend` into adapter success paths |
| T12 | Implement `src/router/health.ts` (Section 8.2); deploy health-probe worker on 60s interval |
| T13 | Upload Kaelis_v1 appearance LoRA to Runware model store; record model ID; add to character-registry config |
| T14 | Upload kaelis_motion_v1 to Runware model store (for preview/image path; production video still uses fal.ai/wan-pro) |
| T15 | Deploy router to staging in shadow mode; run 1000-job parallel comparison vs. existing fal.ai output; publish comparison report |
| T16 | Set provider-side spend caps per Section 7.1; verify alerts fire at 50/80/95% thresholds on a dry-run |
| T17 | Build the three dashboards from Section 5.3 in Awakli's existing BI tool; link from ops runbook |
| T18 | Execute the phased rollout (Section 11); produce post-rollout report documenting actual vs. projected cost reduction and any gate failures |


### Table 16
| Risk | Likelihood | Impact | Mitigation |
| Runware quality regression vs. fal.ai on signature character | Medium | High | M3 gate blocks rollout; Kaelis CLIP eval must ≥ 0.92 |
| Tensor.Art API rate limits too low for fallback load | Medium | Medium | Negotiate rate-limit bump during onboarding; validate via M12 soak test |
| Budget tracker drifts from provider invoice | Medium | Medium | M6 reconciliation check monthly; diff > 10% triggers investigation |
| Leaked API key causes cash burn | Low | High | Scoped keys only; provider-side spend caps; 90-day rotation; kill-switch drilled quarterly |
| Router latency overhead exceeds 50ms p95 | Low | Medium | Connection pooling, pre-resolved DNS, adapter caching; M11 gate enforces |
| Runware outage coincides with Tensor.Art outage | Very low | High | fal.ai as 3rd-line fallback for emergency image workloads; documented runbook |
| Custom LoRA upload fails silently on Runware | Low | High | Post-upload verification: render test prompt, CLIP-compare against reference, fail loud on mismatch |
| Provider adds hidden fees not captured by cost model | Medium | Low | Monthly invoice-to-tracker reconciliation catches within 30 days |
| Shadow-mode parallel dispatch doubles cost during Phase 2 | Certain | Low (1 week) | Budget a specific line item for shadow-mode spend; auto-cutoff after 7 days |
| Idempotency key collision across retries | Very low | Medium | Use jobId as idempotency key — globally unique by design |


### Table 17
| Metric | Baseline (fal.ai) | Routed (Runware primary) | Delta |
| Cost per chapter | $8.00 | $0.65 | -92% |
| Cost per 52-chapter title | $416 | $33.80 | -$382 per title |
| Break-even on implementation cost | n/a | ~3 completed titles | ~6 weeks of engineering ROI |


### Table 18
| Ship criteria All 18 atomic tasks (T1-T18) complete All 12 evaluation gates (M1-M12) passing Phase 4 cutover at 100% for 72 hours with no rollback trigger fired Post-rollout report delivered and reviewed P22 retirement notice posted to the prompts-index so the old manual rule doesn't get re-applied |

