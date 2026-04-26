/**
 * End-to-End Pipeline Runners (P1–P4)
 *
 * Each pipeline generates the same 18-slice, 3-minute anime pilot using
 * different provider combinations. Results are logged to CSV for the
 * cost assessment framework (A1).
 *
 * P1 — Kling V3 Omni Control (all 18 clips via Kling Omni with audio)
 * P2 — Decomposed Balanced (Wan 2.2 + ElevenLabs + Hedra + LatentSync)
 * P3 — Decomposed Cheap (Wan 2.2 + Cartesia TTS + MuseTalk)
 * P4 — Decomposed Premium (Hunyuan + ElevenLabs + Hedra + Kling Lip Sync)
 */

import fs from "fs";
import path from "path";
import {
  type ClipResult,
  type PipelineResult,
  type ComponentCost,
  appendClipResult,
  appendPipelineResult,
  writeComponentBreakdownCsv,
  startTimer,
  withRetry,
  calculateClipCost,
  calculateTTSCost,
  buildComponentBreakdown,
  extrapolateCost,
} from "../runner-base.js";
import { getProviderKey } from "../providers/registry.js";
import { storagePut } from "../../storage.js";
import pricingData from "../providers/pricing.json" with { type: "json" };

// ─── Types ───────────────────────────────────────────────────────────────────

interface Slice {
  sliceId: number;
  type: string;
  prompt: string;
  duration: number;
  audio: boolean;
  dialogue: {
    text: string;
    character: string;
    emotion: string;
  } | null;
  referenceImage: string | null;
  cameraAngle: string;
}

// ─── URL Accessibility Helper ──────────────────────────────────────────────
// CloudFront URLs from our S3 bucket are not publicly accessible to external
// providers (fal.ai, Replicate, Hedra). This helper uploads the image to
// fal.ai's temporary storage to get a publicly accessible URL.

const falUrlCache = new Map<string, string>();

