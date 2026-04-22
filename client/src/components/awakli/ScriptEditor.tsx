/**
 * ScriptEditor — Two-column layout for the script stage.
 *
 * Left column: Draggable scene list with SceneCards.
 * Right column: Detail panel for the selected scene (full panel breakdown + edit).
 * Bottom bar: Approval progress + "Approve all" + "Proceed" CTA.
 */
import { useState, useCallback, useMemo } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  CheckCheck,
  ChevronRight,
  Edit3,
  Loader2,
  MapPin,
  Clock,
  Palette,
  Image,
  MessageSquare,
  Users,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { SceneCard, type SceneData, type ScenePanel, type DialogueLine } from "./SceneCard";
import { CharacterChip } from "./CharacterChip";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface ScriptEditorProps {
  episodeId: number;
  scenes: SceneData[];
  locked: boolean;
  onScenesChange: (scenes: SceneData[]) => void;
  onAllApproved: () => void;
}

/* ─── Sortable wrapper ─────────────────────────────────────────── */
function SortableSceneCard({
  scene,
  isSelected,
  onSelect,
  onApprove,
  onRegenerate,
  onCharacterClick,
  approving,
  regenerating,
  locked,
}: {
  scene: SceneData;
  isSelected: boolean;
  onSelect: () => void;
  onApprove: (n: number) => void;
  onRegenerate: (n: number, inst?: string) => void;
  onCharacterClick: (name: string) => void;
  approving: boolean;
  regenerating: boolean;
  locked: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: scene.scene_number.toString() });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : "auto" as any,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <SceneCard
        scene={scene}
        isSelected={isSelected}
        onSelect={onSelect}
        onApprove={onApprove}
        onRegenerate={onRegenerate}
        onCharacterClick={onCharacterClick}
        approving={approving}
        regenerating={regenerating}
        dragHandleProps={listeners}
        locked={locked}
      />
    </div>
  );
}

