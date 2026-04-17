import { useState, useMemo, useCallback } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  PenTool, Layers, Zap, Settings2, Play, RefreshCw, Eye, EyeOff,
  ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, XCircle,
  Gauge, BarChart3, Image, Wand2, RotateCcw, Info, Sparkles,
  Clock, DollarSign, Cpu, TrendingUp, Activity, Target,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────

type SceneType = "dialogue" | "action" | "establishing" | "reaction" | "montage" | "transition";
type ControlnetMode = "canny" | "lineart" | "lineart_anime" | "depth";
type ExtractionMethod = "canny" | "anime2sketch";
type BatchMethod = "canny" | "anime2sketch" | "mixed";

const SCENE_TYPE_LABELS: Record<SceneType, string> = {
  dialogue: "Dialogue",
  action: "Action",
  establishing: "Establishing",
  reaction: "Reaction",
  montage: "Montage",
  transition: "Transition",
};

const SCENE_TYPE_ICONS: Record<SceneType, string> = {
  dialogue: "💬",
  action: "⚔️",
  establishing: "🏙️",
  reaction: "😲",
  montage: "🎬",
  transition: "🔄",
};

const MODE_LABELS: Record<ControlnetMode, string> = {
  canny: "Canny Edge",
  lineart: "Lineart",
  lineart_anime: "Lineart Anime",
  depth: "Depth Map",
};

const METHOD_LABELS: Record<ExtractionMethod, string> = {
  canny: "Canny (Fast)",
  anime2sketch: "Anime2Sketch (Quality)",
};

// ─── Sub-Components ─────────────────────────────────────────────────────

