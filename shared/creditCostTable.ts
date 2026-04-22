/**
 * shared/creditCostTable.ts — X4: Single source of truth for credit costs.
 *
 * Every cost displayed in the UI, charged in the backend, or shown in the
 * credit meter forecast comes from this file.
 *
 * Unit costs are in credits (1 credit ≈ $0.10 at Spark pack rate).
 */

// ─── Unit Costs (credits) ───────────────────────────────────────────────────
export const UNIT_COSTS = {
  // Panel generation
  panel_gen:         6,    // ~$0.06 — one AI-generated manga panel
  panel_regen:       3,    // ~$0.03 — redraw a single panel
  scene_regen:       3,    // ~$0.03 — regenerate one scene's script

  // Script
  script_gen:        2,    // ~$0.02 — generate full script from synopsis (flat)

  // LoRA training
  lora_appearance:   120,  // ~$1.20 — train appearance LoRA
  lora_motion:       120,  // ~$1.20 — train motion LoRA

  // Voice
  voice_clone:       80,   // ~$0.80 — clone a voice (one-time)
  voice_line:        6,    // ~$0.06 — generate one voiced line (UserVoiceOverlay)

  // Video / motion
  video_motion:      12,   // ~$0.12 — animate one panel (motion generation)
  video_music:       8,    // ~$0.08 — generate background music track

  // Post-processing
  pose_regen:        2,    // ~$0.02 — regenerate a pose reference sheet

  // Export surcharges (Studio+ only)
  export_4k:         0,    // included in Studio tier — 30% more render time
  export_prores:     0,    // included in Studio tier — 60% more render time
  export_stems:      0,    // included in Studio tier — 20% more render time
} as const;

export type CostKey = keyof typeof UNIT_COSTS;

// ─── Stage Cost Breakdown ───────────────────────────────────────────────────
// Maps each pipeline stage to the unit costs it consumes.
// Used by the credit meter to show per-stage forecasts.
export const STAGE_COST_KEYS: Record<string, CostKey[]> = {
  input:    [],                                          // free
  script:   ["script_gen"],                              // flat 2c
  panels:   ["panel_gen", "panel_regen"],                // per-panel + regens
  publish:  [],                                          // free
  gate:     [],                                          // upsell, no cost
  setup:    ["lora_appearance", "voice_clone", "pose_regen"],
  video:    ["video_motion", "voice_line", "video_music"],
};

// ─── Forecast Engine ────────────────────────────────────────────────────────

export interface ProjectForecastInputs {
  panelCount: number;       // total panels in the episode
  regenRate?: number;       // expected regen fraction (default 0.15 = 15%)
  sceneCount?: number;      // number of scenes (default panelCount / 4)
  sceneRegenRate?: number;  // scene regen fraction (default 0.10)
  chapters?: number;        // for video: number of chapters (default 1)
  videoDurationSec?: number; // total video duration in seconds
  voiceLineCount?: number;  // number of voiced lines
  hasLoRA?: boolean;        // whether LoRA training is included
  hasVoiceClone?: boolean;  // whether voice cloning is included
  hasMusicGen?: boolean;    // whether music generation is included
}

export interface ForecastResult {
  /** Total estimated credits for the project */
  total: number;
  /** Per-stage breakdown */
  stages: {
    input: number;
    script: number;
    panels: number;
    publish: number;
    gate: number;
    setup: number;
    video: number;
  };
  /** Itemized line items for the credit meter tooltip */
  lineItems: { label: string; cost: number; quantity: number; subtotal: number }[];
}

/**
 * Compute a dynamic credit forecast from project inputs.
 *
 * Example: 20-panel Apprentice project ≈ 120–180 credits.
 *   - Script: 2c
 *   - Panels: 20 × 6c = 120c
 *   - Regens: 20 × 0.15 × 3c = 9c
 *   - Total: ~131c (without anime path)
 */
