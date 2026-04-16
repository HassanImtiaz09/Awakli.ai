/**
 * Seed Local Providers — Register 6 local providers in the providers table
 * Prompt 19: Hybrid Local/API Inference Infrastructure
 *
 * This module provides seed data for the providers table and
 * initial model artifact records. Run once during setup or migration.
 */
import { getDb } from "../../db";
import { providers, providerHealth } from "../../../drizzle/schema";
import { registerArtifact } from "./model-artifact-manager";
import { eq } from "drizzle-orm";

/** Provider seed data for all 6 local providers */
export const LOCAL_PROVIDER_SEEDS = [
  {
    id: "local_animatediff",
    displayName: "AnimateDiff v3 (Local)",
    vendor: "local",
    modality: "video" as const,
    tier: "budget" as const,
    capabilities: {
      maxDuration: 5,
      resolutions: ["480p", "512p", "768p"],
      imageToVideo: true,
      textToVideo: true,
      animeOptimized: true,
      formats: ["mp4"],
      fps: 8,
    },
    pricing: {
      unit: "gpu_second",
      rate: 0.000970, // H100 rate
      currency: "USD",
      marginMultiplier: 1.30,
      creditConversion: 0.55,
    },
    endpointUrl: "runpod://local_animatediff",
    authScheme: "bearer" as const,
    adapterClass: "LocalAnimateDiffAdapter",
  },
  {
    id: "local_svd",
    displayName: "SVD XT 1.1 (Local)",
    vendor: "local",
    modality: "video" as const,
    tier: "standard" as const,
    capabilities: {
      maxDuration: 4,
      resolutions: ["576p", "1024p"],
      imageToVideo: true,
      textToVideo: false,
      formats: ["mp4"],
      fps: 14,
    },
    pricing: {
      unit: "gpu_second",
      rate: 0.000456, // A100 rate
      currency: "USD",
      marginMultiplier: 1.30,
      creditConversion: 0.55,
    },
    endpointUrl: "runpod://local_svd",
    authScheme: "bearer" as const,
    adapterClass: "LocalSvdAdapter",
  },
  {
    id: "local_rife",
    displayName: "RIFE v4.22 (Local)",
    vendor: "local",
    modality: "video" as const,
    tier: "budget" as const,
    capabilities: {
      upscaleFactors: [2, 3, 4],
      maxOutputFps: 48,
      formats: ["mp4"],
    },
    pricing: {
      unit: "gpu_second",
      rate: 0.000192, // RTX 4090 rate
      currency: "USD",
      marginMultiplier: 1.30,
      creditConversion: 0.55,
    },
    endpointUrl: "runpod://local_rife",
    authScheme: "bearer" as const,
    adapterClass: "LocalRifeAdapter",
  },
  {
    id: "local_controlnet",
    displayName: "ControlNet v1.1 (Local)",
    vendor: "local",
    modality: "image" as const,
    tier: "standard" as const,
    capabilities: {
      maxResolution: "1024x1024",
      formats: ["png"],
      controlTypes: ["canny", "lineart", "lineart_anime", "depth"],
      animeOptimized: true,
    },
    pricing: {
      unit: "gpu_second",
      rate: 0.000456, // A100 rate
      currency: "USD",
      marginMultiplier: 1.30,
      creditConversion: 0.55,
    },
    endpointUrl: "runpod://local_controlnet",
    authScheme: "bearer" as const,
    adapterClass: "LocalControlNetAdapter",
  },
  {
    id: "local_ip_adapter",
    displayName: "IP-Adapter FaceID (Local)",
    vendor: "local",
    modality: "image" as const,
    tier: "standard" as const,
    capabilities: {
      maxResolution: "1024x1024",
      formats: ["png", "json"],
      variants: ["faceid", "plus", "full_face"],
      embeddingDim: 512,
      animeOptimized: true,
    },
    pricing: {
      unit: "gpu_second",
      rate: 0.000456, // A100 rate
      currency: "USD",
      marginMultiplier: 1.30,
      creditConversion: 0.55,
    },
    endpointUrl: "runpod://local_ip_adapter",
    authScheme: "bearer" as const,
    adapterClass: "LocalIpAdapterAdapter",
  },
  {
    id: "local_realesrgan",
    displayName: "Real-ESRGAN x4 Anime (Local)",
    vendor: "local",
    modality: "image" as const,
    tier: "budget" as const,
    capabilities: {
      upscaleFactors: [2, 4],
      maxOutput: "4K",
      formats: ["png"],
      animeOptimized: true,
    },
    pricing: {
      unit: "gpu_second",
      rate: 0.000192, // RTX 4090 rate
      currency: "USD",
      marginMultiplier: 1.30,
      creditConversion: 0.55,
    },
    endpointUrl: "runpod://local_realesrgan",
    authScheme: "bearer" as const,
    adapterClass: "LocalRealesrganAdapter",
  },
];

