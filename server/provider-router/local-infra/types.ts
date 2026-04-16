/**
 * Local Infrastructure Types — GPU inference platform abstraction
 * Prompt 19: Hybrid Local/API Inference Infrastructure
 */

// ─── GPU Types & Rates ──────────────────────────────────────────────────

export type GpuType = "h100_sxm" | "a100_80gb" | "rtx_4090";

/** RunPod Serverless GPU rates (April 2026), USD per second */
export const GPU_RATES: Record<GpuType, number> = {
  h100_sxm: 0.000970,
  a100_80gb: 0.000456,
  rtx_4090: 0.000192,
};

/** Platform margin multiplier (30%) */
export const MARGIN_MULTIPLIER = 1.30;

/** Credit COGS rate: $0.55 per credit */
export const CREDIT_COGS_RATE = 0.55;

// ─── Platform Types ─────────────────────────────────────────────────────

export type InferencePlatform = "runpod" | "modal";
export type EndpointStatus = "active" | "draining" | "disabled";

export interface ScalingConfig {
  minWorkers: number;
  maxWorkers: number;
  idleTimeoutSeconds: number;
  maxQueueDepth: number;
  coldStartBudgetSeconds: number;
  warmPool: number;
}

// ─── Job Types ──────────────────────────────────────────────────────────

export type JobStatus = "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED" | "TIMED_OUT";

export interface InferenceJobInput {
  model_type: string;
  model_version: string;
  params: Record<string, unknown>;
}

export interface InferenceJobResult {
  jobId: string;
  status: JobStatus;
  output?: {
    url?: string;
    urls?: string[];
    frames?: string[];
    embedding?: number[];
    metadata?: Record<string, unknown>;
  };
  error?: string;
  executionTimeMs?: number;
  gpuType?: string;
  wasColdStart?: boolean;
  coldStartMs?: number;
}

export interface EndpointMetrics {
  endpointId: string;
  warmWorkers: number;
  queueDepth: number;
  totalRequests24h: number;
  avgExecutionTimeMs: number;
  coldStartRate: number;
  gpuUtilization: number;
}

// ─── Platform Client Interface ──────────────────────────────────────────

export interface GpuPlatformClient {
  /** Platform identifier */
  readonly platform: InferencePlatform;

  /** Submit an inference job and return job ID */
  submitJob(endpointId: string, input: InferenceJobInput, timeout?: number): Promise<string>;

  /** Poll job status and result */
  getJobStatus(endpointId: string, jobId: string): Promise<InferenceJobResult>;

  /** Run a synchronous inference (submit + poll until done) */
  runSync(endpointId: string, input: InferenceJobInput, timeoutMs?: number): Promise<InferenceJobResult>;

  /** Check endpoint health */
  healthCheck(endpointId: string): Promise<{ healthy: boolean; warmWorkers: number; queueDepth: number }>;

  /** Get endpoint metrics */
  getMetrics(endpointId: string): Promise<EndpointMetrics>;
}

// ─── Model Artifact Types ───────────────────────────────────────────────

export interface ModelArtifactInfo {
  id: number;
  modelName: string;
  version: string;
  artifactPath: string;
  sizeBytes: number;
  checksumSha256: string;
  isActive: boolean;
  metadata: Record<string, unknown> | null;
}

export interface EndpointInfo {
  id: number;
  providerId: string;
  platform: InferencePlatform;
  endpointId: string;
  endpointUrl: string;
  gpuType: GpuType;
  modelArtifactId: number | null;
  scalingConfig: ScalingConfig;
  status: EndpointStatus;
  warmWorkers: number;
  queueDepth: number;
}

// ─── Local Model Specs ──────────────────────────────────────────────────

export interface LocalModelSpec {
  providerId: string;
  modelName: string;
  defaultGpuType: GpuType;
  avgInferenceTimeSec: { min: number; max: number };
  vramGb: number;
  dockerImage: string;
}

/** Specifications for all 6 local models */
export const LOCAL_MODEL_SPECS: Record<string, LocalModelSpec> = {
  local_animatediff: {
    providerId: "local_animatediff",
    modelName: "animatediff_v3",
    defaultGpuType: "h100_sxm",
    avgInferenceTimeSec: { min: 30, max: 90 },
    vramGb: 24,
    dockerImage: "awakli/animatediff:latest",
  },
  local_svd: {
    providerId: "local_svd",
    modelName: "svd_xt_11",
    defaultGpuType: "a100_80gb",
    avgInferenceTimeSec: { min: 20, max: 60 },
    vramGb: 16,
    dockerImage: "awakli/svd:latest",
  },
  local_rife: {
    providerId: "local_rife",
    modelName: "rife_v422",
    defaultGpuType: "rtx_4090",
    avgInferenceTimeSec: { min: 2, max: 5 },
    vramGb: 8,
    dockerImage: "awakli/rife:latest",
  },
  local_controlnet: {
    providerId: "local_controlnet",
    modelName: "controlnet_v11",
    defaultGpuType: "a100_80gb",
    avgInferenceTimeSec: { min: 5, max: 15 },
    vramGb: 12,
    dockerImage: "awakli/animatediff:latest", // shared container
  },
  local_ip_adapter: {
    providerId: "local_ip_adapter",
    modelName: "ip_adapter_faceid",
    defaultGpuType: "a100_80gb",
    avgInferenceTimeSec: { min: 8, max: 20 },
    vramGb: 14,
    dockerImage: "awakli/animatediff:latest", // shared container
  },
  local_realesrgan: {
    providerId: "local_realesrgan",
    modelName: "realesrgan_x4plus_anime",
    defaultGpuType: "rtx_4090",
    avgInferenceTimeSec: { min: 3, max: 8 },
    vramGb: 6,
    dockerImage: "awakli/realesrgan:latest",
  },
};
