/**
 * scriptSceneService.ts — Scene-level CRUD, approval, regeneration, and character propagation.
 *
 * The source of truth for scene data is episode.scriptContent JSON.
 * This service provides granular scene-level operations that modify the JSON in place.
 */
import { invokeLLM } from "./_core/llm";
import { getEpisodeById, updateEpisode } from "./db";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DialogueLine {
  character: string;
  text: string;
  emotion: string;
}

export interface ScenePanel {
  panel_number: number;
  visual_description: string;
  camera_angle: string;
  dialogue: DialogueLine[];
  sfx: string | null;
  transition: string | null;
}

export interface ScriptScene {
  scene_number: number;
  location: string;
  time_of_day: string;
  mood: string;
  description: string;
  panels: ScenePanel[];
  // New fields for the editor
  title?: string;
  characters?: string[];
  beat_summary?: string;
  approved?: boolean;
}

export interface ScriptContent {
  episode_title: string;
  synopsis: string;
  scenes: ScriptScene[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getScriptContent(episode: any): ScriptContent {
  if (!episode?.scriptContent) {
    throw new Error("Episode has no script content");
  }
  return episode.scriptContent as ScriptContent;
}

function getSceneByNumber(script: ScriptContent, sceneNumber: number): ScriptScene | undefined {
  return script.scenes.find((s) => s.scene_number === sceneNumber);
}

/** Extract unique character names from all scenes */
export function extractCharacters(script: ScriptContent): string[] {
  const names = new Set<string>();
  for (const scene of script.scenes) {
    if (scene.characters) {
      scene.characters.forEach((c) => names.add(c));
    }
    for (const panel of scene.panels) {
      for (const d of panel.dialogue) {
        if (d.character) names.add(d.character);
      }
    }
  }
  return Array.from(names).sort();
}

/** Auto-populate scene titles and characters from content */
export function enrichScenes(script: ScriptContent): ScriptContent {
  for (const scene of script.scenes) {
    // Auto-generate title from location + mood if not set
    if (!scene.title) {
      scene.title = `${scene.location} — ${scene.mood}`;
    }
    // Extract characters from dialogue
    if (!scene.characters || scene.characters.length === 0) {
      const chars = new Set<string>();
      for (const panel of scene.panels) {
        for (const d of panel.dialogue) {
          if (d.character) chars.add(d.character);
        }
      }
      scene.characters = Array.from(chars);
    }
    // Auto-generate beat summary from description
    if (!scene.beat_summary) {
      scene.beat_summary = scene.description?.slice(0, 120) || "";
    }
    // Default approved to false
    if (scene.approved === undefined) {
      scene.approved = false;
    }
  }
  return script;
}

// ─── Scene CRUD ─────────────────────────────────────────────────────────────

/** Get all scenes for an episode with enriched data */
export async function getScenes(episodeId: number): Promise<{
  scenes: ScriptScene[];
  characters: string[];
  allApproved: boolean;
}> {
  const episode = await getEpisodeById(episodeId);
  if (!episode) throw new Error("Episode not found");
  const script = getScriptContent(episode);
  const enriched = enrichScenes(script);
  const characters = extractCharacters(enriched);
  const allApproved = enriched.scenes.length > 0 && enriched.scenes.every((s) => s.approved);
  return { scenes: enriched.scenes, characters, allApproved };
}

/** Update a single scene's editable fields */
export async function updateScene(
  episodeId: number,
  sceneNumber: number,
  updates: Partial<Pick<ScriptScene, "title" | "location" | "time_of_day" | "mood" | "description" | "beat_summary" | "characters">>
): Promise<ScriptScene> {
  const episode = await getEpisodeById(episodeId);
  if (!episode) throw new Error("Episode not found");
  const script = getScriptContent(episode);
  const scene = getSceneByNumber(script, sceneNumber);
  if (!scene) throw new Error(`Scene ${sceneNumber} not found`);

  // Apply updates
  if (updates.title !== undefined) scene.title = updates.title;
  if (updates.location !== undefined) scene.location = updates.location;
  if (updates.time_of_day !== undefined) scene.time_of_day = updates.time_of_day;
  if (updates.mood !== undefined) scene.mood = updates.mood;
  if (updates.description !== undefined) scene.description = updates.description;
  if (updates.beat_summary !== undefined) scene.beat_summary = updates.beat_summary;
  if (updates.characters !== undefined) scene.characters = updates.characters;

  await updateEpisode(episodeId, { scriptContent: script });
  return scene;
}

/** Approve a single scene */
export async function approveScene(episodeId: number, sceneNumber: number): Promise<boolean> {
  const episode = await getEpisodeById(episodeId);
  if (!episode) throw new Error("Episode not found");
  const script = getScriptContent(episode);
  const scene = getSceneByNumber(script, sceneNumber);
  if (!scene) throw new Error(`Scene ${sceneNumber} not found`);
  scene.approved = true;
  await updateEpisode(episodeId, { scriptContent: script });
  const allApproved = script.scenes.every((s) => s.approved);
  return allApproved;
}

/** Bulk approve all scenes */
export async function approveAllScenes(episodeId: number): Promise<void> {
  const episode = await getEpisodeById(episodeId);
  if (!episode) throw new Error("Episode not found");
  const script = getScriptContent(episode);
  for (const scene of script.scenes) {
    scene.approved = true;
  }
  await updateEpisode(episodeId, { scriptContent: script });
}

/** Reorder scenes by providing new scene_number ordering */
export async function reorderScenes(episodeId: number, newOrder: number[]): Promise<void> {
  const episode = await getEpisodeById(episodeId);
  if (!episode) throw new Error("Episode not found");
  const script = getScriptContent(episode);

  // Build a map of current scenes
  const sceneMap = new Map<number, ScriptScene>();
  for (const scene of script.scenes) {
    sceneMap.set(scene.scene_number, scene);
  }

  // Reorder
  const reordered: ScriptScene[] = [];
  for (let i = 0; i < newOrder.length; i++) {
    const scene = sceneMap.get(newOrder[i]);
    if (scene) {
      scene.scene_number = i + 1;
      // Also update panel scene references
      for (const panel of scene.panels) {
        // Panels keep their panel_number within the scene
      }
      reordered.push(scene);
    }
  }
  script.scenes = reordered;
  await updateEpisode(episodeId, { scriptContent: script });
}

/** Rename a character globally across all scenes */
export async function renameCharacter(
  episodeId: number,
  oldName: string,
  newName: string
): Promise<{ updatedScenes: number; updatedDialogues: number }> {
  const episode = await getEpisodeById(episodeId);
  if (!episode) throw new Error("Episode not found");
  const script = getScriptContent(episode);

  let updatedScenes = 0;
  let updatedDialogues = 0;

  for (const scene of script.scenes) {
    let sceneUpdated = false;
    // Update characters array
    if (scene.characters) {
      const idx = scene.characters.indexOf(oldName);
      if (idx !== -1) {
        scene.characters[idx] = newName;
        sceneUpdated = true;
      }
    }
    // Update dialogue
    for (const panel of scene.panels) {
      for (const d of panel.dialogue) {
        if (d.character === oldName) {
          d.character = newName;
          updatedDialogues++;
          sceneUpdated = true;
        }
      }
    }
    if (sceneUpdated) updatedScenes++;
  }

  await updateEpisode(episodeId, { scriptContent: script });
  return { updatedScenes, updatedDialogues };
}

// ─── Scene Regeneration ─────────────────────────────────────────────────────

/** Regenerate a single scene using LLM with optional instruction */
export async function regenerateScene(
  episodeId: number,
  sceneNumber: number,
  instruction?: string
): Promise<ScriptScene> {
  const episode = await getEpisodeById(episodeId);
  if (!episode) throw new Error("Episode not found");
  const script = getScriptContent(episode);
  const scene = getSceneByNumber(script, sceneNumber);
  if (!scene) throw new Error(`Scene ${sceneNumber} not found`);

  const contextScenes = script.scenes
    .filter((s) => s.scene_number !== sceneNumber)
    .map((s) => `Scene ${s.scene_number}: ${s.title || s.location} — ${s.description?.slice(0, 80)}`)
    .join("\n");

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a manga/anime script writer. Regenerate a single scene for an episode.
The episode is titled "${script.episode_title}" with synopsis: "${script.synopsis}".
Other scenes in this episode:
${contextScenes}

${instruction ? `Creator's instruction: ${instruction}` : "Make the scene more compelling and visually interesting."}

Return a JSON object for this single scene with the exact same structure.`,
      },
      {
        role: "user",
        content: `Regenerate scene ${sceneNumber}. Current scene:
Location: ${scene.location}
Time: ${scene.time_of_day}
Mood: ${scene.mood}
Description: ${scene.description}
Panels: ${scene.panels.length}

Keep the same number of panels (${scene.panels.length}) and maintain continuity with the other scenes.`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "regenerated_scene",
        strict: true,
        schema: {
          type: "object",
          properties: {
            scene_number: { type: "integer" },
            location: { type: "string" },
            time_of_day: { type: "string", enum: ["day", "night", "dawn", "dusk"] },
            mood: { type: "string" },
            description: { type: "string" },
            title: { type: "string" },
            panels: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  panel_number: { type: "integer" },
                  visual_description: { type: "string" },
                  camera_angle: {
                    type: "string",
                    enum: ["wide", "medium", "close-up", "extreme-close-up", "birds-eye"],
                  },
                  dialogue: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        character: { type: "string" },
                        text: { type: "string" },
                        emotion: { type: "string" },
                      },
                      required: ["character", "text", "emotion"],
                      additionalProperties: false,
                    },
                  },
                  sfx: { type: ["string", "null"] },
                  transition: { type: ["string", "null"], enum: ["cut", "fade", "dissolve", null] },
                },
                required: [
                  "panel_number",
                  "visual_description",
                  "camera_angle",
                  "dialogue",
                  "sfx",
                  "transition",
                ],
                additionalProperties: false,
              },
            },
          },
          required: [
            "scene_number",
            "location",
            "time_of_day",
            "mood",
            "description",
            "title",
            "panels",
          ],
          additionalProperties: false,
        },
      },
    },
  });

  const rawContent = response.choices[0]?.message?.content;
  if (!rawContent || typeof rawContent !== "string") throw new Error("No content in LLM response");
  const newScene: ScriptScene = JSON.parse(rawContent);

  // Preserve scene_number and mark as unapproved
  newScene.scene_number = sceneNumber;
  newScene.approved = false;

  // Extract characters from dialogue
  const chars = new Set<string>();
  for (const panel of newScene.panels) {
    for (const d of panel.dialogue) {
      if (d.character) chars.add(d.character);
    }
  }
  newScene.characters = Array.from(chars);
  newScene.beat_summary = newScene.description?.slice(0, 120) || "";

  // Replace the scene in the script
  const idx = script.scenes.findIndex((s) => s.scene_number === sceneNumber);
  if (idx !== -1) {
    script.scenes[idx] = newScene;
  }

  await updateEpisode(episodeId, { scriptContent: script });
  return newScene;
}

// ─── Tier-based regeneration limits ─────────────────────────────────────────

const REGEN_LIMITS: Record<string, number> = {
  free_trial: 3,         // Apprentice: 3/project
  apprentice: 3,         // alias
  creator: 15,           // Mangaka: 15/project
  creator_pro: Infinity, // Studio: unlimited
  studio: Infinity,      // Studio Pro: unlimited
  enterprise: Infinity,
};

export function getRegenLimit(tier: string): number {
  return REGEN_LIMITS[tier] ?? 3;
}
