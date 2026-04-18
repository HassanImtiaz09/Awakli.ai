/**
 * A/B Testing Engine, Batch Jobs, and Webhook Tests
 *
 * @see Prompt 29
 */
import { describe, it, expect } from "vitest";

// ═══════════════════════════════════════════════════════════════════════════
// A/B Testing Engine
// ═══════════════════════════════════════════════════════════════════════════

describe("A/B Testing Engine", () => {
  describe("createExperiment", () => {
    it("creates an experiment with default values", async () => {
      const { createExperiment } = await import("./image-router/ab-testing");
      const exp = createExperiment({
        name: "Test Experiment",
        controlProvider: "runware",
        variantProvider: "fal",
        trafficSplitPercent: 20,
      });
      expect(exp.id).toBeTruthy();
      expect(exp.name).toBe("Test Experiment");
      expect(exp.controlProvider).toBe("runware");
      expect(exp.variantProvider).toBe("fal");
      expect(exp.trafficSplitPercent).toBe(20);
      expect(exp.status).toBe("draft");
      expect(exp.minSampleSize).toBe(30);
      expect(exp.workloadTypes).toEqual([]);
      expect(exp.description).toBe("");
      expect(exp.startedAt).toBeNull();
      expect(exp.endedAt).toBeNull();
    });

    it("clamps trafficSplitPercent to 1-99 range", async () => {
      const { createExperiment } = await import("./image-router/ab-testing");
      const low = createExperiment({ name: "Low", controlProvider: "a", variantProvider: "b", trafficSplitPercent: -5 });
      expect(low.trafficSplitPercent).toBe(1);
      const high = createExperiment({ name: "High", controlProvider: "a", variantProvider: "b", trafficSplitPercent: 150 });
      expect(high.trafficSplitPercent).toBe(99);
    });

    it("accepts custom description, workloadTypes, and minSampleSize", async () => {
      const { createExperiment } = await import("./image-router/ab-testing");
      const exp = createExperiment({
        name: "Custom", controlProvider: "runware", variantProvider: "tensorart",
        trafficSplitPercent: 50, description: "Testing quality",
        workloadTypes: ["manga_panel", "cover_art"], minSampleSize: 100,
      });
      expect(exp.description).toBe("Testing quality");
      expect(exp.workloadTypes).toEqual(["manga_panel", "cover_art"]);
      expect(exp.minSampleSize).toBe(100);
    });
  });

  describe("createExperimentResult", () => {
    it("creates a result with all fields", async () => {
      const { createExperimentResult } = await import("./image-router/ab-testing");
      const result = createExperimentResult({
        experimentId: "exp-1", arm: "control", providerId: "runware",
        jobId: "job-1", workloadType: "manga_panel", latencyMs: 1500,
        costUsd: 0.05, qualityScore: 85, succeeded: true,
      });
      expect(result.id).toBeTruthy();
      expect(result.arm).toBe("control");
      expect(result.qualityScore).toBe(85);
    });

    it("defaults qualityScore to null", async () => {
      const { createExperimentResult } = await import("./image-router/ab-testing");
      const result = createExperimentResult({
        experimentId: "exp-1", arm: "variant", providerId: "fal",
        jobId: "job-2", workloadType: "thumbnail", latencyMs: 800,
        costUsd: 0.02, succeeded: true,
      });
      expect(result.qualityScore).toBeNull();
    });
  });

  describe("assignArm", () => {
    it("returns deterministic results for same inputs", async () => {
      const { assignArm } = await import("./image-router/ab-testing");
      const arm1 = assignArm("exp-1", "job-1", 20);
      const arm2 = assignArm("exp-1", "job-1", 20);
      expect(arm1).toBe(arm2);
    });

    it("distributes traffic roughly according to split percentage", async () => {
      const { assignArm } = await import("./image-router/ab-testing");
      let variantCount = 0;
      const total = 1000;
      for (let i = 0; i < total; i++) {
        if (assignArm("exp-test", `job-${i}`, 30) === "variant") variantCount++;
      }
      const ratio = variantCount / total;
      expect(ratio).toBeGreaterThan(0.15);
      expect(ratio).toBeLessThan(0.45);
    });

    it("returns only control at 0% split", async () => {
      const { assignArm } = await import("./image-router/ab-testing");
      let allControl = true;
      for (let i = 0; i < 100; i++) {
        if (assignArm("exp-zero", `job-${i}`, 0) === "variant") { allControl = false; break; }
      }
      expect(allControl).toBe(true);
    });
  });

  describe("matchesExperiment", () => {
    it("returns true for running experiment with matching workload", async () => {
      const { matchesExperiment, createExperiment } = await import("./image-router/ab-testing");
      const exp = { ...createExperiment({ name: "T", controlProvider: "a", variantProvider: "b", trafficSplitPercent: 20, workloadTypes: ["manga_panel"] }), status: "running" as const };
      expect(matchesExperiment(exp, "manga_panel")).toBe(true);
    });

    it("returns false for non-matching workload", async () => {
      const { matchesExperiment, createExperiment } = await import("./image-router/ab-testing");
      const exp = { ...createExperiment({ name: "T", controlProvider: "a", variantProvider: "b", trafficSplitPercent: 20, workloadTypes: ["manga_panel"] }), status: "running" as const };
      expect(matchesExperiment(exp, "cover_art")).toBe(false);
    });

    it("returns true for all workloads when workloadTypes is empty", async () => {
      const { matchesExperiment, createExperiment } = await import("./image-router/ab-testing");
      const exp = { ...createExperiment({ name: "T", controlProvider: "a", variantProvider: "b", trafficSplitPercent: 20 }), status: "running" as const };
      expect(matchesExperiment(exp, "anything")).toBe(true);
    });

    it("returns false for non-running experiment", async () => {
      const { matchesExperiment, createExperiment } = await import("./image-router/ab-testing");
      const exp = createExperiment({ name: "Draft", controlProvider: "a", variantProvider: "b", trafficSplitPercent: 20 });
      expect(matchesExperiment(exp, "manga_panel")).toBe(false);
    });
  });

  describe("routeWithExperiment", () => {
    it("returns provider and arm for matching experiment", async () => {
      const { routeWithExperiment, createExperiment } = await import("./image-router/ab-testing");
      const exp = { ...createExperiment({ name: "Route", controlProvider: "runware", variantProvider: "fal", trafficSplitPercent: 50 }), status: "running" as const };
      const result = routeWithExperiment(exp, "job-1", "manga_panel");
      expect(result).not.toBeNull();
      expect(result!.experimentId).toBe(exp.id);
      expect(["runware", "fal"]).toContain(result!.providerId);
    });

    it("returns null for non-matching experiment", async () => {
      const { routeWithExperiment, createExperiment } = await import("./image-router/ab-testing");
      const exp = createExperiment({ name: "Draft", controlProvider: "a", variantProvider: "b", trafficSplitPercent: 20 });
      expect(routeWithExperiment(exp, "job-1", "manga_panel")).toBeNull();
    });

    it("maps control arm to controlProvider and variant to variantProvider", async () => {
      const { routeWithExperiment, assignArm, createExperiment } = await import("./image-router/ab-testing");
      const exp = { ...createExperiment({ name: "Map", controlProvider: "runware", variantProvider: "tensorart", trafficSplitPercent: 50 }), status: "running" as const };
      const result = routeWithExperiment(exp, "job-1", "manga_panel");
      if (result) {
        const expectedArm = assignArm(exp.id, "job-1", 50);
        expect(result.arm).toBe(expectedArm);
        expect(result.providerId).toBe(expectedArm === "control" ? "runware" : "tensorart");
      }
    });
  });

  describe("computeArmStats", () => {
    it("returns zero stats for empty results", async () => {
      const { computeArmStats } = await import("./image-router/ab-testing");
      const stats = computeArmStats([], "control");
      expect(stats.sampleSize).toBe(0);
      expect(stats.successRate).toBe(0);
      expect(stats.avgQualityScore).toBeNull();
    });

    it("computes correct stats for control arm", async () => {
      const { computeArmStats, createExperimentResult } = await import("./image-router/ab-testing");
      const results = [
        createExperimentResult({ experimentId: "e1", arm: "control", providerId: "runware", jobId: "j1", workloadType: "m", latencyMs: 1000, costUsd: 0.05, succeeded: true, qualityScore: 80 }),
        createExperimentResult({ experimentId: "e1", arm: "control", providerId: "runware", jobId: "j2", workloadType: "m", latencyMs: 2000, costUsd: 0.10, succeeded: true, qualityScore: 90 }),
        createExperimentResult({ experimentId: "e1", arm: "control", providerId: "runware", jobId: "j3", workloadType: "m", latencyMs: 1500, costUsd: 0.07, succeeded: false }),
        createExperimentResult({ experimentId: "e1", arm: "variant", providerId: "fal", jobId: "j4", workloadType: "m", latencyMs: 800, costUsd: 0.03, succeeded: true }),
      ];
      const stats = computeArmStats(results, "control");
      expect(stats.sampleSize).toBe(3);
      expect(stats.successRate).toBeCloseTo(2 / 3, 2);
      expect(stats.avgLatencyMs).toBeCloseTo(1500, 0);
      expect(stats.avgQualityScore).toBeCloseTo(85, 0);
      expect(stats.providerId).toBe("runware");
    });

    it("handles all-failed results", async () => {
      const { computeArmStats, createExperimentResult } = await import("./image-router/ab-testing");
      const results = Array.from({ length: 5 }, (_, i) =>
        createExperimentResult({ experimentId: "e1", arm: "control", providerId: "r", jobId: `j-${i}`, workloadType: "m", latencyMs: 5000, costUsd: 0, succeeded: false })
      );
      const stats = computeArmStats(results, "control");
      expect(stats.successRate).toBe(0);
      expect(stats.sampleSize).toBe(5);
    });

    it("handles all-succeeded results with quality scores", async () => {
      const { computeArmStats, createExperimentResult } = await import("./image-router/ab-testing");
      const results = Array.from({ length: 5 }, (_, i) =>
        createExperimentResult({ experimentId: "e1", arm: "variant", providerId: "f", jobId: `j-${i}`, workloadType: "t", latencyMs: 500 + i * 100, costUsd: 0.01 + i * 0.005, succeeded: true, qualityScore: 70 + i * 5 })
      );
      const stats = computeArmStats(results, "variant");
      expect(stats.successRate).toBe(1);
      expect(stats.avgQualityScore).toBeCloseTo(80, 0);
    });
  });

  describe("proportionZTest", () => {
    it("returns not significant for equal proportions", async () => {
      const { proportionZTest } = await import("./image-router/ab-testing");
      const result = proportionZTest(50, 100, 50, 100);
      expect(result.zScore).toBeCloseTo(0, 1);
      expect(result.isSignificant).toBe(false);
    });

    it("returns significant for large difference", async () => {
      const { proportionZTest } = await import("./image-router/ab-testing");
      const result = proportionZTest(90, 100, 50, 100);
      expect(result.isSignificant).toBe(true);
      expect(result.pValue).toBeLessThan(0.05);
    });

    it("returns insufficient data for zero samples", async () => {
      const { proportionZTest } = await import("./image-router/ab-testing");
      const result = proportionZTest(0, 0, 0, 0);
      expect(result.pValue).toBe(1);
      expect(result.isSignificant).toBe(false);
    });

    it("computes correct effect size", async () => {
      const { proportionZTest } = await import("./image-router/ab-testing");
      const result = proportionZTest(80, 100, 90, 100);
      expect(result.effectSize).toBeCloseTo(0.10, 2);
    });
  });

  describe("welchTTest", () => {
    it("returns not significant for similar distributions", async () => {
      const { welchTTest } = await import("./image-router/ab-testing");
      const result = welchTTest([100, 102, 98, 101, 99], [101, 99, 100, 102, 98]);
      expect(result.isSignificant).toBe(false);
    });

    it("returns significant for very different distributions", async () => {
      const { welchTTest } = await import("./image-router/ab-testing");
      const a = Array.from({ length: 50 }, (_, i) => 100 + i * 0.1);
      const b = Array.from({ length: 50 }, (_, i) => 200 + i * 0.1);
      const result = welchTTest(a, b);
      expect(result.isSignificant).toBe(true);
      expect(result.effectSize).toBeGreaterThan(50);
    });

    it("returns insufficient data for single-element arrays", async () => {
      const { welchTTest } = await import("./image-router/ab-testing");
      const result = welchTTest([100], [200]);
      expect(result.pValue).toBe(1);
      expect(result.isSignificant).toBe(false);
    });
  });

  describe("generateComparison", () => {
    it("returns insufficient_data when sample sizes are below minimum", async () => {
      const { generateComparison, createExperiment, createExperimentResult } = await import("./image-router/ab-testing");
      const exp = { ...createExperiment({ name: "Small", controlProvider: "runware", variantProvider: "fal", trafficSplitPercent: 50, minSampleSize: 30 }), status: "running" as const };
      const results = [createExperimentResult({ experimentId: exp.id, arm: "control", providerId: "runware", jobId: "j1", workloadType: "m", latencyMs: 1000, costUsd: 0.05, succeeded: true })];
      const comparison = generateComparison(exp, results);
      expect(comparison.recommendation).toBe("insufficient_data");
    });

    it("computes full comparison with sufficient data", async () => {
      const { generateComparison, createExperiment, createExperimentResult } = await import("./image-router/ab-testing");
      const exp = { ...createExperiment({ name: "Full", controlProvider: "runware", variantProvider: "fal", trafficSplitPercent: 50, minSampleSize: 5 }), status: "running" as const };
      const results: any[] = [];
      for (let i = 0; i < 10; i++) {
        results.push(createExperimentResult({ experimentId: exp.id, arm: "control", providerId: "runware", jobId: `ctrl-${i}`, workloadType: "m", latencyMs: 1400 + i * 20, costUsd: 0.04 + i * 0.002, succeeded: i < 8 }));
      }
      for (let i = 0; i < 10; i++) {
        results.push(createExperimentResult({ experimentId: exp.id, arm: "variant", providerId: "fal", jobId: `var-${i}`, workloadType: "m", latencyMs: 700 + i * 20, costUsd: 0.02 + i * 0.002, succeeded: i < 9 }));
      }
      const comparison = generateComparison(exp, results);
      expect(comparison.control.sampleSize).toBe(10);
      expect(comparison.variant.sampleSize).toBe(10);
      expect(["variant_better", "control_better", "no_difference"]).toContain(comparison.recommendation);
    });

    it("includes all significance tests", async () => {
      const { generateComparison, createExperiment, createExperimentResult } = await import("./image-router/ab-testing");
      const exp = { ...createExperiment({ name: "Sig", controlProvider: "a", variantProvider: "b", trafficSplitPercent: 50, minSampleSize: 2 }), status: "running" as const };
      const results = [
        createExperimentResult({ experimentId: exp.id, arm: "control", providerId: "a", jobId: "j1", workloadType: "w", latencyMs: 100, costUsd: 0.01, succeeded: true }),
        createExperimentResult({ experimentId: exp.id, arm: "control", providerId: "a", jobId: "j2", workloadType: "w", latencyMs: 200, costUsd: 0.02, succeeded: true }),
        createExperimentResult({ experimentId: exp.id, arm: "variant", providerId: "b", jobId: "j3", workloadType: "w", latencyMs: 150, costUsd: 0.015, succeeded: true }),
        createExperimentResult({ experimentId: exp.id, arm: "variant", providerId: "b", jobId: "j4", workloadType: "w", latencyMs: 250, costUsd: 0.025, succeeded: false }),
      ];
      const comparison = generateComparison(exp, results);
      expect(comparison.successRateSignificance).toBeDefined();
      expect(comparison.latencySignificance).toBeDefined();
      expect(comparison.costSignificance).toBeDefined();
      expect(typeof comparison.successRateSignificance.pValue).toBe("number");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Webhook Payload Parsers
// ═══════════════════════════════════════════════════════════════════════════

describe("Webhook Payload Parsers", () => {
  describe("parseRunwareWebhook", () => {
    it("parses a successful Runware callback", async () => {
      const { parseRunwareWebhook } = await import("./image-router/webhooks");
      const result = parseRunwareWebhook({ taskUUID: "task-123", status: "completed", imageURL: "https://cdn.runware.ai/image.png", cost: 0.004, duration: 1200 });
      expect(result).not.toBeNull();
      expect(result!.jobId).toBe("task-123");
      expect(result!.providerId).toBe("runware");
      expect(result!.succeeded).toBe(true);
      expect(result!.resultUrl).toBe("https://cdn.runware.ai/image.png");
      expect(result!.costUsd).toBe(0.004);
      expect(result!.latencyMs).toBe(1200);
    });

    it("parses a failed Runware callback", async () => {
      const { parseRunwareWebhook } = await import("./image-router/webhooks");
      const result = parseRunwareWebhook({ taskUUID: "task-456", status: "failed", error: "NSFW content detected" });
      expect(result).not.toBeNull();
      expect(result!.succeeded).toBe(false);
      expect(result!.errorMessage).toBe("NSFW content detected");
    });

    it("returns null for invalid payload", async () => {
      const { parseRunwareWebhook } = await import("./image-router/webhooks");
      expect(parseRunwareWebhook(null)).toBeNull();
      expect(parseRunwareWebhook({})).toBeNull();
      expect(parseRunwareWebhook("string")).toBeNull();
    });
  });

  describe("parseTensorArtWebhook", () => {
    it("parses a successful TensorArt callback", async () => {
      const { parseTensorArtWebhook } = await import("./image-router/webhooks");
      const result = parseTensorArtWebhook({ job_id: "ta-789", status: "SUCCESS", output: { images: [{ url: "https://cdn.tensorart.net/image.png" }] }, credits_used: 50, duration_ms: 2000 });
      expect(result).not.toBeNull();
      expect(result!.jobId).toBe("ta-789");
      expect(result!.providerId).toBe("tensorart");
      expect(result!.succeeded).toBe(true);
      expect(result!.resultUrl).toBe("https://cdn.tensorart.net/image.png");
      expect(result!.costUsd).toBe(0.05);
      expect(result!.latencyMs).toBe(2000);
    });

    it("parses a failed TensorArt callback", async () => {
      const { parseTensorArtWebhook } = await import("./image-router/webhooks");
      const result = parseTensorArtWebhook({ job_id: "ta-fail", status: "FAILED", error: "Model not found" });
      expect(result).not.toBeNull();
      expect(result!.succeeded).toBe(false);
      expect(result!.errorMessage).toBe("Model not found");
    });

    it("returns null for missing job_id", async () => {
      const { parseTensorArtWebhook } = await import("./image-router/webhooks");
      expect(parseTensorArtWebhook({ status: "SUCCESS" })).toBeNull();
    });
  });

  describe("parseFalWebhook", () => {
    it("parses a successful Fal.ai callback", async () => {
      const { parseFalWebhook } = await import("./image-router/webhooks");
      const result = parseFalWebhook({ request_id: "fal-abc", status: "COMPLETED", output: { images: [{ url: "https://fal.media/image.png" }] }, cost: 0.003, metrics: { inference_time: 900 } });
      expect(result).not.toBeNull();
      expect(result!.jobId).toBe("fal-abc");
      expect(result!.providerId).toBe("fal");
      expect(result!.succeeded).toBe(true);
      expect(result!.resultUrl).toBe("https://fal.media/image.png");
      expect(result!.costUsd).toBe(0.003);
      expect(result!.latencyMs).toBe(900);
    });

    it("parses a failed Fal.ai callback", async () => {
      const { parseFalWebhook } = await import("./image-router/webhooks");
      const result = parseFalWebhook({ request_id: "fal-fail", status: "FAILED", error: "Timeout exceeded" });
      expect(result).not.toBeNull();
      expect(result!.succeeded).toBe(false);
      expect(result!.errorMessage).toBe("Timeout exceeded");
    });

    it("returns null for invalid payload", async () => {
      const { parseFalWebhook } = await import("./image-router/webhooks");
      expect(parseFalWebhook(null)).toBeNull();
      expect(parseFalWebhook({})).toBeNull();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Webhook Signature Verification
// ═══════════════════════════════════════════════════════════════════════════

describe("Webhook Signature Verification", () => {
  it("verifies a valid signature", async () => {
    const { verifyWebhookSignature, signWebhookPayload } = await import("./image-router/webhooks");
    const payload = '{"event":"batch.completed","batchId":"123"}';
    const secret = "test-secret-key";
    const signature = signWebhookPayload(payload, secret);
    expect(verifyWebhookSignature(payload, signature, secret)).toBe(true);
  });

  it("signWebhookPayload produces consistent output", async () => {
    const { signWebhookPayload } = await import("./image-router/webhooks");
    const sig1 = signWebhookPayload("test-payload", "my-secret");
    const sig2 = signWebhookPayload("test-payload", "my-secret");
    expect(sig1).toBe(sig2);
    expect(sig1.length).toBe(64);
  });

  it("different payloads produce different signatures", async () => {
    const { signWebhookPayload } = await import("./image-router/webhooks");
    const sig1 = signWebhookPayload("payload-1", "secret");
    const sig2 = signWebhookPayload("payload-2", "secret");
    expect(sig1).not.toBe(sig2);
  });

  it("different secrets produce different signatures", async () => {
    const { signWebhookPayload } = await import("./image-router/webhooks");
    const sig1 = signWebhookPayload("payload", "secret-1");
    const sig2 = signWebhookPayload("payload", "secret-2");
    expect(sig1).not.toBe(sig2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// tRPC Procedure Registration
// ═══════════════════════════════════════════════════════════════════════════

describe("A/B Testing tRPC Procedures", () => {
  it("abTestingRouter has all required procedures", async () => {
    const { abTestingRouter } = await import("./routers-ab-testing");
    const procedures = Object.keys(abTestingRouter._def.procedures);
    expect(procedures).toContain("create");
    expect(procedures).toContain("list");
    expect(procedures).toContain("get");
    expect(procedures).toContain("updateStatus");
    expect(procedures).toContain("recordResult");
    expect(procedures).toContain("compare");
    expect(procedures).toContain("resultTimeline");
    expect(procedures).toContain("listBatches");
    expect(procedures).toContain("submitBatch");
    expect(procedures).toContain("cancelBatch");
    expect(procedures).toContain("getBatch");
  });

  it("abTesting is registered in appRouter", async () => {
    const { appRouter } = await import("./routers");
    const procedures = Object.keys(appRouter._def.procedures);
    const abTestingProcedures = procedures.filter((p) => p.startsWith("abTesting."));
    expect(abTestingProcedures.length).toBeGreaterThan(0);
    expect(abTestingProcedures).toContain("abTesting.create");
    expect(abTestingProcedures).toContain("abTesting.list");
    expect(abTestingProcedures).toContain("abTesting.compare");
    expect(abTestingProcedures).toContain("abTesting.listBatches");
    expect(abTestingProcedures).toContain("abTesting.submitBatch");
    expect(abTestingProcedures).toContain("abTesting.cancelBatch");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Schema Assertions
// ═══════════════════════════════════════════════════════════════════════════

describe("Batch Job Schema", () => {
  it("batchJobs table is defined", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.batchJobs).toBeDefined();
  });

  it("batchJobItems table is defined", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.batchJobItems).toBeDefined();
  });

  it("abExperiments table is defined", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.abExperiments).toBeDefined();
  });

  it("abExperimentResults table is defined", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.abExperimentResults).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Webhook Handler Exports
// ═══════════════════════════════════════════════════════════════════════════

describe("Webhook Handler Exports", () => {
  it("handleBatchItemCompletion is exported", async () => {
    const { handleBatchItemCompletion } = await import("./image-router/webhooks");
    expect(typeof handleBatchItemCompletion).toBe("function");
  });

  it("sendBatchWebhookNotification is exported", async () => {
    const { sendBatchWebhookNotification } = await import("./image-router/webhooks");
    expect(typeof sendBatchWebhookNotification).toBe("function");
  });

  it("registerImageWebhookRoutes is exported", async () => {
    const { registerImageWebhookRoutes } = await import("./image-router/webhooks");
    expect(typeof registerImageWebhookRoutes).toBe("function");
  });
});
