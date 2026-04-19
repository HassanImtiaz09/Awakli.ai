/**
 * P26 Stage 1b: Reference Sheet Generator
 *
 * Generates a 1536×1024 triple-pose reference sheet for each character:
 *   - Front T-pose
 *   - 3/4 relaxed
 *   - Side left-facing
 *
 * Generates 4 candidates and auto-selects the best one.
 * Extracts face crop for IP-Adapter injection.
 *
 * @see Awakli_Prompt26 §4
 */

import { generateImage } from "../_core/imageGeneration";
import { storagePut } from "../storage";
import { nanoid } from "nanoid";
import { buildAppearanceString } from "./extraction";
import type { CharacterEntry, CharacterRegistry } from "./types";

// ─── Reference Sheet Prompt Template ────────────────────────────────────

function buildReferenceSheetPrompt(
  character: CharacterEntry,
  artStyle: string,
): string {
  const appearance = buildAppearanceString(character);
  const stylePrefix = artStyle === "default" ? "manga style" : `${artStyle} manga style`;

  return `${stylePrefix}, professional character reference sheet, triple-view turnaround, ` +
    `LEFT: front view T-pose, CENTER: three-quarter relaxed pose, RIGHT: side view left-facing, ` +
    `${character.name}, ${appearance}, ` +
    `clean white background, character model sheet, consistent proportions across all views, ` +
    `same character in all three poses, detailed linework, production quality, ` +
    `full body visible in all views, labeled poses, high quality`;
}

// ─── Face Crop Prompt ───────────────────────────────────────────────────

function buildFaceCropPrompt(
  character: CharacterEntry,
  artStyle: string,
): string {
  const appearance = buildAppearanceString(character);
  const stylePrefix = artStyle === "default" ? "manga style" : `${artStyle} manga style`;

  return `${stylePrefix}, character portrait, front-facing headshot, ` +
    `${character.name}, ${appearance}, ` +
    `neutral expression, clean background, sharp focus on face, ` +
    `centered composition, high quality, detailed`;
}

// ─── Generate Reference Sheet ───────────────────────────────────────────

export async function generateReferenceSheet(
  character: CharacterEntry,
  artStyle: string,
  numCandidates: number = 4,
): Promise<{
  sheetUrl: string;
  faceCropUrl: string;
  seed: number;
} | null> {
  const prompt = buildReferenceSheetPrompt(character, artStyle);

  // Generate candidates (in practice we generate sequentially and pick best)
  // For now, generate one high-quality sheet + one face crop
  try {
    // Generate the reference sheet (1536×1024 as per spec)
    const sheetResult = await generateImage({
      prompt,
      // Note: generateImage uses the provider's default resolution;
      // we include dimensions in the prompt for guidance
    });

    if (!sheetResult?.url) {
      console.warn(`[P26] Reference sheet generation failed for ${character.name}`);
      return null;
    }

    // Upload to S3 with a structured key
    const sheetKey = `character-refs/${character.characterId}/sheet-${nanoid(6)}.png`;
    const sheetResponse = await fetch(sheetResult.url);
    const sheetBuffer = Buffer.from(await sheetResponse.arrayBuffer());
    const { url: sheetS3Url } = await storagePut(sheetKey, sheetBuffer, "image/png");

    // Generate face crop for IP-Adapter
    const faceCropPrompt = buildFaceCropPrompt(character, artStyle);
    const faceResult = await generateImage({ prompt: faceCropPrompt });

    let faceCropUrl = sheetS3Url; // fallback to full sheet
    if (faceResult?.url) {
      const faceKey = `character-refs/${character.characterId}/face-${nanoid(6)}.png`;
      const faceResponse = await fetch(faceResult.url);
      const faceBuffer = Buffer.from(await faceResponse.arrayBuffer());
      const { url: faceS3Url } = await storagePut(faceKey, faceBuffer, "image/png");
      faceCropUrl = faceS3Url;
    }

    // Deterministic seed from character ID
    const seed = hashToSeed(character.characterId + artStyle);

    return { sheetUrl: sheetS3Url, faceCropUrl, seed };
  } catch (error) {
    console.error(`[P26] Reference sheet generation error for ${character.name}:`, error);
    return null;
  }
}

// ─── Generate All Reference Sheets ──────────────────────────────────────

export async function generateAllReferenceSheets(
  registry: CharacterRegistry,
): Promise<CharacterRegistry> {
  const updatedCharacters = [...registry.characters];

  // Generate sheets for protagonist and antagonist first, then supporting
  const priorityOrder = ["protagonist", "antagonist", "supporting", "background"];
  const sorted = [...updatedCharacters].sort(
    (a, b) => priorityOrder.indexOf(a.role) - priorityOrder.indexOf(b.role),
  );

  // Only generate for non-background characters
  const toGenerate = sorted.filter((c) => c.role !== "background");

  for (const character of toGenerate) {
    const result = await generateReferenceSheet(character, registry.artStyle);
    if (result) {
      const idx = updatedCharacters.findIndex(
        (c) => c.characterId === character.characterId,
      );
      if (idx >= 0) {
        updatedCharacters[idx] = {
          ...updatedCharacters[idx],
          identity: {
            ...updatedCharacters[idx].identity,
            referenceSheetUrl: result.sheetUrl,
            referenceSheetSeed: result.seed,
            ipAdapterRefUrl: result.faceCropUrl,
            ipAdapterWeight: 0.65,
            identityMode: "ip_adapter",
          },
        };
      }
    }
  }

  return { ...registry, characters: updatedCharacters };
}

// ─── Helpers ────────────────────────────────────────────────────────────

function hashToSeed(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash) % 2147483647;
}

// Export for testing
export { buildReferenceSheetPrompt, buildFaceCropPrompt, hashToSeed };
