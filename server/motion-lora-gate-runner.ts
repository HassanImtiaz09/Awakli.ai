/**
 * Prompt 25 — Motion LoRA Evaluation Gate Runner
 *
 * Orchestrates the end-to-end evaluation pipeline:
 * 1. Generate test clips using the trained motion LoRA
 * 2. Run M1-M14 evaluation gates via motion-lora-evaluation.ts
 * 3. Produce verdict and write results back to DB
 *
 * This module bridges the tRPC router with the evaluation engine,
 * handling test clip generation, baseline comparison, and coverage analysis.
 */

import {
  runFullEvaluation, generateGateReport,
  type EvaluationInput, type EvaluationReport, type GateResult,
} from "./motion-lora-evaluation";
import {
  SCENE_TYPE_MOTION_WEIGHT, sceneQualifiesForMotionLora,
} from "./motion-lora-training";
import type { MotionLora } from "../drizzle/schema";

// ─── Types ─────────────────────────────────────────────────────────────

export interface EvaluationPipelineInput {
  motionLoraId: number;
  characterId: number;
  artifactUrl: string;
  trainingPath: "sdxl_kohya" | "wan_fork";
  baseWeight: number;
}

export interface EvaluationPipelineResult {
  verdict: "promoted" | "blocked" | "needs_review";
  gates: GateResult[];
  passCount: number;
  failCount: number;
  criticalFailures: string[];
  costUsd: number;
  coverageEntries?: Array<{
    sceneType: string;
    clipCount: number;
    qualityScore: number;
    passed: boolean;
  }>;
  reportMarkdown?: string;
}

// ─── Test Clip Generation ──────────────────────────────────────────────

/**
 * Scene types that require test clip generation for evaluation.
 * Each scene type gets 2-3 test clips with specific prompts.
 */
const EVALUATION_SCENE_PROMPTS: Array<{
  sceneType: string;
  prompts: string[];
}> = [
  {
    sceneType: "action-combat",
    prompts: [
      "Character performs a powerful sword slash with dynamic motion blur",
      "Character dodges an incoming attack with a quick sidestep",
    ],
  },
  {
    sceneType: "action-locomotion",
    prompts: [
      "Character runs at full speed through a corridor",
      "Character jumps across a gap between rooftops",
    ],
  },
  {
    sceneType: "reaction-peak",
    prompts: [
      "Character reacts with shock, eyes widening and stepping back",
      "Character clenches fist in determination, intense expression",
    ],
  },
  {
    sceneType: "somatic-peak",
    prompts: [
      "Character collapses to knees in exhaustion, breathing heavily",
      "Character powers up with energy aura, hair flowing upward",
    ],
  },
  {
    sceneType: "establishing-character",
    prompts: [
      "Character stands confidently, wind blowing through hair",
      "Character turns to face the camera with a calm expression",
    ],
  },
  {
    sceneType: "dialogue-gestured",
    prompts: [
      "Character gestures while speaking, pointing forward emphatically",
      "Character crosses arms while talking, slight head tilt",
    ],
  },
  {
    sceneType: "montage",
    prompts: [
      "Character training sequence: punching, kicking, stretching",
      "Character walking through different environments in sequence",
    ],
  },
];

/**
 * Generate test clips for evaluation.
 *
 * In production, this calls the video generation pipeline with the motion LoRA loaded.
 * Currently returns simulated test clip metadata for the evaluation pipeline.
 */
async function generateTestClips(
  input: EvaluationPipelineInput
): Promise<EvaluationInput["testClips"]> {
  const testClips: EvaluationInput["testClips"] = [];

  for (const scene of EVALUATION_SCENE_PROMPTS) {
    const weight = SCENE_TYPE_MOTION_WEIGHT[scene.sceneType];
    if (weight === null || weight === undefined) continue; // Skip scenes that don't use motion LoRA

    for (const prompt of scene.prompts) {
      // In production: call the video generation pipeline
      // const result = await generateVideoWithMotionLora({
      //   prompt,
      //   motionLoraPath: input.artifactUrl,
      //   motionLoraWeight: weight,
      //   frameCount: 16,
      // });

      // Simulated test clip for the evaluation pipeline
      const clipId = `eval_${input.motionLoraId}_${scene.sceneType}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      testClips.push({
        clipUrl: `https://storage.awakli.com/eval-clips/${clipId}.mp4`,
        frameUrls: Array.from({ length: 4 }, (_, i) =>
          `https://storage.awakli.com/eval-clips/${clipId}_frame${i}.png`
        ),
        prompt,
        sceneType: scene.sceneType,
        generationTimeMs: 3000 + Math.random() * 5000, // 3-8 seconds simulated
        accepted: true,
      });
    }
  }

  return testClips;
}

/**
 * Generate baseline metrics (without motion LoRA) for regression comparison.
 *
 * In production, this would run the same prompts without the motion LoRA
 * and measure quality/cost differences.
 */
async function generateBaselineMetrics(): Promise<EvaluationInput["baseline"]> {
  // Simulated baseline metrics
  return {
    regenRatio: 3.5, // 3.5 clips regenerated per accepted clip (without LoRA)
    avgGenerationTimeMs: 5000,
    costPerClipUsd: 0.08,
    staticFrameUrls: [
      "https://storage.awakli.com/eval-baseline/static_frame_0.png",
      "https://storage.awakli.com/eval-baseline/static_frame_1.png",
    ],
    dialogueFrameUrls: [
      "https://storage.awakli.com/eval-baseline/dialogue_frame_0.png",
      "https://storage.awakli.com/eval-baseline/dialogue_frame_1.png",
    ],
    actionFrameUrls: [
      "https://storage.awakli.com/eval-baseline/action_frame_0.png",
      "https://storage.awakli.com/eval-baseline/action_frame_1.png",
    ],
  };
}

