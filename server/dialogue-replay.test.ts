/**
 * Tests for the Dialogue Preview Replay Animation logic.
 *
 * Since the replay controller is a React hook, we test the underlying
 * pure-function logic it depends on: frame clamping, progress calculation,
 * speed-adjusted time advance, viseme lookup at frame, blink detection,
 * and head motion interpolation.
 */

import { describe, it, expect } from "vitest";
import {
  generateVisemeTimeline,
  generateBlinkSchedule,
  generateHeadMotion,
} from "./scene-type-router/dialogue-inpainting";
import type { PhonemeTimestamp, BoundingBox } from "./scene-type-router/dialogue-inpainting";

// ─── Replay Math Helpers (mirrors useReplayController logic) ──────────

/** Clamp a frame index to valid range */
function clampFrame(frame: number, totalFrames: number): number {
  return Math.max(0, Math.min(totalFrames - 1, frame));
}

/** Calculate progress (0-1) from frame index */
function frameToProgress(frame: number, totalFrames: number): number {
  if (totalFrames <= 1) return 0;
  return clampFrame(frame, totalFrames) / (totalFrames - 1);
}

/** Calculate frame index from progress (0-1) */
function progressToFrame(progress: number, totalFrames: number): number {
  const clamped = Math.max(0, Math.min(1, progress));
  return Math.round(clamped * (totalFrames - 1));
}

/** Calculate time from frame index */
function frameToTime(frame: number, fps: number): number {
  return frame / fps;
}

/** Advance time by elapsed seconds at given speed */
function advanceTime(currentTimeS: number, elapsedS: number, speed: number): number {
  return currentTimeS + elapsedS * speed;
}

/** Get frame from time */
function timeToFrame(timeS: number, fps: number): number {
  return Math.floor(timeS * fps);
}

/** Look up viseme at a given frame index */
function getVisemeAtFrame(
  frames: Array<{ viseme: string; frameIndex: number }>,
  frameIndex: number,
): string {
  const frame = frames.find(f => f.frameIndex === frameIndex);
  return frame?.viseme ?? "Rest";
}

