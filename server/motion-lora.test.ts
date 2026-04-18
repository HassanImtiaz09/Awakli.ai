/**
 * Motion LoRA Infrastructure Tests (Prompt 24)
 *
 * Covers:
 *   - motion-lora-training.ts: config generators, scene-type weights, fallback resolver, gate evaluator
 *   - motion-lora-evaluation.ts: gate definitions, automated evaluators, report generator, threshold logic
 *   - credit-ledger.ts: motion LoRA cost calculation, metadata builder, constants
 *   - stripe/products.ts: tier gating for motion LoRA
 */

import { describe, expect, it } from "vitest";

// ─── Training Harness Tests ────────────────────────────────────────────

describe("motion-lora-training", () => {
  describe("constants", () => {
    it("exports required constants with correct values", async () => {
      const mod = await import("./motion-lora-training");
      expect(mod.MOTION_LORA_VERSION).toBe("1.0.0");
      expect(mod.MIN_TRAINING_CLIPS).toBe(40);
      expect(mod.MAX_TRAINING_STEPS).toBe(5000);
      expect(mod.DEFAULT_TRAINING_STEPS).toBe(3500);
      expect(mod.MOTION_LORA_WEIGHT_MIN).toBe(0.30);
      expect(mod.MOTION_LORA_WEIGHT_MAX).toBe(0.85);
      expect(mod.MOTION_LORA_WEIGHT_DEFAULT).toBe(0.60);
      expect(mod.FRAME_COUNT_MIN).toBe(16);
      expect(mod.FRAME_COUNT_MAX).toBe(24);
      expect(mod.FRAME_COUNT_DEFAULT).toBe(16);
    });

    it("defines the correct LoRA stack load order", async () => {
      const { LORA_STACK_LOAD_ORDER } = await import("./motion-lora-training");
      expect(LORA_STACK_LOAD_ORDER).toEqual([
        "base",
        "motion_module",
        "style_lora",
        "appearance_lora",
        "motion_lora",
        "scene_lora",
      ]);
    });
  });

  describe("scene-type weight map", () => {
    it("returns correct weight for action-combat", async () => {
      const { getMotionLoraWeight } = await import("./motion-lora-training");
      expect(getMotionLoraWeight("action-combat")).toBe(0.75);
    });

    it("returns correct weight for dialogue-gestured", async () => {
      const { getMotionLoraWeight } = await import("./motion-lora-training");
      expect(getMotionLoraWeight("dialogue-gestured")).toBe(0.55);
    });

    it("returns null for static scene types", async () => {
      const { getMotionLoraWeight } = await import("./motion-lora-training");
      expect(getMotionLoraWeight("dialogue-static")).toBeNull();
      expect(getMotionLoraWeight("establishing-environment")).toBeNull();
      expect(getMotionLoraWeight("transition")).toBeNull();
      expect(getMotionLoraWeight("kinetic")).toBeNull();
    });

    it("returns null for unknown scene types", async () => {
      const { getMotionLoraWeight } = await import("./motion-lora-training");
      expect(getMotionLoraWeight("unknown-type")).toBeNull();
    });

    it("sceneQualifiesForMotionLora returns true for qualifying scenes", async () => {
      const { sceneQualifiesForMotionLora } = await import("./motion-lora-training");
      expect(sceneQualifiesForMotionLora("action-combat")).toBe(true);
      expect(sceneQualifiesForMotionLora("montage")).toBe(true);
      expect(sceneQualifiesForMotionLora("reaction-peak")).toBe(true);
    });

    it("sceneQualifiesForMotionLora returns false for non-qualifying scenes", async () => {
      const { sceneQualifiesForMotionLora } = await import("./motion-lora-training");
      expect(sceneQualifiesForMotionLora("dialogue-static")).toBe(false);
      expect(sceneQualifiesForMotionLora("transition")).toBe(false);
    });
  });

  describe("resolveMotionLora fallback logic", () => {
    it("returns tier_blocked when user tier disallows motion LoRA", async () => {
      const { resolveMotionLora } = await import("./motion-lora-training");
      const result = resolveMotionLora({
        hasMotionLora: true,
        motionLoraPath: "/models/test.safetensors",
        hasAppearanceLora: true,
        hasStyleLora: true,
        sceneType: "action-combat",
        userTierAllowsMotionLora: false,
      });
      expect(result.fallback).toBe("tier_blocked");
    });

    it("returns missing when no motion LoRA but appearance LoRA exists", async () => {
      const { resolveMotionLora } = await import("./motion-lora-training");
      const result = resolveMotionLora({
        hasMotionLora: false,
        hasAppearanceLora: true,
        hasStyleLora: true,
        sceneType: "action-combat",
        userTierAllowsMotionLora: true,
      });
      expect(result.fallback).toBe("missing");
    });

    it("returns no_lora when no motion or appearance LoRA", async () => {
      const { resolveMotionLora } = await import("./motion-lora-training");
      const result = resolveMotionLora({
        hasMotionLora: false,
        hasAppearanceLora: false,
        hasStyleLora: true,
        sceneType: "action-combat",
        userTierAllowsMotionLora: true,
      });
      expect(result.fallback).toBe("no_lora");
    });

    it("returns corrupt when motion LoRA file is corrupt", async () => {
      const { resolveMotionLora } = await import("./motion-lora-training");
      const result = resolveMotionLora({
        hasMotionLora: true,
        motionLoraPath: "/models/corrupt.safetensors",
        motionLoraCorrupt: true,
        hasAppearanceLora: true,
        hasStyleLora: true,
        sceneType: "action-combat",
        userTierAllowsMotionLora: true,
      });
      expect(result.fallback).toBe("corrupt");
    });

    it("returns scene_skip for non-qualifying scene types", async () => {
      const { resolveMotionLora } = await import("./motion-lora-training");
      const result = resolveMotionLora({
        hasMotionLora: true,
        motionLoraPath: "/models/test.safetensors",
        hasAppearanceLora: true,
        hasStyleLora: true,
        sceneType: "dialogue-static",
        userTierAllowsMotionLora: true,
      });
      expect(result.fallback).toBe("scene_skip");
    });

    it("returns applied with correct weight for qualifying scenes", async () => {
      const { resolveMotionLora } = await import("./motion-lora-training");
      const result = resolveMotionLora({
        hasMotionLora: true,
        motionLoraPath: "/models/test.safetensors",
        hasAppearanceLora: true,
        hasStyleLora: true,
        sceneType: "action-combat",
        userTierAllowsMotionLora: true,
      });
      expect(result.fallback).toBe("applied");
      expect(result.motionLoraWeight).toBe(0.75);
      expect(result.motionLoraPath).toBe("/models/test.safetensors");
    });
  });

  describe("evaluateGate (training module)", () => {
    it("evaluates a passing gate correctly", async () => {
      const { evaluateGate } = await import("./motion-lora-training");
      const result = evaluateGate("M1", 0.90);
      expect(result.passed).toBe(true);
      expect(result.gateId).toBe("M1");
      expect(result.value).toBe(0.90);
      expect(result.threshold).toBe(0.85);
    });

    it("evaluates a failing gate correctly", async () => {
      const { evaluateGate } = await import("./motion-lora-training");
      const result = evaluateGate("M1", 0.70);
      expect(result.passed).toBe(false);
    });

    it("handles lower-is-better gates (M3 FID)", async () => {
      const { evaluateGate } = await import("./motion-lora-training");
      // M3 has threshold 50, higherIsBetter: false
      const pass = evaluateGate("M3", 40);
      expect(pass.passed).toBe(true);
      const fail = evaluateGate("M3", 60);
      expect(fail.passed).toBe(false);
    });

    it("throws for unknown gate ID", async () => {
      const { evaluateGate } = await import("./motion-lora-training");
      expect(() => evaluateGate("M99" as any, 0.5)).toThrow("Unknown evaluation gate");
    });
  });

  describe("evaluateAllGates (training module)", () => {
    it("produces correct summary for all-pass scenario", async () => {
      const { evaluateAllGates } = await import("./motion-lora-training");
      const values: Record<string, number> = {
        M1: 0.90, M2: 0.98, M3: 40, M4: 0.85,
        M5: 0.80, M6: 0.10, M7: 0.03, M8: 12,
        M9: 1.5, M10: 8, M11: 35,
        M12: 100, M13: 0.85, M14: 4.0,
      };
      const results = evaluateAllGates(1, "TestChar", "sdxl", "1.0.0", values as any);
      expect(results.overallPass).toBe(true);
      expect(results.criticalFailures).toHaveLength(0);
      expect(results.passCount).toBe(14);
      expect(results.failCount).toBe(0);
    });

    it("marks critical failures when blocking gates fail", async () => {
      const { evaluateAllGates, CRITICAL_GATES } = await import("./motion-lora-training");
      // M1 fails (below 0.85 threshold)
      const values: Record<string, number> = {
        M1: 0.50, M2: 0.98, M3: 40, M4: 0.85,
        M5: 0.80, M6: 0.10, M7: 0.03, M8: 12,
        M9: 1.5, M10: 8, M11: 35,
        M12: 100, M13: 0.85, M14: 4.0,
      };
      const results = evaluateAllGates(1, "TestChar", "sdxl", "1.0.0", values as any);
      expect(results.overallPass).toBe(false);
      expect(results.criticalFailures).toContain("M1");
      expect(CRITICAL_GATES).toContain("M1");
    });
  });

  describe("training config generators", () => {
    it("generateSdxlTrainingConfig produces valid config", async () => {
      const { generateSdxlTrainingConfig, createDefaultTrainingConfig } = await import("./motion-lora-training");
      const base = createDefaultTrainingConfig({
        characterId: 1,
        characterName: "TestHero",
        projectId: 1,
        trainingPath: "sdxl",
        trainingClipUrls: Array(40).fill("https://example.com/clip.mp4"),
        captionUrls: Array(40).fill("https://example.com/cap.txt"),
        baseModelPath: "/models/sdxl.safetensors",
        motionModulePath: "/models/animatediff.safetensors",
      });
      const config = generateSdxlTrainingConfig(base);
      expect(config.pretrained_model_name_or_path).toBe("/models/sdxl.safetensors");
      expect(config.max_train_steps).toBe(3500);
      expect(config.text_encoder_lr).toBe(0);
      expect(config.flip_aug).toBe(false);
      expect(config.network_dim).toBe(64);
      expect(config.network_alpha).toBe(32);
      expect(config._training_path).toBe("sdxl");
    });

    it("generateWanTrainingConfig produces valid config", async () => {
      const { generateWanTrainingConfig, createDefaultTrainingConfig } = await import("./motion-lora-training");
      const base = createDefaultTrainingConfig({
        characterId: 1,
        characterName: "TestHero",
        projectId: 1,
        trainingPath: "wan",
        trainingClipUrls: Array(40).fill("https://example.com/clip.mp4"),
        captionUrls: Array(40).fill("https://example.com/cap.txt"),
        baseModelPath: "/models/wan.safetensors",
        motionModulePath: "/models/temporal.safetensors",
      });
      const config = generateWanTrainingConfig(base);
      expect(config.base_model).toBe("/models/wan.safetensors");
      expect(config.max_steps).toBe(3500);
      expect(config.text_encoder_lr).toBe(0);
      expect(config.flip_augment).toBe(false);
      expect(config.inject_temporal_attention).toBe(true);
      expect(config._training_path).toBe("wan");
    });

    it("rejects SDXL config with wrong training path", async () => {
      const { generateSdxlTrainingConfig, createDefaultTrainingConfig } = await import("./motion-lora-training");
      const base = createDefaultTrainingConfig({
        characterId: 1,
        characterName: "TestHero",
        projectId: 1,
        trainingPath: "wan",
        trainingClipUrls: Array(40).fill("https://example.com/clip.mp4"),
        captionUrls: Array(40).fill("https://example.com/cap.txt"),
        baseModelPath: "/models/wan.safetensors",
        motionModulePath: "/models/temporal.safetensors",
      });
      expect(() => generateSdxlTrainingConfig(base)).toThrow("Config is not for SDXL path");
    });

    it("rejects config with insufficient training clips", async () => {
      const { generateSdxlTrainingConfig, createDefaultTrainingConfig } = await import("./motion-lora-training");
      const base = createDefaultTrainingConfig({
        characterId: 1,
        characterName: "TestHero",
        projectId: 1,
        trainingPath: "sdxl",
        trainingClipUrls: Array(10).fill("https://example.com/clip.mp4"), // < 40
        captionUrls: Array(10).fill("https://example.com/cap.txt"),
        baseModelPath: "/models/sdxl.safetensors",
        motionModulePath: "/models/animatediff.safetensors",
      });
      expect(() => generateSdxlTrainingConfig(base)).toThrow("Need at least 40 training clips");
    });
  });

  describe("gate report generator (training module)", () => {
    it("generates markdown report with correct structure", async () => {
      const { evaluateAllGates, generateGateReport } = await import("./motion-lora-training");
      const values: Record<string, number> = {
        M1: 0.90, M2: 0.98, M3: 40, M4: 0.85,
        M5: 0.80, M6: 0.10, M7: 0.03, M8: 12,
        M9: 1.5, M10: 8, M11: 35,
        M12: 100, M13: 0.85, M14: 4.0,
      };
      const results = evaluateAllGates(1, "TestChar", "sdxl", "1.0.0", values as any);
      const report = generateGateReport(results);
      expect(report).toContain("# Motion LoRA Evaluation Report");
      expect(report).toContain("TestChar");
      expect(report).toContain("SDXL");
      expect(report).toContain("PASS");
      expect(report).toContain("Identity");
      expect(report).toContain("Motion");
      expect(report).toContain("Efficiency");
      expect(report).toContain("Regression");
    });
  });
});

