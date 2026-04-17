import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useParams, useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Sparkles, Loader2, Zap, CheckCircle2, AlertTriangle,
  Clock, Brain, Edit3, Save, X, RotateCcw, ChevronDown, ChevronRight,
  Download, Eye, Shield, FileText, Image as ImageIcon, Activity,
  Cpu, HardDrive, Timer, DollarSign, Star, TrendingUp,
  Play, MoreVertical, Check, XCircle, Scale,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import LoraComparisonModal from "@/components/awakli/LoraComparisonModal";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ─── Status Config ──────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; icon: typeof CheckCircle2; color: string; bg: string }> = {
  untrained:         { label: "Untrained",         icon: Clock,          color: "text-muted-foreground", bg: "bg-muted/50" },
  training:          { label: "Training",          icon: Loader2,        color: "text-cyan",             bg: "bg-cyan/10" },
  validating:        { label: "Validating",        icon: Brain,          color: "text-[var(--accent-gold)]", bg: "bg-[var(--accent-gold)]/10" },
  active:            { label: "Active",            icon: CheckCircle2,   color: "text-[var(--status-success)]", bg: "bg-[var(--status-success)]/10" },
  needs_retraining:  { label: "Needs Retraining",  icon: AlertTriangle,  color: "text-[var(--status-warning)]", bg: "bg-[var(--status-warning)]/10" },
  failed:            { label: "Failed",            icon: AlertTriangle,  color: "text-[var(--status-error)]",   bg: "bg-[var(--status-error)]/10" },
};

const VALIDATION_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending:     { label: "Pending",    color: "text-muted-foreground" },
  validating:  { label: "Validating", color: "text-[var(--accent-gold)]" },
  approved:    { label: "Approved",   color: "text-[var(--status-success)]" },
  rejected:    { label: "Rejected",   color: "text-[var(--status-error)]" },
  deprecated:  { label: "Deprecated", color: "text-muted-foreground" },
};

// ─── Training Config Modal ──────────────────────────────────────────────

// ─── Quality Badge ──────────────────────────────────────────────────────

const QUALITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  excellent: { label: "Excellent", color: "text-[var(--status-success)]", bg: "bg-[var(--status-success)]/10" },
  good:      { label: "Good",      color: "text-cyan",                    bg: "bg-cyan/10" },
  fair:      { label: "Fair",      color: "text-[var(--accent-gold)]",     bg: "bg-[var(--accent-gold)]/10" },
  poor:      { label: "Poor",      color: "text-[var(--status-error)]",    bg: "bg-[var(--status-error)]/10" },
};

const CONFIDENCE_COLORS = {
  high: "border-[var(--status-success)]/50 bg-[var(--status-success)]/5",
  medium: "border-[var(--accent-gold)]/50 bg-[var(--accent-gold)]/5",
  low: "border-[var(--status-error)]/50 bg-[var(--status-error)]/5",
};

function getConfidenceLevel(c: number) {
  if (c >= 0.85) return "high";
  if (c >= 0.70) return "medium";
  return "low";
}

// ─── Training Config Modal (Multi-step) ─────────────────────────────────

