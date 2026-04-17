/**
 * Dialogue Preview Modal
 *
 * Lets creators preview the viseme timeline, blink schedule, head motion,
 * cost breakdown, and 7-stage pipeline plan for a dialogue scene
 * before committing to generation.
 *
 * Includes interactive replay animation with:
 * - Play/pause with animated playhead
 * - Click/drag scrubbing on the timeline bar
 * - Large animated mouth shape SVG display
 * - Speed control (0.25x, 0.5x, 1x, 2x)
 * - Blink flash indicator
 * - Head motion values synced to playhead
 * - Keyboard shortcuts (Space, Left/Right arrows)
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Loader2,
  MessageSquare,
  Eye,
  EyeOff,
  Move,
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

const VISEME_HEX: Record<string, string> = {
  A: "#ef4444",
  I: "#3b82f6",
  U: "#a855f7",
  E: "#f59e0b",
  O: "#10b981",
  Closed: "#475569",
  N: "#06b6d4",
  Rest: "#3f3f46",
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

// ─── Mouth Shape SVGs ─────────────────────────────────────────────────

/**
 * Renders a stylized mouth shape SVG for the given viseme.
 * Each shape is designed to clearly represent the mouth position.
 */
function MouthShapeSVG({ viseme, size = 120 }: { viseme: string; size?: number }) {
  const color = VISEME_HEX[viseme] || VISEME_HEX.Rest;
  const half = size / 2;

  const shapes: Record<string, React.ReactNode> = {
    A: (
      // Wide open mouth — tall ellipse
      <ellipse cx={half} cy={half} rx={half * 0.55} ry={half * 0.7} fill={color} opacity={0.85} />
    ),
    I: (
      // Wide smile — horizontal ellipse
      <ellipse cx={half} cy={half} rx={half * 0.7} ry={half * 0.25} fill={color} opacity={0.85} />
    ),
    U: (
      // Pucker — small circle
      <circle cx={half} cy={half} r={half * 0.3} fill={color} opacity={0.85} />
    ),
    E: (
      // Mid open — medium ellipse
      <ellipse cx={half} cy={half} rx={half * 0.5} ry={half * 0.35} fill={color} opacity={0.85} />
    ),
    O: (
      // Round — circle
      <circle cx={half} cy={half} r={half * 0.45} fill={color} opacity={0.85} />
    ),
    Closed: (
      // Closed — thin horizontal line
      <rect x={half * 0.4} y={half - 2} width={half * 1.2} height={4} rx={2} fill={color} opacity={0.85} />
    ),
    N: (
      // Nasal — slightly open, wider than closed
      <ellipse cx={half} cy={half} rx={half * 0.45} ry={half * 0.12} fill={color} opacity={0.85} />
    ),
    Rest: (
      // Rest — thin relaxed line
      <rect x={half * 0.5} y={half - 1.5} width={half * 1.0} height={3} rx={1.5} fill={color} opacity={0.4} />
    ),
  };

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transition-all duration-75">
      {/* Face outline */}
      <circle cx={half} cy={half} r={half - 2} fill="none" stroke="currentColor" strokeOpacity={0.1} strokeWidth={1.5} />
      {/* Mouth shape */}
      {shapes[viseme] || shapes.Rest}
    </svg>
  );
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

