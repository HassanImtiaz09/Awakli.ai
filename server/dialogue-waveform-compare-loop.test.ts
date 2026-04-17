/**
 * Tests for the three new Dialogue Preview features:
 * 1. Audio waveform generation
 * 2. Compare split-view (dialogue inpainting vs full Kling video)
 * 3. A/B looping math
 */

import { describe, it, expect } from "vitest";
import {
  generateWaveformData,
  generateFullVideoComparison,
} from "./routers-scene-type";
import {
  estimateDialogueCost,
} from "./scene-type-router/dialogue-inpainting";

// ─── 1. Waveform Generation ──────────────────────────────────────────

describe("Audio Waveform Generation", () => {
  const sampleLines = [
    { character: "Sakura", text: "Hello world", startTimeS: 0.5, endTimeS: 3.0 },
    { character: "Hiro", text: "Goodbye", startTimeS: 4.0, endTimeS: 6.0 },
  ];

  it("generates correct number of samples for given duration and sample rate", () => {
    const result = generateWaveformData(sampleLines, 10, 50);
    expect(result.samples).toHaveLength(Math.ceil(10 * 50)); // 500 samples
    expect(result.sampleRate).toBe(50);
  });

  it("generates samples at custom sample rate", () => {
    const result = generateWaveformData(sampleLines, 5, 20);
    expect(result.samples).toHaveLength(Math.ceil(5 * 20)); // 100 samples
    expect(result.sampleRate).toBe(20);
  });

  it("produces silence (zero amplitude) outside dialogue regions", () => {
    const lines = [
      { character: "A", text: "Hello", startTimeS: 2.0, endTimeS: 3.0 },
    ];
    const result = generateWaveformData(lines, 5, 10);
    // Samples 0-19 (0-1.9s) should be silent
    for (let i = 0; i < 20; i++) {
      expect(result.samples[i]).toBe(0);
    }
    // Samples 30-49 (3.0-4.9s) should be silent
    for (let i = 30; i < 50; i++) {
      expect(result.samples[i]).toBe(0);
    }
  });

  it("produces non-zero amplitude during dialogue regions", () => {
    const lines = [
      { character: "A", text: "Hello world test", startTimeS: 1.0, endTimeS: 3.0 },
    ];
    const result = generateWaveformData(lines, 5, 10);
    // Samples 10-29 (1.0-2.9s) should have non-zero values
    const dialogueSamples = result.samples.slice(10, 30);
    const nonZero = dialogueSamples.filter(s => s > 0);
    expect(nonZero.length).toBeGreaterThan(0);
  });

  it("all samples are in range [0, 1]", () => {
    const result = generateWaveformData(sampleLines, 10, 50);
    for (const s of result.samples) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });

  it("peak amplitude is positive", () => {
    const result = generateWaveformData(sampleLines, 10, 50);
    expect(result.peakAmplitude).toBeGreaterThan(0);
  });

  it("tracks dialogue regions correctly", () => {
    const result = generateWaveformData(sampleLines, 10, 50);
    expect(result.dialogueRegions).toHaveLength(2);
    expect(result.dialogueRegions[0].character).toBe("Sakura");
    expect(result.dialogueRegions[0].startSample).toBe(Math.floor(0.5 * 50));
    expect(result.dialogueRegions[1].character).toBe("Hiro");
    expect(result.dialogueRegions[1].startSample).toBe(Math.floor(4.0 * 50));
  });

  it("handles empty dialogue lines gracefully", () => {
    const result = generateWaveformData([], 5, 50);
    expect(result.samples).toHaveLength(250);
    expect(result.samples.every(s => s === 0)).toBe(true);
    expect(result.dialogueRegions).toHaveLength(0);
    expect(result.peakAmplitude).toBe(0.01); // min floor
  });

  it("vowels produce higher energy than consonants", () => {
    // "aaaa" (all vowels) vs "ssss" (all consonants)
    const vowelLine = [{ character: "A", text: "aaaa", startTimeS: 0, endTimeS: 2 }];
    const consonantLine = [{ character: "A", text: "ssss", startTimeS: 0, endTimeS: 2 }];
    const vowelResult = generateWaveformData(vowelLine, 2, 50);
    const consonantResult = generateWaveformData(consonantLine, 2, 50);

    const vowelAvg = vowelResult.samples.reduce((a, b) => a + b, 0) / vowelResult.samples.length;
    const consonantAvg = consonantResult.samples.reduce((a, b) => a + b, 0) / consonantResult.samples.length;
    expect(vowelAvg).toBeGreaterThan(consonantAvg);
  });

  it("handles non-alphabetic characters in text", () => {
    const lines = [
      { character: "A", text: "Hello, world! 123", startTimeS: 0, endTimeS: 2 },
    ];
    // Should not throw
    const result = generateWaveformData(lines, 2, 50);
    expect(result.samples).toHaveLength(100);
  });

  it("handles text with only non-alphabetic characters", () => {
    const lines = [
      { character: "A", text: "123 !@#", startTimeS: 0, endTimeS: 2 },
    ];
    const result = generateWaveformData(lines, 2, 50);
    // No alphabetic chars means no energy generated
    expect(result.samples).toHaveLength(100);
    // All samples should be 0 since there are no valid phonemes
    const allZero = result.samples.every(s => s === 0);
    expect(allZero).toBe(true);
  });
});

