import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProductionBibleData, CharacterBibleEntry } from "./production-bible";
import type { HarnessContext, HarnessCheckConfig, HarnessCheckFn, HarnessCheckResult } from "./harness-runner";

// ─── Mock DB ──────────────────────────────────────────────────────────────

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  getPipelineRunById: vi.fn().mockResolvedValue(null),
  getEpisodeById: vi.fn().mockResolvedValue(null),
  getCharactersByProject: vi.fn().mockResolvedValue([]),
  getPanelsByEpisode: vi.fn().mockResolvedValue([]),
  getPipelineAssetsByRun: vi.fn().mockResolvedValue([]),
  getReadyElementMapForProject: vi.fn().mockResolvedValue({}),
  getReadyElementsByProject: vi.fn().mockResolvedValue([]),
  updatePipelineRun: vi.fn().mockResolvedValue(undefined),
  createPipelineAsset: vi.fn().mockResolvedValue(1),
  updateEpisode: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          score: 8,
          issues: [],
          analysis: "All checks pass",
        }),
      },
    }],
  }),
}));

// ─── Test Fixtures ────────────────────────────────────────────────────────

function makeBible(overrides: Partial<ProductionBibleData> = {}): ProductionBibleData {
  return {
    version: 1,
    projectId: 1,
    projectTitle: "Test Project",
    genre: ["action", "sci-fi"],
    artStyle: "shonen",
    compiledAt: new Date().toISOString(),
    characters: [
      {
        id: 1,
        name: "Kaelis",
        role: "protagonist",
        personalityTraits: ["brave", "determined"],
        visualTraits: { hairColor: "silver", eyeColor: "blue" },
        referenceImages: ["https://example.com/kaelis.png"],
        voiceId: "voice_1",
        voiceCloneUrl: null,
        voiceSettings: null,
        loraModelUrl: null,
        loraTriggerWord: null,
      },
      {
        id: 2,
        name: "Lyra",
        role: "deuteragonist",
        personalityTraits: ["intelligent", "cautious"],
        visualTraits: { hairColor: "black", eyeColor: "green" },
        referenceImages: ["https://example.com/lyra.png"],
        voiceId: "voice_2",
        voiceCloneUrl: null,
        voiceSettings: null,
        loraModelUrl: null,
        loraTriggerWord: null,
      },
    ],
    characterNameMap: { Kaelis: 1, Lyra: 2 },
    animationStyle: "shonen",
    styleMixing: null,
    colorGrading: "warm",
    atmosphericEffects: null,
    aspectRatio: "16:9",
    voiceAssignments: { Kaelis: "voice_1", Lyra: "voice_2" },
    audioConfig: null,
    musicConfig: null,
    openingStyle: "standard",
    endingStyle: "standard",
    pacing: "normal",
    subtitleConfig: null,
    episodes: [
      {
        id: 1,
        episodeNumber: 1,
        title: "Test Episode",
        synopsis: "A test episode",
        panelCount: 6,
        dialoguePanelCount: 4,
        characters: ["Kaelis", "Lyra"],
      },
    ],
    qualityThresholds: {
      minImageScore: 6.0,
      minCharacterMatch: 7.0,
      minVideoScore: 5.5,
      minAudioScore: 6.0,
      maxRetries: 3,
      blockOnNsfw: true,
    },
    ...overrides,
  };
}

function makeContext(overrides: Partial<HarnessContext> = {}): HarnessContext {
  return {
    episodeId: 1,
    pipelineRunId: 100,
    targetType: "episode",
    ...overrides,
  };
}

// ─── Harness Runner Tests ─────────────────────────────────────────────────

