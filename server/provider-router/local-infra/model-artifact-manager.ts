/**
 * Model Artifact Manager — Versioned model weights in object storage
 * Prompt 19: Hybrid Local/API Inference Infrastructure
 *
 * Manages model artifact lifecycle: version resolution, activation,
 * deployment verification, and drift detection.
 */
import { getDb } from "../../db";
import { eq, and, desc } from "drizzle-orm";
import { modelArtifacts, localEndpoints } from "../../../drizzle/schema";
import type { ModelArtifactInfo, EndpointInfo, InferencePlatform, GpuType, ScalingConfig } from "./types";

// ─── Model Artifact Queries ─────────────────────────────────────────────

/**
 * Get the currently active artifact for a model.
 * Only one version can be active per model at a time.
 */
export async function getActiveArtifact(modelName: string): Promise<ModelArtifactInfo | null> {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select()
    .from(modelArtifacts)
    .where(and(
      eq(modelArtifacts.modelName, modelName),
      eq(modelArtifacts.isActive, 1),
    ))
    .limit(1);

  if (rows.length === 0) return null;
  return rowToArtifactInfo(rows[0]);
}

/**
 * Get a specific artifact by model name and version.
 */
export async function getArtifactByVersion(modelName: string, version: string): Promise<ModelArtifactInfo | null> {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select()
    .from(modelArtifacts)
    .where(and(
      eq(modelArtifacts.modelName, modelName),
      eq(modelArtifacts.version, version),
    ))
    .limit(1);

  if (rows.length === 0) return null;
  return rowToArtifactInfo(rows[0]);
}

/**
 * List all artifacts for a model, ordered by creation date (newest first).
 */
export async function listArtifacts(modelName?: string): Promise<ModelArtifactInfo[]> {
  const db = await getDb();
  if (!db) return [];

  const query = modelName
    ? db.select().from(modelArtifacts).where(eq(modelArtifacts.modelName, modelName)).orderBy(desc(modelArtifacts.createdAt))
    : db.select().from(modelArtifacts).orderBy(desc(modelArtifacts.createdAt));

  const rows = await query;
  return rows.map(rowToArtifactInfo);
}

/**
 * Activate a specific artifact version, deactivating all others for that model.
 * Returns true if activation succeeded.
 */
export async function activateArtifactVersion(modelName: string, version: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Verify the target version exists
  const target = await getArtifactByVersion(modelName, version);
  if (!target) return false;

  // Deactivate all versions for this model
  await db
    .update(modelArtifacts)
    .set({ isActive: 0 })
    .where(eq(modelArtifacts.modelName, modelName));

  // Activate the target version
  await db
    .update(modelArtifacts)
    .set({ isActive: 1 })
    .where(and(
      eq(modelArtifacts.modelName, modelName),
      eq(modelArtifacts.version, version),
    ));

  return true;
}

/**
 * Register a new model artifact.
 */
