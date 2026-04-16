/**
 * RunwayML Gen-4 Adapter
 * Video generation via RunwayML API.
 * API: POST /v1/image_to_video (or /v1/text_to_video)
 */
import type { ProviderAdapter, GenerationParams, VideoParams, ExecutionContext, AdapterResult } from "../types";
import { ProviderError } from "../types";
import { registerAdapter, getActiveApiKey } from "../registry";

class RunwayGen4Adapter implements ProviderAdapter {
  readonly providerId = "runway_gen4";

  validateParams(p: GenerationParams) {
    const v = p as VideoParams;
    const errors: string[] = [];
    if (!v.prompt) errors.push("prompt required");
    if (v.durationSeconds && v.durationSeconds > 10) errors.push("max 10s for Runway Gen-4");
    return { valid: !errors.length, errors: errors.length ? errors : undefined };
  }

  estimateCostUsd(p: GenerationParams) {
    const v = p as VideoParams;
    return Math.ceil((v.durationSeconds ?? 5) / 5) * 0.050;
  }

  async execute(p: GenerationParams, ctx: ExecutionContext): Promise<AdapterResult> {
    const v = p as VideoParams;
    const apiKey = await getActiveApiKey(this.providerId);
    if (!apiKey) throw new ProviderError("UNKNOWN", "No API key configured for Runway", this.providerId, false, false);

    const baseUrl = "https://api.dev.runwayml.com/v1";
    const body: Record<string, unknown> = {
      model: "gen4_turbo",
      promptText: v.prompt,
      duration: v.durationSeconds ?? 5,
      ratio: v.aspectRatio ?? "16:9",
    };
    if (v.imageUrl) body.promptImage = v.imageUrl;

    const endpoint = v.imageUrl ? "/image_to_video" : "/text_to_video";
    const resp = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Runway-Version": "2024-11-06" },
      body: JSON.stringify(body),
      signal: ctx.timeout ? AbortSignal.timeout(ctx.timeout) : undefined,
    });

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "");
      if (resp.status === 429) throw new ProviderError("RATE_LIMITED", errBody, this.providerId);
      if (resp.status === 401 || resp.status === 403) throw new ProviderError("UNKNOWN", errBody, this.providerId, false, false);
      throw new ProviderError("TRANSIENT", `Runway ${resp.status}: ${errBody}`, this.providerId);
    }

    const data = await resp.json() as { id: string };
    // Poll for completion
    const taskId = data.id;
    const maxWait = ctx.timeout ?? 300_000;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      await new Promise(r => setTimeout(r, 5000));
      const poll = await fetch(`${baseUrl}/tasks/${taskId}`, {
        headers: { "Authorization": `Bearer ${apiKey}`, "X-Runway-Version": "2024-11-06" },
      });
      if (!poll.ok) continue;
      const task = await poll.json() as { status: string; output?: string[]; failure?: string };
      if (task.status === "SUCCEEDED" && task.output?.length) {
        return { storageUrl: task.output[0], mimeType: "video/mp4", durationSeconds: v.durationSeconds ?? 5, metadata: { taskId, model: "gen4_turbo" } };
      }
      if (task.status === "FAILED") throw new ProviderError("TRANSIENT", task.failure ?? "Runway task failed", this.providerId);
    }
    throw new ProviderError("TIMEOUT", "Runway task timed out", this.providerId);
  }
}

registerAdapter(new RunwayGen4Adapter());
