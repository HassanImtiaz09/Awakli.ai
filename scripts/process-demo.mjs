#!/usr/bin/env node
/**
 * Demo Video Post-Processing Script
 * 
 * Takes the raw frames captured by record-demo.mjs and produces a polished MP4.
 * 
 * Pipeline:
 * 1. Assemble frames into video at 30fps
 * 2. Add 2s black intro + 2s black outro
 * 3. Apply subtle vignette overlay
 * 4. Encode to H.264 (web-optimized, faststart)
 * 5. Generate poster frame (thumbnail at 50% mark)
 * 
 * Usage:
 *   node scripts/process-demo.mjs --frames-dir ./demo-frames --output demo-final.mp4
 *   node scripts/process-demo.mjs --frames-dir ./demo-frames --output demo-final.mp4 --bgm ./bgm.mp3
 * 
 * Requirements: ffmpeg must be installed
 */

import { parseArgs } from "node:util";
import { execSync, exec } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";

const { values: args } = parseArgs({
  options: {
    "frames-dir": { type: "string", default: "./demo-frames" },
    output: { type: "string", default: "demo-final.mp4" },
    bgm: { type: "string", default: "" },
    fps: { type: "string", default: "30" },
    width: { type: "string", default: "1920" },
    height: { type: "string", default: "1080" },
  },
});

const FRAMES_DIR = args["frames-dir"];
const OUTPUT = args.output;
const BGM_PATH = args.bgm;
const FPS = parseInt(args.fps, 10);
const WIDTH = parseInt(args.width, 10);
const HEIGHT = parseInt(args.height, 10);

function run(cmd, label) {
  console.log(`  → ${label}...`);
  try {
    execSync(cmd, { stdio: "pipe", maxBuffer: 50 * 1024 * 1024 });
    console.log(`  ✅ ${label} complete`);
  } catch (err) {
    console.error(`  ❌ ${label} failed:`, err.stderr?.toString() || err.message);
    throw err;
  }
}

function checkFfmpeg() {
  try {
    execSync("ffmpeg -version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log("🎬 Demo Video Post-Processing");
  console.log(`   Frames: ${FRAMES_DIR}`);
  console.log(`   Output: ${OUTPUT}`);
  console.log(`   FPS: ${FPS}`);
  console.log(`   Resolution: ${WIDTH}x${HEIGHT}`);
  if (BGM_PATH) console.log(`   BGM: ${BGM_PATH}`);
  console.log("");

  // Check prerequisites
  if (!checkFfmpeg()) {
    console.error("❌ ffmpeg not found. Install with: sudo apt install ffmpeg");
    process.exit(1);
  }

  if (!existsSync(FRAMES_DIR)) {
    console.error(`❌ Frames directory not found: ${FRAMES_DIR}`);
    console.error("   Run record-demo.mjs first to capture frames.");
    process.exit(1);
  }

  const frames = readdirSync(FRAMES_DIR).filter((f) => f.endsWith(".png")).sort();
  if (frames.length === 0) {
    console.error("❌ No PNG frames found in frames directory.");
    process.exit(1);
  }
  console.log(`📸 Found ${frames.length} frames`);

  const outputDir = dirname(OUTPUT);
  const rawVideo = join(outputDir, "demo-raw-assembled.mp4");
  const withBlack = join(outputDir, "demo-with-black.mp4");
  const withVignette = join(outputDir, "demo-with-vignette.mp4");
  const posterPath = join(outputDir, basename(OUTPUT, ".mp4") + "-poster.jpg");

  // Step 1: Assemble frames into raw video
  console.log("\n📹 Step 1: Assembling frames...");
  run(
    `ffmpeg -y -framerate ${FPS} -i "${FRAMES_DIR}/frame-%06d.png" -c:v libx264 -pix_fmt yuv420p -preset fast -crf 18 "${rawVideo}"`,
    "Frame assembly"
  );

  // Step 2: Add 2s black intro + 2s black outro
  console.log("\n🎬 Step 2: Adding black intro/outro...");
  run(
    `ffmpeg -y -f lavfi -i "color=c=black:s=${WIDTH}x${HEIGHT}:d=2:r=${FPS}" -i "${rawVideo}" -f lavfi -i "color=c=black:s=${WIDTH}x${HEIGHT}:d=2:r=${FPS}" -filter_complex "[0:v][1:v][2:v]concat=n=3:v=1:a=0[out]" -map "[out]" -c:v libx264 -pix_fmt yuv420p -preset fast -crf 18 "${withBlack}"`,
    "Black intro/outro"
  );

  // Step 3: Apply subtle vignette
  console.log("\n🎨 Step 3: Applying vignette...");
  run(
    `ffmpeg -y -i "${withBlack}" -vf "vignette=PI/5" -c:v libx264 -pix_fmt yuv420p -preset fast -crf 18 "${withVignette}"`,
    "Vignette overlay"
  );

  // Step 4: Final encode with optional BGM
  console.log("\n🔧 Step 4: Final encoding (web-optimized)...");
  if (BGM_PATH && existsSync(BGM_PATH)) {
    run(
      `ffmpeg -y -i "${withVignette}" -i "${BGM_PATH}" -c:v libx264 -pix_fmt yuv420p -preset slow -crf 20 -movflags +faststart -c:a aac -b:a 128k -shortest "${OUTPUT}"`,
      "Final encode with BGM"
    );
  } else {
    run(
      `ffmpeg -y -i "${withVignette}" -c:v libx264 -pix_fmt yuv420p -preset slow -crf 20 -movflags +faststart -an "${OUTPUT}"`,
      "Final encode (no audio)"
    );
  }

  // Step 5: Generate poster frame
  console.log("\n🖼️ Step 5: Generating poster frame...");
  // Get video duration
  const durationOutput = execSync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${OUTPUT}"`,
    { encoding: "utf-8" }
  ).trim();
  const duration = parseFloat(durationOutput);
  const posterTime = duration * 0.5; // 50% mark

  run(
    `ffmpeg -y -ss ${posterTime} -i "${OUTPUT}" -vframes 1 -q:v 2 "${posterPath}"`,
    "Poster frame extraction"
  );

  // Cleanup intermediate files
  console.log("\n🧹 Cleaning up intermediate files...");
  try {
    execSync(`rm -f "${rawVideo}" "${withBlack}" "${withVignette}"`, { stdio: "pipe" });
  } catch {
    // Non-critical
  }

  // Summary
  const stats = execSync(
    `ffprobe -v error -show_entries format=duration,size -of json "${OUTPUT}"`,
    { encoding: "utf-8" }
  );
  const info = JSON.parse(stats);
  const fileSizeMB = (parseInt(info.format.size, 10) / (1024 * 1024)).toFixed(1);
  const videoDuration = parseFloat(info.format.duration).toFixed(1);

  console.log("\n✅ Post-processing complete!");
  console.log(`   📹 Video: ${OUTPUT} (${fileSizeMB} MB, ${videoDuration}s)`);
  console.log(`   🖼️ Poster: ${posterPath}`);
  console.log("");
  console.log("Next steps:");
  console.log("  1. Upload to Cloudflare Stream (or use the admin dashboard)");
  console.log("  2. Set the stream ID in platform_config via admin panel");
  console.log("  3. The landing page will automatically use the new video");
}

main().catch((err) => {
  console.error("❌ Post-processing failed:", err);
  process.exit(1);
});
