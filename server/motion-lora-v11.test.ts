/**
 * Motion LoRA v1.1 Enhancement Tests
 *
 * Tests for: Wan 2.6 pricing, LoRA stack layers, MOTION_LORA_ECONOMICS,
 * provider routing updates, and tier gating.
 */
import { describe, it, expect } from "vitest";

// ─── v1.1 Cost Economics ────────────────────────────────────────────────

describe("MOTION_LORA_ECONOMICS (v1.1)", () => {
  it("should export cost economics constants", async () => {
    const { MOTION_LORA_ECONOMICS } = await import("./credit-ledger");
    expect(MOTION_LORA_ECONOMICS).toBeDefined();
    expect(MOTION_LORA_ECONOMICS.baselineRegenRatio).toBe(3.5);
    expect(MOTION_LORA_ECONOMICS.projectedRegenRatio).toBe(1.5);
    expect(MOTION_LORA_ECONOMICS.effectiveCostReductionPercent).toBe(55);
  });

  it("should have correct provider inference costs", async () => {
    const { MOTION_LORA_ECONOMICS } = await import("./credit-ledger");
    const costs = MOTION_LORA_ECONOMICS.providerInferenceCosts;
    expect(costs.wan_26_720p).toBe(0.10);
    expect(costs.wan_26_1080p).toBe(0.15);
    expect(costs.wan_26_flash).toBe(0.05);
    expect(costs.animatediff_sdxl).toBe(0.04);
    expect(costs.hunyuan_video).toBe(0.08);
    expect(costs.runway_act_two).toBe(0.25);
  });

  it("should show cost reduction from before to after", async () => {
    const { MOTION_LORA_ECONOMICS } = await import("./credit-ledger");
    const before = MOTION_LORA_ECONOMICS.effectiveCostPerApprovedSecBefore;
    const after = MOTION_LORA_ECONOMICS.effectiveCostPerApprovedSecAfter;
    // After should be cheaper than before
    expect(after.min).toBeLessThan(before.min);
    expect(after.max).toBeLessThan(before.max);
    // Reduction should be roughly 55%
    const reductionMin = 1 - after.min / before.min;
    expect(reductionMin).toBeGreaterThan(0.50);
    expect(reductionMin).toBeLessThan(0.60);
  });

  it("should have per-chapter and per-volume cost ranges", async () => {
    const { MOTION_LORA_ECONOMICS } = await import("./credit-ledger");
    expect(MOTION_LORA_ECONOMICS.perChapterCostAfter.min).toBeLessThan(
      MOTION_LORA_ECONOMICS.perChapterCostBefore.min
    );
    expect(MOTION_LORA_ECONOMICS.perVolumeCostAfter.min).toBeLessThan(
      MOTION_LORA_ECONOMICS.perVolumeCostBefore.min
    );
  });
});

// ─── buildMotionLoraMetadata v1.1 fields ────────────────────────────────

describe("buildMotionLoraMetadata v1.1 extensions", () => {
  it("should accept optional provider and loraStackLayers", async () => {
    const { buildMotionLoraMetadata } = await import("./credit-ledger");
    const meta = buildMotionLoraMetadata(
      "action-combat", 0.75, "/loras/char_1_motion.safetensors", 4,
      "wan_26", ["appearance", "motion"]
    );
    expect(meta.motionLoraProvider).toBe("wan_26");
    expect(meta.loraStackLayers).toEqual(["appearance", "motion"]);
    expect(meta.motionLoraUsed).toBe(true);
  });

  it("should work without v1.1 optional fields (backward compat)", async () => {
    const { buildMotionLoraMetadata } = await import("./credit-ledger");
    const meta = buildMotionLoraMetadata(
      "dialogue-gestured", 0.55, "/loras/char_2_motion.safetensors", 2
    );
    expect(meta.motionLoraProvider).toBeUndefined();
    expect(meta.loraStackLayers).toBeUndefined();
    expect(meta.motionLoraUsed).toBe(true);
    expect(meta.motionLoraSurchargeCredits).toBeGreaterThan(0);
  });
});

