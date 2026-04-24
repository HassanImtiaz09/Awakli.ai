/**
 * Single-Layer Benchmark Runners (B1–B7)
 *
 * Each runner generates clips for one provider/model combination,
 * measures cost and timing, and logs results to CSV.
 *
 * These are NOT called at server startup — they are invoked via the
 * CLI entry point (run_all.ts) or programmatically during the benchmark.
 */

import {
  type ClipResult,
  type TTSResult,
  appendClipResult,
  appendTTSResult,
  startTimer,
  withRetry,
  calculateClipCost,
  calculateTTSCost,
} from "../runner-base.js";
import { getProviderKey } from "../providers/registry.js";
import pricingData from "../providers/pricing.json" with { type: "json" };

// ─── Shared Types ────────────────────────────────────────────────────────────

interface Shot {
  id: string;
  name: string;
  type: string;
  prompt: string;
  duration: number;
  resolution: string;
  audio: boolean;
  referenceImage: string | null;
}

interface RunnerResult {
  ticketId: string;
  clips: ClipResult[];
  totalCost: number;
  summary: string;
}

// ─── B1: Kling V3 Omni — 3 shots × 3 providers ─────────────────────────────

export async function runB1(shots: Shot[]): Promise<RunnerResult> {
  const providers = [
    { id: "fal_ai", pricing: pricingData.video.kling_v3_omni_fal },
    { id: "atlas_cloud", pricing: pricingData.video.kling_v3_omni_atlas },
    { id: "kling_direct", pricing: pricingData.video.kling_v3_omni_direct },
  ];

  const clips: ClipResult[] = [];

  for (const provider of providers) {
    const apiKey = getProviderKey(provider.id);

    for (const shot of shots) {
      const timer = startTimer();

      try {
        const { result: output, retryCount } = await withRetry(async () => {
          return await generateKlingOmniClip(provider.id, apiKey, shot);
        });

        const wallClockMs = timer();
        const cost = calculateClipCost(
          shot.duration,
          provider.pricing.perSecond,
          null,
          null
        );

        const clip: ClipResult = {
          ticketId: "B1",
          shotId: shot.id,
          provider: provider.id,
          model: provider.pricing.model,
          mode: "omni",
          resolution: provider.pricing.resolution,
          durationSec: shot.duration,
          costUsd: cost,
          wallClockMs,
          queueTimeMs: output.queueTimeMs ?? 0,
          generationTimeMs: output.generationTimeMs ?? wallClockMs,
          outputUrl: output.url,
          status: "success",
          error: null,
          retryCount,
          timestamp: new Date().toISOString(),
          metadata: { provider: provider.id, audio: true, lipsync: true },
        };

        clips.push(clip);
        appendClipResult(clip);
      } catch (err) {
        const wallClockMs = timer();
        const clip: ClipResult = {
          ticketId: "B1",
          shotId: shot.id,
          provider: provider.id,
          model: provider.pricing.model,
          mode: "omni",
          resolution: provider.pricing.resolution,
          durationSec: shot.duration,
          costUsd: 0,
          wallClockMs,
          queueTimeMs: 0,
          generationTimeMs: 0,
          outputUrl: null,
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
          retryCount: 2,
          timestamp: new Date().toISOString(),
          metadata: { provider: provider.id },
        };
        clips.push(clip);
        appendClipResult(clip);
      }
    }
  }

  const totalCost = clips.reduce((sum, c) => sum + c.costUsd, 0);
  return {
    ticketId: "B1",
    clips,
    totalCost,
    summary: `B1 complete: ${clips.filter((c) => c.status === "success").length}/${clips.length} clips, $${totalCost.toFixed(2)} total`,
  };
}

// ─── B2: Kling V3 Standard Silent — 2 shots ─────────────────────────────────

