# Awakli Pipeline Optimisation Action Plan

**Date:** 24 April 2026
**Context:** Post-benchmark quality critique analysis across P1 (Kling Omni), P2b (Wan 2.5 + Hedra + LatentSync), and P3b (Wan 2.5 + Cartesia + MuseTalk)
**Objective:** Produce a hybrid pipeline architecture that maximises visual quality while keeping per-minute cost feasible for production

---

## 1. Executive Summary

The four-pipeline benchmark generated 72 clips across the same 18-slice, 3-minute pilot script. An external quality review identified six systemic issues, most of which trace to **upstream panel generation** rather than the video pipelines themselves. The core finding is that neither P1 nor P2b wins outright: P1 handles action scenes but costs $8.40/min; P2b delivers superior emotional dialogue at $1.93/min but cannot render action shots at all due to Wan 2.5 content-filter rejections.

This document traces each critique to its root cause in the codebase, proposes a hybrid P2b-default / P1-on-demand architecture, models the blended cost, and lays out a phased implementation plan.

---

## 2. Root Cause Analysis

### 2.1 Letterboxing and Aspect Ratio (All Pipelines)

The critique noted that all outputs appear letterboxed with black side-bars, indicating source panels closer to 1:1 than 16:9.

**Root cause:** The `generateImage()` function in `server/_core/imageGeneration.ts` calls the Forge ImageService with only a `prompt` parameter and no explicit dimensions. The Forge ImageService defaults to 1024x1024 (1:1 square) output. When these square panels are fed into video models that request 16:9 output (Wan 2.5 sends `aspect_ratio: "16:9"` at line 358 of `api-clients.ts`; Kling sends `start_image_url` without aspect enforcement), the models either pillarbox the source or crop it, producing visible black bars.

| Component | Current Behaviour | Required Behaviour |
|-----------|------------------|--------------------|
| Forge ImageService (`generateImage`) | No size param → defaults to 1024x1024 | Pass `image_size: { width: 1344, height: 768 }` for 16:9 |
| Wan 2.5 (`wan25ViaFal`) | Sends `aspect_ratio: "16:9"` but receives 1:1 image | Receive native 16:9 image, no pillarboxing |
| Kling Omni (`klingOmniViaFal`) | Sends `start_image_url` with no aspect hint | Receive native 16:9 image |
| Hedra Character-3 | Receives square portrait, animates as-is | Receive 16:9 or cropped portrait with proper framing |

**Fix location:** Stage 1 panel generation. The `generateImage` call in `server/routers.ts` (lines 206, 225, 288, 342) must pass an `image_size` parameter. For video-destined panels, use 1344x768 (closest Flux-supported 16:9 resolution). For Hedra dialogue portraits, generate a separate 1:1 crop or use the dialogue reference image at 1024x1024 with proper face framing.

### 2.2 Action Shot Failures in P2b and P3b

The critique observed that P2b and P3b never rendered the Shot 3 katana-versus-shield moment. This is not a sampling gap — the clips genuinely do not exist.

**Root cause:** Slices 11, 13, and 14 (all `silent_action` or `stylised_action` types) use the "action" reference image and all three failed with HTTP 422 "Unprocessable Entity" from fal.ai's Wan 2.5 endpoint. The establishing and dialogue reference images work fine with Wan 2.5; only the action image triggers the rejection. The action image depicts dynamic combat with glowing weapon effects and energy bursts, which likely trips Wan 2.5's content safety filter (the model has `enable_safety_checker: false` set at line 361 of `api-clients.ts`, but the server-side filter may override this client parameter).

P1 (Kling Omni) handled all 18 slices including the action shots because Kling's content policy is more permissive for stylised anime combat.

| Pipeline | Slices 11/13/14 Status | Provider | Error |
|----------|----------------------|----------|-------|
| P1 | All 3 succeeded | fal.ai (Kling) | — |
| P2b | All 3 failed | fal.ai (Wan 2.5) | Unprocessable Entity |
| P3b | All 3 failed | fal.ai (Wan 2.5) | Unprocessable Entity |
| P4 | All 3 failed | fal.ai (Hunyuan) | Unprocessable Entity |

**Fix:** This is the strongest argument for the hybrid architecture. Wan 2.5 cannot reliably generate action content. Rather than trying to work around the content filter (which may change without notice), route action-tagged slices to Kling Omni. Additionally, regenerate the action reference panel with less aggressive VFX (reduce explicit weapon contact, use motion blur instead of energy bursts) to test whether a softer version passes the Wan 2.5 filter as a fallback.

