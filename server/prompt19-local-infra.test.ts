/**
 * Prompt 19 — Hybrid Local/API Inference Infrastructure Tests
 * Covers: types, GPU cost model, fallback mapping, adapter registration,
 * adapter validation, seed data, barrel exports, and tRPC admin router.
 */
import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Helpers ──────────────────────────────────────────────────────────────

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-openid",
    email: "admin@awakli.ai",
    name: "Admin",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    ctx: {
      user,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    },
  };
}

function createUserContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "user-openid",
    email: "user@awakli.ai",
    name: "User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    ctx: {
      user,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    },
  };
}

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Types & Constants
// ═══════════════════════════════════════════════════════════════════════════

describe("Prompt 19 — Types & Constants", () => {
  it("exports all GPU types with positive rates", async () => {
    const { GPU_RATES } = await import("./provider-router/local-infra/types");
    expect(GPU_RATES.h100_sxm).toBeGreaterThan(0);
    expect(GPU_RATES.a100_80gb).toBeGreaterThan(0);
    expect(GPU_RATES.rtx_4090).toBeGreaterThan(0);
    // H100 should be most expensive
    expect(GPU_RATES.h100_sxm).toBeGreaterThan(GPU_RATES.a100_80gb);
    expect(GPU_RATES.a100_80gb).toBeGreaterThan(GPU_RATES.rtx_4090);
  });

  it("has 30% margin multiplier", async () => {
    const { MARGIN_MULTIPLIER } = await import("./provider-router/local-infra/types");
    expect(MARGIN_MULTIPLIER).toBe(1.30);
  });

  it("has $0.55 credit COGS rate", async () => {
    const { CREDIT_COGS_RATE } = await import("./provider-router/local-infra/types");
    expect(CREDIT_COGS_RATE).toBe(0.55);
  });

  it("defines all 6 local model specs", async () => {
    const { LOCAL_MODEL_SPECS } = await import("./provider-router/local-infra/types");
    const expectedIds = [
      "local_animatediff", "local_svd", "local_rife",
      "local_controlnet", "local_ip_adapter", "local_realesrgan",
    ];
    for (const id of expectedIds) {
      expect(LOCAL_MODEL_SPECS[id]).toBeDefined();
      expect(LOCAL_MODEL_SPECS[id].providerId).toBe(id);
      expect(LOCAL_MODEL_SPECS[id].modelName).toBeTruthy();
      expect(LOCAL_MODEL_SPECS[id].defaultGpuType).toBeTruthy();
      expect(LOCAL_MODEL_SPECS[id].vramGb).toBeGreaterThan(0);
      expect(LOCAL_MODEL_SPECS[id].dockerImage).toContain("awakli/");
    }
  });

  it("each model spec has valid inference time range", async () => {
    const { LOCAL_MODEL_SPECS } = await import("./provider-router/local-infra/types");
    for (const spec of Object.values(LOCAL_MODEL_SPECS)) {
      expect(spec.avgInferenceTimeSec.min).toBeGreaterThan(0);
      expect(spec.avgInferenceTimeSec.max).toBeGreaterThan(spec.avgInferenceTimeSec.min);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. GPU Cost Model
// ═══════════════════════════════════════════════════════════════════════════

describe("Prompt 19 — GPU Cost Model", () => {
  it("estimateGpuCost computes correct formula: seconds * rate * margin", async () => {
    const { estimateGpuCost, GPU_RATES, MARGIN_MULTIPLIER, CREDIT_COGS_RATE } = await import("./provider-router/local-infra");
    const result = estimateGpuCost("a100_80gb", 60);
    const expectedRaw = 60 * GPU_RATES.a100_80gb;
    const expectedMargin = expectedRaw * MARGIN_MULTIPLIER;
    const expectedCredits = expectedMargin / CREDIT_COGS_RATE;
    expect(result.gpuType).toBe("a100_80gb");
    expect(result.estimatedGpuSeconds).toBe(60);
    expect(result.rawGpuCostUsd).toBeCloseTo(expectedRaw, 5);
    expect(result.marginCostUsd).toBeCloseTo(expectedMargin, 5);
    expect(result.costCredits).toBeCloseTo(expectedCredits, 3);
  });

  it("estimateGpuCost throws on unknown GPU type", async () => {
    const { estimateGpuCost } = await import("./provider-router/local-infra");
    expect(() => estimateGpuCost("unknown_gpu" as any, 10)).toThrow("Unknown GPU type");
  });

  it("estimateInferenceTime returns reasonable values for all providers", async () => {
    const { estimateInferenceTime, LOCAL_MODEL_SPECS } = await import("./provider-router/local-infra");
    for (const [id, spec] of Object.entries(LOCAL_MODEL_SPECS)) {
      const time = estimateInferenceTime(id, {});
      expect(time).toBeGreaterThanOrEqual(spec.avgInferenceTimeSec.min);
    }
  });

  it("estimateInferenceTime scales with AnimateDiff duration", async () => {
    const { estimateInferenceTime } = await import("./provider-router/local-infra");
    const short = estimateInferenceTime("local_animatediff", { durationSeconds: 2 });
    const long = estimateInferenceTime("local_animatediff", { durationSeconds: 5 });
    expect(long).toBeGreaterThan(short);
  });

  it("estimateInferenceTime scales with RIFE frame count", async () => {
    const { estimateInferenceTime } = await import("./provider-router/local-infra");
    const few = estimateInferenceTime("local_rife", { frameCount: 10, upscaleFactor: 2 });
    const many = estimateInferenceTime("local_rife", { frameCount: 100, upscaleFactor: 4 });
    expect(many).toBeGreaterThan(few);
  });

  it("estimateInferenceTime scales with Real-ESRGAN resolution", async () => {
    const { estimateInferenceTime } = await import("./provider-router/local-infra");
    const small = estimateInferenceTime("local_realesrgan", { width: 256, height: 256, upscaleFactor: 2 });
    const large = estimateInferenceTime("local_realesrgan", { width: 1024, height: 1024, upscaleFactor: 4 });
    expect(large).toBeGreaterThan(small);
  });

  it("estimateLocalProviderCost returns full cost breakdown", async () => {
    const { estimateLocalProviderCost } = await import("./provider-router/local-infra");
    const cost = estimateLocalProviderCost("local_animatediff", { durationSeconds: 3 });
    expect(cost.gpuType).toBe("h100_sxm");
    expect(cost.estimatedGpuSeconds).toBeGreaterThan(0);
    expect(cost.rawGpuCostUsd).toBeGreaterThan(0);
    expect(cost.marginCostUsd).toBeGreaterThan(cost.rawGpuCostUsd);
    expect(cost.costCredits).toBeGreaterThan(0);
  });

  it("estimateLocalProviderCost throws on unknown provider", async () => {
    const { estimateLocalProviderCost } = await import("./provider-router/local-infra");
    expect(() => estimateLocalProviderCost("unknown_provider", {})).toThrow("Unknown local provider");
  });

  it("calculateActualCost matches estimateGpuCost for same inputs", async () => {
    const { calculateActualCost, estimateGpuCost } = await import("./provider-router/local-infra");
    const estimate = estimateGpuCost("rtx_4090", 45);
    const actual = calculateActualCost("rtx_4090", 45);
    expect(actual.rawCostUsd).toBe(estimate.rawGpuCostUsd);
    expect(actual.marginCostUsd).toBe(estimate.marginCostUsd);
    expect(actual.costCredits).toBe(estimate.costCredits);
  });

  it("compareCosts recommends local when cheaper", async () => {
    const { compareCosts } = await import("./provider-router/local-infra");
    // API costs $1.00, local should be much cheaper
    const result = compareCosts("local_rife", 1.0, { frameCount: 10, upscaleFactor: 2 });
    expect(result.localCostUsd).toBeLessThan(result.apiCostUsd);
    expect(result.savingsPercent).toBeGreaterThan(0);
    expect(result.recommendation).toBe("local");
  });

  it("compareCosts recommends API when local is more expensive", async () => {
    const { compareCosts } = await import("./provider-router/local-infra");
    // API costs $0.001 — absurdly cheap
    const result = compareCosts("local_animatediff", 0.001, { durationSeconds: 5 });
    expect(result.recommendation).toBe("api");
    expect(result.savingsPercent).toBeLessThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Fallback Mapping
// ═══════════════════════════════════════════════════════════════════════════

describe("Prompt 19 — Fallback Mapping", () => {
  it("defines fallback chains for all 6 local providers", async () => {
    const { LOCAL_FALLBACK_MAP } = await import("./provider-router/local-infra");
    const expectedIds = [
      "local_animatediff", "local_svd", "local_rife",
      "local_controlnet", "local_ip_adapter", "local_realesrgan",
    ];
    for (const id of expectedIds) {
      expect(LOCAL_FALLBACK_MAP[id]).toBeDefined();
      expect(LOCAL_FALLBACK_MAP[id].localProviderId).toBe(id);
    }
  });

  it("AnimateDiff falls back to Wan 2.1 first", async () => {
    const { getFallbackProviderIds } = await import("./provider-router/local-infra");
    const ids = getFallbackProviderIds("local_animatediff");
    expect(ids.length).toBeGreaterThan(0);
    expect(ids[0]).toBe("wan_21");
  });

  it("SVD falls back to Wan 2.1 img2vid", async () => {
    const { getFallbackProviderIds } = await import("./provider-router/local-infra");
    const ids = getFallbackProviderIds("local_svd");
    expect(ids[0]).toBe("wan_21");
  });

  it("RIFE can skip on failure (graceful degradation)", async () => {
    const { canSkipOnFailure, getFallbackChain } = await import("./provider-router/local-infra");
    expect(canSkipOnFailure("local_rife")).toBe(true);
    const chain = getFallbackChain("local_rife");
    expect(chain?.fallbacks.length).toBe(0);
    expect(chain?.skipBehavior).toContain("lower fps");
  });

  it("IP-Adapter can skip on failure (text prompt only)", async () => {
    const { canSkipOnFailure, getFallbackChain } = await import("./provider-router/local-infra");
    expect(canSkipOnFailure("local_ip_adapter")).toBe(true);
    const chain = getFallbackChain("local_ip_adapter");
    expect(chain?.skipBehavior).toContain("text prompt");
  });

  it("Real-ESRGAN can skip on failure (native resolution)", async () => {
    const { canSkipOnFailure, getFallbackChain } = await import("./provider-router/local-infra");
    expect(canSkipOnFailure("local_realesrgan")).toBe(true);
    const chain = getFallbackChain("local_realesrgan");
    expect(chain?.skipBehavior).toContain("native resolution");
  });

  it("AnimateDiff and SVD cannot skip", async () => {
    const { canSkipOnFailure } = await import("./provider-router/local-infra");
    expect(canSkipOnFailure("local_animatediff")).toBe(false);
    expect(canSkipOnFailure("local_svd")).toBe(false);
  });

  it("ControlNet falls back to Flux Pro", async () => {
    const { getFallbackProviderIds } = await import("./provider-router/local-infra");
    const ids = getFallbackProviderIds("local_controlnet");
    expect(ids).toContain("flux_11_pro");
  });

  it("isLocalProvider correctly identifies local providers", async () => {
    const { isLocalProvider } = await import("./provider-router/local-infra");
    expect(isLocalProvider("local_animatediff")).toBe(true);
    expect(isLocalProvider("local_rife")).toBe(true);
    expect(isLocalProvider("wan_21")).toBe(false);
    expect(isLocalProvider("kling_21_pro")).toBe(false);
  });

  it("getFallbackChain returns null for unknown providers", async () => {
    const { getFallbackChain } = await import("./provider-router/local-infra");
    expect(getFallbackChain("nonexistent")).toBeNull();
  });

  it("getFallbackProviderIds returns empty for unknown providers", async () => {
    const { getFallbackProviderIds } = await import("./provider-router/local-infra");
    expect(getFallbackProviderIds("nonexistent")).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Adapter Registration & Validation
// ═══════════════════════════════════════════════════════════════════════════

describe("Prompt 19 — Adapter Registration", () => {
  it("all 6 local adapters are registered in the provider registry", async () => {
    const { hasAdapter, getAdapter } = await import("./provider-router");
    const ids = [
      "local_animatediff", "local_svd", "local_rife",
      "local_controlnet", "local_ip_adapter", "local_realesrgan",
    ];
    for (const id of ids) {
      expect(hasAdapter(id)).toBe(true);
      const adapter = getAdapter(id);
      expect(adapter).toBeDefined();
      expect(adapter!.providerId).toBe(id);
    }
  });

  it("each adapter has validateParams, estimateCostUsd, and execute", async () => {
    const { getAdapter } = await import("./provider-router");
    const ids = [
      "local_animatediff", "local_svd", "local_rife",
      "local_controlnet", "local_ip_adapter", "local_realesrgan",
    ];
    for (const id of ids) {
      const adapter = getAdapter(id)!;
      expect(typeof adapter.validateParams).toBe("function");
      expect(typeof adapter.estimateCostUsd).toBe("function");
      expect(typeof adapter.execute).toBe("function");
    }
  });

  it("each adapter returns positive cost estimate", async () => {
    const { getAdapter } = await import("./provider-router");
    const testParams: Record<string, any> = {
      local_animatediff: { prompt: "test", durationSeconds: 3 },
      local_svd: { prompt: "test", imageUrl: "http://example.com/img.jpg", durationSeconds: 3 },
      local_rife: { prompt: "test", frameUrls: ["a.jpg"], upscaleFactor: 3 },
      local_controlnet: { prompt: "test", controlImageUrl: "http://example.com/ctrl.jpg" },
      local_ip_adapter: { prompt: "test", referenceImageUrls: ["http://example.com/ref.jpg"] },
      local_realesrgan: { prompt: "test", inputImageUrl: "http://example.com/img.jpg" },
    };
    for (const [id, params] of Object.entries(testParams)) {
      const adapter = getAdapter(id)!;
      const cost = adapter.estimateCostUsd(params);
      expect(cost).toBeGreaterThan(0);
    }
  });
});

describe("Prompt 19 — Adapter Validation", () => {
  it("AnimateDiff requires prompt", async () => {
    const { getAdapter } = await import("./provider-router");
    const adapter = getAdapter("local_animatediff")!;
    const result = adapter.validateParams({} as any);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("prompt required");
  });

  it("AnimateDiff rejects > 5s duration", async () => {
    const { getAdapter } = await import("./provider-router");
    const adapter = getAdapter("local_animatediff")!;
    const result = adapter.validateParams({ prompt: "test", durationSeconds: 10 } as any);
    expect(result.valid).toBe(false);
    expect(result.errors?.some(e => e.includes("max 5s"))).toBe(true);
  });

  it("AnimateDiff rejects invalid resolution", async () => {
    const { getAdapter } = await import("./provider-router");
    const adapter = getAdapter("local_animatediff")!;
    const result = adapter.validateParams({ prompt: "test", resolution: "1080p" } as any);
    expect(result.valid).toBe(false);
    expect(result.errors?.some(e => e.includes("480p"))).toBe(true);
  });

  it("AnimateDiff accepts valid params", async () => {
    const { getAdapter } = await import("./provider-router");
    const adapter = getAdapter("local_animatediff")!;
    const result = adapter.validateParams({ prompt: "anime scene", durationSeconds: 3, resolution: "768p" } as any);
    expect(result.valid).toBe(true);
  });

  it("SVD requires imageUrl", async () => {
    const { getAdapter } = await import("./provider-router");
    const adapter = getAdapter("local_svd")!;
    const result = adapter.validateParams({ prompt: "test" } as any);
    expect(result.valid).toBe(false);
    expect(result.errors?.some(e => e.includes("imageUrl"))).toBe(true);
  });

  it("SVD rejects > 4s duration", async () => {
    const { getAdapter } = await import("./provider-router");
    const adapter = getAdapter("local_svd")!;
    const result = adapter.validateParams({ imageUrl: "http://img.jpg", durationSeconds: 6 } as any);
    expect(result.valid).toBe(false);
    expect(result.errors?.some(e => e.includes("max 4s"))).toBe(true);
  });

  it("RIFE requires frameUrls or imageUrl", async () => {
    const { getAdapter } = await import("./provider-router");
    const adapter = getAdapter("local_rife")!;
    const result = adapter.validateParams({ prompt: "test" } as any);
    expect(result.valid).toBe(false);
    expect(result.errors?.some(e => e.includes("frameUrls"))).toBe(true);
  });

  it("RIFE rejects invalid upscaleFactor", async () => {
    const { getAdapter } = await import("./provider-router");
    const adapter = getAdapter("local_rife")!;
    const result = adapter.validateParams({ frameUrls: ["a.jpg"], upscaleFactor: 5 } as any);
    expect(result.valid).toBe(false);
    expect(result.errors?.some(e => e.includes("upscaleFactor"))).toBe(true);
  });

  it("ControlNet requires prompt and control image", async () => {
    const { getAdapter } = await import("./provider-router");
    const adapter = getAdapter("local_controlnet")!;
    const result = adapter.validateParams({} as any);
    expect(result.valid).toBe(false);
    expect(result.errors?.some(e => e.includes("prompt"))).toBe(true);
    expect(result.errors?.some(e => e.includes("controlImageUrl"))).toBe(true);
  });

  it("ControlNet rejects invalid controlType", async () => {
    const { getAdapter } = await import("./provider-router");
    const adapter = getAdapter("local_controlnet")!;
    const result = adapter.validateParams({
      prompt: "test", controlImageUrl: "http://img.jpg", controlType: "invalid",
    } as any);
    expect(result.valid).toBe(false);
    expect(result.errors?.some(e => e.includes("controlType"))).toBe(true);
  });

  it("ControlNet rejects > 1024 dimensions", async () => {
    const { getAdapter } = await import("./provider-router");
    const adapter = getAdapter("local_controlnet")!;
    const result = adapter.validateParams({
      prompt: "test", controlImageUrl: "http://img.jpg", width: 2048,
    } as any);
    expect(result.valid).toBe(false);
    expect(result.errors?.some(e => e.includes("max width"))).toBe(true);
  });

  it("IP-Adapter requires reference images", async () => {
    const { getAdapter } = await import("./provider-router");
    const adapter = getAdapter("local_ip_adapter")!;
    const result = adapter.validateParams({ prompt: "test" } as any);
    expect(result.valid).toBe(false);
    expect(result.errors?.some(e => e.includes("referenceImageUrls"))).toBe(true);
  });

  it("IP-Adapter rejects invalid variant", async () => {
    const { getAdapter } = await import("./provider-router");
    const adapter = getAdapter("local_ip_adapter")!;
    const result = adapter.validateParams({
      referenceImageUrls: ["http://ref.jpg"], variant: "invalid",
    } as any);
    expect(result.valid).toBe(false);
    expect(result.errors?.some(e => e.includes("variant"))).toBe(true);
  });

  it("Real-ESRGAN requires input image", async () => {
    const { getAdapter } = await import("./provider-router");
    const adapter = getAdapter("local_realesrgan")!;
    const result = adapter.validateParams({ prompt: "test" } as any);
    expect(result.valid).toBe(false);
    expect(result.errors?.some(e => e.includes("inputImageUrl"))).toBe(true);
  });

  it("Real-ESRGAN rejects invalid upscaleFactor", async () => {
    const { getAdapter } = await import("./provider-router");
    const adapter = getAdapter("local_realesrgan")!;
    const result = adapter.validateParams({ inputImageUrl: "http://img.jpg", upscaleFactor: 3 } as any);
    expect(result.valid).toBe(false);
    expect(result.errors?.some(e => e.includes("upscaleFactor"))).toBe(true);
  });

  it("Real-ESRGAN rejects output exceeding 4K", async () => {
    const { getAdapter } = await import("./provider-router");
    const adapter = getAdapter("local_realesrgan")!;
    const result = adapter.validateParams({
      inputImageUrl: "http://img.jpg", width: 2048, height: 2048, upscaleFactor: 4,
    } as any);
    expect(result.valid).toBe(false);
    expect(result.errors?.some(e => e.includes("4K"))).toBe(true);
  });

  it("Real-ESRGAN accepts valid params", async () => {
    const { getAdapter } = await import("./provider-router");
    const adapter = getAdapter("local_realesrgan")!;
    const result = adapter.validateParams({
      inputImageUrl: "http://img.jpg", width: 512, height: 512, upscaleFactor: 4,
    } as any);
    expect(result.valid).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Seed Data
// ═══════════════════════════════════════════════════════════════════════════

describe("Prompt 19 — Seed Data", () => {
  it("LOCAL_PROVIDER_SEEDS has 6 entries", async () => {
    const { LOCAL_PROVIDER_SEEDS } = await import("./provider-router/local-infra");
    expect(LOCAL_PROVIDER_SEEDS).toHaveLength(6);
  });

  it("each provider seed has required fields", async () => {
    const { LOCAL_PROVIDER_SEEDS } = await import("./provider-router/local-infra");
    for (const seed of LOCAL_PROVIDER_SEEDS) {
      expect(seed.id).toMatch(/^local_/);
      expect(seed.displayName).toBeTruthy();
      expect(seed.vendor).toBe("local");
      expect(["video", "image"].includes(seed.modality)).toBe(true);
      expect(seed.tier).toBeTruthy();
      expect(seed.capabilities).toBeTruthy();
      expect(seed.pricing).toBeTruthy();
    }
  });

  it("MODEL_ARTIFACT_SEEDS has 6 entries", async () => {
    const { MODEL_ARTIFACT_SEEDS } = await import("./provider-router/local-infra");
    expect(MODEL_ARTIFACT_SEEDS).toHaveLength(6);
  });

  it("each artifact seed has required fields", async () => {
    const { MODEL_ARTIFACT_SEEDS } = await import("./provider-router/local-infra");
    for (const seed of MODEL_ARTIFACT_SEEDS) {
      expect(seed.modelName).toBeTruthy();
      expect(seed.version).toBeTruthy();
      expect(seed.artifactPath).toContain("awakli-model-artifacts/");
      expect(seed.sizeBytes).toBeGreaterThan(0);
      expect(seed.checksumSha256).toBeTruthy();
      expect(seed.isActive).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Barrel Exports
// ═══════════════════════════════════════════════════════════════════════════

describe("Prompt 19 — Barrel Exports", () => {
  it("exports GPU cost model functions", async () => {
    const mod = await import("./provider-router/local-infra");
    expect(typeof mod.estimateGpuCost).toBe("function");
    expect(typeof mod.estimateInferenceTime).toBe("function");
    expect(typeof mod.estimateLocalProviderCost).toBe("function");
    expect(typeof mod.calculateActualCost).toBe("function");
    expect(typeof mod.compareCosts).toBe("function");
  });

  it("exports fallback mapping functions", async () => {
    const mod = await import("./provider-router/local-infra");
    expect(typeof mod.getFallbackChain).toBe("function");
    expect(typeof mod.getFallbackProviderIds).toBe("function");
    expect(typeof mod.isLocalProvider).toBe("function");
    expect(typeof mod.canSkipOnFailure).toBe("function");
    expect(mod.LOCAL_FALLBACK_MAP).toBeDefined();
  });

  it("exports model artifact manager functions", async () => {
    const mod = await import("./provider-router/local-infra");
    expect(typeof mod.getActiveArtifact).toBe("function");
    expect(typeof mod.getArtifactByVersion).toBe("function");
    expect(typeof mod.listArtifacts).toBe("function");
    expect(typeof mod.activateArtifactVersion).toBe("function");
    expect(typeof mod.registerArtifact).toBe("function");
    expect(typeof mod.getActiveEndpoint).toBe("function");
    expect(typeof mod.listEndpoints).toBe("function");
    expect(typeof mod.updateEndpointMetrics).toBe("function");
    expect(typeof mod.registerEndpoint).toBe("function");
    expect(typeof mod.checkVersionDrift).toBe("function");
  });

  it("exports GPU usage logger functions", async () => {
    const mod = await import("./provider-router/local-infra");
    expect(typeof mod.logGpuUsage).toBe("function");
    expect(typeof mod.getGpuCostSummary24h).toBe("function");
    expect(typeof mod.getTotalGpuSpend).toBe("function");
  });

  it("exports GPU health monitor functions", async () => {
    const mod = await import("./provider-router/local-infra");
    expect(typeof mod.runMonitorCycle).toBe("function");
    expect(typeof mod.startGpuMonitor).toBe("function");
    expect(typeof mod.stopGpuMonitor).toBe("function");
    expect(typeof mod.getLastMonitorReport).toBe("function");
    expect(typeof mod.isMonitorRunning).toBe("function");
    expect(mod.MONITOR_CONFIG).toBeDefined();
  });

  it("exports platform clients", async () => {
    const mod = await import("./provider-router/local-infra");
    expect(mod.runpodClient).toBeDefined();
    expect(mod.runpodClient.platform).toBe("runpod");
    expect(mod.modalClient).toBeDefined();
    expect(mod.modalClient.platform).toBe("modal");
  });

  it("exports seed data", async () => {
    const mod = await import("./provider-router/local-infra");
    expect(typeof mod.seedLocalProviders).toBe("function");
    expect(typeof mod.seedModelArtifacts).toBe("function");
    expect(mod.LOCAL_PROVIDER_SEEDS).toBeDefined();
    expect(mod.MODEL_ARTIFACT_SEEDS).toBeDefined();
  });

  it("exports createLocalAdapter factory", async () => {
    const mod = await import("./provider-router/local-infra");
    expect(typeof mod.createLocalAdapter).toBe("function");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. tRPC Admin Router — Auth Guards
// ═══════════════════════════════════════════════════════════════════════════

describe("Prompt 19 — localInfra tRPC Router Auth", () => {
  it("rejects unauthenticated users on overview", async () => {
    const caller = appRouter.createCaller(createUnauthContext());
    await expect(caller.localInfra.overview()).rejects.toThrow();
  });

  it("rejects non-admin users on overview", async () => {
    const caller = appRouter.createCaller(createUserContext().ctx);
    await expect(caller.localInfra.overview()).rejects.toThrow(/Admin only/i);
  });

  it("rejects non-admin users on listEndpoints", async () => {
    const caller = appRouter.createCaller(createUserContext().ctx);
    await expect(caller.localInfra.listEndpoints()).rejects.toThrow(/Admin only/i);
  });

  it("rejects non-admin users on listArtifacts", async () => {
    const caller = appRouter.createCaller(createUserContext().ctx);
    await expect(caller.localInfra.listArtifacts()).rejects.toThrow(/Admin only/i);
  });

  it("rejects non-admin users on costComparison", async () => {
    const caller = appRouter.createCaller(createUserContext().ctx);
    await expect(caller.localInfra.costComparison()).rejects.toThrow(/Admin only/i);
  });

  it("rejects non-admin users on seedData", async () => {
    const caller = appRouter.createCaller(createUserContext().ctx);
    await expect(caller.localInfra.seedData()).rejects.toThrow(/Admin only/i);
  });

  it("rejects non-admin users on fallbackMap", async () => {
    const caller = appRouter.createCaller(createUserContext().ctx);
    await expect(caller.localInfra.fallbackMap()).rejects.toThrow(/Admin only/i);
  });

  it("rejects non-admin users on triggerMonitor", async () => {
    const caller = appRouter.createCaller(createUserContext().ctx);
    await expect(caller.localInfra.triggerMonitor()).rejects.toThrow(/Admin only/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. tRPC Admin Router — Data Shape
// ═══════════════════════════════════════════════════════════════════════════

describe("Prompt 19 — localInfra tRPC Router Data", () => {
  it("overview returns expected shape", async () => {
    const caller = appRouter.createCaller(createAdminContext().ctx);
    const data = await caller.localInfra.overview();
    expect(data).toHaveProperty("endpoints");
    expect(data).toHaveProperty("artifacts");
    expect(data).toHaveProperty("cost24h");
    expect(data).toHaveProperty("cost7d");
    expect(data).toHaveProperty("costByModel");
    expect(data).toHaveProperty("alerts");
    expect(data).toHaveProperty("versionDrift");
    expect(data).toHaveProperty("monitorRunning");
    expect(Array.isArray(data.endpoints)).toBe(true);
    expect(Array.isArray(data.artifacts)).toBe(true);
    expect(Array.isArray(data.costByModel)).toBe(true);
    expect(Array.isArray(data.alerts)).toBe(true);
    expect(Array.isArray(data.versionDrift)).toBe(true);
    expect(typeof data.cost24h.totalCostUsd).toBe("number");
    expect(typeof data.cost24h.totalGpuSeconds).toBe("number");
    expect(typeof data.cost24h.coldStartRate).toBe("number");
  });

  it("listEndpoints returns array", async () => {
    const caller = appRouter.createCaller(createAdminContext().ctx);
    const endpoints = await caller.localInfra.listEndpoints();
    expect(Array.isArray(endpoints)).toBe(true);
  });

  it("listArtifacts returns array", async () => {
    const caller = appRouter.createCaller(createAdminContext().ctx);
    const artifacts = await caller.localInfra.listArtifacts();
    expect(Array.isArray(artifacts)).toBe(true);
  });

  it("costComparison returns array with expected fields", async () => {
    const caller = appRouter.createCaller(createAdminContext().ctx);
    const comparisons = await caller.localInfra.costComparison();
    expect(Array.isArray(comparisons)).toBe(true);
    // Should have 6 entries (one per local provider)
    expect(comparisons.length).toBe(6);
    for (const c of comparisons) {
      expect(c).toHaveProperty("providerId");
      expect(c).toHaveProperty("modelName");
      expect(c).toHaveProperty("gpuType");
      expect(c).toHaveProperty("localCostUsd");
      expect(c).toHaveProperty("localCostCredits");
      expect(c).toHaveProperty("estimatedGpuSeconds");
      expect(typeof c.localCostUsd).toBe("number");
      expect(c.localCostUsd).toBeGreaterThan(0);
    }
  });

  it("fallbackMap returns array with expected structure", async () => {
    const caller = appRouter.createCaller(createAdminContext().ctx);
    const map = await caller.localInfra.fallbackMap();
    expect(Array.isArray(map)).toBe(true);
    expect(map.length).toBe(6);
    for (const chain of map) {
      expect(chain).toHaveProperty("localProviderId");
      expect(chain).toHaveProperty("fallbacks");
      expect(chain).toHaveProperty("canSkip");
      expect(Array.isArray(chain.fallbacks)).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. Platform Client Interface
// ═══════════════════════════════════════════════════════════════════════════

describe("Prompt 19 — Platform Clients", () => {
  it("RunPod client implements GpuPlatformClient interface", async () => {
    const { runpodClient } = await import("./provider-router/local-infra");
    expect(runpodClient.platform).toBe("runpod");
    expect(typeof runpodClient.submitJob).toBe("function");
    expect(typeof runpodClient.getJobStatus).toBe("function");
    expect(typeof runpodClient.runSync).toBe("function");
    expect(typeof runpodClient.healthCheck).toBe("function");
    expect(typeof runpodClient.getMetrics).toBe("function");
  });

  it("Modal client implements GpuPlatformClient interface", async () => {
    const { modalClient } = await import("./provider-router/local-infra");
    expect(modalClient.platform).toBe("modal");
    expect(typeof modalClient.submitJob).toBe("function");
    expect(typeof modalClient.getJobStatus).toBe("function");
    expect(typeof modalClient.runSync).toBe("function");
    expect(typeof modalClient.healthCheck).toBe("function");
    expect(typeof modalClient.getMetrics).toBe("function");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. Monitor Config
// ═══════════════════════════════════════════════════════════════════════════

describe("Prompt 19 — Monitor Config", () => {
  it("MONITOR_CONFIG has sensible defaults", async () => {
    const { MONITOR_CONFIG } = await import("./provider-router/local-infra");
    expect(MONITOR_CONFIG.pollIntervalMs).toBeGreaterThan(0);
    expect(MONITOR_CONFIG.coldStartRateThreshold).toBeGreaterThan(0);
    expect(MONITOR_CONFIG.coldStartRateThreshold).toBeLessThanOrEqual(1);
    expect(MONITOR_CONFIG.dailyCostAlertUsd).toBeGreaterThan(0);
    expect(MONITOR_CONFIG.queueOverloadThreshold).toBeGreaterThan(0);
  });
});
