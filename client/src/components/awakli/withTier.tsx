/**
 * withTier — Higher-Order Component for client-side tier gating.
 *
 * Three modes:
 *   Allow      → render children normally
 *   Deny-soft  → render children with .tier-locked class; CTAs show lock icon, click opens UpgradeModal
 *   Deny-hard  → replace children entirely with <TierGate /> CTA card
 *
 * @example
 *   // Deny-soft: dim the section, lock icon on CTAs
 *   <WithTier capability="voice_cloning" mode="soft">
 *     <VoiceCloningPanel />
 *   </WithTier>
 *
 *   // Deny-hard: replace entire page with upgrade card
 *   <WithTier capability="stage_video" mode="hard">
 *     <VideoStage />
 *   </WithTier>
 */
import React, { useEffect } from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { Lock, Crown, ArrowRight, Zap, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTierGate, type TierGateResult } from "@/hooks/useTierGate";
import { UpgradeModalBus, type UpgradePayload } from "./UpgradeModal";
import type { CapabilityKey } from "@shared/tierMatrix";

// ─── Props ──────────────────────────────────────────────────────────────────
export interface WithTierProps {
  /** The capability to check against the user's tier */
  capability: CapabilityKey;
  /** Gating mode: "soft" dims children + lock overlay, "hard" replaces with CTA card */
  mode?: "soft" | "hard";
  /** Optional: override the min tier tooltip text */
  tooltipText?: string;
  /** Children to render (or gate) */
  children: React.ReactNode;
}

// ─── Analytics Helper ───────────────────────────────────────────────────────
function emitTierEvent(event: string, detail?: Record<string, unknown>) {
  try {
    window.dispatchEvent(
      new CustomEvent("awakli:analytics", { detail: { event, ...detail } })
    );
  } catch {}
}

// ─── Main Component ─────────────────────────────────────────────────────────
export function WithTier({
  capability,
  mode = "soft",
  tooltipText,
  children,
}: WithTierProps) {
  const gate = useTierGate(capability);

  // Emit analytics when gate is shown
  useEffect(() => {
    if (!gate.isLoading && !gate.allowed) {
      emitTierEvent("tier_gate_shown", {
        capability,
        mode,
        userTier: gate.userTier,
        required: gate.upgradePayload?.required,
      });
    }
  }, [gate.isLoading, gate.allowed, capability, mode, gate.userTier, gate.upgradePayload?.required]);

  // Loading state — show skeleton
  if (gate.isLoading) {
    return <div className="animate-pulse opacity-50">{children}</div>;
  }

  // Allowed — render normally
  if (gate.allowed) {
    return <>{children}</>;
  }

  // Denied
  if (mode === "hard") {
    return (
      <TierGateCard
        gate={gate}
        capability={capability}
      />
    );
  }

  // Deny-soft
  return (
    <DenySoftWrapper
      gate={gate}
      capability={capability}
      tooltipText={tooltipText}
    >
      {children}
    </DenySoftWrapper>
  );
}

// ─── Deny-Soft Wrapper ─────────────────────────────────────────────────────
function DenySoftWrapper({
  gate,
  capability,
  tooltipText,
  children,
}: {
  gate: TierGateResult;
  capability: CapabilityKey;
  tooltipText?: string;
  children: React.ReactNode;
}) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    emitTierEvent("tier_gate_denied", {
      capability,
      userTier: gate.userTier,
      required: gate.upgradePayload?.required,
    });
    if (gate.upgradePayload) {
      UpgradeModalBus.open(gate.upgradePayload);
    }
  };

  const tooltip = tooltipText ?? `Available on ${gate.upgradePayload?.requiredDisplayName ?? "Mangaka"}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="tier-locked"
          onClick={handleClick}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              handleClick(e as any);
            }
          }}
        >
          {children}

          {/* Lock badge overlay */}
          <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 border border-white/10 backdrop-blur-sm">
            <Lock className="w-3 h-3 text-token-gold" />
            <span className="text-[10px] font-medium text-white/60">
              {gate.upgradePayload?.requiredDisplayName ?? "Upgrade"}
            </span>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="bg-[#1A1A2E] border-white/10 text-white/80 text-xs"
      >
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Deny-Hard: TierGate CTA Card ──────────────────────────────────────────
export function TierGateCard({
  gate,
  capability,
}: {
  gate: TierGateResult;
  capability: CapabilityKey;
}) {
  const payload = gate.upgradePayload;
  const requiredName = payload?.requiredDisplayName ?? "Studio";

  const handleUpgradeClick = () => {
    emitTierEvent("tier_upgrade_cta_click", {
      capability,
      userTier: gate.userTier,
      required: payload?.required,
    });
    if (payload) {
      UpgradeModalBus.open(payload);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex items-center justify-center min-h-[60vh] px-4"
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-gradient-to-br from-[#0D0D1A] to-[#12122A] overflow-hidden">
        {/* Decorative gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-token-violet/5 via-transparent to-token-magenta/5 pointer-events-none" />

        <div className="relative p-10 text-center">
          {/* Icon */}
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
            className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-token-violet/20 to-token-cyan/20 border border-token-violet/20 flex items-center justify-center"
          >
            <Lock className="w-9 h-9 text-token-gold" />
          </motion.div>

          {/* Title — exact copy from spec */}
          <h2 className="text-2xl font-bold text-white/90 mb-3">
            This stage is part of the {requiredName} tier
          </h2>

          {/* Description */}
          <p className="text-sm text-white/40 leading-relaxed mb-8 max-w-sm mx-auto">
            Upgrade your subscription to unlock this stage and continue
            your creative pipeline.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap justify-center gap-2 mb-8">
            <FeaturePill icon={<Sparkles className="w-3 h-3" />} text="Full pipeline access" />
            <FeaturePill icon={<Zap className="w-3 h-3" />} text="Priority generation" />
            <FeaturePill icon={<Crown className="w-3 h-3" />} text="Premium models" />
          </div>

          {/* CTA */}
          <div className="flex flex-col items-center gap-3">
            <Button
              onClick={handleUpgradeClick}
              className="px-8 py-3 bg-gradient-to-r from-token-violet to-token-cyan text-white font-semibold rounded-xl hover:opacity-90 transition-opacity"
            >
              Upgrade to {requiredName}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>

            <Link
              href="/pricing"
              className="text-xs text-white/30 hover:text-white/50 transition-colors"
            >
              Compare all plans
            </Link>
          </div>

          {/* Soft CTA hover text — exact copy from spec */}
          <p className="mt-6 text-xs text-white/20">
            {payload?.ctaText ?? `Unlock with ${requiredName} — from $19/mo`}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function FeaturePill({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/5 text-[11px] text-white/50">
      {icon}
      {text}
    </span>
  );
}

// ─── Default Export ─────────────────────────────────────────────────────────
export default WithTier;
