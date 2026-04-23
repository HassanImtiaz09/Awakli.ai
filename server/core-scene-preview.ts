/**
 * Core Scene Preview — Static Image Generation for Slice Storyboard
 *
 * Generates a cheap static preview image (~$0.04) for each 10-second slice.
 * Users review these previews in a storyboard grid before committing to
 * expensive video generation ($0.28–$0.36 per clip).
 *
 * Pipeline position: Stage 6 (after slice decomposition, before video generation)
 *
 * Key principles:
 *   - Compose rich visual prompts from slice metadata
 *   - Include character descriptions for consistency
 *   - Include camera angle, mood, and action context
 *   - Support retry with simplified prompts on failure
 *   - Track credit usage per preview
 */

import { generateImage } from "./_core/imageGeneration";
import { authorizeAndHold, commitTicket, releaseTicket, type GenerationAction } from "./credit-gateway";
import { getSliceById, updateSlice, getSlicesByEpisode, getCharactersByProject } from "./db";

// ─── Types ────────────────────────────────────────────────────────────────

export interface CoreScenePrompt {
  prompt: string;
  negativePrompt: string;
  sliceNumber: number;
  episodeId: number;
}

export interface CoreSceneResult {
  sliceId: number;
  sliceNumber: number;
  imageUrl: string | null;
  status: "generated" | "failed";
  error?: string;
  creditsUsed: number;
}

export interface BatchCoreSceneResult {
  total: number;
  generated: number;
  failed: number;
  results: CoreSceneResult[];
  totalCreditsUsed: number;
}

interface SliceData {
  id: number;
  sliceNumber: number | null;
  episodeId: number | null;
  projectId: number | null;
  sceneId: number | null;
  durationSeconds: string | number | null;
  characters: string | any;
  dialogue: string | any;
  actionDescription: string | null;
  cameraAngle: string | null;
  mood: string | null;
  complexityTier: number | null;
  klingModel: string | null;
  klingMode: string | null;
  lipSyncRequired: number | null;
  coreSceneImageUrl: string | null;
  coreSceneStatus: string | null;
}

// ─── Style & Prompt Constants ─────────────────────────────────────────────

const STYLE_PROMPTS: Record<string, string> = {
  shonen: "shonen anime style, dynamic action, bold lines, vibrant colors",
  seinen: "seinen anime style, mature tones, detailed shading, realistic proportions",
  shoujo: "shoujo anime style, soft colors, sparkle effects, elegant character design",
  chibi: "chibi anime style, super deformed, cute proportions, exaggerated expressions",
  cyberpunk: "cyberpunk anime style, neon lighting, futuristic tech, dark atmosphere",
  watercolor: "watercolor anime style, soft washes, painterly textures, dreamy atmosphere",
  noir: "noir anime style, high contrast, dramatic shadows, monochrome with accent colors",
  realistic: "realistic anime style, detailed anatomy, photorealistic lighting, cinematic",
  mecha: "mecha anime style, detailed mechanical design, dynamic poses, metallic shading",
  default: "anime style, clean linework, vibrant colors, professional manga art",
};

const CAMERA_MAP: Record<string, string> = {
  "wide": "wide angle shot, establishing shot, full environment visible",
  "medium": "medium shot, waist-up framing, balanced composition",
  "close-up": "close-up shot, face detail, emotional expression visible",
  "extreme-close-up": "extreme close-up, eye detail, intense focus",
  "birds-eye": "bird's eye view, top-down perspective, full scene layout",
  "low-angle": "low angle shot, dramatic perspective, looking up",
  "dutch-angle": "dutch angle, tilted frame, tension and unease",
  "over-shoulder": "over the shoulder shot, depth, conversation framing",
};

