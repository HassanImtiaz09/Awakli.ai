import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

// ─── H-8: Tier-gated procedures ────────────────────────────────────────────
// Usage: requireTier("creator") returns a procedure that checks the user's
// subscription tier meets the minimum required level.
// @see shared/tiers.ts for the single source of truth (P2 dedup)

import { TIER_HIERARCHY, tierLevel } from "@shared/tiers";

/**
 * Creates a tRPC procedure that requires the user's subscription tier
 * to be at or above the specified minimum tier.
 *
 * Example: requireTier("creator") blocks free_trial users.
 * Example: requireTier("studio") blocks free_trial, creator, and creator_pro users.
 */
export function requireTier(minTier: string) {
  return protectedProcedure.use(
    t.middleware(async ({ ctx, next }) => {
      // Lazy import to avoid circular dependency
      const { getUserSubscriptionTier } = await import("../db");
      const userTier = await getUserSubscriptionTier(ctx.user!.id);

      if (tierLevel(userTier) < tierLevel(minTier)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `This feature requires a ${minTier} subscription or higher. Your current tier: ${userTier}.`,
        });
      }

      return next({
        ctx: {
          ...ctx,
          user: ctx.user,
          userTier,
        },
      });
    }),
  );
}

// Pre-built tier-gated procedures for common use
export const creatorProcedure = requireTier("creator");
export const creatorProProcedure = requireTier("creator_pro");
export const studioProcedure = requireTier("studio");
export const enterpriseProcedure = requireTier("enterprise");

// Re-export tier hierarchy for testing and downstream consumers
export { TIER_HIERARCHY, tierLevel };
