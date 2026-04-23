/**
 * StoryboardCostBar — Sticky bottom bar showing total cost and proceed button
 *
 * Displays:
 * - Total estimated credits for all slices
 * - Approval progress
 * - "Proceed to Video Generation" button (enabled only when all approved)
 * - Credit balance warning if insufficient
 */

import { useMemo } from "react";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { AwakliButton } from "./AwakliButton";
import {
  Zap, Play, AlertTriangle, CheckCircle2, Loader2,
  ArrowRight, Coins,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface StoryboardCostBarProps {
  totalCredits: number;
  totalSlices: number;
  approvedCount: number;
  allApproved: boolean;
  onProceed?: () => void;
}

export function StoryboardCostBar({
  totalCredits,
  totalSlices,
  approvedCount,
  allApproved,
  onProceed,
}: StoryboardCostBarProps) {
  // Fetch user credit balance
  const balanceQuery = trpc.billing.getBalance.useQuery(undefined, {
    staleTime: 30_000,
  });

  const balance = balanceQuery.data?.availableBalance ?? 0;
  const hasEnoughCredits = balance >= totalCredits;
  const remainingSlices = totalSlices - approvedCount;

  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="fixed bottom-0 left-0 right-0 z-40 bg-[#0A0A14]/95 backdrop-blur-xl border-t border-white/5"
    >
      <div className="max-w-6xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between gap-6">
          {/* Left: Cost Summary */}
          <div className="flex items-center gap-6">
            {/* Total Cost */}
            <div>
              <p className="text-[10px] text-white/30 uppercase tracking-wider mb-0.5">Total Cost</p>
              <div className="flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-cyan-400" />
                <span className="text-xl font-bold text-cyan-400 font-mono">{totalCredits}</span>
                <span className="text-xs text-white/30">credits</span>
              </div>
            </div>

            {/* Divider */}
            <div className="w-px h-10 bg-white/5" />

            {/* Balance */}
            <div>
              <p className="text-[10px] text-white/30 uppercase tracking-wider mb-0.5">Your Balance</p>
              <div className="flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-amber-400" />
                <span className={cn(
                  "text-xl font-bold font-mono",
                  hasEnoughCredits ? "text-white/70" : "text-red-400"
                )}>
                  {balanceQuery.isLoading ? "..." : balance}
                </span>
                <span className="text-xs text-white/30">credits</span>
              </div>
            </div>

            {/* Divider */}
            <div className="w-px h-10 bg-white/5" />

            {/* Approval Progress */}
            <div>
              <p className="text-[10px] text-white/30 uppercase tracking-wider mb-0.5">Approved</p>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className={cn(
                  "w-4 h-4",
                  allApproved ? "text-emerald-400" : "text-white/20"
                )} />
                <span className="text-xl font-bold text-white/70 font-mono">
                  {approvedCount}/{totalSlices}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-3">
            {!hasEnoughCredits && !balanceQuery.isLoading && (
              <div className="flex items-center gap-2 text-amber-400 text-xs bg-amber-500/10 px-3 py-2 rounded-lg border border-amber-500/20">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>Need {totalCredits - balance} more credits</span>
              </div>
            )}

            {remainingSlices > 0 && (
              <span className="text-white/30 text-xs">
                {remainingSlices} slice{remainingSlices > 1 ? "s" : ""} remaining
              </span>
            )}

            <AwakliButton
              variant="primary"
              size="md"
              onClick={onProceed}
              disabled={!allApproved || !hasEnoughCredits}
              className={cn(
                allApproved && hasEnoughCredits
                  ? "bg-gradient-to-r from-[#E040FB] to-[#7C4DFF] shadow-lg shadow-[#7C4DFF]/20 hover:shadow-[#7C4DFF]/30"
                  : "opacity-50 cursor-not-allowed"
              )}
            >
              <Play className="w-4 h-4" />
              Proceed to Video Generation
              <ArrowRight className="w-4 h-4" />
            </AwakliButton>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
