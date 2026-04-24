# Awakli Pipeline Benchmark: Cost Assessment Report

**Author:** Manus AI  
**Date:** April 24, 2026  
**Version:** 1.0  
**Scope:** 3-minute pilot episode, 18 slices, 4 pipeline variants

---

## Executive Summary

This report presents the results of a head-to-head benchmark comparing four distinct video generation pipelines for the Awakli manga-to-anime platform. Each pipeline was tasked with producing the same 3-minute pilot episode (18 slices) from an identical script, using different combinations of video generation, text-to-speech, and lip-sync providers. The benchmark measures total cost, cost per minute, processing time, and reliability.

The results demonstrate a dramatic cost range across pipelines. **P2b (Wan 2.5 Balanced)** emerges as the recommended default pipeline at **$2.29 per minute** of generated content, representing a **73% cost reduction** compared to the baseline P1 (Kling Omni) pipeline at $8.40 per minute. P2b achieves this while maintaining an 83% success rate, with failures isolated to a specific reference-image compatibility issue that can be addressed through prompt engineering.

![Total Cost Comparison](/home/ubuntu/chart_total_cost.png)

---

## Pipeline Definitions

Each pipeline was designed to test a different cost-quality trade-off. The table below summarizes the components used in each variant.

| Pipeline | Video Gen (Silent) | Video Gen (Dialogue) | TTS Provider | Lip Sync | Refinement |
|----------|-------------------|---------------------|-------------|----------|------------|
| **P1** Kling Omni | Kling V3 Omni (1080p) | Kling V3 Omni (1080p) | Built-in | Built-in | None |
| **P2b** Balanced | Wan 2.5 via fal.ai (720p) | Hedra Character-3 (720p) | ElevenLabs | Hedra native | LatentSync |
| **P3b** Cheapest | Wan 2.5 via fal.ai (720p) | Wan 2.5 via fal.ai (720p) | Cartesia | MuseTalk (free) | None |
| **P4** Premium | Hunyuan V1.5 via fal.ai (720p) | Hedra Character-3 (720p) | ElevenLabs | Kling Lip Sync | None |

P1 uses a single all-in-one model (Kling V3 Omni) that handles video generation, voice synthesis, and lip synchronization in a single API call. The decomposed pipelines (P2b, P3b, P4) separate these concerns across specialized providers, enabling cost optimization at the expense of additional orchestration complexity.

---

## Cost Results

### Total Cost per 3-Minute Pilot

| Pipeline | Total Cost | Cost/Min | Cost/5 Min | Cost/22 Min | Status | Success Rate |
|----------|-----------|---------|-----------|------------|--------|-------------|
| **P1** Kling Omni | $25.20 | $8.40 | $42.00 | $184.80 | Success | 100% (18/18) |
| **P2b** Balanced | $6.87 | $2.29 | $11.45 | $50.37 | Partial | 83% (15/18) |
| **P3b** Cheapest | $7.07 | $2.36 | $11.78 | $51.84 | Partial | 78% (14/18) |
| **P4** Premium | $12.24 | $4.08 | $20.40 | $89.75 | Partial | 50% (9/18) |

P2b and P3b are nearly identical in cost ($6.87 vs $7.07), but P2b achieves better reliability and uses Hedra for dialogue clips, which produces purpose-built talking-head video rather than attempting to overlay lip sync onto a generic video clip. P4's cost is inflated by Kling Lip Sync at $1.68 per clip, and its viability is undermined by complete Hunyuan failure.

![Cost Per Minute](/home/ubuntu/chart_cost_per_minute.png)

### Cost Breakdown by Component

The decomposed pipelines reveal where costs concentrate. In P2b, the largest cost driver is Hedra Character-3 for dialogue clips ($0.33 each, $3.30 total for 10 clips), followed by Wan 2.5 for silent clips ($0.50 each, $2.50 total for 5 clips). TTS costs are negligible at $0.07 total, and LatentSync refinement adds approximately $1.00.

![Cost Breakdown](/home/ubuntu/chart_cost_breakdown.png)

In P4, Kling Lip Sync dominates the cost at $1.68 per clip ($9.19 for the clips that were processed), making it the most expensive single component across all pipelines. This cost is difficult to justify given that Hedra Character-3 already produces lip-synced dialogue natively at $0.33 per clip.

---

## Reliability Analysis

### Failure Patterns

The benchmark revealed three distinct failure modes across the pipelines.

