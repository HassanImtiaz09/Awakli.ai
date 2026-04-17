/**
 * Prompt 22 — Lineart Extraction & ControlNet Conditioning Pipeline Tests
 *
 * Covers: lineart-extraction, controlnet-conditioning, lineart-batch, structural-fidelity
 */

import { describe, it, expect } from "vitest";

import {
  runExtractionPipeline,
  type ExtractionMethod,
  type TargetResolution,
} from "./lineart-extraction";

import {
  SCENE_TYPE_DEFAULTS,
  ALL_SCENE_TYPES,
  buildConditionedPayload,
  buildTestImageRequest,
  simulateTestImageResult,
  getStrengthLabel,
  getStrengthDescription,
  clampStrength,
  MODE_DESCRIPTIONS,
  STRENGTH_RANGES,
  INTEGRATION_RULES,
  type SceneType,
  type ControlnetMode,
} from "./controlnet-conditioning";

import {
  buildBatchJobSpec,
  simulateBatchExecution,
  formatBatchDuration,
  getBatchMethodSummary,
  type BatchExtractionMethod,
  type BatchPanelInput,
} from "./lineart-batch";

import {
  measureFidelity,
  measureBatchFidelity,
} from "./structural-fidelity";

// ─── Lineart Extraction ────────────────────────────────────────────────

describe("runExtractionPipeline", () => {
  it("returns a valid result for canny method", () => {
    const result = runExtractionPipeline(
      "https://example.com/panel.png", 0, "canny"
    );
    expect(result.method).toBe("canny");
    expect(result.storageUrl).toContain("lineart/");
    expect(result.resolutionW).toBeGreaterThan(0);
    expect(result.resolutionH).toBeGreaterThan(0);
    expect(result.snrDb).toBeGreaterThan(0);
    expect(result.stages).toBeDefined();
  });

  it("returns a valid result for anime2sketch method", () => {
    const result = runExtractionPipeline(
      "https://example.com/panel.png", 5, "anime2sketch"
    );
    expect(result.method).toBe("anime2sketch");
    expect(result.storageUrl).toContain("lineart/");
    expect(result.snrDb).toBeGreaterThan(0);
  });

  it("respects target resolution parameter", () => {
    const result = runExtractionPipeline(
      "https://example.com/panel.png", 0, "canny",
      undefined, undefined, undefined, 768 as TargetResolution
    );
    expect(result.resolutionW).toBeGreaterThanOrEqual(512);
    expect(result.resolutionW).toBeLessThanOrEqual(1024);
  });

  it("includes 5 pipeline stages", () => {
    const result = runExtractionPipeline(
      "https://example.com/panel.png", 0, "canny"
    );
    const stages = result.stages;
    expect(stages.panelIsolation).toBeDefined();
    expect(stages.textRemoval).toBeDefined();
    expect(stages.lineartExtraction).toBeDefined();
    expect(stages.lineCleanup).toBeDefined();
    expect(stages.resolutionMatch).toBeDefined();
  });

  it("canny method is faster than anime2sketch", () => {
    const cannyResult = runExtractionPipeline(
      "https://example.com/panel.png", 0, "canny"
    );
    const a2sResult = runExtractionPipeline(
      "https://example.com/panel.png", 0, "anime2sketch"
    );
    expect(cannyResult.totalProcessingTimeMs).toBeLessThan(a2sResult.totalProcessingTimeMs);
  });

  it("canny method has zero cost", () => {
    const result = runExtractionPipeline(
      "https://example.com/panel.png", 0, "canny"
    );
    expect(result.totalCostUsd).toBe(0);
  });

  it("anime2sketch method has non-zero cost", () => {
    const result = runExtractionPipeline(
      "https://example.com/panel.png", 0, "anime2sketch"
    );
    expect(result.totalCostUsd).toBeGreaterThan(0);
  });

  it("includes source panel URL in result", () => {
    const url = "https://example.com/panel-42.png";
    const result = runExtractionPipeline(url, 42, "canny");
    expect(result.sourcePanelUrl).toBe(url);
  });

  it("handles page dimensions for panel isolation", () => {
    const result = runExtractionPipeline(
      "https://example.com/panel.png", 0, "canny",
      1200, 1800, 6
    );
    expect(result.stages.panelIsolation).toBeDefined();
    expect(result.stages.panelIsolation.cropRegion).toBeDefined();
  });
});

// ─── ControlNet Conditioning ───────────────────────────────────────────

