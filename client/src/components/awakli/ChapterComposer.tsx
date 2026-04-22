/**
 * ChapterComposer — multi-chapter timeline with scene cards.
 *
 * Studio: drag scenes across chapter boundaries, set chapter markers.
 * Studio Pro: same + unlimited chapters.
 */
import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Layers,
  Plus,
  GripVertical,
  Trash2,
  ChevronDown,
  ChevronUp,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Exported copy strings (exact spec) ─────────────────────────────
export const CHAPTER_COPY = {
  title: "Chapters",
  addChapter: "Add chapter",
  removeChapter: "Remove",
  chapterLabel: (n: number) => `Chapter ${n}`,
  sceneCount: (n: number) => `${n} scene${n !== 1 ? "s" : ""}`,
  duration: (s: number) => `${s.toFixed(1)}s`,
  totalDuration: (s: number) => `Total: ${s.toFixed(1)}s`,
  dragHint: "Drag scenes between chapters to reorder",
  emptyChapter: "Drag scenes here or add from the timeline",
} as const;

// ─── Types ──────────────────────────────────────────────────────────
export interface ChapterScene {
  panelIndex: number;
  imageUrl: string | null;
  duration: number;
}

export interface Chapter {
  id: string;
  title: string;
  scenes: ChapterScene[];
  collapsed: boolean;
}

export interface ChapterComposerProps {
  chapters: Chapter[];
  onChaptersChange: (chapters: Chapter[]) => void;
  maxChapters?: number;
  maxRuntimeSeconds: number;
  tier: string;
}

// ─── Helpers ────────────────────────────────────────────────────────
export function chapterDuration(chapter: Chapter): number {
  return chapter.scenes.reduce((sum, s) => sum + s.duration, 0);
}

export function totalChaptersDuration(chapters: Chapter[]): number {
  return chapters.reduce((sum, ch) => sum + chapterDuration(ch), 0);
}

export function createChapter(index: number): Chapter {
  return {
    id: `ch-${Date.now()}-${index}`,
    title: `Chapter ${index + 1}`,
    scenes: [],
    collapsed: false,
  };
}

