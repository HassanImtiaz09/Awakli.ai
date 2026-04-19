/**
 * P26 Character Bible Pipeline — 5-Stage Orchestrator
 *
 * Orchestrates the full pipeline:
 *   Stage 1: Character Bible Generator (extraction + reference sheets)
 *   Stage 2: Identity Lock-in (IP-Adapter free, LoRA premium)
 *   Stage 3: Shot Planner (height-ratio, depth, regional prompting)
 *   Stage 4: Panel Generation (ControlNet stack + character identity)
 *   Stage 5: Spatial QA Gate (face similarity, height ratio, style coherence)
 *
 * @see Awakli_Prompt26
 */

import { extractCharacterBible, buildAppearanceString } from "./extraction";
import { generateAllReferenceSheets } from "./reference-sheet";
import { planAllShots, buildCharacterBiblePrompt } from "./shot-planner";
import {
  runSpatialQaCheck,
  createRegenBudget,
  consumeRegenBudget,
} from "./qa-gate";
import { applyIdentityLock, resolveIdentityMode } from "./lora-training";
import {
  upsertCharacterRegistry,
  getCharacterRegistry,
  saveSpatialQaResult,
  setSceneProviderPin,
} from "./db";
import type {
  CharacterAwareGenerationJob,
  CharacterBiblePipelineState,
  CharacterEntry,
  CharacterRegistry,
  QualityTier,
  ShotPlan,
} from "./types";
import { QUALITY_TIERS } from "./types";

// ─── Pipeline State ─────────────────────────────────────────────────────

const pipelineStates = new Map<number, CharacterBiblePipelineState>();

export function getPipelineState(
  projectId: number,
): CharacterBiblePipelineState | undefined {
  return pipelineStates.get(projectId);
}

function initPipelineState(projectId: number): CharacterBiblePipelineState {
  const state: CharacterBiblePipelineState = {
    stage1_extraction: "pending",
    stage2_identity: "pending",
    stage3_shotPlan: "pending",
    stage4_generation: "pending",
    stage5_qa: "pending",
    registryVersion: 0,
    totalPanels: 0,
    completedPanels: 0,
    failedPanels: 0,
    qaPassRate: 0,
  };
  pipelineStates.set(projectId, state);
  return state;
}

// ─── Stage 1: Character Bible Generation ────────────────────────────────

export async function runStage1(
  projectId: number,
  script: any,
  genre: string,
  artStyle: string,
  originalPrompt: string,
): Promise<CharacterRegistry> {
  const state = pipelineStates.get(projectId) || initPipelineState(projectId);
  state.stage1_extraction = "running";

  try {
    // Extract character attributes via LLM
    let registry = await extractCharacterBible(
      script,
      genre,
      artStyle,
      originalPrompt,
    );

    // Generate reference sheets for all non-background characters
    registry = await generateAllReferenceSheets(registry);

    // Persist to database
    const { version } = await upsertCharacterRegistry(projectId, registry);
    state.registryVersion = version;

    state.stage1_extraction = "completed";
    console.log(
      `[P26] Stage 1 complete: ${registry.characters.length} characters extracted, v${version}`,
    );

    return registry;
  } catch (error) {
    state.stage1_extraction = "failed";
    console.error("[P26] Stage 1 failed:", error);
    throw error;
  }
}

// ─── Stage 2: Identity Lock-in ──────────────────────────────────────────

export async function runStage2(
  projectId: number,
  registry: CharacterRegistry,
  isPremium: boolean = false,
): Promise<CharacterRegistry> {
  const state = pipelineStates.get(projectId) || initPipelineState(projectId);
  state.stage2_identity = "running";

  try {
    // For free tier: IP-Adapter is already set up in Stage 1
    // For premium tier: would initiate TAMS LoRA training here
    // LoRA training is async, so we continue with IP-Adapter and switch later

    const updatedCharacters = registry.characters.map((char) => {
      const mode = resolveIdentityMode(char);
      return {
        ...char,
        identity: {
          ...char.identity,
          identityMode: mode,
        },
      };
    });

    const updatedRegistry = { ...registry, characters: updatedCharacters };

    // Persist updated registry
    await upsertCharacterRegistry(projectId, updatedRegistry);

    state.stage2_identity = "completed";
    console.log(
      `[P26] Stage 2 complete: identity modes resolved for ${updatedCharacters.length} characters`,
    );

    return updatedRegistry;
  } catch (error) {
    state.stage2_identity = "failed";
    console.error("[P26] Stage 2 failed:", error);
    throw error;
  }
}

// ─── Stage 3: Shot Planning ─────────────────────────────────────────────

export function runStage3(
  projectId: number,
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
  const state = pipelineStates.get(projectId) || initPipelineState(projectId);
  state.stage3_shotPlan = "running";
  state.totalPanels = panels.length;

  try {
    const shotPlans = planAllShots(panels, registry);

    state.stage3_shotPlan = "completed";
    console.log(
      `[P26] Stage 3 complete: ${shotPlans.length} shot plans created`,
    );

    return shotPlans;
  } catch (error) {
    state.stage3_shotPlan = "failed";
    console.error("[P26] Stage 3 failed:", error);
    throw error;
  }
}

// ─── Stage 4: Build Generation Jobs ─────────────────────────────────────

