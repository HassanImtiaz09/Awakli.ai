/**
 * useTierGate — Client-side hook for checking tier capabilities.
 *
 * Fetches the user's subscription tier via billing.getSubscription
 * and checks it against the shared TierMatrix.
 */
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  type CapabilityKey,
  type TierName,
  tierHasCapability,
  buildUpgradePayload,
  meetsMinTier,
  TIER_META,
} from "@shared/tierMatrix";

export type TierGateResult = {
  /** Whether the user's tier meets the requirement */
  allowed: boolean;
  /** The user's current tier (defaults to "free_trial" if unknown) */
  userTier: string;
  /** Display name of the user's tier */
  userTierDisplayName: string;
  /** Whether the tier data is still loading */
  isLoading: boolean;
  /** Upgrade payload if denied (null if allowed) */
  upgradePayload: ReturnType<typeof buildUpgradePayload> | null;
};

/**
 * Hook to check if the current user's tier has a specific capability.
 */
export function useTierGate(capability: CapabilityKey): TierGateResult {
  const { user } = useAuth();

  const { data: subData, isLoading } = trpc.billing.getSubscription.useQuery(undefined, {
    enabled: !!user,
    staleTime: 60_000,
    retry: false,
  });

  const userTier = (subData?.tier as string) ?? "free_trial";
  const allowed = tierHasCapability(userTier, capability);
  const meta = TIER_META[userTier as TierName];

  return {
    allowed,
    userTier,
    userTierDisplayName: meta?.displayName ?? "Apprentice",
    isLoading,
    upgradePayload: allowed ? null : buildUpgradePayload(userTier, capability),
  };
}

/**
 * Hook to check if the user meets a minimum tier level.
 */
export function useMinTierGate(minTier: TierName): TierGateResult {
  const { user } = useAuth();

  const { data: subData, isLoading } = trpc.billing.getSubscription.useQuery(undefined, {
    enabled: !!user,
    staleTime: 60_000,
    retry: false,
  });

  const userTier = (subData?.tier as string) ?? "free_trial";
  const allowed = meetsMinTier(userTier, minTier);
  const meta = TIER_META[userTier as TierName];

  return {
    allowed,
    userTier,
    userTierDisplayName: meta?.displayName ?? "Apprentice",
    isLoading,
    upgradePayload: allowed
      ? null
      : {
          currentTier: userTier,
          required: minTier,
          requiredDisplayName: TIER_META[minTier]?.displayName ?? minTier,
          upgradeSku: TIER_META[minTier]?.upgradeSku ?? "",
          ctaText: TIER_META[minTier]?.ctaText ?? "",
          pricingUrl: "/pricing",
        },
  };
}