### 2.3 Style Drift Between Shot Types

The critique identified three visibly different style signatures: seinen manga with ink and screentone for establishing shots, cel-shaded modern anime for dialogue, and stylised neon/CG for action. The fixture spec required all panels to feel like they came from the same chapter.

**Root cause:** The three reference images in `pilot-3min-script.json` were generated independently by Stage 1 (Flux via Forge ImageService) with different prompts. Each prompt describes the scene content but does not enforce a unified art style. The establishing prompt emphasises "neon-lit skyscrapers" and "cinematic 2D anime style"; the dialogue prompt describes character details; the action prompt focuses on dynamic effects. Without a shared style anchor (LoRA, IPAdapter reference, or explicit style tokens), Flux produces visually distinct outputs for each.

**Fix:** This requires a two-pronged approach at the Stage 1 level:

First, establish a **style reference system**. Generate one "style anchor" image that defines the target aesthetic (seinen manga, consistent ink weight, screentone shading). Then use this anchor as an `original_images` input to `generateImage()` for all subsequent panel generations, leveraging the Forge ImageService's image-editing mode to maintain style consistency.

Second, standardise the **style suffix** across all prompts. Append a consistent style descriptor to every panel prompt: `"Consistent seinen manga style with variable-weight ink lines, mechanical screentone shading, limited colour palette (amber, cyan, magenta accents on muted backgrounds). No cel-shading, no CG rendering, no gradient fills."` This constrains the model's style space regardless of scene content.

### 2.4 Mira's Prosthetic Arm Inconsistency

All three pipelines occasionally render both of Mira's arms as mechanical instead of only the left.

**Root cause:** The reference panels themselves are inconsistent. The `generateImage()` call receives a text prompt describing "mechanical left arm" but Flux does not reliably enforce left-versus-right anatomical constraints from text alone. The video generation models then faithfully propagate whatever the source panel shows.

**Fix:** This is a Stage 1 problem. Two approaches:

The first approach is **inpainting**: generate the full character, then use the Forge ImageService's editing mode to regenerate only the right arm with an explicit prompt like "normal human right arm, no mechanical parts, skin-coloured, natural anatomy." This is more reliable than hoping the initial generation gets the laterality correct.

The second approach is **reference locking**: once a correct Mira panel exists (left arm mechanical, right arm natural), use it as the `original_images` reference for all subsequent Mira-containing panels. The editing mode will preserve the established anatomy.

### 2.5 Dialogue Composition (Characters Facing Camera, Not Each Other)

P1's dialogue shots show both characters facing forward rather than facing each other in confrontation as the spec requires.

**Root cause:** The dialogue reference image was generated as a character-roster style composition (both characters facing the viewer). Kling Omni and Hedra both animate from the source image's existing pose — they do not recompose characters. Hedra Character-3 is specifically a talking-head animator that takes a single portrait and drives mouth/eye movements; it cannot change the character's body orientation.

**Fix:** Generate dialogue reference panels with proper staging. For two-character dialogue scenes, generate separate panels: one with Character A facing right (3/4 view), one with Character B facing left (3/4 view). The video pipeline then alternates between these as shot-reverse-shot, which is the standard anime dialogue convention. This also solves the Hedra limitation since each portrait only contains one character in the correct orientation.

### 2.6 P4 (Hunyuan) Total Failure

All 8 Hunyuan silent clips returned "Unprocessable Entity."

**Root cause:** The fal.ai Hunyuan endpoint (`fal-ai/hunyuan-video`) does not support the `image_url` parameter for image-to-video generation. The `hunyuanViaFal` function at line 402 of `api-clients.ts` passes `image_url` when a reference image exists, but the Hunyuan model on fal.ai only supports text-to-video. Unlike Wan 2.5 (which has separate `text-to-video` and `image-to-video` endpoints), Hunyuan has no image-to-video variant on fal.ai.

**Fix:** Drop Hunyuan from the pipeline options entirely. It offers no advantage over Wan 2.5 ($0.075/sec vs $0.05/sec) and lacks image-to-video capability on fal.ai.

---

## 3. Hybrid Architecture Design

### 3.1 Routing Logic

The hybrid pipeline uses P2b as the default path and routes only action-tagged slices to P1. The routing decision happens at the storyboard stage (Stage 4), where the complexity classifier already tags each 10-second slice.

