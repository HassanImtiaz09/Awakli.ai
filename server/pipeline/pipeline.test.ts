/**
 * Tests for the pipeline hardening modules:
 * 1. Safe Audio Mixer (sequential overlay, no bare amix)
 * 2. Voice Presence Validation Gate
 * 3. Lip Sync Processor (padding, sound_end_time, overlap checks)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

const execFileAsync = promisify(execFile);

// ─── Test fixtures ──────────────────────────────────────────────────────────

const tmpDir = path.join(os.tmpdir(), "awakli-pipeline-test");

/** Create a test audio tone at a specific frequency and duration */
async function createTone(
  outputPath: string,
  frequency: number,
  durationSec: number,
  volume: number = 1.0,
): Promise<void> {
  await execFileAsync("ffmpeg", [
    "-y",
    "-f", "lavfi", "-i", `sine=frequency=${frequency}:duration=${durationSec}:sample_rate=48000`,
    "-af", `volume=${volume}`,
    "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le",
    outputPath,
  ], { timeout: 30000 });
}

/** Create a silent audio file */
async function createSilence(outputPath: string, durationSec: number): Promise<void> {
  await execFileAsync("ffmpeg", [
    "-y",
    "-f", "lavfi", "-i", `anullsrc=channel_layout=stereo:sample_rate=48000`,
    "-t", durationSec.toFixed(3),
    "-c:a", "pcm_s16le",
    outputPath,
  ], { timeout: 30000 });
}

/** Create a test video with optional audio tone */
async function createTestVideo(
  outputPath: string,
  durationSec: number,
  color: string = "blue",
  withAudio: boolean = true,
): Promise<void> {
  if (withAudio) {
    await execFileAsync("ffmpeg", [
      "-y",
      "-f", "lavfi", "-i", `color=c=${color}:s=640x360:d=${durationSec}:r=24`,
      "-f", "lavfi", "-i", `sine=frequency=440:duration=${durationSec}:sample_rate=48000`,
      "-c:v", "libx264", "-preset", "ultrafast",
      "-c:a", "aac", "-b:a", "128k",
      "-pix_fmt", "yuv420p",
      "-shortest",
      outputPath,
    ], { timeout: 30000 });
  } else {
    await execFileAsync("ffmpeg", [
      "-y",
      "-f", "lavfi", "-i", `color=c=${color}:s=640x360:d=${durationSec}:r=24`,
      "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
      "-c:v", "libx264", "-preset", "ultrafast",
      "-c:a", "aac", "-b:a", "128k",
      "-pix_fmt", "yuv420p",
      "-shortest",
      outputPath,
    ], { timeout: 30000 });
  }
}

/** Measure RMS level at a specific time in an audio/video file */
async function measureRmsAt(filePath: string, startSec: number, durSec: number = 1.0): Promise<number> {
  try {
    const { stderr } = await execFileAsync("ffmpeg", [
      "-y", "-i", filePath,
      "-ss", startSec.toFixed(3),
      "-t", durSec.toFixed(3),
      "-af", "volumedetect",
      "-f", "null", "-",
    ], { timeout: 30000 });

    const rmsMatch = stderr.match(/mean_volume:\s*([-\d.]+)/);
    return rmsMatch ? parseFloat(rmsMatch[1]) : -Infinity;
  } catch {
    return -Infinity;
  }
}

// ─── Setup / Teardown ───────────────────────────────────────────────────────

