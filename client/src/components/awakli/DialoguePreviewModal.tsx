/**
 * Dialogue Preview Modal
 *
 * Lets creators preview the viseme timeline, blink schedule, head motion,
 * cost breakdown, and 7-stage pipeline plan for a dialogue scene
 * before committing to generation.
 *
 * Features:
 * - Play/pause with animated playhead & click/drag scrubbing
 * - Large animated mouth shape SVG display
 * - Speed control (0.25x, 0.5x, 1x, 2x)
 * - Blink flash indicator & head motion values synced to playhead
 * - Audio waveform overlay on the timeline bar
 * - Compare split-view: dialogue inpainting vs full Kling video
 * - A/B looping mode with draggable markers
 * - Inline phoneme editor: click segments to reassign visemes
 * - Batch preview: episode-level dialogue scene summary table
 * - Export/Import JSON preset for sharing configurations
 * - Keyboard shortcuts (Space, Left/Right, L for loop, A/B for markers)
 */

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Loader2,
  MessageSquare,
  Eye,
  EyeOff,
  DollarSign,
  Layers,
  TrendingDown,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cpu,
  Zap,
  Gauge,
  Columns2,
  Repeat,
  AudioLines,
  CheckCircle2,
  XCircle,
  Sparkles,
  Shield,
  Pencil,
  RotateCcw,
  Download,
  Upload,
  FileJson,
  ListChecks,
  Users,
  Timer,
  Scissors,
  Merge,
} from "lucide-react";

// ─── Viseme Colors ─────────────────────────────────────────────────────

const VISEME_COLORS: Record<string, string> = {
  A: "bg-red-500", I: "bg-blue-500", U: "bg-purple-500", E: "bg-amber-500",
  O: "bg-emerald-500", Closed: "bg-slate-600", N: "bg-cyan-500", Rest: "bg-zinc-700",
};

const VISEME_HEX: Record<string, string> = {
  A: "#ef4444", I: "#3b82f6", U: "#a855f7", E: "#f59e0b",
  O: "#10b981", Closed: "#475569", N: "#06b6d4", Rest: "#3f3f46",
};

const VISEME_LABELS: Record<string, string> = {
  A: "A (open)", I: "I (smile)", U: "U (pucker)", E: "E (mid)",
  O: "O (round)", Closed: "Closed", N: "N (nasal)", Rest: "Rest",
};

const ALL_VISEMES = ["A", "I", "U", "E", "O", "Closed", "N", "Rest"] as const;

// ─── Mouth Shape SVGs ─────────────────────────────────────────────────

function MouthShapeSVG({ viseme, size = 120 }: { viseme: string; size?: number }) {
  const color = VISEME_HEX[viseme] || VISEME_HEX.Rest;
  const half = size / 2;

  const shapes: Record<string, React.ReactNode> = {
    A: <ellipse cx={half} cy={half} rx={half * 0.55} ry={half * 0.7} fill={color} opacity={0.85} />,
    I: <ellipse cx={half} cy={half} rx={half * 0.7} ry={half * 0.25} fill={color} opacity={0.85} />,
    U: <circle cx={half} cy={half} r={half * 0.3} fill={color} opacity={0.85} />,
    E: <ellipse cx={half} cy={half} rx={half * 0.5} ry={half * 0.35} fill={color} opacity={0.85} />,
    O: <circle cx={half} cy={half} r={half * 0.45} fill={color} opacity={0.85} />,
    Closed: <rect x={half * 0.4} y={half - 2} width={half * 1.2} height={4} rx={2} fill={color} opacity={0.85} />,
    N: <ellipse cx={half} cy={half} rx={half * 0.45} ry={half * 0.12} fill={color} opacity={0.85} />,
    Rest: <rect x={half * 0.5} y={half - 1.5} width={half * 1.0} height={3} rx={1.5} fill={color} opacity={0.4} />,
  };

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transition-all duration-75">
      <circle cx={half} cy={half} r={half - 2} fill="none" stroke="currentColor" strokeOpacity={0.1} strokeWidth={1.5} />
      {shapes[viseme] || shapes.Rest}
    </svg>
  );
}

// ─── A/B Loop State ───────────────────────────────────────────────────

interface LoopState {
  enabled: boolean;
  markerA: number;
  markerB: number;
}

function useLoopState() {
  const [loop, setLoop] = useState<LoopState>({
    enabled: false, markerA: 0.2, markerB: 0.8,
  });

  const toggleLoop = useCallback(() => setLoop(s => ({ ...s, enabled: !s.enabled })), []);
  const setMarkerA = useCallback((progress: number) => {
    setLoop(s => ({ ...s, markerA: Math.max(0, Math.min(progress, s.markerB - 0.01)) }));
  }, []);
  const setMarkerB = useCallback((progress: number) => {
    setLoop(s => ({ ...s, markerB: Math.min(1, Math.max(progress, s.markerA + 0.01)) }));
  }, []);

  return { loop, toggleLoop, setMarkerA, setMarkerB, setLoop };
}

// ─── Replay Controller Hook ───────────────────────────────────────────

const SPEED_OPTIONS = [0.25, 0.5, 1, 2] as const;
type Speed = (typeof SPEED_OPTIONS)[number];

interface ReplayState {
  isPlaying: boolean;
  currentFrame: number;
  speed: Speed;
  currentTimeS: number;
}