export function forecastCredits(inputs: ProjectForecastInputs): ForecastResult {
  const {
    panelCount,
    regenRate = 0.15,
    sceneCount = Math.ceil(panelCount / 4),
    sceneRegenRate = 0.10,
    chapters = 1,
    videoDurationSec,
    voiceLineCount = 0,
    hasLoRA = false,
    hasVoiceClone = false,
    hasMusicGen = false,
  } = inputs;

  const lineItems: ForecastResult["lineItems"] = [];
  const stages: ForecastResult["stages"] = {
    input: 0, script: 0, panels: 0, publish: 0, gate: 0, setup: 0, video: 0,
  };

  // ── Script stage ──
  const scriptCost = UNIT_COSTS.script_gen;
  stages.script += scriptCost;
  lineItems.push({ label: "Script generation", cost: UNIT_COSTS.script_gen, quantity: 1, subtotal: scriptCost });

  const sceneRegens = Math.ceil(sceneCount * sceneRegenRate);
  if (sceneRegens > 0) {
    const sceneRegenCost = sceneRegens * UNIT_COSTS.scene_regen;
    stages.script += sceneRegenCost;
    lineItems.push({ label: "Scene regenerations", cost: UNIT_COSTS.scene_regen, quantity: sceneRegens, subtotal: sceneRegenCost });
  }

  // ── Panels stage ──
  const panelGenCost = panelCount * UNIT_COSTS.panel_gen;
  stages.panels += panelGenCost;
  lineItems.push({ label: "Panel generation", cost: UNIT_COSTS.panel_gen, quantity: panelCount, subtotal: panelGenCost });

  const panelRegens = Math.ceil(panelCount * regenRate);
  if (panelRegens > 0) {
    const panelRegenCost = panelRegens * UNIT_COSTS.panel_regen;
    stages.panels += panelRegenCost;
    lineItems.push({ label: "Panel regenerations", cost: UNIT_COSTS.panel_regen, quantity: panelRegens, subtotal: panelRegenCost });
  }

  // ── Setup stage (paid path) ──
  if (hasLoRA) {
    stages.setup += UNIT_COSTS.lora_appearance;
    lineItems.push({ label: "LoRA training", cost: UNIT_COSTS.lora_appearance, quantity: 1, subtotal: UNIT_COSTS.lora_appearance });
  }
  if (hasVoiceClone) {
    stages.setup += UNIT_COSTS.voice_clone;
    lineItems.push({ label: "Voice cloning", cost: UNIT_COSTS.voice_clone, quantity: 1, subtotal: UNIT_COSTS.voice_clone });
  }

  // ── Video stage (paid path) ──
  if (videoDurationSec && videoDurationSec > 0) {
    // Motion: one cost per panel being animated
    const motionCost = panelCount * UNIT_COSTS.video_motion;
    stages.video += motionCost;
    lineItems.push({ label: "Panel motion", cost: UNIT_COSTS.video_motion, quantity: panelCount, subtotal: motionCost });
  }

  if (voiceLineCount > 0) {
    const voiceCost = voiceLineCount * UNIT_COSTS.voice_line;
    stages.video += voiceCost;
    lineItems.push({ label: "Voice lines", cost: UNIT_COSTS.voice_line, quantity: voiceLineCount, subtotal: voiceCost });
  }

  if (hasMusicGen) {
    const musicCost = chapters * UNIT_COSTS.video_music;
    stages.video += musicCost;
    lineItems.push({ label: "Music generation", cost: UNIT_COSTS.video_music, quantity: chapters, subtotal: musicCost });
  }

  const total = Object.values(stages).reduce((sum, v) => sum + v, 0);

  return { total, stages, lineItems };
}

/**
 * Quick estimate for the credit meter sidebar.
 * Returns a [min, max] range based on typical regen rates.
 */
export function quickEstimate(panelCount: number, includeAnime = false): [number, number] {
  const low = forecastCredits({
    panelCount,
    regenRate: 0.10,
    sceneRegenRate: 0.05,
    videoDurationSec: includeAnime ? panelCount * 3 : 0,
    voiceLineCount: includeAnime ? Math.ceil(panelCount * 0.5) : 0,
    hasMusicGen: includeAnime,
  });
  const high = forecastCredits({
    panelCount,
    regenRate: 0.25,
    sceneRegenRate: 0.15,
    videoDurationSec: includeAnime ? panelCount * 5 : 0,
    voiceLineCount: includeAnime ? panelCount : 0,
    hasLoRA: includeAnime,
    hasVoiceClone: includeAnime,
    hasMusicGen: includeAnime,
  });
  return [low.total, high.total];
}