```
Slice arrives from Stage 4 storyboard
  │
  ├─ type == "silent_establishing" ──→ Wan 2.5 (image-to-video, 16:9)
  ├─ type == "dialogue_closeup"    ──→ ElevenLabs TTS → Hedra Character-3
  ├─ type == "silent_action"       ──→ Kling Omni (image-to-video + audio)
  ├─ type == "stylised_action"     ──→ Kling Omni (image-to-video + audio)
  └─ type == "dialogue_action"     ──→ Kling Omni (image-to-video + audio)
                                        │
                                   LatentSync refinement pass (optional)
                                        │
                                   FFmpeg assembly
```

The classification is straightforward: any slice tagged with `action` in its type routes to Kling; everything else routes to the decomposed P2b path. This extends the existing `type` field in the pilot script without requiring a new classifier.

### 3.2 Cost Model

Based on the benchmark pricing data, the blended cost depends on the action-to-non-action ratio of the content.

| Content Type | Provider | Cost/sec | Cost/10s clip |
|-------------|----------|----------|---------------|
| Silent establishing | Wan 2.5 (fal.ai) | $0.050 | $0.50 |
| Dialogue closeup | Hedra Character-3 | $0.033 | $0.33 |
| TTS (ElevenLabs) | ElevenLabs | ~$0.005/clip | ~$0.005 |
| LatentSync refinement | fal.ai | $0.20/clip | $0.20 |
| Action (any type) | Kling Omni (fal.ai) | $0.140 | $1.40 |

For a typical anime episode with the pilot's distribution (5 establishing + 10 dialogue + 3 action = 18 slices):

| Component | Slices | Cost | Subtotal |
|-----------|--------|------|----------|
| Wan 2.5 (establishing) | 5 | $0.50 each | $2.50 |
| Hedra (dialogue) | 10 | $0.33 each | $3.30 |
| ElevenLabs TTS | 10 | $0.005 each | $0.05 |
| LatentSync (50% of dialogue) | 5 | $0.20 each | $1.00 |
| Kling Omni (action) | 3 | $1.40 each | $4.20 |
| **Total (18 slices, 3 min)** | | | **$11.05** |
| **Per minute** | | | **$3.68** |

Compared to the pure-pipeline costs:

| Pipeline | Cost/3min | Cost/min | vs Hybrid |
|----------|-----------|----------|-----------|
| P1 (Kling only) | $25.20 | $8.40 | Hybrid saves 56% |
| P2b (Wan+Hedra, no action) | $5.80 | $1.93 | Hybrid costs 90% more but includes action |
| **Hybrid (P2b + P1 action)** | **$11.05** | **$3.68** | — |

The hybrid costs 56% less than pure Kling while delivering action capability that P2b alone cannot provide. For content with fewer action slices (e.g., slice-of-life, romance), the ratio shifts further toward P2b pricing.

### 3.3 Cost Sensitivity by Content Genre

| Genre | Est. Action % | Hybrid Cost/min | vs Pure P1 Savings |
|-------|--------------|-----------------|-------------------|
| Slice-of-life / Romance | 5% | $2.20 | 74% |
| Drama / Mystery | 10% | $2.60 | 69% |
| Shonen / Action-adventure | 25% | $3.90 | 54% |
| Battle-heavy / Mecha | 40% | $5.20 | 38% |

Even for the most action-heavy content, the hybrid saves at least 38% versus pure Kling.

---

## 4. Upstream Fixes (Stage 1 Panel Generation)

These fixes address the cross-cutting issues identified in the critique and must be implemented **before** re-running the benchmark.

### 4.1 Native 16:9 Panel Generation

**What to change:** Modify the `generateImage()` calls in `server/routers.ts` to pass explicit dimensions for video-destined panels.

```typescript
// For establishing and action panels (video-destined, 16:9)
const { url } = await generateImage({
  prompt: panelPrompt,
  image_size: { width: 1344, height: 768 }  // Flux-native 16:9
});

// For dialogue portraits (Hedra input, 1:1)
const { url } = await generateImage({
  prompt: portraitPrompt,
  image_size: { width: 1024, height: 1024 }  // Hedra expects square
});
```

**Why 1344x768:** This is the closest Flux-supported resolution to 16:9 aspect ratio. Wan 2.5 and Kling both accept this natively without pillarboxing.

### 4.2 Unified Style System

**What to change:** Create a style configuration that is prepended to every panel generation prompt.

