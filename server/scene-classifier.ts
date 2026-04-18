/**
 * Scene Complexity Classifier — Smart Kling Model Router
 *
 * Analyzes each panel BEFORE calling Kling and routes it to the most
 * cost-effective model that meets the scene's requirements.
 *
 * Available Kling models:
 *   Tier 1: Kling V3 Omni  — $0.126/sec (native lip sync)
 *   Tier 2: Kling V2.6     — $0.077/sec (high quality, no lip sync)
 *   Tier 3: Kling V2.1     — $0.049/sec (medium quality, no lip sync)
 *   Tier 4: Kling V1.6     — $0.032/sec (simple, no lip sync)
 */

import { invokeLLM } from "./_core/llm";
import { getMotionLoraWeight, sceneQualifiesForMotionLora } from "./motion-lora-training";

/**
 * Derive motion LoRA fields from scene type.
 * Used by all classification return paths.
 */
function deriveMotionLoraFields(sceneType: string): { sceneType: string; motionLoraRequired: boolean; motionLoraWeight: number | null } {
  return {
    sceneType,
    motionLoraRequired: sceneQualifiesForMotionLora(sceneType),
    motionLoraWeight: getMotionLoraWeight(sceneType),
  };
}

// ─── Types ────────────────────────────────────────────────────────────────

export interface PanelScriptData {
  panelId: number;
  visualDescription: string;
  cameraAngle?: string;
  dialogue?: Array<{ character?: string; text: string; emotion?: string }> | string;
  mood?: string;
  sceneType?: string;       // 'transition', 'establishing', 'action', 'dialogue', etc.
  animationStyle?: string;  // 'sakuga', 'limited', 'cel_shaded', etc.
  characterCount?: number;
}

export interface SceneClassification {
  tier: 1 | 2 | 3 | 4;
  model: string;
  modelName: string;  // API model_name param
  reasoning: string;
  hasDialogue: boolean;
  faceVisible: boolean;
  lipSyncNeeded: boolean;
  lipSyncBeneficial: boolean;
  deterministic: boolean;  // true if no LLM call was needed
  classificationCostUsd: number;
  /** Scene type classification for motion LoRA routing */
  sceneType: string;
  /** Whether this scene type benefits from motion LoRA conditioning */
  motionLoraRequired: boolean;
  /** Recommended motion LoRA weight for this scene (null if not applicable) */
  motionLoraWeight: number | null;
}

// ─── Constants ────────────────────────────────────────────────────────────

export const MODEL_MAP: Record<number, { model: string; modelName: string; costPerSecStd: number; costPerSecPro: number }> = {
  1: { model: "v3-omni",  modelName: "kling-video-o1",  costPerSecStd: 0.063, costPerSecPro: 0.126 },
  2: { model: "v2-6",     modelName: "kling-v2-6",      costPerSecStd: 0.042, costPerSecPro: 0.084 },
  3: { model: "v2-1",     modelName: "kling-v2-1",      costPerSecStd: 0.028, costPerSecPro: 0.056 },
  4: { model: "v1-6",     modelName: "kling-v1-6",      costPerSecStd: 0.018, costPerSecPro: 0.035 },
};

const V3_OMNI_COST_PER_SEC_PRO = MODEL_MAP[1].costPerSecPro;

const CLOSE_UP_ANGLES = ["close-up", "close_up", "closeup", "extreme-close-up", "extreme_close_up", "extreme close-up", "extreme closeup", "ecu"];
const MEDIUM_ANGLES = ["medium", "medium-shot", "medium_shot", "mid-shot", "mid_shot", "waist-up", "bust"];
const WIDE_ANGLES = ["wide", "wide-shot", "wide_shot", "establishing", "birds-eye", "birds_eye", "bird's-eye", "aerial", "panoramic", "full-shot", "full_shot", "long-shot", "long_shot"];

// ─── Helpers ──────────────────────────────────────────────────────────────

function normalizeAngle(angle?: string): string {
  return (angle || "").toLowerCase().trim().replace(/[\s_]+/g, "-");
}

function hasDialogueContent(dialogue: PanelScriptData["dialogue"]): boolean {
  if (!dialogue) return false;
  if (typeof dialogue === "string") return dialogue.trim().length > 0;
  if (Array.isArray(dialogue)) return dialogue.length > 0 && dialogue.some(d => (d.text || "").trim().length > 0);
  return false;
}

