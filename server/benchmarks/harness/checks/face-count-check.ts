/**
 * H1 · faceCountCheck
 *
 * Extract midpoint frame from each dialogue slice, run anime-face-detector.
 * FAIL if any dialogue slice has < 1 detected face on its midpoint frame.
 *
 * Uses a Python-based anime face detection approach (opencv cascade or
 * lbpcascade_animeface). Falls back to generic face detection if the
 * anime-specific cascade is not available.
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import type { HarnessCheckResult } from "../types.js";

export interface FaceCountCheckOptions {
  videoPath: string;
  /** Slice metadata: which slices are dialogue and their time offsets */
  dialogueSlices: Array<{
    sliceId: number;
    startSec: number;
    durationSec: number;
    isDialogue: boolean;
  }>;
  /** Title card duration to offset slice times */
  titleCardDurationSec: number;
  /** Temp directory for extracted frames */
  tempDir: string;
  /** Minimum face count per dialogue slice (default: 1) */
  minFaces?: number;
}

interface SliceFaceResult {
  sliceId: number;
  faceCount: number;
  passed: boolean;
  framePath: string;
}

export function runFaceCountCheck(options: FaceCountCheckOptions): HarnessCheckResult {
  const start = Date.now();
  const {
    videoPath,
    dialogueSlices,
    titleCardDurationSec,
    tempDir,
    minFaces = 1,
  } = options;

  try {
    fs.mkdirSync(tempDir, { recursive: true });

    const dialogueOnly = dialogueSlices.filter((s) => s.isDialogue);
    if (dialogueOnly.length === 0) {
      return {
        checkName: "face_count_check",
        passed: true,
        details: "No dialogue slices to check",
        durationMs: Date.now() - start,
        routingHint: { target: "none", reason: "No dialogue slices" },
      };
    }

    const results: SliceFaceResult[] = [];

    for (const slice of dialogueOnly) {
      const midpointSec = titleCardDurationSec + slice.startSec + (slice.durationSec / 2);
      const framePath = path.join(tempDir, `face_check_slice_${slice.sliceId}.png`);

      // Extract midpoint frame
      try {
        execSync(
          `ffmpeg -y -ss ${midpointSec.toFixed(2)} -i "${videoPath}" -vframes 1 -q:v 2 "${framePath}" 2>/dev/null`,
          { timeout: 10000 }
        );
      } catch {
        results.push({ sliceId: slice.sliceId, faceCount: 0, passed: false, framePath });
        continue;
      }

      if (!fs.existsSync(framePath)) {
        results.push({ sliceId: slice.sliceId, faceCount: 0, passed: false, framePath });
        continue;
      }

      // Detect faces using Python + OpenCV
      // Uses lbpcascade_animeface if available, falls back to haarcascade_frontalface
      let faceCount = 0;
      try {
        const pythonScript = `
import cv2, sys, os
img = cv2.imread("${framePath}")
if img is None:
    print("0")
    sys.exit(0)
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
# Try anime face cascade first
anime_cascade_path = "/usr/share/opencv4/lbpcascades/lbpcascade_animeface.xml"
if not os.path.exists(anime_cascade_path):
    anime_cascade_path = None
# Fall back to frontal face
cascade_path = anime_cascade_path or cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
cascade = cv2.CascadeClassifier(cascade_path)
faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=3, minSize=(30, 30))
print(len(faces))
`;
        const scriptPath = path.join(tempDir, `face_detect_${slice.sliceId}.py`);
        fs.writeFileSync(scriptPath, pythonScript);
        const countStr = execSync(`python3 "${scriptPath}" 2>/dev/null`, { timeout: 15000 }).toString().trim();
        faceCount = parseInt(countStr) || 0;
      } catch {
        // If Python detection fails, assume 0 faces
        faceCount = 0;
      }

      results.push({
        sliceId: slice.sliceId,
        faceCount,
        passed: faceCount >= minFaces,
        framePath,
      });
    }

    const failedSlices = results.filter((r) => !r.passed);
    const passed = failedSlices.length === 0;

    // Route to the first failed slice for targeted regeneration
    const firstFailed = failedSlices[0];

    return {
      checkName: "face_count_check",
      passed,
      details: passed
        ? `All ${results.length} dialogue slices have ≥${minFaces} face(s) detected`
        : `${failedSlices.length} dialogue slice(s) have <${minFaces} face(s): ${failedSlices.map((f) => `slice ${f.sliceId} (${f.faceCount} faces)`).join(", ")}`,
      durationMs: Date.now() - start,
      routingHint: passed
        ? { target: "none", reason: "Face count check passed" }
        : {
            target: "slice_video_regen",
            sliceId: firstFailed?.sliceId,
            reason: `Slice ${firstFailed?.sliceId} has ${firstFailed?.faceCount} face(s) — regenerate video`,
          },
      metrics: {
        totalDialogueSlices: results.length,
        failedSlices: failedSlices.length,
        sliceResults: JSON.stringify(results.map((r) => ({ sliceId: r.sliceId, faceCount: r.faceCount, passed: r.passed }))),
      },
    };
  } catch (err: any) {
    return {
      checkName: "face_count_check",
      passed: false,
      details: `Face count check error: ${err.message?.slice(0, 200)}`,
      durationMs: Date.now() - start,
      routingHint: { target: "slice_video_regen", reason: "Face count check errored" },
      metrics: { error: true },
    };
  }
}
