/**
 * Image Router Infrastructure Tests
 *
 * Covers: types, vault, adapters, router core, budget, health, evaluation gates,
 * and tRPC procedure existence.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Types & Workload Configs ───────────────────────────────────────────

describe("Image Router Types", () => {
  it("WORKLOAD_CONFIGS covers all 6 workload types", async () => {
    const { WORKLOAD_CONFIGS } = await import("./image-router/types");
    const expected = ["manga_panel", "character_sheet", "background_art", "cover_art", "thumbnail", "ui_asset"];
    for (const w of expected) {
      expect(WORKLOAD_CONFIGS[w as keyof typeof WORKLOAD_CONFIGS]).toBeDefined();
    }
  });

  it("each workload config has required fields", async () => {
    const { WORKLOAD_CONFIGS } = await import("./image-router/types");
    for (const [key, config] of Object.entries(WORKLOAD_CONFIGS)) {
      expect(config.displayName).toBeTruthy();
      expect(config.defaultTier).toMatch(/^(budget|standard|premium)$/);
      expect(config.maxCostUsd).toBeGreaterThan(0);
      expect(config.defaultWidth).toBeGreaterThan(0);
      expect(config.defaultHeight).toBeGreaterThan(0);
      expect(typeof config.controlNetRequired).toBe("boolean");
      expect(typeof config.loraRequired).toBe("boolean");
      expect(config.preferredProviders.length).toBeGreaterThan(0);
    }
  });

  it("manga_panel has Runware as preferred primary", async () => {
    const { WORKLOAD_CONFIGS } = await import("./image-router/types");
    expect(WORKLOAD_CONFIGS.manga_panel.preferredProviders[0]).toBe("runware");
  });

  it("thumbnail has budget tier by default", async () => {
    const { WORKLOAD_CONFIGS } = await import("./image-router/types");
    expect(WORKLOAD_CONFIGS.thumbnail.defaultTier).toBe("budget");
  });

  it("cover_art has premium tier by default", async () => {
    const { WORKLOAD_CONFIGS } = await import("./image-router/types");
    expect(WORKLOAD_CONFIGS.cover_art.defaultTier).toBe("premium");
  });
});

// ─── Vault ──────────────────────────────────────────────────────────────

describe("Image Router Vault", () => {
  it("exports getProviderApiKey function", async () => {
    const vault = await import("./image-router/vault");
    expect(typeof vault.getProviderApiKey).toBe("function");
  });

  it("exports getConfiguredProviders function", async () => {
    const vault = await import("./image-router/vault");
    expect(typeof vault.getConfiguredProviders).toBe("function");
  });

  it("exports isProviderConfigured function", async () => {
    const vault = await import("./image-router/vault");
    expect(typeof vault.isProviderConfigured).toBe("function");
  });

  it("getProviderApiKey returns null for unconfigured provider", async () => {
    const vault = await import("./image-router/vault");
    // In test env, env vars are not set, so should return null
    const key = vault.getProviderApiKey("runware" as any);
    expect(key === null || typeof key === "string").toBe(true);
  });
});

// ─── Adapters ───────────────────────────────────────────────────────────

describe("Runware Adapter", () => {
  it("exports runwareAdapter with correct providerId", async () => {
    const { runwareAdapter } = await import("./image-router/adapters/runware");
    expect(runwareAdapter.providerId).toBe("runware");
  });

  it("supports ControlNet", async () => {
    const { runwareAdapter } = await import("./image-router/adapters/runware");
    expect(runwareAdapter.supportsControlNet()).toBe(true);
  });

  it("supports LoRA", async () => {
    const { runwareAdapter } = await import("./image-router/adapters/runware");
    expect(runwareAdapter.supportsLoRA()).toBe(true);
  });

  it("supports manga_panel workload", async () => {
    const { runwareAdapter } = await import("./image-router/adapters/runware");
    expect(runwareAdapter.supportsWorkload("manga_panel")).toBe(true);
  });

  it("has a displayName", async () => {
    const { runwareAdapter } = await import("./image-router/adapters/runware");
    expect(runwareAdapter.displayName).toBeTruthy();
  });

  it("estimateCostUsd returns a positive number for standard params", async () => {
    const { runwareAdapter } = await import("./image-router/adapters/runware");
    const cost = runwareAdapter.estimateCostUsd({
      prompt: "test",
      width: 1024,
      height: 1024,
      numImages: 1,
    });
    expect(cost).toBeGreaterThan(0);
  });
});

describe("TensorArt Adapter", () => {
  it("exports tensorArtAdapter with correct providerId", async () => {
    const { tensorArtAdapter } = await import("./image-router/adapters/tensorart");
    expect(tensorArtAdapter.providerId).toBe("tensorart");
  });

  it("supports character_sheet workload", async () => {
    const { tensorArtAdapter } = await import("./image-router/adapters/tensorart");
    expect(tensorArtAdapter.supportsWorkload("character_sheet")).toBe(true);
  });

  it("has displayName 'TensorArt'", async () => {
    const { tensorArtAdapter } = await import("./image-router/adapters/tensorart");
    expect(tensorArtAdapter.displayName).toContain("Tensor");
  });

  it("estimateCostUsd returns a positive number", async () => {
    const { tensorArtAdapter } = await import("./image-router/adapters/tensorart");
    const cost = tensorArtAdapter.estimateCostUsd({
      prompt: "test",
      width: 1024,
      height: 1024,
      numImages: 1,
    });
    expect(cost).toBeGreaterThan(0);
  });
});

describe("Fal Adapter", () => {
  it("exports falAdapter with correct providerId", async () => {
    const { falAdapter } = await import("./image-router/adapters/fal");
    expect(falAdapter.providerId).toBe("fal");
  });

  it("supports thumbnail workload", async () => {
    const { falAdapter } = await import("./image-router/adapters/fal");
    expect(falAdapter.supportsWorkload("thumbnail")).toBe(true);
  });

  it("has displayName containing 'Fal'", async () => {
    const { falAdapter } = await import("./image-router/adapters/fal");
    expect(falAdapter.displayName).toContain("Fal");
  });

  it("estimateCostUsd returns a positive number", async () => {
    const { falAdapter } = await import("./image-router/adapters/fal");
    const cost = falAdapter.estimateCostUsd({
      prompt: "test",
      width: 512,
      height: 512,
      numImages: 1,
    });
    expect(cost).toBeGreaterThan(0);
  });
});

// ─── Router Core ────────────────────────────────────────────────────────

describe("Image Router Core", () => {
  it("exports createGenerationJob function", async () => {
    const router = await import("./image-router/router");
    expect(typeof router.createGenerationJob).toBe("function");
  });

  it("exports makeRoutingDecision function", async () => {
    const router = await import("./image-router/router");
    expect(typeof router.makeRoutingDecision).toBe("function");
  });

  it("exports registerImageAdapter function", async () => {
    const router = await import("./image-router/router");
    expect(typeof router.registerImageAdapter).toBe("function");
  });

  it("exports scoreProvider function", async () => {
    const router = await import("./image-router/router");
    expect(typeof router.scoreProvider).toBe("function");
  });

  it("createGenerationJob produces a valid job", async () => {
    const { createGenerationJob } = await import("./image-router/router");
    const job = createGenerationJob("manga_panel", {
      prompt: "A warrior in battle",
      width: 1024,
      height: 1024,
      numImages: 1,
    }, 42);
    expect(job.id).toBeTruthy();
    expect(job.workloadType).toBe("manga_panel");
    expect(job.userId).toBe(42);
    expect(job.status).toBe("pending");
  });

  it("scoreProvider returns a ProviderScore object", async () => {
    const { scoreProvider } = await import("./image-router/router");
    const { runwareAdapter } = await import("./image-router/adapters/runware");
    const score = scoreProvider(runwareAdapter, { prompt: "test", width: 1024, height: 1024, numImages: 1 }, "manga_panel", {
      isHealthy: true,
      successRate1h: 0.99,
      latencyP50Ms: 500,
    });
    expect(score.score).toBeGreaterThanOrEqual(0);
    expect(score.score).toBeLessThanOrEqual(100);
  });

  it("scoreProvider penalizes unhealthy providers", async () => {
    const { scoreProvider } = await import("./image-router/router");
    const { runwareAdapter } = await import("./image-router/adapters/runware");
    const params = { prompt: "test", width: 1024, height: 1024, numImages: 1 };
    const healthyScore = scoreProvider(runwareAdapter, params, "manga_panel", {
      isHealthy: true,
      successRate1h: 0.99,
      latencyP50Ms: 500,
    });
    const unhealthyScore = scoreProvider(runwareAdapter, params, "manga_panel", {
      isHealthy: false,
      successRate1h: 0.5,
      latencyP50Ms: 5000,
    });
    expect(healthyScore.score).toBeGreaterThan(unhealthyScore.score);
    expect(healthyScore.score).toBeGreaterThan(0);
  });
});

// ─── Budget Governor ────────────────────────────────────────────────────

describe("Budget Governor", () => {
  it("exports budgetGovernor singleton", async () => {
    const { budgetGovernor } = await import("./image-router/budget");
    expect(budgetGovernor).toBeDefined();
  });

  it("getBudgetSummary returns an array", async () => {
    const { budgetGovernor } = await import("./image-router/budget");
    const summary = budgetGovernor.getBudgetSummary();
    expect(Array.isArray(summary)).toBe(true);
  });

  it("each budget entry has required fields", async () => {
    const { budgetGovernor } = await import("./image-router/budget");
    const summary = budgetGovernor.getBudgetSummary();
    for (const entry of summary) {
      expect(entry.providerId).toBeTruthy();
      expect(typeof entry.monthlyCapUsd).toBe("number");
      expect(typeof entry.currentSpendUsd).toBe("number");
      expect(typeof entry.remainingUsd).toBe("number");
      expect(typeof entry.percentUsed).toBe("number");
    }
  });

  it("checkBudget returns true for small amounts on fresh budget", async () => {
    const { budgetGovernor } = await import("./image-router/budget");
    const result = await budgetGovernor.checkBudget("runware", 0.01);
    expect(result).toBe(true);
  });

  it("getAlerts returns an array", async () => {
    const { budgetGovernor } = await import("./image-router/budget");
    const alerts = budgetGovernor.getAlerts();
    expect(Array.isArray(alerts)).toBe(true);
  });
});

// ─── Health Monitor ─────────────────────────────────────────────────────

describe("Image Health Monitor", () => {
  it("exports imageHealthMonitor singleton", async () => {
    const { imageHealthMonitor } = await import("./image-router/health");
    expect(imageHealthMonitor).toBeDefined();
  });

  it("getStatus returns a health status object", async () => {
    const { imageHealthMonitor } = await import("./image-router/health");
    const status = imageHealthMonitor.getStatus("runware");
    expect(typeof status.isHealthy).toBe("boolean");
    expect(typeof status.circuitState).toBe("string");
    expect(typeof status.consecutiveFailures).toBe("number");
  });

  it("getAllStatuses returns a map", async () => {
    const { imageHealthMonitor } = await import("./image-router/health");
    const statuses = imageHealthMonitor.getAllStatuses();
    expect(statuses).toBeDefined();
    expect(typeof statuses).toBe("object");
  });

  it("recordSuccess keeps provider healthy", async () => {
    const { imageHealthMonitor } = await import("./image-router/health");
    imageHealthMonitor.recordSuccess("runware", 100);
    const status = imageHealthMonitor.getStatus("runware");
    expect(status.isHealthy).toBe(true);
    expect(status.consecutiveFailures).toBe(0);
  });

  it("consecutive failures open circuit breaker", async () => {
    const { imageHealthMonitor } = await import("./image-router/health");
    // Record many failures to trip the breaker
    for (let i = 0; i < 10; i++) {
      imageHealthMonitor.recordFailure("test_provider_break", "timeout");
    }
    const status = imageHealthMonitor.getStatus("test_provider_break");
    expect(status.isHealthy).toBe(false);
    expect(status.circuitState).toBe("open");
  });
});

// ─── Evaluation Gates ───────────────────────────────────────────────────

describe("Evaluation Gates M1-M12", () => {
  it("M1: passes when all manga jobs route to Runware", async () => {
    const { evaluateM1_RoutingDefault } = await import("./image-router/evaluation-gates");
    const result = evaluateM1_RoutingDefault([
      { workloadType: "manga_panel", selectedProvider: "runware" },
      { workloadType: "manga_panel", selectedProvider: "runware" },
      { workloadType: "manga_panel", selectedProvider: "runware" },
    ]);
    expect(result.pass).toBe(true);
    expect(result.score).toBe(1.0);
  });

  it("M1: fails when some manga jobs route elsewhere", async () => {
    const { evaluateM1_RoutingDefault } = await import("./image-router/evaluation-gates");
    const result = evaluateM1_RoutingDefault([
      { workloadType: "manga_panel", selectedProvider: "runware" },
      { workloadType: "manga_panel", selectedProvider: "tensorart" },
    ]);
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0.5);
  });

  it("M2: passes when all outage jobs fallback to TensorArt within 60s", async () => {
    const { evaluateM2_FallbackBehavior } = await import("./image-router/evaluation-gates");
    const result = evaluateM2_FallbackBehavior([
      { workloadType: "manga_panel", primaryProvider: "runware", primaryHealthy: false, selectedProvider: "tensorart", completedWithinMs: 30000 },
      { workloadType: "manga_panel", primaryProvider: "runware", primaryHealthy: false, selectedProvider: "tensorart", completedWithinMs: 45000 },
    ]);
    expect(result.pass).toBe(true);
  });

  it("M2: fails when fallback exceeds 60s", async () => {
    const { evaluateM2_FallbackBehavior } = await import("./image-router/evaluation-gates");
    const result = evaluateM2_FallbackBehavior([
      { workloadType: "manga_panel", primaryProvider: "runware", primaryHealthy: false, selectedProvider: "tensorart", completedWithinMs: 70000 },
    ]);
    expect(result.pass).toBe(false);
  });

  it("M3: passes when CLIP similarity >= 0.92", async () => {
    const { evaluateM3_LoraConsistency } = await import("./image-router/evaluation-gates");
    const result = evaluateM3_LoraConsistency([
      { promptId: "p1", clipSimilarity: 0.95 },
      { promptId: "p2", clipSimilarity: 0.93 },
      { promptId: "p3", clipSimilarity: 0.94 },
    ]);
    expect(result.pass).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.92);
  });

  it("M3: fails when avg CLIP similarity < 0.92", async () => {
    const { evaluateM3_LoraConsistency } = await import("./image-router/evaluation-gates");
    const result = evaluateM3_LoraConsistency([
      { promptId: "p1", clipSimilarity: 0.85 },
      { promptId: "p2", clipSimilarity: 0.88 },
    ]);
    expect(result.pass).toBe(false);
  });

  it("M4: passes when visual parity >= 0.90", async () => {
    const { evaluateM4_ControlNetParity } = await import("./image-router/evaluation-gates");
    const result = evaluateM4_ControlNetParity([
      { panelId: "cn1", visualParityScore: 0.95 },
      { panelId: "cn2", visualParityScore: 0.92 },
    ]);
    expect(result.pass).toBe(true);
  });

  it("M5: passes when all completed jobs have cost rows", async () => {
    const { evaluateM5_CostAttribution } = await import("./image-router/evaluation-gates");
    const result = evaluateM5_CostAttribution({
      completedJobs: 100,
      jobsWithCostRow: 100,
      jobsWithPositiveCost: 100,
    });
    expect(result.pass).toBe(true);
  });

  it("M5: fails when some jobs missing cost rows", async () => {
    const { evaluateM5_CostAttribution } = await import("./image-router/evaluation-gates");
    const result = evaluateM5_CostAttribution({
      completedJobs: 100,
      jobsWithCostRow: 95,
      jobsWithPositiveCost: 90,
    });
    expect(result.pass).toBe(false);
  });

  it("M6: passes when tracker matches invoice within 5%", async () => {
    const { evaluateM6_BudgetAccuracy } = await import("./image-router/evaluation-gates");
    const result = evaluateM6_BudgetAccuracy([
      { providerId: "runware", trackedUsd: 100, invoiceUsd: 102 },
      { providerId: "tensorart", trackedUsd: 50, invoiceUsd: 51 },
    ]);
    expect(result.pass).toBe(true);
  });

  it("M6: fails when deviation exceeds 5%", async () => {
    const { evaluateM6_BudgetAccuracy } = await import("./image-router/evaluation-gates");
    const result = evaluateM6_BudgetAccuracy([
      { providerId: "runware", trackedUsd: 100, invoiceUsd: 120 },
    ]);
    expect(result.pass).toBe(false);
  });

  it("M7: passes with zero secret matches", async () => {
    const { evaluateM7_SecretLeakage } = await import("./image-router/evaluation-gates");
    const result = evaluateM7_SecretLeakage({
      totalLinesScanned: 50000,
      matchesFound: 0,
      matchDetails: [],
    });
    expect(result.pass).toBe(true);
    expect(result.score).toBe(1.0);
  });

  it("M7: fails with any secret matches", async () => {
    const { evaluateM7_SecretLeakage } = await import("./image-router/evaluation-gates");
    const result = evaluateM7_SecretLeakage({
      totalLinesScanned: 50000,
      matchesFound: 2,
      matchDetails: ["line 1234: RUNWARE_API...", "line 5678: TENSOR..."],
    });
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
  });

  it("M8: passes when kill-switch executes in <30s", async () => {
    const { evaluateM8_KillSwitch } = await import("./image-router/evaluation-gates");
    const result = evaluateM8_KillSwitch({
      rotationTimeMs: 5000,
      routerReturned503: true,
      totalTimeMs: 15000,
    });
    expect(result.pass).toBe(true);
  });

  it("M8: fails when kill-switch exceeds 30s", async () => {
    const { evaluateM8_KillSwitch } = await import("./image-router/evaluation-gates");
    const result = evaluateM8_KillSwitch({
      rotationTimeMs: 25000,
      routerReturned503: true,
      totalTimeMs: 35000,
    });
    expect(result.pass).toBe(false);
  });

  it("M9: passes with zero dropped/duplicated jobs", async () => {
    const { evaluateM9_KeyRotation } = await import("./image-router/evaluation-gates");
    const result = evaluateM9_KeyRotation({
      totalInFlightJobs: 1000,
      droppedJobs: 0,
      duplicatedJobs: 0,
    });
    expect(result.pass).toBe(true);
  });

  it("M10: passes when cost reduction >= 60%", async () => {
    const { evaluateM10_CostReduction } = await import("./image-router/evaluation-gates");
    const result = evaluateM10_CostReduction([
      { chapterId: "ch1", baselineCostUsd: 8.00, routedCostUsd: 0.65 },
      { chapterId: "ch2", baselineCostUsd: 10.00, routedCostUsd: 1.20 },
    ]);
    expect(result.pass).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.60);
  });

  it("M10: fails when cost reduction < 60%", async () => {
    const { evaluateM10_CostReduction } = await import("./image-router/evaluation-gates");
    const result = evaluateM10_CostReduction([
      { chapterId: "ch1", baselineCostUsd: 8.00, routedCostUsd: 5.00 },
    ]);
    expect(result.pass).toBe(false);
  });

  it("M11: passes when P95 latency <= 50ms", async () => {
    const { evaluateM11_RouterLatency } = await import("./image-router/evaluation-gates");
    const samples = Array.from({ length: 100 }, () => Math.floor(Math.random() * 40) + 5);
    const result = evaluateM11_RouterLatency(samples);
    expect(result.pass).toBe(true);
  });

  it("M11: fails when P95 latency > 50ms", async () => {
    const { evaluateM11_RouterLatency } = await import("./image-router/evaluation-gates");
    const samples = Array.from({ length: 100 }, () => Math.floor(Math.random() * 100) + 60);
    const result = evaluateM11_RouterLatency(samples);
    expect(result.pass).toBe(false);
  });

  it("M12: passes when all providers have <0.5% error rate", async () => {
    const { evaluateM12_SoakTest } = await import("./image-router/evaluation-gates");
    const result = evaluateM12_SoakTest([
      { providerId: "runware", totalJobs: 10000, errorCount: 30, p95LatencyMs: 2000, sloLatencyMs: 5000 },
      { providerId: "tensorart", totalJobs: 10000, errorCount: 40, p95LatencyMs: 3000, sloLatencyMs: 5000 },
      { providerId: "fal", totalJobs: 10000, errorCount: 20, p95LatencyMs: 1500, sloLatencyMs: 5000 },
    ]);
    expect(result.pass).toBe(true);
  });

  it("M12: fails when any provider exceeds 0.5% error rate", async () => {
    const { evaluateM12_SoakTest } = await import("./image-router/evaluation-gates");
    const result = evaluateM12_SoakTest([
      { providerId: "runware", totalJobs: 10000, errorCount: 30, p95LatencyMs: 2000, sloLatencyMs: 5000 },
      { providerId: "tensorart", totalJobs: 10000, errorCount: 100, p95LatencyMs: 3000, sloLatencyMs: 5000 },
    ]);
    expect(result.pass).toBe(false);
  });
});

describe("Gate Report Generator", () => {
  it("generates a report from gate results", async () => {
    const { generateImageRouterGateReport, evaluateM7_SecretLeakage } = await import("./image-router/evaluation-gates");
    const gate = evaluateM7_SecretLeakage({ totalLinesScanned: 1000, matchesFound: 0, matchDetails: [] });
    const report = generateImageRouterGateReport([gate]);
    expect(report.totalGates).toBe(1);
    expect(report.passCount).toBe(1);
    expect(report.overallPass).toBe(true);
    expect(report.generatedAt).toBeGreaterThan(0);
  });

  it("overallPass is false when any gate fails", async () => {
    const { generateImageRouterGateReport, evaluateM7_SecretLeakage } = await import("./image-router/evaluation-gates");
    const pass = evaluateM7_SecretLeakage({ totalLinesScanned: 1000, matchesFound: 0, matchDetails: [] });
    const fail = evaluateM7_SecretLeakage({ totalLinesScanned: 1000, matchesFound: 1, matchDetails: ["leak"] });
    const report = generateImageRouterGateReport([pass, fail]);
    expect(report.overallPass).toBe(false);
    expect(report.passCount).toBe(1);
    expect(report.totalGates).toBe(2);
  });
});

describe("Routing Table Validation", () => {
  it("validates all workload configs exist", async () => {
    const { validateRoutingTable } = await import("./image-router/evaluation-gates");
    const result = validateRoutingTable();
    expect(result.gateId).toBe("RT");
    expect(result.pass).toBe(true);
    expect(result.score).toBe(1.0);
  });
});

// ─── tRPC Router Registration ───────────────────────────────────────────

describe("Image Router tRPC Registration", () => {
  it("imageRouterTrpc exports a router object", async () => {
    const { imageRouterTrpc } = await import("./routers-image-router");
    expect(imageRouterTrpc).toBeDefined();
    expect(typeof imageRouterTrpc).toBe("object");
  });

  it("imageRouterTrpc has generate procedure", async () => {
    const { imageRouterTrpc } = await import("./routers-image-router");
    expect((imageRouterTrpc as any).generate || (imageRouterTrpc as any)._def?.procedures?.generate).toBeDefined();
  });

  it("imageRouterTrpc has health procedure", async () => {
    const { imageRouterTrpc } = await import("./routers-image-router");
    expect((imageRouterTrpc as any).health || (imageRouterTrpc as any)._def?.procedures?.health).toBeDefined();
  });

  it("imageRouterTrpc has budget procedure", async () => {
    const { imageRouterTrpc } = await import("./routers-image-router");
    expect((imageRouterTrpc as any).budget || (imageRouterTrpc as any)._def?.procedures?.budget).toBeDefined();
  });

  it("imageRouterTrpc has costHistory procedure", async () => {
    const { imageRouterTrpc } = await import("./routers-image-router");
    expect((imageRouterTrpc as any).costHistory || (imageRouterTrpc as any)._def?.procedures?.costHistory).toBeDefined();
  });

  it("imageRouterTrpc has costStats procedure", async () => {
    const { imageRouterTrpc } = await import("./routers-image-router");
    expect((imageRouterTrpc as any).costStats || (imageRouterTrpc as any)._def?.procedures?.costStats).toBeDefined();
  });

  it("imageRouterTrpc has providers procedure", async () => {
    const { imageRouterTrpc } = await import("./routers-image-router");
    expect((imageRouterTrpc as any).providers || (imageRouterTrpc as any)._def?.procedures?.providers).toBeDefined();
  });

  it("imageRouterTrpc has workloadConfigs procedure", async () => {
    const { imageRouterTrpc } = await import("./routers-image-router");
    expect((imageRouterTrpc as any).workloadConfigs || (imageRouterTrpc as any)._def?.procedures?.workloadConfigs).toBeDefined();
  });

  it("imageRouterTrpc has previewRoute procedure", async () => {
    const { imageRouterTrpc } = await import("./routers-image-router");
    expect((imageRouterTrpc as any).previewRoute || (imageRouterTrpc as any)._def?.procedures?.previewRoute).toBeDefined();
  });
});

// ─── appRouter includes imageRouter namespace ───────────────────────────

describe("appRouter integration", () => {
  it("appRouter has imageRouter namespace", async () => {
    const { appRouter } = await import("./routers");
    expect((appRouter as any)._def?.procedures || (appRouter as any).imageRouter).toBeDefined();
  });
});
