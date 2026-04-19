/**
 * P26 Stage 3: Shot Planner
 *
 * Computes character placements with height-ratio enforcement,
 * ground-plane anchoring, depth layering, and regional prompting
 * for multi-character panels.
 *
 * @see Awakli_Prompt26 §6
 */

import type {
  CharacterEntry,
  CharacterPlacement,
  CharacterRegistry,
  RegionalPrompt,
  ShotPlan,
} from "./types";
import { buildAppearanceString } from "./extraction";

// ─── Camera Angle Configurations ────────────────────────────────────────

interface CameraConfig {
  /** Whether full body is visible */
  fullBody: boolean;
  /** Vertical crop factor (1.0 = full body, 0.5 = waist up, 0.3 = shoulders up) */
  verticalCrop: number;
  /** Whether height ratio enforcement applies */
  enforceHeightRatio: boolean;
}

const CAMERA_CONFIGS: Record<string, CameraConfig> = {
  "wide": { fullBody: true, verticalCrop: 1.0, enforceHeightRatio: true },
  "medium": { fullBody: false, verticalCrop: 0.6, enforceHeightRatio: true },
  "close-up": { fullBody: false, verticalCrop: 0.3, enforceHeightRatio: false },
  "extreme-close-up": { fullBody: false, verticalCrop: 0.15, enforceHeightRatio: false },
  "birds-eye": { fullBody: true, verticalCrop: 1.0, enforceHeightRatio: false },
};

// ─── Shot Planning ──────────────────────────────────────────────────────

/**
 * Plan a single panel shot with character placements.
 */
export function planShot(
  panelId: number,
  sceneNumber: number,
  panelNumber: number,
  cameraAngle: string,
  characterNames: string[],
  registry: CharacterRegistry,
): ShotPlan {
  const camera = CAMERA_CONFIGS[cameraAngle] || CAMERA_CONFIGS["medium"];

  // Find characters in the registry
  const characters = characterNames
    .map((name) =>
      registry.characters.find(
        (c) => c.name.toLowerCase() === name.toLowerCase(),
      ),
    )
    .filter((c): c is CharacterEntry => c !== undefined);

  if (characters.length === 0) {
    return {
      panelId,
      sceneNumber,
      panelNumber,
      cameraAngle,
      characterPlacements: [],
    };
  }

  // Compute placements
  const placements = computePlacements(characters, registry, camera);

  // Build regional prompts for multi-character panels
  const regionalPrompts =
    characters.length > 1
      ? buildRegionalPrompts(characters, placements, registry.artStyle)
      : undefined;

  return {
    panelId,
    sceneNumber,
    panelNumber,
    cameraAngle,
    characterPlacements: placements,
    regionalPrompts,
    controlNet: {
      strength: camera.enforceHeightRatio ? 0.7 : 0.5,
    },
  };
}

// ─── Character Placement Computation ────────────────────────────────────

/**
 * Compute character placements with height-ratio enforcement.
 * All feet share the same Y coordinate (ground plane).
 * Scale factor = characterHeight / tallestHeight.
 */
function computePlacements(
  characters: CharacterEntry[],
  registry: CharacterRegistry,
  camera: CameraConfig,
): CharacterPlacement[] {
  const tallest = registry.tallestHeightCm;
  const count = characters.length;

  return characters.map((char, index) => {
    // Height ratio: scaleFactor = heightCm / tallestHeightCm
    const scaleFactor = camera.enforceHeightRatio
      ? char.attributes.heightCm / tallest
      : 1.0;

    // Horizontal distribution: evenly space characters
    const x = count === 1
      ? 0.5
      : 0.15 + (index / (count - 1)) * 0.7;

    // Ground plane: all feet at same Y (bottom of frame)
    const y = 0.0;

    // Depth layer: protagonist in front, others behind
    const depthLayer = char.role === "protagonist" ? 0 : index + 1;

    // Pose based on camera angle and character role
    const pose = inferPose(char, camera);

    return {
      characterId: char.characterId,
      scaleFactor,
      x,
      y,
      depthLayer,
      pose,
    };
  });
}

// ─── Pose Inference ─────────────────────────────────────────────────────

function inferPose(char: CharacterEntry, camera: CameraConfig): string {
  if (!camera.fullBody) {
    return char.role === "protagonist"
      ? "facing camera, confident expression"
      : "three-quarter view, neutral expression";
  }

  switch (char.role) {
    case "protagonist":
      return "standing confidently, slight forward lean, dynamic pose";
    case "antagonist":
      return "standing tall, arms crossed or menacing posture";
    case "supporting":
      return "relaxed standing pose, slightly turned";
    default:
      return "standing naturally";
  }
}

// ─── Regional Prompting ─────────────────────────────────────────────────

/**
 * Build regional prompts for multi-character panels.
 * Each character gets a bounding box and character-specific prompt.
 */
function buildRegionalPrompts(
  characters: CharacterEntry[],
  placements: CharacterPlacement[],
  artStyle: string,
): RegionalPrompt[] {
  const count = characters.length;

  return characters.map((char, index) => {
    const placement = placements[index];
    const appearance = buildAppearanceString(char);

    // Compute bounding box based on placement
    const boxWidth = Math.min(0.4, 0.8 / count);
    const boxHeight = placement.scaleFactor * 0.8;

    return {
      characterId: char.characterId,
      bbox: {
        x: Math.max(0, placement.x - boxWidth / 2),
        y: Math.max(0, 1.0 - boxHeight),
        width: boxWidth,
        height: boxHeight,
      },
      prompt: `${char.name}, ${appearance}, ${placement.pose}`,
    };
  });
}

