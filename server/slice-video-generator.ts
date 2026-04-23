/**
 * Slice Video Generator — 10-Second Clip Generation Engine
 *
 * Generates video clips for approved core scene slices using the Kling API
 * with intra-Kling routing, Element binding, and lip sync.
 *
 * Pipeline position: Stage 6 (after core scene approval, before assembly)
 *
 * Key features:
 *   - Routes each slice to the correct Kling model/mode based on complexity tier
 *   - Binds character Elements for visual consistency across clips
 *   - Integrates lip sync via <<<element_N>>> voice tags for dialogue slices
 *   - Handles credit hold/commit lifecycle per clip
 *   - Supports batch generation with concurrency limits
 *   - Tracks generation attempts and allows retry on failure
 */

import {
  generateVideoFromImage,
  generateOmniVideo,
  generateVideoFromText,
} from "./kling";
import { buildLipSyncPrompt } from "./kling-subjects";
import {
  getSliceById,
  getSlicesByEpisode,
  updateSlice,
  getReadyElementMapForProject,
} from "./db";
import { submitJob } from "./generation-queue";
import type { GenerationAction } from "./credit-gateway";

// ─── Types ────────────────────────────────────────────────────────────────

export interface SliceVideoConfig {
  /** Max concurrent clip generations per batch (default: 3) */
  maxConcurrent: number;
  /** Max retries per slice before marking as failed (default: 3) */
  maxRetries: number;
  /** Max wait time for a single Kling generation task in ms (default: 10 min) */
  maxWaitMs: number;
  /** Default aspect ratio (default: "16:9") */
  aspectRatio: "16:9" | "9:16" | "1:1";
}

const DEFAULT_CONFIG: SliceVideoConfig = {
  maxConcurrent: 3,
  maxRetries: 3,
  maxWaitMs: 10 * 60 * 1000,
  aspectRatio: "16:9",
};

export interface SliceVideoResult {
  sliceId: number;
  sliceNumber: number;
  success: boolean;
  videoUrl?: string;
  videoId?: string;
  durationMs?: number;
  taskId?: string;
  error?: string;
  attempts: number;
  creditsUsed: number;
  klingModel: string;
  klingMode: string;
}

export interface BatchVideoResult {
  episodeId: number;
  totalSlices: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  totalCreditsUsed: number;
  results: SliceVideoResult[];
  startedAt: number;
  completedAt: number;
}

// ─── Model Routing Map ────────────────────────────────────────────────────

/**
 * Maps complexity tier + mode to the Kling API model name and endpoint strategy.
 *
 * Tier 1 (V3 Omni): Full lip sync + Elements → use omniVideo endpoint
 * Tier 2 (V2.6): High quality, no native lip sync → use image2video
 * Tier 3 (V2.1): Medium quality → use image2video
 * Tier 4 (V1.6): Budget → use image2video or text2video
 */
interface ModelRouteConfig {
  modelName: string;
  endpoint: "omni" | "image2video" | "text2video";
  supportsElements: boolean;
  supportsNativeLipSync: boolean;
  maxDurationSeconds: number;
  creditAction: GenerationAction;
}

const MODEL_ROUTES: Record<string, ModelRouteConfig> = {
  // Tier 1: V3 Omni — full features
  "v3_omni_professional": {
    modelName: "kling-video-o1",
    endpoint: "omni",
    supportsElements: true,
    supportsNativeLipSync: true,
    maxDurationSeconds: 10,
    creditAction: "video_10s_premium",
  },
  "v3_omni_standard": {
    modelName: "kling-video-o1",
    endpoint: "omni",
    supportsElements: true,
    supportsNativeLipSync: true,
    maxDurationSeconds: 10,
    creditAction: "video_10s_standard",
  },
  // Tier 2: V2.6 — high quality, no native lip sync
  "v2_6_professional": {
    modelName: "kling-v2-6",
    endpoint: "image2video",
    supportsElements: false,
    supportsNativeLipSync: false,
    maxDurationSeconds: 10,
    creditAction: "video_10s_standard",
  },
  "v2_6_standard": {
    modelName: "kling-v2-6",
    endpoint: "image2video",
    supportsElements: false,
    supportsNativeLipSync: false,
    maxDurationSeconds: 10,
    creditAction: "video_10s_budget",
  },
  // Tier 3: V2.1 — medium quality
  "v2_1_professional": {
    modelName: "kling-v2-1",
    endpoint: "image2video",
    supportsElements: false,
    supportsNativeLipSync: false,
    maxDurationSeconds: 10,
    creditAction: "video_10s_budget",
  },
  "v2_1_standard": {
    modelName: "kling-v2-1",
    endpoint: "image2video",
    supportsElements: false,
    supportsNativeLipSync: false,
    maxDurationSeconds: 10,
    creditAction: "video_10s_budget",
  },
  // Tier 4: V1.6 — budget (transitions, establishing shots)
  "v1_6_professional": {
    modelName: "kling-v1-6",
    endpoint: "image2video",
    supportsElements: false,
    supportsNativeLipSync: false,
    maxDurationSeconds: 10,
    creditAction: "video_10s_budget",
  },
  "v1_6_standard": {
    modelName: "kling-v1-6",
    endpoint: "text2video",
    supportsElements: false,
    supportsNativeLipSync: false,
    maxDurationSeconds: 10,
    creditAction: "video_10s_budget",
  },
};

