/**
 * Stage 3 · Publish — manga episode with tier-aware finishing.
 *
 * States:
 *   1. ready-to-publish  — preview renders on load
 *   2. cover-editing     — CoverDesigner sheet overlay
 *   3. publishing        — 3-step progress bar
 *   4. published         — success with link, QR, share actions
 */
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  ArrowLeft,
  ImageIcon,
  Loader2,
  Check,
  ExternalLink,
  Copy,
  Share2,
  Play,
  QrCode,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import CreateWizardLayout from "@/layouts/CreateWizardLayout";
import { WithTier } from "@/components/awakli/withTier";
import { Button } from "@/components/ui/button";
import {
  PublishPreview,
  type PreviewPanel,
} from "@/components/awakli/PublishPreview";
import {
  CoverDesigner,
  type CoverConfig,
  type CoverPanel,
} from "@/components/awakli/CoverDesigner";
import {
  WatermarkToggle,
  getWatermarkBehavior,
  canPublishMore,
} from "@/components/awakli/WatermarkToggle";

// ─── Analytics helper ──────────────────────────────────────────────────
function trackEvent(name: string, data?: Record<string, unknown>) {
  if (typeof window !== "undefined" && (window as any).__awakli_track) {
    (window as any).__awakli_track(name, data);
  }
}

// ─── Copy strings (exact spec) ─────────────────────────────────────────
const COPY = {
  pageTitle: "Publish your manga",
  subhead: "Final check. Pick a cover. Ship it.",
  publishCTA: "Publish episode",
  step1: "Composing pages…",
  step2: "Generating thumbnails…",
  step3: "Creating your share link…",
  successTitle: "Your episode is live.",
  animeCTA: "Make it move — generate the anime →",
};

// ─── Publishing steps ──────────────────────────────────────────────────
const PUBLISH_STEPS = [COPY.step1, COPY.step2, COPY.step3] as const;

type PageState = "ready" | "cover-editing" | "publishing" | "published";

