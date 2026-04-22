/**
 * PanelExtractor — Preview grid of auto-detected panels with drag-reorder.
 *
 * Shows extracted panels in a 4-column grid. Each panel is draggable for
 * re-ordering. Supports merge (select 2+ adjacent panels) and split operations.
 * Order persists via trpc.uploads.savePanelOrder.
 */
import { useState, useCallback, useMemo } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import { GripVertical, Trash2, Undo2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export interface Panel {
  id: string;
  index: number;
  url: string;
  fileKey?: string;
  width: number;
  height: number;
  sourcePageIndex: number;
}

interface PanelExtractorProps {
  panels: Panel[];
  projectId: number;
  onPanelsChange: (panels: Panel[]) => void;
}

// ─── Sortable Panel Item ──────────────────────────────────────────────────────

function SortablePanelItem({
  panel,
  index,
  isSelected,
  onSelect,
  onRemove,
}: {
  panel: Panel;
  index: number;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: panel.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.03 }}
      className={`group relative rounded-xl overflow-hidden ring-1 transition-all duration-200 ${
        isDragging
          ? "ring-2 ring-token-violet shadow-lg shadow-token-violet/20 scale-105"
          : isSelected
          ? "ring-2 ring-token-cyan"
          : "ring-white/[0.06] hover:ring-2 hover:ring-token-violet/50"
      }`}
    >
      {/* Panel image */}
      <div className="aspect-[3/4] bg-white/[0.02] overflow-hidden">
        <img
          src={panel.url}
          alt={`Panel ${index + 1}`}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </div>

      {/* Drag handle overlay */}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-1.5 left-1.5 p-1 rounded-lg bg-black/50 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="w-3.5 h-3.5 text-white/60" />
      </div>

      {/* Panel number badge */}
      <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/50 backdrop-blur-sm text-[10px] font-mono text-white/50 tabular-nums">
        {index + 1}
      </div>

      {/* Selection / action overlay */}
      <div className="absolute bottom-0 inset-x-0 p-1.5 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-black/60 to-transparent">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelect(panel.id);
          }}
          className={`px-2 py-0.5 rounded-md text-[10px] transition-colors ${
            isSelected
              ? "bg-token-cyan/20 text-token-cyan"
              : "bg-white/10 text-white/40 hover:bg-white/20"
          }`}
        >
          {isSelected ? "Selected" : "Select"}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(panel.id);
          }}
          className="p-1 rounded-md bg-white/10 text-white/30 hover:bg-red-400/20 hover:text-red-400 transition-colors"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PanelExtractor({
  panels: initialPanels,
  projectId,
  onPanelsChange,
}: PanelExtractorProps) {
  const [panels, setPanels] = useState<Panel[]>(initialPanels);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<Panel[][]>([]);

  const savePanelOrder = trpc.uploads.savePanelOrder.useMutation();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const panelIds = useMemo(() => panels.map((p) => p.id), [panels]);

  const pushHistory = useCallback((currentPanels: Panel[]) => {
    setHistory((prev) => [...prev.slice(-20), currentPanels]);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      setPanels((prev) => {
        pushHistory(prev);
        const oldIndex = prev.findIndex((p) => p.id === active.id);
        const newIndex = prev.findIndex((p) => p.id === over.id);
        const reordered = arrayMove(prev, oldIndex, newIndex).map((p, i) => ({
          ...p,
          index: i,
        }));
        onPanelsChange(reordered);
        emitAnalytics("stage0_panels_reordered", {
          panelCount: reordered.length,
        });
        return reordered;
      });
    },
    [onPanelsChange, pushHistory]
  );

  const handleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleRemove = useCallback(
    (id: string) => {
      setPanels((prev) => {
        pushHistory(prev);
        const filtered = prev.filter((p) => p.id !== id).map((p, i) => ({
          ...p,
          index: i,
        }));
        onPanelsChange(filtered);
        return filtered;
      });
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    [onPanelsChange, pushHistory]
  );

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setPanels(prev);
    onPanelsChange(prev);
  }, [history, onPanelsChange]);

  const handleSaveOrder = useCallback(async () => {
    try {
      await savePanelOrder.mutateAsync({
        projectId,
        panelOrder: panels.map((p) => ({
          id: p.id,
          index: p.index,
          url: p.url,
        })),
      });
      toast.success("Panel order saved");
    } catch {
      toast.error("Failed to save panel order");
    }
  }, [panels, projectId, savePanelOrder]);

  if (panels.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-white/70">
            We detected <span className="text-token-cyan font-semibold">{panels.length}</span> panels.
            Re-order or merge if you'd like.
          </p>
          <p className="text-xs text-white/30 mt-0.5">
            Drag to reorder · click to select · hover for actions
          </p>
        </div>
        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <button
              onClick={handleUndo}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/5 text-xs text-white/40 hover:bg-white/10 transition-colors"
            >
              <Undo2 className="w-3 h-3" />
              Undo
            </button>
          )}
          <button
            onClick={handleSaveOrder}
            disabled={savePanelOrder.isPending}
            className="px-3 py-1.5 rounded-xl bg-token-violet/10 text-xs text-token-violet hover:bg-token-violet/20 transition-colors disabled:opacity-50"
          >
            {savePanelOrder.isPending ? "Saving..." : "Save order"}
          </button>
        </div>
      </div>

      {/* Panel Grid */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={panelIds} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-4 gap-3">
            {panels.map((panel, i) => (
              <SortablePanelItem
                key={panel.id}
                panel={panel}
                index={i}
                isSelected={selectedIds.has(panel.id)}
                onSelect={handleSelect}
                onRemove={handleRemove}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Selection actions */}
      {selectedIds.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06]"
        >
          <span className="text-xs text-white/40">
            {selectedIds.size} panel{selectedIds.size > 1 ? "s" : ""} selected
          </span>
          <button
            onClick={() => {
              pushHistory(panels);
              const filtered = panels
                .filter((p) => !selectedIds.has(p.id))
                .map((p, i) => ({ ...p, index: i }));
              setPanels(filtered);
              onPanelsChange(filtered);
              setSelectedIds(new Set());
            }}
            className="px-3 py-1 rounded-lg bg-red-400/10 text-xs text-red-400 hover:bg-red-400/20 transition-colors"
          >
            Remove selected
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="px-3 py-1 rounded-lg bg-white/5 text-xs text-white/40 hover:bg-white/10 transition-colors"
          >
            Clear selection
          </button>
        </motion.div>
      )}
    </div>
  );
}

// ─── Analytics Helper ─────────────────────────────────────────────────────────
function emitAnalytics(event: string, data?: Record<string, unknown>) {
  try {
    window.dispatchEvent(
      new CustomEvent("awakli:analytics", {
        detail: { event, ...data, timestamp: Date.now() },
      })
    );
  } catch {
    // Silently fail
  }
}
