/**
 * shared/creditMath.ts — X4-F: Single source of truth for credit costs.
 *
 * Houses per-unit rates consumed by both the server-side cost engine
 * and the client-side useProjectCreditForecast hook.
 */

// ─── Per-unit credit rates ──────────────────────────────────────────────
export const CREDIT_RATES = {
  /** Credits per panel for motion animation */
  motionPerPanel: 12,
  /** Credits per second of voice narration */
  voicePerSecond: 4,
  /** Fixed credits for final video compose */
  compose: 6,
  /** Credits for script generation (per episode) */
  scriptGeneration: 2,
  /** Credits per panel generation */
  panelGeneration: 0.5,
  /** Credits for a single panel regeneration */
  panelRegen: 3,
  /** Credits for a scene regeneration */
  sceneRegen: 3,
  /** Credits for LoRA training */
  loraTraining: 120,
  /** Credits for voice clone training */
  voiceClone: 80,
  /** Credits for a redo of a single panel's motion */
  motionRedo: 18,
} as const;

// ─── Stage keys matching the pipeline order ─────────────────────────────
export const PIPELINE_STAGES = [
  "input",
  "script",
  "panels",
  "publish",
  "anime-gate",
  "setup",
  "video",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

// ─── Stage display labels ───────────────────────────────────────────────
export const STAGE_DISPLAY_LABELS: Record<PipelineStage, string> = {
  input: "Input",
  script: "Script",
  panels: "Panels",
  publish: "Publish",
  "anime-gate": "Gate",
  setup: "Setup",
  video: "Video",
};

// ─── Per-stage cost calculator ──────────────────────────────────────────
export interface ProjectParams {
  /** Number of panels in the project */
  panelCount: number;
  /** Total voice duration in seconds */
  voiceDurationSec: number;
  /** Total motion duration in seconds (sum of panel timings) */
  motionDurationSec: number;
  /** Whether LoRA training is included */
  hasLora: boolean;
  /** Whether voice clone training is included */
  hasVoiceClone: boolean;
  /** Number of scenes (for script cost) */
  sceneCount: number;
}

export interface StageCost {
  stage: PipelineStage;
  label: string;
  cost: number;
  isEstimate: boolean;
}

/**
 * Calculate per-stage credit costs for a project.
 * Returns an array of stage costs and a total.
 */
export function calculateProjectCosts(params: ProjectParams): {
  stages: StageCost[];
  total: number;
} {
  const {
    panelCount,
    voiceDurationSec,
    motionDurationSec,
    hasLora,
    hasVoiceClone,
    sceneCount,
  } = params;

  const stages: StageCost[] = [
    {
      stage: "input",
      label: "Input",
      cost: 0,
      isEstimate: false,
    },
    {
      stage: "script",
      label: "Script",
      cost: Math.max(1, Math.ceil(sceneCount * CREDIT_RATES.scriptGeneration)),
      isEstimate: sceneCount === 0,
    },
    {
      stage: "panels",
      label: "Panels",
      cost: Math.ceil(panelCount * CREDIT_RATES.panelGeneration),
      isEstimate: panelCount === 0,
    },
    {
      stage: "publish",
      label: "Publish",
      cost: 0,
      isEstimate: false,
    },
    {
      stage: "anime-gate",
      label: "Gate",
      cost: 0,
      isEstimate: false,
    },
    {
      stage: "setup",
      label: "Setup",
      cost: (hasLora ? CREDIT_RATES.loraTraining : 0) +
        (hasVoiceClone ? CREDIT_RATES.voiceClone : 0),
      isEstimate: false,
    },
    {
      stage: "video",
      label: "Video",
      cost:
        panelCount * CREDIT_RATES.motionPerPanel +
        Math.ceil(voiceDurationSec * CREDIT_RATES.voicePerSecond) +
        CREDIT_RATES.compose,
      isEstimate: panelCount === 0,
    },
  ];

  const total = stages.reduce((sum, s) => sum + s.cost, 0);
  return { stages, total };
}

/**
 * Default params for a fresh project with no data yet.
 */
export const DEFAULT_PROJECT_PARAMS: ProjectParams = {
  panelCount: 20,
  voiceDurationSec: 0,
  motionDurationSec: 0,
  hasLora: false,
  hasVoiceClone: false,
  sceneCount: 5,
};
