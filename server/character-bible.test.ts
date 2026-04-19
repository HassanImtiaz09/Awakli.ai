/**
 * P26 Character Bible & Spatial Consistency — Vitest Tests
 *
 * Tests for:
 *   - Character extraction (buildFallbackRegistry, buildRegistryFromLLMOutput, buildAppearanceString)
 *   - Reference sheet (buildReferenceSheetPrompt, buildFaceCropPrompt, hashToSeed)
 *   - Shot planner (planShot, computePlacements, buildRegionalPrompts, buildCharacterBiblePrompt)
 *   - QA gate (scoreToVerdict, deviationToVerdict, checkFaceSimilarity, checkHeightRatio, runSpatialQaCheck)
 *   - LoRA training (resolveIdentityMode, applyIdentityLock, assembleTrainingData, buildTrainingConfig, applyLoraTrainingResult)
 *   - Pipeline orchestrator (initPipelineState, getPipelineState, buildGenerationJobs)
 *   - Types (QUALITY_TIERS, QA_THRESHOLDS)
 */

import { describe, it, expect, beforeEach } from "vitest";
import type {
  CharacterEntry,
  CharacterRegistry,
  ShotPlan,
} from "./character-bible/types";
import { QUALITY_TIERS, QA_THRESHOLDS } from "./character-bible/types";
import {
  buildAppearanceString,
  buildFallbackRegistry,
  buildRegistryFromLLMOutput,
  HEIGHT_DEFAULTS,
} from "./character-bible/extraction";
import {
  buildReferenceSheetPrompt,
  buildFaceCropPrompt,
  hashToSeed,
} from "./character-bible/reference-sheet";
import {
  planShot,
  buildCharacterBiblePrompt,
  computePlacements,
  buildRegionalPrompts,
  CAMERA_CONFIGS,
} from "./character-bible/shot-planner";
import {
  scoreToVerdict,
  deviationToVerdict,
  checkFaceSimilarity,
  checkHeightRatio,
  runSpatialQaCheck,
  createRegenBudget,
  consumeRegenBudget,
} from "./character-bible/qa-gate";
import {
  resolveIdentityMode,
  applyIdentityLock,
  assembleTrainingData,
  buildTrainingConfig,
  applyLoraTrainingResult,
} from "./character-bible/lora-training";
import {
  initPipelineState,
  getPipelineState,
  buildGenerationJobs,
  pipelineStates,
  cleanupPipelineState,
} from "./character-bible/pipeline";

// ─── Test Fixtures ──────────────────────────────────────────────────────

function makeCharacter(overrides: Partial<CharacterEntry> = {}): CharacterEntry {
  return {
    characterId: "char_test001",
    name: "Akira",
    role: "protagonist",
    attributes: {
      heightCm: 170,
      build: "athletic",
      ageBracket: "young_adult",
      hairColor: "black",
      hairStyle: "spiky short",
      eyeColor: "amber",
      skinTone: "fair",
      distinguishingFeatures: ["scar on left cheek", "red headband"],
      defaultOutfit: "school uniform with rolled-up sleeves",
    },
    identity: {
      identityMode: "ip_adapter",
      referenceSheetUrl: "https://example.com/sheet.png",
      ipAdapterRefUrl: "https://example.com/face.png",
      ipAdapterWeight: 0.65,
    },
    inferredFields: ["heightCm", "build"],
    ...overrides,
  };
}

function makeRegistry(overrides: Partial<CharacterRegistry> = {}): CharacterRegistry {
  return {
    characters: [
      makeCharacter(),
      makeCharacter({
        characterId: "char_test002",
        name: "Yuki",
        role: "supporting",
        attributes: {
          heightCm: 160,
          build: "slim",
          ageBracket: "teen",
          hairColor: "silver",
          hairStyle: "long straight",
          eyeColor: "blue",
          skinTone: "pale",
          distinguishingFeatures: ["crystal pendant"],
          defaultOutfit: "white dress",
        },
        identity: { identityMode: "none" },
      }),
    ],
    tallestHeightCm: 170,
    artStyle: "shonen",
    genre: "action",
    ...overrides,
  };
}

// ─── Types Tests ────────────────────────────────────────────────────────

