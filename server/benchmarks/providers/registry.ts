/**
 * Benchmark Provider Registry
 *
 * Maps each benchmark provider to its API key env var and SDK configuration.
 * All credentials are resolved from environment variables — never hardcoded.
 */

export interface ProviderConfig {
  id: string;
  name: string;
  envKey: string;
  baseUrl?: string;
  sdkPackage?: string;
  notes: string;
}

export const BENCHMARK_PROVIDERS: Record<string, ProviderConfig> = {
  // --- Video Generation ---
  fal_ai: {
    id: "fal_ai",
    name: "fal.ai",
    envKey: "FAL_API_KEY",
    sdkPackage: "@fal-ai/client",
    notes: "Primary reseller. Kling V3, Wan 2.2, Hunyuan, LatentSync, MuseTalk.",
  },
  atlas_cloud: {
    id: "atlas_cloud",
    name: "Atlas Cloud",
    envKey: "ATLAS_CLOUD_API_KEY",
    baseUrl: "https://api.atlascloud.ai/v1",
    notes: "Kling reseller with 15% discount. Needs separate API key.",
  },
  kling_direct: {
    id: "kling_direct",
    name: "Kling Direct API",
    envKey: "KLING_ACCESS_KEY",
    baseUrl: "https://api.klingai.com",
    notes: "Direct Kling dev API. Requires KLING_ACCESS_KEY + KLING_SECRET_KEY.",
  },
  replicate: {
    id: "replicate",
    name: "Replicate",
    envKey: "REPLICATE_API_TOKEN",
    sdkPackage: "replicate",
    notes: "Wan 2.2, Hunyuan, MuseTalk. Bills by GPU time.",
  },
  hedra: {
    id: "hedra",
    name: "Hedra",
    envKey: "HEDRA_API_KEY",
    baseUrl: "https://api.hedra.com",
    notes: "Character-3 dialogue animation. Creator plan $30/mo, 5400 credits.",
  },

  // --- TTS ---
  elevenlabs: {
    id: "elevenlabs",
    name: "ElevenLabs",
    envKey: "ELEVENLABS_API_KEY",
    notes: "Voice cloning + TTS. Already integrated in Awakli.",
  },
  cartesia: {
    id: "cartesia",
    name: "Cartesia",
    envKey: "CARTESIA_API_KEY",
    baseUrl: "https://api.cartesia.ai",
    notes: "Sonic TTS. Lowest latency (~40ms).",
  },
  openai_tts: {
    id: "openai_tts",
    name: "OpenAI TTS",
    envKey: "OPENAI_API_KEY",
    notes: "Cheapest TTS baseline. tts-1 model.",
  },
};

/**
 * Check which providers have valid API keys configured.
 * Returns a map of provider ID → boolean (key present and non-empty).
 */
export function checkProviderCredentials(): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const [id, config] of Object.entries(BENCHMARK_PROVIDERS)) {
    const value = process.env[config.envKey];
    result[id] = Boolean(value && value.trim().length > 0);
  }
  return result;
}

/**
 * Get the API key for a provider. Throws if not configured.
 */
export function getProviderKey(providerId: string): string {
  const config = BENCHMARK_PROVIDERS[providerId];
  if (!config) throw new Error(`Unknown provider: ${providerId}`);
  const value = process.env[config.envKey];
  if (!value || value.trim().length === 0) {
    throw new Error(
      `API key not configured for ${config.name}. Set env var: ${config.envKey}`
    );
  }
  return value.trim();
}

/**
 * Providers that are already configured in Awakli's env (from webdev_request_secrets).
 */
export const PRE_CONFIGURED_PROVIDERS = [
  "fal_ai",       // FAL_API_KEY
  "kling_direct",  // KLING_ACCESS_KEY + KLING_SECRET_KEY
  "elevenlabs",    // ELEVENLABS_API_KEY
] as const;

/**
 * Providers that need NEW API keys provisioned before the benchmark.
 */
export const NEEDS_PROVISIONING = [
  "atlas_cloud",   // ATLAS_CLOUD_API_KEY
  "replicate",     // REPLICATE_API_TOKEN
  "hedra",         // HEDRA_API_KEY
  "cartesia",      // CARTESIA_API_KEY
  "openai_tts",    // OPENAI_API_KEY
] as const;
