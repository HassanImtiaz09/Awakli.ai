/**
 * Robust Kling Lip Sync Processor
 *
 * RULES:
 * 1. Audio MUST be padded to at least 3 seconds (not 2s) for Kling's minimum requirement.
 * 2. `sound_end_time` MUST be set to `floor(actual_duration_ms) - 50` to avoid
 *    exceeding the audio boundary.
 * 3. The face's visible window MUST overlap the audio insertion point by at least
 *    2 seconds. If not, the panel is skipped with a clear warning.
 *
 * Flow per dialogue panel:
 *   1. Pad voice audio to >= 3 seconds
 *   2. Upload video clip + padded audio to S3
 *   3. Call Kling identify-face → get face_id + visible window
 *   4. Validate face overlap >= 2s with audio insertion
 *   5. Call Kling advanced-lip-sync with safe sound_end_time
 *   6. Poll until complete → download lip-synced clip
 *   7. Return result or skip reason
 */

import { ENV } from "../_core/env";
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";

const execFileAsync = promisify(execFile);

// ─── Constants ──────────────────────────────────────────────────────────────

const KLING_BASE_URL = "https://api-singapore.klingai.com";
const TOKEN_TTL_SECONDS = 1800;

/** Minimum audio duration for Kling lip sync (seconds) */
export const MIN_AUDIO_DURATION_SECONDS = 3.0;

/** Safety margin subtracted from audio duration for sound_end_time (ms) */
export const SOUND_END_TIME_SAFETY_MARGIN_MS = 50;

/** Minimum overlap between face visible window and audio insertion (ms) */
export const MIN_FACE_AUDIO_OVERLAP_MS = 2000;

/** Maximum polling time for a lip sync task (ms) */
export const MAX_POLL_TIME_MS = 5 * 60 * 1000; // 5 minutes

/** Polling interval (ms) */
export const POLL_INTERVAL_MS = 5000;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LipSyncPanelInput {
  /** Panel identifier */
  panelId: number | string;
  /** Character name (for logging and face selection) */
  character: string;
  /** Dialogue text (for logging) */
  dialogueText: string;
  /** Path to the video clip file */
  videoClipPath: string;
  /** Path to the voice audio file */
  voiceAudioPath: string;
  /** URL of the video clip (if already uploaded to S3) */
  videoClipUrl?: string;
  /** URL of the voice audio (if already uploaded to S3) */
  voiceAudioUrl?: string;
  /** Audio insertion time in the video (ms, default: 0) */
  audioInsertTimeMs?: number;
  /** Voice volume multiplier (default: 2) */
  voiceVolume?: number;
  /** Original audio volume (default: 0 = mute original) */
  originalAudioVolume?: number;
}

export interface FaceDetectionResult {
  sessionId: string;
  faces: Array<{
    faceId: number | string;
    startTimeMs: number;
    endTimeMs: number;
  }>;
}

export interface LipSyncPanelResult {
  /** Panel identifier */
  panelId: number | string;
  /** Whether lip sync was successful */
  success: boolean;
  /** Path to the lip-synced video clip (if successful) */
  outputPath?: string;
  /** URL of the lip-synced video (from Kling CDN) */
  outputUrl?: string;
  /** Kling task ID */
  taskId?: string;
  /** Skip reason if not successful */
  skipReason?: string;
  /** Face detection details */
  faceDetection?: FaceDetectionResult;
  /** Processing time in ms */
  processingTimeMs?: number;
}

export interface LipSyncBatchResult {
  /** Total panels attempted */
  totalPanels: number;
  /** Number of successful lip syncs */
  successCount: number;
  /** Number of skipped panels */
  skippedCount: number;
  /** Per-panel results */
  panels: LipSyncPanelResult[];
  /** Summary message */
  summary: string;
}

// ─── JWT Token Generation ───────────────────────────────────────────────────

