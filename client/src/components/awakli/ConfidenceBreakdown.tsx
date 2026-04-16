/**
 * ConfidenceBreakdown — Expandable confidence score detail panel (Prompt 17)
 *
 * Shows the overall confidence score badge (color-coded) and expands to reveal
 * each scoring dimension with sub-score, weight, and reasoning.
 * Builds creator trust in the auto-advance system.
 */

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { ChevronDown, Shield, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface SubScore {
  dimension: string;
  score: number;
  weight: number;
  reasoning: string;
}

interface ConfidenceBreakdownProps {
  score: number;
  breakdown?: SubScore[];
  flags?: string[];
  compact?: boolean;
}

const DIMENSION_LABELS: Record<string, string> = {
  technical_quality: "Technical Quality",
  character_consistency: "Character Consistency",
  temporal_coherence: "Temporal Coherence",
  audio_clarity: "Audio Clarity",
  dialogue_sync: "Dialogue Sync",
  style_match: "Style Match",
  content_safety: "Content Safety",
  completeness: "Completeness",
};

const DIMENSION_DESCRIPTIONS: Record<string, string> = {
  technical_quality: "Resolution, artifacts, frame count, black frames",
  character_consistency: "CLIP similarity to character reference sheets",
  temporal_coherence: "Optical flow smoothness between frames",
  audio_clarity: "SNR ratio, clipping detection, silence check",
  dialogue_sync: "Duration matches expected phoneme timing",
  style_match: "CLIP similarity to episode style reference",
  content_safety: "NSFW classifier (veto dimension)",
  completeness: "Output duration/size within expected range",
};

function getScoreColor(score: number): string {
  if (score >= 85) return "text-emerald-400";
  if (score >= 60) return "text-amber-400";
  return "text-red-400";
}

function getScoreBg(score: number): string {
  if (score >= 85) return "bg-emerald-500/20 border-emerald-500/30";
  if (score >= 60) return "bg-amber-500/20 border-amber-500/30";
  return "bg-red-500/20 border-red-500/30";
}

function getBarColor(score: number): string {
  if (score >= 85) return "bg-emerald-400";
  if (score >= 60) return "bg-amber-400";
  return "bg-red-400";
}

export function ConfidenceBadge({ score, onClick }: { score: number; onClick?: () => void }) {
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-bold transition-all",
        getScoreBg(score),
        getScoreColor(score),
        onClick && "cursor-pointer hover:brightness-110"
      )}
    >
      <Shield className="w-3.5 h-3.5" />
      {score}
      {onClick && <ChevronDown className="w-3 h-3" />}
    </motion.button>
  );
}

export function ConfidenceBreakdown({ score, breakdown, flags, compact }: ConfidenceBreakdownProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="space-y-2">
      {/* Badge + toggle */}
      <div className="flex items-center gap-3">
        <ConfidenceBadge score={score} onClick={() => setExpanded(!expanded)} />
        <span className="text-xs text-gray-500">
          {score >= 85 ? "High confidence — auto-advance eligible" :
           score >= 60 ? "Medium confidence — review recommended" :
           "Low confidence — review required"}
        </span>
      </div>

      {/* Flags */}
      {flags && flags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {flags.map((flag) => (
            <span
              key={flag}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20"
            >
              <AlertTriangle className="w-3 h-3" />
              {flag.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      )}

      {/* Expandable breakdown */}
      <AnimatePresence>
        {expanded && breakdown && breakdown.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-gray-900/50 border border-gray-800/50 rounded-lg p-4 space-y-3 mt-2">
              <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
                <Info className="w-3.5 h-3.5" />
                Confidence scoring breakdown — weighted average of applicable dimensions
              </div>

              {breakdown.map((sub) => (
                <div key={sub.dimension} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-300 font-medium">
                        {DIMENSION_LABELS[sub.dimension] || sub.dimension}
                      </span>
                      <span className="text-[10px] text-gray-600">
                        w={sub.weight.toFixed(2)}
                      </span>
                    </div>
                    <span className={cn("text-sm font-bold", getScoreColor(sub.score))}>
                      {sub.score}
                    </span>
                  </div>

                  {/* Score bar */}
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${sub.score}%` }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                      className={cn("h-full rounded-full", getBarColor(sub.score))}
                    />
                  </div>

                  {/* Reasoning */}
                  <p className="text-[11px] text-gray-500 leading-tight">
                    {sub.reasoning || DIMENSION_DESCRIPTIONS[sub.dimension] || ""}
                  </p>
                </div>
              ))}

              {/* Weighted total explanation */}
              <div className="pt-2 border-t border-gray-800/50 flex items-center justify-between">
                <span className="text-xs text-gray-500">Weighted total</span>
                <span className={cn("text-lg font-bold", getScoreColor(score))}>{score}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
