/**
 * Dialogue Preview Modal
 *
 * Lets creators preview the viseme timeline, blink schedule, head motion,
 * cost breakdown, and 7-stage pipeline plan for a dialogue scene
 * before committing to generation.
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Loader2,
  MessageSquare,
  Eye,
  Move,
  DollarSign,
  Layers,
  TrendingDown,
  Play,
  ChevronDown,
  ChevronUp,
  Clock,
  Cpu,
  Zap,
} from "lucide-react";

// ─── Viseme Colors ─────────────────────────────────────────────────────

const VISEME_COLORS: Record<string, string> = {
  A: "bg-red-500",
  I: "bg-blue-500",
  U: "bg-purple-500",
  E: "bg-amber-500",
  O: "bg-emerald-500",
  Closed: "bg-slate-600",
  N: "bg-cyan-500",
  Rest: "bg-zinc-700",
};

const VISEME_LABELS: Record<string, string> = {
  A: "A (open)",
  I: "I (smile)",
  U: "U (pucker)",
  E: "E (mid)",
  O: "O (round)",
  Closed: "Closed",
  N: "N (nasal)",
  Rest: "Rest",
};

// ─── Viseme Timeline Visualization ─────────────────────────────────────

function VisemeTimelineBar({
  frames,
  totalFrames,
  blinkEvents,
}: {
  frames: Array<{ viseme: string; frameIndex: number; timeS: number }>;
  totalFrames: number;
  blinkEvents: Array<{ startFrame: number; endFrame: number }>;
}) {
  // Group consecutive same-viseme frames for cleaner rendering
  const segments: Array<{ viseme: string; startIdx: number; endIdx: number; startTimeS: number }> = [];
  let current: typeof segments[0] | null = null;

  for (const f of frames) {
    if (current && current.viseme === f.viseme) {
      current.endIdx = f.frameIndex;
    } else {
      if (current) segments.push(current);
      current = { viseme: f.viseme, startIdx: f.frameIndex, endIdx: f.frameIndex, startTimeS: f.timeS };
    }
  }
  if (current) segments.push(current);

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground font-medium mb-1">Viseme Timeline</div>
      <div className="relative">
        {/* Main timeline bar */}
        <div className="flex h-8 rounded-md overflow-hidden bg-muted/30 border border-border/50">
          {segments.map((seg, i) => {
            const widthPct = ((seg.endIdx - seg.startIdx + 1) / totalFrames) * 100;
            return (
              <div
                key={i}
                className={`${VISEME_COLORS[seg.viseme]} transition-all hover:brightness-125 relative group`}
                style={{ width: `${Math.max(widthPct, 0.5)}%` }}
                title={`${seg.viseme} (frames ${seg.startIdx}-${seg.endIdx}, ${seg.startTimeS.toFixed(2)}s)`}
              >
                {widthPct > 4 && (
                  <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white/90">
                    {seg.viseme}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Blink markers */}
        <div className="relative h-3 mt-1">
          {blinkEvents.map((b, i) => {
            const leftPct = (b.startFrame / totalFrames) * 100;
            const widthPct = ((b.endFrame - b.startFrame) / totalFrames) * 100;
            return (
              <div
                key={i}
                className="absolute top-0 h-3 bg-yellow-400/60 rounded-sm border border-yellow-500/40"
                style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 0.5)}%` }}
                title={`Blink: frames ${b.startFrame}-${b.endFrame}`}
              />
            );
          })}
          <span className="absolute -top-0.5 right-0 text-[9px] text-muted-foreground">
            {blinkEvents.length} blinks
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 mt-2">
        {Object.entries(VISEME_COLORS).map(([viseme, color]) => (
          <div key={viseme} className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <div className={`h-2 w-2 rounded-sm ${color}`} />
            {VISEME_LABELS[viseme]}
          </div>
        ))}
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <div className="h-2 w-2 rounded-sm bg-yellow-400/60 border border-yellow-500/40" />
          Blink
        </div>
      </div>
    </div>
  );
}

// ─── Viseme Distribution ───────────────────────────────────────────────

function VisemeDistribution({ distribution }: { distribution: Record<string, number> }) {
  const total = Object.values(distribution).reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  const sorted = Object.entries(distribution).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground font-medium">Viseme Distribution</div>
      <div className="grid grid-cols-4 gap-2">
        {sorted.map(([viseme, count]) => (
          <div key={viseme} className="flex items-center gap-2 rounded-md bg-muted/30 px-2 py-1.5">
            <div className={`h-3 w-3 rounded-sm ${VISEME_COLORS[viseme]}`} />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium">{viseme}</div>
              <div className="text-[10px] text-muted-foreground">
                {count} ({Math.round((count / total) * 100)}%)
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Head Motion Chart ─────────────────────────────────────────────────

function HeadMotionPreview({
  motion,
}: {
  motion: Array<{ frameIndex: number; rotationDeg: number; translationX: number; translationY: number }>;
}) {
  // Show a simplified sparkline-style visualization
  const maxRot = Math.max(...motion.map(m => Math.abs(m.rotationDeg)), 1);
  const maxTx = Math.max(...motion.map(m => Math.abs(m.translationX)), 1);
  const maxTy = Math.max(...motion.map(m => Math.abs(m.translationY)), 1);

  // Sample every Nth frame for display
  const sampleRate = Math.max(1, Math.floor(motion.length / 60));
  const sampled = motion.filter((_, i) => i % sampleRate === 0);

  const renderSparkline = (
    data: typeof sampled,
    getValue: (m: typeof sampled[0]) => number,
    maxVal: number,
    color: string,
    label: string,
  ) => {
    const height = 24;
    const mid = height / 2;

    return (
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground w-16 shrink-0">{label}</span>
        <svg viewBox={`0 0 ${sampled.length} ${height}`} className="flex-1 h-6" preserveAspectRatio="none">
          <line x1="0" y1={mid} x2={sampled.length} y2={mid} stroke="currentColor" strokeOpacity="0.1" />
          <polyline
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            points={sampled.map((m, i) => `${i},${mid - (getValue(m) / maxVal) * mid}`).join(" ")}
          />
        </svg>
        <span className="text-[10px] text-muted-foreground w-12 text-right shrink-0">
          {maxVal.toFixed(1)}{label.includes("Rot") ? "°" : "px"}
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground font-medium">Head Motion Preview</div>
      <div className="space-y-1 rounded-md bg-muted/30 p-2 border border-border/50">
        {renderSparkline(sampled, m => m.rotationDeg, maxRot, "#60a5fa", "Rotation")}
        {renderSparkline(sampled, m => m.translationX, maxTx, "#34d399", "Trans X")}
        {renderSparkline(sampled, m => m.translationY, maxTy, "#f472b6", "Trans Y")}
      </div>
      <div className="text-[10px] text-muted-foreground">
        {motion.length} frames sampled at {sampleRate > 1 ? `1/${sampleRate}` : "1:1"} rate.
        Subtle sinusoidal motion for natural head bobbing.
      </div>
    </div>
  );
}

// ─── Cost Breakdown ────────────────────────────────────────────────────

function CostBreakdown({
  cost,
}: {
  cost: {
    baseFrameCredits: number;
    inpaintingCredits: number;
    rifeCredits: number;
    totalCredits: number;
    comparedToFullVideo: number;
    savingsPercent: number;
  };
}) {
  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
        <DollarSign className="h-3.5 w-3.5" />
        Cost Estimate
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md bg-muted/30 p-2 border border-border/50">
          <div className="text-lg font-bold text-emerald-400">{cost.totalCredits.toFixed(4)}</div>
          <div className="text-[10px] text-muted-foreground">Dialogue Pipeline</div>
        </div>
        <div className="rounded-md bg-muted/30 p-2 border border-border/50">
          <div className="text-lg font-bold text-muted-foreground line-through">{cost.comparedToFullVideo.toFixed(4)}</div>
          <div className="text-[10px] text-muted-foreground">Full Video (Kling)</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-xs font-bold">
          <TrendingDown className="h-3 w-3 mr-1" />
          {cost.savingsPercent}% savings
        </Badge>
      </div>
      <div className="space-y-1.5">
        <CostRow label="Base Frame Generation" credits={cost.baseFrameCredits} />
        <CostRow label="Mouth Inpainting" credits={cost.inpaintingCredits} />
        <CostRow label="RIFE Interpolation" credits={cost.rifeCredits} />
      </div>
    </div>
  );
}

function CostRow({ label, credits }: { label: string; credits: number }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums">{credits.toFixed(4)}</span>
    </div>
  );
}

// ─── Pipeline Plan ─────────────────────────────────────────────────────

function PipelinePlanDisplay({
  plan,
}: {
  plan: {
    stages: Array<{
      name: string;
      description: string;
      provider: string | null;
      fallbackProvider: string | null;
      estimatedCredits: number;
      frameCount: number;
    }>;
    totalInpaintFrames: number;
    totalOutputFrames: number;
    estimatedTotalCredits: number;
  };
}) {
  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
        <Layers className="h-3.5 w-3.5" />
        7-Stage Pipeline Plan
      </div>
      <div className="space-y-1.5">
        {plan.stages.map((stage, i) => (
          <div
            key={stage.name}
            className="flex items-start gap-2 rounded-md bg-muted/30 p-2 border border-border/50"
          >
            <div className="flex items-center justify-center h-5 w-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold shrink-0 mt-0.5">
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">{formatStageName(stage.name)}</span>
                {stage.provider && (
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">
                    <Cpu className="h-2.5 w-2.5 mr-0.5" />
                    {stage.provider}
                  </Badge>
                )}
                {!stage.provider && (
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 text-emerald-400 border-emerald-500/20">
                    <Zap className="h-2.5 w-2.5 mr-0.5" />
                    No AI
                  </Badge>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{stage.description}</div>
              <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                <span>{stage.frameCount} frames</span>
                <span>{stage.estimatedCredits.toFixed(4)} credits</span>
                {stage.fallbackProvider && (
                  <span className="text-amber-400">fallback: {stage.fallbackProvider}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between text-xs bg-muted/30 rounded-md p-2 border border-border/50">
        <span className="text-muted-foreground">
          {plan.totalInpaintFrames} inpaint frames → {plan.totalOutputFrames} output frames
        </span>
        <span className="font-bold">{plan.estimatedTotalCredits.toFixed(4)} total credits</span>
      </div>
    </div>
  );
}

function formatStageName(name: string): string {
  return name
    .split("_")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ─── Dialogue Line Input ───────────────────────────────────────────────

interface DialogueLineInput {
  character: string;
  text: string;
  emotion: string;
  startTimeS: number;
  endTimeS: number;
}

function DialogueLineEditor({
  lines,
  onChange,
  durationS,
}: {
  lines: DialogueLineInput[];
  onChange: (lines: DialogueLineInput[]) => void;
  durationS: number;
}) {
  const addLine = () => {
    const lastEnd = lines.length > 0 ? lines[lines.length - 1].endTimeS : 0;
    const newStart = Math.min(lastEnd + 0.5, durationS - 1);
    const newEnd = Math.min(newStart + 3, durationS);
    onChange([...lines, { character: "Character", text: "Hello, world!", emotion: "neutral", startTimeS: newStart, endTimeS: newEnd }]);
  };

  const updateLine = (idx: number, field: keyof DialogueLineInput, value: string | number) => {
    const updated = [...lines];
    (updated[idx] as any)[field] = value;
    onChange(updated);
  };

  const removeLine = (idx: number) => {
    onChange(lines.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
        <MessageSquare className="h-3.5 w-3.5" />
        Dialogue Lines
      </div>
      {lines.map((line, i) => (
        <div key={i} className="grid grid-cols-[1fr_2fr_80px_80px_32px] gap-1.5 items-center">
          <Input
            className="h-7 text-xs"
            placeholder="Character"
            value={line.character}
            onChange={(e) => updateLine(i, "character", e.target.value)}
          />
          <Input
            className="h-7 text-xs"
            placeholder="Dialogue text"
            value={line.text}
            onChange={(e) => updateLine(i, "text", e.target.value)}
          />
          <Input
            className="h-7 text-xs"
            type="number"
            step="0.5"
            min="0"
            max={durationS}
            placeholder="Start"
            value={line.startTimeS}
            onChange={(e) => updateLine(i, "startTimeS", parseFloat(e.target.value) || 0)}
          />
          <Input
            className="h-7 text-xs"
            type="number"
            step="0.5"
            min="0"
            max={durationS}
            placeholder="End"
            value={line.endTimeS}
            onChange={(e) => updateLine(i, "endTimeS", parseFloat(e.target.value) || 0)}
          />
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400" onClick={() => removeLine(i)}>
            ×
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="w-full text-xs h-7" onClick={addLine}>
        + Add Dialogue Line
      </Button>
    </div>
  );
}

// ─── Main Modal ────────────────────────────────────────────────────────

interface DialoguePreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-fill with scene data if available */
  initialDurationS?: number;
  initialDialogueLines?: DialogueLineInput[];
}

export function DialoguePreviewModal({
  open,
  onOpenChange,
  initialDurationS = 10,
  initialDialogueLines,
}: DialoguePreviewModalProps) {
  const [durationS, setDurationS] = useState(initialDurationS);
  const [dialogueLines, setDialogueLines] = useState<DialogueLineInput[]>(
    initialDialogueLines || [
      { character: "Sakura", text: "I never thought it would end like this.", emotion: "sad", startTimeS: 0.5, endTimeS: 4.0 },
      { character: "Hiro", text: "It doesn't have to. We still have a choice.", emotion: "determined", startTimeS: 4.5, endTimeS: 8.0 },
    ],
  );
  const [showConfig, setShowConfig] = useState(false);

  const previewMutation = trpc.sceneType.previewDialogue.useMutation({
    onError: (err) => {
      toast.error(`Preview failed: ${err.message}`);
    },
  });

  const handlePreview = () => {
    previewMutation.mutate({
      durationS,
      cameraAngles: ["front"],
      dialogueLines: dialogueLines.map(l => ({
        character: l.character,
        text: l.text,
        emotion: l.emotion || undefined,
        startTimeS: l.startTimeS,
        endTimeS: l.endTimeS,
      })),
    });
  };

  const data = previewMutation.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-blue-400" />
            Dialogue Pipeline Preview
          </DialogTitle>
          <DialogDescription>
            Preview the viseme timeline, blink schedule, head motion, and cost estimate
            for a dialogue scene before committing to generation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Configuration */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={() => setShowConfig(!showConfig)}
              >
                {showConfig ? <ChevronUp className="h-3.5 w-3.5 mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}
                {showConfig ? "Hide" : "Show"} Configuration
              </Button>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                Duration:
                <Input
                  className="h-7 w-16 text-xs"
                  type="number"
                  min="1"
                  max="120"
                  value={durationS}
                  onChange={(e) => setDurationS(Math.max(1, Math.min(120, parseInt(e.target.value) || 10)))}
                />
                seconds
              </div>
            </div>

            {showConfig && (
              <DialogueLineEditor
                lines={dialogueLines}
                onChange={setDialogueLines}
                durationS={durationS}
              />
            )}

            <Button
              onClick={handlePreview}
              disabled={previewMutation.isPending}
              className="w-full"
            >
              {previewMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating Preview...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Generate Preview
                </>
              )}
            </Button>
          </div>

          {/* Results */}
          {data && (
            <div className="space-y-5 border-t border-border/50 pt-4">
              {/* Stats bar */}
              <div className="grid grid-cols-4 gap-2">
                <StatCard label="Duration" value={`${data.durationS}s`} />
                <StatCard label="Total Frames" value={data.totalFrames.toString()} />
                <StatCard label="Inpaint FPS" value={data.inpaintFps.toString()} />
                <StatCard label="Output FPS" value={data.outputFps.toString()} />
              </div>

              {/* Viseme Timeline */}
              <VisemeTimelineBar
                frames={data.visemeTimeline}
                totalFrames={data.totalFrames}
                blinkEvents={data.blinkSchedule}
              />

              {/* Viseme Distribution */}
              <VisemeDistribution distribution={data.visemeDistribution} />

              {/* Head Motion */}
              <HeadMotionPreview motion={data.headMotion} />

              {/* Cost Breakdown */}
              <CostBreakdown cost={data.costEstimate} />

              {/* Pipeline Plan */}
              <PipelinePlanDisplay plan={data.pipelinePlan} />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/30 p-2 text-center border border-border/50">
      <div className="text-sm font-bold">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

export default DialoguePreviewModal;
