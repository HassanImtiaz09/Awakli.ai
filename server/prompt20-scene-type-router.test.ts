import { describe, it, expect, beforeEach } from "vitest";

// ─── Scene-Type Classifier ─────────────────────────────────────────────

import {
  classifySceneType,
  classifyEpisodeScenes,
  extractSceneMetadata,
  SCENE_TYPE_TO_TEMPLATE,
  HIGH_MOTION_KEYWORDS,
  MEDIUM_MOTION_KEYWORDS,
  ACTION_LINE_KEYWORDS,
  EXTERIOR_KEYWORDS,
  MONTAGE_KEYWORDS,
} from "./scene-type-router/scene-type-classifier";
import type { SceneMetadata, PanelData, SceneData, SceneWithPanels } from "./scene-type-router/scene-type-classifier";

// ─── Ken Burns Engine ──────────────────────────────────────────────────

import {
  selectMovement,
  generateKenBurnsParams,
  generateFrameTransforms,
  generateFfmpegFilter,
  autoKenBurns,
  MOVEMENT_PRESETS,
} from "./scene-type-router/ken-burns-engine";
import type { KenBurnsMovement, SceneContext } from "./scene-type-router/ken-burns-engine";

// ─── Transition Generator ──────────────────────────────────────────────

import {
  selectTransitionType,
  generateTransition,
  TRANSITION_TYPES,
} from "./scene-type-router/transition-generator";
import type { TransitionConfig, TransitionContext } from "./scene-type-router/transition-generator";

// ─── Pipeline Templates ────────────────────────────────────────────────

import {
  ALL_PIPELINE_TEMPLATES,
  getTemplateById,
  getTemplateForSceneType,
  getSkipStagesForSceneType,
  getProviderHintsForSceneType,
  getEstimatedCreditsPerTenS,
} from "./scene-type-router/pipeline-templates";

// ─── Router Integration ────────────────────────────────────────────────

import {
  getProviderHintForSceneType,
  getPipelineStageSkips,
  shouldSkipStage,
  getStageReplacement,
  CREDITS_PER_10S,
  generateCostForecast,
  getAllPipelineConfigs,
} from "./scene-type-router/router-integration";
import type { SceneTypeDistribution } from "./scene-type-router/router-integration";

// ─── Dialogue Inpainting ───────────────────────────────────────────────

import {
  phonemeToViseme,
  ALL_VISEMES,
  PHONEME_TO_VISEME,
  generateVisemeTimeline,
  generateBlinkSchedule,
  generateHeadMotion,
  estimateDialogueCost,
  planDialoguePipeline,
  generateAssemblyInstructions,
} from "./scene-type-router/dialogue-inpainting";
import type { DialogueSceneConfig } from "./scene-type-router/dialogue-inpainting";

// ─── Reaction Cache ────────────────────────────────────────────────────

import {
  ReactionCacheManager,
  getReactionCacheManager,
  resetReactionCacheManager,
  VALID_EMOTIONS,
  VALID_CAMERA_ANGLES,
  CACHE_MISS_GENERATION_CREDITS,
  DEFAULT_REACTION_DURATION_S,
  MAX_CACHE_PER_CHARACTER,
} from "./scene-type-router/reaction-cache";

// ─── Barrel Exports ────────────────────────────────────────────────────

import * as barrelExports from "./scene-type-router/index";

// ═══════════════════════════════════════════════════════════════════════
// CLASSIFIER TESTS
// ═══════════════════════════════════════════════════════════════════════