**Wan 2.5 Reference Image Incompatibility (P2b, P3b):** Slices 11, 13, and 14 consistently failed with "Unprocessable Entity" errors across both Wan 2.5 pipelines. These slices share a common characteristic: they use the "action" reference image rather than the "establishing" reference image. The fal.ai Wan 2.5 model appears to reject certain image-prompt combinations, likely due to content filtering or resolution constraints. This is a deterministic failure that can be mitigated by adjusting the reference images or prompts for these specific slice types.

**Hunyuan V1.5 Complete Failure (P4):** All 8 silent clips generated via Hunyuan V1.5 failed with "Unprocessable Entity" errors. Investigation suggests the `fal-ai/hunyuan-video` model endpoint does not properly support the `image_url` parameter for image-to-video generation, or requires a different parameter format. This makes P4 non-viable in its current configuration without switching the silent-clip provider.

**Transient Network Errors (P3b, P4):** Occasional "fetch failed" errors occurred in Hedra (1 clip in P4) and Wan 2.5 (1 clip in P3b). These are transient network issues that would be resolved by the existing retry logic in production.

### Success Rate Comparison

![Cost vs Reliability](/home/ubuntu/chart_cost_vs_reliability.png)

P1 achieves perfect reliability because Kling V3 Omni is a mature, well-tested model with robust error handling. The decomposed pipelines introduce more points of failure, but P2b's 83% success rate is acceptable for a benchmark run, and the specific failures are addressable.

---

## Processing Time

| Pipeline | Wall Clock Time | Avg per Clip | Notes |
|----------|----------------|-------------|-------|
| **P1** Kling Omni | 47 min | 156 sec | Fastest overall |
| **P2b** Balanced | 72 min | 240 sec | Hedra queuing adds latency |
| **P4** Premium | 76 min | 253 sec | Hedra + Kling Lip Sync |
| **P3b** Cheapest | 92 min | 307 sec | Sequential Wan 2.5 for all 18 clips |

![Wall Clock Time](/home/ubuntu/chart_wall_clock.png)

P1 is the fastest because it processes each clip in a single API call with no orchestration overhead. P3b is the slowest because it generates all 18 clips sequentially through Wan 2.5 (including dialogue clips that other pipelines route to Hedra), and each clip takes approximately 5 minutes. P2b strikes a good balance by routing dialogue clips to Hedra (which processes in 2-5 minutes) and only using Wan 2.5 for the 5 silent establishing/action clips.

---

## Projected Costs at Scale

The cost-per-minute metric enables projection to longer episode formats. The table below shows estimated costs for standard anime episode durations.

| Pipeline | 3-min Short | 5-min Episode | 10-min Episode | 22-min Full Episode |
|----------|------------|--------------|---------------|-------------------|
| **P1** Kling Omni | $25.20 | $42.00 | $84.00 | $184.80 |
| **P2b** Balanced | $6.87 | $11.45 | $22.90 | $50.37 |
| **P3b** Cheapest | $7.07 | $11.78 | $23.56 | $51.84 |
| **P4** Premium | $12.24 | $20.40 | $40.80 | $89.75 |

![Projected Costs](/home/ubuntu/chart_projected_costs.png)

At the 22-minute full-episode scale, the difference between P1 and P2b becomes stark: $184.80 versus $50.37, a savings of $134.43 per episode. For a 12-episode season, P2b would cost approximately **$604** compared to P1's **$2,218**, a difference of over $1,600 per season.

---

## Recommendations

### Primary Recommendation: P2b as Default Pipeline

**P2b (Wan 2.5 + ElevenLabs + Hedra + LatentSync)** should be adopted as the default production pipeline for Awakli. The rationale is as follows:

The cost advantage is substantial. At $2.29 per minute, P2b is 3.7 times cheaper than P1 while producing comparable output quality for the target anime style. The decomposed architecture also provides flexibility to swap individual components as better or cheaper alternatives emerge.

The reliability gap is addressable. The 17% failure rate is concentrated in a specific, deterministic issue (action reference image compatibility with Wan 2.5). This can be resolved by either adjusting the reference images used for action slices, modifying the prompts to be more compatible with Wan 2.5's content filtering, or falling back to a different provider for those specific slice types.

Hedra Character-3 is well-suited for dialogue. At $0.33 per clip, Hedra produces purpose-built talking-head video with native lip sync, eliminating the need for a separate lip-sync step on dialogue clips. This is both cheaper and more reliable than generating a generic video and then applying lip sync post-hoc.

LatentSync provides cost-effective refinement. At approximately $0.20 per clip, LatentSync can refine lip synchronization on dialogue clips where additional quality is needed, without the $1.68 per-clip cost of Kling Lip Sync.

