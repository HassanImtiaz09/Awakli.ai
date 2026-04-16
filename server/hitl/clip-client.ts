/**
 * CLIP Client — TypeScript client for the FastAPI CLIP inference service.
 *
 * Implements the ClipService interface from confidence-scorer.ts,
 * replacing the mock with real CLIP embeddings and similarity scores.
 *
 * Features:
 * - Image-to-image similarity via CLIP embeddings
 * - Text-to-image similarity for style matching
 * - Batch similarity for character consistency (multiple references)
 * - NSFW/content safety classification
 * - Automatic fallback to mock when service is unavailable
 * - Embedding cache to reduce redundant API calls
 */

import type { ClipService } from "./confidence-scorer";

// ─── Configuration ─────────────────────────────────────────────────────

const CLIP_SERVICE_URL = process.env.CLIP_SERVICE_URL || "http://localhost:8100";
const REQUEST_TIMEOUT_MS = 15_000;

// ─── Types ─────────────────────────────────────────────────────────────

export interface SimilarityResult {
  similarity: number;
  score: number;
}

export interface BatchSimilarityResult {
  similarities: number[];
  maxSimilarity: number;
  avgSimilarity: number;
  maxScore: number;
  avgScore: number;
}

export interface SafetyResult {
  isSafe: boolean;
  safetyScore: number;
  maxNsfwSimilarity: number;
  maxSafeSimilarity: number;
  flaggedConcepts: string[];
}

export interface ClipHealthStatus {
  status: string;
  model: string;
  device: string;
  safetyConcepts: boolean;
}

// ─── Fetch Helper ──────────────────────────────────────────────────────

async function clipFetch<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${CLIP_SERVICE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "unknown error");
      throw new Error(`CLIP service ${path} returned ${res.status}: ${errBody}`);
    }

    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Embedding Cache ───────────────────────────────────────────────────

const embeddingCache = new Map<string, { embedding: number[]; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCachedEmbedding(key: string): number[] | null {
  const entry = embeddingCache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) {
    return entry.embedding;
  }
  if (entry) embeddingCache.delete(key);
  return null;
}

function setCachedEmbedding(key: string, embedding: number[]): void {
  // Keep cache bounded
  if (embeddingCache.size > 200) {
    const oldest = embeddingCache.keys().next().value;
    if (oldest) embeddingCache.delete(oldest);
  }
  embeddingCache.set(key, { embedding, ts: Date.now() });
}

// ─── Real CLIP Service Implementation ──────────────────────────────────

/**
 * Real CLIP service that calls the FastAPI inference endpoint.
 * Implements the ClipService interface for drop-in replacement of the mock.
 */
export const realClipService: ClipService = {
  async getEmbedding(imageUrl: string): Promise<number[]> {
    // Check cache first
    const cached = getCachedEmbedding(`img:${imageUrl}`);
    if (cached) return cached;

    const result = await clipFetch<{ embedding: number[]; dimension: number; input_type: string }>(
      "/embed",
      { url: imageUrl }
    );

    setCachedEmbedding(`img:${imageUrl}`, result.embedding);
    return result.embedding;
  },

  cosineSimilarity(a: number[], b: number[]): number {
    // Compute locally since we have the embeddings
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    const mag = Math.sqrt(magA) * Math.sqrt(magB);
    return mag === 0 ? 0 : dot / mag;
  },
};

// ─── Extended CLIP Client (beyond ClipService interface) ───────────────

/**
 * Get text embedding from the CLIP service.
 */
export async function getTextEmbedding(text: string): Promise<number[]> {
  const cached = getCachedEmbedding(`txt:${text}`);
  if (cached) return cached;

  const result = await clipFetch<{ embedding: number[]; dimension: number; input_type: string }>(
    "/embed",
    { text }
  );

  setCachedEmbedding(`txt:${text}`, result.embedding);
  return result.embedding;
}

/**
 * Compute image-to-image similarity directly via the CLIP service.
 * More efficient than getting two embeddings separately.
 */
