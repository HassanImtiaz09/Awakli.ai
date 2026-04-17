# Prompt 21 — Key Notes (Pages 11-15)

## 10. LoRA Versioning & Lifecycle

### 10.1 Version lifecycle states
| State | Meaning | Transition |
|---|---|---|
| training | LoRA is being trained | → validating (on completion), → failed (on error) |
| validating | Quality check in progress | → active (auto-approve), → review (manual check), → failed (auto-reject) |
| active | In use for generation | → deprecated (when new version trained) |
| deprecated | Replaced by newer version | Auto-deleted after 30 days |
| failed | Training or validation failed | Creator notified; can retry with updated sheet |

### 10.2 Version pinning
- pipeline_run snapshots active LoRA version for each character at start
- Stored in pipeline_run_lora_pins table
- Even if new LoRA trained mid-episode, in-progress pipeline uses pinned version

```sql
CREATE TABLE pipeline_run_lora_pins (
  pipeline_run_id uuid NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES character_library(id),
  lora_id uuid NOT NULL REFERENCES character_loras(id),
  pinned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pipeline_run_id, character_id)
);
```

### 10.3 Retraining trigger
- When creator modifies character sheet, system detects change (CLIP similarity < 0.90 between old and new)
- Prompts: 'Character sheet updated. Retrain LoRA? Estimated cost: X credits.'
- On confirmation, new training job at priority 1, old LoRA continues serving until new one validated

## 11. Creator-Facing Character Management UI

### 11.1 Character library view (/characters)
- Grid of character cards: portrait thumbnail, name, series, LoRA status badge
- Color-coded: green=active, yellow=training, red=failed, gray=untrained
- Filter by series, sort by name or last used
- 'Add Character' button → upload reference sheet → auto-extract views → save
- 'Batch Train' button for selected characters

### 11.2 Character detail view (/characters/:id)
- Reference images gallery (front, side, back, expressions)
- LoRA section: current version, quality score, CLIP similarity, file size, training date
- 'View' expands to show 5 validation images side by side with reference
- Version history: table of all versions with score, status, creation date. Can rollback.
- Usage stats: how many times character was generated, in how many episodes, avg quality score
- 'Retrain LoRA' button with cost estimate
- 'Delete Character' (removes from library, deprecates LoRA, doesn't affect published episodes)

## 12. Testing Requirements

### 12.1 Unit tests
- Preprocessing: reference images correctly cropped, resized, captioned
- Training config builder produces correct Kohya SS arguments
- Quality validation: CLIP similarity computation returns expected scores
- Version pinning: pipeline_run uses pinned LoRA even after newer version activated

### 12.2 Integration tests
- End-to-end: upload reference sheet → approve at Stage 3 → training starts → validates → marks active
- LoRA injection: generate 10 images with trained LoRA via local_animatediff, verify CLIP > 0.80
- IP-Adapter fallback: request via Kling (no LoRA support), verify IP-Adapter used
- Batch training: queue 8 characters, verify priority ordering, progress tracking, all complete within budget
- Retraining: update character sheet, trigger retrain, verify old LoRA stays active until new validates

### 12.3 Performance tests
- Training completes in < 45 minutes on H100 for 800 steps, rank 32
- LoRA file size < 500MB for rank 64
- Runtime LoRA merge adds < 3 seconds to inference on warm instance

## 13. Deliverables
1. Database migration: character_library, character_loras, lora_training_jobs, character_assets, pipeline_run_lora_pins. ALTER on generation_requests.
2. Training Docker image (awakli/lora-trainer) with Kohya SS / sd-scripts, deployed to RunPod.
3. Training job scheduler with priority queue and inference-aware GPU sharing.
4. Preprocessing pipeline (crop, resize, caption, rembg background removal).
5. Quality validation service using CLIP inference.
6. LoRA injection logic in local_animatediff and local_controlnet adapters.
7. IP-Adapter fallback logic in the executor layer.
8. Creator character library UI (list view, detail view, batch training).
9. Version pinning and lifecycle management.
10. Retraining trigger with change detection.
11. Unit, integration, and performance test suites.

## 15. Implementation Notes for Manus

### 15.1 Build order
1. Database migration and seed data.
2. Character library UI with mock data. Commit and pause for review.
3. Training Docker image with Kohya SS. Test locally before deploying to RunPod.
4. Preprocessing pipeline and training job scheduler.
5. End-to-end training: trigger from approved character sheet → LoRA produced. Commit and pause for review.
6. Quality validation with CLIP.
7. LoRA injection into local_animatediff and local_controlnet.
8. IP-Adapter fallback.
9. Batch training.
10. Version pinning and retraining trigger.
11. Full test suite.

Review checkpoints: after step 2 (UI), after step 5 (training works), after step 11 (complete).

### 15.2 Do NOT do these things
- Do not train on full-size reference images. Always preprocess to 512x512 first.
- Do not use rank > 64. Higher ranks overfit on 4-8 training images.
- Do not skip the trigger word. Without it, LoRA concept bleeds into all generated content.
- Do not block inference GPU workers for training. Training must yield to inference demand.
- Do not delete deprecated LoRA versions immediately. Retain for 30 days for rollback.

## 16. Acceptance Criteria
1. Approving character sheet at Stage 3 auto-enqueues LoRA training within 10 seconds.
2. Training completes in < 45 minutes on H100 (800 steps, rank 32).
3. Output .safetensors < 200MB for rank 32, < 500MB for rank 64.
4. Quality validation generates 5 test images and computes CLIP scores within 2 minutes.
5. Auto-approve for avg CLIP > 0.85. Creator sees 'Character ready.'
6. Manual review for 0.75-0.85: creator sees test images vs reference, can approve/reject.
7. LoRA injection in local_animatediff produces 10 diverse images all with CLIP > 0.80.
8. IP-Adapter fallback activates for external APIs, produces similarity > 0.70.
9. Batch training of 8 characters within 6 hours and < $40 total.
10. Version pinning: mid-episode LoRA update doesn't affect running pipeline.
11. Retraining trigger fires when character sheet CLIP delta > 0.10.
12. GPU usage accurately logged and billed via credit ledger.
13. Character library UI responsive and functional on mobile (375px).
