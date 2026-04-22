/**
 * ConsistencyReport — Post-render side panel flagging panels
 * where character similarity dropped below threshold.
 *
 * Copy strings:
 * - Title: "Consistency check"
 * - Row format: "Panel {n}: {character} similarity {score}%"
 *
 * Tier behavior:
 * - Mangaka: basic report, click to jump to lightbox
 * - Studio: includes LoRA correction CTA
 * - Studio Pro: auto-correct up to 5/project/month free re-renders
 */
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldAlert,
  X,
  ChevronRight,
  Sparkles,
  RotateCcw,
  Loader2,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

export interface FlaggedPanel {
  panelId: number;
  panelNumber: number;
  characterName: string;
  similarityScore: number; // 0-100
  severity: "warning" | "critical";
  suggestedPrompt?: string;
}

export interface ConsistencyReportProps {
  /** Whether the report panel is open */
  isOpen: boolean;
  /** Close the panel */
  onClose: () => void;
  /** List of flagged panels */
  flaggedPanels: FlaggedPanel[];
  /** Whether the report is still loading/computing */
  isLoading: boolean;
  /** User's tier */
  userTier: string;
  /** Auto-correct uses remaining this month (Studio Pro only) */
  autoCorrectRemaining: number;
  /** Max auto-correct per project per month */
  autoCorrectCap: number;
  /** Callback to jump to a panel in the lightbox */
  onJumpToPanel: (panelId: number) => void;
  /** Callback to auto-correct a flagged panel (Studio Pro) */
  onAutoCorrect: (panelId: number) => void;
  /** Callback to open LoRA retraining (Studio+) */
  onOpenLoraRetraining: () => void;
  /** Set of panel IDs currently being auto-corrected */
  correctingPanelIds?: Set<number>;
}

