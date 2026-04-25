/**
 * Benchmark CLI Entry Point
 *
 * Usage:
 *   npx tsx server/benchmarks/run_all.ts [ticket]
 *
 * Examples:
 *   npx tsx server/benchmarks/run_all.ts B1       # Run single-layer Kling Omni benchmark
 *   npx tsx server/benchmarks/run_all.ts B6       # Run TTS benchmark
 *   npx tsx server/benchmarks/run_all.ts P1       # Run Kling Omni end-to-end pipeline
 *   npx tsx server/benchmarks/run_all.ts all      # Run all benchmarks sequentially
 *   npx tsx server/benchmarks/run_all.ts report   # Generate report from existing data
 *   npx tsx server/benchmarks/run_all.ts check    # Check which provider credentials are available
 */

import { checkProviderCredentials } from "./providers/registry.js";
import { runB1, runB2, runB3, runB3b, runB4, runB5, runB6, runB7 } from "./runners/single-layer.js";
import { runP1, runP2, runP2b, runP3, runP3b, runP4, runP5, runP6, runP7, runP8, runP9, runP10, runP11, runP12 } from "./pipelines/end-to-end.js";
import { generateFullReport, printSummaryTable } from "./report/cost-assessment.js";
import shotsFixture from "./fixtures/shots.json" with { type: "json" };
import pilotScript from "./fixtures/pilot-3min-script.json" with { type: "json" };
import pilotScript16x9 from "./fixtures/pilot-3min-script-16x9.json" with { type: "json" };
import pilotScript16x9v2 from "./fixtures/pilot-3min-script-16x9-v2.json" with { type: "json" };
import pilotScript16x9v3 from "./fixtures/pilot-3min-script-16x9-v3.json" with { type: "json" };
import pilotScript16x9v5 from "./fixtures/pilot-3min-script-16x9-v5.json" with { type: "json" };