export async function registerArtifact(artifact: {
  modelName: string;
  version: string;
  artifactPath: string;
  sizeBytes: number;
  checksumSha256: string;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // If this is being set as active, deactivate others first
  if (artifact.isActive) {
    await db
      .update(modelArtifacts)
      .set({ isActive: 0 })
      .where(eq(modelArtifacts.modelName, artifact.modelName));
  }

  const result = await db.insert(modelArtifacts).values({
    modelName: artifact.modelName,
    version: artifact.version,
    artifactPath: artifact.artifactPath,
    sizeBytes: artifact.sizeBytes,
    checksumSha256: artifact.checksumSha256,
    isActive: artifact.isActive ? 1 : 0,
    metadata: artifact.metadata ?? null,
  });

  return result[0].insertId;
}

// ─── Local Endpoint Queries ─────────────────────────────────────────────

/**
 * Get the active endpoint for a provider.
 */
export async function getActiveEndpoint(providerId: string): Promise<EndpointInfo | null> {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select()
    .from(localEndpoints)
    .where(and(
      eq(localEndpoints.providerId, providerId),
      eq(localEndpoints.status, "active"),
    ))
    .limit(1);

  if (rows.length === 0) return null;
  return rowToEndpointInfo(rows[0]);
}

/**
 * List all endpoints, optionally filtered by provider.
 */
export async function listEndpoints(providerId?: string): Promise<EndpointInfo[]> {
  const db = await getDb();
  if (!db) return [];

  const query = providerId
    ? db.select().from(localEndpoints).where(eq(localEndpoints.providerId, providerId))
    : db.select().from(localEndpoints);

  const rows = await query;
  return rows.map(rowToEndpointInfo);
}

/**
 * Update endpoint metrics (warm workers, queue depth).
 */
export async function updateEndpointMetrics(
  endpointDbId: number,
  metrics: { warmWorkers?: number; queueDepth?: number; status?: "active" | "draining" | "disabled" },
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const updates: Record<string, unknown> = {};
  if (metrics.warmWorkers !== undefined) updates.warmWorkers = metrics.warmWorkers;
  if (metrics.queueDepth !== undefined) updates.queueDepth = metrics.queueDepth;
  if (metrics.status !== undefined) updates.status = metrics.status;

  if (Object.keys(updates).length > 0) {
    await db
      .update(localEndpoints)
      .set(updates)
      .where(eq(localEndpoints.id, endpointDbId));
  }
}

/**
 * Register a new local endpoint.
 */
export async function registerEndpoint(endpoint: {
  providerId: string;
  platform: InferencePlatform;
  endpointId: string;
  endpointUrl: string;
  gpuType: GpuType;
  modelArtifactId?: number;
  scalingConfig: ScalingConfig;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(localEndpoints).values({
    providerId: endpoint.providerId,
    platform: endpoint.platform,
    endpointId: endpoint.endpointId,
    endpointUrl: endpoint.endpointUrl,
    gpuType: endpoint.gpuType,
    modelArtifactId: endpoint.modelArtifactId ?? null,
    scalingConfig: endpoint.scalingConfig,
    status: "active",
    warmWorkers: 0,
    queueDepth: 0,
  });

  return result[0].insertId;
}

// ─── Drift Detection ────────────────────────────────────────────────────

/**
 * Check for model version drift: running version != active version.
 * Returns list of endpoints with drift.
 */
export async function checkVersionDrift(): Promise<Array<{
  endpointId: number;
  providerId: string;
  deployedArtifactId: number | null;
  activeArtifactId: number | null;
  activeVersion: string | null;
}>> {
  const endpoints = await listEndpoints();
  const driftList: Array<{
    endpointId: number;
    providerId: string;
    deployedArtifactId: number | null;
    activeArtifactId: number | null;
    activeVersion: string | null;
  }> = [];

  for (const ep of endpoints) {
    if (ep.status === "disabled") continue;

    // Find the model name for this provider
    const modelName = providerToModelName(ep.providerId);
    if (!modelName) continue;

    const activeArtifact = await getActiveArtifact(modelName);
    if (!activeArtifact) continue;

    if (ep.modelArtifactId !== activeArtifact.id) {
      driftList.push({
        endpointId: ep.id,
        providerId: ep.providerId,
        deployedArtifactId: ep.modelArtifactId,
        activeArtifactId: activeArtifact.id,
        activeVersion: activeArtifact.version,
      });
    }
  }

  return driftList;
}

// ─── Helpers ────────────────────────────────────────────────────────────

function providerToModelName(providerId: string): string | null {
  const map: Record<string, string> = {
    local_animatediff: "animatediff_v3",
    local_svd: "svd_xt_11",
    local_rife: "rife_v422",
    local_controlnet: "controlnet_v11",
    local_ip_adapter: "ip_adapter_faceid",
    local_realesrgan: "realesrgan_x4plus_anime",
  };
  return map[providerId] ?? null;
}

function rowToArtifactInfo(row: typeof modelArtifacts.$inferSelect): ModelArtifactInfo {
  return {
    id: row.id,
    modelName: row.modelName,
    version: row.version,
    artifactPath: row.artifactPath,
    sizeBytes: row.sizeBytes,
    checksumSha256: row.checksumSha256,
    isActive: row.isActive === 1,
    metadata: (row.metadata as Record<string, unknown>) ?? null,
  };
}

function rowToEndpointInfo(row: typeof localEndpoints.$inferSelect): EndpointInfo {
  return {
    id: row.id,
    providerId: row.providerId,
    platform: row.platform as InferencePlatform,
    endpointId: row.endpointId,
    endpointUrl: row.endpointUrl,
    gpuType: row.gpuType as GpuType,
    modelArtifactId: row.modelArtifactId,
    scalingConfig: row.scalingConfig as ScalingConfig,
    status: row.status as "active" | "draining" | "disabled",
    warmWorkers: row.warmWorkers,
    queueDepth: row.queueDepth,
  };
}