// ─── Evaluation Module Tests ───────────────────────────────────────────

describe("motion-lora-evaluation", () => {
  describe("gate definitions", () => {
    it("defines exactly 14 gates (M1-M14)", async () => {
      const { GATE_DEFINITIONS } = await import("./motion-lora-evaluation");
      expect(GATE_DEFINITIONS).toHaveLength(14);
      const ids = GATE_DEFINITIONS.map((g) => g.id);
      for (let i = 1; i <= 14; i++) {
        expect(ids).toContain(`M${i}`);
      }
    });

    it("GATE_MAP provides lookup by ID", async () => {
      const { GATE_MAP } = await import("./motion-lora-evaluation");
      expect(GATE_MAP.M1.name).toBe("Face Consistency");
      expect(GATE_MAP.M5.name).toBe("Motion-Prompt Alignment");
      expect(GATE_MAP.M14.name).toBe("No Quality Regression - Action");
    });

    it("blocking gates are M1, M2, M3, M5, M6, M9, M12, M13", async () => {
      const { GATE_DEFINITIONS } = await import("./motion-lora-evaluation");
      const blocking = GATE_DEFINITIONS.filter((g) => g.blocking).map((g) => g.id);
      expect(blocking).toContain("M1");
      expect(blocking).toContain("M2");
      expect(blocking).toContain("M3");
      expect(blocking).toContain("M5");
      expect(blocking).toContain("M6");
      expect(blocking).toContain("M9");
      expect(blocking).toContain("M12");
      expect(blocking).toContain("M13");
    });

    it("all gates have valid categories", async () => {
      const { GATE_DEFINITIONS } = await import("./motion-lora-evaluation");
      const validCategories = ["identity_preservation", "motion_quality", "production_efficiency", "regression"];
      for (const gate of GATE_DEFINITIONS) {
        expect(validCategories).toContain(gate.category);
      }
    });

    it("all gates have valid methods", async () => {
      const { GATE_DEFINITIONS } = await import("./motion-lora-evaluation");
      const validMethods = ["automated", "llm_assisted", "manual"];
      for (const gate of GATE_DEFINITIONS) {
        expect(validMethods).toContain(gate.method);
      }
    });

    it("identity gates are M1-M4", async () => {
      const { GATE_DEFINITIONS } = await import("./motion-lora-evaluation");
      const identity = GATE_DEFINITIONS.filter((g) => g.category === "identity_preservation");
      expect(identity).toHaveLength(4);
      expect(identity.map((g) => g.id).sort()).toEqual(["M1", "M2", "M3", "M4"]);
    });

    it("motion gates are M5-M8", async () => {
      const { GATE_DEFINITIONS } = await import("./motion-lora-evaluation");
      const motion = GATE_DEFINITIONS.filter((g) => g.category === "motion_quality");
      expect(motion).toHaveLength(4);
      expect(motion.map((g) => g.id).sort()).toEqual(["M5", "M6", "M7", "M8"]);
    });

    it("efficiency gates are M9-M11", async () => {
      const { GATE_DEFINITIONS } = await import("./motion-lora-evaluation");
      const efficiency = GATE_DEFINITIONS.filter((g) => g.category === "production_efficiency");
      expect(efficiency).toHaveLength(3);
      expect(efficiency.map((g) => g.id).sort()).toEqual(["M10", "M11", "M9"]);
    });

    it("regression gates are M12-M14", async () => {
      const { GATE_DEFINITIONS } = await import("./motion-lora-evaluation");
      const regression = GATE_DEFINITIONS.filter((g) => g.category === "regression");
      expect(regression).toHaveLength(3);
      expect(regression.map((g) => g.id).sort()).toEqual(["M12", "M13", "M14"]);
    });
  });

  describe("evaluateTemporalFlicker (M7 automated)", () => {
    it("returns 1.0 for constant luminance", async () => {
      const { evaluateTemporalFlicker } = await import("./motion-lora-evaluation");
      expect(evaluateTemporalFlicker([100, 100, 100, 100])).toBe(1.0);
    });

    it("returns lower score for flickering luminance", async () => {
      const { evaluateTemporalFlicker } = await import("./motion-lora-evaluation");
      // Delta of 30 per frame, MAX_ACCEPTABLE_DELTA is 30, so score = 0
      const score = evaluateTemporalFlicker([100, 115, 100, 115, 100]);
      expect(score).toBeLessThan(1.0);
      expect(score).toBeGreaterThan(0);
    });

    it("returns 1.0 for single frame", async () => {
      const { evaluateTemporalFlicker } = await import("./motion-lora-evaluation");
      expect(evaluateTemporalFlicker([100])).toBe(1.0);
    });

    it("returns 0 for extreme flicker", async () => {
      const { evaluateTemporalFlicker } = await import("./motion-lora-evaluation");
      // Delta of 50 per frame, max acceptable is 30
      const score = evaluateTemporalFlicker([0, 50, 0, 50]);
      expect(score).toBe(0);
    });
  });

  describe("evaluateRegenRatio (M9 automated)", () => {
    it("returns 1.0 for perfect acceptance", async () => {
      const { evaluateRegenRatio } = await import("./motion-lora-evaluation");
      expect(evaluateRegenRatio(10, 10)).toBe(1.0);
    });

    it("returns 2.0 for 50% acceptance", async () => {
      const { evaluateRegenRatio } = await import("./motion-lora-evaluation");
      expect(evaluateRegenRatio(20, 10)).toBe(2.0);
    });

    it("returns Infinity for zero accepted clips", async () => {
      const { evaluateRegenRatio } = await import("./motion-lora-evaluation");
      expect(evaluateRegenRatio(10, 0)).toBe(Infinity);
    });
  });

  describe("evaluateInferenceOverhead (M10 automated)", () => {
    it("returns 0% for same timing", async () => {
      const { evaluateInferenceOverhead } = await import("./motion-lora-evaluation");
      expect(evaluateInferenceOverhead(1000, 1000)).toBe(0);
    });

    it("returns 10% for 10% slower", async () => {
      const { evaluateInferenceOverhead } = await import("./motion-lora-evaluation");
      expect(evaluateInferenceOverhead(1000, 1100)).toBe(10);
    });

    it("returns negative for faster inference", async () => {
      const { evaluateInferenceOverhead } = await import("./motion-lora-evaluation");
      expect(evaluateInferenceOverhead(1000, 900)).toBe(-10);
    });

    it("returns 0 when base time is 0", async () => {
      const { evaluateInferenceOverhead } = await import("./motion-lora-evaluation");
      expect(evaluateInferenceOverhead(0, 1000)).toBe(0);
    });
  });

  describe("evaluateEffectiveCostReduction (M11 automated)", () => {
    it("returns positive reduction when LoRA reduces regens", async () => {
      const { evaluateEffectiveCostReduction } = await import("./motion-lora-evaluation");
      const result = evaluateEffectiveCostReduction({
        baselineRegenRatio: 3.0,
        loraRegenRatio: 1.5,
        baseCostPerClipUsd: 0.10,
        loraSurchargeMultiplier: 1.15,
        trainingCostUsd: 5.0,
        expectedClipsPerModel: 200,
      });
      expect(result).toBeGreaterThan(0);
    });

    it("returns 0 when baseline cost is 0", async () => {
      const { evaluateEffectiveCostReduction } = await import("./motion-lora-evaluation");
      const result = evaluateEffectiveCostReduction({
        baselineRegenRatio: 0,
        loraRegenRatio: 1.5,
        baseCostPerClipUsd: 0,
        loraSurchargeMultiplier: 1.15,
        trainingCostUsd: 5.0,
        expectedClipsPerModel: 200,
      });
      expect(result).toBe(0);
    });

    it("returns negative when LoRA is more expensive", async () => {
      const { evaluateEffectiveCostReduction } = await import("./motion-lora-evaluation");
      const result = evaluateEffectiveCostReduction({
        baselineRegenRatio: 1.0,
        loraRegenRatio: 1.0,
        baseCostPerClipUsd: 0.10,
        loraSurchargeMultiplier: 1.15,
        trainingCostUsd: 50.0, // Very expensive training
        expectedClipsPerModel: 10, // Very few clips
      });
      expect(result).toBeLessThan(0);
    });
  });

  describe("generateGateReport (evaluation module)", () => {
    it("generates a markdown report with verdict", async () => {
      const mod = await import("./motion-lora-evaluation");
      const report: Parameters<typeof mod.generateGateReport>[0] = {
        trainingJobId: "job-123",
        characterName: "TestHero",
        loraPath: "/models/test.safetensors",
        evaluatedAt: Date.now(),
        gates: [
          {
            gateId: "M1",
            status: "pass",
            score: 0.92,
            threshold: 0.85,
            details: "Face consistency excellent",
            evaluatedAt: Date.now(),
            durationMs: 1000,
          },
        ],
        verdict: "promoted",
        summary: {
          total: 1,
          passed: 1,
          failed: 0,
          warned: 0,
          skipped: 0,
          blockingFailures: 0,
        },
        evaluationCostUsd: 0.02,
      };
      const md = mod.generateGateReport(report);
      expect(md).toContain("# Motion LoRA Evaluation Report");
      expect(md).toContain("TestHero");
      expect(md).toContain("job-123");
      expect(md).toContain("PROMOTED");
      expect(md).toContain("PASS");
    });

    it("includes blocking failure details in blocked report", async () => {
      const mod2 = await import("./motion-lora-evaluation");
      const report: Parameters<typeof mod2.generateGateReport>[0] = {
        trainingJobId: "job-456",
        characterName: "FailChar",
        loraPath: "/models/fail.safetensors",
        evaluatedAt: Date.now(),
        gates: [
          {
            gateId: "M1",
            status: "fail",
            score: 0.50,
            threshold: 0.85,
            details: "Face consistency poor",
            evaluatedAt: Date.now(),
            durationMs: 1000,
          },
        ],
        verdict: "blocked",
        summary: {
          total: 1,
          passed: 0,
          failed: 1,
          warned: 0,
          skipped: 0,
          blockingFailures: 1,
        },
        evaluationCostUsd: 0.02,
      };
      const md = mod2.generateGateReport(report);
      expect(md).toContain("BLOCKED");
      expect(md).toContain("FAIL");
      expect(md).toContain("M1");
      expect(md).toContain("blocking");
    });
  });
});

