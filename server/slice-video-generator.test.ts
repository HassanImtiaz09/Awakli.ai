/**
 * Tests for Slice Video Generator — model routing, prompt building,
 * batch generation, status tracking, and retry logic.
 */

import { describe, it, expect } from "vitest";
import {
  resolveModelRoute,
  buildSliceVideoPrompt,
  getEpisodeVideoStatus,
} from "./slice-video-generator";

// ─── Model Route Resolution ──────────────────────────────────────────────

describe("resolveModelRoute", () => {
  it("resolves V3 Omni Professional correctly", () => {
    const route = resolveModelRoute("v3_omni", "professional");
    expect(route.modelName).toBe("kling-video-o1");
    expect(route.endpoint).toBe("omni");
    expect(route.supportsElements).toBe(true);
    expect(route.supportsNativeLipSync).toBe(true);
    expect(route.maxDurationSeconds).toBe(10);
  });

  it("resolves V3 Omni Standard correctly", () => {
    const route = resolveModelRoute("v3_omni", "standard");
    expect(route.modelName).toBe("kling-video-o1");
    expect(route.endpoint).toBe("omni");
    expect(route.supportsElements).toBe(true);
    expect(route.supportsNativeLipSync).toBe(true);
  });

  it("resolves V2.6 Professional to image2video endpoint", () => {
    const route = resolveModelRoute("v2_6", "professional");
    expect(route.modelName).toBe("kling-v2-6");
    expect(route.endpoint).toBe("image2video");
    expect(route.supportsElements).toBe(false);
    expect(route.supportsNativeLipSync).toBe(false);
  });

  it("resolves V2.6 Standard to image2video endpoint", () => {
    const route = resolveModelRoute("v2_6", "standard");
    expect(route.endpoint).toBe("image2video");
  });

  it("resolves V2.1 Professional to image2video endpoint", () => {
    const route = resolveModelRoute("v2_1", "professional");
    expect(route.modelName).toBe("kling-v2-1");
    expect(route.endpoint).toBe("image2video");
  });

  it("resolves V1.6 Professional to image2video endpoint", () => {
    const route = resolveModelRoute("v1_6", "professional");
    expect(route.modelName).toBe("kling-v1-6");
    expect(route.endpoint).toBe("image2video");
  });

  it("resolves V1.6 Standard to text2video endpoint", () => {
    const route = resolveModelRoute("v1_6", "standard");
    expect(route.modelName).toBe("kling-v1-6");
    expect(route.endpoint).toBe("text2video");
  });

  it("falls back to V3 Omni Professional for unknown model", () => {
    const route = resolveModelRoute("unknown_model", "standard");
    expect(route.modelName).toBe("kling-video-o1");
    expect(route.endpoint).toBe("omni");
  });

  it("all routes have a valid creditAction", () => {
    const models = ["v3_omni", "v2_6", "v2_1", "v1_6"];
    const modes = ["professional", "standard"];
    for (const model of models) {
      for (const mode of modes) {
        const route = resolveModelRoute(model, mode);
        expect(route.creditAction).toBeTruthy();
        expect(typeof route.creditAction).toBe("string");
      }
    }
  });

  it("V3 Omni is the only tier that supports Elements", () => {
    const models = ["v2_6", "v2_1", "v1_6"];
    for (const model of models) {
      const route = resolveModelRoute(model, "professional");
      expect(route.supportsElements).toBe(false);
    }
    expect(resolveModelRoute("v3_omni", "professional").supportsElements).toBe(true);
  });

  it("V3 Omni is the only tier that supports native lip sync", () => {
    const models = ["v2_6", "v2_1", "v1_6"];
    for (const model of models) {
      const route = resolveModelRoute(model, "professional");
      expect(route.supportsNativeLipSync).toBe(false);
    }
    expect(resolveModelRoute("v3_omni", "professional").supportsNativeLipSync).toBe(true);
  });
});

// ─── Prompt Building ──────────────────────────────────────────────────────

