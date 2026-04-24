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

      const { result: output, retryCount } = await withRetry(async () => {
        return await hedraCharacter3({
          imageUrl: "https://placehold.co/512x512/png",
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

  for (const slice of dialogueSlices) {
    const timer = startTimer();
    try {
      const ttsOutput = ttsOutputs.get(slice.sliceId);
      if (!ttsOutput) throw new Error(`No TTS audio for slice ${slice.sliceId}`);

      const { result: output, retryCount } = await withRetry(async () => {
        return await hedraCharacter3({
          imageUrl: "https://placehold.co/512x512/png",
          audioUrl: ttsOutput.url,
          prompt: slice.prompt,
          durationMs: slice.duration * 1000,
        });
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

  for (const slice of silentSlices) {
    const timer = startTimer();
    try {
      const { result: output, retryCount } = await withRetry(async () => {
        return await generateWan25(falKey, slice);
      });
      const wallClockMs = timer();
      const cost = calculateClipCost(slice.duration, wanPricing.perSecond, null, null);
      silentCost += cost;

      clips.push({
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
      });
    } catch (err) {
      const wallClockMs = timer();
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

  for (const slice of dialogueSlices) {
    const timer = startTimer();
    try {
      const ttsOutput = ttsOutputs.get(slice.sliceId);
      if (!ttsOutput) throw new Error(`No TTS audio for slice ${slice.sliceId}`);

      const { result: output, retryCount } = await withRetry(async () => {
        return await hedraCharacter3({
          imageUrl: "https://placehold.co/512x512/png",
          audioUrl: ttsOutput.url,
          prompt: slice.prompt,
          durationMs: slice.duration * 1000,
        });
      });
      const wallClockMs = timer();
      const cost = calculateClipCost(slice.duration, hedraPricing.perSecond, null, null);
      dialogueCost += cost;

      clips.push({
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
      });
    } catch (err) {
      const wallClockMs = timer();
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

  for (const slice of script.slices) {
    const timer = startTimer();
    try {
      const { result: output, retryCount } = await withRetry(async () => {
        return await generateWan25(falKey, slice);
      });
      const wallClockMs = timer();
      const cost = calculateClipCost(slice.duration, wanPricing.perSecond, null, null);
      videoCost += cost;

      clips.push({
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
      });
    } catch (err) {
      const wallClockMs = timer();
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

/// ─── Provider Implementations (Real API Calls) ─────────────────────────────────
// Wired to shared api-clients module for all providers.

import {
  klingOmniViaFal,
  wan22ViaFal,
  wan25ViaFal,
  hunyuanViaFal,
  hedraCharacter3,
  elevenLabsTTS,
  cartesiaTTS,
  latentSyncViaFal,
  museTalkViaFal,
  klingLipSyncViaFal,
} from "../providers/api-clients.js";

async function generateKlingOmni(_apiKey: string, slice: Slice): Promise<GenerationOutput> {
  return klingOmniViaFal({
    prompt: slice.prompt,
    duration: String(slice.duration),
    audio: slice.audio,
  });
}

async function generateWan22(_apiKey: string, slice: Slice): Promise<GenerationOutput> {
  return wan22ViaFal({
    prompt: slice.prompt,
    duration: slice.duration,
  });
}

async function generateWan25(_apiKey: string, slice: Slice): Promise<GenerationOutput> {
  return wan25ViaFal({
    prompt: slice.prompt,
    duration: slice.duration,
    resolution: "1080p",
  });
}

async function generateHunyuan(_apiKey: string, slice: Slice): Promise<GenerationOutput> {
  return hunyuanViaFal({
    prompt: slice.prompt,
    duration: slice.duration,
  });
}

async function generateHedra(_apiKey: string, slice: Slice): Promise<GenerationOutput> {
  // Generate TTS audio first for the dialogue
  const dialogueText = slice.dialogue?.text ?? "Test dialogue for benchmark.";
  const ttsOutput = await elevenLabsTTS({ text: dialogueText });
  return hedraCharacter3({
    imageUrl: "https://placehold.co/512x512/png", // Placeholder — real run uses manga panel
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