// ─── Credit Ledger Motion LoRA Tests ───────────────────────────────────

describe("credit-ledger motion LoRA", () => {
  describe("constants", () => {
    it("MOTION_LORA_COST_MULTIPLIER is 1.15 (15% surcharge)", async () => {
      const { MOTION_LORA_COST_MULTIPLIER } = await import("./credit-ledger");
      expect(MOTION_LORA_COST_MULTIPLIER).toBe(1.15);
    });

    it("MOTION_LORA_TRAINING_COST_CREDITS is 8", async () => {
      const { MOTION_LORA_TRAINING_COST_CREDITS } = await import("./credit-ledger");
      expect(MOTION_LORA_TRAINING_COST_CREDITS).toBe(8);
    });
  });

  describe("calculateMotionLoraCost", () => {
    it("returns base cost with no surcharge when motion LoRA inactive", async () => {
      const { calculateMotionLoraCost } = await import("./credit-ledger");
      const result = calculateMotionLoraCost(10, false);
      expect(result.totalCredits).toBe(10);
      expect(result.surchargeCredits).toBe(0);
      expect(result.multiplier).toBe(1.0);
    });

    it("applies 15% surcharge when motion LoRA active", async () => {
      const { calculateMotionLoraCost } = await import("./credit-ledger");
      const result = calculateMotionLoraCost(10, true);
      expect(result.multiplier).toBe(1.15);
      expect(result.surchargeCredits).toBeGreaterThan(0);
      expect(result.totalCredits).toBe(10 + result.surchargeCredits);
    });

    it("surcharge is ceiling-rounded to 2 decimal places", async () => {
      const { calculateMotionLoraCost } = await import("./credit-ledger");
      const result = calculateMotionLoraCost(7, true);
      // 7 * 0.15 = 1.05, ceil(1.05 * 100) / 100 = 1.05
      expect(result.surchargeCredits).toBe(1.05);
      expect(result.totalCredits).toBe(8.05);
    });

    it("handles zero base cost", async () => {
      const { calculateMotionLoraCost } = await import("./credit-ledger");
      const result = calculateMotionLoraCost(0, true);
      expect(result.totalCredits).toBe(0);
      expect(result.surchargeCredits).toBe(0);
    });
  });

  describe("buildMotionLoraMetadata", () => {
    it("builds correct metadata object", async () => {
      const { buildMotionLoraMetadata, MOTION_LORA_COST_MULTIPLIER } = await import("./credit-ledger");
      const meta = buildMotionLoraMetadata("action-combat", 0.75, "/models/test.safetensors", 10);
      expect(meta.motionLoraUsed).toBe(true);
      expect(meta.motionLoraSceneType).toBe("action-combat");
      expect(meta.motionLoraWeight).toBe(0.75);
      expect(meta.motionLoraPath).toBe("/models/test.safetensors");
      expect(meta.motionLoraCostMultiplier).toBe(MOTION_LORA_COST_MULTIPLIER);
      expect(meta.baseCostCredits).toBe(10);
      expect(meta.motionLoraSurchargeCredits).toBeGreaterThan(0);
    });
  });
});

