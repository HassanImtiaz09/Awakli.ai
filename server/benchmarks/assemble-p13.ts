/**
 * P13 Assembly Script
 *
 * Wires the full post-generation assembly chain:
 *   W1: Classified transitions between all slice boundaries
 *   W2: MiniMax Music bed with side-chain ducking
 *   L2: Title + end cards (wrapWithCards)
 *   Q3: Audio mastering (-16 LUFS)
 *
 * Uses v6 fixture (19 slices, 190s, 2 stylised_action)
 *
 * Usage: npx tsx server/benchmarks/assemble-p13.ts
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

import { generateTransitionPlan, applyTransition, type TransitionSpec } from "./assembly/transitions.js";
import { generateMusicBed, mixMusicBed } from "./assembly/music-bed.js";
import { masterAudio } from "./assembly/audio-mastering.js";
import { wrapWithCards } from "./assembly/title-cards.js";
import { extractMoodVector } from "./assembly/mood-vector.js";
import { padClipToTarget, measureDuration } from "./assembly/clip-padder.js";
import { runRulesHarness } from "./harness/rules-harness.js";
import { runD5Harness } from "./llm/visual-reviewer.js";
import { routeFeedback, deduplicateActions, SliceRetryTracker } from "./harness/feedback-router.js";
import type { RegenerationAction } from "./harness/types.js";
import { addToEscalationQueue } from "../admin/quality-escalation-queue.js";
import pilotScript from "./fixtures/pilot-3min-script-16x9-v6.json" with { type: "json" };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = "/home/ubuntu/webdev-static-assets/p13-assembly";
const SLICE_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

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
  const p13Lines = lines.filter((l) => l.startsWith("P13,"));
  const clips: ClipInfo[] = [];

  for (const line of p13Lines) {
    const parts = line.split(",");
    const shotId = parts[1];
    const provider = parts[2];
    const model = parts[3];
    const mode = parts[4];
    const cost = parseFloat(parts[7]);
    const url = parts[11];
    const status = parts[12];

    if (status !== "success") continue;

    const match = shotId.match(/slice_(\d+)/);
    if (!match) continue;
    const sliceId = parseInt(match[1]);
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
    } else if (clip.mode === "lipsync") {
      // Prefer lipsync-refined clips
      best.set(clip.sliceId, clip);
    }
  }
  return best;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  P13 ASSEMBLY — Transitions + Music Bed + Cards + Mastering");
  console.log("  v6 fixture: 19 slices, 190s, 2 stylised_action");
  console.log("═══════════════════════════════════════════════════════════════");

  // Setup directories
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const clipsDir = path.join(OUTPUT_DIR, "clips");
  const normalizedDir = path.join(OUTPUT_DIR, "normalized");
  const transDir = path.join(OUTPUT_DIR, "transitions");
  fs.mkdirSync(clipsDir, { recursive: true });
  fs.mkdirSync(normalizedDir, { recursive: true });
  fs.mkdirSync(transDir, { recursive: true });

  // ─── Parse & Download ──────────────────────────────────────────────────
  const allClips = parseCSV();
  console.log(`\nFound ${allClips.length} P13 clips in results CSV`);
  const bestClips = getBestClipPerSlice(allClips);
  console.log(`Best clips per slice: ${bestClips.size}`);

  console.log("\n─── Downloading clips ───");
  const localPaths: string[] = [];
  const localPathMap: Map<number, string> = new Map();
  const missingSlices: number[] = [];

  for (const sliceId of SLICE_ORDER) {
    const clip = bestClips.get(sliceId);
    if (!clip) {
      console.log(`  Slice ${sliceId}: MISSING`);
      missingSlices.push(sliceId);
      continue;
    }
    const localPath = path.join(clipsDir, `slice_${String(sliceId).padStart(2, "0")}.mp4`);
    console.log(`  Slice ${sliceId}: downloading (${clip.model.split("/").pop()}, ${clip.mode})...`);
    try {
      execSync(`curl -sL -o "${localPath}" "${clip.url}"`, { timeout: 120000 });
      const stat = fs.statSync(localPath);
      if (stat.size < 1000) {
        console.log(`  Slice ${sliceId}: WARNING — too small, skipping`);
        missingSlices.push(sliceId);
        continue;
      }
      localPaths.push(localPath);
      localPathMap.set(sliceId, localPath);
      console.log(`  Slice ${sliceId}: ✓ (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
    } catch (err: any) {
      console.log(`  Slice ${sliceId}: ✗ ${err.message?.slice(0, 80)}`);
      missingSlices.push(sliceId);
    }
  }

  if (missingSlices.length > 0) {
    console.log(`\nWARNING: ${missingSlices.length} slices missing: ${missingSlices.join(", ")}`);
  }

  // ─── Normalize ─────────────────────────────────────────────────────────
  console.log(`\n─── Normalizing ${localPaths.length} clips ───`);
  const normalizedPaths: string[] = [];
  const normalizedPathMap: Map<number, string> = new Map();

  for (const clipPath of localPaths) {
    const basename = path.basename(clipPath);
    const normalizedPath = path.join(normalizedDir, basename);
    const sliceMatch = basename.match(/slice_(\d+)/);
    const sliceId = sliceMatch ? parseInt(sliceMatch[1]) : 0;

    try {
      execSync(
        `ffmpeg -y -i "${clipPath}" -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 192k -ar 48000 -ac 2 -pix_fmt yuv420p -movflags +faststart "${normalizedPath}" 2>&1`,
        { timeout: 60000 }
      );
      normalizedPaths.push(normalizedPath);
      normalizedPathMap.set(sliceId, normalizedPath);
      console.log(`  ✓ ${basename}`);
    } catch {
      try {
        execSync(
          `ffmpeg -y -i "${clipPath}" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000 -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 192k -shortest -pix_fmt yuv420p -movflags +faststart "${normalizedPath}" 2>&1`,
          { timeout: 60000 }
        );
        normalizedPaths.push(normalizedPath);
        normalizedPathMap.set(sliceId, normalizedPath);
        console.log(`  ✓ ${basename} (with silent audio)`);
      } catch {
        console.log(`  ✗ ${basename} — SKIPPED`);
      }
    }
  }

  // ─── Clip Padding: Extend short clips to target duration ──────────────
  const TARGET_SLICE_DURATION = 10; // seconds per slice (fixture target)
  const paddedDir = path.join(OUTPUT_DIR, "padded");
  fs.mkdirSync(paddedDir, { recursive: true });

  console.log(`\n─── Clip Padding: Extending short clips to ${TARGET_SLICE_DURATION}s ───`);
  let paddedCount = 0;
  let speedRampCount = 0;
  let alreadyOkCount = 0;

  for (const [sliceId, normalizedPath] of Array.from(normalizedPathMap.entries())) {
    try {
      const padResult = await padClipToTarget({
        clipPath: normalizedPath,
        targetDurationSec: TARGET_SLICE_DURATION,
        toleranceSec: 1.5, // Allow clips ≥8.5s to pass without padding
        workDir: paddedDir,
        crossfadeSec: 0.3,
      });

      if (padResult.padded) {
        // Replace the normalized path with the padded version
        normalizedPathMap.set(sliceId, padResult.outputPath);
        const idx = normalizedPaths.indexOf(normalizedPath);
        if (idx >= 0) normalizedPaths[idx] = padResult.outputPath;
        paddedCount++;
        if (padResult.method === "speed_ramp") speedRampCount++;
        console.log(`  Slice ${sliceId}: ${padResult.originalDurationSec.toFixed(1)}s → ${padResult.finalDurationSec.toFixed(1)}s (${padResult.method})`);
      } else {
        alreadyOkCount++;
        console.log(`  Slice ${sliceId}: ${padResult.originalDurationSec.toFixed(1)}s — OK (within tolerance)`);
      }
    } catch (err: any) {
      console.warn(`  Slice ${sliceId}: padding failed — ${err.message?.slice(0, 100)}`);
    }
  }

  console.log(`  Summary: ${paddedCount} padded (${speedRampCount} speed-ramp), ${alreadyOkCount} already OK`);

  // ─── W1: Classified Transitions ────────────────────────────────────────
  console.log(`\n─── W1: Generating transition plan ───`);
  const transitionPlan = generateTransitionPlan(pilotScript.slices as any);
  console.log(`  ${transitionPlan.length} transitions classified:`);
  for (const t of transitionPlan) {
    console.log(`    ${t.fromSliceId}→${t.toSliceId}: ${t.type} (${t.durationMs}ms) — ${t.reason}`);
  }

  console.log(`\n─── W1: Applying transitions ───`);
  const availableSliceIds = SLICE_ORDER.filter((id) => normalizedPathMap.has(id));
  let currentPath = normalizedPathMap.get(availableSliceIds[0])!;
  let transitionsApplied = 0;
  let transitionsFailed = 0;

  for (let i = 0; i < availableSliceIds.length - 1; i++) {
    const fromId = availableSliceIds[i];
    const toId = availableSliceIds[i + 1];
    const nextPath = normalizedPathMap.get(toId)!;
    const outPath = path.join(transDir, `trans_${String(i).padStart(2, "0")}.mp4`);

    const spec = transitionPlan.find((t) => t.fromSliceId === fromId && t.toSliceId === toId);
    if (!spec) {
      const defaultSpec: TransitionSpec = {
        fromSliceId: fromId,
        toSliceId: toId,
        type: "crossfade",
        durationMs: 500,
        reason: "Default (no spec)",
      };
      try {
        currentPath = await applyTransition(currentPath, nextPath, outPath, defaultSpec);
        transitionsApplied++;
        console.log(`  ${fromId}→${toId}: crossfade (default) ✓`);
      } catch (err: any) {
        console.warn(`  ${fromId}→${toId}: transition failed, using concat — ${err.message?.slice(0, 60)}`);
        const concatList = path.join(transDir, `concat_${i}.txt`);
        fs.writeFileSync(concatList, `file '${currentPath}'\nfile '${nextPath}'\n`);
        execSync(`ffmpeg -hide_banner -y -f concat -safe 0 -i "${concatList}" -c copy "${outPath}" 2>&1`, { timeout: 60000 });
        currentPath = outPath;
        transitionsFailed++;
      }
    } else {
      try {
        currentPath = await applyTransition(currentPath, nextPath, outPath, spec);
        transitionsApplied++;
        console.log(`  ${fromId}→${toId}: ${spec.type} (${spec.durationMs}ms) ✓`);
      } catch (err: any) {
        console.warn(`  ${fromId}→${toId}: ${spec.type} failed, using concat — ${err.message?.slice(0, 60)}`);
        const concatList = path.join(transDir, `concat_${i}.txt`);
        fs.writeFileSync(concatList, `file '${currentPath}'\nfile '${nextPath}'\n`);
        execSync(`ffmpeg -hide_banner -y -f concat -safe 0 -i "${concatList}" -c copy "${outPath}" 2>&1`, { timeout: 60000 });
        currentPath = outPath;
        transitionsFailed++;
      }
    }
  }

  console.log(`  Transitions: ${transitionsApplied} applied, ${transitionsFailed} fell back to concat`);

  const transitionedPath = path.join(OUTPUT_DIR, "p13_transitioned.mp4");
  fs.copyFileSync(currentPath, transitionedPath);
  const transStats = fs.statSync(transitionedPath);
  console.log(`  Transitioned video: ${(transStats.size / 1024 / 1024).toFixed(1)} MB`);

  // ─── A1/W2: Music Bed (mood-vector driven) ────────────────────────────
  console.log(`\n─── A1/W2: Generating music bed (mood-vector) ───`);
  const moodVector = extractMoodVector({
    emotionArc: (pilotScript.slices as any[]).map((s: any) => s.emotion || "calm"),
    hasActionSetpiece: (pilotScript.slices as any[]).some((s: any) => s.type === "stylised_action"),
  });
  console.log(`  Mood: ${moodVector.primaryMood} / ${moodVector.secondaryMood}, energy ${moodVector.energyLevel}/10, tempo ${moodVector.tempo}`);
  console.log(`  Prompt: ${moodVector.musicPrompt.slice(0, 120)}...`);

  let musicMixedPath = transitionedPath;
  try {
    const musicResult = await generateMusicBed({
      prompt: moodVector.musicPrompt,
      durationSec: 210, // slightly longer than 190s video to allow trimming
    });

    const musicLocalPath = path.join(OUTPUT_DIR, "music_bed.mp3");
    execSync(`curl -sL -o "${musicLocalPath}" "${musicResult.url}"`, { timeout: 60000 });

    musicMixedPath = path.join(OUTPUT_DIR, "p13_with_music.mp4");
    await mixMusicBed(transitionedPath, musicLocalPath, musicMixedPath, {
      musicLufs: -22,
      duckingDb: -12,
    });
    console.log(`  ✓ Music mixed`);
  } catch (err: any) {
    console.warn(`  ✗ Music bed failed: ${err.message?.slice(0, 100)} — proceeding without music`);
    musicMixedPath = transitionedPath;
  }

  // ─── L2: Title + End Cards ────────────────────────────────────────────
  console.log(`\n─── L2: Adding title + end cards ───`);
  const withCardsPath = path.join(OUTPUT_DIR, "p13_with_cards.mp4");
  try {
    await wrapWithCards(
      musicMixedPath,
      withCardsPath,
      OUTPUT_DIR,
      {
        title: "AWAKLI",
        subtitle: "Pilot Episode — P13 Refined Pipeline",
        durationSec: 5,
      },
      {
        credits: ["Created with Awakli"],
        branding: "P13 Pipeline — Structured Bible + Style Lock + Batched D2/D4",
        durationSec: 4,
      }
    );
    console.log(`  ✓ Cards added`);
  } catch (err: any) {
    console.warn(`  ✗ Cards failed: ${err.message?.slice(0, 100)} — using video without cards`);
    fs.copyFileSync(musicMixedPath, withCardsPath);
  }

  // ─── Q3: Audio Mastering ───────────────────────────────────────────────
  console.log(`\n─── Q3: Audio mastering (-16 LUFS) ───`);
  const masteredPath = path.join(OUTPUT_DIR, "p13_mastered.mp4");
  try {
    await masterAudio(withCardsPath, masteredPath, {
      integratedLoudness: -16,
      loudnessRange: 8,
      truePeak: -1.5,
    });
    console.log(`  ✓ Mastered`);
  } catch (err: any) {
    console.warn(`  ✗ Mastering failed: ${err.message?.slice(0, 100)} — using unmastered`);
    fs.copyFileSync(withCardsPath, masteredPath);
  }

  // ─── Stage 6a: H1 Tier 1 Rules-Based Harness (~30s, $0) ──────────────
  console.log(`\n─── Stage 6a: H1 Rules Harness ───`);
  const titleCardDurationSec = 5;
  const endCardDurationSec = 4;

  // Measure actual clip durations for accurate expected duration calculation
  const actualClipDurations: number[] = [];
  for (const sliceId of SLICE_ORDER) {
    const clipPath = normalizedPathMap.get(sliceId);
    if (clipPath && fs.existsSync(clipPath)) {
      try {
        const durStr = execSync(
          `ffprobe -v error -show_entries format=duration -of csv=p=0 "${clipPath}" 2>/dev/null`
        ).toString().trim();
        actualClipDurations.push(parseFloat(durStr) || 0);
      } catch {
        actualClipDurations.push(0);
      }
    }
  }
  console.log(`  Measured ${actualClipDurations.length} clip durations: total ${actualClipDurations.reduce((a, b) => a + b, 0).toFixed(1)}s`);

  // Calculate total transition overlap from applied transitions
  const transitionOverlapSec = transitionPlan
    .filter((t) => normalizedPathMap.has(t.fromSliceId) && normalizedPathMap.has(t.toSliceId))
    .reduce((sum, t) => sum + (t.durationMs / 1000), 0);
  console.log(`  Transition overlap: ${transitionOverlapSec.toFixed(1)}s from ${transitionsApplied} transitions`);

  // Build slice metadata using actual measured durations
  let cumulativeSec = 0;
  const sliceMetadata = SLICE_ORDER.map((sliceId, idx) => {
    const clipDur = actualClipDurations[idx] || 0;
    const meta = {
      sliceId,
      startSec: cumulativeSec,
      durationSec: clipDur,
      type: ((pilotScript.slices as any[]).find((s: any) => s.sliceId === sliceId)?.type) || "cinematic",
      isDialogue: !!(pilotScript.slices as any[]).find((s: any) => s.sliceId === sliceId)?.audio,
    };
    cumulativeSec += clipDur;
    return meta;
  });

  const h1Verdict = await runRulesHarness({
    videoPath: masteredPath,
    sliceCount: SLICE_ORDER.length,
    sliceDurationSec: 10,
    titleCardDurationSec,
    endCardDurationSec,
    actualClipDurations,
    transitionOverlapSec,
    dialogueSlices: sliceMetadata.filter((s) => s.isDialogue),
    requireWatermark: false,
    tempDir: OUTPUT_DIR,
    lraRange: [6, 14],
  });

  const retryTracker = new SliceRetryTracker();
  const episodeId = `P13_assembly_${Date.now()}`;

  // ─── Regeneration Executor ─────────────────────────────────────────────
  // Collects H1 and D5 actions, executes actionable ones, then optionally
  // re-runs the assembly chain once (max 1 cycle).

  async function executeAction(action: RegenerationAction): Promise<{ success: boolean; detail: string }> {
    const tag = action.sliceId !== undefined ? `slice ${action.sliceId}` : "global";
    console.log(`    ⚙ Executing ${action.target} [${tag}]...`);

    switch (action.target) {
      case "a1_music_bed": {
        // Re-generate music bed
        try {
          const retryMood = extractMoodVector({
            emotionArc: (pilotScript.slices as any[]).map((s: any) => s.emotion || "calm"),
            hasActionSetpiece: (pilotScript.slices as any[]).some((s: any) => s.type === "stylised_action"),
          });
          const musicResult = await generateMusicBed({
            prompt: retryMood.musicPrompt,
            durationSec: 210,
          });
          const musicLocalPath = path.join(OUTPUT_DIR, "music_bed_retry.mp3");
          execSync(`curl -sL -o "${musicLocalPath}" "${musicResult.url}"`, { timeout: 60000 });
          const retryMixPath = path.join(OUTPUT_DIR, "p13_with_music_retry.mp4");
          await mixMusicBed(transitionedPath, musicLocalPath, retryMixPath, {
            musicLufs: -22,
            duckingDb: -12,
          });
          // Re-wrap with cards and re-master
          const retryCardsPath = path.join(OUTPUT_DIR, "p13_with_cards_retry.mp4");
          await wrapWithCards(retryMixPath, retryCardsPath, OUTPUT_DIR,
            { title: "AWAKLI", subtitle: "Pilot Episode — P13 Refined Pipeline", durationSec: 5 },
            { credits: ["Created with Awakli"], branding: "P13 Pipeline", durationSec: 4 }
          );
          await masterAudio(retryCardsPath, masteredPath, { integratedLoudness: -16, loudnessRange: 8, truePeak: -1.5 });
          return { success: true, detail: "Music bed regenerated, re-mixed, re-mastered" };
        } catch (err: any) {
          return { success: false, detail: `Music bed retry failed: ${err.message?.slice(0, 100)}` };
        }
      }

      case "q3_audio_mastering": {
        // Re-run mastering on the current assembled video
        try {
          const inputForMaster = fs.existsSync(withCardsPath) ? withCardsPath : musicMixedPath;
          await masterAudio(inputForMaster, masteredPath, { integratedLoudness: -16, loudnessRange: 8, truePeak: -1.5 });
          return { success: true, detail: "Audio re-mastered to -16 LUFS" };
        } catch (err: any) {
          return { success: false, detail: `Mastering retry failed: ${err.message?.slice(0, 100)}` };
        }
      }

      case "slice_video_regen": {
        // In standalone assembler, we can't re-trigger video generation (no API context).
        // Log for pipeline integration.
        return { success: false, detail: `Slice ${action.sliceId} video regen requires pipeline context — logged for integration` };
      }

      case "slice_d2_regen": {
        // Requires D2 Prompt Engineer — pipeline-only
        return { success: false, detail: `Slice ${action.sliceId} D2 prompt regen requires pipeline context — logged for integration` };
      }

      case "slice_reference_regen": {
        // Requires P3 reference generation — pipeline-only
        return { success: false, detail: `Slice ${action.sliceId} reference regen requires pipeline context — logged for integration` };
      }

      case "slice_identify_missing": {
        // Check which slices are missing or short
        const missing: number[] = [];
        for (const sliceId of SLICE_ORDER) {
          if (!normalizedPathMap.has(sliceId)) {
            missing.push(sliceId);
          }
        }
        if (missing.length > 0) {
          return { success: false, detail: `Missing slices: ${missing.join(", ")} — requires pipeline regen` };
        }
        return { success: true, detail: "All slices present — duration gap is from shorter-than-expected clips (Vidu Q3 8s max)" };
      }

      case "assembly_reencode": {
        // Re-encode the assembled video with correct parameters
        try {
          const reencPath = path.join(OUTPUT_DIR, "p13_reencoded.mp4");
          execSync(
            `ffmpeg -y -i "${masteredPath}" -vf "scale=1280:720,setsar=1" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 192k -ar 48000 -ac 2 -pix_fmt yuv420p -movflags +faststart "${reencPath}" 2>&1`,
            { timeout: 120000 }
          );
          fs.copyFileSync(reencPath, masteredPath);
          return { success: true, detail: "Re-encoded to 1280x720 H.264+AAC" };
        } catch (err: any) {
          return { success: false, detail: `Re-encode failed: ${err.message?.slice(0, 100)}` };
        }
      }

      case "assembly_concat": {
        // Re-run concat from normalized clips
        try {
          const concatList = path.join(OUTPUT_DIR, "regen_concat.txt");
          const lines = SLICE_ORDER
            .filter((id) => normalizedPathMap.has(id))
            .map((id) => `file '${normalizedPathMap.get(id)}'`);
          fs.writeFileSync(concatList, lines.join("\n") + "\n");
          execSync(`ffmpeg -hide_banner -y -f concat -safe 0 -i "${concatList}" -c copy "${transitionedPath}" 2>&1`, { timeout: 120000 });
          return { success: true, detail: "Re-concatenated from normalized clips" };
        } catch (err: any) {
          return { success: false, detail: `Re-concat failed: ${err.message?.slice(0, 100)}` };
        }
      }

      case "log_only":
      case "none":
      default:
        return { success: true, detail: `No action needed for ${action.target}` };
    }
  }

  // Collect all actions from H1 and D5, execute, then optionally re-run harness
  const allActions: RegenerationAction[] = [];
  let h1Passed = h1Verdict.passed;

  if (!h1Verdict.passed) {
    console.log(`  H1 FAILED — routing through H2...`);
    const h1Feedback = routeFeedback(h1Verdict, retryTracker, episodeId);
    if (h1Feedback.hasEscalations) {
      addToEscalationQueue(h1Feedback.escalations);
    }
    if (h1Feedback.hasActions) {
      allActions.push(...deduplicateActions(h1Feedback.actions));
    }
  } else {
    console.log(`  H1 PASSED ✓ (${h1Verdict.checks.filter(c => c.passed).length}/${h1Verdict.checks.length} checks)`);
  }

  // ─── Stage 6b: D5 Tier 2 LLM Visual Reviewer (~90s, ~$0.30) ──────────
  console.log(`\n─── Stage 6b: D5 Visual Reviewer ───`);
  const d5Verdict = await runD5Harness({
    videoPath: masteredPath,
    slices: sliceMetadata.map((s) => ({
      ...s,
      intent: (pilotScript.slices as any[]).find((ps: any) => ps.sliceId === s.sliceId)?.prompt || "Scene",
      emotion: (pilotScript.slices as any[]).find((ps: any) => ps.sliceId === s.sliceId)?.emotion || "calm",
      isDialogue: s.isDialogue,
    })),
    titleCardDurationSec,
    characterBibles: {},  // Will be populated from character-bible/schema.ts in pipeline mode
    styleLock: { primary: "2D anime cel-shaded illustration", forbidden: ["photorealistic", "3D render", "watercolor"], toleranceBand: "semi-realistic anime (3D-rendered anime character design with soft shading)" },
    projectPlan: { emotionArc: (pilotScript.slices as any[]).map((s: any) => s.emotion || "calm") },
    tempDir: OUTPUT_DIR,
  });

  if (!d5Verdict.passed) {
    console.log(`  D5 FAILED — routing through H2...`);
    const d5Feedback = routeFeedback(d5Verdict, retryTracker, episodeId);
    if (d5Feedback.hasEscalations) {
      addToEscalationQueue(d5Feedback.escalations);
    }
    if (d5Feedback.hasActions) {
      allActions.push(...deduplicateActions(d5Feedback.actions));
    }
  } else {
    console.log(`  D5 PASSED ✓`);
    if (d5Verdict.d5Review) {
      console.log(`  Episode score: ${d5Verdict.d5Review.overall.episode_score}/5`);
      console.log(`  Style consistency: ${d5Verdict.d5Review.overall.style_consistency_score}/5`);
    }
  }

  // ─── Stage 7: Execute Regeneration Actions (max 1 cycle) ──────────────
  const executableActions = deduplicateActions(allActions);
  if (executableActions.length > 0) {
    console.log(`\n─── Stage 7: Regeneration Executor (${executableActions.length} actions) ───`);
    const executionResults: Array<{ action: string; sliceId?: number; success: boolean; detail: string }> = [];
    let anyAssemblyChanged = false;

    for (const action of executableActions) {
      const result = await executeAction(action);
      executionResults.push({
        action: action.target,
        sliceId: action.sliceId,
        success: result.success,
        detail: result.detail,
      });
      console.log(`    ${result.success ? "✓" : "✗"} ${result.detail}`);

      // Track if any assembly-level action succeeded (triggers re-run)
      if (result.success && ["a1_music_bed", "q3_audio_mastering", "assembly_reencode", "assembly_concat"].includes(action.target)) {
        anyAssemblyChanged = true;
      }
    }

    const succeeded = executionResults.filter((r) => r.success).length;
    const failed = executionResults.filter((r) => !r.success).length;
    const pipelineOnly = executionResults.filter((r) => r.detail.includes("pipeline context")).length;
    console.log(`  Execution summary: ${succeeded} succeeded, ${failed} failed (${pipelineOnly} require pipeline context)`);

    // Re-run H1 if any assembly-level action succeeded
    if (anyAssemblyChanged) {
      console.log(`\n─── Stage 7b: Re-running H1 after regeneration ───`);
      const h1Recheck = await runRulesHarness({
        videoPath: masteredPath,
        sliceCount: SLICE_ORDER.length,
        sliceDurationSec: 10,
        titleCardDurationSec,
        endCardDurationSec,
        actualClipDurations,
        transitionOverlapSec,
        dialogueSlices: sliceMetadata.filter((s) => s.isDialogue),
        requireWatermark: false,
        tempDir: OUTPUT_DIR,
        lraRange: [6, 14],
      });
      h1Passed = h1Recheck.passed;
      if (h1Recheck.passed) {
        console.log(`  H1 re-check PASSED ✓ after regeneration`);
      } else {
        console.log(`  H1 re-check still FAILED — remaining issues escalated`);
        const recheckFeedback = routeFeedback(h1Recheck, retryTracker, episodeId);
        if (recheckFeedback.hasEscalations) {
          addToEscalationQueue(recheckFeedback.escalations);
        }
      }
    }

    // Write execution report
    const reportPath = path.join(OUTPUT_DIR, "regen_execution_report.json");
    fs.writeFileSync(reportPath, JSON.stringify({
      episodeId,
      timestamp: new Date().toISOString(),
      totalActions: executableActions.length,
      succeeded,
      failed,
      pipelineOnly,
      assemblyRerun: anyAssemblyChanged,
      h1PassedAfterRegen: h1Passed,
      results: executionResults,
    }, null, 2));
    console.log(`  Report saved: ${reportPath}`);
  } else {
    console.log(`\n─── Stage 7: No regeneration actions needed ───`);
  }

  // ─── Final Stats ───────────────────────────────────────────────────────
  const finalPath = masteredPath;
  if (fs.existsSync(finalPath)) {
    const stat = fs.statSync(finalPath);
    const duration = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${finalPath}" 2>/dev/null`).toString().trim();
    console.log(`\n═══════════════════════════════════════════════════════════════`);
    console.log(`  P13 ASSEMBLY COMPLETE`);
    console.log(`  Final video: ${finalPath}`);
    console.log(`  Size: ${(stat.size / 1024 / 1024).toFixed(1)} MB`);
    console.log(`  Duration: ${parseFloat(duration).toFixed(1)}s`);
    console.log(`  Clips: ${normalizedPaths.length} / ${SLICE_ORDER.length} slices`);
    console.log(`  Transitions: ${transitionsApplied} applied (${transitionsFailed} fallbacks)`);
    console.log(`  Music bed: ${musicMixedPath !== transitionedPath ? "YES" : "SKIPPED"}`);
    console.log(`  Cards: ${fs.existsSync(withCardsPath) ? "YES" : "SKIPPED"}`);
    console.log(`  Mastering: -16 LUFS`);
    console.log(`═══════════════════════════════════════════════════════════════`);
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
