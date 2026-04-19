/**
 * Automated Lip Sync Pipeline Node
 *
 * Integrates the lip sync processor into the production pipeline as a dedicated node
 * that runs between voice_gen and music_gen. Automatically:
 *
 * 1. Identifies dialogue panels by matching voice_clip assets to video_clip assets
 * 2. Downloads video clips and voice clips to local working directory
 * 3. Runs face detection + lip sync via Kling API (with 3s padding, overlap validation)
 * 4. Stores lip-synced clips as pipeline_assets (assetType: "synced_clip")
 * 5. Assembly pipeline automatically prefers synced_clip over video_clip for those panels
 *
 * Gated by `enableLipSync` in assembly settings (default: false).
 * Non-blocking: failures are logged but don't halt the pipeline.
 */

import { storagePut } from "./storage";
import {
  processLipSyncPanel,
  type LipSyncPanelInput,
  type LipSyncPanelResult,
} from "./pipeline/lipSyncProcessor";
import {
  getPipelineAssetsByRun,
  createPipelineAsset,
  getPanelsByEpisode,
  getCharactersByProject,
  getEpisodeById,
} from "./db";
import { nanoid } from "nanoid";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { pipelineLog } from "./observability/logger";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum concurrent lip sync tasks (sequential to avoid Kling rate limits) */
const MAX_CONCURRENT = 1;

/** Cost per lip sync panel in cents (face detection + lip sync API call) */
const COST_PER_PANEL_CENTS = 15;

/** Minimum voice clip duration to attempt lip sync (seconds) */
const MIN_VOICE_DURATION_SECONDS = 0.5;

/** Maximum retry attempts per panel before escalating to manual review */
export const MAX_RETRY_ATTEMPTS = 3;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LipSyncNodeOptions {
  /** Target LUFS for voice in lip-synced output (default: -14) */
  targetLufs?: number;
  /** Voice volume multiplier for Kling (default: 2) */
  voiceVolume?: number;
  /** Original audio volume (default: 0 = mute) */
  originalAudioVolume?: number;
  /** Skip panels where video already has native lip sync (default: true) */
  skipNativeLipSync?: boolean;
}

export interface LipSyncNodeResult {
  /** Number of dialogue panels identified */
  dialoguePanelsFound: number;
  /** Number of panels that already had native lip sync (skipped) */
  nativeLipSyncSkipped: number;
  /** Number of panels submitted for lip sync */
  panelsSubmitted: number;
  /** Number of successful lip syncs */
  panelsSucceeded: number;
  /** Number of panels that failed or were skipped */
  panelsFailed: number;
  /** Number of panels that exceeded retry limit and need manual review */
  panelsNeedingReview: number;
  /** Per-panel results */
  results: LipSyncPanelResult[];
  /** Total cost in cents */
  totalCostCents: number;
  /** Summary message */
  summary: string;
  /** Processing time in milliseconds */
  processingTimeMs: number;
}

interface DialoguePanelMatch {
  panelId: number;
  panelNumber: number;
  sceneNumber: number;
  character: string;
  dialogueText: string;
  videoAssetId: number;
  videoUrl: string;
  voiceAssetId: number;
  voiceUrl: string;
  hasNativeLipSync: boolean;
  voiceDuration: number;
}

// ─── Upload Helper ──────────────────────────────────────────────────────────

async function uploadToS3(
  localPath: string,
  s3Key: string,
  contentType: string,
): Promise<string> {
  const fileBuffer = await fs.readFile(localPath);
  const { url } = await storagePut(s3Key, fileBuffer, contentType);
  return url;
}

// ─── Download Helper ────────────────────────────────────────────────────────

async function downloadFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(destPath, buffer);
}

// ─── Dialogue Panel Matching ────────────────────────────────────────────────

/**
 * Match voice_clip assets to video_clip assets by panelId to identify
 * which panels have dialogue and need lip sync.
 */