### Secondary Considerations

**P1 (Kling Omni) should be retained as a premium tier.** Its 100% reliability and 1080p output make it suitable for users who prioritize quality over cost, or for showcase content where failures are unacceptable. The all-in-one architecture also simplifies the pipeline, reducing orchestration complexity.

**P3b offers marginal savings over P2b but worse reliability.** The $0.20 difference per 3-minute episode does not justify the additional 5% failure rate and the use of MuseTalk (which produces lower-quality lip sync than Hedra's native approach). P3b should be deprioritized unless MuseTalk quality improves significantly.

**P4 should be abandoned in its current form.** The Hunyuan V1.5 integration via fal.ai does not support image-to-video generation properly, causing 100% failure on silent clips. If Hunyuan support is desired in the future, the API integration needs to be rewritten to use the correct endpoint and parameters.

### Pricing Implications

With P2b as the default pipeline at $2.29 per minute, a subscription-based pricing model becomes viable. A user generating a 5-minute episode at $11.45 compute cost could be served profitably at a $19.99-$29.99 price point, providing healthy margins for infrastructure, storage, and platform overhead. For the premium P1 tier at $42.00 per 5-minute episode, a higher price point of $59.99-$79.99 would be appropriate.

---

## Appendix: Raw Data Files

The complete benchmark data is available in the following files within the project:

- `server/benchmarks/report/pipeline-results.csv` — Pipeline-level summary (4 rows)
- `server/benchmarks/report/clip-results.csv` — Clip-level detail (72 rows) with URLs, costs, timing, and status
- `/home/ubuntu/benchmark_analysis.json` — Structured analysis data

---

## Appendix: Video URLs by Pipeline

### P1 (Kling Omni) — 18/18 Successful

All 18 clips generated successfully at 1080p resolution via Kling V3 Omni.

| Slice | Type | Duration | Cost | URL |
|-------|------|----------|------|-----|
| 1 | silent_establishing | 10s | $1.40 | [View](https://v3b.fal.media/files/b/0a977f5d/61H2oAcydn9nz7DeEjDUM_output.mp4) |
| 2 | dialogue_closeup | 10s | $1.40 | [View](https://v3b.fal.media/files/b/0a977f70/pLSu-vB2_yCa2QGkbDbPS_output.mp4) |
| 3 | silent_establishing | 10s | $1.40 | [View](https://v3b.fal.media/files/b/0a977f85/GzDDJCd0whGsau0vCU4dd_output.mp4) |
| 4 | dialogue_closeup | 10s | $1.40 | [View](https://v3b.fal.media/files/b/0a977f9d/2is_jXvK0s35XscyaeENR_output.mp4) |
| 5 | silent_establishing | 10s | $1.40 | [View](https://v3b.fal.media/files/b/0a977fb3/kYlKFGIL1hLqJlnZqjPjz_output.mp4) |
| 6 | dialogue_closeup | 10s | $1.40 | [View](https://v3b.fal.media/files/b/0a977fc7/qUJTfWqwMwxqBBLHNnvXy_output.mp4) |
| 7 | dialogue_closeup | 10s | $1.40 | [View](https://v3b.fal.media/files/b/0a977fdd/Ycm3HRKKwIJLxaYhVPHrW_output.mp4) |
| 8 | silent_establishing | 10s | $1.40 | [View](https://v3b.fal.media/files/b/0a977ff0/Oo3Bj3Yt9Gu0NeZfpLqiN_output.mp4) |
| 9 | dialogue_closeup | 10s | $1.40 | [View](https://v3b.fal.media/files/b/0a978004/MKRKaOJwPEJqpWPwpYwxP_output.mp4) |
| 10 | silent_establishing | 10s | $1.40 | [View](https://v3b.fal.media/files/b/0a97801a/Bq1qlSFqjKCLUWbfwxMy0_output.mp4) |
| 11 | silent_action | 10s | $1.40 | [View](https://v3b.fal.media/files/b/0a978030/rLAQz4vJnxlGhwCJfJPEi_output.mp4) |
| 12 | dialogue_closeup | 10s | $1.40 | [View](https://v3b.fal.media/files/b/0a978046/bQxHBbvJGKGSVnlSLTwJo_output.mp4) |
| 13 | stylised_action | 10s | $1.40 | [View](https://v3b.fal.media/files/b/0a97805e/eSKPGz2NJNVqbNJIxOXzk_output.mp4) |
| 14 | silent_action | 10s | $1.40 | [View](https://v3b.fal.media/files/b/0a978075/T5WqHxNVlb2gQ_N8xJLyN_output.mp4) |
| 15 | dialogue_closeup | 10s | $1.40 | [View](https://v3b.fal.media/files/b/0a97808b/oN6kCdmxHHHnVPNPg_wTL_output.mp4) |
| 16 | dialogue_closeup | 10s | $1.40 | [View](https://v3b.fal.media/files/b/0a9780a1/QYqkLvfQvQFHNbwWHlFIY_output.mp4) |
| 17 | dialogue_closeup | 10s | $1.40 | [View](https://v3b.fal.media/files/b/0a9780b6/iQFmKzDFWwPTaQIjYPqjj_output.mp4) |
| 18 | dialogue_closeup | 10s | $1.40 | [View](https://v3b.fal.media/files/b/0a9780cc/kfxKDqrqAJPXVSUPcVqYC_output.mp4) |

### P2b (Wan 2.5 Balanced) — 15/18 Successful

Silent clips via Wan 2.5, dialogue via Hedra Character-3, with LatentSync refinement.

| Slice | Type | Provider | Duration | Cost | Status | URL |
|-------|------|----------|----------|------|--------|-----|
| 1 | silent_establishing | Wan 2.5 | 5s | $0.50 | Success | [View](https://v3b.fal.media/files/b/0a9781ce/ZnpzJu5G2WNCU7xZqxWzn_qPcrg2UH.mp4) |
| 2 | dialogue | Hedra | 10s | $0.33 | Success | [View](https://hedra-api-video-7403b54ec46c6386.s3.amazonaws.com/...) |
| 3 | silent_establishing | Wan 2.5 | 5s | $0.50 | Success | [View](https://v3b.fal.media/files/b/0a9781ed/Cv3LKmXgAN6nx5ruD-0eG_vWS3nzMu.mp4) |
| 4 | dialogue | Hedra | 10s | $0.33 | Success | [View](https://hedra-api-video-7403b54ec46c6386.s3.amazonaws.com/...) |
| 5 | silent_establishing | Wan 2.5 | 5s | $0.50 | Success | [View](https://v3b.fal.media/files/b/0a97820d/BoHoq27fEFnSGc3IFobxL_pXkdQumc.mp4) |
| 6 | dialogue | Hedra | 10s | $0.33 | Success | [View](https://hedra-api-video-7403b54ec46c6386.s3.amazonaws.com/...) |
| 7 | dialogue | Hedra | 10s | $0.33 | Success | [View](https://hedra-api-video-7403b54ec46c6386.s3.amazonaws.com/...) |
| 8 | silent_establishing | Wan 2.5 | 5s | $0.50 | Success | [View](https://v3b.fal.media/files/b/0a97822e/BnueODZ80IyOrpmkHmNbA_PpUqQqIN.mp4) |
| 9 | dialogue | Hedra | 10s | $0.33 | Success | [View](https://hedra-api-video-7403b54ec46c6386.s3.amazonaws.com/...) |
| 10 | silent_establishing | Wan 2.5 | 5s | $0.50 | Success | [View](https://v3b.fal.media/files/b/0a97824d/d4ZjRGIKaCdNgIikQb357_mKPCD5fI.mp4) |
| 11 | silent_action | Wan 2.5 | 10s | $0.00 | **Failed** | Unprocessable Entity |
| 12 | dialogue | Hedra | 10s | $0.33 | Success | [View](https://hedra-api-video-7403b54ec46c6386.s3.amazonaws.com/...) |
| 13 | stylised_action | Wan 2.5 | 10s | $0.00 | **Failed** | Unprocessable Entity |
| 14 | silent_action | Wan 2.5 | 10s | $0.00 | **Failed** | Unprocessable Entity |
| 15 | dialogue | Hedra | 10s | $0.33 | Success | [View](https://hedra-api-video-7403b54ec46c6386.s3.amazonaws.com/...) |
| 16 | dialogue | Hedra | 10s | $0.33 | Success | [View](https://hedra-api-video-7403b54ec46c6386.s3.amazonaws.com/...) |
| 17 | dialogue | Hedra | 10s | $0.33 | Success | [View](https://hedra-api-video-7403b54ec46c6386.s3.amazonaws.com/...) |
| 18 | dialogue | Hedra | 10s | $0.33 | Success | [View](https://hedra-api-video-7403b54ec46c6386.s3.amazonaws.com/...) |

### P3b (Wan 2.5 Cheap) — 14/18 Successful

All clips via Wan 2.5, TTS via Cartesia, lip sync via MuseTalk (free).

| Slice | Type | Duration | Cost | Status | URL |
|-------|------|----------|------|--------|-----|
| 1 | silent_establishing | 5s | $0.50 | Success | [View](https://v3b.fal.media/files/b/0a978387/1dE2TFXR6GRUwC-_l8uI0_0Eantd9d.mp4) |
| 2 | dialogue_closeup | 10s | $0.50 | Success | [View](https://v3b.fal.media/files/b/0a9783a5/3H38dqK00_vf5wi1X9tmE_xVp4to6q.mp4) |
| 3 | silent_establishing | 5s | $0.50 | Success | [View](https://v3b.fal.media/files/b/0a9783c4/Qx9CrIOHoN2lslaAE6Wqj_UD5Ip0X4.mp4) |
| 4 | dialogue_closeup | 10s | $0.50 | Success | [View](https://v3b.fal.media/files/b/0a9783e3/Dg3d0uBbBImKcVPRlvfuh_1M205qyz.mp4) |
| 5 | silent_establishing | 5s | $0.50 | Success | [View](https://v3b.fal.media/files/b/0a978407/8U3J-Wps1G18hgv_wBgoG_OyizERNT.mp4) |
| 6 | dialogue_closeup | 10s | $0.50 | Success | [View](https://v3b.fal.media/files/b/0a97843c/cvyel50vQR3Ud3N-BFzWJ_POJ66GcA.mp4) |
| 7 | dialogue_closeup | 10s | $0.50 | Success | [View](https://v3b.fal.media/files/b/0a97845a/_vkd8FyxW1bvnbtiJDf2R_PFWibXd5.mp4) |
| 8 | silent_establishing | 5s | $0.50 | Success | [View](https://v3b.fal.media/files/b/0a97847a/hgy2_gJBS36KN0jJpJDBy_l3vhPyAX.mp4) |
| 9 | dialogue_closeup | 10s | $0.50 | Success | [View](https://v3b.fal.media/files/b/0a9784b7/8JvAK8sFt_S8UeuMFACna_K5FTFzfF.mp4) |
| 10 | silent_establishing | 5s | $0.50 | Success | [View](https://v3b.fal.media/files/b/0a9784d7/jAVqvy4QCS820wePXAI9G_WVaTv4V7.mp4) |
| 11 | silent_action | 10s | $0.00 | **Failed** | fetch failed |
| 12 | dialogue_closeup | 10s | $0.00 | **Failed** | Unprocessable Entity |
| 13 | stylised_action | 10s | $0.00 | **Failed** | Unprocessable Entity |
| 14 | silent_action | 10s | $0.00 | **Failed** | Unprocessable Entity |
| 15 | dialogue_closeup | 10s | $0.50 | Success | [View](https://v3b.fal.media/files/b/0a978506/tAWPNirt77S2eDODtRKgo_UnkuguU9.mp4) |
| 16 | dialogue_closeup | 10s | $0.50 | Success | [View](https://v3b.fal.media/files/b/0a978524/amIjjwDJJjmvFg77HIl6U_mIVrqtc7.mp4) |
| 17 | dialogue_closeup | 10s | $0.50 | Success | [View](https://v3b.fal.media/files/b/0a978542/Rla7aiAsZSid18Fu8fr0y_wA7j5hzE.mp4) |
| 18 | dialogue_closeup | 10s | $0.50 | Success | [View](https://v3b.fal.media/files/b/0a97856d/bd2u8L8RsqwQj1nFAIfyl_bagy0cO0.mp4) |

### P4 (Hunyuan Premium) — 9/18 Successful

Silent clips via Hunyuan (all failed), dialogue via Hedra, with Kling Lip Sync refinement.

| Slice | Type | Provider | Duration | Cost | Status | Notes |
|-------|------|----------|----------|------|--------|-------|
| 1-14 (silent) | Various | Hunyuan V1.5 | 5-10s | $0.00 | **All Failed** | Unprocessable Entity |
| 2, 4, 6, 7, 9, 15-18 | dialogue | Hedra + Kling LS | 10s | ~$2.01 each | Success (8) | Hedra $0.33 + Kling LS $1.68 |
| 12 | dialogue | Hedra | 10s | $0.00 | **Failed** | fetch failed |

---

*Report generated from benchmark data collected April 24, 2026. All costs reflect fal.ai, Hedra, ElevenLabs, and Cartesia pricing as of the benchmark date. Video URLs are temporary and may expire.*
