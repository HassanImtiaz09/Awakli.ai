/**
 * D5 · Tier 2 LLM Visual Reviewer
 *
 * Single multimodal LLM call after H1 passes.
 * Sends 3 keyframes per slice + context (character bibles, style_lock,
 * audio summary, slice intent map) to Claude Sonnet for structured review.
 *
 * Cost target: ~$0.30/episode median, ≤$1.50 worst case.
 * Latency target: ≤90s.
 */

import fs from "fs";
import path from "path";
import { invokeLLM } from "../../_core/llm.js";
import { extractKeyframes, keyframesToBase64, type SliceKeyframes } from "../harness/keyframe-extractor.js";
import { generateAudioSummary, type AudioSummary } from "../harness/audio-summary.js";
import type { D5ReviewResult, D5SliceResult, D5SliceIssue, HarnessVerdict } from "../harness/types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface D5ReviewOptions {
  /** Path to assembled video */
  videoPath: string;
  /** Slice metadata */
  slices: Array<{
    sliceId: number;
    startSec: number;
    durationSec: number;
    intent: string;       // what this slice is supposed to depict
    emotion?: string;     // emotion arc beat
    isDialogue: boolean;
  }>;
  /** Title card duration in seconds */
  titleCardDurationSec: number;
  /** Character bible JSONs */
  characterBibles: Record<string, any>;
  /** style_lock specification */
  styleLock: {
    primary: string;
    forbidden: string[];
    /** Accepted tolerance band for AI video gen models */
    toleranceBand?: string;
  };
  /** ProjectPlan JSON (scene descriptions, emotion arcs) */
  projectPlan: any;
  /** Temp directory for keyframes */
  tempDir: string;
  /** Budget cap in USD (default: 1.50) */
  budgetCapUsd?: number;
}

// ─── System Prompt ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT_PATH = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "prompts",
  "visual-reviewer-system.md"
);

function loadSystemPrompt(): string {
  try {
    return fs.readFileSync(SYSTEM_PROMPT_PATH, "utf-8");
  } catch {
    // Fallback inline prompt
    return `You are an anime quality reviewer. Score each slice on character_consistency, style, prompt_alignment, audio_visual_sync (1-5). Return valid JSON with overall and slices arrays.`;
  }
}

// ─── Core Reviewer ──────────────────────────────────────────────────────────