function useReplayController(
  totalFrames: number, fps: number, durationS: number, loopState?: LoopState,
) {
  const [state, setState] = useState<ReplayState>({
    isPlaying: false, currentFrame: 0, speed: 1, currentTimeS: 0,
  });

  const rafRef = useRef<number>(0);
  const lastTickRef = useRef<number>(0);

  const play = useCallback(() => setState(s => ({ ...s, isPlaying: true })), []);
  const pause = useCallback(() => setState(s => ({ ...s, isPlaying: false })), []);

  const togglePlay = useCallback(() => {
    setState(s => {
      if (!s.isPlaying && s.currentFrame >= totalFrames - 1) {
        return { ...s, isPlaying: true, currentFrame: 0, currentTimeS: 0 };
      }
      return { ...s, isPlaying: !s.isPlaying };
    });
  }, [totalFrames]);

  const seekToFrame = useCallback((frame: number) => {
    const clamped = Math.max(0, Math.min(totalFrames - 1, frame));
    setState(s => ({ ...s, currentFrame: clamped, currentTimeS: clamped / fps }));
  }, [totalFrames, fps]);

  const seekToProgress = useCallback((progress: number) => {
    const clamped = Math.max(0, Math.min(1, progress));
    const frame = Math.round(clamped * (totalFrames - 1));
    setState(s => ({ ...s, currentFrame: frame, currentTimeS: frame / fps }));
  }, [totalFrames, fps]);

  const setSpeed = useCallback((speed: Speed) => setState(s => ({ ...s, speed })), []);

  const stepForward = useCallback(() => {
    setState(s => {
      const next = Math.min(s.currentFrame + 1, totalFrames - 1);
      return { ...s, currentFrame: next, currentTimeS: next / fps, isPlaying: false };
    });
  }, [totalFrames, fps]);

  const stepBackward = useCallback(() => {
    setState(s => {
      const prev = Math.max(s.currentFrame - 1, 0);
      return { ...s, currentFrame: prev, currentTimeS: prev / fps, isPlaying: false };
    });
  }, [fps]);

  useEffect(() => {
    if (!state.isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    lastTickRef.current = performance.now();

    const tick = (now: number) => {
      const elapsed = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;

      setState(prev => {
        if (!prev.isPlaying) return prev;
        const advanceS = elapsed * prev.speed;
        let newTimeS = prev.currentTimeS + advanceS;
        let newFrame = Math.floor(newTimeS * fps);

        if (loopState?.enabled && totalFrames > 0) {
          const loopEndFrame = Math.round(loopState.markerB * (totalFrames - 1));
          const loopStartFrame = Math.round(loopState.markerA * (totalFrames - 1));
          if (newFrame > loopEndFrame) {
            newFrame = loopStartFrame;
            newTimeS = loopStartFrame / fps;
          }
        } else if (newFrame >= totalFrames) {
          return { ...prev, isPlaying: false, currentFrame: totalFrames - 1, currentTimeS: durationS };
        }

        return { ...prev, currentFrame: newFrame, currentTimeS: newTimeS };
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [state.isPlaying, fps, totalFrames, durationS, state.speed, loopState?.enabled, loopState?.markerA, loopState?.markerB]);

  return {
    ...state, play, pause, togglePlay, seekToFrame, seekToProgress,
    setSpeed, stepForward, stepBackward,
    progress: totalFrames > 1 ? state.currentFrame / (totalFrames - 1) : 0,
  };
}

// ─── Viseme Override State ────────────────────────────────────────────

interface VisemeOverride {
  frameIndex: number;
  viseme: string;
}

function useVisemeOverrides() {
  const [overrides, setOverrides] = useState<VisemeOverride[]>([]);

  const setOverride = useCallback((frameIndex: number, viseme: string) => {
    setOverrides(prev => {
      const existing = prev.findIndex(o => o.frameIndex === frameIndex);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { frameIndex, viseme };
        return updated;
      }
      return [...prev, { frameIndex, viseme }];
    });
  }, []);

  const setRangeOverride = useCallback((startFrame: number, endFrame: number, viseme: string) => {
    setOverrides(prev => {
      const filtered = prev.filter(o => o.frameIndex < startFrame || o.frameIndex > endFrame);
      const newOverrides: VisemeOverride[] = [];
      for (let i = startFrame; i <= endFrame; i++) {
        newOverrides.push({ frameIndex: i, viseme });
      }
      return [...filtered, ...newOverrides];
    });
  }, []);

  const removeOverride = useCallback((frameIndex: number) => {
    setOverrides(prev => prev.filter(o => o.frameIndex !== frameIndex));
  }, []);

  const removeRangeOverrides = useCallback((startFrame: number, endFrame: number) => {
    setOverrides(prev => prev.filter(o => o.frameIndex < startFrame || o.frameIndex > endFrame));
  }, []);

  const resetAll = useCallback(() => setOverrides([]), []);

  return { overrides, setOverride, setRangeOverride, removeOverride, removeRangeOverrides, resetAll, setOverrides };
}

// ─── Waveform Overlay SVG ─────────────────────────────────────────────

function WaveformOverlay({
  samples, peakAmplitude, dialogueRegions, totalSamples, height,
}: {
  samples: number[];
  peakAmplitude: number;
  dialogueRegions: Array<{ startSample: number; endSample: number; character: string }>;
  totalSamples: number;
  height: number;
  playheadProgress: number | null;
}) {
  const maxBars = 200;
  const step = Math.max(1, Math.floor(totalSamples / maxBars));
  const bars = useMemo(() => {
    const result: number[] = [];
    for (let i = 0; i < totalSamples; i += step) {
      const slice = samples.slice(i, i + step);
      const avg = slice.length > 0 ? slice.reduce((a, b) => a + b, 0) / slice.length : 0;
      result.push(avg / Math.max(peakAmplitude, 0.01));
    }
    return result;
  }, [samples, totalSamples, step, peakAmplitude]);

  const barWidth = 100 / bars.length;
  const mid = height / 2;

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      style={{ opacity: 0.35 }}
    >
      {dialogueRegions.map((r, i) => {
        const x1 = (r.startSample / totalSamples) * 100;
        const x2 = (r.endSample / totalSamples) * 100;
        return (
          <rect key={`region-${i}`} x={x1} y={0} width={x2 - x1} height={height} fill="#60a5fa" opacity={0.08} />
        );
      })}
      {bars.map((amp, i) => {
        const x = i * barWidth;
        const barH = Math.max(amp * mid * 0.85, 0.3);
        return (
          <rect key={i} x={x} y={mid - barH} width={Math.max(barWidth * 0.7, 0.2)} height={barH * 2} rx={0.15} fill="#a78bfa" opacity={0.7} />
        );
      })}
    </svg>
  );
}

// ─── Phoneme Editor Popover ───────────────────────────────────────────

function PhonemeEditorPopover({
  segment,
  totalFrames,
  overrideCount,
  onAssignViseme,
  onSplitSegment,
  onResetSegment,
}: {
  segment: { viseme: string; startIdx: number; endIdx: number; startTimeS: number };
  totalFrames: number;
  overrideCount: number;
  onAssignViseme: (startFrame: number, endFrame: number, viseme: string) => void;
  onSplitSegment: (startFrame: number, endFrame: number) => void;
  onResetSegment: (startFrame: number, endFrame: number) => void;
}) {
  const frameCount = segment.endIdx - segment.startIdx + 1;
  const durationMs = Math.round((frameCount / totalFrames) * 10000) / 10;

  return (
    <div className="space-y-3 p-1">
      <div className="space-y-1">
        <div className="text-xs font-medium flex items-center gap-1.5">
          <Pencil className="h-3 w-3" />
          Edit Viseme Segment
        </div>
        <div className="text-[10px] text-muted-foreground">
          Frames {segment.startIdx}–{segment.endIdx} ({frameCount} frames, {durationMs}ms)
          {overrideCount > 0 && (
            <Badge variant="outline" className="ml-1 text-[8px] px-1 py-0 h-3.5 text-amber-400 border-amber-500/20">
              {overrideCount} edited
            </Badge>
          )}
        </div>
      </div>

      {/* Viseme selector grid */}
      <div className="grid grid-cols-4 gap-1">
        {ALL_VISEMES.map(v => (
          <button
            key={v}
            className={`flex items-center gap-1 px-1.5 py-1 rounded text-[10px] font-medium transition-colors border ${
              v === segment.viseme
                ? "border-primary bg-primary/20 text-primary"
                : "border-border/50 bg-muted/30 text-muted-foreground hover:bg-muted/60"
            }`}
            onClick={() => onAssignViseme(segment.startIdx, segment.endIdx, v)}
          >
            <div className={`h-2 w-2 rounded-sm ${VISEME_COLORS[v]}`} />
            {v}
          </button>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 pt-1 border-t border-border/30">
        {frameCount > 1 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] px-2 gap-1"
            onClick={() => onSplitSegment(segment.startIdx, segment.endIdx)}
          >
            <Scissors className="h-2.5 w-2.5" />
            Split
          </Button>
        )}
        {overrideCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] px-2 gap-1 text-amber-400 hover:text-amber-300"
            onClick={() => onResetSegment(segment.startIdx, segment.endIdx)}
          >
            <RotateCcw className="h-2.5 w-2.5" />
            Reset
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Interactive Viseme Timeline with Waveform + A/B Loop + Editor ────

function VisemeTimelineBar({
  frames,
  totalFrames,
  blinkEvents,
  replay,
  waveform,
  loopState,
  onSetMarkerA,
  onSetMarkerB,
  editorEnabled,
  visemeOverrides,
  originalFrames,
  onAssignViseme,
  onSplitSegment,
  onResetSegment,
}: {
  frames: Array<{ viseme: string; frameIndex: number; timeS: number }>;
  totalFrames: number;
  blinkEvents: Array<{ startFrame: number; endFrame: number; character: string }>;
  replay: ReturnType<typeof useReplayController> | null;
  waveform?: {
    samples: number[];
    sampleRate: number;
    peakAmplitude: number;
    dialogueRegions: Array<{ startSample: number; endSample: number; character: string }>;
  };
  loopState?: LoopState;
  onSetMarkerA?: (progress: number) => void;
  onSetMarkerB?: (progress: number) => void;
  editorEnabled?: boolean;
  visemeOverrides?: VisemeOverride[];
  originalFrames?: Array<{ viseme: string; frameIndex: number; timeS: number }>;
  onAssignViseme?: (startFrame: number, endFrame: number, viseme: string) => void;
  onSplitSegment?: (startFrame: number, endFrame: number) => void;
  onResetSegment?: (startFrame: number, endFrame: number) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef<false | "scrub" | "markerA" | "markerB">(false);

  const segments = useMemo(() => {
    const segs: Array<{ viseme: string; startIdx: number; endIdx: number; startTimeS: number }> = [];
    let current: (typeof segs)[0] | null = null;
    for (const f of frames) {
      if (current && current.viseme === f.viseme) {
        current.endIdx = f.frameIndex;
      } else {
        if (current) segs.push(current);
        current = { viseme: f.viseme, startIdx: f.frameIndex, endIdx: f.frameIndex, startTimeS: f.timeS };
      }
    }
    if (current) segs.push(current);
    return segs;
  }, [frames]);

  const getProgress = useCallback((e: React.PointerEvent) => {
    if (!barRef.current) return 0;
    const rect = barRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!barRef.current || editorEnabled) return;
    const progress = getProgress(e);
    barRef.current.setPointerCapture(e.pointerId);

    if (loopState?.enabled) {
      if (Math.abs(progress - loopState.markerA) < 0.02) {
        isDraggingRef.current = "markerA";
        return;
      }
      if (Math.abs(progress - loopState.markerB) < 0.02) {
        isDraggingRef.current = "markerB";
        return;
      }
    }

    isDraggingRef.current = "scrub";
    replay?.seekToProgress(progress);
  }, [replay, loopState, getProgress, editorEnabled]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current || !barRef.current) return;
    const progress = getProgress(e);
    if (isDraggingRef.current === "markerA" && onSetMarkerA) onSetMarkerA(progress);
    else if (isDraggingRef.current === "markerB" && onSetMarkerB) onSetMarkerB(progress);
    else if (isDraggingRef.current === "scrub") replay?.seekToProgress(progress);
  }, [replay, onSetMarkerA, onSetMarkerB, getProgress]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    isDraggingRef.current = false;
    if (barRef.current) barRef.current.releasePointerCapture(e.pointerId);
  }, []);

  // Count overrides per segment
  const segmentOverrideCounts = useMemo(() => {
    if (!visemeOverrides || !originalFrames) return new Map<number, number>();
    const counts = new Map<number, number>();
    segments.forEach((seg, i) => {
      let count = 0;
      for (let f = seg.startIdx; f <= seg.endIdx; f++) {
        if (visemeOverrides.some(o => o.frameIndex === f)) count++;
      }
      counts.set(i, count);
    });
    return counts;
  }, [segments, visemeOverrides, originalFrames]);

  // Check if a segment differs from original
  const segmentIsEdited = useCallback((seg: { startIdx: number; endIdx: number }) => {
    if (!originalFrames || !visemeOverrides) return false;
    for (let f = seg.startIdx; f <= seg.endIdx; f++) {
      if (visemeOverrides.some(o => o.frameIndex === f)) return true;
    }
    return false;
  }, [originalFrames, visemeOverrides]);

  const durationS = totalFrames > 0 ? frames[frames.length - 1]?.timeS ?? 0 : 0;

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground font-medium mb-1 flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          Viseme Timeline
          {waveform && <AudioLines className="h-3 w-3 text-purple-400" />}
          {editorEnabled && (
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 text-pink-400 border-pink-500/20">
              <Pencil className="h-2.5 w-2.5 mr-0.5" />
              Editing
            </Badge>
          )}
          {loopState?.enabled && (
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 text-amber-400 border-amber-500/20">
              <Repeat className="h-2.5 w-2.5 mr-0.5" />
              Loop
            </Badge>
          )}
        </span>
        {replay && (
          <span className="font-mono text-[10px]">
            {replay.currentTimeS.toFixed(2)}s / frame {replay.currentFrame}
          </span>
        )}
      </div>
      <div className="relative">
        {/* Main timeline bar */}
        <div
          ref={barRef}
          className={`flex h-12 rounded-md overflow-hidden bg-muted/30 border border-border/50 relative ${
            editorEnabled ? "cursor-crosshair" : replay ? "cursor-pointer select-none" : ""
          }`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {/* Viseme segments */}
          {segments.map((seg, i) => {
            const widthPct = ((seg.endIdx - seg.startIdx + 1) / totalFrames) * 100;
            const isEdited = segmentIsEdited(seg);

            const segmentEl = (
              <div
                key={i}
                className={`${VISEME_COLORS[seg.viseme]} transition-all relative group ${
                  editorEnabled ? "hover:brightness-125 cursor-pointer" : ""
                } ${isEdited ? "ring-1 ring-pink-400/50 ring-inset" : ""}`}
                style={{ width: `${Math.max(widthPct, 0.5)}%` }}
                title={`${seg.viseme} (frames ${seg.startIdx}-${seg.endIdx}, ${seg.startTimeS.toFixed(2)}s)${isEdited ? " [edited]" : ""}`}
              >
                {widthPct > 4 && (
                  <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white/90 pointer-events-none">
                    {seg.viseme}
                    {isEdited && <span className="ml-0.5 text-pink-200">*</span>}
                  </span>
                )}
              </div>
            );

            if (editorEnabled && onAssignViseme && onSplitSegment && onResetSegment) {
              return (
                <Popover key={i}>
                  <PopoverTrigger asChild>{segmentEl}</PopoverTrigger>
                  <PopoverContent className="w-64 p-2" side="top" align="center">
                    <PhonemeEditorPopover
                      segment={seg}
                      totalFrames={totalFrames}
                      overrideCount={segmentOverrideCounts.get(i) || 0}
                      onAssignViseme={onAssignViseme}
                      onSplitSegment={onSplitSegment}
                      onResetSegment={onResetSegment}
                    />
                  </PopoverContent>
                </Popover>
              );
            }

            return segmentEl;
          })}

          {/* Waveform overlay */}
          {waveform && (
            <WaveformOverlay
              samples={waveform.samples}
              peakAmplitude={waveform.peakAmplitude}
              dialogueRegions={waveform.dialogueRegions}
              totalSamples={waveform.samples.length}
              height={48}
              playheadProgress={replay?.progress ?? null}
            />
          )}

          {/* A/B Loop region highlight */}
          {loopState?.enabled && (
            <div
              className="absolute top-0 bottom-0 bg-amber-400/15 border-y border-amber-400/30 pointer-events-none z-[5]"
              style={{
                left: `${loopState.markerA * 100}%`,
                width: `${(loopState.markerB - loopState.markerA) * 100}%`,
              }}
            />
          )}

          {/* A marker */}
          {loopState?.enabled && (
            <div
              className="absolute top-0 bottom-0 w-1 bg-amber-400 z-[8] cursor-ew-resize"
              style={{ left: `${loopState.markerA * 100}%` }}
              title={`A: ${(loopState.markerA * durationS).toFixed(2)}s`}
            >
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[9px] font-bold text-amber-400 bg-background/80 px-1 rounded">A</div>
            </div>
          )}

          {/* B marker */}
          {loopState?.enabled && (
            <div
              className="absolute top-0 bottom-0 w-1 bg-amber-400 z-[8] cursor-ew-resize"
              style={{ left: `${loopState.markerB * 100}%` }}
              title={`B: ${(loopState.markerB * durationS).toFixed(2)}s`}
            >
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[9px] font-bold text-amber-400 bg-background/80 px-1 rounded">B</div>
            </div>
          )}

          {/* Playhead */}
          {replay && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)] z-10 pointer-events-none transition-[left] duration-75"
              style={{ left: `${replay.progress * 100}%` }}
            >
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-white shadow-md" />
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-white shadow-md" />
            </div>
          )}
        </div>

        {/* Blink markers */}
        <div className="relative h-3 mt-1">
          {blinkEvents.map((b, i) => {
            const leftPct = (b.startFrame / totalFrames) * 100;
            const widthPct = ((b.endFrame - b.startFrame) / totalFrames) * 100;
            const isActive = replay
              ? replay.currentFrame >= b.startFrame && replay.currentFrame <= b.endFrame
              : false;
            return (
              <div
                key={i}
                className={`absolute top-0 h-3 rounded-sm border transition-all duration-100 ${
                  isActive
                    ? "bg-yellow-400 border-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.6)]"
                    : "bg-yellow-400/60 border-yellow-500/40"
                }`}
                style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 0.5)}%` }}
                title={`Blink: frames ${b.startFrame}-${b.endFrame} (${b.character})`}
              />
            );
          })}
          <span className="absolute -top-0.5 right-0 text-[9px] text-muted-foreground">
            {blinkEvents.length} blinks
          </span>
        </div>
      </div>

      {/* Loop info */}
      {loopState?.enabled && totalFrames > 0 && (
        <div className="flex items-center gap-3 text-[10px] text-amber-400/80 font-mono">
          <span>A: {(loopState.markerA * durationS).toFixed(2)}s (frame {Math.round(loopState.markerA * (totalFrames - 1))})</span>
          <span>B: {(loopState.markerB * durationS).toFixed(2)}s (frame {Math.round(loopState.markerB * (totalFrames - 1))})</span>
          <span>Region: {((loopState.markerB - loopState.markerA) * durationS).toFixed(2)}s ({Math.round((loopState.markerB - loopState.markerA) * (totalFrames - 1))} frames)</span>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-2 mt-1">
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
        {waveform && (
          <div className="flex items-center gap-1 text-[10px] text-purple-400">
            <div className="h-2 w-2 rounded-sm bg-purple-400/60" />
            Waveform
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Replay Controls ──────────────────────────────────────────────────

function ReplayControls({
  replay, currentViseme, isBlinking, currentHeadMotion, loopState, onToggleLoop,
  editorEnabled, onToggleEditor, overrideCount, onResetAllOverrides,
}: {
  replay: ReturnType<typeof useReplayController>;
  currentViseme: string;
  isBlinking: boolean;
  currentHeadMotion: { rotationDeg: number; translationX: number; translationY: number } | null;
  loopState?: LoopState;
  onToggleLoop?: () => void;
  editorEnabled?: boolean;
  onToggleEditor?: () => void;
  overrideCount?: number;
  onResetAllOverrides?: () => void;
}) {
  return (
    <div className="rounded-lg bg-muted/30 border border-border/50 p-3 space-y-3">
      <div className="flex items-center gap-3">
        {/* Mouth shape display */}
        <div className="relative shrink-0">
          <div
            className="rounded-xl border border-border/50 bg-background/50 p-1 transition-all duration-100"
            style={{ boxShadow: isBlinking ? "0 0 16px rgba(250, 204, 21, 0.5)" : "none" }}
          >
            <MouthShapeSVG viseme={currentViseme} size={80} />
          </div>
          <div
            className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
            style={{ backgroundColor: VISEME_HEX[currentViseme] || VISEME_HEX.Rest }}
          >
            {currentViseme}
          </div>
          {isBlinking && (
            <div className="absolute -top-1 -right-1 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-yellow-400 text-[9px] font-bold text-black animate-pulse">
              <EyeOff className="h-2.5 w-2.5" />
              BLINK
            </div>
          )}
        </div>

        {/* Transport controls + info */}
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => replay.seekToFrame(0)} title="Go to start">
              <SkipBack className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={replay.stepBackward} title="Step back (←)">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={replay.togglePlay} title={replay.isPlaying ? "Pause (Space)" : "Play (Space)"}>
              {replay.isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={replay.stepForward} title="Step forward (→)">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => replay.seekToFrame(Infinity)} title="Go to end">
              <SkipForward className="h-3.5 w-3.5" />
            </Button>

            {/* Loop toggle */}
            {onToggleLoop && (
              <Button
                variant={loopState?.enabled ? "default" : "ghost"}
                size="sm"
                className={`h-8 w-8 p-0 ml-1 ${loopState?.enabled ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30" : ""}`}
                onClick={onToggleLoop}
                title="Toggle A/B loop (L)"
              >
                <Repeat className="h-3.5 w-3.5" />
              </Button>
            )}

            {/* Editor toggle */}
            {onToggleEditor && (
              <Button
                variant={editorEnabled ? "default" : "ghost"}
                size="sm"
                className={`h-8 w-8 p-0 ${editorEnabled ? "bg-pink-500/20 text-pink-400 hover:bg-pink-500/30" : ""}`}
                onClick={onToggleEditor}
                title="Toggle phoneme editor (E)"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}

            {/* Reset overrides */}
            {(overrideCount ?? 0) > 0 && onResetAllOverrides && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-[10px] text-amber-400 hover:text-amber-300 gap-1"
                onClick={onResetAllOverrides}
                title="Reset all viseme edits"
              >
                <RotateCcw className="h-3 w-3" />
                Reset ({overrideCount})
              </Button>
            )}

            {/* Speed selector */}
            <div className="ml-auto flex items-center gap-1">
              <Gauge className="h-3 w-3 text-muted-foreground" />
              {SPEED_OPTIONS.map(s => (
                <button
                  key={s}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                    replay.speed === s
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  }`}
                  onClick={() => replay.setSpeed(s)}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4 text-[10px] text-muted-foreground font-mono">
            <span>Time: <span className="text-foreground font-bold">{replay.currentTimeS.toFixed(3)}s</span></span>
            <span>Frame: <span className="text-foreground font-bold">{replay.currentFrame}</span></span>
            {currentHeadMotion && (
              <>
                <span>Rot: <span className="text-blue-400">{currentHeadMotion.rotationDeg.toFixed(1)}°</span></span>
                <span>X: <span className="text-emerald-400">{currentHeadMotion.translationX.toFixed(1)}px</span></span>
                <span>Y: <span className="text-pink-400">{currentHeadMotion.translationY.toFixed(1)}px</span></span>
              </>
            )}
          </div>

          <div className="text-[9px] text-muted-foreground/60">
            Space: play/pause &middot; ← →: step frame &middot; L: loop &middot; E: editor
            {loopState?.enabled && " · Drag A/B markers"}
            {editorEnabled && " · Click segments to edit visemes"}
          </div>
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
              <div className="text-[10px] text-muted-foreground">{count} ({Math.round((count / total) * 100)}%)</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Head Motion Chart ─────────────────────────────────────────────────

function HeadMotionPreview({
  motion, currentFrame,
}: {
  motion: Array<{ frameIndex: number; rotationDeg: number; translationX: number; translationY: number }>;
  currentFrame?: number;
}) {
  const maxRot = Math.max(...motion.map(m => Math.abs(m.rotationDeg)), 1);
  const maxTx = Math.max(...motion.map(m => Math.abs(m.translationX)), 1);
  const maxTy = Math.max(...motion.map(m => Math.abs(m.translationY)), 1);

  const sampleRate = Math.max(1, Math.floor(motion.length / 60));
  const sampled = motion.filter((_, i) => i % sampleRate === 0);

  const playheadX = currentFrame !== undefined
    ? (currentFrame / Math.max(1, motion.length - 1)) * sampled.length
    : null;

  const renderSparkline = (
    getValue: (m: (typeof sampled)[0]) => number,
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
            fill="none" stroke={color} strokeWidth="1.5"
            points={sampled.map((m, i) => `${i},${mid - (getValue(m) / maxVal) * mid}`).join(" ")}
          />
          {playheadX !== null && (
            <line x1={playheadX} y1={0} x2={playheadX} y2={height} stroke="white" strokeWidth="0.8" strokeOpacity="0.6" />
          )}
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
        {renderSparkline(m => m.rotationDeg, maxRot, "#60a5fa", "Rotation")}
        {renderSparkline(m => m.translationX, maxTx, "#34d399", "Trans X")}
        {renderSparkline(m => m.translationY, maxTy, "#f472b6", "Trans Y")}
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
      <span className="font-mono">{credits.toFixed(4)}</span>
    </div>
  );
}

// ─── Pipeline Plan ─────────────────────────────────────────────────────

function PipelinePlanDisplay({
  plan,
}: {
  plan: {
    stages: Array<{
      name: string; description: string; provider: string | null;
      fallbackProvider: string | null; estimatedCredits: number; frameCount: number;
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
          <div key={stage.name} className="flex items-start gap-2 rounded-md bg-muted/30 p-2 border border-border/50">
            <div className="flex items-center justify-center h-5 w-5 rounded-full bg-primary/20 text-primary text-[10px] font-bold shrink-0 mt-0.5">
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">{formatStageName(stage.name)}</span>
                {stage.provider ? (
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">
                    <Cpu className="h-2.5 w-2.5 mr-0.5" />{stage.provider}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 text-emerald-400 border-emerald-500/20">
                    <Zap className="h-2.5 w-2.5 mr-0.5" />No AI
                  </Badge>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{stage.description}</div>
              <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                <span>{stage.frameCount} frames</span>
                <span>{stage.estimatedCredits.toFixed(4)} credits</span>
                {stage.fallbackProvider && <span className="text-amber-400">fallback: {stage.fallbackProvider}</span>}
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
  return name.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// ─── Compare Split-View Panel ──────────────────────────────────────────

function ComparePanel({ durationS, cameraAngleCount }: { durationS: number; cameraAngleCount: number }) {
  const compareMutation = trpc.sceneType.compareDialogue.useMutation({
    onError: (err) => toast.error(`Compare failed: ${err.message}`),
  });

  useEffect(() => {
    compareMutation.mutate({ durationS, cameraAngleCount });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationS, cameraAngleCount]);

  const data = compareMutation.data;

  if (compareMutation.isPending) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading comparison...</span>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      {/* Recommendation banner */}
      <div className={`rounded-lg p-3 border ${
        data.recommendation === "dialogue_inpainting"
          ? "bg-emerald-500/10 border-emerald-500/20"
          : "bg-blue-500/10 border-blue-500/20"
      }`}>
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className={`h-4 w-4 ${data.recommendation === "dialogue_inpainting" ? "text-emerald-400" : "text-blue-400"}`} />
          <span className="text-xs font-bold">
            Recommended: {data.recommendation === "dialogue_inpainting" ? "Dialogue Inpainting" : "Full Kling Video"}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground">{data.recommendationReason}</p>
      </div>

      {/* Side-by-side comparison */}
      <div className="grid grid-cols-2 gap-3">
        {/* Dialogue Inpainting */}
        <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-3 space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="text-xs font-bold text-emerald-400">Dialogue Inpainting</span>
          </div>
          <div className="space-y-2">
            <MetricRow label="Credits" value={data.dialogueInpainting.totalCredits.toFixed(4)} accent="emerald" />
            <MetricRow label="Gen Time" value={`${data.dialogueInpainting.generationTimeS}s`} accent="emerald" />
            <MetricRow label="Output FPS" value={data.dialogueInpainting.outputFps.toString()} />
            <MetricRow label="Resolution" value={data.dialogueInpainting.resolution} />
          </div>
          <div className="space-y-1.5 pt-2 border-t border-border/30">
            <div className="text-[10px] text-muted-foreground font-medium">Quality Scores</div>
            <QualityBar label="Overall" value={data.dialogueInpainting.qualityScore} />
            <QualityBar label="Lip Sync" value={data.dialogueInpainting.lipSyncAccuracy} color="emerald" />
            <QualityBar label="Consistency" value={data.dialogueInpainting.consistency} color="emerald" />
            <QualityBar label="Motion" value={data.dialogueInpainting.motionNaturalness} />
          </div>
          <div className="space-y-1 pt-2 border-t border-border/30">
            {data.dialogueInpainting.strengths.map((s, i) => (
              <div key={i} className="flex items-center gap-1 text-[10px]">
                <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400 shrink-0" />
                <span className="text-muted-foreground">{s}</span>
              </div>
            ))}
            {data.dialogueInpainting.weaknesses.map((w, i) => (
              <div key={i} className="flex items-center gap-1 text-[10px]">
                <XCircle className="h-2.5 w-2.5 text-red-400/60 shrink-0" />
                <span className="text-muted-foreground/60">{w}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Full Kling Video */}
        <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 p-3 space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-blue-400" />
            <span className="text-xs font-bold text-blue-400">Kling 2.6 Full Video</span>
          </div>
          <div className="space-y-2">
            <MetricRow label="Credits" value={data.kling.totalCredits.toFixed(4)} accent="red" />
            <MetricRow label="Gen Time" value={`${data.kling.generationTimeS}s`} accent="red" />
            <MetricRow label="Output FPS" value={data.kling.outputFps.toString()} />
            <MetricRow label="Resolution" value={data.kling.resolution} />
          </div>
          <div className="space-y-1.5 pt-2 border-t border-border/30">
            <div className="text-[10px] text-muted-foreground font-medium">Quality Scores</div>
            <QualityBar label="Overall" value={data.kling.qualityScore} color="blue" />
            <QualityBar label="Lip Sync" value={data.kling.lipSyncAccuracy} />
            <QualityBar label="Consistency" value={data.kling.consistency} />
            <QualityBar label="Motion" value={data.kling.motionNaturalness} color="blue" />
          </div>
          <div className="space-y-1 pt-2 border-t border-border/30">
            {data.kling.strengths.map((s, i) => (
              <div key={i} className="flex items-center gap-1 text-[10px]">
                <CheckCircle2 className="h-2.5 w-2.5 text-blue-400 shrink-0" />
                <span className="text-muted-foreground">{s}</span>
              </div>
            ))}
            {data.kling.weaknesses.map((w, i) => (
              <div key={i} className="flex items-center gap-1 text-[10px]">
                <XCircle className="h-2.5 w-2.5 text-red-400/60 shrink-0" />
                <span className="text-muted-foreground/60">{w}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Savings summary */}
      <div className="rounded-lg bg-muted/30 border border-border/50 p-3">
        <div className="text-xs font-medium mb-2 flex items-center gap-1.5">
          <TrendingDown className="h-3.5 w-3.5 text-emerald-400" />
          Savings Summary
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <div className="text-lg font-bold text-emerald-400">{data.savings.savingsPercent}%</div>
            <div className="text-[10px] text-muted-foreground">Credit Savings</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-emerald-400">{data.savings.creditsSaved.toFixed(2)}</div>
            <div className="text-[10px] text-muted-foreground">Credits Saved</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-emerald-400">{data.savings.speedMultiplier}x</div>
            <div className="text-[10px] text-muted-foreground">Faster</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  const colorClass = accent === "emerald" ? "text-emerald-400" : accent === "red" ? "text-red-400" : "text-foreground";
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono font-bold ${colorClass}`}>{value}</span>
    </div>
  );
}

function QualityBar({ label, value, color }: { label: string; value: number; color?: string }) {
  const barColor = color === "emerald" ? "bg-emerald-400" : color === "blue" ? "bg-blue-400" : "bg-muted-foreground/50";
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-16 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted/50 overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[10px] font-mono w-8 text-right">{value}</span>
    </div>
  );
}

// ─── Batch Preview Panel ──────────────────────────────────────────────

function BatchPreviewPanel() {
  const [expandedScene, setExpandedScene] = useState<number | null>(null);

  const batchMutation = trpc.sceneType.batchPreviewDialogue.useMutation({
    onError: (err) => toast.error(`Batch preview failed: ${err.message}`),
  });

  // Demo scenes for batch preview
  const [demoScenes] = useState(() => [
    {
      sceneId: 1, sceneNumber: 1, durationS: 8,
      dialogueLines: [
        { character: "Sakura", text: "I never thought it would end like this.", emotion: "sad", startTimeS: 0.5, endTimeS: 3.5 },
        { character: "Hiro", text: "It doesn't have to.", emotion: "determined", startTimeS: 4.0, endTimeS: 6.5 },
      ],
    },
    {
      sceneId: 2, sceneNumber: 3, durationS: 12,
      dialogueLines: [
        { character: "Sakura", text: "What do you mean?", emotion: "confused", startTimeS: 0.5, endTimeS: 2.5 },
        { character: "Hiro", text: "We can change our fate. Together.", emotion: "hopeful", startTimeS: 3.0, endTimeS: 6.0 },
        { character: "Sakura", text: "Together...", emotion: "hopeful", startTimeS: 7.0, endTimeS: 9.0 },
      ],
    },
    {
      sceneId: 3, sceneNumber: 5, durationS: 6,
      dialogueLines: [
        { character: "Villain", text: "You fools! You cannot escape destiny!", emotion: "angry", startTimeS: 0.5, endTimeS: 4.5 },
      ],
    },
    {
      sceneId: 4, sceneNumber: 7, durationS: 10,
      dialogueLines: [
        { character: "Hiro", text: "Stay behind me, Sakura.", emotion: "protective", startTimeS: 0.5, endTimeS: 3.0 },
        { character: "Sakura", text: "No. We fight side by side.", emotion: "brave", startTimeS: 3.5, endTimeS: 6.5 },
        { character: "Hiro", text: "Always.", emotion: "warm", startTimeS: 7.0, endTimeS: 8.5 },
      ],
    },
  ]);

  const handleBatchPreview = () => {
    batchMutation.mutate({ scenes: demoScenes, inpaintFps: 8, outputFps: 24 });
  };

  const data = batchMutation.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          Preview all dialogue scenes in the episode at once.
        </div>
        <Button onClick={handleBatchPreview} disabled={batchMutation.isPending} size="sm" className="gap-1.5">
          {batchMutation.isPending ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" />Processing...</>
          ) : (
            <><ListChecks className="h-3.5 w-3.5" />Batch Preview ({demoScenes.length} scenes)</>
          )}
        </Button>
      </div>

      {data && (
        <>
          {/* Totals summary */}
          <div className="grid grid-cols-5 gap-2">
            <div className="rounded-md bg-muted/30 p-2 text-center border border-border/50">
              <div className="text-sm font-bold">{data.sceneCount}</div>
              <div className="text-[10px] text-muted-foreground">Scenes</div>
            </div>
            <div className="rounded-md bg-muted/30 p-2 text-center border border-border/50">
              <div className="text-sm font-bold">{data.totals.durationS}s</div>
              <div className="text-[10px] text-muted-foreground">Total Duration</div>
            </div>
            <div className="rounded-md bg-muted/30 p-2 text-center border border-border/50">
              <div className="text-sm font-bold">{data.totals.totalFrames}</div>
              <div className="text-[10px] text-muted-foreground">Total Frames</div>
            </div>
            <div className="rounded-md bg-emerald-500/10 p-2 text-center border border-emerald-500/20">
              <div className="text-sm font-bold text-emerald-400">{data.totals.totalCredits.toFixed(4)}</div>
              <div className="text-[10px] text-muted-foreground">Total Credits</div>
            </div>
            <div className="rounded-md bg-emerald-500/10 p-2 text-center border border-emerald-500/20">
              <div className="text-sm font-bold text-emerald-400">{data.totals.savingsPercent}%</div>
              <div className="text-[10px] text-muted-foreground">vs Kling</div>
            </div>
          </div>

          {/* Characters & dialogue stats */}
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {data.totals.characters.length} characters: {data.totals.characters.join(", ")}
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              {data.totals.totalDialogueS}s dialogue / {data.totals.totalSilenceS}s silence
            </span>
          </div>

          {/* Per-scene table */}
          <div className="rounded-lg border border-border/50 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/30 border-b border-border/50">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Scene</th>
                  <th className="text-center px-2 py-2 font-medium text-muted-foreground">Duration</th>
                  <th className="text-center px-2 py-2 font-medium text-muted-foreground">Lines</th>
                  <th className="text-center px-2 py-2 font-medium text-muted-foreground">Frames</th>
                  <th className="text-center px-2 py-2 font-medium text-muted-foreground">Credits</th>
                  <th className="text-center px-2 py-2 font-medium text-muted-foreground">Visemes</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {data.perScene.map(scene => (
                  <>
                    <tr
                      key={scene.sceneId}
                      className="border-b border-border/30 hover:bg-muted/20 cursor-pointer transition-colors"
                      onClick={() => setExpandedScene(expandedScene === scene.sceneId ? null : scene.sceneId)}
                    >
                      <td className="px-3 py-2 font-medium">Scene {scene.sceneNumber}</td>
                      <td className="text-center px-2 py-2 font-mono">{scene.durationS}s</td>
                      <td className="text-center px-2 py-2">{scene.lineCount}</td>
                      <td className="text-center px-2 py-2 font-mono">{scene.totalFrames}</td>
                      <td className="text-center px-2 py-2 font-mono text-emerald-400">{scene.costEstimate.totalCredits.toFixed(4)}</td>
                      <td className="px-2 py-2">
                        <VisemeMiniBar distribution={scene.visemeDistribution} />
                      </td>
                      <td className="px-2 py-2">
                        {expandedScene === scene.sceneId ? (
                          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </td>
                    </tr>
                    {expandedScene === scene.sceneId && (
                      <tr key={`${scene.sceneId}-detail`}>
                        <td colSpan={7} className="px-3 py-3 bg-muted/10">
                          <div className="space-y-2">
                            <div className="grid grid-cols-3 gap-2 text-[10px]">
                              <div>
                                <span className="text-muted-foreground">Characters: </span>
                                <span className="font-medium">{scene.characters.join(", ")}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Dialogue: </span>
                                <span className="font-medium">{scene.totalDialogueS}s</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Silence: </span>
                                <span className="font-medium">{scene.silenceS}s</span>
                              </div>
                            </div>
                            <div className="grid grid-cols-4 gap-1">
                              {Object.entries(scene.visemeDistribution)
                                .sort((a, b) => b[1] - a[1])
                                .map(([viseme, count]) => (
                                  <div key={viseme} className="flex items-center gap-1 text-[10px]">
                                    <div className={`h-2 w-2 rounded-sm ${VISEME_COLORS[viseme] || "bg-zinc-600"}`} />
                                    <span className="text-muted-foreground">{viseme}: {count}</span>
                                  </div>
                                ))}
                            </div>
                            <div className="flex items-center gap-2 text-[10px]">
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 text-emerald-400 border-emerald-500/20">
                                {scene.costEstimate.savingsPercent}% savings vs Kling
                              </Badge>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                {/* Totals row */}
                <tr className="bg-muted/30 font-medium">
                  <td className="px-3 py-2">Total ({data.sceneCount} scenes)</td>
                  <td className="text-center px-2 py-2 font-mono">{data.totals.durationS}s</td>
                  <td className="text-center px-2 py-2">—</td>
                  <td className="text-center px-2 py-2 font-mono">{data.totals.totalFrames}</td>
                  <td className="text-center px-2 py-2 font-mono text-emerald-400">{data.totals.totalCredits.toFixed(4)}</td>
                  <td className="px-2 py-2">
                    <VisemeMiniBar distribution={data.totals.visemeDistribution} />
                  </td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Kling comparison bar */}
          <div className="rounded-md bg-muted/30 p-2 border border-border/50 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              Full Kling equivalent: <span className="font-mono line-through">{data.totals.klingEquivalentCredits.toFixed(4)}</span> credits
            </span>
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">
              <TrendingDown className="h-3 w-3 mr-1" />
              {data.totals.savingsPercent}% episode savings
            </Badge>
          </div>
        </>
      )}
    </div>
  );
}

function VisemeMiniBar({ distribution }: { distribution: Record<string, number> }) {
  const total = Object.values(distribution).reduce((a, b) => a + b, 0);
  if (total === 0) return <div className="h-3 w-full rounded-sm bg-muted/30" />;

  const sorted = Object.entries(distribution).sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex h-3 rounded-sm overflow-hidden">
      {sorted.map(([viseme, count]) => (
        <div
          key={viseme}
          className={`${VISEME_COLORS[viseme] || "bg-zinc-600"}`}
          style={{ width: `${(count / total) * 100}%` }}
          title={`${viseme}: ${count} (${Math.round((count / total) * 100)}%)`}
        />
      ))}
    </div>
  );
}

// ─── Export/Import Preset ─────────────────────────────────────────────

interface DialoguePreset {
  version: 1;
  name: string;
  createdAt: string;
  durationS: number;
  dialogueLines: DialogueLineInput[];
  visemeOverrides: VisemeOverride[];
  loopState: LoopState;
  speed: number;
}

function ExportImportControls({
  durationS,
  dialogueLines,
  visemeOverrides,
  loopState,
  speed,
  onImport,
}: {
  durationS: number;
  dialogueLines: DialogueLineInput[];
  visemeOverrides: VisemeOverride[];
  loopState: LoopState;
  speed: number;
  onImport: (preset: DialoguePreset) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const preset: DialoguePreset = {
      version: 1,
      name: `Dialogue Preset ${new Date().toISOString().slice(0, 10)}`,
      createdAt: new Date().toISOString(),
      durationS,
      dialogueLines,
      visemeOverrides,
      loopState,
      speed,
    };

    const blob = new Blob([JSON.stringify(preset, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dialogue-preset-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Preset exported successfully");
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = JSON.parse(ev.target?.result as string);

        // Validate
        if (!raw.version || raw.version !== 1) {
          toast.error("Invalid preset: unsupported version");
          return;
        }
        if (!raw.durationS || !Array.isArray(raw.dialogueLines)) {
          toast.error("Invalid preset: missing required fields");
          return;
        }
        if (raw.dialogueLines.some((l: any) => !l.character || !l.text || l.startTimeS === undefined || l.endTimeS === undefined)) {
          toast.error("Invalid preset: malformed dialogue lines");
          return;
        }

        onImport(raw as DialoguePreset);
        toast.success(`Preset "${raw.name}" imported successfully`);
      } catch {
        toast.error("Failed to parse preset file");
      }
    };
    reader.readAsText(file);

    // Reset input so same file can be re-imported
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="flex items-center gap-1.5">
      <Button variant="ghost" size="sm" className="h-7 text-[10px] px-2 gap-1" onClick={handleExport}>
        <Download className="h-3 w-3" />
        Export
      </Button>
      <Button variant="ghost" size="sm" className="h-7 text-[10px] px-2 gap-1" onClick={() => fileInputRef.current?.click()}>
        <Upload className="h-3 w-3" />
        Import
      </Button>
      <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
    </div>
  );
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
  lines, onChange, durationS,
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

  const removeLine = (idx: number) => onChange(lines.filter((_, i) => i !== idx));

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
        <MessageSquare className="h-3.5 w-3.5" />
        Dialogue Lines
      </div>
      {lines.map((line, i) => (
        <div key={i} className="grid grid-cols-[1fr_2fr_80px_80px_32px] gap-1.5 items-center">
          <Input className="h-7 text-xs" placeholder="Character" value={line.character} onChange={(e) => updateLine(i, "character", e.target.value)} />
          <Input className="h-7 text-xs" placeholder="Dialogue text" value={line.text} onChange={(e) => updateLine(i, "text", e.target.value)} />
          <Input className="h-7 text-xs" type="number" step="0.5" min="0" max={durationS} placeholder="Start" value={line.startTimeS} onChange={(e) => updateLine(i, "startTimeS", parseFloat(e.target.value) || 0)} />
          <Input className="h-7 text-xs" type="number" step="0.5" min="0" max={durationS} placeholder="End" value={line.endTimeS} onChange={(e) => updateLine(i, "endTimeS", parseFloat(e.target.value) || 0)} />
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400" onClick={() => removeLine(i)}>×</Button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="w-full text-xs h-7" onClick={addLine}>+ Add Dialogue Line</Button>
    </div>
  );
}

// ─── Main Modal ────────────────────────────────────────────────────────

interface DialoguePreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDurationS?: number;
  initialDialogueLines?: DialogueLineInput[];
}

export function DialoguePreviewModal({
  open, onOpenChange, initialDurationS = 10, initialDialogueLines,
}: DialoguePreviewModalProps) {
  const [durationS, setDurationS] = useState(initialDurationS);
  const [dialogueLines, setDialogueLines] = useState<DialogueLineInput[]>(
    initialDialogueLines || [
      { character: "Sakura", text: "I never thought it would end like this.", emotion: "sad", startTimeS: 0.5, endTimeS: 4.0 },
      { character: "Hiro", text: "It doesn't have to. We still have a choice.", emotion: "determined", startTimeS: 4.5, endTimeS: 8.0 },
    ],
  );
  const [showConfig, setShowConfig] = useState(false);
  const [activeTab, setActiveTab] = useState("preview");
  const [editorEnabled, setEditorEnabled] = useState(false);

  const { loop, toggleLoop, setMarkerA, setMarkerB, setLoop } = useLoopState();
  const visemeEditor = useVisemeOverrides();

  // Store original frames for diff highlighting
  const [originalFrames, setOriginalFrames] = useState<Array<{ viseme: string; frameIndex: number; timeS: number }>>([]);

  const previewMutation = trpc.sceneType.previewDialogue.useMutation({
    onError: (err) => toast.error(`Preview failed: ${err.message}`),
    onSuccess: (data) => {
      // Store original frames for diff
      setOriginalFrames(data.visemeTimeline.map(f => ({ ...f })));
    },
  });

  const handlePreview = () => {
    previewMutation.mutate({
      durationS,
      cameraAngles: ["front"],
      dialogueLines: dialogueLines.map(l => ({
        character: l.character, text: l.text, emotion: l.emotion || undefined,
        startTimeS: l.startTimeS, endTimeS: l.endTimeS,
      })),
      visemeOverrides: visemeEditor.overrides.length > 0 ? visemeEditor.overrides : undefined,
    });
  };

  const data = previewMutation.data;

  // Apply overrides to displayed frames
  const displayFrames = useMemo(() => {
    if (!data) return [];
    if (visemeEditor.overrides.length === 0) return data.visemeTimeline;
    return data.visemeTimeline.map(f => {
      const override = visemeEditor.overrides.find(o => o.frameIndex === f.frameIndex);
      return override ? { ...f, viseme: override.viseme } : f;
    });
  }, [data, visemeEditor.overrides]);

  // Recompute distribution from display frames
  const displayDistribution = useMemo(() => {
    const dist: Record<string, number> = {};
    for (const f of displayFrames) {
      dist[f.viseme] = (dist[f.viseme] || 0) + 1;
    }
    return dist;
  }, [displayFrames]);

  const replay = useReplayController(
    data?.totalFrames ?? 0,
    data?.inpaintFps ?? 8,
    data?.durationS ?? 0,
    loop,
  );

  const currentViseme = useMemo(() => {
    if (!displayFrames.length) return "Rest";
    const frame = displayFrames.find(f => f.frameIndex === replay.currentFrame);
    return frame?.viseme ?? "Rest";
  }, [displayFrames, replay.currentFrame]);

  const isBlinking = useMemo(() => {
    if (!data) return false;
    return data.blinkSchedule.some(b => replay.currentFrame >= b.startFrame && replay.currentFrame <= b.endFrame);
  }, [data, replay.currentFrame]);

  const currentHeadMotion = useMemo(() => {
    if (!data || !data.headMotion.length) return null;
    return data.headMotion.find(h => h.frameIndex === replay.currentFrame) ?? null;
  }, [data, replay.currentFrame]);

  // Phoneme editor handlers
  const handleAssignViseme = useCallback((startFrame: number, endFrame: number, viseme: string) => {
    visemeEditor.setRangeOverride(startFrame, endFrame, viseme);
  }, [visemeEditor.setRangeOverride]);

  const handleSplitSegment = useCallback((startFrame: number, endFrame: number) => {
    const mid = Math.floor((startFrame + endFrame) / 2);
    // First half keeps current viseme, second half gets "Rest"
    const currentViseme = displayFrames.find(f => f.frameIndex === startFrame)?.viseme || "Rest";
    visemeEditor.setRangeOverride(startFrame, mid, currentViseme);
    visemeEditor.setRangeOverride(mid + 1, endFrame, "Rest");
    toast.success(`Split segment at frame ${mid}`);
  }, [visemeEditor.setRangeOverride, displayFrames]);

  const handleResetSegment = useCallback((startFrame: number, endFrame: number) => {
    visemeEditor.removeRangeOverrides(startFrame, endFrame);
    toast.success("Segment reset to auto-generated visemes");
  }, [visemeEditor.removeRangeOverrides]);

  // Import preset handler
  const handleImportPreset = useCallback((preset: DialoguePreset) => {
    setDurationS(preset.durationS);
    setDialogueLines(preset.dialogueLines);
    if (preset.visemeOverrides) visemeEditor.setOverrides(preset.visemeOverrides);
    if (preset.loopState) setLoop(preset.loopState);
  }, [visemeEditor.setOverrides, setLoop]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!open || !data) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.code) {
        case "Space":
          e.preventDefault();
          replay.togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          replay.stepBackward();
          break;
        case "ArrowRight":
          e.preventDefault();
          replay.stepForward();
          break;
        case "Home":
          e.preventDefault();
          replay.seekToFrame(0);
          break;
        case "End":
          e.preventDefault();
          replay.seekToFrame(Infinity);
          break;
        case "KeyL":
          e.preventDefault();
          toggleLoop();
          break;
        case "KeyE":
          e.preventDefault();
          setEditorEnabled(prev => !prev);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, data, replay.togglePlay, replay.stepBackward, replay.stepForward, replay.seekToFrame, toggleLoop]);

  useEffect(() => {
    if (!open) replay.pause();
  }, [open, replay.pause]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-blue-400" />
              Dialogue Pipeline Preview
            </DialogTitle>
            {data && (
              <ExportImportControls
                durationS={durationS}
                dialogueLines={dialogueLines}
                visemeOverrides={visemeEditor.overrides}
                loopState={loop}
                speed={replay.speed}
                onImport={handleImportPreset}
              />
            )}
          </div>
          <DialogDescription>
            Preview viseme timeline, waveform, blink schedule, and cost estimate.
            Compare with full Kling video, batch preview scenes, or fine-tune with the phoneme editor.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Configuration */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setShowConfig(!showConfig)}>
                {showConfig ? <ChevronUp className="h-3.5 w-3.5 mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}
                {showConfig ? "Hide" : "Show"} Configuration
              </Button>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                Duration:
                <Input
                  className="h-7 w-16 text-xs" type="number" min="1" max="120" value={durationS}
                  onChange={(e) => setDurationS(Math.max(1, Math.min(120, parseInt(e.target.value) || 10)))}
                />
                seconds
              </div>
            </div>

            {showConfig && (
              <DialogueLineEditor lines={dialogueLines} onChange={setDialogueLines} durationS={durationS} />
            )}

            <Button onClick={handlePreview} disabled={previewMutation.isPending} className="w-full">
              {previewMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating Preview...</>
              ) : (
                <><Play className="h-4 w-4 mr-2" />{visemeEditor.overrides.length > 0 ? "Regenerate with Edits" : "Generate Preview"}</>
              )}
            </Button>
          </div>

          {/* Results with tabs */}
          {data && (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="border-t border-border/50 pt-4">
              <TabsList className="w-full">
                <TabsTrigger value="preview" className="flex-1 gap-1.5">
                  <Eye className="h-3.5 w-3.5" />
                  Preview
                  {visemeEditor.overrides.length > 0 && (
                    <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 text-pink-400 border-pink-500/20 ml-1">
                      {visemeEditor.overrides.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="compare" className="flex-1 gap-1.5">
                  <Columns2 className="h-3.5 w-3.5" />
                  Compare
                </TabsTrigger>
                <TabsTrigger value="batch" className="flex-1 gap-1.5">
                  <ListChecks className="h-3.5 w-3.5" />
                  Batch
                </TabsTrigger>
              </TabsList>

              <TabsContent value="preview" className="space-y-4 pt-3">
                {/* Stats bar */}
                <div className="grid grid-cols-4 gap-2">
                  <StatCard label="Duration" value={`${data.durationS}s`} />
                  <StatCard label="Total Frames" value={data.totalFrames.toString()} />
                  <StatCard label="Inpaint FPS" value={data.inpaintFps.toString()} />
                  <StatCard label="Output FPS" value={data.outputFps.toString()} />
                </div>

                {/* Replay Controls with editor toggle */}
                <ReplayControls
                  replay={replay}
                  currentViseme={currentViseme}
                  isBlinking={isBlinking}
                  currentHeadMotion={currentHeadMotion}
                  loopState={loop}
                  onToggleLoop={toggleLoop}
                  editorEnabled={editorEnabled}
                  onToggleEditor={() => setEditorEnabled(!editorEnabled)}
                  overrideCount={visemeEditor.overrides.length}
                  onResetAllOverrides={() => {
                    visemeEditor.resetAll();
                    toast.success("All viseme edits reset");
                  }}
                />

                {/* Viseme Timeline with Waveform + A/B Loop + Editor */}
                <VisemeTimelineBar
                  frames={displayFrames}
                  totalFrames={data.totalFrames}
                  blinkEvents={data.blinkSchedule}
                  replay={replay}
                  waveform={data.waveform}
                  loopState={loop}
                  onSetMarkerA={setMarkerA}
                  onSetMarkerB={setMarkerB}
                  editorEnabled={editorEnabled}
                  visemeOverrides={visemeEditor.overrides}
                  originalFrames={originalFrames}
                  onAssignViseme={handleAssignViseme}
                  onSplitSegment={handleSplitSegment}
                  onResetSegment={handleResetSegment}
                />

                {/* Editor info banner */}
                {editorEnabled && (
                  <div className="rounded-md bg-pink-500/10 border border-pink-500/20 p-2 flex items-center gap-2">
                    <Pencil className="h-3.5 w-3.5 text-pink-400 shrink-0" />
                    <div className="text-[11px] text-pink-300">
                      <span className="font-medium">Phoneme Editor active.</span> Click any segment on the timeline to reassign its viseme, split it, or reset to auto.
                      {visemeEditor.overrides.length > 0 && (
                        <span className="ml-1 text-pink-400 font-medium">
                          {visemeEditor.overrides.length} frame{visemeEditor.overrides.length !== 1 ? "s" : ""} edited.
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Viseme Distribution */}
                <VisemeDistribution distribution={displayDistribution} />

                {/* Head Motion */}
                <HeadMotionPreview motion={data.headMotion} currentFrame={replay.currentFrame} />

                {/* Cost Breakdown */}
                <CostBreakdown cost={data.costEstimate} />

                {/* Pipeline Plan */}
                <PipelinePlanDisplay plan={data.pipelinePlan} />
              </TabsContent>

              <TabsContent value="compare" className="pt-3">
                <ComparePanel durationS={data.durationS} cameraAngleCount={1} />
              </TabsContent>

              <TabsContent value="batch" className="pt-3">
                <BatchPreviewPanel />
              </TabsContent>
            </Tabs>
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
