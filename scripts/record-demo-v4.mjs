#!/usr/bin/env node
/**
 * Demo Video V4 Recording Script
 * 
 * Uses Puppeteer to capture the /demo-recording page frame-by-frame,
 * then assembles into a video with ffmpeg.
 */

import puppeteer from "puppeteer";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const BASE_URL = "http://localhost:3000";
const WIDTH = 1920;
const HEIGHT = 1080;
const FRAMES_DIR = "/home/ubuntu/webdev-static-assets/video-assets/v4-frames";
const OUTPUT_RAW = "/home/ubuntu/webdev-static-assets/video-assets/v4-raw-screencast.mp4";
const TIMEOUT = 150000; // 150s total timeout

async function main() {
  console.log("🎬 Demo Video V4 Recording Script");
  console.log(`   URL: ${BASE_URL}/demo-recording?autoplay=true`);
  console.log(`   Resolution: ${WIDTH}x${HEIGHT}`);
  console.log("");

  // Clean up old frames
  try { await rm(FRAMES_DIR, { recursive: true }); } catch {}
  await mkdir(FRAMES_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      `--window-size=${WIDTH},${HEIGHT}`,
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-web-security",
      "--force-device-scale-factor=1",
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });

  // Navigate to the recording page
  const recordingUrl = `${BASE_URL}/demo-recording?autoplay=true`;
  console.log(`📄 Navigating to ${recordingUrl}...`);
  await page.goto(recordingUrl, { waitUntil: "networkidle2", timeout: 30000 });

  // Wait for the page to be ready (assets loaded)
  console.log("⏳ Waiting for demo assets to load...");
  try {
    await page.waitForSelector("[data-demo-ready]", { timeout: 30000 });
    console.log("✅ Demo page ready");
  } catch {
    console.log("⚠️ data-demo-ready not found, proceeding anyway (assets may load lazily)");
  }

  // Wait for images to preload and autoplay to kick in
  console.log("\u23F3 Waiting 8s for image preload + autoplay...");
  await new Promise(r => setTimeout(r, 8000));

  // Start frame-by-frame capture using CDP screencast
  const client = await page.createCDPSession();
  const frames = [];
  let frameCount = 0;

  await client.send("Page.startScreencast", {
    format: "jpeg",
    quality: 90,
    maxWidth: WIDTH,
    maxHeight: HEIGHT,
    everyNthFrame: 1,
  });

  client.on("Page.screencastFrame", async (event) => {
    frames.push(Buffer.from(event.data, "base64"));
    frameCount++;
    if (frameCount % 30 === 0) {
      process.stdout.write(`\r   📸 Captured ${frameCount} frames...`);
    }
    await client.send("Page.screencastFrameAck", {
      sessionId: event.sessionId,
    });
  });

  console.log("🎥 Recording started...");

  // Wait for demo to complete
  try {
    await page.waitForSelector("[data-demo-complete]", { timeout: TIMEOUT });
    console.log("\n✅ Demo playback complete");
  } catch {
    console.warn("\n⚠️ Demo did not complete within timeout, saving what we have");
  }

  // Wait a bit more to capture the final frame
  await new Promise(r => setTimeout(r, 2000));

  // Stop recording
  await client.send("Page.stopScreencast");
  console.log(`📸 Total captured: ${frameCount} frames`);

  // Save frames to disk
  console.log("💾 Saving frames to disk...");
  for (let i = 0; i < frames.length; i++) {
    const framePath = join(FRAMES_DIR, `frame-${String(i).padStart(6, "0")}.jpg`);
    await writeFile(framePath, frames[i]);
  }
  console.log(`💾 ${frames.length} frames saved to ${FRAMES_DIR}/`);

  await browser.close();

  // Calculate approximate FPS from frame count and expected duration
  // The demo is ~94s (90s + 4s buffer), CDP screencast typically captures at ~15-30fps
  const estimatedDuration = 94; // seconds
  const fps = Math.round(frames.length / estimatedDuration);
  console.log(`📊 Estimated FPS: ${fps} (${frames.length} frames / ${estimatedDuration}s)`);

  // Assemble frames into video using ffmpeg
  console.log("🎞️ Assembling video with ffmpeg...");
  const { execSync } = await import("node:child_process");
  
  const ffmpegCmd = `ffmpeg -y -framerate ${fps} -i "${FRAMES_DIR}/frame-%06d.jpg" -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -vf "scale=${WIDTH}:${HEIGHT}" "${OUTPUT_RAW}"`;
  
  try {
    execSync(ffmpegCmd, { stdio: "inherit", timeout: 120000 });
    console.log(`\n✅ Raw video saved: ${OUTPUT_RAW}`);
  } catch (err) {
    console.error("❌ ffmpeg assembly failed:", err.message);
    process.exit(1);
  }

  // Verify output
  try {
    const probeCmd = `ffprobe -v error -show_entries format=duration -of csv=p=0 "${OUTPUT_RAW}"`;
    const duration = execSync(probeCmd, { encoding: "utf-8" }).trim();
    console.log(`📏 Raw video duration: ${duration}s`);
  } catch {}

  console.log("\n🎬 Recording complete!");
  console.log("Next: Run post-processing to add narration + BGM");
}

main().catch((err) => {
  console.error("❌ Recording failed:", err);
  process.exit(1);
});
