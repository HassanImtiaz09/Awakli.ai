/**
 * D2: Visual Prompt Engineer — Per-slice model-specific prompt translation
 *
 * Takes the Director's scene plan for a single slice and translates it
 * into a model-optimised video generation prompt. Includes per-model
 * few-shot blocks (Wan 2.7, Veo 3.1 Lite, Vidu Q3) and always injects
 * the CHARACTER_LOCK text.
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Types ───────────────────────────────────────────────────────────────

export type TargetModel = "wan27" | "veo31lite" | "viduq3";

export interface PromptEngineerInput {
  slice: ProjectPlanSlice;
  targetModel: TargetModel;
  characterLocks: Record<string, string>;
  existingPrompt?: string;  // If available from fixture, use as base
}

export interface PromptEngineerResult {
  sliceId: number;
  videoPrompt: string;
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
    _systemPrompt = `You are the Visual Prompt Engineer for Awakli. Translate scene plans into model-optimised video prompts. Always inject CHARACTER_LOCK text. Output JSON: { videoPrompt, promptLengthWords, modelOptimisations[], characterLockInjected, ambientSoundHint }.`;
  }
  return _systemPrompt;
}

// ─── Response schema ─────────────────────────────────────────────────────

const PROMPT_ENGINEER_SCHEMA = {
  name: "prompt_engineer_output",
  strict: true,
  schema: {
    type: "object" as const,
    properties: {
      videoPrompt: { type: "string", description: "The optimised video generation prompt" },
      promptLengthWords: { type: "number", description: "Word count of the prompt" },
      modelOptimisations: {
        type: "array",
        items: { type: "string" },
        description: "List of model-specific optimisations applied",
      },
      characterLockInjected: { type: "boolean", description: "Whether CHARACTER_LOCK was injected" },
      ambientSoundHint: { type: "string", description: "Ambient sound description for veo31lite, empty string otherwise" },
    },
    required: ["videoPrompt", "promptLengthWords", "modelOptimisations", "characterLockInjected", "ambientSoundHint"],
    additionalProperties: false,
  },
};

// ─── Main function ───────────────────────────────────────────────────────

/**
 * Run the Visual Prompt Engineer for a single slice.
 * Translates the Director's plan into a model-specific video prompt.
 */
export async function runPromptEngineer(input: PromptEngineerInput): Promise<PromptEngineerResult> {
  const { slice, targetModel, characterLocks, existingPrompt } = input;

  const userContent = buildUserContent(slice, targetModel, characterLocks, existingPrompt);

  const result = await llmCall({
    role: "prompt-engineer",
    systemPrompt: getSystemPrompt(),
    userContent,
    responseSchema: PROMPT_ENGINEER_SCHEMA,
  });

  if (!result.success || !result.parsed) {
    // Fallback: return existing prompt or a basic one
    return {
      sliceId: slice.id,
      videoPrompt: existingPrompt ?? buildFallbackPrompt(slice, characterLocks),
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
  return {
    sliceId: slice.id,
    videoPrompt: parsed.videoPrompt ?? existingPrompt ?? "",
    promptLengthWords: parsed.promptLengthWords ?? 0,
    modelOptimisations: parsed.modelOptimisations ?? [],
    characterLockInjected: parsed.characterLockInjected ?? false,
    ambientSoundHint: parsed.ambientSoundHint || undefined,
    latencyMs: result.latencyMs,
    costEstimate: result.costEstimate,
    success: true,
  };
}

/**
 * Run the Prompt Engineer for all slices in batch.
 */
export async function runPromptEngineerBatch(
  inputs: PromptEngineerInput[]
): Promise<{
  results: PromptEngineerResult[];
  totalCost: number;
  totalLatencyMs: number;
}> {
  console.log(`  [D2] Running Prompt Engineer on ${inputs.length} slices...`);
  const results: PromptEngineerResult[] = [];

  for (const input of inputs) {
    const result = await runPromptEngineer(input);
    results.push(result);
    const icon = result.success ? "✓" : "⚠";
    console.log(
      `  [D2] Slice ${result.sliceId}: ${icon} ${result.promptLengthWords}w for ${input.targetModel} ($${result.costEstimate.toFixed(4)}, ${result.latencyMs}ms)${result.modelOptimisations.length > 0 ? ` — ${result.modelOptimisations[0]}` : ""}`
    );
  }

  const totalCost = results.reduce((s, r) => s + r.costEstimate, 0);
  const totalLatencyMs = results.reduce((s, r) => s + r.latencyMs, 0);
  console.log(`  [D2] Prompt Engineer batch done: $${totalCost.toFixed(4)} total, ${(totalLatencyMs / 1000).toFixed(1)}s`);

  return { results, totalCost, totalLatencyMs };
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function buildUserContent(
  slice: ProjectPlanSlice,
  targetModel: TargetModel,
  characterLocks: Record<string, string>,
  existingPrompt?: string
): string {
  let text = `Translate this scene plan into a ${targetModel}-optimised video prompt:

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

  // Add character locks
  for (const char of slice.charactersPresent) {
    if (characterLocks[char]) {
      text += `\n\nCHARACTER_LOCK for ${char}:\n${characterLocks[char]}`;
    }
  }

  if (existingPrompt) {
    text += `\n\nEXISTING PROMPT (use as base, optimise for ${targetModel}):\n${existingPrompt}`;
  }

  text += `\n\nTARGET MODEL: ${targetModel}`;

  return text;
}

function buildFallbackPrompt(
  slice: ProjectPlanSlice,
  characterLocks: Record<string, string>
): string {
  let prompt = `Anime style, ${slice.type.replace(/_/g, " ")} shot. ${slice.location}, ${slice.timeOfDay}. ${slice.emotion} mood.`;

  for (const char of slice.charactersPresent) {
    if (characterLocks[char]) {
      prompt += ` ${characterLocks[char]}`;
    }
  }

  if (slice.cameraHint) {
    prompt += ` ${slice.cameraHint}.`;
  }

  return prompt;
}