export function ConsistencyReport({
  isOpen,
  onClose,
  flaggedPanels,
  isLoading,
  userTier,
  autoCorrectRemaining,
  autoCorrectCap,
  onJumpToPanel,
  onAutoCorrect,
  onOpenLoraRetraining,
  correctingPanelIds = new Set(),
}: ConsistencyReportProps) {
  const isStudio = userTier === "studio" || userTier === "studio_pro" || userTier === "enterprise";
  const isStudioPro = userTier === "studio_pro" || userTier === "enterprise";

  const sortedPanels = useMemo(
    () => [...flaggedPanels].sort((a, b) => a.similarityScore - b.similarityScore),
    [flaggedPanels],
  );

  const criticalCount = sortedPanels.filter((p) => p.severity === "critical").length;
  const warningCount = sortedPanels.filter((p) => p.severity === "warning").length;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          data-component="consistency-report"
          className="fixed right-4 top-20 bottom-20 z-50 w-80 rounded-2xl bg-[#0D0D1A] border border-white/[0.06] shadow-[0_8px_40px_rgba(0,0,0,0.6)] flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04] flex-shrink-0">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-[#FFD700]" />
              <span className="text-sm font-semibold text-white/90">
                Consistency check
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Summary bar */}
          <div className="px-4 py-2.5 border-b border-white/[0.03] flex-shrink-0">
            {isLoading ? (
              <div className="flex items-center gap-2 text-white/30 text-xs">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Analyzing character consistency…
              </div>
            ) : flaggedPanels.length === 0 ? (
              <div className="flex items-center gap-2 text-[#00E8A0] text-xs">
                <CheckCircle2 className="w-3.5 h-3.5" />
                All panels pass consistency check
              </div>
            ) : (
              <div className="flex items-center gap-3 text-xs">
                {criticalCount > 0 && (
                  <span className="flex items-center gap-1 text-[#FF5C5C]">
                    <AlertTriangle className="w-3 h-3" />
                    {criticalCount} critical
                  </span>
                )}
                {warningCount > 0 && (
                  <span className="flex items-center gap-1 text-[#FFD700]">
                    <AlertTriangle className="w-3 h-3" />
                    {warningCount} warning
                  </span>
                )}
                <span className="text-white/20">
                  {flaggedPanels.length} flagged
                </span>
              </div>
            )}
          </div>

          {/* Panel list */}
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/5">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-16 rounded-xl bg-white/[0.02] animate-pulse"
                  />
                ))}
              </div>
            ) : sortedPanels.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-white/15 gap-2 p-4">
                <CheckCircle2 className="w-10 h-10" />
                <span className="text-xs text-center">
                  No character drift detected.
                  <br />
                  Your panels look consistent.
                </span>
              </div>
            ) : (
              <div className="p-3 space-y-1.5">
                {sortedPanels.map((fp) => (
                  <FlaggedPanelRow
                    key={fp.panelId}
                    panel={fp}
                    isStudio={isStudio}
                    isStudioPro={isStudioPro}
                    autoCorrectRemaining={autoCorrectRemaining}
                    isCorrecting={correctingPanelIds.has(fp.panelId)}
                    onJump={() => onJumpToPanel(fp.panelId)}
                    onAutoCorrect={() => onAutoCorrect(fp.panelId)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer actions */}
          {!isLoading && flaggedPanels.length > 0 && (
            <div className="px-4 py-3 border-t border-white/[0.04] flex-shrink-0 space-y-2">
              {/* Studio: LoRA correction CTA */}
              {isStudio && (
                <button
                  onClick={onOpenLoraRetraining}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-[#6B5BFF]/10 border border-[#6B5BFF]/20 text-[#6B5BFF] text-xs font-medium hover:bg-[#6B5BFF]/15 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Retrain LoRA for better consistency
                </button>
              )}

              {/* Studio Pro: auto-correct status */}
              {isStudioPro && (
                <p className="text-[10px] text-white/20 text-center">
                  Auto-correct: {autoCorrectRemaining} / {autoCorrectCap} free re-renders remaining this month
                </p>
              )}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Flagged panel row ──────────────────────────────────────────────────────

interface FlaggedPanelRowProps {
  panel: FlaggedPanel;
  isStudio: boolean;
  isStudioPro: boolean;
  autoCorrectRemaining: number;
  isCorrecting: boolean;
  onJump: () => void;
  onAutoCorrect: () => void;
}

function FlaggedPanelRow({
  panel,
  isStudioPro,
  autoCorrectRemaining,
  isCorrecting,
  onJump,
  onAutoCorrect,
}: FlaggedPanelRowProps) {
  const [expanded, setExpanded] = useState(false);
  const scoreColor =
    panel.severity === "critical"
      ? "text-[#FF5C5C]"
      : "text-[#FFD700]";
  const ringColor =
    panel.severity === "critical"
      ? "ring-[#FF5C5C]/30"
      : "ring-[#FFD700]/30";

  return (
    <div
      className={`rounded-xl bg-white/[0.02] ring-1 ${ringColor} overflow-hidden`}
    >
      {/* Main row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex-1 min-w-0">
          <p className="text-xs text-white/70 truncate">
            Panel {panel.panelNumber}: {panel.characterName} similarity{" "}
            <span className={`font-semibold ${scoreColor}`}>
              {panel.similarityScore}%
            </span>
          </p>
        </div>
        <ChevronRight
          className={`w-3.5 h-3.5 text-white/20 transition-transform ${
            expanded ? "rotate-90" : ""
          }`}
        />
      </button>

      {/* Expanded actions */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2">
              {panel.suggestedPrompt && (
                <p className="text-[10px] text-white/25 italic leading-relaxed">
                  Suggestion: {panel.suggestedPrompt}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={onJump}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-white/60 text-[11px] font-medium transition-colors"
                >
                  <ChevronRight className="w-3 h-3" />
                  Open in lightbox
                </button>
                {isStudioPro && autoCorrectRemaining > 0 && (
                  <button
                    onClick={onAutoCorrect}
                    disabled={isCorrecting}
                    className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00E8A0]/10 hover:bg-[#00E8A0]/15 text-[#00E8A0] text-[11px] font-medium transition-colors disabled:opacity-40"
                  >
                    {isCorrecting ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RotateCcw className="w-3 h-3" />
                    )}
                    Auto-fix
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Auto-correct cap helpers ────────────────────────────────────────────────

/** Studio Pro: max 5 free auto-correct re-renders per project per month */
export const AUTO_CORRECT_MONTHLY_CAP = 5;

/** Check if auto-correct is available */
export function canAutoCorrect(
  tier: string,
  usedThisMonth: number,
): boolean {
  if (tier !== "studio_pro" && tier !== "enterprise") return false;
  return usedThisMonth < AUTO_CORRECT_MONTHLY_CAP;
}