describe("P26 Types & Constants", () => {
  it("QUALITY_TIERS has draft and hero", () => {
    expect(QUALITY_TIERS.draft).toBeDefined();
    expect(QUALITY_TIERS.hero).toBeDefined();
    expect(QUALITY_TIERS.draft.steps).toBeLessThan(QUALITY_TIERS.hero.steps);
  });

  it("QA_THRESHOLDS has correct structure", () => {
    expect(QA_THRESHOLDS.faceSimilarity.pass).toBeGreaterThan(QA_THRESHOLDS.faceSimilarity.softFail);
    expect(QA_THRESHOLDS.heightRatio.pass).toBeLessThan(QA_THRESHOLDS.heightRatio.softFail);
    expect(QA_THRESHOLDS.regenBudgetMultiplier).toBe(3);
  });

  it("HEIGHT_DEFAULTS covers all age brackets", () => {
    expect(HEIGHT_DEFAULTS.child).toBe(130);
    expect(HEIGHT_DEFAULTS.teen).toBe(160);
    expect(HEIGHT_DEFAULTS.young_adult).toBe(170);
    expect(HEIGHT_DEFAULTS.adult).toBe(172);
    expect(HEIGHT_DEFAULTS.elderly).toBe(168);
  });
});

// ─── Extraction Tests ───────────────────────────────────────────────────

describe("P26 Character Extraction", () => {
  it("buildAppearanceString produces a descriptive string", () => {
    const char = makeCharacter();
    const result = buildAppearanceString(char);
    expect(result).toContain("young adult");
    expect(result).toContain("athletic build");
    expect(result).toContain("170cm tall");
    expect(result).toContain("black spiky short hair");
    expect(result).toContain("amber eyes");
    expect(result).toContain("fair skin");
    expect(result).toContain("school uniform");
    expect(result).toContain("scar on left cheek");
  });

  it("buildAppearanceString omits distinguishing features when empty", () => {
    const char = makeCharacter({
      attributes: {
        ...makeCharacter().attributes,
        distinguishingFeatures: [],
      },
    });
    const result = buildAppearanceString(char);
    expect(result).not.toContain("scar");
  });

  it("buildFallbackRegistry creates characters with default attributes", () => {
    const registry = buildFallbackRegistry(["Hero", "Sidekick"], "action", "shonen");
    expect(registry.characters).toHaveLength(2);
    expect(registry.characters[0].name).toBe("Hero");
    expect(registry.characters[0].role).toBe("protagonist");
    expect(registry.characters[0].attributes.heightCm).toBe(170);
    expect(registry.characters[1].name).toBe("Sidekick");
    expect(registry.characters[1].role).toBe("supporting");
    expect(registry.tallestHeightCm).toBeGreaterThanOrEqual(170);
    expect(registry.artStyle).toBe("shonen");
    expect(registry.genre).toBe("action");
  });

  it("buildFallbackRegistry marks all fields as inferred", () => {
    const registry = buildFallbackRegistry(["Solo"], "fantasy", "seinen");
    expect(registry.characters[0].inferredFields).toContain("heightCm");
    expect(registry.characters[0].inferredFields).toContain("build");
    expect(registry.characters[0].inferredFields).toContain("eyeColor");
  });

  it("buildRegistryFromLLMOutput handles valid LLM output", () => {
    const llmChars = [
      {
        name: "Kai",
        role: "protagonist",
        heightCm: 175,
        build: "muscular",
        ageBracket: "adult",
        hairColor: "red",
        hairStyle: "mohawk",
        eyeColor: "green",
        skinTone: "tan",
        distinguishingFeatures: ["dragon tattoo", "missing finger"],
        defaultOutfit: "leather jacket",
        inferredFields: [],
      },
    ];
    const registry = buildRegistryFromLLMOutput(llmChars, "cyberpunk", "seinen");
    expect(registry.characters).toHaveLength(1);
    expect(registry.characters[0].name).toBe("Kai");
    expect(registry.characters[0].attributes.heightCm).toBe(175);
    expect(registry.characters[0].attributes.build).toBe("muscular");
    expect(registry.tallestHeightCm).toBe(175);
  });

  it("buildRegistryFromLLMOutput caps distinguishing features at 5", () => {
    const llmChars = [
      {
        name: "Test",
        role: "supporting",
        heightCm: 165,
        build: "slim",
        ageBracket: "teen",
        hairColor: "blue",
        hairStyle: "short",
        eyeColor: "brown",
        skinTone: "dark",
        distinguishingFeatures: ["a", "b", "c", "d", "e", "f", "g"],
        defaultOutfit: "casual",
        inferredFields: [],
      },
    ];
    const registry = buildRegistryFromLLMOutput(llmChars, "slice_of_life", "shojo");
    expect(registry.characters[0].attributes.distinguishingFeatures).toHaveLength(5);
  });
});

