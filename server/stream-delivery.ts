/**
 * Stream Delivery Service — Assembly → Cloudflare Stream Bridge
 *
 * Takes the assembled video URL from the video-assembler output and delivers
 * it to Cloudflare Stream for CDN-backed HLS/DASH playback. Updates the
 * episode record with stream delivery fields (uid, embed URL, HLS URL,
 * thumbnail URL, status).
 *
 * Pipeline position: runs immediately after assembleEpisodeFromSlices completes.
 */

import {
  uploadFromUrl,
  getVideoStatus,
  waitUntilReady,
  getEmbedUrl,
  getHlsUrl,
  getThumbnailUrl,
  type StreamUploadResult,
  type StreamVideoMeta,
} from "./cloudflare-stream";
import { getEpisodeById, updateEpisode } from "./db";
import { triggerCaptionDeliveryAsync } from "./caption-delivery";

// ─── Types ────────────────────────────────────────────────────────────

export type StreamDeliveryStatus =
  | "none"
  | "uploading"
  | "processing"
  | "ready"
  | "error";

export interface DeliveryResult {
  success: boolean;
  episodeId: number;
  streamUid: string | null;
  streamEmbedUrl: string | null;
  streamHlsUrl: string | null;
  streamThumbnailUrl: string | null;
  streamStatus: StreamDeliveryStatus;
  duration?: number;
  error?: string;
}

export interface DeliveryStatusResult {
  episodeId: number;
  streamStatus: StreamDeliveryStatus;
  streamUid: string | null;
  streamEmbedUrl: string | null;
  streamHlsUrl: string | null;
  streamThumbnailUrl: string | null;
  videoUrl: string | null;
  hasAssembledVideo: boolean;
  hasStreamDelivery: boolean;
  cloudflareProgress?: string;
}

// ─── Constants ────────────────────────────────────────────────────────

/** Default timeout for waiting for Cloudflare Stream processing (10 minutes) */
export const STREAM_POLL_TIMEOUT_MS = 10 * 60 * 1000;

/** Default polling interval for Cloudflare Stream status (5 seconds) */
export const STREAM_POLL_INTERVAL_MS = 5_000;

/** Maximum retries for transient Cloudflare errors */
export const MAX_TRANSIENT_RETRIES = 3;

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Determine if an error is transient (network timeout, 5xx, rate limit)
 * and safe to retry.
 */
export function isTransientError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("timeout") ||
      msg.includes("econnreset") ||
      msg.includes("econnrefused") ||
      msg.includes("fetch failed") ||
      msg.includes("502") ||
      msg.includes("503") ||
      msg.includes("504") ||
      msg.includes("429") ||
      msg.includes("rate limit")
    );
  }
  return false;
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Core: deliverToStream ────────────────────────────────────────────

/**
 * Deliver an assembled episode video to Cloudflare Stream.
 *
 * Flow:
 *   1. Validate episode has an assembled videoUrl
 *   2. Set streamStatus = "uploading"
 *   3. Upload videoUrl to Cloudflare Stream (copy from URL)
 *   4. Set streamStatus = "processing", save streamUid
 *   5. Poll until ready (or timeout)
 *   6. Update episode with embed URL, HLS URL, thumbnail URL
 *   7. Set streamStatus = "ready"
 *
 * On failure: set streamStatus = "error" and return error details.
 */
