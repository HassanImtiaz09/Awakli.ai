# Prompt 23 — Tier Sampler Library & Expectation-Setting UX

## Core Concept
Curated pre-generated gallery of representative outputs at each quality tier for each scene type and voice provider. Surfaces at every quality-selection decision point. Captures expectation signal and measures post-generation satisfaction gap (ESG).

## Database Schema (4 new tables)

### tier_samples
- id (auto-increment PK), archetype_id (V01-V12 or A01-A08), modality (visual|audio), tier (1-5), provider, genre_variant (action|slice_of_life|atmospheric|neutral), outcome_class (success|partial_success|expected_failure), failure_mode (nullable), credits_consumed, storage_url, thumbnail_url (nullable), duration_ms (nullable), generation_seed, reviewed_by (JSON), published_at, staleness_score (0-1, default 0), is_active (default true)
- Indexes: (archetype_id, tier, is_active), (provider, is_active), (outcome_class)

### expectation_anchors
- id, pipeline_run_id (FK), scene_id (FK), creator_id (FK→users), anchored_sample_id (FK→tier_samples), anchored_tier, selected_tier (nullable), anchor_confidence (nullable 0-1), created_at

### esg_scores
- id, pipeline_run_id (FK), scene_id (FK), expectation_tier, actual_tier, expected_satisfaction, satisfaction_score (1-5), esg (computed gap), routing_action (none|monitor|investigate|act), created_at

### sampler_ab_assignments
- id, creator_id (FK, UNIQUE), cohort (control|sampler), enrolled_at, exited_at (nullable)

## Visual Scene Archetypes (12)
- V01: Dialogue close-up, V02: Dialogue two-shot, V03: Dialogue emotional
- V04: Action punch, V05: Action running, V06: Action multi-character combat
- V07: Establishing city, V08: Establishing natural
- V09: Reaction surprise, V10: Reaction subtle
- V11: Montage time-lapse, V12: Transition scene change

## Audio Line Archetypes (8)
- A01: Neutral, A02: Emotional sad, A03: Emotional angry, A04: Shouted
- A05: Whispered, A06: Narration, A07: Laughter, A08: Monotone

## ESG Metric
- ESG = expected_satisfaction - satisfaction_score
- ESG ≤ 0 → GOOD (met/exceeded), 0.1-0.5 → MONITOR, 0.5-1.5 → INVESTIGATE, >1.5 → ACT (proactive outreach)

## ESG Routing Actions
- ≤0: Log as success (analytics only)
- 0-0.5: Monthly trend report (Product + UX)
- 0.5-1.5: Flag for review, spot-check sample library (Governance)
- >1.5: Empathy message within 24h + credit refund option (Creator success team)

## UI Integration Points (4)
1. Scene Quality Tier Selection (Prompt 18) — horizontal strip beneath tier options, 3 samples per tier (2 success + 1 failure)
2. Voice Provider Selection — 3×3 grid: providers × quality levels, switchable archetypes A01-A08
3. Character LoRA Quality Tier (Prompt 21) — sample strips per LoRA rank (16/32/64)
4. Expectation Anchor Survey (Prompt 17 Stage 2 gate) — single-click "Which sample matches what you expect?"

## A/B Testing
- Control (20%): no sampler UI, Sampler (80%): full sampler UI
- Primary metrics: bad review rate (↓25%), support ticket rate (↓30%), regen rate (↓15%), avg ESG (↓0.3)
- Guardrails: activation rate (no >2% drop), time-to-first-output (no >30s added), anchor skip rate (<20%), tier 1 selection (>30%)

## Staleness Score
- staleness = min(1.0, 0.01 * days_since_pub + 0.3 * provider_version_gap + 0.2 * esg_drift)
- ≥0.7 → flagged for refresh, ≥0.9 → "Outdated" badge in UI

## Creator Expectation Report Card
- Personal ESG trend (30d/90d moving avg vs platform avg)
- Anchor histogram vs spend histogram
- Gap analysis with suggestions
- Top 3 exceeded / bottom 3 fell short scene types

## Governance Committee
- 3 seats: Product lead, UX lead, Skeptical engineer (rotates quarterly)
- Unanimous approval required, any single veto rejects
- Marketing has no seat/veto power

## Sample Generation Workflow (6 stages)
1. Batch Specification (216 samples per refresh: 144 visual + 72 audio)
2. Over-Generation (5-8 candidates per target)
3. Candidate Labeling (quality score, failure mode, representativeness)
4. Governance Review (verify representative, not cherry-picked)
5. Publication (staging → production, CDN invalidation)
6. Post-Publication Monitoring (30 days: click rate, anchor distribution, ESG trend)