function getDialogueText(dialogue: PanelScriptData["dialogue"]): string {
  if (!dialogue) return "";
  if (typeof dialogue === "string") return dialogue;
  if (Array.isArray(dialogue)) return dialogue.map(d => d.text || "").filter(Boolean).join(". ");
  return "";
}

function getCharacterCount(panel: PanelScriptData): number {
  if (panel.characterCount !== undefined) return panel.characterCount;
  if (Array.isArray(panel.dialogue)) {
    const uniqueChars = new Set(panel.dialogue.map(d => d.character).filter(Boolean));
    return Math.max(uniqueChars.size, 1);
  }
  return 1;
}

/**
 * Estimate face size as percentage of frame based on camera angle and character count.
 * Used for medium-shot edge cases.
 */
function estimateFaceSize(angle: string, characterCount: number): number {
  const norm = normalizeAngle(angle);
  if (CLOSE_UP_ANGLES.some(a => norm.includes(a))) {
    return characterCount === 1 ? 40 : 25;
  }
  if (MEDIUM_ANGLES.some(a => norm.includes(a))) {
    if (characterCount === 1) return 15;
    if (characterCount === 2) return 8;
    return 5;
  }
  if (WIDE_ANGLES.some(a => norm.includes(a))) {
    return 3;
  }
  // Default: assume medium framing
  return characterCount <= 2 ? 10 : 5;
}

// ─── Deterministic Rules ──────────────────────────────────────────────────

/**
 * Apply deterministic classification rules BEFORE calling the LLM.
 * Returns a classification if a rule matches, or null if LLM is needed.
 */
export function applyDeterministicRules(panel: PanelScriptData): SceneClassification | null {
  const angle = normalizeAngle(panel.cameraAngle);
  const hasDialogue = hasDialogueContent(panel.dialogue);
  const isSakuga = panel.animationStyle?.toLowerCase() === "sakuga" || panel.animationStyle?.toLowerCase() === "full_sakuga";

  // Rule 3: Transition panels → Tier 4 (V1.6)
  if (panel.sceneType?.toLowerCase() === "transition") {
    const tier = isSakuga ? 2 : 4;
    const m = MODEL_MAP[tier];
    return {
      tier: tier as 1 | 2 | 3 | 4,
      model: m.model,
      modelName: m.modelName,
      reasoning: `Deterministic Rule 3: transition panel → Tier ${tier}${isSakuga ? " (Sakuga override from Tier 4)" : ""}`,
      hasDialogue,
      faceVisible: false,
      lipSyncNeeded: false,
      lipSyncBeneficial: false,
      deterministic: true,
      classificationCostUsd: 0,
      ...deriveMotionLoraFields("transition"),
    };
  }

  // Rule 2: Extreme close-up with dialogue → Tier 1 (V3 Omni)
  if (hasDialogue && CLOSE_UP_ANGLES.some(a => angle.includes("extreme") && angle.includes(a.replace("extreme-", "")))) {
    return {
      tier: 1,
      model: MODEL_MAP[1].model,
      modelName: MODEL_MAP[1].modelName,
      reasoning: "Deterministic Rule 2: extreme close-up with dialogue → Tier 1 (V3 Omni, lip sync critical)",
      hasDialogue: true,
      faceVisible: true,
      lipSyncNeeded: true,
      lipSyncBeneficial: true,
      deterministic: true,
      classificationCostUsd: 0,
      ...deriveMotionLoraFields("dialogue-static"),
    };
  }

  // Rule 1: No dialogue + wide/birds-eye → Tier 3 (V2.1)
  if (!hasDialogue && WIDE_ANGLES.some(a => angle.includes(a))) {
    const tier = isSakuga ? 2 : 3;
    const m = MODEL_MAP[tier];
    return {
      tier: tier as 1 | 2 | 3 | 4,
      model: m.model,
      modelName: m.modelName,
      reasoning: `Deterministic Rule 1: no dialogue + wide/birds-eye → Tier ${tier}${isSakuga ? " (Sakuga override from Tier 3)" : ""}`,
      hasDialogue: false,
      faceVisible: false,
      lipSyncNeeded: false,
      lipSyncBeneficial: false,
      deterministic: true,
      classificationCostUsd: 0,
      ...deriveMotionLoraFields("establishing-environment"),
    };
  }

  // Rule 4: Sakuga style forces minimum Tier 2
  // (Applied as a post-processing override in classifyScene, not here — only if LLM returns Tier 3/4)

  return null; // No deterministic rule matched → needs LLM
}

