/**
 * Caption Delivery Service — SRT → VTT → Cloudflare Stream
 *
 * Orchestrates the full caption delivery pipeline:
 *   1. Fetch the SRT subtitle file from S3
 *   2. Convert SRT to WebVTT format
 *   3. Upload VTT to S3 for backup/fallback
 *   4. Upload VTT to Cloudflare Stream as a caption track
 *   5. Update episode record with vttUrl and captionStatus
 *
 * Pipeline position: runs after subtitle generation + stream delivery.
 * Can be auto-triggered when both srtUrl and streamUid are available.
 */

import { convertSrtToVtt, isValidVtt } from "./srt-to-vtt";
import { uploadCaption, listCaptions, deleteCaption } from "./cloudflare-stream";
import { getEpisodeById, updateEpisode } from "./db";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";

// ─── Types ────────────────────────────────────────────────────────────

export type CaptionDeliveryStatus = "none" | "converting" | "uploading" | "ready" | "error";

export interface CaptionDeliveryResult {
  success: boolean;
  episodeId: number;
  vttUrl: string | null;
  captionStatus: CaptionDeliveryStatus;
  language: string;
  cueCount: number;
  error?: string;
}

export interface CaptionStatusResult {
  episodeId: number;
  captionStatus: CaptionDeliveryStatus;
  vttUrl: string | null;
  srtUrl: string | null;
  captionLanguage: string;
  hasSrt: boolean;
  hasVtt: boolean;
  hasStreamCaption: boolean;
  streamUid: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────

/** Default caption language */
export const DEFAULT_CAPTION_LANGUAGE = "en";

/** Maximum SRT file size to process (5 MB) */
export const MAX_SRT_SIZE_BYTES = 5 * 1024 * 1024;

// ─── Core: deliverCaptions ──────────────────────────────────────────

/**
 * Full caption delivery pipeline for an episode.
 *
 * Prerequisites:
 *   - Episode must have srtUrl (subtitles generated)
 *   - Episode must have streamUid (video delivered to Cloudflare Stream)
 *   - Episode streamStatus must be "ready"
 *
 * Flow:
 *   1. Validate prerequisites
 *   2. Fetch SRT content from URL
 *   3. Convert SRT → VTT
 *   4. Upload VTT to S3 (backup)
 *   5. Upload VTT to Cloudflare Stream as caption track
 *   6. Update episode record
 */
export async function deliverCaptions(
  episodeId: number,
  options?: {
    language?: string;
    onProgress?: (status: CaptionDeliveryStatus) => void;
  },
): Promise<CaptionDeliveryResult> {
  const language = options?.language ?? DEFAULT_CAPTION_LANGUAGE;

  // 1. Validate prerequisites
  const episode = await getEpisodeById(episodeId);
  if (!episode) {
    return {
      success: false,
      episodeId,
      vttUrl: null,
      captionStatus: "error",
      language,
      cueCount: 0,
      error: `Episode ${episodeId} not found`,
    };
  }

  const ep = episode as any;
  if (!ep.srtUrl) {
    return {
      success: false,
      episodeId,
      vttUrl: null,
      captionStatus: "error",
      language,
      cueCount: 0,
      error: `Episode ${episodeId} has no SRT subtitles. Generate subtitles first.`,
    };
  }

  if (!ep.streamUid) {
    return {
      success: false,
      episodeId,
      vttUrl: null,
      captionStatus: "error",
      language,
      cueCount: 0,
      error: `Episode ${episodeId} has no Cloudflare Stream video. Deliver to stream first.`,
    };
  }

  if (ep.streamStatus !== "ready") {
    return {
      success: false,
      episodeId,
      vttUrl: null,
      captionStatus: "error",
      language,
      cueCount: 0,
      error: `Episode ${episodeId} stream is not ready (status: ${ep.streamStatus}). Wait for stream processing.`,
    };
  }

  try {
    // 2. Mark as converting
    await updateEpisode(episodeId, {
      captionStatus: "converting",
      captionLanguage: language,
    } as any);
    options?.onProgress?.("converting");

    console.log(`[CaptionDelivery] Episode ${episodeId}: fetching SRT from ${ep.srtUrl}`);

    // 3. Fetch SRT content
    const srtResponse = await fetch(ep.srtUrl);
    if (!srtResponse.ok) {
      throw new Error(`Failed to fetch SRT file: HTTP ${srtResponse.status}`);
    }

    const srtContent = await srtResponse.text();
    if (!srtContent || srtContent.trim().length === 0) {
      throw new Error("SRT file is empty");
    }

    if (srtContent.length > MAX_SRT_SIZE_BYTES) {
      throw new Error(`SRT file too large (${srtContent.length} bytes, max ${MAX_SRT_SIZE_BYTES})`);
    }

    // 4. Convert SRT → VTT
    const conversion = convertSrtToVtt(srtContent);
    if (!conversion.success || !conversion.vttContent) {
      throw new Error(`SRT to VTT conversion failed: ${conversion.error}`);
    }

    if (!isValidVtt(conversion.vttContent)) {
      throw new Error("Generated VTT content failed validation");
    }

    console.log(
      `[CaptionDelivery] Episode ${episodeId}: converted ${conversion.cueCount} cues to VTT`,
    );

    // 5. Mark as uploading
    await updateEpisode(episodeId, {
      captionStatus: "uploading",
    } as any);
    options?.onProgress?.("uploading");

    // 6. Upload VTT to S3 (backup/fallback for native video player)
    const vttKey = `captions/ep-${episodeId}-${language}-${nanoid(8)}.vtt`;
    const vttBuffer = Buffer.from(conversion.vttContent, "utf-8");
    const { url: vttUrl } = await storagePut(vttKey, vttBuffer, "text/vtt");

    console.log(`[CaptionDelivery] Episode ${episodeId}: VTT uploaded to S3: ${vttKey}`);

    // 7. Upload VTT to Cloudflare Stream as caption track
    await uploadCaption(ep.streamUid, language, conversion.vttContent);

    console.log(
      `[CaptionDelivery] Episode ${episodeId}: caption uploaded to Cloudflare Stream (${language})`,
    );

    // 8. Update episode record
    await updateEpisode(episodeId, {
      vttUrl,
      captionLanguage: language,
      captionStatus: "ready",
    } as any);
    options?.onProgress?.("ready");

    console.log(
      `[CaptionDelivery] Episode ${episodeId}: caption delivery complete`,
    );

    return {
      success: true,
      episodeId,
      vttUrl,
      captionStatus: "ready",
      language,
      cueCount: conversion.cueCount,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[CaptionDelivery] Episode ${episodeId} failed: ${errorMsg}`);

    await updateEpisode(episodeId, {
      captionStatus: "error",
    } as any);

    return {
      success: false,
      episodeId,
      vttUrl: null,
      captionStatus: "error",
      language,
      cueCount: 0,
      error: errorMsg,
    };
  }
}

// ─── getCaptionStatus ────────────────────────────────────────────────

/**
 * Get the current caption delivery status for an episode.
 */
export async function getCaptionStatus(episodeId: number): Promise<CaptionStatusResult> {
  const episode = await getEpisodeById(episodeId);
  if (!episode) {
    return {
      episodeId,
      captionStatus: "none",
      vttUrl: null,
      srtUrl: null,
      captionLanguage: DEFAULT_CAPTION_LANGUAGE,
      hasSrt: false,
      hasVtt: false,
      hasStreamCaption: false,
      streamUid: null,
    };
  }

  const ep = episode as any;
  const captionStatus: CaptionDeliveryStatus = ep.captionStatus || "none";

  return {
    episodeId,
    captionStatus,
    vttUrl: ep.vttUrl || null,
    srtUrl: ep.srtUrl || null,
    captionLanguage: ep.captionLanguage || DEFAULT_CAPTION_LANGUAGE,
    hasSrt: !!ep.srtUrl,
    hasVtt: !!ep.vttUrl,
    hasStreamCaption: captionStatus === "ready",
    streamUid: ep.streamUid || null,
  };
}

// ─── retryCaptionDelivery ────────────────────────────────────────────

/**
 * Retry a failed caption delivery.
 * Clears the error state and re-runs the full pipeline.
 */
export async function retryCaptionDelivery(
  episodeId: number,
  options?: {
    language?: string;
    onProgress?: (status: CaptionDeliveryStatus) => void;
  },
): Promise<CaptionDeliveryResult> {
  // Clear previous caption fields
  await updateEpisode(episodeId, {
    vttUrl: null,
    captionStatus: "none",
  } as any);

  return deliverCaptions(episodeId, options);
}

// ─── deleteCaptionFromStream ────────────────────────────────────────

/**
 * Remove a caption track from Cloudflare Stream and clear episode fields.
 */
export async function deleteCaptionFromStream(
  episodeId: number,
  language?: string,
): Promise<{ success: boolean; error?: string }> {
  const episode = await getEpisodeById(episodeId);
  if (!episode) {
    return { success: false, error: `Episode ${episodeId} not found` };
  }

  const ep = episode as any;
  if (!ep.streamUid) {
    return { success: false, error: `Episode ${episodeId} has no stream UID` };
  }

  const lang = language || ep.captionLanguage || DEFAULT_CAPTION_LANGUAGE;

  try {
    await deleteCaption(ep.streamUid, lang);

    await updateEpisode(episodeId, {
      captionStatus: "none",
    } as any);

    console.log(
      `[CaptionDelivery] Episode ${episodeId}: caption removed from Cloudflare Stream (${lang})`,
    );

    return { success: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[CaptionDelivery] Delete caption failed for episode ${episodeId}: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}

// ─── Auto-trigger hook ──────────────────────────────────────────────

/**
 * Hook to auto-trigger caption delivery after stream delivery completes.
 * Call this from deliverToStream onSuccess or from the stream-delivery module.
 *
 * Prerequisites: episode must have both srtUrl and streamUid with streamStatus="ready".
 * Runs asynchronously (fire-and-forget) so it doesn't block the stream delivery response.
 */
export function triggerCaptionDeliveryAsync(episodeId: number): void {
  deliverCaptions(episodeId).catch((err) => {
    console.error(
      `[CaptionDelivery] Auto-trigger failed for episode ${episodeId}:`,
      err instanceof Error ? err.message : String(err),
    );
  });
}