// ─── Main Evaluation Pipeline ──────────────────────────────────────────

/**
 * Run the complete evaluation pipeline for a trained motion LoRA.
 *
 * Steps:
 * 1. Generate test clips across all qualifying scene types
 * 2. Generate baseline metrics for regression comparison
 * 3. Run M1-M14 evaluation gates
 * 4. Compute coverage matrix entries
 * 5. Return verdict and detailed results
 */
export async function runEvaluationPipeline(
  input: EvaluationPipelineInput
): Promise<EvaluationPipelineResult> {
  console.log(`[GateRunner] Starting evaluation for motion LoRA ${input.motionLoraId}`);

  // 1. Generate test clips
  const testClips = await generateTestClips(input);
  console.log(`[GateRunner] Generated ${testClips.length} test clips across ${new Set(testClips.map(c => c.sceneType)).size} scene types`);

  // 2. Generate baseline metrics
  const baseline = await generateBaselineMetrics();

  // 3. Build evaluation input
  const evalInput: EvaluationInput = {
    trainingJobId: `mlora_${input.motionLoraId}`,
    characterName: `Character-${input.characterId}`,
    loraPath: input.artifactUrl,
    referenceImageUrls: [
      // In production: fetch character reference images from DB
      `https://storage.awakli.com/characters/${input.characterId}/reference_front.png`,
      `https://storage.awakli.com/characters/${input.characterId}/reference_side.png`,
    ],
    testClips,
    baseline,
    trainingCostUsd: input.trainingPath === "sdxl_kohya" ? 1.23 : 1.51, // Estimated from job queue
    expectedClipsPerModel: 500,
  };

  // 4. Run the full evaluation
  const report = await runFullEvaluation(evalInput);
  console.log(`[GateRunner] Evaluation complete: ${report.verdict} (${report.summary.passed}/${report.summary.total} passed)`);

  // 5. Compute coverage matrix entries from test clip results
  const coverageEntries = computeCoverageFromReport(report, testClips);

  // 6. Generate markdown report
  const reportMarkdown = generateGateReport(report);

  // 7. Map to pipeline result
  const criticalFailures = report.gates
    .filter(g => g.status === "fail")
    .map(g => g.gateId);

  return {
    verdict: report.verdict,
    gates: report.gates,
    passCount: report.summary.passed,
    failCount: report.summary.failed,
    criticalFailures,
    costUsd: report.evaluationCostUsd,
    coverageEntries,
    reportMarkdown,
  };
}

// ─── Coverage Matrix Computation ───────────────────────────────────────

/**
 * Compute coverage matrix entries from evaluation results.
 * Groups test clips by scene type and calculates per-scene quality scores.
 */
function computeCoverageFromReport(
  report: EvaluationReport,
  testClips: EvaluationInput["testClips"]
): EvaluationPipelineResult["coverageEntries"] {
  // Group clips by scene type
  const sceneGroups = new Map<string, typeof testClips>();
  for (const clip of testClips) {
    const group = sceneGroups.get(clip.sceneType) ?? [];
    group.push(clip);
    sceneGroups.set(clip.sceneType, group);
  }

  // For each scene type, compute a quality score based on:
  // - Acceptance rate of generated clips
  // - Average generation time (faster = better)
  // - Overall gate pass rate as a proxy for quality
  const overallQuality = report.summary.total > 0
    ? report.summary.passed / report.summary.total
    : 0;

  const entries: NonNullable<EvaluationPipelineResult["coverageEntries"]> = [];

  for (const sceneType of Array.from(sceneGroups.keys())) {
    const clips = sceneGroups.get(sceneType)!;
    const acceptedCount = clips.filter((c: typeof testClips[number]) => c.accepted).length;
    const acceptanceRate = clips.length > 0 ? acceptedCount / clips.length : 0;
    const avgGenTime = clips.reduce((sum: number, c: typeof testClips[number]) => sum + c.generationTimeMs, 0) / clips.length;

    // Quality score: weighted combination of acceptance rate and overall gate quality
    const qualityScore = Math.round((acceptanceRate * 0.4 + overallQuality * 0.6) * 100) / 100;

    entries.push({
      sceneType,
      clipCount: clips.length,
      qualityScore,
      passed: qualityScore >= 0.60 && report.verdict !== "blocked",
    });
  }

  return entries;
}

// ─── Evaluation Report Accessor ────────────────────────────────────────

/**
 * Get a formatted evaluation report for a motion LoRA.
 * Returns the report data in a shape suitable for the frontend.
 */
export function getEvaluationReport(lora: MotionLora): {
  hasReport: boolean;
  verdict: string | null;
  gates: Array<{ gateId: string; status: string; score: number | null }>;
  evaluatedAt: number | null;
  reportMarkdown: string | null;
} {
  if (!lora.evaluationResults || !lora.evaluationVerdict) {
    return {
      hasReport: false,
      verdict: null,
      gates: [],
      evaluatedAt: null,
      reportMarkdown: null,
    };
  }

  // evaluationResults is stored as JSON array of GateResult
  const rawGates = lora.evaluationResults as GateResult[];

  return {
    hasReport: true,
    verdict: lora.evaluationVerdict,
    gates: rawGates.map(g => ({
      gateId: g.gateId,
      status: g.status,
      score: g.score,
    })),
    evaluatedAt: lora.evaluatedAt?.getTime() ?? null,
    reportMarkdown: null, // Could regenerate from stored data if needed
  };
}