export async function identifyDialoguePanels(
  runId: number,
  episodeId: number,
): Promise<DialoguePanelMatch[]> {
  const allAssets = await getPipelineAssetsByRun(runId);
  const panels = await getPanelsByEpisode(episodeId);

  // Index video clips by panelId
  const videoClipsByPanel = new Map<number, any>();
  for (const asset of allAssets) {
    if (asset.assetType === "video_clip" && asset.panelId) {
      videoClipsByPanel.set(asset.panelId, asset);
    }
  }

  // Index voice clips by panelId
  const voiceClipsByPanel = new Map<number, any>();
  for (const asset of allAssets) {
    if (asset.assetType === "voice_clip" && asset.panelId) {
      voiceClipsByPanel.set(asset.panelId, asset);
    }
  }

  const matches: DialoguePanelMatch[] = [];

  for (const panel of panels) {
    const videoAsset = videoClipsByPanel.get(panel.id);
    const voiceAsset = voiceClipsByPanel.get(panel.id);

    if (!videoAsset || !voiceAsset) continue;

    // Extract dialogue text from panel
    const dialogue = panel.dialogue as any;
    let dialogueText = "";
    let character = "Unknown";

    if (Array.isArray(dialogue)) {
      dialogueText = dialogue.map((d: any) => d.text || d.line || d).join(". ");
      character = dialogue[0]?.character || dialogue[0]?.speaker || "Unknown";
    } else if (typeof dialogue === "string") {
      dialogueText = dialogue;
    } else if (dialogue && typeof dialogue === "object") {
      dialogueText = dialogue.text || dialogue.line || JSON.stringify(dialogue);
      character = dialogue.character || dialogue.speaker || "Unknown";
    }

    if (!dialogueText.trim()) continue;

    const videoMeta = (videoAsset.metadata || {}) as any;
    const voiceMeta = (voiceAsset.metadata || {}) as any;

    matches.push({
      panelId: panel.id,
      panelNumber: panel.panelNumber,
      sceneNumber: panel.sceneNumber,
      character,
      dialogueText: dialogueText.slice(0, 200),
      videoAssetId: videoAsset.id,
      videoUrl: videoAsset.url,
      voiceAssetId: voiceAsset.id,
      voiceUrl: voiceAsset.url,
      hasNativeLipSync: videoMeta.hasNativeLipSync === true || videoMeta.hasLipSync === true,
      voiceDuration: voiceMeta.duration || 0,
    });
  }

  // Sort by scene number, then panel number
  matches.sort((a, b) => a.sceneNumber - b.sceneNumber || a.panelNumber - b.panelNumber);

  return matches;
}

// ─── Retry Failed Panels ───────────────────────────────────────────────────

/**
 * Retry lip sync for specific panels that previously failed.
 * Deletes old synced_clip assets for those panels and re-runs lip sync.
 *
 * @param runId - Pipeline run ID
 * @param episodeId - Episode ID
 * @param panelIds - Array of panel IDs to retry
 * @param options - Lip sync configuration
 * @param onProgress - Optional callback for per-panel progress updates
 * @returns Result with per-panel outcomes
 */