const MOOD_MAP: Record<string, string> = {
  "neutral": "",
  "tense": "tense atmosphere, dramatic lighting, shadows",
  "happy": "bright atmosphere, warm lighting, cheerful colors",
  "sad": "melancholic atmosphere, muted colors, soft shadows",
  "action": "dynamic atmosphere, motion blur, intense energy",
  "romantic": "soft atmosphere, warm glow, gentle lighting",
  "horror": "dark atmosphere, eerie lighting, unsettling shadows",
  "comedic": "light atmosphere, exaggerated expressions, bright colors",
  "mysterious": "mysterious atmosphere, fog, dim lighting, silhouettes",
  "epic": "epic atmosphere, dramatic sky, grand scale, cinematic lighting",
};

const NEGATIVE_PROMPT = "blurry, low quality, deformed, text, watermark, extra fingers, bad anatomy, cropped, ugly, duplicate, morbid, mutilated, poorly drawn face, mutation, extra limbs, nsfw, nude";

// ─── Prompt Builder ──────────────────────────────────────────────────────

/**
 * Build a rich visual prompt for a core scene preview image.
 *
 * Composes from:
 *   - Slice action description (primary visual content)
 *   - Character descriptions (from project character DB)
 *   - Camera angle
 *   - Mood/atmosphere
 *   - Project anime style
 *   - Dialogue context (for expression/emotion cues)
 */
export function buildCoreScenePrompt(
  slice: {
    actionDescription: string | null;
    cameraAngle: string | null;
    mood: string | null;
    characters: Array<{ name: string; role?: string }> | string;
    dialogue: Array<{ character: string; text: string; emotion: string }> | string;
    lipSyncRequired: boolean | number;
  },
  projectCharacters: Array<{
    name: string;
    visualTraits: any;
    loraModelUrl?: string | null;
    loraTriggerWord?: string | null;
  }>,
  animeStyle: string = "default",
  tone: string | null = null,
): CoreScenePrompt & { simplified: string } {
  // Parse JSON strings if needed
  const characters = typeof slice.characters === "string"
    ? safeParseJson<Array<{ name: string; role?: string }>>(slice.characters, [])
    : slice.characters || [];

  const dialogue = typeof slice.dialogue === "string"
    ? safeParseJson<Array<{ character: string; text: string; emotion: string }>>(slice.dialogue, [])
    : slice.dialogue || [];

  // Style
  const styleDesc = STYLE_PROMPTS[animeStyle] || STYLE_PROMPTS.default;

  // Camera
  const cameraDesc = CAMERA_MAP[slice.cameraAngle || "medium"] || CAMERA_MAP.medium;

  // Mood
  const moodDesc = MOOD_MAP[slice.mood || "neutral"] || "";

  // Character descriptions from project DB
  const charDescs = characters.map(sliceChar => {
    const dbChar = projectCharacters.find(
      c => c.name.toLowerCase() === sliceChar.name.toLowerCase()
    );
    if (dbChar) {
      const vt = dbChar.visualTraits as any;
      const traits = [
        vt?.hairColor && `${vt.hairColor} hair`,
        vt?.hairStyle && `${vt.hairStyle} hairstyle`,
        vt?.eyeColor && `${vt.eyeColor} eyes`,
        vt?.clothing && `wearing ${vt.clothing}`,
        vt?.bodyType && `${vt.bodyType} build`,
        vt?.distinguishingFeatures && vt.distinguishingFeatures,
      ].filter(Boolean).join(", ");
      // Include LoRA trigger word if available
      const trigger = dbChar.loraTriggerWord ? `${dbChar.loraTriggerWord}, ` : "";
      return `${trigger}${sliceChar.name}(${traits || "anime character"})`;
    }
    return `${sliceChar.name}(anime character)`;
  }).filter(Boolean);

  // Dialogue emotion cues (helps the image model capture the right expression)
  const emotionCues = dialogue
    .filter(d => d.emotion && d.emotion !== "neutral")
    .map(d => `${d.character} with ${d.emotion} expression`)
    .slice(0, 2);  // Max 2 emotion cues to avoid prompt bloat

  // Lip sync hint: if dialogue is present, ensure mouth is visible
  const lipSyncHint = (slice.lipSyncRequired === true || slice.lipSyncRequired === 1)
    ? "character speaking, mouth open, visible face"
    : "";

  // Compose the full prompt
  const promptParts = [
    styleDesc,
    cameraDesc,
    slice.actionDescription || "anime scene",
    charDescs.length > 0 ? `featuring ${charDescs.join(", ")}` : "",
    emotionCues.length > 0 ? emotionCues.join(", ") : "",
    lipSyncHint,
    moodDesc,
    tone ? `${tone} atmosphere` : "",
    "high quality, detailed, professional anime art, single frame, key visual",
  ].filter(Boolean).join(", ");

  // Simplified prompt (fallback for retries)
  const simplifiedParts = [
    styleDesc,
    cameraDesc,
    slice.actionDescription || "anime scene",
    charDescs.length > 0 ? `featuring ${charDescs[0]}` : "",
    "high quality, anime art",
  ].filter(Boolean).join(", ");

  return {
    prompt: promptParts,
    negativePrompt: NEGATIVE_PROMPT,
    simplified: simplifiedParts,
    sliceNumber: 0,  // Set by caller
    episodeId: 0,    // Set by caller
  };
}

