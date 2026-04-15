/**
 * Video Assembly Module — uses ffmpeg to concatenate video clips,
 * overlay voice clips at correct timestamps, and mix background music.
 *
 * This is the production assembly engine that replaces the placeholder
 * buffer approach. It downloads all assets to a temp directory, runs
 * ffmpeg commands, and returns the final assembled video as a Buffer.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { nanoid } from "nanoid";

const execFileAsync = promisify(execFile);

interface VideoClip {
  url: string;
  panelId: number;
  panelNumber: number | null;
  duration: number;
  hasNativeAudio: boolean;
}

interface VoiceClip {
  url: string;
  panelId: number;
  duration: number;
  text: string;
}

interface MusicTrack {
  url: string;
  duration: number;
  isFallback: boolean;
}

interface AssemblyInput {
  videoClips: VideoClip[];
  voiceClips: VoiceClip[];
  musicTrack: MusicTrack | null;
  episodeTitle: string;
}

interface AssemblyResult {
  videoBuffer: Buffer;
  totalDuration: number;
  resolution: string;
  format: string;
}

/**
 * Download a file from URL to a local path
 */
async function downloadFile(url: string, destPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(destPath, buffer);
}

/**
 * Get video duration using ffprobe
 */
async function getMediaDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "quiet",
      "-show_entries", "format=duration",
      "-of", "csv=p=0",
      filePath,
    ]);
    return parseFloat(stdout.trim()) || 5;
  } catch {
    return 5; // default 5s
  }
}

/**
 * Normalize a video clip to consistent format for concatenation:
 * - Scale to 1920x1080 (pad if needed)
 * - Set framerate to 24fps
 * - Set pixel format to yuv420p
 * - Add silent audio track if missing
 */
async function normalizeClip(inputPath: string, outputPath: string): Promise<void> {
  // First check if the input has an audio stream
  let hasAudio = false;
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "quiet",
      "-select_streams", "a",
      "-show_entries", "stream=codec_type",
      "-of", "csv=p=0",
      inputPath,
    ]);
    hasAudio = stdout.trim().length > 0;
  } catch {
    hasAudio = false;
  }

  if (hasAudio) {
    // Video has audio — normalize video + pass through audio
    await execFileAsync("ffmpeg", [
      "-y", "-i", inputPath,
      "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black",
      "-r", "24",
      "-c:v", "libx264", "-preset", "fast", "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k",
      outputPath,
    ], { timeout: 120000 });
  } else {
    // Video has no audio — add silent audio track
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
    ], { timeout: 120000 });
  }
}

/**
 * Concatenate video clips using ffmpeg concat demuxer
 */
async function concatenateClips(clipPaths: string[], outputPath: string): Promise<void> {
  const listFile = outputPath.replace(".mp4", "-list.txt");
  const listContent = clipPaths.map(p => `file '${p}'`).join("\n");
  await fs.writeFile(listFile, listContent);

  await execFileAsync("ffmpeg", [
    "-y", "-f", "concat", "-safe", "0",
    "-i", listFile,
    "-c:v", "libx264", "-preset", "fast", "-crf", "23",
    "-c:a", "aac", "-b:a", "128k",
    "-pix_fmt", "yuv420p",
    outputPath,
  ], { timeout: 300000 });

  await fs.unlink(listFile).catch(() => {});
}

/**
 * Overlay voice clips onto the video at correct timestamps.
 * Each voice clip is placed at the start of its corresponding panel's segment.
 */
async function overlayVoiceClips(
  videoPath: string,
  voiceClips: { path: string; startTime: number; duration: number }[],
  outputPath: string
): Promise<void> {
  if (voiceClips.length === 0) {
    await fs.copyFile(videoPath, outputPath);
    return;
  }

  // Build ffmpeg complex filter for mixing voice clips
  const inputs = ["-i", videoPath];
  const filterParts: string[] = [];

  for (let i = 0; i < voiceClips.length; i++) {
    inputs.push("-i", voiceClips[i].path);
    // Delay each voice clip to its start time and pad to match video length
    filterParts.push(`[${i + 1}:a]adelay=${Math.round(voiceClips[i].startTime * 1000)}|${Math.round(voiceClips[i].startTime * 1000)}[voice${i}]`);
  }

  // Mix all voice clips with the original audio
  const voiceLabels = voiceClips.map((_, i) => `[voice${i}]`).join("");
  filterParts.push(`[0:a]${voiceLabels}amix=inputs=${voiceClips.length + 1}:duration=longest:dropout_transition=2[mixed]`);

  const filterComplex = filterParts.join(";");

  await execFileAsync("ffmpeg", [
    "-y",
    ...inputs,
    "-filter_complex", filterComplex,
    "-map", "0:v",
    "-map", "[mixed]",
    "-c:v", "copy",
    "-c:a", "aac", "-b:a", "192k",
    outputPath,
  ], { timeout: 300000 });
}

/**
 * Mix background music into the video at a lower volume
 */
