/**
 * Cloudflare Stream Service Module
 *
 * Provides video upload (from URL), status polling, embed URL generation,
 * and video management for the Awakli demo video pipeline.
 */

import { ENV } from "./_core/env";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StreamVideoMeta {
  name?: string;
  [key: string]: string | undefined;
}

export interface StreamUploadResult {
  uid: string;
  preview: string;
  thumbnail: string;
  readyToStream: boolean;
  status: { state: string; pctComplete?: string; errorReasonCode?: string; errorReasonText?: string };
  meta: Record<string, string>;
  created: string;
  size?: number;
  duration?: number;
  playback?: { hls?: string; dash?: string };
}

export interface StreamListResult {
  result: StreamUploadResult[];
  success: boolean;
  total_count?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_URL = () =>
  `https://api.cloudflare.com/client/v4/accounts/${ENV.cloudflareAccountId}/stream`;

const headers = () => ({
  Authorization: `Bearer ${ENV.cloudflareStreamToken}`,
  "Content-Type": "application/json",
});

async function cfFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...headers(), ...(init?.headers as Record<string, string>) },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cloudflare Stream API error (${res.status}): ${text}`);
  }

  const json = (await res.json()) as any;
  if (!json.success) {
    const errMsg = json.errors?.map((e: any) => e.message).join(", ") ?? "Unknown error";
    throw new Error(`Cloudflare Stream API error: ${errMsg}`);
  }

  return json as T;
}

// ---------------------------------------------------------------------------
// Upload from URL
// ---------------------------------------------------------------------------

/**
 * Upload a video to Cloudflare Stream from a public URL.
 * Returns immediately with a video UID — the video will be processed asynchronously.
 * Use `getVideoStatus` to poll until `readyToStream` is true.
 */
export async function uploadFromUrl(
  videoUrl: string,
  meta?: StreamVideoMeta
): Promise<StreamUploadResult> {
  const body: Record<string, any> = { url: videoUrl };
  if (meta) body.meta = meta;

  const data = await cfFetch<{ result: StreamUploadResult }>(
    `${BASE_URL()}/copy`,
    { method: "POST", body: JSON.stringify(body) }
  );

  console.log(`[Cloudflare Stream] Video upload initiated: uid=${data.result.uid}`);
  return data.result;
}

// ---------------------------------------------------------------------------
// Get video status
// ---------------------------------------------------------------------------

/**
 * Get the current status of a video by its UID.
 * Poll this until `readyToStream` is true.
 */
export async function getVideoStatus(videoUid: string): Promise<StreamUploadResult> {
  const data = await cfFetch<{ result: StreamUploadResult }>(
    `${BASE_URL()}/${videoUid}`
  );
  return data.result;
}

// ---------------------------------------------------------------------------
// Poll until ready
// ---------------------------------------------------------------------------

/**
 * Poll a video until it's ready to stream, with configurable timeout and interval.
 * Returns the final video status when ready.
 * Throws if the video enters an error state or the timeout is exceeded.
 */
export async function waitUntilReady(
  videoUid: string,
  options?: { timeoutMs?: number; intervalMs?: number }
): Promise<StreamUploadResult> {
  const timeoutMs = options?.timeoutMs ?? 5 * 60 * 1000; // 5 minutes default
  const intervalMs = options?.intervalMs ?? 5000; // 5 seconds default
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const status = await getVideoStatus(videoUid);

    if (status.readyToStream) {
      console.log(`[Cloudflare Stream] Video ${videoUid} is ready to stream`);
      return status;
    }

    if (status.status.state === "error") {
      throw new Error(
        `Cloudflare Stream video ${videoUid} failed: ${status.status.errorReasonText ?? status.status.errorReasonCode ?? "unknown error"}`
      );
    }

    console.log(
      `[Cloudflare Stream] Video ${videoUid} processing: state=${status.status.state}, pct=${status.status.pctComplete ?? "?"}`
    );

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Cloudflare Stream video ${videoUid} timed out after ${timeoutMs}ms`);
}

// ---------------------------------------------------------------------------
// Embed & playback URLs
// ---------------------------------------------------------------------------

/**
 * Get the iframe embed URL for a video.
 * The customer subdomain is derived from the preview URL.
 */
