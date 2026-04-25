/**
 * A3: Title + End Cards — FFmpeg text overlay generation
 *
 * Generates title sequence and end card as standalone video clips
 * using FFmpeg's drawtext filter with animated opacity.
 *
 * Title card: Series name + episode title, fade in/out over black
 * End card: Credits + "Created with Awakli" branding
 */

import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execAsync = promisify(exec);

export interface TitleCardOptions {
  title?: string;
  subtitle?: string;
  durationSec?: number;
  fadeInSec?: number;
  fadeOutSec?: number;
  width?: number;
  height?: number;
  fontColor?: string;
  bgColor?: string;
  fontSize?: number;
  subtitleFontSize?: number;
}

export interface EndCardOptions {
  credits?: string[];
  branding?: string;
  durationSec?: number;
  fadeInSec?: number;
  fadeOutSec?: number;
  width?: number;
  height?: number;
  fontColor?: string;
  bgColor?: string;
}

const DEFAULT_TITLE: Required<TitleCardOptions> = {
  title: "AWAKLI",
  subtitle: "Episode 1: The Awakening",
  durationSec: 5,
  fadeInSec: 1.0,
  fadeOutSec: 1.0,
  width: 1280,
  height: 720,
  fontColor: "white",
  bgColor: "black",
  fontSize: 64,
  subtitleFontSize: 32,
};

const DEFAULT_END: Required<EndCardOptions> = {
  credits: ["Created with Awakli", "Powered by AI Video Generation"],
  branding: "awakli.ai",
  durationSec: 4,
  fadeInSec: 0.8,
  fadeOutSec: 1.0,
  width: 1280,
  height: 720,
  fontColor: "white",
  bgColor: "black",
};

/**
 * Generate a title card video clip.
 *
 * Creates a black background with centered title text that fades in and out.
 * Uses FFmpeg's drawtext filter with alpha animation.
 */
export async function generateTitleCard(
  outputPath: string,
  options: TitleCardOptions = {}
): Promise<string> {
  const opts = { ...DEFAULT_TITLE, ...options };

  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Build drawtext filters
  // Title: centered, large font, fade in/out
  const titleAlpha = `alpha='if(lt(t,${opts.fadeInSec}),t/${opts.fadeInSec},if(gt(t,${opts.durationSec - opts.fadeOutSec}),(${opts.durationSec}-t)/${opts.fadeOutSec},1))'`;

  let filterComplex = [
    `color=c=${opts.bgColor}:s=${opts.width}x${opts.height}:d=${opts.durationSec}[bg]`,
    `[bg]drawtext=text='${escapeFFmpegText(opts.title)}':fontsize=${opts.fontSize}:fontcolor=${opts.fontColor}@1.0:${titleAlpha}:x=(w-text_w)/2:y=(h-text_h)/2-40:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf`,
  ];

  // Subtitle if provided
  if (opts.subtitle) {
    const subAlpha = `alpha='if(lt(t,${opts.fadeInSec + 0.3}),max(0,(t-0.3)/${opts.fadeInSec}),if(gt(t,${opts.durationSec - opts.fadeOutSec}),(${opts.durationSec}-t)/${opts.fadeOutSec},1))'`;
    filterComplex.push(
      `drawtext=text='${escapeFFmpegText(opts.subtitle)}':fontsize=${opts.subtitleFontSize}:fontcolor=${opts.fontColor}@0.8:${subAlpha}:x=(w-text_w)/2:y=(h-text_h)/2+40:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf`
    );
  }

  // Add silent audio track
  const cmd = [
    "ffmpeg", "-hide_banner", "-y",
    "-f", "lavfi", "-i", `"${filterComplex.join(",")}"`,
    "-f", "lavfi", "-i", `"anullsrc=channel_layout=stereo:sample_rate=48000"`,
    "-t", String(opts.durationSec),
    "-c:v", "libx264", "-preset", "fast", "-crf", "18",
    "-c:a", "aac", "-b:a", "192k",
    "-pix_fmt", "yuv420p",
    "-shortest",
    JSON.stringify(outputPath),
  ].join(" ");

  console.log(`  [A3] Generating title card: "${opts.title}" (${opts.durationSec}s)...`);
  await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });

  if (!fs.existsSync(outputPath)) {
    throw new Error(`A3: Title card not found at ${outputPath}`);
  }

  console.log(`  [A3] Title card generated: ${outputPath}`);
  return outputPath;
}