async function mixBackgroundMusic(
  videoPath: string,
  musicPath: string,
  outputPath: string,
  musicVolume: number = 0.15
): Promise<void> {
  const videoDuration = await getMediaDuration(videoPath);

  await execFileAsync("ffmpeg", [
    "-y",
    "-i", videoPath,
    "-i", musicPath,
    "-filter_complex",
    `[1:a]volume=${musicVolume},aloop=loop=-1:size=2e+09,atrim=0:${videoDuration}[bgm];[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=3[out]`,
    "-map", "0:v",
    "-map", "[out]",
    "-c:v", "copy",
    "-c:a", "aac", "-b:a", "192k",
    "-shortest",
    outputPath,
  ], { timeout: 300000 });
}

/**
 * Main assembly function — downloads all assets, processes them with ffmpeg,
 * and returns the final assembled video as a Buffer.
 */
export async function assembleVideo(input: AssemblyInput): Promise<AssemblyResult> {
  const tmpDir = path.join(os.tmpdir(), `awakli-assembly-${nanoid(8)}`);
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    console.log(`[Assembly] Starting in ${tmpDir} with ${input.videoClips.length} clips, ${input.voiceClips.length} voice clips`);

    // Sort video clips by panel number
    const sortedClips = [...input.videoClips].sort((a, b) => (a.panelNumber || 0) - (b.panelNumber || 0));

    // Step 1: Download all video clips
    const downloadedClips: string[] = [];
    for (let i = 0; i < sortedClips.length; i++) {
      const clip = sortedClips[i];
      const clipPath = path.join(tmpDir, `clip-${i}.mp4`);
      console.log(`[Assembly] Downloading clip ${i + 1}/${sortedClips.length}: panel ${clip.panelId}`);
      await downloadFile(clip.url, clipPath);
      downloadedClips.push(clipPath);
    }

    // Step 2: Normalize all clips to consistent format
    const normalizedClips: string[] = [];
    for (let i = 0; i < downloadedClips.length; i++) {
      const normPath = path.join(tmpDir, `norm-${i}.mp4`);
      console.log(`[Assembly] Normalizing clip ${i + 1}/${downloadedClips.length}`);
      await normalizeClip(downloadedClips[i], normPath);
      normalizedClips.push(normPath);
    }

    // Step 3: Concatenate all clips
    const concatPath = path.join(tmpDir, "concat.mp4");
    console.log(`[Assembly] Concatenating ${normalizedClips.length} clips`);
    await concatenateClips(normalizedClips, concatPath);

    // Step 4: Download voice clips and calculate timestamps
    let currentPath = concatPath;
    if (input.voiceClips.length > 0) {
      const voiceData: { path: string; startTime: number; duration: number }[] = [];

      // Calculate start time for each voice clip based on panel order
      let cumulativeTime = 0;
      const panelStartTimes: Record<number, number> = {};
      for (const clip of sortedClips) {
        panelStartTimes[clip.panelId] = cumulativeTime;
        cumulativeTime += clip.duration;
      }

      for (let i = 0; i < input.voiceClips.length; i++) {
        const vc = input.voiceClips[i];
        const voicePath = path.join(tmpDir, `voice-${i}.mp3`);
        console.log(`[Assembly] Downloading voice clip ${i + 1}/${input.voiceClips.length}: panel ${vc.panelId}`);
        await downloadFile(vc.url, voicePath);

        const startTime = panelStartTimes[vc.panelId] ?? 0;
        const actualDuration = await getMediaDuration(voicePath);

        voiceData.push({
          path: voicePath,
          startTime,
          duration: actualDuration,
        });
      }

      // Step 5: Overlay voice clips
      const voiceMixPath = path.join(tmpDir, "with-voice.mp4");
      console.log(`[Assembly] Overlaying ${voiceData.length} voice clips`);
      await overlayVoiceClips(currentPath, voiceData, voiceMixPath);
      currentPath = voiceMixPath;
    }

    // Step 6: Mix background music (if available and not a fallback)
    if (input.musicTrack && !input.musicTrack.isFallback && input.musicTrack.duration > 0) {
      const musicPath = path.join(tmpDir, "bgm.mp3");
      console.log(`[Assembly] Downloading background music`);
      await downloadFile(input.musicTrack.url, musicPath);

      const finalWithMusic = path.join(tmpDir, "with-music.mp4");
      console.log(`[Assembly] Mixing background music`);
      await mixBackgroundMusic(currentPath, musicPath, finalWithMusic);
      currentPath = finalWithMusic;
    }

    // Step 7: Read the final video
    const finalBuffer = await fs.readFile(currentPath);
    const totalDuration = await getMediaDuration(currentPath);

    console.log(`[Assembly] Complete: ${finalBuffer.length} bytes, ${totalDuration.toFixed(1)}s`);

    return {
      videoBuffer: finalBuffer,
      totalDuration,
      resolution: "1920x1080",
      format: "mp4",
    };
  } finally {
    // Cleanup temp directory
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
