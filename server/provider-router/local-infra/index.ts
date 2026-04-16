/**
 * Local Infrastructure — Barrel export
 * Prompt 19: Hybrid Local/API Inference Infrastructure
 */

// Types & constants
export * from "./types";

// GPU Platform Clients
export { RunPodClient, runpodClient } from "./runpod-client";
export { ModalClient, modalClient } from "./modal-client";

// GPU Cost Model
export {
  estimateGpuCost,
  estimateInferenceTime,
  estimateLocalProviderCost,
  calculateActualCost,
  compareCosts,
  type GpuCostEstimate,
} from "./gpu-cost-model";

// Model Artifact Manager
export {
  getActiveArtifact,
  getArtifactByVersion,
  listArtifacts,
  activateArtifactVersion,
  registerArtifact,
  getActiveEndpoint,
  listEndpoints,
  updateEndpointMetrics,
  registerEndpoint,
  checkVersionDrift,
} from "./model-artifact-manager";

// GPU Usage Logger
export {
  logGpuUsage,
  getGpuCostSummary24h,
  getTotalGpuSpend,
  type GpuUsageEntry,
} from "./gpu-usage-logger";

// Fallback Mapping
export {
  getFallbackChain,
  getFallbackProviderIds,
  isLocalProvider,
  canSkipOnFailure,
  LOCAL_FALLBACK_MAP,
  type FallbackChain,
  type FallbackEntry,
} from "./fallback-map";

// Base Local Adapter Factory
export { createLocalAdapter, type LocalAdapterConfig } from "./base-local-adapter";

// Seed Data
export {
  seedLocalProviders,
  seedModelArtifacts,
  LOCAL_PROVIDER_SEEDS,
  MODEL_ARTIFACT_SEEDS,
} from "./seed-local-providers";

// GPU Health Monitor
export {
  runMonitorCycle,
  startGpuMonitor,
  stopGpuMonitor,
  getLastMonitorReport,
  isMonitorRunning,
  MONITOR_CONFIG,
  type MonitorReport,
  type MonitorAlert,
  type HealthCheckResult,
} from "./gpu-health-monitor";