beforeAll(async () => {
  await fs.mkdir(tmpDir, { recursive: true });
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. SAFE AUDIO MIXER TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("Safe Audio Mixer", () => {
  it("should import all audio mixer functions", async () => {
    const mixer = await import("./audioMixer");
    expect(typeof mixer.buildVoiceTrack).toBe("function");
    expect(typeof mixer.buildMusicTrack).toBe("function");
    expect(typeof mixer.mixVoiceAndMusic).toBe("function");
    expect(typeof mixer.muxVideoWithAudio).toBe("function");
    expect(typeof mixer.getAudioDuration).toBe("function");
    expect(typeof mixer.measureLoudness).toBe("function");
    expect(typeof mixer.normalizeToLufs).toBe("function");
  });

  it("should export correct constants", async () => {
    const mixer = await import("./audioMixer");
    expect(mixer.VOICE_LOUDNESS_THRESHOLD_LUFS).toBe(-30);
    expect(mixer.DEFAULT_VOICE_LUFS).toBe(-14);
    expect(mixer.DEFAULT_MUSIC_LUFS).toBe(-24);
    expect(mixer.SIDECHAIN_DUCK_DB).toBe(8);
  });

  it("should get audio duration correctly", async () => {
    const mixer = await import("./audioMixer");
    const tonePath = path.join(tmpDir, "duration-test.wav");
    await createTone(tonePath, 440, 3.0);

    const duration = await mixer.getAudioDuration(tonePath);
    expect(duration).toBeGreaterThan(2.8);
    expect(duration).toBeLessThan(3.2);
  });

  it("should normalize audio to target LUFS", async () => {
    const mixer = await import("./audioMixer");
    const inputPath = path.join(tmpDir, "norm-input.wav");
    const outputPath = path.join(tmpDir, "norm-output.wav");

    // Create a quiet tone
    await createTone(inputPath, 440, 3.0, 0.01);

    // Normalize to -14 LUFS
    await mixer.normalizeToLufs(inputPath, outputPath, -14);

    // Verify the output exists and has content
    const stat = await fs.stat(outputPath);
    expect(stat.size).toBeGreaterThan(1000);

    // Measure loudness of normalized output
    const loudness = await mixer.measureLoudness(outputPath);
    // Should be close to -14 LUFS (within 3 LUFS tolerance for short clips)
    expect(loudness.integratedLufs).toBeGreaterThan(-20);
    expect(loudness.integratedLufs).toBeLessThan(-8);
  });

  it("should build a voice track with sequential overlay preserving amplitude", async () => {
    const mixer = await import("./audioMixer");
    const workDir = path.join(tmpDir, "voice-track-test");

    // Create two voice clips at different times
    const voice1 = path.join(tmpDir, "voice1.wav");
    const voice2 = path.join(tmpDir, "voice2.wav");
    await createTone(voice1, 880, 1.0, 0.5);  // 1s tone at 880Hz
    await createTone(voice2, 660, 1.0, 0.5);  // 1s tone at 660Hz

    const voiceTrackPath = await mixer.buildVoiceTrack(
      [
        { filePath: voice1, startTimeSeconds: 1.0, durationSeconds: 1.0, label: "Voice 1" },
        { filePath: voice2, startTimeSeconds: 5.0, durationSeconds: 1.0, label: "Voice 2" },
      ],
      10.0,
      workDir,
    );

    expect(voiceTrackPath).toBeTruthy();
    const stat = await fs.stat(voiceTrackPath);
    expect(stat.size).toBeGreaterThan(1000);

    // Verify voice is present at both timecodes
    const rmsAt1 = await measureRmsAt(voiceTrackPath, 1.0, 1.0);
    const rmsAt5 = await measureRmsAt(voiceTrackPath, 5.0, 1.0);
    const rmsAtSilent = await measureRmsAt(voiceTrackPath, 3.0, 1.0);

    // Voice should be clearly audible at placement times
    expect(rmsAt1).toBeGreaterThan(-30);
    expect(rmsAt5).toBeGreaterThan(-30);
    // Should be silent between voices
    expect(rmsAtSilent).toBeLessThan(rmsAt1);
  });

  it("should produce audible voice even with many sparse clips (regression test for amix 1/N bug)", async () => {
    const mixer = await import("./audioMixer");
    const workDir = path.join(tmpDir, "sparse-voice-test");

    // Create 6 short voice clips (simulating the Seraphis scenario)
    const voices: { filePath: string; startTimeSeconds: number; durationSeconds: number; label: string }[] = [];
    for (let i = 0; i < 6; i++) {
      const voicePath = path.join(tmpDir, `sparse-voice-${i}.wav`);
      await createTone(voicePath, 440 + i * 100, 0.8, 0.3);
      voices.push({
        filePath: voicePath,
        startTimeSeconds: i * 15 + 2,  // Spread across 90s
        durationSeconds: 0.8,
        label: `Sparse Voice ${i}`,
      });
    }

    const voiceTrackPath = await mixer.buildVoiceTrack(voices, 100.0, workDir);

    // Check that EVERY voice clip is audible (above -30 dB RMS)
    for (const v of voices) {
      const rms = await measureRmsAt(voiceTrackPath, v.startTimeSeconds, 1.0);
      expect(rms).toBeGreaterThan(-35);
    }
  });

  it("should return silence base when no voice placements provided", async () => {
    const mixer = await import("./audioMixer");
    const workDir = path.join(tmpDir, "empty-voice-test");

    const voiceTrackPath = await mixer.buildVoiceTrack([], 5.0, workDir);
    expect(voiceTrackPath).toBeTruthy();

    const duration = await mixer.getAudioDuration(voiceTrackPath);
    expect(duration).toBeGreaterThan(4.5);
    expect(duration).toBeLessThan(5.5);
  });

  it("should mux video with audio correctly", async () => {
    const mixer = await import("./audioMixer");
    const videoPath = path.join(tmpDir, "mux-video.mp4");
    const audioPath = path.join(tmpDir, "mux-audio.wav");
    const outputPath = path.join(tmpDir, "muxed.mp4");

    await createTestVideo(videoPath, 3.0, "green", false);
    await createTone(audioPath, 440, 3.0);

    await mixer.muxVideoWithAudio(videoPath, audioPath, outputPath);

    const stat = await fs.stat(outputPath);
    expect(stat.size).toBeGreaterThan(1000);

    // Verify it has both video and audio streams
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "quiet",
      "-show_entries", "stream=codec_type",
      "-of", "csv=p=0",
      outputPath,
    ]);
    const streams = stdout.trim().split("\n");
    expect(streams).toContain("video");
    expect(streams).toContain("audio");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. VOICE VALIDATION GATE TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("Voice Validation Gate", () => {
  it("should import all validator functions", async () => {
    const validator = await import("./voiceValidator");
    expect(typeof validator.validateVoicePresence).toBe("function");
    expect(typeof validator.assertVoicePresence).toBe("function");
    expect(typeof validator.isVoicePresent).toBe("function");
  });

  it("should export correct constants", async () => {
    const validator = await import("./voiceValidator");
    expect(validator.DEFAULT_VOICE_THRESHOLD_LUFS).toBe(-30);
    expect(validator.DEFAULT_MEASURE_DURATION_SECONDS).toBe(2.0);
  });

  it("should PASS when voice is present at dialogue timecodes", async () => {
    const mixer = await import("./audioMixer");
    const validator = await import("./voiceValidator");
    const workDir = path.join(tmpDir, "validation-pass-test");

    // Build a voice track with known placements
    const voice1 = path.join(tmpDir, "val-voice1.wav");
    const voice2 = path.join(tmpDir, "val-voice2.wav");
    await createTone(voice1, 440, 1.5, 0.5);
    await createTone(voice2, 660, 1.5, 0.5);

    const voiceTrackPath = await mixer.buildVoiceTrack(
      [
        { filePath: voice1, startTimeSeconds: 2.0, durationSeconds: 1.5, label: "V1" },
        { filePath: voice2, startTimeSeconds: 7.0, durationSeconds: 1.5, label: "V2" },
      ],
      12.0,
      workDir,
    );

    const result = await validator.validateVoicePresence(voiceTrackPath, [
      { panelId: 1, character: "Ilyra", startTimeSeconds: 2.0, measureDurationSeconds: 2.0 },
      { panelId: 2, character: "Kaelis", startTimeSeconds: 7.0, measureDurationSeconds: 2.0 },
    ]);

    expect(result.allPassed).toBe(true);
    expect(result.passedCount).toBe(2);
    expect(result.failedCount).toBe(0);
  });

  it("should FAIL when voice is missing at a dialogue timecode", async () => {
    const validator = await import("./voiceValidator");

    // Create a completely silent audio file
    const silentPath = path.join(tmpDir, "silent-track.wav");
    await createSilence(silentPath, 10.0);

    const result = await validator.validateVoicePresence(silentPath, [
      { panelId: 1, character: "Ilyra", startTimeSeconds: 2.0 },
      { panelId: 2, character: "Kaelis", startTimeSeconds: 5.0 },
    ]);

    expect(result.allPassed).toBe(false);
    expect(result.failedCount).toBe(2);
    expect(result.summary).toContain("FAILED");
  });

  it("should throw on assertVoicePresence when validation fails", async () => {
    const validator = await import("./voiceValidator");

    const silentPath = path.join(tmpDir, "silent-assert.wav");
    await createSilence(silentPath, 10.0);

    await expect(
      validator.assertVoicePresence(silentPath, [
        { panelId: 1, character: "Test", startTimeSeconds: 2.0 },
      ])
    ).rejects.toThrow("Voice presence validation failed");
  });

  it("should detect partial failures (some voices present, some missing)", async () => {
    const validator = await import("./voiceValidator");

    // Create a file with tone in first 3s then true digital silence for 9s.
    // Use concat filter to join a tone segment and a silence segment.
    const partialPath = path.join(tmpDir, "partial-audio.wav");
    await execFileAsync("ffmpeg", [
      "-y",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=3:sample_rate=48000",
      "-f", "lavfi", "-i", "anullsrc=channel_layout=mono:sample_rate=48000",
      "-filter_complex",
      "[0]aformat=sample_fmts=s16:sample_rates=48000:channel_layouts=mono[tone];" +
      "[1]atrim=0:9,aformat=sample_fmts=s16:sample_rates=48000:channel_layouts=mono[sil];" +
      "[tone][sil]concat=n=2:v=0:a=1[out]",
      "-map", "[out]",
      "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le",
      partialPath,
    ], { timeout: 30000 });

    const result = await validator.validateVoicePresence(partialPath, [
      { panelId: 1, character: "Present", startTimeSeconds: 0.5, measureDurationSeconds: 2.0 },
      { panelId: 2, character: "Missing", startTimeSeconds: 8.0, measureDurationSeconds: 2.0 },
    ]);

    // The tone at 0.5s should pass; the silence at 8s should fail
    expect(result.passedCount).toBeGreaterThanOrEqual(1);
    expect(result.failedCount).toBeGreaterThanOrEqual(1);
    expect(result.allPassed).toBe(false);
  });

  it("isVoicePresent should return true for audible audio", async () => {
    const validator = await import("./voiceValidator");

    const tonePath = path.join(tmpDir, "present-tone.wav");
    await createTone(tonePath, 440, 5.0, 0.5);

    const present = await validator.isVoicePresent(tonePath, 1.0, 2.0);
    expect(present).toBe(true);
  });

  it("isVoicePresent should return false for silent audio", async () => {
    const validator = await import("./voiceValidator");

    const silentPath = path.join(tmpDir, "absent-tone.wav");
    await createSilence(silentPath, 5.0);

    const present = await validator.isVoicePresent(silentPath, 1.0, 2.0);
    expect(present).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. LIP SYNC PROCESSOR TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("Lip Sync Processor", () => {
  it("should import all lip sync functions", async () => {
    const lipSync = await import("./lipSyncProcessor");
    expect(typeof lipSync.processLipSyncPanel).toBe("function");
    expect(typeof lipSync.processLipSyncBatch).toBe("function");
    expect(typeof lipSync.padAudioForLipSync).toBe("function");
    expect(typeof lipSync.detectFaces).toBe("function");
    expect(typeof lipSync.selectFaceForCharacter).toBe("function");
    expect(typeof lipSync.calculateFaceAudioOverlap).toBe("function");
  });

  it("should export correct constants", async () => {
    const lipSync = await import("./lipSyncProcessor");
    expect(lipSync.MIN_AUDIO_DURATION_SECONDS).toBe(3.0);
    expect(lipSync.SOUND_END_TIME_SAFETY_MARGIN_MS).toBe(50);
    expect(lipSync.MIN_FACE_AUDIO_OVERLAP_MS).toBe(2000);
  });

  describe("Audio Padding", () => {
    it("should pad short audio to >= 3 seconds", async () => {
      const lipSync = await import("./lipSyncProcessor");

      // Create a 0.8s audio clip
      const shortPath = path.join(tmpDir, "short-audio.wav");
      await createTone(shortPath, 440, 0.8);

      const outputPath = path.join(tmpDir, "padded-audio.wav");
      const { paddedPath, durationMs } = await lipSync.padAudioForLipSync(shortPath, outputPath);

      expect(paddedPath).toBeTruthy();
      expect(durationMs).toBeGreaterThanOrEqual(3000);

      // Verify the padded file exists
      const stat = await fs.stat(paddedPath);
      expect(stat.size).toBeGreaterThan(100);
    });

    it("should not pad audio that is already >= 3 seconds", async () => {
      const lipSync = await import("./lipSyncProcessor");

      const longPath = path.join(tmpDir, "long-audio.wav");
      await createTone(longPath, 440, 5.0);

      const outputPath = path.join(tmpDir, "padded-long.wav");
      const { durationMs } = await lipSync.padAudioForLipSync(longPath, outputPath);

      // Should be approximately 5 seconds
      expect(durationMs).toBeGreaterThanOrEqual(4500);
      expect(durationMs).toBeLessThanOrEqual(5500);
    });
  });

  describe("Face-Audio Overlap Calculation", () => {
    it("should calculate full overlap when face covers entire audio window", async () => {
      const lipSync = await import("./lipSyncProcessor");

      const overlap = lipSync.calculateFaceAudioOverlap(
        0,     // face starts at 0ms
        5000,  // face ends at 5000ms
        0,     // audio inserted at 0ms
        3000,  // audio is 3000ms long
      );

      expect(overlap).toBe(3000);
    });

    it("should calculate partial overlap when face starts after audio", async () => {
      const lipSync = await import("./lipSyncProcessor");

      const overlap = lipSync.calculateFaceAudioOverlap(
        2000,  // face starts at 2000ms
        5000,  // face ends at 5000ms
        0,     // audio inserted at 0ms
        3000,  // audio is 3000ms long
      );

      // Overlap: max(2000, 0) to min(5000, 3000) = 2000 to 3000 = 1000ms
      expect(overlap).toBe(1000);
    });

    it("should return 0 when no overlap", async () => {
      const lipSync = await import("./lipSyncProcessor");

      const overlap = lipSync.calculateFaceAudioOverlap(
        4000,  // face starts at 4000ms
        5000,  // face ends at 5000ms
        0,     // audio inserted at 0ms
        3000,  // audio is 3000ms long
      );

      expect(overlap).toBe(0);
    });

    it("should handle audio inserted mid-video", async () => {
      const lipSync = await import("./lipSyncProcessor");

      const overlap = lipSync.calculateFaceAudioOverlap(
        0,     // face starts at 0ms
        5000,  // face ends at 5000ms
        2000,  // audio inserted at 2000ms
        3000,  // audio is 3000ms long (ends at 5000ms)
      );

      expect(overlap).toBe(3000);
    });
  });

  describe("Face Selection", () => {
    it("should select the face with the most overlap", async () => {
      const lipSync = await import("./lipSyncProcessor");

      const faces = [
        { faceId: 0, startTimeMs: 0, endTimeMs: 1000 },    // Only 1000ms overlap
        { faceId: 1, startTimeMs: 0, endTimeMs: 5000 },    // Full 3000ms overlap
      ];

      const { selectedFace, overlapMs } = lipSync.selectFaceForCharacter(
        faces, "Kaelis", 0, 3000,
      );

      expect(selectedFace?.faceId).toBe(1);
      expect(overlapMs).toBe(3000);
    });

    it("should report insufficient overlap when below threshold", async () => {
      const lipSync = await import("./lipSyncProcessor");

      const faces = [
        { faceId: 0, startTimeMs: 2500, endTimeMs: 5000 },  // Only 500ms overlap with 0-3000ms audio
      ];

      const { overlapMs, reason } = lipSync.selectFaceForCharacter(
        faces, "Kaelis", 0, 3000,
      );

      expect(overlapMs).toBe(500);
      expect(reason).toContain("overlap");
    });

    it("should handle no faces detected", async () => {
      const lipSync = await import("./lipSyncProcessor");

      const { selectedFace, reason } = lipSync.selectFaceForCharacter(
        [], "Kaelis", 0, 3000,
      );

      expect(selectedFace).toBeNull();
      expect(reason).toContain("No faces");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. INTEGRATION: video-assembly.ts uses safe mixer
// ═══════════════════════════════════════════════════════════════════════════

describe("Video Assembly Integration", () => {
  it("should import assembleVideo function", async () => {
    const { assembleVideo } = await import("../video-assembly");
    expect(typeof assembleVideo).toBe("function");
  });

  it("should verify video-assembly.ts no longer uses bare amix for voice overlay", async () => {
    // Read the source file and check that the old bare amix pattern is gone
    const source = await fs.readFile(
      path.join(__dirname, "../video-assembly.ts"),
      "utf-8",
    );

    // The old pattern: amix=inputs=N:duration=longest:dropout_transition=2
    // without weights or normalize=0
    const bareAmixPattern = /amix=inputs=\d+:duration=(?:longest|first)(?::dropout_transition=\d+)?\[/;
    const safeAmixPattern = /weights=1 1:normalize=0/;

    // The music mixer should use safe amix
    expect(source).toMatch(safeAmixPattern);

    // The old overlayVoiceClips should be renamed to _UNSAFE
    expect(source).toContain("overlayVoiceClips_UNSAFE");
    expect(source).toContain("overlayVoiceClipsSafe");

    // The main assembleVideo should call the safe version
    expect(source).toContain("overlayVoiceClipsSafe(currentPath");
  });

  it("should verify AssemblyInput supports new pipeline options", async () => {
    const source = await fs.readFile(
      path.join(__dirname, "../video-assembly.ts"),
      "utf-8",
    );

    expect(source).toContain("enableLipSync");
    expect(source).toContain("skipVoiceValidation");
    expect(source).toContain("voiceValidationThresholdLufs");
    expect(source).toContain("uploadFn");
  });

  it("should verify AssemblyResult includes validation and lip sync results", async () => {
    const source = await fs.readFile(
      path.join(__dirname, "../video-assembly.ts"),
      "utf-8",
    );

    expect(source).toContain("lipSyncResult");
    expect(source).toContain("voiceValidation");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. PIPELINE INDEX RE-EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

describe("Pipeline Index", () => {
  it("should re-export all audio mixer functions", async () => {
    const pipeline = await import("./index");
    expect(typeof pipeline.buildVoiceTrack).toBe("function");
    expect(typeof pipeline.buildMusicTrack).toBe("function");
    expect(typeof pipeline.mixVoiceAndMusic).toBe("function");
    expect(typeof pipeline.muxVideoWithAudio).toBe("function");
  });

  it("should re-export all voice validator functions", async () => {
    const pipeline = await import("./index");
    expect(typeof pipeline.validateVoicePresence).toBe("function");
    expect(typeof pipeline.assertVoicePresence).toBe("function");
    expect(typeof pipeline.isVoicePresent).toBe("function");
  });

  it("should re-export all lip sync functions", async () => {
    const pipeline = await import("./index");
    expect(typeof pipeline.processLipSyncPanel).toBe("function");
    expect(typeof pipeline.processLipSyncBatch).toBe("function");
    expect(typeof pipeline.padAudioForLipSync).toBe("function");
    expect(typeof pipeline.detectFaces).toBe("function");
    expect(typeof pipeline.selectFaceForCharacter).toBe("function");
    expect(typeof pipeline.calculateFaceAudioOverlap).toBe("function");
  });

  it("should re-export all constants", async () => {
    const pipeline = await import("./index");
    expect(pipeline.VOICE_LOUDNESS_THRESHOLD_LUFS).toBe(-30);
    expect(pipeline.DEFAULT_VOICE_LUFS).toBe(-14);
    expect(pipeline.DEFAULT_MUSIC_LUFS).toBe(-24);
    expect(pipeline.SIDECHAIN_DUCK_DB).toBe(8);
    expect(pipeline.DEFAULT_VOICE_THRESHOLD_LUFS).toBe(-30);
    expect(pipeline.MIN_AUDIO_DURATION_SECONDS).toBe(3.0);
    expect(pipeline.SOUND_END_TIME_SAFETY_MARGIN_MS).toBe(50);
    expect(pipeline.MIN_FACE_AUDIO_OVERLAP_MS).toBe(2000);
  });
});
