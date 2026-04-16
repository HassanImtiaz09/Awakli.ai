/**
 * PendingGatesBanner — Studio Dashboard Gate Status Indicator
 *
 * Shows a prominent alert banner when pipelines are paused at blocking gates,
 * with per-gate cards linking directly to the GateReview page.
 * Includes a pulsing notification dot, timeout countdown, and gate type badges.
 */

import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle, Clock, Shield, Eye, Radio, ArrowRight,
  ChevronDown, ChevronUp, ExternalLink,
} from "lucide-react";
import React, { useState, useEffect, useMemo } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { AwakliiBadge } from "./AwakliiBadge";

// ─── Stage Display Names (mirrored from server config) ─────────────────

const STAGE_DISPLAY_NAMES: Record<number, string> = {
  1: "Manga Analysis",
  2: "Scene Planning",
  3: "Character Sheet Generation",
  4: "Keyframe Generation",
  5: "Video Generation",
  6: "Voice Synthesis",
  7: "Music Scoring",
  8: "SFX & Foley",
  9: "Audio Mix",
  10: "Video Composite",
  11: "Subtitle Render",
  12: "Episode Publish",
};

// ─── Timeout Countdown Hook ────────────────────────────────────────────

function useCountdown(timeoutAt: string | Date | null): string | null {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!timeoutAt) return;
    const interval = setInterval(() => setNow(Date.now()), 60_000); // Update every minute
    return () => clearInterval(interval);
  }, [timeoutAt]);

  if (!timeoutAt) return null;

  const target = new Date(timeoutAt).getTime();
  const diff = target - now;

  if (diff <= 0) return "Expired";

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h left`;
  }
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

// ─── Gate Type Badge ───────────────────────────────────────────────────

function GateTypeBadge({ type }: { type: string }) {
  const config: Record<string, { variant: "error" | "warning" | "cyan"; icon: React.ReactNode; label: string }> = {
    blocking: { variant: "error", icon: <Shield size={10} />, label: "Blocking" },
    advisory: { variant: "warning", icon: <Eye size={10} />, label: "Advisory" },
    ambient: { variant: "cyan", icon: <Radio size={10} />, label: "Ambient" },
  };
  const c = config[type] ?? config.ambient;
  return (
    <AwakliiBadge variant={c.variant} className="flex items-center gap-1">
      {c.icon} {c.label}
    </AwakliiBadge>
  );
}

// ─── Single Gate Card ──────────────────────────────────────────────────

function GateCard({ gate }: { gate: any }) {
  const countdown = useCountdown(gate.timeoutAt);
  const isUrgent = gate.timeoutAt && (new Date(gate.timeoutAt).getTime() - Date.now()) < 3600_000; // < 1 hour

  return (
    <Link href={`/studio/project/${gate.projectId}/pipeline/${gate.pipelineRunId}/gate/${gate.gateId}`}>
      <motion.div
        className={`group flex items-center gap-4 p-3.5 rounded-lg cursor-pointer transition-all ${
          isUrgent
            ? "bg-[#E94560]/10 border border-[#E94560]/30 hover:border-[#E94560]/50"
            : "bg-[#0D0D1A]/80 border border-white/5 hover:border-white/15 hover:bg-[#151528]"
        }`}
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        whileHover={{ x: 2 }}
        transition={{ duration: 0.2 }}
      >
        {/* Stage indicator */}
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 font-mono text-sm font-bold ${
          gate.gateType === "blocking"
            ? "bg-[#E94560]/15 text-[#E94560]"
            : gate.gateType === "advisory"
            ? "bg-[#F39C12]/15 text-[#F39C12]"
            : "bg-[#00D4FF]/15 text-[#00D4FF]"
        }`}>
          {gate.stageNumber}
        </div>

        {/* Gate info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-medium text-[#F0F0F5] truncate">
              {STAGE_DISPLAY_NAMES[gate.stageNumber] || gate.stageName}
            </span>
            <GateTypeBadge type={gate.gateType} />
          </div>
          <div className="flex items-center gap-2 text-xs text-[#5C5C7A]">
            <span className="truncate max-w-[180px]">{gate.projectTitle}</span>
            {gate.confidenceScore !== null && (
              <>
                <span className="text-white/10">|</span>
                <span className={gate.confidenceScore < 0.5 ? "text-[#E94560]" : gate.confidenceScore < 0.75 ? "text-[#F39C12]" : "text-[#2ECC71]"}>
                  {Math.round(gate.confidenceScore * 100)}% confidence
                </span>
              </>
            )}
          </div>
        </div>

        {/* Timeout countdown */}
        {countdown && (
          <div className={`flex items-center gap-1 text-xs font-mono shrink-0 ${
            isUrgent ? "text-[#E94560]" : "text-[#9494B8]"
          }`}>
            <Clock size={12} />
            {countdown}
          </div>
        )}

        {/* Arrow */}
        <ArrowRight size={14} className="text-[#5C5C7A] group-hover:text-[#F0F0F5] shrink-0 transition-colors" />
      </motion.div>
    </Link>
  );
}

