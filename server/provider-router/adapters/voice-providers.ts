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

// ─── ElevenLabs Turbo v2.5 ──────────────────────────────────────────────
registerAdapter(createVoiceAdapter({
  providerId: "elevenlabs_turbo_v25",
  modelName: "eleven_turbo_v2_5",
  baseUrl: "https://api.elevenlabs.io/v1",
  costPerChar: 0.00003,
  maxChars: 5000,
  submitEndpoint: "/text-to-speech/{voiceId}",
  isStreaming: true,
  buildBody: (v, model) => ({
    text: v.text, model_id: model,
    voice_settings: { stability: v.stability ?? 0.5, similarity_boost: v.similarityBoost ?? 0.75 },
  }),
  authHeader: (key) => ({ "xi-api-key": key }),
}));

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
