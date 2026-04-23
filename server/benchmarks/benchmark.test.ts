import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import {
  calculateClipCost,
  calculateTTSCost,
  extrapolateCost,
  calculateMargin,
  buildComponentBreakdown,
  startTimer,
  withRetry,
  type ClipResult,
  type ComponentCost,
} from "./runner-base.js";
import { checkProviderCredentials, BENCHMARK_PROVIDERS } from "./providers/registry.js";

// ─── Cost Calculation Tests ──────────────────────────────────────────────────

describe("calculateClipCost", () => {
  it("calculates per-second cost correctly", () => {
    expect(calculateClipCost(10, 0.14, null, null)).toBeCloseTo(1.4, 2);
    expect(calculateClipCost(10, 0.084, null, null)).toBeCloseTo(0.84, 2);
    expect(calculateClipCost(10, 0.033, null, null)).toBeCloseTo(0.33, 2);
  });

  it("uses per-clip rate when per-second is null", () => {
    expect(calculateClipCost(10, null, 0.2, null)).toBeCloseTo(0.2, 2);
  });

  it("uses per-video rate as last fallback", () => {
    expect(calculateClipCost(10, null, null, 0.3)).toBeCloseTo(0.3, 2);
  });

  it("returns 0 when all rates are null", () => {
    expect(calculateClipCost(10, null, null, null)).toBe(0);
  });

  it("scales linearly with duration", () => {
    const cost5s = calculateClipCost(5, 0.14, null, null);
    const cost10s = calculateClipCost(10, 0.14, null, null);
    expect(cost10s).toBeCloseTo(cost5s * 2, 2);
  });
});

describe("calculateTTSCost", () => {
  it("calculates ElevenLabs cost for 1000 chars", () => {
    expect(calculateTTSCost(1000, 0.1)).toBeCloseTo(0.1, 2);
  });

  it("calculates OpenAI TTS cost for 5000 chars", () => {
    expect(calculateTTSCost(5000, 0.015)).toBeCloseTo(0.075, 3);
  });

  it("handles small character counts", () => {
    expect(calculateTTSCost(50, 0.1)).toBeCloseTo(0.005, 3);
  });
});

describe("extrapolateCost", () => {
  it("extrapolates 3-min cost to 5-min", () => {
    expect(extrapolateCost(12, 3, 5)).toBeCloseTo(20, 1);
  });

  it("extrapolates 3-min cost to 1-min", () => {
    expect(extrapolateCost(12, 3, 1)).toBeCloseTo(4, 1);
  });

  it("extrapolates 3-min cost to 15-min", () => {
    expect(extrapolateCost(12, 3, 15)).toBeCloseTo(60, 1);
  });

  it("returns same cost for same duration", () => {
    expect(extrapolateCost(12, 3, 3)).toBeCloseTo(12, 1);
  });
});

describe("calculateMargin", () => {
  it("calculates positive margin", () => {
    const { marginUsd, marginPercent } = calculateMargin(20, 35);
    expect(marginUsd).toBeCloseTo(15, 1);
    expect(marginPercent).toBeCloseTo(42.9, 1);
  });

  it("calculates negative margin (loss)", () => {
    const { marginUsd, marginPercent } = calculateMargin(42, 35);
    expect(marginUsd).toBeCloseTo(-7, 1);
    expect(marginPercent).toBeCloseTo(-20, 0);
  });

  it("calculates zero margin", () => {
    const { marginUsd, marginPercent } = calculateMargin(35, 35);
    expect(marginUsd).toBeCloseTo(0, 1);
    expect(marginPercent).toBeCloseTo(0, 1);
  });
});

// ─── Component Breakdown Tests ───────────────────────────────────────────────

