/**
 * tRPC Error Link — Catches PAYMENT_REQUIRED (tier-gating) and
 * insufficient_credits errors and opens the UpgradeModal automatically.
 *
 * Wire this into the tRPC client link chain in lib/trpc.ts.
 */
import { TRPCClientError } from "@trpc/client";
import { UpgradeModalBus, type UpgradePayload } from "@/components/awakli/UpgradeModal";

/**
 * Check if a tRPC error is a tier-gating PAYMENT_REQUIRED error.
 * If so, extract the payload and open the UpgradeModal.
 *
 * Call this in your tRPC error handlers or in a global onError callback.
 */
export function handleTierError(error: unknown): boolean {
  if (!(error instanceof TRPCClientError)) return false;

  // The server sends cause as a JSON object in the error shape
  const data = error.data as any;
  const cause = error.shape?.data?.cause ?? data?.cause;

  // Check for our custom PAYMENT_REQUIRED cause (tier gating)
  if (cause?.type === "PAYMENT_REQUIRED") {
    const payload: UpgradePayload = {
      currentTier: cause.currentTier ?? "free_trial",
      required: cause.required ?? "creator",
      requiredDisplayName: cause.requiredDisplayName ?? "Mangaka",
      upgradeSku: cause.upgradeSku ?? "",
      ctaText: cause.ctaText ?? "",
      pricingUrl: cause.pricingUrl ?? "/pricing",
    };
    UpgradeModalBus.open(payload);
    return true;
  }

  // Check for insufficient_credits errors → open Top-up tab
  if (
    error.message?.includes("insufficient_credits") ||
    error.message?.includes("Insufficient credits") ||
    cause?.type === "INSUFFICIENT_CREDITS"
  ) {
    UpgradeModalBus.openCredits();
    return true;
  }

  // Also check the error message for FORBIDDEN errors that look like tier gates
  if (error.data?.code === "FORBIDDEN" && error.message?.includes("subscription")) {
    UpgradeModalBus.open({
      currentTier: "free_trial",
      required: "creator",
      requiredDisplayName: "Mangaka",
      upgradeSku: "",
      ctaText: error.message,
      pricingUrl: "/pricing",
    });
    return true;
  }

  return false;
}