function FidelityGradeBadge({ grade, score }: { grade: string; score?: number }) {
  const colors = {
    pass: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    review: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    fail: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  const icons = {
    pass: <CheckCircle2 size={12} />,
    review: <AlertTriangle size={12} />,
    fail: <XCircle size={12} />,
  };
  return (
    <Badge variant="outline" className={cn("gap-1 text-xs", colors[grade as keyof typeof colors] ?? colors.review)}>
      {icons[grade as keyof typeof icons]}
      {grade.charAt(0).toUpperCase() + grade.slice(1)}
      {score !== undefined && <span className="ml-1 opacity-70">{score}</span>}
    </Badge>
  );
}

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className={cn(
      "flex items-center gap-3 p-3 rounded-lg border border-white/5",
      "bg-gradient-to-br from-white/[0.03] to-transparent"
    )}>
      <div className={cn("p-2 rounded-lg", color ?? "bg-violet-500/20 text-violet-400")}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className="text-lg font-semibold text-foreground">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

function StrengthSlider({ value, onChange, label }: {
  value: number; onChange: (v: number) => void; label?: string;
}) {
  const getColor = (v: number) => {
    if (v <= 0.3) return "text-blue-400";
    if (v <= 0.5) return "text-emerald-400";
    if (v <= 0.7) return "text-amber-400";
    return "text-red-400";
  };
  const getLabel = (v: number) => {
    if (v <= 0.3) return "Subtle";
    if (v <= 0.5) return "Balanced";
    if (v <= 0.7) return "Strong";
    return "Rigid";
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label ?? "Conditioning Strength"}</span>
        <span className={cn("text-sm font-mono font-semibold", getColor(value))}>
          {value.toFixed(2)} — {getLabel(value)}
        </span>
      </div>
      <Slider
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={0}
        max={1}
        step={0.05}
        className="w-full"
      />
      <div className="flex justify-between text-[10px] text-muted-foreground/50">
        <span>0.0 — Creative</span>
        <span>0.5 — Balanced</span>
        <span>1.0 — Rigid</span>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────

export default function LineartPipeline() {
  const params = useParams<{ projectId: string }>();
  const projectId = Number(params.projectId) || 0;
  const { user } = useAuth();

  // State
  const [activeTab, setActiveTab] = useState("extraction");
  const [selectedSceneType, setSelectedSceneType] = useState<SceneType>("dialogue");
  const [extractionMethod, setExtractionMethod] = useState<ExtractionMethod>("anime2sketch");
  const [batchMethod, setBatchMethod] = useState<BatchMethod>("mixed");
  const [conditioningStrength, setConditioningStrength] = useState(0.55);
  const [controlnetMode, setControlnetMode] = useState<ControlnetMode>("lineart_anime");
  const [showOverlay, setShowOverlay] = useState(true);
  const [expandedConfig, setExpandedConfig] = useState(false);
  const [testSeed, setTestSeed] = useState<number>(42);
  const [fidelityPanelIndex, setFidelityPanelIndex] = useState(0);

  // Queries
  const pipelineStats = trpc.lineartPipeline.getPipelineStats.useQuery(
    { episodeId: undefined },
    { refetchInterval: 10000 }
  );

  const controlnetConfig = trpc.lineartPipeline.getControlnetConfig.useQuery(
    { sceneType: selectedSceneType },
  );

  const fidelityResult = trpc.lineartPipeline.measureFidelity.useQuery(
    { panelIndex: fidelityPanelIndex, conditioningStrength, controlnetMode, edgeDensity: 0.12 },
    { enabled: activeTab === "fidelity" }
  );

  const batchJobs = trpc.lineartPipeline.getBatchJobs.useQuery(
    { limit: 10 },
    { refetchInterval: 5000 }
  );

  // Mutations
  const extractMutation = trpc.lineartPipeline.extractLineart.useMutation({
    onSuccess: (data) => {
      toast.success(`Lineart extracted: ${data.method} @ ${data.resolutionW}×${data.resolutionH}`, {
        description: `SNR: ${data.snrDb}dB | 5 stages completed`,
      });
      pipelineStats.refetch();
    },
    onError: (err) => toast.error(`Extraction failed: ${err.message}`),
  });

  const batchMutation = trpc.lineartPipeline.batchExtract.useMutation({
    onSuccess: (data) => {
      toast.success(`Batch complete: ${data.completedPanels}/${data.totalPanels} panels`, {
        description: `${data.methodSummary.description} | Cost: $${data.estimatedCost}`,
      });
      pipelineStats.refetch();
      batchJobs.refetch();
    },
    onError: (err) => toast.error(`Batch failed: ${err.message}`),
  });

  const updateConfigMutation = trpc.lineartPipeline.updateControlnetConfig.useMutation({
    onSuccess: (data) => {
      toast.success(`Config updated for ${data.sceneType}`, {
        description: `Mode: ${data.controlnetMode} | Strength: ${data.strengthLabel}`,
      });
      controlnetConfig.refetch();
    },
  });

  const resetConfigMutation = trpc.lineartPipeline.resetControlnetConfig.useMutation({
    onSuccess: (data) => {
      toast.success(`Reset ${data.reset.length} config(s) to defaults`);
      controlnetConfig.refetch();
    },
  });

  const testImageMutation = trpc.lineartPipeline.generateTestImage.useMutation({
    onSuccess: (data) => {
      toast.success(`Test image generated`, {
        description: `Mode: ${data.modeLabel} | Strength: ${data.strengthLabel} | Seed: ${data.seed}`,
      });
    },
    onError: (err) => toast.error(`Test generation failed: ${err.message}`),
  });

  // Handlers
  const handleExtractSingle = useCallback(() => {
    extractMutation.mutate({
      episodeId: 1,
      panelIndex: Math.floor(Math.random() * 50),
      sourcePanelUrl: `https://storage.awakli.com/panels/project-${projectId}/panel-${Date.now()}.png`,
      method: extractionMethod,
    });
  }, [extractMutation, extractionMethod, projectId]);

  const handleBatchExtract = useCallback(() => {
    const panels = Array.from({ length: 12 }, (_, i) => ({
      panelIndex: i,
      sourcePanelUrl: `https://storage.awakli.com/panels/project-${projectId}/panel-${i}.png`,
      sceneType: (["dialogue", "action", "establishing", "reaction", "montage", "transition"] as const)[i % 6],
    }));
    batchMutation.mutate({
      episodeId: 1,
      panels,
      method: batchMethod,
    });
  }, [batchMutation, batchMethod, projectId]);

  const handleSaveConfig = useCallback(() => {
    updateConfigMutation.mutate({
      sceneType: selectedSceneType,
      controlnetMode,
      conditioningStrength,
      extractionMethod,
    });
  }, [updateConfigMutation, selectedSceneType, controlnetMode, conditioningStrength, extractionMethod]);

  const handleTestGenerate = useCallback(() => {
    testImageMutation.mutate({
      controlImageUrl: `https://storage.awakli.com/lineart/test-control-${Date.now()}.png`,
      sceneType: selectedSceneType,
      conditioningStrength,
      controlnetMode,
      seed: testSeed,
    });
  }, [testImageMutation, selectedSceneType, conditioningStrength, controlnetMode, testSeed]);

  // Derived data
  const stats = pipelineStats.data;
  const config = controlnetConfig.data;
  const fidelity = fidelityResult.data;

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <PenTool className="text-violet-400" size={24} />
            Lineart Pipeline
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Extract lineart from manga panels and configure ControlNet conditioning for anime generation
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowOverlay(!showOverlay)}
            className="gap-1.5"
          >
            {showOverlay ? <EyeOff size={14} /> : <Eye size={14} />}
            {showOverlay ? "Hide" : "Show"} Overlay
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            icon={<Layers size={16} />}
            label="Panels Extracted"
            value={stats.totalPanelsExtracted}
            sub={`${stats.cannyAssets} Canny / ${stats.anime2sketchAssets} A2S`}
            color="bg-violet-500/20 text-violet-400"
          />
          <StatCard
            icon={<Zap size={16} />}
            label="Batch Jobs"
            value={stats.totalBatches}
            sub={`${stats.completedBatches} done / ${stats.failedBatches} failed`}
            color="bg-emerald-500/20 text-emerald-400"
          />
          <StatCard
            icon={<DollarSign size={16} />}
            label="Total Cost"
            value={`$${stats.totalCost.toFixed(2)}`}
            sub="Extraction costs"
            color="bg-amber-500/20 text-amber-400"
          />
          <StatCard
            icon={<Gauge size={16} />}
            label="Avg SNR"
            value={`${stats.avgSnr} dB`}
            sub="Signal-to-noise ratio"
            color="bg-blue-500/20 text-blue-400"
          />
        </div>
      )}

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white/5 border border-white/10">
          <TabsTrigger value="extraction" className="gap-1.5 data-[state=active]:bg-violet-500/20">
            <PenTool size={14} /> Extraction
          </TabsTrigger>
          <TabsTrigger value="conditioning" className="gap-1.5 data-[state=active]:bg-violet-500/20">
            <Settings2 size={14} /> Conditioning
          </TabsTrigger>
          <TabsTrigger value="batch" className="gap-1.5 data-[state=active]:bg-violet-500/20">
            <Layers size={14} /> Batch
          </TabsTrigger>
          <TabsTrigger value="fidelity" className="gap-1.5 data-[state=active]:bg-violet-500/20">
            <Target size={14} /> Fidelity
          </TabsTrigger>
          <TabsTrigger value="test" className="gap-1.5 data-[state=active]:bg-violet-500/20">
            <Sparkles size={14} /> Test Gen
          </TabsTrigger>
        </TabsList>

        {/* ── Extraction Tab ─────────────────────────────────────────── */}
        <TabsContent value="extraction" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Extraction Controls */}
            <Card className="border-white/10 bg-white/[0.02]">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <PenTool size={16} className="text-violet-400" />
                  Single Panel Extraction
                </CardTitle>
                <CardDescription>
                  Extract lineart from an individual manga panel using Canny edge detection or Anime2Sketch neural extraction.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Extraction Method</label>
                  <Select value={extractionMethod} onValueChange={(v) => setExtractionMethod(v as ExtractionMethod)}>
                    <SelectTrigger className="bg-white/5 border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="canny">Canny Edge Detection (Fast, ~80ms)</SelectItem>
                      <SelectItem value="anime2sketch">Anime2Sketch Neural (Quality, ~2.5s)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="p-3 rounded-lg bg-white/[0.03] border border-white/5 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Info size={12} />
                    {extractionMethod === "canny" ? (
                      <span>Best for action/establishing scenes with bold lines. CPU-only, no cost.</span>
                    ) : (
                      <span>Best for dialogue/reaction scenes. GPU-accelerated, ~$0.015/panel.</span>
                    )}
                  </div>
                </div>

                <Button
                  onClick={handleExtractSingle}
                  disabled={extractMutation.isPending}
                  className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500"
                >
                  {extractMutation.isPending ? (
                    <><RefreshCw size={14} className="animate-spin mr-2" /> Extracting...</>
                  ) : (
                    <><PenTool size={14} className="mr-2" /> Extract Lineart</>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Pipeline Stages Preview */}
            <Card className="border-white/10 bg-white/[0.02]">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity size={16} className="text-emerald-400" />
                  5-Stage Pipeline
                </CardTitle>
                <CardDescription>
                  Each extraction runs through 5 stages: Grayscale → Edge Detection → Noise Reduction → Threshold → Resolution Normalization
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { name: "Grayscale Conversion", desc: "Convert to single-channel luminance", icon: "🔲" },
                    { name: "Edge Detection", desc: extractionMethod === "canny" ? "Canny edge detector (σ=1.4)" : "Anime2Sketch neural network", icon: "✏️" },
                    { name: "Noise Reduction", desc: "Bilateral filter (d=9, σ=75)", icon: "🔇" },
                    { name: "Adaptive Threshold", desc: "Otsu's method for clean binary lines", icon: "⚡" },
                    { name: "Resolution Normalization", desc: "Scale to target resolution (512-1024px)", icon: "📐" },
                  ].map((stage, i) => (
                    <div key={i} className="flex items-start gap-3 p-2 rounded-lg hover:bg-white/[0.03] transition-colors">
                      <div className="w-8 h-8 rounded-full bg-violet-500/10 flex items-center justify-center text-sm shrink-0">
                        {stage.icon}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          Stage {i + 1}: {stage.name}
                        </p>
                        <p className="text-xs text-muted-foreground">{stage.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Conditioning Tab ───────────────────────────────────────── */}
        <TabsContent value="conditioning" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Scene Type Selector */}
            <Card className="border-white/10 bg-white/[0.02] lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-base">Scene Type Presets</CardTitle>
                <CardDescription>Select a scene type to load its recommended ControlNet configuration.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {(Object.keys(SCENE_TYPE_LABELS) as SceneType[]).map((st) => (
                  <button
                    key={st}
                    onClick={() => {
                      setSelectedSceneType(st);
                      // Load defaults for this scene type from config
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all",
                      "border border-white/5 hover:border-violet-500/30",
                      selectedSceneType === st
                        ? "bg-violet-500/10 border-violet-500/30"
                        : "bg-white/[0.02]"
                    )}
                  >
                    <span className="text-lg">{SCENE_TYPE_ICONS[st]}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{SCENE_TYPE_LABELS[st]}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {st === "dialogue" && "Subtle guidance, preserve expressions"}
                        {st === "action" && "Moderate control, allow dynamic motion"}
                        {st === "establishing" && "Strong adherence, preserve architecture"}
                        {st === "reaction" && "Light touch, focus on facial detail"}
                        {st === "montage" && "Balanced, mixed scene elements"}
                        {st === "transition" && "Minimal, smooth flow between scenes"}
                      </p>
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>

            {/* Conditioning Controls */}
            <Card className="border-white/10 bg-white/[0.02] lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Settings2 size={16} className="text-amber-400" />
                      ControlNet Configuration
                    </CardTitle>
                    <CardDescription>
                      Adjust conditioning parameters for {SCENE_TYPE_LABELS[selectedSceneType]} scenes
                    </CardDescription>
                  </div>
                  {config && !Array.isArray(config) && (
                    <Badge variant="outline" className={cn(
                      "text-xs",
                      (config as any).isCustom
                        ? "border-amber-500/30 text-amber-400"
                        : "border-white/20 text-muted-foreground"
                    )}>
                      {(config as any).isCustom ? "Custom" : "Default"}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* ControlNet Mode */}
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">ControlNet Mode</label>
                  <Select value={controlnetMode} onValueChange={(v) => setControlnetMode(v as ControlnetMode)}>
                    <SelectTrigger className="bg-white/5 border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="canny">Canny — Edge-based structural control</SelectItem>
                      <SelectItem value="lineart">Lineart — Clean line structural control</SelectItem>
                      <SelectItem value="lineart_anime">Lineart Anime — Anime-optimized (recommended)</SelectItem>
                      <SelectItem value="depth">Depth — Spatial depth-based control</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Strength Slider */}
                <StrengthSlider
                  value={conditioningStrength}
                  onChange={setConditioningStrength}
                />

                {/* Extraction Method */}
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Preferred Extraction Method</label>
                  <Select value={extractionMethod} onValueChange={(v) => setExtractionMethod(v as ExtractionMethod)}>
                    <SelectTrigger className="bg-white/5 border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="canny">Canny Edge Detection</SelectItem>
                      <SelectItem value="anime2sketch">Anime2Sketch Neural</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Integration Rules */}
                <Collapsible open={expandedConfig} onOpenChange={setExpandedConfig}>
                  <CollapsibleTrigger asChild>
                    <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                      {expandedConfig ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      Integration Rules & Guidance
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-3 space-y-2">
                    {stats?.integrationRules && (
                      <div className="p-3 rounded-lg bg-white/[0.03] border border-white/5 space-y-3">
                        {Object.values(stats.integrationRules as Record<string, any>).map((rule: any, i: number) => (
                          <div key={i} className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-violet-400 font-medium text-xs">{rule.sceneType}</span>
                              {rule.keyframeOnly && <Badge variant="outline" className="text-[10px] h-4 border-amber-500/30 text-amber-400">Keyframe Only</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground">{rule.lineartUsage}</p>
                            <p className="text-[10px] text-muted-foreground/60">{rule.notes}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    onClick={handleSaveConfig}
                    disabled={updateConfigMutation.isPending}
                    className="flex-1 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500"
                  >
                    {updateConfigMutation.isPending ? "Saving..." : "Save Configuration"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => resetConfigMutation.mutate({ sceneType: selectedSceneType })}
                    disabled={resetConfigMutation.isPending}
                    className="gap-1.5"
                  >
                    <RotateCcw size={14} />
                    Reset
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Batch Tab ──────────────────────────────────────────────── */}
        <TabsContent value="batch" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Batch Controls */}
            <Card className="border-white/10 bg-white/[0.02]">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers size={16} className="text-emerald-400" />
                  Batch Extraction
                </CardTitle>
                <CardDescription>
                  Extract lineart from all panels in an episode. Mixed mode auto-selects Canny for action/establishing and Anime2Sketch for dialogue/reaction.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Batch Strategy</label>
                  <Select value={batchMethod} onValueChange={(v) => setBatchMethod(v as BatchMethod)}>
                    <SelectTrigger className="bg-white/5 border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mixed">Mixed (Recommended) — Auto-select per scene type</SelectItem>
                      <SelectItem value="canny">All Canny — Fastest, CPU-only, free</SelectItem>
                      <SelectItem value="anime2sketch">All Anime2Sketch — Best quality, GPU, ~$0.75/50 panels</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-white/[0.03] border border-white/5 text-center">
                    <p className="text-xs text-muted-foreground">Est. Time (50 panels)</p>
                    <p className="text-sm font-semibold text-foreground mt-1">
                      {batchMethod === "canny" ? "<30s" : batchMethod === "anime2sketch" ? "3-5 min" : "2-4 min"}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-white/[0.03] border border-white/5 text-center">
                    <p className="text-xs text-muted-foreground">Est. Cost</p>
                    <p className="text-sm font-semibold text-foreground mt-1">
                      {batchMethod === "canny" ? "Free" : batchMethod === "anime2sketch" ? "~$0.75" : "~$0.50"}
                    </p>
                  </div>
                </div>

                <Button
                  onClick={handleBatchExtract}
                  disabled={batchMutation.isPending}
                  className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500"
                >
                  {batchMutation.isPending ? (
                    <><RefreshCw size={14} className="animate-spin mr-2" /> Processing Batch...</>
                  ) : (
                    <><Play size={14} className="mr-2" /> Start Batch Extraction</>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Batch History */}
            <Card className="border-white/10 bg-white/[0.02]">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 size={16} className="text-blue-400" />
                  Recent Batch Jobs
                </CardTitle>
              </CardHeader>
              <CardContent>
                {batchJobs.data && batchJobs.data.length > 0 ? (
                  <div className="space-y-3">
                    {batchJobs.data.map((job: any) => (
                      <div key={job.id} className="p-3 rounded-lg bg-white/[0.03] border border-white/5 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={cn(
                              "text-xs",
                              job.status === "completed" ? "border-emerald-500/30 text-emerald-400" :
                              job.status === "failed" ? "border-red-500/30 text-red-400" :
                              job.status === "running" ? "border-blue-500/30 text-blue-400" :
                              "border-white/20 text-muted-foreground"
                            )}>
                              {job.status === "completed" && <CheckCircle2 size={10} className="mr-1" />}
                              {job.status === "failed" && <XCircle size={10} className="mr-1" />}
                              {job.status === "running" && <RefreshCw size={10} className="mr-1 animate-spin" />}
                              {job.status}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{job.extractionMethod}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {job.completedPanels}/{job.totalPanels} panels
                          </span>
                        </div>
                        <Progress value={job.progressPercent} className="h-1.5" />
                        {job.failedPanels > 0 && (
                          <p className="text-xs text-red-400">
                            {job.failedPanels} panel(s) failed
                          </p>
                        )}
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>${(job.costCredits ?? 0).toFixed(4)}</span>
                          <span>{new Date(job.createdAt).toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Layers size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No batch jobs yet</p>
                    <p className="text-xs mt-1">Start a batch extraction to see results here</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Fidelity Tab ───────────────────────────────────────────── */}
        <TabsContent value="fidelity" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Fidelity Controls */}
            <Card className="border-white/10 bg-white/[0.02]">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Target size={16} className="text-amber-400" />
                  Structural Fidelity Measurement
                </CardTitle>
                <CardDescription>
                  Measure how faithfully the generated anime frame preserves the structural layout of the original manga lineart.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Panel Index</label>
                  <div className="flex items-center gap-2">
                    <Slider
                      value={[fidelityPanelIndex]}
                      onValueChange={([v]) => setFidelityPanelIndex(v)}
                      min={0}
                      max={49}
                      step={1}
                      className="flex-1"
                    />
                    <span className="text-sm font-mono text-muted-foreground w-8 text-right">
                      {fidelityPanelIndex}
                    </span>
                  </div>
                </div>

                <StrengthSlider
                  value={conditioningStrength}
                  onChange={setConditioningStrength}
                  label="Test Conditioning Strength"
                />

                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">ControlNet Mode</label>
                  <Select value={controlnetMode} onValueChange={(v) => setControlnetMode(v as ControlnetMode)}>
                    <SelectTrigger className="bg-white/5 border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.entries(MODE_LABELS) as [ControlnetMode, string][]).map(([mode, label]) => (
                        <SelectItem key={mode} value={mode}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Fidelity Results */}
            <Card className="border-white/10 bg-white/[0.02]">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Gauge size={16} className="text-blue-400" />
                  Fidelity Report
                </CardTitle>
              </CardHeader>
              <CardContent>
                {fidelity ? (
                  <div className="space-y-4">
                    {/* Overall */}
                    <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/5">
                      <div>
                        <p className="text-sm font-medium">Overall Score</p>
                        <p className="text-2xl font-bold text-foreground">{fidelity.overallScore}/100</p>
                      </div>
                      <FidelityGradeBadge grade={fidelity.overallGrade} />
                    </div>

                    {/* Metrics */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-2 rounded-lg hover:bg-white/[0.03]">
                        <div>
                          <p className="text-sm">SSIM Score</p>
                          <p className="text-xs text-muted-foreground">Structural similarity</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm">{fidelity.ssim.score.toFixed(3)}</span>
                          <FidelityGradeBadge grade={fidelity.ssim.grade} />
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-2 rounded-lg hover:bg-white/[0.03]">
                        <div>
                          <p className="text-sm">Edge Overlap</p>
                          <p className="text-xs text-muted-foreground">
                            {fidelity.edgeOverlap.matchingPixels.toLocaleString()} / {fidelity.edgeOverlap.totalLineartPixels.toLocaleString()} px
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm">{fidelity.edgeOverlap.overlapPercent}%</span>
                          <FidelityGradeBadge grade={fidelity.edgeOverlap.grade} />
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-2 rounded-lg hover:bg-white/[0.03]">
                        <div>
                          <p className="text-sm">SSIM Improvement</p>
                          <p className="text-xs text-muted-foreground">
                            Conditioned ({fidelity.ssimImprovement.conditionedSSIM.toFixed(3)}) vs Unconditioned ({fidelity.ssimImprovement.unconditionedSSIM.toFixed(3)})
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm text-emerald-400">+{fidelity.ssimImprovement.improvement.toFixed(3)}</span>
                          <FidelityGradeBadge grade={fidelity.ssimImprovement.grade} />
                        </div>
                      </div>
                    </div>

                    {/* Recommendation */}
                    <div className="p-3 rounded-lg bg-violet-500/5 border border-violet-500/20">
                      <p className="text-xs text-violet-300">{fidelity.recommendation}</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Target size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Adjust parameters to measure fidelity</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Test Generation Tab ────────────────────────────────────── */}
        <TabsContent value="test" className="space-y-4 mt-4">
          <Card className="border-white/10 bg-white/[0.02]">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles size={16} className="text-pink-400" />
                Test Image Generation
              </CardTitle>
              <CardDescription>
                Generate a test anime frame using the current ControlNet configuration to preview the effect of your lineart conditioning settings.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Scene Type</label>
                    <Select value={selectedSceneType} onValueChange={(v) => setSelectedSceneType(v as SceneType)}>
                      <SelectTrigger className="bg-white/5 border-white/10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.entries(SCENE_TYPE_LABELS) as [SceneType, string][]).map(([st, label]) => (
                          <SelectItem key={st} value={st}>{SCENE_TYPE_ICONS[st]} {label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <StrengthSlider
                    value={conditioningStrength}
                    onChange={setConditioningStrength}
                  />

                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">ControlNet Mode</label>
                    <Select value={controlnetMode} onValueChange={(v) => setControlnetMode(v as ControlnetMode)}>
                      <SelectTrigger className="bg-white/5 border-white/10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.entries(MODE_LABELS) as [ControlnetMode, string][]).map(([mode, label]) => (
                          <SelectItem key={mode} value={mode}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Seed (for reproducibility)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={testSeed}
                        onChange={(e) => setTestSeed(Number(e.target.value))}
                        className="flex-1 h-9 px-3 rounded-md bg-white/5 border border-white/10 text-sm text-foreground"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setTestSeed(Math.floor(Math.random() * 999999))}
                      >
                        Random
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Test Result Preview */}
                  {testImageMutation.data ? (
                    <div className="space-y-3">
                      <div className="aspect-video rounded-lg bg-white/[0.03] border border-white/10 flex items-center justify-center overflow-hidden">
                        <div className="text-center p-4">
                          <Image size={48} className="mx-auto mb-2 text-violet-400/50" />
                          <p className="text-sm text-muted-foreground">Simulated Result</p>
                          <p className="text-xs text-muted-foreground/70 mt-1">
                            {testImageMutation.data.imageUrl}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2 rounded bg-white/[0.03] border border-white/5">
                          <span className="text-muted-foreground">Mode:</span>{" "}
                          <span className="text-foreground">{testImageMutation.data.modeLabel}</span>
                        </div>
                        <div className="p-2 rounded bg-white/[0.03] border border-white/5">
                          <span className="text-muted-foreground">Strength:</span>{" "}
                          <span className="text-foreground">{testImageMutation.data.strengthLabel}</span>
                        </div>
                        <div className="p-2 rounded bg-white/[0.03] border border-white/5">
                          <span className="text-muted-foreground">Seed:</span>{" "}
                          <span className="text-foreground">{testImageMutation.data.seed}</span>
                        </div>
                        <div className="p-2 rounded bg-white/[0.03] border border-white/5">
                          <span className="text-muted-foreground">Cost:</span>{" "}
                          <span className="text-foreground">${testImageMutation.data.costCredits}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="aspect-video rounded-lg bg-white/[0.03] border border-white/10 border-dashed flex items-center justify-center">
                      <div className="text-center">
                        <Sparkles size={32} className="mx-auto mb-2 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">Generate a test image</p>
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          Preview your ControlNet settings
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <Button
                onClick={handleTestGenerate}
                disabled={testImageMutation.isPending}
                className="w-full bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500"
              >
                {testImageMutation.isPending ? (
                  <><RefreshCw size={14} className="animate-spin mr-2" /> Generating...</>
                ) : (
                  <><Wand2 size={14} className="mr-2" /> Generate Test Image</>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
