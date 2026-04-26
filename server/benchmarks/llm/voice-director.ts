/**
 * D4: Voice Director — Per-line emotion routing for TTS
 *
 * Runs once per dialogue line, in parallel with D2 (Prompt Engineer).
 * Selects the optimal emotion tag and TTS parameter overrides for
 * ElevenLabs voice synthesis.
 *
 * Uses Gemini 2.5 Flash via the LLM orchestrator (I1).
 * Latency budget: ≤5 seconds per line.
 * Cost budget: ~$0.001 per line.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { llmCall } from "./orchestrator.js";
import type { ProjectPlanSlice } from "./director.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Types ───────────────────────────────────────────────────────────────

export type EmotionTag =
  | "neutral" | "determined" | "vulnerable" | "curious" | "fierce"
  | "gentle" | "anxious" | "playful" | "sorrowful" | "resolute"
  | "whisper" | "commanding" | "nostalgic" | "defiant" | "hopeful";

export interface TTSOverrides {
  stability: number;
  similarityBoost: number;
  style: number;
  speakingRate: number;
}

export interface VoiceDirectorResult {
  sliceId: number;
  character: string;
  dialogueLine: string;
  primaryEmotion: EmotionTag;
  secondaryEmotion: EmotionTag;
  emotionIntensity: number;
  ttsOverrides: TTSOverrides;
  directionNote: string;
  ssmlHints: string;
  latencyMs: number;
  costEstimate: number;
  success: boolean;
  error?: string;
}

export interface VoiceDirectorInput {
  slice: ProjectPlanSlice;
  character: string;
  dialogueLine: string;
}

// ─── System prompt ───────────────────────────────────────────────────────

let _systemPrompt: string | null = null;

function getSystemPrompt(): string {
  if (_systemPrompt) return _systemPrompt;
  try {
    _systemPrompt = fs.readFileSync(
      path.join(__dirname, "prompts", "voice-director-system.md"),
      "utf-8"
    );
  } catch {
    _systemPrompt = `You are the Voice Director for Awakli. Given a dialogue line, character, and scene context, select emotion tags and TTS overrides. Output JSON: { primaryEmotion, secondaryEmotion, emotionIntensity, ttsOverrides: { stability, similarityBoost, style, speakingRate }, directionNote, ssmlHints }.`;
  }
  return _systemPrompt;
}

// ─── Response schema ─────────────────────────────────────────────────────

const VOICE_DIRECTOR_SCHEMA = {
  name: "voice_director_output",
  strict: true,
  schema: {
    type: "object" as const,
    properties: {
      primaryEmotion: {
        type: "string",
        enum: [
          "neutral", "determined", "vulnerable", "curious", "fierce",
          "gentle", "anxious", "playful", "sorrowful", "resolute",
          "whisper", "commanding", "nostalgic", "defiant", "hopeful",
        ],
        description: "Primary emotion for the line delivery",
      },
      secondaryEmotion: {
        type: "string",
        enum: [
          "neutral", "determined", "vulnerable", "curious", "fierce",
          "gentle", "anxious", "playful", "sorrowful", "resolute",
          "whisper", "commanding", "nostalgic", "defiant", "hopeful",
        ],
        description: "Secondary emotion (subtle undertone)",
      },
      emotionIntensity: {
        type: "number",
        description: "Emotion intensity 0.0-1.0",
      },
      ttsOverrides: {
        type: "object",
        properties: {
          stability: { type: "number", description: "Voice stability 0.0-1.0" },
          similarityBoost: { type: "number", description: "Voice similarity boost 0.0-1.0" },
          style: { type: "number", description: "Style variation 0.0-1.0" },
          speakingRate: { type: "number", description: "Speaking rate 0.5-2.0" },
        },
        required: ["stability", "similarityBoost", "style", "speakingRate"],
        additionalProperties: false,
        description: "TTS parameter overrides",
      },
      directionNote: { type: "string", description: "Brief vocal delivery direction" },
      ssmlHints: { type: "string", description: "Optional SSML-style hints for pauses/emphasis" },
    },
    required: ["primaryEmotion", "secondaryEmotion", "emotionIntensity", "ttsOverrides", "directionNote", "ssmlHints"],
    additionalProperties: false,
  },
};

// ─── Default overrides per character ─────────────────────────────────────

const CHARACTER_DEFAULTS: Record<string, TTSOverrides> = {
  Mira: { stability: 0.45, similarityBoost: 0.78, style: 0.35, speakingRate: 1.0 },
  Ren: { stability: 0.50, similarityBoost: 0.75, style: 0.30, speakingRate: 1.0 },
};

// ─── Main function ───────────────────────────────────────────────────────

/**
 * Run the Voice Director for a single dialogue line.
 */
