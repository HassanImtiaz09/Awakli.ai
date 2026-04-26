/**
 * D2: Visual Prompt Engineer — Per-slice model-specific prompt translation
 *
 * P13 C4: Descriptor substitution (character names → descriptors),
 *         UI negative prompt, style_lock propagation, 500-token cap.
 * P13 C2: style_lock forbidden list appended as negative_prompt.
 *
 * Uses Claude Sonnet via the LLM orchestrator (I1).
 * Latency budget: ≤5 seconds per slice.
 * Cost budget: ~$0.01–$0.03 per slice.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { llmCall } from "./orchestrator.js";
import type { ProjectPlanSlice } from "./director.js";
import type { CharacterBible, StyleLock } from "../character-bible/schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Constants ───────────────────────────────────────────────────────────

/** C4: Global negative prompt to prevent UI/text artefacts */
const UI_NEGATIVE_PROMPT =
  "no text overlays, no UI panels, no character labels, no holographic text, no name tags, no character profile text, no on-screen text";

/** C4: Max prompt length in words (~500 tokens ≈ 375 words) */
const MAX_PROMPT_WORDS = 375;

// ─── Types ───────────────────────────────────────────────────────────────

export type TargetModel = "wan27" | "veo31lite" | "viduq3";

export interface PromptEngineerInput {
  slice: ProjectPlanSlice;
  targetModel: TargetModel;
  characterLocks: Record<string, string>;
  /** P13 C4: Structured character bibles for descriptor substitution */
  characterBibles?: Record<string, CharacterBible>;
  /** P13 C2: Style lock for negative prompt generation */
  styleLock?: StyleLock;
  existingPrompt?: string;
}

export interface PromptEngineerResult {
  sliceId: number;
  videoPrompt: string;
  negativePrompt: string;
  promptLengthWords: number;
  modelOptimisations: string[];
  characterLockInjected: boolean;
  ambientSoundHint?: string;
  latencyMs: number;
  costEstimate: number;
  success: boolean;
  error?: string;
}

// ─── System prompt ───────────────────────────────────────────────────────

let _systemPrompt: string | null = null;

function getSystemPrompt(): string {
  if (_systemPrompt) return _systemPrompt;
  try {
    _systemPrompt = fs.readFileSync(
      path.join(__dirname, "prompts", "prompt-engineer-system.md"),
      "utf-8"
    );
  } catch {
    _systemPrompt = `You are the Visual Prompt Engineer for Awakli. Translate scene plans into model-optimised video prompts. Use character DESCRIPTORS instead of names. Output JSON: { videoPrompt, promptLengthWords, modelOptimisations[], characterLockInjected, ambientSoundHint }.`;
  }
  return _systemPrompt;
}

// ─── Response schema ─────────────────────────────────────────────────────

const PROMPT_ENGINEER_SCHEMA = {
  name: "prompt_engineer_output_v2",
  strict: true,
  schema: {
    type: "object" as const,
    properties: {
      videoPrompt: { type: "string", description: "The optimised video generation prompt (NO character names, use descriptors only)" },
      promptLengthWords: { type: "number", description: "Word count of the prompt" },
      modelOptimisations: {
        type: "array",
        items: { type: "string" },
        description: "List of model-specific optimisations applied",
      },
      characterLockInjected: { type: "boolean", description: "Whether character descriptors were injected" },
      ambientSoundHint: { type: "string", description: "Ambient sound description for veo31lite, empty string otherwise" },
    },
    required: ["videoPrompt", "promptLengthWords", "modelOptimisations", "characterLockInjected", "ambientSoundHint"],
    additionalProperties: false,
  },
};

// ─── Main function ───────────────────────────────────────────────────────