export async function runB2(shots: Shot[]): Promise<RunnerResult> {
  const silentShots = shots.filter((s) => !s.audio); // shots 1 and 3
  const pricing = pricingData.video.kling_v3_std_fal;
  const apiKey = getProviderKey("fal_ai");
  const clips: ClipResult[] = [];

  for (const shot of silentShots) {
    const timer = startTimer();
    try {
      const { result: output, retryCount } = await withRetry(async () => {
        return await generateKlingStandardClip(apiKey, shot);
      });
      const wallClockMs = timer();
      const cost = calculateClipCost(shot.duration, pricing.perSecond, null, null);

      const clip: ClipResult = {
        ticketId: "B2",
        shotId: shot.id,
        provider: "fal_ai",
        model: pricing.model,
        mode: "standard",
        resolution: pricing.resolution,
        durationSec: shot.duration,
        costUsd: cost,
        wallClockMs,
        queueTimeMs: output.queueTimeMs ?? 0,
        generationTimeMs: output.generationTimeMs ?? wallClockMs,
        outputUrl: output.url,
        status: "success",
        error: null,
        retryCount,
        timestamp: new Date().toISOString(),
        metadata: { audio: false },
      };
      clips.push(clip);
      appendClipResult(clip);
    } catch (err) {
      const wallClockMs = timer();
      clips.push(makeFailedClip("B2", shot, "fal_ai", pricing, wallClockMs, err));
    }
  }

  const totalCost = clips.reduce((sum, c) => sum + c.costUsd, 0);
  return { ticketId: "B2", clips, totalCost, summary: `B2 complete: ${clips.filter((c) => c.status === "success").length}/${clips.length} clips, $${totalCost.toFixed(2)}` };
}

// ─── B3: Wan 2.2 Silent — 2 shots × 2 providers ─────────────────────────────

export async function runB3(shots: Shot[]): Promise<RunnerResult> {
  const silentShots = shots.filter((s) => !s.audio);
  const providers = [
    { id: "fal_ai", pricing: pricingData.video.wan22_fal },
    { id: "replicate", pricing: pricingData.video.wan22_replicate },
  ];

  const clips: ClipResult[] = [];

  for (const provider of providers) {
    const apiKey = getProviderKey(provider.id);
    for (const shot of silentShots) {
      const timer = startTimer();
      try {
        const { result: output, retryCount } = await withRetry(async () => {
          return await generateWan22Clip(provider.id, apiKey, shot);
        });
        const wallClockMs = timer();
        const cost = calculateClipCost(
          shot.duration,
          provider.pricing.perSecond,
          provider.pricing.per10sClip ? provider.pricing.per10sClip : null,
          null
        );

        const clip: ClipResult = {
          ticketId: "B3",
          shotId: shot.id,
          provider: provider.id,
          model: provider.pricing.model,
          mode: "standard",
          resolution: provider.pricing.resolution,
          durationSec: shot.duration,
          costUsd: cost,
          wallClockMs,
          queueTimeMs: output.queueTimeMs ?? 0,
          generationTimeMs: output.generationTimeMs ?? wallClockMs,
          outputUrl: output.url,
          status: "success",
          error: null,
          retryCount,
          timestamp: new Date().toISOString(),
          metadata: { provider: provider.id, audio: false },
        };
        clips.push(clip);
        appendClipResult(clip);
      } catch (err) {
        const wallClockMs = timer();
        clips.push(makeFailedClip("B3", shot, provider.id, provider.pricing, wallClockMs, err));
      }
    }
  }

  const totalCost = clips.reduce((sum, c) => sum + c.costUsd, 0);
  return { ticketId: "B3", clips, totalCost, summary: `B3 complete: ${clips.filter((c) => c.status === "success").length}/${clips.length} clips, $${totalCost.toFixed(2)}` };
}

// ─── B3b: Wan 2.5 Silent — 2 shots via fal.ai ────────────────────────────────

export async function runB3b(shots: Shot[]): Promise<RunnerResult> {
  const silentShots = shots.filter((s) => !s.audio);
  const pricing = pricingData.video.wan25_fal;
  const clips: ClipResult[] = [];

  for (const shot of silentShots) {
    const timer = startTimer();
    try {
      const { result: output, retryCount } = await withRetry(async () => {
        return await wan25ViaFal({
          imageUrl: shot.referenceImage ?? undefined,
          prompt: shot.prompt,
          duration: shot.duration,
          resolution: "1080p",
        });
      });
      const wallClockMs = timer();
      const cost = calculateClipCost(shot.duration, pricing.perSecond, null, null);

      const clip: ClipResult = {
        ticketId: "B3b",
        shotId: shot.id,
        provider: "fal_ai",
        model: pricing.model,
        mode: "standard",
        resolution: pricing.resolution,
        durationSec: shot.duration,
        costUsd: cost,
        wallClockMs,
        queueTimeMs: output.queueTimeMs ?? 0,
        generationTimeMs: output.generationTimeMs ?? wallClockMs,
        outputUrl: output.url,
        status: "success",
        error: null,
        retryCount,
        timestamp: new Date().toISOString(),
        metadata: { provider: "fal_ai", audio: false, variant: "wan25" },
      };
      clips.push(clip);
      appendClipResult(clip);
    } catch (err) {
      const wallClockMs = timer();
      clips.push(makeFailedClip("B3b", shot, "fal_ai", pricing, wallClockMs, err));
    }
  }

  const totalCost = clips.reduce((sum, c) => sum + c.costUsd, 0);
  return { ticketId: "B3b", clips, totalCost, summary: `B3b complete: ${clips.filter((c) => c.status === "success").length}/${clips.length} clips (Wan 2.5 @ 1080p), $${totalCost.toFixed(2)}` };
}

