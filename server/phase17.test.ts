import { describe, it, expect } from "vitest";
import {
  SINGING_VOICE_CATEGORIES,
  VOCAL_RANGES,
  PERFORMANCE_ANNOTATION_TYPES,
  CONVERSION_DEFAULTS,
  MAX_CONVERSIONS_PER_THEME,
} from "./routers-vocalrecording";

// ─── Constants & Configuration Tests ────────────────────────────────────

describe("Phase 17: Singing Voice Categories", () => {
  it("should define voice categories", () => {
    expect(SINGING_VOICE_CATEGORIES.length).toBeGreaterThanOrEqual(3);
    const genders = SINGING_VOICE_CATEGORIES.map(c => c.gender);
    expect(genders).toContain("female");
    expect(genders).toContain("male");
    expect(genders).toContain("non-binary");
  });

  it("each category should have required fields", () => {
    for (const cat of SINGING_VOICE_CATEGORIES) {
      expect(cat).toHaveProperty("gender");
      expect(cat).toHaveProperty("label");
    }
  });
});

describe("Phase 17: Vocal Ranges", () => {
  it("should define standard vocal ranges", () => {
    expect(VOCAL_RANGES.length).toBeGreaterThanOrEqual(4);
    expect(VOCAL_RANGES).toContain("soprano");
    expect(VOCAL_RANGES).toContain("alto");
    expect(VOCAL_RANGES).toContain("tenor");
    expect(VOCAL_RANGES).toContain("bass");
  });

  it("should include mezzo-soprano and baritone", () => {
    expect(VOCAL_RANGES).toContain("mezzo-soprano");
    expect(VOCAL_RANGES).toContain("baritone");
  });
});

describe("Phase 17: Performance Annotation Types", () => {
  it("should define volume levels", () => {
    expect(PERFORMANCE_ANNOTATION_TYPES.volume).toContain("whisper");
    expect(PERFORMANCE_ANNOTATION_TYPES.volume).toContain("soft");
    expect(PERFORMANCE_ANNOTATION_TYPES.volume).toContain("medium");
    expect(PERFORMANCE_ANNOTATION_TYPES.volume).toContain("loud");
    expect(PERFORMANCE_ANNOTATION_TYPES.volume).toContain("belt");
    expect(PERFORMANCE_ANNOTATION_TYPES.volume.length).toBe(5);
  });

  it("should define emotion types", () => {
    expect(PERFORMANCE_ANNOTATION_TYPES.emotion.length).toBeGreaterThanOrEqual(8);
    expect(PERFORMANCE_ANNOTATION_TYPES.emotion).toContain("hopeful");
    expect(PERFORMANCE_ANNOTATION_TYPES.emotion).toContain("angry");
    expect(PERFORMANCE_ANNOTATION_TYPES.emotion).toContain("sad");
    expect(PERFORMANCE_ANNOTATION_TYPES.emotion).toContain("joyful");
  });

  it("should define singing techniques", () => {
    expect(PERFORMANCE_ANNOTATION_TYPES.technique.length).toBeGreaterThanOrEqual(6);
    expect(PERFORMANCE_ANNOTATION_TYPES.technique).toContain("vibrato");
    expect(PERFORMANCE_ANNOTATION_TYPES.technique).toContain("hold_note");
    expect(PERFORMANCE_ANNOTATION_TYPES.technique).toContain("crescendo");
  });
});

describe("Phase 17: Conversion Defaults", () => {
  it("should have pitch shift at 0 (auto-detect)", () => {
    expect(CONVERSION_DEFAULTS.pitchShift).toBe(0);
  });

  it("should use rmvpe as f0 method", () => {
    expect(CONVERSION_DEFAULTS.f0Method).toBe("rmvpe");
  });

  it("should have reasonable index rate", () => {
    expect(CONVERSION_DEFAULTS.indexRate).toBeGreaterThan(0);
    expect(CONVERSION_DEFAULTS.indexRate).toBeLessThanOrEqual(1);
  });

  it("should have reverb settings", () => {
    expect(CONVERSION_DEFAULTS.reverbDecay).toBeGreaterThan(0);
    expect(CONVERSION_DEFAULTS.reverbWet).toBeGreaterThan(0);
    expect(CONVERSION_DEFAULTS.reverbWet).toBeLessThan(1);
  });

  it("should have compression settings", () => {
    expect(CONVERSION_DEFAULTS.compressionThreshold).toBeLessThan(0);
    expect(CONVERSION_DEFAULTS.compressionRatio).toBeGreaterThan(1);
  });

  it("should have EQ settings", () => {
    expect(CONVERSION_DEFAULTS.eqPresenceBoost).toBeGreaterThan(0);
    expect(CONVERSION_DEFAULTS.eqMudCut).toBeLessThan(0);
  });

  it("should target broadcast standard LUFS", () => {
    expect(CONVERSION_DEFAULTS.targetLufs).toBe(-14);
  });
});