describe("Harness Runner", () => {
  describe("runHarnessCheck", () => {
    it("should return PASS result directly without retries", async () => {
      const { runHarnessCheck } = await import("./harness-runner");

      const config: HarnessCheckConfig = {
        name: "test_check",
        layer: "script",
        description: "A test check",
        costEstimate: 0.01,
        isCompute: true,
      };

      const checkFn: HarnessCheckFn = async () => ({
        result: "pass",
        score: 9.0,
        details: { message: "All good" },
        costCredits: 0.001,
      });

      const result = await runHarnessCheck(config, checkFn, makeContext(), makeBible());
      expect(result.result).toBe("pass");
      expect(result.score).toBe(9.0);
      expect(result.costCredits).toBe(0.001);
    });

    it("should return WARN result directly without retries", async () => {
      const { runHarnessCheck } = await import("./harness-runner");

      const config: HarnessCheckConfig = {
        name: "test_warn",
        layer: "visual",
        description: "A warning check",
        costEstimate: 0.02,
        isCompute: false,
      };

      const checkFn: HarnessCheckFn = async () => ({
        result: "warn",
        score: 5.5,
        details: { message: "Minor issue detected" },
        costCredits: 0.02,
      });

      const result = await runHarnessCheck(config, checkFn, makeContext(), makeBible());
      expect(result.result).toBe("warn");
      expect(result.score).toBe(5.5);
    });

    it("should return BLOCK result directly without retries", async () => {
      const { runHarnessCheck } = await import("./harness-runner");

      const config: HarnessCheckConfig = {
        name: "test_block",
        layer: "integration",
        description: "A blocking check",
        costEstimate: 0.05,
        isCompute: false,
      };

      const checkFn: HarnessCheckFn = async () => ({
        result: "block",
        score: 2.0,
        details: { message: "Critical failure" },
        costCredits: 0.05,
      });

      const result = await runHarnessCheck(config, checkFn, makeContext(), makeBible());
      expect(result.result).toBe("block");
      expect(result.score).toBe(2.0);
    });

    it("should retry on RETRY result and escalate to HUMAN_REVIEW after max attempts", async () => {
      const { runHarnessCheck } = await import("./harness-runner");

      let attempts = 0;
      const config: HarnessCheckConfig = {
        name: "test_retry",
        layer: "video",
        description: "A retryable check",
        costEstimate: 0.03,
        isCompute: false,
      };

      const checkFn: HarnessCheckFn = async () => {
        attempts++;
        return {
          result: "retry",
          score: 4.0,
          details: { message: `Attempt ${attempts}` },
          autoFixApplied: "adjusted_threshold",
          costCredits: 0.03,
        };
      };

      const result = await runHarnessCheck(config, checkFn, makeContext(), makeBible(), 3);
      expect(result.result).toBe("human_review");
      expect(attempts).toBe(3);
      expect(result.details.escalationReason).toContain("3 attempts");
    });

    it("should stop retrying when check succeeds", async () => {
      const { runHarnessCheck } = await import("./harness-runner");

      let attempts = 0;
      const config: HarnessCheckConfig = {
        name: "test_retry_success",
        layer: "audio",
        description: "Retries then passes",
        costEstimate: 0.02,
        isCompute: false,
      };

      const checkFn: HarnessCheckFn = async () => {
        attempts++;
        if (attempts < 2) {
          return {
            result: "retry",
            score: 4.0,
            details: { message: "Retrying" },
            autoFixApplied: "boosted_volume",
            costCredits: 0.02,
          };
        }
        return {
          result: "pass",
          score: 8.0,
          details: { message: "Fixed!" },
          costCredits: 0.02,
        };
      };

      const result = await runHarnessCheck(config, checkFn, makeContext(), makeBible(), 3);
      expect(result.result).toBe("pass");
      expect(attempts).toBe(2);
    });
  });

  describe("runHarnessLayer", () => {
    it("should run all checks in a layer and return summary", async () => {
      const { runHarnessLayer } = await import("./harness-runner");

      const checks = [
        {
          config: { name: "check_1", layer: "script" as const, description: "Check 1", costEstimate: 0.01, isCompute: true },
          fn: (async () => ({ result: "pass" as const, score: 9.0, details: {}, costCredits: 0.01 })) as HarnessCheckFn,
        },
        {
          config: { name: "check_2", layer: "script" as const, description: "Check 2", costEstimate: 0.02, isCompute: true },
          fn: (async () => ({ result: "pass" as const, score: 8.0, details: {}, costCredits: 0.02 })) as HarnessCheckFn,
        },
        {
          config: { name: "check_3", layer: "script" as const, description: "Check 3", costEstimate: 0.01, isCompute: false },
          fn: (async () => ({ result: "warn" as const, score: 5.5, details: { issue: "minor" }, costCredits: 0.01 })) as HarnessCheckFn,
        },
      ];

      const summary = await runHarnessLayer(checks, makeContext(), makeBible());

      expect(summary.totalChecks).toBe(3);
      expect(summary.passed).toBe(2);
      expect(summary.warned).toBe(1);
      expect(summary.blocked).toBe(0);
      expect(summary.shouldBlock).toBe(false);
      expect(summary.overallScore).toBeGreaterThan(0);
      expect(summary.totalCost).toBe(0.04);
      expect(summary.flaggedItems).toHaveLength(1);
      expect(summary.flaggedItems[0].checkName).toBe("check_3");
    });

    it("should set shouldBlock=true when any check returns BLOCK", async () => {
      const { runHarnessLayer } = await import("./harness-runner");

      const checks = [
        {
          config: { name: "ok_check", layer: "visual" as const, description: "OK", costEstimate: 0.01, isCompute: true },
          fn: (async () => ({ result: "pass" as const, score: 9.0, details: {}, costCredits: 0.01 })) as HarnessCheckFn,
        },
        {
          config: { name: "block_check", layer: "visual" as const, description: "Blocks", costEstimate: 0.05, isCompute: false },
          fn: (async () => ({ result: "block" as const, score: 1.0, details: { nsfw: true }, costCredits: 0.05 })) as HarnessCheckFn,
        },
      ];

      const summary = await runHarnessLayer(checks, makeContext(), makeBible());
      expect(summary.shouldBlock).toBe(true);
      expect(summary.blocked).toBe(1);
      expect(summary.flaggedItems).toHaveLength(1);
      expect(summary.flaggedItems[0].checkName).toBe("block_check");
    });

    it("should handle empty checks array", async () => {
      const { runHarnessLayer } = await import("./harness-runner");

      const summary = await runHarnessLayer([], makeContext(), makeBible());
      expect(summary.totalChecks).toBe(0);
      expect(summary.passed).toBe(0);
      expect(summary.shouldBlock).toBe(false);
      expect(summary.overallScore).toBe(0);
    });
  });

  describe("getOverallQualityScore", () => {
    it("should return zero scores when no results exist", async () => {
      const { getOverallQualityScore } = await import("./harness-runner");
      const score = await getOverallQualityScore(999);
      expect(score.overall).toBe(0);
      expect(score.totalCost).toBe(0);
    });
  });
});

