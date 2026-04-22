import { trpc } from "@/lib/trpc";
import { SEOHead } from "@/components/awakli/SEOHead";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { Link, useParams, useLocation } from "wouter";
import {
  ArrowLeft, Share2, Copy, Check, BookOpen, ChevronUp, ChevronDown,
  Eye, Heart, ExternalLink, Maximize2, Minimize2, X
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Constants ──────────────────────────────────────────────────────────────
export const MANGA_READER_COPY = {
  madeWith: "Made with Awakli",
  createCta: "Create your own manga",
  watermark: "Made with Awakli",
  shareTitle: "Share this manga",
  copyLink: "Copy link",
  copied: "Copied!",
  openTwitter: "Share on X",
  openFacebook: "Share on Facebook",
  notFound: "Manga not found",
  notFoundSub: "This episode may have been removed or is not yet published.",
  backToDiscover: "Back to Discover",
  episode: "Episode",
  panels: "panels",
  by: "by",
  fullscreen: "Fullscreen",
  exitFullscreen: "Exit fullscreen",
  scrollToTop: "Back to top",
  nextEpisode: "Next episode",
  prevEpisode: "Previous episode",
};

// ─── Helpers ────────────────────────────────────────────────────────────────
function composePanelsIntoPages(
  panels: Array<{ id: number; imageUrl: string | null; cameraAngle: string | null; dialogue: any; sceneNumber: number; panelNumber: number }>
): Array<Array<typeof panels[number]>> {
  const pages: Array<Array<typeof panels[number]>> = [];
  let currentPage: Array<typeof panels[number]> = [];

  for (const panel of panels) {
    const angle = panel.cameraAngle || "medium";
    // Wide/bird's-eye panels get their own page
    if (angle === "wide" || angle === "birds-eye") {
      if (currentPage.length > 0) {
        pages.push(currentPage);
        currentPage = [];
      }
      pages.push([panel]);
    } else if (angle === "close-up" || angle === "extreme-close-up") {
      currentPage.push(panel);
      if (currentPage.length >= 3) {
        pages.push(currentPage);
        currentPage = [];
      }
    } else {
      // medium shots: 2 per page
      currentPage.push(panel);
      if (currentPage.length >= 2) {
        pages.push(currentPage);
        currentPage = [];
      }
    }
  }
  if (currentPage.length > 0) pages.push(currentPage);
  return pages;
}

// ─── Panel Image Component ──────────────────────────────────────────────────
function PanelImage({ panel, onClick }: {
  panel: { id: number; imageUrl: string | null; cameraAngle: string | null; dialogue: any; panelNumber: number };
  onClick: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-20px" });
  const dialogueEntries = Array.isArray(panel.dialogue) ? panel.dialogue : [];

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={isInView ? { opacity: 1, scale: 1 } : {}}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="relative cursor-pointer group"
      onClick={onClick}
    >
      {panel.imageUrl ? (
        <img
          src={panel.imageUrl}
          alt={`Panel ${panel.panelNumber}`}
          className="w-full rounded-lg shadow-md"
          loading="lazy"
        />
      ) : (
        <div className="w-full aspect-[3/4] rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
          <BookOpen size={32} className="text-white/20" />
        </div>
      )}
      {/* Dialogue bubbles overlay */}
      {dialogueEntries.length > 0 && (
        <div className="absolute bottom-2 left-2 right-2 space-y-1">
          {dialogueEntries.slice(0, 2).map((d: any, i: number) => (
            <div key={i} className="bg-white/90 text-gray-900 text-xs px-2 py-1 rounded-lg shadow-sm max-w-[80%]">
              {d.character && <span className="font-bold text-[10px] uppercase tracking-wider text-gray-500">{d.character}: </span>}
              <span>{d.text}</span>
            </div>
          ))}
        </div>
      )}
      {/* Expand icon on hover */}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="bg-black/60 backdrop-blur-sm rounded-full p-1.5">
          <Maximize2 size={14} className="text-white" />
        </div>
      </div>
    </motion.div>
  );
}

// ─── Lightbox ───────────────────────────────────────────────────────────────
function ReaderLightbox({ panel, onClose, onPrev, onNext, hasPrev, hasNext }: {
  panel: { imageUrl: string | null; panelNumber: number; dialogue: any };
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && hasPrev) onPrev();
      if (e.key === "ArrowRight" && hasNext) onNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, onPrev, onNext, hasPrev, hasNext]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 bg-white/10 hover:bg-white/20 rounded-full p-2 transition"
      >
        <X size={20} className="text-white" />
      </button>
      {hasPrev && (
        <button
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 rounded-full p-3 transition"
        >
          <ChevronUp size={24} className="text-white rotate-[-90deg]" />
        </button>
      )}
      {hasNext && (
        <button
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 rounded-full p-3 transition"
        >
          <ChevronDown size={24} className="text-white rotate-[-90deg]" />
        </button>
      )}
      <div className="max-w-3xl max-h-[90vh] px-4" onClick={(e) => e.stopPropagation()}>
        {panel.imageUrl ? (
          <img
            src={panel.imageUrl}
            alt={`Panel ${panel.panelNumber}`}
            className="max-w-full max-h-[85vh] object-contain rounded-lg"
          />
        ) : (
          <div className="w-96 aspect-[3/4] bg-white/5 rounded-lg flex items-center justify-center">
            <BookOpen size={48} className="text-white/20" />
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Share Popover ──────────────────────────────────────────────────────────
function SharePopover({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const copyLink = useCallback(() => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success(MANGA_READER_COPY.copied);
    setTimeout(() => setCopied(false), 2000);
  }, [url]);

  const shareTwitter = () => {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`, "_blank");
  };

  const shareFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, "_blank");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="absolute top-full right-0 mt-2 bg-[#1a1a2e] border border-white/10 rounded-xl p-4 shadow-2xl z-20 min-w-[220px]"
    >
      <p className="text-sm font-medium text-white/80 mb-3">{MANGA_READER_COPY.shareTitle}</p>
      <div className="space-y-2">
        <button onClick={copyLink} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/5 transition text-sm text-white/70">
          {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
          {copied ? MANGA_READER_COPY.copied : MANGA_READER_COPY.copyLink}
        </button>
        <button onClick={shareTwitter} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/5 transition text-sm text-white/70">
          <ExternalLink size={16} />
          {MANGA_READER_COPY.openTwitter}
        </button>
        <button onClick={shareFacebook} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/5 transition text-sm text-white/70">
          <ExternalLink size={16} />
          {MANGA_READER_COPY.openFacebook}
        </button>
      </div>
    </motion.div>
  );
}

// ─── Page Layout (1-4 panels per page) ──────────────────────────────────────
function MangaPage({ panels, pageIndex, onPanelClick }: {
  panels: Array<{ id: number; imageUrl: string | null; cameraAngle: string | null; dialogue: any; panelNumber: number }>;
  pageIndex: number;
  onPanelClick: (panelId: number) => void;
}) {
  const count = panels.length;

  if (count === 1) {
    return (
      <div className="w-full">
        <PanelImage panel={panels[0]} onClick={() => onPanelClick(panels[0].id)} />
      </div>
    );
  }

  if (count === 2) {
    return (
      <div className="grid grid-cols-2 gap-1">
        {panels.map((p) => (
          <PanelImage key={p.id} panel={p} onClick={() => onPanelClick(p.id)} />
        ))}
      </div>
    );
  }

  if (count === 3) {
    return (
      <div className="grid grid-cols-2 gap-1">
        <div className="col-span-2">
          <PanelImage panel={panels[0]} onClick={() => onPanelClick(panels[0].id)} />
        </div>
        {panels.slice(1).map((p) => (
          <PanelImage key={p.id} panel={p} onClick={() => onPanelClick(p.id)} />
        ))}
      </div>
    );
  }

  // 4 panels
  return (
    <div className="grid grid-cols-2 gap-1">
      {panels.map((p) => (
        <PanelImage key={p.id} panel={p} onClick={() => onPanelClick(p.id)} />
      ))}
    </div>
  );
}

// ─── Watermark ──────────────────────────────────────────────────────────────
function AwakliWatermark() {
  return (
    <div className="flex items-center justify-center py-4 opacity-40">
      <div className="flex items-center gap-2 text-xs text-white/50">
        <BookOpen size={14} />
        <span>{MANGA_READER_COPY.watermark}</span>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function MangaReader() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug || "";
  const [, navigate] = useLocation();
  const [lightboxPanelId, setLightboxPanelId] = useState<number | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Fetch project + episodes
  const project = trpc.publicContent.getProject.useQuery(
    { slug },
    { enabled: !!slug }
  );

  // Fetch panels for the first episode
  const firstEpisode = project.data?.episodes?.[0];
  const episodePanels = trpc.watch.episode.useQuery(
    { episodeId: firstEpisode?.id ?? 0 },
    { enabled: !!firstEpisode?.id }
  );

  // Increment view count
  const incrementView = trpc.publicContent.incrementView.useMutation();
  useEffect(() => {
    if (project.data?.id) {
      incrementView.mutate({ projectId: project.data.id });
    }
  }, [project.data?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll-to-top button
  useEffect(() => {
    const handler = () => setShowScrollTop(window.scrollY > 600);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  // Compose panels into pages
  const allPanels = useMemo(() => {
    const raw = episodePanels.data?.panels ?? [];
    return raw.filter((p: any) => p.status === "generated" || p.status === "approved");
  }, [episodePanels.data]);

  const pages = useMemo(() => composePanelsIntoPages(allPanels as any), [allPanels]);

  const flatPanels = useMemo(() => pages.flat(), [pages]);
  const lightboxPanel = flatPanels.find((p) => p.id === lightboxPanelId);
  const lightboxIndex = flatPanels.findIndex((p) => p.id === lightboxPanelId);

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";

  // ─── Loading ────────────────────────────────────────────────────────────
  if (project.isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a14] flex items-center justify-center">
        <div className="space-y-4 max-w-2xl w-full px-4">
          <div className="h-8 w-48 bg-white/5 rounded animate-pulse" />
          <div className="h-4 w-32 bg-white/5 rounded animate-pulse" />
          <div className="space-y-2 mt-8">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="aspect-[2/3] bg-white/5 rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── Not Found ──────────────────────────────────────────────────────────
  if (project.error || !project.data) {
    return (
      <div className="min-h-screen bg-[#0a0a14] flex items-center justify-center text-center px-4">
        <div>
          <BookOpen size={48} className="text-white/20 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">{MANGA_READER_COPY.notFound}</h1>
          <p className="text-white/50 text-sm mb-6">{MANGA_READER_COPY.notFoundSub}</p>
          <Link href="/discover">
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm transition">
              <ArrowLeft size={16} />
              {MANGA_READER_COPY.backToDiscover}
            </span>
          </Link>
        </div>
      </div>
    );
  }

  const { title, description, coverImageUrl, userName, genre, viewCount } = project.data;

  return (
    <div className="min-h-screen bg-[#0a0a14] text-white">
      {/* SEO */}
      <SEOHead
        title={title || "Manga"}
        description={description || `Read ${title} on Awakli`}
        image={coverImageUrl || undefined}
        type="article"
        url={shareUrl}
      />

      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-[#0a0a14]/90 backdrop-blur-md border-b border-white/5">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <button onClick={() => navigate("/discover")} className="flex items-center gap-2 text-white/60 hover:text-white transition text-sm">
            <ArrowLeft size={18} />
            <span className="hidden sm:inline">Discover</span>
          </button>
          <div className="text-center flex-1 min-w-0 px-4">
            <h1 className="text-sm font-medium text-white truncate">{title}</h1>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowShare(!showShare)}
              className="flex items-center gap-1.5 text-white/60 hover:text-white transition text-sm"
            >
              <Share2 size={16} />
              <span className="hidden sm:inline">Share</span>
            </button>
            <AnimatePresence>
              {showShare && (
                <SharePopover url={shareUrl} title={title || "Manga"} onClose={() => setShowShare(false)} />
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* Cover + Meta */}
      <section className="max-w-2xl mx-auto px-4 pt-6 pb-4">
        {coverImageUrl && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4"
          >
            <img
              src={coverImageUrl}
              alt={title || "Cover"}
              className="w-full max-h-[400px] object-cover rounded-xl shadow-2xl"
            />
          </motion.div>
        )}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h2 className="text-2xl font-bold text-white mb-1">{title}</h2>
          <div className="flex items-center gap-3 text-sm text-white/50 mb-2">
            {userName && <span>{MANGA_READER_COPY.by} {userName}</span>}
            {genre && <span className="px-2 py-0.5 rounded-full bg-white/5 text-xs">{genre}</span>}
            {firstEpisode && <span>{MANGA_READER_COPY.episode} {firstEpisode.episodeNumber}</span>}
          </div>
          <div className="flex items-center gap-4 text-xs text-white/40">
            <span className="flex items-center gap-1"><Eye size={12} /> {viewCount ?? 0}</span>
            <span>{allPanels.length} {MANGA_READER_COPY.panels}</span>
          </div>
          {description && (
            <p className="text-sm text-white/60 mt-3 leading-relaxed">{description}</p>
          )}
        </motion.div>
      </section>

      {/* Panel Pages */}
      <main className="max-w-2xl mx-auto px-4 pb-8">
        <div className="space-y-2">
          {pages.map((pagePanels, pageIdx) => (
            <motion.div
              key={pageIdx}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: pageIdx * 0.05, duration: 0.4 }}
              className="bg-white/[0.02] rounded-xl overflow-hidden shadow-lg"
            >
              <MangaPage
                panels={pagePanels as any}
                pageIndex={pageIdx}
                onPanelClick={setLightboxPanelId}
              />
            </motion.div>
          ))}
        </div>

        {/* Watermark (always shown — Apprentice branding) */}
        <AwakliWatermark />

        {/* Footer CTA */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-8 text-center space-y-4"
        >
          <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <p className="text-white/40 text-sm">{MANGA_READER_COPY.madeWith}</p>
          <Link href="/create/input">
            <span className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-medium text-sm transition shadow-lg shadow-violet-600/20">
              <BookOpen size={16} />
              {MANGA_READER_COPY.createCta}
            </span>
          </Link>
        </motion.div>
      </main>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxPanel && (
          <ReaderLightbox
            panel={lightboxPanel as any}
            onClose={() => setLightboxPanelId(null)}
            onPrev={() => {
              if (lightboxIndex > 0) setLightboxPanelId(flatPanels[lightboxIndex - 1].id);
            }}
            onNext={() => {
              if (lightboxIndex < flatPanels.length - 1) setLightboxPanelId(flatPanels[lightboxIndex + 1].id);
            }}
            hasPrev={lightboxIndex > 0}
            hasNext={lightboxIndex < flatPanels.length - 1}
          />
        )}
      </AnimatePresence>

      {/* Scroll to top */}
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="fixed bottom-6 right-6 z-40 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-full p-3 transition shadow-lg"
            title={MANGA_READER_COPY.scrollToTop}
          >
            <ChevronUp size={20} className="text-white" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