// ─── Single Slice Preview Generation ──────────────────────────────────────

/**
 * Generate a core scene preview image for a single slice.
 * Handles credit authorization, image generation, retry, and DB update.
 */
export async function generateCoreScenePreview(
  sliceId: number,
  userId: number,
  projectCharacters: Array<{
    name: string;
    visualTraits: any;
    loraModelUrl?: string | null;
    loraTriggerWord?: string | null;
  }>,
  animeStyle: string = "default",
  tone: string | null = null,
): Promise<CoreSceneResult> {
  const slice = await getSliceById(sliceId);
  if (!slice) {
    return {
      sliceId,
      sliceNumber: 0,
      imageUrl: null,
      status: "failed",
      error: "Slice not found",
      creditsUsed: 0,
    };
  }

  // Authorize credit hold
  const auth = await authorizeAndHold(userId, "core_scene_preview" as GenerationAction, {
    episodeId: slice.episodeId ?? undefined,
    projectId: slice.projectId ?? undefined,
    description: `Core scene preview for slice #${slice.sliceNumber}`,
  });

  if (!auth.authorized || !auth.ticket) {
    return {
      sliceId,
      sliceNumber: slice.sliceNumber ?? 0,
      imageUrl: null,
      status: "failed",
      error: auth.error || "Insufficient credits",
      creditsUsed: 0,
    };
  }

  try {
    // Build prompt
    const promptData = buildCoreScenePrompt(
      {
        actionDescription: slice.actionDescription,
        cameraAngle: slice.cameraAngle,
        mood: slice.mood,
        characters: slice.characters as any,
        dialogue: slice.dialogue as any,
        lipSyncRequired: slice.lipSyncRequired ?? 0,
      },
      projectCharacters,
      animeStyle,
      tone,
    );

    // Attempt generation with full prompt
    let imageUrl: string | null = null;
    try {
      const result = await generateImage({ prompt: promptData.prompt });
      imageUrl = result.url || null;
    } catch (firstError) {
      // Retry with simplified prompt
      console.warn(`[CoreScene] Full prompt failed for slice #${slice.sliceNumber}, retrying with simplified prompt:`, firstError);
      try {
        const result = await generateImage({ prompt: promptData.simplified });
        imageUrl = result.url || null;
      } catch (retryError) {
        // Both attempts failed — release credits
        await releaseTicket(auth.ticket);
        await updateSlice(sliceId, {
          coreSceneStatus: "rejected",
        });
        return {
          sliceId,
          sliceNumber: slice.sliceNumber ?? 0,
          imageUrl: null,
          status: "failed",
          error: `Image generation failed: ${retryError instanceof Error ? retryError.message : "Unknown error"}`,
          creditsUsed: 0,
        };
      }
    }

    // Commit credits on success
    await commitTicket(auth.ticket);

    // Update slice in DB
    await updateSlice(sliceId, {
      coreSceneImageUrl: imageUrl,
      coreSceneStatus: "generated",
    });

    return {
      sliceId,
      sliceNumber: slice.sliceNumber ?? 0,
      imageUrl,
      status: "generated",
      creditsUsed: auth.ticket.creditsHeld,
    };
  } catch (error) {
    // Unexpected error — release credits
    await releaseTicket(auth.ticket);
    await updateSlice(sliceId, {
      coreSceneStatus: "rejected",
    });
    return {
      sliceId,
      sliceNumber: slice.sliceNumber ?? 0,
      imageUrl: null,
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown error",
      creditsUsed: 0,
    };
  }
}