/* ─── Detail Panel ─────────────────────────────────────────────── */
function SceneDetailPanel({
  scene,
  onApprove,
  onRegenerate,
  onCharacterClick,
  approving,
  regenerating,
  locked,
  onClose,
}: {
  scene: SceneData;
  onApprove: (n: number) => void;
  onRegenerate: (n: number, inst?: string) => void;
  onCharacterClick: (name: string) => void;
  approving: boolean;
  regenerating: boolean;
  locked: boolean;
  onClose: () => void;
}) {
  const [regenNote, setRegenNote] = useState("");
  const dialogueCount = scene.panels.reduce((s, p) => s + p.dialogue.length, 0);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="h-full flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-lg grid place-items-center text-sm font-bold ${
              scene.approved
                ? "bg-[#00F0FF]/10 text-[#00F0FF]"
                : "bg-white/5 text-white/40"
            }`}
          >
            {scene.scene_number}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white/80">
              {scene.title || `Scene ${scene.scene_number}`}
            </h3>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-[10px] text-white/30 flex items-center gap-1">
                <MapPin className="w-2.5 h-2.5" /> {scene.location}
              </span>
              <span className="text-[10px] text-white/30 flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" /> {scene.time_of_day}
              </span>
              <span className="text-[10px] text-white/30 flex items-center gap-1">
                <Palette className="w-2.5 h-2.5" /> {scene.mood}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-white/20 hover:text-white/50 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Stats row */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs text-white/30">
            <Image className="w-3.5 h-3.5" />
            {scene.panels.length} panels
          </div>
          <div className="flex items-center gap-1.5 text-xs text-white/30">
            <MessageSquare className="w-3.5 h-3.5" />
            {dialogueCount} lines
          </div>
          <div className="flex items-center gap-1.5 text-xs text-white/30">
            <Users className="w-3.5 h-3.5" />
            {scene.characters?.length || 0} characters
          </div>
        </div>

        {/* Characters */}
        {scene.characters && scene.characters.length > 0 && (
          <div>
            <div className="text-[10px] text-white/30 uppercase tracking-wider mb-2">
              Characters in this scene
            </div>
            <div className="flex flex-wrap gap-1.5">
              {scene.characters.map((name) => (
                <CharacterChip
                  key={name}
                  name={name}
                  size="md"
                  onClick={() => onCharacterClick(name)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Beat summary */}
        {scene.beat_summary && (
          <div>
            <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1">
              Beat Summary
            </div>
            <p className="text-xs text-white/50 italic leading-relaxed">
              "{scene.beat_summary}"
            </p>
          </div>
        )}

        {/* Description */}
        <div>
          <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1">
            Scene Description
          </div>
          <p className="text-xs text-white/50 leading-relaxed">{scene.description}</p>
        </div>

        {/* Panels */}
        <div>
          <div className="text-[10px] text-white/30 uppercase tracking-wider mb-3">
            Panel Breakdown
          </div>
          <div className="space-y-3">
            {scene.panels.map((panel) => (
              <div
                key={panel.panel_number}
                className="bg-white/[0.02] rounded-xl p-4 border border-white/5"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-mono text-white/30 bg-white/5 px-1.5 py-0.5 rounded">
                    P{panel.panel_number}
                  </span>
                  <span className="text-[10px] text-[#6B5BFF]/60 px-1.5 py-0.5 rounded bg-[#6B5BFF]/5">
                    {panel.camera_angle}
                  </span>
                  {panel.transition && (
                    <span className="text-[10px] text-white/20 ml-auto">
                      → {panel.transition}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-white/40 leading-relaxed">
                  {panel.visual_description}
                </p>
                {panel.dialogue.length > 0 && (
                  <div className="space-y-1.5 mt-3 pl-3 border-l border-white/5">
                    {panel.dialogue.map((d, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <CharacterChip
                          name={d.character}
                          size="sm"
                          onClick={() => onCharacterClick(d.character)}
                        />
                        <div className="text-[11px] text-white/50 flex-1">
                          "{d.text}"
                          <span className="text-white/20 ml-1">({d.emotion})</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {panel.sfx && (
                  <div className="text-[10px] text-yellow-400/50 mt-2">
                    SFX: {panel.sfx}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Regen with notes */}
        {!locked && (
          <div className="space-y-2">
            <div className="text-[10px] text-white/30 uppercase tracking-wider">
              Regenerate with direction
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={regenNote}
                onChange={(e) => setRegenNote(e.target.value)}
                placeholder="E.g., 'Make it more dramatic' or 'Add a plot twist'"
                className="flex-1 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-xs text-white/70 placeholder:text-white/15 outline-none focus:ring-1 focus:ring-[#6B5BFF]/50"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && regenNote.trim()) {
                    onRegenerate(scene.scene_number, regenNote.trim());
                    setRegenNote("");
                  }
                }}
              />
              <button
                onClick={() => {
                  if (regenNote.trim()) {
                    onRegenerate(scene.scene_number, regenNote.trim());
                    setRegenNote("");
                  }
                }}
                disabled={!regenNote.trim() || regenerating}
                className="px-3 py-2 rounded-xl text-xs font-medium bg-[#6B5BFF]/10 text-[#6B5BFF] hover:bg-[#6B5BFF]/20 transition-all disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer actions */}
      {!locked && (
        <div className="px-5 py-3 border-t border-white/5 flex items-center gap-2">
          <button
            onClick={() => onApprove(scene.scene_number)}
            disabled={scene.approved || approving}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium transition-all ${
              scene.approved
                ? "bg-[#00F0FF]/10 text-[#00F0FF]/60 cursor-default"
                : "bg-[#00F0FF]/10 text-[#00F0FF] hover:bg-[#00F0FF]/20"
            }`}
          >
            {approving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            {scene.approved ? "Approved" : "Approve scene"}
          </button>
          <button
            onClick={() => onRegenerate(scene.scene_number)}
            disabled={regenerating}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium bg-white/5 text-white/40 hover:text-white/60 hover:bg-white/10 transition-all disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Regenerate <span className="text-white/20 ml-0.5">(3c)</span>
          </button>
        </div>
      )}
    </motion.div>
  );
}

