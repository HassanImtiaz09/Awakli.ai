/**
 * Tests for the slice-aware video assembler module (Milestone 5).
 *
 * Covers:
 *   - validateSlicesForAssembly (input validation)
 *   - buildSliceTimeline (timeline calculation with transition overlaps)
 *   - parseAssemblySettings (config parsing with defaults)
 *   - getMediaDuration (ffprobe wrapper)
 *   - Assembly credit action constant
 *   - FFmpeg integration: normalize, concat, xfade
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

import {
  validateSlicesForAssembly,
  buildSliceTimeline,
  parseAssemblySettings,
  getMediaDuration,
  DEFAULT_ASSEMBLY_CONFIG,
  ASSEMBLY_CREDIT_ACTION,
  type SliceForAssembly,
  type AssemblyConfig,
} from "./video-assembler";

const execFileAsync = promisify(execFile);

// ─── Test Data Factories ──────────────────────────────────────────────

function makeSlice(overrides: Partial<{
  id: number;
  sliceNumber: number;
  durationSeconds: number;
  videoClipUrl: string | null;
  videoClipStatus: string;
  coreSceneStatus: string;
  voiceAudioUrl: string | null;
  dialogue: unknown;
  lipSyncRequired: number;
  mood: string | null;
  voiceAudioDurationMs: number | null;
}> = {}): {
  id: number;
  sliceNumber: number;
  durationSeconds: number;
  videoClipUrl: string | null;
  videoClipStatus: string;
  coreSceneStatus: string;
  voiceAudioUrl: string | null;
  dialogue: unknown;
  lipSyncRequired: number;
  mood: string | null;
  voiceAudioDurationMs: number | null;
} {
  return {
    id: overrides.id ?? 1,
    sliceNumber: overrides.sliceNumber ?? 1,
    durationSeconds: overrides.durationSeconds ?? 10,
    videoClipUrl: "videoClipUrl" in overrides ? overrides.videoClipUrl! : "https://example.com/clip.mp4",
    videoClipStatus: overrides.videoClipStatus ?? "generated",
    coreSceneStatus: overrides.coreSceneStatus ?? "approved",
    voiceAudioUrl: "voiceAudioUrl" in overrides ? overrides.voiceAudioUrl! : null,
    dialogue: "dialogue" in overrides ? overrides.dialogue! : null,
    lipSyncRequired: overrides.lipSyncRequired ?? 0,
    mood: "mood" in overrides ? overrides.mood! : "neutral",
    voiceAudioDurationMs: "voiceAudioDurationMs" in overrides ? overrides.voiceAudioDurationMs! : null,
  };
}

function makeSliceForAssembly(overrides: Partial<SliceForAssembly> = {}): SliceForAssembly {
  return {
    id: overrides.id ?? 1,
    sliceNumber: overrides.sliceNumber ?? 1,
    durationSeconds: overrides.durationSeconds ?? 10,
    videoClipUrl: overrides.videoClipUrl ?? "https://example.com/clip.mp4",
    voiceAudioUrl: overrides.voiceAudioUrl ?? null,
    voiceAudioDurationMs: overrides.voiceAudioDurationMs ?? null,
    dialogue: overrides.dialogue ?? null,
    lipSyncRequired: overrides.lipSyncRequired ?? 0,
    mood: overrides.mood ?? "neutral",
  };
}

// ─── validateSlicesForAssembly ────────────────────────────────────────

describe("validateSlicesForAssembly", () => {
  it("returns valid for a complete set of generated slices", () => {
    const slices = [
      makeSlice({ id: 1, sliceNumber: 1 }),
      makeSlice({ id: 2, sliceNumber: 2 }),
      makeSlice({ id: 3, sliceNumber: 3 }),
    ];

    const result = validateSlicesForAssembly(slices);
    expect(result.valid).toBe(true);
    expect(result.readySlices).toHaveLength(3);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects empty slice array", () => {
    const result = validateSlicesForAssembly([]);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("No slices found for episode");
  });

  it("rejects slices without video clip URL", () => {
    const slices = [
      makeSlice({ id: 1, sliceNumber: 1, videoClipUrl: null }),
    ];

    const result = validateSlicesForAssembly(slices);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("missing video clip URL");
  });

  it("rejects slices with non-ready video status", () => {
    const slices = [
      makeSlice({ id: 1, sliceNumber: 1, videoClipStatus: "pending" }),
    ];

    const result = validateSlicesForAssembly(slices);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("video clip not ready");
  });

  it("accepts slices with approved video status", () => {
    const slices = [
      makeSlice({ id: 1, sliceNumber: 1, videoClipStatus: "approved" }),
    ];

    const result = validateSlicesForAssembly(slices);
    expect(result.valid).toBe(true);
    expect(result.readySlices).toHaveLength(1);
  });

  it("detects gaps in slice sequence numbers", () => {
    const slices = [
      makeSlice({ id: 1, sliceNumber: 1 }),
      makeSlice({ id: 3, sliceNumber: 3 }), // gap: missing slice 2
    ];

    const result = validateSlicesForAssembly(slices);
    // Both slices are individually valid, but there's a gap
    expect(result.errors.some(e => e.includes("Gap in slice sequence"))).toBe(true);
  });

  it("sorts slices by sliceNumber", () => {
    const slices = [
      makeSlice({ id: 3, sliceNumber: 3 }),
      makeSlice({ id: 1, sliceNumber: 1 }),
      makeSlice({ id: 2, sliceNumber: 2 }),
    ];

    const result = validateSlicesForAssembly(slices);
    expect(result.valid).toBe(true);
    expect(result.readySlices.map(s => s.sliceNumber)).toEqual([1, 2, 3]);
  });

  it("skips invalid slices but reports errors", () => {
    const slices = [
      makeSlice({ id: 1, sliceNumber: 1 }),
      makeSlice({ id: 2, sliceNumber: 2, videoClipUrl: null }), // invalid
      makeSlice({ id: 3, sliceNumber: 3 }),
    ];

    const result = validateSlicesForAssembly(slices);
    expect(result.valid).toBe(false);
    expect(result.readySlices).toHaveLength(2); // 1 and 3 are valid
    expect(result.errors).toHaveLength(2); // missing URL + gap
  });

  it("preserves voice audio URL in ready slices", () => {
    const slices = [
      makeSlice({
        id: 1, sliceNumber: 1,
        voiceAudioUrl: "https://example.com/voice.mp3",
        voiceAudioDurationMs: 5000,
      }),
    ];

    const result = validateSlicesForAssembly(slices);
    expect(result.readySlices[0].voiceAudioUrl).toBe("https://example.com/voice.mp3");
    expect(result.readySlices[0].voiceAudioDurationMs).toBe(5000);
  });
});

// ─── buildSliceTimeline ──────────────────────────────────────────────

describe("buildSliceTimeline", () => {
  it("calculates correct timeline for cut transitions (no overlap)", () => {
    const slices: SliceForAssembly[] = [
      makeSliceForAssembly({ id: 1, sliceNumber: 1, durationSeconds: 10 }),
      makeSliceForAssembly({ id: 2, sliceNumber: 2, durationSeconds: 10 }),
      makeSliceForAssembly({ id: 3, sliceNumber: 3, durationSeconds: 10 }),
    ];

    const timeline = buildSliceTimeline(slices, 0.3, "cut");

    expect(timeline.slices).toHaveLength(3);
    expect(timeline.slices[0].startTimeSeconds).toBe(0);
    expect(timeline.slices[0].endTimeSeconds).toBe(10);
    expect(timeline.slices[1].startTimeSeconds).toBe(10);
    expect(timeline.slices[1].endTimeSeconds).toBe(20);
    expect(timeline.slices[2].startTimeSeconds).toBe(20);
    expect(timeline.slices[2].endTimeSeconds).toBe(30);
    expect(timeline.totalDurationSeconds).toBe(30);
    expect(timeline.transitionOverlapTotal).toBe(0);
  });

  it("calculates correct timeline with cross-dissolve transitions", () => {
    const slices: SliceForAssembly[] = [
      makeSliceForAssembly({ id: 1, sliceNumber: 1, durationSeconds: 10 }),
      makeSliceForAssembly({ id: 2, sliceNumber: 2, durationSeconds: 10 }),
      makeSliceForAssembly({ id: 3, sliceNumber: 3, durationSeconds: 10 }),
    ];

    const timeline = buildSliceTimeline(slices, 0.3, "cross-dissolve");

    expect(timeline.slices).toHaveLength(3);
    expect(timeline.slices[0].startTimeSeconds).toBe(0);
    expect(timeline.slices[1].startTimeSeconds).toBeCloseTo(9.7, 1);
    expect(timeline.slices[2].startTimeSeconds).toBeCloseTo(19.4, 1);
    // Total = 30 - 2*0.3 = 29.4
    expect(timeline.totalDurationSeconds).toBeCloseTo(29.4, 1);
    expect(timeline.transitionOverlapTotal).toBeCloseTo(0.6, 1);
  });

  it("handles single slice", () => {
    const slices: SliceForAssembly[] = [
      makeSliceForAssembly({ id: 1, sliceNumber: 1, durationSeconds: 10 }),
    ];

    const timeline = buildSliceTimeline(slices, 0.3, "cross-dissolve");

    expect(timeline.slices).toHaveLength(1);
    expect(timeline.totalDurationSeconds).toBe(10);
    expect(timeline.transitionOverlapTotal).toBe(0);
  });

  it("clamps transition overlap to not exceed clip duration", () => {
    const slices: SliceForAssembly[] = [
      makeSliceForAssembly({ id: 1, sliceNumber: 1, durationSeconds: 0.5 }),
      makeSliceForAssembly({ id: 2, sliceNumber: 2, durationSeconds: 0.5 }),
    ];

    const timeline = buildSliceTimeline(slices, 2.0, "dissolve");

    // Overlap should be clamped to 0.5 - 0.1 = 0.4
    expect(timeline.transitionOverlapTotal).toBeLessThanOrEqual(0.4);
    expect(timeline.totalDurationSeconds).toBeGreaterThan(0);
  });

  it("sorts slices by sliceNumber regardless of input order", () => {
    const slices: SliceForAssembly[] = [
      makeSliceForAssembly({ id: 3, sliceNumber: 3, durationSeconds: 10 }),
      makeSliceForAssembly({ id: 1, sliceNumber: 1, durationSeconds: 10 }),
      makeSliceForAssembly({ id: 2, sliceNumber: 2, durationSeconds: 10 }),
    ];

    const timeline = buildSliceTimeline(slices, 0.3, "cut");

    expect(timeline.slices[0].sliceNumber).toBe(1);
    expect(timeline.slices[1].sliceNumber).toBe(2);
    expect(timeline.slices[2].sliceNumber).toBe(3);
  });

  it("tracks hasVoice correctly per slice", () => {
    const slices: SliceForAssembly[] = [
      makeSliceForAssembly({ id: 1, sliceNumber: 1, voiceAudioUrl: "https://example.com/voice.mp3" }),
      makeSliceForAssembly({ id: 2, sliceNumber: 2, voiceAudioUrl: null }),
    ];

    const timeline = buildSliceTimeline(slices, 0, "cut");

    expect(timeline.slices[0].hasVoice).toBe(true);
    expect(timeline.slices[1].hasVoice).toBe(false);
  });

  it("handles many slices (30-slice episode)", () => {
    const slices: SliceForAssembly[] = Array.from({ length: 30 }, (_, i) =>
      makeSliceForAssembly({ id: i + 1, sliceNumber: i + 1, durationSeconds: 10 }),
    );

    const timeline = buildSliceTimeline(slices, 0.3, "cross-dissolve");

    expect(timeline.slices).toHaveLength(30);
    // Total = 30*10 - 29*0.3 = 300 - 8.7 = 291.3
    expect(timeline.totalDurationSeconds).toBeCloseTo(291.3, 1);
    expect(timeline.transitionOverlapTotal).toBeCloseTo(8.7, 1);
  });
});

// ─── parseAssemblySettings ───────────────────────────────────────────

describe("parseAssemblySettings", () => {
  it("returns defaults when settings is null", () => {
    const config = parseAssemblySettings(null);
    expect(config).toEqual(DEFAULT_ASSEMBLY_CONFIG);
  });

  it("returns defaults when settings is undefined", () => {
    const config = parseAssemblySettings(undefined);
    expect(config).toEqual(DEFAULT_ASSEMBLY_CONFIG);
  });

  it("returns defaults when settings is empty object", () => {
    const config = parseAssemblySettings({});
    expect(config).toEqual(DEFAULT_ASSEMBLY_CONFIG);
  });

  it("merges partial settings with defaults", () => {
    const config = parseAssemblySettings({
      voiceLufs: -12,
      musicVolume: 0.2,
    });

    expect(config.voiceLufs).toBe(-12);
    expect(config.musicVolume).toBe(0.2);
    // Defaults preserved
    expect(config.transitionType).toBe("cross-dissolve");
    expect(config.fps).toBe(24);
  });

  it("applies overrides on top of settings", () => {
    const config = parseAssemblySettings(
      { voiceLufs: -12 },
      { voiceLufs: -10, musicUrl: "https://example.com/bgm.mp3" },
    );

    expect(config.voiceLufs).toBe(-10); // override wins
    expect(config.musicUrl).toBe("https://example.com/bgm.mp3");
  });

  it("ignores non-numeric values for numeric fields", () => {
    const config = parseAssemblySettings({
      voiceLufs: "not a number",
      musicVolume: true,
    });

    expect(config.voiceLufs).toBe(DEFAULT_ASSEMBLY_CONFIG.voiceLufs);
    expect(config.musicVolume).toBe(DEFAULT_ASSEMBLY_CONFIG.musicVolume);
  });

  it("parses all supported settings fields", () => {
    const fullSettings = {
      transitionType: "fade",
      transitionDuration: 0.5,
      voiceLufs: -12,
      musicLufs: -20,
      musicVolume: 0.25,
      enableSidechainDucking: false,
      skipVoiceValidation: true,
      voiceValidationThreshold: -25,
      musicUrl: "https://example.com/bgm.mp3",
    };

    const config = parseAssemblySettings(fullSettings);

    expect(config.transitionType).toBe("fade");
    expect(config.transitionDuration).toBe(0.5);
    expect(config.voiceLufs).toBe(-12);
    expect(config.musicLufs).toBe(-20);
    expect(config.musicVolume).toBe(0.25);
    expect(config.enableSidechainDucking).toBe(false);
    expect(config.skipVoiceValidation).toBe(true);
    expect(config.voiceValidationThreshold).toBe(-25);
    expect(config.musicUrl).toBe("https://example.com/bgm.mp3");
  });
});

// ─── DEFAULT_ASSEMBLY_CONFIG ─────────────────────────────────────────

describe("DEFAULT_ASSEMBLY_CONFIG", () => {
  it("has sensible defaults", () => {
    expect(DEFAULT_ASSEMBLY_CONFIG.transitionType).toBe("cross-dissolve");
    expect(DEFAULT_ASSEMBLY_CONFIG.transitionDuration).toBe(0.3);
    expect(DEFAULT_ASSEMBLY_CONFIG.voiceLufs).toBe(-14);
    expect(DEFAULT_ASSEMBLY_CONFIG.musicLufs).toBe(-18);
    expect(DEFAULT_ASSEMBLY_CONFIG.masterLufs).toBe(-16);
    expect(DEFAULT_ASSEMBLY_CONFIG.voiceValidationThreshold).toBe(-30);
    expect(DEFAULT_ASSEMBLY_CONFIG.skipVoiceValidation).toBe(false);
    expect(DEFAULT_ASSEMBLY_CONFIG.musicVolume).toBe(0.15);
    expect(DEFAULT_ASSEMBLY_CONFIG.enableSidechainDucking).toBe(true);
    expect(DEFAULT_ASSEMBLY_CONFIG.resolution).toBe("1920x1080");
    expect(DEFAULT_ASSEMBLY_CONFIG.fps).toBe(24);
  });
});

// ─── ASSEMBLY_CREDIT_ACTION ──────────────────────────────────────────

describe("ASSEMBLY_CREDIT_ACTION", () => {
  it("maps to a valid GenerationAction", () => {
    // Assembly uses video_10s_budget (2 credits) as a compute-only cost
    expect(ASSEMBLY_CREDIT_ACTION).toBe("video_10s_budget");
  });
});

// ─── FFmpeg Integration Tests ────────────────────────────────────────

describe("FFmpeg Integration", () => {
  const tmpDir = path.join(os.tmpdir(), "awakli-assembler-test");

  beforeAll(async () => {
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it("ffmpeg is available", async () => {
    const { stdout } = await execFileAsync("ffmpeg", ["-version"]);
    expect(stdout).toContain("ffmpeg version");
  });

  it("ffprobe is available", async () => {
    const { stdout } = await execFileAsync("ffprobe", ["-version"]);
    expect(stdout).toContain("ffprobe version");
  });

  it("generates a test clip and measures duration with getMediaDuration", async () => {
    const clipPath = path.join(tmpDir, "test-dur.mp4");

    await execFileAsync("ffmpeg", [
      "-y",
      "-f", "lavfi", "-i", "color=c=blue:s=640x360:d=5",
      "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-shortest",
      "-c:v", "libx264", "-preset", "ultrafast",
      "-c:a", "aac",
      "-pix_fmt", "yuv420p",
      clipPath,
    ], { timeout: 30000 });

    const duration = await getMediaDuration(clipPath);
    expect(duration).toBeGreaterThan(4);
    expect(duration).toBeLessThan(6);
  });

  it("getMediaDuration returns 0 for non-existent file", async () => {
    const duration = await getMediaDuration("/tmp/does-not-exist.mp4");
    expect(duration).toBe(0);
  });

  it("normalizes a clip to 1920x1080 with audio track", async () => {
    // Generate a small 320x240 clip without audio
    const inputPath = path.join(tmpDir, "small-no-audio.mp4");
    await execFileAsync("ffmpeg", [
      "-y",
      "-f", "lavfi", "-i", "color=c=green:s=320x240:d=2",
      "-c:v", "libx264", "-preset", "ultrafast",
      "-pix_fmt", "yuv420p",
      inputPath,
    ], { timeout: 30000 });

    const outputPath = path.join(tmpDir, "normalized.mp4");

    // Test the normalize function via a direct ffmpeg call matching our normalizeClip logic
    await execFileAsync("ffmpeg", [
      "-y",
      "-i", inputPath,
      "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black",
      "-r", "24",
      "-c:v", "libx264", "-preset", "fast", "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k",
      "-shortest",
      "-map", "0:v:0", "-map", "1:a:0",
      outputPath,
    ], { timeout: 60000 });

    // Verify output
    const { stdout: videoInfo } = await execFileAsync("ffprobe", [
      "-v", "quiet", "-select_streams", "v:0",
      "-show_entries", "stream=width,height",
      "-of", "csv=p=0",
      outputPath,
    ]);
    const [w, h] = videoInfo.trim().split(",").map(Number);
    expect(w).toBe(1920);
    expect(h).toBe(1080);

    // Verify audio track exists
    const { stdout: audioInfo } = await execFileAsync("ffprobe", [
      "-v", "quiet", "-select_streams", "a",
      "-show_entries", "stream=codec_type",
      "-of", "csv=p=0",
      outputPath,
    ]);
    expect(audioInfo.trim()).toBe("audio");
  });

  it("concatenates two clips with concat demuxer", async () => {
    // Generate two 2-second clips
    const clip1 = path.join(tmpDir, "concat-a.mp4");
    const clip2 = path.join(tmpDir, "concat-b.mp4");

    for (const [p, color] of [[clip1, "red"], [clip2, "blue"]] as const) {
      await execFileAsync("ffmpeg", [
        "-y",
        "-f", "lavfi", "-i", `color=c=${color}:s=640x360:d=2`,
        "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-shortest",
        "-c:v", "libx264", "-preset", "ultrafast",
        "-c:a", "aac",
        "-pix_fmt", "yuv420p",
        p,
      ], { timeout: 30000 });
    }

    // Concat using list file
    const listFile = path.join(tmpDir, "concat-list.txt");
    await fs.writeFile(listFile, `file '${clip1}'\nfile '${clip2}'`);

    const outputPath = path.join(tmpDir, "concat-result.mp4");
    await execFileAsync("ffmpeg", [
      "-y", "-f", "concat", "-safe", "0",
      "-i", listFile,
      "-c:v", "libx264", "-preset", "ultrafast",
      "-c:a", "aac",
      "-pix_fmt", "yuv420p",
      outputPath,
    ], { timeout: 60000 });

    const duration = await getMediaDuration(outputPath);
    expect(duration).toBeGreaterThan(3.5);
    expect(duration).toBeLessThan(5);
  });

  it("applies xfade transition between two clips", async () => {
    const clip1 = path.join(tmpDir, "xfade-a.mp4");
    const clip2 = path.join(tmpDir, "xfade-b.mp4");

    for (const [p, color] of [[clip1, "red"], [clip2, "blue"]] as const) {
      await execFileAsync("ffmpeg", [
        "-y",
        "-f", "lavfi", "-i", `color=c=${color}:s=640x360:d=3`,
        "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-shortest",
        "-c:v", "libx264", "-preset", "ultrafast",
        "-c:a", "aac",
        "-pix_fmt", "yuv420p",
        p,
      ], { timeout: 30000 });
    }

    const outputPath = path.join(tmpDir, "xfade-result.mp4");
    const transitionDur = 0.5;
    const offset = 3 - transitionDur; // 2.5

    await execFileAsync("ffmpeg", [
      "-y",
      "-i", clip1,
      "-i", clip2,
      "-filter_complex",
      `[0:v][1:v]xfade=transition=fade:duration=${transitionDur}:offset=${offset}[xv];` +
      `[0:a][1:a]acrossfade=d=${transitionDur}:c1=tri:c2=tri[xa]`,
      "-map", "[xv]",
      "-map", "[xa]",
      "-c:v", "libx264", "-preset", "ultrafast",
      "-c:a", "aac",
      "-pix_fmt", "yuv420p",
      outputPath,
    ], { timeout: 60000 });

    const duration = await getMediaDuration(outputPath);
    // 3 + 3 - 0.5 = 5.5 seconds
    expect(duration).toBeGreaterThan(5);
    expect(duration).toBeLessThan(6);
  });

  it("builds voice track with safe sequential overlay", async () => {
    // Generate a 6-second silence base
    const silencePath = path.join(tmpDir, "silence-base.wav");
    await execFileAsync("ffmpeg", [
      "-y",
      "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-t", "6",
      "-c:a", "pcm_s16le",
      silencePath,
    ], { timeout: 15000 });

    // Generate a 1-second tone as "voice"
    const voicePath = path.join(tmpDir, "voice-tone.wav");
    await execFileAsync("ffmpeg", [
      "-y",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
      "-c:a", "pcm_s16le",
      "-ar", "44100",
      "-ac", "2",
      voicePath,
    ], { timeout: 15000 });

    // Overlay voice at 2 seconds using safe amix
    const outputPath = path.join(tmpDir, "voice-overlay.wav");
    await execFileAsync("ffmpeg", [
      "-y",
      "-i", silencePath,
      "-i", voicePath,
      "-filter_complex",
      "[1:a]adelay=2000|2000,apad[delayed];" +
      "[0:a][delayed]amix=inputs=2:duration=first:weights=1 1:normalize=0[out]",
      "-map", "[out]",
      "-c:a", "pcm_s16le",
      outputPath,
    ], { timeout: 30000 });

    const duration = await getMediaDuration(outputPath);
    expect(duration).toBeGreaterThan(5);
    expect(duration).toBeLessThan(7);

    const stat = await fs.stat(outputPath);
    expect(stat.size).toBeGreaterThan(1000);
  });

  it("mixes background music with sidechain ducking", async () => {
    // Generate a 4-second video with audio
    const videoPath = path.join(tmpDir, "video-for-music.mp4");
    await execFileAsync("ffmpeg", [
      "-y",
      "-f", "lavfi", "-i", "color=c=purple:s=640x360:d=4",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=4",
      "-c:v", "libx264", "-preset", "ultrafast",
      "-c:a", "aac", "-ar", "44100", "-ac", "2",
      "-pix_fmt", "yuv420p",
      "-shortest",
      videoPath,
    ], { timeout: 30000 });

    // Generate a 4-second music track
    const musicPath = path.join(tmpDir, "bgm-test.mp3");
    await execFileAsync("ffmpeg", [
      "-y",
      "-f", "lavfi", "-i", "sine=frequency=220:duration=4",
      "-c:a", "libmp3lame", "-ar", "44100", "-ac", "2",
      musicPath,
    ], { timeout: 15000 });

    // Mix with sidechain ducking
    const outputPath = path.join(tmpDir, "music-mixed.mp4");
    await execFileAsync("ffmpeg", [
      "-y",
      "-i", videoPath,
      "-i", musicPath,
      "-filter_complex",
      "[1:a]volume=0.15,aloop=loop=-1:size=2e+09,atrim=0:4[bgm_raw];" +
      "[bgm_raw][0:a]sidechaincompress=threshold=0.02:ratio=6:attack=5:release=200[bgm_ducked];" +
      "[0:a][bgm_ducked]amix=inputs=2:duration=first:weights=1 1:normalize=0[out]",
      "-map", "0:v",
      "-map", "[out]",
      "-c:v", "copy",
      "-c:a", "aac", "-b:a", "192k",
      outputPath,
    ], { timeout: 60000 });

    const duration = await getMediaDuration(outputPath);
    expect(duration).toBeGreaterThan(3);
    expect(duration).toBeLessThan(5);
  });

  it("applies loudness normalization", async () => {
    // Generate a video with audio
    const inputPath = path.join(tmpDir, "loud-input.mp4");
    await execFileAsync("ffmpeg", [
      "-y",
      "-f", "lavfi", "-i", "color=c=yellow:s=640x360:d=3",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
      "-c:v", "libx264", "-preset", "ultrafast",
      "-c:a", "aac", "-ar", "44100", "-ac", "2",
      "-pix_fmt", "yuv420p",
      "-shortest",
      inputPath,
    ], { timeout: 30000 });

    const outputPath = path.join(tmpDir, "loudnorm-output.mp4");
    await execFileAsync("ffmpeg", [
      "-y",
      "-i", inputPath,
      "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
      "-c:v", "copy",
      "-c:a", "aac", "-b:a", "192k",
      outputPath,
    ], { timeout: 60000 });

    const stat = await fs.stat(outputPath);
    expect(stat.size).toBeGreaterThan(1000);

    const duration = await getMediaDuration(outputPath);
    expect(duration).toBeGreaterThan(2);
    expect(duration).toBeLessThan(4);
  });
});
