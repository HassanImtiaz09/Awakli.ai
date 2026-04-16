/**
 * Voice Provider Adapters — ElevenLabs Turbo v2.5, PlayHT 3.0, LMNT, Fish Audio, Azure TTS
 */
import type { ProviderAdapter, GenerationParams, VoiceParams, ExecutionContext, AdapterResult } from "../types";
import { ProviderError } from "../types";
import { registerAdapter, getActiveApiKey } from "../registry";

// ─── Helper: Generic REST voice adapter factory ──────────────────────────
function createVoiceAdapter(config: {
  providerId: string;
  modelName: string;
  baseUrl: string;
  costPerChar: number;
  maxChars: number;
  submitEndpoint: string;
  buildBody: (v: VoiceParams, model: string) => Record<string, unknown>;
  authHeader: (key: string) => Record<string, string>;
  isStreaming: boolean;
  extractAudioUrl?: (resp: Record<string, unknown>) => string | null;
  pollEndpoint?: string;
  isComplete?: (task: Record<string, unknown>) => boolean;
  extractPollResult?: (task: Record<string, unknown>) => string | null;
}): ProviderAdapter {
  return {
    providerId: config.providerId,
    validateParams(p: GenerationParams) {
      const v = p as VoiceParams; const errors: string[] = [];
      if (!v.text && !v.ssml) errors.push("text or ssml required");
      const len = (v.text ?? v.ssml ?? "").length;
      if (len > config.maxChars) errors.push(`max ${config.maxChars} chars for ${config.providerId}`);
      return { valid: !errors.length, errors: errors.length ? errors : undefined };
    },
    estimateCostUsd(p: GenerationParams) {
      const v = p as VoiceParams;
      return (v.text ?? v.ssml ?? "").length * config.costPerChar;
    },
    async execute(p: GenerationParams, ctx: ExecutionContext): Promise<AdapterResult> {
      const v = p as VoiceParams;
      const keyInfo = await getActiveApiKey(config.providerId);
      if (!keyInfo) throw new ProviderError("UNKNOWN", `No API key for ${config.providerId}`, config.providerId, false, false);

      const body = config.buildBody(v, config.modelName);
      const resp = await fetch(`${config.baseUrl}${config.submitEndpoint}`, {
        method: "POST",
        headers: { ...config.authHeader(keyInfo.decryptedKey), "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctx.timeout ? AbortSignal.timeout(ctx.timeout) : undefined,
      });

      if (!resp.ok) {
        const errBody = await resp.text().catch(() => "");
        if (resp.status === 429) throw new ProviderError("RATE_LIMITED", errBody, config.providerId);
        throw new ProviderError("TRANSIENT", `${config.providerId} ${resp.status}: ${errBody}`, config.providerId);
      }

      if (config.isStreaming) {
        // Streaming response — collect audio bytes
        const audioBuffer = Buffer.from(await resp.arrayBuffer());
        // Upload to S3 via the storage helper
        const { storagePut } = await import("../../storage");
        const key = `voice/${config.providerId}/${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`;
        const { url } = await storagePut(key, audioBuffer, "audio/mpeg");
        return { storageUrl: url, mimeType: "audio/mpeg", metadata: { model: config.modelName, chars: (v.text ?? "").length } };
      }

      // Non-streaming: parse JSON response
      const data = await resp.json() as Record<string, unknown>;
      if (config.extractAudioUrl) {
        const url = config.extractAudioUrl(data);
        if (url) return { storageUrl: url, mimeType: "audio/mpeg", metadata: { model: config.modelName } };
      }

      // Poll if needed
      if (config.pollEndpoint) {
        const taskId = String(data.id ?? data.task_id ?? "");
        const maxWait = ctx.timeout ?? 60_000;
        const start = Date.now();
        while (Date.now() - start < maxWait) {
          await new Promise(r => setTimeout(r, 2000));
          const poll = await fetch(`${config.baseUrl}${config.pollEndpoint}`.replace("{taskId}", taskId), {
            headers: config.authHeader(keyInfo.decryptedKey),
          });
          if (!poll.ok) continue;
          const task = await poll.json() as Record<string, unknown>;
          if (config.isComplete?.(task)) {
            const url = config.extractPollResult?.(task);
            if (url) return { storageUrl: url, mimeType: "audio/mpeg", metadata: { taskId, model: config.modelName } };
          }
        }
        throw new ProviderError("TIMEOUT", `${config.providerId} task timed out`, config.providerId);
      }

      throw new ProviderError("TRANSIENT", "No audio URL in response", config.providerId);
    },
  };
}

//// ─── ElevenLabs Turbo v2.5 (via Fal.ai) ──────────────────────────────
// Queue pattern: POST queue.fal.run/fal-ai/elevenlabs/tts/turbo-v2.5
// Pricing: $0.05/1000 chars
// Auth: Authorization: Key {FAL_API_KEY}
const ELEVENLABS_FAL_MODEL = "fal-ai/elevenlabs/tts/turbo-v2.5";

registerAdapter({
  providerId: "elevenlabs_turbo_v25",

  validateParams(p: GenerationParams) {
    const v = p as VoiceParams;
    const errors: string[] = [];
    if (!v.text && !v.ssml) errors.push("text or ssml required");
    const len = (v.text ?? v.ssml ?? "").length;
    if (len > 5000) errors.push("max 5000 chars for elevenlabs_turbo_v25");
    return { valid: !errors.length, errors: errors.length ? errors : undefined };
  },

  estimateCostUsd(p: GenerationParams) {
    const v = p as VoiceParams;
    return (v.text ?? v.ssml ?? "").length * 0.00005; // $0.05/1000 chars via Fal.ai
  },

  async execute(p: GenerationParams, ctx: ExecutionContext): Promise<AdapterResult> {
    const v = p as VoiceParams;
    const keyInfo = await getActiveApiKey("elevenlabs_turbo_v25");
    if (!keyInfo) throw new ProviderError("UNKNOWN", "No API key for elevenlabs_turbo_v25", "elevenlabs_turbo_v25", false, false);
    const apiKey = keyInfo.decryptedKey;

    const queueUrl = `https://queue.fal.run/${ELEVENLABS_FAL_MODEL}`;
    const body: Record<string, unknown> = {
      text: v.text ?? v.ssml ?? "",
      voice: v.voiceId ?? "Rachel",
    };

    // Submit to Fal.ai queue
    const submitResp = await fetch(queueUrl, {
      method: "POST",
      headers: { "Authorization": `Key ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctx.timeout ? AbortSignal.timeout(Math.min(ctx.timeout, 30_000)) : undefined,
    });

    if (!submitResp.ok) {
      const errBody = await submitResp.text().catch(() => "");
      if (submitResp.status === 429) throw new ProviderError("RATE_LIMITED", errBody, "elevenlabs_turbo_v25");
      throw new ProviderError("TRANSIENT", `elevenlabs_turbo_v25 ${submitResp.status}: ${errBody}`, "elevenlabs_turbo_v25");
    }

    const submitData = await submitResp.json() as Record<string, unknown>;
    const requestId = String(submitData.request_id ?? "");
    const statusUrl = String(submitData.status_url ?? `${queueUrl}/requests/${requestId}/status`);
    const responseUrl = String(submitData.response_url ?? `${queueUrl}/requests/${requestId}`);
    if (!requestId) throw new ProviderError("TRANSIENT", "No request_id in Fal.ai queue response", "elevenlabs_turbo_v25");

    // Poll for completion
    const maxWait = ctx.timeout ?? 60_000;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const statusResp = await fetch(statusUrl, { headers: { "Authorization": `Key ${apiKey}` } });
        if (!statusResp.ok) continue;
        const statusData = await statusResp.json() as Record<string, unknown>;
        const status = String(statusData.status ?? "");
        if (status === "COMPLETED") {
          const resultResp = await fetch(responseUrl, { headers: { "Authorization": `Key ${apiKey}` } });
          if (!resultResp.ok) throw new ProviderError("TRANSIENT", `Failed to fetch ElevenLabs result: ${resultResp.status}`, "elevenlabs_turbo_v25");
          const resultData = await resultResp.json() as Record<string, unknown>;
          const audio = resultData.audio as Record<string, unknown> | undefined;
          const audioUrl = audio?.url ? String(audio.url) : null;
          if (!audioUrl) throw new ProviderError("TRANSIENT", "No audio URL in ElevenLabs result", "elevenlabs_turbo_v25");
          return { storageUrl: audioUrl, mimeType: "audio/mpeg", metadata: { requestId, model: ELEVENLABS_FAL_MODEL, chars: (v.text ?? "").length } };
        }
        if (status === "FAILED") throw new ProviderError("TRANSIENT", String(statusData.error ?? "ElevenLabs task failed on Fal.ai"), "elevenlabs_turbo_v25");
      } catch (err) {
        if (err instanceof ProviderError) throw err;
      }
    }
    throw new ProviderError("TIMEOUT", "elevenlabs_turbo_v25 task timed out on Fal.ai", "elevenlabs_turbo_v25");
  },
});

// ─── PlayHT 3.0 ────────────────────────────────────────────────────────
registerAdapter(createVoiceAdapter({
  providerId: "playht_30",
  modelName: "PlayHT3.0-mini",
  baseUrl: "https://api.play.ht/api/v2",
  costPerChar: 0.000025,
  maxChars: 10000,
  submitEndpoint: "/tts/stream",
  isStreaming: true,
  buildBody: (v, model) => ({
    text: v.text, voice: v.voiceId ?? "default", quality: "premium",
    output_format: "mp3", voice_engine: model, speed: v.speed ?? 1.0,
  }),
  authHeader: (key) => ({ "Authorization": `Bearer ${key}`, "X-User-ID": "awakli" }),
}));

// ─── LMNT ───────────────────────────────────────────────────────────────
registerAdapter(createVoiceAdapter({
  providerId: "lmnt",
  modelName: "lmnt-v1",
  baseUrl: "https://api.lmnt.com/v1",
  costPerChar: 0.000020,
  maxChars: 5000,
  submitEndpoint: "/ai/speech",
  isStreaming: true,
  buildBody: (v) => ({
    text: v.text, voice: v.voiceId ?? "lily", format: "mp3", speed: v.speed ?? 1.0,
  }),
  authHeader: (key) => ({ "X-API-Key": key }),
}));

// ─── Fish Audio ─────────────────────────────────────────────────────────
registerAdapter(createVoiceAdapter({
  providerId: "fish_audio",
  modelName: "fish-speech-1.5",
  baseUrl: "https://api.fish.audio/v1",
  costPerChar: 0.000015,
  maxChars: 5000,
  submitEndpoint: "/tts",
  isStreaming: true,
  buildBody: (v) => ({
    text: v.text, reference_id: v.voiceId, format: "mp3",
    latency: "normal", streaming: false,
  }),
  authHeader: (key) => ({ "Authorization": `Bearer ${key}` }),
}));

// ─── Azure TTS ──────────────────────────────────────────────────────────
registerAdapter(createVoiceAdapter({
  providerId: "azure_tts",
  modelName: "azure-neural",
  baseUrl: "https://eastus.tts.speech.microsoft.com",
  costPerChar: 0.000016,
  maxChars: 10000,
  submitEndpoint: "/cognitiveservices/v1",
  isStreaming: true,
  buildBody: (v) => {
    // Azure uses SSML format
    const voice = v.voiceId ?? "en-US-JennyNeural";
    const ssml = v.ssml ?? `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='${voice}'>${v.text}</voice></speak>`;
    return { ssml };
  },
  authHeader: (key) => ({ "Ocp-Apim-Subscription-Key": key, "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3" }),
}));