describe("buildSliceVideoPrompt", () => {
  const makeSlice = (overrides: Partial<Parameters<typeof buildSliceVideoPrompt>[0]> = {}) => ({
    actionDescription: "Hero runs across rooftop at sunset",
    cameraAngle: "wide shot",
    mood: "dramatic",
    dialogue: null as unknown,
    characters: null as unknown,
    lipSyncRequired: 0,
    ...overrides,
  });

  it("builds a basic prompt from action, camera, and mood", () => {
    const route = resolveModelRoute("v2_6", "professional");
    const prompt = buildSliceVideoPrompt(makeSlice(), route, new Map(), []);
    expect(prompt).toContain("Hero runs across rooftop at sunset");
    expect(prompt).toContain("wide shot");
    expect(prompt).toContain("dramatic");
    expect(prompt).toContain("Anime style");
  });

  it("uses default action when actionDescription is null", () => {
    const route = resolveModelRoute("v2_6", "professional");
    const prompt = buildSliceVideoPrompt(
      makeSlice({ actionDescription: null }),
      route,
      new Map(),
      []
    );
    expect(prompt).toContain("A cinematic anime scene");
  });

  it("includes dialogue as descriptive text for non-Omni endpoints", () => {
    const route = resolveModelRoute("v2_6", "professional");
    const prompt = buildSliceVideoPrompt(
      makeSlice({
        dialogue: [{ character: "Akira", text: "We have to go now!", emotion: "urgent" }],
        lipSyncRequired: 1,
      }),
      route,
      new Map(),
      []
    );
    expect(prompt).toContain("Akira says:");
    expect(prompt).toContain("We have to go now!");
  });

  it("includes dialogue as descriptive text for Omni without Elements", () => {
    const route = resolveModelRoute("v3_omni", "professional");
    // No element order → falls back to descriptive text
    const prompt = buildSliceVideoPrompt(
      makeSlice({
        dialogue: [{ character: "Yuki", text: "Look out!" }],
        lipSyncRequired: 1,
      }),
      route,
      new Map(),
      [] // no element order
    );
    expect(prompt).toContain("Yuki says:");
    expect(prompt).toContain("Look out!");
  });

  it("handles string JSON dialogue", () => {
    const route = resolveModelRoute("v2_6", "standard");
    const prompt = buildSliceVideoPrompt(
      makeSlice({
        dialogue: JSON.stringify([{ character: "Kai", text: "Let's go" }]),
        lipSyncRequired: 1,
      }),
      route,
      new Map(),
      []
    );
    expect(prompt).toContain("Kai says:");
    expect(prompt).toContain("Let's go");
  });

  it("handles null dialogue gracefully", () => {
    const route = resolveModelRoute("v2_6", "standard");
    const prompt = buildSliceVideoPrompt(
      makeSlice({ dialogue: null }),
      route,
      new Map(),
      []
    );
    expect(prompt).not.toContain("says:");
  });

  it("handles empty array dialogue", () => {
    const route = resolveModelRoute("v2_6", "standard");
    const prompt = buildSliceVideoPrompt(
      makeSlice({ dialogue: [] }),
      route,
      new Map(),
      []
    );
    expect(prompt).not.toContain("says:");
  });

  it("handles malformed dialogue gracefully", () => {
    const route = resolveModelRoute("v2_6", "standard");
    const prompt = buildSliceVideoPrompt(
      makeSlice({ dialogue: "not json at all" }),
      route,
      new Map(),
      []
    );
    expect(prompt).toBeTruthy();
    expect(prompt).not.toContain("says:");
  });

  it("omits camera angle from prompt when null", () => {
    const route = resolveModelRoute("v2_6", "standard");
    const prompt = buildSliceVideoPrompt(
      makeSlice({ cameraAngle: null }),
      route,
      new Map(),
      []
    );
    expect(prompt).not.toContain("null");
  });

  it("omits mood from prompt when null", () => {
    const route = resolveModelRoute("v2_6", "standard");
    const prompt = buildSliceVideoPrompt(
      makeSlice({ mood: null }),
      route,
      new Map(),
      []
    );
    expect(prompt).not.toContain("null");
  });

  it("handles multiple dialogue lines", () => {
    const route = resolveModelRoute("v2_6", "professional");
    const prompt = buildSliceVideoPrompt(
      makeSlice({
        dialogue: [
          { character: "Akira", text: "Ready?" },
          { character: "Yuki", text: "Always." },
        ],
        lipSyncRequired: 1,
      }),
      route,
      new Map(),
      []
    );
    expect(prompt).toContain("Akira says:");
    expect(prompt).toContain("Yuki says:");
  });
});

// ─── Routing Cost Optimization ────────────────────────────────────────────

describe("Intra-Kling routing cost optimization", () => {
  it("Professional mode costs more than Standard for same model", () => {
    // V3 Omni: professional uses video_10s_premium, standard uses video_10s_standard
    const pro = resolveModelRoute("v3_omni", "professional");
    const std = resolveModelRoute("v3_omni", "standard");
    expect(pro.creditAction).toBe("video_10s_premium");
    expect(std.creditAction).toBe("video_10s_standard");
  });

  it("Lower tiers use cheaper credit actions", () => {
    const tier1 = resolveModelRoute("v3_omni", "professional");
    const tier4 = resolveModelRoute("v1_6", "standard");
    // Tier 1 uses premium, Tier 4 uses budget
    expect(tier1.creditAction).toBe("video_10s_premium");
    expect(tier4.creditAction).toBe("video_10s_budget");
  });

  it("V1.6 standard uses text2video (cheapest — no image input needed)", () => {
    const route = resolveModelRoute("v1_6", "standard");
    expect(route.endpoint).toBe("text2video");
  });

  it("V1.6 professional uses image2video (core scene as input)", () => {
    const route = resolveModelRoute("v1_6", "professional");
    expect(route.endpoint).toBe("image2video");
  });
});

// ─── Endpoint Selection Logic ─────────────────────────────────────────────

describe("Endpoint selection logic", () => {
  it("Tier 1 (V3 Omni) always uses omni endpoint", () => {
    expect(resolveModelRoute("v3_omni", "professional").endpoint).toBe("omni");
    expect(resolveModelRoute("v3_omni", "standard").endpoint).toBe("omni");
  });

  it("Tier 2 (V2.6) always uses image2video endpoint", () => {
    expect(resolveModelRoute("v2_6", "professional").endpoint).toBe("image2video");
    expect(resolveModelRoute("v2_6", "standard").endpoint).toBe("image2video");
  });

  it("Tier 3 (V2.1) always uses image2video endpoint", () => {
    expect(resolveModelRoute("v2_1", "professional").endpoint).toBe("image2video");
    expect(resolveModelRoute("v2_1", "standard").endpoint).toBe("image2video");
  });

  it("Tier 4 (V1.6) uses image2video for pro, text2video for standard", () => {
    expect(resolveModelRoute("v1_6", "professional").endpoint).toBe("image2video");
    expect(resolveModelRoute("v1_6", "standard").endpoint).toBe("text2video");
  });
});

// ─── Max Duration Limits ──────────────────────────────────────────────────

describe("Max duration limits", () => {
  it("all models have 10s max duration", () => {
    const models = ["v3_omni", "v2_6", "v2_1", "v1_6"];
    const modes = ["professional", "standard"];
    for (const model of models) {
      for (const mode of modes) {
        const route = resolveModelRoute(model, mode);
        expect(route.maxDurationSeconds).toBe(10);
      }
    }
  });
});
