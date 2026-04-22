/**
 * DurationForecast — live total runtime + credit forecast.
 * Cross-reacts with CreditMeter; updates within 200ms of timing change.
 *
 * Spec: Stage 6 · Video — Short-form Render (Mangaka)
 */
import { useMemo } from "react";
import { motion } from "framer-motion";
import { Clock, Coins, AlertTriangle, Sparkles } from "lucide-react";
import type { PanelTiming } from "./PanelTimingEditor";

// ─── Exported credit formula ────────────────────────────────────────
export const VIDEO_CREDITS = {
  perPanelMotion: 12,
  perSecondVoice: 4,
  compose: 6,
  redoPanel: 18,
} as const;

export const MANGAKA_LIMITS = {
  maxRuntime: 60,
  maxResolution: "1080p" as const,
  maxRendersPerEpisodePerMonth: 3,
  exportFormat: "MP4 H.264, 48kHz stereo" as const,
} as const;

// ─── Exported copy ──────────────────────────────────────────────────
export const FORECAST_COPY = {
  renderCta: (seconds: number, credits: number) =>
    `Render · ${seconds}s · ${credits} credits`,
  overBudget: "Mangaka caps at 60s — trim or upgrade",
  rendersRemaining: (n: number) =>
    `${n} render${n !== 1 ? "s" : ""} remaining this month`,
} as const;

// ─── Credit calculator ──────────────────────────────────────────────
export function calculateCredits(panels: PanelTiming[]): {
  motionCredits: number;
  voiceCredits: number;
  composeCredits: number;
  totalCredits: number;
  totalRuntime: number;
} {
  const totalRuntime = panels.reduce((sum, p) => sum + p.duration, 0);
  const motionCredits = panels.length * VIDEO_CREDITS.perPanelMotion;
  const voiceCredits = Math.ceil(totalRuntime) * VIDEO_CREDITS.perSecondVoice;
  const composeCredits = VIDEO_CREDITS.compose;
  const totalCredits = motionCredits + voiceCredits + composeCredits;
  return { motionCredits, voiceCredits, composeCredits, totalCredits, totalRuntime };
}

// ─── Types ──────────────────────────────────────────────────────────
interface DurationForecastProps {
  panels: PanelTiming[];
  maxRuntime?: number;
  rendersRemaining?: number;
  availableCredits?: number;
  onRender?: () => void;
  disabled?: boolean;
}

// ─── Component ──────────────────────────────────────────────────────
export default function DurationForecast({
  panels,
  maxRuntime = MANGAKA_LIMITS.maxRuntime,
  rendersRemaining = 3,
  availableCredits = 0,
  onRender,
  disabled = false,
}: DurationForecastProps) {
  const forecast = useMemo(() => calculateCredits(panels), [panels]);
  const overBudget = forecast.totalRuntime > maxRuntime;
  const insufficientCredits = availableCredits < forecast.totalCredits;
  const noRendersLeft = rendersRemaining <= 0;
  const canRender = !overBudget && !insufficientCredits && !noRendersLeft && !disabled;

  return (
    <motion.div
      layout
      className={`sticky bottom-4 rounded-card p-4 bg-paper border shadow-hover transition-colors ${
        overBudget
          ? "border-red-500/40"
          : canRender
          ? "border-violet-500/30"
          : "border-white/10"
      }`}
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        {/* Left: runtime + credit breakdown */}
        <div className="space-y-1.5">
          {/* Runtime */}
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-white/40" />
            <span className="text-sm font-mono text-white/80">
              {forecast.totalRuntime.toFixed(1)}s
            </span>
            <span className="text-xs text-white/30">
              / {maxRuntime}s max
            </span>
            {overBudget && (
              <span className="text-xs text-red-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                over
              </span>
            )}
          </div>

          {/* Credit breakdown */}
          <div className="flex items-center gap-3 text-[11px] text-white/40">
            <span>
              Motion: {forecast.motionCredits}c ({panels.length} × {VIDEO_CREDITS.perPanelMotion})
            </span>
            <span>
              Voice: {forecast.voiceCredits}c ({Math.ceil(forecast.totalRuntime)} × {VIDEO_CREDITS.perSecondVoice})
            </span>
            <span>Compose: {forecast.composeCredits}c</span>
          </div>

          {/* Renders remaining */}
          <div className="flex items-center gap-1.5 text-[11px] text-white/30">
            <Sparkles className="w-3 h-3" />
            {FORECAST_COPY.rendersRemaining(rendersRemaining)}
          </div>
        </div>

        {/* Right: total + render CTA */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-violet-400" />
              <span className="text-lg font-bold text-white/90 font-mono">
                {forecast.totalCredits}
              </span>
              <span className="text-xs text-white/30">credits</span>
            </div>
            {insufficientCredits && (
              <div className="text-[10px] text-red-400 mt-0.5">
                Need {forecast.totalCredits - availableCredits} more credits
              </div>
            )}
          </div>

          <button
            onClick={onRender}
            disabled={!canRender}
            className={`px-5 py-2.5 rounded-full text-sm font-semibold transition-all whitespace-nowrap ${
              canRender
                ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:shadow-lg hover:shadow-violet-500/20 active:scale-[0.97]"
                : "bg-white/5 text-white/30 cursor-not-allowed"
            }`}
          >
            {FORECAST_COPY.renderCta(
              Math.round(forecast.totalRuntime),
              forecast.totalCredits
            )}
          </button>
        </div>
      </div>

      {/* Over-budget message */}
      {overBudget && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-center"
        >
          {FORECAST_COPY.overBudget}
        </motion.div>
      )}
    </motion.div>
  );
}