export async function retryFailedLipSync(
  runId: number,
  episodeId: number,
  panelIds: number[],
  options: LipSyncNodeOptions = {},
  onProgress?: (panelId: number, status: "started" | "success" | "failed", detail?: string) => void,
): Promise<LipSyncNodeResult> {
  const {
    voiceVolume = 2,
    originalAudioVolume = 0,
  } = options;

  const startTime = Date.now();
  pipelineLog.info(`[LipSync Retry] Retrying ${panelIds.length} panels for run ${runId}`);

  // Step 1: Get all dialogue panels for this run
  const allDialoguePanels = await identifyDialoguePanels(runId, episodeId);

  // Step 2: Filter to only the requested panel IDs
  const panelsToRetry = allDialoguePanels.filter((p) => panelIds.includes(p.panelId));

  if (panelsToRetry.length === 0) {
    return {
      dialoguePanelsFound: allDialoguePanels.length,
      nativeLipSyncSkipped: 0,
      panelsSubmitted: 0,
      panelsSucceeded: 0,
      panelsFailed: 0,
      panelsNeedingReview: 0,
      results: [],
      totalCostCents: 0,
      summary: `No matching dialogue panels found for IDs: ${panelIds.join(", ")}`,
      processingTimeMs: Date.now() - startTime,
    };
  }

  // Step 2b: Check retry counts — block panels that exceeded MAX_RETRY_ATTEMPTS
  const allAssets = await getPipelineAssetsByRun(runId);
  const retryCountByPanel = new Map<number, number>();
  for (const asset of allAssets) {
    if (asset.assetType === "synced_clip" && asset.panelId) {
      const meta = (asset.metadata || {}) as any;
      const count = meta.retryCount || (meta.isRetry ? 1 : 0);
      const existing = retryCountByPanel.get(asset.panelId) || 0;
      retryCountByPanel.set(asset.panelId, Math.max(existing, count));
    }
  }

  const blockedPanels: number[] = [];
  const allowedPanels: typeof panelsToRetry = [];
  for (const panel of panelsToRetry) {
    const currentCount = retryCountByPanel.get(panel.panelId) || 0;
    if (currentCount >= MAX_RETRY_ATTEMPTS) {
      blockedPanels.push(panel.panelId);
      pipelineLog.warn(
        `[LipSync Retry] Panel ${panel.panelId} blocked — already retried ${currentCount} times (max: ${MAX_RETRY_ATTEMPTS}). Needs manual review.`
      );
      onProgress?.(panel.panelId, "failed", `Exceeded max retries (${MAX_RETRY_ATTEMPTS}). Needs manual review.`);
    } else {
      allowedPanels.push(panel);
    }
  }

  if (allowedPanels.length === 0) {
    return {
      dialoguePanelsFound: allDialoguePanels.length,
      nativeLipSyncSkipped: 0,
      panelsSubmitted: 0,
      panelsSucceeded: 0,
      panelsFailed: 0,
      panelsNeedingReview: blockedPanels.length,
      results: blockedPanels.map((id) => ({
        panelId: id,
        success: false,
        skipReason: `Exceeded max retries (${MAX_RETRY_ATTEMPTS}). Needs manual review.`,
        processingTimeMs: 0,
      })),
      totalCostCents: 0,
      summary: `All ${blockedPanels.length} panel(s) exceeded retry limit (${MAX_RETRY_ATTEMPTS}). Manual review required.`,
      processingTimeMs: Date.now() - startTime,
    };
  }

  // Step 3: Delete old synced_clip assets for allowed panels
  const { deletePipelineAssetsByPanelAndType } = await import("./db");
  for (const panel of allowedPanels) {
    await deletePipelineAssetsByPanelAndType(runId, panel.panelId, "synced_clip");
    pipelineLog.info(`[LipSync Retry] Deleted old synced_clip for panel ${panel.panelId}`);
  }

  // Step 4: Create working directory
  const workDir = path.join(os.tmpdir(), `lipsync-retry-${runId}-${nanoid(6)}`);
  await fs.mkdir(workDir, { recursive: true });

  const results: LipSyncPanelResult[] = [];
  let totalCostCents = 0;

  try {
    // Step 5: Process each allowed panel sequentially
    for (let i = 0; i < allowedPanels.length; i++) {
      const panel = allowedPanels[i];
      const currentRetryCount = (retryCountByPanel.get(panel.panelId) || 0) + 1;
      const panelLabel = `P${panel.sceneNumber}.${panel.panelNumber} [${panel.character}] (attempt ${currentRetryCount}/${MAX_RETRY_ATTEMPTS})`;
      const panelWorkDir = path.join(workDir, `panel-${panel.panelId}`);
      await fs.mkdir(panelWorkDir, { recursive: true });

      pipelineLog.info(
        `[LipSync Retry] Processing ${i + 1}/${allowedPanels.length}: ` +
        `${panelLabel} — "${panel.dialogueText.slice(0, 50)}..."`
      );

      onProgress?.(panel.panelId, "started", panelLabel);

      try {
        // Download video clip
        const videoPath = path.join(panelWorkDir, `video.mp4`);
        await downloadFile(panel.videoUrl, videoPath);

        // Download voice clip
        const voicePath = path.join(panelWorkDir, `voice.mp3`);
        await downloadFile(panel.voiceUrl, voicePath);

        // Build lip sync input
        const input: LipSyncPanelInput = {
          panelId: panel.panelId,
          character: panel.character,
          dialogueText: panel.dialogueText,
          videoClipPath: videoPath,
          voiceAudioPath: voicePath,
          audioInsertTimeMs: 0,
          voiceVolume,
          originalAudioVolume,
        };

        // Run face detection + lip sync
        const result = await processLipSyncPanel(input, panelWorkDir, uploadToS3);
        results.push(result);

        if (result.success && result.outputUrl) {
          // Store lip-synced clip as pipeline asset
          const s3Key = `pipeline/${runId}/lipsync-retry-${panel.panelId}-${nanoid(6)}.mp4`;

          let storedUrl = result.outputUrl;
          if (result.outputPath) {
            try {
              storedUrl = await uploadToS3(result.outputPath, s3Key, "video/mp4");
            } catch (uploadErr) {
              pipelineLog.warn(
                `[LipSync Retry] S3 upload failed for ${panelLabel}, using Kling CDN URL`,
                { error: String(uploadErr) }
              );
            }
          }

          await createPipelineAsset({
            pipelineRunId: runId,
            episodeId,
            panelId: panel.panelId,
            assetType: "synced_clip",
            url: storedUrl,
            metadata: {
              panelNumber: panel.panelNumber,
              sceneNumber: panel.sceneNumber,
              character: panel.character,
              dialogueText: panel.dialogueText.slice(0, 100),
              hasLipSync: true,
              lipSyncMethod: "kling_advanced",
              faceCount: result.faceDetection?.faces.length || 0,
              processingTimeMs: result.processingTimeMs,
              originalVideoAssetId: panel.videoAssetId,
              originalVoiceAssetId: panel.voiceAssetId,
              isRetry: true,
              retryCount: currentRetryCount,
            } as any,
            nodeSource: "lip_sync",
            lipSyncMethod: "kling_advanced",
          });

          totalCostCents += COST_PER_PANEL_CENTS;
          pipelineLog.info(`[LipSync Retry] ${panelLabel}: Success (${result.processingTimeMs}ms)`);
          onProgress?.(panel.panelId, "success", `Lip-synced in ${result.processingTimeMs}ms`);
        } else {
          pipelineLog.warn(`[LipSync Retry] ${panelLabel}: Skipped — ${result.skipReason}`);
          onProgress?.(panel.panelId, "failed", result.skipReason || "Unknown error");
        }
      } catch (panelErr: any) {
        pipelineLog.error(`[LipSync Retry] ${panelLabel}: Error — ${panelErr.message}`);
        results.push({
          panelId: panel.panelId,
          success: false,
          skipReason: `Error: ${panelErr.message}`,
          processingTimeMs: 0,
        });
        onProgress?.(panel.panelId, "failed", panelErr.message);
      }
    }
  } finally {
    try {
      await fs.rm(workDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.length - succeeded;
  const totalProcessingTimeMs = Date.now() - startTime;

  // Add blocked panels to results
  for (const blockedId of blockedPanels) {
    results.push({
      panelId: blockedId,
      success: false,
      skipReason: `Exceeded max retries (${MAX_RETRY_ATTEMPTS}). Needs manual review.`,
      processingTimeMs: 0,
    });
  }

  const summary =
    succeeded === allowedPanels.length && blockedPanels.length === 0
      ? `Retry complete: all ${succeeded} panels lip-synced successfully (${(totalProcessingTimeMs / 1000).toFixed(1)}s)`
      : `Retry: ${succeeded}/${allowedPanels.length} succeeded, ${failed} failed` +
        (blockedPanels.length > 0 ? `, ${blockedPanels.length} need manual review` : "") +
        ` (${(totalProcessingTimeMs / 1000).toFixed(1)}s)`;

  pipelineLog.info(`[LipSync Retry] ${summary}`);

  return {
    dialoguePanelsFound: allDialoguePanels.length,
    nativeLipSyncSkipped: 0,
    panelsSubmitted: allowedPanels.length,
    panelsSucceeded: succeeded,
    panelsFailed: failed,
    panelsNeedingReview: blockedPanels.length,
    results,
    totalCostCents,
    summary,
    processingTimeMs: totalProcessingTimeMs,
  };
}

// ─── Main Node Function ─────────────────────────────────────────────────────

export async function lipSyncNode(
  runId: number,
  episodeId: number,
  options: LipSyncNodeOptions = {},
): Promise<LipSyncNodeResult> {
  const {
    voiceVolume = 2,
    originalAudioVolume = 0,
    skipNativeLipSync = true,
  } = options;

  pipelineLog.info(`[LipSync Node] Starting automated lip sync for run ${runId}, episode ${episodeId}`);

  // Step 1: Identify dialogue panels
  const dialoguePanels = await identifyDialoguePanels(runId, episodeId);
  pipelineLog.info(`[LipSync Node] Found ${dialoguePanels.length} dialogue panels with video + voice assets`);

  const nodeStartTime = Date.now();

  if (dialoguePanels.length === 0) {
    return {
      dialoguePanelsFound: 0,
      nativeLipSyncSkipped: 0,
      panelsSubmitted: 0,
      panelsSucceeded: 0,
      panelsFailed: 0,
      panelsNeedingReview: 0,
      results: [],
      totalCostCents: 0,
      summary: "No dialogue panels found — nothing to lip sync",
      processingTimeMs: Date.now() - nodeStartTime,
    };
  }

  // Step 2: Filter out panels with native lip sync
  let nativeLipSyncSkipped = 0;
  const panelsToProcess: DialoguePanelMatch[] = [];

  for (const panel of dialoguePanels) {
    if (skipNativeLipSync && panel.hasNativeLipSync) {
      nativeLipSyncSkipped++;
      pipelineLog.info(
        `[LipSync Node] Skipping P${panel.sceneNumber}.${panel.panelNumber} ` +
        `(${panel.character}) — already has native lip sync from V3 Omni`
      );
      continue;
    }

    if (panel.voiceDuration < MIN_VOICE_DURATION_SECONDS) {
      pipelineLog.info(
        `[LipSync Node] Skipping P${panel.sceneNumber}.${panel.panelNumber} ` +
        `— voice clip too short (${panel.voiceDuration}s < ${MIN_VOICE_DURATION_SECONDS}s)`
      );
      continue;
    }

    panelsToProcess.push(panel);
  }

  pipelineLog.info(
    `[LipSync Node] Processing ${panelsToProcess.length} panels ` +
    `(${nativeLipSyncSkipped} skipped with native lip sync)`
  );

  if (panelsToProcess.length === 0) {
    return {
      dialoguePanelsFound: dialoguePanels.length,
      nativeLipSyncSkipped,
      panelsSubmitted: 0,
      panelsSucceeded: 0,
      panelsFailed: 0,
      panelsNeedingReview: 0,
      results: [],
      totalCostCents: 0,
      summary: `All ${dialoguePanels.length} dialogue panels already have native lip sync — no additional processing needed`,
      processingTimeMs: Date.now() - nodeStartTime,
    };
  }

  // Step 3: Create working directory
  const workDir = path.join(os.tmpdir(), `lipsync-node-${runId}-${nanoid(6)}`);
  await fs.mkdir(workDir, { recursive: true });

  const results: LipSyncPanelResult[] = [];
  let totalCostCents = 0;

  try {
    // Step 4: Process each panel sequentially
    for (let i = 0; i < panelsToProcess.length; i++) {
      const panel = panelsToProcess[i];
      const panelLabel = `P${panel.sceneNumber}.${panel.panelNumber} [${panel.character}]`;
      const panelWorkDir = path.join(workDir, `panel-${panel.panelId}`);
      await fs.mkdir(panelWorkDir, { recursive: true });

      pipelineLog.info(
        `[LipSync Node] Processing ${i + 1}/${panelsToProcess.length}: ` +
        `${panelLabel} — "${panel.dialogueText.slice(0, 50)}..."`
      );

      try {
        // Download video clip
        const videoPath = path.join(panelWorkDir, `video.mp4`);
        await downloadFile(panel.videoUrl, videoPath);

        // Download voice clip
        const voicePath = path.join(panelWorkDir, `voice.mp3`);
        await downloadFile(panel.voiceUrl, voicePath);

        // Build lip sync input
        const input: LipSyncPanelInput = {
          panelId: panel.panelId,
          character: panel.character,
          dialogueText: panel.dialogueText,
          videoClipPath: videoPath,
          voiceAudioPath: voicePath,
          audioInsertTimeMs: 0,
          voiceVolume,
          originalAudioVolume,
        };

        // Run face detection + lip sync
        const result = await processLipSyncPanel(input, panelWorkDir, uploadToS3);
        results.push(result);

        if (result.success && result.outputUrl) {
          // Step 5: Store lip-synced clip as pipeline asset
          const s3Key = `pipeline/${runId}/lipsync-${panel.panelId}-${nanoid(6)}.mp4`;

          // Upload the lip-synced clip to our S3 (Kling CDN URL may expire)
          let storedUrl = result.outputUrl;
          if (result.outputPath) {
            try {
              storedUrl = await uploadToS3(result.outputPath, s3Key, "video/mp4");
            } catch (uploadErr) {
              pipelineLog.warn(
                `[LipSync Node] S3 upload failed for ${panelLabel}, using Kling CDN URL`,
                { error: String(uploadErr) }
              );
            }
          }

          await createPipelineAsset({
            pipelineRunId: runId,
            episodeId,
            panelId: panel.panelId,
            assetType: "synced_clip",
            url: storedUrl,
            metadata: {
              panelNumber: panel.panelNumber,
              sceneNumber: panel.sceneNumber,
              character: panel.character,
              dialogueText: panel.dialogueText.slice(0, 100),
              hasLipSync: true,
              lipSyncMethod: "kling_advanced",
              faceCount: result.faceDetection?.faces.length || 0,
              processingTimeMs: result.processingTimeMs,
              originalVideoAssetId: panel.videoAssetId,
              originalVoiceAssetId: panel.voiceAssetId,
            } as any,
            nodeSource: "lip_sync",
            lipSyncMethod: "kling_advanced",
          });

          totalCostCents += COST_PER_PANEL_CENTS;
          pipelineLog.info(
            `[LipSync Node] ${panelLabel}: Lip-synced clip stored (${result.processingTimeMs}ms)`
          );
        } else {
          pipelineLog.warn(
            `[LipSync Node] ${panelLabel}: Skipped — ${result.skipReason}`
          );
        }
      } catch (panelErr: any) {
        pipelineLog.error(
          `[LipSync Node] ${panelLabel}: Error — ${panelErr.message}`
        );
        results.push({
          panelId: panel.panelId,
          success: false,
          skipReason: `Error: ${panelErr.message}`,
          processingTimeMs: 0,
        });
      }
    }
  } finally {
    // Cleanup temp directory
    try {
      await fs.rm(workDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }

  // Step 6: Build summary
  const succeeded = results.filter((r) => r.success).length;
  const failed = results.length - succeeded;

  const skippedDetails = results
    .filter((r) => !r.success)
    .map((r) => `${r.panelId}: ${r.skipReason}`)
    .join("; ");

  const summary =
    succeeded === panelsToProcess.length
      ? `Lip sync complete: all ${succeeded} dialogue panels processed successfully`
      : `Lip sync: ${succeeded}/${panelsToProcess.length} succeeded, ${failed} skipped` +
        (nativeLipSyncSkipped > 0 ? `, ${nativeLipSyncSkipped} already had native lip sync` : "") +
        (skippedDetails ? ` (${skippedDetails.slice(0, 300)})` : "");

  pipelineLog.info(`[LipSync Node] ${summary}`);

  return {
    dialoguePanelsFound: dialoguePanels.length,
    nativeLipSyncSkipped,
    panelsSubmitted: panelsToProcess.length,
    panelsSucceeded: succeeded,
    panelsFailed: failed,
    panelsNeedingReview: 0,
    results,
    totalCostCents,
    summary,
    processingTimeMs: Date.now() - nodeStartTime,
  };
}
