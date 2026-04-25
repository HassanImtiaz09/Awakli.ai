/**
 * D1: Director LLM — Project-level scene planning and character coherence
 *
 * Runs ONCE per episode at project init. Reads the user's high-level prompt
 * and character bible, outputs a structured ProjectPlan JSON that downstream
 * LLMs (Prompt Engineer, Critic, Voice Director) consume.
 *
 * Uses Claude Sonnet via the LLM orchestrator (I1).
 * Latency budget: ≤30 seconds.
 * Cost budget: ~$0.50–$1.50 per episode.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { llmCall } from "./orchestrator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Types ───────────────────────────────────────────────────────────────

export interface ProjectPlanSlice {
  id: number;
  type: "silent_establishing" | "dialogue_closeup" | "silent_action" | "stylised_action";
  location: string;
  timeOfDay: string;
  emotion: string;
  charactersPresent: string[];
  dialogueText?: string;
  speakingCharacter?: string;
  previousSliceContinuity: string;
  nextSliceContinuity: string;
  cameraHint?: string;
}

export interface ProjectPlan {
  episodeTitle: string;
  setting: string;
  timeOfDayArc: string[];
  emotionalArc: string[];
  slices: ProjectPlanSlice[];
}

// ─── System prompt ───────────────────────────────────────────────────────

let _systemPrompt: string | null = null;

function getSystemPrompt(): string {
  if (_systemPrompt) return _systemPrompt;
  try {
    _systemPrompt = fs.readFileSync(
      path.join(__dirname, "prompts", "director-system.md"),
      "utf-8"
    );
  } catch {
    _systemPrompt = `You are the Director for Awakli. Given a user prompt and character bible, produce a ProjectPlan JSON with episodeTitle, setting, timeOfDayArc, emotionalArc, and slices array. Each slice has id, type, location, timeOfDay, emotion, charactersPresent, dialogueText, previousSliceContinuity, nextSliceContinuity.`;
  }
  return _systemPrompt;
}

// ─── Response schema ─────────────────────────────────────────────────────

const PROJECT_PLAN_SCHEMA = {
  name: "project_plan",
  strict: true,
  schema: {
    type: "object" as const,
    properties: {
      episodeTitle: { type: "string", description: "Episode title" },
      setting: { type: "string", description: "Primary location/world description" },
      timeOfDayArc: {
        type: "array",
        items: { type: "string" },
        description: "Progression of time of day across the episode",
      },
      emotionalArc: {
        type: "array",
        items: { type: "string" },
        description: "Progression of dominant emotions across the episode",
      },
      slices: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "number", description: "Slice ID (1-indexed)" },
            type: {
              type: "string",
              enum: ["silent_establishing", "dialogue_closeup", "silent_action", "stylised_action"],
              description: "Shot type",
            },
            location: { type: "string", description: "Specific location within the setting" },
            timeOfDay: { type: "string", description: "Time of day for this slice" },
            emotion: { type: "string", description: "Dominant emotion for this slice" },
            charactersPresent: {
              type: "array",
              items: { type: "string" },
              description: "Characters visible in this slice",
            },
            dialogueText: { type: "string", description: "Spoken line if dialogue_closeup, empty string otherwise" },
            speakingCharacter: { type: "string", description: "Who speaks if dialogue, empty string otherwise" },
            previousSliceContinuity: { type: "string", description: "What carries over from previous slice" },
            nextSliceContinuity: { type: "string", description: "What should carry into next slice" },
            cameraHint: { type: "string", description: "Suggested camera movement or framing" },
          },
          required: [
            "id", "type", "location", "timeOfDay", "emotion",
            "charactersPresent", "dialogueText", "speakingCharacter",
            "previousSliceContinuity", "nextSliceContinuity", "cameraHint",
          ],
          additionalProperties: false,
        },
        description: "Ordered list of episode slices",
      },
    },
    required: ["episodeTitle", "setting", "timeOfDayArc", "emotionalArc", "slices"],
    additionalProperties: false,
  },
};

// ─── Main function ───────────────────────────────────────────────────────

export interface DirectorInput {
  userPrompt: string;
  characterBible: string;
  targetDurationSec: number;
  sliceCount: number;
  sliceDurationSec: number;
}

/**
 * Run the Director LLM to produce a ProjectPlan.
 * Called once per episode at project init.
 */
export async function runDirector(input: DirectorInput): Promise<{
  plan: ProjectPlan | null;
  latencyMs: number;
  costEstimate: number;
  success: boolean;
  error?: string;
}> {
  console.log(`  [D1] Running Director LLM — episode planning...`);

  const userContent = `Create a ProjectPlan for this episode:

USER PROMPT:
${input.userPrompt}

CHARACTER BIBLE:
${input.characterBible}

CONSTRAINTS:
- Total duration: ${input.targetDurationSec} seconds
- Number of slices: ${input.sliceCount}
- Slice duration: ${input.sliceDurationSec} seconds each
- Shot distribution: ~5 silent_establishing, ~10 dialogue_closeup, ~2 silent_action, ~1 stylised_action
- Characters available: Mira (protagonist), Ren (deuteragonist)

Produce the ProjectPlan JSON.`;

  const result = await llmCall({
    role: "director",
    systemPrompt: getSystemPrompt(),
    userContent,
    responseSchema: PROJECT_PLAN_SCHEMA,
  });

  if (!result.success || !result.parsed) {
    console.warn(`  [D1] Director failed: ${result.error?.slice(0, 100) ?? "unknown"}`);
    return {
      plan: null,
      latencyMs: result.latencyMs,
      costEstimate: result.costEstimate,
      success: false,
      error: result.error,
    };
  }

  const plan = result.parsed as ProjectPlan;
  console.log(`  [D1] Director produced plan: "${plan.episodeTitle}" — ${plan.slices.length} slices`);
  console.log(`  [D1] Time arc: ${plan.timeOfDayArc.join(" → ")}`);
  console.log(`  [D1] Emotion arc: ${plan.emotionalArc.join(" → ")}`);
  console.log(`  [D1] Cost: $${result.costEstimate.toFixed(4)}, Latency: ${result.latencyMs}ms`);

  return {
    plan,
    latencyMs: result.latencyMs,
    costEstimate: result.costEstimate,
    success: true,
  };
}

/**
 * Build a flat fallback ProjectPlan from the existing fixture script
 * when the Director LLM is disabled or fails.
 */
export function buildFallbackPlan(
  slices: Array<{ sliceId: number; type: string; prompt: string; character?: string; dialogueText?: string }>
): ProjectPlan {
  return {
    episodeTitle: "Awakli Pilot",
    setting: "Neo-Kyoto, 2087",
    timeOfDayArc: ["sunset", "dusk", "night"],
    emotionalArc: ["calm", "curiosity", "tension", "determination"],
    slices: slices.map((s, i) => ({
      id: s.sliceId,
      type: s.type as ProjectPlanSlice["type"],
      location: "Neo-Kyoto",
      timeOfDay: i < 6 ? "sunset" : i < 12 ? "dusk" : "night",
      emotion: "neutral",
      charactersPresent: s.character ? [s.character] : [],
      dialogueText: s.dialogueText ?? "",
      speakingCharacter: s.character ?? "",
      previousSliceContinuity: i > 0 ? `Continues from slice ${s.sliceId - 1}` : "Episode opening",
      nextSliceContinuity: i < slices.length - 1 ? `Leads into slice ${s.sliceId + 1}` : "Episode ending",
      cameraHint: "",
    })),
  };
}