// ─── Tier Gating Tests ─────────────────────────────────────────────────

describe("tier gating for motion LoRA", () => {
  it("free_trial tier has motion LoRA disabled", async () => {
    const { TIERS } = await import("./stripe/products");
    expect(TIERS.free_trial.motionLoraEnabled).toBe(false);
    expect(TIERS.free_trial.maxMotionLoraTrainingsPerMonth).toBe(0);
  });

  it("creator tier has motion LoRA disabled", async () => {
    const { TIERS } = await import("./stripe/products");
    expect(TIERS.creator.motionLoraEnabled).toBe(false);
    expect(TIERS.creator.maxMotionLoraTrainingsPerMonth).toBe(0);
  });

  it("creator_pro tier has motion LoRA enabled with 5 trainings/mo", async () => {
    const { TIERS } = await import("./stripe/products");
    expect(TIERS.creator_pro.motionLoraEnabled).toBe(true);
    expect(TIERS.creator_pro.maxMotionLoraTrainingsPerMonth).toBe(5);
  });

  it("studio tier has motion LoRA enabled with 20 trainings/mo", async () => {
    const { TIERS } = await import("./stripe/products");
    expect(TIERS.studio.motionLoraEnabled).toBe(true);
    expect(TIERS.studio.maxMotionLoraTrainingsPerMonth).toBe(20);
  });

  it("enterprise tier has motion LoRA enabled with 999 trainings/mo", async () => {
    const { TIERS } = await import("./stripe/products");
    expect(TIERS.enterprise.motionLoraEnabled).toBe(true);
    expect(TIERS.enterprise.maxMotionLoraTrainingsPerMonth).toBe(999);
  });

  it("all tiers define motionLoraEnabled field", async () => {
    const { TIERS } = await import("./stripe/products");
    for (const [key, tier] of Object.entries(TIERS)) {
      expect(typeof tier.motionLoraEnabled).toBe("boolean");
      expect(typeof tier.maxMotionLoraTrainingsPerMonth).toBe("number");
    }
  });
});

