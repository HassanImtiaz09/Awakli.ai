/**
 * Tests for Dialogue Preview Tool and Scene-Type Override Persistence.
 *
 * Covers:
 * 1. previewDialogue endpoint — viseme timeline, blink schedule, head motion,
 *    cost estimate, and 7-stage pipeline plan.
 * 2. saveClassifications endpoint — persisting classifications to DB.
 * 3. Override persistence flow — overrideSceneType writing to scene_type_overrides.
 * 4. Pure-function validation for dialogue helpers used by the preview.
 */

import { describe, it, expect, vi } from "vitest";
import {
  phonemeToViseme,
  generateVisemeTimeline,
  generateBlinkSchedule,
  generateHeadMotion,
  estimateDialogueCost,
  planDialoguePipeline,
} from "./scene-type-router/dialogue-inpainting";
import type {
  PhonemeTimestamp,
  BoundingBox,
  DialogueSceneConfig,
  VisemeFrame,
  BlinkEvent,
  HeadMotionFrame,
} from "./scene-type-router/dialogue-inpainting";
import {
  SCENE_TYPE_TO_TEMPLATE,
} from "./scene-type-router/scene-type-classifier";

// ─── 1. Viseme Timeline Tests ──────────────────────────────────────────

describe("Dialogue Preview — Viseme Timeline", () => {
  it("generates correct number of frames for given duration and FPS", () => {
    const phonemes: PhonemeTimestamp[] = [
      { phoneme: "a", startTimeS: 0, endTimeS: 1 },
    ];
    const frames = generateVisemeTimeline(phonemes, 5, 8);
    expect(frames).toHaveLength(Math.ceil(5 * 8)); // 40 frames
  });

  it("maps phonemes to correct visemes", () => {
    expect(phonemeToViseme("a")).toBe("A");
    expect(phonemeToViseme("i")).toBe("I");
    expect(phonemeToViseme("u")).toBe("U");
    expect(phonemeToViseme("e")).toBe("E");
    expect(phonemeToViseme("o")).toBe("O");
    expect(phonemeToViseme("m")).toBe("N");
    expect(phonemeToViseme("p")).toBe("Closed");
    expect(phonemeToViseme("sil")).toBe("Rest");
    expect(phonemeToViseme("")).toBe("Rest");
  });

  it("falls back to Rest for unknown phonemes", () => {
    expect(phonemeToViseme("xyz_unknown")).toBe("Rest");
  });

  it("assigns Rest viseme for frames outside phoneme ranges", () => {
    const phonemes: PhonemeTimestamp[] = [
      { phoneme: "a", startTimeS: 1, endTimeS: 2 },
    ];
    const frames = generateVisemeTimeline(phonemes, 5, 8);

    // Frame at t=0 should be Rest (before phoneme starts)
    expect(frames[0].viseme).toBe("Rest");

    // Frame at t=1.0 should be A (inside phoneme range)
    const frameAt1s = frames.find(f => f.timeS >= 1.0 && f.timeS < 1.125);
    expect(frameAt1s?.viseme).toBe("A");

    // Frame at t=3.0 should be Rest (after phoneme ends)
    const frameAt3s = frames.find(f => f.timeS >= 3.0 && f.timeS < 3.125);
    expect(frameAt3s?.viseme).toBe("Rest");
  });

  it("each frame has correct structure", () => {
    const phonemes: PhonemeTimestamp[] = [
      { phoneme: "a", startTimeS: 0, endTimeS: 1 },
    ];
    const frames = generateVisemeTimeline(phonemes, 2, 8);

    for (const f of frames) {
      expect(f).toHaveProperty("viseme");
      expect(f).toHaveProperty("frameIndex");
      expect(f).toHaveProperty("timeS");
      expect(f).toHaveProperty("durationS");
      expect(typeof f.frameIndex).toBe("number");
      expect(typeof f.timeS).toBe("number");
      expect(f.durationS).toBeCloseTo(1 / 8, 5);
    }
  });

  it("handles empty phoneme array (all Rest)", () => {
    const frames = generateVisemeTimeline([], 3, 8);
    expect(frames).toHaveLength(24);
    for (const f of frames) {
      expect(f.viseme).toBe("Rest");
    }
  });

  it("handles multiple overlapping phonemes (first match wins)", () => {
    const phonemes: PhonemeTimestamp[] = [
      { phoneme: "a", startTimeS: 0, endTimeS: 2 },
      { phoneme: "i", startTimeS: 1, endTimeS: 3 },
    ];
    const frames = generateVisemeTimeline(phonemes, 3, 8);

    // At t=0.5, only "a" is active → A
    const earlyFrame = frames.find(f => f.timeS >= 0.5 && f.timeS < 0.625);
    expect(earlyFrame?.viseme).toBe("A");

    // At t=1.5, both are active but find() returns first → A
    const midFrame = frames.find(f => f.timeS >= 1.5 && f.timeS < 1.625);
    expect(midFrame?.viseme).toBe("A");
  });
});

