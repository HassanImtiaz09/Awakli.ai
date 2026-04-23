/**
 * Location Library — Browse and manage reusable background assets per project.
 */
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  MapPin, Search, Trash2, Edit3, Image, Loader2, X,
  Eye, Tag, BarChart3, Layers, RefreshCw, FolderOpen,
  ChevronLeft, ChevronRight, Info,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

// ─── Background Card ────────────────────────────────────────────────────
interface BackgroundAsset {
  id: number;
  projectId: number;
  locationName: string;
  imageUrl: string;
  styleTag: string | null;
  resolution: string | null;
  tags: string | null;
  usageCount: number;
  createdAt: string;
}

function BackgroundCard({
  asset,
  onEdit,
  onDelete,
  onPreview,
}: {
  asset: BackgroundAsset;
  onEdit: () => void;
  onDelete: () => void;
  onPreview: () => void;
}) {
  const tags = asset.tags ? JSON.parse(asset.tags) as string[] : [];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      layout
    >
      <Card className="group overflow-hidden border-white/5 bg-white/[0.03] hover:bg-white/[0.06] hover:border-token-cyan/20 transition-all duration-300">
        {/* Thumbnail */}
        <div className="relative aspect-video overflow-hidden bg-gradient-to-br from-token-violet/5 to-token-cyan/5">
          {asset.imageUrl ? (
            <img
              src={asset.imageUrl}
              alt={asset.locationName}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Image className="w-10 h-10 text-white/10" />
            </div>
          )}

          {/* Hover overlay */}
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <Button size="sm" variant="outline" onClick={onPreview} className="border-white/20 text-white text-xs h-7">
              <Eye size={12} className="mr-1" /> View
            </Button>
            <Button size="sm" variant="outline" onClick={onEdit} className="border-white/20 text-white text-xs h-7">
              <Edit3 size={12} className="mr-1" /> Edit
            </Button>
            <Button size="sm" variant="outline" onClick={onDelete} className="border-red-400/30 text-red-300 text-xs h-7 hover:bg-red-500/10">
              <Trash2 size={12} />
            </Button>
          </div>

          {/* Usage count badge */}
          <div className="absolute top-2 right-2">
            <Badge className="bg-black/50 text-white/70 border-white/10 text-[10px]">
              <RefreshCw size={9} className="mr-1" />
              {asset.usageCount}x used
            </Badge>
          </div>
        </div>

        <CardContent className="p-3 space-y-2">
          {/* Location name */}
          <div className="flex items-center gap-1.5">
            <MapPin size={12} className="text-token-cyan flex-shrink-0" />
            <h3 className="text-sm font-medium text-white/80 truncate">{asset.locationName}</h3>
          </div>

          {/* Style tag */}
          {asset.styleTag && (
            <Badge variant="outline" className="text-[9px] border-white/10 text-white/30">
              {asset.styleTag}
            </Badge>
          )}

          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.slice(0, 4).map((tag) => (
                <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/5 text-white/30">
                  {tag}
                </span>
              ))}
              {tags.length > 4 && (
                <span className="text-[9px] text-white/20">+{tags.length - 4}</span>
              )}
            </div>
          )}

          {/* Resolution */}
          {asset.resolution && (
            <span className="text-[9px] text-white/20">{asset.resolution}</span>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Preview Modal ──────────────────────────────────────────────────────
function PreviewModal({
  asset,
  open,
  onClose,
}: {
  asset: BackgroundAsset | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!asset) return null;
  const tags = asset.tags ? JSON.parse(asset.tags) as string[] : [];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl bg-[#0d0d14] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin size={16} className="text-token-cyan" />
            {asset.locationName}
          </DialogTitle>
        </DialogHeader>
        <div className="rounded-lg overflow-hidden bg-black">
          <img src={asset.imageUrl} alt={asset.locationName} className="w-full max-h-[60vh] object-contain" />
        </div>
        <div className="grid grid-cols-3 gap-3 mt-2">
          <div className="text-center p-2 rounded-lg bg-white/[0.03] border border-white/5">
            <RefreshCw size={14} className="mx-auto text-token-cyan mb-1" />
            <div className="text-sm font-bold">{asset.usageCount}</div>
            <div className="text-[10px] text-white/30">Times Used</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-white/[0.03] border border-white/5">
            <Tag size={14} className="mx-auto text-token-violet mb-1" />
            <div className="text-sm font-bold">{tags.length}</div>
            <div className="text-[10px] text-white/30">Tags</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-white/[0.03] border border-white/5">
            <Layers size={14} className="mx-auto text-token-gold mb-1" />
            <div className="text-sm font-bold">{asset.resolution || "N/A"}</div>
            <div className="text-[10px] text-white/30">Resolution</div>
          </div>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-[10px] border-white/10 text-white/40">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Modal ─────────────────────────────────────────────────────────
function EditModal({
  asset,
  open,
  onClose,
  onSave,
}: {
  asset: BackgroundAsset | null;
  open: boolean;
  onClose: () => void;
  onSave: (id: number, name: string, tags: string[]) => void;
}) {
  const [name, setName] = useState(asset?.locationName || "");
  const [tagsStr, setTagsStr] = useState(
    asset?.tags ? (JSON.parse(asset.tags) as string[]).join(", ") : "",
  );

  // Reset when asset changes
  useMemo(() => {
    if (asset) {
      setName(asset.locationName);
      setTagsStr(asset.tags ? (JSON.parse(asset.tags) as string[]).join(", ") : "");
    }
  }, [asset?.id]);

  if (!asset) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md bg-[#0d0d14] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle>Edit Background</DialogTitle>
          <DialogDescription className="text-white/40">
            Update the location name and tags for this background.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-white/50">Location Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-white/[0.03] border-white/10" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-white/50">Tags (comma-separated)</Label>
            <Input value={tagsStr} onChange={(e) => setTagsStr(e.target.value)} className="bg-white/[0.03] border-white/10" />
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} className="border-white/10 text-white/50">Cancel</Button>
          <Button
            onClick={() => {
              onSave(asset.id, name, tagsStr.split(",").map(t => t.trim()).filter(Boolean));
              onClose();
            }}
            className="bg-token-cyan/20 text-token-cyan hover:bg-token-cyan/30"
          >
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────
export default function LocationLibrary() {
  const search_ = useSearch();
  const searchParams = new URLSearchParams(search_);
  const projectId = parseInt(searchParams.get("projectId") || "0", 10);

  // Fetch user's projects for the selector when no projectId
  const { data: projects } = trpc.projects.list.useQuery(undefined, {
    enabled: projectId === 0,
  });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const limit = 24;

  const { data, isLoading, refetch } = trpc.backgrounds.list.useQuery(
    { projectId, limit, offset: (page - 1) * limit },
    { enabled: projectId > 0 },
  );

  const assets: BackgroundAsset[] = (data as any)?.items ?? (data as any) ?? [];
  const total = (data as any)?.total ?? assets.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  // Filter by search locally
  const filtered = useMemo(() => {
    if (!search.trim()) return assets;
    const q = search.toLowerCase();
    return assets.filter((a) => {
      const tags = a.tags ? JSON.parse(a.tags) as string[] : [];
      return (
        a.locationName.toLowerCase().includes(q) ||
        tags.some((t) => t.toLowerCase().includes(q)) ||
        (a.styleTag && a.styleTag.toLowerCase().includes(q))
      );
    });
  }, [assets, search]);

  // Modals
  const [previewAsset, setPreviewAsset] = useState<BackgroundAsset | null>(null);
  const [editAsset, setEditAsset] = useState<BackgroundAsset | null>(null);
  const [deleteAsset, setDeleteAsset] = useState<BackgroundAsset | null>(null);

  const deleteMut = trpc.backgrounds.delete.useMutation({
    onSuccess: () => {
      toast.success("Background deleted");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = trpc.backgrounds.update.useMutation({
    onSuccess: () => {
      toast.success("Background updated");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  // Show project selector when no projectId
  if (projectId === 0) {
    const projectList = (projects as any)?.items ?? (projects as any) ?? [];
    return (
      <div className="min-h-screen bg-[#0a0a12]">
        <div className="max-w-3xl mx-auto px-6 py-16">
          <div className="flex items-center gap-2 mb-6">
            <MapPin className="w-5 h-5 text-token-cyan" />
            <h1 className="text-xl font-bold text-white/90">Location Library</h1>
          </div>
          <p className="text-sm text-white/40 mb-8">Select a project to view its reusable background assets.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {projectList.map((p: any) => (
              <a
                key={p.id}
                href={`/studio/locations?projectId=${p.id}`}
                className="block p-4 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-token-cyan/30 transition-all"
              >
                <div className="font-medium text-white/80">{p.title || `Project #${p.id}`}</div>
                <div className="text-xs text-white/30 mt-1">{p.genre || "No genre"}</div>
              </a>
            ))}
            {projectList.length === 0 && (
              <div className="col-span-2 text-center py-12 text-white/30">
                <FolderOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No projects yet. Create a project first to start building your location library.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a12]">
      {/* Header */}
      <div className="border-b border-white/5 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <MapPin className="w-5 h-5 text-token-cyan" />
                <h1 className="text-xl font-bold text-white/90">Location Library</h1>
              </div>
              <p className="text-sm text-white/40">
                Reusable background assets for your project. Backgrounds are auto-collected during panel generation.
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-white/80">{total}</div>
              <div className="text-[10px] text-white/30 uppercase tracking-wider">Backgrounds</div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Search */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search locations, tags..."
              className="pl-10 bg-white/[0.03] border-white/10 text-sm"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X size={14} className="text-white/30 hover:text-white/60" />
              </button>
            )}
          </div>
          <Badge variant="outline" className="border-white/10 text-white/30 text-xs">
            {filtered.length} result{filtered.length !== 1 ? "s" : ""}
          </Badge>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-[4/3] rounded-xl bg-white/[0.03] animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <FolderOpen className="w-14 h-14 mx-auto text-white/[0.06] mb-4" />
            <h3 className="text-lg font-semibold text-white/30">No backgrounds yet</h3>
            <p className="text-sm text-white/15 mt-2 max-w-md mx-auto leading-relaxed">
              {search
                ? "No backgrounds match your search. Try different keywords."
                : "Backgrounds are automatically saved when panels are generated. Start creating episodes to build your location library."}
            </p>
            {!search && (
              <div className="mt-6 p-4 rounded-xl bg-white/[0.02] border border-white/5 max-w-sm mx-auto">
                <div className="flex items-start gap-2">
                  <Info size={14} className="text-token-cyan flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-white/30 text-left leading-relaxed">
                    Each time a panel is generated, its background is analyzed and stored here. 
                    Reusing backgrounds saves ~3 credits per panel.
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              <AnimatePresence mode="popLayout">
                {filtered.map((asset) => (
                  <BackgroundCard
                    key={asset.id}
                    asset={asset}
                    onPreview={() => setPreviewAsset(asset)}
                    onEdit={() => setEditAsset(asset)}
                    onDelete={() => setDeleteAsset(asset)}
                  />
                ))}
              </AnimatePresence>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <Button
                  variant="outline" size="sm" disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  className="border-white/10 text-white/50 text-xs"
                >
                  <ChevronLeft size={14} className="mr-1" /> Previous
                </Button>
                <span className="text-xs text-white/30">Page {page} of {totalPages}</span>
                <Button
                  variant="outline" size="sm" disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                  className="border-white/10 text-white/50 text-xs"
                >
                  Next <ChevronRight size={14} className="ml-1" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      <PreviewModal asset={previewAsset} open={!!previewAsset} onClose={() => setPreviewAsset(null)} />
      <EditModal
        asset={editAsset}
        open={!!editAsset}
        onClose={() => setEditAsset(null)}
        onSave={(id, name, tags) => {
          updateMut.mutate({ id, projectId: projectId!, locationName: name, tags });
        }}
      />
      <AlertDialog open={!!deleteAsset} onOpenChange={(v) => !v && setDeleteAsset(null)}>
        <AlertDialogContent className="bg-[#0d0d14] border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Background</AlertDialogTitle>
            <AlertDialogDescription className="text-white/40">
              Are you sure you want to delete "{deleteAsset?.locationName}"? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 text-white/50">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteAsset) deleteMut.mutate({ id: deleteAsset.id, projectId: projectId! });
                setDeleteAsset(null);
              }}
              className="bg-red-500/20 text-red-300 hover:bg-red-500/30"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