// ─── Reference Sheet Tests ──────────────────────────────────────────────

describe("P26 Reference Sheet", () => {
  it("buildReferenceSheetPrompt includes triple-view turnaround", () => {
    const char = makeCharacter();
    const prompt = buildReferenceSheetPrompt(char, "shonen");
    expect(prompt).toContain("triple-view turnaround");
    expect(prompt).toContain("front view T-pose");
    expect(prompt).toContain("three-quarter relaxed pose");
    expect(prompt).toContain("side view left-facing");
    expect(prompt).toContain("Akira");
    expect(prompt).toContain("shonen manga style");
  });

  it("buildFaceCropPrompt produces a portrait prompt", () => {
    const char = makeCharacter();
    const prompt = buildFaceCropPrompt(char, "shonen");
    expect(prompt).toContain("character portrait");
    expect(prompt).toContain("front-facing headshot");
    expect(prompt).toContain("Akira");
  });

  it("hashToSeed is deterministic", () => {
    const seed1 = hashToSeed("char_abc123shonen");
    const seed2 = hashToSeed("char_abc123shonen");
    expect(seed1).toBe(seed2);
    expect(seed1).toBeGreaterThanOrEqual(0);
    expect(seed1).toBeLessThan(2147483647);
  });

  it("hashToSeed produces different seeds for different inputs", () => {
    const seed1 = hashToSeed("char_abc");
    const seed2 = hashToSeed("char_xyz");
    expect(seed1).not.toBe(seed2);
  });
});

// ─── Shot Planner Tests ─────────────────────────────────────────────────

describe("P26 Shot Planner", () => {
  it("planShot returns empty placements for unknown characters", () => {
    const registry = makeRegistry();
    const plan = planShot(1, 1, 1, "medium", ["Unknown"], registry);
    expect(plan.characterPlacements).toHaveLength(0);
  });

  it("planShot creates placements for known characters", () => {
    const registry = makeRegistry();
    const plan = planShot(1, 1, 1, "wide", ["Akira", "Yuki"], registry);
    expect(plan.characterPlacements).toHaveLength(2);
    expect(plan.characterPlacements[0].characterId).toBe("char_test001");
    expect(plan.characterPlacements[1].characterId).toBe("char_test002");
  });

  it("computePlacements enforces height ratios in wide shots", () => {
    const registry = makeRegistry();
    const chars = registry.characters;
    const camera = CAMERA_CONFIGS["wide"];
    const placements = computePlacements(chars, registry, camera);

    // Akira (170cm) should have scaleFactor 1.0
    expect(placements[0].scaleFactor).toBeCloseTo(1.0, 2);
    // Yuki (160cm) should have scaleFactor ~0.94
    expect(placements[1].scaleFactor).toBeCloseTo(160 / 170, 2);
  });

  it("computePlacements does not enforce height in close-ups", () => {
    const registry = makeRegistry();
    const chars = registry.characters;
    const camera = CAMERA_CONFIGS["close-up"];
    const placements = computePlacements(chars, registry, camera);

    // Both should have scaleFactor 1.0 (no enforcement)
    expect(placements[0].scaleFactor).toBe(1.0);
    expect(placements[1].scaleFactor).toBe(1.0);
  });

  it("buildRegionalPrompts creates bounding boxes for multi-character panels", () => {
    const registry = makeRegistry();
    const chars = registry.characters;
    const placements = computePlacements(chars, registry, CAMERA_CONFIGS["wide"]);
    const regions = buildRegionalPrompts(chars, placements, "shonen");

    expect(regions).toHaveLength(2);
    expect(regions[0].characterId).toBe("char_test001");
    expect(regions[0].bbox.x).toBeGreaterThanOrEqual(0);
    expect(regions[0].bbox.width).toBeGreaterThan(0);
    expect(regions[0].prompt).toContain("Akira");
    expect(regions[1].prompt).toContain("Yuki");
  });

  it("buildCharacterBiblePrompt includes character appearance tags", () => {
    const registry = makeRegistry();
    const panel = {
      visualDescription: "Akira stands on a rooftop facing Yuki",
      dialogue: [
        { character: "Akira", text: "Let's go!", emotion: "determined" },
      ],
    };
    const result = buildCharacterBiblePrompt(panel, registry);
    expect(result.prompt).toContain("[Akira:");
    expect(result.prompt).toContain("athletic build");
    expect(result.referenceUrl).toBe("https://example.com/face.png");
  });

  it("buildCharacterBiblePrompt falls back to protagonist when no characters detected", () => {
    const registry = makeRegistry();
    const panel = { visualDescription: "A dark alley at night" };
    const result = buildCharacterBiblePrompt(panel, registry);
    expect(result.prompt).toContain("[Akira:");
  });

  it("CAMERA_CONFIGS has expected entries", () => {
    expect(CAMERA_CONFIGS["wide"].fullBody).toBe(true);
    expect(CAMERA_CONFIGS["close-up"].enforceHeightRatio).toBe(false);
    expect(CAMERA_CONFIGS["medium"].verticalCrop).toBe(0.6);
  });
});