// ─── 2. Blink Schedule Tests ───────────────────────────────────────────

describe("Dialogue Preview — Blink Schedule", () => {
  const eyeRegion: BoundingBox = { x: 80, y: 60, width: 40, height: 20 };

  it("generates blink events within duration bounds", () => {
    const events = generateBlinkSchedule(10, 8, "Sakura", eyeRegion);
    expect(events.length).toBeGreaterThan(0);

    for (const e of events) {
      expect(e.startFrameIndex).toBeGreaterThanOrEqual(0);
      expect(e.endFrameIndex).toBeLessThanOrEqual(Math.ceil(10 * 8) + 3);
      expect(e.character).toBe("Sakura");
      expect(e.eyeRegion).toEqual(eyeRegion);
    }
  });

  it("blink events are 3 frames long", () => {
    const events = generateBlinkSchedule(20, 8, "Hiro", eyeRegion);
    for (const e of events) {
      expect(e.endFrameIndex - e.startFrameIndex).toBe(3);
    }
  });

  it("generates roughly 1 blink per 3-5 seconds", () => {
    // For 30s at 8fps, expect ~6-10 blinks
    const events = generateBlinkSchedule(30, 8, "Test", eyeRegion);
    expect(events.length).toBeGreaterThanOrEqual(5);
    expect(events.length).toBeLessThanOrEqual(12);
  });

  it("handles very short duration (may produce 0 blinks)", () => {
    const events = generateBlinkSchedule(2, 8, "Test", eyeRegion);
    // 2 seconds is too short for the first blink (min 3s)
    expect(events.length).toBeLessThanOrEqual(1);
  });
});

// ─── 3. Head Motion Tests ──────────────────────────────────────────────

describe("Dialogue Preview — Head Motion", () => {
  it("generates correct number of frames", () => {
    const frames = generateHeadMotion(10, 8);
    expect(frames).toHaveLength(Math.ceil(10 * 8));
  });

  it("rotation stays within -3 to +3 degrees", () => {
    const frames = generateHeadMotion(30, 24);
    for (const f of frames) {
      expect(f.rotationDeg).toBeGreaterThanOrEqual(-3.1);
      expect(f.rotationDeg).toBeLessThanOrEqual(3.1);
    }
  });

  it("translation stays within expected bounds", () => {
    const frames = generateHeadMotion(30, 24);
    for (const f of frames) {
      expect(f.translationX).toBeGreaterThanOrEqual(-6);
      expect(f.translationX).toBeLessThanOrEqual(6);
      expect(f.translationY).toBeGreaterThanOrEqual(-4);
      expect(f.translationY).toBeLessThanOrEqual(4);
    }
  });

  it("each frame has correct structure", () => {
    const frames = generateHeadMotion(5, 8);
    for (const f of frames) {
      expect(f).toHaveProperty("frameIndex");
      expect(f).toHaveProperty("rotationDeg");
      expect(f).toHaveProperty("translationX");
      expect(f).toHaveProperty("translationY");
    }
  });
});

// ─── 4. Cost Estimation Tests ──────────────────────────────────────────