async function generateKlingToken(): Promise<string> {
  const accessKey = ENV.klingAccessKey;
  const secretKey = ENV.klingSecretKey;

  if (!accessKey || !secretKey) {
    throw new Error("Kling AI credentials not configured");
  }

  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: accessKey,
    exp: now + TOKEN_TTL_SECONDS,
    nbf: now - 5,
    iat: now,
  };

  const encode = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");

  const headerB64 = encode(header);
  const payloadB64 = encode(payload);
  const signingInput = `${headerB64}.${payloadB64}`;

  const { createHmac } = await import("crypto");
  const signature = createHmac("sha256", secretKey)
    .update(signingInput)
    .digest("base64url");

  return `${signingInput}.${signature}`;
}

// ─── HTTP Helper ────────────────────────────────────────────────────────────

async function klingRequest<T>(
  method: "GET" | "POST",
  apiPath: string,
  body?: Record<string, unknown>,
  timeoutMs = 30000,
): Promise<T> {
  const token = await generateKlingToken();
  const url = `${KLING_BASE_URL}${apiPath}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Kling ${method} ${apiPath}: ${res.status} ${text.substring(0, 300)}`);
    }

    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Audio Padding ──────────────────────────────────────────────────────────

/**
 * Pad an audio file to at least MIN_AUDIO_DURATION_SECONDS.
 * Returns the path to the padded file and its exact duration in ms.
 *
 * RULE: Audio must be >= 3 seconds for Kling lip sync.
 */
export async function padAudioForLipSync(
  inputPath: string,
  outputPath: string,
  minDurationSeconds: number = MIN_AUDIO_DURATION_SECONDS,
): Promise<{ paddedPath: string; durationMs: number }> {
  // Get current duration
  const { stdout: durStr } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "csv=p=0",
    inputPath,
  ]);
  const currentDuration = parseFloat(durStr.trim()) || 0;

  if (currentDuration >= minDurationSeconds) {
    // Already long enough — just copy and convert to consistent format
    await execFileAsync("ffmpeg", [
      "-y", "-i", inputPath,
      "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le",
      outputPath,
    ], { timeout: 30000 });
  } else {
    // Pad with silence to reach minimum duration
    await execFileAsync("ffmpeg", [
      "-y", "-i", inputPath,
      "-af", `apad=whole_dur=${minDurationSeconds}`,
      "-t", minDurationSeconds.toFixed(1),
      "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le",
      outputPath,
    ], { timeout: 30000 });
  }

  // Convert to MP3 for upload (Kling accepts mp3/wav/m4a/aac)
  const mp3Path = outputPath.replace(/\.\w+$/, ".mp3");
  await execFileAsync("ffmpeg", [
    "-y", "-i", outputPath,
    "-c:a", "libmp3lame", "-b:a", "128k",
    mp3Path,
  ], { timeout: 30000 });

  // Get exact duration of the MP3
  const { stdout: mp3DurStr } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "csv=p=0",
    mp3Path,
  ]);
  const mp3DurationMs = Math.floor(parseFloat(mp3DurStr.trim()) * 1000);

  return { paddedPath: mp3Path, durationMs: mp3DurationMs };
}

// ─── Face Detection ─────────────────────────────────────────────────────────

/**
 * Detect faces in a video clip using Kling's identify-face API.
 */
export async function detectFaces(
  videoUrl: string,
): Promise<FaceDetectionResult> {
  const result = await klingRequest<{
    code: number;
    message: string;
    data?: {
      session_id: string;
      face_data?: Array<{
        face_id: number;
        start_time: number;
        end_time: number;
      }>;
    };
  }>("POST", "/v1/videos/identify-face", { video_url: videoUrl });

  if (result.code !== 0 || !result.data) {
    return { sessionId: "", faces: [] };
  }

  return {
    sessionId: result.data.session_id,
    faces: (result.data.face_data || []).map((f) => ({
      faceId: f.face_id,
      startTimeMs: f.start_time,
      endTimeMs: f.end_time,
    })),
  };
}

// ─── Face-Audio Overlap Validation ──────────────────────────────────────────

/**
 * Validate that a face's visible window overlaps the audio insertion point
 * by at least MIN_FACE_AUDIO_OVERLAP_MS.
 *
 * RULE: The overlapping period between audio and the face's visible window
 * must be at least 2 seconds.
 *
 * @returns The overlap duration in ms, or 0 if no overlap
 */
