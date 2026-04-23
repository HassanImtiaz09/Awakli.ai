/**
 * LoRA Marketplace — Browse, search, and download community LoRA models.
 */
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Search, Download, Star, StarHalf, Filter, SlidersHorizontal,
  Package, Sparkles, Palette, Image, Wand2, Layers,
  ChevronDown, Loader2, X, Heart, Upload, Eye,
  DollarSign, TrendingUp, Award, Clock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import PageBackground from "@/components/awakli/PageBackground";

// ─── Constants ──────────────────────────────────────────────────────────
const CATEGORIES = [
  { value: "all", label: "All", icon: <Layers size={14} /> },
  { value: "character", label: "Character", icon: <Sparkles size={14} /> },
  { value: "style", label: "Style", icon: <Palette size={14} /> },
  { value: "background", label: "Background", icon: <Image size={14} /> },
  { value: "effect", label: "Effect", icon: <Wand2 size={14} /> },
  { value: "general", label: "General", icon: <Package size={14} /> },
] as const;

const SORT_OPTIONS = [
  { value: "popular", label: "Most Popular" },
  { value: "newest", label: "Newest" },
  { value: "rating", label: "Highest Rated" },
  { value: "downloads", label: "Most Downloads" },
] as const;

const LICENSE_BADGES: Record<string, { label: string; color: string }> = {
  free: { label: "Free", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  attribution: { label: "Attribution", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  commercial: { label: "Commercial", color: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  exclusive: { label: "Exclusive", color: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
};

// ─── Star Rating ────────────────────────────────────────────────────────
function StarRating({ rating, size = 14 }: { rating: number; size?: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  const empty = 5 - full - (half ? 1 : 0);
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: full }).map((_, i) => (
        <Star key={`f${i}`} size={size} className="text-token-gold fill-token-gold" />
      ))}
      {half && <StarHalf size={size} className="text-token-gold fill-token-gold" />}
      {Array.from({ length: empty }).map((_, i) => (
        <Star key={`e${i}`} size={size} className="text-white/20" />
      ))}
    </div>
  );
}

// ─── LoRA Card ──────────────────────────────────────────────────────────
interface LoraCardProps {
  lora: {
    id: number;
    name: string;
    description: string | null;
    previewImages: string | null;
    downloads: number;
    averageRating: number;
    ratingCount: number;
    priceCents: number;
    license: string;
    category: string;
    tags: string | null;
    creatorId: number;
  };
  onSelect: (id: number) => void;
}

function LoraCard({ lora, onSelect }: LoraCardProps) {
  const previews = lora.previewImages ? JSON.parse(lora.previewImages) as string[] : [];
  const thumb = previews[0] || "";
  const licenseBadge = LICENSE_BADGES[lora.license] || LICENSE_BADGES.free;
  const tags = lora.tags ? JSON.parse(lora.tags) as string[] : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
    >
      <Card
        className="group cursor-pointer overflow-hidden border-white/5 bg-white/[0.03] hover:bg-white/[0.06] hover:border-token-violet/30 transition-all duration-300"
        onClick={() => onSelect(lora.id)}
      >
        {/* Preview Image */}
        <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-token-violet/10 to-token-cyan/10">
          {thumb ? (
            <img
              src={thumb}
              alt={lora.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="w-12 h-12 text-white/10" />
            </div>
          )}
          {/* Overlay badges */}
          <div className="absolute top-2 left-2 flex gap-1.5">
            <Badge className={cn("text-[10px] border", licenseBadge.color)}>
              {licenseBadge.label}
            </Badge>
          </div>
          {lora.priceCents > 0 && (
            <div className="absolute top-2 right-2">
              <Badge className="bg-black/60 text-white border-white/10 text-[10px]">
                ${(lora.priceCents / 100).toFixed(2)}
              </Badge>
            </div>
          )}
        </div>

        <CardContent className="p-4 space-y-2.5">
          <h3 className="font-semibold text-sm text-white/90 truncate group-hover:text-token-cyan transition-colors">
            {lora.name}
          </h3>

          {lora.description && (
            <p className="text-[11px] text-white/40 line-clamp-2 leading-relaxed">
              {lora.description}
            </p>
          )}

          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.slice(0, 3).map((tag) => (
                <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/5 text-white/30">
                  {tag}
                </span>
              ))}
              {tags.length > 3 && (
                <span className="text-[9px] px-1.5 py-0.5 text-white/20">+{tags.length - 3}</span>
              )}
            </div>
          )}

          {/* Stats row */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1">
              <StarRating rating={lora.averageRating} size={11} />
              <span className="text-[10px] text-white/30 ml-1">({lora.ratingCount})</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-white/30">
              <Download size={10} />
              {lora.downloads.toLocaleString()}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── LoRA Detail Modal ──────────────────────────────────────────────────
function LoraDetailModal({
  loraId,
  open,
  onClose,
}: {
  loraId: number | null;
  open: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { data: lora, isLoading } = trpc.loraMarketplace.get.useQuery(
    { id: loraId! },
    { enabled: !!loraId && open },
  );
  const { data: reviewsData } = trpc.loraMarketplace.reviews.useQuery(
    { loraId: loraId!, offset: 0, limit: 10 },
    { enabled: !!loraId && open },
  );
  const { data: savings } = trpc.loraMarketplace.trainingSavings.useQuery(
    { baseLoraId: loraId! },
    { enabled: !!loraId && open },
  );

  const downloadMut = trpc.loraMarketplace.download.useMutation({
    onSuccess: () => toast.success("LoRA added to your library!"),
    onError: (e) => toast.error(e.message),
  });

  const [reviewText, setReviewText] = useState("");
  const [reviewRating, setReviewRating] = useState(5);
  const reviewMut = trpc.loraMarketplace.review.useMutation({
    onSuccess: () => {
      toast.success("Review submitted!");
      setReviewText("");
    },
    onError: (e) => toast.error(e.message),
  });

  if (!loraId) return null;

  const previews = lora?.previewImages ? JSON.parse(lora.previewImages) as string[] : [];
  const tags = lora?.tags ? JSON.parse(lora.tags) as string[] : [];
  const licenseBadge = LICENSE_BADGES[lora?.license || "free"] || LICENSE_BADGES.free;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl bg-[#0d0d14] border-white/10 text-white max-h-[85vh] overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-token-cyan" />
          </div>
        ) : lora ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">{lora.name}</DialogTitle>
              <DialogDescription className="text-white/50">
                {lora.category} LoRA · {licenseBadge.label} License
              </DialogDescription>
            </DialogHeader>

            {/* Preview gallery */}
            {previews.length > 0 && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                {previews.slice(0, 4).map((url, i) => (
                  <div key={i} className="aspect-square rounded-lg overflow-hidden bg-white/5">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}

            {/* Description */}
            {lora.description && (
              <p className="text-sm text-white/60 leading-relaxed mt-3">{lora.description}</p>
            )}

            {/* Tags */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-[10px] border-white/10 text-white/40">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mt-4">
              <div className="text-center p-3 rounded-lg bg-white/[0.03] border border-white/5">
                <Download className="w-4 h-4 mx-auto text-token-cyan mb-1" />
                <div className="text-lg font-bold">{lora.downloads.toLocaleString()}</div>
                <div className="text-[10px] text-white/30">Downloads</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-white/[0.03] border border-white/5">
                <Star className="w-4 h-4 mx-auto text-token-gold mb-1" />
                <div className="text-lg font-bold">{lora.averageRating.toFixed(1)}</div>
                <div className="text-[10px] text-white/30">Rating ({lora.ratingCount})</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-white/[0.03] border border-white/5">
                <DollarSign className="w-4 h-4 mx-auto text-token-mint mb-1" />
                <div className="text-lg font-bold">
                  {lora.priceCents === 0 ? "Free" : `$${(lora.priceCents / 100).toFixed(2)}`}
                </div>
                <div className="text-[10px] text-white/30">Price</div>
              </div>
            </div>

            {/* Training savings callout */}
            {savings && savings.savings > 0 && (
              <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-emerald-500/10 to-token-cyan/10 border border-emerald-500/20">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-semibold text-emerald-300">Save {savings.savingsPercent}% on Training</span>
                </div>
                <p className="text-xs text-white/50">
                  Use this as a base LoRA and train for just <strong className="text-white/80">{savings.withBaseCost} credits</strong> instead of {savings.fullCost} credits.
                  That's <strong className="text-emerald-300">{savings.savings} credits saved</strong>.
                </p>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3 mt-4">
              <Button
                onClick={() => downloadMut.mutate({ loraId: lora.id })}
                disabled={downloadMut.isPending || !user}
                className="flex-1 bg-gradient-to-r from-token-violet to-token-cyan text-white"
              >
                {downloadMut.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                Use as Base LoRA
              </Button>
              <Button variant="outline" className="border-white/10 text-white/60">
                <Heart className="w-4 h-4 mr-2" />
                Save
              </Button>
            </div>

            <Separator className="my-4 bg-white/5" />

            {/* Reviews */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-white/70">Reviews</h4>

              {/* Add review */}
              {user && (
                <div className="space-y-2 p-3 rounded-lg bg-white/[0.02] border border-white/5">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-white/40">Rating:</Label>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button key={n} onClick={() => setReviewRating(n)}>
                          <Star
                            size={14}
                            className={cn(
                              "transition-colors",
                              n <= reviewRating ? "text-token-gold fill-token-gold" : "text-white/20",
                            )}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                  <Textarea
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                    placeholder="Share your experience..."
                    className="bg-white/[0.03] border-white/5 text-sm min-h-[60px]"
                  />
                  <Button
                    size="sm"
                    disabled={!reviewText.trim() || reviewMut.isPending}
                    onClick={() => reviewMut.mutate({ loraId: lora.id, rating: reviewRating, comment: reviewText })}
                    className="bg-token-violet/20 text-token-violet hover:bg-token-violet/30"
                  >
                    {reviewMut.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                    Submit Review
                  </Button>
                </div>
              )}

              {/* Review list */}
              {reviewsData?.items.map((r: any) => (
                <div key={r.id} className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                  <div className="flex items-center justify-between mb-1">
                    <StarRating rating={r.rating} size={11} />
                    <span className="text-[10px] text-white/20">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {r.comment && <p className="text-xs text-white/50">{r.comment}</p>}
                </div>
              ))}

              {(!reviewsData || reviewsData.items.length === 0) && (
                <p className="text-xs text-white/20 text-center py-4">No reviews yet. Be the first!</p>
              )}
            </div>
          </>
        ) : (
          <p className="text-center text-white/40 py-10">LoRA not found</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Publish Modal ──────────────────────────────────────────────────────
function PublishLoraModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("character");
  const [license, setLicense] = useState("free");
  const [tags, setTags] = useState("");
  const [priceCents, setPriceCents] = useState(0);

  const publishMut = trpc.loraMarketplace.publish.useMutation({
    onSuccess: () => {
      toast.success("LoRA published to marketplace!");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg bg-[#0d0d14] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle>Publish LoRA to Marketplace</DialogTitle>
          <DialogDescription className="text-white/40">
            Share your trained LoRA with the community and earn revenue.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-white/50">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Character LoRA" className="bg-white/[0.03] border-white/10" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-white/50">Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe your LoRA..." className="bg-white/[0.03] border-white/10 min-h-[80px]" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-white/50">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="bg-white/[0.03] border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.filter(c => c.value !== "all").map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-white/50">License</Label>
              <Select value={license} onValueChange={setLicense}>
                <SelectTrigger className="bg-white/[0.03] border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="attribution">Attribution</SelectItem>
                  <SelectItem value="commercial">Commercial</SelectItem>
                  <SelectItem value="exclusive">Exclusive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-white/50">Tags (comma-separated)</Label>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="anime, character, shonen" className="bg-white/[0.03] border-white/10" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-white/50">Price (cents, 0 = free)</Label>
            <Input type="number" value={priceCents} onChange={(e) => setPriceCents(Number(e.target.value))} min={0} className="bg-white/[0.03] border-white/10" />
          </div>

          {priceCents > 0 && (
            <div className="text-xs text-white/30 p-2 rounded bg-white/[0.02]">
              You'll earn <strong className="text-token-mint">${((priceCents * 0.7) / 100).toFixed(2)}</strong> per download (70% revenue share).
            </div>
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} className="border-white/10 text-white/50">Cancel</Button>
          <Button
            disabled={!name.trim() || publishMut.isPending}
            onClick={() => publishMut.mutate({
              name,
              description,
              category: category as any,
              license: license as any,
              tags: tags.split(",").map(t => t.trim()).filter(Boolean),
              priceCents,
              previewImages: [],
            })}
            className="bg-gradient-to-r from-token-violet to-token-cyan text-white"
          >
            {publishMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
            Publish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────
export default function LoraMarketplace() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<string>("popular");
  const [publishOpen, setPublishOpen] = useState(false);
  const [page, setPage] = useState(1);

  const limit = 20;
  const { data, isLoading } = trpc.loraMarketplace.list.useQuery({
    search: search || undefined,
    category: category === "all" ? undefined : category as any,
    sortBy: sort as any,
    offset: (page - 1) * limit,
    limit,
  });

  const loras = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="relative min-h-screen">
      <PageBackground src="https://manus-storage.oss-cn-beijing.aliyuncs.com/user-file/e7a2e5e5c8f2e3a4b6d8c9f1a3b5d7e9/page-bg-create.png" />
      <div className="relative min-h-screen" style={{ zIndex: 1 }}>
        {/* Hero header */}
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-token-violet/10 via-transparent to-transparent" />
          <div className="container max-w-7xl mx-auto px-4 pt-24 pb-12 relative">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center space-y-4"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-token-violet/10 border border-token-violet/20 text-xs text-token-violet mb-2">
                <Package size={12} />
                Community LoRA Models
              </div>
              <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-white via-token-cyan to-token-violet bg-clip-text text-transparent">
                LoRA Marketplace
              </h1>
              <p className="text-white/40 max-w-lg mx-auto text-sm leading-relaxed">
                Browse community-trained LoRA models. Use them as a base to save 75% on character training costs.
              </p>
            </motion.div>
          </div>
        </div>

        {/* Search & filters */}
        <div className="container max-w-7xl mx-auto px-4 pb-8">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between mb-6">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search LoRA models..."
                className="pl-10 bg-white/[0.03] border-white/10 text-sm"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X size={14} className="text-white/30 hover:text-white/60" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* Sort */}
              <Select value={sort} onValueChange={(v) => { setSort(v); setPage(1); }}>
                <SelectTrigger className="w-[160px] bg-white/[0.03] border-white/10 text-xs">
                  <SlidersHorizontal size={12} className="mr-1.5" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Publish button */}
              {user && (
                <Button
                  onClick={() => setPublishOpen(true)}
                  className="bg-gradient-to-r from-token-violet/20 to-token-cyan/20 border border-token-violet/30 text-white/80 hover:text-white text-xs"
                >
                  <Upload size={12} className="mr-1.5" />
                  Publish LoRA
                </Button>
              )}
            </div>
          </div>

          {/* Category tabs */}
          <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                onClick={() => { setCategory(cat.value); setPage(1); }}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium transition-all whitespace-nowrap",
                  category === cat.value
                    ? "bg-token-violet/20 text-token-violet border border-token-violet/30"
                    : "bg-white/[0.03] text-white/40 border border-white/5 hover:bg-white/[0.06] hover:text-white/60",
                )}
              >
                {cat.icon}
                {cat.label}
              </button>
            ))}
          </div>

          {/* Grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-[4/5] rounded-xl bg-white/[0.03] animate-pulse" />
              ))}
            </div>
          ) : loras.length === 0 ? (
            <div className="text-center py-20">
              <Package className="w-12 h-12 mx-auto text-white/10 mb-4" />
              <h3 className="text-lg font-semibold text-white/40">No LoRAs found</h3>
              <p className="text-sm text-white/20 mt-1">
                {search ? "Try a different search term." : "Be the first to publish a LoRA!"}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <AnimatePresence mode="popLayout">
                  {loras.map((lora: any) => (
                    <LoraCard
                      key={lora.id}
                      lora={lora}
                      onSelect={(id) => navigate(`/marketplace/${id}`)}
                    />
                  ))}
                </AnimatePresence>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                    className="border-white/10 text-white/50 text-xs"
                  >
                    Previous
                  </Button>
                  <span className="text-xs text-white/30">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                    className="border-white/10 text-white/50 text-xs"
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Publish modal */}
        <PublishLoraModal
          open={publishOpen}
          onClose={() => setPublishOpen(false)}
        />
      </div>
    </div>
  );
}
