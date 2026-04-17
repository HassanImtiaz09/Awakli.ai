/**
 * Prompt 20 — Pipeline Template Definitions & Seed Data
 *
 * 6 pipeline templates, one per scene type, with provider hints,
 * stage skip configs, and cost estimates.
 */

import type { SceneType, InsertPipelineTemplate } from "../../drizzle/schema";

// ─── Stage Config Types ─────────────────────────────────────────────────

export interface PipelineStageConfig {
  stageNumber: number;
  stageName: string;
  description: string;
  isReplaced?: boolean;  // true if this stage is replaced by a sub-pipeline
  replacedBy?: string;   // name of the sub-pipeline that replaces this stage
}

export interface ProviderHint {
  stageNumber: number;
  providers: string[];   // ordered preference list
  strictness: "preferred" | "required" | "skip";
}

// ─── Pipeline Template Data ─────────────────────────────────────────────

export interface PipelineTemplateData {
  id: string;
  sceneType: SceneType;
  displayName: string;
  stages: PipelineStageConfig[];
  preferredProviders: ProviderHint[];
  skipStages: number[];
  estimatedCreditsPerTenS: string;  // decimal string
}

// ─── Template Definitions ───────────────────────────────────────────────

export const DIALOGUE_INPAINT_TEMPLATE: PipelineTemplateData = {
  id: "dialogue_inpaint",
  sceneType: "dialogue",
  displayName: "Dialogue (Inpainting Pipeline)",
  stages: [
    { stageNumber: 1, stageName: "Script Analysis", description: "Parse dialogue timing and character positions" },
    { stageNumber: 2, stageName: "Scene Planning", description: "Determine camera angles and character layout" },
    { stageNumber: 3, stageName: "Base Frame Generation", description: "Generate one frame per camera angle" },
    { stageNumber: 4, stageName: "Face Landmark Detection", description: "Extract mouth, eye, and head regions" },
    { stageNumber: 5, stageName: "Viseme Inpainting", description: "Inpaint mouth region per viseme at 8fps", isReplaced: true, replacedBy: "dialogue_inpaint_sub" },
    { stageNumber: 6, stageName: "Voice Synthesis", description: "Generate voice audio for dialogue lines" },
    { stageNumber: 7, stageName: "Blink & Head Motion", description: "Apply eye blinks and head bobbing overlays" },
    { stageNumber: 8, stageName: "RIFE Interpolation", description: "Interpolate 8fps to 24fps" },
    { stageNumber: 9, stageName: "Assembly", description: "Composite all layers into final video" },
  ],
  preferredProviders: [
    { stageNumber: 3, providers: ["local_controlnet", "local_ip_adapter"], strictness: "preferred" },
    { stageNumber: 5, providers: ["local_controlnet"], strictness: "preferred" },
    { stageNumber: 8, providers: ["local_rife"], strictness: "preferred" },
  ],
  skipStages: [],  // Stage 5 is replaced, not skipped
  estimatedCreditsPerTenS: "0.0700",
};

export const ACTION_PREMIUM_TEMPLATE: PipelineTemplateData = {
  id: "action_premium",
  sceneType: "action",
  displayName: "Action (Premium Video)",
  stages: [
    { stageNumber: 1, stageName: "Script Analysis", description: "Identify action beats and keyframes" },
    { stageNumber: 2, stageName: "Scene Planning", description: "Plan camera movements and action choreography" },
    { stageNumber: 3, stageName: "Keyframe Generation", description: "Generate keyframes at action beats" },
    { stageNumber: 4, stageName: "Image Upscaling", description: "Upscale keyframes for video input" },
    { stageNumber: 5, stageName: "Video Generation", description: "Premium video between keyframes" },
    { stageNumber: 6, stageName: "Voice Synthesis", description: "Generate voice audio" },
    { stageNumber: 7, stageName: "SFX & Music", description: "Add sound effects and background music" },
    { stageNumber: 8, stageName: "RIFE Interpolation", description: "Interpolate to 24fps" },
    { stageNumber: 9, stageName: "Upscale & Assembly", description: "Final upscale and composite" },
  ],
  preferredProviders: [
    { stageNumber: 3, providers: ["local_controlnet", "local_ip_adapter"], strictness: "preferred" },
    { stageNumber: 5, providers: ["kling_26", "kling_3_omni"], strictness: "preferred" },
    { stageNumber: 8, providers: ["local_rife"], strictness: "preferred" },
    { stageNumber: 9, providers: ["local_realesrgan"], strictness: "preferred" },
  ],
  skipStages: [],  // Full pipeline, no stages skipped
  estimatedCreditsPerTenS: "3.5400",
};

export const ESTABLISHING_KEN_BURNS_TEMPLATE: PipelineTemplateData = {
  id: "establishing_ken_burns",
  sceneType: "establishing",
  displayName: "Establishing (Ken Burns Effect)",
  stages: [
    { stageNumber: 1, stageName: "Script Analysis", description: "Identify establishing shot context" },
    { stageNumber: 2, stageName: "Scene Planning", description: "Select Ken Burns movement type" },
    { stageNumber: 3, stageName: "Image Generation", description: "Generate one 2048x2048 establishing image" },
    { stageNumber: 4, stageName: "Ken Burns Effect", description: "Apply pan/zoom via affine transforms" },
    { stageNumber: 9, stageName: "Assembly", description: "Export as video via ffmpeg" },
  ],
  preferredProviders: [
    { stageNumber: 3, providers: ["flux_11_pro", "local_controlnet"], strictness: "preferred" },
  ],
  skipStages: [5, 6, 7, 8],  // Skip Video Gen, Voice, SFX, Interpolation
  estimatedCreditsPerTenS: "0.0550",
};