// ─── LoRA Stack Layers per Tier ─────────────────────────────────────────

describe("loraStackLayers per tier (v1.1)", () => {
  it("free_trial should have no LoRA stack layers", async () => {
    const { TIERS } = await import("./stripe/products");
    expect(TIERS.free_trial.loraStackLayers).toEqual([]);
  });

  it("creator should have appearance only", async () => {
    const { TIERS } = await import("./stripe/products");
    expect(TIERS.creator.loraStackLayers).toEqual(["appearance"]);
  });

  it("creator_pro should have appearance + motion", async () => {
    const { TIERS } = await import("./stripe/products");
    expect(TIERS.creator_pro.loraStackLayers).toEqual(["appearance", "motion"]);
  });

  it("studio should have all 4 layers (Flagship)", async () => {
    const { TIERS } = await import("./stripe/products");
    expect(TIERS.studio.loraStackLayers).toHaveLength(4);
    expect(TIERS.studio.loraStackLayers).toContain("appearance");
    expect(TIERS.studio.loraStackLayers).toContain("motion");
    expect(TIERS.studio.loraStackLayers).toContain("environment");
    expect(TIERS.studio.loraStackLayers).toContain("style");
  });

  it("enterprise should have all 4 layers", async () => {
    const { TIERS } = await import("./stripe/products");
    expect(TIERS.enterprise.loraStackLayers).toHaveLength(4);
    expect(TIERS.enterprise.loraStackLayers).toContain("motion");
  });

  it("all tiers should have loraStackLayers defined", async () => {
    const { TIERS } = await import("./stripe/products");
    for (const [key, config] of Object.entries(TIERS)) {
      expect(config.loraStackLayers, `${key} missing loraStackLayers`).toBeDefined();
      expect(Array.isArray(config.loraStackLayers), `${key} loraStackLayers not array`).toBe(true);
    }
  });
});

// ─── GPU Provider Config v1.1 ───────────────────────────────────────────

describe("GPU_PROVIDERS v1.1 updates", () => {
  it("modal provider should have Wan 2.6 name and serving target", async () => {
    const { GPU_PROVIDERS } = await import("./motion-lora-job-queue");
    expect(GPU_PROVIDERS.modal.name).toContain("Wan 2.6");
    expect((GPU_PROVIDERS.modal as any).servingTarget).toBe("fal-ai/wan-pro");
  });

  it("modal provider should have fal.ai inference pricing", async () => {
    const { GPU_PROVIDERS } = await import("./motion-lora-job-queue");
    const pricing = (GPU_PROVIDERS.modal as any).inferencePricing;
    expect(pricing).toBeDefined();
    expect(pricing["720p"]).toBe(0.10);
    expect(pricing["1080p"]).toBe(0.15);
    expect(pricing["flash"]).toBe(0.05);
  });

  it("runpod provider should still support sdxl_kohya", async () => {
    const { GPU_PROVIDERS } = await import("./motion-lora-job-queue");
    expect(GPU_PROVIDERS.runpod.supportedPaths).toContain("sdxl_kohya");
  });
});

// ─── Motion LoRA Training Config v1.1 ───────────────────────────────────

describe("Motion LoRA training config v1.1", () => {
  it("should have v1.1 version string", async () => {
    const { MOTION_LORA_VERSION } = await import("./motion-lora-training");
    expect(MOTION_LORA_VERSION).toBe("1.1.0");
  });

  it("PROVIDER_CAPABILITIES should include wan_2_6 as LoRA-capable", async () => {
    const { PROVIDER_CAPABILITIES } = await import("./lora-training-pipeline");
    expect(PROVIDER_CAPABILITIES).toHaveProperty("wan_2_6");
    expect(PROVIDER_CAPABILITIES.wan_2_6.supportsLora).toBe(true);
  });

  it("PROVIDER_CAPABILITIES should include local_animatediff as LoRA-capable", async () => {
    const { PROVIDER_CAPABILITIES } = await import("./lora-training-pipeline");
    expect(PROVIDER_CAPABILITIES).toHaveProperty("local_animatediff");
    expect(PROVIDER_CAPABILITIES.local_animatediff.supportsLora).toBe(true);
  });
});

