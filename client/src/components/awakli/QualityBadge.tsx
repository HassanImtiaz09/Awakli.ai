/**
 * QualityBadge — shows a panel's quality score as a colored badge with details tooltip.
 * Green (80+), Yellow (50-79), Red (<50).
 */

import { useState } from "react";
import { Shield, ShieldCheck, ShieldAlert, Zap, RefreshCw, ArrowUp } from "lucide-react";

interface QualityDetails {
  promptAdherence: number;
  anatomy: number;
  styleConsistency: number;
  composition: number;
  characterAccuracy: number;
}

interface QualityBadgeProps {
  score: number | null;
  details?: QualityDetails | null;
  attempts?: number;
  hasUpscaled?: boolean;
  moderationStatus?: string;
  moderationFlags?: Array<{ category: string; severity: string; description: string }>;
  onAssess?: () => void;
  onUpscale?: () => void;
  isAssessing?: boolean;
  isUpscaling?: boolean;
  compact?: boolean;
}

export function QualityBadge({
  score,
  details,
  attempts = 1,
  hasUpscaled = false,
  moderationStatus,
  moderationFlags = [],
  onAssess,
  onUpscale,
  isAssessing = false,
  isUpscaling = false,
  compact = false,
}: QualityBadgeProps) {
  const [showDetails, setShowDetails] = useState(false);

  if (score === null && !onAssess) return null;

  const getScoreColor = (s: number) => {
    if (s >= 80) return "text-emerald-400 bg-emerald-400/10 border-emerald-400/30";
    if (s >= 50) return "text-amber-400 bg-amber-400/10 border-amber-400/30";
    return "text-red-400 bg-red-400/10 border-red-400/30";
  };

  const getScoreIcon = (s: number) => {
    if (s >= 80) return <ShieldCheck className="w-3.5 h-3.5" />;
    if (s >= 50) return <Shield className="w-3.5 h-3.5" />;
    return <ShieldAlert className="w-3.5 h-3.5" />;
  };

  const getScoreLabel = (s: number) => {
    if (s >= 80) return "Excellent";
    if (s >= 60) return "Good";
    if (s >= 50) return "Fair";
    return "Needs Improvement";
  };

  const getModerationColor = (status: string) => {
    if (status === "clean") return "text-emerald-400";
    if (status === "flagged") return "text-red-400";
    return "text-zinc-500";
  };

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        {score !== null && (
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${getScoreColor(score)}`}>
            {getScoreIcon(score)}
            {score}
          </span>
        )}
        {hasUpscaled && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium text-cyan-400 bg-cyan-400/10 border border-cyan-400/30">
            <ArrowUp className="w-2.5 h-2.5" />
            4K
          </span>
        )}
        {moderationStatus === "flagged" && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium text-red-400 bg-red-400/10 border border-red-400/30">
            <ShieldAlert className="w-2.5 h-2.5" />
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Main Badge */}
      <div className="flex items-center gap-2">
        {score !== null ? (
          <button
            onClick={() => setShowDetails(!showDetails)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-all hover:scale-105 cursor-pointer ${getScoreColor(score)}`}
          >
            {getScoreIcon(score)}
            <span>{score}/100</span>
            <span className="opacity-70">· {getScoreLabel(score)}</span>
          </button>
        ) : onAssess ? (
          <button
            onClick={onAssess}
            disabled={isAssessing}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-all disabled:opacity-50"
          >
            {isAssessing ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5" />
            )}
            {isAssessing ? "Assessing..." : "Assess Quality"}
          </button>
        ) : null}

        {/* Upscale indicator */}
        {hasUpscaled && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-cyan-400 bg-cyan-400/10 border border-cyan-400/30">
            <ArrowUp className="w-3 h-3" />
            Upscaled
          </span>
        )}

        {/* Upscale button */}
        {!hasUpscaled && onUpscale && score !== null && score >= 50 && (
          <button
            onClick={onUpscale}
            disabled={isUpscaling}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border border-cyan-600/30 text-cyan-400 hover:bg-cyan-400/10 transition-all disabled:opacity-50"
          >
            {isUpscaling ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : (
              <ArrowUp className="w-3 h-3" />
            )}
            {isUpscaling ? "Upscaling..." : "Upscale 4K"}
          </button>
        )}

        {/* Moderation status */}
        {moderationStatus && (
          <span className={`inline-flex items-center gap-1 text-xs ${getModerationColor(moderationStatus)}`}>
            {moderationStatus === "clean" ? (
              <ShieldCheck className="w-3 h-3" />
            ) : moderationStatus === "flagged" ? (
              <ShieldAlert className="w-3 h-3" />
            ) : null}
            {moderationStatus === "flagged" ? `${moderationFlags.length} flag${moderationFlags.length !== 1 ? "s" : ""}` : ""}
          </span>
        )}

        {/* Attempts indicator */}
        {attempts > 1 && (
          <span className="text-[10px] text-zinc-500">
            {attempts} attempts
          </span>
        )}
      </div>

      {/* Details Tooltip */}
      {showDetails && details && (
        <div className="absolute top-full left-0 mt-2 z-50 bg-zinc-900 border border-zinc-700 rounded-lg p-3 shadow-xl min-w-[240px]">
          <div className="text-xs font-medium text-zinc-300 mb-2">Quality Breakdown</div>
          <div className="space-y-1.5">
            {[
              { label: "Prompt Adherence", value: details.promptAdherence },
              { label: "Anatomy", value: details.anatomy },
              { label: "Style Consistency", value: details.styleConsistency },
              { label: "Composition", value: details.composition },
              { label: "Character Accuracy", value: details.characterAccuracy },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-500 w-28 shrink-0">{label}</span>
                <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      value >= 8 ? "bg-emerald-400" : value >= 5 ? "bg-amber-400" : "bg-red-400"
                    }`}
                    style={{ width: `${value * 10}%` }}
                  />
                </div>
                <span className="text-[10px] text-zinc-400 w-4 text-right">{value}</span>
              </div>
            ))}
          </div>

          {/* Moderation flags */}
          {moderationFlags.length > 0 && (
            <div className="mt-3 pt-2 border-t border-zinc-800">
              <div className="text-[10px] font-medium text-red-400 mb-1">Moderation Flags</div>
              {moderationFlags.map((flag, i) => (
                <div key={i} className="text-[10px] text-zinc-400 flex items-start gap-1 mt-1">
                  <span className={`px-1 rounded ${
                    flag.severity === "high" ? "bg-red-500/20 text-red-400" :
                    flag.severity === "medium" ? "bg-amber-500/20 text-amber-400" :
                    "bg-zinc-700 text-zinc-400"
                  }`}>
                    {flag.severity}
                  </span>
                  <span>{flag.description}</span>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => setShowDetails(false)}
            className="mt-2 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
