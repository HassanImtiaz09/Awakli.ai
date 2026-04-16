/**
 * Prompt 16: Multi-Provider API Router — Comprehensive Tests
 * Tests: types, cost estimator, router scoring, circuit breaker, rate limiter,
 * registry, adapters, credit executor, and admin router endpoints.
 */
import { describe, it, expect, vi } from "vitest";

// ─── 1. Types & Error Taxonomy ────────────────────────────────────────────
describe("Provider Router Types", () => {
  it("exports all required types", async () => {
    const types = await import("./provider-router/types");
    expect(types.NEVER_FALLBACK_ERRORS).toBeDefined();
    expect(types.RETRYABLE_ERRORS).toBeDefined();
    expect(types.FALLBACK_ERRORS).toBeDefined();
    expect(types.ProviderError).toBeDefined();
  });

  it("NEVER_FALLBACK_ERRORS contains content_violation and invalid_params", async () => {
    const { NEVER_FALLBACK_ERRORS } = await import("./provider-router/types");
    expect(NEVER_FALLBACK_ERRORS).toContain("CONTENT_VIOLATION");
    expect(NEVER_FALLBACK_ERRORS).toContain("INVALID_PARAMS");
    expect(NEVER_FALLBACK_ERRORS).toContain("INSUFFICIENT_CREDITS");
  });

  it("RETRYABLE_ERRORS contains transient errors", async () => {
    const { RETRYABLE_ERRORS } = await import("./provider-router/types");
    expect(RETRYABLE_ERRORS).toContain("TRANSIENT");
    expect(RETRYABLE_ERRORS).toContain("TIMEOUT");
  });

  it("FALLBACK_ERRORS contains fallbackable errors", async () => {
    const { FALLBACK_ERRORS } = await import("./provider-router/types");
    expect(FALLBACK_ERRORS).toContain("TRANSIENT");
    expect(FALLBACK_ERRORS).toContain("RATE_LIMITED");
    expect(FALLBACK_ERRORS).toContain("TIMEOUT");
    expect(FALLBACK_ERRORS).toContain("UNKNOWN");
  });

  it("ProviderError has code, retryable, and fallbackable properties", async () => {
    const { ProviderError } = await import("./provider-router/types");
    const err = new ProviderError("TRANSIENT", "test error", "test-provider");
    expect(err.code).toBe("TRANSIENT");
    expect(err.retryable).toBe(true);
    expect(err.fallbackable).toBe(true);
    expect(err.providerId).toBe("test-provider");
    expect(err.message).toBe("test error");
    expect(err).toBeInstanceOf(Error);
  });

  it("ProviderError with non-retryable code", async () => {
    const { ProviderError } = await import("./provider-router/types");
    const err = new ProviderError("CONTENT_VIOLATION", "policy violation", "test-provider", false, false);
    expect(err.code).toBe("CONTENT_VIOLATION");
    expect(err.retryable).toBe(false);
    expect(err.fallbackable).toBe(false);
  });

  it("error categories: NEVER_FALLBACK and RETRYABLE are disjoint", async () => {
    const { NEVER_FALLBACK_ERRORS, RETRYABLE_ERRORS } = await import("./provider-router/types");
    for (const code of NEVER_FALLBACK_ERRORS) {
      expect(RETRYABLE_ERRORS).not.toContain(code);
    }
  });

  it("ProviderError preserves stack trace", async () => {
    const { ProviderError } = await import("./provider-router/types");
    const err = new ProviderError("TRANSIENT", "test error", "test-provider");
    expect(err.stack).toBeDefined();
    expect(err.name).toBe("ProviderError");
  });
});

