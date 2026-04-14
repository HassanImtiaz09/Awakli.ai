/**
 * ModerationBanner — displays content moderation status for scripts and panels.
 * Shows a dismissible banner when content is flagged.
 */

import { useState } from "react";
import { ShieldCheck, ShieldAlert, X, AlertTriangle, RefreshCw } from "lucide-react";

interface ModerationFlag {
  category: string;
  severity: "low" | "medium" | "high";
  description: string;
  lineNumber?: number;
}

interface ModerationBannerProps {
  status: "pending" | "clean" | "flagged";
  flags?: ModerationFlag[];
  type: "script" | "panel";
  onRecheck?: () => void;
  isRechecking?: boolean;
  className?: string;
}

const SEVERITY_COLORS = {
  low: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  medium: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  high: "bg-red-500/10 text-red-400 border-red-500/30",
};

const CATEGORY_LABELS: Record<string, string> = {
  violence: "Violence",
  sexual: "Sexual Content",
  hate: "Hate Speech",
  self_harm: "Self-Harm",
  illegal: "Illegal Activity",
  nudity: "Nudity",
  disturbing: "Disturbing Content",
};

export function ModerationBanner({
  status,
  flags = [],
  type,
  onRecheck,
  isRechecking = false,
  className = "",
}: ModerationBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed && status !== "flagged") return null;
  if (status === "pending") return null;

  if (status === "clean") {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20 ${className}`}>
        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
        <span className="text-xs text-emerald-300">
          {type === "script" ? "Script" : "Panel"} passed content review
        </span>
      </div>
    );
  }

  // Flagged
  const highSeverity = flags.filter(f => f.severity === "high");
  const mediumSeverity = flags.filter(f => f.severity === "medium");
  const lowSeverity = flags.filter(f => f.severity === "low");

  return (
    <div className={`rounded-xl border overflow-hidden ${
      highSeverity.length > 0
        ? "bg-red-500/5 border-red-500/30"
        : mediumSeverity.length > 0
          ? "bg-orange-500/5 border-orange-500/30"
          : "bg-amber-500/5 border-amber-500/30"
    } ${className}`}>
      {/* Header */}
      <div className="px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className={`w-4 h-4 ${
            highSeverity.length > 0 ? "text-red-400" : "text-amber-400"
          }`} />
          <span className={`text-sm font-medium ${
            highSeverity.length > 0 ? "text-red-300" : "text-amber-300"
          }`}>
            {type === "script" ? "Script" : "Panel"} flagged — {flags.length} issue{flags.length !== 1 ? "s" : ""} found
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onRecheck && (
            <button
              onClick={onRecheck}
              disabled={isRechecking}
              className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50 flex items-center gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${isRechecking ? "animate-spin" : ""}`} />
              Recheck
            </button>
          )}
          {!highSeverity.length && (
            <button
              onClick={() => setDismissed(true)}
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Flags List */}
      <div className="px-4 pb-3 space-y-1.5">
        {flags.map((flag, i) => (
          <div
            key={i}
            className={`flex items-start gap-2 px-2.5 py-1.5 rounded-md border ${SEVERITY_COLORS[flag.severity]}`}
          >
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider">
                  {CATEGORY_LABELS[flag.category] || flag.category}
                </span>
                <span className={`text-[9px] px-1 rounded font-medium ${
                  flag.severity === "high" ? "bg-red-500/20" :
                  flag.severity === "medium" ? "bg-orange-500/20" :
                  "bg-amber-500/20"
                }`}>
                  {flag.severity}
                </span>
                {flag.lineNumber !== undefined && flag.lineNumber > 0 && (
                  <span className="text-[9px] opacity-60">Line {flag.lineNumber}</span>
                )}
              </div>
              <p className="text-[11px] opacity-80 mt-0.5">{flag.description}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Warning for high severity */}
      {highSeverity.length > 0 && (
        <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/20">
          <p className="text-[10px] text-red-300">
            High severity issues must be resolved before publishing. Edit the {type} to remove flagged content.
          </p>
        </div>
      )}
    </div>
  );
}