// ─── Provider Registry v1.1 ─────────────────────────────────────────────

describe("Provider registry v1.1 entries", () => {
  it("should have wan_26 adapter registered", async () => {
    const { hasAdapter } = await import("./provider-router/registry");
    // wan_26 adapter is registered via video-providers.ts side-effect
    // Import the adapters module to trigger registration
    await import("./provider-router/adapters/video-providers");
    expect(hasAdapter("wan_26")).toBe(true);
  });

  it("should have wan_21 legacy adapter registered", async () => {
    const { hasAdapter } = await import("./provider-router/registry");
    await import("./provider-router/adapters/video-providers");
    expect(hasAdapter("wan_21")).toBe(true);
  });
});

// ─── Scene-Type Router v1.1 ─────────────────────────────────────────────

describe("Scene-type router v1.1 provider hints", () => {
  it("should return motion lora hint for action scene type", async () => {
    const { getMotionLoraHint } = await import("./scene-type-router/router-integration");
    // SceneType enum uses "action" not "action-combat"
    const hint = getMotionLoraHint("action");
    expect(hint).toBeDefined();
    expect(hint.motionLoraRequired).toBe(true);
    expect(hint.motionLoraWeight).toBeGreaterThan(0);
  });

  it("should return motion lora not required for establishing scenes", async () => {
    const { getMotionLoraHint } = await import("./scene-type-router/router-integration");
    const hint = getMotionLoraHint("establishing");
    expect(hint).toBeDefined();
    expect(hint.motionLoraRequired).toBe(false);
  });

  it("should return motion lora required for reaction scenes", async () => {
    const { getMotionLoraHint } = await import("./scene-type-router/router-integration");
    const hint = getMotionLoraHint("reaction");
    expect(hint).toBeDefined();
    expect(hint.motionLoraRequired).toBe(true);
  });
});

// ─── Staleness Scoring v1.1 ─────────────────────────────────────────────

describe("Staleness scoring v1.1 providers", () => {
  it("should include wan_26 and runway_act_two in provider weights", async () => {
    const mod = await import("./staleness-scoring");
    const modStr = JSON.stringify(mod);
    expect(modStr).toContain("wan_26");
    expect(modStr).toContain("runway_act_two");
  });
});

// ─── Tier Sampler Catalog v1.1 ──────────────────────────────────────────

describe("Tier sampler catalog v1.1 providers", () => {
  it("should include wan_26 in VISUAL_PROVIDERS", async () => {
    const { VISUAL_PROVIDERS } = await import("./tier-sampler-catalog");
    expect(VISUAL_PROVIDERS).toContain("wan_26");
  });

  it("should include runway_act_two in VISUAL_PROVIDERS", async () => {
    const { VISUAL_PROVIDERS } = await import("./tier-sampler-catalog");
    expect(VISUAL_PROVIDERS).toContain("runway_act_two");
  });
});

// ─── Freemium Router v1.1 tier exposure ─────────────────────────────────

describe("Freemium router v1.1 tier fields", () => {
  it("compare procedure should include motionLoraEnabled and loraStackLayers", async () => {
    // We can't call the procedure directly without context,
    // but we can verify the TIERS data structure has the fields
    const { TIERS } = await import("./stripe/products");
    for (const [key, config] of Object.entries(TIERS)) {
      expect(config, `${key} missing motionLoraEnabled`).toHaveProperty("motionLoraEnabled");
      expect(config, `${key} missing maxMotionLoraTrainingsPerMonth`).toHaveProperty("maxMotionLoraTrainingsPerMonth");
      expect(config, `${key} missing loraStackLayers`).toHaveProperty("loraStackLayers");
    }
  });
});