// ─── Consistency-Enhanced Prompt Builder ─────────────────────────────────

/**
 * Build a panel generation prompt with full character bible integration.
 * This replaces the simpler buildConsistentPanelPrompt from routers-create.ts.
 */
export function buildCharacterBiblePrompt(
  panel: {
    visualDescription?: string;
    visual_description?: string;
    cameraAngle?: string;
    dialogue?: Array<{ character: string; text: string; emotion: string }>;
  },
  registry: CharacterRegistry,
  shotPlan?: ShotPlan,
): {
  prompt: string;
  referenceUrl?: string;
  seed?: number;
  regionalPrompts?: RegionalPrompt[];
} {
  const stylePrefix = registry.artStyle === "default"
    ? "manga style"
    : `${registry.artStyle} manga style`;

  const visualDesc = panel.visualDescription || panel.visual_description || "";

  // Find characters in this panel
  const panelCharNames = new Set<string>();
  if (panel.dialogue) {
    for (const d of panel.dialogue) {
      if (d.character && d.character !== "Narrator" && d.character !== "SFX") {
        panelCharNames.add(d.character);
      }
    }
  }

  // Also detect character names in visual description
  for (const char of registry.characters) {
    if (visualDesc.toLowerCase().includes(char.name.toLowerCase())) {
      panelCharNames.add(char.name);
    }
  }

  const panelCharacters = Array.from(panelCharNames)
    .map((name) =>
      registry.characters.find(
        (c) => c.name.toLowerCase() === name.toLowerCase(),
      ),
    )
    .filter((c): c is CharacterEntry => c !== undefined);

  // Build character appearance tags with structured attributes
  const charDescriptions: string[] = [];
  for (const char of panelCharacters) {
    const appearance = buildAppearanceString(char);
    charDescriptions.push(`[${char.name}: ${appearance}]`);
  }

  // If no specific characters found, use protagonist
  if (charDescriptions.length === 0 && registry.characters.length > 0) {
    const protagonist =
      registry.characters.find((c) => c.role === "protagonist") ||
      registry.characters[0];
    const appearance = buildAppearanceString(protagonist);
    charDescriptions.push(`[${protagonist.name}: ${appearance}]`);
  }

  const characterSection =
    charDescriptions.length > 0
      ? `\nCharacter details: ${charDescriptions.join(" ")}\n`
      : "";

  // Height ratio hints for multi-character panels
  let heightHint = "";
  if (panelCharacters.length > 1 && shotPlan?.characterPlacements) {
    const ratios = shotPlan.characterPlacements
      .map((p) => {
        const char = registry.characters.find(
          (c) => c.characterId === p.characterId,
        );
        return char ? `${char.name} (${Math.round(p.scaleFactor * 100)}% height)` : "";
      })
      .filter(Boolean);
    if (ratios.length > 0) {
      heightHint = `, height proportions: ${ratios.join(", ")}`;
    }
  }

  const prompt =
    `${stylePrefix}, ${visualDesc}${characterSection}${heightHint}, ` +
    `high quality manga panel, detailed linework, dramatic composition, ` +
    `consistent character design, same character appearance throughout`;

  // Get reference URL from protagonist's identity
  const protagonist =
    panelCharacters.find((c) => c.role === "protagonist") ||
    panelCharacters[0] ||
    registry.characters.find((c) => c.role === "protagonist");

  const referenceUrl = protagonist?.identity?.ipAdapterRefUrl ||
    protagonist?.identity?.referenceSheetUrl;

  const seed = protagonist?.identity?.referenceSheetSeed;

  return {
    prompt,
    referenceUrl,
    seed,
    regionalPrompts: shotPlan?.regionalPrompts,
  };
}

// ─── Plan All Shots for an Episode ──────────────────────────────────────

export function planAllShots(
  panels: Array<{
    id: number;
    sceneNumber: number;
    panelNumber: number;
    cameraAngle: string;
    dialogue?: Array<{ character: string }>;
    visualDescription?: string;
  }>,
  registry: CharacterRegistry,
): ShotPlan[] {
  return panels.map((panel) => {
    // Extract character names from dialogue and visual description
    const charNames = new Set<string>();
    if (panel.dialogue) {
      for (const d of panel.dialogue) {
        if (d.character && d.character !== "Narrator" && d.character !== "SFX") {
          charNames.add(d.character);
        }
      }
    }
    // Also check visual description for character names
    if (panel.visualDescription) {
      for (const char of registry.characters) {
        if (panel.visualDescription.toLowerCase().includes(char.name.toLowerCase())) {
          charNames.add(char.name);
        }
      }
    }

    return planShot(
      panel.id,
      panel.sceneNumber,
      panel.panelNumber,
      panel.cameraAngle,
      Array.from(charNames),
      registry,
    );
  });
}

// Export for testing
export {
  computePlacements,
  inferPose,
  buildRegionalPrompts,
  CAMERA_CONFIGS,
};
