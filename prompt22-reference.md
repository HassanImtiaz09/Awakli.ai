# Prompt 22 — Lineart Extraction & ControlNet Conditioning Pipeline Reference

## Database Schema

### Table: lineart_assets
- id (auto-increment PK)
- episodeId (FK episodes)
- sceneId (FK scenes)
- panelIndex (integer, 0-based)
- extractionMethod ('canny' | 'anime2sketch')
- storageUrl (text, S3 path to PNG)
- sourcePanelUrl (text, original manga panel)
- resolutionW (integer)
- resolutionH (integer)
- version (integer, default 1)
- snrDb (decimal nullable, signal-to-noise quality metric)
- isActive (boolean, default true)
- createdAt (timestamp)
- Unique index: (episodeId, sceneId, panelIndex) WHERE isActive=true

### Table: controlnet_configs
- id (auto-increment PK)
- userId (FK users — mapped from studio_id concept)
- sceneType ('dialogue'|'action'|'establishing'|'reaction'|'montage'|'transition')
- controlnetMode ('canny'|'lineart'|'lineart_anime'|'depth') default 'lineart_anime'
- conditioningStrength (decimal 0.0-1.0)
- extractionMethod ('canny'|'anime2sketch') default 'anime2sketch'
- isDefault (boolean, default true)
- createdAt, updatedAt (timestamps)
- Unique: (userId, sceneType) WHERE isDefault=true

### Table: lineart_batch_jobs
- id (auto-increment PK)
- episodeId (FK episodes)
- totalPanels (integer)
- completedPanels (integer, default 0)
- failedPanels (integer, default 0)
- extractionMethod (text)
- status ('queued'|'running'|'completed'|'failed') default 'queued'
- startedAt (timestamp nullable)
- completedAt (timestamp nullable)
- costCredits (decimal, default 0)
- errorLog (JSON, array of {panelIndex, errorMessage})

## Default Conditioning Strength per Scene Type
| Scene Type   | Default Mode    | Default Strength | Extraction Method |
|-------------|-----------------|------------------|-------------------|
| dialogue    | lineart_anime   | 0.50             | anime2sketch      |
| action      | lineart_anime   | 0.80             | canny             |
| establishing| lineart_anime   | 0.70             | canny             |
| reaction    | lineart_anime   | 0.60             | anime2sketch      |
| montage     | lineart_anime   | 0.40             | anime2sketch      |
| transition  | canny           | 0.30             | canny             |

## Lineart Extraction Pipeline (5 Stages)
1. Panel Isolation — grayscale, bilateral filter, Canny edge (30,200), contour detection, crop panels
2. Text/Bubble Removal — PaddleOCR bounding boxes, contour detection for bubbles, expand 5px, inpaint (Navier-Stokes, radius=5)
3. Lineart Extraction — Canny (grayscale, Gaussian blur 5x5 sigma 1.0, thresholds 50/150) OR Anime2Sketch (768x768 or 1024x1024, GPU)
4. Line Cleanup — morphological erosion/dilation (1px), skeletonization (Canny only), closing (3x3), connected component filtering (<10px)
5. Resolution Matching — Lanczos resampling to target resolution (512/768/1024)

## ControlNet Modes
- Canny: hard edges, strict structural adherence
- Lineart: soft edges (Canny + Gaussian blur sigma=2.0), moderate guidance
- Lineart_anime: Anime2Sketch output, anime-optimized (DEFAULT)
- Depth: MiDaS depth maps (V2 planned, out of scope)

## Conditioning Strength Ranges
- 0.3-0.5: Loose guidance (montage, creative)
- 0.5-0.7: Moderate control (dialogue, reaction)
- 0.7-0.8: Tight control (action, establishing)
- 0.9-1.0: Strict adherence (architectural detail)

## Structural Fidelity Measurement
- SSIM comparison: lineart vs generated frame edges
- Edge overlap %: (matching edge pixels / total lineart pixels) * 100
- Quality thresholds: SSIM ≥0.65 pass, 0.50-0.65 review, <0.50 fail
- Edge overlap: ≥40% pass, 25-40% review, <25% fail
- SSIM improvement (cond vs uncond): ≥0.10 pass, 0.05-0.10 review, <0.05 fail

## Creator Controls (Frontend)
1. Lineart Preview Overlay — side-by-side original panel + lineart, 50% opacity overlay toggle
2. Conditioning Strength Slider — 0.0-1.0, step 0.05, tooltip with adherence level
3. ControlNet Mode Selector — Studio/Enterprise only, visual comparison
4. Test Image Generation — 512x512 preview, <0.5 credits, <30 seconds
5. Extraction Method Override — per scene, triggers re-extraction

## Batch Processing
- 50 panels: Canny <30s, Anime2Sketch 3-5min, Mixed 2-4min
- Cost: Canny $0, Anime2Sketch $0.50-1.00, Mixed $0.30-0.60
- Up to 10 concurrent GPU workers

## Integration Points
- Dialogue inpainting: lineart guides base frame at 0.5, no ControlNet on inpainting pass
- Action: AnimateDiff with lineart_anime at 0.8 on keyframe
- Establishing: hero image at 0.7, then Ken Burns animation
- Reaction: cached base frame already conditioned, expression overlays only
- Montage: per-panel lineart at 0.4 for creative variation
- LoRA + ControlNet co-injection: simultaneous, complementary (identity + layout)