function useReplayController(totalFrames: number, fps: number, durationS: number) {
  const [state, setState] = useState<ReplayState>({
    isPlaying: false,
    currentFrame: 0,
    speed: 1,
    currentTimeS: 0,
  });

  const rafRef = useRef<number>(0);
  const lastTickRef = useRef<number>(0);

  const play = useCallback(() => {
    setState(s => ({ ...s, isPlaying: true }));
  }, []);

  const pause = useCallback(() => {
    setState(s => ({ ...s, isPlaying: false }));
  }, []);

  const togglePlay = useCallback(() => {
    setState(s => {
      // If at end, restart
      if (!s.isPlaying && s.currentFrame >= totalFrames - 1) {
        return { ...s, isPlaying: true, currentFrame: 0, currentTimeS: 0 };
      }
      return { ...s, isPlaying: !s.isPlaying };
    });
  }, [totalFrames]);

  const seekToFrame = useCallback((frame: number) => {
    const clamped = Math.max(0, Math.min(totalFrames - 1, frame));
    setState(s => ({
      ...s,
      currentFrame: clamped,
      currentTimeS: clamped / fps,
    }));
  }, [totalFrames, fps]);

  const seekToProgress = useCallback((progress: number) => {
    const clamped = Math.max(0, Math.min(1, progress));
    const frame = Math.round(clamped * (totalFrames - 1));
    setState(s => ({
      ...s,
      currentFrame: frame,
      currentTimeS: frame / fps,
    }));
  }, [totalFrames, fps]);

  const setSpeed = useCallback((speed: Speed) => {
    setState(s => ({ ...s, speed }));
  }, []);

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

  // Animation loop
  useEffect(() => {
    if (!state.isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    lastTickRef.current = performance.now();

    const tick = (now: number) => {
      const elapsed = (now - lastTickRef.current) / 1000; // seconds
      lastTickRef.current = now;

      setState(prev => {
        if (!prev.isPlaying) return prev;

        const advanceS = elapsed * prev.speed;
        const newTimeS = prev.currentTimeS + advanceS;
        const newFrame = Math.floor(newTimeS * fps);

        if (newFrame >= totalFrames) {
          // Reached end
          return {
            ...prev,
            isPlaying: false,
            currentFrame: totalFrames - 1,
            currentTimeS: durationS,
          };
        }

        return {
          ...prev,
          currentFrame: newFrame,
          currentTimeS: newTimeS,
        };
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [state.isPlaying, fps, totalFrames, durationS, state.speed]);

  return {
    ...state,
    play,
    pause,
    togglePlay,
    seekToFrame,
    seekToProgress,
    setSpeed,
    stepForward,
    stepBackward,
    progress: totalFrames > 0 ? state.currentFrame / (totalFrames - 1) : 0,
  };
}

// ─── Interactive Viseme Timeline with Replay ──────────────────────────

function VisemeTimelineBar({
  frames,
  totalFrames,
  blinkEvents,
  replay,
}: {
  frames: Array<{ viseme: string; frameIndex: number; timeS: number }>;
  totalFrames: number;
  blinkEvents: Array<{ startFrame: number; endFrame: number; character: string }>;
  replay: ReturnType<typeof useReplayController> | null;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  // Group consecutive same-viseme frames for cleaner rendering
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

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!replay || !barRef.current) return;
    isDraggingRef.current = true;
    barRef.current.setPointerCapture(e.pointerId);
    const rect = barRef.current.getBoundingClientRect();
    const progress = (e.clientX - rect.left) / rect.width;
    replay.seekToProgress(progress);
  }, [replay]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!replay || !barRef.current || !isDraggingRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    const progress = (e.clientX - rect.left) / rect.width;
    replay.seekToProgress(progress);
  }, [replay]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    isDraggingRef.current = false;
    if (barRef.current) barRef.current.releasePointerCapture(e.pointerId);
  }, []);

  // Check if current frame is in a blink event
  const isBlinking = replay
    ? blinkEvents.some(b => replay.currentFrame >= b.startFrame && replay.currentFrame <= b.endFrame)
    : false;

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground font-medium mb-1 flex items-center justify-between">
        <span>Viseme Timeline</span>
        {replay && (
          <span className="font-mono text-[10px]">
            {replay.currentTimeS.toFixed(2)}s / frame {replay.currentFrame}
          </span>
        )}
      </div>
      <div className="relative">
        {/* Main timeline bar — interactive when replay is available */}
        <div
          ref={barRef}
          className={`flex h-10 rounded-md overflow-hidden bg-muted/30 border border-border/50 relative ${
            replay ? "cursor-pointer select-none" : ""
          }`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {segments.map((seg, i) => {
            const widthPct = ((seg.endIdx - seg.startIdx + 1) / totalFrames) * 100;
            return (
              <div
                key={i}
                className={`${VISEME_COLORS[seg.viseme]} transition-all relative group`}
                style={{ width: `${Math.max(widthPct, 0.5)}%` }}
                title={`${seg.viseme} (frames ${seg.startIdx}-${seg.endIdx}, ${seg.startTimeS.toFixed(2)}s)`}
              >
                {widthPct > 4 && (
                  <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white/90 pointer-events-none">
                    {seg.viseme}
                  </span>
                )}
              </div>
            );
          })}

          {/* Playhead */}
          {replay && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)] z-10 pointer-events-none transition-[left] duration-75"
              style={{ left: `${replay.progress * 100}%` }}
            >
              {/* Playhead knob */}
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

// ─── Replay Controls ──────────────────────────────────────────────────

function ReplayControls({
  replay,
  currentViseme,
  isBlinking,
  currentHeadMotion,
}: {
  replay: ReturnType<typeof useReplayController>;
  currentViseme: string;
  isBlinking: boolean;
  currentHeadMotion: { rotationDeg: number; translationX: number; translationY: number } | null;
}) {
  return (
    <div className="rounded-lg bg-muted/30 border border-border/50 p-3 space-y-3">
      <div className="flex items-center gap-3">
        {/* Mouth shape display */}
        <div className="relative shrink-0">
          <div
            className="rounded-xl border border-border/50 bg-background/50 p-1 transition-all duration-100"
            style={{
              boxShadow: isBlinking ? "0 0 16px rgba(250, 204, 21, 0.5)" : "none",
            }}
          >
            <MouthShapeSVG viseme={currentViseme} size={80} />
          </div>
          {/* Viseme label */}
          <div
            className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
            style={{ backgroundColor: VISEME_HEX[currentViseme] || VISEME_HEX.Rest }}
          >
            {currentViseme}
          </div>
          {/* Blink indicator */}
          {isBlinking && (
            <div className="absolute -top-1 -right-1 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-yellow-400 text-[9px] font-bold text-black animate-pulse">
              <EyeOff className="h-2.5 w-2.5" />
              BLINK
            </div>
          )}
        </div>

        {/* Transport controls + info */}
        <div className="flex-1 space-y-2">
          {/* Transport buttons */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => replay.seekToFrame(0)}
              title="Go to start"
            >
              <SkipBack className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={replay.stepBackward}
              title="Step back (←)"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={replay.togglePlay}
              title={replay.isPlaying ? "Pause (Space)" : "Play (Space)"}
            >
              {replay.isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4 ml-0.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={replay.stepForward}
              title="Step forward (→)"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => replay.seekToFrame(Infinity)}
              title="Go to end"
            >
              <SkipForward className="h-3.5 w-3.5" />
            </Button>

            {/* Speed selector */}
            <div className="ml-2 flex items-center gap-1">
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

          {/* Time and frame info */}
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground font-mono">
            <span>
              Time: <span className="text-foreground font-bold">{replay.currentTimeS.toFixed(3)}s</span>
            </span>
            <span>
              Frame: <span className="text-foreground font-bold">{replay.currentFrame}</span>
            </span>
            {currentHeadMotion && (
              <>
                <span>
                  Rot: <span className="text-blue-400">{currentHeadMotion.rotationDeg.toFixed(1)}°</span>
                </span>
                <span>
                  X: <span className="text-emerald-400">{currentHeadMotion.translationX.toFixed(1)}px</span>
                </span>
                <span>
                  Y: <span className="text-pink-400">{currentHeadMotion.translationY.toFixed(1)}px</span>
                </span>
              </>
            )}
          </div>

          {/* Keyboard hint */}
          <div className="text-[9px] text-muted-foreground/60">
            Space: play/pause &middot; ← →: step frame &middot; Click timeline to scrub
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
  currentFrame,
}: {
  motion: Array<{ frameIndex: number; rotationDeg: number; translationX: number; translationY: number }>;
  currentFrame?: number;
}) {
  // Show a simplified sparkline-style visualization
  const maxRot = Math.max(...motion.map(m => Math.abs(m.rotationDeg)), 1);
  const maxTx = Math.max(...motion.map(m => Math.abs(m.translationX)), 1);
  const maxTy = Math.max(...motion.map(m => Math.abs(m.translationY)), 1);

  // Sample every Nth frame for display
  const sampleRate = Math.max(1, Math.floor(motion.length / 60));
  const sampled = motion.filter((_, i) => i % sampleRate === 0);

  const playheadX = currentFrame !== undefined
    ? (currentFrame / Math.max(1, motion.length - 1)) * sampled.length
    : null;

  const renderSparkline = (
    data: typeof sampled,
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
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            points={sampled.map((m, i) => `${i},${mid - (getValue(m) / maxVal) * mid}`).join(" ")}
          />
          {/* Playhead indicator */}
          {playheadX !== null && (
            <line
              x1={playheadX}
              y1={0}
              x2={playheadX}
              y2={height}
              stroke="white"
              strokeWidth="0.8"
              strokeOpacity="0.6"
            />
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
  const modalRef = useRef<HTMLDivElement>(null);

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

  // Initialize replay controller when data is available
  const replay = useReplayController(
    data?.totalFrames ?? 0,
    data?.inpaintFps ?? 8,
    data?.durationS ?? 0,
  );

  // Derive current viseme from replay position
  const currentViseme = useMemo(() => {
    if (!data || !data.visemeTimeline.length) return "Rest";
    const frame = data.visemeTimeline.find(f => f.frameIndex === replay.currentFrame);
    return frame?.viseme ?? "Rest";
  }, [data, replay.currentFrame]);

  // Check if currently blinking
  const isBlinking = useMemo(() => {
    if (!data) return false;
    return data.blinkSchedule.some(
      b => replay.currentFrame >= b.startFrame && replay.currentFrame <= b.endFrame,
    );
  }, [data, replay.currentFrame]);

  // Get current head motion values
  const currentHeadMotion = useMemo(() => {
    if (!data || !data.headMotion.length) return null;
    const m = data.headMotion.find(h => h.frameIndex === replay.currentFrame);
    return m ?? null;
  }, [data, replay.currentFrame]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!open || !data) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture if user is typing in an input
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
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, data, replay.togglePlay, replay.stepBackward, replay.stepForward, replay.seekToFrame]);

  // Pause replay when modal closes
  useEffect(() => {
    if (!open) {
      replay.pause();
    }
  }, [open, replay.pause]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" ref={modalRef}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-blue-400" />
            Dialogue Pipeline Preview
          </DialogTitle>
          <DialogDescription>
            Preview the viseme timeline, blink schedule, head motion, and cost estimate
            for a dialogue scene. Use the replay controls to scrub through mouth shapes in real-time.
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

              {/* Replay Controls — mouth shape + transport */}
              <ReplayControls
                replay={replay}
                currentViseme={currentViseme}
                isBlinking={isBlinking}
                currentHeadMotion={currentHeadMotion}
              />

              {/* Viseme Timeline with interactive playhead */}
              <VisemeTimelineBar
                frames={data.visemeTimeline}
                totalFrames={data.totalFrames}
                blinkEvents={data.blinkSchedule}
                replay={replay}
              />

              {/* Viseme Distribution */}
              <VisemeDistribution distribution={data.visemeDistribution} />

              {/* Head Motion with playhead */}
              <HeadMotionPreview motion={data.headMotion} currentFrame={replay.currentFrame} />

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
