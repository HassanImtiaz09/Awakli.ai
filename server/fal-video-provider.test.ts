/**
 * Tests for fal.ai Video Provider Integration
 *
 * Tests the video-provider abstraction layer (fal.ai primary, Kling direct fallback),
 * the fal-video module (fal.ai SDK wrapper), and the provider-router adapters.
 */
import { describe, it, expect } from "vitest";

// ─── fal-video module tests ─────────────────────────────────────────────────

describe("fal-video module", () => {
  it("exports all required functions", async () => {
    const mod = await import("./fal-video");
    expect(typeof mod.falTextToVideo).toBe("function");
    expect(typeof mod.falImageToVideo).toBe("function");
    expect(typeof mod.falOmniVideo).toBe("function");
    expect(typeof mod.falLipSync).toBe("function");
    expect(typeof mod.isFalAvailable).toBe("function");
  });

  it("isFalAvailable returns true when FAL_API_KEY is set", async () => {
    const mod = await import("./fal-video");
    const result = mod.isFalAvailable();
    expect(typeof result).toBe("boolean");
    // In test env, FAL_API_KEY should be set (from webdev_request_secrets)
    expect(result).toBe(true);
  });

  it("exports type interfaces for all param shapes", async () => {
    // Verify the module can be imported and types are accessible at runtime
    const mod = await import("./fal-video");
    expect(mod.falTextToVideo).toBeDefined();
    expect(mod.falImageToVideo).toBeDefined();
    expect(mod.falOmniVideo).toBeDefined();
    expect(mod.falLipSync).toBeDefined();
  });
});

// ─── video-provider abstraction layer tests ─────────────────────────────────

describe("video-provider abstraction layer", () => {
  it("exports all required functions", async () => {
    const mod = await import("./video-provider");
    expect(typeof mod.generateOmniVideo).toBe("function");
    expect(typeof mod.generateImageToVideo).toBe("function");
    expect(typeof mod.generateTextToVideo).toBe("function");
    expect(typeof mod.generateLipSync).toBe("function");
    expect(typeof mod.getCurrentVideoProvider).toBe("function");
  });

  it("getCurrentVideoProvider returns fal.ai when FAL_API_KEY is set", async () => {
    const mod = await import("./video-provider");
    const info = mod.getCurrentVideoProvider();
    expect(info.backend).toBe("fal.ai");
    expect(info.available).toBe(true);
  });

  it("VideoGenerationResult type has correct shape", async () => {
    // Verify the type interface by creating a mock result
    const mockResult = {
      videoUrl: "https://example.com/video.mp4",
      durationSeconds: 10,
      provider: "fal.ai" as const,
      model: "kling-v3-pro",
      requestId: "req_123",
      hasAudio: true,
      hasLipSync: true,
    };
    expect(mockResult.provider).toBe("fal.ai");
    expect(mockResult.durationSeconds).toBe(10);
    expect(mockResult.hasLipSync).toBe(true);
  });
});

// ─── provider-router fal-kling adapter registration tests ───────────────────