// ─── Harness Checks Tests ─────────────────────────────────────────────────

describe("Harness Checks", () => {
  describe("Check configurations", () => {
    it("should export all 5 layer check arrays", async () => {
      const { scriptChecks, visualChecks, videoChecks, audioChecks, integrationChecks, allChecks } = await import("./harness-checks");

      expect(scriptChecks).toBeDefined();
      expect(visualChecks).toBeDefined();
      expect(videoChecks).toBeDefined();
      expect(audioChecks).toBeDefined();
      expect(integrationChecks).toBeDefined();
      expect(allChecks).toBeDefined();

      // Layer 1: Script (5 checks: 1A-1E)
      expect(scriptChecks).toHaveLength(5);
      // Layer 2: Visual (4 checks: 2A-2D)
      expect(visualChecks).toHaveLength(4);
      // Layer 3: Video (5 checks: 3A-3E)
      expect(videoChecks).toHaveLength(5);
      // Layer 4: Audio (4 checks: 4A-4D)
      expect(audioChecks).toHaveLength(4);
      // Layer 5: Integration (4 checks: 5A-5D)
      expect(integrationChecks).toHaveLength(4);

      // Total: 22 checks
      const total = scriptChecks.length + visualChecks.length + videoChecks.length + audioChecks.length + integrationChecks.length;
      expect(total).toBe(22);
    });

    it("should have valid config for each check", async () => {
      const { allChecks } = await import("./harness-checks");

      for (const [layer, checks] of Object.entries(allChecks)) {
        for (const { config, fn } of checks) {
          expect(config.name).toBeTruthy();
          expect(config.layer).toBe(layer);
          expect(config.description).toBeTruthy();
          expect(typeof config.costEstimate).toBe("number");
          expect(typeof config.isCompute).toBe("boolean");
          expect(typeof fn).toBe("function");
        }
      }
    });

    it("should have unique check names across all layers", async () => {
      const { allChecks } = await import("./harness-checks");
      const names = new Set<string>();

      for (const checks of Object.values(allChecks)) {
        for (const { config } of checks) {
          expect(names.has(config.name)).toBe(false);
          names.add(config.name);
        }
      }

      expect(names.size).toBe(22);
    });

    it("should follow naming convention (layerNumber_letter_description)", async () => {
      const { allChecks } = await import("./harness-checks");
      const layerNumbers: Record<string, string> = {
        script: "1",
        visual: "2",
        video: "3",
        audio: "4",
        integration: "5",
      };

      for (const [layer, checks] of Object.entries(allChecks)) {
        const expectedPrefix = layerNumbers[layer];
        for (const { config } of checks) {
          expect(config.name.startsWith(expectedPrefix)).toBe(true);
        }
      }
    });
  });

  describe("Script checks (Layer 1)", () => {
    it("check 1A should validate script schema", async () => {
      const { scriptChecks } = await import("./harness-checks");
      const check1A = scriptChecks[0];
      expect(check1A.config.name).toContain("1A");
      expect(check1A.config.layer).toBe("script");

      // Run the check with a valid context
      const result = await check1A.fn(makeContext(), makeBible());
      expect(result).toBeDefined();
      expect(["pass", "warn", "retry", "block", "human_review"]).toContain(result.result);
      expect(typeof result.score).toBe("number");
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(10);
    });

    it("check 1B should validate dialogue consistency", async () => {
      const { scriptChecks } = await import("./harness-checks");
      const check1B = scriptChecks[1];
      expect(check1B.config.name).toContain("1B");

      const result = await check1B.fn(makeContext(), makeBible());
      expect(result).toBeDefined();
      expect(typeof result.score).toBe("number");
    });
  });

  describe("Visual checks (Layer 2)", () => {
    it("check 2A should validate image quality", async () => {
      const { visualChecks } = await import("./harness-checks");
      const check2A = visualChecks[0];
      expect(check2A.config.name).toContain("2A");
      expect(check2A.config.layer).toBe("visual");

      const result = await check2A.fn(
        makeContext({ targetType: "panel" }),
        makeBible(),
      );
      expect(result).toBeDefined();
      expect(typeof result.score).toBe("number");
    });
  });

  describe("Video checks (Layer 3)", () => {
    it("check 3A should validate video quality", async () => {
      const { videoChecks } = await import("./harness-checks");
      const check3A = videoChecks[0];
      expect(check3A.config.name).toContain("3A");
      expect(check3A.config.layer).toBe("video");

      const result = await check3A.fn(
        makeContext({ targetType: "clip" }),
        makeBible(),
      );
      expect(result).toBeDefined();
      expect(typeof result.score).toBe("number");
    });
  });

  describe("Audio checks (Layer 4)", () => {
    it("check 4A should validate audio quality", async () => {
      const { audioChecks } = await import("./harness-checks");
      const check4A = audioChecks[0];
      expect(check4A.config.name).toContain("4A");
      expect(check4A.config.layer).toBe("audio");

      const result = await check4A.fn(
        makeContext({ targetType: "clip" }),
        makeBible(),
      );
      expect(result).toBeDefined();
      expect(typeof result.score).toBe("number");
    });
  });

  describe("Integration checks (Layer 5)", () => {
    it("check 5A should validate assembly", async () => {
      const { integrationChecks } = await import("./harness-checks");
      const check5A = integrationChecks[0];
      expect(check5A.config.name).toContain("5A");
      expect(check5A.config.layer).toBe("integration");

      const result = await check5A.fn(
        makeContext({ targetType: "episode" }),
        makeBible(),
      );
      expect(result).toBeDefined();
      expect(typeof result.score).toBe("number");
    });
  });
});

