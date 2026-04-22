# Appendix Audit Checklist

## Tier Mapping
- free_trial = Apprentice
- creator = Mangaka  
- creator_pro = Studio
- studio = Studio Pro
- enterprise = Enterprise

## Appendix A — Tier Capability Matrix

| Capability | Spec Min Tier | Code Min Tier | Match? |
|---|---|---|---|
| Idea-to-script (S0) | Apprentice (free_trial) | ai_script_generation: free_trial | YES |
| Upload manga/webtoon (S0-B) | Mangaka (creator) | Need to check | ? |
| Character reference uploads (S0-C) | Studio (creator_pro) | character_foundation: creator_pro | YES |
| Script regeneration (S1) | Apprentice 3/proj, Mangaka 15, Studio unlimited | scriptSceneService REGEN_LIMITS | FIXED |
| Panel batch ops (S2-B) | Mangaka (creator) | batch_generation: creator | YES (FIXED) |
| Consistency auto-correct (S2-B) | Studio Pro only (studio) | Need to check | ? |
| Watermark off (S3) | Mangaka (creator) | Need to check | ? |
| Custom domain & RSS (S3) | Studio (creator_pro) | Need to check | ? |
| Anime gate pass-through (S4-B) | Mangaka (creator) | stage_anime_gate: creator | YES |
| Pose regen (S5-A) | Mangaka (creator) | Need to check | ? |
| LoRA training (S5-B) | Studio (creator_pro) | custom_lora_training: creator_pro | YES |
| Voice cloning (S5-B) | Studio (creator_pro) | voice_cloning: creator_pro | YES |
| User-voice overlay (S5-B) | Studio (creator_pro) | Need to check | ? |
| Video runtime cap (S6) | Mangaka 60s, Studio 12min, SP 24min | Need to check | ? |
| 4K / ProRes export (S6-B) | Studio (creator_pro) | hd_export: creator_pro | YES |
| Separated stems (S6-B) | Studio (creator_pro) | Need to check | ? |

## Appendix B — Analytics Events

| Event | Spec | Code | Match? |
|---|---|---|---|
| wizard_stage_enter | User enters any /create/* route | CreateWizardLayout.tsx | ADDED |
| credits_forecast_exceeds | Forecast exceeds balance | DurationForecast.tsx | ADDED |
| tier_gate_shown | withTier soft-deny renders | Need to check | ? |
| upgrade_modal_open | UpgradeModal opens | Need to check | ? |
| stage0_idea_submit | User clicks Summon script | Need to check | ? |
| stage1_scene_regen | Per-scene regen confirmed | Need to check | ? |
| stage2_panel_regen | Per-panel regen confirmed | Need to check | ? |
| stage3_publish_complete | Episode live at /m/{slug} | Need to check | ? |
| stage4_checkout_opened | Stripe tab opens | Need to check | ? |
| stage5_lora_ready | LoRA training completes | Need to check | ? |
| stage6_render_complete | Video render finished | Need to check | ? |

## Appendix C — Token Reference

| Token | Spec Value | Code Value | Match? |
|---|---|---|---|
| colors.cyan | #00F0FF | #00F0FF | YES |
| colors.violet | #6B5BFF | #6B5BFF | YES |
| colors.lavender | #B388FF | #B388FF | YES |
| colors.gold | #FFD60A | #FFD60A | YES |
| colors.magenta | #FF2D7A | #FF2D7A | YES |
| colors.mint | #00E5A0 | #00E5A0 | YES |
| colors.ink | #0B0B18 | #0B0B18 | YES |
| colors.paper | #F7F7FB | #F7F7FB | YES |
| radii.chip | 14px | 14px | YES |
| radii.card | 28px | 28px | YES |
| radii.sheet | 36px | 36px | YES |
| radii.sigil | 9999px | 9999px | FIXED |
| type.display-hero | 72/80 | 72px/80px | YES |
| type.display-md | 56/64 | 56px/64px | YES |
| type.h1 | 40/48 | 40px/48px | YES |
| type.h2 | 28/36 | 28px/36px | YES |
| type.body | 16/26 | 16px/26px | YES |
| type.micro | 12/16 | 12px/16px | YES |
| shadow.rest | 0 1px 2px rgba(11,11,24,0.08) | 0 1px 2px rgba(11, 11, 24, 0.08) | YES |
| shadow.hover | 0 6px 24px rgba(107,91,255,0.20) | 0 6px 24px rgba(107, 91, 255, 0.20) | YES |
| shadow.active | 0 10px 36px rgba(107,91,255,0.30) | 0 10px 36px rgba(107, 91, 255, 0.30) | YES |
