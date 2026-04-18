# ImageRouter v1.0 Complete Spec Summary

## 18 Atomic Tasks (T1-T18)
| ID | Task |
|----|------|
| T1 | Provision secrets vault; seed with placeholder values for all 8 secret names |
| T2 | Generate scoped production API keys for Runware, Tensor.Art, Modal, RunPod; store in vault |
| T3 | Implement vault.ts that reads secrets at runtime; add grep-CI rule for literal key patterns |
| T4 | Define GenerationJob type in generationJob.ts per Section 5.1; migrate one call site |
| T5 | Create generation_costs table with schema from Section 5.2 |
| T6 | Implement ProviderAdapter interface (base.ts) per Section 6.2 |
| T7 | Implement RunwareAdapter with full ControlNet + custom LoRA support |
| T8 | Implement TensorArtAdapter |
| T9 | Refactor existing fal.ai integration into FalAdapter conforming to same interface |
| T10 | Implement router core (imageRouter.ts) per Section 6.1 skeleton, including ROUTING_TABLE |
| T11 | Implement budget.ts (Section 7.2); wire recordSpend into adapter success paths |
| T12 | Implement health.ts (Section 8.2); deploy health-probe worker on 60s interval |
| T13 | Upload Kaelis_v1 appearance LoRA to Runware model store; record model ID |
| T14 | Upload kaelis_motion_v1 to Runware model store (for preview/image path) |
| T15 | Deploy router to staging in shadow mode; run 1000-job comparison |
| T16 | Set provider-side spend caps per Section 7.1; verify alerts fire |
| T17 | Build the three dashboards from Section 5.3 |
| T18 | Execute phased rollout; produce post-rollout report |

## 12 Evaluation Gates (M1-M12)
| Gate | Description | Pass criterion |
|------|-------------|---------------|
| M1 | Router dispatches manga-panel jobs to Runware by default | 100% of MANGA_PANEL_* jobs route to Runware when healthy |
| M2 | Fallback to Tensor.Art fires on Runware outage | Simulated outage: 100% of in-flight manga jobs complete via Tensor.Art within 60s |
| M3 | Kaelis LoRA renders identically on Runware vs. fal.ai baseline | CLIP similarity >= 0.92 on 50-prompt eval set |
| M4 | ControlNet-heavy panels render correctly on Runware | Visual parity with fal.ai baseline on 20-panel CN eval set |
| M5 | Cost attribution row written for every completed job | 100% of completed jobs have a generation_costs row with actual_cost_usd > 0 |
| M6 | Budget tracker matches provider invoice within 5% | Month-1 invoice matches internal tracker ±5% |
| M7 | Secrets never appear in logs or error messages | Grep 7-day log archive returns 0 matches for any partial key prefix |
| M8 | Kill-switch executes in <30s end-to-end | Dry-run: all 3 provider keys rotated, router returns 503 within 30s |
| M9 | Rolling key rotation causes zero dropped jobs | Staging rotation: 1000 in-flight jobs, 0 dropped or duplicated |
| M10 | Per-chapter cost reduction >= 60% vs. fal.ai baseline | Measured on 5 production chapters |
| M11 | Router latency overhead < 50ms p95 | Measured router-internal time from receive to dispatch |
| M12 | All 3 provider adapters pass 10k-job soak test | 24h soak: error rate < 0.5%, p95 latency within SLO |

## Provider Spend Caps (Section 7.1)
| Provider | Cap surface | Initial cap (month 1) | Increment trigger |
|----------|------------|----------------------|-------------------|
| Runware | Dashboard → Billing → Spend Limits | $500 | Sustained 80% utilization 2 weeks |
| Tensor.Art | Dashboard → Subscription → Hard Limit | $100 | Sustained 80% utilization 2 weeks |
| fal.ai | Dashboard → Billing → Usage Cap | Existing cap | Video volume growth |
| Modal | Dashboard → Workspace → Spend Limit | $200 | New LoRA training campaign |
| RunPod | Dashboard → Account → Usage Cap | $150 | New warm pod deployment |

## Alert Thresholds (Section 7.3)
| Trigger | Channel | Action |
|---------|---------|--------|
| 50% of monthly cap | Slack #awakli-ops | Review burn trajectory |
| 80% of monthly cap | Slack + email to Hassan | Decide: raise cap or throttle |
| 95% of monthly cap | Slack + email + PagerDuty sev-2 | Immediate: raise cap or pause |
| 100% of cap (router blocks) | PagerDuty sev-1 + auto-page | Emergency: raise cap or accept degraded |
| Per-job cost > $0.50 | Slack immediate | Investigate runaway-cost job |

## Unit Economics
| Metric | Baseline (fal.ai) | Routed (Runware primary) | Delta |
|--------|-------------------|-------------------------|-------|
| Cost per chapter | $8.00 | $0.65 | -92% |
| Cost per 52-chapter title | $416 | $33.80 | -$382/title |
| Break-even | n/a | ~3 completed titles | ~6 weeks ROI |

## Key Architecture Rules
1. Router is the ONLY provider-aware component
2. Workers receive normalized GenerationJob with workload-type tag
3. No provider-specific fields leak past the router boundary
4. Idempotency via jobId as idempotency key on all adapter submissions
5. Hard failure (not silent degradation) when all providers unavailable
6. No auto-retry at router layer; retries happen at queue layer with backoff

## Routing Table
| Workload | Primary | Fallback | Never route to |
|----------|---------|----------|---------------|
| MANGA_PANEL_CHARACTER | runware | tensorart | NovelAI, PixAI, Leonardo |
| MANGA_PANEL_BACKGROUND | runware | tensorart | — |
| COVER_HERO | runware | tensorart | — |
| CONTROLNET_PANEL | runware | tensorart | NovelAI (limited CN) |
| CHARACTER_DISCOVERY | tensorart | runware | — |
| AESTHETIC_REFERENCE | tensorart | — | — |
| VIDEO_CLIP_CHARACTER | fal | — | Runway Gen-3 (cost) |
| VIDEO_CLIP_BACKGROUND | fal | — | — |
| LORA_TRAINING | modal | runpod | Any pay-per-image provider |

## Required Secrets
RUNWARE_API_KEY_PROD, RUNWARE_API_KEY_STAGING, TENSORART_API_KEY_PROD, TENSORART_API_KEY_STAGING,
FAL_KEY_PROD, FAL_KEY_STAGING, MODAL_TOKEN_ID, MODAL_TOKEN_SECRET, RUNPOD_API_KEY_TRAIN

## Compatibility with Prior Prompts
- P16-P19, P23: Pass through unchanged
- P20: Kaelis_v1 must be uploaded to Runware model store (1-time)
- P21: Eval harness calls through router like any other job
- P22: SUPERSEDED by this routing layer
- P24: Motion LoRA on fal.ai/wan-pro for video; image motion-LoRA preview on Runware