describe("SCENE_TYPE_DEFAULTS", () => {
  it("has defaults for all 6 scene types", () => {
    expect(Object.keys(SCENE_TYPE_DEFAULTS)).toHaveLength(6);
    for (const st of ALL_SCENE_TYPES) {
      expect(SCENE_TYPE_DEFAULTS[st]).toBeDefined();
      expect(SCENE_TYPE_DEFAULTS[st].sceneType).toBe(st);
    }
  });

  it("dialogue scenes use moderate strength", () => {
    const d = SCENE_TYPE_DEFAULTS.dialogue;
    expect(d.conditioningStrength).toBeGreaterThanOrEqual(0.3);
    expect(d.conditioningStrength).toBeLessThanOrEqual(0.6);
  });

  it("action scenes use lineart_anime mode", () => {
    const a = SCENE_TYPE_DEFAULTS.action;
    expect(a.controlnetMode).toBe("lineart_anime");
  });

  it("all defaults have valid extraction methods", () => {
    for (const st of ALL_SCENE_TYPES) {
      expect(["canny", "anime2sketch"]).toContain(SCENE_TYPE_DEFAULTS[st].extractionMethod);
    }
  });
});

describe("getStrengthLabel", () => {
  it("returns 'Minimal' for very low values", () => {
    expect(getStrengthLabel(0.2)).toBe("Minimal");
  });

  it("returns 'Loose' for low-mid values", () => {
    expect(getStrengthLabel(0.4)).toBe("Loose");
  });

  it("returns 'Moderate' for mid values", () => {
    expect(getStrengthLabel(0.6)).toBe("Moderate");
  });

  it("returns 'Tight' for high values", () => {
    expect(getStrengthLabel(0.75)).toBe("Tight");
  });

  it("returns 'Strict' for very high values", () => {
    expect(getStrengthLabel(0.9)).toBe("Strict");
  });
});

describe("clampStrength", () => {
  it("clamps below 0 to 0", () => {
    expect(clampStrength(-0.5)).toBe(0);
  });

  it("clamps above 1 to 1", () => {
    expect(clampStrength(1.5)).toBe(1);
  });

  it("passes through valid values with 0.05 step rounding", () => {
    expect(clampStrength(0.55)).toBe(0.55);
  });
});

describe("buildConditionedPayload", () => {
  it("builds a valid payload from a config", () => {
    const payload = buildConditionedPayload(
      "https://example.com/lineart.png",
      SCENE_TYPE_DEFAULTS.dialogue
    );
    expect(payload.controlImageUrl).toBe("https://example.com/lineart.png");
    expect(payload.controlType).toBe("lineart_anime");
    expect(payload.controlStrength).toBe(0.5);
    expect(payload.guidanceStart).toBeGreaterThanOrEqual(0);
    expect(payload.guidanceEnd).toBeLessThanOrEqual(1);
  });

  it("includes LoRA co-injection fields when provided", () => {
    const payload = buildConditionedPayload(
      "https://example.com/lineart.png",
      SCENE_TYPE_DEFAULTS.action,
      {
        modelUrl: "https://example.com/lora.safetensors",
        strength: 0.8,
        triggerWord: "character_name",
      }
    );
    expect(payload.loraModelUrl).toBe("https://example.com/lora.safetensors");
    expect(payload.loraStrength).toBe(0.8);
    expect(payload.loraTriggerWord).toBe("character_name");
  });
});

describe("buildTestImageRequest", () => {
  it("builds a valid test image request", () => {
    const config = SCENE_TYPE_DEFAULTS.dialogue;
    const req = buildTestImageRequest(
      "https://example.com/control.png",
      config,
      "anime girl in classroom"
    );
    expect(req.controlImageUrl).toBe("https://example.com/control.png");
    expect(req.controlType).toBe("lineart_anime");
    expect(req.controlStrength).toBe(0.5);
    expect(req.prompt).toBe("anime girl in classroom");
    expect(req.width).toBe(512);
    expect(req.height).toBe(512);
    expect(req.steps).toBe(20);
  });
});