// ─── QA Gate Tests ──────────────────────────────────────────────────────

describe("P26 QA Gate", () => {
  it("scoreToVerdict returns correct verdicts", () => {
    expect(scoreToVerdict(0.80, 0.75, 0.60)).toBe("pass");
    expect(scoreToVerdict(0.70, 0.75, 0.60)).toBe("soft_fail");
    expect(scoreToVerdict(0.50, 0.75, 0.60)).toBe("hard_fail");
  });

  it("deviationToVerdict returns correct verdicts", () => {
    expect(deviationToVerdict(5)).toBe("pass");
    expect(deviationToVerdict(15)).toBe("soft_fail");
    expect(deviationToVerdict(25)).toBe("hard_fail");
  });

  it("checkFaceSimilarity returns higher scores for LoRA", () => {
    const char = makeCharacter({
      identity: {
        identityMode: "lora",
        loraUrl: "https://example.com/lora.safetensors",
        ipAdapterRefUrl: "https://example.com/face.png",
      },
    });
    const results = checkFaceSimilarity([char], "https://img.png", false, true);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBeGreaterThanOrEqual(0.85);
  });

  it("checkFaceSimilarity returns lower scores without identity lock", () => {
    const char = makeCharacter({
      identity: { identityMode: "none" },
    });
    const results = checkFaceSimilarity([char], "https://img.png", false, false);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBeLessThan(0.85);
  });

  it("checkHeightRatio returns pass for single character", () => {
    const shotPlan: ShotPlan = {
      panelId: 1,
      sceneNumber: 1,
      panelNumber: 1,
      cameraAngle: "wide",
      characterPlacements: [
        { characterId: "char_test001", scaleFactor: 1.0, x: 0.5, y: 0, depthLayer: 0, pose: "standing" },
      ],
    };
    const registry = makeRegistry();
    const results = checkHeightRatio(shotPlan, registry);
    expect(results).toHaveLength(1);
    expect(results[0].deviationPercent).toBe(0);
    expect(results[0].verdict).toBe("pass");
  });

  it("createRegenBudget calculates correct budget", () => {
    const budget = createRegenBudget(1, 5);
    expect(budget.maxRegenAttempts).toBe(15); // 5 * 3
    expect(budget.remaining).toBe(15);
    expect(budget.usedAttempts).toBe(0);
  });

  it("consumeRegenBudget decrements correctly", () => {
    const budget = createRegenBudget(1, 2);
    expect(budget.remaining).toBe(6);
    expect(consumeRegenBudget(budget)).toBe(true);
    expect(budget.remaining).toBe(5);
    expect(budget.usedAttempts).toBe(1);
  });

  it("consumeRegenBudget returns false when exhausted", () => {
    const budget = createRegenBudget(1, 1);
    budget.remaining = 0;
    budget.usedAttempts = 3;
    expect(consumeRegenBudget(budget)).toBe(false);
  });

  it("runSpatialQaCheck produces a full result", () => {
    const registry = makeRegistry();
    const char = registry.characters[0];
    const shotPlan: ShotPlan = {
      panelId: 1,
      sceneNumber: 1,
      panelNumber: 1,
      cameraAngle: "wide",
      characterPlacements: [
        { characterId: char.characterId, scaleFactor: 1.0, x: 0.5, y: 0, depthLayer: 0, pose: "standing" },
      ],
    };
    const result = runSpatialQaCheck(
      1,
      "https://img.png",
      [char],
      shotPlan,
      registry,
      [],
      true,
      false,
    );
    expect(result.panelId).toBe(1);
    expect(result.faceSimilarity).toHaveLength(1);
    expect(result.heightRatio).toHaveLength(1);
    expect(result.styleCoherence.score).toBeGreaterThan(0);
    expect(["pass", "soft_fail", "hard_fail"]).toContain(result.overallVerdict);
    expect(typeof result.shouldRegenerate).toBe("boolean");
  });
});

