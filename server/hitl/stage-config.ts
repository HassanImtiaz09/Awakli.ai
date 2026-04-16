/**
 * HITL Stage Configuration (Prompt 17)
 *
 * Defines the 12-stage pipeline, stage names, and default gate assignments.
 * Gate configs are loaded from the database (gate_configs table) but these
 * constants provide the canonical stage definitions.
 */

// ─── Stage Definitions ──────────────────────────────────────────────────

export const TOTAL_STAGES = 12;

export const STAGE_NAMES: Record<number, string> = {
  1: "manga_analysis",
  2: "scene_planning",
  3: "character_sheet_gen",
  4: "keyframe_generation",
  5: "video_generation",
  6: "voice_synthesis",
  7: "music_scoring",
  8: "sfx_foley",
  9: "audio_mix",
  10: "video_composite",
  11: "subtitle_render",
  12: "episode_publish",
};

export const STAGE_DISPLAY_NAMES: Record<number, string> = {
  1: "Manga Analysis",
  2: "Scene Planning",
  3: "Character Sheet Generation",
  4: "Keyframe Generation",
  5: "Video Generation",
  6: "Voice Synthesis",
  7: "Music Scoring",
  8: "SFX & Foley",
  9: "Audio Mix",
  10: "Video Composite",
  11: "Subtitle Render",
  12: "Episode Publish",
};

// ─── Gate Types ─────────────────────────────────────────────────────────

export type GateType = "blocking" | "advisory" | "ambient";

export type GateDecision =
  | "pending"
  | "approved"
  | "rejected"
  | "regenerate"
  | "regenerate_with_edits"
  | "auto_approved"
  | "auto_rejected"
  | "escalated"
  | "timed_out";

export type DecisionSource = "creator" | "auto" | "escalation" | "timeout";

export type StageStatus =
  | "pending"
  | "executing"
  | "awaiting_gate"
  | "approved"
  | "rejected"
  | "regenerating"
  | "skipped"
  | "failed"
  | "timed_out";

export type PipelineRunStatus = "active" | "paused" | "completed" | "aborted" | "failed";

// ─── Default Gate Assignments (fallback if DB has no config) ────────────

export interface StageGateDefault {
  stageNumber: number;
  stageName: string;
  gateType: GateType;
  autoAdvanceThreshold: number;
  reviewThreshold: number;
  timeoutHours: number;
  timeoutAction: "auto_approve" | "auto_reject" | "auto_pause";
  isLocked: boolean;
}

export const DEFAULT_GATE_ASSIGNMENTS: StageGateDefault[] = [
  { stageNumber: 1,  stageName: "manga_analysis",       gateType: "ambient",  autoAdvanceThreshold: 70, reviewThreshold: 40, timeoutHours: 24, timeoutAction: "auto_approve", isLocked: false },
  { stageNumber: 2,  stageName: "scene_planning",       gateType: "advisory", autoAdvanceThreshold: 70, reviewThreshold: 50, timeoutHours: 24, timeoutAction: "auto_approve", isLocked: false },
  { stageNumber: 3,  stageName: "character_sheet_gen",   gateType: "blocking", autoAdvanceThreshold: 85, reviewThreshold: 60, timeoutHours: 24, timeoutAction: "auto_pause",   isLocked: false },
  { stageNumber: 4,  stageName: "keyframe_generation",   gateType: "blocking", autoAdvanceThreshold: 85, reviewThreshold: 60, timeoutHours: 24, timeoutAction: "auto_pause",   isLocked: false },
  { stageNumber: 5,  stageName: "video_generation",      gateType: "advisory", autoAdvanceThreshold: 80, reviewThreshold: 55, timeoutHours: 24, timeoutAction: "auto_pause",   isLocked: false },
  { stageNumber: 6,  stageName: "voice_synthesis",       gateType: "advisory", autoAdvanceThreshold: 85, reviewThreshold: 60, timeoutHours: 24, timeoutAction: "auto_approve", isLocked: false },
  { stageNumber: 7,  stageName: "music_scoring",         gateType: "advisory", autoAdvanceThreshold: 75, reviewThreshold: 50, timeoutHours: 24, timeoutAction: "auto_approve", isLocked: false },
  { stageNumber: 8,  stageName: "sfx_foley",             gateType: "ambient",  autoAdvanceThreshold: 70, reviewThreshold: 40, timeoutHours: 24, timeoutAction: "auto_approve", isLocked: false },
  { stageNumber: 9,  stageName: "audio_mix",             gateType: "advisory", autoAdvanceThreshold: 80, reviewThreshold: 55, timeoutHours: 24, timeoutAction: "auto_approve", isLocked: false },
  { stageNumber: 10, stageName: "video_composite",       gateType: "blocking", autoAdvanceThreshold: 85, reviewThreshold: 60, timeoutHours: 24, timeoutAction: "auto_pause",   isLocked: false },
  { stageNumber: 11, stageName: "subtitle_render",       gateType: "ambient",  autoAdvanceThreshold: 70, reviewThreshold: 40, timeoutHours: 24, timeoutAction: "auto_approve", isLocked: false },
  { stageNumber: 12, stageName: "episode_publish",       gateType: "blocking", autoAdvanceThreshold: 90, reviewThreshold: 70, timeoutHours: 24, timeoutAction: "auto_pause",   isLocked: true },
];

// ─── Tier Names ─────────────────────────────────────────────────────────

export const TIER_NAMES = ["free_trial", "creator", "creator_pro", "studio", "enterprise"] as const;
export type TierName = typeof TIER_NAMES[number];

// ─── Credit Cost Estimates per Stage (in credits) ───────────────────────

export const STAGE_CREDIT_ESTIMATES: Record<number, number> = {
  1: 1,     // manga analysis — mostly LLM
  2: 2,     // scene planning — LLM
  3: 15,    // character sheet gen — image gen
  4: 20,    // keyframe generation — image gen (multiple frames)
  5: 40,    // video generation — expensive
  6: 10,    // voice synthesis
  7: 8,     // music scoring
  8: 3,     // SFX
  9: 2,     // audio mix
  10: 5,    // video composite
  11: 1,    // subtitle render
  12: 0,    // episode publish — no generation cost
};

// ─── Skippable Stages (only ambient gates can be skipped) ───────────────

export function isStageSkippable(stageNumber: number, gateType: GateType): boolean {
  // Only ambient gates are skippable, and never the final publish stage
  return gateType === "ambient" && stageNumber !== 12;
}

// ─── Confidence Score Thresholds ────────────────────────────────────────

export const AMBIENT_ESCALATION_THRESHOLD = 20;
export const AMBIENT_PATTERN_DEGRADATION_THRESHOLD = 50;
export const AMBIENT_PATTERN_DEGRADATION_COUNT = 3;

// ─── Timeout Constants ──────────────────────────────────────────────────

export const TIMEOUT_WARNING_HOURS = [1, 6, 23] as const;
export const ABSOLUTE_TIMEOUT_HOURS = 48; // auto-abort after this
