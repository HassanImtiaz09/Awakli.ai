/**
 * Tier-gating tRPC middleware.
 *
 * Returns a tRPC middleware that checks the user's subscription tier
 * against a required capability from the shared TierMatrix.
 *
 * On denial it throws a TRPCError with:
 *   code: "FORBIDDEN" (closest standard code; client maps to 402 semantics)
 *   cause: "PAYMENT_REQUIRED" (custom discriminator for the client error link)
 *   data: { currentTier, required, upgradeSku, ctaText }
 *
 * Note: tRPC v11 does not have a PAYMENT_REQUIRED code, so we use FORBIDDEN
 * with a custom `cause` field that the client error link can detect.
 */
import { TRPCError } from "@trpc/server";
import { initTRPC } from "@trpc/server";
import type { TrpcContext } from "../_core/context";
import {
  type CapabilityKey,
  tierHasCapability,
  buildUpgradePayload,
} from "@shared/tierMatrix";
import { getUserSubscriptionTier } from "../db";

// ─── Upgrade Payload Type ───────────────────────────────────────────────────
export interface TierDeniedPayload {
  cause: "PAYMENT_REQUIRED";
  currentTier: string;
  required: string;
  requiredDisplayName: string;
  upgradeSku: string;
  ctaText: string;
  pricingUrl: string;
}

// ─── Middleware Factory ─────────────────────────────────────────────────────

const t = initTRPC.context<TrpcContext>().create();

/**
 * Creates a tRPC middleware that gates a procedure behind a capability check.
 *
 * Usage in routers.ts:
 *   import { requireCapability } from "./middleware/requireTier";
 *   const gatedProcedure = protectedProcedure.use(requireCapability("voice_cloning"));
 */
export function requireCapability(capability: CapabilityKey) {
  return t.middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Sign in to access this feature.",
      });
    }

    const userTier = await getUserSubscriptionTier(ctx.user.id);

    if (!tierHasCapability(userTier, capability)) {
      const payload = buildUpgradePayload(userTier, capability);

      throw new TRPCError({
        code: "FORBIDDEN",
        message: payload.ctaText || `This feature requires a ${payload.requiredDisplayName} subscription or higher.`,
        cause: {
          type: "PAYMENT_REQUIRED",
          ...payload,
        } satisfies { type: "PAYMENT_REQUIRED" } & typeof payload,
      });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
        userTier,
      },
    });
  });
}

/**
 * Creates a tRPC middleware that gates a procedure behind a minimum tier.
 *
 * This is a simpler alternative when you don't have a specific capability key
 * but know the minimum tier required.
 *
 * Usage:
 *   const gatedProcedure = protectedProcedure.use(requireMinTier("studio"));
 */
export function requireMinTier(minTier: string) {
  return t.middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Sign in to access this feature.",
      });
    }

    const { meetsMinTier, TIER_META } = await import("@shared/tierMatrix");
    const userTier = await getUserSubscriptionTier(ctx.user.id);

    if (!meetsMinTier(userTier, minTier)) {
      const meta = TIER_META[minTier as keyof typeof TIER_META];
      throw new TRPCError({
        code: "FORBIDDEN",
        message: meta?.ctaText || `This feature requires a ${minTier} subscription or higher.`,
        cause: {
          type: "PAYMENT_REQUIRED",
          currentTier: userTier,
          required: minTier,
          requiredDisplayName: meta?.displayName ?? minTier,
          upgradeSku: meta?.upgradeSku ?? "",
          ctaText: meta?.ctaText ?? "",
          pricingUrl: "/pricing",
        },
      });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
        userTier,
      },
    });
  });
}

/**
 * Helper to extract the PAYMENT_REQUIRED payload from a TRPCError.
 * Returns null if the error is not a tier-gating error.
 */
export function extractTierDeniedPayload(error: unknown): TierDeniedPayload | null {
  if (!(error instanceof TRPCError)) return null;
  const cause = error.cause as any;
  if (cause?.type === "PAYMENT_REQUIRED") {
    return {
      cause: "PAYMENT_REQUIRED",
      currentTier: cause.currentTier,
      required: cause.required,
      requiredDisplayName: cause.requiredDisplayName,
      upgradeSku: cause.upgradeSku,
      ctaText: cause.ctaText,
      pricingUrl: cause.pricingUrl,
    };
  }
  return null;
}