// ─── LLM Classifier ──────────────────────────────────────────────────────

const CLASSIFIER_PROMPT = `Analyze this anime panel for video generation routing.
Panel data: {visual_description}
Camera: {camera_angle}
Dialogue: {dialogue}
Scene mood: {mood}
Character count: {character_count}

Classify into ONE of these tiers:

TIER 1 - LIP SYNC CRITICAL (use Kling V3 Omni):
Assign this tier ONLY when ALL of these are true:
  - A character is speaking (dialogue is not empty)
  - The character face is prominently visible (close-up or medium shot)
  - Camera angle is: close-up, extreme-close-up, or medium
  - The speaking character is FACING the camera (not turned away)
Examples: character delivering an emotional monologue in close-up, two characters talking face to face in medium shot.

TIER 2 - HIGH COMPLEXITY (use Kling V2.6):
Assign when ANY of these are true:
  - Dynamic action sequence (fighting, running, explosions)
  - Complex camera movement described (tracking, rotating, zooming)
  - Multiple characters with significant movement
  - Character speaking but face is NOT prominent (wide shot, over-shoulder, turned away, silhouette)
  - Detailed environment with moving elements (rain, fire, crowds)
Examples: fight scene, chase sequence, crowd scene, dialogue in a wide establishing shot.

TIER 3 - MEDIUM COMPLEXITY (use Kling V2.1):
Assign when:
  - Slow or minimal movement
  - No dialogue, or narrator voiceover only
  - Establishing shot or environmental pan
  - Character present but mostly still (standing, sitting, thinking)
Examples: skyline pan, character looking out a window (no speech), peaceful landscape.

TIER 4 - SIMPLE (use Kling V1.6):
Assign when:
  - Static or near-static scene (title card, text overlay, still image with subtle motion)
  - Transition shot (fade, brief environmental cut)
  - Very short clip needed (under 3 seconds)
Examples: episode title card, black screen with text, simple sky with moving clouds.

Return JSON: {"tier": 1-4, "reasoning": "brief explanation", "face_visible": true/false, "lip_sync_needed": true/false, "lip_sync_beneficial": true/false}`;

async function classifyWithLLM(panel: PanelScriptData): Promise<{
  tier: 1 | 2 | 3 | 4;
  reasoning: string;
  faceVisible: boolean;
  lipSyncNeeded: boolean;
  lipSyncBeneficial: boolean;
}> {
  const dialogueText = getDialogueText(panel.dialogue);
  const prompt = CLASSIFIER_PROMPT
    .replace("{visual_description}", panel.visualDescription || "no description")
    .replace("{camera_angle}", panel.cameraAngle || "unknown")
    .replace("{dialogue}", dialogueText || "none")
    .replace("{mood}", panel.mood || "unknown")
    .replace("{character_count}", String(getCharacterCount(panel)));

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are a video production routing classifier. Return ONLY valid JSON." },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "scene_classification",
          strict: true,
          schema: {
            type: "object",
            properties: {
              tier: { type: "integer", description: "Complexity tier 1-4" },
              reasoning: { type: "string", description: "Brief explanation" },
              face_visible: { type: "boolean", description: "Is a character face prominently visible" },
              lip_sync_needed: { type: "boolean", description: "Is lip sync critical for this scene" },
              lip_sync_beneficial: { type: "boolean", description: "Would lip sync improve this scene even if not critical" },
            },
            required: ["tier", "reasoning", "face_visible", "lip_sync_needed", "lip_sync_beneficial"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = response.choices?.[0]?.message?.content;
    if (!rawContent) throw new Error("Empty LLM response");
    const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);

    const parsed = JSON.parse(content);
    const tier = Math.max(1, Math.min(4, parsed.tier)) as 1 | 2 | 3 | 4;

    return {
      tier,
      reasoning: parsed.reasoning || "LLM classification",
      faceVisible: !!parsed.face_visible,
      lipSyncNeeded: !!parsed.lip_sync_needed,
      lipSyncBeneficial: !!parsed.lip_sync_beneficial,
    };
  } catch (err) {
    // Fallback: use face size heuristics
    console.error("[Classifier] LLM classification failed, using heuristic fallback:", err);
    const hasDialogue = hasDialogueContent(panel.dialogue);
    const faceSize = estimateFaceSize(panel.cameraAngle || "", getCharacterCount(panel));

    if (hasDialogue && faceSize > 10) {
      return { tier: 1, reasoning: "Heuristic fallback: dialogue + face > 10% of frame", faceVisible: true, lipSyncNeeded: true, lipSyncBeneficial: true, ...deriveMotionLoraFields("dialogue-gestured") };
    }
    if (hasDialogue && faceSize >= 5) {
      return { tier: 2, reasoning: "Heuristic fallback: dialogue + face 5-10% of frame", faceVisible: true, lipSyncNeeded: false, lipSyncBeneficial: true, ...deriveMotionLoraFields("dialogue-gestured") };
    }
    if (hasDialogue) {
      return { tier: 2, reasoning: "Heuristic fallback: dialogue present, face too small for lip sync", faceVisible: false, lipSyncNeeded: false, lipSyncBeneficial: false, ...deriveMotionLoraFields("dialogue-static") };
    }
    return { tier: 3, reasoning: "Heuristic fallback: no dialogue, medium complexity assumed", faceVisible: false, lipSyncNeeded: false, lipSyncBeneficial: false, ...deriveMotionLoraFields("establishing-environment") };
  }
}

