/**
 * CreditPanel — Fixed bottom bar showing credit costs at a gate (Prompt 17)
 *
 * Displays: credits spent so far, credits this step cost, credits remaining
 * to complete episode, credits to regenerate this step.
 */

import { motion } from "framer-motion";
import { Coins, TrendingDown, RefreshCw, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface CreditPanelProps {
  creditsSpentSoFar: number;
  creditsToProceed: number;
  creditsToRegenerate: number;
  creditsSavedIfReject: number;
  userBalance?: number;
}

function CreditStat({ icon: Icon, label, value, color, subtext }: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
  subtext?: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", color)}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-[11px] text-gray-500 uppercase tracking-wider">{label}</p>
        <p className="text-sm font-bold text-white">{value.toFixed(1)} cr</p>
        {subtext && <p className="text-[10px] text-gray-600">{subtext}</p>}
      </div>
    </div>
  );
}

export function CreditPanel({
  creditsSpentSoFar,
  creditsToProceed,
  creditsToRegenerate,
  creditsSavedIfReject,
  userBalance,
}: CreditPanelProps) {
  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="bg-gray-900/80 backdrop-blur-sm border-t border-gray-800/50 px-6 py-3"
    >
      <div className="flex items-center justify-between max-w-5xl mx-auto">
        <CreditStat
          icon={Coins}
          label="Spent so far"
          value={creditsSpentSoFar}
          color="bg-gray-700/50 text-gray-300"
        />
        <CreditStat
          icon={ArrowRight}
          label="To proceed"
          value={creditsToProceed}
          color="bg-emerald-500/10 text-emerald-400"
        />
        <CreditStat
          icon={RefreshCw}
          label="To regenerate"
          value={creditsToRegenerate}
          color="bg-amber-500/10 text-amber-400"
        />
        <CreditStat
          icon={TrendingDown}
          label="Saved if reject"
          value={creditsSavedIfReject}
          color="bg-red-500/10 text-red-400"
        />
        {userBalance !== undefined && (
          <div className="pl-4 border-l border-gray-700/50">
            <p className="text-[11px] text-gray-500 uppercase tracking-wider">Balance</p>
            <p className="text-sm font-bold text-accent-cyan">{userBalance.toFixed(1)} cr</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