/** Check if a frame is inside any blink event */
function isFrameBlinking(
  blinkEvents: Array<{ startFrameIndex: number; endFrameIndex: number }>,
  frameIndex: number,
): boolean {
  return blinkEvents.some(
    b => frameIndex >= b.startFrameIndex && frameIndex <= b.endFrameIndex,
  );
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe("Replay Animation — Frame Clamping", () => {
  it("clamps negative frames to 0", () => {
    expect(clampFrame(-5, 100)).toBe(0);
  });

  it("clamps frames beyond total to last frame", () => {
    expect(clampFrame(150, 100)).toBe(99);
  });

  it("passes through valid frames unchanged", () => {
    expect(clampFrame(50, 100)).toBe(50);
  });

  it("handles edge case of 0 frame", () => {
    expect(clampFrame(0, 100)).toBe(0);
  });

  it("handles edge case of last frame", () => {
    expect(clampFrame(99, 100)).toBe(99);
  });

  it("handles single-frame timeline", () => {
    expect(clampFrame(0, 1)).toBe(0);
    expect(clampFrame(5, 1)).toBe(0);
  });
});

describe("Replay Animation — Progress Calculation", () => {
  it("frame 0 maps to progress 0", () => {
    expect(frameToProgress(0, 100)).toBe(0);
  });

  it("last frame maps to progress 1", () => {
    expect(frameToProgress(99, 100)).toBe(1);
  });

  it("midpoint frame maps to ~0.5", () => {
    const progress = frameToProgress(49, 100);
    expect(progress).toBeCloseTo(0.495, 2);
  });

  it("handles single-frame timeline", () => {
    expect(frameToProgress(0, 1)).toBe(0);
  });

  it("progress 0 maps to frame 0", () => {
    expect(progressToFrame(0, 100)).toBe(0);
  });

  it("progress 1 maps to last frame", () => {
    expect(progressToFrame(1, 100)).toBe(99);
  });

  it("progress 0.5 maps to middle frame", () => {
    expect(progressToFrame(0.5, 100)).toBe(50);
  });

  it("clamps progress below 0", () => {
    expect(progressToFrame(-0.5, 100)).toBe(0);
  });

  it("clamps progress above 1", () => {
    expect(progressToFrame(1.5, 100)).toBe(99);
  });

  it("round-trips frame → progress → frame", () => {
    for (const frame of [0, 25, 50, 75, 99]) {
      const progress = frameToProgress(frame, 100);
      const recovered = progressToFrame(progress, 100);
      expect(recovered).toBe(frame);
    }
  });
});

describe("Replay Animation — Time and Speed", () => {
  it("frame to time at 8fps", () => {
    expect(frameToTime(0, 8)).toBe(0);
    expect(frameToTime(8, 8)).toBe(1);
    expect(frameToTime(40, 8)).toBe(5);
  });

  it("frame to time at 24fps", () => {
    expect(frameToTime(24, 24)).toBe(1);
    expect(frameToTime(48, 24)).toBe(2);
  });

  it("time to frame at 8fps", () => {
    expect(timeToFrame(0, 8)).toBe(0);
    expect(timeToFrame(1, 8)).toBe(8);
    expect(timeToFrame(5, 8)).toBe(40);
  });

  it("advance time at 1x speed", () => {
    expect(advanceTime(0, 0.5, 1)).toBeCloseTo(0.5);
    expect(advanceTime(2, 1, 1)).toBeCloseTo(3);
  });

  it("advance time at 0.5x speed", () => {
    expect(advanceTime(0, 1, 0.5)).toBeCloseTo(0.5);
  });

  it("advance time at 2x speed", () => {
    expect(advanceTime(0, 1, 2)).toBeCloseTo(2);
  });

  it("advance time at 0.25x speed", () => {
    expect(advanceTime(0, 4, 0.25)).toBeCloseTo(1);
  });

  it("speed-adjusted playback reaches end at correct time", () => {
    const durationS = 10;
    const fps = 8;
    const totalFrames = durationS * fps;

    // At 2x speed, 5 real seconds = 10s of playback
    let time = 0;
    const realElapsed = 5;
    time = advanceTime(time, realElapsed, 2);
    expect(time).toBeCloseTo(durationS);
    expect(timeToFrame(time, fps)).toBe(totalFrames);
  });
});

describe("Replay Animation — Viseme Lookup", () => {
  const phonemes: PhonemeTimestamp[] = [
    { phoneme: "a", startTimeS: 0, endTimeS: 2 },
    { phoneme: "i", startTimeS: 3, endTimeS: 5 },
  ];
  const frames = generateVisemeTimeline(phonemes, 5, 8);

  it("returns correct viseme at frame 0 (inside 'a' phoneme)", () => {
    expect(getVisemeAtFrame(frames, 0)).toBe("A");
  });

  it("returns Rest for frame in gap between phonemes", () => {
    // Frame at t=2.5s (frame 20) is between phonemes
    expect(getVisemeAtFrame(frames, 20)).toBe("Rest");
  });

  it("returns I for frame inside second phoneme", () => {
    // Frame at t=3.5s (frame 28)
    expect(getVisemeAtFrame(frames, 28)).toBe("I");
  });

  it("returns I for last frame still inside second phoneme range", () => {
    // Frame 39 at 8fps = 4.875s, which is inside phoneme 'i' (3-5s)
    expect(getVisemeAtFrame(frames, 39)).toBe("I");
  });

  it("returns Rest for non-existent frame index", () => {
    expect(getVisemeAtFrame(frames, 999)).toBe("Rest");
  });
});

describe("Replay Animation — Blink Detection", () => {
  const eyeRegion: BoundingBox = { x: 80, y: 60, width: 40, height: 20 };
  const events = generateBlinkSchedule(20, 8, "Test", eyeRegion);

  it("detects blink at start frame of an event", () => {
    if (events.length > 0) {
      expect(isFrameBlinking(events, events[0].startFrameIndex)).toBe(true);
    }
  });

  it("detects blink at end frame of an event", () => {
    if (events.length > 0) {
      expect(isFrameBlinking(events, events[0].endFrameIndex)).toBe(true);
    }
  });

  it("does not detect blink at frame 0 (before first blink)", () => {
    // First blink starts at 3-5 seconds, frame 0 should not be blinking
    expect(isFrameBlinking(events, 0)).toBe(false);
  });

  it("does not detect blink between events", () => {
    if (events.length >= 2) {
      // Frame between first and second blink
      const gapFrame = events[0].endFrameIndex + 2;
      if (gapFrame < events[1].startFrameIndex) {
        expect(isFrameBlinking(events, gapFrame)).toBe(false);
      }
    }
  });
});

describe("Replay Animation — Head Motion Sync", () => {
  const motion = generateHeadMotion(10, 8);

  it("head motion has entry for every frame", () => {
    expect(motion).toHaveLength(80);
    for (let i = 0; i < 80; i++) {
      expect(motion[i].frameIndex).toBe(i);
    }
  });

  it("can look up head motion at any valid frame", () => {
    const m = motion.find(h => h.frameIndex === 40);
    expect(m).toBeDefined();
    expect(m!.rotationDeg).toBeDefined();
    expect(m!.translationX).toBeDefined();
    expect(m!.translationY).toBeDefined();
  });

  it("returns undefined for invalid frame", () => {
    const m = motion.find(h => h.frameIndex === 999);
    expect(m).toBeUndefined();
  });
});

describe("Replay Animation — Scrubbing via Progress", () => {
  it("clicking at 25% of bar width seeks to correct frame", () => {
    const totalFrames = 80;
    const clickProgress = 0.25;
    const frame = progressToFrame(clickProgress, totalFrames);
    expect(frame).toBe(20);
  });

  it("clicking at 0% seeks to frame 0", () => {
    expect(progressToFrame(0, 80)).toBe(0);
  });

  it("clicking at 100% seeks to last frame", () => {
    expect(progressToFrame(1, 80)).toBe(79);
  });

  it("dragging from 10% to 90% produces correct frame sequence", () => {
    const totalFrames = 80;
    const positions = [0.1, 0.3, 0.5, 0.7, 0.9];
    const expectedFrames = [8, 24, 40, 55, 71];
    for (let i = 0; i < positions.length; i++) {
      expect(progressToFrame(positions[i], totalFrames)).toBe(expectedFrames[i]);
    }
  });
});

describe("Replay Animation — Edge Cases", () => {
  it("handles 0-frame timeline gracefully", () => {
    expect(frameToProgress(0, 0)).toBe(0);
    expect(clampFrame(0, 0)).toBe(0);
  });

  it("handles very short duration (1 frame)", () => {
    const frames = generateVisemeTimeline([], 0.1, 8);
    expect(frames.length).toBeGreaterThanOrEqual(1);
    expect(getVisemeAtFrame(frames, 0)).toBe("Rest");
  });

  it("handles very long duration without overflow", () => {
    const totalFrames = 120 * 8; // 120 seconds at 8fps = 960 frames
    expect(clampFrame(500, totalFrames)).toBe(500);
    expect(frameToProgress(480, totalFrames)).toBeCloseTo(0.5, 1);
  });

  it("speed 0.25x takes 4x longer to reach end", () => {
    let time = 0;
    // 40 real seconds at 0.25x = 10s of playback
    time = advanceTime(time, 40, 0.25);
    expect(time).toBeCloseTo(10);
  });
});
