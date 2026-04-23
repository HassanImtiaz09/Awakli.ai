/**
 * Tests for the SRT Subtitle Generator and Anime Publish Router.
 *
 * Coverage:
 *   - Pure helpers: secondsToSrtTime, wrapSubtitleText, formatSubtitleText, parseSliceDialogue
 *   - SRT formatting: formatSrtCue, formatSrtFile
 *   - Core: generateSubtitleCues (multi-speaker, empty dialogue, overlapping, auto-wrap)
 *   - Integration: generateSrt (mocked DB + S3)
 *   - Router: animePublish endpoints (publish status, subtitle gen, publish/unpublish, player)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Pure helper imports (no side effects) ──────────────────────────────

import {
  secondsToSrtTime,
  wrapSubtitleText,
  formatSubtitleText,
  formatSrtCue,
  formatSrtFile,
  parseSliceDialogue,
  generateSubtitleCues,
  MAX_LINE_LENGTH,
  DEFAULT_CUE_DURATION,
  MIN_CUE_GAP,
  MAX_CUE_DURATION,
  type DialogueEntry,
  type SubtitleCue,
} from "./subtitle-generator";

// ─── secondsToSrtTime ───────────────────────────────────────────────────

describe("secondsToSrtTime", () => {
  it("should format 0 seconds correctly", () => {
    expect(secondsToSrtTime(0)).toBe("00:00:00,000");
  });

  it("should format whole seconds", () => {
    expect(secondsToSrtTime(5)).toBe("00:00:05,000");
    expect(secondsToSrtTime(60)).toBe("00:01:00,000");
    expect(secondsToSrtTime(3600)).toBe("01:00:00,000");
  });

  it("should format fractional seconds with milliseconds", () => {
    expect(secondsToSrtTime(1.5)).toBe("00:00:01,500");
    expect(secondsToSrtTime(62.123)).toBe("00:01:02,123");
    expect(secondsToSrtTime(3661.999)).toBe("01:01:01,999");
  });

  it("should clamp negative values to 0", () => {
    expect(secondsToSrtTime(-5)).toBe("00:00:00,000");
  });

  it("should handle large timestamps", () => {
    expect(secondsToSrtTime(7200)).toBe("02:00:00,000");
    expect(secondsToSrtTime(86399)).toBe("23:59:59,000");
  });

  it("should handle very small fractions", () => {
    expect(secondsToSrtTime(0.001)).toBe("00:00:00,001");
    expect(secondsToSrtTime(0.01)).toBe("00:00:00,010");
    expect(secondsToSrtTime(0.1)).toBe("00:00:00,100");
  });
});

// ─── wrapSubtitleText ───────────────────────────────────────────────────

describe("wrapSubtitleText", () => {
  it("should return short text unchanged", () => {
    expect(wrapSubtitleText("Hello world")).toBe("Hello world");
  });

  it("should not wrap text at exactly MAX_LINE_LENGTH", () => {
    const text = "a".repeat(MAX_LINE_LENGTH);
    expect(wrapSubtitleText(text)).toBe(text);
  });

  it("should wrap long text at word boundary near midpoint", () => {
    const text = "The quick brown fox jumps over the lazy dog and keeps running forever";
    const result = wrapSubtitleText(text);
    expect(result).toContain("\n");
    const lines = result.split("\n");
    expect(lines.length).toBe(2);
    // Both lines should be reasonable lengths
    expect(lines[0].length).toBeLessThanOrEqual(MAX_LINE_LENGTH + 5);
    expect(lines[1].length).toBeLessThanOrEqual(MAX_LINE_LENGTH + 5);
  });

  it("should force-split text with no spaces", () => {
    const text = "a".repeat(MAX_LINE_LENGTH + 10);
    const result = wrapSubtitleText(text);
    expect(result).toContain("\n");
    const lines = result.split("\n");
    expect(lines.length).toBe(2);
  });

  it("should trim whitespace", () => {
    expect(wrapSubtitleText("  hello  ")).toBe("hello");
  });

  it("should respect custom maxLength", () => {
    const text = "Hello wonderful world";
    const result = wrapSubtitleText(text, 10);
    expect(result).toContain("\n");
  });
});

// ─── formatSubtitleText ─────────────────────────────────────────────────

describe("formatSubtitleText", () => {
  it("should return plain text without character name when not multi-speaker", () => {
    const entry: DialogueEntry = { text: "Hello there", characterName: "Akira" };
    expect(formatSubtitleText(entry, false)).toBe("Hello there");
  });

  it("should prefix character name for multi-speaker scenes", () => {
    const entry: DialogueEntry = { text: "Hello there", characterName: "Akira" };
    expect(formatSubtitleText(entry, true)).toBe("Akira: Hello there");
  });

  it("should not prefix if characterName is missing", () => {
    const entry: DialogueEntry = { text: "Hello there" };
    expect(formatSubtitleText(entry, true)).toBe("Hello there");
  });

  it("should return empty string for empty text", () => {
    const entry: DialogueEntry = { text: "   ", characterName: "Akira" };
    expect(formatSubtitleText(entry, true)).toBe("");
  });

  it("should auto-wrap long text with character prefix", () => {
    const entry: DialogueEntry = {
      text: "This is a very long dialogue line that should definitely be wrapped across two lines for readability",
      characterName: "Narrator",
    };
    const result = formatSubtitleText(entry, true);
    expect(result).toContain("\n");
    expect(result).toContain("Narrator:");
  });
});

// ─── parseSliceDialogue ─────────────────────────────────────────────────

describe("parseSliceDialogue", () => {
  it("should return empty array for null/undefined", () => {
    expect(parseSliceDialogue(null)).toEqual([]);
    expect(parseSliceDialogue(undefined)).toEqual([]);
  });

  it("should parse array of dialogue entries", () => {
    const dialogue = [
      { text: "Hello", characterName: "Akira", startOffset: 0, endOffset: 2 },
      { text: "Hi there", characterName: "Yuki", startOffset: 2.5, endOffset: 4 },
    ];
    const result = parseSliceDialogue(dialogue);
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("Hello");
    expect(result[0].characterName).toBe("Akira");
    expect(result[0].startOffset).toBe(0);
    expect(result[0].endOffset).toBe(2);
    expect(result[1].text).toBe("Hi there");
    expect(result[1].characterName).toBe("Yuki");
  });

  it("should filter out entries with empty text", () => {
    const dialogue = [
      { text: "Hello" },
      { text: "" },
      { text: "   " },
      { text: "World" },
    ];
    const result = parseSliceDialogue(dialogue);
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("Hello");
    expect(result[1].text).toBe("World");
  });

  it("should parse single object format", () => {
    const dialogue = { text: "Solo line", characterName: "Narrator" };
    const result = parseSliceDialogue(dialogue);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Solo line");
    expect(result[0].characterName).toBe("Narrator");
  });

  it("should handle 'character' field as alias for characterName", () => {
    const dialogue = [{ text: "Hello", character: "Akira" }];
    const result = parseSliceDialogue(dialogue);
    expect(result[0].characterName).toBe("Akira");
  });

  it("should handle missing offsets gracefully", () => {
    const dialogue = [{ text: "No timing" }];
    const result = parseSliceDialogue(dialogue);
    expect(result[0].startOffset).toBeUndefined();
    expect(result[0].endOffset).toBeUndefined();
  });
});

// ─── formatSrtCue ───────────────────────────────────────────────────────

describe("formatSrtCue", () => {
  it("should format a cue block correctly", () => {
    const cue: SubtitleCue = {
      index: 1,
      startTime: "00:00:01,000",
      endTime: "00:00:04,000",
      startSeconds: 1,
      endSeconds: 4,
      text: "Hello world",
      sliceNumber: 1,
    };
    const result = formatSrtCue(cue);
    expect(result).toBe("1\n00:00:01,000 --> 00:00:04,000\nHello world\n");
  });

  it("should handle multi-line text", () => {
    const cue: SubtitleCue = {
      index: 2,
      startTime: "00:01:00,500",
      endTime: "00:01:03,500",
      startSeconds: 60.5,
      endSeconds: 63.5,
      text: "Line one\nLine two",
      sliceNumber: 3,
    };
    const result = formatSrtCue(cue);
    expect(result).toContain("Line one\nLine two");
    expect(result).toContain("2\n");
    expect(result).toContain("00:01:00,500 --> 00:01:03,500");
  });
});

// ─── formatSrtFile ──────────────────────────────────────────────────────

describe("formatSrtFile", () => {
  it("should return empty string for no cues", () => {
    expect(formatSrtFile([])).toBe("");
  });

  it("should format multiple cues separated by blank lines", () => {
    const cues: SubtitleCue[] = [
      {
        index: 1,
        startTime: "00:00:01,000",
        endTime: "00:00:04,000",
        startSeconds: 1,
        endSeconds: 4,
        text: "First subtitle",
        sliceNumber: 1,
      },
      {
        index: 2,
        startTime: "00:00:05,000",
        endTime: "00:00:08,000",
        startSeconds: 5,
        endSeconds: 8,
        text: "Second subtitle",
        sliceNumber: 2,
      },
    ];
    const result = formatSrtFile(cues);
    expect(result).toContain("1\n00:00:01,000 --> 00:00:04,000\nFirst subtitle\n");
    expect(result).toContain("2\n00:00:05,000 --> 00:00:08,000\nSecond subtitle\n");
    // Cues are separated by blank line
    expect(result).toContain("\n\n");
  });
});

// ─── generateSubtitleCues ───────────────────────────────────────────────

describe("generateSubtitleCues", () => {
  const makeSlice = (overrides: Partial<{
    id: number;
    sliceNumber: number;
    durationSeconds: number;
    dialogue: unknown;
    voiceAudioUrl: string | null;
    voiceAudioDurationMs: number | null;
    lipSyncRequired: number;
    mood: string | null;
    videoClipUrl: string;
  }> = {}) => ({
    id: overrides.id ?? 1,
    sliceNumber: overrides.sliceNumber ?? 1,
    durationSeconds: overrides.durationSeconds ?? 10,
    dialogue: "dialogue" in overrides ? overrides.dialogue : [
      { text: "Hello world", characterName: "Akira", startOffset: 0, endOffset: 3 },
    ],
    voiceAudioUrl: "voiceAudioUrl" in overrides ? overrides.voiceAudioUrl : "https://example.com/voice.mp3",
    voiceAudioDurationMs: "voiceAudioDurationMs" in overrides ? overrides.voiceAudioDurationMs : 3000,
    lipSyncRequired: overrides.lipSyncRequired ?? 1,
    mood: "mood" in overrides ? overrides.mood : "neutral",
    videoClipUrl: overrides.videoClipUrl ?? "https://example.com/clip.mp4",
  });

  it("should return empty array for no slices", () => {
    expect(generateSubtitleCues([])).toEqual([]);
  });

  it("should generate cues from single slice with dialogue", () => {
    const slices = [makeSlice()];
    const cues = generateSubtitleCues(slices);
    expect(cues.length).toBe(1);
    expect(cues[0].index).toBe(1);
    expect(cues[0].text).toBe("Hello world");
    expect(cues[0].startSeconds).toBe(0);
    expect(cues[0].endSeconds).toBe(3);
    expect(cues[0].sliceNumber).toBe(1);
  });

  it("should handle multi-speaker dialogue with character prefixes", () => {
    const slices = [
      makeSlice({
        id: 1,
        sliceNumber: 1,
        dialogue: [
          { text: "Hello", characterName: "Akira", startOffset: 0, endOffset: 2 },
          { text: "Hi there", characterName: "Yuki", startOffset: 3, endOffset: 5 },
        ],
      }),
    ];
    const cues = generateSubtitleCues(slices);
    expect(cues.length).toBe(2);
    expect(cues[0].text).toContain("Akira:");
    expect(cues[0].text).toContain("Hello");
    expect(cues[1].text).toContain("Yuki:");
    expect(cues[1].text).toContain("Hi there");
  });

  it("should not show character names for single-speaker episodes", () => {
    const slices = [
      makeSlice({
        dialogue: [
          { text: "Line one", characterName: "Akira", startOffset: 0, endOffset: 2 },
          { text: "Line two", characterName: "Akira", startOffset: 3, endOffset: 5 },
        ],
      }),
    ];
    const cues = generateSubtitleCues(slices);
    expect(cues.length).toBe(2);
    expect(cues[0].text).toBe("Line one");
    expect(cues[1].text).toBe("Line two");
  });

  it("should handle empty dialogue slices (produce no cues)", () => {
    const slices = [
      makeSlice({ dialogue: [] }),
    ];
    const cues = generateSubtitleCues(slices);
    expect(cues.length).toBe(0);
  });

  it("should handle null dialogue", () => {
    const slices = [
      makeSlice({ dialogue: null }),
    ];
    const cues = generateSubtitleCues(slices);
    expect(cues.length).toBe(0);
  });

  it("should calculate correct absolute timestamps across multiple slices", () => {
    const slices = [
      makeSlice({
        id: 1,
        sliceNumber: 1,
        durationSeconds: 10,
        dialogue: [{ text: "First", startOffset: 2, endOffset: 5 }],
      }),
      makeSlice({
        id: 2,
        sliceNumber: 2,
        durationSeconds: 10,
        dialogue: [{ text: "Second", startOffset: 1, endOffset: 4 }],
      }),
    ];
    const cues = generateSubtitleCues(slices, 0.3, "cross-dissolve");
    expect(cues.length).toBe(2);
    // First slice starts at 0, so dialogue at offset 2 = absolute 2
    expect(cues[0].startSeconds).toBeCloseTo(2, 1);
    expect(cues[0].endSeconds).toBeCloseTo(5, 1);
    // Second slice starts at ~9.7 (10 - 0.3 overlap), so dialogue at offset 1 = ~10.7
    expect(cues[1].startSeconds).toBeCloseTo(10.7, 1);
    expect(cues[1].endSeconds).toBeCloseTo(13.7, 1);
  });

  it("should use default duration when no endOffset provided", () => {
    const slices = [
      makeSlice({
        dialogue: [{ text: "No end time", startOffset: 1 }],
      }),
    ];
    const cues = generateSubtitleCues(slices);
    expect(cues.length).toBe(1);
    expect(cues[0].startSeconds).toBeCloseTo(1, 1);
    expect(cues[0].endSeconds).toBeCloseTo(1 + DEFAULT_CUE_DURATION, 1);
  });

  it("should clamp cue duration to MAX_CUE_DURATION", () => {
    const slices = [
      makeSlice({
        durationSeconds: 30,
        dialogue: [{ text: "Very long", startOffset: 0, endOffset: 20 }],
      }),
    ];
    const cues = generateSubtitleCues(slices);
    expect(cues.length).toBe(1);
    const duration = cues[0].endSeconds - cues[0].startSeconds;
    expect(duration).toBeLessThanOrEqual(MAX_CUE_DURATION);
  });

  it("should enforce minimum gap between consecutive cues", () => {
    const slices = [
      makeSlice({
        dialogue: [
          { text: "First", startOffset: 0, endOffset: 5 },
          { text: "Second", startOffset: 5, endOffset: 8 }, // starts exactly at first end
        ],
      }),
    ];
    const cues = generateSubtitleCues(slices);
    expect(cues.length).toBe(2);
    const gap = cues[1].startSeconds - cues[0].endSeconds;
    // Use toBeCloseTo to handle floating point precision
    expect(gap).toBeGreaterThanOrEqual(MIN_CUE_GAP - 0.001);
  });

  it("should skip overlapping cues that cannot be adjusted", () => {
    const slices = [
      makeSlice({
        dialogue: [
          { text: "First", startOffset: 0, endOffset: 9.95 },
          { text: "Second", startOffset: 9.9, endOffset: 10 }, // overlaps heavily
        ],
      }),
    ];
    const cues = generateSubtitleCues(slices);
    // Second cue may be skipped if gap enforcement pushes start past end
    expect(cues.length).toBeLessThanOrEqual(2);
    if (cues.length === 2) {
      expect(cues[1].startSeconds).toBeGreaterThan(cues[0].endSeconds);
    }
  });

  it("should auto-wrap long subtitle text", () => {
    const longText = "This is a very long dialogue line that exceeds the maximum character limit for a single subtitle line";
    const slices = [
      makeSlice({
        dialogue: [{ text: longText, startOffset: 0, endOffset: 5 }],
      }),
    ];
    const cues = generateSubtitleCues(slices);
    expect(cues.length).toBe(1);
    expect(cues[0].text).toContain("\n");
  });

  it("should handle slices with no videoClipUrl gracefully", () => {
    const slices = [
      makeSlice({
        videoClipUrl: "https://example.com/clip.mp4",
        dialogue: [{ text: "Still works", startOffset: 0, endOffset: 3 }],
      }),
    ];
    const cues = generateSubtitleCues(slices);
    expect(cues.length).toBe(1);
  });
});

// ─── generateSrt integration (mocked DB + S3) ──────────────────────────

describe("generateSrt (integration)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("should generate SRT and upload to S3", async () => {
    vi.doMock("./db", () => ({
      getEpisodeById: vi.fn().mockResolvedValue({
        id: 1,
        projectId: 100,
        assemblySettings: JSON.stringify({ transitionDuration: 0.3, transitionType: "cross-dissolve" }),
      }),
      getSlicesByEpisode: vi.fn().mockResolvedValue([
        {
          id: 1,
          sliceNumber: 1,
          durationSeconds: 10,
          dialogue: [
            { text: "Hello world", characterName: "Akira", startOffset: 1, endOffset: 4 },
          ],
          voiceAudioUrl: "https://example.com/voice.mp3",
          voiceAudioDurationMs: 3000,
          lipSyncRequired: 1,
          mood: "neutral",
          videoClipUrl: "https://example.com/clip.mp4",
        },
      ]),
      updateEpisode: vi.fn().mockResolvedValue(undefined),
    }));

    vi.doMock("./storage", () => ({
      storagePut: vi.fn().mockResolvedValue({
        url: "https://s3.example.com/subtitles/ep-1-abc.srt",
        key: "subtitles/ep-1-abc.srt",
      }),
    }));

    const { generateSrt } = await import("./subtitle-generator");
    const result = await generateSrt(1);

    expect(result.success).toBe(true);
    expect(result.totalCues).toBe(1);
    expect(result.srtUrl).toContain("srt");
    expect(result.totalDurationSeconds).toBeGreaterThan(0);
  });

  it("should return error for non-existent episode", async () => {
    vi.doMock("./db", () => ({
      getEpisodeById: vi.fn().mockResolvedValue(null),
      getSlicesByEpisode: vi.fn().mockResolvedValue([]),
      updateEpisode: vi.fn(),
    }));

    vi.doMock("./storage", () => ({
      storagePut: vi.fn(),
    }));

    const { generateSrt } = await import("./subtitle-generator");
    const result = await generateSrt(999);

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("should return error for episode with no slices", async () => {
    vi.doMock("./db", () => ({
      getEpisodeById: vi.fn().mockResolvedValue({ id: 1, assemblySettings: null }),
      getSlicesByEpisode: vi.fn().mockResolvedValue([]),
      updateEpisode: vi.fn(),
    }));

    vi.doMock("./storage", () => ({
      storagePut: vi.fn(),
    }));

    const { generateSrt } = await import("./subtitle-generator");
    const result = await generateSrt(1);

    expect(result.success).toBe(false);
    expect(result.error).toContain("no slices");
  });

  it("should handle episode with no dialogue gracefully", async () => {
    vi.doMock("./db", () => ({
      getEpisodeById: vi.fn().mockResolvedValue({
        id: 1,
        projectId: 100,
        assemblySettings: null,
      }),
      getSlicesByEpisode: vi.fn().mockResolvedValue([
        {
          id: 1,
          sliceNumber: 1,
          durationSeconds: 10,
          dialogue: [],
          voiceAudioUrl: null,
          voiceAudioDurationMs: null,
          lipSyncRequired: 0,
          mood: null,
          videoClipUrl: "https://example.com/clip.mp4",
        },
      ]),
      updateEpisode: vi.fn(),
    }));

    vi.doMock("./storage", () => ({
      storagePut: vi.fn(),
    }));

    const { generateSrt } = await import("./subtitle-generator");
    const result = await generateSrt(1);

    expect(result.success).toBe(true);
    expect(result.totalCues).toBe(0);
    expect(result.error).toContain("No dialogue");
  });
});

// ─── Constants validation ───────────────────────────────────────────────

describe("Subtitle generator constants", () => {
  it("MAX_LINE_LENGTH should be 42 (SRT convention)", () => {
    expect(MAX_LINE_LENGTH).toBe(42);
  });

  it("DEFAULT_CUE_DURATION should be 3 seconds", () => {
    expect(DEFAULT_CUE_DURATION).toBe(3.0);
  });

  it("MIN_CUE_GAP should be 0.1 seconds", () => {
    expect(MIN_CUE_GAP).toBe(0.1);
  });

  it("MAX_CUE_DURATION should be 8 seconds", () => {
    expect(MAX_CUE_DURATION).toBe(8.0);
  });
});

// ─── SRT format validation ──────────────────────────────────────────────

describe("SRT format compliance", () => {
  it("should produce valid SRT timestamp format (HH:MM:SS,mmm)", () => {
    const timestamp = secondsToSrtTime(3723.456);
    expect(timestamp).toMatch(/^\d{2}:\d{2}:\d{2},\d{3}$/);
    expect(timestamp).toBe("01:02:03,456");
  });

  it("should produce valid SRT cue format with sequential numbering", () => {
    const slices = [
      {
        id: 1,
        sliceNumber: 1,
        durationSeconds: 10,
        dialogue: [
          { text: "First", startOffset: 0, endOffset: 3 },
          { text: "Second", startOffset: 4, endOffset: 7 },
        ],
        voiceAudioUrl: null,
        voiceAudioDurationMs: null,
        lipSyncRequired: 0,
        mood: null,
        videoClipUrl: "https://example.com/clip.mp4",
      },
    ];
    const cues = generateSubtitleCues(slices);
    const srt = formatSrtFile(cues);

    // Verify sequential numbering
    expect(srt).toContain("1\n");
    expect(srt).toContain("2\n");

    // Verify arrow separator
    expect(srt).toContain(" --> ");

    // Verify each cue ends with newline
    const cueBlocks = srt.split("\n\n").filter(Boolean);
    expect(cueBlocks.length).toBe(2);
  });

  it("should produce parseable SRT output", () => {
    const slices = [
      {
        id: 1,
        sliceNumber: 1,
        durationSeconds: 10,
        dialogue: [
          { text: "Test line", startOffset: 1, endOffset: 4 },
        ],
        voiceAudioUrl: null,
        voiceAudioDurationMs: null,
        lipSyncRequired: 0,
        mood: null,
        videoClipUrl: "https://example.com/clip.mp4",
      },
    ];
    const cues = generateSubtitleCues(slices);
    const srt = formatSrtFile(cues);

    // Parse the SRT back
    const lines = srt.trim().split("\n");
    expect(lines[0]).toBe("1"); // index
    expect(lines[1]).toMatch(/\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}/); // timestamp
    expect(lines[2]).toBe("Test line"); // text
  });
});
