/**
 * Phase 0 Validation — V1, V2, V3, V4
 *
 * Runs four mandatory tests before any P10 ticket implementation:
 *   V1: Wan 2.7 silent generation (verify model + pricing)
 *   V2: Wan 2.7 audio_url dialogue lipsync (make-or-break)
 *   V3: Wan 2.7 content filter on slice 13
 *   V4: Veo 3.1 Lite anime quality test
 *
 * Usage: npx tsx server/benchmarks/validation/phase0-validate.ts
 */

import { fal } from "@fal-ai/client";
import { storagePut } from "../../storage.js";
import { elevenLabsTTS } from "../providers/api-clients.js";
import * as fs from "fs";
import * as path from "path";

// ─── Configuration ─────────────────────────────────────────────────────────

const RESULTS_DIR = path.join(import.meta.dirname!, "results");

// Reference images from v3 fixture
const ESTABLISHING_REF = "https://v3b.fal.media/files/b/0a97979c/E9aHKLDnuuvq1jeVat1tD.jpg";
const DIALOGUE_REF = "https://v3b.fal.media/files/b/0a97979c/GSxYn68gkCzZS2hnJCabw.jpg";
const ACTION_V3_REF = "https://v3b.fal.media/files/b/0a97a49d/v8Y5gJLELw9WkJN2QaLc9.jpg";

// Prompts from v3 fixture
const ESTABLISHING_PROMPT = "Wide aerial view of Neo-Kyoto bay at sunrise, neon-lit skyscrapers reflected in dark harbour water, traditional pagoda silhouette among towers, cargo drones crossing the sky. Heavy morning mist, pink and amber light. Cinematic 2D anime establishing shot, ultra-detailed backgrounds, Makoto Shinkai lighting.";

const DIALOGUE_PROMPT = "Close-up of a young woman with silver hair and glowing blue eyes, mechanical left arm with amber energy lines, speaking with determined expression. Neon-lit city street background, soft bokeh lights. Cinematic 2D anime style, detailed character animation.";

const SLICE_13_PROMPT = "Ren channels intense cyan energy through his outstretched hands in a dramatic arc. Mira raises her mechanical left arm, which radiates a powerful amber energy shield, meeting the energy blast. Cyan and amber light bursts radiate from the point of contact. Radial manga speed lines, shockwave ring. Neo-Kyoto rooftop at night, city lights below.";

const DIALOGUE_TEXT = "Today is the day everything changes. I can feel it.";

// ─── Helpers ───────────────────────────────────────────────────────────────

function ensureFalConfigured(): void {
  const key = process.env.FAL_API_KEY;
  if (!key) throw new Error("FAL_API_KEY not set");
  fal.config({ credentials: key });
}

function log(test: string, msg: string): void {
  console.log(`[${test}] ${msg}`);
}

interface ValidationResult {
  test: string;
  status: "PASS" | "FAIL" | "SKIP";
  videoUrl?: string;
  audioUrl?: string;
  costPerSecond?: number;
  generationTimeMs?: number;
  error?: string;
  notes?: string;
}

// ─── V1: Wan 2.7 Silent Generation ────────────────────────────────────────

async function runV1(): Promise<ValidationResult> {
  log("V1", "Starting Wan 2.7 silent generation test...");
  const start = Date.now();

  try {
    const input: Record<string, unknown> = {
      prompt: ESTABLISHING_PROMPT,
      image_url: ESTABLISHING_REF,
      resolution: "720p",
      duration: 5,
      aspect_ratio: "16:9",
      negative_prompt: "low resolution, error, worst quality, low quality, defects, blurry",
      enable_prompt_expansion: false,
      enable_safety_checker: false,
    };

    log("V1", "Calling fal-ai/wan/v2.7/image-to-video (silent, 5s, 720p)...");
    const result = await fal.subscribe("fal-ai/wan/v2.7/image-to-video" as any, {
      input: input as any,
      logs: true,
      pollInterval: 5000,
    });

    const video = (result.data as any)?.video;
    if (!video?.url) throw new Error("Wan 2.7 returned no video");

    const elapsed = Date.now() - start;
    log("V1", `SUCCESS — video: ${video.url}`);
    log("V1", `Generation time: ${(elapsed / 1000).toFixed(1)}s`);

    // Download and save locally
    const resp = await fetch(video.url);
    const buf = Buffer.from(await resp.arrayBuffer());
    fs.writeFileSync(path.join(RESULTS_DIR, "v1-output.mp4"), buf);

    return {
      test: "V1",
      status: "PASS",
      videoUrl: video.url,
      generationTimeMs: elapsed,
      costPerSecond: 0.10, // List price — actual billing to be checked on dashboard
      notes: "Wan 2.7 silent generation successful. Check fal.ai dashboard for actual billed amount.",
    };
  } catch (err: any) {
    log("V1", `FAILED — ${err.message}`);
    return { test: "V1", status: "FAIL", error: err.message, generationTimeMs: Date.now() - start };
  }
}