/** Initial model artifact records */
export const MODEL_ARTIFACT_SEEDS = [
  {
    modelName: "animatediff_v3",
    version: "v3.0.0",
    artifactPath: "awakli-model-artifacts/animatediff/v3.0.0/",
    sizeBytes: 8_589_934_592, // ~8GB
    checksumSha256: "placeholder_animatediff_v3_sha256",
    isActive: true,
  },
  {
    modelName: "svd_xt_11",
    version: "v1.1.0",
    artifactPath: "awakli-model-artifacts/svd/v1.1.0/",
    sizeBytes: 7_516_192_768, // ~7GB
    checksumSha256: "placeholder_svd_xt_11_sha256",
    isActive: true,
  },
  {
    modelName: "rife_v422",
    version: "v4.22.0",
    artifactPath: "awakli-model-artifacts/rife/v4.22.0/",
    sizeBytes: 1_073_741_824, // ~1GB
    checksumSha256: "placeholder_rife_v422_sha256",
    isActive: true,
  },
  {
    modelName: "controlnet_v11",
    version: "v1.1.0",
    artifactPath: "awakli-model-artifacts/controlnet/v1.1.0/",
    sizeBytes: 8_589_934_592, // ~8GB (shared with AnimateDiff container)
    checksumSha256: "placeholder_controlnet_v11_sha256",
    isActive: true,
  },
  {
    modelName: "ip_adapter_faceid",
    version: "v1.0.0",
    artifactPath: "awakli-model-artifacts/ip_adapter/v1.0.0/",
    sizeBytes: 8_589_934_592, // ~8GB (shared with AnimateDiff container)
    checksumSha256: "placeholder_ip_adapter_faceid_sha256",
    isActive: true,
  },
  {
    modelName: "realesrgan_x4plus_anime",
    version: "v0.4.0",
    artifactPath: "awakli-model-artifacts/realesrgan/v0.4.0/",
    sizeBytes: 536_870_912, // ~500MB
    checksumSha256: "placeholder_realesrgan_x4plus_sha256",
    isActive: true,
  },
];

/**
 * Seed all 6 local providers into the providers table.
 * Idempotent: skips if provider already exists.
 */
export async function seedLocalProviders(): Promise<{
  seeded: string[];
  skipped: string[];
  errors: string[];
}> {
  const db = await getDb();
  if (!db) return { seeded: [], skipped: [], errors: ["Database not available"] };

  const seeded: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  for (const seed of LOCAL_PROVIDER_SEEDS) {
    try {
      // Check if already exists
      const existing = await db
        .select({ id: providers.id })
        .from(providers)
        .where(eq(providers.id, seed.id))
        .limit(1);

      if (existing.length > 0) {
        skipped.push(seed.id);
        continue;
      }

      // Insert provider
      await db.insert(providers).values({
        id: seed.id,
        displayName: seed.displayName,
        vendor: seed.vendor,
        modality: seed.modality,
        tier: seed.tier,
        capabilities: seed.capabilities,
        pricing: seed.pricing,
        endpointUrl: seed.endpointUrl,
        authScheme: seed.authScheme,
        adapterClass: seed.adapterClass,
        status: "active",
      });

      // Insert provider_health record
      await db.insert(providerHealth).values({
        providerId: seed.id,
        circuitState: "closed",
        consecutiveFailures: 0,
      }).catch(() => {}); // Ignore if already exists

      seeded.push(seed.id);
    } catch (err) {
      errors.push(`${seed.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { seeded, skipped, errors };
}

/**
 * Seed model artifact records.
 * Idempotent: skips if artifact version already exists.
 */
export async function seedModelArtifacts(): Promise<{
  seeded: string[];
  skipped: string[];
  errors: string[];
}> {
  const seeded: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  for (const artifact of MODEL_ARTIFACT_SEEDS) {
    try {
      const { getArtifactByVersion } = await import("./model-artifact-manager");
      const existing = await getArtifactByVersion(artifact.modelName, artifact.version);
      if (existing) {
        skipped.push(`${artifact.modelName}@${artifact.version}`);
        continue;
      }

      await registerArtifact(artifact);
      seeded.push(`${artifact.modelName}@${artifact.version}`);
    } catch (err) {
      errors.push(`${artifact.modelName}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { seeded, skipped, errors };
}