export default function WizardPublish() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const projectId = params.get("projectId") || "";
  const numId = parseInt(projectId, 10);

  const { user } = useAuth();

  // ─── Data queries ──────────────────────────────────────────────────
  const { data: project } = trpc.projects.get.useQuery(
    { id: numId },
    { enabled: !isNaN(numId) }
  );
  const { data: eligibility } = trpc.publish.checkEligibility.useQuery(
    undefined,
    { enabled: !!user }
  );

  const tier = eligibility?.tier ?? "free_trial";

  // ─── State ─────────────────────────────────────────────────────────
  const [pageState, setPageState] = useState<PageState>("ready");
  const [publishStep, setPublishStep] = useState(0);
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);
  const [watermarkEnabled, setWatermarkEnabled] = useState(true);
  const [coverOpen, setCoverOpen] = useState(false);
  const [coverConfig, setCoverConfig] = useState<CoverConfig>({
    title: "",
    author: "",
    coverPanelId: null,
    coverImageUrl: null,
    stylePreset: "shonen",
  });

  // Sync project title into cover config once loaded
  useEffect(() => {
    if (project?.title && !coverConfig.title) {
      setCoverConfig((prev) => ({ ...prev, title: project.title }));
    }
  }, [project?.title, coverConfig.title]);

  // Sync user name into cover config
  useEffect(() => {
    if (user?.name && !coverConfig.author) {
      setCoverConfig((prev) => ({ ...prev, author: user.name || "" }));
    }
  }, [user?.name, coverConfig.author]);

  // Watermark behavior: Apprentice always ON
  useEffect(() => {
    const behavior = getWatermarkBehavior(tier);
    if (behavior === "locked_on") {
      setWatermarkEnabled(true);
    }
  }, [tier]);

  // ─── Completed stages (all prior stages done for publish) ──────────
  const completedStages = useMemo(() => {
    const s = new Set<number>();
    for (let i = 0; i <= 5; i++) s.add(i);
    return s;
  }, []);

  // ─── Mock panels from project (in real impl, fetched from API) ─────
  const panels: PreviewPanel[] = useMemo(() => {
    if (!project) return [];
    // Use project panels if available, otherwise generate placeholders
    return Array.from({ length: 20 }, (_, i) => ({
      id: i + 1,
      panelNumber: i + 1,
      imageUrl: `https://picsum.photos/seed/${numId}-${i}/400/533`,
      compositeImageUrl: null,
      cameraAngle: i % 4 === 0 ? "wide" : i % 3 === 0 ? "close-up" : "medium",
    }));
  }, [project, numId]);

  const coverPanels: CoverPanel[] = useMemo(
    () =>
      panels.map((p) => ({
        id: p.id,
        panelNumber: p.panelNumber,
        imageUrl: p.imageUrl,
      })),
    [panels]
  );

  // ─── Analytics ─────────────────────────────────────────────────────
  const analyticsRef = useRef(false);
  useEffect(() => {
    if (!analyticsRef.current && panels.length > 0) {
      analyticsRef.current = true;
      trackEvent("stage3_preview_shown", { projectId, tier });
    }
  }, [panels.length]);

  // ─── Publish mutation ──────────────────────────────────────────────
  const publishMut = trpc.publish.publish.useMutation();
  const utils = trpc.useUtils();

  const handlePublish = useCallback(async () => {
    if (!canPublishMore(tier, 0)) {
      toast.error("You've reached your publish limit. Upgrade to continue.");
      return;
    }

    setPageState("publishing");
    setPublishStep(0);
    trackEvent("stage3_publish_start", { projectId: numId, tier });

    // Simulate 3-step progress
    const stepDurations = [2000, 2500, 1500];

    for (let i = 0; i < PUBLISH_STEPS.length; i++) {
      setPublishStep(i);
      await new Promise((r) => setTimeout(r, stepDurations[i]));
    }

    try {
      await publishMut.mutateAsync({ projectId: numId });
      // Generate slug from project title
      const slug =
        project?.slug ||
        (project?.title || "episode")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");
      setPublishedSlug(slug);
      setPageState("published");
      utils.projects.get.invalidate({ id: numId });
      trackEvent("stage3_publish_complete", { projectId: numId, slug, tier });
    } catch {
      toast.error("Publishing failed. Please try again.");
      setPageState("ready");
    }
  }, [tier, numId, publishMut, project, utils]);

  // ─── Share helpers ─────────────────────────────────────────────────
  const publicUrl = publishedSlug
    ? `${window.location.origin}/m/${publishedSlug}`
    : "";

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(publicUrl);
    toast.success("Link copied to clipboard");
  }, [publicUrl]);

  const handleShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: coverConfig.title || project?.title || "My Manga",
          url: publicUrl,
        });
      } catch {
        // User cancelled share
      }
    } else {
      handleCopyLink();
    }
  }, [publicUrl, coverConfig.title, project?.title, handleCopyLink]);

  // ─── Visibility (Mangaka+ feature) ────────────────────────────────
  const [visibility, setVisibility] = useState<"public" | "unlisted">("public");
  const canToggleVisibility = !["free_trial", "creator"].includes(tier);

  // ─── Render ────────────────────────────────────────────────────────
  return (
    <CreateWizardLayout
      stage={3}
      projectId={projectId}
      projectTitle={project?.title || "Untitled Project"}
      completedStages={completedStages}
    >
        <div className="max-w-2xl mx-auto space-y-8">
          {/* ─── Header ─────────────────────────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[#00E5A0] text-xs font-semibold uppercase tracking-widest">
              <Send className="w-3.5 h-3.5" />
              Stage 03 — Publish
            </div>
            <h1 className="text-3xl lg:text-4xl font-bold text-white/90">
              {pageState === "published" ? COPY.successTitle : COPY.pageTitle}
            </h1>
            {pageState !== "published" && (
              <p className="text-white/40 text-sm">{COPY.subhead}</p>
            )}
          </div>

          {/* ─── Publishing progress ────────────────────────────── */}
          <AnimatePresence mode="wait">
            {pageState === "publishing" && (
              <motion.div
                key="publishing"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-8 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-6"
              >
                <div className="flex items-center justify-center gap-3 mb-4">
                  <Loader2 className="w-5 h-5 text-[#00E5A0] animate-spin" />
                  <span className="text-white/70 text-sm font-medium">
                    Publishing your manga…
                  </span>
                </div>

                <div className="space-y-3">
                  {PUBLISH_STEPS.map((step, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                          i < publishStep
                            ? "bg-[#00E5A0]/20"
                            : i === publishStep
                            ? "bg-[#00E5A0]/10 ring-2 ring-[#00E5A0]/30"
                            : "bg-white/5"
                        }`}
                      >
                        {i < publishStep ? (
                          <Check className="w-3.5 h-3.5 text-[#00E5A0]" />
                        ) : i === publishStep ? (
                          <Loader2 className="w-3.5 h-3.5 text-[#00E5A0] animate-spin" />
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
                        )}
                      </div>
                      <span
                        className={`text-sm ${
                          i <= publishStep ? "text-white/70" : "text-white/20"
                        }`}
                      >
                        {step}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Progress bar */}
                <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-[#00E5A0] to-[#00C8FF]"
                    initial={{ width: "0%" }}
                    animate={{
                      width: `${((publishStep + 1) / PUBLISH_STEPS.length) * 100}%`,
                    }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </motion.div>
            )}

            {/* ─── Published success ──────────────────────────────── */}
            {pageState === "published" && (
              <motion.div
                key="published"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-6"
              >
                {/* Success card */}
                <div className="p-8 rounded-2xl bg-[#00E5A0]/[0.04] border border-[#00E5A0]/15 text-center space-y-5">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", delay: 0.2 }}
                    className="w-16 h-16 rounded-full bg-[#00E5A0]/10 flex items-center justify-center mx-auto"
                  >
                    <Check className="w-8 h-8 text-[#00E5A0]" />
                  </motion.div>

                  <div>
                    <h2 className="text-xl font-bold text-white/90 mb-1">
                      {coverConfig.title || project?.title || "Your Episode"}
                    </h2>
                    <p className="text-white/40 text-sm">is now live on Awakli</p>
                  </div>

                  {/* Public URL */}
                  {publicUrl && (
                    <div className="flex items-center gap-2 mx-auto max-w-md bg-white/[0.04] rounded-xl px-4 py-3">
                      <span className="text-white/50 text-sm truncate flex-1 text-left">
                        {publicUrl}
                      </span>
                      <button
                        onClick={handleCopyLink}
                        className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                        title="Copy link"
                      >
                        <Copy className="w-4 h-4 text-white/40" />
                      </button>
                      <button
                        onClick={() => window.open(publicUrl, "_blank")}
                        className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                        title="Open"
                      >
                        <ExternalLink className="w-4 h-4 text-white/40" />
                      </button>
                    </div>
                  )}

                  {/* Share actions */}
                  <div className="flex items-center justify-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleShare}
                      className="text-white/50 border-white/10"
                    >
                      <Share2 className="w-4 h-4 mr-2" />
                      Share
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-white/50 border-white/10"
                      onClick={() => toast.info("QR code coming soon")}
                    >
                      <QrCode className="w-4 h-4 mr-2" />
                      QR Code
                    </Button>
                  </div>
                </div>

                {/* Anime CTA */}
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  onClick={() => {
                    trackEvent("stage3_anime_cta", { projectId });
                    navigate(`/create/anime-gate?projectId=${projectId}`);
                  }}
                  className="w-full flex items-center justify-between p-5 rounded-2xl bg-gradient-to-r from-violet-500/10 to-cyan-500/10 border border-violet-500/15 hover:border-violet-500/30 transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center">
                      <Play className="w-5 h-5 text-violet-400" />
                    </div>
                    <span className="text-sm font-semibold text-white/80 group-hover:text-white/90 transition-colors">
                      {COPY.animeCTA}
                    </span>
                  </div>
                  <ArrowLeft className="w-4 h-4 text-white/30 rotate-180" />
                </motion.button>
              </motion.div>
            )}

            {/* ─── Ready-to-publish / Cover editing ───────────────── */}
            {(pageState === "ready" || pageState === "cover-editing") && (
              <motion.div
                key="ready"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                {/* Cover section */}
                <div className="space-y-3">
                  <label className="text-xs font-medium text-white/50 uppercase tracking-wider">
                    Cover
                  </label>
                  <button
                    onClick={() => {
                      setCoverOpen(true);
                      setPageState("cover-editing");
                    }}
                    className="w-full flex items-center gap-4 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-white/10 transition-all text-left"
                  >
                    {coverConfig.coverImageUrl ? (
                      <div className="w-16 h-20 rounded-lg overflow-hidden bg-white/5 flex-shrink-0">
                        <img
                          src={coverConfig.coverImageUrl}
                          alt="Cover"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-16 h-20 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                        <ImageIcon className="w-6 h-6 text-white/10" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white/70">
                        {coverConfig.coverImageUrl
                          ? "Cover selected"
                          : "Choose a cover"}
                      </div>
                      <div className="text-xs text-white/30 mt-0.5">
                        {coverConfig.coverImageUrl
                          ? `${coverConfig.stylePreset.charAt(0).toUpperCase() + coverConfig.stylePreset.slice(1)} style · Panel ${coverConfig.coverPanelId}`
                          : "Pick any rendered panel as your cover art"}
                      </div>
                    </div>
                    <span className="text-xs text-white/20">Edit →</span>
                  </button>
                </div>

                {/* Visibility (Mangaka+) */}
                {canToggleVisibility && (
                  <div className="space-y-3">
                    <label className="text-xs font-medium text-white/50 uppercase tracking-wider">
                      Visibility
                    </label>
                    <div className="flex gap-2">
                      {(["public", "unlisted"] as const).map((v) => (
                        <button
                          key={v}
                          onClick={() => setVisibility(v)}
                          className={`flex-1 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                            visibility === v
                              ? "bg-white/[0.06] border-white/15 text-white/80"
                              : "bg-white/[0.02] border-white/[0.04] text-white/30 hover:border-white/10"
                          }`}
                        >
                          {v === "public" ? "Public" : "Unlisted"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Watermark toggle */}
                <div className="space-y-3">
                  <label className="text-xs font-medium text-white/50 uppercase tracking-wider">
                    Watermark
                  </label>
                  <WatermarkToggle
                    enabled={watermarkEnabled}
                    onChange={setWatermarkEnabled}
                    tier={tier}
                  />
                </div>

                {/* Preview */}
                <div className="space-y-3">
                  <label className="text-xs font-medium text-white/50 uppercase tracking-wider">
                    Preview
                  </label>
                  <PublishPreview
                    panels={panels}
                    episodeTitle={coverConfig.title || project?.title}
                    showWatermark={watermarkEnabled}
                    onPreviewShown={() => {
                      // stage3_preview_shown
                    }}
                  />
                </div>

                {/* Publish CTA */}
                <div className="text-center pt-4">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handlePublish}
                    disabled={pageState !== "ready"}
                    className="inline-flex items-center gap-3 px-10 py-4 rounded-2xl bg-gradient-to-r from-[#00E5A0] via-[#00C8FF] to-[#8B5CF6] text-white font-bold text-base shadow-[0_4px_30px_rgba(0,229,160,0.25)] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="w-5 h-5" />
                    {COPY.publishCTA}
                  </motion.button>
                </div>

                {/* Back navigation */}
                <div className="flex justify-start pt-2">
                  <button
                    onClick={() =>
                      navigate(`/create/panels?projectId=${projectId}`)
                    }
                    className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/5 text-white/50 hover:text-white/70 text-sm transition-all"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ─── Cover Designer Sheet ─────────────────────────────── */}
        <CoverDesigner
          open={coverOpen}
          onClose={() => {
            setCoverOpen(false);
            setPageState("ready");
          }}
          panels={coverPanels}
          initialConfig={coverConfig}
          onSave={(config) => {
            setCoverConfig(config);
            trackEvent("stage3_cover_picked", { projectId, preset: config.stylePreset });
          }}
          onCoverPicked={() => {
            trackEvent("stage3_cover_picked", { projectId });
          }}
        />
    </CreateWizardLayout>
  );
}