export function calculateFaceAudioOverlap(
  faceStartMs: number,
  faceEndMs: number,
  audioInsertMs: number,
  audioDurationMs: number,
): number {
  const audioEndMs = audioInsertMs + audioDurationMs;

  // Calculate overlap between [faceStart, faceEnd] and [audioInsert, audioEnd]
  const overlapStart = Math.max(faceStartMs, audioInsertMs);
  const overlapEnd = Math.min(faceEndMs, audioEndMs);
  const overlap = Math.max(0, overlapEnd - overlapStart);

  return overlap;
}

/**
 * Select the best face for a given character in a multi-face scene.
 * For single-face clips, returns the only face.
 * For multi-face clips, selects based on character hints.
 */
export function selectFaceForCharacter(
  faces: FaceDetectionResult["faces"],
  _character: string,
  audioInsertMs: number,
  audioDurationMs: number,
): {
  selectedFace: FaceDetectionResult["faces"][0] | null;
  overlapMs: number;
  reason: string;
} {
  if (faces.length === 0) {
    return { selectedFace: null, overlapMs: 0, reason: "No faces detected" };
  }

  // Score each face by overlap with audio window
  const scored = faces.map((face) => {
    const overlap = calculateFaceAudioOverlap(
      face.startTimeMs,
      face.endTimeMs,
      audioInsertMs,
      audioDurationMs,
    );
    return { face, overlap };
  });

  // Sort by overlap (descending)
  scored.sort((a, b) => b.overlap - a.overlap);

  const best = scored[0];

  if (best.overlap < MIN_FACE_AUDIO_OVERLAP_MS) {
    return {
      selectedFace: best.face,
      overlapMs: best.overlap,
      reason: `Best face (${best.face.faceId}) has only ${best.overlap}ms overlap ` +
        `with audio (minimum: ${MIN_FACE_AUDIO_OVERLAP_MS}ms). ` +
        `Face visible: ${best.face.startTimeMs}-${best.face.endTimeMs}ms, ` +
        `audio: ${audioInsertMs}-${audioInsertMs + audioDurationMs}ms`,
    };
  }

  return {
    selectedFace: best.face,
    overlapMs: best.overlap,
    reason: `Selected face ${best.face.faceId} with ${best.overlap}ms overlap`,
  };
}

// ─── Lip Sync Task ──────────────────────────────────────────────────────────

/**
 * Create and poll a Kling advanced lip sync task.
 *
 * RULE: sound_end_time = floor(actual_duration_ms) - SOUND_END_TIME_SAFETY_MARGIN_MS
 */