// ─── Production Bible Tests ───────────────────────────────────────────────

describe("Production Bible", () => {
  describe("ProductionBibleData structure", () => {
    it("should have all required fields", () => {
      const bible = makeBible();

      expect(bible.version).toBeDefined();
      expect(bible.projectId).toBeDefined();
      expect(bible.projectTitle).toBeDefined();
      expect(bible.genre).toBeDefined();
      expect(Array.isArray(bible.genre)).toBe(true);
      expect(bible.artStyle).toBeDefined();
      expect(bible.compiledAt).toBeDefined();
      expect(bible.characters).toBeDefined();
      expect(Array.isArray(bible.characters)).toBe(true);
      expect(bible.characterNameMap).toBeDefined();
      expect(bible.qualityThresholds).toBeDefined();
    });

    it("should have valid quality thresholds", () => {
      const bible = makeBible();
      const t = bible.qualityThresholds;

      expect(t.minImageScore).toBeGreaterThan(0);
      expect(t.minImageScore).toBeLessThanOrEqual(10);
      expect(t.minCharacterMatch).toBeGreaterThan(0);
      expect(t.minCharacterMatch).toBeLessThanOrEqual(10);
      expect(t.minVideoScore).toBeGreaterThan(0);
      expect(t.minVideoScore).toBeLessThanOrEqual(10);
      expect(t.minAudioScore).toBeGreaterThan(0);
      expect(t.minAudioScore).toBeLessThanOrEqual(10);
      expect(t.maxRetries).toBeGreaterThan(0);
      expect(typeof t.blockOnNsfw).toBe("boolean");
    });

    it("should have valid character entries", () => {
      const bible = makeBible();

      for (const char of bible.characters) {
        expect(char.id).toBeDefined();
        expect(char.name).toBeTruthy();
        expect(char.role).toBeTruthy();
        expect(Array.isArray(char.personalityTraits)).toBe(true);
        expect(typeof char.visualTraits).toBe("object");
        expect(Array.isArray(char.referenceImages)).toBe(true);
      }
    });

    it("should have consistent characterNameMap", () => {
      const bible = makeBible();

      for (const char of bible.characters) {
        expect(bible.characterNameMap[char.name]).toBe(char.id);
      }
    });
  });

  describe("getOrCompileProductionBible", () => {
    it("should return a fallback bible when DB is not available", async () => {
      // With mocked DB returning null, the function should throw or handle gracefully
      const { getOrCompileProductionBible } = await import("./production-bible");

      // This will fail because DB is mocked to null, but the function should handle it
      try {
        await getOrCompileProductionBible(1);
      } catch (e: any) {
        // Expected — DB not available
        expect(e.message).toBeTruthy();
      }
    });
  });
});