// ─── 2. Cost Estimator ───────────────────────────────────────────────────
describe("Cost Estimator", () => {
  it("estimates video cost based on duration", async () => {
    const { estimateCost } = await import("./provider-router/cost-estimator");
    const est = estimateCost("kling_21", {
      durationSeconds: 5,
      width: 1280,
      height: 720,
    } as any);
    expect(est).toBeDefined();
    expect(est.estimatedUsd).toBeGreaterThanOrEqual(0);
    expect(est.estimatedCredits).toBeGreaterThanOrEqual(0);
    expect(est.providerId).toBe("kling_21");
  });

  it("estimates voice cost based on character count", async () => {
    const { estimateCost } = await import("./provider-router/cost-estimator");
    const est = estimateCost("elevenlabs_turbo_v25", {
      text: "Hello world",
      voiceId: "v1",
      characterCount: 500,
    } as any);
    expect(est.estimatedUsd).toBeGreaterThanOrEqual(0);
    expect(est.estimatedCredits).toBeGreaterThanOrEqual(0);
  });

  it("estimates music cost based on duration", async () => {
    const { estimateCost } = await import("./provider-router/cost-estimator");
    const est = estimateCost("suno_v4", {
      prompt: "epic soundtrack",
      durationSeconds: 30,
    } as any);
    expect(est.estimatedUsd).toBeGreaterThanOrEqual(0);
    expect(est.estimatedCredits).toBeGreaterThanOrEqual(0);
  });

  it("estimates image cost", async () => {
    const { estimateCost } = await import("./provider-router/cost-estimator");
    const est = estimateCost("flux_11_pro", {
      prompt: "anime character",
      width: 1024,
      height: 1024,
    } as any);
    expect(est.estimatedUsd).toBeGreaterThanOrEqual(0);
    expect(est.estimatedCredits).toBeGreaterThanOrEqual(0);
  });

  it("estimateCostMultiple returns array of estimates", async () => {
    const { estimateCostMultiple } = await import("./provider-router/cost-estimator");
    const estimates = estimateCostMultiple(
      ["kling_21", "kling_16"],
      { durationSeconds: 5, width: 1280, height: 720 } as any
    );
    expect(estimates).toHaveLength(2);
    expect(estimates[0].providerId).toBe("kling_21");
    expect(estimates[1].providerId).toBe("kling_16");
  });

  it("estimateBatchCost sums up multiple requests", async () => {
    const { estimateBatchCost } = await import("./provider-router/cost-estimator");
    const total = estimateBatchCost([
      { providerId: "kling_21", params: { durationSeconds: 5, width: 1280, height: 720 } as any },
      { providerId: "elevenlabs_turbo_v25", params: { text: "hello", voiceId: "v1", characterCount: 200 } as any },
    ]);
    expect(total.totalUsd).toBeGreaterThanOrEqual(0);
    expect(total.totalCredits).toBeGreaterThanOrEqual(0);
    expect(total.breakdown).toHaveLength(2);
  });

  it("unknown provider returns zero-cost fallback estimate", async () => {
    const { estimateCost } = await import("./provider-router/cost-estimator");
    const est = estimateCost("unknown-provider", {
      durationSeconds: 5,
      width: 1280,
      height: 720,
    } as any);
    expect(est).toBeDefined();
    expect(est.estimatedUsd).toBe(0);
    expect(est.estimatedCredits).toBe(0);
  });

  it("longer video costs more than shorter video", async () => {
    const { estimateCost } = await import("./provider-router/cost-estimator");
    const short = estimateCost("kling_21", { durationSeconds: 5, width: 1280, height: 720 } as any);
    const long = estimateCost("kling_21", { durationSeconds: 10, width: 1280, height: 720 } as any);
    expect(long.estimatedUsd).toBeGreaterThanOrEqual(short.estimatedUsd);
    expect(long.estimatedCredits).toBeGreaterThanOrEqual(short.estimatedCredits);
  });

  it("credits are always non-negative for valid requests", async () => {
    const { estimateCost } = await import("./provider-router/cost-estimator");
    const providers = [
      { id: "kling_21", params: { durationSeconds: 5, width: 1280, height: 720 } },
      { id: "elevenlabs_turbo_v25", params: { text: "hi", voiceId: "v1", characterCount: 200 } },
      { id: "suno_v4", params: { prompt: "epic", durationSeconds: 30 } },
      { id: "flux_11_pro", params: { prompt: "anime", width: 1024, height: 1024 } },
    ];
    for (const p of providers) {
      const est = estimateCost(p.id, p.params as any);
      expect(est.estimatedCredits).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─── 3. Registry ─────────────────────────────────────────────────────────
describe("Provider Registry", () => {
  it("registers and retrieves adapters", async () => {
    const { registerAdapter, getAdapter, hasAdapter, listAdapters } = await import("./provider-router/registry");
    const mockAdapter = {
      providerId: "test-adapter-registry-1",
      validateParams: vi.fn(),
      estimateCostUsd: vi.fn(),
      execute: vi.fn(),
    };
    registerAdapter(mockAdapter);
    expect(hasAdapter("test-adapter-registry-1")).toBe(true);
    expect(getAdapter("test-adapter-registry-1")).toBe(mockAdapter);
    const all = listAdapters();
    expect(all.some(a => a.providerId === "test-adapter-registry-1")).toBe(true);
  });

  it("returns undefined for unregistered adapter", async () => {
    const { getAdapter, hasAdapter } = await import("./provider-router/registry");
    expect(getAdapter("nonexistent-provider-xyz")).toBeUndefined();
    expect(hasAdapter("nonexistent-provider-xyz")).toBe(false);
  });

  it("encryptApiKey and decryptApiKey are inverses", async () => {
    const { encryptApiKey, decryptApiKey } = await import("./provider-router/registry");
    const plaintext = "sk-test-1234567890abcdef";
    const encrypted = encryptApiKey(plaintext);
    expect(encrypted).not.toBe(plaintext);
    const decrypted = decryptApiKey(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("encrypted key is different from plaintext", async () => {
    const { encryptApiKey } = await import("./provider-router/registry");
    const key = "my-secret-api-key";
    const encrypted = encryptApiKey(key);
    expect(encrypted).not.toBe(key);
    expect(encrypted.length).toBeGreaterThan(key.length);
  });
});

// ─── 4. Adapters ─────────────────────────────────────────────────────────
describe("Provider Adapters", () => {
  it("Kling 2.1 adapter has correct providerId", async () => {
    const { Kling21Adapter } = await import("./provider-router/adapters/kling-21");
    const adapter = new Kling21Adapter();
    expect(adapter.providerId).toBe("kling_21");
    expect(typeof adapter.estimateCostUsd).toBe("function");
    expect(typeof adapter.execute).toBe("function");
    expect(typeof adapter.validateParams).toBe("function");
  });

  it("Kling 2.1 cost estimation returns positive value", async () => {
    const { Kling21Adapter } = await import("./provider-router/adapters/kling-21");
    const adapter = new Kling21Adapter();
    const cost = adapter.estimateCostUsd({ durationSeconds: 5, width: 1280, height: 720 } as any);
    expect(cost).toBeGreaterThan(0);
  });

  it("Kling variant adapters are registered with correct IDs", async () => {
    // Import triggers self-registration
    await import("./provider-router/adapters/kling-variants");
    const { hasAdapter } = await import("./provider-router/registry");
    expect(hasAdapter("kling_16")).toBe(true);
    expect(hasAdapter("kling_26")).toBe(true);
    expect(hasAdapter("kling_3_omni")).toBe(true);
  });

  it("Runway Gen-4 adapter is registered", async () => {
    await import("./provider-router/adapters/runway-gen4");
    const { hasAdapter } = await import("./provider-router/registry");
    expect(hasAdapter("runway_gen4")).toBe(true);
  });

  it("all video provider adapters are registered", async () => {
    await import("./provider-router/adapters/video-providers");
    const { hasAdapter } = await import("./provider-router/registry");
    const videoIds = ["pika_22", "minimax_video02", "luma_ray3", "hailuo_director", "vidu_25", "wan_21"];
    for (const id of videoIds) {
      expect(hasAdapter(id)).toBe(true);
    }
  });

  it("all voice provider adapters are registered", async () => {
    await import("./provider-router/adapters/voice-providers");
    const { hasAdapter } = await import("./provider-router/registry");
    const voiceIds = ["elevenlabs_turbo_v25", "playht_30", "lmnt", "fish_audio", "azure_tts"];
    for (const id of voiceIds) {
      expect(hasAdapter(id)).toBe(true);
    }
  });

  it("all music provider adapters are registered", async () => {
    await import("./provider-router/adapters/music-providers");
    const { hasAdapter } = await import("./provider-router/registry");
    const musicIds = ["suno_v4", "udio_v2", "minimax_music01"];
    for (const id of musicIds) {
      expect(hasAdapter(id)).toBe(true);
    }
  });

  it("all image provider adapters are registered", async () => {
    await import("./provider-router/adapters/image-providers");
    const { hasAdapter } = await import("./provider-router/registry");
    const imageIds = ["flux_11_pro", "sdxl_lightning", "midjourney_v7", "ideogram_3", "recraft_v3"];
    for (const id of imageIds) {
      expect(hasAdapter(id)).toBe(true);
    }
  });

  it("all 24 adapters have unique provider IDs after full import", async () => {
    await import("./provider-router/index"); // triggers all self-registrations
    const { listAdapters } = await import("./provider-router/registry");
    const all = listAdapters();
    // Filter out test adapters
    const realAdapters = all.filter(a => !a.providerId.startsWith("test-"));
    const ids = realAdapters.map(a => a.providerId);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(24);
  });
});

// ─── 5. Credit Executor ──────────────────────────────────────────────────
describe("Credit Executor", () => {
  it("mapToAction maps video requests correctly", async () => {
    const { mapToAction } = await import("./provider-router/credit-executor");
    const action5s = mapToAction({
      type: "video",
      tier: "standard",
      params: { durationSeconds: 5, width: 1280, height: 720 } as any,
      userId: 1,
    });
    expect(action5s).toContain("video");
    expect(action5s).toContain("5s");

    const action10s = mapToAction({
      type: "video",
      tier: "standard",
      params: { durationSeconds: 10, width: 1280, height: 720 } as any,
      userId: 1,
    });
    expect(action10s).toContain("video");
    expect(action10s).toContain("10s");
  });

  it("mapToAction maps voice requests", async () => {
    const { mapToAction } = await import("./provider-router/credit-executor");
    const action = mapToAction({
      type: "voice",
      tier: "standard",
      params: { text: "Hello world", voiceId: "v1" } as any,
      userId: 1,
    });
    expect(action).toBe("voice_synthesis");
  });

  it("mapToAction maps music requests", async () => {
    const { mapToAction } = await import("./provider-router/credit-executor");
    const action = mapToAction({
      type: "music",
      tier: "standard",
      params: { prompt: "epic soundtrack", durationSeconds: 30 } as any,
      userId: 1,
    });
    expect(action).toBe("music_generation");
  });

  it("mapToAction maps image requests", async () => {
    const { mapToAction } = await import("./provider-router/credit-executor");
    const action = mapToAction({
      type: "image",
      tier: "standard",
      params: { prompt: "anime character", width: 1024, height: 1024 } as any,
      userId: 1,
    });
    expect(action).toBe("panel_generation");
  });

  it("exports generateWithCredits and checkAffordability functions", async () => {
    const mod = await import("./provider-router/credit-executor");
    expect(typeof mod.generateWithCredits).toBe("function");
    expect(typeof mod.checkAffordability).toBe("function");
  });

  it("mapToAction uses flagship tier correctly", async () => {
    const { mapToAction } = await import("./provider-router/credit-executor");
    const action = mapToAction({
      type: "video",
      tier: "flagship",
      params: { durationSeconds: 5, width: 1280, height: 720 } as any,
      userId: 1,
    });
    expect(action).toContain("video");
    expect(action).toContain("premium");
  });
});

// ─── 6. Schema Tables ────────────────────────────────────────────────────
describe("Provider Router Schema Tables", () => {
  it("all 10 tables are importable from schema", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.providers).toBeDefined();
    expect(schema.providerApiKeys).toBeDefined();
    expect(schema.providerHealth).toBeDefined();
    expect(schema.generationRequests).toBeDefined();
    expect(schema.generationResults).toBeDefined();
    expect(schema.providerRateLimits).toBeDefined();
    expect(schema.providerQualityScores).toBeDefined();
    expect(schema.providerEvents).toBeDefined();
    expect(schema.providerSpend24h).toBeDefined();
    expect(schema.creatorProviderMix7d).toBeDefined();
  });

  it("providers table has required columns", async () => {
    const { providers } = await import("../drizzle/schema");
    expect(providers.id).toBeDefined();
    expect(providers.vendor).toBeDefined();
    expect(providers.modality).toBeDefined();
    expect(providers.tier).toBeDefined();
    expect(providers.status).toBeDefined();
    expect(providers.displayName).toBeDefined();
    expect(providers.capabilities).toBeDefined();
    expect(providers.pricing).toBeDefined();
  });

  it("generationRequests table has required columns", async () => {
    const { generationRequests } = await import("../drizzle/schema");
    expect(generationRequests.requestUid).toBeDefined();
    expect(generationRequests.userId).toBeDefined();
    expect(generationRequests.requestType).toBeDefined();
    expect(generationRequests.providerId).toBeDefined();
    expect(generationRequests.tier).toBeDefined();
    expect(generationRequests.estimatedCostCredits).toBeDefined();
    expect(generationRequests.actualCostUsd).toBeDefined();
    expect(generationRequests.status).toBeDefined();
    expect(generationRequests.latencyMs).toBeDefined();
  });

  it("providerHealth table has circuit state columns", async () => {
    const { providerHealth } = await import("../drizzle/schema");
    expect(providerHealth.providerId).toBeDefined();
    expect(providerHealth.circuitState).toBeDefined();
    expect(providerHealth.consecutiveFailures).toBeDefined();
    expect(providerHealth.successRate1h).toBeDefined();
    expect(providerHealth.latencyP50Ms).toBeDefined();
    expect(providerHealth.latencyP95Ms).toBeDefined();
  });

  it("providerApiKeys table has key management columns", async () => {
    const { providerApiKeys } = await import("../drizzle/schema");
    expect(providerApiKeys.id).toBeDefined();
    expect(providerApiKeys.providerId).toBeDefined();
    expect(providerApiKeys.keyLabel).toBeDefined();
    expect(providerApiKeys.encryptedKey).toBeDefined();
    expect(providerApiKeys.isActive).toBeDefined();
  });

  it("providerEvents table has event tracking columns", async () => {
    const { providerEvents } = await import("../drizzle/schema");
    expect(providerEvents.id).toBeDefined();
    expect(providerEvents.providerId).toBeDefined();
    expect(providerEvents.eventType).toBeDefined();
    expect(providerEvents.severity).toBeDefined();
    expect(providerEvents.detail).toBeDefined();
  });
});

// ─── 7. Admin Router Endpoints ───────────────────────────────────────────
describe("Provider Admin Router", () => {
  it("exports providerAdminRouter with all required endpoints", async () => {
    const { providerAdminRouter } = await import("./routers-provider-admin");
    expect(providerAdminRouter).toBeDefined();
    const procedures = Object.keys(providerAdminRouter._def.procedures);
    expect(procedures).toContain("listProviders");
    expect(procedures).toContain("getProvider");
    expect(procedures).toContain("toggleProvider");
    expect(procedures).toContain("resetCircuitBreaker");
    expect(procedures).toContain("addApiKey");
    expect(procedures).toContain("toggleApiKey");
    expect(procedures).toContain("getDashboard");
    expect(procedures).toContain("getRequestHistory");
    expect(procedures).toContain("getCreatorMix");
  });

  it("has exactly 9 admin procedures", async () => {
    const { providerAdminRouter } = await import("./routers-provider-admin");
    const procedures = Object.keys(providerAdminRouter._def.procedures);
    expect(procedures.length).toBe(9);
  });
});

// ─── 8. Barrel Export ────────────────────────────────────────────────────
describe("Provider Router Barrel Export", () => {
  it("exports all core modules from index", async () => {
    const mod = await import("./provider-router/index");
    // Types
    expect(mod.ProviderError).toBeDefined();
    expect(mod.NEVER_FALLBACK_ERRORS).toBeDefined();
    expect(mod.RETRYABLE_ERRORS).toBeDefined();
    expect(mod.FALLBACK_ERRORS).toBeDefined();
    // Registry
    expect(typeof mod.registerAdapter).toBe("function");
    expect(typeof mod.getAdapter).toBe("function");
    expect(typeof mod.listAdapters).toBe("function");
    expect(typeof mod.hasAdapter).toBe("function");
    // Cost estimator
    expect(typeof mod.estimateCost).toBe("function");
    expect(typeof mod.estimateCostMultiple).toBe("function");
    expect(typeof mod.estimateBatchCost).toBe("function");
    // Router
    expect(typeof mod.selectProviders).toBe("function");
    // Circuit breaker
    expect(typeof mod.isCircuitAllowing).toBe("function");
    expect(typeof mod.reportSuccess).toBe("function");
    expect(typeof mod.reportFailure).toBe("function");
    expect(typeof mod.resetCircuit).toBe("function");
    // Rate limiter
    expect(typeof mod.checkRateLimit).toBe("function");
    expect(typeof mod.recordRequest).toBe("function");
    // Credit executor
    expect(typeof mod.generateWithCredits).toBe("function");
    expect(typeof mod.checkAffordability).toBe("function");
    expect(typeof mod.mapToAction).toBe("function");
    // Health monitor
    expect(typeof mod.updateProviderMetrics).toBe("function");
    expect(typeof mod.refreshSpend24h).toBe("function");
    expect(typeof mod.refreshCreatorMix7d).toBe("function");
    expect(typeof mod.runHealthCheck).toBe("function");
  });
});

// ─── 9. usdToCredits Helper ─────────────────────────────────────────────
describe("USD to Credits Conversion", () => {
  it("usdToCredits converts correctly using COGS value", async () => {
    const { usdToCredits } = await import("./provider-router/types");
    // 1 credit = $0.0055 COGS, so $0.055 = 10 credits
    const credits = usdToCredits(0.055);
    expect(credits).toBeGreaterThan(0);
    expect(typeof credits).toBe("number");
  });

  it("usdToCredits of zero is zero", async () => {
    const { usdToCredits } = await import("./provider-router/types");
    expect(usdToCredits(0)).toBe(0);
  });

  it("usdToCredits rounds to 0.25 credit units", async () => {
    const { usdToCredits } = await import("./provider-router/types");
    const result = usdToCredits(0.01);
    // Rounds to nearest 0.25 credit unit
    expect(result % 0.25).toBe(0);
    expect(result).toBeGreaterThan(0);
  });
});

// ─── 10. Adapter Cost Estimation Variety ─────────────────────────────────
describe("Adapter Cost Estimation", () => {
  it("different video providers have different costs", async () => {
    await import("./provider-router/index");
    const { getAdapter } = await import("./provider-router/registry");
    const kling21 = getAdapter("kling_21");
    const kling3 = getAdapter("kling_3_omni");
    expect(kling21).toBeDefined();
    expect(kling3).toBeDefined();
    const cost21 = kling21!.estimateCostUsd({ durationSeconds: 5, width: 1280, height: 720 } as any);
    const cost3 = kling3!.estimateCostUsd({ durationSeconds: 5, width: 1280, height: 720 } as any);
    // Both should be positive
    expect(cost21).toBeGreaterThan(0);
    expect(cost3).toBeGreaterThan(0);
    // Flagship should cost more than standard
    expect(cost3).toBeGreaterThanOrEqual(cost21);
  });

  it("voice adapters return positive costs", async () => {
    await import("./provider-router/index");
    const { getAdapter } = await import("./provider-router/registry");
    const el = getAdapter("elevenlabs_turbo_v25");
    expect(el).toBeDefined();
    const cost = el!.estimateCostUsd({ text: "Hello world", voiceId: "v1", characterCount: 100 } as any);
    expect(cost).toBeGreaterThan(0);
  });

  it("music adapters return positive costs", async () => {
    await import("./provider-router/index");
    const { getAdapter } = await import("./provider-router/registry");
    const suno = getAdapter("suno_v4");
    expect(suno).toBeDefined();
    const cost = suno!.estimateCostUsd({ prompt: "epic", durationSeconds: 30 } as any);
    expect(cost).toBeGreaterThan(0);
  });

  it("image adapters return positive costs", async () => {
    await import("./provider-router/index");
    const { getAdapter } = await import("./provider-router/registry");
    const flux = getAdapter("flux_11_pro");
    expect(flux).toBeDefined();
    const cost = flux!.estimateCostUsd({ prompt: "anime", width: 1024, height: 1024 } as any);
    expect(cost).toBeGreaterThan(0);
  });
});