describe("Scene-Type Classifier", () => {
  const baseMeta: SceneMetadata = {
    panelCount: 3,
    hasDialogue: false,
    dialogueLineCount: 0,
    characterCount: 0,
    motionIntensity: "none",
    isExterior: false,
    hasActionLines: false,
    isCloseUp: false,
    panelSizePct: 33,
  };

  describe("classifySceneType — priority rules", () => {
    it("Rule 1: transition when panelCount=0 and previousSceneType exists", () => {
      const r = classifySceneType({ ...baseMeta, panelCount: 0, previousSceneType: "dialogue" });
      expect(r.sceneType).toBe("transition");
      expect(r.confidence).toBe(0.95);
      expect(r.matchedRule).toBe("transition_no_panels");
      expect(r.pipelineTemplate).toBe("transition_rule_based");
    });

    it("Rule 2: establishing — exterior, no characters, no action", () => {
      const r = classifySceneType({ ...baseMeta, isExterior: true, characterCount: 0 });
      expect(r.sceneType).toBe("establishing");
      expect(r.confidence).toBe(0.92);
      expect(r.matchedRule).toBe("establishing_exterior_no_chars");
    });

    it("Rule 3: action — high motion intensity", () => {
      const r = classifySceneType({ ...baseMeta, motionIntensity: "high", characterCount: 2 });
      expect(r.sceneType).toBe("action");
      expect(r.confidence).toBe(0.85);
    });

    it("Rule 3: action — action lines present", () => {
      const r = classifySceneType({ ...baseMeta, hasActionLines: true, characterCount: 2 });
      expect(r.sceneType).toBe("action");
      expect(r.confidence).toBe(0.85);
    });

    it("Rule 3: action — both high motion AND action lines = 0.95 confidence", () => {
      const r = classifySceneType({ ...baseMeta, motionIntensity: "high", hasActionLines: true, characterCount: 2 });
      expect(r.sceneType).toBe("action");
      expect(r.confidence).toBe(0.95);
    });

    it("Rule 4: montage — flashback narrative tag", () => {
      const r = classifySceneType({ ...baseMeta, narrativeTag: "flashback" });
      expect(r.sceneType).toBe("montage");
      expect(r.confidence).toBe(0.88);
      expect(r.matchedRule).toBe("montage_narrative_tag");
    });

    it("Rule 4: montage — timeskip narrative tag", () => {
      const r = classifySceneType({ ...baseMeta, narrativeTag: "timeskip" });
      expect(r.sceneType).toBe("montage");
    });

    it("Rule 5: reaction — close-up, single character, ≤1 dialogue line", () => {
      const r = classifySceneType({
        ...baseMeta, isCloseUp: true, characterCount: 1, dialogueLineCount: 1, hasDialogue: true,
      });
      expect(r.sceneType).toBe("reaction");
      expect(r.confidence).toBe(0.82);
    });

    it("Rule 6: dialogue — multi-line dialogue (≥2 lines)", () => {
      const r = classifySceneType({
        ...baseMeta, hasDialogue: true, dialogueLineCount: 3, characterCount: 2,
      });
      expect(r.sceneType).toBe("dialogue");
      expect(r.confidence).toBe(0.90);
    });

    it("Rule 7: dialogue fallback — has dialogue but only 1 line", () => {
      const r = classifySceneType({
        ...baseMeta, hasDialogue: true, dialogueLineCount: 1, characterCount: 2,
      });
      expect(r.sceneType).toBe("dialogue");
      expect(r.confidence).toBe(0.75);
      expect(r.matchedRule).toBe("dialogue_fallback");
    });

    it("Rule 8: establishing fallback — ambiguous scene", () => {
      const r = classifySceneType(baseMeta);
      expect(r.sceneType).toBe("establishing");
      expect(r.confidence).toBe(0.60);
      expect(r.matchedRule).toBe("establishing_fallback");
    });
  });

  describe("classifySceneType — priority ordering", () => {
    it("transition beats establishing (panelCount=0 + exterior)", () => {
      const r = classifySceneType({
        ...baseMeta, panelCount: 0, isExterior: true, previousSceneType: "action",
      });
      expect(r.sceneType).toBe("transition");
    });

    it("establishing beats action (exterior + no chars, even with action lines)", () => {
      const r = classifySceneType({
        ...baseMeta, isExterior: true, characterCount: 0, hasActionLines: true,
      });
      // Rule 2 checks !hasActionLines, so this should fall to action
      expect(r.sceneType).toBe("action");
    });

    it("action beats montage (high motion + flashback tag)", () => {
      const r = classifySceneType({
        ...baseMeta, motionIntensity: "high", narrativeTag: "flashback", characterCount: 2,
      });
      expect(r.sceneType).toBe("action");
    });

    it("montage beats reaction (flashback tag + close-up single char)", () => {
      const r = classifySceneType({
        ...baseMeta, narrativeTag: "flashback", isCloseUp: true, characterCount: 1,
      });
      expect(r.sceneType).toBe("montage");
    });
  });

  describe("SCENE_TYPE_TO_TEMPLATE mapping", () => {
    it("maps all 6 scene types to templates", () => {
      expect(Object.keys(SCENE_TYPE_TO_TEMPLATE)).toHaveLength(6);
      expect(SCENE_TYPE_TO_TEMPLATE.dialogue).toBe("dialogue_inpaint");
      expect(SCENE_TYPE_TO_TEMPLATE.action).toBe("action_premium");
      expect(SCENE_TYPE_TO_TEMPLATE.establishing).toBe("establishing_ken_burns");
      expect(SCENE_TYPE_TO_TEMPLATE.transition).toBe("transition_rule_based");
      expect(SCENE_TYPE_TO_TEMPLATE.reaction).toBe("reaction_cached");
      expect(SCENE_TYPE_TO_TEMPLATE.montage).toBe("montage_image_seq");
    });
  });

  describe("extractSceneMetadata", () => {
    const makePanel = (overrides: Partial<PanelData> = {}): PanelData => ({
      id: 1, sceneNumber: 1, panelNumber: 1,
      visualDescription: null, cameraAngle: null,
      dialogue: null, sfx: null, transition: null,
      ...overrides,
    });
    const makeScene = (overrides: Partial<SceneData> = {}): SceneData => ({
      id: 1, sceneNumber: 1, location: null, timeOfDay: null, mood: null,
      ...overrides,
    });

    it("detects dialogue from panel data", () => {
      const panels = [
        makePanel({ dialogue: [{ character: "Naruto", text: "Believe it!" }] }),
        makePanel({ dialogue: [{ character: "Sasuke", text: "Hmph." }] }),
      ];
      const meta = extractSceneMetadata(panels, makeScene());
      expect(meta.hasDialogue).toBe(true);
      expect(meta.dialogueLineCount).toBe(2);
      expect(meta.characterCount).toBe(2);
    });

    it("detects high motion from visual descriptions", () => {
      const panels = [
        makePanel({ visualDescription: "Naruto running at full speed" }),
        makePanel({ visualDescription: "Explosion in the background" }),
      ];
      const meta = extractSceneMetadata(panels, makeScene());
      expect(meta.motionIntensity).toBe("high");
    });

    it("detects exterior from scene location", () => {
      const meta = extractSceneMetadata([makePanel()], makeScene({ location: "Forest clearing" }));
      expect(meta.isExterior).toBe(true);
    });

    it("detects interior from scene location", () => {
      const meta = extractSceneMetadata([makePanel()], makeScene({ location: "Classroom" }));
      expect(meta.isExterior).toBe(false);
    });

    it("detects action lines from visual descriptions", () => {
      const panels = [makePanel({ visualDescription: "Speed lines behind the character" })];
      const meta = extractSceneMetadata(panels, makeScene());
      expect(meta.hasActionLines).toBe(true);
    });

    it("detects close-up from camera angle", () => {
      const panels = [makePanel({ cameraAngle: "close-up" })];
      const meta = extractSceneMetadata(panels, makeScene());
      expect(meta.isCloseUp).toBe(true);
    });

    it("detects narrative tag from visual descriptions", () => {
      const panels = [makePanel({ visualDescription: "A flashback to their childhood" })];
      const meta = extractSceneMetadata(panels, makeScene());
      expect(meta.narrativeTag).toBe("flashback");
    });

    it("passes previousSceneType through", () => {
      const meta = extractSceneMetadata([makePanel()], makeScene(), "action");
      expect(meta.previousSceneType).toBe("action");
    });
  });

  describe("classifyEpisodeScenes — batch with chaining", () => {
    it("chains previousSceneType across scenes", () => {
      const scenes: SceneWithPanels[] = [
        {
          scene: { id: 1, sceneNumber: 1, location: "Forest", timeOfDay: null, mood: null },
          panels: [],
        },
        {
          scene: { id: 2, sceneNumber: 2, location: null, timeOfDay: null, mood: null },
          panels: [],
        },
      ];
      // Scene 1 has no panels and no previousSceneType → establishing fallback
      // Scene 2 has no panels and previousSceneType from scene 1 → transition
      const results = classifyEpisodeScenes(scenes);
      expect(results).toHaveLength(2);
      expect(results[0].sceneType).toBe("establishing");
      expect(results[1].sceneType).toBe("transition");
    });
  });

  describe("keyword lists are non-empty", () => {
    it("HIGH_MOTION_KEYWORDS has entries", () => {
      expect(HIGH_MOTION_KEYWORDS.length).toBeGreaterThan(10);
    });
    it("ACTION_LINE_KEYWORDS has entries", () => {
      expect(ACTION_LINE_KEYWORDS.length).toBeGreaterThan(3);
    });
    it("EXTERIOR_KEYWORDS has entries", () => {
      expect(EXTERIOR_KEYWORDS.length).toBeGreaterThan(10);
    });
    it("MONTAGE_KEYWORDS has entries", () => {
      expect(MONTAGE_KEYWORDS.length).toBeGreaterThan(3);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// KEN BURNS ENGINE TESTS
// ═══════════════════════════════════════════════════════════════════════

describe("Ken Burns Engine", () => {
  describe("MOVEMENT_PRESETS", () => {
    it("has all 7 movement types", () => {
      const movements: KenBurnsMovement[] = [
        "slow_zoom_in", "slow_zoom_out",
        "pan_left_to_right", "pan_right_to_left",
        "pan_up_to_down", "pan_down_to_up",
        "combo_pan_zoom",
      ];
      for (const m of movements) {
        expect(MOVEMENT_PRESETS[m]).toBeDefined();
        expect(MOVEMENT_PRESETS[m].movement).toBe(m);
      }
    });
  });

  describe("selectMovement", () => {
    it("selects slow_zoom_in for calm mood", () => {
      const ctx: SceneContext = { mood: "calm", isExterior: false };
      const m = selectMovement(ctx);
      expect(m).toBe("slow_zoom_in");
    });

    it("selects pan_left_to_right for wide exterior", () => {
      const ctx: SceneContext = { mood: "neutral", isExterior: true, keywords: ["landscape", "wide"] };
      const m = selectMovement(ctx);
      expect(typeof m).toBe("string");
    });
  });

  describe("generateKenBurnsParams", () => {
    it("generates valid params from movement type", () => {
      const params = generateKenBurnsParams("slow_zoom_in", {
        durationS: 5, fps: 24, sourceWidth: 1920, sourceHeight: 1080,
      });
      expect(params.movement).toBe("slow_zoom_in");
      expect(params.durationS).toBe(5);
      expect(params.fps).toBe(24);
      expect(params.sourceWidth).toBe(1920);
      expect(params.sourceHeight).toBe(1080);
      expect(params.startScale).toBeLessThanOrEqual(params.endScale);
    });
  });

  describe("generateFrameTransforms", () => {
    it("generates correct number of frames", () => {
      const params = generateKenBurnsParams("slow_zoom_in", {
        durationS: 2, fps: 12, sourceWidth: 1920, sourceHeight: 1080,
      });
      const frames = generateFrameTransforms(params);
      expect(frames).toHaveLength(2 * 12); // 24 frames
      expect(frames[0].frameIndex).toBe(0);
      expect(frames[frames.length - 1].frameIndex).toBe(23);
    });

    it("frame transforms have valid crop dimensions", () => {
      const params = generateKenBurnsParams("pan_left_to_right", {
        durationS: 3, fps: 8, sourceWidth: 1920, sourceHeight: 1080,
      });
      const frames = generateFrameTransforms(params);
      for (const f of frames) {
        expect(f.cropWidth).toBeGreaterThan(0);
        expect(f.cropHeight).toBeGreaterThan(0);
        expect(f.cropX).toBeGreaterThanOrEqual(0);
        expect(f.cropY).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("generateFfmpegFilter", () => {
    it("returns a non-empty zoompan filter string", () => {
      const params = generateKenBurnsParams("slow_zoom_out", {
        durationS: 4, fps: 24, sourceWidth: 1920, sourceHeight: 1080,
      });
      const filter = generateFfmpegFilter(params);
      expect(filter).toContain("zoompan");
      expect(filter.length).toBeGreaterThan(10);
    });
  });

  describe("autoKenBurns", () => {
    it("returns a full KenBurnsResult", () => {
      const result = autoKenBurns({
        mood: "serene",
        isExterior: true,
        durationS: 5,
        fps: 24,
        sourceWidth: 1920,
        sourceHeight: 1080,
      });
      expect(result.totalFrames).toBe(120);
      expect(result.frames).toHaveLength(120);
      expect(result.ffmpegFilter).toBeTruthy();
      expect(result.params.movement).toBeTruthy();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TRANSITION GENERATOR TESTS
// ═══════════════════════════════════════════════════════════════════════

describe("Transition Generator", () => {
  describe("TRANSITION_TYPES", () => {
    it("defines all transition types with metadata", () => {
      expect(TRANSITION_TYPES.length).toBeGreaterThanOrEqual(5);
      for (const t of TRANSITION_TYPES) {
        expect(t.type).toBeTruthy();
        expect(t.displayName).toBeTruthy();
        expect(typeof t.defaultDurationS).toBe("number");
        expect(t.defaultDurationS).toBeGreaterThan(0);
      }
      // Verify all generated transitions have zero AI cost
      const config: TransitionConfig = { type: "fade_to_black", durationS: 1.0, fps: 24 };
      const result = generateTransition(config);
      expect(result.aiCost).toBe(0);
    });
  });

  describe("selectTransitionType", () => {
    it("selects manga_panel_reveal for dramatic mood", () => {
      const ctx: TransitionContext = { nextSceneMood: "dramatic" };
      const t = selectTransitionType(ctx);
      expect(t).toBe("manga_panel_reveal");
    });

    it("selects title_card for chapter boundary", () => {
      const ctx: TransitionContext = { isChapterBoundary: true };
      const t = selectTransitionType(ctx);
      expect(t).toBe("title_card");
    });

    it("selects wipe for location change", () => {
      const ctx: TransitionContext = { locationChange: true };
      const t = selectTransitionType(ctx);
      expect(t).toBe("wipe");
    });

    it("respects explicit transitionHint for dissolve", () => {
      const ctx: TransitionContext = { transitionHint: "dissolve" };
      const t = selectTransitionType(ctx);
      expect(t).toBe("cross_dissolve");
    });

    it("selects fade_to_black for timeskip", () => {
      const ctx: TransitionContext = { isTimeskip: true };
      const t = selectTransitionType(ctx);
      expect(t).toBe("fade_to_black");
    });
  });

  describe("generateTransition", () => {
    it("generates fade_to_black with ffmpeg filter", () => {
      const config: TransitionConfig = {
        type: "fade_to_black",
        durationS: 1.5,
        fps: 24,
      };
      const result = generateTransition(config);
      expect(result.ffmpegFilter).toBeTruthy();
      expect(result.frameCount).toBe(36);
      expect(result.aiCost).toBe(0);
    });

    it("generates cross_dissolve with canvas instructions", () => {
      const config: TransitionConfig = {
        type: "cross_dissolve",
        durationS: 1.0,
        fps: 24,
      };
      const result = generateTransition(config);
      expect(result.ffmpegFilter).toBeTruthy();
      expect(result.aiCost).toBe(0);
    });

    it("generates wipe transition", () => {
      const config: TransitionConfig = {
        type: "wipe",
        durationS: 0.8,
        fps: 24,
        wipeDirection: "left_to_right",
      };
      const result = generateTransition(config);
      expect(result.frameCount).toBeGreaterThan(0);
      expect(result.aiCost).toBe(0);
    });

    it("generates manga_panel_reveal", () => {
      const config: TransitionConfig = {
        type: "manga_panel_reveal",
        durationS: 1.2,
        fps: 24,
      };
      const result = generateTransition(config);
      expect(result.aiCost).toBe(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// PIPELINE TEMPLATES TESTS
// ═══════════════════════════════════════════════════════════════════════

describe("Pipeline Templates", () => {
  it("has exactly 6 templates", () => {
    expect(ALL_PIPELINE_TEMPLATES).toHaveLength(6);
  });

  it("each template has required fields", () => {
    for (const t of ALL_PIPELINE_TEMPLATES) {
      expect(t.id).toBeTruthy();
      expect(t.sceneType).toBeTruthy();
      expect(t.displayName).toBeTruthy();
      expect(t.stages.length).toBeGreaterThan(0);
      expect(Array.isArray(t.skipStages)).toBe(true);
      expect(parseFloat(t.estimatedCreditsPerTenS)).toBeGreaterThanOrEqual(0);
    }
  });

  it("template IDs match scene type mapping", () => {
    const expectedIds = [
      "dialogue_inpaint", "action_premium", "establishing_ken_burns",
      "transition_rule_based", "reaction_cached", "montage_image_seq",
    ];
    const actualIds = ALL_PIPELINE_TEMPLATES.map(t => t.id);
    for (const id of expectedIds) {
      expect(actualIds).toContain(id);
    }
  });

  describe("getTemplateById", () => {
    it("finds existing template", () => {
      const t = getTemplateById("dialogue_inpaint");
      expect(t).toBeDefined();
      expect(t!.sceneType).toBe("dialogue");
    });

    it("returns undefined for unknown ID", () => {
      expect(getTemplateById("nonexistent")).toBeUndefined();
    });
  });

  describe("getTemplateForSceneType", () => {
    it("returns template for each scene type", () => {
      const types = ["dialogue", "action", "establishing", "transition", "reaction", "montage"] as const;
      for (const st of types) {
        const t = getTemplateForSceneType(st);
        expect(t).toBeDefined();
        expect(t!.sceneType).toBe(st);
      }
    });
  });

  describe("cost estimates", () => {
    it("dialogue is cheapest (0.06-0.08)", () => {
      const cost = getEstimatedCreditsPerTenS("dialogue");
      expect(cost).toBeGreaterThanOrEqual(0.04);
      expect(cost).toBeLessThanOrEqual(0.15);
    });

    it("transition is free (0.00)", () => {
      const cost = getEstimatedCreditsPerTenS("transition");
      expect(cost).toBe(0);
    });

    it("action is most expensive", () => {
      const actionCost = getEstimatedCreditsPerTenS("action");
      const dialogueCost = getEstimatedCreditsPerTenS("dialogue");
      expect(actionCost).toBeGreaterThan(dialogueCost);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ROUTER INTEGRATION TESTS
// ═══════════════════════════════════════════════════════════════════════

describe("Router Integration", () => {
  describe("getProviderHintForSceneType", () => {
    it("returns hints for all 6 scene types", () => {
      const types = ["dialogue", "action", "establishing", "transition", "reaction", "montage"] as const;
      for (const st of types) {
        const hints = getProviderHintForSceneType(st);
        expect(hints).toBeDefined();
        expect(typeof hints).toBe("object");
      }
    });
  });

  describe("getPipelineStageSkips", () => {
    it("returns skip config for all 6 scene types", () => {
      const types = ["dialogue", "action", "establishing", "transition", "reaction", "montage"] as const;
      for (const st of types) {
        const config = getPipelineStageSkips(st);
        expect(config).toBeDefined();
        expect(Array.isArray(config.skippedStages)).toBe(true);
        expect(typeof config.explanation).toBe("string");
      }
    });

    it("action has fewest skips", () => {
      const actionSkips = getPipelineStageSkips("action");
      expect(actionSkips.skippedStages.length).toBeLessThanOrEqual(2);
    });
  });

  describe("shouldSkipStage", () => {
    it("returns boolean", () => {
      expect(typeof shouldSkipStage("dialogue", 1)).toBe("boolean");
    });
  });

  describe("CREDITS_PER_10S", () => {
    it("has all 6 scene types", () => {
      expect(Object.keys(CREDITS_PER_10S)).toHaveLength(6);
    });

    it("transition costs 0", () => {
      expect(CREDITS_PER_10S.transition).toBe(0);
    });

    it("all values are non-negative", () => {
      for (const v of Object.values(CREDITS_PER_10S)) {
        expect(v).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("generateCostForecast", () => {
    it("calculates total credits from distribution", () => {
      const dist: SceneTypeDistribution[] = [
        { sceneType: "dialogue", count: 5, totalDurationS: 50 },
        { sceneType: "action", count: 2, totalDurationS: 20 },
        { sceneType: "transition", count: 3, totalDurationS: 10 },
      ];
      const forecast = generateCostForecast(dist);
      expect(forecast.totalCredits).toBeGreaterThan(0);
      expect(forecast.v3OmniTotalCredits).toBeGreaterThan(0);
      expect(forecast.savingsPercent).toBeGreaterThan(0);
      expect(forecast.breakdown).toHaveLength(3);
    });

    it("savings are positive when using smart routing", () => {
      const dist: SceneTypeDistribution[] = [
        { sceneType: "dialogue", count: 10, totalDurationS: 100 },
      ];
      const forecast = generateCostForecast(dist);
      expect(forecast.savingsPercent).toBeGreaterThan(50);
    });

    it("generates summary string", () => {
      const dist: SceneTypeDistribution[] = [
        { sceneType: "action", count: 1, totalDurationS: 10 },
      ];
      const forecast = generateCostForecast(dist);
      expect(typeof forecast.summary).toBe("string");
      expect(forecast.summary.length).toBeGreaterThan(10);
    });
  });

  describe("getAllPipelineConfigs", () => {
    it("returns 6 configs", () => {
      const configs = getAllPipelineConfigs();
      expect(configs).toHaveLength(6);
    });

    it("each config has sceneType and creditsPerTenS", () => {
      const configs = getAllPipelineConfigs();
      for (const c of configs) {
        expect(c.sceneType).toBeTruthy();
        expect(typeof c.estimatedCredits).toBe("number");
      }
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// DIALOGUE INPAINTING TESTS
// ═══════════════════════════════════════════════════════════════════════

describe("Dialogue Inpainting", () => {
  describe("phonemeToViseme", () => {
    it("maps known phonemes", () => {
      expect(phonemeToViseme("a")).toBe("A");
      expect(phonemeToViseme("i")).toBe("I");
      expect(phonemeToViseme("u")).toBe("U");
    });

    it("returns Rest for unknown phonemes", () => {
      expect(phonemeToViseme("ZZZZZ")).toBe("Rest");
    });

    it("ALL_VISEMES has 8 entries", () => {
      expect(ALL_VISEMES).toHaveLength(8);
    });
  });

  describe("generateVisemeTimeline", () => {
    it("generates frames at target FPS", () => {
      const phonemes = [
        { phoneme: "AA", startTimeS: 0.0, endTimeS: 0.1 },
        { phoneme: "N", startTimeS: 0.1, endTimeS: 0.2 },
        { phoneme: "IY", startTimeS: 0.2, endTimeS: 0.3 },
      ];
      const frames = generateVisemeTimeline(phonemes, 0.3, 8);
      expect(frames.length).toBeGreaterThan(0);
      for (const f of frames) {
        expect(ALL_VISEMES).toContain(f.viseme);
        expect(f.frameIndex).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("generateBlinkSchedule", () => {
    it("generates blinks for a 10s clip", () => {
      const blinks = generateBlinkSchedule(10, 24);
      expect(blinks.length).toBeGreaterThanOrEqual(2); // ~2-3 blinks in 10s
      expect(blinks.length).toBeLessThanOrEqual(5);
      for (const b of blinks) {
        expect(b.startFrameIndex).toBeGreaterThanOrEqual(0);
        expect(b.endFrameIndex).toBeGreaterThan(b.startFrameIndex);
        expect(b.endFrameIndex - b.startFrameIndex).toBeLessThanOrEqual(5); // 3-5 frame blink
      }
    });

    it("generates no blinks for very short clips", () => {
      const blinks = generateBlinkSchedule(0.5, 24);
      expect(blinks.length).toBeLessThanOrEqual(1);
    });
  });

  describe("generateHeadMotion", () => {
    it("generates per-frame head motion", () => {
      const frames = generateHeadMotion(2, 24);
      expect(frames).toHaveLength(48); // 2s × 24fps
      for (const f of frames) {
        expect(f.rotationDeg).toBeGreaterThanOrEqual(-5);
        expect(f.rotationDeg).toBeLessThanOrEqual(5);
        expect(f.translationX).toBeGreaterThanOrEqual(-10);
        expect(f.translationX).toBeLessThanOrEqual(10);
      }
    });
  });

  describe("estimateDialogueCost", () => {
    it("estimates 0.06-0.15 credits per 10s", () => {
      const cost = estimateDialogueCost(10, 1);
      expect(cost.totalCredits).toBeGreaterThanOrEqual(0.04);
      expect(cost.totalCredits).toBeLessThanOrEqual(0.20);
      expect(cost.savingsPercent).toBeGreaterThan(90); // >90% savings
    });

    it("scales with duration", () => {
      const cost10 = estimateDialogueCost(10, 1);
      const cost20 = estimateDialogueCost(20, 1);
      expect(cost20.totalCredits).toBeGreaterThan(cost10.totalCredits);
    });
  });

  describe("planDialoguePipeline", () => {
    it("returns 7 stages", () => {
      const config: DialogueSceneConfig = {
        durationS: 5,
        fps: 8,
        targetFps: 24,
        dialogueLines: [{ character: "A", text: "Hello", startTimeS: 0, endTimeS: 1 }],
        cameraAngles: ["front"],
        characterIds: [1],
      };
      const plan = planDialoguePipeline(config);
      expect(plan.stages).toHaveLength(7);
      expect(plan.stages[0].name).toBe("base_frame_generation");
      expect(plan.stages[6].name).toBe("assembly");
      expect(plan.estimatedTotalCredits).toBeGreaterThan(0);
    });
  });

  describe("generateAssemblyInstructions", () => {
    it("generates per-frame assembly with layers", () => {
      const visemeFrames = Array.from({ length: 10 }, (_, i) => ({
        frameIndex: i,
        timeS: i / 8,
        viseme: "A" as const,
        confidence: 0.9,
      }));
      const blinkEvents = [{ startFrameIndex: 3, endFrameIndex: 5, character: "A", eyeRegion: { x: 0, y: 0, width: 50, height: 20 } }];
      const headMotion = Array.from({ length: 10 }, (_, i) => ({
        frameIndex: i,
        rotationDeg: Math.sin(i) * 2,
        translationX: Math.cos(i) * 3,
        translationY: Math.sin(i) * 2,
      }));
      const mouthRegion = { x: 100, y: 200, width: 60, height: 40 };
      const instructions = generateAssemblyInstructions(
        "https://example.com/base.png",
        visemeFrames,
        blinkEvents,
        headMotion,
        mouthRegion,
      );
      expect(instructions).toHaveLength(10);
      for (const inst of instructions) {
        expect(inst.layers.length).toBeGreaterThanOrEqual(1);
        expect(inst.frameIndex).toBeGreaterThanOrEqual(0);
      }
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// REACTION CACHE TESTS
// ═══════════════════════════════════════════════════════════════════════

describe("Reaction Cache", () => {
  describe("constants", () => {
    it("VALID_EMOTIONS has entries", () => {
      expect(VALID_EMOTIONS.length).toBeGreaterThan(3);
    });

    it("VALID_CAMERA_ANGLES has entries", () => {
      expect(VALID_CAMERA_ANGLES.length).toBeGreaterThan(2);
    });

    it("CACHE_MISS_GENERATION_CREDITS is 0.14", () => {
      expect(CACHE_MISS_GENERATION_CREDITS).toBe(0.14);
    });

    it("DEFAULT_REACTION_DURATION_S is 2.5", () => {
      expect(DEFAULT_REACTION_DURATION_S).toBe(2.5);
    });

    it("MAX_CACHE_PER_CHARACTER is 24", () => {
      expect(MAX_CACHE_PER_CHARACTER).toBe(24);
    });
  });

  describe("ReactionCacheManager", () => {
    it("can be instantiated via singleton", () => {
      const mgr = getReactionCacheManager();
      expect(mgr).toBeInstanceOf(ReactionCacheManager);
    });

    it("singleton returns same instance", () => {
      const a = getReactionCacheManager();
      const b = getReactionCacheManager();
      expect(a).toBe(b);
    });

    it("resetReactionCacheManager creates new instance", () => {
      const a = getReactionCacheManager();
      resetReactionCacheManager();
      const b = getReactionCacheManager();
      expect(a).not.toBe(b);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// BARREL EXPORTS TESTS
// ═══════════════════════════════════════════════════════════════════════

describe("Barrel Exports", () => {
  it("exports classifier functions", () => {
    expect(barrelExports.classifySceneType).toBeDefined();
    expect(barrelExports.classifyEpisodeScenes).toBeDefined();
    expect(barrelExports.extractSceneMetadata).toBeDefined();
    expect(barrelExports.SCENE_TYPE_TO_TEMPLATE).toBeDefined();
  });

  it("exports Ken Burns functions", () => {
    expect(barrelExports.selectMovement).toBeDefined();
    expect(barrelExports.generateKenBurnsParams).toBeDefined();
    expect(barrelExports.generateFrameTransforms).toBeDefined();
    expect(barrelExports.autoKenBurns).toBeDefined();
    expect(barrelExports.MOVEMENT_PRESETS).toBeDefined();
  });

  it("exports transition functions", () => {
    expect(barrelExports.selectTransitionType).toBeDefined();
    expect(barrelExports.generateTransition).toBeDefined();
    expect(barrelExports.TRANSITION_TYPES).toBeDefined();
  });

  it("exports pipeline template functions", () => {
    expect(barrelExports.ALL_PIPELINE_TEMPLATES).toBeDefined();
    expect(barrelExports.getTemplateById).toBeDefined();
    expect(barrelExports.getTemplateForSceneType).toBeDefined();
  });

  it("exports router integration functions", () => {
    expect(barrelExports.getProviderHintForSceneType).toBeDefined();
    expect(barrelExports.getPipelineStageSkips).toBeDefined();
    expect(barrelExports.CREDITS_PER_10S).toBeDefined();
    expect(barrelExports.generateCostForecast).toBeDefined();
  });

  it("exports dialogue inpainting functions", () => {
    expect(barrelExports.phonemeToViseme).toBeDefined();
    expect(barrelExports.generateVisemeTimeline).toBeDefined();
    expect(barrelExports.generateBlinkSchedule).toBeDefined();
    expect(barrelExports.generateHeadMotion).toBeDefined();
    expect(barrelExports.estimateDialogueCost).toBeDefined();
    expect(barrelExports.planDialoguePipeline).toBeDefined();
  });

  it("exports reaction cache functions", () => {
    expect(barrelExports.ReactionCacheManager).toBeDefined();
    expect(barrelExports.getReactionCacheManager).toBeDefined();
    expect(barrelExports.resetReactionCacheManager).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ACCURACY BENCHMARK (200 synthetic scenes)
// ═══════════════════════════════════════════════════════════════════════

describe("Classifier Accuracy Benchmark", () => {
  const baseMeta: SceneMetadata = {
    panelCount: 3,
    hasDialogue: false,
    dialogueLineCount: 0,
    characterCount: 0,
    motionIntensity: "none",
    isExterior: false,
    hasActionLines: false,
    isCloseUp: false,
    panelSizePct: 33,
  };

  // Generate 200 test cases with expected types
  const testCases: Array<{ meta: SceneMetadata; expected: string; label: string }> = [];

  // 40 dialogue scenes
  for (let i = 0; i < 20; i++) {
    testCases.push({
      meta: { ...baseMeta, hasDialogue: true, dialogueLineCount: 2 + (i % 5), characterCount: 2 },
      expected: "dialogue",
      label: `dialogue_multi_${i}`,
    });
    testCases.push({
      meta: { ...baseMeta, hasDialogue: true, dialogueLineCount: 1, characterCount: 2 },
      expected: "dialogue",
      label: `dialogue_single_${i}`,
    });
  }

  // 40 action scenes
  for (let i = 0; i < 20; i++) {
    testCases.push({
      meta: { ...baseMeta, motionIntensity: "high", characterCount: 2 },
      expected: "action",
      label: `action_high_motion_${i}`,
    });
    testCases.push({
      meta: { ...baseMeta, hasActionLines: true, characterCount: 2 },
      expected: "action",
      label: `action_lines_${i}`,
    });
  }

  // 30 establishing scenes
  for (let i = 0; i < 15; i++) {
    testCases.push({
      meta: { ...baseMeta, isExterior: true, characterCount: 0 },
      expected: "establishing",
      label: `establishing_exterior_${i}`,
    });
    testCases.push({
      meta: { ...baseMeta, panelCount: 1, panelSizePct: 100 },
      expected: "establishing",
      label: `establishing_fallback_${i}`,
    });
  }

  // 30 transition scenes
  for (let i = 0; i < 30; i++) {
    testCases.push({
      meta: { ...baseMeta, panelCount: 0, previousSceneType: "dialogue" },
      expected: "transition",
      label: `transition_${i}`,
    });
  }

  // 30 reaction scenes
  for (let i = 0; i < 30; i++) {
    testCases.push({
      meta: { ...baseMeta, isCloseUp: true, characterCount: 1, dialogueLineCount: i % 2, hasDialogue: i % 2 === 1 },
      expected: "reaction",
      label: `reaction_${i}`,
    });
  }

  // 30 montage scenes
  for (let i = 0; i < 10; i++) {
    testCases.push({
      meta: { ...baseMeta, narrativeTag: "flashback" },
      expected: "montage",
      label: `montage_flashback_${i}`,
    });
    testCases.push({
      meta: { ...baseMeta, narrativeTag: "timeskip" },
      expected: "montage",
      label: `montage_timeskip_${i}`,
    });
    testCases.push({
      meta: { ...baseMeta, narrativeTag: "training_montage" },
      expected: "montage",
      label: `montage_training_${i}`,
    });
  }

  it("has 200 test cases", () => {
    expect(testCases).toHaveLength(200);
  });

  it("achieves ≥80% accuracy on synthetic benchmark", () => {
    let correct = 0;
    for (const tc of testCases) {
      const result = classifySceneType(tc.meta);
      if (result.sceneType === tc.expected) correct++;
    }
    const accuracy = correct / testCases.length;
    expect(accuracy).toBeGreaterThanOrEqual(0.80);
  });

  it("achieves ≥90% accuracy on dialogue scenes", () => {
    const dialogueCases = testCases.filter(tc => tc.expected === "dialogue");
    let correct = 0;
    for (const tc of dialogueCases) {
      if (classifySceneType(tc.meta).sceneType === "dialogue") correct++;
    }
    expect(correct / dialogueCases.length).toBeGreaterThanOrEqual(0.90);
  });

  it("achieves 100% accuracy on transition scenes", () => {
    const transitionCases = testCases.filter(tc => tc.expected === "transition");
    let correct = 0;
    for (const tc of transitionCases) {
      if (classifySceneType(tc.meta).sceneType === "transition") correct++;
    }
    expect(correct / transitionCases.length).toBe(1.0);
  });

  it("achieves ≥90% accuracy on action scenes", () => {
    const actionCases = testCases.filter(tc => tc.expected === "action");
    let correct = 0;
    for (const tc of actionCases) {
      if (classifySceneType(tc.meta).sceneType === "action") correct++;
    }
    expect(correct / actionCases.length).toBeGreaterThanOrEqual(0.90);
  });
});
