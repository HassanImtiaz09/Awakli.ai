import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Star, Eye, AlertTriangle, CheckCircle, XCircle, Sparkles,
  ChevronLeft, ChevronRight, Info, Layers, Volume2
} from "lucide-react";
import { trpc } from "@/lib/trpc";

// ─── Types ─────────────────────────────────────────────────────────────

interface TierSamplerStripProps {
  archetypeId?: string;
  onTierSelect?: (tier: number, archetypeId: string) => void;
  showAnchorPrompt?: boolean;
}

// ─── Constants ─────────────────────────────────────────────────────────

const TIER_COLORS: Record<number, string> = {
  1: "from-zinc-600 to-zinc-700",
  2: "from-blue-600 to-blue-700",
  3: "from-violet-600 to-violet-700",
  4: "from-amber-500 to-amber-600",
  5: "from-rose-500 to-rose-600",
};

const TIER_BORDER_COLORS: Record<number, string> = {
  1: "border-zinc-500/50",
  2: "border-blue-500/50",
  3: "border-violet-500/50",
  4: "border-amber-500/50",
  5: "border-rose-500/50",
};

const TIER_BADGE_VARIANTS: Record<number, string> = {
  1: "bg-zinc-500/20 text-zinc-300",
  2: "bg-blue-500/20 text-blue-300",
  3: "bg-violet-500/20 text-violet-300",
  4: "bg-amber-500/20 text-amber-300",
  5: "bg-rose-500/20 text-rose-300",
};

// ─── Component ─────────────────────────────────────────────────────────

