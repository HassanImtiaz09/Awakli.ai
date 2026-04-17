/**
 * Prompt 20 — Scene Type Panel
 *
 * Displays scene-type classification results, allows overrides (persisted to DB),
 * shows cost forecast breakdown, and provides dialogue preview for dialogue scenes.
 */

import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  MessageSquare,
  Swords,
  Mountain,
  ArrowRightLeft,
  SmilePlus,
  LayoutGrid,
  TrendingDown,
  DollarSign,
  BarChart3,
  Loader2,
  ChevronDown,
  ChevronUp,
  Edit3,
  Info,
  Eye,
  History,
  Check,
} from "lucide-react";
import { DialoguePreviewModal } from "./DialoguePreviewModal";

// ─── Scene Type Config ──────────────────────────────────────────────────

const SCENE_TYPES = ["dialogue", "action", "establishing", "transition", "reaction", "montage"] as const;
type SceneType = typeof SCENE_TYPES[number];

const SCENE_TYPE_CONFIG: Record<SceneType, {
  label: string;
  icon: typeof MessageSquare;
  color: string;
  bgColor: string;
  description: string;
}> = {
  dialogue: {
    label: "Dialogue",
    icon: MessageSquare,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10 border-blue-500/20",
    description: "Inpainting pipeline — 97% cost savings",
  },
  action: {
    label: "Action",
    icon: Swords,
    color: "text-red-400",
    bgColor: "bg-red-500/10 border-red-500/20",
    description: "Full Kling 2.6/3 Omni pipeline",
  },
  establishing: {
    label: "Establishing",
    icon: Mountain,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10 border-emerald-500/20",
    description: "Ken Burns engine — static image + motion",
  },
  transition: {
    label: "Transition",
    icon: ArrowRightLeft,
    color: "text-purple-400",
    bgColor: "bg-purple-500/10 border-purple-500/20",
    description: "Zero AI cost — compositing only",
  },
  reaction: {
    label: "Reaction",
    icon: SmilePlus,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10 border-amber-500/20",
    description: "Cached clips — free on cache hit",
  },
  montage: {
    label: "Montage",
    icon: LayoutGrid,
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/10 border-cyan-500/20",
    description: "Image sequence with motion",
  },
};

// ─── Scene Type Badge ───────────────────────────────────────────────────

export function SceneTypeBadge({ sceneType, size = "sm" }: { sceneType: SceneType; size?: "sm" | "md" }) {
  const config = SCENE_TYPE_CONFIG[sceneType];
  const Icon = config.icon;
  const sizeClasses = size === "md" ? "px-3 py-1.5 text-sm gap-2" : "px-2 py-0.5 text-xs gap-1";

  return (
    <span className={`inline-flex items-center rounded-md border font-medium ${config.bgColor} ${config.color} ${sizeClasses}`}>
      <Icon className={size === "md" ? "h-4 w-4" : "h-3 w-3"} />
      {config.label}
    </span>
  );
}

// ─── Distribution Bar ───────────────────────────────────────────────────

interface DistributionItem {
  sceneType: SceneType;
  count: number;
  percentage: number;
}

