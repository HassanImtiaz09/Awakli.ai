/**
 * H1 · loudnessCheck
 *
 * FFmpeg loudnorm measurement pass.
 * FAIL if integrated LUFS outside [-17, -15] or LRA outside [6, 10].
 */

import { execSync } from "child_process";
import type { HarnessCheckResult } from "../types.js";

export interface LoudnessCheckOptions {
  videoPath: string;
  /** Acceptable integrated LUFS range [min, max] (default: [-17, -15]) */
  lufsRange?: [number, number];
  /** Acceptable Loudness Range (LRA) [min, max] (default: [6, 10]) */
  lraRange?: [number, number];
}

export function runLoudnessCheck(options: LoudnessCheckOptions): HarnessCheckResult {
  const start = Date.now();
  const {
    videoPath,
    lufsRange = [-17, -15],
    lraRange = [6, 10],
  } = options;

  try {
    // First pass: measure loudness with loudnorm filter
    const output = execSync(
      `ffmpeg -i "${videoPath}" -af loudnorm=print_format=json -f null - 2>&1 || true`,
      { timeout: 30000 }
    ).toString();

    // Extract the JSON block from loudnorm output
    const jsonMatch = output.match(/\{[^}]*"input_i"[^}]*\}/);
    if (!jsonMatch) {
      return {
        checkName: "loudness_check",
        passed: false,
        details: "Could not parse loudnorm output — no JSON block found",
        durationMs: Date.now() - start,
        routingHint: { target: "q3_audio_mastering", reason: "Loudness measurement failed — re-run mastering" },
        metrics: { parseError: true },
      };
    }

    const loudnessData = JSON.parse(jsonMatch[0]);
    const integratedLufs = parseFloat(loudnessData.input_i);
    const lra = parseFloat(loudnessData.input_lra);
    const truePeak = parseFloat(loudnessData.input_tp);

    const lufsOk = integratedLufs >= lufsRange[0] && integratedLufs <= lufsRange[1];
    const lraOk = lra >= lraRange[0] && lra <= lraRange[1];
    const passed = lufsOk && lraOk;

    const issues: string[] = [];
    if (!lufsOk) issues.push(`LUFS ${integratedLufs.toFixed(1)} outside [${lufsRange[0]}, ${lufsRange[1]}]`);
    if (!lraOk) issues.push(`LRA ${lra.toFixed(1)} outside [${lraRange[0]}, ${lraRange[1]}]`);

    return {
      checkName: "loudness_check",
      passed,
      details: passed
        ? `LUFS: ${integratedLufs.toFixed(1)}, LRA: ${lra.toFixed(1)}, True Peak: ${truePeak.toFixed(1)} — all within spec`
        : `Loudness out of spec: ${issues.join("; ")}`,
      durationMs: Date.now() - start,
      routingHint: passed
        ? { target: "none", reason: "Loudness check passed" }
        : { target: "q3_audio_mastering", reason: `Loudness out of spec — re-run audio mastering` },
      metrics: {
        integratedLufs,
        lra,
        truePeak,
        lufsOk,
        lraOk,
      },
    };
  } catch (err: any) {
    return {
      checkName: "loudness_check",
      passed: false,
      details: `Loudness check error: ${err.message?.slice(0, 200)}`,
      durationMs: Date.now() - start,
      routingHint: { target: "q3_audio_mastering", reason: "Loudness check errored — re-run mastering" },
      metrics: { error: true },
    };
  }
}
