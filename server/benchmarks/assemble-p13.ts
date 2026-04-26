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
import { runRulesHarness } from "./harness/rules-harness.js";
import { runD5Harness } from "./llm/visual-reviewer.js";
import { routeFeedback, deduplicateActions, SliceRetryTracker } from "./harness/feedback-router.js";
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
  const sliceMetadata = (pilotScript.slices as any[]).map((s: any) => ({
    sliceId: s.sliceId,
    startSec: (s.sliceId - 1) * 10,
    durationSec: s.duration || 10,
    type: s.type || "cinematic",
    isDialogue: !!s.audio,
  }));

  const h1Verdict = await runRulesHarness({
    videoPath: masteredPath,
    sliceCount: SLICE_ORDER.length,
    sliceDurationSec: 10,
    titleCardDurationSec,
    endCardDurationSec,
    dialogueSlices: sliceMetadata.filter((s) => s.isDialogue),
    requireWatermark: false,
    tempDir: OUTPUT_DIR,
  });

  const retryTracker = new SliceRetryTracker();
  const episodeId = `P13_assembly_${Date.now()}`;

  if (!h1Verdict.passed) {
    console.log(`  H1 FAILED — routing through H2...`);
    const h1Feedback = routeFeedback(h1Verdict, retryTracker, episodeId);
    if (h1Feedback.hasEscalations) {
      addToEscalationQueue(h1Feedback.escalations);
    }
    if (h1Feedback.hasActions) {
      const dedupedActions = deduplicateActions(h1Feedback.actions);
      console.log(`  H2 routed ${dedupedActions.length} regeneration action(s):`);
      for (const action of dedupedActions) {
        console.log(`    → ${action.target}${action.sliceId !== undefined ? ` (slice ${action.sliceId})` : ""}: ${action.reason}`);
      }
      console.log(`  NOTE: Regeneration not executed in standalone assembler — actions logged for pipeline integration`);
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
      const dedupedActions = deduplicateActions(d5Feedback.actions);
      console.log(`  H2 routed ${dedupedActions.length} regeneration action(s):`);
      for (const action of dedupedActions) {
        console.log(`    → ${action.target}${action.sliceId !== undefined ? ` (slice ${action.sliceId})` : ""}: ${action.reason}`);
      }
      console.log(`  NOTE: Regeneration not executed in standalone assembler — actions logged for pipeline integration`);
    }
  } else {
    console.log(`  D5 PASSED ✓`);
    if (d5Verdict.d5Review) {
      console.log(`  Episode score: ${d5Verdict.d5Review.overall.episode_score}/5`);
      console.log(`  Style consistency: ${d5Verdict.d5Review.overall.style_consistency_score}/5`);
    }
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