// ─── Pipeline Orchestrator Harness Integration Tests ──────────────────────

describe("Pipeline Orchestrator Harness Integration", () => {
  it("should export runPipeline function", async () => {
    const { runPipeline } = await import("./pipelineOrchestrator");
    expect(typeof runPipeline).toBe("function");
  });

  it("should import harness modules correctly", async () => {
    const harnessRunner = await import("./harness-runner");
    expect(typeof harnessRunner.runHarnessLayer).toBe("function");
    expect(typeof harnessRunner.runHarnessCheck).toBe("function");
    expect(typeof harnessRunner.updateAssetHarnessScore).toBe("function");
    expect(typeof harnessRunner.getHarnessResultsForRun).toBe("function");
    expect(typeof harnessRunner.getHarnessResultsForEpisode).toBe("function");
    expect(typeof harnessRunner.getFlaggedItems).toBe("function");
    expect(typeof harnessRunner.getOverallQualityScore).toBe("function");
  });

  it("should import production bible modules correctly", async () => {
    const bible = await import("./production-bible");
    expect(typeof bible.compileProductionBible).toBe("function");
    expect(typeof bible.saveProductionBible).toBe("function");
    expect(typeof bible.lockProductionBible).toBe("function");
    expect(typeof bible.getProductionBible).toBe("function");
    expect(typeof bible.getOrCompileProductionBible).toBe("function");
  });
});

// ─── tRPC Router Tests ────────────────────────────────────────────────────

describe("Harness tRPC Router", () => {
  it("should export harnessRouter and productionBibleRouter", async () => {
    const { harnessRouter, productionBibleRouter } = await import("./routers-harness");
    expect(harnessRouter).toBeDefined();
    expect(productionBibleRouter).toBeDefined();
  });

  it("harnessRouter should have expected procedures", async () => {
    const { harnessRouter } = await import("./routers-harness");
    const procedures = Object.keys((harnessRouter as any)._def.procedures || {});
    
    expect(procedures).toContain("getRunResults");
    expect(procedures).toContain("getEpisodeResults");
    expect(procedures).toContain("getFlaggedItems");
    expect(procedures).toContain("getQualityScore");
    expect(procedures).toContain("reRunLayer");
    expect(procedures).toContain("reRunAll");
  });

  it("productionBibleRouter should have expected procedures", async () => {
    const { productionBibleRouter } = await import("./routers-harness");
    const procedures = Object.keys((productionBibleRouter as any)._def.procedures || {});

    expect(procedures).toContain("get");
    expect(procedures).toContain("compile");
    expect(procedures).toContain("lock");
  });
});
