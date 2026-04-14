#!/usr/bin/env node
/**
 * Demo Video Recording Script
 * 
 * Uses Puppeteer to capture the /demo-recording page as a video.
 * Requires: puppeteer, ffmpeg
 * 
 * Usage:
 *   node scripts/record-demo.mjs --url https://your-site.com --output demo-raw.webm
 *   node scripts/record-demo.mjs --url http://localhost:3000 --output demo-raw.webm --session-cookie "..."
 * 
 * The script:
 * 1. Opens /demo-recording?autoplay=true
 * 2. Waits for [data-demo-ready] attribute
 * 3. Starts Chrome DevTools Protocol screen recording
 * 4. Waits for [data-demo-complete] attribute
 * 5. Stops recording and saves the raw video
 * 
 * After recording, run the post-processing script:
 *   node scripts/process-demo.mjs --input demo-raw.webm --output demo-final.mp4
 */

import { parseArgs } from "node:util";
import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

const { values: args } = parseArgs({
  options: {
    url: { type: "string", default: "http://localhost:3000" },
    output: { type: "string", default: "demo-raw.webm" },
    "session-cookie": { type: "string", default: "" },
    width: { type: "string", default: "1920" },
    height: { type: "string", default: "1080" },
    timeout: { type: "string", default: "120000" },
  },
});

const BASE_URL = args.url;
const OUTPUT_PATH = args.output;
const SESSION_COOKIE = args["session-cookie"];
const WIDTH = parseInt(args.width, 10);
const HEIGHT = parseInt(args.height, 10);
const TIMEOUT = parseInt(args.timeout, 10);

async function main() {
  console.log("🎬 Demo Video Recording Script");
  console.log(`   URL: ${BASE_URL}/demo-recording?autoplay=true`);
  console.log(`   Output: ${OUTPUT_PATH}`);
  console.log(`   Resolution: ${WIDTH}x${HEIGHT}`);
  console.log("");

  // Dynamic import puppeteer
  let puppeteer;
  try {
    puppeteer = await import("puppeteer");
  } catch {
    console.error("❌ Puppeteer not installed. Run: pnpm add -D puppeteer");
    process.exit(1);
  }

  const browser = await puppeteer.default.launch({
    headless: "new",
    args: [
      `--window-size=${WIDTH},${HEIGHT}`,
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT });

  // Set session cookie if provided (for admin access)
  if (SESSION_COOKIE) {
    const url = new URL(BASE_URL);
    await page.setCookie({
      name: "app_session_id",
      value: SESSION_COOKIE,
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      secure: url.protocol === "https:",
      sameSite: "None",
    });
    console.log("🔑 Session cookie set");
  }

  // Navigate to the recording page
  const recordingUrl = `${BASE_URL}/demo-recording?autoplay=true`;
  console.log(`📄 Navigating to ${recordingUrl}...`);
  await page.goto(recordingUrl, { waitUntil: "networkidle2", timeout: 30000 });

  // Wait for the page to be ready
  console.log("⏳ Waiting for demo assets to load...");
  await page.waitForSelector("[data-demo-ready]", { timeout: TIMEOUT });
  console.log("✅ Demo page ready");

  // Start screen recording via CDP
  const client = await page.createCDPSession();

  // Use Page.startScreencast for frame-by-frame capture
  const frames = [];
  let frameCount = 0;

  await client.send("Page.startScreencast", {
    format: "png",
    quality: 100,
    maxWidth: WIDTH,
    maxHeight: HEIGHT,
    everyNthFrame: 1,
  });

  client.on("Page.screencastFrame", async (event) => {
    frames.push(Buffer.from(event.data, "base64"));
    frameCount++;
    await client.send("Page.screencastFrameAck", {
      sessionId: event.sessionId,
    });
  });

  console.log("🎥 Recording started...");

  // Wait for demo to complete
  try {
    await page.waitForSelector("[data-demo-complete]", { timeout: TIMEOUT });
    console.log("✅ Demo playback complete");
  } catch {
    console.warn("⚠️ Demo did not complete within timeout, saving what we have");
  }

  // Stop recording
  await client.send("Page.stopScreencast");
  console.log(`📸 Captured ${frameCount} frames`);

  // Save frames to temporary directory
  const framesDir = join(dirname(OUTPUT_PATH), "demo-frames");
  await mkdir(framesDir, { recursive: true });

  for (let i = 0; i < frames.length; i++) {
    const framePath = join(framesDir, `frame-${String(i).padStart(6, "0")}.png`);
    await writeFile(framePath, frames[i]);
  }

  console.log(`💾 Frames saved to ${framesDir}/`);
  console.log("");
  console.log("Next step: Run the post-processing script:");
  console.log(`  node scripts/process-demo.mjs --frames-dir ${framesDir} --output ${OUTPUT_PATH}`);

  await browser.close();
}

main().catch((err) => {
  console.error("❌ Recording failed:", err);
  process.exit(1);
});
