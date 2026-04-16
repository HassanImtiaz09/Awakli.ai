/**
 * Credit-Integrated Executor
 *
 * Wraps the raw executor with the credit gateway lifecycle:
 *   1. Map generation request to a GenerationAction
 *   2. authorizeAndHold → get ticket
 *   3. Execute via provider executor
 *   4. On success: commitTicket with actual cost
 *   5. On failure: releaseTicket (refund hold)
 *
 * This is the public API that all generation callers should use.
 */
import { generate } from "./executor";
import { estimateCost } from "./cost-estimator";
import {
  authorizeAndHold,
  commitTicket,
  releaseTicket,
  type GenerationAction,
  type AuthorizationMeta,
  type HoldTicket,
  type AuthorizationResult,
} from "../credit-gateway";
import type {
  GenerateRequest,
  GenerateResult,
  Modality,
  ProviderTier,
  VideoParams,
} from "./types";
import { ProviderError, usdToCredits } from "./types";

export interface CreditGenerateResult extends GenerateResult {
  creditsConsumed: number;
  holdId: string;
}

/**
 * Map a generation request to a credit gateway GenerationAction.
 */
export function mapToAction(request: GenerateRequest): GenerationAction {
  const { type, tier, params } = request;

  switch (type) {
    case "video": {
      const vp = params as VideoParams;
      const duration = vp.durationSeconds ?? 5;
      const durKey = duration <= 5 ? "5s" : "10s";
      const tierKey = tier === "flagship" ? "premium" : tier;
      return `video_${durKey}_${tierKey}` as GenerationAction;
    }
    case "voice":
      return "voice_synthesis";
    case "music":
      return "music_generation";
    case "image":
      return "panel_generation";
    default:
      return "panel_generation";
  }
}

/**
 * Generate content with full credit lifecycle management.
 *
 * This is the main entry point for all generation calls.
 * It handles: authorization → hold → execute → commit/release.
 */
export async function generateWithCredits(
  request: GenerateRequest,
): Promise<CreditGenerateResult> {
  const action = mapToAction(request);

  // 1. Authorize and hold credits
  let ticket: HoldTicket;
  if (request.holdId) {
    // Caller already placed a hold (e.g., batch processing)
    ticket = {
      holdId: request.holdId,
      userId: request.userId,
      creditsHeld: 0, // Will be resolved from existing hold
      action,
      createdAt: Date.now(),
    };
  } else {
    const meta: AuthorizationMeta = {
      episodeId: request.episodeId,
      provider: request.providerHint,
      modelTier: request.tier,
      description: `${request.type} generation`,
    };

    const authResult: AuthorizationResult = await authorizeAndHold(
      request.userId,
      action,
      meta,
    );

    if (!authResult.authorized || !authResult.ticket) {
      throw new ProviderError(
        "INSUFFICIENT_CREDITS",
        authResult.error ?? "Insufficient credits",
        "credit-gateway",
        false,
        false,
      );
    }

    ticket = authResult.ticket;
  }

  // 2. Execute generation
  try {
    const result = await generate(request);

    // 3. On success: commit the hold
    await commitTicket(ticket, {
      provider: result.providerId,
      modelName: result.providerId,
      modelTier: request.tier,
      usdCostCents: Math.round(result.actualCostUsd * 100),
      apiCallType: action,
    });

    return {
      ...result,
      creditsConsumed: ticket.creditsHeld || result.actualCostCredits,
      holdId: ticket.holdId,
    };
  } catch (err) {
    // 4. On failure: release the hold (refund credits)
    try {
      await releaseTicket(ticket, err instanceof Error ? err.message : "Generation failed");
    } catch (releaseErr) {
      console.error("[CreditExecutor] Failed to release hold:", releaseErr);
      // Don't mask the original error
    }
    throw err;
  }
}

/**
 * Check if a user can afford a generation request without executing it.
 * Returns the estimated cost and whether the user has sufficient credits.
 */
export async function checkAffordability(
  request: GenerateRequest,
): Promise<{
  canAfford: boolean;
  estimatedCredits: number;
  estimatedUsd: number;
  action: GenerationAction;
}> {
  const action = mapToAction(request);
  const { canAfford: canAffordFn, getCreditCost } = await import("../credit-gateway");
  const result = await canAffordFn(request.userId, action);
  const creditCost = getCreditCost(action);
  return {
    canAfford: result.affordable,
    estimatedCredits: creditCost,
    estimatedUsd: creditCost * 0.55,
    action,
  };
}
