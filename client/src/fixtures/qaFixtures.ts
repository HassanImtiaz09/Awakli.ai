/**
 * Q1-100: Deterministic QA fixture data for Script and Panels stages.
 *
 * Usage: append ?qa=script or ?qa=panels to the URL.
 * These fixtures bypass credit checks and tRPC calls, mounting
 * components with static data for visual QA verification.
 */

// ─── Script fixtures ────────────────────────────────────────────────────

export interface QAScene {
  id: number;
  episodeId: number;
  sceneNumber: number;
  title: string;
  setting: string;
  visualDescription: string;
  dialogue: string;
  panelCount: number;
  approved: boolean;
  characters: QACharacter[];
}

export interface QACharacter {
  id: number;
  name: string;
  role: string;
  description: string;
  appearances: number;
}

export const QA_CHARACTERS: QACharacter[] = [
  {
    id: 1001,
    name: "Kaito",
    role: "protagonist",
    description: "A 17-year-old boy with spiky dark hair and a scar across his left cheek. Wears a tattered school uniform with a mysterious glowing pendant.",
    appearances: 4,
  },
  {
    id: 1002,
    name: "Yuki",
    role: "deuteragonist",
    description: "A calm, silver-haired girl with piercing blue eyes. Always carries a katana wrapped in white cloth. Speaks softly but commands authority.",
    appearances: 3,
  },
  {
    id: 1003,
    name: "Professor Tanaka",
    role: "mentor",
    description: "An elderly man with round glasses and a long grey beard. Wears a lab coat covered in chalk dust. Known for cryptic riddles.",
    appearances: 2,
  },
  {
    id: 1004,
    name: "Shadow",
    role: "antagonist",
    description: "A faceless figure cloaked in swirling dark mist. Eyes glow crimson red. Voice echoes as if speaking from a void.",
    appearances: 2,
  },
];

export const QA_SCENES: QAScene[] = [
  // Note: These are narrative-rich fixtures. For ScriptEditor, use qaSceneData() below.

  {
    id: 2001,
    episodeId: 9999,
    sceneNumber: 1,
    title: "The Awakening",
    setting: "A dimly lit classroom at dusk. Cherry blossoms drift through broken windows.",
    visualDescription: "Wide establishing shot of the abandoned school. Camera slowly pushes in through the window to find Kaito slumped over a desk, his pendant glowing faintly.",
    dialogue: "KAITO: (waking up) Where... where am I? The last thing I remember is—\nYUKI: (from the doorway) You've been asleep for three days. The barrier is failing.",
    panelCount: 4,
    approved: false,
    characters: [QA_CHARACTERS[0], QA_CHARACTERS[1]],
  },
  {
    id: 2002,
    episodeId: 9999,
    sceneNumber: 2,
    title: "The Professor's Warning",
    setting: "Underground laboratory beneath the school. Flickering fluorescent lights, walls covered in equations.",
    visualDescription: "Medium shot of Professor Tanaka at a chalkboard covered in arcane symbols. He turns to face Kaito and Yuki with a grave expression. Close-up on the equation that's circled in red.",
    dialogue: "TANAKA: The convergence happens at midnight. If the pendant resonates with the rift...\nKAITO: What happens then?\nTANAKA: (removing glasses) Then we find out if you're the key — or the lock.",
    panelCount: 3,
    approved: true,
    characters: [QA_CHARACTERS[0], QA_CHARACTERS[1], QA_CHARACTERS[2]],
  },
  {
    id: 2003,
    episodeId: 9999,
    sceneNumber: 3,
    title: "Shadow's Arrival",
    setting: "School rooftop at night. A massive swirling portal tears open in the sky above.",
    visualDescription: "Dramatic low-angle shot of Shadow descending from the portal. Lightning crackles around the figure. Kaito stands his ground, pendant blazing with light. Yuki draws her katana.",
    dialogue: "SHADOW: (echoing) You carry something that doesn't belong to you, child.\nKAITO: I didn't ask for this!\nSHADOW: None of us ask. We are chosen — or consumed.\nYUKI: (drawing katana) Then we choose to fight.",
    panelCount: 5,
    approved: false,
    characters: [QA_CHARACTERS[0], QA_CHARACTERS[1], QA_CHARACTERS[3]],
  },
  {
    id: 2004,
    episodeId: 9999,
    sceneNumber: 4,
    title: "The First Strike",
    setting: "Rooftop battle. Debris floating in anti-gravity zones. The portal pulses overhead.",
    visualDescription: "Action sequence. Yuki leaps through the air, katana gleaming. Shadow dissolves and reforms behind her. Kaito's pendant emits a shockwave that freezes everything mid-air for one panel.",
    dialogue: "YUKI: (mid-leap) Now, Kaito!\nKAITO: I don't know how to—\n(The pendant FLARES. Time stops. Every piece of debris hangs frozen.)\nSHADOW: (impressed) ...Interesting.",
    panelCount: 6,
    approved: false,
    characters: [QA_CHARACTERS[0], QA_CHARACTERS[1], QA_CHARACTERS[3]],
  },
];

// ─── SceneData-compatible fixtures for ScriptEditor ─────────────────────

import type { SceneData } from "@/components/awakli/SceneCard";

