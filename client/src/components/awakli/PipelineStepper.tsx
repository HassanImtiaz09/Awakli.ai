/**
 * PipelineStepper — Horizontal 12-stage pipeline overview (Prompt 17)
 *
 * Shows all 12 stages as a horizontal stepper. Completed stages show green check,
 * current stage pulses, future stages are grayed. Clicking a completed stage
 * shows its approved result for reference.
 */

import { motion } from "framer-motion";
import {
  CheckCircle, Circle, AlertCircle, Loader2, XCircle,
  SkipForward, Clock, RotateCcw
} from "lucide-react";
import { cn } from "@/lib/utils";

const STAGE_DISPLAY_NAMES: Record<number, string> = {
  1: "Manga Analysis",
  2: "Scene Planning",
  3: "Character Sheet",
  4: "Keyframe Gen",
  5: "Video Gen",
  6: "Voice Synthesis",
  7: "Music Scoring",
  8: "SFX & Foley",
  9: "Audio Mix",
  10: "Video Composite",
  11: "Subtitle Render",
  12: "Episode Publish",
};

const STAGE_SHORT_NAMES: Record<number, string> = {
  1: "Manga", 2: "Scene", 3: "Char", 4: "Key",
  5: "Video", 6: "Voice", 7: "Music", 8: "SFX",
  9: "Mix", 10: "Comp", 11: "Sub", 12: "Pub",
};

type StageStatus = "pending" | "executing" | "awaiting_gate" | "approved" | "rejected" | "regenerating" | "skipped" | "failed";

interface StageInfo {
  stageNumber: number;
  stageName: string;
  status: StageStatus;
  gateType?: string;
  confidenceScore?: number;
  attempts?: number;
}

interface PipelineStepperProps {
  stages: StageInfo[];
  currentStage?: number;
  onStageClick?: (stageNumber: number) => void;
  compact?: boolean;
}

const statusConfig: Record<StageStatus, { icon: React.ElementType; color: string; bgColor: string; pulse?: boolean }> = {
  pending: { icon: Circle, color: "text-gray-500", bgColor: "bg-gray-800/50" },
  executing: { icon: Loader2, color: "text-token-cyan", bgColor: "bg-token-cyan/10", pulse: true },
  awaiting_gate: { icon: Clock, color: "text-amber-400", bgColor: "bg-amber-400/10", pulse: true },
  approved: { icon: CheckCircle, color: "text-emerald-400", bgColor: "bg-emerald-400/10" },
  rejected: { icon: XCircle, color: "text-red-400", bgColor: "bg-red-400/10" },
  regenerating: { icon: RotateCcw, color: "text-violet-400", bgColor: "bg-violet-400/10", pulse: true },
  skipped: { icon: SkipForward, color: "text-gray-400", bgColor: "bg-gray-700/30" },
  failed: { icon: AlertCircle, color: "text-red-500", bgColor: "bg-red-500/10" },
};

export function PipelineStepper({ stages, currentStage, onStageClick, compact }: PipelineStepperProps) {
  return (
    <div className="w-full overflow-x-auto">
      <div className="flex items-start gap-0 min-w-[720px] px-2 py-3">
        {stages.map((stage, idx) => {
          const config = statusConfig[stage.status] || statusConfig.pending;
          const Icon = config.icon;
          const isActive = stage.stageNumber === currentStage;
          const isClickable = stage.status === "approved" || stage.status === "awaiting_gate";

          return (
            <div key={stage.stageNumber} className="flex items-start flex-1">
              {/* Stage node */}
              <div className="flex flex-col items-center min-w-0 flex-1">
                <motion.button
                  whileHover={isClickable ? { scale: 1.1 } : undefined}
                  whileTap={isClickable ? { scale: 0.95 } : undefined}
                  onClick={() => isClickable && onStageClick?.(stage.stageNumber)}
                  className={cn(
                    "relative w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all",
                    config.bgColor,
                    isActive ? "border-token-cyan shadow-lg shadow-token-cyan/20" : "border-transparent",
                    isClickable ? "cursor-pointer" : "cursor-default"
                  )}
                >
                  <Icon
                    className={cn(
                      "w-4 h-4",
                      config.color,
                      config.pulse && "animate-spin"
                    )}
                    style={config.pulse && stage.status !== "executing" ? { animation: "pulse 2s ease-in-out infinite" } : undefined}
                  />
                  {/* Confidence score badge */}
                  {stage.confidenceScore !== undefined && stage.confidenceScore > 0 && (
                    <span className={cn(
                      "absolute -top-1 -right-1 text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center",
                      stage.confidenceScore >= 85 ? "bg-emerald-500 text-white" :
                      stage.confidenceScore >= 60 ? "bg-amber-500 text-white" :
                      "bg-red-500 text-white"
                    )}>
                      {stage.confidenceScore}
                    </span>
                  )}
                </motion.button>

                {/* Stage label */}
                <span className={cn(
                  "mt-1.5 text-[10px] font-medium text-center leading-tight truncate w-full px-0.5",
                  isActive ? "text-white" : "text-gray-500"
                )}>
                  {compact ? STAGE_SHORT_NAMES[stage.stageNumber] : STAGE_DISPLAY_NAMES[stage.stageNumber]}
                </span>

                {/* Attempt indicator */}
                {stage.attempts && stage.attempts > 1 && (
                  <span className="text-[9px] text-violet-400 mt-0.5">
                    ×{stage.attempts}
                  </span>
                )}
              </div>

              {/* Connector line */}
              {idx < stages.length - 1 && (
                <div className="flex items-center pt-4 px-0.5 flex-shrink-0">
                  <div className={cn(
                    "h-0.5 w-4",
                    stage.status === "approved" ? "bg-emerald-400/40" :
                    stage.status === "executing" || stage.status === "awaiting_gate" ? "bg-token-cyan/30" :
                    "bg-gray-700/50"
                  )} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { STAGE_DISPLAY_NAMES, STAGE_SHORT_NAMES };
export type { StageInfo, StageStatus };