function DistributionBar({ distribution }: { distribution: DistributionItem[] }) {
  const colorMap: Record<SceneType, string> = {
    dialogue: "bg-blue-500",
    action: "bg-red-500",
    establishing: "bg-emerald-500",
    transition: "bg-purple-500",
    reaction: "bg-amber-500",
    montage: "bg-cyan-500",
  };

  return (
    <div className="space-y-2">
      <div className="flex h-6 rounded-full overflow-hidden bg-muted">
        {distribution.filter(d => d.count > 0).map(d => (
          <div
            key={d.sceneType}
            className={`${colorMap[d.sceneType]} transition-all duration-500 flex items-center justify-center`}
            style={{ width: `${Math.max(d.percentage, 3)}%` }}
            title={`${SCENE_TYPE_CONFIG[d.sceneType].label}: ${d.count} scenes (${d.percentage}%)`}
          >
            {d.percentage >= 10 && (
              <span className="text-[10px] font-bold text-white">{d.percentage}%</span>
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        {distribution.filter(d => d.count > 0).map(d => (
          <div key={d.sceneType} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className={`h-2.5 w-2.5 rounded-full ${colorMap[d.sceneType]}`} />
            <span>{SCENE_TYPE_CONFIG[d.sceneType].label}: {d.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Cost Forecast Card ─────────────────────────────────────────────────

interface CostForecastData {
  breakdown: Array<{
    sceneType: SceneType;
    sceneCount: number;
    totalDurationS: number;
    creditsPerScene: number;
    totalCredits: number;
    pipelineTemplate: string;
  }>;
  totalCredits: number;
  totalCostUsd: number;
  v3OmniTotalCredits: number;
  savingsPercent: number;
  summary: string;
}

function CostForecastCard({ forecast }: { forecast: CostForecastData }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-400" />
            <CardTitle className="text-base">Cost Forecast</CardTitle>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-sm font-bold">
              <TrendingDown className="h-3.5 w-3.5 mr-1" />
              {forecast.savingsPercent}% savings
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <p className="text-2xl font-bold">{forecast.totalCredits}</p>
            <p className="text-xs text-muted-foreground">Smart Routing Credits</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <p className="text-2xl font-bold text-muted-foreground line-through">{forecast.v3OmniTotalCredits}</p>
            <p className="text-xs text-muted-foreground">V3-Omni Credits</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <p className="text-2xl font-bold text-emerald-400">${forecast.totalCostUsd}</p>
            <p className="text-xs text-muted-foreground">Estimated Cost</p>
          </div>
        </div>

        {/* Expandable breakdown */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
          {expanded ? "Hide" : "Show"} per-type breakdown
        </Button>

        {expanded && (
          <div className="rounded-lg border border-border/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-muted/30">
                  <th className="text-left px-3 py-2 font-medium">Type</th>
                  <th className="text-right px-3 py-2 font-medium">Scenes</th>
                  <th className="text-right px-3 py-2 font-medium">Duration</th>
                  <th className="text-right px-3 py-2 font-medium">Credits</th>
                  <th className="text-left px-3 py-2 font-medium">Pipeline</th>
                </tr>
              </thead>
              <tbody>
                {forecast.breakdown.filter(b => b.sceneCount > 0).map(b => (
                  <tr key={b.sceneType} className="border-b border-border/30 last:border-0">
                    <td className="px-3 py-2">
                      <SceneTypeBadge sceneType={b.sceneType} />
                    </td>
                    <td className="text-right px-3 py-2 tabular-nums">{b.sceneCount}</td>
                    <td className="text-right px-3 py-2 tabular-nums text-muted-foreground">
                      {Math.round(b.totalDurationS)}s
                    </td>
                    <td className="text-right px-3 py-2 tabular-nums font-medium">
                      {b.totalCredits.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground font-mono">
                      {b.pipelineTemplate}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Scene Classification Table ─────────────────────────────────────────

interface SceneClassificationRow {
  sceneId: number;
  sceneNumber: number;
  panelCount: number;
  estimatedDurationS: number;
  sceneType: SceneType;
  confidence: number;
  pipelineTemplate: string;
  matchedRule: string;
  stageSkips: number[];
  stageExplanation: string;
  creditsPerTenS: number;
  estimatedCredits: number;
  /** DB classification ID (set after persistence) */
  classificationId?: number;
  /** Whether this scene has a creator override */
  isOverridden?: boolean;
}

interface OverrideDialogState {
  open: boolean;
  sceneId: number | null;
  classificationId: number | null;
  currentType: SceneType;
  newType: SceneType;
  reason: string;
}

function SceneClassificationTable({
  scenes,
  onOverride,
  onPreviewDialogue,
  overridePending,
}: {
  scenes: SceneClassificationRow[];
  onOverride?: (sceneId: number, classificationId: number | undefined, newType: SceneType, reason: string) => void;
  onPreviewDialogue?: (scene: SceneClassificationRow) => void;
  overridePending?: boolean;
}) {
  const [overrideDialog, setOverrideDialog] = useState<OverrideDialogState>({
    open: false,
    sceneId: null,
    classificationId: null,
    currentType: "dialogue",
    newType: "dialogue",
    reason: "",
  });

  const openOverride = (scene: SceneClassificationRow) => {
    setOverrideDialog({
      open: true,
      sceneId: scene.sceneId,
      classificationId: scene.classificationId ?? null,
      currentType: scene.sceneType,
      newType: scene.sceneType,
      reason: "",
    });
  };

  const confirmOverride = () => {
    if (overrideDialog.sceneId && overrideDialog.reason.trim() && onOverride) {
      onOverride(
        overrideDialog.sceneId,
        overrideDialog.classificationId ?? undefined,
        overrideDialog.newType,
        overrideDialog.reason,
      );
    }
    setOverrideDialog(prev => ({ ...prev, open: false }));
  };

  return (
    <>
      <div className="rounded-lg border border-border/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/50 bg-muted/30">
              <th className="text-left px-3 py-2 font-medium">Scene</th>
              <th className="text-left px-3 py-2 font-medium">Type</th>
              <th className="text-right px-3 py-2 font-medium">Conf.</th>
              <th className="text-right px-3 py-2 font-medium">Panels</th>
              <th className="text-right px-3 py-2 font-medium">Duration</th>
              <th className="text-right px-3 py-2 font-medium">Credits</th>
              <th className="text-left px-3 py-2 font-medium">Rule</th>
              <th className="text-center px-3 py-2 font-medium">Skips</th>
              <th className="text-center px-3 py-2 font-medium w-20"></th>
            </tr>
          </thead>
          <tbody>
            {scenes.map(s => (
              <tr key={s.sceneId} className="border-b border-border/30 last:border-0 hover:bg-muted/20">
                <td className="px-3 py-2 font-mono text-muted-foreground">#{s.sceneNumber}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <SceneTypeBadge sceneType={s.sceneType} />
                    {s.isOverridden && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-amber-500/10 text-amber-400 border-amber-500/20">
                              <History className="h-2.5 w-2.5 mr-0.5" />
                              overridden
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">This scene type was manually overridden by a creator</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                </td>
                <td className="text-right px-3 py-2 tabular-nums">
                  <span className={s.confidence >= 0.8 ? "text-emerald-400" : s.confidence >= 0.6 ? "text-amber-400" : "text-red-400"}>
                    {(s.confidence * 100).toFixed(0)}%
                  </span>
                </td>
                <td className="text-right px-3 py-2 tabular-nums">{s.panelCount}</td>
                <td className="text-right px-3 py-2 tabular-nums text-muted-foreground">{s.estimatedDurationS}s</td>
                <td className="text-right px-3 py-2 tabular-nums font-medium">{s.estimatedCredits.toFixed(4)}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground max-w-[150px] truncate" title={s.matchedRule}>
                  {s.matchedRule}
                </td>
                <td className="text-center px-3 py-2">
                  {s.stageSkips.length > 0 ? (
                    <span className="text-xs text-purple-400" title={s.stageExplanation}>
                      {s.stageSkips.join(",")}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="text-center px-3 py-1">
                  <div className="flex items-center justify-center gap-0.5">
                    {/* Dialogue preview button — only for dialogue scenes */}
                    {s.sceneType === "dialogue" && onPreviewDialogue && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-blue-400 hover:text-blue-300"
                        onClick={() => onPreviewDialogue(s)}
                        title="Preview dialogue pipeline"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {/* Override button */}
                    {onOverride && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => openOverride(s)}
                        title="Override scene type"
                        disabled={overridePending}
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Override Dialog */}
      <Dialog open={overrideDialog.open} onOpenChange={(open) => setOverrideDialog(prev => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Override Scene Type</DialogTitle>
            <DialogDescription>
              Change the scene type classification. This affects the pipeline template and cost.
              {overrideDialog.classificationId
                ? " The override will be saved to the database."
                : " Classify first to enable persistent overrides."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Current Type</label>
              <SceneTypeBadge sceneType={overrideDialog.currentType} size="md" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">New Type</label>
              <Select
                value={overrideDialog.newType}
                onValueChange={(v) => setOverrideDialog(prev => ({ ...prev, newType: v as SceneType }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCENE_TYPES.map(st => (
                    <SelectItem key={st} value={st}>
                      <span className="flex items-center gap-2">
                        <SceneTypeBadge sceneType={st} />
                        <span className="text-xs text-muted-foreground">{SCENE_TYPE_CONFIG[st].description}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Reason</label>
              <Textarea
                placeholder="Why are you overriding this classification?"
                value={overrideDialog.reason}
                onChange={(e) => setOverrideDialog(prev => ({ ...prev, reason: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideDialog(prev => ({ ...prev, open: false }))}>
              Cancel
            </Button>
            <Button
              onClick={confirmOverride}
              disabled={!overrideDialog.reason.trim() || overrideDialog.newType === overrideDialog.currentType || overridePending}
            >
              {overridePending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Saving...
                </>
              ) : (
                "Apply Override"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Main Scene Type Panel ──────────────────────────────────────────────

interface SceneTypePanelProps {
  episodeId: number;
  scenes: Array<{
    sceneId: number;
    sceneNumber: number;
    panels: Array<{
      panelId: number;
      visualDescription: string;
      cameraAngle?: string;
      dialogue: Array<{ character?: string; text: string }>;
      panelSizePct?: number;
    }>;
    estimatedDurationS?: number;
  }>;
  onClassificationComplete?: (data: any) => void;
}

export function SceneTypePanel({ episodeId, scenes, onClassificationComplete }: SceneTypePanelProps) {
  const [classificationResult, setClassificationResult] = useState<any>(null);
  const [dialoguePreviewOpen, setDialoguePreviewOpen] = useState(false);
  const [dialoguePreviewScene, setDialoguePreviewScene] = useState<SceneClassificationRow | null>(null);

  const utils = trpc.useUtils();

  // ─── Load persisted classifications from DB ────────────────────────
  const persistedClassifications = trpc.sceneType.getEpisodeClassifications.useQuery(
    { episodeId },
    { enabled: !!episodeId },
  );

  // Build a map of sceneId → persisted classification for merging
  const persistedMap = useMemo(() => {
    const map = new Map<number, {
      id: number;
      sceneType: string;
      confidence: string | null;
      creatorOverride: boolean;
      pipelineTemplate: string;
    }>();
    if (persistedClassifications.data) {
      for (const row of persistedClassifications.data) {
        map.set(row.sceneId, row);
      }
    }
    return map;
  }, [persistedClassifications.data]);

  // ─── Classify mutation ─────────────────────────────────────────────
  const saveClassificationsMutation = trpc.sceneType.saveClassifications.useMutation({
    onSuccess: () => {
      utils.sceneType.getEpisodeClassifications.invalidate({ episodeId });
    },
    onError: (err) => {
      // Non-blocking — classification still works locally
      console.warn("Failed to persist classifications:", err.message);
    },
  });

  const classifyMutation = trpc.sceneType.classifyEpisode.useMutation({
    onSuccess: (data) => {
      setClassificationResult(data);
      onClassificationComplete?.(data);
      toast.success(`${data.totalScenes} scenes classified. ${data.forecast.savingsPercent}% savings vs V3-Omni.`);

      // Persist classifications to DB
      saveClassificationsMutation.mutate({
        episodeId,
        classifications: data.perScene.map((s: any) => ({
          sceneId: s.sceneId,
          sceneType: s.sceneType,
          confidence: s.confidence,
          metadata: {
            panelCount: s.panelCount,
            estimatedDurationS: s.estimatedDurationS,
            matchedRule: s.matchedRule,
          },
          pipelineTemplate: s.pipelineTemplate,
          matchedRule: s.matchedRule,
        })),
      });
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  // ─── Override mutation (DB-persisted) ──────────────────────────────
  const overrideMutation = trpc.sceneType.overrideSceneType.useMutation({
    onSuccess: (result) => {
      // Update local state
      if (classificationResult) {
        const updated = { ...classificationResult };
        const sceneIdx = updated.perScene.findIndex(
          (s: any) => persistedMap.get(s.sceneId)?.id === result.sceneClassificationId,
        );
        if (sceneIdx >= 0) {
          updated.perScene[sceneIdx] = {
            ...updated.perScene[sceneIdx],
            sceneType: result.newType,
            matchedRule: `Override: ${result.originalType} → ${result.newType}`,
            confidence: 1.0,
            pipelineTemplate: result.pipelineTemplate,
            creditsPerTenS: result.creditsPerTenS,
          };
          setClassificationResult(updated);
        }
      }
      // Invalidate persisted data
      utils.sceneType.getEpisodeClassifications.invalidate({ episodeId });
      toast.success(`Scene type overridden to ${SCENE_TYPE_CONFIG[result.newType as SceneType]?.label || result.newType}`);
    },
    onError: (err) => {
      toast.error(`Override failed: ${err.message}`);
    },
  });

  const handleClassify = () => {
    classifyMutation.mutate({
      episodeId,
      scenes: scenes.map(s => ({
        sceneId: s.sceneId,
        sceneNumber: s.sceneNumber,
        panels: s.panels.map(p => ({
          panelId: p.panelId,
          visualDescription: p.visualDescription,
          cameraAngle: p.cameraAngle,
          dialogue: p.dialogue,
          panelSizePct: p.panelSizePct || 50,
        })),
        estimatedDurationS: s.estimatedDurationS || 10,
      })),
    });
  };

  const handleOverride = (sceneId: number, classificationId: number | undefined, newType: SceneType, reason: string) => {
    if (classificationId) {
      // Persist to DB via overrideSceneType mutation
      overrideMutation.mutate({
        sceneClassificationId: classificationId,
        newSceneType: newType,
        reason,
      });
    } else {
      // Fallback: apply locally if no DB classification exists yet
      if (!classificationResult) return;
      const updated = { ...classificationResult };
      const sceneIdx = updated.perScene.findIndex((s: any) => s.sceneId === sceneId);
      if (sceneIdx >= 0) {
        updated.perScene[sceneIdx] = {
          ...updated.perScene[sceneIdx],
          sceneType: newType,
          matchedRule: `Override: ${reason}`,
          confidence: 1.0,
        };
        setClassificationResult(updated);
        toast.success(`Scene #${updated.perScene[sceneIdx].sceneNumber} changed to ${SCENE_TYPE_CONFIG[newType].label}`);
      }
    }
  };

  const handlePreviewDialogue = (scene: SceneClassificationRow) => {
    setDialoguePreviewScene(scene);
    setDialoguePreviewOpen(true);
  };

  // ─── Merge persisted overrides into classification result ──────────
  const enrichedPerScene = useMemo(() => {
    if (!classificationResult?.perScene) return [];
    return classificationResult.perScene.map((s: any) => {
      const persisted = persistedMap.get(s.sceneId);
      return {
        ...s,
        classificationId: persisted?.id,
        isOverridden: persisted?.creatorOverride ?? false,
        // If persisted type differs from local (e.g., loaded from DB), use persisted
        ...(persisted?.creatorOverride ? {
          sceneType: persisted.sceneType,
          confidence: 1.0,
          matchedRule: `Override (persisted)`,
        } : {}),
      };
    });
  }, [classificationResult, persistedMap]);

  // Build dialogue lines for preview from scene panels
  const dialogueLinesForPreview = useMemo(() => {
    if (!dialoguePreviewScene) return undefined;
    const scene = scenes.find(s => s.sceneId === dialoguePreviewScene.sceneId);
    if (!scene) return undefined;

    const lines: Array<{ character: string; text: string; emotion: string; startTimeS: number; endTimeS: number }> = [];
    let timeOffset = 0;
    for (const panel of scene.panels) {
      for (const d of panel.dialogue) {
        const duration = Math.max(2, (d.text?.length || 10) * 0.1);
        lines.push({
          character: d.character || "Character",
          text: d.text || "",
          emotion: "neutral",
          startTimeS: timeOffset,
          endTimeS: timeOffset + duration,
        });
        timeOffset += duration + 0.5;
      }
    }
    return lines.length > 0 ? lines : undefined;
  }, [dialoguePreviewScene, scenes]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="border-border/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Scene-Type Classification
              </CardTitle>
              <CardDescription className="mt-1">
                Classify scenes to select optimal pipelines and estimate costs before starting the pipeline.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {persistedClassifications.data && persistedClassifications.data.length > 0 && !classificationResult && (
                <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                  <Check className="h-3 w-3 mr-1" />
                  {persistedClassifications.data.length} saved
                </Badge>
              )}
              <Button
                onClick={handleClassify}
                disabled={classifyMutation.isPending || scenes.length === 0}
                size="lg"
              >
                {classifyMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Classifying...
                  </>
                ) : (
                  <>
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Classify {scenes.length} Scenes
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        {!classificationResult && (
          <CardContent>
            <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/30 rounded-lg p-3">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <p>
                Scene-type classification analyzes each scene's panels to determine the optimal pipeline:
                dialogue scenes use inpainting (97% savings), establishing shots use Ken Burns,
                transitions are compositing-only (free), and action scenes get full Kling 2.6/3 Omni.
              </p>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Results */}
      {classificationResult && (
        <>
          {/* Distribution */}
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Scene Type Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <DistributionBar distribution={classificationResult.distribution} />
            </CardContent>
          </Card>

          {/* Cost Forecast */}
          <CostForecastCard forecast={classificationResult.forecast} />

          {/* Per-scene table */}
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Per-Scene Classification</CardTitle>
                <div className="flex items-center gap-2">
                  {saveClassificationsMutation.isSuccess && (
                    <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                      <Check className="h-2.5 w-2.5 mr-0.5" />
                      Saved to DB
                    </Badge>
                  )}
                  <span className="text-sm text-muted-foreground">
                    {classificationResult.totalScenes} scenes
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <SceneClassificationTable
                scenes={enrichedPerScene}
                onOverride={handleOverride}
                onPreviewDialogue={handlePreviewDialogue}
                overridePending={overrideMutation.isPending}
              />
            </CardContent>
          </Card>
        </>
      )}

      {/* Dialogue Preview Modal */}
      <DialoguePreviewModal
        open={dialoguePreviewOpen}
        onOpenChange={setDialoguePreviewOpen}
        initialDurationS={dialoguePreviewScene?.estimatedDurationS}
        initialDialogueLines={dialogueLinesForPreview}
      />
    </div>
  );
}

export default SceneTypePanel;