describe("simulateTestImageResult", () => {
  it("returns a valid test image result", () => {
    const config = SCENE_TYPE_DEFAULTS.dialogue;
    const req = buildTestImageRequest(
      "https://example.com/control.png", config, "test prompt"
    );
    const result = simulateTestImageResult(req);
    expect(result.imageUrl).toContain("test-gen/");
    expect(result.generationTimeMs).toBeGreaterThan(0);
    expect(result.costCredits).toBeGreaterThan(0);
    expect(result.seed).toBeDefined();
    expect(result.controlType).toBe("lineart_anime");
    expect(result.controlStrength).toBe(0.5);
  });

  it("respects provided seed", () => {
    const config = SCENE_TYPE_DEFAULTS.action;
    const req = buildTestImageRequest(
      "https://example.com/control.png", config, "test prompt", 12345
    );
    const result = simulateTestImageResult(req);
    expect(result.seed).toBe(12345);
  });
});

describe("MODE_DESCRIPTIONS", () => {
  it("has descriptions for all 4 modes", () => {
    expect(MODE_DESCRIPTIONS.canny).toBeDefined();
    expect(MODE_DESCRIPTIONS.lineart).toBeDefined();
    expect(MODE_DESCRIPTIONS.lineart_anime).toBeDefined();
    expect(MODE_DESCRIPTIONS.depth).toBeDefined();
  });
});

describe("INTEGRATION_RULES", () => {
  it("has rules for all 6 scene types", () => {
    for (const st of ALL_SCENE_TYPES) {
      expect(INTEGRATION_RULES[st]).toBeDefined();
      expect(INTEGRATION_RULES[st].sceneType).toBe(st);
      expect(typeof INTEGRATION_RULES[st].lineartUsage).toBe("string");
      expect(typeof INTEGRATION_RULES[st].controlnetOnInpainting).toBe("boolean");
      expect(typeof INTEGRATION_RULES[st].keyframeOnly).toBe("boolean");
      expect(typeof INTEGRATION_RULES[st].notes).toBe("string");
    }
  });

  it("action scenes use keyframe-only mode", () => {
    expect(INTEGRATION_RULES.action.keyframeOnly).toBe(true);
  });

  it("dialogue scenes do not use ControlNet on inpainting", () => {
    expect(INTEGRATION_RULES.dialogue.controlnetOnInpainting).toBe(false);
  });
});

// ─── Batch Processing ──────────────────────────────────────────────────

describe("buildBatchJobSpec", () => {
  const panels: BatchPanelInput[] = [
    { panelIndex: 0, sourcePanelUrl: "https://example.com/p0.png", sceneType: "dialogue" },
    { panelIndex: 1, sourcePanelUrl: "https://example.com/p1.png", sceneType: "action" },
    { panelIndex: 2, sourcePanelUrl: "https://example.com/p2.png", sceneType: "establishing" },
  ];

  it("builds a valid batch spec", () => {
    const spec = buildBatchJobSpec(1, panels, "mixed");
    expect(spec.episodeId).toBe(1);
    expect(spec.totalPanels).toBe(3);
    expect(spec.panels).toHaveLength(3);
  });

  it("mixed method assigns canny to action/establishing and anime2sketch to dialogue", () => {
    const spec = buildBatchJobSpec(1, panels, "mixed");
    const dialoguePanel = spec.panels.find(p => p.panelIndex === 0);
    const actionPanel = spec.panels.find(p => p.panelIndex === 1);
    expect(dialoguePanel?.method).toBe("anime2sketch");
    expect(actionPanel?.method).toBe("canny");
  });

  it("all-canny method assigns canny to all panels", () => {
    const spec = buildBatchJobSpec(1, panels, "canny");
    for (const p of spec.panels) {
      expect(p.method).toBe("canny");
    }
  });

  it("all-anime2sketch method assigns anime2sketch to all panels", () => {
    const spec = buildBatchJobSpec(1, panels, "anime2sketch");
    for (const p of spec.panels) {
      expect(p.method).toBe("anime2sketch");
    }
  });

  it("estimates cost correctly", () => {
    const cannySpec = buildBatchJobSpec(1, panels, "canny");
    const a2sSpec = buildBatchJobSpec(1, panels, "anime2sketch");
    expect(cannySpec.estimatedCostUsd).toBe(0);
    expect(a2sSpec.estimatedCostUsd).toBeGreaterThan(0);
  });
});

describe("simulateBatchExecution", () => {
  const panels: BatchPanelInput[] = [
    { panelIndex: 0, sourcePanelUrl: "https://example.com/p0.png" },
    { panelIndex: 1, sourcePanelUrl: "https://example.com/p1.png" },
  ];

  it("returns a valid batch progress", () => {
    const spec = buildBatchJobSpec(1, panels, "canny");
    const progress = simulateBatchExecution(spec);
    expect(progress.totalPanels).toBe(2);
    expect(progress.completedPanels + progress.failedPanels).toBe(2);
    expect(progress.status).toBeDefined();
  });

  it("completed panels have results", () => {
    const spec = buildBatchJobSpec(1, panels, "canny");
    const progress = simulateBatchExecution(spec);
    const completed = progress.results.filter(r => r.status === "completed");
    for (const r of completed) {
      expect(r.result).toBeDefined();
    }
  });
});