describe("buildComponentBreakdown", () => {
  it("calculates correct percentages", () => {
    const components = buildComponentBreakdown([
      { component: "video", provider: "fal_ai", model: "Wan 2.2", units: 200, unitType: "seconds", costUsd: 16 },
      { component: "tts", provider: "elevenlabs", model: "turbo-v2.5", units: 2000, unitType: "characters", costUsd: 0.2 },
      { component: "lipsync", provider: "fal_ai", model: "LatentSync", units: 5, unitType: "clips", costUsd: 1 },
    ]);

    expect(components).toHaveLength(3);
    const totalPercent = components.reduce((sum, c) => sum + c.percentOfTotal, 0);
    expect(totalPercent).toBeCloseTo(100, 0);
    expect(components[0].percentOfTotal).toBeGreaterThan(90); // video dominates
  });

  it("handles zero total cost", () => {
    const components = buildComponentBreakdown([
      { component: "assembly", provider: "local", model: "FFmpeg", units: 1, unitType: "runs", costUsd: 0 },
    ]);
    expect(components[0].percentOfTotal).toBe(0);
  });
});

// ─── Timer Tests ─────────────────────────────────────────────────────────────

describe("startTimer", () => {
  it("returns elapsed time in milliseconds", async () => {
    const elapsed = startTimer();
    await new Promise((r) => setTimeout(r, 50));
    const ms = elapsed();
    expect(ms).toBeGreaterThanOrEqual(40); // allow some tolerance
    expect(ms).toBeLessThan(200);
  });
});

// ─── Retry Logic Tests ──────────────────────────────────────────────────────

describe("withRetry", () => {
  it("succeeds on first attempt", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const { result, retryCount } = await withRetry(fn, { maxRetries: 2, baseDelayMs: 10 });
    expect(result).toBe("ok");
    expect(retryCount).toBe(0);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries and succeeds on second attempt", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue("ok");
    const { result, retryCount } = await withRetry(fn, { maxRetries: 2, baseDelayMs: 10, maxDelayMs: 20 });
    expect(result).toBe("ok");
    expect(retryCount).toBe(1);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws after all retries exhausted", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fails"));
    await expect(
      withRetry(fn, { maxRetries: 2, baseDelayMs: 10, maxDelayMs: 20 })
    ).rejects.toThrow("always fails");
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });
});

// ─── Provider Registry Tests ─────────────────────────────────────────────────

describe("checkProviderCredentials", () => {
  it("returns a map of provider IDs to booleans", () => {
    const creds = checkProviderCredentials();
    expect(typeof creds).toBe("object");
    expect(Object.keys(creds).length).toBe(Object.keys(BENCHMARK_PROVIDERS).length);
    for (const val of Object.values(creds)) {
      expect(typeof val).toBe("boolean");
    }
  });

  it("detects FAL_API_KEY if set", () => {
    const original = process.env.FAL_API_KEY;
    process.env.FAL_API_KEY = "test-key-123";
    const creds = checkProviderCredentials();
    expect(creds.fal_ai).toBe(true);
    if (original) {
      process.env.FAL_API_KEY = original;
    } else {
      delete process.env.FAL_API_KEY;
    }
  });
});

// ─── Pricing Data Tests ──────────────────────────────────────────────────────

describe("pricing registry", () => {
  it("loads pricing data without errors", async () => {
    const pricing = await import("./providers/pricing.json");
    expect(pricing.video).toBeDefined();
    expect(pricing.tts).toBeDefined();
    expect(pricing.training).toBeDefined();
  });

  it("has valid per-second rates for Kling V3 Omni", async () => {
    const pricing = await import("./providers/pricing.json");
    expect(pricing.video.kling_v3_omni_fal.perSecond).toBe(0.14);
    expect(pricing.video.kling_v3_omni_atlas.perSecond).toBe(0.095);
  });

  it("has valid TTS rates", async () => {
    const pricing = await import("./providers/pricing.json");
    expect(pricing.tts.elevenlabs.perKChars).toBe(0.1);
    expect(pricing.tts.openai_tts.perKChars).toBe(0.015);
    expect(pricing.tts.cartesia.perKChars).toBe(0.1);
  });
});

// ─── Fixture Tests ───────────────────────────────────────────────────────────

