/**
 * V1 — Vidu Q3 Silent-Slice Style Validation
 * 
 * Tests Vidu Q3 (fal-ai/vidu/q3/image-to-video) on two representative slices:
 *   - Slice 1: establishing wide aerial (Neo-Kyoto sunrise)
 *   - Slice 11: action tracking (Mira running)
 * 
 * Both at 720p, audio disabled, 5s duration to keep cost ~$1.54.
 * Gates M1 (Vidu Q3 silent-slice migration).
 * 
 * Run: npx tsx server/benchmarks/validation/v1-vidu-q3-silent.ts
 */

import { fal } from "@fal-ai/client";
import fs from "fs";

// Configure fal with API key
fal.config({
  credentials: process.env.FAL_API_KEY || process.env.FAL_KEY || "",
});

const MODEL_ID = "fal-ai/vidu/q3/image-to-video";

interface TestCase {
  name: string;
  sliceId: number;
  type: string;
  prompt: string;
  referenceImage: string;
  duration: number;
}

const tests: TestCase[] = [
  {
    name: "V1a: Establishing wide aerial (slice 1)",
    sliceId: 1,
    type: "silent_establishing",
    prompt: "Wide aerial view of Neo-Kyoto bay at sunrise, neon-lit skyscrapers reflected in dark harbour water, traditional pagoda silhouette among towers, cargo drones crossing the sky. Heavy morning mist, pink and amber light. Cinematic 2D anime style.",
    referenceImage: "https://v3b.fal.media/files/b/0a97979c/E9aHKLDnuuvq1jeVat1tD.jpg",
    duration: 5,
  },
  {
    name: "V1b: Action tracking (slice 11)",
    sliceId: 11,
    type: "silent_action",
    prompt: "Mira runs through the underground passage, her mechanical left arm glowing amber, silver-white hair streaming behind her. Camera follows from behind. Speed lines, motion blur. Cinematic 2D anime style.",
    referenceImage: "https://v3b.fal.media/files/b/0a97979d/HmWILzW2sq0-ep0H_R_0b.jpg",
    duration: 5,
  },
];

async function runTest(test: TestCase): Promise<{ pass: boolean; url?: string; error?: string; durationMs: number }> {
  console.log(`\n--- ${test.name} ---`);
  console.log(`  Model: ${MODEL_ID}`);
  console.log(`  Duration: ${test.duration}s, Resolution: 720p, Audio: false`);
  console.log(`  Prompt: ${test.prompt.slice(0, 80)}...`);
  console.log(`  Reference: ${test.referenceImage}`);

  const start = Date.now();
  try {
    const result = await fal.subscribe(MODEL_ID, {
      input: {
        prompt: test.prompt,
        image_url: test.referenceImage,
        duration: test.duration,
        resolution: "720p",
        audio: false,
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
          const msgs = update.logs?.map((l: any) => l.message) || [];
          if (msgs.length > 0) console.log(`  [progress] ${msgs[msgs.length - 1]}`);
        }
      },
    });

    const elapsed = Date.now() - start;
    const videoUrl = (result.data as any)?.video?.url;

    if (videoUrl) {
      console.log(`  ✅ PASS — ${(elapsed / 1000).toFixed(1)}s`);
      console.log(`  Video: ${videoUrl}`);
      return { pass: true, url: videoUrl, durationMs: elapsed };
    } else {
      console.log(`  ❌ FAIL — No video URL in response`);
      console.log(`  Response: ${JSON.stringify(result.data).slice(0, 200)}`);
      return { pass: false, error: "No video URL", durationMs: elapsed };
    }
  } catch (err: any) {
    const elapsed = Date.now() - start;
    console.log(`  ❌ FAIL — ${err.message || err}`);
    if (err.body) console.log(`  Body: ${JSON.stringify(err.body).slice(0, 300)}`);
    return { pass: false, error: err.message || String(err), durationMs: elapsed };
  }
}

async function main() {
  console.log("=== V1: Vidu Q3 Silent-Slice Style Validation ===");
  console.log(`Model: ${MODEL_ID}`);
  console.log(`Tests: ${tests.length}`);
  console.log(`Estimated cost: ~$1.54 (2 × 5s × $0.154/sec at 720p)`);
  console.log(`Started: ${new Date().toISOString()}\n`);

  const results: Array<{ name: string; pass: boolean; url?: string; error?: string; durationMs: number }> = [];

  for (const test of tests) {
    const result = await runTest(test);
    results.push({ name: test.name, ...result });
  }

  // Summary
  console.log("\n=== V1 SUMMARY ===");
  const allPass = results.every((r) => r.pass);
  for (const r of results) {
    const status = r.pass ? "✅ PASS" : "❌ FAIL";
    console.log(`  ${r.name}: ${status} (${(r.durationMs / 1000).toFixed(1)}s)`);
    if (r.url) console.log(`    → ${r.url}`);
    if (r.error) console.log(`    → Error: ${r.error}`);
  }

  console.log(`\nOverall: ${allPass ? "✅ ALL PASS — M1 migration is GO" : "❌ SOME FAILED — M1 migration BLOCKED"}`);
  console.log(`Finished: ${new Date().toISOString()}`);

  // Write results to file
  const report = {
    test: "V1-Vidu-Q3-Silent",
    model: MODEL_ID,
    timestamp: new Date().toISOString(),
    allPass,
    gatesM1: allPass,
    results: results.map((r) => ({
      name: r.name,
      pass: r.pass,
      url: r.url,
      error: r.error,
      wallClockMs: r.durationMs,
    })),
  };
  fs.writeFileSync("/home/ubuntu/v1-vidu-q3-results.json", JSON.stringify(report, null, 2));
  console.log("\nResults saved to /home/ubuntu/v1-vidu-q3-results.json");
}

main().catch(console.error);