// ─── 2. Compare Split-View ───────────────────────────────────────────

describe("Compare Split-View — Full Video Comparison", () => {
  it("generates comparison data for a 10s scene", () => {
    const result = generateFullVideoComparison(10, 1);

    // Kling side
    expect(result.kling.provider).toBe("Kling 2.6");
    expect(result.kling.totalCredits).toBeGreaterThan(0);
    expect(result.kling.generationTimeS).toBeGreaterThan(0);
    expect(result.kling.outputFps).toBe(24);
    expect(result.kling.resolution).toBe("1920x1080");
    expect(result.kling.qualityScore).toBeGreaterThan(0);
    expect(result.kling.strengths.length).toBeGreaterThan(0);
    expect(result.kling.weaknesses.length).toBeGreaterThan(0);

    // Dialogue inpainting side
    expect(result.dialogueInpainting.provider).toBe("Dialogue Inpainting Pipeline");
    expect(result.dialogueInpainting.totalCredits).toBeGreaterThan(0);
    expect(result.dialogueInpainting.lipSyncAccuracy).toBe(96);
    expect(result.dialogueInpainting.consistency).toBe(98);
    expect(result.dialogueInpainting.strengths.length).toBeGreaterThan(0);
    expect(result.dialogueInpainting.weaknesses.length).toBeGreaterThan(0);
  });

  it("dialogue inpainting is always cheaper than Kling", () => {
    for (const duration of [5, 10, 30, 60]) {
      const result = generateFullVideoComparison(duration, 1);
      expect(result.dialogueInpainting.totalCredits).toBeLessThan(result.kling.totalCredits);
    }
  });

  it("dialogue inpainting is always faster than Kling", () => {
    const result = generateFullVideoComparison(10, 1);
    expect(result.dialogueInpainting.generationTimeS).toBeLessThan(result.kling.generationTimeS);
  });

  it("savings data is consistent", () => {
    const result = generateFullVideoComparison(10, 1);
    expect(result.savings.creditsSaved).toBeCloseTo(
      result.kling.totalCredits - result.dialogueInpainting.totalCredits,
      2,
    );
    expect(result.savings.savingsPercent).toBeGreaterThan(0);
    expect(result.savings.savingsPercent).toBeLessThanOrEqual(100);
    expect(result.savings.speedMultiplier).toBeGreaterThan(1);
  });

  it("recommends dialogue inpainting for high-savings scenarios", () => {
    const result = generateFullVideoComparison(10, 1);
    // Dialogue inpainting should save >90% for standard scenes
    expect(result.savings.savingsPercent).toBeGreaterThanOrEqual(90);
    expect(result.recommendation).toBe("dialogue_inpainting");
  });

  it("provides a recommendation reason string", () => {
    const result = generateFullVideoComparison(10, 1);
    expect(result.recommendationReason).toBeTruthy();
    expect(typeof result.recommendationReason).toBe("string");
    expect(result.recommendationReason.length).toBeGreaterThan(10);
  });

  it("scales costs linearly with duration", () => {
    const result10 = generateFullVideoComparison(10, 1);
    const result20 = generateFullVideoComparison(20, 1);

    // Kling costs should roughly double
    expect(result20.kling.totalCredits).toBeCloseTo(result10.kling.totalCredits * 2, 1);
    // Generation time should also roughly double
    expect(result20.kling.generationTimeS).toBeCloseTo(result10.kling.generationTimeS * 2, 0);
  });

  it("lip sync accuracy is higher for dialogue inpainting", () => {
    const result = generateFullVideoComparison(10, 1);
    expect(result.dialogueInpainting.lipSyncAccuracy).toBeGreaterThan(result.kling.lipSyncAccuracy);
  });

  it("consistency is higher for dialogue inpainting", () => {
    const result = generateFullVideoComparison(10, 1);
    expect(result.dialogueInpainting.consistency).toBeGreaterThan(result.kling.consistency);
  });

  it("motion naturalness is higher for Kling", () => {
    const result = generateFullVideoComparison(10, 1);
    expect(result.kling.motionNaturalness).toBeGreaterThan(result.dialogueInpainting.motionNaturalness);
  });
});

