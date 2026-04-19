# P26 Character Bible & Spatial Consistency - Key Implementation Notes

## Five-Stage Pipeline
1. Character Bible Generator - LLM extraction + multi-view reference sheet
2. Identity Lock-in - IP-Adapter (Free) or TAMS LoRA training (Premium)
3. Shot Planner - OpenPose skeletons with height-ratio + depth maps
4. Panel Generation - Runware with ControlNet stack + character identity
5. Spatial QA Gate - Face similarity + height-ratio + style coherence

## Database: character_registries table
- story_id PK, registry_json JSONB, version INT, created_at TIMESTAMPTZ
- CharacterEntry: characterId, name, attributes (heightCm, build, ageBracket, hairColor, hairStyle, eyeColor, skinTone, distinguishingFeatures, defaultOutfit), identity (referenceSheetUrl, referenceSheetSeed, identityMode, ipAdapterRefUrl, loraUrl, loraWeight, faceEmbedding)

## Reference Sheet: 1536x1024, 3 poses (front T-pose, 3/4 relaxed, side left-facing)
- Generate 4 candidates, auto-select best
- Store face crops + ArcFace embedding

## IP-Adapter: weight 0.65, front-view face crop as guideImage
## LoRA Training: TAMS, 8-12 images, triggerWord awk_{charId}, 1200 steps

## Shot Planner:
- Height-ratio skeleton: scaleFactor = charHeight / tallestHeight
- Ground-plane anchor: all feet share same Y coordinate
- Depth map for Z-order
- Regional prompting for multi-character panels

## QA Gate Thresholds:
- Face similarity: >=0.75 pass, 0.60-0.75 soft fail (regen seed+1, 2 retries), <0.60 hard fail
- Height ratio: <=10% pass, 10-20% soft fail, >20% hard fail
- Regen budget: 3x base panel budget per scene

## Tasks (T1-T21): Sequential, see §12

## Draft vs Hero tiers:
- Draft: 25 steps, 768x1152, CFG 6.0, 1 result, ~2-3s/panel
- Hero: 40 steps, 1024x1536, CFG 7.5, 2 results, ~6-8s/panel

## Parallel batch dispatch for panels (collapses 180s serial to ~6s parallel)
