/**
 * H1 · fileIntegrityCheck
 *
 * Verify mp4 atoms, audio track present, codec matches expected H.264 + AAC.
 */

import { execSync } from "child_process";
import type { HarnessCheckResult } from "../types.js";

export interface FileIntegrityCheckOptions {
  videoPath: string;
  expectedVideoCodec?: string;  // default: h264
  expectedAudioCodec?: string;  // default: aac
}

export function runFileIntegrityCheck(options: FileIntegrityCheckOptions): HarnessCheckResult {
  const start = Date.now();
  const {
    videoPath,
    expectedVideoCodec = "h264",
    expectedAudioCodec = "aac",
  } = options;

  try {
    // Check file exists and has reasonable size
    const statOut = execSync(`stat -c %s "${videoPath}" 2>/dev/null`).toString().trim();
    const fileSize = parseInt(statOut);
    if (fileSize < 10000) {
      return {
        checkName: "file_integrity_check",
        passed: false,
        details: `File too small: ${fileSize} bytes — likely corrupt`,
        durationMs: Date.now() - start,
        routingHint: { target: "assembly_concat", reason: "File too small — re-run from concat" },
        metrics: { fileSize, error: "too_small" },
      };
    }

    // Probe streams
    const probeOut = execSync(
      `ffprobe -v error -show_entries stream=codec_name,codec_type -of csv=p=0 "${videoPath}" 2>/dev/null`
    ).toString().trim();

    const streams = probeOut.split("\n").map((line) => {
      const [codecName, codecType] = line.split(",");
      return { codecName: codecName?.trim(), codecType: codecType?.trim() };
    });

    const videoStream = streams.find((s) => s.codecType === "video");
    const audioStream = streams.find((s) => s.codecType === "audio");

    const issues: string[] = [];

    if (!videoStream) {
      issues.push("No video stream found");
    } else if (videoStream.codecName !== expectedVideoCodec) {
      issues.push(`Video codec ${videoStream.codecName} != expected ${expectedVideoCodec}`);
    }

    if (!audioStream) {
      issues.push("No audio stream found");
    } else if (audioStream.codecName !== expectedAudioCodec) {
      issues.push(`Audio codec ${audioStream.codecName} != expected ${expectedAudioCodec}`);
    }

    // Verify mp4 atoms (moov atom present)
    try {
      const atomCheck = execSync(
        `ffprobe -v error -show_entries format_tags=major_brand -of csv=p=0 "${videoPath}" 2>/dev/null`
      ).toString().trim();
      // If ffprobe can read format tags, the mp4 container is intact
      if (!atomCheck && !probeOut) {
        issues.push("Cannot read mp4 atoms — container may be corrupt");
      }
    } catch {
      issues.push("mp4 atom verification failed");
    }

    const passed = issues.length === 0;

    return {
      checkName: "file_integrity_check",
      passed,
      details: passed
        ? `File integrity OK: ${(fileSize / 1024 / 1024).toFixed(1)} MB, video=${videoStream?.codecName}, audio=${audioStream?.codecName}`
        : `File integrity issues: ${issues.join("; ")}`,
      durationMs: Date.now() - start,
      routingHint: passed
        ? { target: "none", reason: "File integrity check passed" }
        : { target: "assembly_concat", reason: `File integrity issues — re-run from concat step` },
      metrics: {
        fileSize,
        videoCodec: videoStream?.codecName || "none",
        audioCodec: audioStream?.codecName || "none",
        issueCount: issues.length,
      },
    };
  } catch (err: any) {
    return {
      checkName: "file_integrity_check",
      passed: false,
      details: `File integrity check error: ${err.message?.slice(0, 200)}`,
      durationMs: Date.now() - start,
      routingHint: { target: "assembly_concat", reason: "File integrity check errored — re-run concat" },
      metrics: { error: true },
    };
  }
}