// ─── Main Classifier ──────────────────────────────────────────────────────

/**
 * Classify a panel's scene complexity and determine the optimal Kling model.
 * Applies deterministic rules first (~40-50% of panels), falls back to LLM.
 */
export async function classifyScene(panel: PanelScriptData): Promise<SceneClassification> {
  // Step 1: Try deterministic rules (free, instant)
  const deterministic = applyDeterministicRules(panel);
  if (deterministic) {
    return deterministic;
  }

  // Step 2: LLM classification (~$0.005 per panel)
  const llmResult = await classifyWithLLM(panel);
  let tier = llmResult.tier;
  let reasoning = llmResult.reasoning;

  // Step 3: Apply Sakuga override (minimum Tier 2)
  const isSakuga = panel.animationStyle?.toLowerCase() === "sakuga" || panel.animationStyle?.toLowerCase() === "full_sakuga";
  if (isSakuga && tier > 2) {
    reasoning += ` (Sakuga override: bumped from Tier ${tier} to Tier 2)`;
    tier = 2;
  }

  // Step 4: Apply face-size heuristic for medium shots with dialogue
  const hasDialogue = hasDialogueContent(panel.dialogue);
  if (hasDialogue && tier === 2) {
    const faceSize = estimateFaceSize(panel.cameraAngle || "", getCharacterCount(panel));
    if (faceSize > 10) {
      // Face is prominent enough for lip sync
      tier = 1;
      reasoning += ` (face size ~${faceSize}% > 10% threshold → upgraded to Tier 1)`;
    }
  }

  const m = MODEL_MAP[tier];

  // Derive scene type from LLM result or panel data
  const derivedSceneType = panel.sceneType?.toLowerCase() || (hasDialogue ? "dialogue-gestured" : "establishing-environment");

  return {
    tier,
    model: m.model,
    modelName: m.modelName,
    reasoning: `LLM: ${reasoning}`,
    hasDialogue,
    faceVisible: llmResult.faceVisible,
    lipSyncNeeded: llmResult.lipSyncNeeded,
    lipSyncBeneficial: llmResult.lipSyncBeneficial,
    deterministic: false,
    classificationCostUsd: 0.005,
    ...deriveMotionLoraFields(derivedSceneType),
  };
}

/**
 * Classify multiple panels in batch.
 * Returns classifications in the same order as input panels.
 */
export async function classifyPanelsBatch(panels: PanelScriptData[]): Promise<SceneClassification[]> {
  const results: SceneClassification[] = [];
  for (const panel of panels) {
    results.push(await classifyScene(panel));
  }
  return results;
}

/**
 * Calculate cost for a clip at a given tier.
 * @param tier 1-4
 * @param durationSec clip duration in seconds
 * @param mode "std" or "pro"
 */
export function calculateCost(tier: number, durationSec: number = 5, mode: "std" | "pro" = "pro"): number {
  const m = MODEL_MAP[tier] || MODEL_MAP[2];
  const rate = mode === "pro" ? m.costPerSecPro : m.costPerSecStd;
  return rate * durationSec;
}

/**
 * Calculate what the cost would have been if all clips used V3 Omni.
 */
export function calculateV3OmniCost(durationSec: number = 5, mode: "std" | "pro" = "pro"): number {
  const rate = mode === "pro" ? V3_OMNI_COST_PER_SEC_PRO : MODEL_MAP[1].costPerSecStd;
  return rate * durationSec;
}
