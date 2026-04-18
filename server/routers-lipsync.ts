/**
 * Lip Sync tRPC Router
 *
 * Provides procedures for:
 * - Listing dialogue panel lip sync statuses for a pipeline run
 * - Batch retrying failed lip sync panels
 */

import { router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { getPipelineAssetsByRun, getPanelsByEpisode, getPipelineRunById } from "./db";
import { identifyDialoguePanels, retryFailedLipSync, MAX_RETRY_ATTEMPTS } from "./lipSyncNode";
import { notifyOwner } from "./_core/notification";

// ─── Types ──────────────────────────────────────────────────────────────

export type LipSyncPanelStatus = "synced" | "failed" | "skipped" | "pending" | "retrying" | "needs_review";

export interface LipSyncPanelInfo {
  panelId: number;
  panelNumber: number;
  sceneNumber: number;
  character: string;
  dialogueText: string;
  status: LipSyncPanelStatus;
  failureReason?: string;
  syncedClipUrl?: string;
  syncedClipId?: number;
  videoClipUrl?: string;
  voiceClipUrl?: string;
  hasNativeLipSync: boolean;
  processingTimeMs?: number;
  isRetry?: boolean;
  retryCount?: number;
  originalVideoUrl?: string;
}

// ─── In-memory retry tracking ───────────────────────────────────────────

const activeRetries = new Map<string, {
  status: "running" | "complete" | "failed";
  startedAt: number;
  panelStatuses: Map<number, { status: "pending" | "started" | "success" | "failed"; detail?: string }>;
  result?: any;
}>();

function getRetryKey(runId: number) {
  return `retry-${runId}`;
}

// ─── Router ─────────────────────────────────────────────────────────────

export const lipSyncRouter = router({
  /**
   * Get lip sync status for all dialogue panels in a pipeline run.
   * Returns per-panel status: synced, failed, skipped, pending, or retrying.
   */
  getPanelStatuses: protectedProcedure
    .input(z.object({
      runId: z.number(),
      episodeId: z.number(),
    }))
    .query(async ({ input }) => {
      const { runId, episodeId } = input;

      // Get all dialogue panels
      const dialoguePanels = await identifyDialoguePanels(runId, episodeId);

      // Get all pipeline assets for this run
      const allAssets = await getPipelineAssetsByRun(runId);

      // Index synced clips by panelId
      const syncedClipsByPanel = new Map<number, any>();
      for (const asset of allAssets) {
        if (asset.assetType === "synced_clip" && asset.panelId) {
          const existing = syncedClipsByPanel.get(asset.panelId);
          // Keep the latest one (higher ID)
          if (!existing || asset.id > existing.id) {
            syncedClipsByPanel.set(asset.panelId, asset);
          }
        }
      }

      // Check active retry status
      const retryKey = getRetryKey(runId);
      const activeRetry = activeRetries.get(retryKey);

      // Build per-panel status
      const panelInfos: LipSyncPanelInfo[] = dialoguePanels.map((panel) => {
        const syncedClip = syncedClipsByPanel.get(panel.panelId);
        const meta = syncedClip?.metadata as any;

        // Check if this panel is currently being retried
        const retryPanelStatus = activeRetry?.status === "running"
          ? activeRetry.panelStatuses.get(panel.panelId)
          : undefined;

        let status: LipSyncPanelStatus;
        let failureReason: string | undefined;
        const retryCount = meta?.retryCount || (meta?.isRetry ? 1 : 0);

        if (retryPanelStatus?.status === "started" || retryPanelStatus?.status === "pending") {
          status = "retrying";
        } else if (syncedClip && meta?.hasLipSync) {
          status = "synced";
        } else if (panel.hasNativeLipSync) {
          status = "skipped";
          failureReason = "Panel has native lip sync from V3 Omni";
        } else if (panel.voiceDuration < 0.5) {
          status = "skipped";
          failureReason = `Voice clip too short (${panel.voiceDuration}s)`;
        } else if (retryCount >= MAX_RETRY_ATTEMPTS) {
          status = "needs_review";
          failureReason = `Exceeded max retries (${MAX_RETRY_ATTEMPTS}). Manual review required.`;
        } else {
          // No synced clip exists — either failed or pending
          status = "failed";
          failureReason = retryPanelStatus?.detail || "No lip-synced clip produced";
        }

        return {
          panelId: panel.panelId,
          panelNumber: panel.panelNumber,
          sceneNumber: panel.sceneNumber,
          character: panel.character,
          dialogueText: panel.dialogueText,
          status,
          failureReason,
          syncedClipUrl: syncedClip?.url,
          syncedClipId: syncedClip?.id,
          videoClipUrl: panel.videoUrl,
          voiceClipUrl: panel.voiceUrl,
          hasNativeLipSync: panel.hasNativeLipSync,
          processingTimeMs: meta?.processingTimeMs,
          isRetry: meta?.isRetry === true,
          retryCount: retryCount || undefined,
          originalVideoUrl: panel.videoUrl,
        };
      });

      // Get active retry info
      const retryInfo = activeRetry ? {
        status: activeRetry.status,
        startedAt: activeRetry.startedAt,
        panelStatuses: Object.fromEntries(activeRetry.panelStatuses),
      } : null;

      return {
        panels: panelInfos,
        totalDialoguePanels: dialoguePanels.length,
        syncedCount: panelInfos.filter((p) => p.status === "synced").length,
        failedCount: panelInfos.filter((p) => p.status === "failed").length,
        skippedCount: panelInfos.filter((p) => p.status === "skipped").length,
        retryingCount: panelInfos.filter((p) => p.status === "retrying").length,
        needsReviewCount: panelInfos.filter((p) => p.status === "needs_review").length,
        activeRetry: retryInfo,
      };
    }),

  /**
   * Batch retry lip sync for selected failed panels.
   * Runs asynchronously — poll getPanelStatuses for progress.
   */
  retryBatch: protectedProcedure
    .input(z.object({
      runId: z.number(),
      episodeId: z.number(),
      panelIds: z.array(z.number()).min(1).max(50),
    }))
    .mutation(async ({ input }) => {
      const { runId, episodeId, panelIds } = input;

      // Check if a retry is already running for this run
      const retryKey = getRetryKey(runId);
      const existing = activeRetries.get(retryKey);
      if (existing?.status === "running") {
        return {
          started: false,
          message: "A retry is already in progress for this pipeline run. Please wait for it to complete.",
          retryKey,
        };
      }

      // Verify the pipeline run exists
      const run = await getPipelineRunById(runId);
      if (!run) {
        return {
          started: false,
          message: `Pipeline run ${runId} not found`,
          retryKey,
        };
      }

      // Initialize retry tracking
      const panelStatuses = new Map<number, { status: "pending" | "started" | "success" | "failed"; detail?: string }>();
      for (const id of panelIds) {
        panelStatuses.set(id, { status: "pending" });
      }

      activeRetries.set(retryKey, {
        status: "running",
        startedAt: Date.now(),
        panelStatuses,
      });

      // Run async — don't await
      retryFailedLipSync(
        runId,
        episodeId,
        panelIds,
        {},
        (panelId, status, detail) => {
          const retry = activeRetries.get(retryKey);
          if (retry) {
            const mappedStatus = status === "started" ? "started" : status === "success" ? "success" : "failed";
            retry.panelStatuses.set(panelId, { status: mappedStatus, detail });
          }
        },
      )
        .then(async (result) => {
          const retry = activeRetries.get(retryKey);
          if (retry) {
            retry.status = "complete";
            retry.result = result;
          }
          console.log(`[LipSync Retry] Batch complete: ${result.summary}`);

          // Send notification to project owner
          const processingTimeSec = (result.processingTimeMs / 1000).toFixed(1);
          const reviewNote = result.panelsNeedingReview > 0
            ? `\n\n⚠️ ${result.panelsNeedingReview} panel(s) exceeded the retry limit (${MAX_RETRY_ATTEMPTS}) and need manual review.`
            : "";
          try {
            await notifyOwner({
              title: `Lip Sync Retry Complete — ${result.panelsSucceeded}/${result.panelsSubmitted} succeeded`,
              content: [
                `**Run #${runId}** lip sync retry batch finished in ${processingTimeSec}s.`,
                ``,
                `| Metric | Count |`,
                `|--------|-------|`,
                `| Panels submitted | ${result.panelsSubmitted} |`,
                `| Succeeded | ${result.panelsSucceeded} |`,
                `| Failed | ${result.panelsFailed} |`,
                `| Needs manual review | ${result.panelsNeedingReview} |`,
                `| API cost | $${(result.totalCostCents / 100).toFixed(2)} |`,
                `| Processing time | ${processingTimeSec}s |`,
                reviewNote,
              ].join("\n"),
            });
            console.log(`[LipSync Retry] Owner notification sent`);
          } catch (notifErr) {
            console.warn(`[LipSync Retry] Failed to send owner notification:`, notifErr);
          }

          // Clean up after 5 minutes
          setTimeout(() => {
            activeRetries.delete(retryKey);
          }, 5 * 60 * 1000);
        })
        .catch(async (err) => {
          const retry = activeRetries.get(retryKey);
          if (retry) {
            retry.status = "failed";
            retry.result = { error: err.message };
          }
          console.error(`[LipSync Retry] Batch failed:`, err);

          // Notify owner of failure
          try {
            await notifyOwner({
              title: `❌ Lip Sync Retry Failed — Run #${runId}`,
              content: `The lip sync retry batch for **Run #${runId}** (${panelIds.length} panels) failed with error:\n\n\`${err.message}\`\n\nPlease check the pipeline logs for details.`,
            });
          } catch (notifErr) {
            console.warn(`[LipSync Retry] Failed to send failure notification:`, notifErr);
          }

          setTimeout(() => {
            activeRetries.delete(retryKey);
          }, 5 * 60 * 1000);
        });

      return {
        started: true,
        message: `Lip sync retry started for ${panelIds.length} panel(s). Poll getPanelStatuses for progress.`,
        retryKey,
        panelIds,
      };
    }),

  /**
   * Get the status of an active retry operation.
   */
  getRetryStatus: protectedProcedure
    .input(z.object({
      runId: z.number(),
    }))
    .query(({ input }) => {
      const retryKey = getRetryKey(input.runId);
      const retry = activeRetries.get(retryKey);

      if (!retry) {
        return { active: false as const };
      }

      return {
        active: true as const,
        status: retry.status,
        startedAt: retry.startedAt,
        elapsedMs: Date.now() - retry.startedAt,
        panelStatuses: Object.fromEntries(retry.panelStatuses),
        result: retry.result,
      };
    }),
});