// ─── V2: Wan 2.7 audio_url Dialogue Lipsync ──────────────────────────────

async function runV2(): Promise<ValidationResult> {
  log("V2", "Starting Wan 2.7 audio_url dialogue lipsync test...");
  const start = Date.now();

  try {
    // Step 1: Generate TTS audio via ElevenLabs
    log("V2", "Generating TTS audio via ElevenLabs...");
    const ttsResult = await elevenLabsTTS({
      text: DIALOGUE_TEXT,
      voiceId: "EXAVITQu4vr4xnSDxMaL", // Sarah voice (Mira)
    });
    log("V2", `TTS done: ${ttsResult.url}`);

    // Step 2: Generate video with audio_url
    log("V2", "Calling fal-ai/wan/v2.7/image-to-video with audio_url...");
    const input: Record<string, unknown> = {
      prompt: DIALOGUE_PROMPT,
      image_url: DIALOGUE_REF,
      audio_url: ttsResult.url,
      resolution: "720p",
      duration: 5,
      aspect_ratio: "16:9",
      negative_prompt: "low resolution, error, worst quality, low quality, defects, blurry",
      enable_prompt_expansion: false,
      enable_safety_checker: false,
    };

    const result = await fal.subscribe("fal-ai/wan/v2.7/image-to-video" as any, {
      input: input as any,
      logs: true,
      pollInterval: 5000,
    });

    const video = (result.data as any)?.video;
    if (!video?.url) throw new Error("Wan 2.7 returned no video with audio_url");

    const elapsed = Date.now() - start;
    log("V2", `SUCCESS — video: ${video.url}`);
    log("V2", `Total time (TTS + video): ${(elapsed / 1000).toFixed(1)}s`);

    // Download and save locally
    const resp = await fetch(video.url);
    const buf = Buffer.from(await resp.arrayBuffer());
    fs.writeFileSync(path.join(RESULTS_DIR, "v2-output.mp4"), buf);

    return {
      test: "V2",
      status: "PASS",
      videoUrl: video.url,
      audioUrl: ttsResult.url,
      generationTimeMs: elapsed,
      notes: "Wan 2.7 audio_url dialogue generation successful. Review video for lipsync quality.",
    };
  } catch (err: any) {
    log("V2", `FAILED — ${err.message}`);
    return { test: "V2", status: "FAIL", error: err.message, generationTimeMs: Date.now() - start };
  }
}

// ─── V3: Wan 2.7 Content Filter on Slice 13 ──────────────────────────────

async function runV3(): Promise<ValidationResult> {
  log("V3", "Starting Wan 2.7 content filter test on slice 13...");
  const start = Date.now();

  try {
    const input: Record<string, unknown> = {
      prompt: SLICE_13_PROMPT,
      image_url: ACTION_V3_REF,
      resolution: "720p",
      duration: 5,
      aspect_ratio: "16:9",
      negative_prompt: "low resolution, error, worst quality, low quality, defects, blurry",
      enable_prompt_expansion: false,
      enable_safety_checker: false,
    };

    log("V3", "Calling fal-ai/wan/v2.7/image-to-video with slice 13 prompt...");
    const result = await fal.subscribe("fal-ai/wan/v2.7/image-to-video" as any, {
      input: input as any,
      logs: true,
      pollInterval: 5000,
    });

    const video = (result.data as any)?.video;
    if (!video?.url) throw new Error("Wan 2.7 returned no video for slice 13");

    const elapsed = Date.now() - start;
    log("V3", `SUCCESS — slice 13 prompt PASSED content filter`);
    log("V3", `Video: ${video.url}`);

    // Download and save locally
    const resp = await fetch(video.url);
    const buf = Buffer.from(await resp.arrayBuffer());
    fs.writeFileSync(path.join(RESULTS_DIR, "v3-output.mp4"), buf);

    return {
      test: "V3",
      status: "PASS",
      videoUrl: video.url,
      generationTimeMs: elapsed,
      notes: "Slice 13 v3 prompt passes Wan 2.7 content filter unchanged.",
    };
  } catch (err: any) {
    const isContentFilter = err.message?.includes("content") ||
      err.message?.includes("safety") ||
      err.message?.includes("moderation") ||
      err.message?.includes("Unprocessable");
    log("V3", `FAILED — ${err.message}`);
    return {
      test: "V3",
      status: "FAIL",
      error: err.message,
      generationTimeMs: Date.now() - start,
      notes: isContentFilter
        ? "Content filter triggered. Need to revise slice 13 prompt for Wan 2.7."
        : "Non-content-filter error. Investigate.",
    };
  }
}

