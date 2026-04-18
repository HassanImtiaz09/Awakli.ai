# Motion LoRA v1.1 Changes Summary

## Key v1.1 Revisions from v1.0

### 1. Runway Gen-3 Act-One → Act-Two
- All references updated from Act-One to Act-Two
- Act-Two is the current Runway API endpoint (5 credits/sec)
- Standard Runway developer API key covers Act-Two

### 2. Wan 2.6 via fal.ai Integration
- Wan 2.6 routing explicitly uses existing fal.ai integration
- Pricing: $0.10/sec (720p), $0.15/sec (1080p), ~$0.05/sec Flash
- Much cheaper than earlier $0.45/sec estimate
- No additional provider onboarding required
- Training runs on Awakli's GPU harness; only inference touches fal.ai

### 3. Provider Compatibility Table Update
- AnimateDiff v3 + SDXL: Native support (Standard, Premium)
- Wan 2.6 (open weights): Via adapter fork, Premium
- HunyuanVideo: Native (HunyuanMotionLoRA), Premium
- Kling 2.6 API: No support (closed model)
- Runway Gen-3 Act-Two: Partial (character-performance alternative), 5 credits/sec
- Sora / Veo 3: No support (closed model)

### 4. Tier Gating Policy (Section 6.2)
- Free: No motion LoRA
- Starter: Motion-comic only, no motion LoRA
- Standard: Appearance LoRA only, motion LoRA OFF
- Premium: Appearance + motion LoRA stacked
- Flagship: All LoRAs stacked (appearance + motion + environment + style)

### 5. Wan 2.6 Training Config (Section 4.2)
- Serving target: fal-ai/wan-pro (motion_lora parameter on request)
- Training artifact uploaded to Awakli asset bucket
- Referenced from fal.ai inference via motion_lora URL parameter

## Implementation Tasks to Update

### Already implemented (check for v1.1 alignment):
- TASK-1 through TASK-5: Infrastructure
- TASK-14: UI exposure
- Training configs (Sections 4.1, 4.2)
- Evaluation gates M1-M14
- Scene-type router weights
- Tier gating
- Provider routing

### Changes needed:
1. Update provider table: Runway Act-One → Act-Two references
2. Update Wan 2.6 cost estimates to fal.ai pricing ($0.10-0.15/sec)
3. Add fal.ai integration details to Wan training/inference path
4. Update provider routing to reference Act-Two instead of Act-One
5. Add Flagship tier to tier gating (all 4 LoRAs stacked)
6. Update cost calculations with new fal.ai pricing