// ─── B4: Hunyuan Video Silent + LoRA Training ────────────────────────────────

export async function runB4(shots: Shot[]): Promise<RunnerResult> {
  const silentShots = shots.filter((s) => !s.audio);
  const pricing = pricingData.video.hunyuan_v15_fal;
  const apiKey = getProviderKey("fal_ai");
  const clips: ClipResult[] = [];

  // Generate 2 silent clips
  for (const shot of silentShots) {
    const timer = startTimer();
    try {
      const { result: output, retryCount } = await withRetry(async () => {
        return await generateHunyuanClip(apiKey, shot);
      });
      const wallClockMs = timer();
      const cost = calculateClipCost(shot.duration, pricing.perSecond, null, null);

      const clip: ClipResult = {
        ticketId: "B4",
        shotId: shot.id,
        provider: "fal_ai",
        model: pricing.model,
        mode: "standard",
        resolution: pricing.resolution,
        durationSec: shot.duration,
        costUsd: cost,
        wallClockMs,
        queueTimeMs: output.queueTimeMs ?? 0,
        generationTimeMs: output.generationTimeMs ?? wallClockMs,
        outputUrl: output.url,
        status: "success",
        error: null,
        retryCount,
        timestamp: new Date().toISOString(),
        metadata: { audio: false, loraApplied: false },
      };
      clips.push(clip);
      appendClipResult(clip);
    } catch (err) {
      const wallClockMs = timer();
      clips.push(makeFailedClip("B4", shot, "fal_ai", pricing, wallClockMs, err));
    }
  }

  // LoRA training would be triggered here — logged separately
  // The training cost is recorded in the pipeline result, not per-clip

  const totalCost = clips.reduce((sum, c) => sum + c.costUsd, 0);
  return { ticketId: "B4", clips, totalCost, summary: `B4 complete: ${clips.filter((c) => c.status === "success").length}/${clips.length} clips + LoRA training pending, $${totalCost.toFixed(2)}` };
}

// ─── B5: Hedra Character-3 — 1 dialogue clip ────────────────────────────────

export async function runB5(shots: Shot[]): Promise<RunnerResult> {
  const dialogueShot = shots.find((s) => s.audio);
  if (!dialogueShot) throw new Error("No dialogue shot found for B5");

  const pricing = pricingData.video.hedra_char3;
  const apiKey = getProviderKey("hedra");
  const clips: ClipResult[] = [];

  const timer = startTimer();
  try {
    const { result: output, retryCount } = await withRetry(async () => {
      return await generateHedraClip(apiKey, dialogueShot);
    });
    const wallClockMs = timer();
    const cost = calculateClipCost(dialogueShot.duration, pricing.perSecond, null, null);

    const clip: ClipResult = {
      ticketId: "B5",
      shotId: dialogueShot.id,
      provider: "hedra",
      model: pricing.model,
      mode: "dialogue",
      resolution: pricing.resolution,
      durationSec: dialogueShot.duration,
      costUsd: cost,
      wallClockMs,
      queueTimeMs: output.queueTimeMs ?? 0,
      generationTimeMs: output.generationTimeMs ?? wallClockMs,
      outputUrl: output.url,
      status: "success",
      error: null,
      retryCount,
      timestamp: new Date().toISOString(),
      metadata: { audio: true, lipsync: true, resolution: "720p" },
    };
    clips.push(clip);
    appendClipResult(clip);
  } catch (err) {
    const wallClockMs = timer();
    clips.push(makeFailedClip("B5", dialogueShot, "hedra", pricing, wallClockMs, err));
  }

  const totalCost = clips.reduce((sum, c) => sum + c.costUsd, 0);
  return { ticketId: "B5", clips, totalCost, summary: `B5 complete: ${clips.filter((c) => c.status === "success").length}/1 clip, $${totalCost.toFixed(2)}` };
}

// ─── B6: TTS Benchmark — 3 providers ────────────────────────────────────────