export async function runVoiceDirector(input: VoiceDirectorInput): Promise<VoiceDirectorResult> {
  const { slice, character, dialogueLine } = input;

  const userContent = `Direct the vocal performance for this dialogue line:

CHARACTER: ${character}
DIALOGUE: "${dialogueLine}"
SCENE CONTEXT:
- Location: ${slice.location}
- Time of Day: ${slice.timeOfDay}
- Scene Emotion: ${slice.emotion}
- Scene Type: ${slice.type}
- Camera: ${slice.cameraHint || "standard"}

Select the optimal emotion tags and TTS parameter overrides.`;

  const result = await llmCall({
    role: "voice-director",
    systemPrompt: getSystemPrompt(),
    userContent,
    responseSchema: VOICE_DIRECTOR_SCHEMA,
  });

  const defaults = CHARACTER_DEFAULTS[character] ?? CHARACTER_DEFAULTS.Mira;

  if (!result.success || !result.parsed) {
    // Fallback: use defaults with neutral emotion
    return {
      sliceId: slice.id,
      character,
      dialogueLine,
      primaryEmotion: "neutral",
      secondaryEmotion: "neutral",
      emotionIntensity: 0.5,
      ttsOverrides: defaults,
      directionNote: "Fallback — voice director unavailable",
      ssmlHints: "",
      latencyMs: result.latencyMs,
      costEstimate: result.costEstimate,
      success: false,
      error: result.error,
    };
  }

  const parsed = result.parsed;
  return {
    sliceId: slice.id,
    character,
    dialogueLine,
    primaryEmotion: parsed.primaryEmotion ?? "neutral",
    secondaryEmotion: parsed.secondaryEmotion ?? "neutral",
    emotionIntensity: parsed.emotionIntensity ?? 0.5,
    ttsOverrides: {
      stability: parsed.ttsOverrides?.stability ?? defaults.stability,
      similarityBoost: parsed.ttsOverrides?.similarityBoost ?? defaults.similarityBoost,
      style: parsed.ttsOverrides?.style ?? defaults.style,
      speakingRate: parsed.ttsOverrides?.speakingRate ?? defaults.speakingRate,
    },
    directionNote: parsed.directionNote ?? "",
    ssmlHints: parsed.ssmlHints ?? "",
    latencyMs: result.latencyMs,
    costEstimate: result.costEstimate,
    success: true,
  };
}

/**
 * Run the Voice Director for all dialogue lines in batch (P13 P1: parallel batches of 4).
 */
export async function runVoiceDirectorBatch(
  inputs: VoiceDirectorInput[],
  batchSize: number = 4
): Promise<{
  results: VoiceDirectorResult[];
  totalCost: number;
  totalLatencyMs: number;
}> {
  console.log(`  [D4] Running Voice Director on ${inputs.length} dialogue lines (batch size ${batchSize})...`);
  const results: VoiceDirectorResult[] = [];
  let totalWallMs = 0;

  // P1: Process in parallel batches
  for (let i = 0; i < inputs.length; i += batchSize) {
    const batch = inputs.slice(i, i + batchSize);
    const batchStart = Date.now();
    const batchResults = await Promise.all(batch.map((input) => runVoiceDirector(input)));
    const batchMs = Date.now() - batchStart;
    totalWallMs += batchMs;

    for (const result of batchResults) {
      results.push(result);
      const icon = result.success ? "✓" : "⚠";
      console.log(
        `  [D4] Slice ${result.sliceId} (${result.character}): ${icon} ${result.primaryEmotion}/${result.secondaryEmotion} @${result.emotionIntensity.toFixed(1)} ($${result.costEstimate.toFixed(4)}, ${result.latencyMs}ms) — ${result.directionNote.slice(0, 50)}`
      );
    }
    console.log(`  [D4] Batch ${Math.floor(i / batchSize) + 1}: ${batch.length} lines in ${(batchMs / 1000).toFixed(1)}s`);
  }

  const totalCost = results.reduce((s, r) => s + r.costEstimate, 0);
  const totalLatencyMs = results.reduce((s, r) => s + r.latencyMs, 0);
  console.log(`  [D4] Voice Director done: $${totalCost.toFixed(4)} total, ${(totalWallMs / 1000).toFixed(1)}s wall-clock (${(totalLatencyMs / 1000).toFixed(1)}s cumulative)`);

  return { results, totalCost, totalLatencyMs };
}
