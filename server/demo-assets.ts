/**
 * Demo Asset Generation Module
 * Generates manga panels, character sheets, and other assets for the demo video.
 * Called by the admin regeneration endpoint.
 */

import { generateImage } from "./_core/imageGeneration";
import { invokeLLM } from "./_core/llm";
import { setPlatformConfig } from "./db";
import {
  DEMO_SCENARIO,
  DEMO_CHARACTERS,
  DEMO_PANELS,
  DEMO_CHARACTER_VIEWS,
  DEMO_CONFIG_KEYS,
} from "../shared/demo-scenario";

export interface DemoAssetResult {
  panelUrls: string[];
  characterUrls: Record<string, string>;
  animeClipUrl?: string;
  bgmUrl?: string;
  posterUrl?: string;
}

export interface DemoProgress {
  step: string;
  current: number;
  total: number;
  message: string;
}

type ProgressCallback = (progress: DemoProgress) => void;

/**
 * Generate all 6 demo manga panels using the platform's image generation pipeline.
 */
export async function generateDemoPanels(
  onProgress?: ProgressCallback
): Promise<string[]> {
  const panelUrls: string[] = [];

  for (let i = 0; i < DEMO_PANELS.length; i++) {
    const panel = DEMO_PANELS[i];
    onProgress?.({
      step: "panels",
      current: i + 1,
      total: DEMO_PANELS.length,
      message: `Generating panel ${i + 1}/${DEMO_PANELS.length}: ${panel.description.slice(0, 60)}...`,
    });

    try {
      const result = await generateImage({
        prompt: panel.fluxPrompt,
      });
      panelUrls.push(result.url || "");
    } catch (error) {
      console.error(`[Demo] Failed to generate panel ${i + 1}:`, error);
      // Push placeholder on failure
      panelUrls.push("");
    }
  }

  // Store panel URLs in platform config
  await setPlatformConfig(DEMO_CONFIG_KEYS.PANEL_URLS, JSON.stringify(panelUrls));
  return panelUrls;
}

/**
 * Generate character sheet images for Kai Tanaka (5 views).
 */
export async function generateDemoCharacterSheet(
  onProgress?: ProgressCallback
): Promise<Record<string, string>> {
  const characterUrls: Record<string, string> = {};
  const kai = DEMO_CHARACTERS.kai;

  for (let i = 0; i < DEMO_CHARACTER_VIEWS.length; i++) {
    const view = DEMO_CHARACTER_VIEWS[i];
    onProgress?.({
      step: "characters",
      current: i + 1,
      total: DEMO_CHARACTER_VIEWS.length,
      message: `Generating character view ${i + 1}/${DEMO_CHARACTER_VIEWS.length}: ${view}`,
    });

    const viewPrompts: Record<string, string> = {
      portrait:
        `anime character portrait, ${kai.description}, facing forward, neutral background, clean linework, cyberpunk aesthetic, character design sheet style`,
      full_body:
        `anime character full body shot, ${kai.description}, standing pose, full figure visible head to toe, neutral background, character design sheet style, cyberpunk aesthetic`,
      three_quarter:
        `anime character three-quarter view, ${kai.description}, slight angle, dynamic pose, neutral background, character design sheet style, cyberpunk aesthetic`,
      action_pose:
        `anime character action pose, ${kai.description}, dynamic leaping or fighting stance, motion lines, cyberpunk city background, dramatic lighting`,
      expression_sheet:
        `anime character expression sheet, ${kai.description}, 4 different expressions: serious, surprised, angry, smiling, grid layout, neutral background, character design reference`,
    };

    try {
      const result = await generateImage({
        prompt: viewPrompts[view] || viewPrompts.portrait,
      });
      characterUrls[view] = result.url || "";
    } catch (error) {
      console.error(`[Demo] Failed to generate character view ${view}:`, error);
      characterUrls[view] = "";
    }
  }

  await setPlatformConfig(DEMO_CONFIG_KEYS.CHARACTER_URLS, JSON.stringify(characterUrls));
  return characterUrls as Record<string, string>;
}

/**
 * Generate the demo script text using LLM (for the ScriptShot).
 * Returns a pre-formatted script that the demo recording page will display.
 */
export async function generateDemoScript(): Promise<string> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content:
          "You are a manga/anime script writer. Write a short, dramatic script for a single chapter opening scene. Format: Scene headings in CAPS, character names before dialogue, brief action descriptions in brackets. Keep it under 300 words.",
      },
      {
        role: "user",
        content: `Write the opening scene script for: "${DEMO_SCENARIO.prompt}". Title: "${DEMO_SCENARIO.title}". Genre: ${DEMO_SCENARIO.genre.join(", ")}. Include the characters Kai Tanaka (cyberpunk detective) and NEXUS (AI holographic entity). Make it dramatic and cinematic.`,
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  return (typeof content === "string" ? content : "") || "Script generation failed.";
}

/**
 * Run the full demo asset generation pipeline.
 */
export async function generateAllDemoAssets(
  onProgress?: ProgressCallback
): Promise<DemoAssetResult> {
  // Update status
  await setPlatformConfig(DEMO_CONFIG_KEYS.STATUS, "generating");

  onProgress?.({
    step: "init",
    current: 0,
    total: 3,
    message: "Starting demo asset generation...",
  });

  // Step 1: Generate panels
  const panelUrls = await generateDemoPanels(onProgress);

  // Step 2: Generate character sheets
  const characterUrls = await generateDemoCharacterSheet(onProgress);

  // Step 3: Generate script (stored in config for the recording page)
  onProgress?.({
    step: "script",
    current: 1,
    total: 1,
    message: "Generating demo script...",
  });
  const script = await generateDemoScript();
  await setPlatformConfig("demo_script_text", script);

  // Mark complete
  await setPlatformConfig(DEMO_CONFIG_KEYS.STATUS, "assets_ready");
  await setPlatformConfig(DEMO_CONFIG_KEYS.UPDATED_AT, new Date().toISOString());

  return {
    panelUrls,
    characterUrls,
  };
}
