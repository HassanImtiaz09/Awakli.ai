/**
 * Stage 6B · Video — Long-form + Master Export (Studio / Studio Pro)
 *
 * Tests: ChapterComposer, MasterExport, MusicBed, copy strings, pricing, tier limits
 */
import { describe, it, expect } from "vitest";

// ─── ChapterComposer ────────────────────────────────────────────────
import {
  CHAPTER_COPY,
  chapterDuration,
  totalChaptersDuration,
  createChapter,
  type Chapter,
  type ChapterScene,
} from "../client/src/components/awakli/ChapterComposer";

// ─── MasterExport ───────────────────────────────────────────────────
import {
  EXPORT_COPY,
  EXPORT_OPTIONS,
  calculateExportCredits,
  type ExportConfig,
} from "../client/src/components/awakli/MasterExport";

// ─── MusicBed ───────────────────────────────────────────────────────
import {
  MUSIC_COPY,
  AUTO_DUCK_DB,
  STOCK_CUES,
  validateUpload,
} from "../client/src/components/awakli/MusicBed";

// ─── Video page ─────────────────────────────────────────────────────
import {
  VIDEO_COPY,
  STUDIO_LIMITS,
  STUDIO_PRO_LIMITS,
} from "../client/src/pages/create/video";

// ─── DurationForecast (for base credit calc) ────────────────────────
import {
  MANGAKA_LIMITS,
} from "../client/src/components/awakli/DurationForecast";