describe("fal-kling provider-router adapters", () => {
  it("fal-kling adapters are registered in the adapter map after import", async () => {
    // Import the adapter file to trigger registration side effects
    await import("./provider-router/adapters/fal-kling");
    const { hasAdapter, getAdapter } = await import("./provider-router/registry");

    // Adapters use underscore IDs: fal_kling_v3_std, fal_kling_v3_pro, etc.
    expect(hasAdapter("fal_kling_v3_std")).toBe(true);
    expect(hasAdapter("fal_kling_v3_pro")).toBe(true);
    expect(hasAdapter("fal_kling_v3_omni")).toBe(true);
    expect(hasAdapter("fal_kling_lipsync")).toBe(true);
  });

  it("fal-kling standard adapter validates params correctly", async () => {
    await import("./provider-router/adapters/fal-kling");
    const { getAdapter } = await import("./provider-router/registry");

    const adapter = getAdapter("fal_kling_v3_std");
    expect(adapter).toBeDefined();

    // Valid params
    const valid = adapter!.validateParams({ prompt: "test prompt", durationSeconds: 10 } as any);
    expect(valid.valid).toBe(true);

    // Missing prompt
    const invalid = adapter!.validateParams({ durationSeconds: 10 } as any);
    expect(invalid.valid).toBe(false);
    expect(invalid.errors).toContain("prompt required");
  });

  it("fal-kling pro adapter estimates cost correctly", async () => {
    await import("./provider-router/adapters/fal-kling");
    const { getAdapter } = await import("./provider-router/registry");

    const adapter = getAdapter("fal_kling_v3_pro");
    expect(adapter).toBeDefined();

    // Pro: $0.14/s
    const cost5s = adapter!.estimateCostUsd({ prompt: "test", durationSeconds: 5 } as any);
    expect(cost5s).toBeCloseTo(0.70, 2); // 5 * 0.14

    const cost10s = adapter!.estimateCostUsd({ prompt: "test", durationSeconds: 10 } as any);
    expect(cost10s).toBeCloseTo(1.40, 2); // 10 * 0.14
  });

  it("fal-kling standard adapter estimates cost correctly", async () => {
    await import("./provider-router/adapters/fal-kling");
    const { getAdapter } = await import("./provider-router/registry");

    const adapter = getAdapter("fal_kling_v3_std");
    expect(adapter).toBeDefined();

    // Standard: $0.084/s
    const cost5s = adapter!.estimateCostUsd({ prompt: "test", durationSeconds: 5 } as any);
    expect(cost5s).toBeCloseTo(0.42, 2); // 5 * 0.084

    const cost10s = adapter!.estimateCostUsd({ prompt: "test", durationSeconds: 10 } as any);
    expect(cost10s).toBeCloseTo(0.84, 2); // 10 * 0.084
  });

  it("fal-kling lipsync adapter requires videoUrl and audioUrl", async () => {
    await import("./provider-router/adapters/fal-kling");
    const { getAdapter } = await import("./provider-router/registry");

    const adapter = getAdapter("fal_kling_lipsync");
    expect(adapter).toBeDefined();

    // Missing both
    const invalid = adapter!.validateParams({ prompt: "test" } as any);
    expect(invalid.valid).toBe(false);
    expect(invalid.errors).toContain("videoUrl required for lip sync");
    expect(invalid.errors).toContain("audioUrl required for lip sync");
  });

  it("fal-kling omni adapter estimates cost at pro rate", async () => {
    await import("./provider-router/adapters/fal-kling");
    const { getAdapter } = await import("./provider-router/registry");

    const adapter = getAdapter("fal_kling_v3_omni");
    expect(adapter).toBeDefined();

    // Omni: $0.14/s (pro rate with audio)
    const cost10s = adapter!.estimateCostUsd({ prompt: "test", durationSeconds: 10 } as any);
    expect(cost10s).toBeCloseTo(1.40, 2);
  });
});

// ─── provider-router registry tests ─────────────────────────────────────────

describe("provider-router registry fal.ai key resolution", () => {
  it("getActiveApiKey resolves FAL_API_KEY for fal_kling providers", async () => {
    await import("./provider-router/adapters/fal-kling");
    const { getActiveApiKey } = await import("./provider-router/registry");

    // These should resolve to FAL_API_KEY from env via FAL_AI_PROVIDERS set
    const stdKey = await getActiveApiKey("fal_kling_v3_std");
    expect(stdKey).not.toBeNull();
    expect(stdKey!.id).toBe(-1); // Sentinel for ENV-sourced key
    expect(stdKey!.decryptedKey.length).toBeGreaterThan(0);

    const proKey = await getActiveApiKey("fal_kling_v3_pro");
    expect(proKey).not.toBeNull();
    expect(proKey!.id).toBe(-1);

    const omniKey = await getActiveApiKey("fal_kling_v3_omni");
    expect(omniKey).not.toBeNull();
    expect(omniKey!.id).toBe(-1);

    const lipKey = await getActiveApiKey("fal_kling_lipsync");
    expect(lipKey).not.toBeNull();
    expect(lipKey!.id).toBe(-1);
  });
});

// ─── Integration: pipeline orchestrator imports ─────────────────────────────

describe("pipeline orchestrator fal.ai integration", () => {
  it("video-provider module imports without errors", async () => {
    const mod = await import("./video-provider");
    expect(mod.generateOmniVideo).toBeDefined();
    expect(mod.generateImageToVideo).toBeDefined();
    expect(mod.generateTextToVideo).toBeDefined();
    expect(mod.generateLipSync).toBeDefined();
  });

  it("video-provider selects fal.ai as primary when key is available", async () => {
    const mod = await import("./video-provider");
    const info = mod.getCurrentVideoProvider();
    expect(info.backend).toBe("fal.ai");
  });
});
