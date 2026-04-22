/**
 * TopUpSheet — Standalone bottom sheet for credit top-up.
 *
 * Can be triggered independently from the UpgradeModal (e.g., from credit meter,
 * or inline in the wizard when credits run low).
 *
 * Uses the same Zustand store as UpgradeModal for consistency.
 */
import { motion, AnimatePresence } from "framer-motion";
import { Zap, X, Flame, Check, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useState } from "react";

// ─── Credit Pack Definitions (matching UpgradeModal) ────────────────────────
const CREDIT_PACKS = [
  { key: "spark",     name: "Spark",     credits: 100,   priceCents: 1500,  savings: null,      packSize: "small" as const },
  { key: "flame",     name: "Flame",     credits: 500,   priceCents: 6000,  savings: "20%",     packSize: "medium" as const },
  { key: "blaze",     name: "Blaze",     credits: 1500,  priceCents: 15000, savings: "33%",     packSize: "large" as const },
  { key: "inferno",   name: "Inferno",   credits: 5000,  priceCents: 40000, savings: "47%",     packSize: "large" as const },
  { key: "supernova", name: "Supernova", credits: 15000, priceCents: 97500, savings: "57%",     packSize: "large" as const },
];

interface TopUpSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional: pre-select a pack */
  defaultPack?: string;
}

export default function TopUpSheet({ isOpen, onClose, defaultPack }: TopUpSheetProps) {
  const [selectedPack, setSelectedPack] = useState<string | null>(defaultPack || null);
  const createPackCheckout = trpc.billing.createPackCheckout.useMutation();

  const handlePurchase = async () => {
    if (!selectedPack) return;
    const pack = CREDIT_PACKS.find((p) => p.key === selectedPack);
    if (!pack) return;

    try {
      emitAnalytics("topup_pack_confirm", { pack: selectedPack, credits: pack.credits });
      const result = await createPackCheckout.mutateAsync({
        packSize: pack.packSize,
      });
      if (result.url) {
        window.open(result.url, "_blank");
        toast.info("Redirecting to checkout — complete payment in the new tab.");
        onClose();
      }
    } catch (err: any) {
      toast.error(err.message || "Something went wrong. Please try again.");
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="topup-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[100] bg-ink/60 backdrop-blur-md"
          />

          {/* Sheet (slides up from bottom) */}
          <motion.div
            key="topup-sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-[101] max-h-[85vh] overflow-y-auto"
          >
            <div className="mx-auto max-w-lg rounded-t-2xl border border-white/10 border-b-0 bg-[#0D0D1A] shadow-[0_-24px_80px_rgba(124,77,255,0.28)]">
              {/* Handle bar */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-white/20" />
              </div>

              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="p-6">
                {/* Header */}
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-token-violet/20 to-token-magenta/20 flex items-center justify-center">
                    <Zap className="w-5 h-5 text-token-violet" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white/90">
                      Top up credits
                    </h2>
                    <p className="text-xs text-white/40">
                      Credits never expire while your subscription is active.
                    </p>
                  </div>
                </div>

                {/* Pack cards */}
                <div className="space-y-2 mt-5 mb-5">
                  {CREDIT_PACKS.map((pack) => {
                    const isSelected = selectedPack === pack.key;
                    const priceStr = `$${(pack.priceCents / 100).toFixed(0)}`;

                    return (
                      <button
                        key={pack.key}
                        onClick={() => setSelectedPack(pack.key)}
                        className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                          isSelected
                            ? "ring-2 ring-token-violet border-token-violet/40 bg-token-violet/5"
                            : "border-white/10 bg-white/[0.02] hover:border-white/20"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Flame
                              className={`w-4 h-4 ${
                                isSelected ? "text-token-violet" : "text-white/30"
                              }`}
                            />
                            <div>
                              <span className="font-semibold text-white/90 text-sm">
                                {pack.name}
                              </span>
                              <span className="text-white/30 text-xs ml-2">
                                {pack.credits.toLocaleString()} credits
                              </span>
                              {pack.savings && (
                                <span className="text-[10px] font-medium text-token-mint bg-token-mint/10 px-1.5 py-0.5 rounded-full ml-2">
                                  save {pack.savings}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white/80 text-sm">
                              {priceStr}
                            </span>
                            {isSelected && (
                              <div className="w-5 h-5 rounded-full bg-token-violet flex items-center justify-center">
                                <Check className="w-3 h-3 text-white" />
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* CTA */}
                <Button
                  onClick={handlePurchase}
                  disabled={!selectedPack || createPackCheckout.isPending}
                  className="w-full bg-gradient-to-r from-token-violet to-token-magenta text-white font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  {createPackCheckout.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Zap className="w-4 h-4 mr-2" />
                  )}
                  {selectedPack
                    ? `Buy ${CREDIT_PACKS.find((p) => p.key === selectedPack)?.credits.toLocaleString() || ""} credits`
                    : "Select a pack"}
                  {!createPackCheckout.isPending && (
                    <ArrowRight className="w-4 h-4 ml-2" />
                  )}
                </Button>

                <p className="text-center text-[11px] text-white/25 mt-3 pb-2">
                  One-time purchase. Credits are added immediately after payment.
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Analytics Helper ───────────────────────────────────────────────────────

function emitAnalytics(event: string, data?: Record<string, unknown>) {
  try {
    window.dispatchEvent(
      new CustomEvent("awakli:analytics", {
        detail: { event, ...data, timestamp: Date.now() },
      })
    );
  } catch {
    // Silently fail
  }
}
