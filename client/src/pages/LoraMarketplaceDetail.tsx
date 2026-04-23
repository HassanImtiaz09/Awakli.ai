/**
 * LoraMarketplaceDetail — Full detail page for a single LoRA listing.
 *
 * Route: /marketplace/:id
 *
 * Features:
 *   - Preview image gallery with lightbox
 *   - Creator info, description, tags, category, license
 *   - Star rating review form (1-5 + comment)
 *   - Paginated reviews list
 *   - Training savings callout
 *   - "Use as Base" / "Fork & Fine-tune" button → navigates to character setup
 *   - Download count, average rating display
 *   - Owner-only unpublish button
 */
import { useState, useMemo, useCallback } from "react";
import { useParams, useLocation, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Download, Star, StarHalf, Loader2, Heart,
  Package, Sparkles, Palette, Image as ImageIcon, Wand2, Layers,
  DollarSign, Eye, ChevronLeft, ChevronRight, X, GitFork,
  Shield, Tag, Calendar, User, MessageSquare, ThumbsUp,
  ExternalLink, Copy, Zap, Award,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent,
} from "@/components/ui/dialog";

// ─── Constants ──────────────────────────────────────────────────────────
const LICENSE_BADGES: Record<string, { label: string; color: string; description: string }> = {
  free: { label: "Free", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30", description: "Free to use in any project" },
  attribution: { label: "Attribution", color: "bg-blue-500/20 text-blue-300 border-blue-500/30", description: "Credit the creator when used" },
  commercial: { label: "Commercial", color: "bg-amber-500/20 text-amber-300 border-amber-500/30", description: "Licensed for commercial use" },
  exclusive: { label: "Exclusive", color: "bg-purple-500/20 text-purple-300 border-purple-500/30", description: "Exclusive license required" },
};

const CATEGORY_ICONS: Record<string, typeof Package> = {
  character: Sparkles,
  style: Palette,
  background: ImageIcon,
  effect: Wand2,
  general: Package,
};

// ─── Star Rating (display) ──────────────────────────────────────────────
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

// ─── Interactive Star Input ─────────────────────────────────────────────
function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onMouseEnter={() => setHovered(n)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(n)}
          className="transition-transform hover:scale-125"
        >
          <Star
            size={20}
            className={cn(
              "transition-colors",
              n <= (hovered || value) ? "text-token-gold fill-token-gold" : "text-white/15",
            )}
          />
        </button>
      ))}
      <span className="text-xs text-white/30 ml-2">
        {value === 1 && "Poor"}
        {value === 2 && "Fair"}
        {value === 3 && "Good"}
        {value === 4 && "Great"}
        {value === 5 && "Excellent"}
      </span>
    </div>
  );
}