/**
 * Generate an end card video clip.
 *
 * Creates a black background with centered credits text that fades in and out.
 */
export async function generateEndCard(
  outputPath: string,
  options: EndCardOptions = {}
): Promise<string> {
  const opts = { ...DEFAULT_END, ...options };

  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Build multi-line credits text
  const allCredits = [...(opts.credits ?? []), "", opts.branding ?? ""];
  const creditsText = allCredits.join("\\n");

  const alpha = `alpha='if(lt(t,${opts.fadeInSec}),t/${opts.fadeInSec},if(gt(t,${opts.durationSec - opts.fadeOutSec}),(${opts.durationSec}-t)/${opts.fadeOutSec},1))'`;

  const filterComplex = [
    `color=c=${opts.bgColor}:s=${opts.width}x${opts.height}:d=${opts.durationSec}[bg]`,
    `[bg]drawtext=text='${escapeFFmpegText(creditsText)}':fontsize=28:fontcolor=${opts.fontColor}@0.9:${alpha}:x=(w-text_w)/2:y=(h-text_h)/2:fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:line_spacing=12`,
  ];

  const cmd = [
    "ffmpeg", "-hide_banner", "-y",
    "-f", "lavfi", "-i", `"${filterComplex.join(",")}"`,
    "-f", "lavfi", "-i", `"anullsrc=channel_layout=stereo:sample_rate=48000"`,
    "-t", String(opts.durationSec),
    "-c:v", "libx264", "-preset", "fast", "-crf", "18",
    "-c:a", "aac", "-b:a", "192k",
    "-pix_fmt", "yuv420p",
    "-shortest",
    JSON.stringify(outputPath),
  ].join(" ");

  console.log(`  [A3] Generating end card (${opts.durationSec}s)...`);
  await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });

  if (!fs.existsSync(outputPath)) {
    throw new Error(`A3: End card not found at ${outputPath}`);
  }

  console.log(`  [A3] End card generated: ${outputPath}`);
  return outputPath;
}

/**
 * Prepend title card and append end card to a video.
 */
export async function wrapWithCards(
  videoPath: string,
  outputPath: string,
  workDir: string,
  titleOptions: TitleCardOptions = {},
  endOptions: EndCardOptions = {}
): Promise<string> {
  const titlePath = path.join(workDir, "title_card.mp4");
  const endPath = path.join(workDir, "end_card.mp4");

  // Generate cards
  await generateTitleCard(titlePath, titleOptions);
  await generateEndCard(endPath, endOptions);

  // Concatenate: title + video + end
  const concatList = path.join(workDir, "concat_cards.txt");
  fs.writeFileSync(concatList, [
    `file '${titlePath}'`,
    `file '${videoPath}'`,
    `file '${endPath}'`,
  ].join("\n") + "\n");

  const cmd = [
    "ffmpeg", "-hide_banner", "-y",
    "-f", "concat", "-safe", "0",
    "-i", JSON.stringify(concatList),
    "-c:v", "libx264", "-preset", "fast", "-crf", "18",
    "-c:a", "aac", "-b:a", "192k",
    JSON.stringify(outputPath),
  ].join(" ");

  console.log(`  [A3] Wrapping video with title + end cards...`);
  await execAsync(cmd, { maxBuffer: 50 * 1024 * 1024 });

  if (!fs.existsSync(outputPath)) {
    throw new Error(`A3: Wrapped output not found at ${outputPath}`);
  }

  const stats = fs.statSync(outputPath);
  console.log(`  [A3] Final output: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);

  return outputPath;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function escapeFFmpegText(text: string): string {
  return text
    .replace(/'/g, "'\\''")
    .replace(/:/g, "\\:")
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "%%");
}
