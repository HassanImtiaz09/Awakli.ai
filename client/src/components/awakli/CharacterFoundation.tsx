/**
 * CharacterFoundation — Character card grid for Studio tier.
 *
 * States: empty → added → analyzing (CLIP embeddings) → ready (mint check).
 * Each character: name, 1-6 reference images, short description.
 */
import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  X,
  Upload,
  Loader2,
  Check,
  User,
  ImagePlus,
  Trash2,
  Pencil,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CharacterData {
  id?: number; // DB id after creation
  name: string;
  description: string;
  refImages: RefImage[];
  status: "draft" | "uploading" | "analyzing" | "ready" | "error";
  embeddingUrl?: string;
  libraryId?: number; // If imported from library
}

interface RefImage {
  id?: number;
  url: string;
  file?: File;
  uploading?: boolean;
}

interface CharacterFoundationProps {
  characters: CharacterData[];
  onChange: (characters: CharacterData[]) => void;
  projectId: number | null;
  maxCharacters?: number;
}

const MAX_REF_IMAGES = 6;
const MAX_CHARACTERS = 12;

export default function CharacterFoundation({
  characters,
  onChange,
  projectId,
  maxCharacters = MAX_CHARACTERS,
}: CharacterFoundationProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);

  const handleAddCharacter = useCallback(
    (char: CharacterData) => {
      onChange([...characters, char]);
      setShowAddDialog(false);
      emitAnalytics("stage0_character_added", { name: char.name });
    },
    [characters, onChange]
  );

  const handleUpdateCharacter = useCallback(
    (index: number, char: CharacterData) => {
      const updated = [...characters];
      updated[index] = char;
      onChange(updated);
      setEditingIndex(null);
    },
    [characters, onChange]
  );

  const handleRemoveCharacter = useCallback(
    (index: number) => {
      onChange(characters.filter((_, i) => i !== index));
    },
    [characters, onChange]
  );

  return (
    <div className="space-y-5">
      <label className="text-xs font-medium text-white/50 uppercase tracking-wider">
        Characters
      </label>

      {/* Empty state */}
      {characters.length === 0 && (
        <div className="text-center py-10 border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
          <User className="w-10 h-10 text-white/15 mx-auto mb-3" />
          <p className="text-sm text-white/40 mb-4">
            Add at least one character to anchor consistency
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddDialog(true)}
            className="border-token-violet/30 text-token-violet hover:bg-token-violet/10"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            + New character
          </Button>
        </div>
      )}

      {/* Character Grid */}
      {characters.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <AnimatePresence mode="popLayout">
            {characters.map((char, i) => (
              <CharacterCard
                key={`${char.name}-${i}`}
                character={char}
                onEdit={() => setEditingIndex(i)}
                onRemove={() => handleRemoveCharacter(i)}
                onAnalyze={() => handleAnalyze(i, characters, onChange, projectId)}
              />
            ))}
          </AnimatePresence>

          {/* Add character ghost tile */}
          {characters.length < maxCharacters && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={() => setShowAddDialog(true)}
              className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 border-dashed border-white/10 bg-white/[0.01] hover:border-token-violet/30 hover:bg-token-violet/[0.03] transition-all min-h-[200px] group"
            >
              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-token-violet/10 transition-colors">
                <Plus className="w-5 h-5 text-white/30 group-hover:text-token-violet transition-colors" />
              </div>
              <span className="text-sm text-white/30 group-hover:text-white/50 transition-colors">
                + New character
              </span>
            </motion.button>
          )}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <CharacterDialog
        open={showAddDialog || editingIndex !== null}
        onClose={() => {
          setShowAddDialog(false);
          setEditingIndex(null);
        }}
        character={editingIndex !== null ? characters[editingIndex] : undefined}
        onSave={(char) => {
          if (editingIndex !== null) {
            handleUpdateCharacter(editingIndex, char);
          } else {
            handleAddCharacter(char);
          }
        }}
        projectId={projectId}
      />
    </div>
  );
}

// ─── Character Card ─────────────────────────────────────────────────────────