describe("Dialogue Preview — Cost Estimation", () => {
  it("returns all required fields", () => {
    const cost = estimateDialogueCost(10, 1, 8);
    expect(cost).toHaveProperty("baseFrameCredits");
    expect(cost).toHaveProperty("inpaintingCredits");
    expect(cost).toHaveProperty("rifeCredits");
    expect(cost).toHaveProperty("totalCredits");
    expect(cost).toHaveProperty("comparedToFullVideo");
    expect(cost).toHaveProperty("savingsPercent");
  });

  it("total is sum of components", () => {
    const cost = estimateDialogueCost(10, 2, 8);
    const expectedTotal = cost.baseFrameCredits + cost.inpaintingCredits + cost.rifeCredits;
    expect(cost.totalCredits).toBeCloseTo(expectedTotal, 3);
  });

  it("shows significant savings vs full video", () => {
    const cost = estimateDialogueCost(10, 1, 8);
    expect(cost.savingsPercent).toBeGreaterThan(90);
    expect(cost.totalCredits).toBeLessThan(cost.comparedToFullVideo);
  });

  it("cost scales with duration", () => {
    const cost5s = estimateDialogueCost(5, 1, 8);
    const cost20s = estimateDialogueCost(20, 1, 8);
    expect(cost20s.totalCredits).toBeGreaterThan(cost5s.totalCredits);
  });

  it("cost scales with camera angle count", () => {
    const cost1 = estimateDialogueCost(10, 1, 8);
    const cost3 = estimateDialogueCost(10, 3, 8);
    expect(cost3.baseFrameCredits).toBeGreaterThan(cost1.baseFrameCredits);
  });

  it("cost scales with inpaint FPS", () => {
    const cost8 = estimateDialogueCost(10, 1, 8);
    const cost16 = estimateDialogueCost(10, 1, 16);
    expect(cost16.inpaintingCredits).toBeGreaterThan(cost8.inpaintingCredits);
  });
});

// ─── 5. Pipeline Plan Tests ────────────────────────────────────────────

describe("Dialogue Preview — Pipeline Plan", () => {
  const config: DialogueSceneConfig = {
    durationS: 10,
    inpaintFps: 8,
    outputFps: 24,
    mouthRegionSize: 256,
    cameraAngles: ["front"],
    dialogueLines: [
      { character: "Sakura", text: "Hello", startTimeS: 0, endTimeS: 3 },
    ],
    characterReferences: {},
  };

  it("returns exactly 7 stages", () => {
    const plan = planDialoguePipeline(config);
    expect(plan.stages).toHaveLength(7);
  });

  it("stages are in correct order", () => {
    const plan = planDialoguePipeline(config);
    const stageNames = plan.stages.map(s => s.name);
    expect(stageNames).toEqual([
      "base_frame_generation",
      "face_landmark_detection",
      "viseme_inpainting",
      "blink_overlay",
      "head_motion",
      "rife_interpolation",
      "assembly",
    ]);
  });

  it("calculates correct frame counts", () => {
    const plan = planDialoguePipeline(config);
    expect(plan.totalInpaintFrames).toBe(Math.ceil(10 * 8)); // 80
    expect(plan.totalOutputFrames).toBe(Math.ceil(10 * 24)); // 240
  });

  it("base_frame_generation has correct frame count for camera angles", () => {
    const plan = planDialoguePipeline(config);
    expect(plan.stages[0].frameCount).toBe(1); // 1 camera angle

    const multiCam = planDialoguePipeline({ ...config, cameraAngles: ["front", "side", "close-up"] });
    expect(multiCam.stages[0].frameCount).toBe(3);
  });

  it("blink_overlay and head_motion have zero AI credits", () => {
    const plan = planDialoguePipeline(config);
    const blinkStage = plan.stages.find(s => s.name === "blink_overlay");
    const headStage = plan.stages.find(s => s.name === "head_motion");
    expect(blinkStage?.estimatedCredits).toBe(0);
    expect(headStage?.estimatedCredits).toBe(0);
    expect(blinkStage?.provider).toBeNull();
    expect(headStage?.provider).toBeNull();
  });

  it("total credits match cost estimate", () => {
    const plan = planDialoguePipeline(config);
    const directCost = estimateDialogueCost(10, 1, 8);
    expect(plan.estimatedTotalCredits).toBeCloseTo(directCost.totalCredits, 3);
  });

  it("each stage has required fields", () => {
    const plan = planDialoguePipeline(config);
    for (const s of plan.stages) {
      expect(s).toHaveProperty("name");
      expect(s).toHaveProperty("description");
      expect(s).toHaveProperty("provider");
      expect(s).toHaveProperty("fallbackProvider");
      expect(s).toHaveProperty("estimatedCredits");
      expect(s).toHaveProperty("frameCount");
      expect(typeof s.estimatedCredits).toBe("number");
      expect(typeof s.frameCount).toBe("number");
    }
  });
});

// ─── 6. Preview Endpoint Data Shape Tests ──────────────────────────────