// ─── Image Gallery ──────────────────────────────────────────────────────
function ImageGallery({ images }: { images: string[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (images.length === 0) {
    return (
      <div className="aspect-[16/9] rounded-xl bg-gradient-to-br from-token-violet/10 to-token-cyan/10 flex items-center justify-center">
        <Package className="w-16 h-16 text-white/10" />
      </div>
    );
  }

  return (
    <>
      {/* Main image */}
      <div className="space-y-3">
        <motion.div
          className="relative aspect-[16/9] rounded-xl overflow-hidden bg-black/40 cursor-pointer group"
          onClick={() => setLightboxOpen(true)}
          whileHover={{ scale: 1.005 }}
        >
          <AnimatePresence mode="wait">
            <motion.img
              key={activeIndex}
              src={images[activeIndex]}
              alt={`Preview ${activeIndex + 1}`}
              className="w-full h-full object-contain"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            />
          </AnimatePresence>
          {/* Expand hint */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
            <Eye className="w-8 h-8 text-white/0 group-hover:text-white/60 transition-colors" />
          </div>
          {/* Nav arrows */}
          {images.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setActiveIndex((prev) => (prev - 1 + images.length) % images.length); }}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <ChevronLeft size={16} className="text-white" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setActiveIndex((prev) => (prev + 1) % images.length); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <ChevronRight size={16} className="text-white" />
              </button>
            </>
          )}
          {/* Counter */}
          {images.length > 1 && (
            <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/60 text-[10px] text-white/60">
              {activeIndex + 1} / {images.length}
            </div>
          )}
        </motion.div>

        {/* Thumbnails */}
        {images.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {images.map((img, i) => (
              <button
                key={i}
                onClick={() => setActiveIndex(i)}
                className={cn(
                  "w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-all",
                  i === activeIndex
                    ? "border-token-cyan/60 ring-1 ring-token-cyan/30"
                    : "border-white/5 opacity-50 hover:opacity-80",
                )}
              >
                <img src={img} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-4xl bg-black/95 border-white/10 p-2">
          <div className="relative">
            <img
              src={images[activeIndex]}
              alt={`Preview ${activeIndex + 1}`}
              className="w-full max-h-[80vh] object-contain rounded-lg"
            />
            {images.length > 1 && (
              <>
                <button
                  onClick={() => setActiveIndex((prev) => (prev - 1 + images.length) % images.length)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80 transition-colors"
                >
                  <ChevronLeft size={20} className="text-white" />
                </button>
                <button
                  onClick={() => setActiveIndex((prev) => (prev + 1) % images.length)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80 transition-colors"
                >
                  <ChevronRight size={20} className="text-white" />
                </button>
              </>
            )}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
              {images.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveIndex(i)}
                  className={cn(
                    "w-2 h-2 rounded-full transition-all",
                    i === activeIndex ? "bg-token-cyan w-4" : "bg-white/30",
                  )}
                />
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Review Card ────────────────────────────────────────────────────────
function ReviewCard({ review }: { review: { id: number; rating: number; comment: string | null; createdAt: Date | string; userId: number } }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-2"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-token-violet/40 to-token-cyan/40 flex items-center justify-center">
            <User size={10} className="text-white/60" />
          </div>
          <StarRating rating={review.rating} size={12} />
        </div>
        <span className="text-[10px] text-white/20">
          {new Date(review.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
        </span>
      </div>
      {review.comment && (
        <p className="text-xs text-white/50 leading-relaxed">{review.comment}</p>
      )}
    </motion.div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────
export default function LoraMarketplaceDetail() {
  const params = useParams<{ id: string }>();
  const loraId = Number(params.id);
  const [, navigate] = useLocation();
  const { user } = useAuth();

  // ─── Data fetching ──────────────────────────────────────────────────
  const { data: lora, isLoading } = trpc.loraMarketplace.get.useQuery(
    { id: loraId },
    { enabled: !isNaN(loraId) },
  );

  const [reviewPage, setReviewPage] = useState(0);
  const reviewLimit = 10;
  const { data: reviewsData, isLoading: reviewsLoading } = trpc.loraMarketplace.reviews.useQuery(
    { loraId, offset: reviewPage * reviewLimit, limit: reviewLimit },
    { enabled: !isNaN(loraId) },
  );

  const { data: savings } = trpc.loraMarketplace.trainingSavings.useQuery(
    { baseLoraId: loraId },
    { enabled: !isNaN(loraId) },
  );

  const utils = trpc.useUtils();

  // ─── Mutations ──────────────────────────────────────────────────────
  const downloadMut = trpc.loraMarketplace.download.useMutation({
    onSuccess: () => {
      toast.success("LoRA downloaded to your library!");
      utils.loraMarketplace.get.invalidate({ id: loraId });
    },
    onError: (e) => toast.error(e.message),
  });

  const unpublishMut = trpc.loraMarketplace.unpublish.useMutation({
    onSuccess: () => {
      toast.success("LoRA unpublished from marketplace");
      navigate("/marketplace");
    },
    onError: (e) => toast.error(e.message),
  });

  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const reviewMut = trpc.loraMarketplace.review.useMutation({
    onSuccess: () => {
      toast.success("Review submitted! Thank you.");
      setReviewComment("");
      setReviewRating(5);
      utils.loraMarketplace.reviews.invalidate({ loraId });
      utils.loraMarketplace.get.invalidate({ id: loraId });
    },
    onError: (e) => toast.error(e.message),
  });

  // ─── Derived data ──────────────────────────────────────────────────
  const previews = useMemo(
    () => (lora?.previewImages ? JSON.parse(lora.previewImages) as string[] : []),
    [lora?.previewImages],
  );
  const tags = useMemo(
    () => (lora?.tags ? JSON.parse(lora.tags) as string[] : []),
    [lora?.tags],
  );
  const licenseBadge = LICENSE_BADGES[lora?.license || "free"] || LICENSE_BADGES.free;
  const CategoryIcon = CATEGORY_ICONS[lora?.category || "general"] || Package;
  const isOwner = user && lora && user.id === lora.creatorId;
  const totalReviewPages = reviewsData ? Math.ceil(reviewsData.total / reviewLimit) : 0;

  // ─── Fork & Fine-tune handler ─────────────────────────────────────
  const handleForkAndFineTune = useCallback(() => {
    if (!user) {
      toast.error("Please sign in to use this LoRA as a base model");
      return;
    }
    // Navigate to character setup with loraId as query param
    navigate(`/create/setup?baseLoraId=${loraId}&baseLoraName=${encodeURIComponent(lora?.name || "")}`);
  }, [user, loraId, lora?.name, navigate]);

  // ─── Loading state ────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#05050c] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-token-cyan mx-auto mb-3" />
          <p className="text-sm text-white/30">Loading LoRA details...</p>
        </div>
      </div>
    );
  }

  if (!lora) {
    return (
      <div className="min-h-screen bg-[#05050c] flex items-center justify-center">
        <div className="text-center space-y-3">
          <Package className="w-12 h-12 text-white/10 mx-auto" />
          <h2 className="text-lg font-semibold text-white/50">LoRA Not Found</h2>
          <p className="text-sm text-white/25">This listing may have been removed or doesn't exist.</p>
          <Link href="/marketplace">
            <Button variant="outline" className="mt-2 border-white/10 text-white/50">
              <ArrowLeft size={14} className="mr-2" /> Back to Marketplace
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#05050c] relative">
      {/* Top gradient */}
      <div className="absolute top-0 left-0 right-0 h-64 bg-gradient-to-b from-token-violet/5 to-transparent pointer-events-none" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-8">
        {/* Back nav */}
        <Link href="/marketplace">
          <button className="flex items-center gap-2 text-sm text-white/40 hover:text-white/70 transition-colors mb-6">
            <ArrowLeft size={16} />
            Back to Marketplace
          </button>
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* ─── Left Column: Gallery + Description ─────────────────── */}
          <div className="lg:col-span-3 space-y-6">
            <ImageGallery images={previews} />

            {/* Description */}
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-white/50 flex items-center gap-2">
                <MessageSquare size={14} className="text-white/30" />
                Description
              </h2>
              {lora.description ? (
                <p className="text-sm text-white/60 leading-relaxed whitespace-pre-wrap">
                  {lora.description}
                </p>
              ) : (
                <p className="text-sm text-white/25 italic">No description provided.</p>
              )}
            </div>

            {/* Tags */}
            {tags.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-white/50 flex items-center gap-2">
                  <Tag size={14} className="text-white/30" />
                  Tags
                </h2>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs border-white/10 text-white/40 hover:border-white/20 transition-colors">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <Separator className="bg-white/5" />

            {/* ─── Reviews Section ─────────────────────────────────── */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white/50 flex items-center gap-2">
                  <Star size={14} className="text-token-gold" />
                  Reviews
                  {reviewsData && (
                    <span className="text-[10px] text-white/20 font-normal">({reviewsData.total} total)</span>
                  )}
                </h2>
              </div>

              {/* Write a review */}
              {user && !isOwner && (
                <Card className="border-white/5 bg-white/[0.02]">
                  <CardContent className="p-4 space-y-3">
                    <h3 className="text-xs font-semibold text-white/40">Write a Review</h3>
                    <StarInput value={reviewRating} onChange={setReviewRating} />
                    <Textarea
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      placeholder="Share your experience with this LoRA..."
                      className="bg-white/[0.03] border-white/5 text-sm min-h-[80px] placeholder:text-white/15"
                      maxLength={1000}
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-white/15">{reviewComment.length}/1000</span>
                      <Button
                        size="sm"
                        disabled={reviewMut.isPending}
                        onClick={() => reviewMut.mutate({ loraId, rating: reviewRating, comment: reviewComment || undefined })}
                        className="bg-token-violet/20 text-token-violet hover:bg-token-violet/30 border border-token-violet/20"
                      >
                        {reviewMut.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <ThumbsUp size={12} className="mr-1.5" />}
                        Submit Review
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Reviews list */}
              <div className="space-y-3">
                {reviewsLoading ? (
                  <div className="text-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-token-cyan/30 mx-auto" />
                  </div>
                ) : reviewsData && reviewsData.items.length > 0 ? (
                  <>
                    {reviewsData.items.map((r: any) => (
                      <ReviewCard key={r.id} review={r} />
                    ))}

                    {/* Pagination */}
                    {totalReviewPages > 1 && (
                      <div className="flex items-center justify-center gap-2 pt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={reviewPage === 0}
                          onClick={() => setReviewPage((p) => Math.max(0, p - 1))}
                          className="h-7 text-[10px] bg-transparent border-white/10 text-white/40"
                        >
                          <ChevronLeft size={12} /> Prev
                        </Button>
                        <span className="text-[10px] text-white/25">
                          Page {reviewPage + 1} of {totalReviewPages}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={reviewPage >= totalReviewPages - 1}
                          onClick={() => setReviewPage((p) => p + 1)}
                          className="h-7 text-[10px] bg-transparent border-white/10 text-white/40"
                        >
                          Next <ChevronRight size={12} />
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-8">
                    <Star className="w-8 h-8 text-white/5 mx-auto mb-2" />
                    <p className="text-xs text-white/20">No reviews yet. Be the first to share your experience!</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ─── Right Column: Info + Actions ──────────────────────── */}
          <div className="lg:col-span-2 space-y-5">
            {/* Title & Meta */}
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <CategoryIcon size={18} className="text-token-cyan mt-0.5 flex-shrink-0" />
                <h1 className="text-xl font-bold text-white/90 leading-tight">{lora.name}</h1>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={cn("text-[10px] border", licenseBadge.color)}>
                  <Shield size={9} className="mr-1" />
                  {licenseBadge.label}
                </Badge>
                <Badge variant="outline" className="text-[10px] border-white/10 text-white/30 capitalize">
                  {lora.category}
                </Badge>
                {lora.baseModelId && (
                  <Badge variant="outline" className="text-[10px] border-token-cyan/20 text-token-cyan/60">
                    <Layers size={9} className="mr-1" /> Fine-tuned
                  </Badge>
                )}
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 text-center">
                <Download className="w-4 h-4 mx-auto text-token-cyan mb-1.5" />
                <div className="text-lg font-bold text-white/80">{lora.downloads.toLocaleString()}</div>
                <div className="text-[9px] text-white/25">Downloads</div>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 text-center">
                <Star className="w-4 h-4 mx-auto text-token-gold mb-1.5" />
                <div className="text-lg font-bold text-white/80">
                  {lora.averageRating > 0 ? lora.averageRating.toFixed(1) : "—"}
                </div>
                <div className="text-[9px] text-white/25">
                  Rating {lora.ratingCount > 0 ? `(${lora.ratingCount})` : ""}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 text-center">
                <DollarSign className="w-4 h-4 mx-auto text-emerald-400 mb-1.5" />
                <div className="text-lg font-bold text-white/80">
                  {lora.priceCents === 0 ? "Free" : `$${(lora.priceCents / 100).toFixed(2)}`}
                </div>
                <div className="text-[9px] text-white/25">Price</div>
              </div>
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 text-center">
                <Calendar className="w-4 h-4 mx-auto text-white/30 mb-1.5" />
                <div className="text-sm font-bold text-white/60">
                  {new Date(lora.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </div>
                <div className="text-[9px] text-white/25">Published</div>
              </div>
            </div>

            {/* Rating breakdown */}
            {lora.averageRating > 0 && (
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="text-3xl font-bold text-white/80">{lora.averageRating.toFixed(1)}</div>
                  <div>
                    <StarRating rating={lora.averageRating} size={16} />
                    <p className="text-[10px] text-white/25 mt-0.5">{lora.ratingCount} review{lora.ratingCount !== 1 ? "s" : ""}</p>
                  </div>
                </div>
              </div>
            )}

            {/* License info */}
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-2">
              <div className="flex items-center gap-2">
                <Shield size={14} className="text-white/30" />
                <span className="text-xs font-semibold text-white/50">License</span>
              </div>
              <p className="text-xs text-white/40">{licenseBadge.description}</p>
            </div>

            {/* Training Savings Callout */}
            {savings && savings.savings > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-xl bg-gradient-to-br from-emerald-500/10 via-token-cyan/5 to-emerald-500/10 border border-emerald-500/20 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-bold text-emerald-300">Save {savings.savingsPercent}% on Training</span>
                </div>
                <p className="text-xs text-white/50 leading-relaxed">
                  Use this as a base LoRA and train for just{" "}
                  <strong className="text-white/80">{savings.withBaseCost} credits</strong> instead of{" "}
                  <span className="line-through text-white/25">{savings.fullCost} credits</span>.
                </p>
                <div className="flex items-center gap-4 pt-1">
                  <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-emerald-500/60 to-token-cyan/60 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${100 - savings.savingsPercent}%` }}
                      transition={{ duration: 1, delay: 0.3 }}
                    />
                  </div>
                  <span className="text-xs font-bold text-emerald-300">{savings.savings} credits saved</span>
                </div>
              </motion.div>
            )}

            {/* Action Buttons */}
            <div className="space-y-3">
              <Button
                onClick={handleForkAndFineTune}
                disabled={!user}
                className="w-full h-11 bg-gradient-to-r from-token-violet to-token-cyan text-white font-semibold shadow-lg shadow-token-violet/20 hover:shadow-token-violet/30 transition-shadow"
              >
                <GitFork className="w-4 h-4 mr-2" />
                Fork & Fine-tune
              </Button>

              <Button
                variant="outline"
                onClick={() => downloadMut.mutate({ loraId })}
                disabled={downloadMut.isPending || !user}
                className="w-full h-10 bg-transparent border-white/10 text-white/60 hover:bg-white/5 hover:text-white/80"
              >
                {downloadMut.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                Use as Base
              </Button>

              {!user && (
                <p className="text-[10px] text-white/20 text-center">Sign in to download or fork this LoRA</p>
              )}

              {/* Owner controls */}
              {isOwner && (
                <div className="pt-2 border-t border-white/5">
                  <p className="text-[10px] text-white/25 mb-2">You own this LoRA</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (confirm("Are you sure you want to unpublish this LoRA?")) {
                        unpublishMut.mutate({ id: loraId });
                      }
                    }}
                    disabled={unpublishMut.isPending}
                    className="w-full h-8 text-xs bg-transparent text-red-300/60 border-red-500/20 hover:bg-red-500/10"
                  >
                    {unpublishMut.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                    Unpublish from Marketplace
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