// ─── Batch Generation ─────────────────────────────────────────────────────

/**
 * Generate core scene previews for all pending slices in an episode.
 * Processes sequentially to avoid overwhelming the image API.
 * Skips slices that already have a generated or approved preview.
 */
export async function generateAllCoreScenesForEpisode(
  episodeId: number,
  userId: number,
  projectId: number,
  animeStyle: string = "default",
  tone: string | null = null,
  concurrency: number = 2,
): Promise<BatchCoreSceneResult> {
  const slices = await getSlicesByEpisode(episodeId);
  const projectCharacters = await getCharactersByProject(projectId);

  // Filter to only pending slices (skip generated/approved)
  const pendingSlices = slices.filter(
    s => !s.coreSceneStatus || s.coreSceneStatus === "pending" || s.coreSceneStatus === "rejected"
  );

  const results: CoreSceneResult[] = [];
  let totalCreditsUsed = 0;

  // Process in batches for controlled concurrency
  for (let i = 0; i < pendingSlices.length; i += concurrency) {
    const batch = pendingSlices.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(slice =>
        generateCoreScenePreview(
          slice.id,
          userId,
          projectCharacters as any,
          animeStyle,
          tone,
        )
      )
    );

    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        results.push(result.value);
        totalCreditsUsed += result.value.creditsUsed;
      } else {
        results.push({
          sliceId: 0,
          sliceNumber: 0,
          imageUrl: null,
          status: "failed",
          error: result.reason?.message || "Unknown error",
          creditsUsed: 0,
        });
      }
    }
  }

  return {
    total: pendingSlices.length,
    generated: results.filter(r => r.status === "generated").length,
    failed: results.filter(r => r.status === "failed").length,
    results,
    totalCreditsUsed,
  };
}

// ─── Approval / Rejection ─────────────────────────────────────────────────

/**
 * Approve a slice's core scene preview.
 * Marks it as ready for video generation.
 */
export async function approveCoreScene(sliceId: number): Promise<{ success: boolean; error?: string }> {
  const slice = await getSliceById(sliceId);
  if (!slice) {
    return { success: false, error: "Slice not found" };
  }
  if (!slice.coreSceneImageUrl) {
    return { success: false, error: "No preview image exists for this slice. Generate one first." };
  }
  await updateSlice(sliceId, { coreSceneStatus: "approved" });
  return { success: true };
}

/**
 * Reject a slice's core scene preview.
 * Marks it for regeneration with optional feedback.
 */
export async function rejectCoreScene(
  sliceId: number,
  feedback?: string,
): Promise<{ success: boolean; error?: string }> {
  const slice = await getSliceById(sliceId);
  if (!slice) {
    return { success: false, error: "Slice not found" };
  }
  await updateSlice(sliceId, {
    coreSceneStatus: "rejected",
    coreSceneImageUrl: null,  // Clear the old image
  });
  return { success: true };
}

/**
 * Bulk approve all generated core scenes for an episode.
 */
export async function approveAllCoreScenes(episodeId: number): Promise<{ approved: number; skipped: number }> {
  const slices = await getSlicesByEpisode(episodeId);
  let approved = 0;
  let skipped = 0;

  for (const slice of slices) {
    if (slice.coreSceneStatus === "generated" && slice.coreSceneImageUrl) {
      await updateSlice(slice.id, { coreSceneStatus: "approved" });
      approved++;
    } else {
      skipped++;
    }
  }

  return { approved, skipped };
}

// ─── Utility ──────────────────────────────────────────────────────────────

function safeParseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