export async function deliverToStream(
  episodeId: number,
  options?: {
    timeoutMs?: number;
    intervalMs?: number;
    onProgress?: (status: string, pctComplete?: string) => void;
  },
): Promise<DeliveryResult> {
  const timeoutMs = options?.timeoutMs ?? STREAM_POLL_TIMEOUT_MS;
  const intervalMs = options?.intervalMs ?? STREAM_POLL_INTERVAL_MS;

  // 1. Validate episode has assembled video
  const episode = await getEpisodeById(episodeId);
  if (!episode) {
    return {
      success: false,
      episodeId,
      streamUid: null,
      streamEmbedUrl: null,
      streamHlsUrl: null,
      streamThumbnailUrl: null,
      streamStatus: "error",
      error: `Episode ${episodeId} not found`,
    };
  }

  if (!episode.videoUrl) {
    return {
      success: false,
      episodeId,
      streamUid: null,
      streamEmbedUrl: null,
      streamHlsUrl: null,
      streamThumbnailUrl: null,
      streamStatus: "error",
      error: `Episode ${episodeId} has no assembled video URL`,
    };
  }

  try {
    // 2. Mark as uploading
    await updateEpisode(episodeId, {
      streamStatus: "uploading",
    } as any);
    options?.onProgress?.("uploading");

    console.log(`[StreamDelivery] Uploading episode ${episodeId} video to Cloudflare Stream...`);

    // 3. Upload to Cloudflare Stream with retry for transient errors
    let uploaded: StreamUploadResult | null = null;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_TRANSIENT_RETRIES; attempt++) {
      try {
        const meta: StreamVideoMeta = {
          name: `awakli-ep-${episodeId}-${episode.title || "untitled"}`,
          episodeId: String(episodeId),
          projectId: String(episode.projectId),
        };

        uploaded = await uploadFromUrl(episode.videoUrl, meta);
        break;
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (isTransientError(err) && attempt < MAX_TRANSIENT_RETRIES) {
          console.warn(
            `[StreamDelivery] Transient error on upload attempt ${attempt}/${MAX_TRANSIENT_RETRIES}: ${lastError.message}. Retrying...`,
          );
          await sleep(attempt * 2000); // exponential backoff: 2s, 4s, 6s
          continue;
        }
        throw lastError;
      }
    }

    if (!uploaded) {
      throw lastError || new Error("Upload failed after retries");
    }

    // 4. Mark as processing, save UID
    await updateEpisode(episodeId, {
      streamUid: uploaded.uid,
      streamStatus: "processing",
    } as any);
    options?.onProgress?.("processing", uploaded.status.pctComplete);

    console.log(
      `[StreamDelivery] Episode ${episodeId} uploaded to Cloudflare Stream: uid=${uploaded.uid}`,
    );

    // 5. Poll until ready
    const ready = await waitUntilReady(uploaded.uid, {
      timeoutMs,
      intervalMs,
    });

    // 6. Extract playback URLs
    const embedUrl = getEmbedUrl(ready);
    const hlsUrl = getHlsUrl(ready);
    const thumbnailUrl = getThumbnailUrl(ready);

    // 7. Update episode with all stream fields
    await updateEpisode(episodeId, {
      streamUid: ready.uid,
      streamEmbedUrl: embedUrl,
      streamHlsUrl: hlsUrl,
      streamThumbnailUrl: thumbnailUrl,
      streamStatus: "ready",
    } as any);

    options?.onProgress?.("ready");

    console.log(
      `[StreamDelivery] Episode ${episodeId} stream delivery complete: uid=${ready.uid}`,
    );

    // Auto-trigger caption delivery if SRT subtitles are available
    const freshEpisode = await getEpisodeById(episodeId);
    if (freshEpisode && (freshEpisode as any).srtUrl) {
      console.log(`[StreamDelivery] Auto-triggering caption delivery for episode ${episodeId}`);
      triggerCaptionDeliveryAsync(episodeId);
    }

    return {
      success: true,
      episodeId,
      streamUid: ready.uid,
      streamEmbedUrl: embedUrl,
      streamHlsUrl: hlsUrl,
      streamThumbnailUrl: thumbnailUrl,
      streamStatus: "ready",
      duration: ready.duration,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(
      `[StreamDelivery] Episode ${episodeId} stream delivery failed: ${errorMsg}`,
    );

    // Mark as error
    await updateEpisode(episodeId, {
      streamStatus: "error",
    } as any);

    return {
      success: false,
      episodeId,
      streamUid: (episode as any).streamUid || null,
      streamEmbedUrl: null,
      streamHlsUrl: null,
      streamThumbnailUrl: null,
      streamStatus: "error",
      error: errorMsg,
    };
  }
}