// ─── Component ──────────────────────────────────────────────────────
export default function ChapterComposer({
  chapters,
  onChaptersChange,
  maxChapters = 12,
  maxRuntimeSeconds,
  tier,
}: ChapterComposerProps) {
  const [dragSource, setDragSource] = useState<{
    chapterIdx: number;
    sceneIdx: number;
  } | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    chapterIdx: number;
    position: number;
  } | null>(null);

  const totalDuration = useMemo(
    () => totalChaptersDuration(chapters),
    [chapters]
  );
  const overBudget = totalDuration > maxRuntimeSeconds;
  const canAddChapter =
    tier === "studio_pro" ? true : chapters.length < maxChapters;

  // ── Add chapter ───────────────────────────────────────────────────
  const handleAddChapter = useCallback(() => {
    if (!canAddChapter) return;
    const updated = [...chapters, createChapter(chapters.length)];
    onChaptersChange(updated);
  }, [chapters, canAddChapter, onChaptersChange]);

  // ── Remove chapter ────────────────────────────────────────────────
  const handleRemoveChapter = useCallback(
    (idx: number) => {
      if (chapters.length <= 1) return;
      const updated = chapters.filter((_, i) => i !== idx);
      onChaptersChange(updated);
    },
    [chapters, onChaptersChange]
  );

  // ── Toggle collapse ───────────────────────────────────────────────
  const handleToggleCollapse = useCallback(
    (idx: number) => {
      const updated = chapters.map((ch, i) =>
        i === idx ? { ...ch, collapsed: !ch.collapsed } : ch
      );
      onChaptersChange(updated);
    },
    [chapters, onChaptersChange]
  );

  // ── Drag & drop handlers ──────────────────────────────────────────
  const handleDragStart = useCallback(
    (chapterIdx: number, sceneIdx: number) => {
      setDragSource({ chapterIdx, sceneIdx });
    },
    []
  );

  const handleDragOver = useCallback(
    (chapterIdx: number, position: number) => {
      setDropTarget({ chapterIdx, position });
    },
    []
  );

  const handleDrop = useCallback(() => {
    if (!dragSource || !dropTarget) {
      setDragSource(null);
      setDropTarget(null);
      return;
    }

    const updated = chapters.map((ch) => ({
      ...ch,
      scenes: [...ch.scenes],
    }));

    // Remove scene from source
    const [scene] = updated[dragSource.chapterIdx].scenes.splice(
      dragSource.sceneIdx,
      1
    );

    // Insert at target
    const targetIdx =
      dragSource.chapterIdx === dropTarget.chapterIdx &&
      dragSource.sceneIdx < dropTarget.position
        ? dropTarget.position - 1
        : dropTarget.position;

    updated[dropTarget.chapterIdx].scenes.splice(
      Math.max(0, targetIdx),
      0,
      scene
    );

    onChaptersChange(updated);
    setDragSource(null);
    setDropTarget(null);
  }, [dragSource, dropTarget, chapters, onChaptersChange]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-violet-400" />
          <h3 className="text-sm font-semibold text-white/80">
            {CHAPTER_COPY.title}
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`text-xs font-mono ${
              overBudget ? "text-red-400" : "text-white/40"
            }`}
          >
            {CHAPTER_COPY.totalDuration(totalDuration)}
            {overBudget && ` / ${maxRuntimeSeconds}s max`}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddChapter}
            disabled={!canAddChapter}
            className="gap-1 text-xs border-white/10 text-white/60 hover:text-white/80"
          >
            <Plus className="w-3 h-3" />
            {CHAPTER_COPY.addChapter}
          </Button>
        </div>
      </div>

      {/* Drag hint */}
      <p className="text-[11px] text-white/30">{CHAPTER_COPY.dragHint}</p>

      {/* Chapter lanes */}
      <div className="space-y-3">
        <AnimatePresence>
          {chapters.map((chapter, chIdx) => {
            const chDuration = chapterDuration(chapter);
            return (
              <motion.div
                key={chapter.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="rounded-lg border border-white/5 bg-white/[0.02] overflow-hidden"
              >
                {/* Chapter header */}
                <div className="flex items-center justify-between px-4 py-3 bg-white/[0.02]">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleToggleCollapse(chIdx)}
                      className="text-white/40 hover:text-white/60 transition"
                    >
                      {chapter.collapsed ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronUp className="w-4 h-4" />
                      )}
                    </button>
                    <span className="text-sm font-medium text-white/70">
                      {CHAPTER_COPY.chapterLabel(chIdx + 1)}
                    </span>
                    <span className="text-[11px] text-white/30">
                      {CHAPTER_COPY.sceneCount(chapter.scenes.length)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-xs text-white/40 font-mono">
                      <Clock className="w-3 h-3" />
                      {CHAPTER_COPY.duration(chDuration)}
                    </span>
                    {chapters.length > 1 && (
                      <button
                        onClick={() => handleRemoveChapter(chIdx)}
                        className="text-white/20 hover:text-red-400 transition"
                        title={CHAPTER_COPY.removeChapter}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Scene cards */}
                {!chapter.collapsed && (
                  <div
                    className="px-4 py-3 space-y-2 min-h-[60px]"
                    onDragOver={(e) => {
                      e.preventDefault();
                      handleDragOver(chIdx, chapter.scenes.length);
                    }}
                    onDrop={handleDrop}
                  >
                    {chapter.scenes.length === 0 ? (
                      <p className="text-xs text-white/20 text-center py-4">
                        {CHAPTER_COPY.emptyChapter}
                      </p>
                    ) : (
                      chapter.scenes.map((scene, sIdx) => {
                        const isDragging =
                          dragSource?.chapterIdx === chIdx &&
                          dragSource?.sceneIdx === sIdx;
                        const isDropTarget =
                          dropTarget?.chapterIdx === chIdx &&
                          dropTarget?.position === sIdx;

                        return (
                          <div
                            key={`${chapter.id}-${scene.panelIndex}`}
                            draggable
                            onDragStart={() => handleDragStart(chIdx, sIdx)}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDragOver(chIdx, sIdx);
                            }}
                            onDrop={(e) => {
                              e.stopPropagation();
                              handleDrop();
                            }}
                            className={`flex items-center gap-3 px-3 py-2 rounded-md transition-all cursor-grab active:cursor-grabbing ${
                              isDragging
                                ? "opacity-30 scale-95"
                                : isDropTarget
                                ? "ring-2 ring-violet-500/40 bg-violet-500/5"
                                : "bg-white/[0.03] hover:bg-white/[0.05]"
                            }`}
                          >
                            <GripVertical className="w-3.5 h-3.5 text-white/20 flex-shrink-0" />

                            {/* Panel thumbnail */}
                            <div className="w-10 h-14 rounded bg-white/5 flex-shrink-0 overflow-hidden">
                              {scene.imageUrl ? (
                                <img
                                  src={scene.imageUrl}
                                  alt={`Panel ${scene.panelIndex + 1}`}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[10px] text-white/20">
                                  {scene.panelIndex + 1}
                                </div>
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <span className="text-xs text-white/60">
                                Panel {scene.panelIndex + 1}
                              </span>
                            </div>

                            <span className="text-[11px] text-white/30 font-mono flex-shrink-0">
                              {scene.duration.toFixed(1)}s
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