export async function runPromptEngineer(input: PromptEngineerInput): Promise<PromptEngineerResult> {
  const { slice, targetModel, characterLocks, characterBibles, styleLock, existingPrompt } = input;

  const userContent = buildUserContent(slice, targetModel, characterLocks, characterBibles, styleLock, existingPrompt);

  const result = await llmCall({
    role: "prompt-engineer",
    systemPrompt: getSystemPrompt(),
    userContent,
    responseSchema: PROMPT_ENGINEER_SCHEMA,
  });

  // Build negative prompt (C2 + C4)
  const negativePrompt = buildNegativePrompt(styleLock);

  if (!result.success || !result.parsed) {
    return {
      sliceId: slice.id,
      videoPrompt: existingPrompt ?? buildFallbackPrompt(slice, characterLocks, characterBibles),
      negativePrompt,
      promptLengthWords: (existingPrompt ?? "").split(/\s+/).length,
      modelOptimisations: ["fallback — prompt engineer unavailable"],
      characterLockInjected: false,
      latencyMs: result.latencyMs,
      costEstimate: result.costEstimate,
      success: false,
      error: result.error,
    };
  }

  const parsed = result.parsed;
  let videoPrompt = parsed.videoPrompt ?? existingPrompt ?? "";

  // C4: Post-process — strip any character names that leaked through
  if (characterBibles) {
    videoPrompt = stripCharacterNames(videoPrompt, characterBibles);
  }

  // C4: Enforce word cap
  videoPrompt = enforceWordCap(videoPrompt, MAX_PROMPT_WORDS);

  return {
    sliceId: slice.id,
    videoPrompt,
    negativePrompt,
    promptLengthWords: videoPrompt.split(/\s+/).length,
    modelOptimisations: parsed.modelOptimisations ?? [],
    characterLockInjected: parsed.characterLockInjected ?? false,
    ambientSoundHint: parsed.ambientSoundHint || undefined,
    latencyMs: result.latencyMs,
    costEstimate: result.costEstimate,
    success: true,
  };
}

/**
 * Run the Prompt Engineer for all slices in batch (P13 P1: parallel batches of 4).
 */
