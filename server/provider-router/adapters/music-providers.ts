/**
 * Music Provider Adapters — Suno v4, Udio v2, MiniMax Music-01
 */
import type { ProviderAdapter, GenerationParams, MusicParams, ExecutionContext, AdapterResult } from "../types";
import { ProviderError } from "../types";
import { registerAdapter, getActiveApiKey } from "../registry";

// ─── Helper: Generic REST music adapter factory ──────────────────────────
function createMusicAdapter(config: {
  providerId: string;
  modelName: string;
  baseUrl: string;
  costPerTrack: number;
  maxDuration: number;
  submitEndpoint: string;
  pollEndpoint: string;
  buildBody: (m: MusicParams, model: string) => Record<string, unknown>;
  extractTaskId: (resp: Record<string, unknown>) => string;
  extractResult: (task: Record<string, unknown>) => { url: string; duration?: number } | null;
  isComplete: (task: Record<string, unknown>) => boolean;
  isFailed: (task: Record<string, unknown>) => boolean;
  getError: (task: Record<string, unknown>) => string;
  authHeader: (key: string) => Record<string, string>;
}): ProviderAdapter {
  return {
    providerId: config.providerId,
    validateParams(p: GenerationParams) {
      const m = p as MusicParams; const errors: string[] = [];
      if (!m.prompt && !m.lyrics) errors.push("prompt or lyrics required");
      if (m.durationSeconds && m.durationSeconds > config.maxDuration) errors.push(`max ${config.maxDuration}s for ${config.providerId}`);
      return { valid: !errors.length, errors: errors.length ? errors : undefined };
    },
    estimateCostUsd() {
      return config.costPerTrack;
    },
    async execute(p: GenerationParams, ctx: ExecutionContext): Promise<AdapterResult> {
      const m = p as MusicParams;
      const keyInfo = await getActiveApiKey(config.providerId);
      if (!keyInfo) throw new ProviderError("UNKNOWN", `No API key for ${config.providerId}`, config.providerId, false, false);

      const body = config.buildBody(m, config.modelName);
      const resp = await fetch(`${config.baseUrl}${config.submitEndpoint}`, {
        method: "POST",
        headers: { ...config.authHeader(keyInfo.decryptedKey), "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctx.timeout ? AbortSignal.timeout(Math.min(ctx.timeout, 30_000)) : undefined,
      });

      if (!resp.ok) {
        const errBody = await resp.text().catch(() => "");
        if (resp.status === 429) throw new ProviderError("RATE_LIMITED", errBody, config.providerId);
        throw new ProviderError("TRANSIENT", `${config.providerId} ${resp.status}: ${errBody}`, config.providerId);
      }

      const data = await resp.json() as Record<string, unknown>;
      const taskId = config.extractTaskId(data);
      const maxWait = ctx.timeout ?? 300_000;
      const start = Date.now();

      while (Date.now() - start < maxWait) {
        await new Promise(r => setTimeout(r, 5000));
        const poll = await fetch(`${config.baseUrl}${config.pollEndpoint}`.replace("{taskId}", taskId), {
          headers: config.authHeader(keyInfo.decryptedKey),
        });
        if (!poll.ok) continue;
        const task = await poll.json() as Record<string, unknown>;
        if (config.isComplete(task)) {
          const result = config.extractResult(task);
          if (result) return {
            storageUrl: result.url, mimeType: "audio/mpeg",
            durationSeconds: result.duration ?? m.durationSeconds ?? 30,
            metadata: { taskId, model: config.modelName },
          };
        }
        if (config.isFailed(task)) throw new ProviderError("TRANSIENT", config.getError(task), config.providerId);
      }
      throw new ProviderError("TIMEOUT", `${config.providerId} task timed out`, config.providerId);
    },
  };
}

// ─── Suno v4 ────────────────────────────────────────────────────────────
registerAdapter(createMusicAdapter({
  providerId: "suno_v4",
  modelName: "suno-v4",
  baseUrl: "https://api.suno.ai/v1",
  costPerTrack: 0.050,
  maxDuration: 240,
  submitEndpoint: "/generations",
  pollEndpoint: "/generations/{taskId}",
  buildBody: (m, model) => ({
    model, prompt: m.prompt, lyrics: m.lyrics, instrumental: m.instrumental ?? false,
    auto_lyrics: m.autoLyrics ?? false, duration: m.durationSeconds ?? 30,
    genre: m.genre,
  }),
  extractTaskId: (r) => String((r as Record<string, unknown>).id ?? ""),
  extractResult: (t) => {
    const url = (t as Record<string, unknown>).audio_url;
    const dur = (t as Record<string, unknown>).duration;
    return url ? { url: String(url), duration: typeof dur === "number" ? dur : undefined } : null;
  },
  isComplete: (t) => (t as Record<string, unknown>).status === "complete",
  isFailed: (t) => (t as Record<string, unknown>).status === "error",
  getError: (t) => String((t as Record<string, unknown>).error ?? "Suno task failed"),
  authHeader: (key) => ({ "Authorization": `Bearer ${key}` }),
}));

// ─── Udio v2 ────────────────────────────────────────────────────────────
registerAdapter(createMusicAdapter({
  providerId: "udio_v2",
  modelName: "udio-v2",
  baseUrl: "https://api.udio.com/v1",
  costPerTrack: 0.060,
  maxDuration: 240,
  submitEndpoint: "/generations",
  pollEndpoint: "/generations/{taskId}",
  buildBody: (m, model) => ({
    model, prompt: m.prompt, lyrics: m.lyrics, instrumental: m.instrumental ?? false,
    duration: m.durationSeconds ?? 30,
  }),
  extractTaskId: (r) => String((r as Record<string, unknown>).id ?? ""),
  extractResult: (t) => {
    const url = (t as Record<string, unknown>).song_url ?? (t as Record<string, unknown>).audio_url;
    return url ? { url: String(url) } : null;
  },
  isComplete: (t) => (t as Record<string, unknown>).status === "completed",
  isFailed: (t) => (t as Record<string, unknown>).status === "failed",
  getError: (t) => String((t as Record<string, unknown>).error ?? "Udio task failed"),
  authHeader: (key) => ({ "Authorization": `Bearer ${key}` }),
}));

// ─── MiniMax Music-01 ───────────────────────────────────────────────────
registerAdapter(createMusicAdapter({
  providerId: "minimax_music01",
  modelName: "music-01",
  baseUrl: "https://api.minimax.chat/v1",
  costPerTrack: 0.040,
  maxDuration: 300,
  submitEndpoint: "/music_generation",
  pollEndpoint: "/query/music_generation?task_id={taskId}",
  buildBody: (m, model) => ({
    model, prompt: m.lyrics ?? m.prompt,
    refer_audio: m.referenceAudioUrl, instrumental: m.instrumental ?? false,
  }),
  extractTaskId: (r) => String((r as Record<string, unknown>).task_id ?? ""),
  extractResult: (t) => {
    const audioFile = (t as Record<string, unknown>).audio_file;
    return audioFile ? { url: String(audioFile) } : null;
  },
  isComplete: (t) => (t as Record<string, unknown>).status === "Success",
  isFailed: (t) => (t as Record<string, unknown>).status === "Failed",
  getError: (t) => String((t as Record<string, unknown>).base_resp ?? "MiniMax Music task failed"),
  authHeader: (key) => ({ "Authorization": `Bearer ${key}` }),
}));