// ─── LoRA Training Tests ────────────────────────────────────────────────

describe("P26 LoRA Training", () => {
  it("resolveIdentityMode returns lora when available", () => {
    const char = makeCharacter({
      identity: {
        identityMode: "lora",
        loraUrl: "https://example.com/lora.safetensors",
        loraTrainingStatus: "completed",
      },
    });
    expect(resolveIdentityMode(char)).toBe("lora");
  });

  it("resolveIdentityMode returns ip_adapter when lora not ready", () => {
    const char = makeCharacter({
      identity: {
        identityMode: "lora",
        loraUrl: "https://example.com/lora.safetensors",
        loraTrainingStatus: "training",
        ipAdapterRefUrl: "https://example.com/face.png",
      },
    });
    expect(resolveIdentityMode(char)).toBe("ip_adapter");
  });

  it("resolveIdentityMode returns none when no refs", () => {
    const char = makeCharacter({
      identity: { identityMode: "none" },
    });
    expect(resolveIdentityMode(char)).toBe("none");
  });

  it("applyIdentityLock prepends trigger word for lora mode", () => {
    const char = makeCharacter({
      identity: {
        identityMode: "lora",
        loraUrl: "https://example.com/lora.safetensors",
        loraTrainingStatus: "completed",
        loraTriggerWord: "awk_test001",
        loraWeight: 0.7,
      },
    });
    const result = applyIdentityLock(char, "a warrior standing");
    expect(result.prompt).toContain("awk_test001");
    expect(result.loraModelUrl).toBe("https://example.com/lora.safetensors");
    expect(result.loraWeight).toBe(0.7);
  });

  it("applyIdentityLock returns ip_adapter ref for ip_adapter mode", () => {
    const char = makeCharacter();
    const result = applyIdentityLock(char, "a warrior standing");
    expect(result.ipAdapterRefUrl).toBe("https://example.com/face.png");
    expect(result.ipAdapterWeight).toBe(0.65);
    expect(result.prompt).toBe("a warrior standing");
  });

  it("applyIdentityLock returns plain prompt for none mode", () => {
    const char = makeCharacter({ identity: { identityMode: "none" } });
    const result = applyIdentityLock(char, "a warrior standing");
    expect(result.prompt).toBe("a warrior standing");
    expect(result.loraModelUrl).toBeUndefined();
    expect(result.ipAdapterRefUrl).toBeUndefined();
  });

  it("assembleTrainingData collects available images", () => {
    const char = makeCharacter();
    const data = assembleTrainingData(char);
    expect(data.images).toContain("https://example.com/sheet.png");
    expect(data.images).toContain("https://example.com/face.png");
    expect(data.isReady).toBe(false); // Only 2 images, need 8
    expect(data.missingCount).toBe(6);
  });

  it("buildTrainingConfig creates valid config", () => {
    const char = makeCharacter();
    const config = buildTrainingConfig(char, ["img1.png", "img2.png"]);
    expect(config.characterId).toBe("char_test001");
    expect(config.triggerWord).toContain("awk_");
    expect(config.steps).toBe(1200);
    expect(config.learningRate).toBe(1e-4);
  });

  it("applyLoraTrainingResult updates identity on success", () => {
    const char = makeCharacter();
    const result = applyLoraTrainingResult(char, {
      loraUrl: "https://example.com/trained.safetensors",
      triggerWord: "awk_test001",
      trainingSteps: 1200,
      status: "completed",
    });
    expect(result.identity.identityMode).toBe("lora");
    expect(result.identity.loraUrl).toBe("https://example.com/trained.safetensors");
    expect(result.identity.loraTrainingStatus).toBe("completed");
  });

  it("applyLoraTrainingResult marks failed on failure", () => {
    const char = makeCharacter();
    const result = applyLoraTrainingResult(char, {
      loraUrl: "",
      triggerWord: "",
      trainingSteps: 0,
      status: "failed",
      errorMessage: "GPU OOM",
    });
    expect(result.identity.loraTrainingStatus).toBe("failed");
    expect(result.identity.identityMode).not.toBe("lora");
  });
});