// ─── V4: Veo 3.1 Lite Anime Quality ──────────────────────────────────────

async function runV4(): Promise<ValidationResult> {
  log("V4", "Starting Veo 3.1 Lite anime quality test...");
  const start = Date.now();

  try {
    // First generate TTS audio (reuse from V2 if available, or generate fresh)
    log("V4", "Generating TTS audio via ElevenLabs...");
    const ttsResult = await elevenLabsTTS({
      text: DIALOGUE_TEXT,
      voiceId: "EXAVITQu4vr4xnSDxMaL", // Sarah voice (Mira)
    });
    log("V4", `TTS done: ${ttsResult.url}`);

    log("V4", "Calling fal-ai/veo3.1/lite/image-to-video with native audio...");
    const input: Record<string, unknown> = {
      prompt: DIALOGUE_PROMPT,
      image_url: DIALOGUE_REF,
      duration: "8s",
      aspect_ratio: "16:9",
      resolution: "720p",
      generate_audio: true,
      safety_tolerance: "4",
    };

    const result = await fal.subscribe("fal-ai/veo3.1/lite/image-to-video" as any, {
      input: input as any,
      logs: true,
      pollInterval: 5000,
    });

    const video = (result.data as any)?.video;
    if (!video?.url) throw new Error("Veo 3.1 Lite returned no video");

    const elapsed = Date.now() - start;
    log("V4", `SUCCESS — video: ${video.url}`);
    log("V4", `Total time (TTS + video): ${(elapsed / 1000).toFixed(1)}s`);

    // Download and save locally
    const resp = await fetch(video.url);
    const buf = Buffer.from(await resp.arrayBuffer());
    fs.writeFileSync(path.join(RESULTS_DIR, "v4-output.mp4"), buf);

    return {
      test: "V4",
      status: "PASS",
      videoUrl: video.url,
      audioUrl: ttsResult.url,
      generationTimeMs: elapsed,
      notes: "Veo 3.1 Lite generated dialogue clip with native audio. Review for anime fidelity. TTS audio saved separately for comparison.",
    };
  } catch (err: any) {
    log("V4", `FAILED — ${err.message}`);
    return { test: "V4", status: "FAIL", error: err.message, generationTimeMs: Date.now() - start };
  }
}

// ─── Main Runner ──────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  P10 Phase 0 Validation — V1, V2, V3, V4");
  console.log("═══════════════════════════════════════════════════════════════\n");

  ensureFalConfigured();
  fs.mkdirSync(RESULTS_DIR, { recursive: true });

  const results: ValidationResult[] = [];
  const totalStart = Date.now();

  // Run all four tests sequentially
  results.push(await runV1());
  console.log("");
  results.push(await runV2());
  console.log("");
  results.push(await runV3());
  console.log("");
  results.push(await runV4());
  console.log("");

  // Summary
  const totalTime = ((Date.now() - totalStart) / 1000 / 60).toFixed(1);
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  VALIDATION SUMMARY");
  console.log("═══════════════════════════════════════════════════════════════");
  for (const r of results) {
    const icon = r.status === "PASS" ? "✓" : r.status === "FAIL" ? "✗" : "○";
    console.log(`  ${icon} ${r.test}: ${r.status}${r.error ? ` — ${r.error.slice(0, 80)}` : ""}`);
    if (r.notes) console.log(`    → ${r.notes}`);
  }
  console.log(`\n  Total wall-clock: ${totalTime} min`);

  // Determine dialogue routing recommendation
  const v2Pass = results.find(r => r.test === "V2")?.status === "PASS";
  const v4Pass = results.find(r => r.test === "V4")?.status === "PASS";

  console.log("\n  DIALOGUE ROUTING RECOMMENDATION:");
  if (v4Pass) {
    console.log("  → Veo 3.1 Lite as DEFAULT dialogue provider ($0.05/sec)");
    console.log("    (Review V4 output for anime fidelity before confirming)");
  } else if (v2Pass) {
    console.log("  → Wan 2.7 with audio_url as DEFAULT dialogue provider ($0.10/sec)");
    console.log("    (Veo 3.1 Lite failed or unavailable)");
  } else {
    console.log("  → MIGRATION BLOCKED — neither Wan 2.7 audio_url nor Veo 3.1 Lite works");
    console.log("    (Fall back to P9 Hedra + Kling chain)");
  }

  // Save results JSON
  const resultsFile = path.join(RESULTS_DIR, "phase0-results.json");
  fs.writeFileSync(resultsFile, JSON.stringify({ results, totalTimeMin: totalTime }, null, 2));
  console.log(`\n  Results saved to: ${resultsFile}`);
  console.log("═══════════════════════════════════════════════════════════════");
}

main().catch((err) => {
  console.error("Phase 0 validation crashed:", err);
  process.exit(1);
});