// ─── 3. A/B Looping Math ─────────────────────────────────────────────

describe("A/B Looping Logic", () => {
  // Pure math functions that mirror the hook logic

  function clampMarkerA(progress: number, markerB: number): number {
    return Math.max(0, Math.min(progress, markerB - 0.01));
  }

  function clampMarkerB(progress: number, markerA: number): number {
    return Math.min(1, Math.max(progress, markerA + 0.01));
  }

  function isInLoopRegion(frame: number, totalFrames: number, markerA: number, markerB: number): boolean {
    const frameA = Math.round(markerA * (totalFrames - 1));
    const frameB = Math.round(markerB * (totalFrames - 1));
    return frame >= frameA && frame <= frameB;
  }

  function loopWrap(frame: number, totalFrames: number, markerA: number, markerB: number): number {
    const frameB = Math.round(markerB * (totalFrames - 1));
    const frameA = Math.round(markerA * (totalFrames - 1));
    if (frame > frameB) return frameA;
    return frame;
  }

  function loopRegionDurationS(markerA: number, markerB: number, durationS: number): number {
    return (markerB - markerA) * durationS;
  }

  function loopRegionFrames(markerA: number, markerB: number, totalFrames: number): number {
    return Math.round((markerB - markerA) * (totalFrames - 1));
  }

  it("clamps marker A to not exceed marker B", () => {
    expect(clampMarkerA(0.5, 0.8)).toBe(0.5);
    expect(clampMarkerA(0.9, 0.8)).toBe(0.79); // clamped to markerB - 0.01
    expect(clampMarkerA(-0.1, 0.8)).toBe(0);
  });

  it("clamps marker B to not go below marker A", () => {
    expect(clampMarkerB(0.8, 0.2)).toBe(0.8);
    expect(clampMarkerB(0.1, 0.2)).toBeCloseTo(0.21, 10); // clamped to markerA + 0.01
    expect(clampMarkerB(1.5, 0.2)).toBe(1);
  });

  it("detects frames inside loop region", () => {
    const totalFrames = 100;
    expect(isInLoopRegion(30, totalFrames, 0.2, 0.8)).toBe(true);
    expect(isInLoopRegion(50, totalFrames, 0.2, 0.8)).toBe(true);
    expect(isInLoopRegion(10, totalFrames, 0.2, 0.8)).toBe(false);
    expect(isInLoopRegion(90, totalFrames, 0.2, 0.8)).toBe(false);
  });

  it("wraps frame back to A when exceeding B", () => {
    const totalFrames = 100;
    expect(loopWrap(85, totalFrames, 0.2, 0.8)).toBe(20); // 85 > 79, wraps to 20
    expect(loopWrap(50, totalFrames, 0.2, 0.8)).toBe(50); // 50 <= 79, no wrap
  });

  it("calculates loop region duration correctly", () => {
    expect(loopRegionDurationS(0.2, 0.8, 10)).toBeCloseTo(6, 1);
    expect(loopRegionDurationS(0, 1, 10)).toBeCloseTo(10, 1);
    expect(loopRegionDurationS(0.5, 0.5, 10)).toBeCloseTo(0, 1);
  });

  it("calculates loop region frame count correctly", () => {
    expect(loopRegionFrames(0.2, 0.8, 100)).toBe(59); // (0.6 * 99) rounded
    expect(loopRegionFrames(0, 1, 100)).toBe(99);
  });

  it("markers at extremes cover full timeline", () => {
    expect(isInLoopRegion(0, 100, 0, 1)).toBe(true);
    expect(isInLoopRegion(99, 100, 0, 1)).toBe(true);
    expect(loopRegionDurationS(0, 1, 10)).toBeCloseTo(10, 1);
  });

  it("very narrow loop region still works", () => {
    // Markers at 0.5 and 0.51 — 1% of timeline
    const totalFrames = 1000;
    const frameA = Math.round(0.5 * 999);
    const frameB = Math.round(0.51 * 999);
    expect(isInLoopRegion(frameA, totalFrames, 0.5, 0.51)).toBe(true);
    expect(isInLoopRegion(frameB, totalFrames, 0.5, 0.51)).toBe(true);
    expect(isInLoopRegion(frameA - 1, totalFrames, 0.5, 0.51)).toBe(false);
  });
});