// ═════════════════════════════════════════════════════════════════════
// CHAPTER COMPOSER
// ═════════════════════════════════════════════════════════════════════
describe("ChapterComposer", () => {
  describe("copy strings", () => {
    it("has exact title", () => {
      expect(CHAPTER_COPY.title).toBe("Chapters");
    });

    it("has add chapter label", () => {
      expect(CHAPTER_COPY.addChapter).toBe("Add chapter");
    });

    it("has remove label", () => {
      expect(CHAPTER_COPY.removeChapter).toBe("Remove");
    });

    it("formats chapter labels correctly", () => {
      expect(CHAPTER_COPY.chapterLabel(1)).toBe("Chapter 1");
      expect(CHAPTER_COPY.chapterLabel(5)).toBe("Chapter 5");
    });

    it("formats scene count with proper pluralization", () => {
      expect(CHAPTER_COPY.sceneCount(1)).toBe("1 scene");
      expect(CHAPTER_COPY.sceneCount(3)).toBe("3 scenes");
      expect(CHAPTER_COPY.sceneCount(0)).toBe("0 scenes");
    });

    it("has drag hint", () => {
      expect(CHAPTER_COPY.dragHint).toBe(
        "Drag scenes between chapters to reorder"
      );
    });

    it("has empty chapter text", () => {
      expect(CHAPTER_COPY.emptyChapter).toBe(
        "Drag scenes here or add from the timeline"
      );
    });
  });

  describe("duration calculations", () => {
    const makeScene = (dur: number): ChapterScene => ({
      panelIndex: 0,
      imageUrl: null,
      duration: dur,
    });

    it("calculates single chapter duration", () => {
      const ch: Chapter = {
        id: "ch-1",
        title: "Ch 1",
        scenes: [makeScene(2), makeScene(3), makeScene(1.5)],
        collapsed: false,
      };
      expect(chapterDuration(ch)).toBe(6.5);
    });

    it("returns 0 for empty chapter", () => {
      const ch: Chapter = {
        id: "ch-1",
        title: "Ch 1",
        scenes: [],
        collapsed: false,
      };
      expect(chapterDuration(ch)).toBe(0);
    });

    it("calculates total across multiple chapters", () => {
      const chapters: Chapter[] = [
        {
          id: "ch-1",
          title: "Ch 1",
          scenes: [makeScene(3), makeScene(3)],
          collapsed: false,
        },
        {
          id: "ch-2",
          title: "Ch 2",
          scenes: [makeScene(4)],
          collapsed: false,
        },
      ];
      expect(totalChaptersDuration(chapters)).toBe(10);
    });

    it("4 chapters × 3 min each stays under 12-min Studio cap", () => {
      const chapters: Chapter[] = Array.from({ length: 4 }, (_, i) => ({
        id: `ch-${i}`,
        title: `Ch ${i + 1}`,
        scenes: Array.from({ length: 6 }, (_, j) => makeScene(30)), // 6 × 30s = 180s = 3 min
        collapsed: false,
      }));
      const total = totalChaptersDuration(chapters);
      expect(total).toBe(720); // 12 min exactly
      expect(total).toBeLessThanOrEqual(STUDIO_LIMITS.maxRuntime);
    });
  });

  describe("createChapter helper", () => {
    it("creates a chapter with correct title", () => {
      const ch = createChapter(0);
      expect(ch.title).toBe("Chapter 1");
      expect(ch.scenes).toEqual([]);
      expect(ch.collapsed).toBe(false);
    });

    it("generates unique IDs", () => {
      const ch1 = createChapter(0);
      const ch2 = createChapter(1);
      expect(ch1.id).not.toBe(ch2.id);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════
// MASTER EXPORT
// ═════════════════════════════════════════════════════════════════════
describe("MasterExport", () => {
  describe("copy strings", () => {
    it("has exact title", () => {
      expect(EXPORT_COPY.title).toBe("How would you like the master?");
    });

    it("has 1080p option", () => {
      expect(EXPORT_COPY.option1080).toBe("1080p MP4");
    });

    it("has 4K option with exact pricing", () => {
      expect(EXPORT_COPY.option4K).toBe("4K MP4 · +30% credits");
    });

    it("has ProRes option with exact pricing", () => {
      expect(EXPORT_COPY.optionProRes).toBe("ProRes 422 HQ · +60% credits");
    });

    it("has stems option with exact pricing", () => {
      expect(EXPORT_COPY.optionStems).toBe(
        "Separated stems (dialogue · music · sfx) · +20% credits"
      );
    });
  });

  describe("export options catalog", () => {
    it("has 4 export options", () => {
      expect(EXPORT_OPTIONS).toHaveLength(4);
    });

    it("has correct multipliers", () => {
      const map = Object.fromEntries(
        EXPORT_OPTIONS.map((o) => [o.id, o.multiplier])
      );
      expect(map["1080p"]).toBe(0);
      expect(map["4k"]).toBe(0.3);
      expect(map["prores"]).toBe(0.6);
      expect(map["stems"]).toBe(0.2);
    });
  });

  describe("credit calculations", () => {
    it("1080p MP4 no extras = base cost", () => {
      const config: ExportConfig = {
        resolution: "1080p",
        format: "mp4",
        stems: false,
      };
      const result = calculateExportCredits(100, config);
      expect(result.total).toBe(100);
      expect(result.breakdown).toHaveLength(1);
    });

    it("4K adds exactly 30%", () => {
      const config: ExportConfig = {
        resolution: "4k",
        format: "mp4",
        stems: false,
      };
      const result = calculateExportCredits(100, config);
      expect(result.total).toBe(130);
    });

    it("ProRes adds exactly 60%", () => {
      const config: ExportConfig = {
        resolution: "1080p",
        format: "prores",
        stems: false,
      };
      const result = calculateExportCredits(100, config);
      expect(result.total).toBe(160);
    });

    it("stems adds exactly 20%", () => {
      const config: ExportConfig = {
        resolution: "1080p",
        format: "mp4",
        stems: true,
      };
      const result = calculateExportCredits(100, config);
      expect(result.total).toBe(120);
    });

    it("4K + ProRes + stems = +110%", () => {
      const config: ExportConfig = {
        resolution: "4k",
        format: "prores",
        stems: true,
      };
      const result = calculateExportCredits(100, config);
      // 100 + 30 + 60 + 20 = 210
      expect(result.total).toBe(210);
    });

    it("rounds up partial credits", () => {
      const config: ExportConfig = {
        resolution: "4k",
        format: "mp4",
        stems: false,
      };
      // 33 * 0.3 = 9.9 → ceil = 10
      const result = calculateExportCredits(33, config);
      expect(result.total).toBe(43); // 33 + 10
    });

    it("provides breakdown entries for each surcharge", () => {
      const config: ExportConfig = {
        resolution: "4k",
        format: "prores",
        stems: true,
      };
      const result = calculateExportCredits(100, config);
      expect(result.breakdown).toHaveLength(4); // base + 4K + ProRes + stems
      expect(result.breakdown[0].label).toBe("Base render");
      expect(result.breakdown[1].label).toContain("4K");
      expect(result.breakdown[2].label).toContain("ProRes");
      expect(result.breakdown[3].label).toContain("Stem");
    });
  });
});

// ═════════════════════════════════════════════════════════════════════
// MUSIC BED
// ═════════════════════════════════════════════════════════════════════
describe("MusicBed", () => {
  describe("copy strings", () => {
    it("has exact title", () => {
      expect(MUSIC_COPY.title).toBe("Score");
    });

    it("has exact upload label", () => {
      expect(MUSIC_COPY.upload).toBe("Upload a cue (WAV/MP3, ≤20MB)");
    });

    it("has upload cost", () => {
      expect(MUSIC_COPY.uploadCost).toBe("2 credits per upload");
    });

    it("has catalog label", () => {
      expect(MUSIC_COPY.catalogLabel).toBe("Licensed catalog");
    });

    it("has auto-duck label", () => {
      expect(MUSIC_COPY.autoDuck).toBe("Auto-ducking: -12dB under dialogue");
    });

    it("has search placeholder", () => {
      expect(MUSIC_COPY.searchPlaceholder).toBe("Search cues…");
    });
  });

  describe("auto-ducking constant", () => {
    it("is -12dB", () => {
      expect(AUTO_DUCK_DB).toBe(-12);
    });
  });

  describe("stock catalog", () => {
    it("has exactly 40 cues", () => {
      expect(STOCK_CUES).toHaveLength(40);
    });

    it("each cue has required fields", () => {
      for (const cue of STOCK_CUES) {
        expect(cue.id).toBeTruthy();
        expect(cue.title).toBeTruthy();
        expect(cue.artist).toBeTruthy();
        expect(cue.genre).toBeTruthy();
        expect(cue.mood).toBeTruthy();
        expect(cue.durationSeconds).toBeGreaterThan(0);
        expect(cue.bpm).toBeGreaterThan(0);
      }
    });

    it("all cue IDs are unique", () => {
      const ids = STOCK_CUES.map((c) => c.id);
      expect(new Set(ids).size).toBe(40);
    });
  });

  describe("upload validation", () => {
    it("rejects files over 20MB", () => {
      const file = new File(["x"], "big.wav", { type: "audio/wav" });
      Object.defineProperty(file, "size", { value: 21 * 1024 * 1024 });
      expect(validateUpload(file)).toBe(MUSIC_COPY.uploadError);
    });

    it("accepts WAV under 20MB", () => {
      const file = new File(["x"], "good.wav", { type: "audio/wav" });
      Object.defineProperty(file, "size", { value: 5 * 1024 * 1024 });
      expect(validateUpload(file)).toBeNull();
    });

    it("accepts MP3 under 20MB", () => {
      const file = new File(["x"], "good.mp3", { type: "audio/mpeg" });
      Object.defineProperty(file, "size", { value: 5 * 1024 * 1024 });
      expect(validateUpload(file)).toBeNull();
    });

    it("rejects non-audio files", () => {
      const file = new File(["x"], "bad.pdf", { type: "application/pdf" });
      Object.defineProperty(file, "size", { value: 1 * 1024 * 1024 });
      expect(validateUpload(file)).toBe(MUSIC_COPY.uploadError);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════
// TIER LIMITS
// ═════════════════════════════════════════════════════════════════════
describe("Studio tier limits", () => {
  it("Studio: 12 min max runtime", () => {
    expect(STUDIO_LIMITS.maxRuntime).toBe(720);
  });

  it("Studio: 4K resolution available", () => {
    expect(STUDIO_LIMITS.maxResolution).toBe("4K");
  });

  it("Studio: has MP4 and ProRes formats", () => {
    expect(STUDIO_LIMITS.exportFormats).toContain("MP4 H.264");
    expect(STUDIO_LIMITS.exportFormats).toContain("ProRes 422 HQ");
  });

  it("Studio: 10 renders per episode per month", () => {
    expect(STUDIO_LIMITS.maxRendersPerEpisodePerMonth).toBe(10);
  });

  it("Studio: music upload costs 2c", () => {
    expect(STUDIO_LIMITS.musicUploadCost).toBe(2);
  });

  it("Studio Pro: 24 min max runtime", () => {
    expect(STUDIO_PRO_LIMITS.maxRuntime).toBe(1440);
  });

  it("Studio Pro: unlimited renders", () => {
    expect(STUDIO_PRO_LIMITS.maxRendersPerEpisodePerMonth).toBe(Infinity);
  });

  it("Studio Pro: 2000c monthly master pool", () => {
    expect(STUDIO_PRO_LIMITS.monthlyMasterPool).toBe(2000);
  });

  it("Mangaka: 60s max runtime", () => {
    expect(MANGAKA_LIMITS.maxRuntime).toBe(60);
  });

  it("Mangaka: 1080p resolution", () => {
    expect(MANGAKA_LIMITS.maxResolution).toBe("1080p");
  });
});

// ═════════════════════════════════════════════════════════════════════
// VIDEO PAGE COPY
// ═════════════════════════════════════════════════════════════════════
describe("Video page copy strings", () => {
  it("has exact page title", () => {
    expect(VIDEO_COPY.pageTitle).toBe("Your anime");
  });

  it("has exact subhead", () => {
    expect(VIDEO_COPY.subhead).toBe(
      "How long should each moment breathe?"
    );
  });

  it("has exact render phase 1", () => {
    expect(VIDEO_COPY.renderPhase1).toBe("Bringing panels to motion…");
  });

  it("has exact render phase 2", () => {
    expect(VIDEO_COPY.renderPhase2).toBe("Casting voices…");
  });

  it("has exact render phase 3", () => {
    expect(VIDEO_COPY.renderPhase3).toBe("Composing the final cut…");
  });

  it("has error retry label", () => {
    expect(VIDEO_COPY.errorRetry).toBe("Retry render");
  });

  it("has error refund label", () => {
    expect(VIDEO_COPY.errorRefund).toBe("Credits auto-refunded");
  });
});

// ═════════════════════════════════════════════════════════════════════
// ANALYTICS EVENTS (existence check)
// ═════════════════════════════════════════════════════════════════════
describe("Analytics events", () => {
  const requiredEvents = [
    "stage6_chapters_compose",
    "stage6_music_pick",
    "stage6_export_4k",
    "stage6_export_prores",
    "stage6_export_stems",
  ];

  // We verify these strings exist in the video.tsx source
  it("all required events are referenced in video.tsx", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync(
      "client/src/pages/create/video.tsx",
      "utf-8"
    );
    for (const event of requiredEvents) {
      expect(source).toContain(event);
    }
  });
});
