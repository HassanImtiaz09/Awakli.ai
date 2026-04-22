import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Plus, Search, SlidersHorizontal, Loader2, Sparkles,
  User, Brain, Zap, CheckCircle2, AlertTriangle, Clock,
  MoreVertical, Trash2, Edit3, Play, Eye, Filter,
  ArrowUpDown, Grid3x3, List, Download, Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import PageBackground from "@/components/awakli/PageBackground";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

// ─── Status Config ──────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; icon: typeof CheckCircle2; color: string; bg: string }> = {
  untrained:         { label: "Untrained",         icon: Clock,          color: "text-muted-foreground", bg: "bg-muted/50" },
  training:          { label: "Training",          icon: Loader2,        color: "text-cyan",             bg: "bg-cyan/10" },
  validating:        { label: "Validating",        icon: Brain,          color: "text-[var(--token-gold)]", bg: "bg-[var(--token-gold)]/10" },
  active:            { label: "Active",            icon: CheckCircle2,   color: "text-[var(--status-success)]", bg: "bg-[var(--status-success)]/10" },
  needs_retraining:  { label: "Needs Retraining",  icon: AlertTriangle,  color: "text-[var(--status-warning)]", bg: "bg-[var(--status-warning)]/10" },
  failed:            { label: "Failed",            icon: AlertTriangle,  color: "text-[var(--status-error)]",   bg: "bg-[var(--status-error)]/10" },
};

// ─── Character Card ─────────────────────────────────────────────────────