const TICKET = process.argv[2]?.toUpperCase() ?? "HELP";

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║     AWAKLI COST BENCHMARK RUNNER v1.0           ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  switch (TICKET) {
    case "CHECK": {
      console.log("Checking provider credentials...\n");
      const creds = checkProviderCredentials();
      for (const [id, available] of Object.entries(creds)) {
        console.log(`  ${available ? "✓" : "✗"} ${id}`);
      }
      const ready = Object.values(creds).filter(Boolean).length;
      console.log(`\n${ready}/${Object.keys(creds).length} providers configured.`);
      break;
    }

    case "B1": {
      console.log("Running B1: Kling V3 Omni — 3 shots × 3 providers...\n");
      const result = await runB1(shotsFixture.shots as any);
      console.log(result.summary);
      break;
    }

    case "B2": {
      console.log("Running B2: Kling V3 Standard silent — 2 shots...\n");
      const result = await runB2(shotsFixture.shots as any);
      console.log(result.summary);
      break;
    }

    case "B3": {
      console.log("Running B3: Wan 2.2 silent — 2 shots × 2 providers...\n");
      const result = await runB3(shotsFixture.shots as any);
      console.log(result.summary);
      break;
    }

    case "B3B": {
      console.log("Running B3b: Wan 2.5 silent — 2 shots via fal.ai (1080p)...\n");
      const result = await runB3b(shotsFixture.shots as any);
      console.log(result.summary);
      break;
    }

    case "B4": {
      console.log("Running B4: Hunyuan Video silent + LoRA training...\n");
      const result = await runB4(shotsFixture.shots as any);
      console.log(result.summary);
      break;
    }

    case "B5": {
      console.log("Running B5: Hedra Character-3 dialogue...\n");
      const result = await runB5(shotsFixture.shots as any);
      console.log(result.summary);
      break;
    }

    case "B6": {
      console.log("Running B6: TTS benchmark (ElevenLabs, Cartesia, OpenAI)...\n");
      const dialogueText = "I finally understand why you came back. Today is the day everything changes. I can feel it.";
      const result = await runB6(dialogueText);
      console.log(`B6 complete: ${result.results.filter((r) => r.status === "success").length}/${result.results.length} providers, $${result.totalCost.toFixed(4)} total`);
      break;
    }

    case "B7": {
      console.log("Running B7: Lipsync comparison (LatentSync, MuseTalk, Kling)...\n");
      // B7 requires a pre-generated silent video URL and dialogue audio URL
      const silentVideoUrl = process.env.B7_SILENT_VIDEO_URL ?? "";
      const dialogueAudioUrl = process.env.B7_DIALOGUE_AUDIO_URL ?? "";
      if (!silentVideoUrl || !dialogueAudioUrl) {
        console.error("B7 requires B7_SILENT_VIDEO_URL and B7_DIALOGUE_AUDIO_URL env vars.");
        console.error("Run B2 and B6 first to generate these assets.");
        break;
      }
      const dialogueShot = shotsFixture.shots.find((s) => s.audio);
      if (!dialogueShot) {
        console.error("No dialogue shot found in fixtures.");
        break;
      }
      const result = await runB7(silentVideoUrl, dialogueAudioUrl, dialogueShot as any);
      console.log(result.summary);
      break;
    }

    case "P1": {
      console.log("Running P1: Kling V3 Omni end-to-end (18 slices, 3 min)...\n");
      const result = await runP1(pilotScript as any);
      console.log(`P1 complete: $${result.totalCostUsd.toFixed(2)} total, ${result.failedSlices} failed slices`);
      break;
    }

    case "P2": {
      console.log("Running P2: Decomposed Balanced (Wan 2.2 + Hedra + LatentSync)...\n");
      const result = await runP2(pilotScript as any);
      console.log(`P2 complete: $${result.totalCostUsd.toFixed(2)} total, ${result.failedSlices} failed slices`);
      break;
    }

    case "P2B": {
      console.log("Running P2b: Wan 2.5 Balanced (Wan 2.5 + Hedra + LatentSync)...\n");
      const result = await runP2b(pilotScript as any);
      console.log(`P2b complete: $${result.totalCostUsd.toFixed(2)} total, ${result.failedSlices} failed slices`);
      break;
    }

    case "P3": {
      console.log("Running P3: Decomposed Cheap (Wan 2.2 + Cartesia + MuseTalk)...\n");
      const result = await runP3(pilotScript as any);
      console.log(`P3 complete: $${result.totalCostUsd.toFixed(2)} total, ${result.failedSlices} failed slices`);
      break;
    }

    case "P3B": {
      console.log("Running P3b: Wan 2.5 Cheap (Wan 2.5 + Cartesia + MuseTalk)...\n");
      const result = await runP3b(pilotScript as any);
      console.log(`P3b complete: $${result.totalCostUsd.toFixed(2)} total, ${result.failedSlices} failed slices`);
      break;
    }

    case "P4": {
      console.log("Running P4: Decomposed Premium (Hunyuan + Hedra + Kling Lip Sync)...\n");
      const result = await runP4(pilotScript as any);
      console.log(`P4 complete: $${result.totalCostUsd.toFixed(2)} total, ${result.failedSlices} failed slices`);
      break;
    }

    case "P5": {
      console.log("Running P5: Hybrid (Kling Omni action + Wan 2.5 silent + Hedra dialogue + LatentSync)...\n");
      const result = await runP5(pilotScript as any);
      console.log(`P5 complete: $${result.totalCostUsd.toFixed(2)} total, ${result.failedSlices} failed slices`);
      break;
    }

    case "P6": {
      console.log("Running P6: All Wan 2.5 + 16:9 panels (no Kling) + Hedra dialogue + LatentSync...\n");
      const result = await runP6(pilotScript16x9 as any);
      console.log(`P6 complete: $${result.totalCostUsd.toFixed(2)} total, ${result.failedSlices} failed slices`);
      break;
    }

    case "P7": {
      console.log("Running P7: Improved Wan 2.5 — character voices (Sarah/Harry) + LatentSync S3 fix + softened prompts...\n");
      const result = await runP7(pilotScript16x9v2 as any);
      console.log(`P7 complete: $${result.totalCostUsd.toFixed(2)} total, ${result.failedSlices} failed slices`);
      break;
    }

    case "P8": {
      console.log("Running P8: Full Fix — immediate S3 re-upload + FFmpeg preprocessing + fallback lipsync + v3 action ref...\n");
      const result = await runP8(pilotScript16x9v3 as any);
      console.log(`P8 complete: $${result.totalCostUsd.toFixed(2)} total, ${result.failedSlices} failed slices`);
      break;
    }

    case "P9": {
      console.log("Running P9: Optimized — Kling-only lipsync, parallel batches, incremental CSV, reversed order...\n");
      const result = await runP9(pilotScript16x9v3 as any);
      console.log(`P9 complete: $${result.totalCostUsd.toFixed(2)} total, ${result.failedSlices} failed slices`);
      break;
    }

    case "P10": {
      console.log("Running P10: Wan 2.7 Unified + Veo 3.1 Lite Dialogue (2-stage architecture)...\n");
      const result = await runP10(pilotScript16x9v3 as any);
      console.log(`P10 complete: $${result.totalCostUsd.toFixed(2)} total, ${result.failedSlices} failed slices`);
      console.log(`  Routing: Veo 3.1 Lite primary dialogue, Wan 2.7+audio_url fallback, Wan 2.7 silent`);
      break;
    }

    case "P11": {
      console.log("Running P11: Vidu Q3 silent + Veo 3.1 Lite dialogue + Critic LLM + v5 fixture...\n");
      const result = await runP11(pilotScript16x9v5 as any);
      console.log(`P11 complete: $${result.totalCostUsd.toFixed(2)} total, ${result.failedSlices} failed slices`);
      console.log(`  Routing: Vidu Q3 primary silent (Wan 2.7 fallback), Veo 3.1 Lite dialogue, Critic LLM pre-validation`);
      break;
    }

    case "P12": {
      console.log("Running P12: Multi-LLM Orchestrated (D1 Director + D2 Prompt Engineer + D3 Critic + D4 Voice Director)...\n");
      const result = await runP12(pilotScript16x9v5 as any);
      console.log(`P12 complete: $${result.totalCostUsd.toFixed(2)} total, ${result.failedSlices} failed slices`);
      console.log(`  LLM stack: D1 Director → D2 Prompt Engineer → D3 Critic → D4 Voice Director`);
      console.log(`  Routing: Vidu Q3 silent (Wan 2.7 fallback), Veo 3.1 Lite dialogue (Wan 2.7+audio fallback)`);
      break;
    }

    case "ALL": {
      console.log("Running FULL BENCHMARK SUITE...\n");
      console.log("Phase 1: Single-layer benchmarks (B1-B7)\n");

      // B6 first (cheapest, produces audio for B5/B7)
      try {
        console.log("→ B6: TTS benchmark...");
        const b6 = await runB6("I finally understand why you came back.");
        console.log(`  ${b6.results.filter((r) => r.status === "success").length}/${b6.results.length} providers OK\n`);
      } catch (e) { console.error("  B6 failed:", e); }

      // B1-B5 + B3b in sequence
      for (const [ticket, runner] of [
        ["B1", () => runB1(shotsFixture.shots as any)],
        ["B2", () => runB2(shotsFixture.shots as any)],
        ["B3", () => runB3(shotsFixture.shots as any)],
        ["B3b", () => runB3b(shotsFixture.shots as any)],
        ["B4", () => runB4(shotsFixture.shots as any)],
        ["B5", () => runB5(shotsFixture.shots as any)],
      ] as const) {
        try {
          console.log(`→ ${ticket}...`);
          const result = await (runner as () => Promise<any>)();
          console.log(`  ${result.summary}\n`);
        } catch (e) { console.error(`  ${ticket} failed:`, e); }
      }

      console.log("\nPhase 2: End-to-end pipelines (P1-P4)\n");
      for (const [ticket, runner] of [
        ["P1", () => runP1(pilotScript as any)],
        ["P2", () => runP2(pilotScript as any)],
        ["P2b", () => runP2b(pilotScript as any)],
        ["P3", () => runP3(pilotScript as any)],
        ["P3b", () => runP3b(pilotScript as any)],
        ["P4", () => runP4(pilotScript as any)],
        ["P5", () => runP5(pilotScript as any)],
      ] as const) {
        try {
          console.log(`→ ${ticket}...`);
          const result = await (runner as () => Promise<any>)();
          console.log(`  $${result.totalCostUsd.toFixed(2)} total, ${result.failedSlices} failed\n`);
        } catch (e) { console.error(`  ${ticket} failed:`, e); }
      }

      console.log("\nPhase 3: Report generation\n");
      generateFullReport();
      printSummaryTable();
      break;
    }

    case "REPORT": {
      console.log("Generating report from existing benchmark data...\n");
      const report = generateFullReport();
      printSummaryTable();
      console.log(`\nOverall recommendation: ${report.overallRecommendation}`);
      break;
    }

    default: {
      console.log("Usage: npx tsx server/benchmarks/run_all.ts [ticket]\n");
      console.log("Available tickets:");
      console.log("  check   — Check which provider API keys are configured");
      console.log("  B1      — Kling V3 Omni (3 shots × 3 providers)");
      console.log("  B2      — Kling V3 Standard silent (2 shots)");
      console.log("  B3      — Wan 2.2 silent (2 shots × 2 providers)");
      console.log("  B3b     — Wan 2.5 silent (2 shots via fal.ai, 1080p)");
      console.log("  B4      — Hunyuan Video silent + LoRA training");
      console.log("  B5      — Hedra Character-3 dialogue");
      console.log("  B6      — TTS benchmark (ElevenLabs, Cartesia, OpenAI)");
      console.log("  B7      — Lipsync comparison (LatentSync, MuseTalk, Kling)");
      console.log("  P1      — Kling V3 Omni end-to-end (18 slices, 3 min)");
      console.log("  P2      — Decomposed Balanced (Wan 2.2 + Hedra + LatentSync)");
      console.log("  P2b     — Wan 2.5 Balanced (Wan 2.5 + Hedra + LatentSync)");
      console.log("  P3      — Decomposed Cheap (Wan 2.2 + Cartesia + MuseTalk)");
      console.log("  P3b     — Wan 2.5 Cheap (Wan 2.5 + Cartesia + MuseTalk)");
      console.log("  P4      — Decomposed Premium (Hunyuan + Hedra + Kling Lip Sync)");
      console.log("  P5      — Hybrid (Kling Omni action + Wan 2.5 + Hedra + LatentSync)");
      console.log("  P6      — All Wan 2.5 + 16:9 panels (no Kling) + Hedra + LatentSync");
      console.log("  P7      — Improved Wan 2.5: char voices + LatentSync S3 fix + softened prompts");
      console.log("  P8      — Full Fix: immediate S3 + FFmpeg preprocess + fallback lipsync + v3 action ref");
      console.log("  P9      — Optimized: Kling-only lipsync, parallel batches, incremental CSV");
      console.log("  P10     — Wan 2.7 Unified + Veo 3.1 Lite Dialogue (2-stage architecture)");
      console.log("  P11     — Vidu Q3 silent + Veo 3.1 Lite dialogue + Critic LLM + v5 fixture");
      console.log("  P12     — Multi-LLM Orchestrated (Director + Prompt Engineer + Critic + Voice Director)");
      console.log("  all     — Run full benchmark suite");
      console.log("  report  — Generate report from existing data");
      break;
    }
  }
}

main().catch((err) => {
  console.error("Benchmark runner failed:", err);
  process.exit(1);
});