// ─── Main Banner Component ─────────────────────────────────────────────

export function PendingGatesBanner() {
  const { data, isLoading } = trpc.gateReview.getPendingGateSummary.useQuery(undefined, {
    refetchInterval: 30_000, // Refresh every 30 seconds
  });

  const [expanded, setExpanded] = useState(true);

  // Don't render if no pending gates or loading
  if (isLoading || !data || data.totalCount === 0) return null;

  const blockingGates = data.gates.filter((g: any) => g.gateType === "blocking");
  const otherGates = data.gates.filter((g: any) => g.gateType !== "blocking");
  const hasBlocking = blockingGates.length > 0;

  return (
    <motion.section
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Banner header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center gap-3 p-4 rounded-t-xl transition-colors ${
          hasBlocking
            ? "bg-gradient-to-r from-[#E94560]/15 to-[#E94560]/5 border border-[#E94560]/25 border-b-0"
            : "bg-gradient-to-r from-[#F39C12]/10 to-[#F39C12]/5 border border-[#F39C12]/20 border-b-0"
        } ${!expanded ? "rounded-b-xl border-b" : ""}`}
      >
        {/* Pulsing dot */}
        <div className="relative shrink-0">
          <div className={`w-3 h-3 rounded-full ${hasBlocking ? "bg-[#E94560]" : "bg-[#F39C12]"}`} />
          <div className={`absolute inset-0 w-3 h-3 rounded-full animate-ping ${hasBlocking ? "bg-[#E94560]" : "bg-[#F39C12]"} opacity-50`} />
        </div>

        {/* Title */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <AlertTriangle size={16} className={hasBlocking ? "text-[#E94560]" : "text-[#F39C12]"} />
          <span className="text-sm font-semibold text-[#F0F0F5]">
            {data.totalCount} Gate{data.totalCount !== 1 ? "s" : ""} Awaiting Review
          </span>
          {data.blockingCount > 0 && (
            <AwakliiBadge variant="error" size="sm">
              {data.blockingCount} blocking
            </AwakliiBadge>
          )}
          {data.advisoryCount > 0 && (
            <AwakliiBadge variant="warning" size="sm">
              {data.advisoryCount} advisory
            </AwakliiBadge>
          )}
        </div>

        {/* Expand/collapse */}
        <span className="text-[#5C5C7A]">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {/* Gate list */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={`overflow-hidden rounded-b-xl border border-t-0 ${
              hasBlocking ? "border-[#E94560]/25" : "border-[#F39C12]/20"
            }`}
          >
            <div className="p-3 space-y-2 bg-[#0A0A18]/60">
              {/* Blocking gates first */}
              {blockingGates.map((gate: any) => (
                <GateCard key={gate.gateId} gate={gate} />
              ))}

              {/* Other gates */}
              {otherGates.map((gate: any) => (
                <GateCard key={gate.gateId} gate={gate} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

// ─── Compact Badge for Sidebar ─────────────────────────────────────────

export function PendingGateCount() {
  const { data } = trpc.gateReview.getPendingGateSummary.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  if (!data || data.totalCount === 0) return null;

  const hasBlocking = data.blockingCount > 0;

  return (
    <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold ${
      hasBlocking
        ? "bg-[#E94560] text-white"
        : "bg-[#F39C12] text-white"
    }`}>
      {data.totalCount}
    </span>
  );
}
