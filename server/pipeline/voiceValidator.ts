/**
 * Voice Presence Validation Gate
 *
 * RULE: Validate voice presence at every dialogue timecode before final mux.
 * Each dialogue timecode must measure above -30 LUFS to pass the gate.
 *
 * This module provides:
 *   1. `validateVoicePresence` — checks all dialogue timecodes in a mixed audio track
 *   2. `VoiceValidationResult` — structured pass/fail report per timecode
 *   3. `assertVoicePresence` — throws if any timecode fails (hard gate)
 *
 * Usage:
 *   After building the voice track (or mixed audio), call `validateVoicePresence`
 *   with the dialogue timecodes. If any fail, the assembly should halt and report
 *   which timecodes are silent.
 */

import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DialogueTimecode {
  /** Panel identifier for logging */
  panelId: number | string;
  /** Character name for logging */
  character?: string;
  /** Dialogue text for logging */
  text?: string;
  /** Start time in seconds where the voice should be audible */
  startTimeSeconds: number;
  /** Duration to measure (default: 2.0s) */
  measureDurationSeconds?: number;
}

export interface TimecodeValidation {
  /** Panel identifier */
  panelId: number | string;
  /** Character name */
  character?: string;
  /** Start time in seconds */
  startTimeSeconds: number;
  /** Measured integrated loudness in LUFS */
  measuredLufs: number;
  /** Whether this timecode passed the threshold */
  passed: boolean;
  /** The threshold used */
  thresholdLufs: number;
}

export interface VoiceValidationResult {
  /** Whether all timecodes passed */
  allPassed: boolean;
  /** Total number of timecodes checked */
  totalChecked: number;
  /** Number of timecodes that passed */
  passedCount: number;
  /** Number of timecodes that failed */
  failedCount: number;
  /** Per-timecode results */
  timecodes: TimecodeValidation[];
  /** Summary message */
  summary: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Default loudness threshold for voice presence.
 * Any dialogue timecode measuring below this is considered silent/inaudible.
 * -30 LUFS is very quiet but still detectable; -Infinity means no signal at all.
 */
export const DEFAULT_VOICE_THRESHOLD_LUFS = -30;

/**
 * Default measurement window around each dialogue timecode.
 */
export const DEFAULT_MEASURE_DURATION_SECONDS = 2.0;

// ─── Core ───────────────────────────────────────────────────────────────────

/**
 * Measure the integrated loudness at a specific timecode in an audio file.
 */
async function measureLufsAtTimecode(
  audioPath: string,
  startSeconds: number,
  durationSeconds: number,
): Promise<number> {
  try {
    // CRITICAL: Use input seeking (-ss BEFORE -i) to ensure loudnorm only
    // processes the exact segment we want. Output seeking (-ss after -i)
    // causes loudnorm to analyze the entire file and report global loudness,
    // which defeats the purpose of per-timecode validation.
    const { stderr } = await execFileAsync("ffmpeg", [
      "-y",
      "-ss", startSeconds.toFixed(3),
      "-i", audioPath,
      "-t", durationSeconds.toFixed(3),
      "-af", "loudnorm=print_format=json",
      "-f", "null", "-",
    ], {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    });

    // Extract the loudnorm JSON from stderr
    const jsonMatch = stderr.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const lufs = parseFloat(parsed.input_i);
      return isNaN(lufs) ? -Infinity : lufs;
    }
  } catch {
    // If ffmpeg fails (e.g., timecode out of range), return -Infinity
  }

  return -Infinity;
}

/**
 * Validate voice presence at every dialogue timecode in an audio file.
 *
 * For each timecode, measures the integrated loudness over a window
 * (default 2.0s) and checks it against the threshold (default -30 LUFS).
 *
 * @param audioPath - Path to the audio file to validate (voice track or mixed audio)
 * @param dialogueTimecodes - Array of dialogue timecodes to check
 * @param thresholdLufs - Minimum acceptable loudness (default: -30 LUFS)
 * @returns Structured validation result with per-timecode pass/fail
 */