// ─── getDeliveryStatus ────────────────────────────────────────────────

/**
 * Get the current stream delivery status for an episode.
 * If the episode is in "processing" state, also checks Cloudflare for live progress.
 */
export async function getDeliveryStatus(
  episodeId: number,
): Promise<DeliveryStatusResult> {
  const episode = await getEpisodeById(episodeId);
  if (!episode) {
    return {
      episodeId,
      streamStatus: "none",
      streamUid: null,
      streamEmbedUrl: null,
      streamHlsUrl: null,
      streamThumbnailUrl: null,
      videoUrl: null,
      hasAssembledVideo: false,
      hasStreamDelivery: false,
    };
  }

  const ep = episode as any;
  const streamStatus: StreamDeliveryStatus = ep.streamStatus || "none";
  const result: DeliveryStatusResult = {
    episodeId,
    streamStatus,
    streamUid: ep.streamUid || null,
    streamEmbedUrl: ep.streamEmbedUrl || null,
    streamHlsUrl: ep.streamHlsUrl || null,
    streamThumbnailUrl: ep.streamThumbnailUrl || null,
    videoUrl: episode.videoUrl || null,
    hasAssembledVideo: !!episode.videoUrl,
    hasStreamDelivery: streamStatus === "ready",
  };

  // If processing, check Cloudflare for live progress
  if (streamStatus === "processing" && ep.streamUid) {
    try {
      const cfStatus = await getVideoStatus(ep.streamUid);
      result.cloudflareProgress = cfStatus.status.pctComplete || undefined;

      // Auto-update if ready
      if (cfStatus.readyToStream) {
        const embedUrl = getEmbedUrl(cfStatus);
        const hlsUrl = getHlsUrl(cfStatus);
        const thumbnailUrl = getThumbnailUrl(cfStatus);

        await updateEpisode(episodeId, {
          streamEmbedUrl: embedUrl,
          streamHlsUrl: hlsUrl,
          streamThumbnailUrl: thumbnailUrl,
          streamStatus: "ready",
        } as any);

        result.streamStatus = "ready";
        result.streamEmbedUrl = embedUrl;
        result.streamHlsUrl = hlsUrl;
        result.streamThumbnailUrl = thumbnailUrl;
        result.hasStreamDelivery = true;
      }

      // Auto-update if error
      if (cfStatus.status.state === "error") {
        await updateEpisode(episodeId, {
          streamStatus: "error",
        } as any);
        result.streamStatus = "error";
      }
    } catch {
      // Cloudflare API call failed — keep current status, don't crash
      console.warn(
        `[StreamDelivery] Failed to check Cloudflare status for episode ${episodeId}`,
      );
    }
  }

  return result;
}

// ─── retryDelivery ────────────────────────────────────────────────────

/**
 * Retry a failed stream delivery.
 * Clears the error state and re-uploads the assembled video to Cloudflare Stream.
 */
export async function retryDelivery(
  episodeId: number,
  options?: {
    timeoutMs?: number;
    intervalMs?: number;
    onProgress?: (status: string, pctComplete?: string) => void;
  },
): Promise<DeliveryResult> {
  // Clear previous stream fields to allow fresh upload
  await updateEpisode(episodeId, {
    streamUid: null,
    streamEmbedUrl: null,
    streamHlsUrl: null,
    streamThumbnailUrl: null,
    streamStatus: "none",
  } as any);

  return deliverToStream(episodeId, options);
}

// ─── Auto-trigger hook ────────────────────────────────────────────────

/**
 * Hook to auto-trigger stream delivery after successful assembly.
 * Call this from assembleEpisodeWithCredits onSuccess callback.
 *
 * Runs asynchronously (fire-and-forget) so it doesn't block the assembly response.
 */
export function triggerStreamDeliveryAsync(episodeId: number): void {
  deliverToStream(episodeId).catch((err) => {
    console.error(
      `[StreamDelivery] Auto-trigger failed for episode ${episodeId}:`,
      err instanceof Error ? err.message : String(err),
    );
  });
}