export async function imageSimilarity(imageUrlA: string, imageUrlB: string): Promise<SimilarityResult> {
  const result = await clipFetch<{ similarity: number; score: number }>(
    "/similarity",
    { image_url_a: imageUrlA, image_url_b: imageUrlB }
  );
  return { similarity: result.similarity, score: result.score };
}

/**
 * Compare one image against multiple references.
 * Returns max and average similarity scores.
 */
export async function batchSimilarity(
  targetUrl: string,
  referenceUrls: string[]
): Promise<BatchSimilarityResult> {
  const result = await clipFetch<{
    similarities: number[];
    max_similarity: number;
    avg_similarity: number;
    max_score: number;
    avg_score: number;
  }>("/batch-similarity", { target_url: targetUrl, reference_urls: referenceUrls });

  return {
    similarities: result.similarities,
    maxSimilarity: result.max_similarity,
    avgSimilarity: result.avg_similarity,
    maxScore: result.max_score,
    avgScore: result.avg_score,
  };
}

/**
 * Compute text-to-image similarity.
 * Useful for style matching (e.g., "shounen anime style" vs generated image).
 */
export async function textImageSimilarity(
  imageUrl: string,
  text: string
): Promise<SimilarityResult> {
  const result = await clipFetch<{ similarity: number; score: number }>(
    "/text-similarity",
    { image_url: imageUrl, text }
  );
  return { similarity: result.similarity, score: result.score };
}

/**
 * Check content safety of an image.
 */
export async function checkSafety(imageUrl: string): Promise<SafetyResult> {
  const result = await clipFetch<{
    is_safe: boolean;
    safety_score: number;
    max_nsfw_similarity: number;
    max_safe_similarity: number;
    flagged_concepts: string[];
  }>("/safety", { image_url: imageUrl });

  return {
    isSafe: result.is_safe,
    safetyScore: result.safety_score,
    maxNsfwSimilarity: result.max_nsfw_similarity,
    maxSafeSimilarity: result.max_safe_similarity,
    flaggedConcepts: result.flagged_concepts,
  };
}

/**
 * Check if the CLIP service is healthy and available.
 */
export async function checkClipHealth(): Promise<ClipHealthStatus> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(`${CLIP_SERVICE_URL}/health`, {
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`Health check returned ${res.status}`);

    const data = (await res.json()) as {
      status: string;
      model: string;
      device: string;
      safety_concepts_loaded: boolean;
    };

    return {
      status: data.status,
      model: data.model,
      device: data.device,
      safetyConcepts: data.safety_concepts_loaded,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Auto-Fallback CLIP Service ────────────────────────────────────────

let _serviceAvailable: boolean | null = null;
let _lastHealthCheck = 0;
const HEALTH_CHECK_INTERVAL_MS = 60_000; // re-check every 60s

/**
 * Returns the real CLIP service if available, otherwise falls back to mock.
 * Caches the health check result for 60 seconds.
 */
export async function getClipService(): Promise<ClipService> {
  const now = Date.now();

  if (_serviceAvailable === null || now - _lastHealthCheck > HEALTH_CHECK_INTERVAL_MS) {
    try {
      const health = await checkClipHealth();
      _serviceAvailable = health.status === "ok";
      _lastHealthCheck = now;
    } catch {
      _serviceAvailable = false;
      _lastHealthCheck = now;
    }
  }

  if (_serviceAvailable) {
    return realClipService;
  }

  // Import mock from confidence-scorer
  const { _internal } = await import("./confidence-scorer");
  console.warn("[CLIP Client] Service unavailable, falling back to mock scorer");
  return _internal.mockClipService;
}

/**
 * Clear the embedding cache (useful for testing).
 */
export function clearEmbeddingCache(): void {
  embeddingCache.clear();
}

/**
 * Reset the health check state (useful for testing).
 */
export function resetHealthState(): void {
  _serviceAvailable = null;
  _lastHealthCheck = 0;
}

// ─── Exports for testing ───────────────────────────────────────────────

export const _internal = {
  CLIP_SERVICE_URL,
  REQUEST_TIMEOUT_MS,
  CACHE_TTL_MS,
  embeddingCache,
  getCachedEmbedding,
  setCachedEmbedding,
  clipFetch,
};