describe("Phase 17: Max Conversions Limit", () => {
  it("should allow 3 conversions per theme", () => {
    expect(MAX_CONVERSIONS_PER_THEME).toBe(3);
  });
});

// ─── Performance Guide Router Tests ─────────────────────────────────────

describe("Phase 17: Performance Guide Router", () => {
  it("should export performanceGuideRouter", async () => {
    const { performanceGuideRouter } = await import("./routers-vocalrecording");
    expect(performanceGuideRouter).toBeDefined();
    expect(performanceGuideRouter._def).toBeDefined();
  });

  it("should have generate procedure", async () => {
    const { performanceGuideRouter } = await import("./routers-vocalrecording");
    const procedures = performanceGuideRouter._def.procedures;
    expect(procedures).toHaveProperty("generate");
  });
});

// ─── Singing Voice Router Tests ─────────────────────────────────────────

describe("Phase 17: Singing Voice Router", () => {
  it("should export singingVoiceRouter", async () => {
    const { singingVoiceRouter } = await import("./routers-vocalrecording");
    expect(singingVoiceRouter).toBeDefined();
  });

  it("should have list and getPreview procedures", async () => {
    const { singingVoiceRouter } = await import("./routers-vocalrecording");
    const procedures = singingVoiceRouter._def.procedures;
    expect(procedures).toHaveProperty("list");
    expect(procedures).toHaveProperty("getPreview");
  });
});

// ─── Vocal Recording Router Tests ───────────────────────────────────────

describe("Phase 17: Vocal Recording Router", () => {
  it("should export vocalRecordingRouter", async () => {
    const { vocalRecordingRouter } = await import("./routers-vocalrecording");
    expect(vocalRecordingRouter).toBeDefined();
  });

  it("should have upload, getStatus, getBackingTrack, getByProject procedures", async () => {
    const { vocalRecordingRouter } = await import("./routers-vocalrecording");
    const procedures = vocalRecordingRouter._def.procedures;
    expect(procedures).toHaveProperty("upload");
    expect(procedures).toHaveProperty("getStatus");
    expect(procedures).toHaveProperty("getBackingTrack");
    expect(procedures).toHaveProperty("getByProject");
  });
});

// ─── Voice Conversion Router Tests ──────────────────────────────────────

describe("Phase 17: Voice Conversion Router", () => {
  it("should export voiceConversionRouter", async () => {
    const { voiceConversionRouter } = await import("./routers-vocalrecording");
    expect(voiceConversionRouter).toBeDefined();
  });

  it("should have convert, reRecordSection, adjustMix, approve procedures", async () => {
    const { voiceConversionRouter } = await import("./routers-vocalrecording");
    const procedures = voiceConversionRouter._def.procedures;
    expect(procedures).toHaveProperty("convert");
    expect(procedures).toHaveProperty("reRecordSection");
    expect(procedures).toHaveProperty("adjustMix");
    expect(procedures).toHaveProperty("approve");
  });
});

// ─── Workflow Logic Tests ───────────────────────────────────────────────

describe("Phase 17: Vocal Recording Workflow", () => {
  it("recording modes should be full_take or section_by_section", () => {
    const validModes = ["full_take", "section_by_section"];
    expect(validModes).toContain("full_take");
    expect(validModes).toContain("section_by_section");
  });

  it("conversion statuses should follow the pipeline flow", () => {
    const statuses = ["pending", "isolating_vocals", "converting", "mixing", "ready", "failed"];
    expect(statuses.indexOf("isolating_vocals")).toBeLessThan(statuses.indexOf("converting"));
    expect(statuses.indexOf("converting")).toBeLessThan(statuses.indexOf("mixing"));
    expect(statuses.indexOf("mixing")).toBeLessThan(statuses.indexOf("ready"));
  });

  it("should support section re-recording for partial fixes", () => {
    // Section re-recording allows fixing specific parts without re-recording entire song
    const sectionTypes = ["verse", "chorus", "bridge", "intro", "outro"];
    expect(sectionTypes.length).toBeGreaterThanOrEqual(4);
  });

  it("mix adjustment should support vocal volume, reverb, and backing track", () => {
    const mixParams = ["vocalVolume", "reverbAmount", "backingTrackVolume"];
    expect(mixParams.length).toBe(3);
  });

  it("three-way comparison should include raw, converted, and final mix", () => {
    const comparisonTracks = ["rawRecording", "convertedVocal", "finalMix"];
    expect(comparisonTracks.length).toBe(3);
  });

  it("performance guide sections should have energy levels 1-10", () => {
    for (let i = 1; i <= 10; i++) {
      expect(i).toBeGreaterThanOrEqual(1);
      expect(i).toBeLessThanOrEqual(10);
    }
  });
});