export async function runB6(dialogueText: string): Promise<{ results: TTSResult[]; totalCost: number }> {
  const providers = [
    { id: "elevenlabs", pricing: pricingData.tts.elevenlabs },
    { id: "cartesia", pricing: pricingData.tts.cartesia },
    { id: "openai_tts", pricing: pricingData.tts.openai_tts },
  ];

  const results: TTSResult[] = [];

  for (const provider of providers) {
    const apiKey = getProviderKey(provider.id);
    const timer = startTimer();

    try {
      const { result: output, retryCount } = await withRetry(async () => {
        return await generateTTS(provider.id, apiKey, dialogueText);
      });
      const wallClockMs = timer();
      const cost = calculateTTSCost(dialogueText.length, provider.pricing.perKChars);

      const ttsResult: TTSResult = {
        ticketId: "B6",
        provider: provider.id,
        model: provider.pricing.model,
        inputText: dialogueText,
        inputChars: dialogueText.length,
        costUsd: cost,
        wallClockMs,
        outputUrl: output.url,
        status: "success",
        error: null,
        voiceQuality: null,
        emotionControl: null,
        timestamp: new Date().toISOString(),
      };
      results.push(ttsResult);
      appendTTSResult(ttsResult);
    } catch (err) {
      const wallClockMs = timer();
      const ttsResult: TTSResult = {
        ticketId: "B6",
        provider: provider.id,
        model: provider.pricing.model,
        inputText: dialogueText,
        inputChars: dialogueText.length,
        costUsd: 0,
        wallClockMs,
        outputUrl: null,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
        voiceQuality: null,
        emotionControl: null,
        timestamp: new Date().toISOString(),
      };
      results.push(ttsResult);
      appendTTSResult(ttsResult);
    }
  }

  const totalCost = results.reduce((sum, r) => sum + r.costUsd, 0);
  return { results, totalCost };
}

// ─── B7: Lipsync Comparison — 3 providers ───────────────────────────────────

export async function runB7(
  silentVideoUrl: string,
  dialogueAudioUrl: string,
  shot: Shot
): Promise<RunnerResult> {
  const providers = [
    { id: "fal_ai", model: "latentsync", pricing: pricingData.video.latentsync_fal },
    { id: "replicate", model: "musetalk", pricing: pricingData.video.musetalk_replicate },
    { id: "fal_ai", model: "kling_lipsync", pricing: pricingData.video.kling_lipsync_fal },
  ];

  const clips: ClipResult[] = [];

  for (const provider of providers) {
    const apiKey = getProviderKey(provider.id);
    const timer = startTimer();

    try {
      const { result: output, retryCount } = await withRetry(async () => {
        return await generateLipsync(
          provider.id,
          provider.model,
          apiKey,
          silentVideoUrl,
          dialogueAudioUrl
        );
      });
      const wallClockMs = timer();
      const cost = calculateClipCost(
        shot.duration,
        (provider.pricing as any).perSecond ?? null,
        (provider.pricing as any).perClip ?? null,
        (provider.pricing as any).perRun ?? null
      );

      const clip: ClipResult = {
        ticketId: "B7",
        shotId: shot.id,
        provider: provider.id,
        model: provider.model,
        mode: "lipsync",
        resolution: "input",
        durationSec: shot.duration,
        costUsd: cost,
        wallClockMs,
        queueTimeMs: output.queueTimeMs ?? 0,
        generationTimeMs: output.generationTimeMs ?? wallClockMs,
        outputUrl: output.url,
        status: "success",
        error: null,
        retryCount,
        timestamp: new Date().toISOString(),
        metadata: { lipsyncModel: provider.model },
      };
      clips.push(clip);
      appendClipResult(clip);
    } catch (err) {
      const wallClockMs = timer();
      clips.push({
        ticketId: "B7",
        shotId: shot.id,
        provider: provider.id,
        model: provider.model,
        mode: "lipsync",
        resolution: "input",
        durationSec: shot.duration,
        costUsd: 0,
        wallClockMs,
        queueTimeMs: 0,
        generationTimeMs: 0,
        outputUrl: null,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
        retryCount: 2,
        timestamp: new Date().toISOString(),
        metadata: { lipsyncModel: provider.model },
      });
    }
  }

  const totalCost = clips.reduce((sum, c) => sum + c.costUsd, 0);
  return { ticketId: "B7", clips, totalCost, summary: `B7 complete: ${clips.filter((c) => c.status === "success").length}/${clips.length} clips, $${totalCost.toFixed(2)}` };
}

// ─── Provider-Specific Generation (Real API Calls) ──────────────────────────
// Wired to shared api-clients module for all providers.