/** Convert QA_SCENES to SceneData[] for ScriptEditor */
export function qaSceneData(): SceneData[] {
  return QA_SCENES.map((s) => ({
    scene_number: s.sceneNumber,
    location: s.setting.split(".")[0],
    time_of_day: s.sceneNumber <= 2 ? "dusk" : "night",
    mood: s.sceneNumber === 1 ? "mysterious" : s.sceneNumber === 2 ? "tense" : "dramatic",
    description: s.visualDescription,
    title: s.title,
    characters: s.characters.map((c) => c.name),
    beat_summary: s.dialogue.split("\n")[0],
    approved: s.approved,
    panels: Array.from({ length: s.panelCount }, (_, i) => ({
      panel_number: i + 1,
      visual_description: `Panel ${i + 1} of scene ${s.sceneNumber}`,
      camera_angle: i === 0 ? "wide" : i === s.panelCount - 1 ? "close-up" : "medium",
      dialogue: s.dialogue.split("\n").slice(0, 2).map((line) => {
        const match = line.match(/^(\w+):\s*(?:\(.*?\)\s*)?(.*)$/);
        return {
          character: match?.[1] || "NARRATOR",
          text: match?.[2] || line,
          emotion: "neutral",
        };
      }),
      sfx: null,
      transition: null,
    })),
  }));
}

// ─── Panels fixtures ────────────────────────────────────────────────────

// Re-export PanelTileData for convenience
import type { PanelTileData } from "@/components/awakli/PanelTile";
import type { FlaggedPanel } from "@/components/awakli/ConsistencyReport";
export type { PanelTileData, FlaggedPanel };

const PLACEHOLDER_IMG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='512' height='768' fill='%230D0D1A'%3E%3Crect width='512' height='768' fill='%230D0D1A'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23333' font-size='24' font-family='monospace'%3EPanel %25s%3C/text%3E%3C/svg%3E";

function panelPlaceholder(n: number): string {
  return PLACEHOLDER_IMG.replace("%25s", String(n));
}

export const QA_PANELS: PanelTileData[] = [
  { id: 3001, panelNumber: 1, sceneNumber: 1, imageUrl: panelPlaceholder(1), status: "generated", visualDescription: "Wide shot: abandoned classroom at dusk, cherry blossoms through broken windows", cameraAngle: "wide" },
  { id: 3002, panelNumber: 2, sceneNumber: 1, imageUrl: panelPlaceholder(2), status: "generated", visualDescription: "Close-up: Kaito's face as he wakes, pendant glowing on his chest", cameraAngle: "close-up" },
  { id: 3003, panelNumber: 3, sceneNumber: 1, imageUrl: panelPlaceholder(3), status: "approved", visualDescription: "Medium shot: Yuki standing in doorway silhouetted by hallway light", cameraAngle: "medium" },
  { id: 3004, panelNumber: 4, sceneNumber: 1, imageUrl: panelPlaceholder(4), status: "generated", visualDescription: "Two-shot: Kaito and Yuki facing each other, tension in the air", cameraAngle: "two-shot" },
  { id: 3005, panelNumber: 5, sceneNumber: 2, imageUrl: panelPlaceholder(5), status: "approved", visualDescription: "Establishing shot: underground lab, flickering lights, equations on walls", cameraAngle: "establishing" },
  { id: 3006, panelNumber: 6, sceneNumber: 2, imageUrl: panelPlaceholder(6), status: "approved", visualDescription: "Close-up: Professor Tanaka's grave expression, glasses reflecting equations", cameraAngle: "close-up" },
  { id: 3007, panelNumber: 7, sceneNumber: 2, imageUrl: panelPlaceholder(7), status: "generated", visualDescription: "Over-shoulder: Kaito looking at the circled equation in red", cameraAngle: "over-shoulder" },
  { id: 3008, panelNumber: 8, sceneNumber: 3, imageUrl: panelPlaceholder(8), status: "generating", visualDescription: "Dramatic low-angle: Shadow descending from swirling portal, lightning", cameraAngle: "low-angle" },
  { id: 3009, panelNumber: 9, sceneNumber: 3, imageUrl: null, status: "draft", visualDescription: "Medium shot: Kaito stands ground, pendant blazing white light", cameraAngle: "medium" },
  { id: 3010, panelNumber: 10, sceneNumber: 3, imageUrl: panelPlaceholder(10), status: "generated", visualDescription: "Action: Yuki draws katana, blade catching moonlight", cameraAngle: "action" },
  { id: 3011, panelNumber: 11, sceneNumber: 3, imageUrl: panelPlaceholder(11), status: "generated", visualDescription: "Close-up: Shadow's crimson eyes through the mist", cameraAngle: "close-up" },
  { id: 3012, panelNumber: 12, sceneNumber: 3, imageUrl: panelPlaceholder(12), status: "rejected", visualDescription: "Wide: all three figures on rooftop, portal looming above", cameraAngle: "wide" },
];

// ─── Style drift fixture ────────────────────────────────────────────────

export const QA_STYLE_DRIFT = {
  value: 0.35,
  label: "Grounded → Stylized",
};

// ─── Consistency report fixture ─────────────────────────────────────────

export const QA_FLAGGED_PANELS: FlaggedPanel[] = [
  { panelId: 3004, panelNumber: 4, characterName: "Kaito", similarityScore: 72, severity: "warning" },
  { panelId: 3010, panelNumber: 10, characterName: "Yuki", similarityScore: 67, severity: "warning" },
  { panelId: 3012, panelNumber: 12, characterName: "Kaito", similarityScore: 58, severity: "critical", suggestedPrompt: "Ensure Kaito has spiky dark hair, scar on left cheek, and glowing pendant" },
];