export function buildGenerationJobs(
  panels: Array<{
    id: number;
    episodeId: number;
    projectId: number;
    sceneNumber: number;
    panelNumber: number;
    cameraAngle: string;
    visualDescription?: string;
    dialogue?: Array<{ character: string; text: string; emotion: string }>;
  }>,
  registry: CharacterRegistry,
  shotPlans: ShotPlan[],
  qualityTierName: "draft" | "hero" = "draft",
): CharacterAwareGenerationJob[] {
  const qualityTier = QUALITY_TIERS[qualityTierName];

  return panels.map((panel) => {
    const shotPlan = shotPlans.find((sp) => sp.panelId === panel.id);

    // Find characters in this panel
    const charNames = new Set<string>();
    if (panel.dialogue) {
      for (const d of panel.dialogue) {
        if (d.character && d.character !== "Narrator" && d.character !== "SFX") {
          charNames.add(d.character);
        }
      }
    }

    const characters = Array.from(charNames)
      .map((name) =>
        registry.characters.find(
          (c) => c.name.toLowerCase() === name.toLowerCase(),
        ),
      )
      .filter((c): c is CharacterEntry => c !== undefined);

    // Get protagonist for reference
    const protagonist =
      characters.find((c) => c.role === "protagonist") ||
      characters[0] ||
      registry.characters.find((c) => c.role === "protagonist");

    return {
      panelId: panel.id,
      episodeId: panel.episodeId,
      projectId: panel.projectId,
      sceneNumber: panel.sceneNumber,
      panelNumber: panel.panelNumber,
      qualityTier,
      visualDescription: panel.visualDescription || "",
      cameraAngle: panel.cameraAngle,
      characters,
      shotPlan,
      characterRefUrl: protagonist?.identity?.ipAdapterRefUrl,
      seed: protagonist?.identity?.referenceSheetSeed,
    };
  });
}

// ─── Stage 5: QA Gate ───────────────────────────────────────────────────

export async function runStage5(
  projectId: number,
  episodeId: number,
  panelResults: Array<{
    panelId: number;
    imageUrl: string;
    characters: CharacterEntry[];
    shotPlan: ShotPlan;
    usedIpAdapter: boolean;
    usedLora: boolean;
  }>,
  registry: CharacterRegistry,
  sceneImageUrls: Map<number, string[]>,
): Promise<{
  results: Array<{ panelId: number; passed: boolean; hint?: string }>;
  passRate: number;
}> {
  const state = pipelineStates.get(projectId) || initPipelineState(projectId);
  state.stage5_qa = "running";

  const results: Array<{ panelId: number; passed: boolean; hint?: string }> = [];

  for (const panel of panelResults) {
    const sceneUrls = sceneImageUrls.get(panel.shotPlan.sceneNumber) || [];

    const qaResult = runSpatialQaCheck(
      panel.panelId,
      panel.imageUrl,
      panel.characters,
      panel.shotPlan,
      registry,
      sceneUrls,
      panel.usedIpAdapter,
      panel.usedLora,
    );

    // Persist QA result
    try {
      await saveSpatialQaResult({
        panelId: panel.panelId,
        episodeId,
        projectId,
        result: qaResult,
      });
    } catch (err) {
      console.warn(`[P26] Failed to save QA result for panel ${panel.panelId}:`, err);
    }

    results.push({
      panelId: panel.panelId,
      passed: !qaResult.shouldRegenerate,
      hint: qaResult.regenerationHint,
    });
  }

  const passCount = results.filter((r) => r.passed).length;
  const passRate = results.length > 0 ? passCount / results.length : 1;

  state.stage5_qa = "completed";
  state.qaPassRate = Math.round(passRate * 100);
  state.completedPanels = passCount;
  state.failedPanels = results.length - passCount;

  console.log(
    `[P26] Stage 5 complete: ${passCount}/${results.length} panels passed QA (${state.qaPassRate}%)`,
  );

  return { results, passRate };
}

// ─── Full Pipeline Runner ───────────────────────────────────────────────

export async function runCharacterBiblePipeline(
  projectId: number,
  episodeId: number,
  script: any,
  genre: string,
  artStyle: string,
  originalPrompt: string,
  panels: Array<{
    id: number;
    episodeId: number;
    projectId: number;
    sceneNumber: number;
    panelNumber: number;
    cameraAngle: string;
    visualDescription?: string;
    dialogue?: Array<{ character: string; text: string; emotion: string }>;
  }>,
  qualityTier: "draft" | "hero" = "draft",
): Promise<{
  registry: CharacterRegistry;
  shotPlans: ShotPlan[];
  generationJobs: CharacterAwareGenerationJob[];
}> {
  // Stage 1: Extract character bible + generate reference sheets
  const registry = await runStage1(
    projectId,
    script,
    genre,
    artStyle,
    originalPrompt,
  );

  // Stage 2: Identity lock-in
  const lockedRegistry = await runStage2(projectId, registry);

  // Stage 3: Shot planning
  const shotPlans = runStage3(projectId, panels, lockedRegistry);

  // Stage 4: Build generation jobs (actual generation happens in caller)
  const generationJobs = buildGenerationJobs(
    panels,
    lockedRegistry,
    shotPlans,
    qualityTier,
  );

  return { registry: lockedRegistry, shotPlans, generationJobs };
}

// Cleanup
export function cleanupPipelineState(projectId: number): void {
  pipelineStates.delete(projectId);
}

// Export for testing
export { pipelineStates, initPipelineState };
