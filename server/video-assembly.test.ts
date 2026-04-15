/**
 * Tests for the video assembly module.
 * These test the ffmpeg-based video concatenation, voice overlay, and music mixing.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

const execFileAsync = promisify(execFile);

describe("Video Assembly Module", () => {
  const tmpDir = path.join(os.tmpdir(), "awakli-assembly-test");

  beforeAll(async () => {
    await fs.mkdir(tmpDir, { recursive: true });
  });

  it("should have ffmpeg installed and accessible", async () => {
    const { stdout } = await execFileAsync("ffmpeg", ["-version"]);
    expect(stdout).toContain("ffmpeg version");
  });

  it("should have ffprobe installed and accessible", async () => {
    const { stdout } = await execFileAsync("ffprobe", ["-version"]);
    expect(stdout).toContain("ffprobe version");
  });

  it("should generate a test video clip with ffmpeg", async () => {
    const outputPath = path.join(tmpDir, "test-clip.mp4");

    // Generate a 3-second test video with color bars and silent audio
    await execFileAsync("ffmpeg", [
      "-y",
      "-f", "lavfi", "-i", "color=c=blue:s=640x360:d=3",
      "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-shortest",
      "-c:v", "libx264", "-preset", "ultrafast",
      "-c:a", "aac",
      "-pix_fmt", "yuv420p",
      outputPath,
    ], { timeout: 30000 });

    const stat = await fs.stat(outputPath);
    expect(stat.size).toBeGreaterThan(1000);
  });

  it("should get media duration with ffprobe", async () => {
    const clipPath = path.join(tmpDir, "test-clip.mp4");

    // Ensure the test clip exists
    const exists = await fs.access(clipPath).then(() => true).catch(() => false);
    if (!exists) {
      await execFileAsync("ffmpeg", [
        "-y",
        "-f", "lavfi", "-i", "color=c=red:s=640x360:d=5",
        "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-shortest",
        "-c:v", "libx264", "-preset", "ultrafast",
        "-c:a", "aac",
        "-pix_fmt", "yuv420p",
        clipPath,
      ], { timeout: 30000 });
    }

    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "quiet",
      "-show_entries", "format=duration",
      "-of", "csv=p=0",
      clipPath,
    ]);

    const duration = parseFloat(stdout.trim());
    expect(duration).toBeGreaterThan(0);
    expect(duration).toBeLessThan(10);
  });

  it("should normalize a video clip to 1920x1080", async () => {
    const inputPath = path.join(tmpDir, "small-clip.mp4");
    const outputPath = path.join(tmpDir, "normalized-clip.mp4");

    // Create a small 640x360 clip
    await execFileAsync("ffmpeg", [
      "-y",
      "-f", "lavfi", "-i", "color=c=green:s=640x360:d=2",
      "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-shortest",
      "-c:v", "libx264", "-preset", "ultrafast",
      "-c:a", "aac",
      "-pix_fmt", "yuv420p",
      inputPath,
    ], { timeout: 30000 });

    // Normalize to 1920x1080
    await execFileAsync("ffmpeg", [
      "-y", "-i", inputPath,
      "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black",
      "-r", "24",
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k",
      outputPath,
    ], { timeout: 60000 });

    // Verify the output resolution
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "quiet",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height",
      "-of", "csv=p=0",
      outputPath,
    ]);

    const [width, height] = stdout.trim().split(",").map(Number);
    expect(width).toBe(1920);
    expect(height).toBe(1080);
  });

  it("should concatenate multiple clips using concat demuxer", async () => {
    const clip1 = path.join(tmpDir, "concat-1.mp4");
    const clip2 = path.join(tmpDir, "concat-2.mp4");
    const outputPath = path.join(tmpDir, "concatenated.mp4");

    // Create two 2-second clips with same format
    for (const [p, color] of [[clip1, "red"], [clip2, "blue"]] as const) {
      await execFileAsync("ffmpeg", [
        "-y",
        "-f", "lavfi", "-i", `color=c=${color}:s=1920x1080:d=2:r=24`,
        "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-shortest",
        "-c:v", "libx264", "-preset", "ultrafast",
        "-c:a", "aac", "-b:a", "128k",
        "-pix_fmt", "yuv420p",
        p,
      ], { timeout: 30000 });
    }

    // Create concat list
    const listFile = path.join(tmpDir, "concat-list.txt");
    await fs.writeFile(listFile, `file '${clip1}'\nfile '${clip2}'`);

    // Concatenate
    await execFileAsync("ffmpeg", [
      "-y", "-f", "concat", "-safe", "0",
      "-i", listFile,
      "-c:v", "libx264", "-preset", "ultrafast",
      "-c:a", "aac",
      "-pix_fmt", "yuv420p",
      outputPath,
    ], { timeout: 60000 });

    // Verify duration is ~4 seconds (2 + 2)
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "quiet",
      "-show_entries", "format=duration",
      "-of", "csv=p=0",
      outputPath,
    ]);

    const duration = parseFloat(stdout.trim());
    expect(duration).toBeGreaterThan(3.5);
    expect(duration).toBeLessThan(5);
  });

  it("should mix audio tracks with amix filter", async () => {
    const videoPath = path.join(tmpDir, "video-for-mix.mp4");
    const audioPath = path.join(tmpDir, "audio-for-mix.mp3");
    const outputPath = path.join(tmpDir, "mixed.mp4");

    // Create a 3-second video with silent audio
    await execFileAsync("ffmpeg", [
      "-y",
      "-f", "lavfi", "-i", "color=c=purple:s=1920x1080:d=3:r=24",
      "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-shortest",
      "-c:v", "libx264", "-preset", "ultrafast",
      "-c:a", "aac",
      "-pix_fmt", "yuv420p",
      videoPath,
    ], { timeout: 30000 });

    // Create a 3-second audio tone
    await execFileAsync("ffmpeg", [
      "-y",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
      "-c:a", "libmp3lame",
      audioPath,
    ], { timeout: 30000 });

    // Mix audio into video
    await execFileAsync("ffmpeg", [
      "-y",
      "-i", videoPath,
      "-i", audioPath,
      "-filter_complex",
      "[1:a]volume=0.3[bgm];[0:a][bgm]amix=inputs=2:duration=first[out]",
      "-map", "0:v",
      "-map", "[out]",
      "-c:v", "copy",
      "-c:a", "aac",
      "-shortest",
      outputPath,
    ], { timeout: 60000 });

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

  it("should import assembleVideo function", async () => {
    const { assembleVideo } = await import("./video-assembly");
    expect(typeof assembleVideo).toBe("function");
  });

  // Cleanup
  it("should clean up test files", async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});