function CharacterCard({
  character,
  onEdit,
  onRemove,
  onAnalyze,
}: {
  character: CharacterData;
  onEdit: () => void;
  onRemove: () => void;
  onAnalyze: () => void;
}) {
  const isAnalyzing = character.status === "analyzing";
  const isReady = character.status === "ready";
  const hasImages = character.refImages.length > 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="relative rounded-2xl bg-[#12121F] shadow-[0_2px_12px_rgba(0,0,0,0.3)] hover:shadow-[0_4px_24px_rgba(124,77,255,0.15)] transition-shadow border border-white/[0.06] overflow-hidden group"
    >
      {/* Analyzing overlay */}
      {isAnalyzing && (
        <div className="absolute inset-0 bg-[#0B0B18]/60 backdrop-blur-[2px] grid place-items-center z-10">
          <div className="text-center space-y-2">
            <Loader2 className="w-6 h-6 animate-spin text-token-violet mx-auto" />
            <p className="text-xs text-white/50">
              Learning {character.name}&apos;s look&hellip;
            </p>
          </div>
        </div>
      )}

      {/* Ready badge */}
      {isReady && (
        <div className="absolute top-3 right-3 z-10">
          <div className="w-6 h-6 rounded-full bg-token-mint/20 flex items-center justify-center">
            <Check className="w-3.5 h-3.5 text-token-mint" />
          </div>
        </div>
      )}

      {/* Avatar / First ref image */}
      <div className="h-32 bg-gradient-to-br from-token-violet/10 to-token-cyan/5 flex items-center justify-center overflow-hidden">
        {hasImages ? (
          <img
            src={character.refImages[0].url}
            alt={character.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <User className="w-12 h-12 text-white/15" />
        )}
      </div>

      {/* Info */}
      <div className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm text-white/80 truncate">
            {character.name}
          </h3>
          <span className="text-[10px] text-white/30 tabular-nums">
            {character.refImages.length}/{MAX_REF_IMAGES} refs
          </span>
        </div>

        {character.description && (
          <p className="text-xs text-white/40 line-clamp-2">
            {character.description}
          </p>
        )}

        {/* Ref image thumbnails */}
        {hasImages && (
          <div className="flex gap-1 pt-1">
            {character.refImages.slice(0, 5).map((img, i) => (
              <div
                key={i}
                className="w-8 h-8 rounded-md overflow-hidden ring-1 ring-white/10"
              >
                <img
                  src={img.url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
            {character.refImages.length > 5 && (
              <div className="w-8 h-8 rounded-md bg-white/5 flex items-center justify-center text-[10px] text-white/30">
                +{character.refImages.length - 5}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          {!isReady && !isAnalyzing && hasImages && (
            <Button
              size="sm"
              variant="outline"
              onClick={onAnalyze}
              className="flex-1 text-xs border-token-violet/30 text-token-violet hover:bg-token-violet/10 h-7"
            >
              Analyze
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={onEdit}
            className="text-xs text-white/40 hover:text-white/70 h-7"
          >
            <Pencil className="w-3 h-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onRemove}
            className="text-xs text-white/40 hover:text-red-400 h-7"
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Character Add/Edit Dialog ──────────────────────────────────────────────

function CharacterDialog({
  open,
  onClose,
  character,
  onSave,
  projectId,
}: {
  open: boolean;
  onClose: () => void;
  character?: CharacterData;
  onSave: (char: CharacterData) => void;
  projectId: number | null;
}) {
  const [name, setName] = useState(character?.name || "");
  const [description, setDescription] = useState(character?.description || "");
  const [refImages, setRefImages] = useState<RefImage[]>(
    character?.refImages || []
  );
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getUploadUrl = trpc.uploads.getUploadUrl.useMutation();
  const confirmUpload = trpc.uploads.confirmUpload.useMutation();

  // Reset state when dialog opens with new character
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setName(character?.name || "");
      setDescription(character?.description || "");
      setRefImages(character?.refImages || []);
    } else {
      onClose();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const remaining = MAX_REF_IMAGES - refImages.length;
    const toUpload = files.slice(0, remaining);

    if (files.length > remaining) {
      toast.info(`Only ${remaining} more image(s) can be added`);
    }

    setUploading(true);

    for (const file of toUpload) {
      try {
        // Create a local preview immediately
        const localUrl = URL.createObjectURL(file);
        const newImg: RefImage = { url: localUrl, file, uploading: true };
        setRefImages((prev) => [...prev, newImg]);

        if (!projectId) continue;

        // Upload to S3
        const { uploadId, fileKey } = await getUploadUrl.mutateAsync({
          projectId,
          fileName: file.name,
          mimeType: file.type,
          fileSizeBytes: file.size,
        });

        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve) => {
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(",")[1]);
          };
          reader.readAsDataURL(file);
        });

        const { fileUrl } = await confirmUpload.mutateAsync({
          uploadId,
          fileDataBase64: base64,
          mimeType: file.type,
        });

        // Replace local URL with S3 URL
        setRefImages((prev) =>
          prev.map((img) =>
            img.url === localUrl
              ? { ...img, url: fileUrl, uploading: false }
              : img
          )
        );
      } catch (err) {
        toast.error(`Failed to upload ${file.name}`);
        // Remove the failed image
        setRefImages((prev) => prev.filter((img) => img.file !== file));
      }
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveImage = (index: number) => {
    setRefImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    if (!name.trim()) {
      toast.error("Character name is required");
      return;
    }
    onSave({
      ...(character || {}),
      name: name.trim(),
      description: description.trim(),
      refImages: refImages.filter((img) => !img.uploading),
      status: character?.status || "draft",
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-[#12121F] border-white/10 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white/90">
            {character ? `Edit ${character.name}` : "New character"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs text-white/50">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Kaito Yamamoto"
              className="bg-white/5 border-white/10 text-white placeholder:text-white/25"
              maxLength={100}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs text-white/50">
              Short description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Blue-haired swordsman with a scar across his left eye..."
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 resize-none h-20 focus:outline-none focus:ring-1 focus:ring-token-violet/50"
              maxLength={500}
            />
          </div>

          {/* Reference Images */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-white/50">
                Reference images ({refImages.length}/{MAX_REF_IMAGES})
              </label>
              {refImages.length < MAX_REF_IMAGES && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="text-xs text-token-violet hover:text-token-violet/80 flex items-center gap-1"
                >
                  <ImagePlus className="w-3 h-3" />
                  Add images
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />

            {refImages.length === 0 ? (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-8 border-2 border-dashed border-white/10 rounded-xl bg-white/[0.01] hover:border-token-violet/30 transition-colors flex flex-col items-center gap-2"
              >
                <Upload className="w-6 h-6 text-white/20" />
                <span className="text-xs text-white/30">
                  Drop or click to add reference images
                </span>
              </button>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {refImages.map((img, i) => (
                  <div
                    key={i}
                    className="relative aspect-square rounded-xl overflow-hidden ring-1 ring-white/10 group"
                  >
                    <img
                      src={img.url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                    {img.uploading && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <Loader2 className="w-4 h-4 animate-spin text-white/60" />
                      </div>
                    )}
                    <button
                      onClick={() => handleRemoveImage(i)}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3 text-white/70" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Save button */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="ghost"
              onClick={onClose}
              className="text-white/40"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!name.trim() || uploading}
              className="bg-token-violet hover:bg-token-violet/80 text-white"
            >
              {character ? "Update" : "Add character"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Analyze Handler ────────────────────────────────────────────────────────

async function handleAnalyze(
  index: number,
  characters: CharacterData[],
  onChange: (chars: CharacterData[]) => void,
  projectId: number | null
) {
  if (!projectId) return;

  const updated = [...characters];
  updated[index] = { ...updated[index], status: "analyzing" };
  onChange(updated);

  // Simulate embedding computation (in production, call the server endpoint)
  try {
    await new Promise((resolve) => setTimeout(resolve, 3000 + Math.random() * 2000));

    updated[index] = {
      ...updated[index],
      status: "ready",
      embeddingUrl: `placeholder_embedding_${index}`,
    };
    onChange([...updated]);
    toast.success(`${updated[index].name} is ready!`);
  } catch {
    updated[index] = { ...updated[index], status: "error" };
    onChange([...updated]);
    toast.error(`Failed to analyze ${updated[index].name}`);
  }
}

// ─── Analytics Helper ───────────────────────────────────────────────────────

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