export async function validateVoicePresence(
  audioPath: string,
  dialogueTimecodes: DialogueTimecode[],
  thresholdLufs: number = DEFAULT_VOICE_THRESHOLD_LUFS,
): Promise<VoiceValidationResult> {
  const timecodes: TimecodeValidation[] = [];

  for (const tc of dialogueTimecodes) {
    const measureDur = tc.measureDurationSeconds ?? DEFAULT_MEASURE_DURATION_SECONDS;
    const measuredLufs = await measureLufsAtTimecode(
      audioPath,
      tc.startTimeSeconds,
      measureDur,
    );

    const passed = measuredLufs > thresholdLufs;

    timecodes.push({
      panelId: tc.panelId,
      character: tc.character,
      startTimeSeconds: tc.startTimeSeconds,
      measuredLufs,
      passed,
      thresholdLufs,
    });

    const status = passed ? "PASS" : "FAIL";
    const label = tc.character
      ? `${tc.panelId} [${tc.character}]`
      : String(tc.panelId);

    console.log(
      `[VoiceValidator] ${status} ${label} @ ${tc.startTimeSeconds}s: ` +
      `${measuredLufs === -Infinity ? "-inf" : measuredLufs.toFixed(1)} LUFS ` +
      `(threshold: ${thresholdLufs} LUFS)`
    );
  }

  const passedCount = timecodes.filter((t) => t.passed).length;
  const failedCount = timecodes.length - passedCount;
  const allPassed = failedCount === 0;

  const failedLabels = timecodes
    .filter((t) => !t.passed)
    .map((t) => `${t.panelId}@${t.startTimeSeconds}s(${t.measuredLufs === -Infinity ? "-inf" : t.measuredLufs.toFixed(1)} LUFS)`)
    .join(", ");

  const summary = allPassed
    ? `Voice validation PASSED: all ${passedCount} dialogue timecodes above ${thresholdLufs} LUFS`
    : `Voice validation FAILED: ${failedCount}/${timecodes.length} timecodes below ${thresholdLufs} LUFS — ${failedLabels}`;

  console.log(`[VoiceValidator] ${summary}`);

  return {
    allPassed,
    totalChecked: timecodes.length,
    passedCount,
    failedCount,
    timecodes,
    summary,
  };
}

/**
 * Hard gate: throws an error if any dialogue timecode fails validation.
 * Use this as a pipeline gate before proceeding to final mux.
 *
 * @throws Error with details about which timecodes failed
 */
export async function assertVoicePresence(
  audioPath: string,
  dialogueTimecodes: DialogueTimecode[],
  thresholdLufs: number = DEFAULT_VOICE_THRESHOLD_LUFS,
): Promise<VoiceValidationResult> {
  const result = await validateVoicePresence(audioPath, dialogueTimecodes, thresholdLufs);

  if (!result.allPassed) {
    const failedDetails = result.timecodes
      .filter((t) => !t.passed)
      .map((t) => {
        const label = t.character ? `${t.panelId} [${t.character}]` : String(t.panelId);
        return `  - ${label} @ ${t.startTimeSeconds}s: ${t.measuredLufs === -Infinity ? "-inf" : t.measuredLufs.toFixed(1)} LUFS`;
      })
      .join("\n");

    throw new Error(
      `Voice presence validation failed: ${result.failedCount} dialogue timecodes are silent or below ${thresholdLufs} LUFS.\n` +
      `Failed timecodes:\n${failedDetails}\n\n` +
      `This usually means the audio mixing pipeline has an amplitude division bug ` +
      `(e.g., bare amix without weights). Check that voice clips are being overlaid ` +
      `using the sequential overlay approach or amix with weights=1 1:normalize=0.`
    );
  }

  return result;
}

/**
 * Quick check: returns true if voice is present at a single timecode.
 * Useful for spot-checking individual clips.
 */
export async function isVoicePresent(
  audioPath: string,
  startTimeSeconds: number,
  durationSeconds: number = DEFAULT_MEASURE_DURATION_SECONDS,
  thresholdLufs: number = DEFAULT_VOICE_THRESHOLD_LUFS,
): Promise<boolean> {
  const lufs = await measureLufsAtTimecode(audioPath, startTimeSeconds, durationSeconds);
  return lufs > thresholdLufs;
}