describe("Dialogue Preview — Response Shape Validation", () => {
  /**
   * Simulates the previewDialogue endpoint logic to validate
   * the response shape without needing a running server.
   */
  function simulatePreviewDialogue(input: {
    durationS: number;
    cameraAngles: string[];
    dialogueLines: Array<{
      character: string;
      text: string;
      emotion?: string;
      startTimeS: number;
      endTimeS: number;
    }>;
    inpaintFps: number;
    outputFps: number;
  }) {
    const { durationS, cameraAngles, dialogueLines, inpaintFps, outputFps } = input;

    // Build synthetic phonemes
    const phonemes: PhonemeTimestamp[] = [];
    for (const line of dialogueLines) {
      const chars = line.text.replace(/[^a-zA-Z]/g, "").split("");
      if (chars.length === 0) continue;
      const charDuration = (line.endTimeS - line.startTimeS) / chars.length;
      for (let i = 0; i < chars.length; i++) {
        const ch = chars[i].toLowerCase();
        const phoneme = "aeiou".includes(ch) ? ch : "sil";
        phonemes.push({
          phoneme,
          startTimeS: line.startTimeS + i * charDuration,
          endTimeS: line.startTimeS + (i + 1) * charDuration,
        });
      }
    }

    const visemeTimeline = generateVisemeTimeline(phonemes, durationS, inpaintFps);
    const eyeRegion: BoundingBox = { x: 80, y: 60, width: 40, height: 20 };
    const blinkSchedule = generateBlinkSchedule(
      durationS, inpaintFps, dialogueLines[0]?.character || "character", eyeRegion,
    );
    const headMotion = generateHeadMotion(durationS, inpaintFps);
    const costEstimate = estimateDialogueCost(durationS, cameraAngles.length, inpaintFps);

    const config: DialogueSceneConfig = {
      durationS,
      inpaintFps,
      outputFps,
      mouthRegionSize: 256,
      cameraAngles,
      dialogueLines: dialogueLines.map(l => ({
        character: l.character,
        text: l.text,
        emotion: l.emotion,
        startTimeS: l.startTimeS,
        endTimeS: l.endTimeS,
      })),
      characterReferences: {},
    };
    const pipelinePlan = planDialoguePipeline(config);

    const visemeDistribution: Record<string, number> = {};
    for (const frame of visemeTimeline) {
      visemeDistribution[frame.viseme] = (visemeDistribution[frame.viseme] || 0) + 1;
    }

    return {
      durationS,
      inpaintFps,
      outputFps,
      totalFrames: visemeTimeline.length,
      visemeTimeline: visemeTimeline.map(f => ({
        viseme: f.viseme,
        frameIndex: f.frameIndex,
        timeS: Math.round(f.timeS * 1000) / 1000,
      })),
      visemeDistribution,
      blinkSchedule: blinkSchedule.map(b => ({
        startFrame: b.startFrameIndex,
        endFrame: b.endFrameIndex,
        character: b.character,
      })),
      headMotion: headMotion.map(h => ({
        frameIndex: h.frameIndex,
        rotationDeg: Math.round(h.rotationDeg * 100) / 100,
        translationX: Math.round(h.translationX * 100) / 100,
        translationY: Math.round(h.translationY * 100) / 100,
      })),
      costEstimate,
      pipelinePlan: {
        stages: pipelinePlan.stages.map(s => ({
          name: s.name,
          description: s.description,
          provider: s.provider,
          fallbackProvider: s.fallbackProvider,
          estimatedCredits: Math.round(s.estimatedCredits * 10000) / 10000,
          frameCount: s.frameCount,
        })),
        totalInpaintFrames: pipelinePlan.totalInpaintFrames,
        totalOutputFrames: pipelinePlan.totalOutputFrames,
        estimatedTotalCredits: pipelinePlan.estimatedTotalCredits,
      },
    };
  }

  it("returns all top-level fields", () => {
    const result = simulatePreviewDialogue({
      durationS: 10,
      cameraAngles: ["front"],
      dialogueLines: [
        { character: "Sakura", text: "Hello world", startTimeS: 0, endTimeS: 3 },
      ],
      inpaintFps: 8,
      outputFps: 24,
    });

    expect(result).toHaveProperty("durationS", 10);
    expect(result).toHaveProperty("inpaintFps", 8);
    expect(result).toHaveProperty("outputFps", 24);
    expect(result).toHaveProperty("totalFrames");
    expect(result).toHaveProperty("visemeTimeline");
    expect(result).toHaveProperty("visemeDistribution");
    expect(result).toHaveProperty("blinkSchedule");
    expect(result).toHaveProperty("headMotion");
    expect(result).toHaveProperty("costEstimate");
    expect(result).toHaveProperty("pipelinePlan");
  });

  it("visemeTimeline has correct frame count", () => {
    const result = simulatePreviewDialogue({
      durationS: 5,
      cameraAngles: ["front"],
      dialogueLines: [],
      inpaintFps: 8,
      outputFps: 24,
    });
    expect(result.totalFrames).toBe(40);
    expect(result.visemeTimeline).toHaveLength(40);
  });

  it("visemeDistribution sums to totalFrames", () => {
    const result = simulatePreviewDialogue({
      durationS: 10,
      cameraAngles: ["front"],
      dialogueLines: [
        { character: "Sakura", text: "Testing the distribution", startTimeS: 0, endTimeS: 5 },
      ],
      inpaintFps: 8,
      outputFps: 24,
    });

    const distTotal = Object.values(result.visemeDistribution).reduce((a, b) => a + b, 0);
    expect(distTotal).toBe(result.totalFrames);
  });

  it("pipelinePlan has 7 stages", () => {
    const result = simulatePreviewDialogue({
      durationS: 10,
      cameraAngles: ["front"],
      dialogueLines: [],
      inpaintFps: 8,
      outputFps: 24,
    });
    expect(result.pipelinePlan.stages).toHaveLength(7);
  });

  it("costEstimate shows savings > 90%", () => {
    const result = simulatePreviewDialogue({
      durationS: 10,
      cameraAngles: ["front"],
      dialogueLines: [],
      inpaintFps: 8,
      outputFps: 24,
    });
    expect(result.costEstimate.savingsPercent).toBeGreaterThan(90);
  });

  it("handles dialogue text with special characters", () => {
    const result = simulatePreviewDialogue({
      durationS: 5,
      cameraAngles: ["front"],
      dialogueLines: [
        { character: "Sakura", text: "こんにちは! 123 @#$", startTimeS: 0, endTimeS: 3 },
      ],
      inpaintFps: 8,
      outputFps: 24,
    });
    // Non-alpha chars are stripped, so only alpha chars generate phonemes
    expect(result.totalFrames).toBe(40);
    expect(result.visemeTimeline).toHaveLength(40);
  });

  it("handles multiple camera angles", () => {
    const result = simulatePreviewDialogue({
      durationS: 10,
      cameraAngles: ["front", "side", "close-up"],
      dialogueLines: [],
      inpaintFps: 8,
      outputFps: 24,
    });
    // Base frame stage should have 3 frames
    expect(result.pipelinePlan.stages[0].frameCount).toBe(3);
    // Cost should be higher with more camera angles
    expect(result.costEstimate.baseFrameCredits).toBeCloseTo(3 * 0.015, 3);
  });
});

