/**
 * UpgradeModal — Global modal triggered by PAYMENT_REQUIRED tier-gating errors.
 *
 * Managed via a simple event bus so any component (tRPC error link, withTier HOC)
 * can open it without prop-drilling.
 */
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { Lock, Zap, X, Crown, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Event Bus ──────────────────────────────────────────────────────────────
export interface UpgradePayload {
  currentTier: string;
  required: string;
  requiredDisplayName: string;
  upgradeSku: string;
  ctaText: string;
  pricingUrl: string;
}

type Listener = (payload: UpgradePayload) => void;
const listeners = new Set<Listener>();

export const UpgradeModalBus = {
  open(payload: UpgradePayload) {
    listeners.forEach((fn) => fn(payload));
    // Analytics event
    try {
      window.dispatchEvent(
        new CustomEvent("awakli:analytics", {
          detail: { event: "tier_upgrade_cta_click", ...payload },
        })
      );
    } catch {}
  },
  subscribe(fn: Listener) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};

// ─── Modal Component ────────────────────────────────────────────────────────
export default function UpgradeModal() {
  const [payload, setPayload] = useState<UpgradePayload | null>(null);

  useEffect(() => {
    return UpgradeModalBus.subscribe((p) => setPayload(p));
  }, []);

  const close = useCallback(() => setPayload(null), []);

  return (
    <AnimatePresence>
      {payload && (
        <>
          {/* Backdrop */}
          <motion.div
            key="upgrade-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
          />

          {/* Panel */}
          <motion.div
            key="upgrade-panel"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-[101] flex items-center justify-center p-4"
          >
            <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#0D0D1A] shadow-2xl overflow-hidden">
              {/* Gradient accent bar */}
              <div className="h-1 bg-gradient-to-r from-token-violet via-token-cyan to-token-magenta" />

              {/* Close button */}
              <button
                onClick={close}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="p-8">
                {/* Icon */}
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-token-violet/20 to-token-cyan/20 border border-token-violet/20 flex items-center justify-center mb-6">
                  <Crown className="w-7 h-7 text-token-gold" />
                </div>

                {/* Title */}
                <h2 className="text-xl font-bold text-white/90 mb-2">
                  Upgrade to {payload.requiredDisplayName}
                </h2>

                {/* Description */}
                <p className="text-sm text-white/50 leading-relaxed mb-6">
                  {payload.ctaText ||
                    `This feature requires a ${payload.requiredDisplayName} subscription or higher.`}
                </p>

                {/* Feature highlights */}
                <div className="space-y-3 mb-8">
                  <FeatureRow icon={<Zap className="w-4 h-4" />} text="Unlock all gated features" />
                  <FeatureRow icon={<Lock className="w-4 h-4" />} text="Remove tier restrictions" />
                  <FeatureRow
                    icon={<Crown className="w-4 h-4" />}
                    text={`Everything in ${payload.requiredDisplayName} and below`}
                  />
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-3">
                  <Link href={payload.pricingUrl || "/pricing"}>
                    <Button
                      className="w-full bg-gradient-to-r from-token-violet to-token-cyan text-white font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity"
                      onClick={close}
                    >
                      View Plans
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    className="w-full text-white/40 hover:text-white/60"
                    onClick={close}
                  >
                    Maybe later
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function FeatureRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-white/60">
      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-token-cyan">
        {icon}
      </div>
      <span>{text}</span>
    </div>
  );
}