describe("formatBatchDuration", () => {
  it("formats milliseconds to human-readable string", () => {
    const result = formatBatchDuration(5000);
    expect(result).toContain("s");
  });

  it("handles zero", () => {
    const result = formatBatchDuration(0);
    expect(result).toBeDefined();
  });
});

describe("getBatchMethodSummary", () => {
  it("returns a summary with description", () => {
    const panels: BatchPanelInput[] = [
      { panelIndex: 0, sourcePanelUrl: "url" },
    ];
    const spec = buildBatchJobSpec(1, panels, "canny");
    const summary = getBatchMethodSummary(spec.panels);
    expect(summary.description).toBeDefined();
    expect(typeof summary.description).toBe("string");
  });
});

// ─── Structural Fidelity ───────────────────────────────────────────────

describe("measureFidelity", () => {
  it("returns a valid fidelity result", () => {
    const result = measureFidelity(0, 0.55, "lineart_anime", 0.12);
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
    expect(["pass", "review", "fail"]).toContain(result.overallGrade);
  });

  it("includes SSIM metrics", () => {
    const result = measureFidelity(0, 0.55, "lineart_anime", 0.12);
    expect(result.ssim).toBeDefined();
    expect(result.ssim.score).toBeGreaterThanOrEqual(0);
    expect(result.ssim.score).toBeLessThanOrEqual(1);
    expect(["pass", "review", "fail"]).toContain(result.ssim.grade);
  });

  it("includes edge overlap metrics", () => {
    const result = measureFidelity(0, 0.55, "lineart_anime", 0.12);
    expect(result.edgeOverlap).toBeDefined();
    expect(result.edgeOverlap.overlapPercent).toBeGreaterThanOrEqual(0);
    expect(result.edgeOverlap.overlapPercent).toBeLessThanOrEqual(100);
    expect(result.edgeOverlap.totalLineartPixels).toBeGreaterThan(0);
    expect(result.edgeOverlap.matchingPixels).toBeGreaterThanOrEqual(0);
  });

  it("includes SSIM improvement metrics", () => {
    const result = measureFidelity(0, 0.55, "lineart_anime", 0.12);
    expect(result.ssimImprovement).toBeDefined();
    expect(result.ssimImprovement.conditionedSSIM).toBeGreaterThanOrEqual(0);
    expect(result.ssimImprovement.unconditionedSSIM).toBeGreaterThanOrEqual(0);
    expect(result.ssimImprovement.improvement).toBeGreaterThanOrEqual(0);
  });

  it("includes a recommendation string", () => {
    const result = measureFidelity(0, 0.55, "lineart_anime", 0.12);
    expect(typeof result.recommendation).toBe("string");
    expect(result.recommendation.length).toBeGreaterThan(0);
  });

  it("higher strength tends to produce higher fidelity scores", () => {
    const lowStrength = measureFidelity(0, 0.2, "lineart_anime", 0.12);
    const highStrength = measureFidelity(0, 0.8, "lineart_anime", 0.12);
    expect(highStrength.overallScore).toBeGreaterThanOrEqual(lowStrength.overallScore - 15);
  });
});

describe("measureBatchFidelity", () => {
  it("returns a batch fidelity report for multiple panels", () => {
    const panels = [
      { panelIndex: 0, conditioningStrength: 0.5, controlnetMode: "lineart_anime" as const, edgeDensity: 0.1 },
      { panelIndex: 1, conditioningStrength: 0.6, controlnetMode: "canny" as const, edgeDensity: 0.15 },
    ];
    const report = measureBatchFidelity(panels);
    expect(report.totalPanels).toBe(2);
    expect(report.passCount + report.reviewCount + report.failCount).toBe(2);
    expect(report.avgSSIM).toBeGreaterThanOrEqual(0);
    expect(report.avgEdgeOverlap).toBeGreaterThanOrEqual(0);
  });

  it("handles empty input", () => {
    const report = measureBatchFidelity([]);
    expect(report.totalPanels).toBe(0);
    expect(report.passCount).toBe(0);
  });
});