export const TRANSITION_RULE_BASED_TEMPLATE: PipelineTemplateData = {
  id: "transition_rule_based",
  sceneType: "transition",
  displayName: "Transition (Rule-Based Compositing)",
  stages: [
    { stageNumber: 1, stageName: "Transition Selection", description: "Select transition type from scene context" },
    { stageNumber: 9, stageName: "Compositing", description: "Apply transition via ffmpeg/canvas" },
  ],
  preferredProviders: [],  // No AI providers needed
  skipStages: [2, 3, 4, 5, 6, 7, 8],  // Skip all AI stages
  estimatedCreditsPerTenS: "0.0000",
};

export const REACTION_CACHED_TEMPLATE: PipelineTemplateData = {
  id: "reaction_cached",
  sceneType: "reaction",
  displayName: "Reaction (Cached Shots)",
  stages: [
    { stageNumber: 1, stageName: "Cache Lookup", description: "Check reaction cache for character+emotion+angle" },
    { stageNumber: 3, stageName: "Image Generation", description: "Generate base frame on cache miss" },
    { stageNumber: 5, stageName: "Video Generation", description: "Generate 2-3s clip on cache miss" },
    { stageNumber: 8, stageName: "RIFE Interpolation", description: "Interpolate to 24fps on cache miss" },
    { stageNumber: 9, stageName: "Assembly & Cache Store", description: "Composite and store in cache" },
  ],
  preferredProviders: [
    { stageNumber: 3, providers: ["local_ip_adapter"], strictness: "preferred" },
    { stageNumber: 5, providers: ["local_animatediff"], strictness: "preferred" },
    { stageNumber: 8, providers: ["local_rife"], strictness: "preferred" },
  ],
  skipStages: [2, 6, 7],  // Skip Scene Planning, Voice, SFX (if cache hit, stages 3,5,8 also skipped at runtime)
  estimatedCreditsPerTenS: "0.1400",
};

export const MONTAGE_IMAGE_SEQ_TEMPLATE: PipelineTemplateData = {
  id: "montage_image_seq",
  sceneType: "montage",
  displayName: "Montage (Image Sequence + Motion)",
  stages: [
    { stageNumber: 1, stageName: "Script Analysis", description: "Identify montage beats and image count" },
    { stageNumber: 2, stageName: "Scene Planning", description: "Plan image sequence and transitions" },
    { stageNumber: 3, stageName: "Keyframe Generation", description: "Generate 6-8 keyframe images" },
    { stageNumber: 4, stageName: "Per-Image Motion", description: "Apply zoom/pan/Ken Burns per image" },
    { stageNumber: 7, stageName: "Music Sync", description: "Sync rapid cuts to music beats" },
    { stageNumber: 9, stageName: "Assembly", description: "Composite image sequence into video" },
  ],
  preferredProviders: [
    { stageNumber: 3, providers: ["flux_schnell", "local_controlnet"], strictness: "preferred" },
  ],
  skipStages: [5, 6, 8],  // Skip full Video Gen, Voice, RIFE (motion is per-image)
  estimatedCreditsPerTenS: "0.0500",
};

// ─── All Templates ──────────────────────────────────────────────────────

export const ALL_PIPELINE_TEMPLATES: PipelineTemplateData[] = [
  DIALOGUE_INPAINT_TEMPLATE,
  ACTION_PREMIUM_TEMPLATE,
  ESTABLISHING_KEN_BURNS_TEMPLATE,
  TRANSITION_RULE_BASED_TEMPLATE,
  REACTION_CACHED_TEMPLATE,
  MONTAGE_IMAGE_SEQ_TEMPLATE,
];

// ─── Seed Function ──────────────────────────────────────────────────────

/**
 * Convert template data to Drizzle insert rows for the pipeline_templates table.
 */
export function getPipelineTemplateSeedRows(): InsertPipelineTemplate[] {
  return ALL_PIPELINE_TEMPLATES.map(t => ({
    id: t.id,
    sceneType: t.sceneType,
    displayName: t.displayName,
    stages: t.stages,
    preferredProviders: t.preferredProviders,
    skipStages: t.skipStages,
    estimatedCreditsPerTenS: t.estimatedCreditsPerTenS,
    isActive: 1,
  }));
}

// ─── Lookup Helpers ─────────────────────────────────────────────────────

const templateMap = new Map(ALL_PIPELINE_TEMPLATES.map(t => [t.id, t]));
const sceneTypeMap = new Map(ALL_PIPELINE_TEMPLATES.map(t => [t.sceneType, t]));

export function getTemplateById(id: string): PipelineTemplateData | undefined {
  return templateMap.get(id);
}

export function getTemplateForSceneType(sceneType: SceneType): PipelineTemplateData | undefined {
  return sceneTypeMap.get(sceneType);
}

export function getSkipStagesForSceneType(sceneType: SceneType): number[] {
  return sceneTypeMap.get(sceneType)?.skipStages ?? [];
}

export function getProviderHintsForSceneType(sceneType: SceneType): ProviderHint[] {
  return sceneTypeMap.get(sceneType)?.preferredProviders ?? [];
}

export function getEstimatedCreditsPerTenS(sceneType: SceneType): number {
  const template = sceneTypeMap.get(sceneType);
  return template ? parseFloat(template.estimatedCreditsPerTenS) : 0;
}