async function createAndPollLipSync(
  sessionId: string,
  faceId: number | string,
  voiceUrl: string,
  audioDurationMs: number,
  audioInsertTimeMs: number = 0,
  voiceVolume: number = 2,
  originalAudioVolume: number = 0,
): Promise<{ success: boolean; videoUrl?: string; taskId?: string; error?: string }> {
  // RULE: sound_end_time = floor(duration_ms) - safety margin
  const soundEndTime = audioDurationMs - SOUND_END_TIME_SAFETY_MARGIN_MS;

  if (soundEndTime <= 0) {
    return { success: false, error: `Audio too short: ${audioDurationMs}ms` };
  }

  console.log(
    `[LipSync] Creating task: face=${faceId}, audio=${audioDurationMs}ms, ` +
    `end_time=${soundEndTime}ms, insert=${audioInsertTimeMs}ms`
  );

  const createResult = await klingRequest<{
    code: number;
    message: string;
    data?: { task_id: string; task_status: string; task_status_msg?: string };
  }>("POST", "/v1/videos/advanced-lip-sync", {
    session_id: sessionId,
    face_choose: [{
      face_id: String(faceId),
      sound_file: voiceUrl,
      sound_start_time: 0,
      sound_end_time: soundEndTime,
      sound_insert_time: audioInsertTimeMs,
      sound_volume: voiceVolume,
      original_audio_volume: originalAudioVolume,
    }],
  });

  if (createResult.code !== 0 || !createResult.data?.task_id) {
    return {
      success: false,
      error: `Lip sync creation failed: ${createResult.message}`,
    };
  }

  const taskId = createResult.data.task_id;
  console.log(`[LipSync] Task created: ${taskId}`);

  // Poll until complete
  const startTime = Date.now();
  while (Date.now() - startTime < MAX_POLL_TIME_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const statusResult = await klingRequest<{
      code: number;
      data?: {
        task_status: string;
        task_status_msg?: string;
        task_result?: { videos?: Array<{ url: string }> };
      };
    }>("GET", `/v1/videos/advanced-lip-sync/${taskId}`);

    const status = statusResult.data?.task_status;

    if (status === "succeed") {
      const videos = statusResult.data?.task_result?.videos;
      if (videos && videos.length > 0) {
        return { success: true, videoUrl: videos[0].url, taskId };
      }
      return { success: false, taskId, error: "Task succeeded but no video returned" };
    }

    if (status === "failed") {
      return {
        success: false,
        taskId,
        error: `Lip sync failed: ${statusResult.data?.task_status_msg || "unknown"}`,
      };
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    if (elapsed % 30 === 0) {
      console.log(`[LipSync] Task ${taskId}: ${status} (${elapsed}s)`);
    }
  }

  return { success: false, taskId, error: `Timed out after ${MAX_POLL_TIME_MS / 1000}s` };
}

// ─── Main: Process Single Panel ─────────────────────────────────────────────

/**
 * Process a single dialogue panel for lip sync.
 *
 * Applies all three rules:
 * 1. Pads audio to >= 3 seconds
 * 2. Uses floor(duration_ms) - 50 for sound_end_time
 * 3. Validates face-audio overlap >= 2 seconds
 *
 * @param input - Panel input with video clip, voice audio, and metadata
 * @param workDir - Working directory for intermediate files
 * @param uploadFn - Function to upload files to S3 (returns URL)
 * @returns Result with success/skip status and output path
 */
export async function processLipSyncPanel(
  input: LipSyncPanelInput,
  workDir: string,
  uploadFn: (localPath: string, s3Key: string, contentType: string) => Promise<string>,
): Promise<LipSyncPanelResult> {
  const startTime = Date.now();
  const panelLabel = `${input.panelId} [${input.character}]`;

  console.log(`[LipSync] Processing ${panelLabel}: "${input.dialogueText}"`);

  try {
    await fs.mkdir(workDir, { recursive: true });

    // Step 1: Upload video clip to S3 (if not already uploaded)
    let videoUrl = input.videoClipUrl;
    if (!videoUrl) {
      videoUrl = await uploadFn(
        input.videoClipPath,
        `lipsync/${input.panelId}_clip.mp4`,
        "video/mp4",
      );
    }

    // Step 2: Pad audio to >= 3 seconds (RULE 1)
    const paddedWavPath = path.join(workDir, `${input.panelId}_padded.wav`);
    const { paddedPath: paddedMp3Path, durationMs: audioDurationMs } =
      await padAudioForLipSync(input.voiceAudioPath, paddedWavPath);

    console.log(
      `[LipSync] ${panelLabel}: Audio padded to ${(audioDurationMs / 1000).toFixed(2)}s ` +
      `(min: ${MIN_AUDIO_DURATION_SECONDS}s)`
    );

    // Upload padded audio to S3
    let voiceUrl = input.voiceAudioUrl;
    if (!voiceUrl) {
      voiceUrl = await uploadFn(
        paddedMp3Path,
        `lipsync/${input.panelId}_voice.mp3`,
        "audio/mpeg",
      );
    }

    // Step 3: Detect faces
    console.log(`[LipSync] ${panelLabel}: Detecting faces...`);
    const faceResult = await detectFaces(videoUrl);

    if (faceResult.faces.length === 0) {
      return {
        panelId: input.panelId,
        success: false,
        skipReason: "No faces detected in video clip",
        faceDetection: faceResult,
        processingTimeMs: Date.now() - startTime,
      };
    }

    console.log(
      `[LipSync] ${panelLabel}: ${faceResult.faces.length} face(s) detected, ` +
      `session: ${faceResult.sessionId}`
    );

    // Step 4: Select face and validate overlap (RULE 3)
    const audioInsertMs = input.audioInsertTimeMs ?? 0;
    const { selectedFace, overlapMs, reason } = selectFaceForCharacter(
      faceResult.faces,
      input.character,
      audioInsertMs,
      audioDurationMs,
    );

    if (!selectedFace || overlapMs < MIN_FACE_AUDIO_OVERLAP_MS) {
      return {
        panelId: input.panelId,
        success: false,
        skipReason: `Insufficient face-audio overlap: ${reason}`,
        faceDetection: faceResult,
        processingTimeMs: Date.now() - startTime,
      };
    }

    console.log(`[LipSync] ${panelLabel}: ${reason}`);

    // Step 5: Create lip sync task (RULE 2: safe sound_end_time)
    const lipSyncResult = await createAndPollLipSync(
      faceResult.sessionId,
      selectedFace.faceId,
      voiceUrl,
      audioDurationMs,
      audioInsertMs,
      input.voiceVolume ?? 2,
      input.originalAudioVolume ?? 0,
    );

    if (!lipSyncResult.success || !lipSyncResult.videoUrl) {
      return {
        panelId: input.panelId,
        success: false,
        skipReason: lipSyncResult.error || "Lip sync task failed",
        taskId: lipSyncResult.taskId,
        faceDetection: faceResult,
        processingTimeMs: Date.now() - startTime,
      };
    }

    // Step 6: Download lip-synced clip
    const outputPath = path.join(workDir, `${input.panelId}_lipsync.mp4`);
    await execFileAsync("curl", ["-sL", "-o", outputPath, lipSyncResult.videoUrl], {
      timeout: 60000,
    });

    console.log(
      `[LipSync] ${panelLabel}: Complete in ${Math.round((Date.now() - startTime) / 1000)}s`
    );

    return {
      panelId: input.panelId,
      success: true,
      outputPath,
      outputUrl: lipSyncResult.videoUrl,
      taskId: lipSyncResult.taskId,
      faceDetection: faceResult,
      processingTimeMs: Date.now() - startTime,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[LipSync] ${panelLabel}: Error — ${errorMsg}`);

    return {
      panelId: input.panelId,
      success: false,
      skipReason: `Error: ${errorMsg}`,
      processingTimeMs: Date.now() - startTime,
    };
  }
}

// ─── Main: Process Batch ────────────────────────────────────────────────────

/**
 * Process multiple dialogue panels for lip sync.
 * Panels are processed sequentially to avoid rate limiting.
 *
 * @param panels - Array of panel inputs
 * @param workDir - Working directory for intermediate files
 * @param uploadFn - Function to upload files to S3
 * @returns Batch result with per-panel outcomes
 */
export async function processLipSyncBatch(
  panels: LipSyncPanelInput[],
  workDir: string,
  uploadFn: (localPath: string, s3Key: string, contentType: string) => Promise<string>,
): Promise<LipSyncBatchResult> {
  const results: LipSyncPanelResult[] = [];

  for (const panel of panels) {
    const panelWorkDir = path.join(workDir, String(panel.panelId));
    const result = await processLipSyncPanel(panel, panelWorkDir, uploadFn);
    results.push(result);
  }

  const successCount = results.filter((r) => r.success).length;
  const skippedCount = results.length - successCount;

  const skippedDetails = results
    .filter((r) => !r.success)
    .map((r) => `${r.panelId}: ${r.skipReason}`)
    .join("; ");

  const summary = successCount === panels.length
    ? `Lip sync complete: all ${successCount} panels processed successfully`
    : `Lip sync: ${successCount}/${panels.length} succeeded, ${skippedCount} skipped` +
      (skippedDetails ? ` (${skippedDetails})` : "");

  console.log(`[LipSync] ${summary}`);

  return {
    totalPanels: panels.length,
    successCount,
    skippedCount,
    panels: results,
    summary,
  };
}