import {
  type GenerationOutput,
  klingOmniViaFal,
  klingOmniViaAtlas,
  klingOmniViaDirect,
  klingStandardViaFal,
  wan22ViaFal,
  wan22ViaReplicate,
  wan25ViaFal,
  hunyuanViaFal,
  hedraCharacter3,
  elevenLabsTTS,
  cartesiaTTS,
  openaiTTS,
  latentSyncViaFal,
  museTalkViaFal,
  klingLipSyncViaFal,
} from "../providers/api-clients.js";

async function generateKlingOmniClip(
  providerId: string,
  _apiKey: string,
  shot: Shot
): Promise<GenerationOutput> {
  const params = {
    imageUrl: shot.referenceImage ?? undefined,
    prompt: shot.prompt,
    duration: String(shot.duration),
    audio: shot.audio,
  };

  switch (providerId) {
    case "fal_ai":
      return klingOmniViaFal(params);
    case "atlas_cloud":
      return klingOmniViaAtlas(params);
    case "kling_direct":
      return klingOmniViaDirect(params);
    default:
      throw new Error(`Unknown Kling Omni provider: ${providerId}`);
  }
}

async function generateKlingStandardClip(
  _apiKey: string,
  shot: Shot
): Promise<GenerationOutput> {
  return klingStandardViaFal({
    imageUrl: shot.referenceImage ?? undefined,
    prompt: shot.prompt,
    duration: String(shot.duration),
  });
}

async function generateWan22Clip(
  providerId: string,
  _apiKey: string,
  shot: Shot
): Promise<GenerationOutput> {
  const params = {
    imageUrl: shot.referenceImage ?? undefined,
    prompt: shot.prompt,
    duration: shot.duration,
  };

  switch (providerId) {
    case "fal_ai":
      return wan22ViaFal(params);
    case "replicate":
      return wan22ViaReplicate(params);
    default:
      throw new Error(`Unknown Wan 2.2 provider: ${providerId}`);
  }
}

async function generateHunyuanClip(
  _apiKey: string,
  shot: Shot
): Promise<GenerationOutput> {
  return hunyuanViaFal({
    imageUrl: shot.referenceImage ?? undefined,
    prompt: shot.prompt,
    duration: shot.duration,
  });
}

async function generateHedraClip(
  _apiKey: string,
  shot: Shot
): Promise<GenerationOutput> {
  // Hedra requires an audio URL — for B5 single-layer test we generate a quick TTS first
  const ttsOutput = await elevenLabsTTS({ text: "This is a test dialogue for the benchmark." });
  return hedraCharacter3({
    imageUrl: shot.referenceImage ?? "https://placehold.co/512x512/png",
    audioUrl: ttsOutput.url,
    prompt: shot.prompt,
    durationMs: shot.duration * 1000,
  });
}

async function generateTTS(
  providerId: string,
  _apiKey: string,
  text: string
): Promise<GenerationOutput> {
  switch (providerId) {
    case "elevenlabs":
      return elevenLabsTTS({ text });
    case "cartesia":
      return cartesiaTTS({ text });
    case "openai_tts":
      return openaiTTS({ text });
    default:
      throw new Error(`Unknown TTS provider: ${providerId}`);
  }
}

async function generateLipsync(
  _providerId: string,
  model: string,
  _apiKey: string,
  videoUrl: string,
  audioUrl: string
): Promise<GenerationOutput> {
  switch (model) {
    case "latentsync":
      return latentSyncViaFal({ videoUrl, audioUrl });
    case "musetalk":
      return museTalkViaFal({ videoUrl, audioUrl });
    case "kling_lipsync":
      return klingLipSyncViaFal({ videoUrl, audioUrl });
    default:
      throw new Error(`Unknown lipsync model: ${model}`);
  }
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function makeFailedClip(
  ticketId: string,
  shot: Shot,
  providerId: string,
  pricing: any,
  wallClockMs: number,
  err: unknown
): ClipResult {
  const clip: ClipResult = {
    ticketId,
    shotId: shot.id,
    provider: providerId,
    model: pricing.model ?? "unknown",
    mode: pricing.mode ?? "unknown",
    resolution: pricing.resolution ?? "unknown",
    durationSec: shot.duration,
    costUsd: 0,
    wallClockMs,
    queueTimeMs: 0,
    generationTimeMs: 0,
    outputUrl: null,
    status: "failed",
    error: err instanceof Error ? err.message : String(err),
    retryCount: 2,
    timestamp: new Date().toISOString(),
    metadata: { provider: providerId },
  };
  appendClipResult(clip);
  return clip;
}
