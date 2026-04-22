/**
 * Character Embedding Service
 *
 * Handles CLIP/DINO embedding computation for character reference images
 * and style sheet processing. Used by the Stage 0 Tab C character foundation.
 *
 * Credit cost: 4c per reference image + 2c per character embedding compute.
 */
import { storagePut } from "./storage";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CharacterRefImage {
  url: string;
  fileKey: string;
  mimeType: string;
  width?: number;
  height?: number;
}

export interface EmbeddingResult {
  characterId: number;
  embeddingUrl: string;
  embeddingType: "clip" | "dino" | "ip_adapter";
  dimensions: number;
  computeTimeMs: number;
}

export interface StyleRefResult {
  styleRefId: string;
  embeddingUrl: string;
  detectedAttributes: {
    lineWeight: "thin" | "medium" | "bold" | "variable";
    palette: string[]; // hex colors
    mood: string;
    artStyle: string;
  };
}

// ─── Cost Constants ─────────────────────────────────────────────────────────

export const COST_PER_REF_IMAGE = 4;
export const COST_PER_EMBEDDING_COMPUTE = 2;
export const MAX_REF_IMAGES_PER_CHARACTER = 6;
export const MAX_CHARACTERS_PER_PROJECT = 12;

/**
 * Calculate the total credit cost for character foundation setup.
 */
export function calculateCharacterCost(
  characters: { refImageCount: number }[]
): { totalCost: number; breakdown: { imageIngest: number; embeddingCompute: number } } {
  const imageIngest = characters.reduce(
    (sum, c) => sum + c.refImageCount * COST_PER_REF_IMAGE,
    0
  );
  const embeddingCompute = characters.length * COST_PER_EMBEDDING_COMPUTE;
  return {
    totalCost: imageIngest + embeddingCompute,
    breakdown: { imageIngest, embeddingCompute },
  };
}

/**
 * Compute CLIP embedding for a set of character reference images.
 *
 * In production this would call an external ML service (e.g., RunPod).
 * For now, we simulate the embedding computation with a placeholder.
 */
export async function computeCharacterEmbedding(
  characterId: number,
  userId: number,
  refImages: CharacterRefImage[]
): Promise<EmbeddingResult> {
  const startTime = Date.now();

  // Simulate embedding computation (in production: call CLIP/DINO service)
  // The embedding would be a float32 array stored as binary in S3
  const embeddingDimensions = 768; // CLIP ViT-L/14
  const embeddingData = new Float32Array(embeddingDimensions);
  for (let i = 0; i < embeddingDimensions; i++) {
    embeddingData[i] = Math.random() * 2 - 1; // placeholder
  }

  // Store embedding in S3
  const embeddingKey = `character-embeddings/${userId}/${characterId}/clip_${Date.now()}.bin`;
  const buffer = Buffer.from(embeddingData.buffer);
  const { url } = await storagePut(embeddingKey, buffer, "application/octet-stream");

  return {
    characterId,
    embeddingUrl: url,
    embeddingType: "clip",
    dimensions: embeddingDimensions,
    computeTimeMs: Date.now() - startTime,
  };
}

/**
 * Process style reference images and extract attributes.
 *
 * In production this would use an LLM vision model to analyze the style.
 * For now, returns placeholder attributes.
 */
export async function processStyleRef(
  userId: number,
  projectId: number,
  imageUrl: string
): Promise<StyleRefResult> {
  const styleRefId = `style_${projectId}_${Date.now()}`;

  // Store a reference embedding for ControlNet conditioning
  const embeddingKey = `style-refs/${userId}/${projectId}/${styleRefId}.bin`;
  const placeholderBuffer = Buffer.alloc(512);
  const { url } = await storagePut(embeddingKey, placeholderBuffer, "application/octet-stream");

  return {
    styleRefId,
    embeddingUrl: url,
    detectedAttributes: {
      lineWeight: "medium",
      palette: ["#1a1a2e", "#6b5bff", "#00f0ff", "#ff2d7a"],
      mood: "dramatic",
      artStyle: "anime",
    },
  };
}

/**
 * Validate character reference images before processing.
 */
export function validateRefImages(
  images: { mimeType: string; sizeBytes?: number }[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
  const MAX_SIZE = 20 * 1024 * 1024; // 20MB per image

  if (images.length === 0) {
    errors.push("At least one reference image is required");
  }
  if (images.length > MAX_REF_IMAGES_PER_CHARACTER) {
    errors.push(`Maximum ${MAX_REF_IMAGES_PER_CHARACTER} reference images per character`);
  }

  images.forEach((img, i) => {
    if (!ACCEPTED_TYPES.includes(img.mimeType)) {
      errors.push(`Image ${i + 1}: unsupported format (use JPEG, PNG, or WebP)`);
    }
    if (img.sizeBytes && img.sizeBytes > MAX_SIZE) {
      errors.push(`Image ${i + 1}: exceeds 20MB limit`);
    }
  });

  return { valid: errors.length === 0, errors };
}