export function getEmbedUrl(video: StreamUploadResult): string {
  // Preview URL format: https://customer-<CODE>.cloudflarestream.com/<UID>/watch
  // Embed URL format: https://customer-<CODE>.cloudflarestream.com/<UID>/iframe
  if (video.preview) {
    return video.preview.replace("/watch", "/iframe");
  }
  // Fallback: construct from UID (requires customer code)
  return `https://cloudflarestream.com/${video.uid}/iframe`;
}

/**
 * Get the HLS playback URL for a video (for custom players).
 */
export function getHlsUrl(video: StreamUploadResult): string | null {
  return video.playback?.hls ?? null;
}

/**
 * Get the thumbnail URL for a video.
 */
export function getThumbnailUrl(video: StreamUploadResult): string {
  return video.thumbnail;
}

// ---------------------------------------------------------------------------
// List videos
// ---------------------------------------------------------------------------

/**
 * List videos in the Stream account.
 */
export async function listVideos(
  options?: { perPage?: number; search?: string }
): Promise<StreamUploadResult[]> {
  const params = new URLSearchParams();
  if (options?.perPage) params.set("per_page", String(options.perPage));
  if (options?.search) params.set("search", options.search);

  const data = await cfFetch<{ result: StreamUploadResult[] }>(
    `${BASE_URL()}?${params.toString()}`
  );
  return data.result;
}

// ---------------------------------------------------------------------------
// Delete video
// ---------------------------------------------------------------------------

/**
 * Delete a video from Cloudflare Stream.
 */
export async function deleteVideo(videoUid: string): Promise<void> {
  await fetch(`${BASE_URL()}/${videoUid}`, {
    method: "DELETE",
    headers: headers(),
  });
  console.log(`[Cloudflare Stream] Video ${videoUid} deleted`);
}

// ---------------------------------------------------------------------------
// Captions (WebVTT)
// ---------------------------------------------------------------------------

export interface StreamCaption {
  label: string;
  language: string;
  generated?: boolean;
}

/**
 * Upload a WebVTT caption file to a Cloudflare Stream video.
 */
export async function uploadCaption(
  videoUid: string,
  language: string,
  vttContent: string,
): Promise<void> {
  const url = `${BASE_URL()}/${videoUid}/captions/${language}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${ENV.cloudflareStreamToken}`,
      "Content-Type": "text/vtt",
    },
    body: vttContent,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cloudflare Stream caption upload failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as any;
  if (!json.success) {
    const errMsg = json.errors?.map((e: any) => e.message).join(", ") ?? "Unknown error";
    throw new Error(`Cloudflare Stream caption upload error: ${errMsg}`);
  }

  console.log(`[Cloudflare Stream] Caption uploaded for video ${videoUid}, language=${language}`);
}

/**
 * List all captions for a Cloudflare Stream video.
 */
export async function listCaptions(videoUid: string): Promise<StreamCaption[]> {
  const data = await cfFetch<{ result: StreamCaption[] }>(
    `${BASE_URL()}/${videoUid}/captions`,
  );
  return data.result;
}

/**
 * Delete a caption from a Cloudflare Stream video.
 */
export async function deleteCaption(
  videoUid: string,
  language: string,
): Promise<void> {
  const url = `${BASE_URL()}/${videoUid}/captions/${language}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: headers(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cloudflare Stream caption delete failed (${res.status}): ${text}`);
  }

  console.log(`[Cloudflare Stream] Caption deleted for video ${videoUid}, language=${language}`);
}

// ---------------------------------------------------------------------------
// Full upload pipeline: upload from URL \u2192 wait \u2192 return embed info
// ---------------------------------------------------------------------------

/**
 * Upload a video from a URL and wait until it's ready to stream.
 * Returns the video status with embed/playback URLs.
 */
export async function uploadAndWait(
  videoUrl: string,
  meta?: StreamVideoMeta,
  pollOptions?: { timeoutMs?: number; intervalMs?: number }
): Promise<{
  uid: string;
  embedUrl: string;
  thumbnailUrl: string;
  hlsUrl: string | null;
  previewUrl: string;
  duration: number | undefined;
}> {
  const uploaded = await uploadFromUrl(videoUrl, meta);
  const ready = await waitUntilReady(uploaded.uid, pollOptions);

  return {
    uid: ready.uid,
    embedUrl: getEmbedUrl(ready),
    thumbnailUrl: getThumbnailUrl(ready),
    hlsUrl: getHlsUrl(ready),
    previewUrl: ready.preview,
    duration: ready.duration,
  };
}