/* ─── Rename Dialog ────────────────────────────────────────────── */
function RenameDialog({
  characterName,
  onRename,
  onClose,
  renaming,
}: {
  characterName: string;
  onRename: (oldName: string, newName: string) => void;
  onClose: () => void;
  renaming: boolean;
}) {
  const [newName, setNewName] = useState(characterName);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 grid place-items-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-white/80 mb-1">
          Rename character globally
        </h3>
        <p className="text-xs text-white/30 mb-4">
          This will rename "{characterName}" across all scenes and dialogue.
        </p>
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-sm text-white/80 outline-none focus:ring-1 focus:ring-[#6B5BFF]/50 mb-4"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && newName.trim() && newName !== characterName) {
              onRename(characterName, newName.trim());
            }
          }}
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs text-white/40 hover:text-white/60 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onRename(characterName, newName.trim())}
            disabled={!newName.trim() || newName === characterName || renaming}
            className="px-4 py-2 rounded-xl text-xs font-medium bg-[#6B5BFF]/10 text-[#6B5BFF] hover:bg-[#6B5BFF]/20 transition-all disabled:opacity-50"
          >
            {renaming ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              "Rename everywhere"
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─── Main ScriptEditor ───────────────────────────────────────── */
export function ScriptEditor({
  episodeId,
  scenes,
  locked,
  onScenesChange,
  onAllApproved,
}: ScriptEditorProps) {
  const [selectedScene, setSelectedScene] = useState<number | null>(null);
  const [approvingScene, setApprovingScene] = useState<number | null>(null);
  const [regeneratingScene, setRegeneratingScene] = useState<number | null>(null);
  const [renamingCharacter, setRenamingCharacter] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);

  const utils = trpc.useUtils();

  const approveSceneMut = trpc.episodes.approveScene.useMutation({
    onSuccess: (data, vars) => {
      const updated = scenes.map((s) =>
        s.scene_number === vars.sceneNumber ? { ...s, approved: true } : s
      );
      onScenesChange(updated);
      if (data.allApproved) {
        toast.success("All scenes approved. Ready to proceed.");
        onAllApproved();
      }
      setApprovingScene(null);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to approve scene");
      setApprovingScene(null);
    },
  });

  const approveAllMut = trpc.episodes.approveAllScenes.useMutation({
    onSuccess: () => {
      const updated = scenes.map((s) => ({ ...s, approved: true }));
      onScenesChange(updated);
      toast.success("All scenes approved. Ready to proceed.");
      onAllApproved();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to approve all scenes");
    },
  });

  const reorderMut = trpc.episodes.reorderScenes.useMutation({
    onError: (err) => {
      toast.error(err.message || "Failed to reorder scenes");
    },
  });

  const regenMut = trpc.episodes.regenerateScene.useMutation({
    onSuccess: (data) => {
      const updated = scenes.map((s) =>
        s.scene_number === data.scene_number ? { ...data, approved: false } : s
      );
      onScenesChange(updated);
      toast.success(`Scene ${data.scene_number} regenerated`);
      setRegeneratingScene(null);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to regenerate scene");
      setRegeneratingScene(null);
    },
  });

  const renameMut = trpc.episodes.renameCharacter.useMutation({
    onSuccess: (data) => {
      // Refresh scenes from server after rename
      utils.episodes.getScenes.invalidate({ episodeId });
      toast.success(`Renamed across ${data.updatedScenes} scenes, ${data.updatedDialogues} dialogue lines`);
      setRenamingCharacter(null);
      setIsRenaming(false);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to rename character");
      setIsRenaming(false);
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const approvedCount = scenes.filter((s) => s.approved).length;
  const allApproved = approvedCount === scenes.length && scenes.length > 0;
  const progressPercent = scenes.length > 0 ? (approvedCount / scenes.length) * 100 : 0;

  const selectedSceneData = useMemo(
    () => scenes.find((s) => s.scene_number === selectedScene) || null,
    [scenes, selectedScene]
  );

  const allCharacters = useMemo(() => {
    const set = new Set<string>();
    scenes.forEach((s) => s.characters?.forEach((c) => set.add(c)));
    return Array.from(set).sort();
  }, [scenes]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = scenes.findIndex(
        (s) => s.scene_number.toString() === active.id
      );
      const newIndex = scenes.findIndex(
        (s) => s.scene_number.toString() === over.id
      );

      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(scenes, oldIndex, newIndex);
      onScenesChange(reordered);

      // Persist new order
      reorderMut.mutate({
        episodeId,
        newOrder: reordered.map((s) => s.scene_number),
      });
    },
    [scenes, onScenesChange, reorderMut, episodeId]
  );

  const handleApprove = useCallback(
    (sceneNumber: number) => {
      setApprovingScene(sceneNumber);
      approveSceneMut.mutate({ episodeId, sceneNumber });
    },
    [approveSceneMut, episodeId]
  );

  const handleRegenerate = useCallback(
    (sceneNumber: number, instruction?: string) => {
      setRegeneratingScene(sceneNumber);
      regenMut.mutate({ episodeId, sceneNumber, instruction });
    },
    [regenMut, episodeId]
  );

  const handleRename = useCallback(
    (oldName: string, newName: string) => {
      setIsRenaming(true);
      renameMut.mutate({ episodeId, oldName, newName });
    },
    [renameMut, episodeId]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Top bar: character chips + stats */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-white/30 uppercase tracking-wider mr-1">
            Cast:
          </span>
          {allCharacters.map((name) => (
            <CharacterChip
              key={name}
              name={name}
              size="sm"
              onClick={() => setRenamingCharacter(name)}
            />
          ))}
        </div>
        <div className="flex items-center gap-3 text-xs text-white/30 flex-shrink-0">
          <span>{scenes.length} scenes</span>
          <span>
            {scenes.reduce((s, sc) => s + sc.panels.length, 0)} panels
          </span>
        </div>
      </div>

      {/* Main content: two columns */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Scene list */}
        <div
          className={`${
            selectedSceneData ? "w-1/2 border-r border-white/5" : "w-full"
          } overflow-y-auto p-4 space-y-2 transition-all duration-300`}
        >
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={scenes.map((s) => s.scene_number.toString())}
              strategy={verticalListSortingStrategy}
            >
              {scenes.map((scene) => (
                <SortableSceneCard
                  key={scene.scene_number}
                  scene={scene}
                  isSelected={selectedScene === scene.scene_number}
                  onSelect={() =>
                    setSelectedScene(
                      selectedScene === scene.scene_number
                        ? null
                        : scene.scene_number
                    )
                  }
                  onApprove={handleApprove}
                  onRegenerate={handleRegenerate}
                  onCharacterClick={(name) => setRenamingCharacter(name)}
                  approving={approvingScene === scene.scene_number}
                  regenerating={regeneratingScene === scene.scene_number}
                  locked={locked}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        {/* Right: Detail panel */}
        <AnimatePresence>
          {selectedSceneData && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: "50%", opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="overflow-hidden border-l border-white/5"
            >
              <SceneDetailPanel
                scene={selectedSceneData}
                onApprove={handleApprove}
                onRegenerate={handleRegenerate}
                onCharacterClick={(name) => setRenamingCharacter(name)}
                approving={approvingScene === selectedSceneData.scene_number}
                regenerating={
                  regeneratingScene === selectedSceneData.scene_number
                }
                locked={locked}
                onClose={() => setSelectedScene(null)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom bar: approval progress */}
      <div className="px-4 py-3 border-t border-white/5 flex items-center gap-4">
        {/* Progress bar */}
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-white/30">
              {approvedCount}/{scenes.length} scenes approved
            </span>
            <span className="text-[10px] text-white/30">
              {Math.round(progressPercent)}%
            </span>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-[#6B5BFF] to-[#00F0FF]"
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
        </div>

        {/* Approve all button */}
        {!locked && !allApproved && (
          <button
            onClick={() => approveAllMut.mutate({ episodeId })}
            disabled={approveAllMut.isPending}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium bg-[#00F0FF]/10 text-[#00F0FF] hover:bg-[#00F0FF]/20 transition-all disabled:opacity-50"
          >
            {approveAllMut.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCheck className="w-3.5 h-3.5" />
            )}
            Approve all scenes
          </button>
        )}

        {allApproved && (
          <div className="flex items-center gap-1.5 text-xs text-[#00F0FF]">
            <Check className="w-3.5 h-3.5" />
            All scenes approved
          </div>
        )}
      </div>

      {/* Rename dialog */}
      <AnimatePresence>
        {renamingCharacter && (
          <RenameDialog
            characterName={renamingCharacter}
            onRename={handleRename}
            onClose={() => setRenamingCharacter(null)}
            renaming={isRenaming}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
