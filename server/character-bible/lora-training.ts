/**
 * P26 Stage 2 (Premium): TAMS LoRA Training
 *
 * For premium users, trains a character-specific LoRA model using TAMS.
 * During training, falls back to IP-Adapter identity.
 * After completion, switches to LoRA identity mode.
 *
 * Training data: 8-12 images from reference sheet + generated variations.
 * Trigger word: awk_{characterId}
 * Training steps: 1200
 *
 * @see Awakli_Prompt26 §5
 */

import type { CharacterEntry, CharacterRegistry } from "./types";

// ─── TAMS Training Configuration ────────────────────────────────────────

export interface TAMSTrainingConfig {
  characterId: string;
  triggerWord: string;
  trainingImages: string[];
  steps: number;
  learningRate: number;
  resolution: number;
}

export interface TAMSTrainingResult {
  loraUrl: string;
  triggerWord: string;
  trainingSteps: number;
  status: "completed" | "failed";
  errorMessage?: string;
}

// ─── Training Data Assembly ─────────────────────────────────────────────

/**
 * Assemble training data for TAMS LoRA training.
 * Requires 8-12 images of the character from various angles.
 */
export function assembleTrainingData(
  character: CharacterEntry,
): { images: string[]; isReady: boolean; missingCount: number } {
  const images: string[] = [];

  // Reference sheet is the primary source
  if (character.identity.referenceSheetUrl) {
    images.push(character.identity.referenceSheetUrl);
  }

  // Face crop
  if (character.identity.ipAdapterRefUrl) {
    images.push(character.identity.ipAdapterRefUrl);
  }

  const MIN_IMAGES = 8;
  const isReady = images.length >= MIN_IMAGES;
  const missingCount = Math.max(0, MIN_IMAGES - images.length);

  return { images, isReady, missingCount };
}

/**
 * Build TAMS training configuration for a character.
 */
export function buildTrainingConfig(
  character: CharacterEntry,
  trainingImages: string[],
): TAMSTrainingConfig {
  const triggerWord = `awk_${character.characterId.replace("char_", "")}`;

  return {
    characterId: character.characterId,
    triggerWord,
    trainingImages,
    steps: 1200,
    learningRate: 1e-4,
    resolution: 512,
  };
}

// ─── Identity Mode Management ───────────────────────────────────────────

/**
 * Determine the best identity mode for a character.
 * Priority: LoRA (if ready) > IP-Adapter (if ref exists) > None
 */
export function resolveIdentityMode(
  character: CharacterEntry,
): "lora" | "ip_adapter" | "none" {
  if (
    character.identity.identityMode === "lora" &&
    character.identity.loraUrl &&
    character.identity.loraTrainingStatus === "completed"
  ) {
    return "lora";
  }

  if (character.identity.ipAdapterRefUrl) {
    return "ip_adapter";
  }

  return "none";
}

/**
 * Apply identity lock to a generation prompt.
 * Returns modified prompt + generation parameters.
 */
export function applyIdentityLock(
  character: CharacterEntry,
  basePrompt: string,
): {
  prompt: string;
  loraModelUrl?: string;
  loraWeight?: number;
  ipAdapterRefUrl?: string;
  ipAdapterWeight?: number;
} {
  const mode = resolveIdentityMode(character);

  switch (mode) {
    case "lora": {
      // Prepend trigger word to prompt
      const triggerWord = character.identity.loraTriggerWord || `awk_${character.characterId}`;
      return {
        prompt: `${triggerWord}, ${basePrompt}`,
        loraModelUrl: character.identity.loraUrl,
        loraWeight: character.identity.loraWeight || 0.7,
      };
    }

    case "ip_adapter": {
      return {
        prompt: basePrompt,
        ipAdapterRefUrl: character.identity.ipAdapterRefUrl,
        ipAdapterWeight: character.identity.ipAdapterWeight || 0.65,
      };
    }

    default:
      return { prompt: basePrompt };
  }
}

/**
 * Update character identity after LoRA training completes.
 */
export function applyLoraTrainingResult(
  character: CharacterEntry,
  result: TAMSTrainingResult,
): CharacterEntry {
  if (result.status === "failed") {
    return {
      ...character,
      identity: {
        ...character.identity,
        loraTrainingStatus: "failed",
      },
    };
  }

  return {
    ...character,
    identity: {
      ...character.identity,
      identityMode: "lora",
      loraUrl: result.loraUrl,
      loraTriggerWord: result.triggerWord,
      loraWeight: 0.7,
      loraTrainingStatus: "completed",
    },
  };
}

// Export for testing
export { resolveIdentityMode as _resolveIdentityMode };
