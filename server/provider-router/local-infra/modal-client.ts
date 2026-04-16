/**
 * Modal Client — Fallback GPU inference platform
 * Prompt 19: Hybrid Local/API Inference Infrastructure
 *
 * Implements the same GpuPlatformClient interface as RunPod.
 * Modal uses a different API shape but provides the same capabilities.
 */
import type {
  GpuPlatformClient,
  InferenceJobInput,
  InferenceJobResult,
  EndpointMetrics,
  JobStatus,
} from "./types";

function getModalToken(): string {
  return process.env.MODAL_TOKEN_ID ?? "";
}

function getModalSecret(): string {
  return process.env.MODAL_TOKEN_SECRET ?? "";
}

function mapModalStatus(status: string): JobStatus {
  switch (status) {
    case "pending": return "IN_QUEUE";
    case "running": return "IN_PROGRESS";
    case "success": return "COMPLETED";
    case "failure": return "FAILED";
    case "cancelled": return "CANCELLED";
    case "timeout": return "TIMED_OUT";
    default: return "FAILED";
  }
}

export class ModalClient implements GpuPlatformClient {
  readonly platform = "modal" as const;

  /**
   * Submit an inference job to a Modal web endpoint.
   * Modal functions are invoked via HTTPS POST to the function URL.
   */
  async submitJob(endpointId: string, input: InferenceJobInput, timeout?: number): Promise<string> {
    const tokenId = getModalToken();
    const tokenSecret = getModalSecret();
    if (!tokenId || !tokenSecret) throw new Error("MODAL_TOKEN_ID / MODAL_TOKEN_SECRET not configured");

    // endpointId is the full Modal function URL: https://<workspace>--<app>-<fn>.modal.run
    const url = endpointId;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Token ${tokenId}:${tokenSecret}`,
      },
      body: JSON.stringify({
        model_type: input.model_type,
        model_version: input.model_version,
        ...input.params,
        _async: true, // Request async execution
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "");
      throw new Error(`Modal submit failed (${resp.status}): ${errBody}`);
    }

    const data = await resp.json() as { call_id: string };
    if (!data.call_id) throw new Error("Modal response missing call_id");
    return data.call_id;
  }

  /**
   * Get the status of a Modal function call.
   */
  async getJobStatus(endpointId: string, jobId: string): Promise<InferenceJobResult> {
    const tokenId = getModalToken();
    const tokenSecret = getModalSecret();
    if (!tokenId || !tokenSecret) throw new Error("MODAL_TOKEN_ID / MODAL_TOKEN_SECRET not configured");

    // Modal status endpoint
    const url = `${endpointId}/status/${jobId}`;
    const resp = await fetch(url, {
      headers: { "Authorization": `Token ${tokenId}:${tokenSecret}` },
      signal: AbortSignal.timeout(15_000),
    });

    if (!resp.ok) {
      throw new Error(`Modal status check failed (${resp.status})`);
    }

    const data = await resp.json() as {
      call_id: string;
      status: string;
      result?: Record<string, unknown>;
      error?: string;
      started_at?: string;
      finished_at?: string;
    };

    const status = mapModalStatus(data.status);
    let executionTimeMs: number | undefined;
    if (data.started_at && data.finished_at) {
      executionTimeMs = new Date(data.finished_at).getTime() - new Date(data.started_at).getTime();
    }

    return {
      jobId: data.call_id,
      status,
      output: data.result ? {
        url: data.result.url as string | undefined,
        urls: data.result.urls as string[] | undefined,
        frames: data.result.frames as string[] | undefined,
        embedding: data.result.embedding as number[] | undefined,
        metadata: data.result.metadata as Record<string, unknown> | undefined,
      } : undefined,
      error: data.error ?? undefined,
      executionTimeMs,
      wasColdStart: false, // Modal doesn't expose cold start info directly
      coldStartMs: 0,
    };
  }

  /**
   * Run synchronous inference: submit + poll until completion.
   * Modal's synchronous mode blocks the HTTP connection.
   */
  async runSync(endpointId: string, input: InferenceJobInput, timeoutMs = 300_000): Promise<InferenceJobResult> {
    const tokenId = getModalToken();
    const tokenSecret = getModalSecret();
    if (!tokenId || !tokenSecret) throw new Error("MODAL_TOKEN_ID / MODAL_TOKEN_SECRET not configured");

    // Try synchronous call first (Modal blocks until done)
    const url = endpointId;
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Token ${tokenId}:${tokenSecret}`,
        },
        body: JSON.stringify({
          model_type: input.model_type,
          model_version: input.model_version,
          ...input.params,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!resp.ok) {
        const errBody = await resp.text().catch(() => "");
        return {
          jobId: "sync-" + Date.now(),
          status: "FAILED",
          error: `Modal sync call failed (${resp.status}): ${errBody}`,
        };
      }

      const data = await resp.json() as Record<string, unknown>;
      return {
        jobId: String(data.call_id ?? "sync-" + Date.now()),
        status: "COMPLETED",
        output: {
          url: data.url as string | undefined,
          urls: data.urls as string[] | undefined,
          frames: data.frames as string[] | undefined,
          embedding: data.embedding as number[] | undefined,
          metadata: data.metadata as Record<string, unknown> | undefined,
        },
        executionTimeMs: data.execution_time_ms as number | undefined,
        wasColdStart: false,
        coldStartMs: 0,
      };
    } catch (err) {
      // On timeout, try async fallback
      const jobId = await this.submitJob(endpointId, input, timeoutMs);
      const start = Date.now();
      const pollInterval = 3_000;

      while (Date.now() - start < timeoutMs) {
        await new Promise(r => setTimeout(r, pollInterval));
        const result = await this.getJobStatus(endpointId, jobId);
        if (result.status === "COMPLETED" || result.status === "FAILED" || result.status === "TIMED_OUT") {
          return result;
        }
      }

      return {
        jobId,
        status: "TIMED_OUT",
        error: `Modal job timed out after ${timeoutMs}ms`,
      };
    }
  }

  /**
   * Check endpoint health.
   * Modal doesn't have a direct health endpoint; we ping the function URL.
   */
  async healthCheck(endpointId: string): Promise<{ healthy: boolean; warmWorkers: number; queueDepth: number }> {
    const tokenId = getModalToken();
    const tokenSecret = getModalSecret();
    if (!tokenId || !tokenSecret) return { healthy: false, warmWorkers: 0, queueDepth: 0 };

    try {
      const resp = await fetch(`${endpointId}/health`, {
        headers: { "Authorization": `Token ${tokenId}:${tokenSecret}` },
        signal: AbortSignal.timeout(10_000),
      });

      if (!resp.ok) return { healthy: false, warmWorkers: 0, queueDepth: 0 };

      const data = await resp.json() as { healthy: boolean; containers: number; pending: number };
      return {
        healthy: data.healthy ?? true,
        warmWorkers: data.containers ?? 0,
        queueDepth: data.pending ?? 0,
      };
    } catch {
      return { healthy: false, warmWorkers: 0, queueDepth: 0 };
    }
  }

  /**
   * Get endpoint metrics.
   */
  async getMetrics(endpointId: string): Promise<EndpointMetrics> {
    const health = await this.healthCheck(endpointId);
    return {
      endpointId,
      warmWorkers: health.warmWorkers,
      queueDepth: health.queueDepth,
      totalRequests24h: 0,
      avgExecutionTimeMs: 0,
      coldStartRate: 0,
      gpuUtilization: 0,
    };
  }
}

/** Singleton Modal client instance */
export const modalClient = new ModalClient();
