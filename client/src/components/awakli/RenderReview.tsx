/**
 * RenderReview — post-render player with approve/redo gates.
 *
 * Spec: Stage 6 · Video — Short-form Render (Mangaka)
 */
import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Pause,
  Download,
  RotateCcw,
  Check,
  Volume2,
  VolumeX,
  Maximize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Exported copy strings (exact spec) ─────────────────────────────
export const REVIEW_COPY = {
  approve: "Approve & download",
  redo: "Redo a panel",
  redoCost: 18,
  redoCta: "Redo · 18 credits",
  selectPanel: "Select the panel to redo",
} as const;

// ─── Types ──────────────────────────────────────────────────────────
export interface RenderResult {
  videoUrl: string;
  duration: number; // seconds
  resolution: string; // e.g. "1080p"
  format: string; // e.g. "MP4 H.264"
  fileSize?: string; // e.g. "42 MB"
}

export interface ReviewPanel {
  panelIndex: number;
  imageUrl: string | null;
  startTime: number; // seconds into video
  endTime: number;
}

interface RenderReviewProps {
  result: RenderResult;
  panels: ReviewPanel[];
  onApprove: () => void;
  onRedo: (panelIndex: number) => void;
  approving?: boolean;
  redoing?: boolean;
}

// ─── Component ──────────────────────────────────────────────────────
export default function RenderReview({
  result,
  panels,
  onApprove,
  onRedo,
  approving = false,
  redoing = false,
}: RenderReviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [redoMode, setRedoMode] = useState(false);
  const [selectedPanel, setSelectedPanel] = useState<number | null>(null);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (playing) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setPlaying(!playing);
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !muted;
    setMuted(!muted);
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleFullscreen = () => {
    videoRef.current?.requestFullscreen?.();
  };

  const handleRedoConfirm = () => {
    if (selectedPanel !== null) {
      onRedo(selectedPanel);
    }
  };

  // Find which panel is currently playing
  const activePanel = panels.find(
    (p) => currentTime >= p.startTime && currentTime < p.endTime
  );

  return (
    <div className="space-y-6">
      {/* Video player */}
      <div className="relative rounded-xl overflow-hidden bg-black aspect-video group">
        <video
          ref={videoRef}
          src={result.videoUrl}
          className="w-full h-full object-contain"
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => setPlaying(false)}
          playsInline
        />

        {/* Play overlay */}
        <div
          className="absolute inset-0 flex items-center justify-center cursor-pointer"
          onClick={togglePlay}
        >
          <AnimatePresence>
            {!playing && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center"
              >
                <Play className="w-7 h-7 text-white ml-1" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Controls bar */}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Progress bar */}
          <div className="w-full h-1 bg-white/20 rounded-full mb-2 cursor-pointer relative">
            <div
              className="h-full bg-violet-500 rounded-full"
              style={{
                width: `${(currentTime / (result.duration || 1)) * 100}%`,
              }}
            />
            {/* Panel markers */}
            {panels.map((p) => (
              <div
                key={p.panelIndex}
                className="absolute top-0 w-px h-full bg-white/30"
                style={{
                  left: `${(p.startTime / (result.duration || 1)) * 100}%`,
                }}
              />
            ))}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={togglePlay} className="text-white/80 hover:text-white">
                {playing ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
              </button>
              <button onClick={toggleMute} className="text-white/80 hover:text-white">
                {muted ? (
                  <VolumeX className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              <span className="text-xs text-white/50 font-mono">
                {formatTime(currentTime)} / {formatTime(result.duration)}
              </span>
              {activePanel && (
                <span className="text-[10px] text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded">
                  Panel {activePanel.panelIndex + 1}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-white/30">
                {result.resolution} · {result.format}
              </span>
              <button onClick={handleFullscreen} className="text-white/80 hover:text-white">
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          onClick={onApprove}
          disabled={approving || redoing}
          className="flex-1 gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white border-none"
        >
          {approving ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1 }}
            >
              <Download className="w-4 h-4" />
            </motion.div>
          ) : (
            <Check className="w-4 h-4" />
          )}
          {REVIEW_COPY.approve}
        </Button>

        <Button
          variant="outline"
          onClick={() => setRedoMode(!redoMode)}
          disabled={approving || redoing}
          className="flex-1 gap-2 border-white/10 text-white/70 hover:text-white hover:border-white/20"
        >
          <RotateCcw className="w-4 h-4" />
          {REVIEW_COPY.redo}
        </Button>
      </div>

      {/* Redo panel selector */}
      <AnimatePresence>
        {redoMode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3"
          >
            <p className="text-xs text-white/40">{REVIEW_COPY.selectPanel}</p>
            <div className="flex overflow-x-auto gap-2 pb-2">
              {panels.map((panel) => (
                <button
                  key={panel.panelIndex}
                  onClick={() => setSelectedPanel(panel.panelIndex)}
                  className={`shrink-0 w-16 aspect-[3/4] rounded-lg overflow-hidden ring-2 transition-all ${
                    selectedPanel === panel.panelIndex
                      ? "ring-violet-500 scale-105"
                      : "ring-transparent hover:ring-white/20"
                  }`}
                >
                  {panel.imageUrl ? (
                    <img
                      src={panel.imageUrl}
                      alt={`Panel ${panel.panelIndex + 1}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-ink/20 flex items-center justify-center text-white/20 text-[10px]">
                      {panel.panelIndex + 1}
                    </div>
                  )}
                </button>
              ))}
            </div>

            <Button
              onClick={handleRedoConfirm}
              disabled={selectedPanel === null || redoing}
              className="gap-2 bg-violet-600 hover:bg-violet-500 text-white border-none"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {REVIEW_COPY.redoCta}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
