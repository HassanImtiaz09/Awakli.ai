import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { AwakliButton } from "./AwakliButton";
import { AwakliInput, AwakliTextarea } from "./AwakliInput";
import { toast } from "sonner";

interface CreateProjectModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (id: number) => void;
}

const ANIME_STYLES = [
  { value: "default", label: "Default" },
  { value: "shonen", label: "Shonen" },
  { value: "seinen", label: "Seinen" },
  { value: "shoujo", label: "Shoujo" },
  { value: "mecha", label: "Mecha" },
] as const;

export function CreateProjectModal({ open, onClose, onCreated }: CreateProjectModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [genre, setGenre] = useState("");
  const [animeStyle, setAnimeStyle] = useState<"default" | "shonen" | "seinen" | "shoujo" | "mecha">("default");

  const createMutation = trpc.projects.create.useMutation({
    onSuccess: (data) => {
      toast.success("Project created!");
      setTitle(""); setDescription(""); setGenre(""); setAnimeStyle("default");
      onCreated(data.id);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    createMutation.mutate({ title: title.trim(), description: description || undefined, genre: genre || undefined, animeStyle });
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Overlay */}
          <motion.div
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-full max-w-md bg-[#151528] border border-white/10 rounded-2xl shadow-2xl"
              initial={{ scale: 0.95, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 16 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-6 border-b border-white/5">
                <h2 className="text-lg font-semibold text-[#F0F0F5]">Create New Project</h2>
                <button
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-[#5C5C7A] hover:text-[#F0F0F5] hover:bg-[#1C1C35] transition-colors"
                  onClick={onClose}
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <AwakliInput
                  label="Project Title"
                  placeholder="My Manga Project"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
                <AwakliTextarea
                  label="Description (optional)"
                  placeholder="Brief description of your manga..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="min-h-[80px]"
                />
                <AwakliInput
                  label="Genre (optional)"
                  placeholder="Action, Romance, Sci-Fi..."
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                />

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-[#9494B8]">Anime Style</label>
                  <div className="grid grid-cols-5 gap-2">
                    {ANIME_STYLES.map((style) => (
                      <button
                        key={style.value}
                        type="button"
                        onClick={() => setAnimeStyle(style.value)}
                        className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                          animeStyle === style.value
                            ? "bg-[rgba(124,77,255,0.15)] border-[rgba(124,77,255,0.4)] text-[#E040FB]"
                            : "bg-[#1C1C35] border-white/10 text-[#9494B8] hover:border-white/20"
                        }`}
                      >
                        {style.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <AwakliButton type="button" variant="ghost" size="md" className="flex-1" onClick={onClose}>
                    Cancel
                  </AwakliButton>
                  <AwakliButton
                    type="submit"
                    variant="primary"
                    size="md"
                    className="flex-1"
                    loading={createMutation.isPending}
                    disabled={!title.trim()}
                  >
                    Create Project
                  </AwakliButton>
                </div>
              </form>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