// ─── Route Resolution ─────────────────────────────────────────────────────

export function resolveModelRoute(
  klingModel: string,
  klingMode: string
): ModelRouteConfig {
  const key = `${klingModel}_${klingMode}`;
  const route = MODEL_ROUTES[key];
  if (!route) {
    // Fallback to V3 Omni professional if unknown combination
    console.warn(`[SliceVideoGen] Unknown model route: ${key}, falling back to v3_omni_professional`);
    return MODEL_ROUTES["v3_omni_professional"];
  }
  return route;
}

// ─── Prompt Building ──────────────────────────────────────────────────────

/**
 * Build the video generation prompt for a slice.
 * For Omni endpoint with Elements: uses <<<element_N>>> voice tags.
 * For image2video/text2video: uses descriptive prompt without voice tags.
 */
export function buildSliceVideoPrompt(
  slice: {
    actionDescription: string | null;
    cameraAngle: string | null;
    mood: string | null;
    dialogue: unknown;
    characters: unknown;
    lipSyncRequired: number;
  },
  route: ModelRouteConfig,
  elementMap: Map<string, number>,
  elementOrder: string[]
): string {
  const action = slice.actionDescription || "A cinematic anime scene";
  const camera = slice.cameraAngle ? `, ${slice.cameraAngle} shot` : "";
  const moodStr = slice.mood ? `, ${slice.mood} atmosphere` : "";

  const basePrompt = `${action}${camera}${moodStr}. Anime style, high quality animation, fluid movement, expressive character performance.`;

  // Parse dialogue from JSON
  const dialogueLines = safeParseDialogue(slice.dialogue);

  // If Omni endpoint with Elements and lip sync required, use voice tags
  if (
    route.endpoint === "omni" &&
    route.supportsElements &&
    route.supportsNativeLipSync &&
    slice.lipSyncRequired === 1 &&
    dialogueLines.length > 0 &&
    elementOrder.length > 0
  ) {
    return buildLipSyncPrompt(
      basePrompt,
      dialogueLines.map((d) => ({
        characterName: d.character || "Unknown",
        dialogue: d.text,
        emotion: d.emotion,
      })),
      elementOrder
    );
  }

  // For non-Omni endpoints or no lip sync: include dialogue as descriptive text
  if (dialogueLines.length > 0) {
    const dialogueText = dialogueLines
      .map((d) => {
        const speaker = d.character || "A character";
        return `${speaker} says: "${d.text}"`;
      })
      .join(". ");
    return `${basePrompt} ${dialogueText}`;
  }

  return basePrompt;
}

function safeParseDialogue(
  dialogue: unknown
): Array<{ character: string; text: string; emotion?: string }> {
  if (!dialogue) return [];
  if (Array.isArray(dialogue)) {
    return dialogue.filter(
      (d) => d && typeof d === "object" && typeof d.text === "string"
    );
  }
  if (typeof dialogue === "string") {
    try {
      const parsed = JSON.parse(dialogue);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // not JSON
    }
  }
  return [];
}

function safeParseCharacters(
  characters: unknown
): Array<{ name: string; characterId?: number; elementId?: number; loraId?: number }> {
  if (!characters) return [];
  if (Array.isArray(characters)) return characters;
  if (typeof characters === "string") {
    try {
      const parsed = JSON.parse(characters);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // not JSON
    }
  }
  return [];
}

// ─── Single Slice Video Generation ────────────────────────────────────────

