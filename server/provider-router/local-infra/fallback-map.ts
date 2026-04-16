/**
 * Fallback Mapping — Local → API fallback chains per provider
 * Prompt 19: Hybrid Local/API Inference Infrastructure
 *
 * When a local provider's circuit opens or queue overloads,
 * the router falls back through this chain to API providers.
 *
 * "skip" entries mean the operation degrades gracefully:
 *   - RIFE: serve at lower fps (no interpolation)
 *   - IP-Adapter: use text prompt only (no character conditioning)
 *   - Real-ESRGAN: serve at native resolution (no upscale)
 */

export interface FallbackEntry {
  /** The API provider to fall back to */
  providerId: string;
  /** Human-readable reason for this fallback */
  reason: string;
}

export interface FallbackChain {
  /** The local provider this chain belongs to */
  localProviderId: string;
  /** Ordered list of fallback providers (try in order) */
  fallbacks: FallbackEntry[];
  /** If true, the operation can be skipped entirely (graceful degradation) */
  canSkip: boolean;
  /** Description of what happens when skipped */
  skipBehavior?: string;
}

/**
 * Fallback mapping from Prompt 19 specification.
 * Each local provider has an ordered chain of API fallbacks.
 */
export const LOCAL_FALLBACK_MAP: Record<string, FallbackChain> = {
  local_animatediff: {
    localProviderId: "local_animatediff",
    fallbacks: [
      { providerId: "wan_21", reason: "Wan 2.1 API — high-quality anime video generation" },
      { providerId: "hailuo_director", reason: "Hailuo Director — alternative video generation" },
      { providerId: "pika_22", reason: "Pika 2.2 — general video generation" },
    ],
    canSkip: false,
  },

  local_svd: {
    localProviderId: "local_svd",
    fallbacks: [
      { providerId: "wan_21", reason: "Wan 2.1 img2vid mode — image-to-video generation" },
      { providerId: "pika_22", reason: "Pika 2.2 img2vid — alternative image-to-video" },
    ],
    canSkip: false,
  },

  local_rife: {
    localProviderId: "local_rife",
    fallbacks: [],
    canSkip: true,
    skipBehavior: "Degrade to lower fps — serve video without frame interpolation",
  },

  local_controlnet: {
    localProviderId: "local_controlnet",
    fallbacks: [
      { providerId: "flux_11_pro", reason: "Flux Pro — prompt-guided generation as structural substitute" },
      { providerId: "recraft_v3", reason: "Recraft v3 — alternative image generation" },
    ],
    canSkip: false,
  },

  local_ip_adapter: {
    localProviderId: "local_ip_adapter",
    fallbacks: [],
    canSkip: true,
    skipBehavior: "Skip character conditioning — use text prompt only for generation",
  },

  local_realesrgan: {
    localProviderId: "local_realesrgan",
    fallbacks: [],
    canSkip: true,
    skipBehavior: "Serve at native resolution — no upscaling applied",
  },
};

/**
 * Get the fallback chain for a local provider.
 */
export function getFallbackChain(localProviderId: string): FallbackChain | null {
  return LOCAL_FALLBACK_MAP[localProviderId] ?? null;
}

/**
 * Get the ordered list of fallback provider IDs for a local provider.
 * Returns empty array if no fallbacks configured.
 */
export function getFallbackProviderIds(localProviderId: string): string[] {
  const chain = LOCAL_FALLBACK_MAP[localProviderId];
  if (!chain) return [];
  return chain.fallbacks.map(f => f.providerId);
}

/**
 * Check if a provider is a local provider with fallback support.
 */
export function isLocalProvider(providerId: string): boolean {
  return providerId.startsWith("local_");
}

/**
 * Check if a local provider's operation can be skipped on failure.
 */
export function canSkipOnFailure(localProviderId: string): boolean {
  const chain = LOCAL_FALLBACK_MAP[localProviderId];
  return chain?.canSkip ?? false;
}
