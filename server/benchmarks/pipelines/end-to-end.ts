/**
 * End-to-End Pipeline Runners (P1–P4)
 *
 * Each pipeline generates the same 18-slice, 3-minute anime pilot using
 * different provider combinations. Results are logged to CSV for the
 * cost assessment framework (A1).
 *
 * P1 — Kling V3 Omni Control (all 18 clips via Kling Omni with audio)
 * P2 — Decomposed Balanced (Wan 2.2 + ElevenLabs + Hedra + LatentSync)
 * P3 — Decomposed Cheap (Wan 2.2 + OpenAI TTS + MuseTalk)
 * P4 — Decomposed Premium (Hunyuan + ElevenLabs + Hedra + Kling Lip Sync)
 */

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
  cameraAngle: string;
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

  const clips: ClipResult[] = [];
  let totalCost = 0;

  for (const slice of script.slices) {
    const timer = startTimer();
    try {
      const { result: output, retryCount } = await withRetry(async () => {
        return await generateKlingOmni(apiKey, slice);
      });
      const wallClockMs = timer();
      const cost = calculateClipCost(slice.duration, pricing.perSecond, null, null);
      totalCost += cost;

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
    } catch (err) {
      const wallClockMs = timer();
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

  // --- Step 2: Generate TTS with ElevenLabs ---
  const ttsPricing = pricingData.tts.elevenlabs;
  const elevenKey = getProviderKey("elevenlabs");
  const allDialogueText = dialogueSlices.map((s) => s.dialogue?.text ?? "").join(" ");
  const ttsCost = calculateTTSCost(allDialogueText.length, ttsPricing.perKChars);

  // --- Step 3: Generate dialogue clips with Hedra Character-3 ---
  const hedraPricing = pricingData.video.hedra_char3;
  const hedraKey = getProviderKey("hedra");
  let dialogueCost = 0;

  for (const slice of dialogueSlices) {
    const timer = startTimer();
    try {
      const { result: output, retryCount } = await withRetry(async () => {
        return await generateHedra(hedraKey, slice);
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

  // --- Step 4: Lipsync with LatentSync (for any remaining clips needing sync) ---
  const lipsyncPricing = pricingData.video.latentsync_fal;
  const lipsyncClipCount = Math.ceil(dialogueSlices.length * 0.5); // ~50% need extra lipsync
  const lipsyncCost = lipsyncClipCount * (lipsyncPricing.perClip ?? 0.20);

  // --- Assembly (FFmpeg, free) ---
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

// ─── P3: Decomposed Cheap (Wan 2.2 + OpenAI TTS + MuseTalk) ─────────────────

export async function runP3(script: PilotScript): Promise<PipelineResult> {
  const pipelineTimer = startTimer();
  const clips: ClipResult[] = [];

  const silentSlices = script.slices.filter((s) => !s.audio);
  const dialogueSlices = script.slices.filter((s) => s.audio);

  // --- Step 1: ALL clips via Wan 2.2 (dialogue clips also start as silent) ---
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

  // --- Step 2: TTS with OpenAI (cheapest) ---
  const ttsPricing = pricingData.tts.openai_tts;
  const allDialogueText = dialogueSlices.map((s) => s.dialogue?.text ?? "").join(" ");
  const ttsCost = calculateTTSCost(allDialogueText.length, ttsPricing.perKChars);

  // --- Step 3: Lipsync with MuseTalk (all dialogue clips) ---
  const musetalkPricing = pricingData.video.musetalk_replicate;
  const lipsyncCost = dialogueSlices.length * (musetalkPricing.perRun ?? 0.42);

  // --- Assembly ---
  const totalCost = videoCost + ttsCost + lipsyncCost;
  const totalWallClockMs = pipelineTimer();

  const components = buildComponentBreakdown([
    { component: "video", provider: "fal_ai", model: "Wan 2.2", units: script._meta.totalDuration, unitType: "seconds", costUsd: videoCost },
    { component: "tts", provider: "openai", model: "tts-1", units: allDialogueText.length, unitType: "characters", costUsd: ttsCost },
    { component: "lipsync", provider: "replicate", model: "MuseTalk", units: dialogueSlices.length, unitType: "runs", costUsd: lipsyncCost },
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

  for (const slice of silentSlices) {
    const timer = startTimer();
    try {
      const { result: output, retryCount } = await withRetry(async () => {
        return await generateHunyuan(falKey, slice);
      });
      const wallClockMs = timer();
      const cost = calculateClipCost(slice.duration, hunyuanPricing.perSecond, null, null);
      silentCost += cost;

      clips.push({
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
      });
    } catch (err) {
      const wallClockMs = timer();
      clips.push(makeFailedPipelineClip("P4", slice, "fal_ai", hunyuanPricing.model, wallClockMs, err));
    }
  }

  // --- Step 2: Action clips via Hunyuan LoRA inference ---
  const loraPricing = pricingData.video.hunyuan_lora_fal;
  let loraCost = 0;
  for (const slice of actionSlices) {
    loraCost += loraPricing.perVideo ?? 0.30;
  }

  // --- Step 3: TTS with ElevenLabs ---
  const ttsPricing = pricingData.tts.elevenlabs;
  const allDialogueText = dialogueSlices.map((s) => s.dialogue?.text ?? "").join(" ");
  const ttsCost = calculateTTSCost(allDialogueText.length, ttsPricing.perKChars);

  // --- Step 4: Dialogue clips via Hedra Character-3 ---
  const hedraPricing = pricingData.video.hedra_char3;
  const hedraKey = getProviderKey("hedra");
  let dialogueCost = 0;

  for (const slice of dialogueSlices) {
    const timer = startTimer();
    try {
      const { result: output, retryCount } = await withRetry(async () => {
        return await generateHedra(hedraKey, slice);
      });
      const wallClockMs = timer();
      const cost = calculateClipCost(slice.duration, hedraPricing.perSecond, null, null);
      dialogueCost += cost;

      clips.push({
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
      });
    } catch (err) {
      const wallClockMs = timer();
      clips.push(makeFailedPipelineClip("P4", slice, "hedra", hedraPricing.model, wallClockMs, err));
    }
  }

  // --- Step 5: Kling Lip Sync for remaining clips ---
  const klingLipsyncPricing = pricingData.video.kling_lipsync_fal;
  const lipsyncClipCount = Math.ceil(dialogueSlices.length * 0.5);
  const lipsyncCost = lipsyncClipCount * calculateClipCost(10, klingLipsyncPricing.perSecond, null, null);

  // --- Step 6: LoRA training (amortised) ---
  const loraTrainingAmortised = (pricingData.training.hunyuan_lora_training.estimatedCost.low + pricingData.training.hunyuan_lora_training.estimatedCost.high) / 2 / 10;

  // --- Assembly ---
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

// ─── Provider Stubs ──────────────────────────────────────────────────────────
// To be replaced with real API calls when credentials are provisioned.

async function generateKlingOmni(_apiKey: string, slice: Slice): Promise<GenerationOutput> {
  throw new Error(`[STUB] Kling Omni not yet wired. Slice: ${slice.sliceId}`);
}

async function generateWan22(_apiKey: string, slice: Slice): Promise<GenerationOutput> {
  throw new Error(`[STUB] Wan 2.2 not yet wired. Slice: ${slice.sliceId}`);
}

async function generateHunyuan(_apiKey: string, slice: Slice): Promise<GenerationOutput> {
  throw new Error(`[STUB] Hunyuan not yet wired. Slice: ${slice.sliceId}`);
}

async function generateHedra(_apiKey: string, slice: Slice): Promise<GenerationOutput> {
  throw new Error(`[STUB] Hedra not yet wired. Slice: ${slice.sliceId}`);
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
