/**
 * Prompt 20 — Scene-Type Classifier (V1 Rule-Based)
 *
 * Classifies scenes into 6 types using priority-ordered deterministic rules.
 * No ML — designed for ≥80% accuracy on typical manga-to-anime episodes.
 */

import type { SceneType } from "../../drizzle/schema";

// ─── Scene Metadata ─────────────────────────────────────────────────────

export type MotionIntensity = "none" | "low" | "medium" | "high";

export interface SceneMetadata {
  panelCount: number;
  hasDialogue: boolean;
  dialogueLineCount: number;
  characterCount: number;
  motionIntensity: MotionIntensity;
  isExterior: boolean;
  hasActionLines: boolean;
  isCloseUp: boolean;
  panelSizePct: number;          // 0-100, how much of the page this panel occupies
  previousSceneType?: SceneType;
  narrativeTag?: string;         // 'flashback', 'timeskip', 'training_montage', etc.
}

// ─── Classification Result ──────────────────────────────────────────────

export interface SceneTypeClassification {
  sceneType: SceneType;
  confidence: number;            // 0.0 – 1.0
  pipelineTemplate: string;      // e.g. 'dialogue_inpaint'
  matchedRule: string;           // human-readable rule name for debugging
  metadata: SceneMetadata;       // input features preserved for audit
}

// ─── Pipeline Template Mapping ──────────────────────────────────────────

export const SCENE_TYPE_TO_TEMPLATE: Record<SceneType, string> = {
  dialogue:     "dialogue_inpaint",
  action:       "action_premium",
  establishing: "establishing_ken_burns",
  transition:   "transition_rule_based",
  reaction:     "reaction_cached",
  montage:      "montage_image_seq",
};

// ─── V1 Rule-Based Classifier ───────────────────────────────────────────

/**
 * Priority-ordered classification rules.
 * First matching rule wins. Returns SceneType + confidence + matched rule name.
 */
export function classifySceneType(meta: SceneMetadata): SceneTypeClassification {
  // Rule 1: Transition — scene boundary with no panels
  if (meta.previousSceneType !== undefined && meta.panelCount === 0) {
    return makeResult("transition", 0.95, "transition_no_panels", meta);
  }

  // Rule 2: Establishing — no characters, exterior, no action
  if (meta.characterCount === 0 && meta.isExterior && !meta.hasActionLines) {
    return makeResult("establishing", 0.92, "establishing_exterior_no_chars", meta);
  }

  // Rule 3: Action — high motion or action lines
  if (meta.motionIntensity === "high" || meta.hasActionLines) {
    // Boost confidence if both conditions are true
    const conf = (meta.motionIntensity === "high" && meta.hasActionLines) ? 0.95 : 0.85;
    return makeResult("action", conf, "action_high_motion_or_lines", meta);
  }

  // Rule 4: Montage — narrative tag indicates flashback/timeskip/training
  const montageNarrativeTags = ["flashback", "timeskip", "training_montage", "montage", "recap"];
  if (meta.narrativeTag && montageNarrativeTags.includes(meta.narrativeTag.toLowerCase())) {
    return makeResult("montage", 0.88, "montage_narrative_tag", meta);
  }

  // Rule 5: Reaction — close-up, single character, minimal dialogue
  if (meta.isCloseUp && meta.characterCount === 1 && meta.dialogueLineCount <= 1) {
    return makeResult("reaction", 0.82, "reaction_closeup_single_char", meta);
  }

  // Rule 6: Dialogue — has dialogue with 2+ lines
  if (meta.hasDialogue && meta.dialogueLineCount >= 2) {
    return makeResult("dialogue", 0.90, "dialogue_multi_line", meta);
  }

  // Rule 7: Dialogue fallback — any dialogue present
  if (meta.hasDialogue) {
    return makeResult("dialogue", 0.75, "dialogue_fallback", meta);
  }

  // Rule 8: Establishing — final fallback for ambiguous scenes
  return makeResult("establishing", 0.60, "establishing_fallback", meta);
}

