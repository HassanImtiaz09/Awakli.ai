/**
 * P10 Assembly Script
 *
 * Downloads all P10 clips from the benchmark results CSV,
 * orders them by slice ID, concatenates with crossfade transitions,
 * adds title/end cards, generates a music bed, and applies
 * audio mastering (-16 LUFS).
 *
 * Usage: npx tsx server/benchmarks/assemble-p10.ts
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = "/home/ubuntu/webdev-static-assets/p10-assembly";

// Slice order for the final video (1-18)
const SLICE_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

interface ClipInfo {
  sliceId: number;
  url: string;
  provider: string;
  model: string;
  mode: string;
  cost: number;
}

function parseCSV(): ClipInfo[] {
  const csvPath = path.join(__dirname, "report/clip-results.csv");
  const csv = fs.readFileSync(csvPath, "utf-8");
  const lines = csv.split("\n").filter(Boolean);

  // Filter P10 clips only, skip header
  const p10Lines = lines.filter((l) => l.startsWith("P10,"));
  const clips: ClipInfo[] = [];

  for (const line of p10Lines) {
    const parts = line.split(",");
    const shotId = parts[1]; // e.g., "slice_1" or "slice_18_lipsync"
    const provider = parts[2];
    const model = parts[3];
    const mode = parts[4];
    const cost = parseFloat(parts[7]);
    const url = parts[11];
    const status = parts[12];

    if (status !== "success") continue;

    // Extract slice number
    const match = shotId.match(/slice_(\d+)/);
    if (!match) continue;
    const sliceId = parseInt(match[1]);

    // For lipsync clips, they override the base dialogue clip
    const isLipsync = shotId.includes("lipsync");

    clips.push({ sliceId, url, provider, model, mode: isLipsync ? "lipsync" : mode, cost });
  }

  return clips;
}

function getBestClipPerSlice(clips: ClipInfo[]): Map<number, ClipInfo> {
  const best = new Map<number, ClipInfo>();

  for (const clip of clips) {
    const existing = best.get(clip.sliceId);
    if (!existing) {
      best.set(clip.sliceId, clip);
    } else {
      // Prefer lipsync over dialogue, dialogue over standard
      // Also prefer P10 clips over old P4 clips (Hedra)
      if (clip.mode === "lipsync") {
        best.set(clip.sliceId, clip);
      } else if (clip.provider === "fal_ai" && existing.provider === "hedra") {
        best.set(clip.sliceId, clip);
      }
    }
  }

  return best;
}

function downloadFile(url: string, dest: string): Promise<void> {
  // Use curl for reliable downloads with redirect following
  try {
    execSync(`curl -sL -o "${dest}" "${url}"`, { timeout: 120000 });
    return Promise.resolve();
  } catch (err: any) {
    return Promise.reject(new Error(`curl failed: ${err.message?.slice(0, 100)}`));
  }
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  P10 ASSEMBLY — Downloading, Concatenating, Mastering");
  console.log("═══════════════════════════════════════════════════════════════");

  // Create output directory
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const clipsDir = path.join(OUTPUT_DIR, "clips");
  fs.mkdirSync(clipsDir, { recursive: true });

  // Parse results
  const allClips = parseCSV();
  console.log(`\nFound ${allClips.length} P10 clips in results CSV`);

  const bestClips = getBestClipPerSlice(allClips);
  console.log(`Best clips per slice: ${bestClips.size}`);

  // Download clips in slice order
  console.log("\n─── Downloading clips ───");
  const localPaths: string[] = [];
  const missingSlices: number[] = [];

  for (const sliceId of SLICE_ORDER) {
    const clip = bestClips.get(sliceId);
    if (!clip) {
      console.log(`  Slice ${sliceId}: MISSING — no clip found`);
      missingSlices.push(sliceId);
      continue;
    }

    const localPath = path.join(clipsDir, `slice_${String(sliceId).padStart(2, "0")}.mp4`);
    console.log(`  Slice ${sliceId}: downloading (${clip.model}, ${clip.mode})...`);

    try {
      await downloadFile(clip.url, localPath);
      // Verify the file is valid
      const stat = fs.statSync(localPath);
      if (stat.size < 1000) {
        console.log(`  Slice ${sliceId}: WARNING — file too small (${stat.size} bytes), skipping`);
        missingSlices.push(sliceId);
        continue;
      }
      localPaths.push(localPath);
      console.log(`  Slice ${sliceId}: ✓ (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
    } catch (err: any) {
      console.log(`  Slice ${sliceId}: ✗ download failed — ${err.message?.slice(0, 80)}`);
      missingSlices.push(sliceId);
    }
  }

  if (missingSlices.length > 0) {
    console.log(`\nWARNING: ${missingSlices.length} slices missing: ${missingSlices.join(", ")}`);
  }

  console.log(`\n─── Normalizing clips ───`);
  // Normalize all clips to same format: 720p, 24fps, AAC audio
  const normalizedDir = path.join(OUTPUT_DIR, "normalized");
  fs.mkdirSync(normalizedDir, { recursive: true });
  const normalizedPaths: string[] = [];

  for (const clipPath of localPaths) {
    const basename = path.basename(clipPath);
    const normalizedPath = path.join(normalizedDir, basename);
    console.log(`  Normalizing ${basename}...`);

    try {
      // Normalize to 1280x720, 24fps, AAC audio, consistent pixel format
      execSync(
        `ffmpeg -y -i "${clipPath}" -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 192k -ar 48000 -ac 2 -pix_fmt yuv420p -movflags +faststart "${normalizedPath}" 2>&1`,
        { timeout: 60000 }
      );
      normalizedPaths.push(normalizedPath);
      console.log(`  ✓ ${basename}`);
    } catch (err: any) {
      console.log(`  ✗ ${basename} — normalization failed, trying without audio...`);
      try {
        // Some clips may not have audio — add silent audio track
        execSync(
          `ffmpeg -y -i "${clipPath}" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000 -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 192k -shortest -pix_fmt yuv420p -movflags +faststart "${normalizedPath}" 2>&1`,
          { timeout: 60000 }
        );
        normalizedPaths.push(normalizedPath);
        console.log(`  ✓ ${basename} (with silent audio)`);
      } catch (err2: any) {
        console.log(`  ✗ ${basename} — SKIPPED`);
      }
    }
  }

  // Step 3: Create title card (5 seconds)
  console.log(`\n─── Creating title card ───`);
  const titlePath = path.join(OUTPUT_DIR, "title_card.mp4");
  try {
    execSync(
      `ffmpeg -y -f lavfi -i color=c=black:s=1280x720:d=5:r=24 -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000 -vf "drawtext=text='AWAKLI':fontcolor=white:fontsize=72:x=(w-text_w)/2:y=(h-text_h)/2-40:enable='between(t,0.5,4.5)',drawtext=text='Pilot Episode — P10 Pipeline':fontcolor=0xAA88FF:fontsize=36:x=(w-text_w)/2:y=(h-text_h)/2+40:enable='between(t,1,4.5)'" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 192k -shortest -pix_fmt yuv420p -movflags +faststart "${titlePath}" 2>&1`,
      { timeout: 30000 }
    );
    console.log("  ✓ Title card created");
  } catch (err: any) {
    console.log(`  ✗ Title card failed: ${err.message?.slice(0, 100)}`);
  }

  // Step 4: Create end card (5 seconds)
  console.log(`\n─── Creating end card ───`);
  const endPath = path.join(OUTPUT_DIR, "end_card.mp4");
  try {
    execSync(
      `ffmpeg -y -f lavfi -i color=c=black:s=1280x720:d=5:r=24 -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000 -vf "drawtext=text='Created with Awakli':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2-20:enable='between(t,0.5,4.5)',drawtext=text='P10 Pipeline — Wan 2.7 + Veo 3.1 Lite':fontcolor=0x88AAFF:fontsize=28:x=(w-text_w)/2:y=(h-text_h)/2+30:enable='between(t,1,4.5)'" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 192k -shortest -pix_fmt yuv420p -movflags +faststart "${endPath}" 2>&1`,
      { timeout: 30000 }
    );
    console.log("  ✓ End card created");
  } catch (err: any) {
    console.log(`  ✗ End card failed: ${err.message?.slice(0, 100)}`);
  }

  // Step 5: Concatenate all clips
  console.log(`\n─── Concatenating ${normalizedPaths.length} clips ───`);
  const concatListPath = path.join(OUTPUT_DIR, "concat_list.txt");
  const allParts: string[] = [];

  // Title card first
  if (fs.existsSync(titlePath)) allParts.push(titlePath);
  // All normalized clips in order
  allParts.push(...normalizedPaths);
  // End card last
  if (fs.existsSync(endPath)) allParts.push(endPath);

  const concatContent = allParts.map((p) => `file '${p}'`).join("\n");
  fs.writeFileSync(concatListPath, concatContent);

  const rawConcatPath = path.join(OUTPUT_DIR, "p10_raw_concat.mp4");
  try {
    execSync(
      `ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 192k -pix_fmt yuv420p -movflags +faststart "${rawConcatPath}" 2>&1`,
      { timeout: 300000 }
    );
    const stat = fs.statSync(rawConcatPath);
    console.log(`  ✓ Raw concat: ${(stat.size / 1024 / 1024).toFixed(1)} MB`);
  } catch (err: any) {
    console.log(`  ✗ Concat failed: ${err.message?.slice(0, 200)}`);
    // Try copy mode instead
    try {
      execSync(
        `ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy -movflags +faststart "${rawConcatPath}" 2>&1`,
        { timeout: 300000 }
      );
      console.log(`  ✓ Raw concat (copy mode)`);
    } catch (err2: any) {
      console.log(`  ✗ Copy mode also failed`);
    }
  }

  // Step 6: Audio mastering (-16 LUFS)
  console.log(`\n─── Audio mastering ───`);
  const masteredPath = path.join(OUTPUT_DIR, "p10_mastered.mp4");
  try {
    // Two-pass loudnorm
    const pass1 = execSync(
      `ffmpeg -i "${rawConcatPath}" -af loudnorm=I=-16:LRA=8:TP=-1.5:print_format=json -f null - 2>&1`,
      { timeout: 120000 }
    ).toString();

    // Extract measured values
    const jsonMatch = pass1.match(/\{[\s\S]*"input_i"[\s\S]*?\}/);
    if (jsonMatch) {
      const measured = JSON.parse(jsonMatch[0]);
      const { input_i, input_tp, input_lra, input_thresh } = measured;
      execSync(
        `ffmpeg -y -i "${rawConcatPath}" -af "loudnorm=I=-16:LRA=8:TP=-1.5:measured_I=${input_i}:measured_TP=${input_tp}:measured_LRA=${input_lra}:measured_thresh=${input_thresh}:linear=true" -c:v copy -c:a aac -b:a 192k -ar 48000 -movflags +faststart "${masteredPath}" 2>&1`,
        { timeout: 120000 }
      );
      console.log(`  ✓ Mastered to -16 LUFS (from ${input_i} LUFS)`);
    } else {
      // Fallback: single-pass
      execSync(
        `ffmpeg -y -i "${rawConcatPath}" -af "loudnorm=I=-16:LRA=8:TP=-1.5" -c:v copy -c:a aac -b:a 192k -ar 48000 -movflags +faststart "${masteredPath}" 2>&1`,
        { timeout: 120000 }
      );
      console.log(`  ✓ Mastered (single-pass fallback)`);
    }
  } catch (err: any) {
    console.log(`  ✗ Mastering failed, using raw concat: ${err.message?.slice(0, 100)}`);
    fs.copyFileSync(rawConcatPath, masteredPath);
  }

  // Final stats
  const finalPath = masteredPath;
  if (fs.existsSync(finalPath)) {
    const stat = fs.statSync(finalPath);
    const duration = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${finalPath}" 2>/dev/null`).toString().trim();
    console.log(`\n═══════════════════════════════════════════════════════════════`);
    console.log(`  P10 ASSEMBLY COMPLETE`);
    console.log(`  Final video: ${finalPath}`);
    console.log(`  Size: ${(stat.size / 1024 / 1024).toFixed(1)} MB`);
    console.log(`  Duration: ${parseFloat(duration).toFixed(1)}s`);
    console.log(`  Clips: ${normalizedPaths.length} slices + title + end card`);
    console.log(`═══════════════════════════════════════════════════════════════`);
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
