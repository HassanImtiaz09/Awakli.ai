# ImageRouter Spec - Key Findings

## Overview
Multi-Surface Image Generation Router: Runware (primary) + Tensor.Art (training/discovery) + fal.ai (video + select image)
Three prerequisites: (1) vault-backed secrets, (2) per-provider budget caps & cost attribution, (3) health-check failover
Expected: ~60-80% cost reduction vs fal.ai-only path

## Architecture
Three external surfaces, single router component (image_router.ts) decides which surface handles which job.
- Runware: primary for manga panels (SDXL+LoRA), ~$0.0006/image, 400k+ models
- Tensor.Art: training/discovery, LoRA training, KAELIS_V2+ discovery
- fal.ai: video + select image models (Wan 2.6, HunyuanVideo)

## Routing Rules (Section 2.2)
| Workload | Primary | Fallback | Never route to |
|----------|---------|----------|---------------|
| Manga panel (signature character) | Runware | Tensor.Art | NovelAI (no LoRA), PixAI, Leonardo |
| Manga panel (background/no char) | Runware | Tensor.Art | — |
| Cover page / hero illustration | Runware | Tensor.Art | — |

## Contents (14 sections)
1. Why this prompt exists — single-provider risk
2. Target architecture — 3-surface routed stack
3. Provider role matrix — who owns which workload
4. Secrets vault schema — keys, scopes, rotation policy
5. Job schema & cost attribution — every generation is a tagged row
6. Router logic — routing rules + code skeleton
7. Budget governance — per-provider caps, alerts, kill-switch
8. Health checks & failover — detection, fallback chain, recovery
9. Compatibility with Prompts 16-24
10. Evaluation gates — M1-M12 acceptance criteria
11. Rollout plan — 4-phase staged migration
12. Atomic Manus action items — 18 concrete tasks
13. Risk register & mitigations
14. Unit economics — cost model and payback

## Routing Rules (continued from page 6)
| Workload | Primary | Fallback | Never route to |
|----------|---------|----------|---------------|
| LoRA training job | Modal (GPU) | RunPod (GPU) | Any pay-per-image provider |
| Character discovery / style prototyping | Tensor.Art | Runware | — |
| Video clip (signature character) | fal.ai (Wan 2.6) | Self-host via Modal | Runway Gen-3 (cost) |
| Video clip (no character) | fal.ai (Wan 2.6 / HunyuanVideo) | Self-host via Modal | — |
| ControlNet-heavy panel composition | Runware (full CN suite) | Tensor.Art | NovelAI (limited CN) |
| One-off aesthetic reference (art team) | Tensor.Art | PixAI | — |

## Section 2.3: Router is only provider-aware component
Every other piece of backend talks to router via provider-agnostic job interface.
Workers receive normalized generation job with workload-type tag; they don't know which provider fulfilled it.

## Section 3: Provider role matrix
### 3.1 Runware — primary image backend
- Endpoint: https://api.runware.ai/v1 (REST + WebSocket)
- Pricing: From $0.0006/image, Videos from $0.14/clip, pay-per-job no monthly minimum
- 400k+ models: Illustrious XL, Animagine XL, FLUX-base, SDXL base, Pony Diffusion
- Custom LoRA: Native. Upload .safetensors, reference by ID. Kaelis LoRA stack drops in directly.
- ControlNet: Full suite — OpenPose, Canny, Depth, HED, Normal, Scribble, Lineart, Tile
- SDK: Official JS, Python, Go. 'Sonic Inference Engine' unified API across all 400k+ models.

### 3.2 Tensor.Art — training, discovery, fallback
- Endpoint: https://tensor.art/api (REST, credit-based)
- Pricing: $5/mo (Basic) to $92/mo (Pro). PAYG credit packs. 1 credit ≈ 1 standard image.
- 10,000+ models including FLUX anime checkpoints, Illustrious XL, Animagine XL 4.0, Wan video
- Custom LoRA: Native, plus browser-based LoRA training on user datasets
- ControlNet: OpenPose, Canny, Depth supported via API