export async function runPromptEngineerBatch(
  inputs: PromptEngineerInput[],
  batchSize: number = 4
): Promise<{
  results: PromptEngineerResult[];
  totalCost: number;
  totalLatencyMs: number;
}> {
  console.log(`  [D2] Running Prompt Engineer on ${inputs.length} slices (batch size ${batchSize})...`);
  const results: PromptEngineerResult[] = [];
  let totalWallMs = 0;

  // P1: Process in parallel batches
  for (let i = 0; i < inputs.length; i += batchSize) {
    const batch = inputs.slice(i, i + batchSize);
    const batchStart = Date.now();
    const batchResults = await Promise.all(batch.map((input) => runPromptEngineer(input)));
    const batchMs = Date.now() - batchStart;
    totalWallMs += batchMs;

    for (const result of batchResults) {
      results.push(result);
      const icon = result.success ? "✓" : "⚠";
      console.log(
        `  [D2] Slice ${result.sliceId}: ${icon} ${result.promptLengthWords}w for ${batch.find(b => b.slice.id === result.sliceId)?.targetModel ?? "?"} ($${result.costEstimate.toFixed(4)}, ${result.latencyMs}ms)`
      );
    }
    console.log(`  [D2] Batch ${Math.floor(i / batchSize) + 1}: ${batch.length} slices in ${(batchMs / 1000).toFixed(1)}s`);
  }

  const totalCost = results.reduce((s, r) => s + r.costEstimate, 0);
  const totalLatencyMs = results.reduce((s, r) => s + r.latencyMs, 0);
  console.log(`  [D2] Prompt Engineer done: $${totalCost.toFixed(4)} total, ${(totalWallMs / 1000).toFixed(1)}s wall-clock (${(totalLatencyMs / 1000).toFixed(1)}s cumulative)`);

  return { results, totalCost, totalLatencyMs };
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function buildUserContent(
  slice: ProjectPlanSlice,
  targetModel: TargetModel,
  characterLocks: Record<string, string>,
  characterBibles?: Record<string, CharacterBible>,
  styleLock?: StyleLock,
  existingPrompt?: string
): string {
  let text = `Translate this scene plan into a ${targetModel}-optimised video prompt.

IMPORTANT: Do NOT use character names (e.g., "Mira", "Ren") in the output prompt.
Instead, use the DESCRIPTOR provided for each character. On first mention, use the full descriptor.
On subsequent mentions within the same prompt, use the pronoun ("she"/"he").

SLICE:
- ID: ${slice.id}
- Type: ${slice.type}
- Location: ${slice.location}
- Time of Day: ${slice.timeOfDay}
- Emotion: ${slice.emotion}
- Characters: ${slice.charactersPresent.join(", ") || "none"}
- Camera Hint: ${slice.cameraHint || "none"}`;

  if (slice.dialogueText) {
    text += `\n- Dialogue: "${slice.dialogueText}"`;
    text += `\n- Speaker: ${slice.speakingCharacter || "unknown"}`;
  }

  if (slice.previousSliceContinuity) {
    text += `\n- Previous Slice Context: ${slice.previousSliceContinuity}`;
  }

  // C4: Use descriptors from character bibles when available
  for (const char of slice.charactersPresent) {
    if (characterBibles?.[char]) {
      const bible = characterBibles[char];
      text += `\n\nCHARACTER DESCRIPTOR for ${char} (use this instead of the name "${char}"):`;
      text += `\nDescriptor: "${bible.descriptor}"`;
      text += `\nPronoun: ${bible.pronoun}`;
      text += `\nGender: ${bible.gender}`;
      text += `\nHair: ${bible.hair.color.replace(/_/g, " ")} ${bible.hair.style.replace(/_/g, " ")} with ${bible.hair.accents.replace(/_/g, " ")}`;
      text += `\nEyes: ${bible.eyes.color.replace(/_/g, " ")}${bible.eyes.glow ? " (glowing)" : ""}`;
      text += `\nProsthetic: ${bible.prosthetic.side} — ${bible.prosthetic.material.replace(/_/g, " ")} with ${bible.prosthetic.glow_color} ${bible.prosthetic.glow_pattern.replace(/_/g, " ")}`;
      text += `\nMUST NOT include: ${bible.must_not.join(", ")}`;
    } else if (characterLocks[char]) {
      text += `\n\nCHARACTER_LOCK for ${char}:\n${characterLocks[char]}`;
    }
  }

  // C2: Style lock
  if (styleLock) {
    text += `\n\nSTYLE LOCK:`;
    text += `\nPrimary style: ${styleLock.primary}`;
    text += `\nForbidden styles (NEVER use): ${styleLock.forbidden.join(", ")}`;
  }

  // C4: Negative prompt instruction
  text += `\n\nNEGATIVE PROMPT (do NOT include these elements): ${UI_NEGATIVE_PROMPT}`;

  if (existingPrompt) {
    text += `\n\nEXISTING PROMPT (use as base, optimise for ${targetModel}):\n${existingPrompt}`;
  }

  text += `\n\nTARGET MODEL: ${targetModel}`;
  text += `\nMAX PROMPT LENGTH: ${MAX_PROMPT_WORDS} words`;

  return text;
}

/**
 * C4: Post-process to strip any character names that leaked through the LLM.
 * First occurrence → full descriptor, subsequent → pronoun.
 */
function stripCharacterNames(
  prompt: string,
  bibles: Record<string, CharacterBible>
): string {
  let result = prompt;
  for (const [name, bible] of Object.entries(bibles)) {
    const nameRegex = new RegExp(`\\b${name}\\b`, "gi");
    let firstOccurrence = true;
    result = result.replace(nameRegex, () => {
      if (firstOccurrence) {
        firstOccurrence = false;
        return bible.descriptor;
      }
      return bible.pronoun;
    });
  }
  return result;
}

/**
 * C4: Enforce word cap by truncating at the last complete sentence.
 */
function enforceWordCap(prompt: string, maxWords: number): string {
  const words = prompt.split(/\s+/);
  if (words.length <= maxWords) return prompt;

  // Truncate and try to end at a sentence boundary
  const truncated = words.slice(0, maxWords).join(" ");
  const lastPeriod = truncated.lastIndexOf(".");
  if (lastPeriod > truncated.length * 0.6) {
    return truncated.slice(0, lastPeriod + 1);
  }
  return truncated + ".";
}

/**
 * C2+C4: Build negative prompt from style_lock forbidden list + UI negative prompt.
 */
function buildNegativePrompt(styleLock?: StyleLock): string {
  const parts = [UI_NEGATIVE_PROMPT];
  if (styleLock?.forbidden.length) {
    parts.push(styleLock.forbidden.join(", "));
  }
  return parts.join(", ");
}

function buildFallbackPrompt(
  slice: ProjectPlanSlice,
  characterLocks: Record<string, string>,
  characterBibles?: Record<string, CharacterBible>
): string {
  let prompt = `Anime style, 2D cel-shaded illustration, ${slice.type.replace(/_/g, " ")} shot. ${slice.location}, ${slice.timeOfDay}. ${slice.emotion} mood.`;

  for (const char of slice.charactersPresent) {
    if (characterBibles?.[char]) {
      prompt += ` ${characterBibles[char].descriptor}.`;
    } else if (characterLocks[char]) {
      prompt += ` ${characterLocks[char]}`;
    }
  }

  if (slice.cameraHint) {
    prompt += ` ${slice.cameraHint}.`;
  }

  return enforceWordCap(prompt, MAX_PROMPT_WORDS);
}