function makeResult(
  sceneType: SceneType,
  confidence: number,
  matchedRule: string,
  metadata: SceneMetadata,
): SceneTypeClassification {
  return {
    sceneType,
    confidence,
    pipelineTemplate: SCENE_TYPE_TO_TEMPLATE[sceneType],
    matchedRule,
    metadata,
  };
}

// ─── Metadata Extraction ────────────────────────────────────────────────

export interface PanelData {
  id: number;
  sceneNumber: number;
  panelNumber: number;
  visualDescription: string | null;
  cameraAngle: string | null;
  dialogue: unknown;  // [{character, text, emotion}] or null
  sfx: string | null;
  transition: string | null;
}

export interface SceneData {
  id: number;
  sceneNumber: number;
  location: string | null;
  timeOfDay: string | null;
  mood: string | null;
}

/**
 * Extract SceneMetadata from raw panel and scene data.
 * Designed to work with the panels and scenes tables.
 */
export function extractSceneMetadata(
  panels: PanelData[],
  scene: SceneData,
  previousSceneType?: SceneType,
): SceneMetadata {
  const panelCount = panels.length;

  // Parse dialogue from panels
  let totalDialogueLines = 0;
  const characterNames = new Set<string>();
  let hasDialogue = false;

  for (const panel of panels) {
    if (panel.dialogue && Array.isArray(panel.dialogue)) {
      for (const line of panel.dialogue as Array<{ character?: string; text?: string }>) {
        if (line.text && line.text.trim().length > 0) {
          totalDialogueLines++;
          hasDialogue = true;
          if (line.character) characterNames.add(line.character);
        }
      }
    }
  }

  // Detect motion intensity from visual descriptions
  const motionIntensity = detectMotionIntensity(panels);

  // Detect exterior from scene location
  const isExterior = detectIsExterior(scene);

  // Detect action lines from visual descriptions
  const hasActionLines = detectActionLines(panels);

  // Detect close-up from camera angles
  const isCloseUp = panels.some(
    p => p.cameraAngle === "close-up" || p.cameraAngle === "extreme-close-up"
  );

  // Panel size percentage (rough estimate based on panel count in scene)
  const panelSizePct = panelCount > 0 ? Math.round(100 / panelCount) : 0;

  // Detect narrative tag from visual descriptions and scene mood
  const narrativeTag = detectNarrativeTag(panels, scene);

  return {
    panelCount,
    hasDialogue,
    dialogueLineCount: totalDialogueLines,
    characterCount: characterNames.size,
    motionIntensity,
    isExterior,
    hasActionLines,
    isCloseUp,
    panelSizePct,
    previousSceneType,
    narrativeTag: narrativeTag ?? undefined,
  };
}

// ─── Helper Detectors ───────────────────────────────────────────────────

const HIGH_MOTION_KEYWORDS = [
  "running", "fighting", "explosion", "charging", "jumping", "flying",
  "attacking", "dodging", "smashing", "crashing", "chasing", "punching",
  "kicking", "slashing", "battle", "combat", "clash", "impact",
];

const MEDIUM_MOTION_KEYWORDS = [
  "walking", "moving", "turning", "reaching", "grabbing", "throwing",
  "swinging", "spinning", "falling", "landing",
];

const ACTION_LINE_KEYWORDS = [
  "speed lines", "action lines", "motion blur", "impact lines",
  "whoosh", "zoom lines", "blur", "streaks",
];

const EXTERIOR_KEYWORDS = [
  "outside", "exterior", "street", "sky", "forest", "mountain", "ocean",
  "park", "garden", "city", "rooftop", "bridge", "field", "beach",
  "village", "town", "landscape", "horizon", "sunset", "sunrise",
];

const INTERIOR_KEYWORDS = [
  "inside", "interior", "room", "office", "house", "apartment",
  "classroom", "hallway", "kitchen", "bedroom", "bathroom",
];