function CharacterLibraryCard({
  character,
  onOpen,
  onDelete,
  onTrain,
}: {
  character: any;
  onOpen: () => void;
  onDelete: () => void;
  onTrain: () => void;
}) {
  const status = STATUS_CONFIG[character.loraStatus] || STATUS_CONFIG.untrained;
  const StatusIcon = status.icon;
  const tags = character.appearanceTags as Record<string, string> | null;

  return (
    <motion.div
      className="relative aspect-[3/4] rounded-xl border border-white/10 overflow-hidden group cursor-pointer"
      style={{ background: "var(--gradient-card)" }}
      whileHover={{ y: -6, scale: 1.02, boxShadow: "0 8px 36px rgba(224,64,251,0.2), 0 0 60px rgba(124,77,255,0.1)" }}
      onClick={onOpen}
      layout
    >
      {/* Image or placeholder */}
      {character.referenceSheetUrl ? (
        <img
          src={character.referenceSheetUrl}
          alt={character.name}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-elevated)]">
          <div className="text-center">
            <div
              className="w-16 h-16 rounded-full mx-auto flex items-center justify-center text-2xl font-heading font-bold"
              style={{ background: "linear-gradient(135deg, var(--token-cyan), var(--token-cyan))" }}
            >
              {character.name.charAt(0).toUpperCase()}
            </div>
            <p className="mt-3 text-sm text-muted-foreground">No reference sheet</p>
          </div>
        </div>
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

      {/* Status badge */}
      <div className="absolute top-3 right-3 z-10">
        <Badge
          variant="outline"
          className={cn("text-xs border-white/20 backdrop-blur-sm", status.bg, status.color)}
        >
          <StatusIcon className={cn("w-3 h-3 mr-1", character.loraStatus === "training" && "animate-spin")} />
          {status.label}
        </Badge>
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-0 left-0 right-0 p-4 z-10">
        <h3 className="font-heading font-bold text-lg text-white truncate">{character.name}</h3>
        {tags && Object.keys(tags).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {Object.entries(tags).slice(0, 3).map(([key, val]) => (
              <span key={key} className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/70">
                {val} {key}
              </span>
            ))}
            {Object.keys(tags).length > 3 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/50">
                +{Object.keys(tags).length - 3}
              </span>
            )}
          </div>
        )}
        {character.description && (
          <p className="text-xs text-white/50 mt-1 line-clamp-2">{character.description}</p>
        )}
      </div>

      {/* Hover actions */}
      <motion.div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px] flex items-center justify-center gap-3 z-20"
        initial={{ opacity: 0 }}
        whileHover={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
      >
        <Button
          size="sm"
          variant="outline"
          className="bg-white/10 border-white/20 text-white hover:bg-white/20"
          onClick={(e) => { e.stopPropagation(); onOpen(); }}
        >
          <Eye className="w-4 h-4 mr-1" /> View
        </Button>
        {(character.loraStatus === "untrained" || character.loraStatus === "needs_retraining" || character.loraStatus === "failed") && (
          <Button
            size="sm"
            className="bg-gradient-to-r from-[var(--token-cyan)] to-[var(--token-cyan)] text-white border-0"
            onClick={(e) => { e.stopPropagation(); onTrain(); }}
          >
            <Zap className="w-4 h-4 mr-1" /> Train
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="bg-white/10 border-white/20 text-white hover:bg-white/20 px-2"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-[var(--bg-elevated)] border-white/10">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onOpen(); }}>
              <Edit3 className="w-4 h-4 mr-2" /> Edit Details
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-[var(--status-error)] focus:text-[var(--status-error)]"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
            >
              <Trash2 className="w-4 h-4 mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </motion.div>
    </motion.div>
  );
}

// ─── Create Character Modal ─────────────────────────────────────────────

function CreateCharacterModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: number) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<Record<string, string>>({});
  const [tagKey, setTagKey] = useState("");
  const [tagValue, setTagValue] = useState("");

  const createMutation = trpc.characterLibrary.create.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.name} added to library`);
      onCreated(data.id);
      onOpenChange(false);
      setName(""); setDescription(""); setTags({});
    },
    onError: (err) => toast.error(err.message),
  });

  const addTag = () => {
    if (tagKey.trim() && tagValue.trim()) {
      setTags(prev => ({ ...prev, [tagKey.trim().toLowerCase()]: tagValue.trim() }));
      setTagKey(""); setTagValue("");
    }
  };

  const removeTag = (key: string) => {
    setTags(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const QUICK_TAGS = [
    { key: "hair", suggestions: ["Black", "Blonde", "Silver", "Red", "Blue", "Pink", "Green", "White", "Brown"] },
    { key: "eyes", suggestions: ["Brown", "Blue", "Green", "Red", "Gold", "Purple", "Heterochromia"] },
    { key: "outfit", suggestions: ["School uniform", "Armor", "Casual", "Formal", "Kimono", "Cyberpunk suit", "Cloak"] },
    { key: "bodyType", suggestions: ["Slim", "Athletic", "Muscular", "Petite", "Tall"] },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[var(--bg-elevated)] border-white/10 max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl flex items-center gap-2">
            <Plus className="w-5 h-5 text-pink" /> Add Character
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <Label className="text-sm text-muted-foreground">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sakura Haruno"
              className="mt-1 bg-[var(--bg-base)] border-white/10"
            />
          </div>

          <div>
            <Label className="text-sm text-muted-foreground">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief character description..."
              className="mt-1 bg-[var(--bg-base)] border-white/10 resize-none"
              rows={3}
            />
          </div>

          {/* Appearance Tags */}
          <div>
            <Label className="text-sm text-muted-foreground">Appearance Tags</Label>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {Object.entries(tags).map(([k, v]) => (
                <Badge
                  key={k}
                  variant="outline"
                  className="bg-pink/10 border-pink/30 text-pink cursor-pointer hover:bg-pink/20"
                  onClick={() => removeTag(k)}
                >
                  {v} {k} &times;
                </Badge>
              ))}
            </div>

            {/* Quick tag buttons */}
            {QUICK_TAGS.map(qt => (
              !tags[qt.key] && (
                <div key={qt.key} className="mt-2">
                  <span className="text-xs text-muted-foreground capitalize">{qt.key}:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {qt.suggestions.map(s => (
                      <button
                        key={s}
                        type="button"
                        className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
                        onClick={() => setTags(prev => ({ ...prev, [qt.key]: s }))}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )
            ))}

            {/* Custom tag input */}
            <div className="flex gap-2 mt-3">
              <Input
                value={tagKey}
                onChange={(e) => setTagKey(e.target.value)}
                placeholder="Tag name"
                className="flex-1 bg-[var(--bg-base)] border-white/10 text-sm"
              />
              <Input
                value={tagValue}
                onChange={(e) => setTagValue(e.target.value)}
                placeholder="Value"
                className="flex-1 bg-[var(--bg-base)] border-white/10 text-sm"
                onKeyDown={(e) => e.key === "Enter" && addTag()}
              />
              <Button size="sm" variant="outline" onClick={addTag} className="border-white/10">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-white/10">
            Cancel
          </Button>
          <Button
            onClick={() => createMutation.mutate({
              name: name.trim(),
              description: description.trim() || undefined,
              appearanceTags: Object.keys(tags).length > 0 ? tags : undefined,
            })}
            disabled={!name.trim() || createMutation.isPending}
            className="bg-gradient-to-r from-[var(--token-cyan)] to-[var(--token-cyan)] text-white border-0"
          >
            {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
            Create Character
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────

export default function CharacterLibrary() {
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"createdAt" | "name" | "lastUsed">("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

  const utils = trpc.useUtils();

  const { data: characters, isLoading } = trpc.characterLibrary.list.useQuery(
    { sortBy, sortOrder },
    { enabled: !!user }
  );

  const deleteMutation = trpc.characterLibrary.delete.useMutation({
    onSuccess: () => {
      toast.success(`${deleteTarget?.name} deleted`);
      utils.characterLibrary.list.invalidate();
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(err.message),
  });

  // Filter & search
  const filtered = useMemo(() => {
    if (!characters) return [];
    let result = [...characters];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q)
      );
    }

    if (statusFilter !== "all") {
      result = result.filter(c => c.loraStatus === statusFilter);
    }

    return result;
  }, [characters, searchQuery, statusFilter]);

  // Auth guard
  if (!authLoading && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-void)]">
        <div className="text-center space-y-4">
          <User className="w-12 h-12 mx-auto text-muted-foreground" />
          <h2 className="font-heading text-xl">Sign in to access your Character Library</h2>
          <Button asChild className="bg-gradient-to-r from-[var(--token-cyan)] to-[var(--token-cyan)] text-white border-0">
            <a href={getLoginUrl("/characters")}>Sign In</a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-void)] relative">
      <PageBackground src="https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/page-bg-codex-f6RP4wm7yC9E7ZkPqiMNFu.webp" opacity={0.35} />
      <div className="max-w-7xl mx-auto px-4 py-8 relative" style={{ zIndex: 1 }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-heading text-3xl font-bold bg-gradient-to-r from-[var(--token-cyan)] to-[var(--token-cyan)] bg-clip-text text-transparent">
              Character Library
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage your characters, train LoRAs, and maintain visual consistency across episodes
            </p>
          </div>
          <Button
            onClick={() => setShowCreateModal(true)}
            className="bg-gradient-to-r from-[var(--token-cyan)] to-[var(--token-cyan)] text-white border-0"
          >
            <Plus className="w-4 h-4 mr-2" /> New Character
          </Button>
        </div>

        {/* Toolbar — only show when there are characters */}
        {characters && characters.length > 0 && <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search characters..."
              className="pl-9 bg-[var(--bg-base)] border-white/10"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px] bg-[var(--bg-base)] border-white/10">
              <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="bg-[var(--bg-elevated)] border-white/10">
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="untrained">Untrained</SelectItem>
              <SelectItem value="training">Training</SelectItem>
              <SelectItem value="validating">Validating</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="needs_retraining">Needs Retraining</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
            <SelectTrigger className="w-[140px] bg-[var(--bg-base)] border-white/10">
              <ArrowUpDown className="w-4 h-4 mr-2 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[var(--bg-elevated)] border-white/10">
              <SelectItem value="createdAt">Date Added</SelectItem>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="lastUsed">Last Used</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="icon"
            className="border-white/10"
            onClick={() => setSortOrder(o => o === "asc" ? "desc" : "asc")}
          >
            <ArrowUpDown className={cn("w-4 h-4", sortOrder === "asc" && "rotate-180")} />
          </Button>
        </div>}

        {/* Stats bar */}
        {characters && characters.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: "Total", value: characters.length, color: "text-foreground" },
              { label: "Active LoRAs", value: characters.filter(c => c.loraStatus === "active").length, color: "text-[var(--status-success)]" },
              { label: "Training", value: characters.filter(c => c.loraStatus === "training" || c.loraStatus === "validating").length, color: "text-cyan" },
              { label: "Untrained", value: characters.filter(c => c.loraStatus === "untrained").length, color: "text-muted-foreground" },
            ].map(stat => (
              <div key={stat.label} className="rounded-lg border border-white/10 bg-[var(--bg-base)] p-3 text-center">
                <div className={cn("text-2xl font-heading font-bold", stat.color)}>{stat.value}</div>
                <div className="text-xs text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-cyan" />
          </div>
        ) : filtered.length === 0 ? (
          <motion.div
            className="flex flex-col items-center justify-center py-20 text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {characters && characters.length === 0 ? (
              <>
                {/* Decorative ring */}
                <div className="relative w-28 h-28 mb-6">
                  <div className="absolute inset-0 rounded-full border-2 border-dashed border-[var(--token-cyan)]/30 animate-[spin_20s_linear_infinite]" />
                  <div className="absolute inset-3 rounded-full bg-gradient-to-br from-[var(--token-cyan)]/15 to-[var(--token-violet)]/15 flex items-center justify-center">
                    <User className="w-10 h-10 text-[var(--token-cyan)]" />
                  </div>
                </div>
                <h3 className="font-heading text-2xl font-bold mb-2">Your Character Library is Empty</h3>
                <p className="text-muted-foreground max-w-lg mb-4 leading-relaxed">
                  Characters are the foundation of consistent anime. Add a character, describe their appearance,
                  upload reference art, and train a LoRA model so every frame stays on-model.
                </p>
                {/* How it works mini-steps */}
                <div className="flex flex-wrap justify-center gap-6 mb-8 text-sm">
                  {[
                    { step: "1", label: "Create", desc: "Name & describe" },
                    { step: "2", label: "Upload", desc: "Reference sheets" },
                    { step: "3", label: "Train", desc: "LoRA model" },
                    { step: "4", label: "Animate", desc: "Use in episodes" },
                  ].map(s => (
                    <div key={s.step} className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-full bg-[var(--token-cyan)]/20 text-[var(--token-cyan)] flex items-center justify-center text-xs font-bold">{s.step}</span>
                      <div>
                        <span className="text-foreground font-medium">{s.label}</span>
                        <span className="text-muted-foreground ml-1">{s.desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <Button
                  onClick={() => setShowCreateModal(true)}
                  size="lg"
                  className="bg-gradient-to-r from-[var(--token-cyan)] to-[var(--token-violet)] text-white border-0 shadow-lg shadow-[var(--token-cyan)]/20"
                >
                  <Plus className="w-5 h-5 mr-2" /> Add Your First Character
                </Button>
              </>
            ) : (
              <>
                <Search className="w-10 h-10 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No characters match your filters</p>
              </>
            )}
          </motion.div>
        ) : (
          <motion.div
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4"
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
          >
            <AnimatePresence mode="popLayout">
              {filtered.map((char) => (
                <motion.div
                  key={char.id}
                  variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  layout
                >
                  <CharacterLibraryCard
                    character={char}
                    onOpen={() => navigate(`/characters/${char.id}`)}
                    onDelete={() => setDeleteTarget({ id: char.id, name: char.name })}
                    onTrain={() => navigate(`/characters/${char.id}?train=1`)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* Create Modal */}
      <CreateCharacterModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        onCreated={(id) => {
          utils.characterLibrary.list.invalidate();
          navigate(`/characters/${id}`);
        }}
      />

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="bg-[var(--bg-elevated)] border-white/10 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[var(--status-error)]">Delete Character</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <strong className="text-foreground">{deleteTarget?.name}</strong>?
            This will also delete all LoRA versions, training jobs, and assets.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} className="border-white/10">Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMutation.mutate({ id: deleteTarget.id })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