function TrainLoraModal({
  open,
  onOpenChange,
  characterId,
  characterName,
  referenceSheetUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  characterId: number;
  characterName: string;
  referenceSheetUrl: string | null;
}) {
  const [step, setStep] = useState<"preview" | "config">("preview");
  const [extractionApproved, setExtractionApproved] = useState(false);
  const [gpuType, setGpuType] = useState<"h100_sxm" | "a100_80gb" | "rtx_4090">("h100_sxm");
  const [rank, setRank] = useState(32);
  const [alpha, setAlpha] = useState(16);
  const [learningRate, setLearningRate] = useState(1e-4);
  const [trainingSteps, setTrainingSteps] = useState(800);
  const [selectedView, setSelectedView] = useState<number | null>(null);

  const utils = trpc.useUtils();

  // Reset step when modal opens
  useEffect(() => {
    if (open) {
      setStep("preview");
      setExtractionApproved(false);
      setSelectedView(null);
    }
  }, [open]);

  // Extraction preview query
  const { data: extraction, isLoading: extractionLoading } = trpc.characterLibrary.previewExtraction.useQuery(
    { referenceSheetUrl: referenceSheetUrl || "", characterName },
    { enabled: open && !!referenceSheetUrl && step === "preview" }
  );

  const { data: estimate } = trpc.characterLibrary.getTrainingEstimate.useQuery(
    { gpuType, rank, trainingSteps },
    { enabled: open && step === "config" }
  );

  const trainMutation = trpc.characterLibrary.trainLora.useMutation({
    onSuccess: (data) => {
      toast.success(`Training started for ${characterName} (v${data.version})`);
      utils.characterLibrary.getById.invalidate({ id: characterId });
      utils.characterLibrary.getVersionHistory.invalidate({ characterId });
      utils.characterLibrary.list.invalidate();
      onOpenChange(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const GPU_OPTIONS = [
    { value: "h100_sxm" as const, label: "H100 SXM", desc: "Fastest, highest quality" },
    { value: "a100_80gb" as const, label: "A100 80GB", desc: "Great balance" },
    { value: "rtx_4090" as const, label: "RTX 4090", desc: "Budget-friendly" },
  ];

  const qualityCfg = extraction ? (QUALITY_CONFIG[extraction.overallQuality] || QUALITY_CONFIG.fair) : QUALITY_CONFIG.fair;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[var(--bg-elevated)] border-white/10 max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl flex items-center gap-2">
            <Zap className="w-5 h-5 text-cyan" /> Train LoRA for {characterName}
          </DialogTitle>
          {/* Step indicator */}
          <div className="flex items-center gap-2 mt-2">
            <div className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all",
              step === "preview" ? "bg-cyan/20 text-cyan" : extractionApproved ? "bg-[var(--status-success)]/20 text-[var(--status-success)]" : "bg-white/5 text-muted-foreground"
            )}>
              {extractionApproved ? <CheckCircle2 className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              1. Verify Extraction
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
            <div className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all",
              step === "config" ? "bg-cyan/20 text-cyan" : "bg-white/5 text-muted-foreground"
            )}>
              <Cpu className="w-3 h-3" />
              2. Configure Training
            </div>
          </div>
        </DialogHeader>

        {/* ─── Step 1: Extraction Preview ─── */}
        {step === "preview" && (
          <div className="space-y-4 mt-2">
            {!referenceSheetUrl ? (
              <div className="text-center py-8">
                <AlertTriangle className="w-10 h-10 text-[var(--accent-gold)] mx-auto mb-3" />
                <p className="text-muted-foreground">No reference sheet uploaded for this character.</p>
                <p className="text-xs text-muted-foreground mt-1">Upload a reference sheet first, then return to train.</p>
              </div>
            ) : extractionLoading ? (
              <div className="text-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-cyan mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Analyzing reference sheet...</p>
                <p className="text-xs text-muted-foreground mt-1">Detecting character views and computing confidence scores</p>
              </div>
            ) : extraction ? (
              <>
                {/* Overall quality header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Extraction Quality:</span>
                    <Badge variant="outline" className={cn("text-xs", qualityCfg.color, qualityCfg.bg, "border-0")}>
                      {qualityCfg.label}
                    </Badge>
                    <span className="text-xs font-mono text-muted-foreground">
                      {(extraction.overallConfidence * 100).toFixed(0)}% avg confidence
                    </span>
                  </div>
                  <Badge variant="outline" className="text-xs border-white/10 text-muted-foreground">
                    {extraction.views.length} views detected
                  </Badge>
                </div>

                {/* Reference sheet with bounding box overlay */}
                <div className="relative rounded-lg border border-white/10 overflow-hidden bg-black/30">
                  <img
                    src={referenceSheetUrl}
                    alt={`${characterName} reference sheet`}
                    className="w-full h-auto opacity-70"
                  />
                  {/* Bounding box overlays */}
                  {extraction.views.map((view, i) => {
                    const confLevel = getConfidenceLevel(view.confidence);
                    return (
                      <button
                        key={view.viewAngle}
                        type="button"
                        className={cn(
                          "absolute border-2 rounded transition-all cursor-pointer",
                          CONFIDENCE_COLORS[confLevel],
                          selectedView === i && "ring-2 ring-cyan ring-offset-1 ring-offset-transparent"
                        )}
                        style={{
                          left: `${view.boundingBox.x * 100}%`,
                          top: `${view.boundingBox.y * 100}%`,
                          width: `${view.boundingBox.width * 100}%`,
                          height: `${view.boundingBox.height * 100}%`,
                        }}
                        onClick={() => setSelectedView(selectedView === i ? null : i)}
                      >
                        <div className="absolute -top-5 left-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-black/80 whitespace-nowrap">
                          {view.label}
                        </div>
                        <div className="absolute -bottom-5 left-0 text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/80">
                          {(view.confidence * 100).toFixed(0)}%
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* 5-panel extracted views grid */}
                <div>
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-cyan" /> Extracted Views
                  </h4>
                  <div className="grid grid-cols-5 gap-2">
                    {extraction.views.map((view, i) => {
                      const confLevel = getConfidenceLevel(view.confidence);
                      const isSelected = selectedView === i;
                      return (
                        <button
                          key={view.viewAngle}
                          type="button"
                          className={cn(
                            "rounded-lg border p-2 text-center transition-all",
                            isSelected ? "border-cyan bg-cyan/10" : "border-white/10 hover:border-white/20"
                          )}
                          onClick={() => setSelectedView(isSelected ? null : i)}
                        >
                          {/* Simulated cropped view thumbnail */}
                          <div className={cn(
                            "aspect-square rounded-md mb-2 flex items-center justify-center border",
                            CONFIDENCE_COLORS[confLevel]
                          )}>
                            <div className="text-center">
                              <ImageIcon className={cn(
                                "w-6 h-6 mx-auto mb-1",
                                confLevel === "high" ? "text-[var(--status-success)]" :
                                confLevel === "medium" ? "text-[var(--accent-gold)]" :
                                "text-[var(--status-error)]"
                              )} />
                              <span className="text-[10px] font-mono">
                                {(view.confidence * 100).toFixed(0)}%
                              </span>
                            </div>
                          </div>
                          <div className="text-[11px] font-medium truncate">{view.label}</div>
                          <div className={cn(
                            "text-[10px] mt-0.5",
                            confLevel === "high" ? "text-[var(--status-success)]" :
                            confLevel === "medium" ? "text-[var(--accent-gold)]" :
                            "text-[var(--status-error)]"
                          )}>
                            {confLevel === "high" ? "High" : confLevel === "medium" ? "Medium" : "Low"}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Selected view detail */}
                <AnimatePresence>
                  {selectedView !== null && extraction.views[selectedView] && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="rounded-lg border border-white/10 bg-[var(--bg-base)] p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <h5 className="text-sm font-medium">{extraction.views[selectedView].label}</h5>
                            <p className="text-xs text-muted-foreground mt-1">
                              Confidence: <span className="font-mono">{(extraction.views[selectedView].confidence * 100).toFixed(1)}%</span>
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Bounding box: <span className="font-mono">
                                x={extraction.views[selectedView].boundingBox.x.toFixed(2)},
                                y={extraction.views[selectedView].boundingBox.y.toFixed(2)},
                                w={extraction.views[selectedView].boundingBox.width.toFixed(2)},
                                h={extraction.views[selectedView].boundingBox.height.toFixed(2)}
                              </span>
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-white/10 text-xs"
                            onClick={() => toast.info("Manual re-crop coming soon")}
                          >
                            <Edit3 className="w-3 h-3 mr-1" /> Re-crop
                          </Button>
                        </div>
                        {extraction.views[selectedView].qualityWarning && (
                          <div className="mt-2 flex items-start gap-2 text-xs text-[var(--accent-gold)] bg-[var(--accent-gold)]/5 rounded-md p-2">
                            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            {extraction.views[selectedView].qualityWarning}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Warnings */}
                {extraction.warnings.length > 0 && (
                  <div className="rounded-lg border border-[var(--accent-gold)]/20 bg-[var(--accent-gold)]/5 p-3">
                    <h5 className="text-xs font-medium text-[var(--accent-gold)] mb-2 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> Quality Warnings
                    </h5>
                    <ul className="space-y-1">
                      {extraction.warnings.map((w, i) => (
                        <li key={i} className="text-xs text-[var(--accent-gold)]/80 flex items-start gap-1.5">
                          <span className="mt-1.5 w-1 h-1 rounded-full bg-[var(--accent-gold)]/60 shrink-0" />
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Trigger word preview */}
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Trigger word:</span>
                  <code className="px-2 py-0.5 rounded bg-cyan/10 text-cyan font-mono">{extraction.triggerWord}</code>
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* ─── Step 2: Training Config ─── */}
        {step === "config" && (
          <div className="space-y-5 mt-2">
            {/* GPU Selection */}
            <div>
              <Label className="text-sm text-muted-foreground">GPU Type</Label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {GPU_OPTIONS.map(gpu => (
                  <button
                    key={gpu.value}
                    type="button"
                    className={cn(
                      "rounded-lg border p-3 text-left transition-all",
                      gpuType === gpu.value
                        ? "border-cyan bg-cyan/10"
                        : "border-white/10 hover:border-white/20"
                    )}
                    onClick={() => setGpuType(gpu.value)}
                  >
                    <Cpu className={cn("w-4 h-4 mb-1", gpuType === gpu.value ? "text-cyan" : "text-muted-foreground")} />
                    <div className="text-sm font-medium">{gpu.label}</div>
                    <div className="text-[10px] text-muted-foreground">{gpu.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* LoRA Rank */}
            <div>
              <div className="flex justify-between items-center">
                <Label className="text-sm text-muted-foreground">LoRA Rank</Label>
                <span className="text-xs text-cyan font-mono">{rank}</span>
              </div>
              <Slider
                value={[rank]}
                onValueChange={([v]) => setRank(v)}
                min={16} max={64} step={8}
                className="mt-2"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>16 (lighter)</span>
                <span>64 (heavier)</span>
              </div>
            </div>

            {/* Alpha */}
            <div>
              <div className="flex justify-between items-center">
                <Label className="text-sm text-muted-foreground">Alpha</Label>
                <span className="text-xs text-cyan font-mono">{alpha}</span>
              </div>
              <Slider
                value={[alpha]}
                onValueChange={([v]) => setAlpha(v)}
                min={8} max={32} step={4}
                className="mt-2"
              />
            </div>

            {/* Training Steps */}
            <div>
              <div className="flex justify-between items-center">
                <Label className="text-sm text-muted-foreground">Training Steps</Label>
                <span className="text-xs text-cyan font-mono">{trainingSteps}</span>
              </div>
              <Slider
                value={[trainingSteps]}
                onValueChange={([v]) => setTrainingSteps(v)}
                min={500} max={1500} step={100}
                className="mt-2"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>500 (fast)</span>
                <span>1500 (thorough)</span>
              </div>
            </div>

            {/* Learning Rate */}
            <div>
              <Label className="text-sm text-muted-foreground">Learning Rate</Label>
              <Select
                value={String(learningRate)}
                onValueChange={(v) => setLearningRate(Number(v))}
              >
                <SelectTrigger className="mt-1 bg-[var(--bg-base)] border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[var(--bg-elevated)] border-white/10">
                  <SelectItem value="0.00005">5e-5 (Conservative)</SelectItem>
                  <SelectItem value="0.0001">1e-4 (Default)</SelectItem>
                  <SelectItem value="0.0002">2e-4 (Aggressive)</SelectItem>
                  <SelectItem value="0.0003">3e-4 (Maximum)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Cost Estimate */}
            {estimate && (
              <div className="rounded-lg border border-white/10 bg-[var(--bg-base)] p-4">
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-[var(--accent-gold)]" /> Cost Estimate
                </h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">GPU Time</span>
                    <div className="font-mono text-cyan">{estimate.estimatedMinutes.toFixed(1)} min</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Cost</span>
                    <div className="font-mono text-[var(--accent-gold)]">
                      {estimate.withMargin.costCredits.toFixed(0)} credits
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">USD Estimate</span>
                    <div className="font-mono">${estimate.withMargin.costUsd.toFixed(2)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">File Size</span>
                    <div className="font-mono">{(estimate.fileSize.avgBytes / 1024 / 1024).toFixed(0)} MB</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Footer ─── */}
        <DialogFooter className="mt-4">
          {step === "preview" ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} className="border-white/10">
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setExtractionApproved(true);
                  setStep("config");
                }}
                disabled={!extraction || extractionLoading}
                className="bg-gradient-to-r from-[var(--accent-pink)] to-[var(--accent-cyan)] text-white border-0"
              >
                <CheckCircle2 className="w-4 h-4 mr-1" />
                Approve & Continue
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep("preview")} className="border-white/10">
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button
                onClick={() => trainMutation.mutate({
                  characterId,
                  gpuType,
                  rank,
                  alpha,
                  learningRate,
                  trainingSteps,
                })}
                disabled={trainMutation.isPending}
                className="bg-gradient-to-r from-[var(--accent-pink)] to-[var(--accent-cyan)] text-white border-0"
              >
                {trainMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Zap className="w-4 h-4 mr-1" />}
                Start Training
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Version History Row ────────────────────────────────────────────────

function VersionRow({
  version,
  characterId,
  onRollback,
  onReview,
}: {
  version: any;
  characterId: number;
  onRollback: (loraId: number) => void;
  onReview: (loraId: number, decision: "approved" | "rejected") => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const params = version.trainingParams as Record<string, any> | null;
  const valStatus = VALIDATION_STATUS_CONFIG[version.validationStatus] || VALIDATION_STATUS_CONFIG.pending;

  return (
    <div className={cn(
      "rounded-lg border transition-colors",
      version.isActive
        ? "border-[var(--status-success)]/30 bg-[var(--status-success)]/5"
        : "border-white/10 bg-[var(--bg-base)]"
    )}>
      <button
        type="button"
        className="w-full flex items-center gap-3 p-4 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
            version.isActive
              ? "bg-[var(--status-success)]/20 text-[var(--status-success)]"
              : "bg-white/5 text-muted-foreground"
          )}>
            v{version.version}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Version {version.version}</span>
              {version.isActive && (
                <Badge variant="outline" className="text-[10px] border-[var(--status-success)]/30 text-[var(--status-success)] bg-[var(--status-success)]/10">
                  Active
                </Badge>
              )}
              <Badge variant="outline" className={cn("text-[10px] border-white/10", valStatus.color)}>
                {valStatus.label}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {version.triggerWord && <span className="font-mono text-pink">{version.triggerWord}</span>}
              {version.triggerWord && " · "}
              {new Date(version.createdAt).toLocaleDateString()}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {version.qualityScore != null && (
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Quality</div>
              <div className={cn(
                "text-sm font-mono font-bold",
                version.qualityScore >= 7 ? "text-[var(--status-success)]" :
                version.qualityScore >= 5 ? "text-[var(--accent-gold)]" : "text-[var(--status-error)]"
              )}>
                {version.qualityScore.toFixed(1)}
              </div>
            </div>
          )}
          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-white/5 pt-3 space-y-3">
              {/* Training params */}
              {params && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  {[
                    { label: "Rank", value: params.rank },
                    { label: "Alpha", value: params.alpha },
                    { label: "LR", value: params.learningRate },
                    { label: "Steps", value: params.trainingSteps },
                    { label: "GPU", value: params.gpuType },
                    { label: "Base Model", value: params.baseModel },
                    { label: "Optimizer", value: params.optimizer },
                    { label: "Scheduler", value: params.scheduler },
                  ].map(item => (
                    <div key={item.label} className="rounded bg-white/5 p-2">
                      <div className="text-muted-foreground">{item.label}</div>
                      <div className="font-mono text-foreground truncate">{String(item.value ?? "—")}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* File info */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <HardDrive className="w-3 h-3" />
                  {(version.artifactSizeBytes / 1024 / 1024).toFixed(0)} MB
                </span>
                <span className="flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  {version.artifactPath}
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                {/* Review buttons for pending/validating versions */}
                {(version.validationStatus === "pending" || version.validationStatus === "validating") && (
                  <>
                    <Button
                      size="sm"
                      className="bg-[var(--status-success)]/20 text-[var(--status-success)] hover:bg-[var(--status-success)]/30 border-0"
                      onClick={() => onReview(version.id, "approved")}
                    >
                      <Check className="w-3 h-3 mr-1" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-[var(--status-error)]/30 text-[var(--status-error)] hover:bg-[var(--status-error)]/10"
                      onClick={() => onReview(version.id, "rejected")}
                    >
                      <XCircle className="w-3 h-3 mr-1" /> Reject
                    </Button>
                  </>
                )}

                {/* Rollback for deprecated/approved non-active versions */}
                {!version.isActive && (version.validationStatus === "approved" || version.validationStatus === "deprecated") && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-white/10"
                    onClick={() => onRollback(version.id)}
                  >
                    <RotateCcw className="w-3 h-3 mr-1" /> Rollback to v{version.version}
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────

export default function CharacterDetail() {
  const params = useParams<{ id: string }>();
  const characterId = Number(params.id);
  const [, navigate] = useLocation();
  const searchStr = useSearch();
  const { user, loading: authLoading } = useAuth();

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [showTrainModal, setShowTrainModal] = useState(false);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const utils = trpc.useUtils();

  // Queries
  const { data: character, isLoading } = trpc.characterLibrary.getById.useQuery(
    { id: characterId },
    { enabled: !!user && !isNaN(characterId) }
  );



  const { data: versions } = trpc.characterLibrary.getVersionHistory.useQuery(
    { characterId },
    { enabled: !!user && !isNaN(characterId) }
  );

  const { data: assets } = trpc.characterLibrary.getAssets.useQuery(
    { characterId },
    { enabled: !!user && !isNaN(characterId) }
  );

  const { data: usageStats } = trpc.characterLibrary.getUsageStats.useQuery(
    { characterId },
    { enabled: !!user && !isNaN(characterId) }
  );

  // Sync edit fields when character data loads
  const syncedRef = useRef(false);
  useEffect(() => {
    if (character && !isEditing && !syncedRef.current) {
      setEditName(character.name);
      setEditDesc(character.description ?? "");
      syncedRef.current = true;
    }
  }, [character, isEditing]);

  // Auto-open train modal if ?train=1
  useEffect(() => {
    if (character && searchStr.includes("train=1") && 
        (character.loraStatus === "untrained" || character.loraStatus === "needs_retraining" || character.loraStatus === "failed")) {
      setShowTrainModal(true);
    }
  }, [character, searchStr]);

  // Mutations
  const updateMutation = trpc.characterLibrary.update.useMutation({
    onSuccess: () => {
      toast.success("Character updated");
      utils.characterLibrary.getById.invalidate({ id: characterId });
      utils.characterLibrary.list.invalidate();
      setIsEditing(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const reviewMutation = trpc.characterLibrary.reviewLora.useMutation({
    onSuccess: (data) => {
      toast.success(`LoRA ${data.decision}`);
      utils.characterLibrary.getById.invalidate({ id: characterId });
      utils.characterLibrary.getVersionHistory.invalidate({ characterId });
      utils.characterLibrary.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const rollbackMutation = trpc.characterLibrary.rollbackVersion.useMutation({
    onSuccess: (data) => {
      toast.success(`Rolled back to v${data.version}`);
      utils.characterLibrary.getById.invalidate({ id: characterId });
      utils.characterLibrary.getVersionHistory.invalidate({ characterId });
      utils.characterLibrary.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const status = character ? (STATUS_CONFIG[character.loraStatus] || STATUS_CONFIG.untrained) : STATUS_CONFIG.untrained;
  const StatusIcon = status.icon;
  const tags = character?.appearanceTags as Record<string, string> | null;

  // Auth guard
  if (!authLoading && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-void)]">
        <div className="text-center space-y-4">
          <Sparkles className="w-12 h-12 mx-auto text-muted-foreground" />
          <h2 className="font-heading text-xl">Sign in to view this character</h2>
          <Button asChild className="bg-gradient-to-r from-[var(--accent-pink)] to-[var(--accent-cyan)] text-white border-0">
            <a href={getLoginUrl(`/characters/${characterId}`)}>Sign In</a>
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-void)]">
        <Loader2 className="w-8 h-8 animate-spin text-cyan" />
      </div>
    );
  }

  if (!character) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-void)]">
        <div className="text-center space-y-4">
          <AlertTriangle className="w-12 h-12 mx-auto text-[var(--status-error)]" />
          <h2 className="font-heading text-xl">Character not found</h2>
          <Button variant="outline" onClick={() => navigate("/characters")} className="border-white/10">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Library
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-void)]">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Back button */}
        <Button
          variant="ghost"
          size="sm"
          className="mb-4 text-muted-foreground hover:text-foreground"
          onClick={() => navigate("/characters")}
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Library
        </Button>

        {/* Hero Section */}
        <div className="flex flex-col md:flex-row gap-6 mb-8">
          {/* Reference Sheet */}
          <div className="w-full md:w-72 shrink-0">
            <div className="aspect-[3/4] rounded-xl border border-white/10 overflow-hidden bg-[var(--bg-elevated)]">
              {character.referenceSheetUrl ? (
                <img
                  src={character.referenceSheetUrl}
                  alt={character.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-center">
                    <div
                      className="w-20 h-20 rounded-full mx-auto flex items-center justify-center text-3xl font-heading font-bold"
                      style={{ background: "linear-gradient(135deg, var(--accent-pink), var(--accent-cyan))" }}
                    >
                      {character.name.charAt(0).toUpperCase()}
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">No reference sheet</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Character Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                {isEditing ? (
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="font-heading text-2xl font-bold bg-[var(--bg-base)] border-white/10 mb-2"
                  />
                ) : (
                  <h1 className="font-heading text-3xl font-bold">{character.name}</h1>
                )}

                <div className="flex items-center gap-2 mt-2">
                  <Badge
                    variant="outline"
                    className={cn("text-xs border-white/20", status.bg, status.color)}
                  >
                    <StatusIcon className={cn("w-3 h-3 mr-1", character.loraStatus === "training" && "animate-spin")} />
                    {status.label}
                  </Badge>
                  {character.activeLora && (
                    <Badge variant="outline" className="text-xs border-cyan/30 text-cyan bg-cyan/10">
                      v{character.activeLora.version} · <span className="font-mono">{character.activeLora.triggerWord}</span>
                    </Badge>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {isEditing ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-white/10"
                      onClick={() => {
                        setIsEditing(false);
                        setEditName(character.name);
                        setEditDesc(character.description ?? "");
                      }}
                    >
                      <X className="w-4 h-4 mr-1" /> Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="bg-[var(--status-success)]/20 text-[var(--status-success)] hover:bg-[var(--status-success)]/30 border-0"
                      onClick={() => updateMutation.mutate({
                        id: characterId,
                        name: editName.trim() || undefined,
                        description: editDesc.trim() || undefined,
                      })}
                      disabled={updateMutation.isPending}
                    >
                      {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                      Save
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-white/10"
                      onClick={() => setIsEditing(true)}
                    >
                      <Edit3 className="w-4 h-4 mr-1" /> Edit
                    </Button>
                    {(character.loraStatus === "untrained" || character.loraStatus === "needs_retraining" || character.loraStatus === "failed") && (
                      <Button
                        size="sm"
                        className="bg-gradient-to-r from-[var(--accent-pink)] to-[var(--accent-cyan)] text-white border-0"
                        onClick={() => setShowTrainModal(true)}
                      >
                        <Zap className="w-4 h-4 mr-1" /> Train LoRA
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Description */}
            <div className="mt-4">
              {isEditing ? (
                <Textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Character description..."
                  className="bg-[var(--bg-base)] border-white/10 resize-none"
                  rows={3}
                />
              ) : (
                character.description && (
                  <p className="text-muted-foreground">{character.description}</p>
                )
              )}
            </div>

            {/* Tags */}
            {tags && Object.keys(tags).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {Object.entries(tags).map(([key, val]) => (
                  <Badge
                    key={key}
                    variant="outline"
                    className="text-xs bg-pink/10 border-pink/30 text-pink"
                  >
                    {val} {key}
                  </Badge>
                ))}
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
              {[
                { label: "LoRA Versions", value: character.versionCount, icon: Activity },
                { label: "Assets", value: character.assetCount, icon: ImageIcon },
                { label: "Generations", value: usageStats?.generationCount ?? 0, icon: TrendingUp },
                { label: "Episodes", value: usageStats?.episodeCount ?? 0, icon: Play },
              ].map(stat => (
                <div key={stat.label} className="rounded-lg border border-white/10 bg-[var(--bg-base)] p-3">
                  <stat.icon className="w-4 h-4 text-muted-foreground mb-1" />
                  <div className="text-lg font-heading font-bold">{stat.value}</div>
                  <div className="text-xs text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-[var(--bg-base)] border border-white/10">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="versions">
              Version History
              {versions && versions.length > 0 && (
                <Badge variant="outline" className="ml-1.5 text-[10px] border-white/10">
                  {versions.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="assets">
              Assets
              {assets && assets.length > 0 && (
                <Badge variant="outline" className="ml-1.5 text-[10px] border-white/10">
                  {assets.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-6 space-y-6">
            {/* Active LoRA Card */}
            {character.activeLora && (
              <div className="rounded-xl border border-[var(--status-success)]/20 bg-[var(--status-success)]/5 p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-[var(--status-success)]/20 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-[var(--status-success)]" />
                  </div>
                  <div>
                    <h3 className="font-heading font-bold">Active LoRA — v{character.activeLora.version}</h3>
                    <p className="text-xs text-muted-foreground">
                      Trigger: <span className="font-mono text-pink">{character.activeLora.triggerWord}</span>
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  {(() => {
                    const p = character.activeLora.trainingParams as Record<string, any> | null;
                    return [
                      { label: "Rank", value: p?.rank ?? "—" },
                      { label: "Steps", value: p?.trainingSteps ?? "—" },
                      { label: "Quality", value: character.activeLora.qualityScore != null ? `${character.activeLora.qualityScore.toFixed(1)}/10` : "—" },
                      { label: "Size", value: `${(character.activeLora.artifactSizeBytes / 1024 / 1024).toFixed(0)} MB` },
                    ];
                  })().map(item => (
                    <div key={item.label} className="rounded bg-white/5 p-2">
                      <div className="text-xs text-muted-foreground">{item.label}</div>
                      <div className="font-mono">{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* No LoRA state */}
            {!character.activeLora && character.loraStatus === "untrained" && (
              <div className="rounded-xl border border-dashed border-white/20 p-8 text-center">
                <Zap className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-heading text-lg font-bold mb-1">No LoRA Trained Yet</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
                  Train a LoRA to ensure this character looks consistent across all generated scenes and episodes.
                </p>
                <Button
                  onClick={() => setShowTrainModal(true)}
                  className="bg-gradient-to-r from-[var(--accent-pink)] to-[var(--accent-cyan)] text-white border-0"
                  disabled={!character.referenceSheetUrl}
                >
                  <Zap className="w-4 h-4 mr-2" /> Train LoRA
                </Button>
                {!character.referenceSheetUrl && (
                  <p className="text-xs text-[var(--status-warning)] mt-2">Upload a reference sheet first</p>
                )}
              </div>
            )}

            {/* Training in progress */}
            {(character.loraStatus === "training" || character.loraStatus === "validating") && (
              <div className="rounded-xl border border-cyan/20 bg-cyan/5 p-5">
                <div className="flex items-center gap-3 mb-3">
                  <Loader2 className="w-6 h-6 animate-spin text-cyan" />
                  <div>
                    <h3 className="font-heading font-bold">
                      {character.loraStatus === "training" ? "Training in Progress" : "Validating LoRA"}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {character.loraStatus === "training"
                        ? "Your LoRA is being trained. This typically takes 10-30 minutes."
                        : "Running quality validation checks on the trained LoRA."}
                    </p>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-cyan to-pink rounded-full"
                    initial={{ width: "10%" }}
                    animate={{ width: character.loraStatus === "validating" ? "80%" : "45%" }}
                    transition={{ duration: 2, ease: "easeOut" }}
                  />
                </div>
              </div>
            )}

            {/* Usage stats */}
            {usageStats && (usageStats.generationCount > 0 || usageStats.episodeCount > 0) && (
              <div className="rounded-xl border border-white/10 bg-[var(--bg-base)] p-5">
                <h3 className="font-heading font-bold mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-cyan" /> Usage Statistics
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div className="rounded bg-white/5 p-3">
                    <div className="text-xs text-muted-foreground">Total Generations</div>
                    <div className="text-xl font-heading font-bold text-cyan">{usageStats.generationCount}</div>
                  </div>
                  <div className="rounded bg-white/5 p-3">
                    <div className="text-xs text-muted-foreground">Episodes Used In</div>
                    <div className="text-xl font-heading font-bold">{usageStats.episodeCount}</div>
                  </div>
                  <div className="rounded bg-white/5 p-3">
                    <div className="text-xs text-muted-foreground">Avg Quality Score</div>
                    <div className={cn(
                      "text-xl font-heading font-bold",
                      usageStats.avgQualityScore >= 7 ? "text-[var(--status-success)]" :
                      usageStats.avgQualityScore >= 5 ? "text-[var(--accent-gold)]" : "text-[var(--status-error)]"
                    )}>
                      {usageStats.avgQualityScore > 0 ? usageStats.avgQualityScore.toFixed(1) : "—"}
                    </div>
                  </div>
                  <div className="rounded bg-white/5 p-3">
                    <div className="text-xs text-muted-foreground">Total Uses</div>
                    <div className="text-xl font-heading font-bold">{usageStats.usageCount ?? 0}</div>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Version History Tab */}
          <TabsContent value="versions" className="mt-6">
            {versions && versions.length > 0 ? (
              <div className="space-y-3">
                {/* A/B Compare button */}
                {versions.length >= 2 && (
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-white/10 bg-gradient-to-r from-cyan/10 to-[var(--accent-pink)]/10 hover:from-cyan/20 hover:to-[var(--accent-pink)]/20"
                      onClick={() => setShowCompareModal(true)}
                    >
                      <Scale className="w-3.5 h-3.5 mr-1.5" /> A/B Compare Versions
                    </Button>
                  </div>
                )}
                {versions.map(v => (
                  <VersionRow
                    key={v.id}
                    version={v}
                    characterId={characterId}
                    onRollback={(loraId) => rollbackMutation.mutate({ characterId, loraId })}
                    onReview={(loraId, decision) => reviewMutation.mutate({ loraId, decision })}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Activity className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No LoRA versions yet</p>
                <p className="text-xs text-muted-foreground mt-1">Train a LoRA to see version history here</p>
              </div>
            )}
          </TabsContent>

          {/* Assets Tab */}
          <TabsContent value="assets" className="mt-6">
            {assets && assets.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {assets.map(asset => (
                  <div
                    key={asset.id}
                    className="rounded-lg border border-white/10 bg-[var(--bg-base)] overflow-hidden"
                  >
                    {(asset.assetType === "reference_sheet" || asset.assetType === "reference_image") ? (
                      <div className="aspect-square">
                        <img
                          src={asset.storageUrl}
                          alt={asset.assetType}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="aspect-square flex items-center justify-center bg-[var(--bg-elevated)]">
                        <FileText className="w-8 h-8 text-muted-foreground" />
                      </div>
                    )}
                    <div className="p-3">
                      <Badge variant="outline" className="text-[10px] border-white/10 mb-1">
                        {asset.assetType.replace(/_/g, " ")}
                      </Badge>
                      <div className="text-xs text-muted-foreground">
                        v{asset.version} · {new Date(asset.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <ImageIcon className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No assets yet</p>
                <p className="text-xs text-muted-foreground mt-1">Upload reference sheets and train LoRAs to build your asset library</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Train Modal */}
      <TrainLoraModal
        open={showTrainModal}
        onOpenChange={setShowTrainModal}
        characterId={characterId}
        characterName={character.name}
        referenceSheetUrl={character.referenceSheetUrl ?? null}
      />

      {/* A/B Comparison Modal */}
      {versions && versions.length >= 2 && (
        <LoraComparisonModal
          open={showCompareModal}
          onOpenChange={setShowCompareModal}
          characterId={characterId}
          characterName={character.name}
          versions={versions.map(v => ({
            id: v.id,
            version: v.version,
            qualityScore: v.qualityScore,
            status: v.status,
            validationStatus: v.validationStatus,
            triggerWord: v.triggerWord,
            createdAt: v.createdAt,
          }))}
          activeLoraId={character.activeLoraId}
          onActivate={(loraId) => {
            rollbackMutation.mutate({ characterId, loraId });
            setShowCompareModal(false);
          }}
        />
      )}
    </div>
  );
}