// ─── Scene-Type Router Motion LoRA Tests ──────────────────────────────

describe("scene-type router motion LoRA hints", () => {
  it("getMotionLoraHint returns required=true for action scenes", async () => {
    const { getMotionLoraHint } = await import("./scene-type-router/router-integration");
    const hint = getMotionLoraHint("action");
    expect(hint.motionLoraRequired).toBe(true);
    expect(hint.motionLoraWeight).toBe(0.75);
  });

  it("getMotionLoraHint returns required=true for dialogue scenes", async () => {
    const { getMotionLoraHint } = await import("./scene-type-router/router-integration");
    const hint = getMotionLoraHint("dialogue");
    expect(hint.motionLoraRequired).toBe(true);
    expect(hint.motionLoraWeight).toBe(0.55);
  });

  it("getMotionLoraHint returns required=true for reaction scenes", async () => {
    const { getMotionLoraHint } = await import("./scene-type-router/router-integration");
    const hint = getMotionLoraHint("reaction");
    expect(hint.motionLoraRequired).toBe(true);
    expect(hint.motionLoraWeight).toBe(0.60);
  });

  it("getMotionLoraHint returns required=true for montage scenes", async () => {
    const { getMotionLoraHint } = await import("./scene-type-router/router-integration");
    const hint = getMotionLoraHint("montage");
    expect(hint.motionLoraRequired).toBe(true);
    expect(hint.motionLoraWeight).toBe(0.65);
  });

  it("getMotionLoraHint returns required=false for establishing scenes", async () => {
    const { getMotionLoraHint } = await import("./scene-type-router/router-integration");
    const hint = getMotionLoraHint("establishing");
    expect(hint.motionLoraRequired).toBe(false);
    expect(hint.motionLoraWeight).toBe(0.0);
  });

  it("getMotionLoraHint returns required=false for transition scenes", async () => {
    const { getMotionLoraHint } = await import("./scene-type-router/router-integration");
    const hint = getMotionLoraHint("transition");
    expect(hint.motionLoraRequired).toBe(false);
    expect(hint.motionLoraWeight).toBe(0.0);
  });

  it("getPipelineExecutionConfig includes motionLoraHint", async () => {
    const { getPipelineExecutionConfig } = await import("./scene-type-router/router-integration");
    const config = getPipelineExecutionConfig("action", 10);
    expect(config.motionLoraHint).toBeDefined();
    expect(config.motionLoraHint.motionLoraRequired).toBe(true);
    expect(config.motionLoraHint.motionLoraWeight).toBe(0.75);
  });

  it("all scene types have motion LoRA hints defined", async () => {
    const { getAllPipelineConfigs } = await import("./scene-type-router/router-integration");
    const configs = getAllPipelineConfigs();
    expect(configs.length).toBe(6);
    for (const config of configs) {
      expect(config.motionLoraHint).toBeDefined();
      expect(typeof config.motionLoraHint.motionLoraRequired).toBe("boolean");
      expect(typeof config.motionLoraHint.motionLoraWeight).toBe("number");
    }
  });

  it("motion LoRA weights are within valid range", async () => {
    const { getAllPipelineConfigs } = await import("./scene-type-router/router-integration");
    const configs = getAllPipelineConfigs();
    for (const config of configs) {
      const w = config.motionLoraHint.motionLoraWeight;
      if (config.motionLoraHint.motionLoraRequired) {
        expect(w).toBeGreaterThanOrEqual(0.30);
        expect(w).toBeLessThanOrEqual(0.85);
      } else {
        expect(w).toBe(0.0);
      }
    }
  });
});