### 3.3 fal.ai — video + select image (already integrated)
- Endpoint: https://fal.run/ (REST), already wired via existing API key
- Pricing: $0.10/sec (720p) to $0.15/sec (1080p) for Wan 2.6; Flash from $0.05/sec
- Models: Wan 2.6 (T2V, R2V, I2V), HunyuanVideo, FLUX, SD 3.5, fal-exclusive fine-tunes
- Custom LoRA: via fal's deploy flow; heavier than Runware's inline LoRA
- Tertiary for image (don't duplicate what Runware covers better)

### 3.4 Explicitly excluded
| Provider | Why excluded |
|----------|-------------|
| NovelAI | No external LoRA support |
| PixAI | Overlaps with Runware/Tensor.Art |
| Niji Journey / Midjourney | No official public API |
| Leonardo.AI | Proprietary 'Elements' LoRA |
| Replicate | ~20-50x more expensive than Runware |

## Section 4: Secrets vault schema
### 4.2 Required secrets (initial rollout)
| Secret name | Scope | Used by |
|-------------|-------|--------|
| RUNWARE_API_KEY_PROD | Production image gen | Router (prod) |
| RUNWARE_API_KEY_STAGING | Staging + CI | Router (staging) |
| TENSORART_API_KEY_PROD | Production LoRA train + fallback image | Router (prod) |
| TENSORART_API_KEY_STAGING | Staging + CI | Router (staging) |
| FAL_KEY_PROD | Production video + select image | Router (prod) |
| FAL_KEY_STAGING | Staging + CI | Router (staging) |
| MODAL_TOKEN_ID / SECRET | LoRA training jobs | Training orchestrator |
| RUNPOD_API_KEY_TRAIN | Warm pod deployments | Training orchestrator |

### 4.3 Access policy: Only router reads provider API keys
### 4.4 Key rotation: 90-day cadence per provider
### 4.5 Kill-switch script: revoke all keys, force hard-fail state

## Section 5: Job schema & cost attribution
### 5.1 Normalized GenerationJob interface
```ts
export interface GenerationJob {
  jobId: string;           // uuid v4
  chapterId: string;       // foreign key to chapter
  panelId: string | null;  // null for non-panel jobs
  requestedBy: string;     // user id or "system"
  workload: WorkloadType;
  characterRefs: string[]; // LoRA IDs, in load order
  aspectRatio: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
  qualityTier: "preview" | "standard" | "hero";
  prompt: string;
  negativePrompt: string;
  seed: number | null;
  steps: number;
  cfgScale: number;
  controlNets: ControlNetSpec[];
  resolution: { width: number; height: number };
  outputCount: number;
  provider?: "runware" | "tensorart" | "fal";
  providerEndpoint?: string;
  providerRequestId?: string;
  actualCostUsd?: number;
  actualLatencyMs?: number;
  providerInvoiceId?: string;
  status: "queued" | "routing" | "in_flight" | "complete" | "failed";
  createdAt: string;
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
```

### 5.2 Cost attribution table (generation_costs)
- job_id UUID PK, chapter_id UUID FK, workload VARCHAR(40), provider VARCHAR(20)
- model_id VARCHAR(120), actual_cost_usd NUMERIC(10,6), estimated_cost_usd NUMERIC(10,6)
- latency_ms INTEGER, character_refs TEXT[], succeeded BOOLEAN, completed_at TIMESTAMPTZ
- provider_invoice_id VARCHAR(120)
- Indexes: chapter_id, (provider, completed_at), (workload, completed_at)

### 5.3 Derived dashboards
| Dashboard | Aggregation | Refresh |
|-----------|-------------|--------|
| Per-chapter cost | SUM(actual_cost_usd) GROUP BY chapter_id | On chapter completion |
| Per-provider burn | SUM(actual_cost_usd) GROUP BY provider, DATE(completed_at) | Every 5 min |
| Workload cost mix | SUM(actual_cost_usd) GROUP BY workload, week | Daily at 00:00 UTC |

## Section 6: Router logic
### 6.1 Decision flow
Four phases: (1) map workload to primary+fallback list, (2) check health, (3) check budget cap, (4) dispatch.
If all providers unhealthy or capped, hard failure (not silent degradation).

```ts
const ROUTING_TABLE: Record<WorkloadType, Provider[]> = {
  MANGA_PANEL_CHARACTER:  ["runware", "tensorart"],
  MANGA_PANEL_BACKGROUND: ["runware", "tensorart"],
  COVER_HERO:             ["runware", "tensorart"],
  CONTROLNET_PANEL:       ["runware", "tensorart"],
  CHARACTER_DISCOVERY:    ["tensorart", "runware"],
  AESTHETIC_REFERENCE:    ["tensorart"],
  VIDEO_CLIP_CHARACTER:   ["fal"],
  VIDEO_CLIP_BACKGROUND:  ["fal"],
  LORA_TRAINING:          ["modal", "runpod"],
};
```

### 6.2 Adapter interface
```ts
export interface ProviderAdapter {
  readonly id: "runware" | "tensorart" | "fal";
  submit(job: GenerationJob): Promise<AdapterResult>;
  healthCheck(): Promise<HealthStatus>;
  estimateCost(job: GenerationJob): number;
  getInvoiceId(providerResponse: unknown): string | null;
}

export interface AdapterResult {
  providerRequestId: string;
  imageUrls: string[];
  actualCostUsd: number;
  latencyMs: number;
  rawResponse: unknown;
}
```

## Still need to read: pages 16-32