/**
 * Generate a video clip for a single approved slice.
 * Handles model routing, Element binding, prompt building, and DB updates.
 */
export async function generateSliceVideo(
  sliceId: number,
  userId: number,
  projectId: number,
  config: Partial<SliceVideoConfig> = {}
): Promise<SliceVideoResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Fetch the slice
  const slice = await getSliceById(sliceId);
  if (!slice) {
    throw new Error(`Slice ${sliceId} not found`);
  }

  // Validate slice is ready for video generation
  if (slice.coreSceneStatus !== "approved") {
    throw new Error(
      `Slice ${sliceId} core scene is not approved (status: ${slice.coreSceneStatus})`
    );
  }

  if (slice.videoClipStatus === "generated" || slice.videoClipStatus === "approved") {
    return {
      sliceId,
      sliceNumber: slice.sliceNumber,
      success: true,
      videoUrl: slice.videoClipUrl || undefined,
      attempts: slice.videoClipAttempts || 0,
      creditsUsed: slice.actualCredits || 0,
      klingModel: slice.klingModel,
      klingMode: slice.klingMode,
    };
  }

  // Check retry limit
  const attempts = (slice.videoClipAttempts || 0) + 1;
  if (attempts > cfg.maxRetries) {
    throw new Error(
      `Slice ${sliceId} has exceeded max retries (${cfg.maxRetries})`
    );
  }

  // Resolve the model route
  const route = resolveModelRoute(slice.klingModel, slice.klingMode);

  // Get Element map for the project
  const elementMap = await getReadyElementMapForProject(projectId);
  const sliceCharacters = safeParseCharacters(slice.characters);

  // Build element_list and elementOrder for this slice's characters
  const elementList: Array<{ element_id: number }> = [];
  const elementOrder: string[] = [];

  if (route.supportsElements) {
    for (const char of sliceCharacters) {
      const elementId = char.elementId || elementMap.get(char.name);
      if (elementId) {
        elementList.push({ element_id: elementId });
        elementOrder.push(char.name);
      }
    }
  }

  // Build the prompt
  const prompt = buildSliceVideoPrompt(slice, route, elementMap, elementOrder);

  // Mark as generating
  await updateSlice(sliceId, {
    videoClipStatus: "generating",
    videoClipAttempts: attempts,
  });

  try {
    // Submit to generation queue with credit handling
    const result = await submitJob(
      userId,
      route.creditAction,
      async () => {
        return executeKlingGeneration(
          slice,
          route,
          prompt,
          elementList,
          cfg
        );
      },
      {
        withCredits: true,
        episodeId: slice.episodeId,
        projectId,
        description: `Slice ${slice.sliceNumber} video (${route.modelName} ${slice.klingMode})`,
      }
    );

    // Update slice with success
    await updateSlice(sliceId, {
      videoClipUrl: result.videoUrl,
      videoClipStatus: "generated",
      videoClipDurationMs: result.durationMs,
      actualCredits: slice.estimatedCredits || 0,
    });

    return {
      sliceId,
      sliceNumber: slice.sliceNumber,
      success: true,
      videoUrl: result.videoUrl,
      videoId: result.videoId,
      durationMs: result.durationMs,
      taskId: result.taskId,
      attempts,
      creditsUsed: slice.estimatedCredits || 0,
      klingModel: slice.klingModel,
      klingMode: slice.klingMode,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[SliceVideoGen] Slice ${sliceId} failed (attempt ${attempts}): ${errorMsg}`);

    // Mark as failed
    await updateSlice(sliceId, {
      videoClipStatus: "failed",
    });

    return {
      sliceId,
      sliceNumber: slice.sliceNumber,
      success: false,
      error: errorMsg,
      attempts,
      creditsUsed: 0,
      klingModel: slice.klingModel,
      klingMode: slice.klingMode,
    };
  }
}

// ─── Kling API Execution ──────────────────────────────────────────────────

interface KlingGenResult {
  videoUrl: string;
  videoId: string;
  durationMs: number;
  taskId: string;
}

async function executeKlingGeneration(
  slice: {
    coreSceneImageUrl: string | null;
    durationSeconds: number;
    klingMode: string;
  },
  route: ModelRouteConfig,
  prompt: string,
  elementList: Array<{ element_id: number }>,
  config: SliceVideoConfig
): Promise<KlingGenResult> {
  const duration = String(Math.min(
    Math.round(slice.durationSeconds),
    route.maxDurationSeconds
  ));
  const mode = slice.klingMode === "professional" ? "pro" : "std";

  let result: { videoUrl: string; videoId: string; duration: string; taskId: string };

  switch (route.endpoint) {
    case "omni": {
      // V3 Omni — supports Elements, lip sync, native audio
      const omniParams: Parameters<typeof generateOmniVideo>[0] = {
        prompt,
        duration,
        mode,
        modelName: route.modelName as "kling-video-o1" | "kling-v3-omni",
        aspectRatio: config.aspectRatio,
        sound: "on",
        maxWaitMs: config.maxWaitMs,
      };

      // Add core scene image as reference
      if (slice.coreSceneImageUrl) {
        omniParams.imageList = [{ image_url: slice.coreSceneImageUrl }];
      }

      // Add Element binding
      if (elementList.length > 0) {
        omniParams.elementList = elementList;
      }

      result = await generateOmniVideo(omniParams);
      break;
    }

    case "image2video": {
      // V2.6/V2.1/V1.6 — image-to-video with core scene as input
      if (!slice.coreSceneImageUrl) {
        throw new Error("Core scene image required for image2video generation");
      }

      result = await generateVideoFromImage({
        prompt,
        image: slice.coreSceneImageUrl,
        modelName: route.modelName,
        duration: duration as "5" | "10",
        mode,
        maxWaitMs: config.maxWaitMs,
      });
      break;
    }

    case "text2video": {
      // V1.6 standard — text-only for transitions/establishing shots
      result = await generateVideoFromText({
        prompt,
        modelName: route.modelName,
        duration: duration as "5" | "10",
        mode,
        maxWaitMs: config.maxWaitMs,
      });
      break;
    }

    default:
      throw new Error(`Unknown endpoint type: ${route.endpoint}`);
  }

  return {
    videoUrl: result.videoUrl,
    videoId: result.videoId,
    durationMs: parseFloat(result.duration) * 1000,
    taskId: result.taskId,
  };
}

// ─── Batch Video Generation ───────────────────────────────────────────────

/**
 * Generate video clips for all approved slices in an episode.
 * Processes slices in order with configurable concurrency.
 */
export async function generateEpisodeVideos(
  episodeId: number,
  userId: number,
  projectId: number,
  config: Partial<SliceVideoConfig> = {},
  onProgress?: (completed: number, total: number, result: SliceVideoResult) => void
): Promise<BatchVideoResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const startedAt = Date.now();

  // Fetch all slices for the episode
  const slices = await getSlicesByEpisode(episodeId);
  if (!slices || slices.length === 0) {
    throw new Error(`No slices found for episode ${episodeId}`);
  }

  // Filter to only approved core scenes that need video generation
  const eligibleSlices = slices.filter(
    (s) =>
      s.coreSceneStatus === "approved" &&
      s.videoClipStatus !== "generated" &&
      s.videoClipStatus !== "approved"
  );

  const results: SliceVideoResult[] = [];
  let successCount = 0;
  let failedCount = 0;
  const skippedCount = slices.length - eligibleSlices.length;
  let totalCreditsUsed = 0;

  // Process in batches with concurrency limit
  for (let i = 0; i < eligibleSlices.length; i += cfg.maxConcurrent) {
    const batch = eligibleSlices.slice(i, i + cfg.maxConcurrent);

    const batchResults = await Promise.allSettled(
      batch.map((slice) =>
        generateSliceVideo(slice.id, userId, projectId, cfg)
      )
    );

    for (const settled of batchResults) {
      if (settled.status === "fulfilled") {
        const result = settled.value;
        results.push(result);
        if (result.success) {
          successCount++;
          totalCreditsUsed += result.creditsUsed;
        } else {
          failedCount++;
        }
        onProgress?.(results.length, eligibleSlices.length, result);
      } else {
        // Promise rejected — unexpected error
        const errorResult: SliceVideoResult = {
          sliceId: batch[batchResults.indexOf(settled)]?.id || 0,
          sliceNumber: batch[batchResults.indexOf(settled)]?.sliceNumber || 0,
          success: false,
          error: settled.reason?.message || "Unknown error",
          attempts: 1,
          creditsUsed: 0,
          klingModel: "unknown",
          klingMode: "unknown",
        };
        results.push(errorResult);
        failedCount++;
        onProgress?.(results.length, eligibleSlices.length, errorResult);
      }
    }
  }

  return {
    episodeId,
    totalSlices: slices.length,
    successCount,
    failedCount,
    skippedCount,
    totalCreditsUsed,
    results,
    startedAt,
    completedAt: Date.now(),
  };
}

// ─── Retry Failed Slices ──────────────────────────────────────────────────

/**
 * Retry video generation for all failed slices in an episode.
 */
export async function retryFailedSlices(
  episodeId: number,
  userId: number,
  projectId: number,
  config: Partial<SliceVideoConfig> = {},
  onProgress?: (completed: number, total: number, result: SliceVideoResult) => void
): Promise<BatchVideoResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const startedAt = Date.now();

  const slices = await getSlicesByEpisode(episodeId);
  if (!slices || slices.length === 0) {
    throw new Error(`No slices found for episode ${episodeId}`);
  }

  // Only retry failed slices that haven't exceeded max retries
  const failedSlices = slices.filter(
    (s) =>
      s.videoClipStatus === "failed" &&
      s.coreSceneStatus === "approved" &&
      (s.videoClipAttempts || 0) < cfg.maxRetries
  );

  const results: SliceVideoResult[] = [];
  let successCount = 0;
  let failedCount = 0;
  const skippedCount = slices.length - failedSlices.length;
  let totalCreditsUsed = 0;

  // Reset failed status to pending before retry
  for (const slice of failedSlices) {
    await updateSlice(slice.id, { videoClipStatus: "pending" });
  }

  // Process with concurrency limit
  for (let i = 0; i < failedSlices.length; i += cfg.maxConcurrent) {
    const batch = failedSlices.slice(i, i + cfg.maxConcurrent);

    const batchResults = await Promise.allSettled(
      batch.map((slice) =>
        generateSliceVideo(slice.id, userId, projectId, cfg)
      )
    );

    for (const settled of batchResults) {
      if (settled.status === "fulfilled") {
        const result = settled.value;
        results.push(result);
        if (result.success) {
          successCount++;
          totalCreditsUsed += result.creditsUsed;
        } else {
          failedCount++;
        }
        onProgress?.(results.length, failedSlices.length, result);
      } else {
        failedCount++;
      }
    }
  }

  return {
    episodeId,
    totalSlices: slices.length,
    successCount,
    failedCount,
    skippedCount,
    totalCreditsUsed,
    results,
    startedAt,
    completedAt: Date.now(),
  };
}

// ─── Status Helpers ───────────────────────────────────────────────────────

export interface EpisodeVideoStatus {
  episodeId: number;
  totalSlices: number;
  pending: number;
  generating: number;
  generated: number;
  approved: number;
  failed: number;
  totalEstimatedCredits: number;
  totalActualCredits: number;
  allComplete: boolean;
  allApproved: boolean;
  readyForAssembly: boolean;
}

/**
 * Get the video generation status for all slices in an episode.
 */
export async function getEpisodeVideoStatus(
  episodeId: number
): Promise<EpisodeVideoStatus> {
  const slices = await getSlicesByEpisode(episodeId);
  if (!slices || slices.length === 0) {
    return {
      episodeId,
      totalSlices: 0,
      pending: 0,
      generating: 0,
      generated: 0,
      approved: 0,
      failed: 0,
      totalEstimatedCredits: 0,
      totalActualCredits: 0,
      allComplete: false,
      allApproved: false,
      readyForAssembly: false,
    };
  }

  const counts = {
    pending: 0,
    generating: 0,
    generated: 0,
    approved: 0,
    failed: 0,
    rejected: 0,
  };

  let totalEstimatedCredits = 0;
  let totalActualCredits = 0;

  for (const slice of slices) {
    const status = slice.videoClipStatus as keyof typeof counts;
    if (status in counts) {
      counts[status]++;
    }
    totalEstimatedCredits += slice.estimatedCredits || 0;
    totalActualCredits += slice.actualCredits || 0;
  }

  const allComplete =
    counts.pending === 0 && counts.generating === 0;
  const allApproved = counts.approved === slices.length;
  // Ready for assembly when all clips are generated or approved (none pending/generating/failed)
  const readyForAssembly =
    counts.pending === 0 &&
    counts.generating === 0 &&
    counts.failed === 0 &&
    (counts.generated + counts.approved) === slices.length;

  return {
    episodeId,
    totalSlices: slices.length,
    ...counts,
    totalEstimatedCredits,
    totalActualCredits,
    allComplete,
    allApproved,
    readyForAssembly,
  };
}