export async function runVisualReview(options: D5ReviewOptions): Promise<D5ReviewResult> {
  const start = Date.now();
  const {
    videoPath,
    slices,
    titleCardDurationSec,
    characterBibles,
    styleLock,
    projectPlan,
    tempDir,
    budgetCapUsd = 1.50,
  } = options;

  console.log("  ┌─ D5 Tier 2: LLM Visual Reviewer ──────────────────────");
  console.log(`  │ Extracting keyframes for ${slices.length} slices...`);

  // 1. Extract keyframes
  const keyframeDir = path.join(tempDir, "d5_keyframes");
  const keyframes = extractKeyframes({
    videoPath,
    slices,
    titleCardDurationSec,
    outputDir: keyframeDir,
  });

  // 2. Generate audio summary
  console.log("  │ Generating audio summary...");
  const audioSummary = generateAudioSummary({
    videoPath,
    slices,
    titleCardDurationSec,
  });

  // 3. Convert keyframes to base64 for vision input
  const keyframeData = keyframesToBase64(keyframes);

  // 4. Build the user message with all context
  const sliceIntentMap = slices.map((s) => ({
    sliceId: s.sliceId,
    intent: s.intent,
    emotion: s.emotion || "unspecified",
    isDialogue: s.isDialogue,
  }));

  const contextBlock = JSON.stringify({
    characterBibles,
    styleLock,
    sliceIntentMap,
    audioSummary: {
      overallLufs: audioSummary.overallLufs,
      overallLra: audioSummary.overallLra,
      sliceProfiles: audioSummary.sliceProfiles.map((p) => ({
        sliceId: p.sliceId,
        meanVolume: p.meanVolume,
        hasSilence: p.hasSilence,
      })),
    },
    projectPlan: {
      emotionArc: projectPlan.emotionArc || projectPlan.emotion_arc,
      totalSlices: slices.length,
    },
  }, null, 2);

  // 5. Build multimodal messages — interleave text + images
  const userContent: Array<{ type: string; text?: string; image_url?: { url: string; detail?: string } }> = [];

  userContent.push({
    type: "text",
    text: `Review this ${slices.length}-slice anime episode. Here is the context:\n\n${contextBlock}\n\nBelow are 3 keyframes per slice (start, mid, end). Score each slice and identify issues.`,
  });

  // Add keyframes per slice
  for (const kfSlice of keyframeData) {
    userContent.push({
      type: "text",
      text: `\n--- Slice ${kfSlice.sliceId} ---`,
    });

    for (const frame of kfSlice.frames) {
      userContent.push({
        type: "image_url",
        image_url: {
          url: `data:${frame.mimeType};base64,${frame.base64}`,
          detail: "low", // Use low detail to reduce token cost
        },
      });
    }
  }

  // 6. Call the LLM
  console.log(`  │ Calling multimodal LLM (${keyframeData.length} slices × 3 frames)...`);

  const systemPrompt = loadSystemPrompt();

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent as any },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "visual_review",
          strict: true,
          schema: {
            type: "object",
            properties: {
              overall: {
                type: "object",
                properties: {
                  ok: { type: "boolean" },
                  episode_score: { type: "integer", minimum: 1, maximum: 5 },
                  narrative_coherence_score: { type: "integer", minimum: 1, maximum: 5 },
                  style_consistency_score: { type: "integer", minimum: 1, maximum: 5 },
                },
                required: ["ok", "episode_score", "narrative_coherence_score", "style_consistency_score"],
                additionalProperties: false,
              },
              slices: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    sliceId: { type: "integer" },
                    ok: { type: "boolean" },
                    scores: {
                      type: "object",
                      properties: {
                        character_consistency: { type: "integer", minimum: 1, maximum: 5 },
                        style: { type: "integer", minimum: 1, maximum: 5 },
                        prompt_alignment: { type: "integer", minimum: 1, maximum: 5 },
                        audio_visual_sync: { type: "integer", minimum: 1, maximum: 5 },
                      },
                      required: ["character_consistency", "style", "prompt_alignment", "audio_visual_sync"],
                      additionalProperties: false,
                    },
                    issues: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          category: {
                            type: "string",
                            enum: ["character_consistency", "style_violation", "narrative_coherence", "audio_visual_sync", "prompt_alignment"],
                          },
                          severity: { type: "string", enum: ["critical", "major", "minor"] },
                          description: { type: "string" },
                          recommended_action: {
                            type: "string",
                            enum: ["regenerate-slice", "regenerate-reference", "regenerate-prompt", "log-only"],
                          },
                        },
                        required: ["category", "severity", "description", "recommended_action"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["sliceId", "ok", "scores", "issues"],
                  additionalProperties: false,
                },
              },
            },
            required: ["overall", "slices"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Empty LLM response");
    }

    const parsed = JSON.parse(content as string);
    const durationMs = Date.now() - start;

    // Estimate cost (rough: ~$0.003/image at low detail + text tokens)
    const imageCount = keyframeData.reduce((sum, kf) => sum + kf.frames.length, 0);
    const estimatedCost = imageCount * 0.003 + 0.05; // images + text

    const result: D5ReviewResult = {
      overall: parsed.overall,
      slices: parsed.slices,
      costUsd: Math.min(estimatedCost, budgetCapUsd),
      durationMs,
    };

    // Log summary
    const failedSlices = result.slices.filter((s) => !s.ok);
    const criticalIssues = result.slices.flatMap((s) => s.issues.filter((i) => i.severity === "critical"));

    console.log(`  │ D5 complete in ${(durationMs / 1000).toFixed(1)}s (~$${result.costUsd.toFixed(2)})`);
    console.log(`  │ Episode score: ${result.overall.episode_score}/5`);
    console.log(`  │ Style consistency: ${result.overall.style_consistency_score}/5`);
    console.log(`  │ Narrative coherence: ${result.overall.narrative_coherence_score}/5`);
    console.log(`  │ Failed slices: ${failedSlices.length}/${result.slices.length}`);
    console.log(`  │ Critical issues: ${criticalIssues.length}`);
    console.log(`  │ VERDICT: ${result.overall.ok ? "PASSED ✓" : "NEEDS REGEN ✗"}`);
    console.log(`  └────────────────────────────────────────────────────────`);

    return result;

  } catch (err: any) {
    const durationMs = Date.now() - start;
    console.error(`  │ D5 ERROR: ${err.message?.slice(0, 200)}`);
    console.log(`  │ D5 failure — treating H1 as sole validator (fail-safe)`);
    console.log(`  └────────────────────────────────────────────────────────`);

    // On D5 failure, return a "pass" result so H1 remains the only gate
    // This is the mitigation from the risk analysis
    return {
      overall: {
        ok: true,
        episode_score: 0,
        narrative_coherence_score: 0,
        style_consistency_score: 0,
      },
      slices: slices.map((s) => ({
        sliceId: s.sliceId,
        ok: true,
        scores: { character_consistency: 0, style: 0, prompt_alignment: 0, audio_visual_sync: 0 },
        issues: [],
      })),
      costUsd: 0,
      durationMs,
    };
  }
}

/**
 * Run D5 as a HarnessVerdict (for integration with the orchestrator).
 */
export async function runD5Harness(options: D5ReviewOptions): Promise<HarnessVerdict> {
  const review = await runVisualReview(options);

  // Convert D5 slice issues to HarnessCheckResults
  const checks = review.slices
    .filter((s) => !s.ok)
    .flatMap((s) =>
      s.issues.map((issue) => ({
        checkName: `d5_${issue.category}_slice_${s.sliceId}`,
        passed: false,
        details: `Slice ${s.sliceId}: ${issue.description} (${issue.severity})`,
        durationMs: 0,
        routingHint: {
          target: mapD5ActionToTarget(issue),
          sliceId: s.sliceId,
          reason: issue.description,
        },
        metrics: {
          sliceId: s.sliceId,
          category: issue.category,
          severity: issue.severity,
          ...s.scores,
        },
      }))
    );

  return {
    tier: "tier2_llm",
    passed: review.overall.ok,
    checks,
    d5Review: review,
    totalDurationMs: review.durationMs,
    totalCostUsd: review.costUsd,
  };
}

function mapD5ActionToTarget(issue: D5SliceIssue): import("../harness/types.js").RegenerationTarget {
  switch (issue.recommended_action) {
    case "regenerate-reference":
      return "slice_reference_regen";
    case "regenerate-prompt":
      return "slice_d2_regen";
    case "regenerate-slice":
      if (issue.category === "audio_visual_sync") return "slice_video_regen";
      return "slice_video_regen";
    case "log-only":
      return "log_only";
    default:
      return "log_only";
  }
}