// ─── 4. Integration: Waveform in Preview Response ────────────────────

describe("Waveform Integration with Preview Data", () => {
  it("waveform sample count matches expected for dialogue duration", () => {
    const durationS = 10;
    const sampleRate = 50;
    const lines = [
      { character: "A", text: "Hello there", startTimeS: 0, endTimeS: 5 },
    ];
    const waveform = generateWaveformData(lines, durationS, sampleRate);

    // Should have exactly ceil(10 * 50) = 500 samples
    expect(waveform.samples.length).toBe(500);
    expect(waveform.sampleRate).toBe(sampleRate);
  });

  it("waveform dialogue regions align with input timing", () => {
    const lines = [
      { character: "Sakura", text: "Hello", startTimeS: 1.0, endTimeS: 3.0 },
      { character: "Hiro", text: "World", startTimeS: 5.0, endTimeS: 7.0 },
    ];
    const waveform = generateWaveformData(lines, 10, 50);

    expect(waveform.dialogueRegions[0].startSample).toBe(50); // 1.0 * 50
    expect(waveform.dialogueRegions[0].endSample).toBe(150); // 3.0 * 50
    expect(waveform.dialogueRegions[1].startSample).toBe(250); // 5.0 * 50
    expect(waveform.dialogueRegions[1].endSample).toBe(350); // 7.0 * 50
  });

  it("waveform has attack/release envelope shape", () => {
    // A long vowel "aaaaaaaaaa" should show attack ramp-up and release ramp-down
    const lines = [
      { character: "A", text: "aaaaaaaaaa", startTimeS: 0, endTimeS: 2 },
    ];
    const waveform = generateWaveformData(lines, 2, 100);

    // First few samples (attack phase) should be lower than middle
    const firstSamples = waveform.samples.slice(0, 5);
    const midSamples = waveform.samples.slice(45, 55);
    const lastSamples = waveform.samples.slice(185, 195);

    const avgFirst = firstSamples.reduce((a, b) => a + b, 0) / firstSamples.length;
    const avgMid = midSamples.reduce((a, b) => a + b, 0) / midSamples.length;
    const avgLast = lastSamples.reduce((a, b) => a + b, 0) / lastSamples.length;

    // Attack: first samples should be lower than mid
    expect(avgFirst).toBeLessThan(avgMid);
    // Release: last samples should be lower than mid
    expect(avgLast).toBeLessThan(avgMid);
  });
});