const MONTAGE_KEYWORDS = [
  "flashback", "timeskip", "time skip", "training montage", "montage",
  "recap", "memory", "memories", "years later", "earlier",
];

function detectMotionIntensity(panels: PanelData[]): MotionIntensity {
  let highCount = 0;
  let medCount = 0;

  for (const panel of panels) {
    const desc = (panel.visualDescription || "").toLowerCase();
    const sfx = (panel.sfx || "").toLowerCase();
    const combined = desc + " " + sfx;

    if (HIGH_MOTION_KEYWORDS.some(kw => combined.includes(kw))) highCount++;
    else if (MEDIUM_MOTION_KEYWORDS.some(kw => combined.includes(kw))) medCount++;
  }

  if (highCount >= 2 || (highCount >= 1 && panels.length <= 2)) return "high";
  if (highCount >= 1 || medCount >= 2) return "medium";
  if (medCount >= 1) return "low";
  return "none";
}

function detectIsExterior(scene: SceneData): boolean {
  const location = (scene.location || "").toLowerCase();
  const mood = (scene.mood || "").toLowerCase();
  const combined = location + " " + mood;

  const hasExterior = EXTERIOR_KEYWORDS.some(kw => combined.includes(kw));
  const hasInterior = INTERIOR_KEYWORDS.some(kw => combined.includes(kw));

  if (hasExterior && !hasInterior) return true;
  if (hasInterior) return false;
  return false;  // Default to interior if ambiguous
}

function detectActionLines(panels: PanelData[]): boolean {
  for (const panel of panels) {
    const desc = (panel.visualDescription || "").toLowerCase();
    const sfx = (panel.sfx || "").toLowerCase();
    const combined = desc + " " + sfx;

    if (ACTION_LINE_KEYWORDS.some(kw => combined.includes(kw))) return true;
  }
  return false;
}

function detectNarrativeTag(panels: PanelData[], scene: SceneData): string | null {
  const allText: string[] = [];
  for (const panel of panels) {
    if (panel.visualDescription) allText.push(panel.visualDescription.toLowerCase());
  }
  if (scene.mood) allText.push(scene.mood.toLowerCase());
  if (scene.location) allText.push(scene.location.toLowerCase());

  const combined = allText.join(" ");

  for (const kw of MONTAGE_KEYWORDS) {
    if (combined.includes(kw)) {
      // Normalize to standard tags
      if (kw === "flashback" || kw === "memory" || kw === "memories") return "flashback";
      if (kw === "timeskip" || kw === "time skip" || kw === "years later" || kw === "earlier") return "timeskip";
      if (kw === "training montage") return "training_montage";
      if (kw === "montage") return "montage";
      if (kw === "recap") return "recap";
    }
  }
  return null;
}

// ─── Batch Classification ───────────────────────────────────────────────

export interface SceneWithPanels {
  scene: SceneData;
  panels: PanelData[];
}

/**
 * Classify all scenes in an episode.
 * Passes previous scene type to each subsequent classification for transition detection.
 */
export function classifyEpisodeScenes(
  scenesWithPanels: SceneWithPanels[],
): SceneTypeClassification[] {
  const results: SceneTypeClassification[] = [];
  let previousSceneType: SceneType | undefined;

  for (const { scene, panels } of scenesWithPanels) {
    const metadata = extractSceneMetadata(panels, scene, previousSceneType);
    const classification = classifySceneType(metadata);
    results.push(classification);
    previousSceneType = classification.sceneType;
  }

  return results;
}

// ─── Exports ────────────────────────────────────────────────────────────

export {
  HIGH_MOTION_KEYWORDS,
  MEDIUM_MOTION_KEYWORDS,
  ACTION_LINE_KEYWORDS,
  EXTERIOR_KEYWORDS,
  INTERIOR_KEYWORDS,
  MONTAGE_KEYWORDS,
};