export function TierSamplerStrip({ archetypeId, onTierSelect, showAnchorPrompt = true }: TierSamplerStripProps) {
  const [selectedArchetype, setSelectedArchetype] = useState(archetypeId ?? "V1");
  const [selectedGenre, setSelectedGenre] = useState<string>("neutral");
  const [selectedTier, setSelectedTier] = useState<number | null>(null);
  const [hoveredTier, setHoveredTier] = useState<number | null>(null);
  const [scrollIndex, setScrollIndex] = useState(0);

  const archetypesQuery = trpc.tierSampler.getArchetypes.useQuery();
  const tierStripQuery = trpc.tierSampler.getTierStrip.useQuery({
    archetypeId: selectedArchetype,
    genreVariant: selectedGenre as "action" | "slice_of_life" | "atmospheric" | "neutral",
  });
  const catalogMeta = trpc.tierSampler.getCatalogMeta.useQuery();

  const allArchetypes = useMemo(() => {
    if (!archetypesQuery.data) return [];
    return [
      ...archetypesQuery.data.visual.map((a: { id: string; name: string }) => ({ ...a, type: "visual" as const })),
      ...archetypesQuery.data.audio.map((a: { id: string; name: string }) => ({ ...a, type: "audio" as const })),
    ];
  }, [archetypesQuery.data]);

  const handleTierClick = (tier: number) => {
    setSelectedTier(tier);
    onTierSelect?.(tier, selectedArchetype);
  };

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={selectedArchetype} onValueChange={setSelectedArchetype}>
          <SelectTrigger className="w-[220px] bg-zinc-900/50 border-zinc-700">
            <SelectValue placeholder="Select archetype" />
          </SelectTrigger>
          <SelectContent>
            {allArchetypes.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                <span className="flex items-center gap-2">
                  {a.type === "visual" ? <Layers className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                  {a.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedGenre} onValueChange={setSelectedGenre}>
          <SelectTrigger className="w-[160px] bg-zinc-900/50 border-zinc-700">
            <SelectValue placeholder="Genre" />
          </SelectTrigger>
          <SelectContent>
            {(catalogMeta.data?.genreVariants ?? ["neutral", "action", "slice_of_life", "atmospheric"]).map((g: string) => (
              <SelectItem key={g} value={g}>
                {g.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedTier && showAnchorPrompt && (
          <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 px-3 py-1">
            <CheckCircle className="h-3 w-3 mr-1" />
            Anchored to Tier {selectedTier}
          </Badge>
        )}
      </div>

      {/* Tier Strip */}
      <div className="relative">
        {/* Scroll buttons */}
        {scrollIndex > 0 && (
          <button
            onClick={() => setScrollIndex(Math.max(0, scrollIndex - 1))}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-zinc-900/90 border border-zinc-700 rounded-full p-1.5 hover:bg-zinc-800 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        {scrollIndex < 2 && (
          <button
            onClick={() => setScrollIndex(Math.min(2, scrollIndex + 1))}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-zinc-900/90 border border-zinc-700 rounded-full p-1.5 hover:bg-zinc-800 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}

        {/* Filmstrip */}
        <div className="overflow-hidden">
          <div
            className="flex gap-3 transition-transform duration-300"
            style={{ transform: `translateX(-${scrollIndex * 220}px)` }}
          >
            {tierStripQuery.isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="min-w-[200px] h-[280px] rounded-lg bg-zinc-800/50 animate-pulse" />
              ))
            ) : (
              tierStripQuery.data?.tiers.map((tierData) => {
                const tier = tierData.tier;
                const isSelected = selectedTier === tier;
                const isHovered = hoveredTier === tier;
                const successCount = tierData.successes?.length ?? 0;
                const failureCount = tierData.failures?.length ?? 0;

                return (
                  <TooltipProvider key={tier}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => handleTierClick(tier)}
                          onMouseEnter={() => setHoveredTier(tier)}
                          onMouseLeave={() => setHoveredTier(null)}
                          className={`
                            min-w-[200px] rounded-lg border-2 transition-all duration-200 text-left
                            ${isSelected ? `${TIER_BORDER_COLORS[tier]} ring-2 ring-offset-2 ring-offset-zinc-950 ring-current scale-105` : "border-zinc-700/50"}
                            ${isHovered && !isSelected ? "border-zinc-600 scale-[1.02]" : ""}
                            hover:shadow-lg
                          `}
                        >
                          {/* Tier Header */}
                          <div className={`bg-gradient-to-r ${TIER_COLORS[tier]} px-3 py-2 rounded-t-lg`}>
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-bold text-white">Tier {tier}</span>
                              <div className="flex">
                                {Array.from({ length: tier }).map((_, i) => (
                                  <Star key={i} className="h-3 w-3 text-yellow-300 fill-yellow-300" />
                                ))}
                              </div>
                            </div>
                            <p className="text-[10px] text-white/70 mt-0.5">{tierData.label}</p>
                          </div>

                          {/* Sample Preview Area */}
                          <div className="bg-zinc-900/80 p-3 space-y-2">
                            {/* Simulated preview thumbnail */}
                            <div className="w-full h-24 rounded bg-zinc-800 flex items-center justify-center border border-zinc-700/30">
                              <div className="text-center">
                                <Eye className="h-5 w-5 text-zinc-500 mx-auto mb-1" />
                                <span className="text-[10px] text-zinc-500">Preview</span>
                              </div>
                            </div>

                            {/* Sample counts */}
                            <div className="flex items-center gap-2 text-xs">
                              <span className="flex items-center gap-1 text-emerald-400">
                                <CheckCircle className="h-3 w-3" />
                                {successCount}
                              </span>
                              {failureCount > 0 && (
                                <span className="flex items-center gap-1 text-red-400">
                                  <XCircle className="h-3 w-3" />
                                  {failureCount}
                                </span>
                              )}
                            </div>

                            {/* Failure modes */}
                            {failureCount > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {tierData.failures?.slice(0, 2).map((f, i) => (
                                  <Badge key={i} variant="outline" className="text-[9px] px-1 py-0 border-red-500/30 text-red-400">
                                    <AlertTriangle className="h-2 w-2 mr-0.5" />
                                    {(f.failureMode ?? "unknown").replace(/_/g, " ")}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Selection indicator */}
                          <div className={`px-3 py-1.5 rounded-b-lg ${isSelected ? "bg-emerald-500/20" : "bg-zinc-900/50"}`}>
                            <span className={`text-[10px] font-medium ${isSelected ? "text-emerald-400" : "text-zinc-500"}`}>
                              {isSelected ? "✓ Selected as anchor" : "Click to select"}
                            </span>
                          </div>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-[250px]">
                        <p className="text-sm font-medium">Tier {tier}: {tierData.label}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {successCount} success samples, {failureCount} failure examples.
                          Click to anchor your expectation at this quality level.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Anchor prompt */}
      {showAnchorPrompt && !selectedTier && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <Info className="h-4 w-4 text-amber-400 shrink-0" />
          <p className="text-xs text-amber-300">
            Browse the tier strip above and <strong>click the tier</strong> that best matches your quality expectation.
            This helps calibrate your experience and reduces surprise gaps.
          </p>
        </div>
      )}

      {/* Selected tier detail */}
      {selectedTier && tierStripQuery.data && (
        <Card className="bg-zinc-900/50 border-zinc-700/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-400" />
              Tier {selectedTier} Detail
              <Badge className={TIER_BADGE_VARIANTS[selectedTier]}>
                {tierStripQuery.data.tiers.find(t => t.tier === selectedTier)?.label}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2 rounded bg-zinc-800/50">
                <span className="text-zinc-400">Success samples</span>
                <p className="text-lg font-bold text-emerald-400">
                  {tierStripQuery.data.tiers.find(t => t.tier === selectedTier)?.successes?.length ?? 0}
                </p>
              </div>
              <div className="p-2 rounded bg-zinc-800/50">
                <span className="text-zinc-400">Failure examples</span>
                <p className="text-lg font-bold text-red-400">
                  {tierStripQuery.data.tiers.find(t => t.tier === selectedTier)?.failures?.length ?? 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
