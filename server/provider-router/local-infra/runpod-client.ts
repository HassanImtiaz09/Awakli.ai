/**
 * RunPod Serverless Client — Primary GPU inference platform
 * Prompt 19: Hybrid Local/API Inference Infrastructure
 *
 * Implements the GpuPlatformClient interface for RunPod's serverless API.
 * Handles job submission, polling, health checks, and metrics collection.
 */
import type {
  GpuPlatformClient,
  InferenceJobInput,
  InferenceJobResult,
  EndpointMetrics,
  JobStatus,
} from "./types";

const RUNPOD_API_BASE = "https://api.runpod.ai/v2";

function getRunPodApiKey(): string {
  return process.env.RUNPOD_API_KEY ?? "";
}

function mapRunPodStatus(status: string): JobStatus {
  switch (status) {
    case "IN_QUEUE": return "IN_QUEUE";
    case "IN_PROGRESS": return "IN_PROGRESS";
    case "COMPLETED": return "COMPLETED";
    case "FAILED": return "FAILED";
    case "CANCELLED": return "CANCELLED";
    case "TIMED_OUT": return "TIMED_OUT";
    default: return "FAILED";
  }
}

export class RunPodClient implements GpuPlatformClient {
  readonly platform = "runpod" as const;

  /**
   * Submit an async inference job to a RunPod serverless endpoint.
   * Returns the job ID for subsequent polling.
   */
  async submitJob(endpointId: string, input: InferenceJobInput, timeout?: number): Promise<string> {
    const apiKey = getRunPodApiKey();
    if (!apiKey) throw new Error("RUNPOD_API_KEY not configured");

    const url = `${RUNPOD_API_BASE}/${endpointId}/run`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: {
          model_type: input.model_type,
          model_version: input.model_version,
          ...input.params,
        },
        ...(timeout ? { execution_timeout: Math.ceil(timeout / 1000) } : {}),
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "");
      throw new Error(`RunPod submit failed (${resp.status}): ${errBody}`);
    }

    const data = await resp.json() as { id: string; status: string };
    if (!data.id) throw new Error("RunPod response missing job ID");
    return data.id;
  }

  /**
   * Get the status and result of a previously submitted job.
   */
  async getJobStatus(endpointId: string, jobId: string): Promise<InferenceJobResult> {
    const apiKey = getRunPodApiKey();
    if (!apiKey) throw new Error("RUNPOD_API_KEY not configured");

    const url = `${RUNPOD_API_BASE}/${endpointId}/status/${jobId}`;
    const resp = await fetch(url, {
      headers: { "Authorization": `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });

    if (!resp.ok) {
      throw new Error(`RunPod status check failed (${resp.status})`);
    }

    const data = await resp.json() as {
      id: string;
      status: string;
      output?: Record<string, unknown>;
      error?: string;
      executionTime?: number;
      delayTime?: number;
    };

    const status = mapRunPodStatus(data.status);
    const wasColdStart = (data.delayTime ?? 0) > 5000; // >5s delay = cold start
    const coldStartMs = wasColdStart ? (data.delayTime ?? 0) : 0;

    return {
      jobId: data.id,
      status,
      output: data.output ? {
        url: data.output.url as string | undefined,
        urls: data.output.urls as string[] | undefined,
        frames: data.output.frames as string[] | undefined,
        embedding: data.output.embedding as number[] | undefined,
        metadata: data.output.metadata as Record<string, unknown> | undefined,
      } : undefined,
      error: data.error ?? undefined,
      executionTimeMs: data.executionTime ? data.executionTime * 1000 : undefined,
      wasColdStart,
      coldStartMs,
    };
  }

  /**
   * Run a synchronous inference: submit + poll until completion or timeout.
   * Uses RunPod's /runsync endpoint for short jobs, falls back to async polling.
   */
  async runSync(endpointId: string, input: InferenceJobInput, timeoutMs = 300_000): Promise<InferenceJobResult> {
    const apiKey = getRunPodApiKey();
    if (!apiKey) throw new Error("RUNPOD_API_KEY not configured");

    // Try runsync first (blocks up to 120s on RunPod side)
    const syncUrl = `${RUNPOD_API_BASE}/${endpointId}/runsync`;
    const resp = await fetch(syncUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: {
          model_type: input.model_type,
          model_version: input.model_version,
          ...input.params,
        },
      }),
      signal: AbortSignal.timeout(Math.min(timeoutMs, 130_000)),
    });

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "");
      throw new Error(`RunPod runsync failed (${resp.status}): ${errBody}`);
    }

    const data = await resp.json() as {
      id: string;
      status: string;
      output?: Record<string, unknown>;
      error?: string;
      executionTime?: number;
      delayTime?: number;
    };

    const status = mapRunPodStatus(data.status);

    // If completed synchronously, return immediately
    if (status === "COMPLETED" || status === "FAILED") {
      const wasColdStart = (data.delayTime ?? 0) > 5000;
      return {
        jobId: data.id,
        status,
        output: data.output ? {
          url: data.output.url as string | undefined,
          urls: data.output.urls as string[] | undefined,
          frames: data.output.frames as string[] | undefined,
          embedding: data.output.embedding as number[] | undefined,
          metadata: data.output.metadata as Record<string, unknown> | undefined,
        } : undefined,
        error: data.error ?? undefined,
        executionTimeMs: data.executionTime ? data.executionTime * 1000 : undefined,
        wasColdStart,
        coldStartMs: wasColdStart ? (data.delayTime ?? 0) : 0,
      };
    }

    // Still in queue/progress — fall back to polling
    const jobId = data.id;
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
      error: `Job timed out after ${timeoutMs}ms`,
    };
  }

  /**
   * Check endpoint health: warm workers and queue depth.
   */
  async healthCheck(endpointId: string): Promise<{ healthy: boolean; warmWorkers: number; queueDepth: number }> {
    const apiKey = getRunPodApiKey();
    if (!apiKey) return { healthy: false, warmWorkers: 0, queueDepth: 0 };

    try {
      const url = `${RUNPOD_API_BASE}/${endpointId}/health`;
      const resp = await fetch(url, {
        headers: { "Authorization": `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });

      if (!resp.ok) return { healthy: false, warmWorkers: 0, queueDepth: 0 };

      const data = await resp.json() as {
        workers: { idle: number; running: number; initializing: number; ready: number };
        jobs: { completed: number; failed: number; inProgress: number; inQueue: number; retried: number };
      };

      const warmWorkers = (data.workers?.idle ?? 0) + (data.workers?.running ?? 0);
      const queueDepth = data.jobs?.inQueue ?? 0;

      return {
        healthy: true,
        warmWorkers,
        queueDepth,
      };
    } catch {
      return { healthy: false, warmWorkers: 0, queueDepth: 0 };
    }
  }

  /**
   * Get detailed endpoint metrics for monitoring.
   */
  async getMetrics(endpointId: string): Promise<EndpointMetrics> {
    const health = await this.healthCheck(endpointId);

    return {
      endpointId,
      warmWorkers: health.warmWorkers,
      queueDepth: health.queueDepth,
      // These would be populated from gpu_usage_log aggregation in practice
      totalRequests24h: 0,
      avgExecutionTimeMs: 0,
      coldStartRate: 0,
      gpuUtilization: 0,
    };
  }
}

/** Singleton RunPod client instance */
export const runpodClient = new RunPodClient();