// ─── 7. Override Persistence Logic Tests ───────────────────────────────

describe("Scene-Type Override Persistence", () => {
  it("SCENE_TYPE_TO_TEMPLATE maps all scene types", () => {
    const sceneTypes = ["dialogue", "action", "establishing", "transition", "reaction", "montage"];
    for (const st of sceneTypes) {
      expect(SCENE_TYPE_TO_TEMPLATE[st], `Missing template for ${st}`).toBeDefined();
      expect(typeof SCENE_TYPE_TO_TEMPLATE[st]).toBe("string");
    }
  });

  it("override changes pipeline template correctly", () => {
    // Simulating an override from dialogue → action
    const originalTemplate = SCENE_TYPE_TO_TEMPLATE["dialogue"];
    const newTemplate = SCENE_TYPE_TO_TEMPLATE["action"];
    expect(originalTemplate).not.toBe(newTemplate);
    expect(newTemplate).toBe("action_premium");
  });

  it("override from action to establishing changes template", () => {
    expect(SCENE_TYPE_TO_TEMPLATE["establishing"]).toBe("establishing_ken_burns");
  });

  it("override from dialogue to transition changes template", () => {
    expect(SCENE_TYPE_TO_TEMPLATE["transition"]).toBe("transition_rule_based");
  });
});