describe("test fixtures", () => {
  it("loads 3-shot fixture with correct structure", async () => {
    const shots = await import("./fixtures/shots.json");
    expect(shots.shots).toHaveLength(3);
    expect(shots.shots[0].type).toBe("establishing");
    expect(shots.shots[1].type).toBe("dialogue");
    expect(shots.shots[2].type).toBe("action");
  });

  it("loads 18-slice pilot script", async () => {
    const script = await import("./fixtures/pilot-3min-script.json");
    expect(script.slices).toHaveLength(18);
    expect(script._meta.totalDuration).toBe(180);
    expect(script._meta.totalSlices).toBe(18);
  });

  it("pilot script has correct shot distribution", async () => {
    const script = await import("./fixtures/pilot-3min-script.json");
    const silentCount = script.slices.filter((s: any) => !s.audio).length;
    const dialogueCount = script.slices.filter((s: any) => s.audio).length;
    expect(silentCount + dialogueCount).toBe(18);
    expect(dialogueCount).toBeGreaterThanOrEqual(6);
    expect(silentCount).toBeGreaterThanOrEqual(5);
  });

  it("all dialogue slices have text and character", async () => {
    const script = await import("./fixtures/pilot-3min-script.json");
    const dialogueSlices = script.slices.filter((s: any) => s.audio);
    for (const slice of dialogueSlices) {
      expect((slice as any).dialogue).toBeDefined();
      expect((slice as any).dialogue.text.length).toBeGreaterThan(0);
      expect((slice as any).dialogue.character.length).toBeGreaterThan(0);
    }
  });
});

// ─── End-to-End Cost Estimate Validation ─────────────────────────────────────

describe("cost estimate validation (3-min pilot)", () => {
  it("P1 Kling Omni fal.ai: 180s × $0.14/s = $25.20", () => {
    const cost = calculateClipCost(180, 0.14, null, null);
    expect(cost).toBeCloseTo(25.2, 1);
  });

  it("P1 Kling Omni Atlas: 180s × $0.095/s = $17.10", () => {
    const cost = calculateClipCost(180, 0.095, null, null);
    expect(cost).toBeCloseTo(17.1, 1);
  });

  it("P2 Balanced total cost estimate is reasonable", () => {
    // Silent: 7 slices × 10s × $0.08/s = $5.60
    const silentCost = calculateClipCost(70, 0.08, null, null);
    // Dialogue: 10 slices × 10s × $0.033/s = $3.30
    const dialogueCost = calculateClipCost(100, 0.033, null, null);
    // TTS: ~2000 chars × $0.10/1K = $0.20
    const ttsCost = calculateTTSCost(2000, 0.1);
    // Lipsync: 5 clips × $0.20 = $1.00
    const lipsyncCost = 5 * 0.2;

    const total = silentCost + dialogueCost + ttsCost + lipsyncCost;
    expect(total).toBeGreaterThan(8);
    expect(total).toBeLessThan(15);
  });

  it("P3 Cheap total cost estimate is reasonable", () => {
    // All 18 slices via Wan: 180s × $0.08/s = $14.40
    const videoCost = calculateClipCost(180, 0.08, null, null);
    // TTS: ~2000 chars × $0.015/1K = $0.03
    const ttsCost = calculateTTSCost(2000, 0.015);
    // MuseTalk: 10 clips × $0.42 = $4.20
    const lipsyncCost = 10 * 0.42;

    const total = videoCost + ttsCost + lipsyncCost;
    expect(total).toBeGreaterThan(15);
    expect(total).toBeLessThan(25);
  });

  it("margin at $35 retail for P2 balanced exceeds 40%", () => {
    // P2 estimated at ~$12 for 3 min → ~$20 for 5 min
    const costPer5Min = extrapolateCost(12, 3, 5);
    const { marginPercent } = calculateMargin(costPer5Min, 35);
    expect(marginPercent).toBeGreaterThan(40);
  });
});
