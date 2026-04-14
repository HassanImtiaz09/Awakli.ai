/**
 * CostEstimationCard — displays a breakdown of estimated pipeline costs for an episode.
 */

import { DollarSign, Image, Video, Mic, Music, Sparkles, Layers, Volume2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface CostEstimationCardProps {
  episodeId: number;
  className?: string;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  upscaling: <Image className="w-4 h-4 text-cyan-400" />,
  videoGeneration: <Video className="w-4 h-4 text-purple-400" />,
  voiceActing: <Mic className="w-4 h-4 text-pink-400" />,
  narrator: <Mic className="w-4 h-4 text-amber-400" />,
  music: <Music className="w-4 h-4 text-emerald-400" />,
  sfx: <Volume2 className="w-4 h-4 text-blue-400" />,
  assembly: <Layers className="w-4 h-4 text-zinc-400" />,
};

const CATEGORY_LABELS: Record<string, string> = {
  upscaling: "Panel Upscaling",
  videoGeneration: "Video Generation",
  voiceActing: "Voice Acting",
  narrator: "Narrator Voice",
  music: "Background Music",
  sfx: "Sound Effects",
  assembly: "Final Assembly",
};

export function CostEstimationCard({ episodeId, className = "" }: CostEstimationCardProps) {
  const { data: estimate, isLoading } = trpc.cost.estimate.useQuery({ episodeId });

  if (isLoading) {
    return (
      <div className={`bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 animate-pulse ${className}`}>
        <div className="h-5 w-32 bg-zinc-800 rounded mb-3" />
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-4 bg-zinc-800 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (!estimate) return null;

  const categories = [
    { key: "upscaling", data: estimate.upscaling },
    { key: "videoGeneration", data: estimate.videoGeneration },
    { key: "voiceActing", data: estimate.voiceActing },
    { key: "narrator", data: estimate.narrator },
    { key: "music", data: estimate.music },
    { key: "sfx", data: estimate.sfx },
    { key: "assembly", data: estimate.assembly },
  ].filter(c => c.data.count > 0);

  const totalDollars = (estimate.totalCents / 100).toFixed(2);

  return (
    <div className={`bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <DollarSign className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">Cost Estimate</h3>
            <p className="text-[10px] text-zinc-500">Before starting pipeline</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-zinc-100">${totalDollars}</div>
          <div className="text-[10px] text-zinc-500">estimated total</div>
        </div>
      </div>

      {/* Breakdown */}
      <div className="p-4 space-y-2">
        {categories.map(({ key, data }) => {
          const percentage = estimate.totalCents > 0 ? (data.total / estimate.totalCents) * 100 : 0;
          return (
            <div key={key} className="flex items-center gap-3">
              <div className="w-5 flex justify-center shrink-0">
                {CATEGORY_ICONS[key]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs text-zinc-300">{CATEGORY_LABELS[key]}</span>
                  <span className="text-xs text-zinc-400">
                    {data.count} × ${(data.unitCost / 100).toFixed(2)}
                  </span>
                </div>
                <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-500/60 to-amber-400/80 transition-all"
                    style={{ width: `${Math.max(2, percentage)}%` }}
                  />
                </div>
              </div>
              <span className="text-xs font-medium text-zinc-200 w-12 text-right shrink-0">
                ${(data.total / 100).toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 bg-zinc-800/50 border-t border-zinc-800">
        <div className="flex items-center justify-between text-[10px] text-zinc-500">
          <span>Costs may vary based on content complexity</span>
          <span className="flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            Credits deducted on completion
          </span>
        </div>
      </div>
    </div>
  );
}
