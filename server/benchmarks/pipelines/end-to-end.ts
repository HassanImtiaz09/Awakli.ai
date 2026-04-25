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
  Mira: "Young woman, silver-white hair with cerulean blue tips, glowing blue eyes, mechanical left arm with amber energy lines, navy sailor uniform. Determined expression.",
  Ren: "Young man, spiky dark hair with cyan streaks, sharp amber eyes, black tactical jacket with glowing cyan circuit patterns. Confident stance.",
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
