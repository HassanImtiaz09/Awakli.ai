/**
 * Shared types for the Hybrid Harness (H1 + D5 + H2).
 *
 * Every check — whether rules-based (H1) or LLM-judged (D5) — produces
 * a HarnessCheckResult.  The top-level HarnessVerdict aggregates all
 * results and feeds into the H2 Feedback Router.
 */

// ─── Routing Hints ──────────────────────────────────────────────────────────

/** Where H2 should dispatch a regeneration when a check fails. */
export type RegenerationTarget =
  | "a1_music_bed"           // silence_check → re-run music bed
  | "q3_audio_mastering"     // loudness_check → re-run mastering
  | "assembly_reencode"      // aspect_check / watermark_check → re-encode
  | "assembly_concat"        // file_integrity_check → re-run from concat
  | "slice_video_regen"      // face_count_check / D5 audio_visual_sync → regen slice video
  | "slice_d2_regen"         // D5 style_violation → regen D2 prompt + video for slice
  | "slice_reference_regen"  // D5 character_consistency → regen P3 reference + video
  | "slice_identify_missing" // duration_check → find missing slice, regenerate it
  | "log_only"               // D5 narrative_coherence → too expensive, flag for human
  | "none";                  // check passed, no action needed

export interface RoutingHint {
  target: RegenerationTarget;
  sliceId?: number;          // which slice to regenerate (if slice-level)
  reason: string;            // human-readable explanation
}

// ─── Individual Check Result ────────────────────────────────────────────────

export type H1CheckName =
  | "silence_check"
  | "loudness_check"
  | "aspect_check"
  | "duration_check"
  | "face_count_check"
  | "watermark_check"
  | "file_integrity_check";

export type D5IssueCategory =
  | "character_consistency"
  | "style_violation"
  | "narrative_coherence"
  | "audio_visual_sync"
  | "prompt_alignment";

export interface HarnessCheckResult {
  checkName: H1CheckName | string;
  passed: boolean;
  details: string;
  durationMs: number;
  routingHint: RoutingHint;
  /** Raw metrics for logging / dashboards */
  metrics?: Record<string, number | string | boolean>;
}

// ─── D5 Slice-Level Result ──────────────────────────────────────────────────

export interface D5SliceIssue {
  category: D5IssueCategory;
  severity: "critical" | "major" | "minor";
  description: string;
  recommended_action: "regenerate-slice" | "regenerate-reference" | "regenerate-prompt" | "log-only";
}

export interface D5SliceResult {
  sliceId: number;
  ok: boolean;
  scores: {
    character_consistency: number;  // 1-5
    style: number;                  // 1-5
    prompt_alignment: number;       // 1-5
    audio_visual_sync: number;      // 1-5
  };
  issues: D5SliceIssue[];
}

export interface D5ReviewResult {
  overall: {
    ok: boolean;
    episode_score: number;              // 1-5
    narrative_coherence_score: number;   // 1-5
    style_consistency_score: number;     // 1-5
  };
  slices: D5SliceResult[];
  costUsd: number;
  durationMs: number;
}

// ─── Aggregated Verdict ─────────────────────────────────────────────────────

export type HarnessTier = "tier1_rules" | "tier2_llm";

export interface HarnessVerdict {
  tier: HarnessTier;
  passed: boolean;
  checks: HarnessCheckResult[];
  /** Only present for tier2_llm */
  d5Review?: D5ReviewResult;
  totalDurationMs: number;
  totalCostUsd: number;
}

// ─── Feedback Router Types ──────────────────────────────────────────────────

export interface RegenerationAction {
  target: RegenerationTarget;
  sliceId?: number;
  reason: string;
  source: HarnessTier;
  checkName: string;
  attempt: number;       // 1 = first regen, 2 = second regen (cap)
}

export interface EscalationEntry {
  episodeId: string;
  sliceId?: number;
  failureCategory: string;
  source: HarnessTier;
  attempts: number;
  reason: string;
  timestamp: string;
}

// ─── Slice Retry Tracker ────────────────────────────────────────────────────

export interface SliceRetryState {
  sliceId: number;
  h1Attempts: number;   // max 1
  d5Attempts: number;   // max 1
  escalated: boolean;
}

export const MAX_H1_RETRIES_PER_SLICE = 1;
export const MAX_D5_RETRIES_PER_SLICE = 1;