// ─── Pipeline Orchestrator Tests ────────────────────────────────────────

describe("P26 Pipeline Orchestrator", () => {
  beforeEach(() => {
    pipelineStates.clear();
  });

  it("initPipelineState creates a valid state", () => {
    const state = initPipelineState(999);
    expect(state.stage1_extraction).toBe("pending");
    expect(state.stage2_identity).toBe("pending");
    expect(state.stage3_shotPlan).toBe("pending");
    expect(state.stage4_generation).toBe("pending");
    expect(state.stage5_qa).toBe("pending");
    expect(state.registryVersion).toBe(0);
  });

  it("getPipelineState returns stored state", () => {
    initPipelineState(888);
    const state = getPipelineState(888);
    expect(state).toBeDefined();
    expect(state?.stage1_extraction).toBe("pending");
  });

  it("getPipelineState returns undefined for unknown project", () => {
    expect(getPipelineState(777)).toBeUndefined();
  });

  it("cleanupPipelineState removes state", () => {
    initPipelineState(666);
    expect(getPipelineState(666)).toBeDefined();
    cleanupPipelineState(666);
    expect(getPipelineState(666)).toBeUndefined();
  });

  it("buildGenerationJobs creates jobs with character info", () => {
    const registry = makeRegistry();
    const panels = [
      {
        id: 1,
        episodeId: 10,
        projectId: 100,
        sceneNumber: 1,
        panelNumber: 1,
        cameraAngle: "wide",
        visualDescription: "Akira faces Yuki in the courtyard",
        dialogue: [
          { character: "Akira", text: "Ready?", emotion: "excited" },
        ],
      },
    ];
    const shotPlans: ShotPlan[] = [
      {
        panelId: 1,
        sceneNumber: 1,
        panelNumber: 1,
        cameraAngle: "wide",
        characterPlacements: [
          { characterId: "char_test001", scaleFactor: 1.0, x: 0.5, y: 0, depthLayer: 0, pose: "standing" },
        ],
      },
    ];

    const jobs = buildGenerationJobs(panels, registry, shotPlans, "draft");
    expect(jobs).toHaveLength(1);
    expect(jobs[0].panelId).toBe(1);
    expect(jobs[0].qualityTier.name).toBe("draft");
    expect(jobs[0].characters).toHaveLength(1);
    expect(jobs[0].characters[0].name).toBe("Akira");
    expect(jobs[0].characterRefUrl).toBe("https://example.com/face.png");
  });

  it("buildGenerationJobs uses hero tier when specified", () => {
    const registry = makeRegistry();
    const panels = [
      {
        id: 1,
        episodeId: 10,
        projectId: 100,
        sceneNumber: 1,
        panelNumber: 1,
        cameraAngle: "medium",
        dialogue: [],
      },
    ];
    const jobs = buildGenerationJobs(panels, registry, [], "hero");
    expect(jobs[0].qualityTier.name).toBe("hero");
    expect(jobs[0].qualityTier.steps).toBeGreaterThan(QUALITY_TIERS.draft.steps);
  });
});