async function ensurePublicUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  // fal.ai media URLs are already accessible
  if (url.includes('fal.media') || url.includes('fal.run')) return url;
  // placehold.co is public
  if (url.includes('placehold.co')) return url;
  // Check cache first
  if (falUrlCache.has(url)) return falUrlCache.get(url)!;

  try {
    const { fal } = await import('@fal-ai/client');
    const key = process.env.FAL_API_KEY;
    if (key) fal.config({ credentials: key });

    // Download the image first, then upload to fal storage
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to download: ${resp.status}`);
    const blob = await resp.blob();
    const file = new File([blob], 'reference.png', { type: blob.type || 'image/png' });
    const falUrl = await fal.storage.upload(file);
    console.log(`  [URL] Re-uploaded to fal.ai: ${url.slice(-40)} → ${falUrl.slice(-40)}`);
    falUrlCache.set(url, falUrl);
    return falUrl;
  } catch (err) {
    console.warn(`  [URL] Failed to re-upload ${url.slice(-40)}, using original:`, err);
    return url;
  }
}

interface PilotScript {
  _meta: {
    totalSlices: number;
    totalDuration: number;
    dialogueCharacters: number;
  };
  slices: Slice[];
}

interface GenerationOutput {
  url: string;
  queueTimeMs?: number;
  generationTimeMs?: number;
}

// ─── P1: Kling V3 Omni Control ──────────────────────────────────────────────

export async function runP1(script: PilotScript): Promise<PipelineResult> {
  const pipelineTimer = startTimer();
  const pricing = pricingData.video.kling_v3_omni_fal;
  const apiKey = getProviderKey("fal_ai");

  // Resume support: read existing clip-results.csv to skip already-completed slices
  const completedSliceIds = new Set<number>();
  const resumedClips: ClipResult[] = [];
  const csvPath = path.join(process.cwd(), "server/benchmarks/report/clip-results.csv");
  try {
    if (fs.existsSync(csvPath)) {
      const csvContent = fs.readFileSync(csvPath, "utf-8");
      for (const line of csvContent.split("\n").slice(1)) {
        if (!line.trim()) continue;
        const cols = line.split(",");
        if (cols[0] === "P1" && cols[12] === "success") {
          const sliceId = parseInt(cols[1].replace("slice_", ""));
          completedSliceIds.add(sliceId);
          resumedClips.push({
            ticketId: "P1",
            shotId: cols[1],
            provider: cols[2],
            model: cols[3],
            mode: cols[4],
            resolution: cols[5],
            durationSec: parseFloat(cols[6]),
            costUsd: parseFloat(cols[7]),
            wallClockMs: parseFloat(cols[8]),
            queueTimeMs: parseFloat(cols[9]),
            generationTimeMs: parseFloat(cols[10]),
            outputUrl: cols[11],
            status: "success",
            error: null,
            retryCount: parseInt(cols[14]) || 0,
            timestamp: cols[15],
            metadata: { pipelineVariant: "P1", sliceType: "resumed" },
          });
        }
      }
    }
  } catch { /* ignore CSV parse errors */ }
  if (completedSliceIds.size > 0) {
    console.log(`  [P1] Resuming — ${completedSliceIds.size} slices already completed, skipping them.`);
  }

  const clips: ClipResult[] = [...resumedClips];
  let totalCost = resumedClips.reduce((sum, c) => sum + c.costUsd, 0);

  for (let i = 0; i < script.slices.length; i++) {
    const slice = script.slices[i];
    if (completedSliceIds.has(slice.sliceId)) {
      console.log(`  [P1] Slice ${i + 1}/${script.slices.length} (id=${slice.sliceId}) — already done, skipping.`);
      continue;
    }
    console.log(`  [P1] Slice ${i + 1}/${script.slices.length} (id=${slice.sliceId}, type=${slice.type}) — generating...`);
    const timer = startTimer();
    try {
      const { result: output, retryCount } = await withRetry(async () => {
        return await generateKlingOmni(apiKey, slice);
      });
      const wallClockMs = timer();
      const cost = calculateClipCost(slice.duration, pricing.perSecond, null, null);
      totalCost += cost;
      console.log(`  [P1] Slice ${i + 1}/${script.slices.length} ✓ done in ${(wallClockMs / 1000).toFixed(1)}s — cost: $${cost.toFixed(4)} — url: ${output.url.slice(0, 80)}...`);

      const clip: ClipResult = {
        ticketId: "P1",
        shotId: `slice_${slice.sliceId}`,
        provider: "fal_ai",
        model: pricing.model,
        mode: "omni",
        resolution: pricing.resolution,
        durationSec: slice.duration,
        costUsd: cost,
        wallClockMs,
        queueTimeMs: output.queueTimeMs ?? 0,
        generationTimeMs: output.generationTimeMs ?? wallClockMs,
        outputUrl: output.url,
        status: "success",
        error: null,
        retryCount,
        timestamp: new Date().toISOString(),
        metadata: { pipelineVariant: "P1", sliceType: slice.type },
      };
      clips.push(clip);
      appendClipResult(clip);
    } catch (err: any) {
      const wallClockMs = timer();
      console.log(`  [P1] Slice ${i + 1}/${script.slices.length} ✗ FAILED in ${(wallClockMs / 1000).toFixed(1)}s — ${err.message?.slice(0, 100)}`);
      clips.push(makeFailedPipelineClip("P1", slice, "fal_ai", pricing.model, wallClockMs, err));
    }
  }

  const totalWallClockMs = pipelineTimer();
  const components = buildComponentBreakdown([
    {
      component: "video",
      provider: "fal_ai",
      model: "Kling V3 Omni",
      units: script._meta.totalDuration,
      unitType: "seconds",
      costUsd: totalCost,
    },
  ]);

  const result: PipelineResult = {
    pipelineId: `P1_${Date.now()}`,
    variant: "P1_kling_omni",
    totalSlices: script._meta.totalSlices,
    totalDurationSec: script._meta.totalDuration,
    components,
    totalCostUsd: totalCost,
    totalWallClockMs,
    costPerSecond: totalCost / script._meta.totalDuration,
    costPerMinute: (totalCost / script._meta.totalDuration) * 60,
    costPer5Min: extrapolateCost(totalCost, 3, 5),
    status: clips.every((c) => c.status === "success") ? "success" : clips.some((c) => c.status === "success") ? "partial" : "failed",
    failedSlices: clips.filter((c) => c.status === "failed").length,
    timestamp: new Date().toISOString(),
  };

  appendPipelineResult(result);
  writeComponentBreakdownCsv(result.pipelineId, components);
  return result;
}

// ─── P2: Decomposed Balanced (Wan 2.2 + ElevenLabs + Hedra + LatentSync) ────

export async function runP2(script: PilotScript): Promise<PipelineResult> {
  const pipelineTimer = startTimer();
  const clips: ClipResult[] = [];

  const silentSlices = script.slices.filter((s) => !s.audio);
  const dialogueSlices = script.slices.filter((s) => s.audio);

  // --- Step 1: Generate silent clips with Wan 2.2 ---
  const wanPricing = pricingData.video.wan22_fal;
  const falKey = getProviderKey("fal_ai");
  let silentCost = 0;

  for (const slice of silentSlices) {
    const timer = startTimer();
    try {
      const { result: output, retryCount } = await withRetry(async () => {
        return await generateWan22(falKey, slice);
      });
      const wallClockMs = timer();
      const cost = calculateClipCost(slice.duration, wanPricing.perSecond, null, null);
      silentCost += cost;

      clips.push({
        ticketId: "P2",
        shotId: `slice_${slice.sliceId}`,
        provider: "fal_ai",
        model: wanPricing.model,
        mode: "standard",
        resolution: wanPricing.resolution,
        durationSec: slice.duration,
        costUsd: cost,
        wallClockMs,
        queueTimeMs: output.queueTimeMs ?? 0,
        generationTimeMs: output.generationTimeMs ?? wallClockMs,
        outputUrl: output.url,
        status: "success",
        error: null,
        retryCount,
        timestamp: new Date().toISOString(),
        metadata: { pipelineVariant: "P2", component: "silent_video" },
      });
    } catch (err) {
      const wallClockMs = timer();
      clips.push(makeFailedPipelineClip("P2", slice, "fal_ai", wanPricing.model, wallClockMs, err));
    }
  }

  // --- Step 2: Generate TTS audio with ElevenLabs for each dialogue slice ---
  const ttsPricing = pricingData.tts.elevenlabs;
  let ttsCost = 0;
  const ttsOutputs: Map<number, GenerationOutput> = new Map();

  for (const slice of dialogueSlices) {
    const dialogueText = slice.dialogue?.text ?? "";
    if (!dialogueText) continue;
    const timer = startTimer();
    try {
      const { result: ttsOutput } = await withRetry(async () => {
        return await generateElevenLabsTTSForPipeline(dialogueText);
      });
      const cost = calculateTTSCost(dialogueText.length, ttsPricing.perKChars);
      ttsCost += cost;
      ttsOutputs.set(slice.sliceId, ttsOutput);
      console.log(`  [P2] TTS for slice ${slice.sliceId}: ${ttsOutput.url} ($${cost.toFixed(4)})`);
    } catch (err) {
      console.error(`  [P2] TTS failed for slice ${slice.sliceId}:`, err);
    }
  }

  // --- Step 3: Generate dialogue clips with Hedra Character-3 (uses TTS audio) ---
  const hedraPricing = pricingData.video.hedra_char3;
  let dialogueCost = 0;

  for (const slice of dialogueSlices) {
    const timer = startTimer();
    try {
      const ttsOutput = ttsOutputs.get(slice.sliceId);
      if (!ttsOutput) throw new Error(`No TTS audio for slice ${slice.sliceId}`);

      const hedraImageUrl = slice.referenceImage ?? "https://placehold.co/512x512/png";
      const { result: output, retryCount } = await withRetry(async () => {
        return await hedraCharacter3({
          imageUrl: hedraImageUrl,
          audioUrl: ttsOutput.url,
          prompt: slice.prompt,
          durationMs: slice.duration * 1000,
        });
      });
      const wallClockMs = timer();
      const cost = calculateClipCost(slice.duration, hedraPricing.perSecond, null, null);
      dialogueCost += cost;

      clips.push({
        ticketId: "P2",
        shotId: `slice_${slice.sliceId}`,
        provider: "hedra",
        model: hedraPricing.model,
        mode: "dialogue",
        resolution: hedraPricing.resolution,
        durationSec: slice.duration,
        costUsd: cost,
        wallClockMs,
        queueTimeMs: output.queueTimeMs ?? 0,
        generationTimeMs: output.generationTimeMs ?? wallClockMs,
        outputUrl: output.url,
        status: "success",
        error: null,
        retryCount,
        timestamp: new Date().toISOString(),
        metadata: { pipelineVariant: "P2", component: "dialogue_video" },
      });
    } catch (err) {
      const wallClockMs = timer();
      clips.push(makeFailedPipelineClip("P2", slice, "hedra", hedraPricing.model, wallClockMs, err));
    }
  }

  // --- Step 4: Lipsync with LatentSync on silent clips that have dialogue audio ---
  // For clips where we generated silent video (Wan) but have TTS audio, apply lipsync
  const lipsyncPricing = pricingData.video.latentsync_fal;
  let lipsyncCost = 0;
  let lipsyncClipCount = 0;

  // In P2, silent clips don't need lipsync (they have no dialogue).
  // Hedra already produces lip-synced output. But we apply LatentSync as a quality
  // refinement pass on ~50% of Hedra clips for benchmark comparison.
  const lipsyncCandidates = clips.filter(
    (c) => c.metadata?.component === "dialogue_video" && c.status === "success"
  ).slice(0, Math.ceil(dialogueSlices.length * 0.5));

  for (const clip of lipsyncCandidates) {
    const sliceId = parseInt(clip.shotId.replace("slice_", ""));
    const ttsOutput = ttsOutputs.get(sliceId);
    if (!clip.outputUrl || !ttsOutput) continue;

    const timer = startTimer();
    try {
      const { result: lsOutput } = await withRetry(async () => {
        return await applyLatentSync(clip.outputUrl!, ttsOutput.url);
      });
      const cost = lipsyncPricing.perClip ?? 0.20;
      lipsyncCost += cost;
      lipsyncClipCount++;
      console.log(`  [P2] LatentSync on slice ${sliceId}: ${lsOutput.url} ($${cost.toFixed(2)})`);
    } catch (err) {
      console.error(`  [P2] LatentSync failed on slice ${sliceId}:`, err);
    }
  }

  // --- Assembly (FFmpeg, free) ---
  const allDialogueText = dialogueSlices.map((s) => s.dialogue?.text ?? "").join(" ");
  const totalCost = silentCost + ttsCost + dialogueCost + lipsyncCost;
  const totalWallClockMs = pipelineTimer();

  const components = buildComponentBreakdown([
    { component: "video", provider: "fal_ai", model: "Wan 2.2", units: silentSlices.length * 10, unitType: "seconds", costUsd: silentCost },
    { component: "tts", provider: "elevenlabs", model: "turbo-v2.5", units: allDialogueText.length, unitType: "characters", costUsd: ttsCost },
    { component: "video", provider: "hedra", model: "Character-3", units: dialogueSlices.length * 10, unitType: "seconds", costUsd: dialogueCost },
    { component: "lipsync", provider: "fal_ai", model: "LatentSync", units: lipsyncClipCount, unitType: "clips", costUsd: lipsyncCost },
    { component: "assembly", provider: "local", model: "FFmpeg", units: 1, unitType: "runs", costUsd: 0 },
  ]);

  const result: PipelineResult = {
    pipelineId: `P2_${Date.now()}`,
    variant: "P2_balanced",
    totalSlices: script._meta.totalSlices,
    totalDurationSec: script._meta.totalDuration,
    components,
    totalCostUsd: totalCost,
    totalWallClockMs,
    costPerSecond: totalCost / script._meta.totalDuration,
    costPerMinute: (totalCost / script._meta.totalDuration) * 60,
    costPer5Min: extrapolateCost(totalCost, 3, 5),
    status: clips.every((c) => c.status === "success") ? "success" : clips.some((c) => c.status === "success") ? "partial" : "failed",
    failedSlices: clips.filter((c) => c.status === "failed").length,
    timestamp: new Date().toISOString(),
  };

  appendPipelineResult(result);
  writeComponentBreakdownCsv(result.pipelineId, components);
  return result;
}

// ─── P3: Decomposed Cheap (Wan 2.2 + Cartesia TTS + MuseTalk) ──────────────

export async function runP3(script: PilotScript): Promise<PipelineResult> {
  const pipelineTimer = startTimer();
  const clips: ClipResult[] = [];

  const dialogueSlices = script.slices.filter((s) => s.audio);

  // --- Step 1: ALL 18 clips via Wan 2.2 (dialogue clips start as silent video) ---
  const wanPricing = pricingData.video.wan22_fal;
  const falKey = getProviderKey("fal_ai");
  let videoCost = 0;

  for (const slice of script.slices) {
    const timer = startTimer();
    try {
      const { result: output, retryCount } = await withRetry(async () => {
        return await generateWan22(falKey, slice);
      });
      const wallClockMs = timer();
      const cost = calculateClipCost(slice.duration, wanPricing.perSecond, null, null);
      videoCost += cost;

      clips.push({
        ticketId: "P3",
        shotId: `slice_${slice.sliceId}`,
        provider: "fal_ai",
        model: wanPricing.model,
        mode: "standard",
        resolution: wanPricing.resolution,
        durationSec: slice.duration,
        costUsd: cost,
        wallClockMs,
        queueTimeMs: output.queueTimeMs ?? 0,
        generationTimeMs: output.generationTimeMs ?? wallClockMs,
        outputUrl: output.url,
        status: "success",
        error: null,
        retryCount,
        timestamp: new Date().toISOString(),
        metadata: { pipelineVariant: "P3", component: "video" },
      });
    } catch (err) {
      const wallClockMs = timer();
      clips.push(makeFailedPipelineClip("P3", slice, "fal_ai", wanPricing.model, wallClockMs, err));
    }
  }

  // --- Step 2: TTS with Cartesia (substituted for OpenAI TTS — Forge proxy 404) ---
  const ttsPricing = pricingData.tts.cartesia;
  let ttsCost = 0;
  const ttsOutputs: Map<number, GenerationOutput> = new Map();

  for (const slice of dialogueSlices) {
    const dialogueText = slice.dialogue?.text ?? "";
    if (!dialogueText) continue;
    const timer = startTimer();
    try {
      const { result: ttsOutput } = await withRetry(async () => {
        return await generateCartesiaTTSForPipeline(dialogueText);
      });
      const cost = calculateTTSCost(dialogueText.length, ttsPricing.perKChars);
      ttsCost += cost;
      ttsOutputs.set(slice.sliceId, ttsOutput);
      console.log(`  [P3] Cartesia TTS for slice ${slice.sliceId}: ${ttsOutput.url} ($${cost.toFixed(4)})`);
    } catch (err) {
      console.error(`  [P3] Cartesia TTS failed for slice ${slice.sliceId}:`, err);
    }
  }

  // --- Step 3: Lipsync with MuseTalk on dialogue clips ---
  const musetalkPricing = pricingData.video.musetalk_replicate;
  let lipsyncCost = 0;
  let lipsyncClipCount = 0;

  for (const slice of dialogueSlices) {
    const ttsOutput = ttsOutputs.get(slice.sliceId);
    const videoClip = clips.find(
      (c) => c.shotId === `slice_${slice.sliceId}` && c.status === "success"
    );
    if (!ttsOutput || !videoClip?.outputUrl) {
      console.warn(`  [P3] Skipping MuseTalk for slice ${slice.sliceId}: missing TTS or video`);
      continue;
    }

    const timer = startTimer();
    try {
      const { result: mtOutput } = await withRetry(async () => {
        return await applyMuseTalk(videoClip.outputUrl!, ttsOutput.url);
      });
      const cost = musetalkPricing.perRun ?? 0.42;
      lipsyncCost += cost;
      lipsyncClipCount++;
      // Update the clip's output URL to the lip-synced version
      videoClip.outputUrl = mtOutput.url;
      console.log(`  [P3] MuseTalk on slice ${slice.sliceId}: ${mtOutput.url} ($${cost.toFixed(2)})`);
    } catch (err) {
      console.error(`  [P3] MuseTalk failed on slice ${slice.sliceId}:`, err);
    }
  }

  // --- Assembly ---
  const allDialogueText = dialogueSlices.map((s) => s.dialogue?.text ?? "").join(" ");
  const totalCost = videoCost + ttsCost + lipsyncCost;
  const totalWallClockMs = pipelineTimer();

  const components = buildComponentBreakdown([
    { component: "video", provider: "fal_ai", model: "Wan 2.2", units: script._meta.totalDuration, unitType: "seconds", costUsd: videoCost },
    { component: "tts", provider: "cartesia", model: "sonic-2", units: allDialogueText.length, unitType: "characters", costUsd: ttsCost },
    { component: "lipsync", provider: "fal_ai", model: "MuseTalk", units: lipsyncClipCount, unitType: "runs", costUsd: lipsyncCost },
    { component: "assembly", provider: "local", model: "FFmpeg", units: 1, unitType: "runs", costUsd: 0 },
  ]);

  const result: PipelineResult = {
    pipelineId: `P3_${Date.now()}`,
    variant: "P3_cheap",
    totalSlices: script._meta.totalSlices,
    totalDurationSec: script._meta.totalDuration,
    components,
    totalCostUsd: totalCost,
    totalWallClockMs,
    costPerSecond: totalCost / script._meta.totalDuration,
    costPerMinute: (totalCost / script._meta.totalDuration) * 60,
    costPer5Min: extrapolateCost(totalCost, 3, 5),
    status: clips.every((c) => c.status === "success") ? "success" : clips.some((c) => c.status === "success") ? "partial" : "failed",
    failedSlices: clips.filter((c) => c.status === "failed").length,
    timestamp: new Date().toISOString(),
  };

  appendPipelineResult(result);
  writeComponentBreakdownCsv(result.pipelineId, components);
  return result;
}

// ─── P4: Decomposed Premium (Hunyuan + ElevenLabs + Hedra + Kling Lip Sync) ─

export async function runP4(script: PilotScript): Promise<PipelineResult> {
  const pipelineTimer = startTimer();
  const clips: ClipResult[] = [];

  const silentSlices = script.slices.filter((s) => !s.audio);
  const dialogueSlices = script.slices.filter((s) => s.audio);
  const actionSlices = script.slices.filter((s) => s.type === "stylised_action");

  // --- Step 1: Silent clips via Hunyuan V1.5 ---
  const hunyuanPricing = pricingData.video.hunyuan_v15_fal;
  const falKey = getProviderKey("fal_ai");
  let silentCost = 0;

  for (let si = 0; si < silentSlices.length; si++) {
    const slice = silentSlices[si];
    console.log(`  [P4] Silent ${si + 1}/${silentSlices.length} (id=${slice.sliceId}, type=${slice.type}) — generating via Hunyuan V1.5...`);
    const timer = startTimer();
    try {
      const { result: output, retryCount } = await withRetry(async () => {
        return await generateHunyuan(falKey, slice);
      });
      const wallClockMs = timer();
      const cost = calculateClipCost(slice.duration, hunyuanPricing.perSecond, null, null);
      silentCost += cost;
      console.log(`  [P4] Silent ${si + 1}/${silentSlices.length} ✓ done in ${(wallClockMs / 1000).toFixed(1)}s — $${cost.toFixed(4)} — ${output.url.slice(0, 80)}...`);

      const clip: ClipResult = {
        ticketId: "P4",
        shotId: `slice_${slice.sliceId}`,
        provider: "fal_ai",
        model: hunyuanPricing.model,
        mode: "standard",
        resolution: hunyuanPricing.resolution,
        durationSec: slice.duration,
        costUsd: cost,
        wallClockMs,
        queueTimeMs: output.queueTimeMs ?? 0,
        generationTimeMs: output.generationTimeMs ?? wallClockMs,
        outputUrl: output.url,
        status: "success",
        error: null,
        retryCount,
        timestamp: new Date().toISOString(),
        metadata: { pipelineVariant: "P4", component: "silent_video" },
      };
      clips.push(clip);
      appendClipResult(clip);
    } catch (err: any) {
      const wallClockMs = timer();
      console.log(`  [P4] Silent ${si + 1}/${silentSlices.length} ✗ FAILED in ${(wallClockMs / 1000).toFixed(1)}s — ${err.message?.slice(0, 100)}`);
      clips.push(makeFailedPipelineClip("P4", slice, "fal_ai", hunyuanPricing.model, wallClockMs, err));
    }
  }

  // --- Step 2: Action clips via Hunyuan LoRA inference ---
  const loraPricing = pricingData.video.hunyuan_lora_fal;
  let loraCost = 0;
  for (const slice of actionSlices) {
    loraCost += loraPricing.perVideo ?? 0.30;
  }

  // --- Step 3: Generate TTS audio with ElevenLabs for each dialogue slice ---
  const ttsPricing = pricingData.tts.elevenlabs;
  let ttsCost = 0;
  const ttsOutputs: Map<number, GenerationOutput> = new Map();

  for (const slice of dialogueSlices) {
    const dialogueText = slice.dialogue?.text ?? "";
    if (!dialogueText) continue;
    const timer = startTimer();
    try {
      const { result: ttsOutput } = await withRetry(async () => {
        return await generateElevenLabsTTSForPipeline(dialogueText);
      });
      const cost = calculateTTSCost(dialogueText.length, ttsPricing.perKChars);
      ttsCost += cost;
      ttsOutputs.set(slice.sliceId, ttsOutput);
      console.log(`  [P4] ElevenLabs TTS for slice ${slice.sliceId}: ${ttsOutput.url} ($${cost.toFixed(4)})`);
    } catch (err) {
      console.error(`  [P4] ElevenLabs TTS failed for slice ${slice.sliceId}:`, err);
    }
  }

  // --- Step 4: Dialogue clips via Hedra Character-3 (uses TTS audio) ---
  const hedraPricing = pricingData.video.hedra_char3;
  let dialogueCost = 0;

  for (let di = 0; di < dialogueSlices.length; di++) {
    const slice = dialogueSlices[di];
    console.log(`  [P4] Dialogue ${di + 1}/${dialogueSlices.length} (id=${slice.sliceId}) — generating via Hedra...`);
    const timer = startTimer();
    try {
      const ttsOutput = ttsOutputs.get(slice.sliceId);
      if (!ttsOutput) throw new Error(`No TTS audio for slice ${slice.sliceId}`);

      const hedraImageUrl = slice.referenceImage ?? "https://placehold.co/512x512/png";
      const { result: output, retryCount } = await withRetry(async () => {
        return await hedraCharacter3({
          imageUrl: hedraImageUrl,
          audioUrl: ttsOutput.url,
          prompt: slice.prompt,
          durationMs: slice.duration * 1000,
        });
      });
      const wallClockMs = timer();
      const cost = calculateClipCost(slice.duration, hedraPricing.perSecond, null, null);
      dialogueCost += cost;
      console.log(`  [P4] Dialogue ${di + 1}/${dialogueSlices.length} ✓ done in ${(wallClockMs / 1000).toFixed(1)}s — $${cost.toFixed(4)} — ${output.url.slice(0, 80)}...`);

      const clip: ClipResult = {
        ticketId: "P4",
        shotId: `slice_${slice.sliceId}`,
        provider: "hedra",
        model: hedraPricing.model,
        mode: "dialogue",
        resolution: hedraPricing.resolution,
        durationSec: slice.duration,
        costUsd: cost,
        wallClockMs,
        queueTimeMs: output.queueTimeMs ?? 0,
        generationTimeMs: output.generationTimeMs ?? wallClockMs,
        outputUrl: output.url,
        status: "success",
        error: null,
        retryCount,
        timestamp: new Date().toISOString(),
        metadata: { pipelineVariant: "P4", component: "dialogue_video" },
      };
      clips.push(clip);
      appendClipResult(clip);
    } catch (err: any) {
      const wallClockMs = timer();
      console.log(`  [P4] Dialogue ${di + 1}/${dialogueSlices.length} ✗ FAILED in ${(wallClockMs / 1000).toFixed(1)}s — ${err.message?.slice(0, 100)}`);
      clips.push(makeFailedPipelineClip("P4", slice, "hedra", hedraPricing.model, wallClockMs, err));
    }
  }

  // --- Step 5: Kling Lip Sync on Hedra dialogue clips for quality refinement ---
  const klingLipsyncPricing = pricingData.video.kling_lipsync_fal;
  let lipsyncCost = 0;
  let lipsyncClipCount = 0;

  const p4LipsyncCandidates = clips.filter(
    (c) => c.metadata?.component === "dialogue_video" && c.status === "success"
  ).slice(0, Math.ceil(dialogueSlices.length * 0.5));

  for (const clip of p4LipsyncCandidates) {
    const sliceId = parseInt(clip.shotId.replace("slice_", ""));
    const ttsOutput = ttsOutputs.get(sliceId);
    if (!clip.outputUrl || !ttsOutput) continue;

    const timer = startTimer();
    try {
      const { result: lsOutput } = await withRetry(async () => {
        return await applyKlingLipSync(clip.outputUrl!, ttsOutput.url);
      });
      const cost = calculateClipCost(10, klingLipsyncPricing.perSecond, null, null);
      lipsyncCost += cost;
      lipsyncClipCount++;
      console.log(`  [P4] Kling Lip Sync on slice ${sliceId}: ${lsOutput.url} ($${cost.toFixed(2)})`);
    } catch (err) {
      console.error(`  [P4] Kling Lip Sync failed on slice ${sliceId}:`, err);
    }
  }

  // --- Step 6: LoRA training (amortised) ---
  const loraTrainingAmortised = (pricingData.training.hunyuan_lora_training.estimatedCost.low + pricingData.training.hunyuan_lora_training.estimatedCost.high) / 2 / 10;

  // --- Assembly ---
  const allDialogueText = dialogueSlices.map((s) => s.dialogue?.text ?? "").join(" ");
  const totalCost = silentCost + loraCost + ttsCost + dialogueCost + lipsyncCost + loraTrainingAmortised;
  const totalWallClockMs = pipelineTimer();

  const components = buildComponentBreakdown([
    { component: "video", provider: "fal_ai", model: "Hunyuan V1.5", units: silentSlices.length * 10, unitType: "seconds", costUsd: silentCost },
    { component: "video", provider: "fal_ai", model: "Hunyuan LoRA", units: actionSlices.length, unitType: "clips", costUsd: loraCost },
    { component: "tts", provider: "elevenlabs", model: "turbo-v2.5", units: allDialogueText.length, unitType: "characters", costUsd: ttsCost },
    { component: "video", provider: "hedra", model: "Character-3", units: dialogueSlices.length * 10, unitType: "seconds", costUsd: dialogueCost },
    { component: "lipsync", provider: "fal_ai", model: "Kling Lip Sync", units: lipsyncClipCount, unitType: "clips", costUsd: lipsyncCost },
    { component: "lora_training", provider: "fal_ai", model: "Hunyuan LoRA Training", units: 1, unitType: "runs", costUsd: loraTrainingAmortised },
    { component: "assembly", provider: "local", model: "FFmpeg", units: 1, unitType: "runs", costUsd: 0 },
  ]);

  const result: PipelineResult = {
    pipelineId: `P4_${Date.now()}`,
    variant: "P4_premium",
    totalSlices: script._meta.totalSlices,
    totalDurationSec: script._meta.totalDuration,
    components,
    totalCostUsd: totalCost,
    totalWallClockMs,
    costPerSecond: totalCost / script._meta.totalDuration,
    costPerMinute: (totalCost / script._meta.totalDuration) * 60,
    costPer5Min: extrapolateCost(totalCost, 3, 5),
    status: clips.every((c) => c.status === "success") ? "success" : clips.some((c) => c.status === "success") ? "partial" : "failed",
    failedSlices: clips.filter((c) => c.status === "failed").length,
    timestamp: new Date().toISOString(),
  };

  appendPipelineResult(result);
  writeComponentBreakdownCsv(result.pipelineId, components);
  return result;
}

// ─── P2b: Wan 2.5 Balanced (Wan 2.5 + ElevenLabs + Hedra + LatentSync) ──────

export async function runP2b(script: PilotScript): Promise<PipelineResult> {
  const pipelineTimer = startTimer();
  const clips: ClipResult[] = [];

  const silentSlices = script.slices.filter((s) => !s.audio);
  const dialogueSlices = script.slices.filter((s) => s.audio);

  // --- Step 1: Silent clips with Wan 2.5 (1080p, cheaper) ---
  const wanPricing = pricingData.video.wan25_fal;
  const falKey = getProviderKey("fal_ai");
  let silentCost = 0;

  for (let si = 0; si < silentSlices.length; si++) {
    const slice = silentSlices[si];
    console.log(`  [P2b] Silent ${si + 1}/${silentSlices.length} (id=${slice.sliceId}, type=${slice.type}) — generating via Wan 2.5...`);
    const timer = startTimer();
    try {
      const { result: output, retryCount } = await withRetry(async () => {
        return await generateWan25(falKey, slice);
      });
      const wallClockMs = timer();
      const cost = calculateClipCost(slice.duration, wanPricing.perSecond, null, null);
      silentCost += cost;
      console.log(`  [P2b] Silent ${si + 1}/${silentSlices.length} ✓ done in ${(wallClockMs / 1000).toFixed(1)}s — $${cost.toFixed(4)} — ${output.url.slice(0, 80)}...`);

      const clip: ClipResult = {
        ticketId: "P2b",
        shotId: `slice_${slice.sliceId}`,
        provider: "fal_ai",
        model: wanPricing.model,
        mode: "standard",
        resolution: wanPricing.resolution,
        durationSec: slice.duration,
        costUsd: cost,
        wallClockMs,
        queueTimeMs: output.queueTimeMs ?? 0,
        generationTimeMs: output.generationTimeMs ?? wallClockMs,
        outputUrl: output.url,
        status: "success",
        error: null,
        retryCount,
        timestamp: new Date().toISOString(),
        metadata: { pipelineVariant: "P2b", component: "silent_video", variant: "wan25" },
      };
      clips.push(clip);
      appendClipResult(clip);
    } catch (err: any) {
      const wallClockMs = timer();
      console.log(`  [P2b] Silent ${si + 1}/${silentSlices.length} ✗ FAILED in ${(wallClockMs / 1000).toFixed(1)}s — ${err.message?.slice(0, 100)}`);
      clips.push(makeFailedPipelineClip("P2b", slice, "fal_ai", wanPricing.model, wallClockMs, err));
    }
  }

  // --- Step 2: TTS with ElevenLabs ---
  const ttsPricing = pricingData.tts.elevenlabs;
  let ttsCost = 0;
  const ttsOutputs: Map<number, GenerationOutput> = new Map();

  for (const slice of dialogueSlices) {
    const dialogueText = slice.dialogue?.text ?? "";
    if (!dialogueText) continue;
    try {
      const { result: ttsOutput } = await withRetry(async () => {
        return await generateElevenLabsTTSForPipeline(dialogueText);
      });
      const cost = calculateTTSCost(dialogueText.length, ttsPricing.perKChars);
      ttsCost += cost;
      ttsOutputs.set(slice.sliceId, ttsOutput);
      console.log(`  [P2b] TTS for slice ${slice.sliceId}: $${cost.toFixed(4)}`);
    } catch (err) {
      console.error(`  [P2b] TTS failed for slice ${slice.sliceId}:`, err);
    }
  }

  // --- Step 3: Dialogue clips with Hedra Character-3 ---
  const hedraPricing = pricingData.video.hedra_char3;
  let dialogueCost = 0;

  for (let di = 0; di < dialogueSlices.length; di++) {
    const slice = dialogueSlices[di];
    console.log(`  [P2b] Dialogue ${di + 1}/${dialogueSlices.length} (id=${slice.sliceId}) — generating via Hedra...`);
    const timer = startTimer();
    try {
      const ttsOutput = ttsOutputs.get(slice.sliceId);
      if (!ttsOutput) throw new Error(`No TTS audio for slice ${slice.sliceId}`);

      const hedraImageUrl = slice.referenceImage ?? "https://placehold.co/512x512/png";
      const { result: output, retryCount } = await withRetry(async () => {
        return await hedraCharacter3({
          imageUrl: hedraImageUrl,
          audioUrl: ttsOutput.url,
          prompt: slice.prompt,
          durationMs: slice.duration * 1000,
        });
      });
      const wallClockMs = timer();
      const cost = calculateClipCost(slice.duration, hedraPricing.perSecond, null, null);
      dialogueCost += cost;
      console.log(`  [P2b] Dialogue ${di + 1}/${dialogueSlices.length} ✓ done in ${(wallClockMs / 1000).toFixed(1)}s — $${cost.toFixed(4)} — ${output.url.slice(0, 80)}...`);

      const clip: ClipResult = {
        ticketId: "P2b",
        shotId: `slice_${slice.sliceId}`,
        provider: "hedra",
        model: hedraPricing.model,
        mode: "dialogue",
        resolution: hedraPricing.resolution,
        durationSec: slice.duration,
        costUsd: cost,
        wallClockMs,
        queueTimeMs: output.queueTimeMs ?? 0,
        generationTimeMs: output.generationTimeMs ?? wallClockMs,
        outputUrl: output.url,
        status: "success",
        error: null,
        retryCount,
        timestamp: new Date().toISOString(),
        metadata: { pipelineVariant: "P2b", component: "dialogue_video" },
      };
      clips.push(clip);
      appendClipResult(clip);
    } catch (err: any) {
      const wallClockMs = timer();
      console.log(`  [P2b] Dialogue ${di + 1}/${dialogueSlices.length} ✗ FAILED in ${(wallClockMs / 1000).toFixed(1)}s — ${err.message?.slice(0, 100)}`);
      clips.push(makeFailedPipelineClip("P2b", slice, "hedra", hedraPricing.model, wallClockMs, err));
    }
  }

  // --- Step 4: LatentSync refinement on ~50% of dialogue clips ---
  const lipsyncPricing = pricingData.video.latentsync_fal;
  let lipsyncCost = 0;
  let lipsyncClipCount = 0;

  const lipsyncCandidates = clips.filter(
    (c) => c.metadata?.component === "dialogue_video" && c.status === "success"
  ).slice(0, Math.ceil(dialogueSlices.length * 0.5));

  for (const clip of lipsyncCandidates) {
    const sliceId = parseInt(clip.shotId.replace("slice_", ""));
    const ttsOutput = ttsOutputs.get(sliceId);
    if (!clip.outputUrl || !ttsOutput) continue;

    try {
      const { result: lsOutput } = await withRetry(async () => {
        return await applyLatentSync(clip.outputUrl!, ttsOutput.url);
      });
      const cost = lipsyncPricing.perClip ?? 0.20;
      lipsyncCost += cost;
      lipsyncClipCount++;
      console.log(`  [P2b] LatentSync on slice ${sliceId}: $${cost.toFixed(2)}`);
    } catch (err) {
      console.error(`  [P2b] LatentSync failed on slice ${sliceId}:`, err);
    }
  }

  // --- Assembly ---
  const allDialogueText = dialogueSlices.map((s) => s.dialogue?.text ?? "").join(" ");
  const totalCost = silentCost + ttsCost + dialogueCost + lipsyncCost;
  const totalWallClockMs = pipelineTimer();

  const components = buildComponentBreakdown([
    { component: "video", provider: "fal_ai", model: "Wan 2.5", units: silentSlices.length * 10, unitType: "seconds", costUsd: silentCost },
    { component: "tts", provider: "elevenlabs", model: "turbo-v2.5", units: allDialogueText.length, unitType: "characters", costUsd: ttsCost },
    { component: "video", provider: "hedra", model: "Character-3", units: dialogueSlices.length * 10, unitType: "seconds", costUsd: dialogueCost },
    { component: "lipsync", provider: "fal_ai", model: "LatentSync", units: lipsyncClipCount, unitType: "clips", costUsd: lipsyncCost },
    { component: "assembly", provider: "local", model: "FFmpeg", units: 1, unitType: "runs", costUsd: 0 },
  ]);

  const result: PipelineResult = {
    pipelineId: `P2b_${Date.now()}`,
    variant: "P2b_balanced_wan25",
    totalSlices: script._meta.totalSlices,
    totalDurationSec: script._meta.totalDuration,
    components,
    totalCostUsd: totalCost,
    totalWallClockMs,
    costPerSecond: totalCost / script._meta.totalDuration,
    costPerMinute: (totalCost / script._meta.totalDuration) * 60,
    costPer5Min: extrapolateCost(totalCost, 3, 5),
    status: clips.every((c) => c.status === "success") ? "success" : clips.some((c) => c.status === "success") ? "partial" : "failed",
    failedSlices: clips.filter((c) => c.status === "failed").length,
    timestamp: new Date().toISOString(),
  };

  appendPipelineResult(result);
  writeComponentBreakdownCsv(result.pipelineId, components);
  return result;
}

// ─── P3b: Wan 2.5 Cheap (Wan 2.5 + Cartesia TTS + MuseTalk) ───────────────

export async function runP3b(script: PilotScript): Promise<PipelineResult> {
  const pipelineTimer = startTimer();
  const clips: ClipResult[] = [];

  const dialogueSlices = script.slices.filter((s) => s.audio);

  // --- Step 1: ALL 18 clips via Wan 2.5 (1080p, $0.05/sec) ---
  const wanPricing = pricingData.video.wan25_fal;
  const falKey = getProviderKey("fal_ai");
  let videoCost = 0;

  for (let vi = 0; vi < script.slices.length; vi++) {
    const slice = script.slices[vi];
    console.log(`  [P3b] Video ${vi + 1}/${script.slices.length} (id=${slice.sliceId}, type=${slice.type}) — generating via Wan 2.5...`);
    const timer = startTimer();
    try {
      const { result: output, retryCount } = await withRetry(async () => {
        return await generateWan25(falKey, slice);
      });
      const wallClockMs = timer();
      const cost = calculateClipCost(slice.duration, wanPricing.perSecond, null, null);
      videoCost += cost;
      console.log(`  [P3b] Video ${vi + 1}/${script.slices.length} ✓ done in ${(wallClockMs / 1000).toFixed(1)}s — $${cost.toFixed(4)} — ${output.url.slice(0, 80)}...`);

      const clip: ClipResult = {
        ticketId: "P3b",
        shotId: `slice_${slice.sliceId}`,
        provider: "fal_ai",
        model: wanPricing.model,
        mode: "standard",
        resolution: wanPricing.resolution,
        durationSec: slice.duration,
        costUsd: cost,
        wallClockMs,
        queueTimeMs: output.queueTimeMs ?? 0,
        generationTimeMs: output.generationTimeMs ?? wallClockMs,
        outputUrl: output.url,
        status: "success",
        error: null,
        retryCount,
        timestamp: new Date().toISOString(),
        metadata: { pipelineVariant: "P3b", component: "video", variant: "wan25" },
      };
      clips.push(clip);
      appendClipResult(clip);
    } catch (err: any) {
      const wallClockMs = timer();
      console.log(`  [P3b] Video ${vi + 1}/${script.slices.length} ✗ FAILED in ${(wallClockMs / 1000).toFixed(1)}s — ${err.message?.slice(0, 100)}`);
      clips.push(makeFailedPipelineClip("P3b", slice, "fal_ai", wanPricing.model, wallClockMs, err));
    }
  }

  // --- Step 2: TTS with Cartesia ---
  const ttsPricing = pricingData.tts.cartesia;
  let ttsCost = 0;
  const ttsOutputs: Map<number, GenerationOutput> = new Map();

  for (const slice of dialogueSlices) {
    const dialogueText = slice.dialogue?.text ?? "";
    if (!dialogueText) continue;
    try {
      const { result: ttsOutput } = await withRetry(async () => {
        return await generateCartesiaTTSForPipeline(dialogueText);
      });
      const cost = calculateTTSCost(dialogueText.length, ttsPricing.perKChars);
      ttsCost += cost;
      ttsOutputs.set(slice.sliceId, ttsOutput);
      console.log(`  [P3b] Cartesia TTS for slice ${slice.sliceId}: $${cost.toFixed(4)}`);
    } catch (err) {
      console.error(`  [P3b] Cartesia TTS failed for slice ${slice.sliceId}:`, err);
    }
  }

  // --- Step 3: MuseTalk lipsync on dialogue clips ---
  const musetalkPricing = pricingData.video.musetalk_replicate;
  let lipsyncCost = 0;
  let lipsyncClipCount = 0;

  for (const slice of dialogueSlices) {
    const ttsOutput = ttsOutputs.get(slice.sliceId);
    const videoClip = clips.find(
      (c) => c.shotId === `slice_${slice.sliceId}` && c.status === "success"
    );
    if (!ttsOutput || !videoClip?.outputUrl) {
      console.warn(`  [P3b] Skipping MuseTalk for slice ${slice.sliceId}: missing TTS or video`);
      continue;
    }

    try {
      const { result: mtOutput } = await withRetry(async () => {
        return await applyMuseTalk(videoClip.outputUrl!, ttsOutput.url);
      });
      const cost = musetalkPricing.perRun ?? 0.42;
      lipsyncCost += cost;
      lipsyncClipCount++;
      videoClip.outputUrl = mtOutput.url;
      console.log(`  [P3b] MuseTalk on slice ${slice.sliceId}: $${cost.toFixed(2)}`);
    } catch (err) {
      console.error(`  [P3b] MuseTalk failed on slice ${slice.sliceId}:`, err);
    }
  }

  // --- Assembly ---
  const allDialogueText = dialogueSlices.map((s) => s.dialogue?.text ?? "").join(" ");
  const totalCost = videoCost + ttsCost + lipsyncCost;
  const totalWallClockMs = pipelineTimer();

  const components = buildComponentBreakdown([
    { component: "video", provider: "fal_ai", model: "Wan 2.5", units: script._meta.totalDuration, unitType: "seconds", costUsd: videoCost },
    { component: "tts", provider: "cartesia", model: "sonic-2", units: allDialogueText.length, unitType: "characters", costUsd: ttsCost },
    { component: "lipsync", provider: "fal_ai", model: "MuseTalk", units: lipsyncClipCount, unitType: "runs", costUsd: lipsyncCost },
    { component: "assembly", provider: "local", model: "FFmpeg", units: 1, unitType: "runs", costUsd: 0 },
  ]);

  const result: PipelineResult = {
    pipelineId: `P3b_${Date.now()}`,
    variant: "P3b_cheap_wan25",
    totalSlices: script._meta.totalSlices,
    totalDurationSec: script._meta.totalDuration,
    components,
    totalCostUsd: totalCost,
    totalWallClockMs,
    costPerSecond: totalCost / script._meta.totalDuration,
    costPerMinute: (totalCost / script._meta.totalDuration) * 60,
    costPer5Min: extrapolateCost(totalCost, 3, 5),
    status: clips.every((c) => c.status === "success") ? "success" : clips.some((c) => c.status === "success") ? "partial" : "failed",
    failedSlices: clips.filter((c) => c.status === "failed").length,
    timestamp: new Date().toISOString(),
  };

  appendPipelineResult(result);
  writeComponentBreakdownCsv(result.pipelineId, components);
  return result;
}

// ─── P5: Hybrid (Kling Omni for action + Wan 2.5 + ElevenLabs + Hedra + LatentSync for rest) ──

/**
 * P5 — Hybrid Pipeline
 *
 * Routes action-tagged slices (silent_action, stylised_action, dialogue_action)
 * to Kling V3 Omni for reliable action rendering, and routes all non-action
 * slices through the P2b decomposed path:
 *   - Silent establishing → Wan 2.5 (image-to-video)
 *   - Dialogue closeup → ElevenLabs TTS + Hedra Character-3 + LatentSync
 *
 * This captures P2b's cost efficiency on 83% of clips and P1's action quality
 * on the 17% that need it.
 */
export async function runP5(script: PilotScript): Promise<PipelineResult> {
  const pipelineTimer = startTimer();
  const clips: ClipResult[] = [];
  const falKey = getProviderKey("fal_ai");

  // Classify slices by routing target
  const isActionSlice = (s: Slice) =>
    s.type.includes("action") || s.type === "stylised_action";

  const actionSlices = script.slices.filter(isActionSlice);
  const nonActionSlices = script.slices.filter((s) => !isActionSlice(s));
  const silentSlices = nonActionSlices.filter((s) => !s.audio);
  const dialogueSlices = nonActionSlices.filter((s) => s.audio);

  console.log(`  [P5] Hybrid routing: ${actionSlices.length} action → Kling Omni, ${silentSlices.length} silent → Wan 2.5, ${dialogueSlices.length} dialogue → Hedra`);

  // ─── Step 1: Action slices via Kling V3 Omni ───────────────────────────────
  const klingPricing = pricingData.video.kling_v3_omni_fal;
  let actionCost = 0;

  for (let ai = 0; ai < actionSlices.length; ai++) {
    const slice = actionSlices[ai];
    console.log(`  [P5] Action ${ai + 1}/${actionSlices.length} (id=${slice.sliceId}, type=${slice.type}) — generating via Kling Omni...`);
    const timer = startTimer();
    try {
      const { result: output, retryCount } = await withRetry(async () => {
        return await generateKlingOmni(falKey, slice);
      });
      const wallClockMs = timer();
      const cost = calculateClipCost(slice.duration, klingPricing.perSecond, null, null);
      actionCost += cost;
      console.log(`  [P5] Action ${ai + 1}/${actionSlices.length} ✓ done in ${(wallClockMs / 1000).toFixed(1)}s — $${cost.toFixed(4)} — ${output.url.slice(0, 80)}...`);

      const clip: ClipResult = {
        ticketId: "P5",
        shotId: `slice_${slice.sliceId}`,
        provider: "fal_ai",
        model: klingPricing.model,
        mode: "omni",
        resolution: klingPricing.resolution,
        durationSec: slice.duration,
        costUsd: cost,
        wallClockMs,
        queueTimeMs: output.queueTimeMs ?? 0,
        generationTimeMs: output.generationTimeMs ?? wallClockMs,
        outputUrl: output.url,
        status: "success",
        error: null,
        retryCount,
        timestamp: new Date().toISOString(),
        metadata: { pipelineVariant: "P5", component: "action_video", router: "kling_omni" },
      };
      clips.push(clip);
      appendClipResult(clip);
    } catch (err: any) {
      const wallClockMs = timer();
      console.log(`  [P5] Action ${ai + 1}/${actionSlices.length} ✗ FAILED in ${(wallClockMs / 1000).toFixed(1)}s — ${err.message?.slice(0, 100)}`);
      clips.push(makeFailedPipelineClip("P5", slice, "fal_ai", klingPricing.model, wallClockMs, err));
    }
  }

  // ─── Step 2: Silent establishing slices via Wan 2.5 ────────────────────────
  const wanPricing = pricingData.video.wan25_fal;
  let silentCost = 0;

  for (let si = 0; si < silentSlices.length; si++) {
    const slice = silentSlices[si];
    console.log(`  [P5] Silent ${si + 1}/${silentSlices.length} (id=${slice.sliceId}, type=${slice.type}) — generating via Wan 2.5...`);
    const timer = startTimer();
    try {
      const { result: output, retryCount } = await withRetry(async () => {
        return await generateWan25(falKey, slice);
      });
      const wallClockMs = timer();
      const cost = calculateClipCost(slice.duration, wanPricing.perSecond, null, null);
      silentCost += cost;
      console.log(`  [P5] Silent ${si + 1}/${silentSlices.length} ✓ done in ${(wallClockMs / 1000).toFixed(1)}s — $${cost.toFixed(4)} — ${output.url.slice(0, 80)}...`);

      const clip: ClipResult = {
        ticketId: "P5",
        shotId: `slice_${slice.sliceId}`,
        provider: "fal_ai",
        model: wanPricing.model,
        mode: "standard",
        resolution: wanPricing.resolution,
        durationSec: slice.duration,
        costUsd: cost,
        wallClockMs,
        queueTimeMs: output.queueTimeMs ?? 0,
        generationTimeMs: output.generationTimeMs ?? wallClockMs,
        outputUrl: output.url,
        status: "success",
        error: null,
        retryCount,
        timestamp: new Date().toISOString(),
        metadata: { pipelineVariant: "P5", component: "silent_video", router: "wan25" },
      };
      clips.push(clip);
      appendClipResult(clip);
    } catch (err: any) {
      const wallClockMs = timer();
      console.log(`  [P5] Silent ${si + 1}/${silentSlices.length} ✗ FAILED in ${(wallClockMs / 1000).toFixed(1)}s — ${err.message?.slice(0, 100)}`);
      clips.push(makeFailedPipelineClip("P5", slice, "fal_ai", wanPricing.model, wallClockMs, err));
    }
  }

  // ─── Step 3: TTS with ElevenLabs for dialogue slices ───────────────────────
  const ttsPricing = pricingData.tts.elevenlabs;
  let ttsCost = 0;
  const ttsOutputs: Map<number, GenerationOutput> = new Map();

  for (const slice of dialogueSlices) {
    const dialogueText = slice.dialogue?.text ?? "";
    if (!dialogueText) continue;
    try {
      const { result: ttsOutput } = await withRetry(async () => {
        return await generateElevenLabsTTSForPipeline(dialogueText);
      });
      const cost = calculateTTSCost(dialogueText.length, ttsPricing.perKChars);
      ttsCost += cost;
      ttsOutputs.set(slice.sliceId, ttsOutput);
      console.log(`  [P5] TTS for slice ${slice.sliceId}: $${cost.toFixed(4)}`);
    } catch (err) {
      console.error(`  [P5] TTS failed for slice ${slice.sliceId}:`, err);
    }
  }

  // ─── Step 4: Dialogue clips via Hedra Character-3 ─────────────────────────
  const hedraPricing = pricingData.video.hedra_char3;
  let dialogueCost = 0;

  for (let di = 0; di < dialogueSlices.length; di++) {
    const slice = dialogueSlices[di];
    console.log(`  [P5] Dialogue ${di + 1}/${dialogueSlices.length} (id=${slice.sliceId}) — generating via Hedra...`);
    const timer = startTimer();
    try {
      const ttsOutput = ttsOutputs.get(slice.sliceId);
      if (!ttsOutput) throw new Error(`No TTS audio for slice ${slice.sliceId}`);

      const hedraImageUrl = slice.referenceImage ?? "https://placehold.co/512x512/png";
      const { result: output, retryCount } = await withRetry(async () => {
        return await hedraCharacter3({
          imageUrl: hedraImageUrl,
          audioUrl: ttsOutput.url,
          prompt: slice.prompt,
          durationMs: slice.duration * 1000,
        });
      });
      const wallClockMs = timer();
      const cost = calculateClipCost(slice.duration, hedraPricing.perSecond, null, null);
      dialogueCost += cost;
      console.log(`  [P5] Dialogue ${di + 1}/${dialogueSlices.length} ✓ done in ${(wallClockMs / 1000).toFixed(1)}s — $${cost.toFixed(4)} — ${output.url.slice(0, 80)}...`);

      const clip: ClipResult = {
        ticketId: "P5",
        shotId: `slice_${slice.sliceId}`,
        provider: "hedra",
        model: hedraPricing.model,
        mode: "dialogue",
        resolution: hedraPricing.resolution,
        durationSec: slice.duration,
        costUsd: cost,
        wallClockMs,
        queueTimeMs: output.queueTimeMs ?? 0,
        generationTimeMs: output.generationTimeMs ?? wallClockMs,
        outputUrl: output.url,
        status: "success",
        error: null,
        retryCount,
        timestamp: new Date().toISOString(),
        metadata: { pipelineVariant: "P5", component: "dialogue_video", router: "hedra" },
      };
      clips.push(clip);
      appendClipResult(clip);
    } catch (err: any) {
      const wallClockMs = timer();
      console.log(`  [P5] Dialogue ${di + 1}/${dialogueSlices.length} ✗ FAILED in ${(wallClockMs / 1000).toFixed(1)}s — ${err.message?.slice(0, 100)}`);
      clips.push(makeFailedPipelineClip("P5", slice, "hedra", hedraPricing.model, wallClockMs, err));
    }
  }

  // ─── Step 5: LatentSync refinement on ~50% of dialogue clips ───────────────
  const lipsyncPricing = pricingData.video.latentsync_fal;
  let lipsyncCost = 0;
  let lipsyncClipCount = 0;

  const lipsyncCandidates = clips.filter(
    (c) => c.metadata?.component === "dialogue_video" && c.status === "success"
  ).slice(0, Math.ceil(dialogueSlices.length * 0.5));

  for (const clip of lipsyncCandidates) {
    const sliceId = parseInt(clip.shotId.replace("slice_", ""));
    const ttsOutput = ttsOutputs.get(sliceId);
    if (!clip.outputUrl || !ttsOutput) continue;

    try {
      const { result: lsOutput } = await withRetry(async () => {
        return await applyLatentSync(clip.outputUrl!, ttsOutput.url);
      });
      const cost = lipsyncPricing.perClip ?? 0.20;
      lipsyncCost += cost;
      lipsyncClipCount++;
      console.log(`  [P5] LatentSync on slice ${sliceId}: $${cost.toFixed(2)}`);
    } catch (err) {
      console.error(`  [P5] LatentSync failed on slice ${sliceId}:`, err);
    }
  }

  // ─── Assembly ──────────────────────────────────────────────────────────────
  const allDialogueText = dialogueSlices.map((s) => s.dialogue?.text ?? "").join(" ");
  const totalCost = actionCost + silentCost + ttsCost + dialogueCost + lipsyncCost;
  const totalWallClockMs = pipelineTimer();

  const actionDurationSec = actionSlices.reduce((sum, s) => sum + s.duration, 0);
  const silentDurationSec = silentSlices.reduce((sum, s) => sum + s.duration, 0);
  const dialogueDurationSec = dialogueSlices.reduce((sum, s) => sum + s.duration, 0);

  const components = buildComponentBreakdown([
    { component: "video", provider: "fal_ai", model: "Kling V3 Omni (action)", units: actionDurationSec, unitType: "seconds", costUsd: actionCost },
    { component: "video", provider: "fal_ai", model: "Wan 2.5 (silent)", units: silentDurationSec, unitType: "seconds", costUsd: silentCost },
    { component: "tts", provider: "elevenlabs", model: "turbo-v2.5", units: allDialogueText.length, unitType: "characters", costUsd: ttsCost },
    { component: "video", provider: "hedra", model: "Character-3 (dialogue)", units: dialogueDurationSec, unitType: "seconds", costUsd: dialogueCost },
    { component: "lipsync", provider: "fal_ai", model: "LatentSync", units: lipsyncClipCount, unitType: "clips", costUsd: lipsyncCost },
    { component: "assembly", provider: "local", model: "FFmpeg", units: 1, unitType: "runs", costUsd: 0 },
  ]);

  const result: PipelineResult = {
    pipelineId: `P5_${Date.now()}`,
    variant: "P5_hybrid",
    totalSlices: script._meta.totalSlices,
    totalDurationSec: script._meta.totalDuration,
    components,
    totalCostUsd: totalCost,
    totalWallClockMs,
    costPerSecond: totalCost / script._meta.totalDuration,
    costPerMinute: (totalCost / script._meta.totalDuration) * 60,
    costPer5Min: extrapolateCost(totalCost, 3, 5),
    status: clips.every((c) => c.status === "success") ? "success" : clips.some((c) => c.status === "success") ? "partial" : "failed",
    failedSlices: clips.filter((c) => c.status === "failed").length,
    timestamp: new Date().toISOString(),
  };

  appendPipelineResult(result);
  writeComponentBreakdownCsv(result.pipelineId, components);
  return result;
}

// ─── P6: All Wan 2.5 (No Kling) with 16:9 Reference Images ────────────────────
// Uses the 16:9 pilot script variant. Routes ALL slices (including action) through
// Wan 2.5, with ElevenLabs TTS + Hedra for dialogue, and LatentSync refinement.
// Goal: eliminate Kling dependency entirely and test if 16:9 fixes the 422 errors.

export async function runP6(script: PilotScript): Promise<PipelineResult> {
  const pipelineTimer = startTimer();
  const clips: ClipResult[] = [];
  const falKey = getProviderKey("fal_ai");

  // All slices go through Wan 2.5 or Hedra — no Kling routing
  const silentSlices = script.slices.filter((s) => !s.audio);
  const dialogueSlices = script.slices.filter((s) => s.audio);

  console.log(`  [P6] All-Wan 2.5 routing: ${silentSlices.length} silent (incl. action) → Wan 2.5, ${dialogueSlices.length} dialogue → Hedra`);

  // ─── Step 1: ALL silent slices (establishing + action) via Wan 2.5 ───────────
  const wanPricing = pricingData.video.wan25_fal;
  let silentCost = 0;

  for (let si = 0; si < silentSlices.length; si++) {
    const slice = silentSlices[si];
    console.log(`  [P6] Silent ${si + 1}/${silentSlices.length} (id=${slice.sliceId}, type=${slice.type}) — generating via Wan 2.5...`);
    const timer = startTimer();
    try {
      const { result: output, retryCount } = await withRetry(async () => {
        return await generateWan25(falKey, slice);
      });
      const wallClockMs = timer();
      const cost = calculateClipCost(slice.duration, wanPricing.perSecond, null, null);
      silentCost += cost;
      console.log(`  [P6] Silent ${si + 1}/${silentSlices.length} ✓ done in ${(wallClockMs / 1000).toFixed(1)}s — $${cost.toFixed(4)} — ${output.url.slice(0, 80)}...`);

      const clip: ClipResult = {
        ticketId: "P6",
        shotId: `slice_${slice.sliceId}`,
        provider: "fal_ai",
        model: wanPricing.model,
        mode: "standard",
        resolution: wanPricing.resolution,
        durationSec: slice.duration,
        costUsd: cost,
        wallClockMs,
        queueTimeMs: output.queueTimeMs ?? 0,
        generationTimeMs: output.generationTimeMs ?? wallClockMs,
        outputUrl: output.url,
        status: "success",
        error: null,
        retryCount,
        timestamp: new Date().toISOString(),
        metadata: { pipelineVariant: "P6", component: "silent_video", router: "wan25", sliceType: slice.type },
      };
      clips.push(clip);
      appendClipResult(clip);
    } catch (err: any) {
      const wallClockMs = timer();
      console.log(`  [P6] Silent ${si + 1}/${silentSlices.length} ✗ FAILED in ${(wallClockMs / 1000).toFixed(1)}s — ${err.message?.slice(0, 100)}`);
      clips.push(makeFailedPipelineClip("P6", slice, "fal_ai", wanPricing.model, wallClockMs, err));
    }
  }

  // ─── Step 2: TTS with ElevenLabs for dialogue slices ──────────────────────────
  const ttsPricing = pricingData.tts.elevenlabs;
  let ttsCost = 0;
  const ttsOutputs: Map<number, GenerationOutput> = new Map();

  for (const slice of dialogueSlices) {
    const dialogueText = slice.dialogue?.text ?? "";
    if (!dialogueText) continue;
    try {
      const { result: ttsOutput } = await withRetry(async () => {
        return await generateElevenLabsTTSForPipeline(dialogueText);
      });
      const cost = calculateTTSCost(dialogueText.length, ttsPricing.perKChars);
      ttsCost += cost;
      ttsOutputs.set(slice.sliceId, ttsOutput);
      console.log(`  [P6] TTS for slice ${slice.sliceId}: $${cost.toFixed(4)}`);
    } catch (err) {
      console.error(`  [P6] TTS failed for slice ${slice.sliceId}:`, err);
    }
  }

  // ─── Step 3: Dialogue clips via Hedra Character-3 ─────────────────────────────
  const hedraPricing = pricingData.video.hedra_char3;
  let dialogueCost = 0;

  for (let di = 0; di < dialogueSlices.length; di++) {
    const slice = dialogueSlices[di];
    console.log(`  [P6] Dialogue ${di + 1}/${dialogueSlices.length} (id=${slice.sliceId}) — generating via Hedra...`);
    const timer = startTimer();
    try {
      const ttsOutput = ttsOutputs.get(slice.sliceId);
      if (!ttsOutput) throw new Error(`No TTS audio for slice ${slice.sliceId}`);

      const hedraImageUrl = slice.referenceImage ?? "https://placehold.co/512x512/png";
      const { result: output, retryCount } = await withRetry(async () => {
        return await hedraCharacter3({
          imageUrl: hedraImageUrl,
          audioUrl: ttsOutput.url,
          prompt: slice.prompt,
          durationMs: slice.duration * 1000,
        });
      });
      const wallClockMs = timer();
      const cost = calculateClipCost(slice.duration, hedraPricing.perSecond, null, null);
      dialogueCost += cost;
      console.log(`  [P6] Dialogue ${di + 1}/${dialogueSlices.length} ✓ done in ${(wallClockMs / 1000).toFixed(1)}s — $${cost.toFixed(4)} — ${output.url.slice(0, 80)}...`);

      const clip: ClipResult = {
        ticketId: "P6",
        shotId: `slice_${slice.sliceId}`,
        provider: "hedra",
        model: hedraPricing.model,
        mode: "dialogue",
        resolution: hedraPricing.resolution,
        durationSec: slice.duration,
        costUsd: cost,
        wallClockMs,
        queueTimeMs: output.queueTimeMs ?? 0,
        generationTimeMs: output.generationTimeMs ?? wallClockMs,
        outputUrl: output.url,
        status: "success",
        error: null,
        retryCount,
        timestamp: new Date().toISOString(),
        metadata: { pipelineVariant: "P6", component: "dialogue_video", router: "hedra" },
      };
      clips.push(clip);
      appendClipResult(clip);
    } catch (err: any) {
      const wallClockMs = timer();
      console.log(`  [P6] Dialogue ${di + 1}/${dialogueSlices.length} ✗ FAILED in ${(wallClockMs / 1000).toFixed(1)}s — ${err.message?.slice(0, 100)}`);
      clips.push(makeFailedPipelineClip("P6", slice, "hedra", hedraPricing.model, wallClockMs, err));
    }
  }

  // ─── Step 4: LatentSync refinement on ~50% of dialogue clips ──────────────────
  const lipsyncPricing = pricingData.video.latentsync_fal;
  let lipsyncCost = 0;
  let lipsyncClipCount = 0;

  const lipsyncCandidates = clips.filter(
    (c) => c.metadata?.component === "dialogue_video" && c.status === "success"
  ).slice(0, Math.ceil(dialogueSlices.length * 0.5));

  for (const clip of lipsyncCandidates) {
    const sliceId = parseInt(clip.shotId.replace("slice_", ""));
    const ttsOutput = ttsOutputs.get(sliceId);
    if (!clip.outputUrl || !ttsOutput) continue;

    try {
      const { result: lsOutput } = await withRetry(async () => {
        return await applyLatentSync(clip.outputUrl!, ttsOutput.url);
      });
      const cost = lipsyncPricing.perClip ?? 0.20;
      lipsyncCost += cost;
      lipsyncClipCount++;
      console.log(`  [P6] LatentSync on slice ${sliceId}: $${cost.toFixed(2)}`);
    } catch (err) {
      console.error(`  [P6] LatentSync failed on slice ${sliceId}:`, err);
    }
  }

  // ─── Assembly ──────────────────────────────────────────────────────────────────
  const allDialogueText = dialogueSlices.map((s) => s.dialogue?.text ?? "").join(" ");
  const totalCost = silentCost + ttsCost + dialogueCost + lipsyncCost;
  const totalWallClockMs = pipelineTimer();

  const silentDurationSec = silentSlices.reduce((sum, s) => sum + s.duration, 0);
  const dialogueDurationSec = dialogueSlices.reduce((sum, s) => sum + s.duration, 0);

  const components = buildComponentBreakdown([
    { component: "video", provider: "fal_ai", model: "Wan 2.5 (all silent incl. action)", units: silentDurationSec, unitType: "seconds", costUsd: silentCost },
    { component: "tts", provider: "elevenlabs", model: "turbo-v2.5", units: allDialogueText.length, unitType: "characters", costUsd: ttsCost },
    { component: "video", provider: "hedra", model: "Character-3 (dialogue)", units: dialogueDurationSec, unitType: "seconds", costUsd: dialogueCost },
    { component: "lipsync", provider: "fal_ai", model: "LatentSync", units: lipsyncClipCount, unitType: "clips", costUsd: lipsyncCost },
    { component: "assembly", provider: "local", model: "FFmpeg", units: 1, unitType: "runs", costUsd: 0 },
  ]);

  const result: PipelineResult = {
    pipelineId: `P6_${Date.now()}`,
    variant: "P6_all_wan25_16x9",
    totalSlices: script._meta.totalSlices,
    totalDurationSec: script._meta.totalDuration,
    components,
    totalCostUsd: totalCost,
    totalWallClockMs,
    costPerSecond: totalCost / script._meta.totalDuration,
    costPerMinute: (totalCost / script._meta.totalDuration) * 60,
    costPer5Min: extrapolateCost(totalCost, 3, 5),
    status: clips.every((c) => c.status === "success") ? "success" : clips.some((c) => c.status === "success") ? "partial" : "failed",
    failedSlices: clips.filter((c) => c.status === "failed").length,
    timestamp: new Date().toISOString(),
  };

  appendPipelineResult(result);
  writeComponentBreakdownCsv(result.pipelineId, components);
  return result;
}

// ─── P7: Improved All Wan 2.5 — Character Voices + LatentSync S3 Fix ─────────
// Based on P6 but with:
// 1. Character-specific ElevenLabs voices (Mira → Sarah, Ren → Harry)
// 2. Hedra clips re-uploaded to S3 before LatentSync (fixes 422 expiring URLs)
// 3. Softened action prompts (v2 script) to avoid Wan 2.5 content filter
// 4. LatentSync applied to ALL dialogue clips (not just 50%)

const VOICE_MAP: Record<string, string> = {
  Mira: "EXAVITQu4vr4xnSDxMaL",  // Sarah — young female, confident
  Ren: "SOYHLrjzK2X1ezoPC6cr",    // Harry — young male
};
const DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM"; // Rachel (fallback)

export async function runP7(script: PilotScript): Promise<PipelineResult> {
  const pipelineTimer = startTimer();
  const clips: ClipResult[] = [];
  const falKey = getProviderKey("fal_ai");

  const silentSlices = script.slices.filter((s) => !s.audio);
  const dialogueSlices = script.slices.filter((s) => s.audio);

  console.log(`  [P7] Improved All-Wan 2.5: ${silentSlices.length} silent → Wan 2.5, ${dialogueSlices.length} dialogue → Hedra (char voices + S3 re-upload)`);

  // ─── Step 1: ALL silent slices (establishing + action) via Wan 2.5 ───────────
  const wanPricing = pricingData.video.wan25_fal;
  let silentCost = 0;

  for (let si = 0; si < silentSlices.length; si++) {
    const slice = silentSlices[si];
    console.log(`  [P7] Silent ${si + 1}/${silentSlices.length} (id=${slice.sliceId}, type=${slice.type}) — generating via Wan 2.5...`);
    const timer = startTimer();
    try {
      const { result: output, retryCount } = await withRetry(async () => {
        return await generateWan25(falKey, slice);
      });
      const wallClockMs = timer();
      const cost = calculateClipCost(slice.duration, wanPricing.perSecond, null, null);
      silentCost += cost;
      console.log(`  [P7] Silent ${si + 1}/${silentSlices.length} ✓ done in ${(wallClockMs / 1000).toFixed(1)}s — $${cost.toFixed(4)} — ${output.url.slice(0, 80)}...`);

      const clip: ClipResult = {
        ticketId: "P7",
        shotId: `slice_${slice.sliceId}`,
        provider: "fal_ai",
        model: wanPricing.model,
        mode: "standard",
        resolution: wanPricing.resolution,
        durationSec: slice.duration,
        costUsd: cost,
        wallClockMs,
        queueTimeMs: output.queueTimeMs ?? 0,
        generationTimeMs: output.generationTimeMs ?? wallClockMs,
        outputUrl: output.url,
        status: "success",
        error: null,
        retryCount,
        timestamp: new Date().toISOString(),
        metadata: { pipelineVariant: "P7", component: "silent_video", router: "wan25", sliceType: slice.type },
      };
      clips.push(clip);
      appendClipResult(clip);
    } catch (err: any) {
      const wallClockMs = timer();
      console.log(`  [P7] Silent ${si + 1}/${silentSlices.length} ✗ FAILED in ${(wallClockMs / 1000).toFixed(1)}s — ${err.message?.slice(0, 100)}`);
      clips.push(makeFailedPipelineClip("P7", slice, "fal_ai", wanPricing.model, wallClockMs, err));
    }
  }

  // ─── Step 2: TTS with ElevenLabs — character-specific voices ──────────────────
  const ttsPricing = pricingData.tts.elevenlabs;
  let ttsCost = 0;
  const ttsOutputs: Map<number, GenerationOutput> = new Map();

  for (const slice of dialogueSlices) {
    const dialogueText = slice.dialogue?.text ?? "";
    if (!dialogueText) continue;
    const character = slice.dialogue?.character ?? "";
    const voiceId = VOICE_MAP[character] ?? DEFAULT_VOICE;
    console.log(`  [P7] TTS for slice ${slice.sliceId} (${character}) — voice: ${character === "Mira" ? "Sarah" : character === "Ren" ? "Harry" : "Rachel"}`);
    try {
      const { result: ttsOutput } = await withRetry(async () => {
        return await elevenLabsTTS({ text: dialogueText, voiceId });
      });
      const cost = calculateTTSCost(dialogueText.length, ttsPricing.perKChars);
      ttsCost += cost;
      ttsOutputs.set(slice.sliceId, ttsOutput);
      console.log(`  [P7] TTS for slice ${slice.sliceId}: $${cost.toFixed(4)}`);
    } catch (err) {
      console.error(`  [P7] TTS failed for slice ${slice.sliceId}:`, err);
    }
  }

  // ─── Step 3: Dialogue clips via Hedra Character-3 ─────────────────────────────
  const hedraPricing = pricingData.video.hedra_char3;
  let dialogueCost = 0;

  for (let di = 0; di < dialogueSlices.length; di++) {
    const slice = dialogueSlices[di];
    console.log(`  [P7] Dialogue ${di + 1}/${dialogueSlices.length} (id=${slice.sliceId}, char=${slice.dialogue?.character}) — generating via Hedra...`);
    const timer = startTimer();
    try {
      const ttsOutput = ttsOutputs.get(slice.sliceId);
      if (!ttsOutput) throw new Error(`No TTS audio for slice ${slice.sliceId}`);

      const hedraImageUrl = slice.referenceImage ?? "https://placehold.co/512x512/png";
      const { result: output, retryCount } = await withRetry(async () => {
        return await hedraCharacter3({
          imageUrl: hedraImageUrl,
          audioUrl: ttsOutput.url,
          prompt: slice.prompt,
          durationMs: slice.duration * 1000,
        });
      });
      const wallClockMs = timer();
      const cost = calculateClipCost(slice.duration, hedraPricing.perSecond, null, null);
      dialogueCost += cost;
      console.log(`  [P7] Dialogue ${di + 1}/${dialogueSlices.length} ✓ done in ${(wallClockMs / 1000).toFixed(1)}s — $${cost.toFixed(4)} — ${output.url.slice(0, 80)}...`);

      const clip: ClipResult = {
        ticketId: "P7",
        shotId: `slice_${slice.sliceId}`,
        provider: "hedra",
        model: hedraPricing.model,
        mode: "dialogue",
        resolution: hedraPricing.resolution,
        durationSec: slice.duration,
        costUsd: cost,
        wallClockMs,
        queueTimeMs: output.queueTimeMs ?? 0,
        generationTimeMs: output.generationTimeMs ?? wallClockMs,
        outputUrl: output.url,
        status: "success",
        error: null,
        retryCount,
        timestamp: new Date().toISOString(),
        metadata: { pipelineVariant: "P7", component: "dialogue_video", router: "hedra" },
      };
      clips.push(clip);
      appendClipResult(clip);
    } catch (err: any) {
      const wallClockMs = timer();
      console.log(`  [P7] Dialogue ${di + 1}/${dialogueSlices.length} ✗ FAILED in ${(wallClockMs / 1000).toFixed(1)}s — ${err.message?.slice(0, 100)}`);
      clips.push(makeFailedPipelineClip("P7", slice, "hedra", hedraPricing.model, wallClockMs, err));
    }
  }

  // ─── Step 4: LatentSync on ALL dialogue clips (with S3 re-upload fix) ─────────
  // P6 issue: Hedra returns presigned AWS URLs that expire before LatentSync can
  // access them, causing 422 errors. Fix: download Hedra clip → re-upload to S3
  // → pass persistent S3 URL to LatentSync.
  const lipsyncPricing = pricingData.video.latentsync_fal;
  let lipsyncCost = 0;
  let lipsyncClipCount = 0;
  let lipsyncSuccessCount = 0;

  const lipsyncCandidates = clips.filter(
    (c) => c.metadata?.component === "dialogue_video" && c.status === "success"
  );

  console.log(`  [P7] LatentSync: processing ALL ${lipsyncCandidates.length} successful dialogue clips (with S3 re-upload)...`);

  for (const clip of lipsyncCandidates) {
    const sliceId = parseInt(clip.shotId.replace("slice_", ""));
    const ttsOutput = ttsOutputs.get(sliceId);
    if (!clip.outputUrl || !ttsOutput) continue;

    lipsyncClipCount++;
    try {
      // Download Hedra clip and re-upload to S3 for a persistent URL
      console.log(`  [P7] LatentSync slice ${sliceId}: downloading Hedra clip...`);
      const hedraResp = await fetch(clip.outputUrl);
      if (!hedraResp.ok) throw new Error(`Failed to download Hedra clip: ${hedraResp.status}`);
      const hedraBuffer = Buffer.from(await hedraResp.arrayBuffer());
      
      console.log(`  [P7] LatentSync slice ${sliceId}: re-uploading to S3 (${(hedraBuffer.length / 1024 / 1024).toFixed(1)}MB)...`);
      const s3Key = `benchmarks/p7/hedra_slice_${sliceId}.mp4`;
      const { url: persistentUrl } = await storagePut(s3Key, hedraBuffer, "video/mp4");
      console.log(`  [P7] LatentSync slice ${sliceId}: S3 URL ready — ${persistentUrl.slice(0, 80)}...`);

      // Now pass the persistent S3 URL to LatentSync
      const { result: lsOutput } = await withRetry(async () => {
        return await applyLatentSync(persistentUrl, ttsOutput.url);
      });
      const cost = lipsyncPricing.perClip ?? 0.20;
      lipsyncCost += cost;
      lipsyncSuccessCount++;
      console.log(`  [P7] LatentSync slice ${sliceId} ✓ $${cost.toFixed(2)} — ${lsOutput.url.slice(0, 80)}...`);

      // Update the clip's output URL to the LatentSync-refined version
      clip.outputUrl = lsOutput.url;
    } catch (err: any) {
      console.error(`  [P7] LatentSync failed on slice ${sliceId}: ${err.message?.slice(0, 120)}`);
    }
  }

  console.log(`  [P7] LatentSync: ${lipsyncSuccessCount}/${lipsyncClipCount} clips refined`);

  // ─── Assembly ──────────────────────────────────────────────────────────────────
  const allDialogueText = dialogueSlices.map((s) => s.dialogue?.text ?? "").join(" ");
  const totalCost = silentCost + ttsCost + dialogueCost + lipsyncCost;
  const totalWallClockMs = pipelineTimer();

  const silentDurationSec = silentSlices.reduce((sum, s) => sum + s.duration, 0);
  const dialogueDurationSec = dialogueSlices.reduce((sum, s) => sum + s.duration, 0);

  const components = buildComponentBreakdown([
    { component: "video", provider: "fal_ai", model: "Wan 2.5 (all silent incl. action)", units: silentDurationSec, unitType: "seconds", costUsd: silentCost },
    { component: "tts", provider: "elevenlabs", model: "turbo-v2.5 (char voices)", units: allDialogueText.length, unitType: "characters", costUsd: ttsCost },
    { component: "video", provider: "hedra", model: "Character-3 (dialogue)", units: dialogueDurationSec, unitType: "seconds", costUsd: dialogueCost },
    { component: "lipsync", provider: "fal_ai", model: "LatentSync (S3 re-upload)", units: lipsyncSuccessCount, unitType: "clips", costUsd: lipsyncCost },
    { component: "assembly", provider: "s3", model: "Hedra clip re-upload", units: lipsyncClipCount, unitType: "runs", costUsd: 0 },
    { component: "assembly", provider: "local", model: "FFmpeg", units: 1, unitType: "runs", costUsd: 0 },
  ]);

  const result: PipelineResult = {
    pipelineId: `P7_${Date.now()}`,
    variant: "P7_improved_wan25_charvoices_s3fix",
    totalSlices: script._meta.totalSlices,
    totalDurationSec: script._meta.totalDuration,
    components,
    totalCostUsd: totalCost,
    totalWallClockMs,
    costPerSecond: totalCost / script._meta.totalDuration,
    costPerMinute: (totalCost / script._meta.totalDuration) * 60,
    costPer5Min: extrapolateCost(totalCost, 3, 5),
    status: clips.every((c) => c.status === "success") ? "success" : clips.some((c) => c.status === "success") ? "partial" : "failed",
    failedSlices: clips.filter((c) => c.status === "failed").length,
    timestamp: new Date().toISOString(),
  };

  appendPipelineResult(result);
  writeComponentBreakdownCsv(result.pipelineId, components);
  return result;
}

// ─── P8: Full Fix — Immediate S3 Re-upload + FFmpeg Preprocessing + Fallback Lipsync ─────
// Based on P7 but with:
// 1. Immediate S3 re-upload after each Hedra clip (fixes URL expiry)
// 2. FFmpeg preprocessing before LatentSync (scale to 512x512, H.264, strip audio)
// 3. Fallback to Kling Lip Sync if LatentSync still fails
// 4. Weapon-free action reference image for slice 13 (v3 script)
// 5. Character-specific voices (Mira → Sarah, Ren → Harry) from P7

import { execSync } from "child_process";
import os from "os";

async function preprocessVideoForLatentSync(videoBuffer: Buffer, sliceId: number): Promise<{ buffer: Buffer; path: string }> {
  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `hedra_raw_${sliceId}.mp4`);
  const outputPath = path.join(tmpDir, `hedra_norm_${sliceId}.mp4`);

  fs.writeFileSync(inputPath, videoBuffer);

  // Scale to 512x512 (LatentSync training resolution), H.264, strip audio
  execSync(
    `ffmpeg -y -i "${inputPath}" -vf "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:black" -r 25 -c:v libx264 -preset fast -crf 23 -an "${outputPath}"`,
    { timeout: 60000 }
  );

  const outputBuffer = fs.readFileSync(outputPath);
  // Cleanup
  try { fs.unlinkSync(inputPath); } catch {}
  try { fs.unlinkSync(outputPath); } catch {}

  return { buffer: outputBuffer, path: outputPath };
}

export async function runP8(script: PilotScript): Promise<PipelineResult> {
  const pipelineTimer = startTimer();
  const clips: ClipResult[] = [];
  const falKey = getProviderKey("fal_ai");

  const silentSlices = script.slices.filter((s) => !s.audio);
  const dialogueSlices = script.slices.filter((s) => s.audio);

  console.log(`  [P8] Full Fix: ${silentSlices.length} silent → Wan 2.5, ${dialogueSlices.length} dialogue → Hedra (char voices + immediate S3 + FFmpeg + fallback lipsync)`);

  // ─── Step 1: ALL silent slices via Wan 2.5 ───────────────────────────────────
  const wanPricing = pricingData.video.wan25_fal;
  let silentCost = 0;

  for (let si = 0; si < silentSlices.length; si++) {
    const slice = silentSlices[si];
    console.log(`  [P8] Silent ${si + 1}/${silentSlices.length} (id=${slice.sliceId}, type=${slice.type}) — generating via Wan 2.5...`);
    const timer = startTimer();
    try {
      const { result: output, retryCount } = await withRetry(async () => {
        return await generateWan25(falKey, slice);
      });
      const wallClockMs = timer();
      const cost = calculateClipCost(slice.duration, wanPricing.perSecond, null, null);
      silentCost += cost;
      console.log(`  [P8] Silent ${si + 1}/${silentSlices.length} ✓ done in ${(wallClockMs / 1000).toFixed(1)}s — $${cost.toFixed(4)} — ${output.url.slice(0, 80)}...`);

      const clip: ClipResult = {
        ticketId: "P8",
        shotId: `slice_${slice.sliceId}`,
        provider: "fal_ai",
        model: wanPricing.model,
        mode: "standard",
        resolution: wanPricing.resolution,
        durationSec: slice.duration,
        costUsd: cost,
        wallClockMs,
        queueTimeMs: output.queueTimeMs ?? 0,
        generationTimeMs: output.generationTimeMs ?? wallClockMs,
        outputUrl: output.url,
        status: "success",
        error: null,
        retryCount,
        timestamp: new Date().toISOString(),
        metadata: { pipelineVariant: "P8", component: "silent_video", router: "wan25", sliceType: slice.type },
      };
      clips.push(clip);
      appendClipResult(clip);
    } catch (err: any) {
      const wallClockMs = timer();
      console.log(`  [P8] Silent ${si + 1}/${silentSlices.length} ✗ FAILED in ${(wallClockMs / 1000).toFixed(1)}s — ${err.message?.slice(0, 100)}`);
      clips.push(makeFailedPipelineClip("P8", slice, "fal_ai", wanPricing.model, wallClockMs, err));
    }
  }

  // ─── Step 2: TTS with ElevenLabs — character-specific voices ──────────────────
  const ttsPricing = pricingData.tts.elevenlabs;
  let ttsCost = 0;
  const ttsOutputs: Map<number, GenerationOutput> = new Map();

  for (const slice of dialogueSlices) {
    const dialogueText = slice.dialogue?.text ?? "";
    if (!dialogueText) continue;
    const character = slice.dialogue?.character ?? "";
    const voiceId = VOICE_MAP[character] ?? DEFAULT_VOICE;
    console.log(`  [P8] TTS for slice ${slice.sliceId} (${character}) — voice: ${character === "Mira" ? "Sarah" : character === "Ren" ? "Harry" : "Rachel"}`);
    try {
      const { result: ttsOutput } = await withRetry(async () => {
        return await elevenLabsTTS({ text: dialogueText, voiceId });
      });
      const cost = calculateTTSCost(dialogueText.length, ttsPricing.perKChars);
      ttsCost += cost;
      ttsOutputs.set(slice.sliceId, ttsOutput);
      console.log(`  [P8] TTS for slice ${slice.sliceId}: $${cost.toFixed(4)}`);
    } catch (err) {
      console.error(`  [P8] TTS failed for slice ${slice.sliceId}:`, err);
    }
  }

  // ─── Step 3: Dialogue clips via Hedra + IMMEDIATE S3 re-upload ────────────────
  const hedraPricing = pricingData.video.hedra_char3;
  let dialogueCost = 0;
  // Map: sliceId → persistent S3 URL (for LatentSync later)
  const hedraS3Urls: Map<number, string> = new Map();

  for (let di = 0; di < dialogueSlices.length; di++) {
    const slice = dialogueSlices[di];
    console.log(`  [P8] Dialogue ${di + 1}/${dialogueSlices.length} (id=${slice.sliceId}, char=${slice.dialogue?.character}) — generating via Hedra...`);
    const timer = startTimer();
    try {
      const ttsOutput = ttsOutputs.get(slice.sliceId);
      if (!ttsOutput) throw new Error(`No TTS audio for slice ${slice.sliceId}`);

      const hedraImageUrl = slice.referenceImage ?? "https://placehold.co/512x512/png";
      const { result: output, retryCount } = await withRetry(async () => {
        return await hedraCharacter3({
          imageUrl: hedraImageUrl,
          audioUrl: ttsOutput.url,
          prompt: slice.prompt,
          durationMs: slice.duration * 1000,
        });
      });
      const wallClockMs = timer();
      const cost = calculateClipCost(slice.duration, hedraPricing.perSecond, null, null);
      dialogueCost += cost;

      // IMMEDIATELY download and re-upload to S3 (fix for URL expiry)
      let persistentUrl = output.url;
      try {
        console.log(`  [P8] Dialogue ${di + 1}: downloading Hedra clip for S3 re-upload...`);
        const hedraResp = await fetch(output.url);
        if (!hedraResp.ok) throw new Error(`Download failed: ${hedraResp.status}`);
        const hedraBuffer = Buffer.from(await hedraResp.arrayBuffer());
        const s3Key = `benchmarks/p8/hedra_slice_${slice.sliceId}_${Date.now()}.mp4`;
        const { url: s3Url } = await storagePut(s3Key, hedraBuffer, "video/mp4");
        persistentUrl = s3Url;
        hedraS3Urls.set(slice.sliceId, s3Url);
        console.log(`  [P8] Dialogue ${di + 1}: S3 re-upload ✓ (${(hedraBuffer.length / 1024 / 1024).toFixed(1)}MB)`);
      } catch (reuploadErr: any) {
        console.warn(`  [P8] Dialogue ${di + 1}: S3 re-upload failed — ${reuploadErr.message?.slice(0, 80)}`);
        // Still use the original Hedra URL as fallback
      }

      console.log(`  [P8] Dialogue ${di + 1}/${dialogueSlices.length} ✓ done in ${(wallClockMs / 1000).toFixed(1)}s — $${cost.toFixed(4)}`);

      const clip: ClipResult = {
        ticketId: "P8",
        shotId: `slice_${slice.sliceId}`,
        provider: "hedra",
        model: hedraPricing.model,
        mode: "dialogue",
        resolution: hedraPricing.resolution,
        durationSec: slice.duration,
        costUsd: cost,
        wallClockMs,
        queueTimeMs: output.queueTimeMs ?? 0,
        generationTimeMs: output.generationTimeMs ?? wallClockMs,
        outputUrl: persistentUrl,
        status: "success",
        error: null,
        retryCount,
        timestamp: new Date().toISOString(),
        metadata: { pipelineVariant: "P8", component: "dialogue_video", router: "hedra" },
      };
      clips.push(clip);
      appendClipResult(clip);
    } catch (err: any) {
      const wallClockMs = timer();
      console.log(`  [P8] Dialogue ${di + 1}/${dialogueSlices.length} ✗ FAILED in ${(wallClockMs / 1000).toFixed(1)}s — ${err.message?.slice(0, 100)}`);
      clips.push(makeFailedPipelineClip("P8", slice, "hedra", hedraPricing.model, wallClockMs, err));
    }
  }

  // ─── Step 4: Lip Sync — LatentSync with FFmpeg preprocessing + Kling fallback ─
  const lipsyncPricing = pricingData.video.latentsync_fal;
  const klingLsPricing = pricingData.video.kling_lipsync_fal;
  let lipsyncCost = 0;
  let lipsyncClipCount = 0;
  let latentsyncSuccessCount = 0;
  let klingLsSuccessCount = 0;
  let museTalkSuccessCount = 0;

  const lipsyncCandidates = clips.filter(
    (c) => c.metadata?.component === "dialogue_video" && c.status === "success"
  );

  console.log(`  [P8] Lip Sync: processing ${lipsyncCandidates.length} dialogue clips (FFmpeg preprocess → LatentSync → Kling fallback)...`);

  for (const clip of lipsyncCandidates) {
    const sliceId = parseInt(clip.shotId.replace("slice_", ""));
    const ttsOutput = ttsOutputs.get(sliceId);
    if (!clip.outputUrl || !ttsOutput) continue;

    lipsyncClipCount++;
    let lipsyncSuccess = false;

    // --- Attempt 1: LatentSync with FFmpeg preprocessing ---
    try {
      console.log(`  [P8] LipSync slice ${sliceId}: downloading for FFmpeg preprocessing...`);
      const videoResp = await fetch(clip.outputUrl);
      if (!videoResp.ok) throw new Error(`Download failed: ${videoResp.status}`);
      const videoBuffer = Buffer.from(await videoResp.arrayBuffer());

      // FFmpeg: scale to 512x512, H.264, strip audio
      console.log(`  [P8] LipSync slice ${sliceId}: FFmpeg preprocessing (512x512, H.264, no audio)...`);
      const { buffer: normalizedBuffer } = await preprocessVideoForLatentSync(videoBuffer, sliceId);

      // Upload normalized video to S3
      const normS3Key = `benchmarks/p8/hedra_norm_${sliceId}_${Date.now()}.mp4`;
      const { url: normUrl } = await storagePut(normS3Key, normalizedBuffer, "video/mp4");
      console.log(`  [P8] LipSync slice ${sliceId}: normalized video uploaded (${(normalizedBuffer.length / 1024 / 1024).toFixed(1)}MB)`);

      // Try LatentSync with normalized video
      const { result: lsOutput } = await withRetry(async () => {
        return await applyLatentSync(normUrl, ttsOutput.url);
      });
      const cost = lipsyncPricing.perClip ?? 0.20;
      lipsyncCost += cost;
      latentsyncSuccessCount++;
      lipsyncSuccess = true;
      clip.outputUrl = lsOutput.url;
      console.log(`  [P8] LipSync slice ${sliceId} ✓ LatentSync success — $${cost.toFixed(2)}`);
    } catch (lsErr: any) {
      console.warn(`  [P8] LipSync slice ${sliceId}: LatentSync failed — ${lsErr.message?.slice(0, 100)}`);
    }

    // --- Attempt 2: Kling Lip Sync as fallback ---
    if (!lipsyncSuccess) {
      try {
        console.log(`  [P8] LipSync slice ${sliceId}: trying Kling Lip Sync fallback...`);
        // Kling Lip Sync may handle Hedra's native format better
        const s3Url = hedraS3Urls.get(sliceId) ?? clip.outputUrl;
        const { result: klingOutput } = await withRetry(async () => {
          return await applyKlingLipSync(s3Url, ttsOutput.url);
        });
        const cost = (klingLsPricing.per10sClip ?? 1.68);
        lipsyncCost += cost;
        klingLsSuccessCount++;
        lipsyncSuccess = true;
        clip.outputUrl = klingOutput.url;
        console.log(`  [P8] LipSync slice ${sliceId} ✓ Kling fallback success — $${cost.toFixed(2)}`);
      } catch (klingErr: any) {
        console.warn(`  [P8] LipSync slice ${sliceId}: Kling fallback also failed — ${klingErr.message?.slice(0, 100)}`);
      }
    }

    // --- Attempt 3: MuseTalk as last resort ---
    if (!lipsyncSuccess) {
      try {
        console.log(`  [P8] LipSync slice ${sliceId}: trying MuseTalk last resort...`);
        const s3Url = hedraS3Urls.get(sliceId) ?? clip.outputUrl;
        const { result: mtOutput } = await withRetry(async () => {
          return await applyMuseTalk(s3Url, ttsOutput.url);
        });
        const cost = 0.20; // MuseTalk fal.ai pricing
        lipsyncCost += cost;
        museTalkSuccessCount++;
        lipsyncSuccess = true;
        clip.outputUrl = mtOutput.url;
        console.log(`  [P8] LipSync slice ${sliceId} ✓ MuseTalk success — $${cost.toFixed(2)}`);
      } catch (mtErr: any) {
        console.error(`  [P8] LipSync slice ${sliceId}: ALL lip sync methods failed — ${mtErr.message?.slice(0, 100)}`);
      }
    }
  }

  const totalLsSuccess = latentsyncSuccessCount + klingLsSuccessCount + museTalkSuccessCount;
  console.log(`  [P8] Lip Sync: ${totalLsSuccess}/${lipsyncClipCount} clips refined (LatentSync: ${latentsyncSuccessCount}, Kling: ${klingLsSuccessCount}, MuseTalk: ${museTalkSuccessCount})`);

  // ─── Assembly ──────────────────────────────────────────────────────────────────
  const allDialogueText = dialogueSlices.map((s) => s.dialogue?.text ?? "").join(" ");
  const totalCost = silentCost + ttsCost + dialogueCost + lipsyncCost;
  const totalWallClockMs = pipelineTimer();

  const silentDurationSec = silentSlices.reduce((sum, s) => sum + s.duration, 0);
  const dialogueDurationSec = dialogueSlices.reduce((sum, s) => sum + s.duration, 0);

  const components = buildComponentBreakdown([
    { component: "video", provider: "fal_ai", model: "Wan 2.5 (all silent, v3 action ref)", units: silentDurationSec, unitType: "seconds", costUsd: silentCost },
    { component: "tts", provider: "elevenlabs", model: "turbo-v2.5 (char voices)", units: allDialogueText.length, unitType: "characters", costUsd: ttsCost },
    { component: "video", provider: "hedra", model: "Character-3 (dialogue + immediate S3)", units: dialogueDurationSec, unitType: "seconds", costUsd: dialogueCost },
    { component: "lipsync", provider: "multi", model: `LatentSync(${latentsyncSuccessCount})+Kling(${klingLsSuccessCount})+MuseTalk(${museTalkSuccessCount})`, units: totalLsSuccess, unitType: "clips", costUsd: lipsyncCost },
    { component: "assembly", provider: "local", model: "FFmpeg preprocess + S3", units: lipsyncClipCount, unitType: "runs", costUsd: 0 },
  ]);

  const result: PipelineResult = {
    pipelineId: `P8_${Date.now()}`,
    variant: "P8_fullfix_s3_ffmpeg_fallback_lipsync",
    totalSlices: script._meta.totalSlices,
    totalDurationSec: script._meta.totalDuration,
    components,
    totalCostUsd: totalCost,
    totalWallClockMs,
    costPerSecond: totalCost / script._meta.totalDuration,
    costPerMinute: (totalCost / script._meta.totalDuration) * 60,
    costPer5Min: extrapolateCost(totalCost, 3, 5),
    status: clips.every((c) => c.status === "success") ? "success" : clips.some((c) => c.status === "success") ? "partial" : "failed",
    failedSlices: clips.filter((c) => c.status === "failed").length,
    timestamp: new Date().toISOString(),
  };

  appendPipelineResult(result);
  writeComponentBreakdownCsv(result.pipelineId, components);
  return result;
}

export async function runP9(script: PilotScript): Promise<PipelineResult> {
  const pipelineTimer = startTimer();
  const clips: ClipResult[] = [];
  const falKey = getProviderKey("fal_ai");

  const silentSlices = script.slices.filter((s) => !s.audio);
  const dialogueSlices = script.slices.filter((s) => s.audio);

  console.log(`  [P9] Optimized: ${silentSlices.length} silent → Wan 2.5, ${dialogueSlices.length} dialogue → Hedra (Kling-only lipsync, parallel, incremental CSV)`);

  // ─── Step 1: ALL silent slices via Wan 2.5 ───────────────────────────────────
  const wanPricing = pricingData.video.wan25_fal;
  let silentCost = 0;

  for (let si = 0; si < silentSlices.length; si++) {
    const slice = silentSlices[si];
    console.log(`  [P9] Silent ${si + 1}/${silentSlices.length} (id=${slice.sliceId}, type=${slice.type}) — generating via Wan 2.5...`);
    const timer = startTimer();
    try {
      const { result: output, retryCount } = await withRetry(async () => {
        return await generateWan25(falKey, slice);
      });
      const wallClockMs = timer();
      const cost = calculateClipCost(slice.duration, wanPricing.perSecond, null, null);
      silentCost += cost;
      console.log(`  [P9] Silent ${si + 1}/${silentSlices.length} ✓ done in ${(wallClockMs / 1000).toFixed(1)}s — $${cost.toFixed(4)} — ${output.url.slice(0, 80)}...`);

      const clip: ClipResult = {
        ticketId: "P9",
        shotId: `slice_${slice.sliceId}`,
        provider: "fal_ai",
        model: wanPricing.model,
        mode: "standard",
        resolution: wanPricing.resolution,
        durationSec: slice.duration,
        costUsd: cost,
        wallClockMs,
        queueTimeMs: output.queueTimeMs ?? 0,
        generationTimeMs: output.generationTimeMs ?? wallClockMs,
        outputUrl: output.url,
        status: "success",
        error: null,
        retryCount,
        timestamp: new Date().toISOString(),
        metadata: { pipelineVariant: "P9", component: "silent_video", router: "wan25", sliceType: slice.type },
      };
      clips.push(clip);
      appendClipResult(clip);
    } catch (err: any) {
      const wallClockMs = timer();
      console.log(`  [P9] Silent ${si + 1}/${silentSlices.length} ✗ FAILED in ${(wallClockMs / 1000).toFixed(1)}s — ${err.message?.slice(0, 100)}`);
      clips.push(makeFailedPipelineClip("P9", slice, "fal_ai", wanPricing.model, wallClockMs, err));
    }
  }

  // ─── Step 2: TTS with ElevenLabs — character-specific voices ──────────────────
  const ttsPricing = pricingData.tts.elevenlabs;
  let ttsCost = 0;
  const ttsOutputs: Map<number, GenerationOutput> = new Map();

  for (const slice of dialogueSlices) {
    const dialogueText = slice.dialogue?.text ?? "";
    if (!dialogueText) continue;
    const character = slice.dialogue?.character ?? "";
    const voiceId = VOICE_MAP[character] ?? DEFAULT_VOICE;
    console.log(`  [P9] TTS for slice ${slice.sliceId} (${character}) — voice: ${character === "Mira" ? "Sarah" : character === "Ren" ? "Harry" : "Rachel"}`);
    try {
      const { result: ttsOutput } = await withRetry(async () => {
        return await elevenLabsTTS({ text: dialogueText, voiceId });
      });
      const cost = calculateTTSCost(dialogueText.length, ttsPricing.perKChars);
      ttsCost += cost;
      ttsOutputs.set(slice.sliceId, ttsOutput);
      console.log(`  [P9] TTS for slice ${slice.sliceId}: $${cost.toFixed(4)}`);
    } catch (err) {
      console.error(`  [P9] TTS failed for slice ${slice.sliceId}:`, err);
    }
  }

  // ─── Step 3: Dialogue clips via Hedra + IMMEDIATE S3 re-upload ────────────────
  const hedraPricing = pricingData.video.hedra_char3;
  let dialogueCost = 0;
  const hedraS3Urls: Map<number, string> = new Map();

  for (let di = 0; di < dialogueSlices.length; di++) {
    const slice = dialogueSlices[di];
    console.log(`  [P9] Dialogue ${di + 1}/${dialogueSlices.length} (id=${slice.sliceId}, char=${slice.dialogue?.character}) — generating via Hedra...`);
    const timer = startTimer();
    try {
      const ttsOutput = ttsOutputs.get(slice.sliceId);
      if (!ttsOutput) throw new Error(`No TTS audio for slice ${slice.sliceId}`);

      const hedraImageUrl = slice.referenceImage ?? "https://placehold.co/512x512/png";
      const { result: output, retryCount } = await withRetry(async () => {
        return await hedraCharacter3({
          imageUrl: hedraImageUrl,
          audioUrl: ttsOutput.url,
          prompt: slice.prompt,
          durationMs: slice.duration * 1000,
        });
      });
      const wallClockMs = timer();
      const cost = calculateClipCost(slice.duration, hedraPricing.perSecond, null, null);
      dialogueCost += cost;

      // IMMEDIATELY download and re-upload to S3
      let persistentUrl = output.url;
      try {
        console.log(`  [P9] Dialogue ${di + 1}: downloading Hedra clip for S3 re-upload...`);
        const hedraResp = await fetch(output.url);
        if (!hedraResp.ok) throw new Error(`Download failed: ${hedraResp.status}`);
        const hedraBuffer = Buffer.from(await hedraResp.arrayBuffer());
        const s3Key = `benchmarks/p9/hedra_slice_${slice.sliceId}_${Date.now()}.mp4`;
        const { url: s3Url } = await storagePut(s3Key, hedraBuffer, "video/mp4");
        persistentUrl = s3Url;
        hedraS3Urls.set(slice.sliceId, s3Url);
        console.log(`  [P9] Dialogue ${di + 1}: S3 re-upload ✓ (${(hedraBuffer.length / 1024 / 1024).toFixed(1)}MB)`);
      } catch (reuploadErr: any) {
        console.warn(`  [P9] Dialogue ${di + 1}: S3 re-upload failed — ${reuploadErr.message?.slice(0, 80)}`);
      }

      console.log(`  [P9] Dialogue ${di + 1}/${dialogueSlices.length} ✓ done in ${(wallClockMs / 1000).toFixed(1)}s — $${cost.toFixed(4)}`);

      const clip: ClipResult = {
        ticketId: "P9",
        shotId: `slice_${slice.sliceId}`,
        provider: "hedra",
        model: hedraPricing.model,
        mode: "dialogue",
        resolution: hedraPricing.resolution,
        durationSec: slice.duration,
        costUsd: cost,
        wallClockMs,
        queueTimeMs: output.queueTimeMs ?? 0,
        generationTimeMs: output.generationTimeMs ?? wallClockMs,
        outputUrl: persistentUrl,
        status: "success",
        error: null,
        retryCount,
        timestamp: new Date().toISOString(),
        metadata: { pipelineVariant: "P9", component: "dialogue_video", router: "hedra" },
      };
      clips.push(clip);
      appendClipResult(clip);
    } catch (err: any) {
      const wallClockMs = timer();
      console.log(`  [P9] Dialogue ${di + 1}/${dialogueSlices.length} ✗ FAILED in ${(wallClockMs / 1000).toFixed(1)}s — ${err.message?.slice(0, 100)}`);
      clips.push(makeFailedPipelineClip("P9", slice, "hedra", hedraPricing.model, wallClockMs, err));
    }
  }

  // ─── Step 4: Kling Lip Sync ONLY — parallel, incremental CSV ─────────────────
  const klingLsPricing = pricingData.video.kling_lipsync_fal;
  let lipsyncCost = 0;
  let klingLsSuccessCount = 0;
  let klingLsFailCount = 0;

  const lipsyncCandidates = clips.filter(
    (c) => c.metadata?.component === "dialogue_video" && c.status === "success"
  );

  // Reverse order to test if first-3-failure pattern is order-dependent
  const lipsyncQueue = [...lipsyncCandidates].reverse();

  console.log(`  [P9] Kling Lip Sync: processing ${lipsyncQueue.length} dialogue clips in PARALLEL (reversed order, skip LatentSync/MuseTalk)...`);

  // Process in parallel batches of 3 to avoid overwhelming the API
  const BATCH_SIZE = 3;
  const lipsyncResults: Map<string, { success: boolean; url?: string; cost: number }> = new Map();

  for (let batchStart = 0; batchStart < lipsyncQueue.length; batchStart += BATCH_SIZE) {
    const batch = lipsyncQueue.slice(batchStart, batchStart + BATCH_SIZE);
    console.log(`  [P9] Kling batch ${Math.floor(batchStart / BATCH_SIZE) + 1}/${Math.ceil(lipsyncQueue.length / BATCH_SIZE)}: slices ${batch.map(c => c.shotId.replace("slice_", "")).join(", ")}`);

    const batchPromises = batch.map(async (clip) => {
      const sliceId = parseInt(clip.shotId.replace("slice_", ""));
      const ttsOutput = ttsOutputs.get(sliceId);
      if (!clip.outputUrl || !ttsOutput) {
        return { sliceId, success: false, cost: 0 };
      }

      try {
        const s3Url = hedraS3Urls.get(sliceId) ?? clip.outputUrl;
        console.log(`  [P9] LipSync slice ${sliceId}: starting Kling Lip Sync...`);
        const { result: klingOutput } = await withRetry(async () => {
          return await applyKlingLipSync(s3Url, ttsOutput.url);
        });
        const cost = klingLsPricing.per10sClip ?? 1.68;
        console.log(`  [P9] LipSync slice ${sliceId} ✓ Kling success — $${cost.toFixed(2)}`);

        // Immediately write lip sync result to CSV
        const lsClip: ClipResult = {
          ticketId: "P9",
          shotId: `slice_${sliceId}_lipsync`,
          provider: "fal_ai",
          model: klingLsPricing.model,
          mode: "lipsync",
          resolution: "720p",
          durationSec: clip.durationSec,
          costUsd: cost,
          wallClockMs: 0,
          queueTimeMs: 0,
          generationTimeMs: 0,
          outputUrl: klingOutput.url,
          status: "success",
          error: null,
          retryCount: 0,
          timestamp: new Date().toISOString(),
          metadata: { pipelineVariant: "P9", component: "lipsync", router: "kling_lipsync", originalSlice: sliceId },
        };
        appendClipResult(lsClip);

        // Update the original clip's outputUrl to the lip-synced version
        clip.outputUrl = klingOutput.url;

        return { sliceId, success: true, url: klingOutput.url, cost };
      } catch (err: any) {
        console.warn(`  [P9] LipSync slice ${sliceId}: Kling failed — ${err.message?.slice(0, 100)}`);

        // Write failure to CSV too
        const failClip: ClipResult = {
          ticketId: "P9",
          shotId: `slice_${sliceId}_lipsync`,
          provider: "fal_ai",
          model: klingLsPricing.model,
          mode: "lipsync",
          resolution: "720p",
          durationSec: clip.durationSec,
          costUsd: 0,
          wallClockMs: 0,
          queueTimeMs: 0,
          generationTimeMs: 0,
          outputUrl: null,
          status: "failed",
          error: err.message?.slice(0, 200) ?? "Unknown error",
          retryCount: 2,
          timestamp: new Date().toISOString(),
          metadata: { pipelineVariant: "P9", component: "lipsync", router: "kling_lipsync", originalSlice: sliceId },
        };
        appendClipResult(failClip);

        return { sliceId, success: false, cost: 0 };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    for (const r of batchResults) {
      lipsyncResults.set(`slice_${r.sliceId}`, { success: r.success, url: r.url, cost: r.cost });
      if (r.success) {
        klingLsSuccessCount++;
        lipsyncCost += r.cost;
      } else {
        klingLsFailCount++;
      }
    }
  }

  console.log(`  [P9] Kling Lip Sync: ${klingLsSuccessCount}/${lipsyncQueue.length} clips refined, ${klingLsFailCount} failed`);

  // ─── Assembly ──────────────────────────────────────────────────────────────────
  const allDialogueText = dialogueSlices.map((s) => s.dialogue?.text ?? "").join(" ");
  const totalCost = silentCost + ttsCost + dialogueCost + lipsyncCost;
  const totalWallClockMs = pipelineTimer();

  const silentDurationSec = silentSlices.reduce((sum, s) => sum + s.duration, 0);
  const dialogueDurationSec = dialogueSlices.reduce((sum, s) => sum + s.duration, 0);

  const components = buildComponentBreakdown([
    { component: "video", provider: "fal_ai", model: "Wan 2.5 (all silent, v3 action ref)", units: silentDurationSec, unitType: "seconds", costUsd: silentCost },
    { component: "tts", provider: "elevenlabs", model: "turbo-v2.5 (char voices)", units: allDialogueText.length, unitType: "characters", costUsd: ttsCost },
    { component: "video", provider: "hedra", model: "Character-3 (dialogue + immediate S3)", units: dialogueDurationSec, unitType: "seconds", costUsd: dialogueCost },
    { component: "lipsync", provider: "fal_ai", model: `Kling Lip Sync (${klingLsSuccessCount}/${lipsyncQueue.length} parallel)`, units: klingLsSuccessCount, unitType: "clips", costUsd: lipsyncCost },
  ]);

  const result: PipelineResult = {
    pipelineId: `P9_${Date.now()}`,
    variant: "P9_kling_only_parallel_incremental",
    totalSlices: script._meta.totalSlices,
    totalDurationSec: script._meta.totalDuration,
    components,
    totalCostUsd: totalCost,
    totalWallClockMs,
    costPerSecond: totalCost / script._meta.totalDuration,
    costPerMinute: (totalCost / script._meta.totalDuration) * 60,
    costPer5Min: extrapolateCost(totalCost, 3, 5),
    status: clips.every((c) => c.status === "success") ? "success" : clips.some((c) => c.status === "success") ? "partial" : "failed",
    failedSlices: clips.filter((c) => c.status === "failed").length,
    timestamp: new Date().toISOString(),
  };

  appendPipelineResult(result);
  writeComponentBreakdownCsv(result.pipelineId, components);
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// P10: Wan 2.7 Unified + Veo 3.1 Lite Dialogue
// ═══════════════════════════════════════════════════════════════════════════
//
// Architecture: 2-stage pipeline replacing P9's 4-stage chain.
//   Silent slices  → Wan 2.7 (no audio_url)
//   Dialogue slices → Veo 3.1 Lite (native audio, image-conditioned)
//                     Fallback: Wan 2.7 with audio_url if Veo fails
//   Lip sync       → Kling Lip Sync as optional refinement pass
//
// Key changes from P9:
//   - Hedra Character-3 removed entirely
//   - Veo 3.1 Lite as primary dialogue provider ($0.05/sec vs Hedra $0.033/sec + Kling $1.68/clip)
//   - Wan 2.7 with audio_url as fallback dialogue provider ($0.10/sec)
//   - Character-specific voices retained (Mira=Sarah, Ren=Harry)
//   - Kling Lip Sync as optional refinement for Wan 2.7 fallback clips
// ═══════════════════════════════════════════════════════════════════════════

// CHARACTER_LOCK strings — injected into every video generation prompt
const CHARACTER_LOCK: Record<string, string> = {
  Mira: "Young woman, silver-white hair with cerulean blue tips in ponytail, glowing BLUE eyes (cyan-blue iris, NEVER green or amber or any other colour), mechanical LEFT arm only (NEVER right arm) with amber energy lines, right arm is normal human arm, navy sailor uniform, petite build. Determined expression.",
  Ren: "Young man, spiky dark hair with cyan streaks, sharp AMBER eyes (warm amber-gold iris, NEVER blue or green or any other colour), black tactical jacket with glowing cyan circuit patterns, athletic build. Confident stance.",
};

export async function runP10(script: PilotScript): Promise<PipelineResult> {
  const pipelineTimer = startTimer();
  const clips: ClipResult[] = [];
  const falKey = getProviderKey("fal_ai");

  const silentSlices = script.slices.filter((s) => !s.audio);
  const dialogueSlices = script.slices.filter((s) => s.audio);

  console.log(`  [P10] Architecture: ${silentSlices.length} silent → Wan 2.7, ${dialogueSlices.length} dialogue → Veo 3.1 Lite (fallback: Wan 2.7 + audio_url)`);
  console.log(`  [P10] Character lock: Mira, Ren. Voices: Mira=Sarah, Ren=Harry.`);

  // ─── Step 1: ALL silent slices via Wan 2.7 ───────────────────────────────────
  const wan27Pricing = pricingData.video.wan27_fal;
  let silentCost = 0;

  for (let si = 0; si < silentSlices.length; si++) {
    const slice = silentSlices[si];
    // Inject character lock into prompt if character is mentioned
    const enhancedPrompt = injectCharacterLock(slice.prompt, slice.dialogue?.character);
    const enhancedSlice = { ...slice, prompt: enhancedPrompt };

    console.log(`  [P10] Silent ${si + 1}/${silentSlices.length} (id=${slice.sliceId}, type=${slice.type}) — generating via Wan 2.7 (720p)...`);
    const timer = startTimer();
    try {
      const { result: output, retryCount } = await withRetry(async () => {
        return await generateWan27(falKey, enhancedSlice);
      });
      const wallClockMs = timer();
      const cost = calculateClipCost(slice.duration, wan27Pricing.perSecond, null, null);
      silentCost += cost;
      console.log(`  [P10] Silent ${si + 1}/${silentSlices.length} ✓ done in ${(wallClockMs / 1000).toFixed(1)}s — $${cost.toFixed(4)} — ${output.url.slice(0, 80)}...`);

      const clip: ClipResult = {
        ticketId: "P10",
        shotId: `slice_${slice.sliceId}`,
        provider: "fal_ai",
        model: wan27Pricing.model,
        mode: "standard",
        resolution: "720p",
        durationSec: slice.duration,
        costUsd: cost,
        wallClockMs,
        queueTimeMs: output.queueTimeMs ?? 0,
        generationTimeMs: output.generationTimeMs ?? wallClockMs,
        outputUrl: output.url,
        status: "success",
        error: null,
        retryCount,
        timestamp: new Date().toISOString(),
        metadata: { pipelineVariant: "P10", component: "silent_video", router: "wan27", sliceType: slice.type },
      };
      clips.push(clip);
      appendClipResult(clip);
    } catch (err: any) {
      const wallClockMs = timer();
      console.log(`  [P10] Silent ${si + 1}/${silentSlices.length} ✗ FAILED in ${(wallClockMs / 1000).toFixed(1)}s — ${err.message?.slice(0, 100)}`);
      clips.push(makeFailedPipelineClip("P10", slice, "fal_ai", wan27Pricing.model, wallClockMs, err));
    }
  }

  // ─── Step 2: TTS with ElevenLabs — character-specific voices ──────────────────
  const ttsPricing = pricingData.tts.elevenlabs;
  let ttsCost = 0;
  const ttsOutputs: Map<number, GenerationOutput> = new Map();

  for (const slice of dialogueSlices) {
    const dialogueText = slice.dialogue?.text ?? "";
    if (!dialogueText) continue;
    const character = slice.dialogue?.character ?? "";
    const voiceId = VOICE_MAP[character] ?? DEFAULT_VOICE;
    const voiceName = character === "Mira" ? "Sarah" : character === "Ren" ? "Harry" : "Rachel";
    console.log(`  [P10] TTS for slice ${slice.sliceId} (${character}) — voice: ${voiceName}`);
    try {
      const { result: ttsOutput } = await withRetry(async () => {
        return await elevenLabsTTS({ text: dialogueText, voiceId });
      });
      const cost = calculateTTSCost(dialogueText.length, ttsPricing.perKChars);
      ttsCost += cost;
      ttsOutputs.set(slice.sliceId, ttsOutput);
      console.log(`  [P10] TTS for slice ${slice.sliceId}: $${cost.toFixed(4)}`);
    } catch (err) {
      console.error(`  [P10] TTS failed for slice ${slice.sliceId}:`, err);
    }
  }

  // ─── Step 3: Dialogue clips — Veo 3.1 Lite primary, Wan 2.7+audio_url fallback ─
  const veo31Pricing = pricingData.video.veo31_lite_fal;
  const wan27AudioPricing = pricingData.video.wan27_audio_fal;
  let dialogueCost = 0;
  let veoSuccessCount = 0;
  let wan27FallbackCount = 0;
  let consecutiveVeoFailures = 0;
  let veoDisabled = false;

  for (let di = 0; di < dialogueSlices.length; di++) {
    const slice = dialogueSlices[di];
    const character = slice.dialogue?.character ?? "";
    const enhancedPrompt = injectCharacterLock(slice.prompt, character);
    const enhancedSlice = { ...slice, prompt: enhancedPrompt };
    const ttsOutput = ttsOutputs.get(slice.sliceId);

    console.log(`  [P10] Dialogue ${di + 1}/${dialogueSlices.length} (id=${slice.sliceId}, char=${character}) — ${veoDisabled ? "Veo DISABLED, using Wan 2.7+audio_url" : "trying Veo 3.1 Lite..."}`);
    const timer = startTimer();

    let dialogueSuccess = false;
    let dialogueOutput: GenerationOutput | null = null;
    let usedProvider = "";
    let usedModel = "";
    let usedCostPerSec = 0;

    // Primary: Veo 3.1 Lite (unless circuit breaker tripped)
    if (!veoDisabled) {
      try {
        const { result: output } = await withRetry(async () => {
          return await generateVeo31Lite(falKey, enhancedSlice);
        }, { maxRetries: 1 }); // Only 1 retry for Veo to fail fast
        dialogueOutput = output;
        dialogueSuccess = true;
        usedProvider = "fal_ai";
        usedModel = veo31Pricing.model;
        usedCostPerSec = veo31Pricing.perSecond;
        veoSuccessCount++;
        consecutiveVeoFailures = 0;
        console.log(`  [P10] Dialogue ${di + 1}: Veo 3.1 Lite ✓`);
      } catch (err: any) {
        consecutiveVeoFailures++;
        console.warn(`  [P10] Dialogue ${di + 1}: Veo 3.1 Lite failed (${consecutiveVeoFailures} consecutive) — ${err.message?.slice(0, 80)}`);
        if (consecutiveVeoFailures >= 2) {
          veoDisabled = true;
          console.warn(`  [P10] ⚠ Circuit breaker: Veo 3.1 Lite disabled after ${consecutiveVeoFailures} consecutive failures. Falling back to Wan 2.7+audio_url for remaining slices.`);
        }
      }
    }

    // Fallback: Wan 2.7 with audio_url
    if (!dialogueSuccess && ttsOutput) {
      try {
        console.log(`  [P10] Dialogue ${di + 1}: falling back to Wan 2.7 + audio_url...`);
        const { result: output } = await withRetry(async () => {
          return await generateWan27(falKey, enhancedSlice, ttsOutput.url);
        });
        dialogueOutput = output;
        dialogueSuccess = true;
        usedProvider = "fal_ai";
        usedModel = wan27AudioPricing.model;
        usedCostPerSec = wan27AudioPricing.perSecond;
        wan27FallbackCount++;
        console.log(`  [P10] Dialogue ${di + 1}: Wan 2.7+audio_url ✓`);
      } catch (err: any) {
        console.warn(`  [P10] Dialogue ${di + 1}: Wan 2.7+audio_url also failed — ${err.message?.slice(0, 80)}`);
      }
    }

    // Record result
    const wallClockMs = timer();
    if (dialogueSuccess && dialogueOutput) {
      // Veo 3.1 Lite outputs 8s clips for 10s slices — use actual Veo duration for cost
      const actualDuration = usedModel.includes("veo3.1") ? 8 : slice.duration;
      const cost = calculateClipCost(actualDuration, usedCostPerSec, null, null);
      dialogueCost += cost;
      console.log(`  [P10] Dialogue ${di + 1}/${dialogueSlices.length} ✓ done in ${(wallClockMs / 1000).toFixed(1)}s — $${cost.toFixed(4)} via ${usedModel.includes("veo3.1") ? "Veo 3.1 Lite" : "Wan 2.7+audio"}`);

      const clip: ClipResult = {
        ticketId: "P10",
        shotId: `slice_${slice.sliceId}`,
        provider: usedProvider,
        model: usedModel,
        mode: "dialogue",
        resolution: "720p",
        durationSec: actualDuration,
        costUsd: cost,
        wallClockMs,
        queueTimeMs: dialogueOutput.queueTimeMs ?? 0,
        generationTimeMs: dialogueOutput.generationTimeMs ?? wallClockMs,
        outputUrl: dialogueOutput.url,
        status: "success",
        error: null,
        retryCount: 0,
        timestamp: new Date().toISOString(),
        metadata: {
          pipelineVariant: "P10",
          component: "dialogue_video",
          router: usedModel.includes("veo3.1") ? "veo31_lite" : "wan27_audio",
          character,
          sliceType: slice.type,
        },
      };
      clips.push(clip);
      appendClipResult(clip);
    } else {
      console.log(`  [P10] Dialogue ${di + 1}/${dialogueSlices.length} ✗ FAILED — both Veo and Wan 2.7 failed`);
      clips.push(makeFailedPipelineClip("P10", slice, "fal_ai", "veo31_lite+wan27", wallClockMs, new Error("Both Veo 3.1 Lite and Wan 2.7+audio_url failed")));
    }
  }

  // ─── Step 4: Optional Kling Lip Sync for Wan 2.7 fallback clips ─────────────
  const klingLsPricing = pricingData.video.kling_lipsync_fal;
  let lipsyncCost = 0;
  let klingLsSuccessCount = 0;
  let klingLsFailCount = 0;

  // Only apply lip sync to Wan 2.7+audio_url clips (Veo 3.1 Lite has native lip sync)
  const wan27DialogueClips = clips.filter(
    (c) => c.metadata?.router === "wan27_audio" && c.status === "success"
  );

  if (wan27DialogueClips.length > 0) {
    console.log(`  [P10] Kling Lip Sync: processing ${wan27DialogueClips.length} Wan 2.7 dialogue clips (Veo clips skip — native lip sync)...`);

    const BATCH_SIZE = 3;
    for (let batchStart = 0; batchStart < wan27DialogueClips.length; batchStart += BATCH_SIZE) {
      const batch = wan27DialogueClips.slice(batchStart, batchStart + BATCH_SIZE);
      console.log(`  [P10] Kling batch ${Math.floor(batchStart / BATCH_SIZE) + 1}/${Math.ceil(wan27DialogueClips.length / BATCH_SIZE)}: slices ${batch.map(c => c.shotId.replace("slice_", "")).join(", ")}`);

      const batchPromises = batch.map(async (clip) => {
        const sliceId = parseInt(clip.shotId.replace("slice_", ""));
        const ttsOutput = ttsOutputs.get(sliceId);
        if (!clip.outputUrl || !ttsOutput) {
          return { sliceId, success: false, cost: 0 };
        }

        try {
          console.log(`  [P10] LipSync slice ${sliceId}: starting Kling Lip Sync...`);
          const { result: klingOutput } = await withRetry(async () => {
            return await applyKlingLipSync(clip.outputUrl!, ttsOutput.url);
          });
          const cost = klingLsPricing.per10sClip ?? 1.68;
          console.log(`  [P10] LipSync slice ${sliceId} ✓ Kling success — $${cost.toFixed(2)}`);

          // Write lip sync result to CSV
          const lsClip: ClipResult = {
            ticketId: "P10",
            shotId: `slice_${sliceId}_lipsync`,
            provider: "fal_ai",
            model: klingLsPricing.model,
            mode: "lipsync",
            resolution: "720p",
            durationSec: clip.durationSec,
            costUsd: cost,
            wallClockMs: 0,
            queueTimeMs: 0,
            generationTimeMs: 0,
            outputUrl: klingOutput.url,
            status: "success",
            error: null,
            retryCount: 0,
            timestamp: new Date().toISOString(),
            metadata: { pipelineVariant: "P10", component: "lipsync", router: "kling_lipsync", originalSlice: sliceId },
          };
          appendClipResult(lsClip);
          clip.outputUrl = klingOutput.url;

          return { sliceId, success: true, url: klingOutput.url, cost };
        } catch (err: any) {
          console.warn(`  [P10] LipSync slice ${sliceId}: Kling failed — ${err.message?.slice(0, 100)}`);
          const failClip: ClipResult = {
            ticketId: "P10",
            shotId: `slice_${sliceId}_lipsync`,
            provider: "fal_ai",
            model: klingLsPricing.model,
            mode: "lipsync",
            resolution: "720p",
            durationSec: clip.durationSec,
            costUsd: 0,
            wallClockMs: 0,
            queueTimeMs: 0,
            generationTimeMs: 0,
            outputUrl: null,
            status: "failed",
            error: err.message?.slice(0, 200) ?? "Unknown error",
            retryCount: 2,
            timestamp: new Date().toISOString(),
            metadata: { pipelineVariant: "P10", component: "lipsync", router: "kling_lipsync", originalSlice: sliceId },
          };
          appendClipResult(failClip);
          return { sliceId, success: false, cost: 0 };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      for (const r of batchResults) {
        if (r.success) {
          klingLsSuccessCount++;
          lipsyncCost += r.cost;
        } else {
          klingLsFailCount++;
        }
      }
    }
  } else {
    console.log(`  [P10] Kling Lip Sync: skipped — all dialogue clips via Veo 3.1 Lite (native lip sync)`);
  }

  // ─── Assembly ──────────────────────────────────────────────────────────────────
  const allDialogueText = dialogueSlices.map((s) => s.dialogue?.text ?? "").join(" ");
  const totalCost = silentCost + ttsCost + dialogueCost + lipsyncCost;
  const totalWallClockMs = pipelineTimer();

  const silentDurationSec = silentSlices.reduce((sum, s) => sum + s.duration, 0);
  const dialogueDurationSec = dialogueSlices.reduce((sum, s) => sum + s.duration, 0);

  console.log(`\n  [P10] ═══ SUMMARY ═══`);
  console.log(`  [P10] Silent: ${silentSlices.length} slices via Wan 2.7 — $${silentCost.toFixed(2)}`);
  console.log(`  [P10] TTS: ${ttsOutputs.size} clips via ElevenLabs — $${ttsCost.toFixed(4)}`);
  console.log(`  [P10] Dialogue: ${veoSuccessCount} via Veo 3.1 Lite, ${wan27FallbackCount} via Wan 2.7+audio — $${dialogueCost.toFixed(2)}`);
  if (wan27DialogueClips.length > 0) {
    console.log(`  [P10] Lip Sync: ${klingLsSuccessCount}/${wan27DialogueClips.length} Wan 2.7 clips refined via Kling — $${lipsyncCost.toFixed(2)}`);
  }
  console.log(`  [P10] Total: $${totalCost.toFixed(2)} in ${(totalWallClockMs / 1000 / 60).toFixed(1)} min`);

  const components = buildComponentBreakdown([
    { component: "video", provider: "fal_ai", model: `Wan 2.7 (${silentSlices.length} silent, 720p)`, units: silentDurationSec, unitType: "seconds", costUsd: silentCost },
    { component: "tts", provider: "elevenlabs", model: "turbo-v2.5 (char voices: Mira=Sarah, Ren=Harry)", units: allDialogueText.length, unitType: "characters", costUsd: ttsCost },
    { component: "video", provider: "fal_ai", model: `Veo 3.1 Lite (${veoSuccessCount} dialogue) + Wan 2.7 audio (${wan27FallbackCount} fallback)`, units: dialogueDurationSec, unitType: "seconds", costUsd: dialogueCost },
    ...(wan27DialogueClips.length > 0 ? [{ component: "lipsync" as const, provider: "fal_ai", model: `Kling Lip Sync (${klingLsSuccessCount}/${wan27DialogueClips.length} Wan 2.7 clips)`, units: klingLsSuccessCount, unitType: "clips" as const, costUsd: lipsyncCost }] : []),
  ]);

  const result: PipelineResult = {
    pipelineId: `P10_${Date.now()}`,
    variant: "P10_wan27_veo31lite_unified",
    totalSlices: script._meta.totalSlices,
    totalDurationSec: script._meta.totalDuration,
    components,
    totalCostUsd: totalCost,
    totalWallClockMs,
    costPerSecond: totalCost / script._meta.totalDuration,
    costPerMinute: (totalCost / script._meta.totalDuration) * 60,
    costPer5Min: extrapolateCost(totalCost, 3, 5),
    status: clips.every((c) => c.status === "success") ? "success" : clips.some((c) => c.status === "success") ? "partial" : "failed",
    failedSlices: clips.filter((c) => c.status === "failed").length,
    timestamp: new Date().toISOString(),
  };

  appendPipelineResult(result);
  writeComponentBreakdownCsv(result.pipelineId, components);
  return result;
}

// ─── Character Lock Injection Helper ─────────────────────────────────────────

function injectCharacterLock(prompt: string, character?: string | null): string {
  if (!character) return prompt;
  const lock = CHARACTER_LOCK[character];
  if (!lock) return prompt;
  // Prepend character description to ensure visual consistency
  return `${lock} ${prompt}`;
}

/// ─── Provider Implementations (Real API Calls) ───────────────────────────────────────
// Wired to shared api-clients module for all providers.

import {
  klingOmniViaFal,
  wan22ViaFal,
  wan25ViaFal,
  wan27ViaFal,
  veo31LiteViaFal,
  hunyuanViaFal,
  hedraCharacter3,
  elevenLabsTTS,
  cartesiaTTS,
  latentSyncViaFal,
  museTalkViaFal,
  klingLipSyncViaFal,
  viduQ3ViaFal,
} from "../providers/api-clients.js";

async function generateWan27(_apiKey: string, slice: Slice, audioUrl?: string): Promise<GenerationOutput> {
  const imageUrl = await ensurePublicUrl(slice.referenceImage);
  return wan27ViaFal({
    imageUrl: imageUrl ?? undefined,
    prompt: slice.prompt,
    duration: slice.duration,
    resolution: "720p",
    audioUrl,
  });
}

async function generateVeo31Lite(_apiKey: string, slice: Slice): Promise<GenerationOutput> {
  const imageUrl = await ensurePublicUrl(slice.referenceImage);
  if (!imageUrl) throw new Error("Veo 3.1 Lite requires an image_url");
  // Map slice duration (10s) to nearest Veo duration enum
  const veoDuration: "4s" | "6s" | "8s" = slice.duration <= 5 ? "4s" : slice.duration <= 7 ? "6s" : "8s";
  return veo31LiteViaFal({
    imageUrl,
    prompt: slice.prompt,
    duration: veoDuration,
    resolution: "720p",
    generateAudio: true,
  });
}

async function generateKlingOmni(_apiKey: string, slice: Slice): Promise<GenerationOutput> {
  const imageUrl = await ensurePublicUrl(slice.referenceImage);
  return klingOmniViaFal({
    imageUrl: imageUrl ?? undefined,
    prompt: slice.prompt,
    duration: String(slice.duration),
    audio: slice.audio,
  });
}

async function generateWan22(_apiKey: string, slice: Slice): Promise<GenerationOutput> {
  const imageUrl = await ensurePublicUrl(slice.referenceImage);
  return wan22ViaFal({
    imageUrl: imageUrl ?? undefined,
    prompt: slice.prompt,
    duration: slice.duration,
  });
}

async function generateWan25(_apiKey: string, slice: Slice): Promise<GenerationOutput> {
  const imageUrl = await ensurePublicUrl(slice.referenceImage);
  return wan25ViaFal({
    imageUrl: imageUrl ?? undefined,
    prompt: slice.prompt,
    duration: slice.duration,
    resolution: "1080p",
  });
}

async function generateHunyuan(_apiKey: string, slice: Slice): Promise<GenerationOutput> {
  const imageUrl = await ensurePublicUrl(slice.referenceImage);
  return hunyuanViaFal({
    imageUrl: imageUrl ?? undefined,
    prompt: slice.prompt,
    duration: slice.duration,
  });
}

async function generateHedra(_apiKey: string, slice: Slice): Promise<GenerationOutput> {
  // Generate TTS audio first for the dialogue
  const dialogueText = slice.dialogue?.text ?? "Test dialogue for benchmark.";
  const ttsOutput = await elevenLabsTTS({ text: dialogueText });
  // Use the slice's reference image (Hedra downloads from URL directly)
  const imageUrl = slice.referenceImage ?? "https://placehold.co/512x512/png";
  return hedraCharacter3({
    imageUrl,
    audioUrl: ttsOutput.url,
    prompt: slice.prompt,
    durationMs: slice.duration * 1000,
  });
}

// Pipeline-specific TTS + lipsync helpers used inside P2/P3/P4

async function generateElevenLabsTTSForPipeline(text: string): Promise<GenerationOutput> {
  return elevenLabsTTS({ text });
}

async function generateCartesiaTTSForPipeline(text: string): Promise<GenerationOutput> {
  return cartesiaTTS({ text });
}

async function applyLatentSync(videoUrl: string, audioUrl: string): Promise<GenerationOutput> {
  return latentSyncViaFal({ videoUrl, audioUrl });
}

async function applyMuseTalk(videoUrl: string, audioUrl: string): Promise<GenerationOutput> {
  return museTalkViaFal({ videoUrl, audioUrl });
}

async function applyKlingLipSync(videoUrl: string, audioUrl: string): Promise<GenerationOutput> {
  return klingLipSyncViaFal({ videoUrl, audioUrl });
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function makeFailedPipelineClip(
  ticketId: string,
  slice: Slice,
  provider: string,
  model: string,
  wallClockMs: number,
  err: unknown
): ClipResult {
  const clip: ClipResult = {
    ticketId,
    shotId: `slice_${slice.sliceId}`,
    provider,
    model,
    mode: slice.audio ? "dialogue" : "standard",
    resolution: "unknown",
    durationSec: slice.duration,
    costUsd: 0,
    wallClockMs,
    queueTimeMs: 0,
    generationTimeMs: 0,
    outputUrl: null,
    status: "failed",
    error: err instanceof Error ? err.message : String(err),
    retryCount: 2,
    timestamp: new Date().toISOString(),
    metadata: { pipelineVariant: ticketId, sliceType: slice.type },
  };
  appendClipResult(clip);
  return clip;
}


// ═══════════════════════════════════════════════════════════════════════════
// P11 — Pipeline Refinement
//
// Changes from P10:
//   - M1: Vidu Q3 as primary silent-slice provider (circuit breaker → Wan 2.7)
//   - F1: Mira action close-up references (v5 fixture)
//   - F2: Strengthened CHARACTER_LOCK with eye-colour NEVER clauses
//   - W3: Critic LLM pre-validation before each video dispatch
//   - W1: Classified transitions in assembly
//   - W2: MiniMax Music bed with side-chain ducking in assembly
// ═══════════════════════════════════════════════════════════════════════════

import { criticValidate, type CriticInput } from "../assembly/critic-llm.js";

async function generateViduQ3(_apiKey: string, slice: Slice): Promise<GenerationOutput> {
  const imageUrl = await ensurePublicUrl(slice.referenceImage);
  if (!imageUrl) throw new Error("Vidu Q3 requires an image_url");
  return viduQ3ViaFal({
    imageUrl,
    prompt: slice.prompt,
    duration: slice.duration,
    resolution: "720p",
    audio: false,
  });
}

export async function runP11(script: PilotScript): Promise<PipelineResult> {
  const pipelineTimer = startTimer();
  const clips: ClipResult[] = [];
  const falKey = getProviderKey("fal_ai");

  const silentSlices = script.slices.filter((s) => !s.audio);
  const dialogueSlices = script.slices.filter((s) => s.audio);

  console.log(`  [P11] Architecture: ${silentSlices.length} silent → Vidu Q3 (fallback: Wan 2.7), ${dialogueSlices.length} dialogue → Veo 3.1 Lite (fallback: Wan 2.7 + audio_url)`);
  console.log(`  [P11] New: Critic LLM pre-validation, Mira action refs (v5), eye-colour CHARACTER_LOCK`);

  // ─── Step 1: ALL silent slices via Vidu Q3 (M1) ────────────────────────────
  const viduPricing = pricingData.video.vidu_q3_fal;
  const wan27Pricing = pricingData.video.wan27_fal;
  let silentCost = 0;
  let viduSuccessCount = 0;
  let wan27SilentFallbackCount = 0;
  let consecutiveViduFailures = 0;
  let viduDisabled = false;

  for (let si = 0; si < silentSlices.length; si++) {
    const slice = silentSlices[si];
    const enhancedPrompt = injectCharacterLock(slice.prompt, slice.dialogue?.character);
    const enhancedSlice = { ...slice, prompt: enhancedPrompt };

    // W3: Critic LLM pre-validation
    const criticInput: CriticInput = {
      sliceId: slice.sliceId,
      type: slice.type,
      prompt: enhancedPrompt,
      referenceImageUrl: slice.referenceImage ?? undefined,
      characterLock: slice.dialogue?.character ? CHARACTER_LOCK[slice.dialogue.character] : undefined,
      character: slice.dialogue?.character ?? undefined,
    };

    let finalPrompt = enhancedPrompt;
    try {
      const criticResult = await criticValidate(criticInput);
      if (criticResult.verdict === "fail") {
        console.log(`  [P11] Critic FAIL for silent slice ${slice.sliceId}: ${criticResult.issues.join("; ")}`);
        // Use revised prompt if available, otherwise proceed with original
        if (criticResult.revisedPrompt) {
          finalPrompt = criticResult.revisedPrompt;
          console.log(`  [P11] Using revised prompt for slice ${slice.sliceId}`);
        }
      } else if (criticResult.verdict === "warn" && criticResult.revisedPrompt) {
        finalPrompt = criticResult.revisedPrompt;
        console.log(`  [P11] Critic WARN for slice ${slice.sliceId}, using revised prompt`);
      }
    } catch (err: any) {
      console.warn(`  [P11] Critic unavailable for slice ${slice.sliceId}: ${err.message?.slice(0, 60)}`);
    }

    const finalSlice = { ...enhancedSlice, prompt: finalPrompt };

    console.log(`  [P11] Silent ${si + 1}/${silentSlices.length} (id=${slice.sliceId}, type=${slice.type}) — ${viduDisabled ? "Vidu DISABLED, using Wan 2.7" : "trying Vidu Q3..."}`);
    const timer = startTimer();

    let silentSuccess = false;
    let silentOutput: GenerationOutput | null = null;
    let usedProvider = "";
    let usedModel = "";
    let usedCostPerSec = 0;

    // Primary: Vidu Q3 (unless circuit breaker tripped)
    if (!viduDisabled) {
      try {
        const { result: output } = await withRetry(async () => {
          return await generateViduQ3(falKey, finalSlice);
        }, { maxRetries: 1 }); // Fail fast to try Wan 2.7
        silentOutput = output;
        silentSuccess = true;
        usedProvider = "fal_ai";
        usedModel = viduPricing.model;
        usedCostPerSec = viduPricing.perSecond;
        viduSuccessCount++;
        consecutiveViduFailures = 0;
        console.log(`  [P11] Silent ${si + 1}: Vidu Q3 ✓`);
      } catch (err: any) {
        consecutiveViduFailures++;
        console.warn(`  [P11] Silent ${si + 1}: Vidu Q3 failed (${consecutiveViduFailures} consecutive) — ${err.message?.slice(0, 80)}`);
        if (consecutiveViduFailures >= 2) {
          viduDisabled = true;
          console.warn(`  [P11] ⚠ Circuit breaker: Vidu Q3 disabled after ${consecutiveViduFailures} consecutive failures. Falling back to Wan 2.7.`);
        }
      }
    }

    // Fallback: Wan 2.7
    if (!silentSuccess) {
      try {
        console.log(`  [P11] Silent ${si + 1}: falling back to Wan 2.7...`);
        const { result: output } = await withRetry(async () => {
          return await generateWan27(falKey, finalSlice);
        });
        silentOutput = output;
        silentSuccess = true;
        usedProvider = "fal_ai";
        usedModel = wan27Pricing.model;
        usedCostPerSec = wan27Pricing.perSecond;
        wan27SilentFallbackCount++;
        console.log(`  [P11] Silent ${si + 1}: Wan 2.7 ✓`);
      } catch (err: any) {
        console.warn(`  [P11] Silent ${si + 1}: Wan 2.7 also failed — ${err.message?.slice(0, 80)}`);
      }
    }

    const wallClockMs = timer();
    if (silentSuccess && silentOutput) {
      // Vidu Q3 outputs 4s clips for ≤5s slices, 8s for longer
      const actualDuration = usedModel.includes("vidu") ? (slice.duration <= 5 ? 4 : 8) : slice.duration;
      const cost = calculateClipCost(actualDuration, usedCostPerSec, null, null);
      silentCost += cost;
      console.log(`  [P11] Silent ${si + 1}/${silentSlices.length} ✓ done in ${(wallClockMs / 1000).toFixed(1)}s — $${cost.toFixed(4)} via ${usedModel.includes("vidu") ? "Vidu Q3" : "Wan 2.7"}`);

      const clip: ClipResult = {
        ticketId: "P11",
        shotId: `slice_${slice.sliceId}`,
        provider: usedProvider,
        model: usedModel,
        mode: "standard",
        resolution: "720p",
        durationSec: actualDuration,
        costUsd: cost,
        wallClockMs,
        queueTimeMs: silentOutput.queueTimeMs ?? 0,
        generationTimeMs: silentOutput.generationTimeMs ?? wallClockMs,
        outputUrl: silentOutput.url,
        status: "success",
        error: null,
        retryCount: 0,
        timestamp: new Date().toISOString(),
        metadata: {
          pipelineVariant: "P11",
          component: "silent_video",
          router: usedModel.includes("vidu") ? "vidu_q3" : "wan27",
          sliceType: slice.type,
        },
      };
      clips.push(clip);
      appendClipResult(clip);
    } else {
      console.log(`  [P11] Silent ${si + 1}/${silentSlices.length} ✗ FAILED — both Vidu Q3 and Wan 2.7 failed`);
      clips.push(makeFailedPipelineClip("P11", slice, "fal_ai", "vidu_q3+wan27", wallClockMs, new Error("Both Vidu Q3 and Wan 2.7 failed")));
    }
  }

  // ─── Step 2: TTS with ElevenLabs — character-specific voices ──────────────
  const ttsPricing = pricingData.tts.elevenlabs;
  let ttsCost = 0;
  const ttsOutputs: Map<number, GenerationOutput> = new Map();

  for (const slice of dialogueSlices) {
    const dialogueText = slice.dialogue?.text ?? "";
    if (!dialogueText) continue;
    const character = slice.dialogue?.character ?? "";
    const voiceId = VOICE_MAP[character] ?? DEFAULT_VOICE;
    const voiceName = character === "Mira" ? "Sarah" : character === "Ren" ? "Harry" : "Rachel";
    console.log(`  [P11] TTS for slice ${slice.sliceId} (${character}) — voice: ${voiceName}`);
    try {
      const { result: ttsOutput } = await withRetry(async () => {
        return await elevenLabsTTS({ text: dialogueText, voiceId });
      });
      const cost = calculateTTSCost(dialogueText.length, ttsPricing.perKChars);
      ttsCost += cost;
      ttsOutputs.set(slice.sliceId, ttsOutput);
      console.log(`  [P11] TTS for slice ${slice.sliceId}: $${cost.toFixed(4)}`);
    } catch (err) {
      console.error(`  [P11] TTS failed for slice ${slice.sliceId}:`, err);
    }
  }

  // ─── Step 3: Dialogue clips — Veo 3.1 Lite primary, Wan 2.7+audio_url fallback
  const veo31Pricing = pricingData.video.veo31_lite_fal;
  const wan27AudioPricing = pricingData.video.wan27_audio_fal;
  let dialogueCost = 0;
  let veoSuccessCount = 0;
  let wan27FallbackCount = 0;
  let consecutiveVeoFailures = 0;
  let veoDisabled = false;

  for (let di = 0; di < dialogueSlices.length; di++) {
    const slice = dialogueSlices[di];
    const character = slice.dialogue?.character ?? "";
    const enhancedPrompt = injectCharacterLock(slice.prompt, character);

    // W3: Critic LLM pre-validation for dialogue slices
    const criticInput: CriticInput = {
      sliceId: slice.sliceId,
      type: slice.type,
      prompt: enhancedPrompt,
      referenceImageUrl: slice.referenceImage ?? undefined,
      characterLock: CHARACTER_LOCK[character],
      character,
      dialogueText: slice.dialogue?.text,
      emotion: slice.dialogue?.emotion,
    };

    let finalPrompt = enhancedPrompt;
    try {
      const criticResult = await criticValidate(criticInput);
      if (criticResult.verdict === "warn" && criticResult.revisedPrompt) {
        finalPrompt = criticResult.revisedPrompt;
        console.log(`  [P11] Critic revised prompt for dialogue slice ${slice.sliceId}`);
      } else if (criticResult.verdict === "fail") {
        console.log(`  [P11] Critic FAIL for dialogue slice ${slice.sliceId}: ${criticResult.issues.join("; ")}`);
        if (criticResult.revisedPrompt) {
          finalPrompt = criticResult.revisedPrompt;
        }
      }
    } catch (err: any) {
      console.warn(`  [P11] Critic unavailable for slice ${slice.sliceId}: ${err.message?.slice(0, 60)}`);
    }

    const enhancedSlice = { ...slice, prompt: finalPrompt };
    const ttsOutput = ttsOutputs.get(slice.sliceId);

    console.log(`  [P11] Dialogue ${di + 1}/${dialogueSlices.length} (id=${slice.sliceId}, char=${character}) — ${veoDisabled ? "Veo DISABLED, using Wan 2.7+audio_url" : "trying Veo 3.1 Lite..."}`);
    const timer = startTimer();

    let dialogueSuccess = false;
    let dialogueOutput: GenerationOutput | null = null;
    let usedProvider = "";
    let usedModel = "";
    let usedCostPerSec = 0;

    // Primary: Veo 3.1 Lite (unless circuit breaker tripped)
    if (!veoDisabled) {
      try {
        const { result: output } = await withRetry(async () => {
          return await generateVeo31Lite(falKey, enhancedSlice);
        }, { maxRetries: 1 });
        dialogueOutput = output;
        dialogueSuccess = true;
        usedProvider = "fal_ai";
        usedModel = veo31Pricing.model;
        usedCostPerSec = veo31Pricing.perSecond;
        veoSuccessCount++;
        consecutiveVeoFailures = 0;
        console.log(`  [P11] Dialogue ${di + 1}: Veo 3.1 Lite ✓`);
      } catch (err: any) {
        consecutiveVeoFailures++;
        console.warn(`  [P11] Dialogue ${di + 1}: Veo 3.1 Lite failed (${consecutiveVeoFailures} consecutive) — ${err.message?.slice(0, 80)}`);
        if (consecutiveVeoFailures >= 2) {
          veoDisabled = true;
          console.warn(`  [P11] ⚠ Circuit breaker: Veo 3.1 Lite disabled after ${consecutiveVeoFailures} consecutive failures.`);
        }
      }
    }

    // Fallback: Wan 2.7 with audio_url
    if (!dialogueSuccess && ttsOutput) {
      try {
        console.log(`  [P11] Dialogue ${di + 1}: falling back to Wan 2.7 + audio_url...`);
        const { result: output } = await withRetry(async () => {
          return await generateWan27(falKey, enhancedSlice, ttsOutput.url);
        });
        dialogueOutput = output;
        dialogueSuccess = true;
        usedProvider = "fal_ai";
        usedModel = wan27AudioPricing.model;
        usedCostPerSec = wan27AudioPricing.perSecond;
        wan27FallbackCount++;
        console.log(`  [P11] Dialogue ${di + 1}: Wan 2.7+audio_url ✓`);
      } catch (err: any) {
        console.warn(`  [P11] Dialogue ${di + 1}: Wan 2.7+audio_url also failed — ${err.message?.slice(0, 80)}`);
      }
    }

    // Record result
    const wallClockMs = timer();
    if (dialogueSuccess && dialogueOutput) {
      const actualDuration = usedModel.includes("veo3.1") ? 8 : slice.duration;
      const cost = calculateClipCost(actualDuration, usedCostPerSec, null, null);
      dialogueCost += cost;
      console.log(`  [P11] Dialogue ${di + 1}/${dialogueSlices.length} ✓ done in ${(wallClockMs / 1000).toFixed(1)}s — $${cost.toFixed(4)} via ${usedModel.includes("veo3.1") ? "Veo 3.1 Lite" : "Wan 2.7+audio"}`);

      const clip: ClipResult = {
        ticketId: "P11",
        shotId: `slice_${slice.sliceId}`,
        provider: usedProvider,
        model: usedModel,
        mode: "dialogue",
        resolution: "720p",
        durationSec: actualDuration,
        costUsd: cost,
        wallClockMs,
        queueTimeMs: dialogueOutput.queueTimeMs ?? 0,
        generationTimeMs: dialogueOutput.generationTimeMs ?? wallClockMs,
        outputUrl: dialogueOutput.url,
        status: "success",
        error: null,
        retryCount: 0,
        timestamp: new Date().toISOString(),
        metadata: {
          pipelineVariant: "P11",
          component: "dialogue_video",
          router: usedModel.includes("veo3.1") ? "veo31_lite" : "wan27_audio",
          character,
          sliceType: slice.type,
        },
      };
      clips.push(clip);
      appendClipResult(clip);
    } else {
      console.log(`  [P11] Dialogue ${di + 1}/${dialogueSlices.length} ✗ FAILED — both Veo and Wan 2.7 failed`);
      clips.push(makeFailedPipelineClip("P11", slice, "fal_ai", "veo31_lite+wan27", wallClockMs, new Error("Both Veo 3.1 Lite and Wan 2.7+audio_url failed")));
    }
  }

  // ─── Step 4: Optional Kling Lip Sync for Wan 2.7 fallback clips ─────────────
  const klingLsPricing = pricingData.video.kling_lipsync_fal;
  let lipsyncCost = 0;
  let klingLsSuccessCount = 0;
  let klingLsFailCount = 0;

  const wan27DialogueClips = clips.filter(
    (c) => c.metadata?.router === "wan27_audio" && c.status === "success"
  );

  if (wan27DialogueClips.length > 0) {
    console.log(`  [P11] Kling Lip Sync: processing ${wan27DialogueClips.length} Wan 2.7 dialogue clips...`);

    for (const clip of wan27DialogueClips) {
      const sliceId = parseInt(clip.shotId.replace("slice_", ""));
      const ttsOutput = ttsOutputs.get(sliceId);
      if (!clip.outputUrl || !ttsOutput) continue;

      try {
        console.log(`  [P11] LipSync slice ${sliceId}: starting Kling Lip Sync...`);
        const { result: klingOutput } = await withRetry(async () => {
          return await applyKlingLipSync(clip.outputUrl!, ttsOutput.url);
        });
        const cost = klingLsPricing.per10sClip ?? 1.68;
        klingLsSuccessCount++;
        lipsyncCost += cost;
        console.log(`  [P11] LipSync slice ${sliceId} ✓ — $${cost.toFixed(2)}`);

        const lsClip: ClipResult = {
          ticketId: "P11",
          shotId: `slice_${sliceId}_lipsync`,
          provider: "fal_ai",
          model: klingLsPricing.model,
          mode: "lipsync",
          resolution: "720p",
          durationSec: clip.durationSec,
          costUsd: cost,
          wallClockMs: 0,
          queueTimeMs: 0,
          generationTimeMs: 0,
          outputUrl: klingOutput.url,
          status: "success",
          error: null,
          retryCount: 0,
          timestamp: new Date().toISOString(),
          metadata: { pipelineVariant: "P11", component: "lipsync", router: "kling_lipsync", originalSlice: sliceId },
        };
        appendClipResult(lsClip);
        clip.outputUrl = klingOutput.url;
      } catch (err: any) {
        klingLsFailCount++;
        console.warn(`  [P11] LipSync slice ${sliceId}: Kling failed — ${err.message?.slice(0, 100)}`);
      }
    }
  } else {
    console.log(`  [P11] Kling Lip Sync: skipped — all dialogue clips via Veo 3.1 Lite`);
  }

  // ─── Summary ──────────────────────────────────────────────────────────────────
  const allDialogueText = dialogueSlices.map((s) => s.dialogue?.text ?? "").join(" ");
  const totalCost = silentCost + ttsCost + dialogueCost + lipsyncCost;
  const totalWallClockMs = pipelineTimer();

  const silentDurationSec = silentSlices.reduce((sum, s) => sum + s.duration, 0);
  const dialogueDurationSec = dialogueSlices.reduce((sum, s) => sum + s.duration, 0);

  console.log(`\n  [P11] ═══ SUMMARY ═══`);
  console.log(`  [P11] Silent: ${viduSuccessCount} via Vidu Q3, ${wan27SilentFallbackCount} via Wan 2.7 — $${silentCost.toFixed(2)}`);
  console.log(`  [P11] TTS: ${ttsOutputs.size} clips via ElevenLabs — $${ttsCost.toFixed(4)}`);
  console.log(`  [P11] Dialogue: ${veoSuccessCount} via Veo 3.1 Lite, ${wan27FallbackCount} via Wan 2.7+audio — $${dialogueCost.toFixed(2)}`);
  if (wan27DialogueClips.length > 0) {
    console.log(`  [P11] Lip Sync: ${klingLsSuccessCount}/${wan27DialogueClips.length} Wan 2.7 clips refined via Kling — $${lipsyncCost.toFixed(2)}`);
  }
  console.log(`  [P11] Total: $${totalCost.toFixed(2)} in ${(totalWallClockMs / 1000 / 60).toFixed(1)} min`);

  const components = buildComponentBreakdown([
    { component: "video", provider: "fal_ai", model: `Vidu Q3 (${viduSuccessCount}) + Wan 2.7 fallback (${wan27SilentFallbackCount}) — silent`, units: silentDurationSec, unitType: "seconds", costUsd: silentCost },
    { component: "tts", provider: "elevenlabs", model: "turbo-v2.5 (Mira=Sarah, Ren=Harry)", units: allDialogueText.length, unitType: "characters", costUsd: ttsCost },
    { component: "video", provider: "fal_ai", model: `Veo 3.1 Lite (${veoSuccessCount}) + Wan 2.7 audio (${wan27FallbackCount}) — dialogue`, units: dialogueDurationSec, unitType: "seconds", costUsd: dialogueCost },
    ...(wan27DialogueClips.length > 0 ? [{ component: "lipsync" as const, provider: "fal_ai", model: `Kling Lip Sync (${klingLsSuccessCount}/${wan27DialogueClips.length})`, units: klingLsSuccessCount, unitType: "clips" as const, costUsd: lipsyncCost }] : []),
  ]);

  const result: PipelineResult = {
    pipelineId: `P11_${Date.now()}`,
    variant: "P11_viduQ3_veo31lite_critic_refined",
    totalSlices: script._meta.totalSlices,
    totalDurationSec: script._meta.totalDuration,
    components,
    totalCostUsd: totalCost,
    totalWallClockMs,
    costPerSecond: totalCost / script._meta.totalDuration,
    costPerMinute: (totalCost / script._meta.totalDuration) * 60,
    costPer5Min: extrapolateCost(totalCost, 3, 5),
    status: clips.every((c) => c.status === "success") ? "success" : clips.some((c) => c.status === "success") ? "partial" : "failed",
    failedSlices: clips.filter((c) => c.status === "failed").length,
    timestamp: new Date().toISOString(),
  };

  appendPipelineResult(result);
  writeComponentBreakdownCsv(result.pipelineId, components);
  return result;
}


// ═══════════════════════════════════════════════════════════════════════════
// P12 — Multi-LLM Orchestrated Pipeline
//
// Changes from P11:
//   - D1: Director LLM runs once at project init → ProjectPlan
//   - D2: Visual Prompt Engineer translates per-slice to model-specific prompts
//   - D3: Critic V2 validates prompt+reference before video dispatch (retry loop cap 3)
//   - D4: Voice Director selects emotion tags + TTS overrides per dialogue line
//   - I1: All LLM calls routed through llmCall() orchestrator
//   - I2: Budget guard ($2.00/ep cap) + per-role circuit breakers
//   - C2: Feature flags per role — Phase D (all enabled) by default
// ═══════════════════════════════════════════════════════════════════════════

import {
  llmCall,
  llmObs,
  budgetGuard,
  featureFlags,
  PHASE_D_FLAGS,
  runDirector,
  buildFallbackPlan,
  runPromptEngineer,
  criticValidateV3,
  runVoiceDirector,
  type ProjectPlan,
  type ProjectPlanSlice,
  type PromptEngineerInput,
  type TargetModel,
  type CriticInput as CriticInputV2,
  type CriticResult as CriticResultV2,
  type VoiceDirectorInput,
  type VoiceDirectorResult,
} from "../llm/index.js";

export async function runP12(script: PilotScript): Promise<PipelineResult> {
  const pipelineTimer = startTimer();
  const clips: ClipResult[] = [];
  const falKey = getProviderKey("fal_ai");

  // ─── Init: Feature flags + observability ─────────────────────────────────
  featureFlags.setFlags(PHASE_D_FLAGS); // All 4 LLMs enabled
  llmObs.startEpisode(`P12_${Date.now()}`);
  budgetGuard.reset({ perEpisodeCap: 2.00, circuitBreakerThreshold: 5 });

  const silentSlices = script.slices.filter((s) => !s.audio);
  const dialogueSlices = script.slices.filter((s) => s.audio);

  console.log(`  [P12] Multi-LLM Orchestrated Pipeline`);
  console.log(`  [P12] Architecture: ${silentSlices.length} silent → Vidu Q3 (fallback: Wan 2.7), ${dialogueSlices.length} dialogue → Veo 3.1 Lite (fallback: Wan 2.7+audio_url)`);
  console.log(`  [P12] LLM stack: D1 Director → D2 Prompt Engineer → D3 Critic → D4 Voice Director`);

  // ─── Step 0: D1 Director — runs ONCE ──────────────────────────────────────
  let projectPlan: ProjectPlan;
  let directorCost = 0;

  const directorResult = await runDirector({
    userPrompt: "Awakli pilot episode: Mira discovers her mechanical arm's true power while exploring Neo-Kyoto's neon-lit streets at sunset with Ren. Tension builds as they encounter a mysterious signal.",
    characterBible: `${CHARACTER_LOCK.Mira}\n\n${CHARACTER_LOCK.Ren}`,
    targetDurationSec: script._meta.totalDuration,
    sliceCount: script._meta.totalSlices,
    sliceDurationSec: Math.round(script._meta.totalDuration / script._meta.totalSlices),
  });

  if (directorResult.success && directorResult.plan) {
    projectPlan = directorResult.plan;
    directorCost = directorResult.costEstimate;
    console.log(`  [P12] D1 Director: ✓ "${projectPlan.episodeTitle}" — ${projectPlan.slices.length} slices ($${directorCost.toFixed(4)})`);
  } else {
    console.warn(`  [P12] D1 Director: ⚠ Failed, using fallback plan — ${directorResult.error?.slice(0, 80)}`);
    projectPlan = buildFallbackPlan(
      script.slices.map((s) => ({
        sliceId: s.sliceId,
        type: s.type,
        prompt: s.prompt,
        character: s.dialogue?.character,
        dialogueText: s.dialogue?.text,
      }))
    );
    directorCost = directorResult.costEstimate;
  }

  // ─── Helper: get ProjectPlanSlice for a given slice ID ────────────────────
  function getPlanSlice(sliceId: number): ProjectPlanSlice {
    return projectPlan.slices.find((ps) => ps.id === sliceId) ?? {
      id: sliceId,
      type: "silent_establishing",
      location: "Neo-Kyoto",
      timeOfDay: "sunset",
      emotion: "neutral",
      charactersPresent: [],
      previousSliceContinuity: "",
      nextSliceContinuity: "",
    };
  }

  // ─── Helper: determine target model for a slice ───────────────────────────
  function getTargetModel(slice: Slice): TargetModel {
    if (slice.audio) return "veo31lite";
    return "viduq3";
  }

  // ─── Helper: D2→D3 loop with retry cap ────────────────────────────────────
  const CRITIC_RETRY_CAP = 3;
  let totalPromptEngineerCost = 0;
  let totalCriticCost = 0;

  async function promptAndValidate(
    slice: Slice,
    planSlice: ProjectPlanSlice,
    targetModel: TargetModel
  ): Promise<{ finalPrompt: string; criticScore: number }> {
    let currentPrompt = slice.prompt;

    for (let attempt = 0; attempt < CRITIC_RETRY_CAP; attempt++) {
      // D2: Prompt Engineer
      const peInput: PromptEngineerInput = {
        slice: planSlice,
        targetModel,
        characterLocks: CHARACTER_LOCK,
        existingPrompt: currentPrompt,
      };
      const peResult = await runPromptEngineer(peInput);
      totalPromptEngineerCost += peResult.costEstimate;

      if (peResult.success && peResult.videoPrompt) {
        currentPrompt = peResult.videoPrompt;
      }

      // D3: Critic validation
      const criticInput: CriticInputV2 = {
        sliceId: slice.sliceId,
        sliceType: slice.type,
        videoPrompt: currentPrompt,
        referenceImageUrl: slice.referenceImage ?? undefined,
        charactersPresent: planSlice.charactersPresent,
        characterChecklists: {},
        projectPlan: projectPlan,
        previousSliceContext: planSlice.previousSliceContinuity,
        nextSliceContext: planSlice.nextSliceContinuity,
      };
      const criticResult: CriticResultV2 = await criticValidateV3(criticInput);
      totalCriticCost += criticResult.costEstimate;

      if (criticResult.ok || criticResult.recommendedAction === "proceed") {
        const icon = criticResult.ok ? "✓" : "⚠";
        console.log(`  [P12] D2→D3 slice ${slice.sliceId}: ${icon} score=${criticResult.score}/5 (attempt ${attempt + 1})`);
        return { finalPrompt: currentPrompt, criticScore: criticResult.score };
      }

      if (criticResult.recommendedAction === "abort") {
        console.warn(`  [P12] D3 ABORT for slice ${slice.sliceId}: ${criticResult.issues.map((i: any) => i.description).join("; ")}`);
        return { finalPrompt: currentPrompt, criticScore: criticResult.score };
      }

      // refine-prompt or regenerate-reference: loop back to D2
      console.log(`  [P12] D3 → ${criticResult.recommendedAction} for slice ${slice.sliceId} (attempt ${attempt + 1}/${CRITIC_RETRY_CAP}): ${criticResult.issues[0]?.description?.slice(0, 60) ?? "no details"}`);
    }

    // Exhausted retries — proceed with best effort
    console.warn(`  [P12] D2→D3 exhausted ${CRITIC_RETRY_CAP} retries for slice ${slice.sliceId}, proceeding with current prompt`);
    return { finalPrompt: currentPrompt, criticScore: 2 };
  }

  // ─── Step 1: ALL silent slices — D2→D3 then Vidu Q3 / Wan 2.7 ────────────
  const viduPricing = pricingData.video.vidu_q3_fal;
  const wan27Pricing = pricingData.video.wan27_fal;
  let silentCost = 0;
  let viduSuccessCount = 0;
  let wan27SilentFallbackCount = 0;
  let consecutiveViduFailures = 0;
  let viduDisabled = false;

  for (let si = 0; si < silentSlices.length; si++) {
    const slice = silentSlices[si];
    const planSlice = getPlanSlice(slice.sliceId);
    const targetModel = getTargetModel(slice);

    // D2→D3 prompt engineering + validation loop
    const { finalPrompt } = await promptAndValidate(slice, planSlice, targetModel);
    const enhancedPrompt = injectCharacterLock(finalPrompt, slice.dialogue?.character);
    const finalSlice = { ...slice, prompt: enhancedPrompt };

    console.log(`  [P12] Silent ${si + 1}/${silentSlices.length} (id=${slice.sliceId}, type=${slice.type}) — ${viduDisabled ? "Vidu DISABLED, using Wan 2.7" : "trying Vidu Q3..."}`);
    const timer = startTimer();

    let silentSuccess = false;
    let silentOutput: GenerationOutput | null = null;
    let usedProvider = "";
    let usedModel = "";
    let usedCostPerSec = 0;

    // Primary: Vidu Q3 (unless circuit breaker tripped)
    if (!viduDisabled) {
      try {
        const { result: output } = await withRetry(async () => {
          return await generateViduQ3(falKey, finalSlice);
        }, { maxRetries: 1 });
        silentOutput = output;
        silentSuccess = true;
        usedProvider = "fal_ai";
        usedModel = viduPricing.model;
        usedCostPerSec = viduPricing.perSecond;
        viduSuccessCount++;
        consecutiveViduFailures = 0;
        console.log(`  [P12] Silent ${si + 1}: Vidu Q3 ✓`);
      } catch (err: any) {
        consecutiveViduFailures++;
        console.warn(`  [P12] Silent ${si + 1}: Vidu Q3 failed (${consecutiveViduFailures} consecutive) — ${err.message?.slice(0, 80)}`);
        if (consecutiveViduFailures >= 2) {
          viduDisabled = true;
          console.warn(`  [P12] ⚠ Circuit breaker: Vidu Q3 disabled after ${consecutiveViduFailures} consecutive failures.`);
        }
      }
    }

    // Fallback: Wan 2.7
    if (!silentSuccess) {
      try {
        console.log(`  [P12] Silent ${si + 1}: falling back to Wan 2.7...`);
        const { result: output } = await withRetry(async () => {
          return await generateWan27(falKey, finalSlice);
        });
        silentOutput = output;
        silentSuccess = true;
        usedProvider = "fal_ai";
        usedModel = wan27Pricing.model;
        usedCostPerSec = wan27Pricing.perSecond;
        wan27SilentFallbackCount++;
        console.log(`  [P12] Silent ${si + 1}: Wan 2.7 ✓`);
      } catch (err: any) {
        console.warn(`  [P12] Silent ${si + 1}: Wan 2.7 also failed — ${err.message?.slice(0, 80)}`);
      }
    }

    const wallClockMs = timer();
    if (silentSuccess && silentOutput) {
      const actualDuration = usedModel.includes("vidu") ? (slice.duration <= 5 ? 4 : 8) : slice.duration;
      const cost = calculateClipCost(actualDuration, usedCostPerSec, null, null);
      silentCost += cost;
      console.log(`  [P12] Silent ${si + 1}/${silentSlices.length} ✓ done in ${(wallClockMs / 1000).toFixed(1)}s — $${cost.toFixed(4)} via ${usedModel.includes("vidu") ? "Vidu Q3" : "Wan 2.7"}`);

      const clip: ClipResult = {
        ticketId: "P12",
        shotId: `slice_${slice.sliceId}`,
        provider: usedProvider,
        model: usedModel,
        mode: "standard",
        resolution: "720p",
        durationSec: actualDuration,
        costUsd: cost,
        wallClockMs,
        queueTimeMs: silentOutput.queueTimeMs ?? 0,
        generationTimeMs: silentOutput.generationTimeMs ?? wallClockMs,
        outputUrl: silentOutput.url,
        status: "success",
        error: null,
        retryCount: 0,
        timestamp: new Date().toISOString(),
        metadata: {
          pipelineVariant: "P12",
          component: "silent_video",
          router: usedModel.includes("vidu") ? "vidu_q3" : "wan27",
          sliceType: slice.type,
          llmEnhanced: true,
        },
      };
      clips.push(clip);
      appendClipResult(clip);
    } else {
      console.log(`  [P12] Silent ${si + 1}/${silentSlices.length} ✗ FAILED`);
      clips.push(makeFailedPipelineClip("P12", slice, "fal_ai", "vidu_q3+wan27", wallClockMs, new Error("Both Vidu Q3 and Wan 2.7 failed")));
    }
  }

  // ─── Step 2: TTS with D4 Voice Director + ElevenLabs ─────────────────────
  const ttsPricing = pricingData.tts.elevenlabs;
  let ttsCost = 0;
  let totalVoiceDirectorCost = 0;
  const ttsOutputs: Map<number, GenerationOutput> = new Map();
  const voiceDirections: Map<number, VoiceDirectorResult> = new Map();

  for (const slice of dialogueSlices) {
    const dialogueText = slice.dialogue?.text ?? "";
    if (!dialogueText) continue;
    const character = slice.dialogue?.character ?? "";
    const voiceId = VOICE_MAP[character] ?? DEFAULT_VOICE;
    const voiceName = character === "Mira" ? "Sarah" : character === "Ren" ? "Harry" : "Rachel";
    const planSlice = getPlanSlice(slice.sliceId);

    // D4: Voice Director — select emotion + TTS overrides
    const vdInput: VoiceDirectorInput = {
      slice: planSlice,
      character,
      dialogueLine: dialogueText,
    };
    const vdResult = await runVoiceDirector(vdInput);
    totalVoiceDirectorCost += vdResult.costEstimate;
    voiceDirections.set(slice.sliceId, vdResult);

    if (vdResult.success) {
      console.log(`  [P12] D4 slice ${slice.sliceId} (${character}): ${vdResult.primaryEmotion}/${vdResult.secondaryEmotion} @${vdResult.emotionIntensity.toFixed(1)} — "${vdResult.directionNote.slice(0, 50)}"`);
    }

    // TTS with Voice Director overrides
    console.log(`  [P12] TTS for slice ${slice.sliceId} (${character}) — voice: ${voiceName}, emotion: ${vdResult.primaryEmotion}`);
    try {
      const { result: ttsOutput } = await withRetry(async () => {
        return await elevenLabsTTS({
          text: dialogueText,
          voiceId,
          // Apply Voice Director TTS overrides if available
          ...(vdResult.success ? {
            stability: vdResult.ttsOverrides.stability,
            similarityBoost: vdResult.ttsOverrides.similarityBoost,
            style: vdResult.ttsOverrides.style,
          } : {}),
        });
      });
      const cost = calculateTTSCost(dialogueText.length, ttsPricing.perKChars);
      ttsCost += cost;
      ttsOutputs.set(slice.sliceId, ttsOutput);
      console.log(`  [P12] TTS for slice ${slice.sliceId}: $${cost.toFixed(4)}`);
    } catch (err) {
      console.error(`  [P12] TTS failed for slice ${slice.sliceId}:`, err);
    }
  }

  // ─── Step 3: Dialogue clips — D2→D3 then Veo 3.1 Lite / Wan 2.7 ─────────
  const veo31Pricing = pricingData.video.veo31_lite_fal;
  const wan27AudioPricing = pricingData.video.wan27_audio_fal;
  let dialogueCost = 0;
  let veoSuccessCount = 0;
  let wan27FallbackCount = 0;
  let consecutiveVeoFailures = 0;
  let veoDisabled = false;

  for (let di = 0; di < dialogueSlices.length; di++) {
    const slice = dialogueSlices[di];
    const character = slice.dialogue?.character ?? "";
    const planSlice = getPlanSlice(slice.sliceId);
    const targetModel: TargetModel = "veo31lite";

    // D2→D3 prompt engineering + validation loop
    const { finalPrompt } = await promptAndValidate(slice, planSlice, targetModel);
    const enhancedPrompt = injectCharacterLock(finalPrompt, character);
    const enhancedSlice = { ...slice, prompt: enhancedPrompt };
    const ttsOutput = ttsOutputs.get(slice.sliceId);

    console.log(`  [P12] Dialogue ${di + 1}/${dialogueSlices.length} (id=${slice.sliceId}, char=${character}) — ${veoDisabled ? "Veo DISABLED, using Wan 2.7+audio_url" : "trying Veo 3.1 Lite..."}`);
    const timer = startTimer();

    let dialogueSuccess = false;
    let dialogueOutput: GenerationOutput | null = null;
    let usedProvider = "";
    let usedModel = "";
    let usedCostPerSec = 0;

    // Primary: Veo 3.1 Lite (unless circuit breaker tripped)
    if (!veoDisabled) {
      try {
        const { result: output } = await withRetry(async () => {
          return await generateVeo31Lite(falKey, enhancedSlice);
        }, { maxRetries: 1 });
        dialogueOutput = output;
        dialogueSuccess = true;
        usedProvider = "fal_ai";
        usedModel = veo31Pricing.model;
        usedCostPerSec = veo31Pricing.perSecond;
        veoSuccessCount++;
        consecutiveVeoFailures = 0;
        console.log(`  [P12] Dialogue ${di + 1}: Veo 3.1 Lite ✓`);
      } catch (err: any) {
        consecutiveVeoFailures++;
        console.warn(`  [P12] Dialogue ${di + 1}: Veo 3.1 Lite failed (${consecutiveVeoFailures} consecutive) — ${err.message?.slice(0, 80)}`);
        if (consecutiveVeoFailures >= 2) {
          veoDisabled = true;
          console.warn(`  [P12] ⚠ Circuit breaker: Veo 3.1 Lite disabled after ${consecutiveVeoFailures} consecutive failures.`);
        }
      }
    }

    // Fallback: Wan 2.7 with audio_url
    if (!dialogueSuccess && ttsOutput) {
      try {
        console.log(`  [P12] Dialogue ${di + 1}: falling back to Wan 2.7 + audio_url...`);
        const { result: output } = await withRetry(async () => {
          return await generateWan27(falKey, enhancedSlice, ttsOutput.url);
        });
        dialogueOutput = output;
        dialogueSuccess = true;
        usedProvider = "fal_ai";
        usedModel = wan27AudioPricing.model;
        usedCostPerSec = wan27AudioPricing.perSecond;
        wan27FallbackCount++;
        console.log(`  [P12] Dialogue ${di + 1}: Wan 2.7+audio_url ✓`);
      } catch (err: any) {
        console.warn(`  [P12] Dialogue ${di + 1}: Wan 2.7+audio_url also failed — ${err.message?.slice(0, 80)}`);
      }
    }

    // Record result
    const wallClockMs = timer();
    if (dialogueSuccess && dialogueOutput) {
      const actualDuration = usedModel.includes("veo3.1") ? 8 : slice.duration;
      const cost = calculateClipCost(actualDuration, usedCostPerSec, null, null);
      dialogueCost += cost;
      console.log(`  [P12] Dialogue ${di + 1}/${dialogueSlices.length} ✓ done in ${(wallClockMs / 1000).toFixed(1)}s — $${cost.toFixed(4)} via ${usedModel.includes("veo3.1") ? "Veo 3.1 Lite" : "Wan 2.7+audio"}`);

      const clip: ClipResult = {
        ticketId: "P12",
        shotId: `slice_${slice.sliceId}`,
        provider: usedProvider,
        model: usedModel,
        mode: "dialogue",
        resolution: "720p",
        durationSec: actualDuration,
        costUsd: cost,
        wallClockMs,
        queueTimeMs: dialogueOutput.queueTimeMs ?? 0,
        generationTimeMs: dialogueOutput.generationTimeMs ?? wallClockMs,
        outputUrl: dialogueOutput.url,
        status: "success",
        error: null,
        retryCount: 0,
        timestamp: new Date().toISOString(),
        metadata: {
          pipelineVariant: "P12",
          component: "dialogue_video",
          router: usedModel.includes("veo3.1") ? "veo31_lite" : "wan27_audio",
          character,
          sliceType: slice.type,
          llmEnhanced: true,
          voiceEmotion: voiceDirections.get(slice.sliceId)?.primaryEmotion ?? "neutral",
        },
      };
      clips.push(clip);
      appendClipResult(clip);
    } else {
      console.log(`  [P12] Dialogue ${di + 1}/${dialogueSlices.length} ✗ FAILED`);
      clips.push(makeFailedPipelineClip("P12", slice, "fal_ai", "veo31_lite+wan27", wallClockMs, new Error("Both Veo 3.1 Lite and Wan 2.7+audio_url failed")));
    }
  }

  // ─── Step 4: Optional Kling Lip Sync for Wan 2.7 fallback clips ───────────
  const klingLsPricing = pricingData.video.kling_lipsync_fal;
  let lipsyncCost = 0;
  let klingLsSuccessCount = 0;
  let klingLsFailCount = 0;

  const wan27DialogueClips = clips.filter(
    (c) => c.metadata?.router === "wan27_audio" && c.status === "success"
  );

  if (wan27DialogueClips.length > 0) {
    console.log(`  [P12] Kling Lip Sync: processing ${wan27DialogueClips.length} Wan 2.7 dialogue clips...`);

    for (const clip of wan27DialogueClips) {
      const sliceId = parseInt(clip.shotId.replace("slice_", ""));
      const ttsOutput = ttsOutputs.get(sliceId);
      if (!clip.outputUrl || !ttsOutput) continue;

      try {
        console.log(`  [P12] LipSync slice ${sliceId}: starting Kling Lip Sync...`);
        const { result: klingOutput } = await withRetry(async () => {
          return await applyKlingLipSync(clip.outputUrl!, ttsOutput.url);
        });
        const cost = klingLsPricing.per10sClip ?? 1.68;
        klingLsSuccessCount++;
        lipsyncCost += cost;
        console.log(`  [P12] LipSync slice ${sliceId} ✓ — $${cost.toFixed(2)}`);

        const lsClip: ClipResult = {
          ticketId: "P12",
          shotId: `slice_${sliceId}_lipsync`,
          provider: "fal_ai",
          model: klingLsPricing.model,
          mode: "lipsync",
          resolution: "720p",
          durationSec: clip.durationSec,
          costUsd: cost,
          wallClockMs: 0,
          queueTimeMs: 0,
          generationTimeMs: 0,
          outputUrl: klingOutput.url,
          status: "success",
          error: null,
          retryCount: 0,
          timestamp: new Date().toISOString(),
          metadata: { pipelineVariant: "P12", component: "lipsync", router: "kling_lipsync", originalSlice: sliceId },
        };
        appendClipResult(lsClip);
        clip.outputUrl = klingOutput.url;
      } catch (err: any) {
        klingLsFailCount++;
        console.warn(`  [P12] LipSync slice ${sliceId}: Kling failed — ${err.message?.slice(0, 100)}`);
      }
    }
  } else {
    console.log(`  [P12] Kling Lip Sync: skipped — all dialogue clips via Veo 3.1 Lite`);
  }

  // ─── LLM Observability Summary ────────────────────────────────────────────
  const llmTotalCost = directorCost + totalPromptEngineerCost + totalCriticCost + totalVoiceDirectorCost;
  console.log(`\n  [P12] ═══ LLM SUMMARY ═══`);
  console.log(`  [P12] D1 Director: $${directorCost.toFixed(4)}`);
  console.log(`  [P12] D2 Prompt Engineer: $${totalPromptEngineerCost.toFixed(4)}`);
  console.log(`  [P12] D3 Critic: $${totalCriticCost.toFixed(4)}`);
  console.log(`  [P12] D4 Voice Director: $${totalVoiceDirectorCost.toFixed(4)}`);
  console.log(`  [P12] LLM Total: $${llmTotalCost.toFixed(4)}`);
  llmObs.printSummary();

  // ─── Pipeline Summary ─────────────────────────────────────────────────────
  const allDialogueText = dialogueSlices.map((s) => s.dialogue?.text ?? "").join(" ");
  const totalCost = silentCost + ttsCost + dialogueCost + lipsyncCost + llmTotalCost;
  const totalWallClockMs = pipelineTimer();

  const silentDurationSec = silentSlices.reduce((sum, s) => sum + s.duration, 0);
  const dialogueDurationSec = dialogueSlices.reduce((sum, s) => sum + s.duration, 0);

  console.log(`\n  [P12] ═══ PIPELINE SUMMARY ═══`);
  console.log(`  [P12] Silent: ${viduSuccessCount} via Vidu Q3, ${wan27SilentFallbackCount} via Wan 2.7 — $${silentCost.toFixed(2)}`);
  console.log(`  [P12] TTS: ${ttsOutputs.size} clips via ElevenLabs — $${ttsCost.toFixed(4)}`);
  console.log(`  [P12] Dialogue: ${veoSuccessCount} via Veo 3.1 Lite, ${wan27FallbackCount} via Wan 2.7+audio — $${dialogueCost.toFixed(2)}`);
  if (wan27DialogueClips.length > 0) {
    console.log(`  [P12] Lip Sync: ${klingLsSuccessCount}/${wan27DialogueClips.length} Wan 2.7 clips refined via Kling — $${lipsyncCost.toFixed(2)}`);
  }
  console.log(`  [P12] LLM orchestration: $${llmTotalCost.toFixed(4)}`);
  console.log(`  [P12] Total: $${totalCost.toFixed(2)} in ${(totalWallClockMs / 1000 / 60).toFixed(1)} min`);

  const components = buildComponentBreakdown([
    { component: "video", provider: "fal_ai", model: `Vidu Q3 (${viduSuccessCount}) + Wan 2.7 fallback (${wan27SilentFallbackCount}) — silent`, units: silentDurationSec, unitType: "seconds", costUsd: silentCost },
    { component: "tts", provider: "elevenlabs", model: `turbo-v2.5 (D4 emotion-directed: Mira=Sarah, Ren=Harry)`, units: allDialogueText.length, unitType: "characters", costUsd: ttsCost },
    { component: "video", provider: "fal_ai", model: `Veo 3.1 Lite (${veoSuccessCount}) + Wan 2.7 audio (${wan27FallbackCount}) — dialogue`, units: dialogueDurationSec, unitType: "seconds", costUsd: dialogueCost },
    ...(wan27DialogueClips.length > 0 ? [{ component: "lipsync" as const, provider: "fal_ai", model: `Kling Lip Sync (${klingLsSuccessCount}/${wan27DialogueClips.length})`, units: klingLsSuccessCount, unitType: "clips" as const, costUsd: lipsyncCost }] : []),
    { component: "llm" as any, provider: "multi", model: `D1 Director + D2 Prompt Engineer + D3 Critic + D4 Voice Director`, units: script._meta.totalSlices, unitType: "slices" as any, costUsd: llmTotalCost },
  ]);

  const result: PipelineResult = {
    pipelineId: `P12_${Date.now()}`,
    variant: "P12_multiLLM_viduQ3_veo31lite_orchestrated",
    totalSlices: script._meta.totalSlices,
    totalDurationSec: script._meta.totalDuration,
    components,
    totalCostUsd: totalCost,
    totalWallClockMs,
    costPerSecond: totalCost / script._meta.totalDuration,
    costPerMinute: (totalCost / script._meta.totalDuration) * 60,
    costPer5Min: extrapolateCost(totalCost, 3, 5),
    status: clips.every((c) => c.status === "success") ? "success" : clips.some((c) => c.status === "success") ? "partial" : "failed",
    failedSlices: clips.filter((c) => c.status === "failed").length,
    timestamp: new Date().toISOString(),
  };

  appendPipelineResult(result);
  writeComponentBreakdownCsv(result.pipelineId, components);
  return result;
}


// ═══════════════════════════════════════════════════════════════════════════
// P13 — Refined Multi-LLM Pipeline
//
// Changes from P12:
//   - C1: Structured JSON character bible replaces prose CHARACTER_LOCK
//   - C2: style_lock propagated to D2 (negative_prompt) + D3 (style_violation)
//   - C3: Mira gender + must_not fields populated
//   - C4: Descriptor substitution in D2 prompts (no character names leak)
//   - P1: Batched D2+D4 (batch size 4) instead of sequential per-slice
//   - P2: Critic retry cap reduced to 2 with fail-soft
//   - L1: v6 fixture with 19 slices (2 stylised_action)
//   - A1: Music bed wired into assembly (separate assembler)
// ═══════════════════════════════════════════════════════════════════════════

import {
  runPromptEngineerBatch,
  runVoiceDirectorBatch,
  criticValidateWithRetry,
  MAX_CRITIC_RETRIES,
  type CriticInput as CriticInputV3,
  type CriticResult as CriticResultV3,
} from "../llm/index.js";

import {
  loadAllCharacterBibles,
  buildCharacterLocks,
  buildCriticChecklists,
  STYLE_LOCK,
  type CharacterBible,
} from "../character-bible/schema.js";

import { runRulesHarness } from "../harness/rules-harness.js";
import { runD5Harness } from "../llm/visual-reviewer.js";
import { routeFeedback, deduplicateActions, SliceRetryTracker } from "../harness/feedback-router.js";
import { addToEscalationQueue } from "../../admin/quality-escalation-queue.js";
import { extractMoodVector } from "../assembly/mood-vector.js";
import { padClipToTarget } from "../assembly/clip-padder.js";

export async function runP13(script: PilotScript): Promise<PipelineResult> {
  const pipelineTimer = startTimer();
  const clips: ClipResult[] = [];
  const falKey = getProviderKey("fal_ai");

  // ─── Init: Feature flags + observability + character bibles ───────────────
  featureFlags.setFlags(PHASE_D_FLAGS); // All 4 LLMs enabled
  llmObs.startEpisode(`P13_${Date.now()}`);
  budgetGuard.reset({ perEpisodeCap: 2.00, circuitBreakerThreshold: 5 });

  const characterBibles = loadAllCharacterBibles();
  const characterLocks = buildCharacterLocks();
  const characterChecklists = buildCriticChecklists();

  const silentSlices = script.slices.filter((s) => !s.audio);
  const dialogueSlices = script.slices.filter((s) => s.audio);

  console.log(`  [P13] Refined Multi-LLM Pipeline (v6 fixture: ${script._meta.totalSlices} slices, ${script._meta.totalDuration}s)`);
  console.log(`  [P13] Architecture: ${silentSlices.length} silent → Vidu Q3 (fallback: Wan 2.7), ${dialogueSlices.length} dialogue → Veo 3.1 Lite (fallback: Wan 2.7+audio_url)`);
  console.log(`  [P13] LLM stack: D1 Director → D2 Batch Prompt Engineer → D3 Critic (retry cap ${MAX_CRITIC_RETRIES}) → D4 Batch Voice Director`);
  console.log(`  [P13] New: Structured character bible, style_lock, descriptor substitution, batched D2+D4`);

  // ─── Step 0: D1 Director — runs ONCE ──────────────────────────────────────
  let projectPlan: ProjectPlan;
  let directorCost = 0;

  const directorResult = await runDirector({
    userPrompt: "Awakli pilot episode: Mira discovers her mechanical arm's true power while exploring Neo-Kyoto's neon-lit streets at sunset with Ren. Tension builds as they encounter a mysterious signal. Climax: crystal shatters, energy clash.",
    characterBible: `${characterLocks.Mira}\n\n${characterLocks.Ren}`,
    targetDurationSec: script._meta.totalDuration,
    sliceCount: script._meta.totalSlices,
    sliceDurationSec: Math.round(script._meta.totalDuration / script._meta.totalSlices),
  });

  if (directorResult.success && directorResult.plan) {
    projectPlan = directorResult.plan;
    directorCost = directorResult.costEstimate;
    console.log(`  [P13] D1 Director: ✓ "${projectPlan.episodeTitle}" — ${projectPlan.slices.length} slices ($${directorCost.toFixed(4)})`);
  } else {
    console.warn(`  [P13] D1 Director: ⚠ Failed, using fallback plan — ${directorResult.error?.slice(0, 80)}`);
    projectPlan = buildFallbackPlan(
      script.slices.map((s) => ({
        sliceId: s.sliceId,
        type: s.type,
        prompt: s.prompt,
        character: s.dialogue?.character,
        dialogueText: s.dialogue?.text,
      }))
    );
    directorCost = directorResult.costEstimate;
  }

  // ─── Helper: get ProjectPlanSlice for a given slice ID ────────────────────
  function getPlanSlice(sliceId: number): ProjectPlanSlice {
    return projectPlan.slices.find((ps) => ps.id === sliceId) ?? {
      id: sliceId,
      type: "silent_establishing",
      location: "Neo-Kyoto",
      timeOfDay: "sunset",
      emotion: "neutral",
      charactersPresent: [],
      previousSliceContinuity: "",
      nextSliceContinuity: "",
    };
  }

  // ─── Helper: determine target model for a slice ───────────────────────────
  function getTargetModel(slice: Slice): TargetModel {
    if (slice.audio) return "veo31lite";
    return "viduq3";
  }

  // ─── Step 1a: Batched D2 Prompt Engineer for ALL slices ───────────────────
  console.log(`\n  [P13] ═══ STEP 1: Batched D2 Prompt Engineering (${script.slices.length} slices) ═══`);

  const d2Inputs: PromptEngineerInput[] = script.slices.map((slice) => ({
    slice: getPlanSlice(slice.sliceId),
    targetModel: getTargetModel(slice),
    characterLocks,
    characterBibles,
    styleLock: STYLE_LOCK,
    existingPrompt: slice.prompt,
  }));

  const d2BatchResult = await runPromptEngineerBatch(d2Inputs, 4);
  let totalPromptEngineerCost = d2BatchResult.totalCost;
  console.log(`  [P13] D2 Batch: ${d2BatchResult.results.length} prompts generated in ${(d2BatchResult.totalLatencyMs / 1000).toFixed(1)}s — $${totalPromptEngineerCost.toFixed(4)}`);

  // Build a map of sliceId → D2 result
  const d2ResultMap = new Map<number, { videoPrompt: string; negativePrompt: string }>();
  for (const r of d2BatchResult.results) {
    d2ResultMap.set(r.sliceId, { videoPrompt: r.videoPrompt, negativePrompt: r.negativePrompt });
  }

  // ─── Step 1b: D3 Critic validation with retry cap 2 ──────────────────────
  console.log(`\n  [P13] ═══ STEP 2: D3 Critic Validation (retry cap ${MAX_CRITIC_RETRIES}) ═══`);
  let totalCriticCost = 0;
  let criticRetryHits = 0;
  let criticFailSoftCount = 0;
  const finalPrompts = new Map<number, string>();

  for (const slice of script.slices) {
    const d2Result = d2ResultMap.get(slice.sliceId);
    const currentPrompt = d2Result?.videoPrompt ?? slice.prompt;

    // Determine which characters are present
    const planSlice = getPlanSlice(slice.sliceId);
    const charactersPresent = planSlice.charactersPresent.length > 0
      ? planSlice.charactersPresent
      : slice.dialogue?.character ? [slice.dialogue.character] : [];

    // Build per-character checklists for only characters in this slice
    const sliceChecklists: Record<string, string> = {};
    for (const char of charactersPresent) {
      if (characterChecklists[char]) {
        sliceChecklists[char] = characterChecklists[char];
      }
    }

    const criticInput: CriticInputV3 = {
      sliceId: slice.sliceId,
      sliceType: slice.type,
      videoPrompt: currentPrompt,
      referenceImageUrl: slice.referenceImage ?? undefined,
      charactersPresent,
      characterChecklists: sliceChecklists,
      styleLock: STYLE_LOCK,
      projectPlan,
      previousSliceContext: planSlice.previousSliceContinuity,
      nextSliceContext: planSlice.nextSliceContinuity,
    };

    const { result: criticResult, attempts, failSoft } = await criticValidateWithRetry(
      criticInput,
      async (issues) => {
        // On retry: re-run D2 for this slice with the critic feedback
        const retryInput: PromptEngineerInput = {
          slice: planSlice,
          targetModel: getTargetModel(slice),
          characterLocks,
          characterBibles,
          styleLock: STYLE_LOCK,
          existingPrompt: currentPrompt + `\n\n[CRITIC FEEDBACK: ${issues.map(i => i.description).join("; ")}]`,
        };
        const retryResult = await runPromptEngineer(retryInput);
        totalPromptEngineerCost += retryResult.costEstimate;
        return retryResult.videoPrompt;
      }
    );

    totalCriticCost += criticResult.costEstimate;
    if (attempts > 1) criticRetryHits++;
    if (failSoft) criticFailSoftCount++;

    const icon = criticResult.ok ? "✓" : failSoft ? "⚡" : "⚠";
    console.log(`  [P13] D3 slice ${slice.sliceId}: ${icon} score=${criticResult.score}/5 attempts=${attempts}${failSoft ? " (fail-soft)" : ""}`);

    finalPrompts.set(slice.sliceId, criticResult.ok ? (d2ResultMap.get(slice.sliceId)?.videoPrompt ?? slice.prompt) : slice.prompt);
  }

  console.log(`  [P13] D3 Summary: ${criticRetryHits} retries hit, ${criticFailSoftCount} fail-softs, $${totalCriticCost.toFixed(4)}`);

  // ─── Step 2: Silent slices — Vidu Q3 / Wan 2.7 ───────────────────────────
  console.log(`\n  [P13] ═══ STEP 3: Silent Video Generation (${silentSlices.length} slices) ═══`);
  const viduPricing = pricingData.video.vidu_q3_fal;
  const wan27Pricing = pricingData.video.wan27_fal;
  let silentCost = 0;
  let viduSuccessCount = 0;
  let wan27SilentFallbackCount = 0;
  let consecutiveViduFailures = 0;
  let viduDisabled = false;

  for (let si = 0; si < silentSlices.length; si++) {
    const slice = silentSlices[si];
    const enhancedPrompt = finalPrompts.get(slice.sliceId) ?? slice.prompt;
    const finalSlice = { ...slice, prompt: enhancedPrompt };

    console.log(`  [P13] Silent ${si + 1}/${silentSlices.length} (id=${slice.sliceId}, type=${slice.type}) — ${viduDisabled ? "Vidu DISABLED, using Wan 2.7" : "trying Vidu Q3..."}`);
    const timer = startTimer();

    let silentSuccess = false;
    let silentOutput: GenerationOutput | null = null;
    let usedProvider = "";
    let usedModel = "";
    let usedCostPerSec = 0;

    // Primary: Vidu Q3 (unless circuit breaker tripped)
    if (!viduDisabled) {
      try {
        const { result: output } = await withRetry(async () => {
          return await generateViduQ3(falKey, finalSlice);
        }, { maxRetries: 1 });
        silentOutput = output;
        silentSuccess = true;
        usedProvider = "fal_ai";
        usedModel = viduPricing.model;
        usedCostPerSec = viduPricing.perSecond;
        viduSuccessCount++;
        consecutiveViduFailures = 0;
        console.log(`  [P13] Silent ${si + 1}: Vidu Q3 ✓`);
      } catch (err: any) {
        consecutiveViduFailures++;
        console.warn(`  [P13] Silent ${si + 1}: Vidu Q3 failed (${consecutiveViduFailures} consecutive) — ${err.message?.slice(0, 80)}`);
        if (consecutiveViduFailures >= 2) {
          viduDisabled = true;
          console.warn(`  [P13] ⚠ Circuit breaker: Vidu Q3 disabled after ${consecutiveViduFailures} consecutive failures.`);
        }
      }
    }

    // Fallback: Wan 2.7
    if (!silentSuccess) {
      try {
        console.log(`  [P13] Silent ${si + 1}: falling back to Wan 2.7...`);
        const { result: output } = await withRetry(async () => {
          return await generateWan27(falKey, finalSlice);
        });
        silentOutput = output;
        silentSuccess = true;
        usedProvider = "fal_ai";
        usedModel = wan27Pricing.model;
        usedCostPerSec = wan27Pricing.perSecond;
        wan27SilentFallbackCount++;
        console.log(`  [P13] Silent ${si + 1}: Wan 2.7 ✓`);
      } catch (err: any) {
        console.warn(`  [P13] Silent ${si + 1}: Wan 2.7 also failed — ${err.message?.slice(0, 80)}`);
      }
    }

    const wallClockMs = timer();
    if (silentSuccess && silentOutput) {
      const actualDuration = usedModel.includes("vidu") ? (slice.duration <= 5 ? 4 : 8) : slice.duration;
      const cost = calculateClipCost(actualDuration, usedCostPerSec, null, null);
      silentCost += cost;
      console.log(`  [P13] Silent ${si + 1}/${silentSlices.length} ✓ done in ${(wallClockMs / 1000).toFixed(1)}s — $${cost.toFixed(4)} via ${usedModel.includes("vidu") ? "Vidu Q3" : "Wan 2.7"}`);

      const clip: ClipResult = {
        ticketId: "P13",
        shotId: `slice_${slice.sliceId}`,
        provider: usedProvider,
        model: usedModel,
        mode: "standard",
        resolution: "720p",
        durationSec: actualDuration,
        costUsd: cost,
        wallClockMs,
        queueTimeMs: silentOutput.queueTimeMs ?? 0,
        generationTimeMs: silentOutput.generationTimeMs ?? wallClockMs,
        outputUrl: silentOutput.url,
        status: "success",
        error: null,
        retryCount: 0,
        timestamp: new Date().toISOString(),
        metadata: {
          pipelineVariant: "P13",
          component: "silent_video",
          router: usedModel.includes("vidu") ? "vidu_q3" : "wan27",
          sliceType: slice.type,
          llmEnhanced: true,
        },
      };
      clips.push(clip);
      appendClipResult(clip);
    } else {
      console.log(`  [P13] Silent ${si + 1}/${silentSlices.length} ✗ FAILED`);
      clips.push(makeFailedPipelineClip("P13", slice, "fal_ai", "vidu_q3+wan27", wallClockMs, new Error("Both Vidu Q3 and Wan 2.7 failed")));
    }
  }

  // ─── Step 3: Batched D4 Voice Director for dialogue slices ────────────────
  console.log(`\n  [P13] ═══ STEP 4: Batched D4 Voice Director (${dialogueSlices.length} lines) ═══`);
  let totalVoiceDirectorCost = 0;
  const voiceDirections: Map<number, VoiceDirectorResult> = new Map();

  const d4Inputs: VoiceDirectorInput[] = dialogueSlices
    .filter((s) => s.dialogue?.text)
    .map((slice) => ({
      slice: getPlanSlice(slice.sliceId),
      character: slice.dialogue?.character ?? "",
      dialogueLine: slice.dialogue?.text ?? "",
    }));

  const d4BatchResult = await runVoiceDirectorBatch(d4Inputs, 4);
  totalVoiceDirectorCost = d4BatchResult.totalCost;

  // Map results back to slice IDs
  for (let i = 0; i < d4Inputs.length; i++) {
    const sliceId = dialogueSlices[i].sliceId;
    if (d4BatchResult.results[i]) {
      voiceDirections.set(sliceId, d4BatchResult.results[i]);
      const r = d4BatchResult.results[i];
      console.log(`  [P13] D4 slice ${sliceId} (${d4Inputs[i].character}): ${r.primaryEmotion}/${r.secondaryEmotion} @${r.emotionIntensity.toFixed(1)} — "${r.directionNote.slice(0, 50)}"`);
    }
  }

  // ─── Step 4: TTS with Voice Director overrides ────────────────────────────
  console.log(`\n  [P13] ═══ STEP 5: TTS Generation (${dialogueSlices.length} clips) ═══`);
  const ttsPricing = pricingData.tts.elevenlabs;
  let ttsCost = 0;
  const ttsOutputs: Map<number, GenerationOutput> = new Map();

  for (const slice of dialogueSlices) {
    const dialogueText = slice.dialogue?.text ?? "";
    if (!dialogueText) continue;
    const character = slice.dialogue?.character ?? "";
    const voiceId = VOICE_MAP[character] ?? DEFAULT_VOICE;
    const voiceName = character === "Mira" ? "Sarah" : character === "Ren" ? "Harry" : "Rachel";
    const vd = voiceDirections.get(slice.sliceId);

    console.log(`  [P13] TTS slice ${slice.sliceId} (${character}) — voice: ${voiceName}, emotion: ${vd?.primaryEmotion ?? "neutral"}`);
    try {
      const { result: ttsOutput } = await withRetry(async () => {
        return await elevenLabsTTS({
          text: dialogueText,
          voiceId,
          ...(vd?.success ? {
            stability: vd.ttsOverrides.stability,
            similarityBoost: vd.ttsOverrides.similarityBoost,
            style: vd.ttsOverrides.style,
          } : {}),
        });
      });
      const cost = calculateTTSCost(dialogueText.length, ttsPricing.perKChars);
      ttsCost += cost;
      ttsOutputs.set(slice.sliceId, ttsOutput);
      console.log(`  [P13] TTS slice ${slice.sliceId}: $${cost.toFixed(4)}`);
    } catch (err) {
      console.error(`  [P13] TTS failed for slice ${slice.sliceId}:`, err);
    }
  }

  // ─── Step 5: Dialogue clips — Veo 3.1 Lite / Wan 2.7 ─────────────────────
  console.log(`\n  [P13] ═══ STEP 6: Dialogue Video Generation (${dialogueSlices.length} slices) ═══`);
  const veo31Pricing = pricingData.video.veo31_lite_fal;
  const wan27AudioPricing = pricingData.video.wan27_audio_fal;
  let dialogueCost = 0;
  let veoSuccessCount = 0;
  let wan27FallbackCount = 0;
  let consecutiveVeoFailures = 0;
  let veoDisabled = false;

  for (let di = 0; di < dialogueSlices.length; di++) {
    const slice = dialogueSlices[di];
    const character = slice.dialogue?.character ?? "";
    const enhancedPrompt = finalPrompts.get(slice.sliceId) ?? slice.prompt;
    const enhancedSlice = { ...slice, prompt: enhancedPrompt };
    const ttsOutput = ttsOutputs.get(slice.sliceId);

    console.log(`  [P13] Dialogue ${di + 1}/${dialogueSlices.length} (id=${slice.sliceId}, char=${character}) — ${veoDisabled ? "Veo DISABLED, using Wan 2.7+audio_url" : "trying Veo 3.1 Lite..."}`);
    const timer = startTimer();

    let dialogueSuccess = false;
    let dialogueOutput: GenerationOutput | null = null;
    let usedProvider = "";
    let usedModel = "";
    let usedCostPerSec = 0;

    // Primary: Veo 3.1 Lite (unless circuit breaker tripped)
    if (!veoDisabled) {
      try {
        const { result: output } = await withRetry(async () => {
          return await generateVeo31Lite(falKey, enhancedSlice);
        }, { maxRetries: 1 });
        dialogueOutput = output;
        dialogueSuccess = true;
        usedProvider = "fal_ai";
        usedModel = veo31Pricing.model;
        usedCostPerSec = veo31Pricing.perSecond;
        veoSuccessCount++;
        consecutiveVeoFailures = 0;
        console.log(`  [P13] Dialogue ${di + 1}: Veo 3.1 Lite ✓`);
      } catch (err: any) {
        consecutiveVeoFailures++;
        console.warn(`  [P13] Dialogue ${di + 1}: Veo 3.1 Lite failed (${consecutiveVeoFailures} consecutive) — ${err.message?.slice(0, 80)}`);
        if (consecutiveVeoFailures >= 2) {
          veoDisabled = true;
          console.warn(`  [P13] ⚠ Circuit breaker: Veo 3.1 Lite disabled after ${consecutiveVeoFailures} consecutive failures.`);
        }
      }
    }

    // Fallback: Wan 2.7 with audio_url
    if (!dialogueSuccess && ttsOutput) {
      try {
        console.log(`  [P13] Dialogue ${di + 1}: falling back to Wan 2.7 + audio_url...`);
        const { result: output } = await withRetry(async () => {
          return await generateWan27(falKey, enhancedSlice, ttsOutput.url);
        });
        dialogueOutput = output;
        dialogueSuccess = true;
        usedProvider = "fal_ai";
        usedModel = wan27AudioPricing.model;
        usedCostPerSec = wan27AudioPricing.perSecond;
        wan27FallbackCount++;
        console.log(`  [P13] Dialogue ${di + 1}: Wan 2.7+audio_url ✓`);
      } catch (err: any) {
        console.warn(`  [P13] Dialogue ${di + 1}: Wan 2.7+audio_url also failed — ${err.message?.slice(0, 80)}`);
      }
    }

    // Record result
    const wallClockMs = timer();
    if (dialogueSuccess && dialogueOutput) {
      const actualDuration = usedModel.includes("veo3.1") ? 8 : slice.duration;
      const cost = calculateClipCost(actualDuration, usedCostPerSec, null, null);
      dialogueCost += cost;
      console.log(`  [P13] Dialogue ${di + 1}/${dialogueSlices.length} ✓ done in ${(wallClockMs / 1000).toFixed(1)}s — $${cost.toFixed(4)} via ${usedModel.includes("veo3.1") ? "Veo 3.1 Lite" : "Wan 2.7+audio"}`);

      const clip: ClipResult = {
        ticketId: "P13",
        shotId: `slice_${slice.sliceId}`,
        provider: usedProvider,
        model: usedModel,
        mode: "dialogue",
        resolution: "720p",
        durationSec: actualDuration,
        costUsd: cost,
        wallClockMs,
        queueTimeMs: dialogueOutput.queueTimeMs ?? 0,
        generationTimeMs: dialogueOutput.generationTimeMs ?? wallClockMs,
        outputUrl: dialogueOutput.url,
        status: "success",
        error: null,
        retryCount: 0,
        timestamp: new Date().toISOString(),
        metadata: {
          pipelineVariant: "P13",
          component: "dialogue_video",
          router: usedModel.includes("veo3.1") ? "veo31_lite" : "wan27_audio",
          character,
          sliceType: slice.type,
          llmEnhanced: true,
          voiceEmotion: voiceDirections.get(slice.sliceId)?.primaryEmotion ?? "neutral",
        },
      };
      clips.push(clip);
      appendClipResult(clip);
    } else {
      console.log(`  [P13] Dialogue ${di + 1}/${dialogueSlices.length} ✗ FAILED`);
      clips.push(makeFailedPipelineClip("P13", slice, "fal_ai", "veo31_lite+wan27", wallClockMs, new Error("Both Veo 3.1 Lite and Wan 2.7+audio_url failed")));
    }
  }

  // ─── Step 6: Optional Kling Lip Sync for Wan 2.7 fallback clips ───────────
  const klingLsPricing = pricingData.video.kling_lipsync_fal;
  let lipsyncCost = 0;
  let klingLsSuccessCount = 0;
  let klingLsFailCount = 0;

  const wan27DialogueClips = clips.filter(
    (c) => c.metadata?.router === "wan27_audio" && c.status === "success"
  );

  if (wan27DialogueClips.length > 0) {
    console.log(`\n  [P13] ═══ STEP 7: Kling Lip Sync (${wan27DialogueClips.length} Wan 2.7 clips) ═══`);

    for (const clip of wan27DialogueClips) {
      const sliceId = parseInt(clip.shotId.replace("slice_", ""));
      const ttsOutput = ttsOutputs.get(sliceId);
      if (!clip.outputUrl || !ttsOutput) continue;

      try {
        console.log(`  [P13] LipSync slice ${sliceId}: starting Kling Lip Sync...`);
        const { result: klingOutput } = await withRetry(async () => {
          return await applyKlingLipSync(clip.outputUrl!, ttsOutput.url);
        });
        const cost = klingLsPricing.per10sClip ?? 1.68;
        klingLsSuccessCount++;
        lipsyncCost += cost;
        console.log(`  [P13] LipSync slice ${sliceId} ✓ — $${cost.toFixed(2)}`);

        const lsClip: ClipResult = {
          ticketId: "P13",
          shotId: `slice_${sliceId}_lipsync`,
          provider: "fal_ai",
          model: klingLsPricing.model,
          mode: "lipsync",
          resolution: "720p",
          durationSec: clip.durationSec,
          costUsd: cost,
          wallClockMs: 0,
          queueTimeMs: 0,
          generationTimeMs: 0,
          outputUrl: klingOutput.url,
          status: "success",
          error: null,
          retryCount: 0,
          timestamp: new Date().toISOString(),
          metadata: { pipelineVariant: "P13", component: "lipsync", router: "kling_lipsync", originalSlice: sliceId },
        };
        appendClipResult(lsClip);
        clip.outputUrl = klingOutput.url;
      } catch (err: any) {
        klingLsFailCount++;
        console.warn(`  [P13] LipSync slice ${sliceId}: Kling failed — ${err.message?.slice(0, 100)}`);
      }
    }
  } else {
    console.log(`\n  [P13] Kling Lip Sync: skipped — all dialogue clips via Veo 3.1 Lite`);
  }

  // ─── Mood Vector (for A1 music bed) ────────────────────────────────────────
  const moodVector = extractMoodVector({
    emotionArc: projectPlan.slices.map((s) => s.emotion || "calm"),
    hasActionSetpiece: script.slices.some((s) => s.type === "stylised_action"),
  });
  console.log(`\n  [P13] Mood Vector: ${moodVector.primaryMood}/${moodVector.secondaryMood}, energy ${moodVector.energyLevel}/10, tempo ${moodVector.tempo}`);
  console.log(`  [P13] Music prompt: ${moodVector.musicPrompt.slice(0, 100)}...`);

  // ─── Stage 6 Config: H1+D5+H2 Harness (runs post-assembly) ────────────────
  const harnessConfig = {
    sliceCount: script._meta.totalSlices,
    sliceDurationSec: Math.round(script._meta.totalDuration / script._meta.totalSlices),
    titleCardDurationSec: 5,
    endCardDurationSec: 4,
    dialogueSlices: dialogueSlices.map((s) => ({
      sliceId: s.sliceId,
      startSec: (s.sliceId - 1) * 10,
      durationSec: s.duration,
      isDialogue: true as const,
    })),
    requireWatermark: false,
  };

  const d5Config = {
    slices: script.slices.map((s) => ({
      sliceId: s.sliceId,
      startSec: (s.sliceId - 1) * 10,
      durationSec: s.duration,
      intent: s.prompt,
      emotion: getPlanSlice(s.sliceId).emotion || "calm",
      isDialogue: !!s.audio,
    })),
    titleCardDurationSec: 5,
    characterBibles: Object.fromEntries(
      Object.entries(characterBibles).map(([name, bible]) => [name, bible])
    ),
    styleLock: {
      primary: STYLE_LOCK.primary,
      forbidden: STYLE_LOCK.forbidden,
      toleranceBand: "semi-realistic anime (3D-rendered anime character design with soft shading)",
    },
    projectPlan: {
      emotionArc: projectPlan.slices.map((s) => s.emotion),
      episodeTitle: projectPlan.episodeTitle,
    },
  };

  console.log(`\n  [P13] ═══ HARNESS CONFIG PREPARED ═══`);
  console.log(`  [P13] H1: ${harnessConfig.dialogueSlices.length} dialogue slices for face-count check`);
  console.log(`  [P13] D5: ${d5Config.slices.length} slices for visual review`);
  console.log(`  [P13] Mood vector: ${moodVector.primaryMood} (energy ${moodVector.energyLevel}/10)`);
  console.log(`  [P13] NOTE: H1+D5+H2 execute post-assembly via assemble-p13.ts`);

  // ─── LLM Observability Summary ────────────────────────────────────────────
  const llmTotalCost = directorCost + totalPromptEngineerCost + totalCriticCost + totalVoiceDirectorCost;
  console.log(`\n  [P13] ═══ LLM SUMMARY ═══`);
  console.log(`  [P13] D1 Director: $${directorCost.toFixed(4)}`);
  console.log(`  [P13] D2 Prompt Engineer: $${totalPromptEngineerCost.toFixed(4)} (batch mode)`);
  console.log(`  [P13] D3 Critic: $${totalCriticCost.toFixed(4)} (${criticRetryHits} retries, ${criticFailSoftCount} fail-softs)`);
  console.log(`  [P13] D4 Voice Director: $${totalVoiceDirectorCost.toFixed(4)} (batch mode)`);
  console.log(`  [P13] LLM Total: $${llmTotalCost.toFixed(4)}`);
  llmObs.printSummary();

  // ─── Pipeline Summary ─────────────────────────────────────────────────────
  const allDialogueText = dialogueSlices.map((s) => s.dialogue?.text ?? "").join(" ");
  const totalCost = silentCost + ttsCost + dialogueCost + lipsyncCost + llmTotalCost;
  const totalWallClockMs = pipelineTimer();

  const silentDurationSec = silentSlices.reduce((sum, s) => sum + s.duration, 0);
  const dialogueDurationSec = dialogueSlices.reduce((sum, s) => sum + s.duration, 0);

  console.log(`\n  [P13] ═══ PIPELINE SUMMARY ═══`);
  console.log(`  [P13] Silent: ${viduSuccessCount} via Vidu Q3, ${wan27SilentFallbackCount} via Wan 2.7 — $${silentCost.toFixed(2)}`);
  console.log(`  [P13] TTS: ${ttsOutputs.size} clips via ElevenLabs — $${ttsCost.toFixed(4)}`);
  console.log(`  [P13] Dialogue: ${veoSuccessCount} via Veo 3.1 Lite, ${wan27FallbackCount} via Wan 2.7+audio — $${dialogueCost.toFixed(2)}`);
  if (wan27DialogueClips.length > 0) {
    console.log(`  [P13] Lip Sync: ${klingLsSuccessCount}/${wan27DialogueClips.length} Wan 2.7 clips refined via Kling — $${lipsyncCost.toFixed(2)}`);
  }
  console.log(`  [P13] LLM orchestration: $${llmTotalCost.toFixed(4)}`);
  console.log(`  [P13] Total: $${totalCost.toFixed(2)} in ${(totalWallClockMs / 1000 / 60).toFixed(1)} min`);

  const components = buildComponentBreakdown([
    { component: "video", provider: "fal_ai", model: `Vidu Q3 (${viduSuccessCount}) + Wan 2.7 fallback (${wan27SilentFallbackCount}) — silent`, units: silentDurationSec, unitType: "seconds", costUsd: silentCost },
    { component: "tts", provider: "elevenlabs", model: `turbo-v2.5 (D4 batch emotion-directed: Mira=Sarah, Ren=Harry)`, units: allDialogueText.length, unitType: "characters", costUsd: ttsCost },
    { component: "video", provider: "fal_ai", model: `Veo 3.1 Lite (${veoSuccessCount}) + Wan 2.7 audio (${wan27FallbackCount}) — dialogue`, units: dialogueDurationSec, unitType: "seconds", costUsd: dialogueCost },
    ...(wan27DialogueClips.length > 0 ? [{ component: "lipsync" as const, provider: "fal_ai", model: `Kling Lip Sync (${klingLsSuccessCount}/${wan27DialogueClips.length})`, units: klingLsSuccessCount, unitType: "clips" as const, costUsd: lipsyncCost }] : []),
    { component: "llm" as any, provider: "multi", model: `D1+D2(batch)+D3(cap${MAX_CRITIC_RETRIES})+D4(batch) — structured bible + style_lock`, units: script._meta.totalSlices, unitType: "slices" as any, costUsd: llmTotalCost },
  ]);

  const result: PipelineResult = {
    pipelineId: `P13_${Date.now()}`,
    variant: "P13v1.1_hybridHarness_structuredBible_batchedD2D4",
    totalSlices: script._meta.totalSlices,
    totalDurationSec: script._meta.totalDuration,
    components,
    totalCostUsd: totalCost,
    totalWallClockMs,
    costPerSecond: totalCost / script._meta.totalDuration,
    costPerMinute: (totalCost / script._meta.totalDuration) * 60,
    costPer5Min: extrapolateCost(totalCost, script._meta.totalDuration / 60, 5),
    status: clips.every((c) => c.status === "success") ? "success" : clips.some((c) => c.status === "success") ? "partial" : "failed",
    failedSlices: clips.filter((c) => c.status === "failed").length,
    timestamp: new Date().toISOString(),
  };

  appendPipelineResult(result);
  writeComponentBreakdownCsv(result.pipelineId, components);
  return result;
}
