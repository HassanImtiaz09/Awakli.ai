/**
 * H1 · Rules-Based Release Harness (Tier 1)
 *
 * Top-level runner that executes all 7 deterministic checks in sequence.
 * Returns a HarnessVerdict with pass/fail per check and routing hints.
 *
 * Cost: $0/episode. Wall-clock: ~30s for a 3-min episode.
 */

import type { HarnessVerdict, HarnessCheckResult } from "./types.js";
import { runSilenceCheck, type SilenceCheckOptions } from "./checks/silence-check.js";
import { runLoudnessCheck, type LoudnessCheckOptions } from "./checks/loudness-check.js";
import { runAspectCheck, type AspectCheckOptions } from "./checks/aspect-check.js";
import { runDurationCheck, type DurationCheckOptions } from "./checks/duration-check.js";
import { runFaceCountCheck, type FaceCountCheckOptions } from "./checks/face-count-check.js";
import { runWatermarkCheck, type WatermarkCheckOptions } from "./checks/watermark-check.js";
import { runFileIntegrityCheck, type FileIntegrityCheckOptions } from "./checks/file-integrity-check.js";

export interface RulesHarnessOptions {
  /** Path to the assembled video file */
  videoPath: string;
  /** Number of content slices (excluding title/end cards) */
  sliceCount: number;
  /** Duration of each content slice in seconds (default: 10) */
  sliceDurationSec?: number;
  /** Title card duration in seconds */
  titleCardDurationSec: number;
  /** End card duration in seconds */
  endCardDurationSec: number;
  /** Total video duration (auto-detected if not provided) */
  totalDurationSec?: number;
  /** Dialogue slice metadata for face-count check */
  dialogueSlices: Array<{
    sliceId: number;
    startSec: number;
    durationSec: number;
    isDialogue: boolean;
  }>;
  /** Whether this is an Apprentice tier project requiring watermark */
  requireWatermark?: boolean;
  /** Temp directory for intermediate files */
  tempDir: string;
}

export async function runRulesHarness(options: RulesHarnessOptions): Promise<HarnessVerdict> {
  const start = Date.now();
  const checks: HarnessCheckResult[] = [];

  console.log("  ┌─ H1 Tier 1: Rules-Based Release Gate ─────────────────");

  // 1. File Integrity (run first — if file is corrupt, other checks are meaningless)
  const fileIntegrity = runFileIntegrityCheck({
    videoPath: options.videoPath,
  });
  checks.push(fileIntegrity);
  console.log(`  │ fileIntegrity: ${fileIntegrity.passed ? "✓" : "✗"} (${fileIntegrity.durationMs}ms)`);
  if (!fileIntegrity.passed) {
    console.log(`  │   → ${fileIntegrity.details}`);
  }

  // 2. Aspect Check
  const aspect = runAspectCheck({
    videoPath: options.videoPath,
  });
  checks.push(aspect);
  console.log(`  │ aspect:        ${aspect.passed ? "✓" : "✗"} (${aspect.durationMs}ms)`);
  if (!aspect.passed) {
    console.log(`  │   → ${aspect.details}`);
  }

  // 3. Duration Check
  const duration = runDurationCheck({
    videoPath: options.videoPath,
    sliceCount: options.sliceCount,
    sliceDurationSec: options.sliceDurationSec,
    titleCardDurationSec: options.titleCardDurationSec,
    endCardDurationSec: options.endCardDurationSec,
  });
  checks.push(duration);
  console.log(`  │ duration:      ${duration.passed ? "✓" : "✗"} (${duration.durationMs}ms)`);
  if (!duration.passed) {
    console.log(`  │   → ${duration.details}`);
  }

  // 4. Silence Check
  const silence = runSilenceCheck({
    videoPath: options.videoPath,
    titleCardDurationSec: options.titleCardDurationSec,
    endCardDurationSec: options.endCardDurationSec,
    totalDurationSec: options.totalDurationSec,
  });
  checks.push(silence);
  console.log(`  │ silence:       ${silence.passed ? "✓" : "✗"} (${silence.durationMs}ms)`);
  if (!silence.passed) {
    console.log(`  │   → ${silence.details}`);
  }

  // 5. Loudness Check
  const loudness = runLoudnessCheck({
    videoPath: options.videoPath,
  });
  checks.push(loudness);
  console.log(`  │ loudness:      ${loudness.passed ? "✓" : "✗"} (${loudness.durationMs}ms)`);
  if (!loudness.passed) {
    console.log(`  │   → ${loudness.details}`);
  }

  // 6. Face Count Check
  const faceCount = runFaceCountCheck({
    videoPath: options.videoPath,
    dialogueSlices: options.dialogueSlices,
    titleCardDurationSec: options.titleCardDurationSec,
    tempDir: options.tempDir,
  });
  checks.push(faceCount);
  console.log(`  │ faceCount:     ${faceCount.passed ? "✓" : "✗"} (${faceCount.durationMs}ms)`);
  if (!faceCount.passed) {
    console.log(`  │   → ${faceCount.details}`);
  }

  // 7. Watermark Check
  const watermark = runWatermarkCheck({
    videoPath: options.videoPath,
    requireWatermark: options.requireWatermark ?? false,
    tempDir: options.tempDir,
  });
  checks.push(watermark);
  console.log(`  │ watermark:     ${watermark.passed ? "✓" : "✗"} (${watermark.durationMs}ms)`);
  if (!watermark.passed && options.requireWatermark) {
    console.log(`  │   → ${watermark.details}`);
  }

  const totalDurationMs = Date.now() - start;
  const allPassed = checks.every((c) => c.passed);

  console.log(`  │`);
  console.log(`  │ VERDICT: ${allPassed ? "ALL PASSED ✓" : "FAILED ✗"} (${totalDurationMs}ms total)`);
  if (!allPassed) {
    const failed = checks.filter((c) => !c.passed);
    console.log(`  │ Failed checks: ${failed.map((c) => c.checkName).join(", ")}`);
  }
  console.log(`  └────────────────────────────────────────────────────────`);

  return {
    tier: "tier1_rules",
    passed: allPassed,
    checks,
    totalDurationMs,
    totalCostUsd: 0, // Rules-based checks are free
  };
}