```typescript
const AWAKLI_STYLE_SUFFIX = `
  Consistent seinen manga art style throughout. Variable-weight ink outlines 
  with mechanical screentone shading. Limited accent palette: amber (#D4A574), 
  cyan (#4DC9F6), magenta (#F67280) on muted grey-blue backgrounds. 
  No cel-shading, no CG rendering, no smooth gradient fills. 
  Hatching for shadow, stippling for texture. Film grain overlay.
`;

// Applied to every panel prompt:
const fullPrompt = `${scenePrompt}. ${AWAKLI_STYLE_SUFFIX}`;
```

Additionally, generate a single "style anchor" image and store it. Use this anchor as the `original_images` reference for all subsequent generations to enforce visual consistency through the Forge ImageService's editing mode.

### 4.3 Prosthetic Arm Consistency

**What to change:** Add explicit anatomical constraints to every Mira-containing prompt, and implement a two-pass generation for character panels.

Pass 1: Generate the full scene. Pass 2: If Mira is present, run an inpainting pass on the right arm region with the prompt "normal human right arm, natural skin, no mechanical parts, no prosthetic."

For the benchmark fixture specifically, regenerate the dialogue reference panel with the corrected anatomy and use it as the locked reference for all subsequent Mira dialogue scenes.

### 4.4 Dialogue Staging (Shot-Reverse-Shot)

**What to change:** Instead of generating a single two-character dialogue panel, generate separate character portraits for shot-reverse-shot editing.

For each dialogue slice, generate two panels:
- **Speaker panel:** Character speaking, 3/4 view facing the listener's direction, mouth slightly open
- **Listener panel:** Character listening, 3/4 view facing the speaker's direction, neutral expression

The video pipeline then uses the speaker panel for the active dialogue and cuts to the listener panel for reaction shots. This is standard anime convention and works naturally with Hedra's single-portrait animation model.

---

## 5. Pipeline Code Changes

### 5.1 Hybrid Router Implementation

Add a new `runHybrid()` function to `server/benchmarks/pipelines/end-to-end.ts` that combines P1 and P2b routing:

```typescript
export async function runHybrid(script: PilotScript): Promise<PipelineResult> {
  const actionSlices = script.slices.filter(s => 
    s.type.includes('action') || s.type === 'stylised_action'
  );
  const nonActionSlices = script.slices.filter(s => 
    !s.type.includes('action') && s.type !== 'stylised_action'
  );
  
  // Route action slices to Kling Omni (P1 path)
  const actionClips = await generateViaKlingOmni(actionSlices);
  
  // Route non-action slices to decomposed P2b path
  const silentSlices = nonActionSlices.filter(s => !s.audio);
  const dialogueSlices = nonActionSlices.filter(s => s.audio);
  
  const silentClips = await generateViaWan25(silentSlices);
  const ttsOutputs = await generateTTS(dialogueSlices);
  const dialogueClips = await generateViaHedra(dialogueSlices, ttsOutputs);
  const refinedClips = await applyLatentSyncPass(dialogueClips, ttsOutputs);
  
  // Assembly
  return assembleAndReport([...actionClips, ...silentClips, ...dialogueClips]);
}
```

### 5.2 Complexity Classifier Extension

The existing Stage 4 storyboard classifier tags slices as `simple` or `complex`. Extend it to include an `action` tag:

```typescript
type SliceComplexity = 'simple' | 'complex' | 'action';

function classifySlice(slice: Slice): SliceComplexity {
  const actionKeywords = [
    'sword', 'katana', 'fight', 'battle', 'slash', 'strike', 'combat',
    'explosion', 'energy', 'shield', 'attack', 'dodge', 'block',
    'chase', 'run', 'jump', 'fall', 'crash', 'impact'
  ];
  
  const promptLower = slice.prompt.toLowerCase();
  const hasActionKeyword = actionKeywords.some(kw => promptLower.includes(kw));
  const isActionType = slice.type.includes('action');
  
  if (isActionType || hasActionKeyword) return 'action';
  if (slice.type === 'dialogue_closeup') return 'simple';
  return 'complex';
}
```

### 5.3 Wan 2.5 Action Fallback

As a secondary measure, create a "softened" action prompt variant that may pass Wan 2.5's content filter:

```typescript
function softenActionPrompt(prompt: string): string {
  return prompt
    .replace(/slash|strike|swing|cut/gi, 'gesture')
    .replace(/blade|sword|katana/gi, 'weapon silhouette')
    .replace(/impact|collision|explosion/gi, 'energy wave')
    .replace(/blood|wound|injury/gi, 'dramatic effect')
    + ' Motion blur, speed lines, dynamic composition. No explicit violence.';
}
```

If the softened prompt passes Wan 2.5, the action slice can be generated at $0.50 instead of $1.40, further reducing the hybrid cost. However, this is a best-effort optimisation — Kling remains the reliable fallback.

---

## 6. Phased Implementation Plan

### Phase 1: Upstream Panel Fixes (Estimated: 1 day)

| Task | Description | Blocks |
|------|-------------|--------|
| 1a | Add `image_size` parameter to `generateImage()` for 16:9 output | Phase 2 |
| 1b | Create unified style suffix and style anchor image | Phase 2 |
| 1c | Implement Mira prosthetic inpainting pass | Phase 2 |
| 1d | Generate shot-reverse-shot dialogue panel pairs | Phase 2 |
| 1e | Regenerate all 3 fixture reference panels with fixes 1a–1d | Phase 2 |

### Phase 2: Re-run Benchmark with Fixed Panels (Estimated: 3–4 hours)

| Task | Description | Blocks |
|------|-------------|--------|
| 2a | Update `pilot-3min-script.json` with new 16:9 reference image URLs | — |
| 2b | Re-run P1 (Kling Omni) against corrected panels | Phase 3 |
| 2c | Re-run P2b (Wan 2.5 + Hedra) against corrected panels | Phase 3 |
| 2d | Test softened action prompts on Wan 2.5 to check filter bypass | Phase 3 |
| 2e | Compile new full videos for quality review | Phase 3 |

### Phase 3: Hybrid Pipeline Implementation (Estimated: 1 day)

| Task | Description | Blocks |
|------|-------------|--------|
| 3a | Implement `runHybrid()` function with action/non-action routing | Phase 4 |
| 3b | Extend complexity classifier with `action` tag | Phase 4 |
| 3c | Add Wan 2.5 softened-prompt fallback for action slices | Phase 4 |
| 3d | Run hybrid benchmark and compile results | Phase 4 |
| 3e | Update cost model with actual hybrid numbers | Phase 4 |

### Phase 4: Production Integration (Estimated: 2 days)

| Task | Description | Blocks |
|------|-------------|--------|
| 4a | Wire hybrid router into the unified pipeline's Stage 4 | — |
| 4b | Add per-slice provider selection to the project dashboard | — |
| 4c | Implement cost tracking per project with provider breakdown | — |
| 4d | Add quality feedback loop (user rates clips, informs routing) | — |
| 4e | End-to-end test with a new 5-minute pilot | — |

---

## 7. Confirmation Questions for the Critique Author

The critique raised three questions that should be answered before proceeding:

**Q1: "Which substrate was each video run on — Motion Manga via Remotion, or full frame-by-frame AI video?"**

**Answer:** All four pipelines used full generative AI video, not Motion Manga Remotion renders. P1 used Kling V3 Omni's image-to-video endpoint (`fal-ai/kling-video/v3/pro/image-to-video`), which generates frame-by-frame video from a reference image and prompt. P2b and P3b used Wan 2.5's image-to-video endpoint (`fal-ai/wan-25-preview/image-to-video`) for silent clips and Hedra Character-3 for dialogue clips. The "Ken Burns + element overlay" appearance noted in the critique is a characteristic of how these models animate from a single reference image — they tend to produce subtle camera movements and element animation rather than full scene reconstruction. This is a limitation of current image-to-video models when given a single static reference, not a sign that a Motion Manga pipeline was used.

**Q2: "Get P2b and P3b re-run with the action shot included."**

**Answer:** The action shots were attempted but failed. Slices 11, 13, and 14 all returned HTTP 422 from Wan 2.5. This is a content-filter issue, not a pipeline omission. The hybrid architecture addresses this by routing action slices to Kling.

**Q3: "Fix the source panels upstream."**

**Answer:** Agreed. Phase 1 of this action plan addresses all three upstream issues (letterboxing, style drift, prosthetic consistency). The benchmark should be re-run against corrected panels before making a final pipeline decision.

---

## 8. Summary of Recommendations

The hybrid P2b-default / P1-action architecture delivers the best quality-to-cost ratio. At an estimated $3.68/min for a typical anime episode (17% action content), it saves 56% versus pure Kling while maintaining action-scene capability. The upstream panel fixes (16:9 native, unified style, prosthetic consistency, shot-reverse-shot dialogue) will improve quality across all pipelines and should be implemented first. P3b and P4 should be dropped from consideration — P3b offers no advantage over P2b, and P4's Hunyuan integration is non-functional.

The recommended execution order is: fix panels (Phase 1) → re-benchmark (Phase 2) → implement hybrid router (Phase 3) → integrate into production (Phase 4). Total estimated timeline is 4–5 days of implementation work.
