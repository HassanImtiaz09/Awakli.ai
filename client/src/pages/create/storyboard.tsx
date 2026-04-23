/**
 * Stage: Storyboard — 10-Second Slice Decomposition & Core Scene Approval
 *
 * This is the critical bridge between manga panels and video generation.
 * Users review the AI-decomposed 10-second slices, approve/reject core scene
 * previews, override routing tiers, and proceed to video generation.
 *
 * States: loading → decomposing → previewing → approving → ready
 */
import { useState, useCallback, useEffect, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { motion } from "framer-motion";
import {
  Grid3X3, ArrowLeft, ArrowRight, Loader2, AlertTriangle,
  Sparkles, Play, CheckCircle2, RotateCcw, Zap, Film,
  Eye, RefreshCw, Info,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import CreateWizardLayout from "@/layouts/CreateWizardLayout";
import { StageHeader } from "@/components/awakli/StageHeader";
import { AwakliButton } from "@/components/awakli/AwakliButton";
import { Button } from "@/components/ui/button";
import { StoryboardView } from "@/components/awakli/StoryboardView";

import { StoryboardCostBar } from "@/components/awakli/StoryboardCostBar";

export const STORYBOARD_COPY = {
  title: "Storyboard Preview",
  subtitle: "Review your 10-second scene slices before video generation",
  decompose_btn: "Decompose into Slices",
  decomposing: "AI is breaking your script into 10-second video slices...",
  generate_previews_btn: "Generate Core Scene Previews",
  generating_previews: "Generating preview images for each slice...",
  approve_all_btn: "Approve All",
  proceed_btn: "Proceed to Video Generation",
  no_episode: "No episode found. Please complete the previous steps first.",
  empty_slices: "No slices generated yet. Click 'Decompose into Slices' to begin.",
};

type WizardState = "loading" | "no_slices" | "decomposing" | "slices_ready" | "generating_previews" | "previews_ready" | "all_approved";

export default function WizardStoryboard() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const projectId = Number(params.get("projectId")) || 0;
  const [, navigate] = useLocation();

  const [wizardState, setWizardState] = useState<WizardState>("loading");


  const utils = trpc.useUtils();

  // ─── Queries ────────────────────────────────────────────────────────

  // Get the first episode for this project
  const { data: episodes } = trpc.episodes.listByProject.useQuery(
    { projectId },
    { enabled: projectId > 0 }
  );
  const episodeId = episodes?.[0]?.id;

  // Get storyboard data (slices with preview status)
  const {
    data: storyboard,
    isLoading: storyboardLoading,
    refetch: refetchStoryboard,
  } = trpc.coreScene.getStoryboard.useQuery(
    { episodeId: episodeId! },
    { enabled: !!episodeId, refetchInterval: wizardState === "generating_previews" ? 3000 : false }
  );

  // Get cost summary
  const { data: costSummary } = trpc.slices.getCostSummary.useQuery(
    { episodeId: episodeId! },
    { enabled: !!episodeId && (storyboard?.totalSlices ?? 0) > 0 }
  );

  // ─── Mutations ──────────────────────────────────────────────────────

  const decomposeMut = trpc.slices.decompose.useMutation({
    onSuccess: (data) => {
      toast.success(`Decomposed into ${data.sliceCount} slices`, {
        description: `${data.totalPanels} panels across ${data.totalDurationSeconds}s`,
      });
      refetchStoryboard();
      setWizardState("slices_ready");
    },
    onError: (err) => {
      toast.error("Decomposition failed", { description: err.message });
      setWizardState("no_slices");
    },
  });

  const generateBatchMut = trpc.coreScene.generateBatch.useMutation({
    onSuccess: (data) => {
      toast.success(`Generating ${data.total} preview images...`);
      setWizardState("generating_previews");
    },
    onError: (err) => {
      toast.error("Batch generation failed", { description: err.message });
    },
  });

  const approveAllMut = trpc.coreScene.approveAll.useMutation({
    onSuccess: (data) => {
      toast.success(`Approved ${data.approved} slices`);
      refetchStoryboard();
    },
    onError: (err) => {
      toast.error("Bulk approval failed", { description: err.message });
    },
  });

  // ─── State Management ───────────────────────────────────────────────

  useEffect(() => {
    if (storyboardLoading) {
      setWizardState("loading");
      return;
    }
    if (!storyboard || storyboard.totalSlices === 0) {
      setWizardState("no_slices");
      return;
    }
    if (storyboard.allApproved) {
      setWizardState("all_approved");
      return;
    }
    const hasAnyGenerated = storyboard.statusCounts.generated > 0 ||
      storyboard.statusCounts.approved > 0;
    const hasAnyGenerating = storyboard.statusCounts.generating > 0;

    if (hasAnyGenerating) {
      setWizardState("generating_previews");
      return;
    }
    if (hasAnyGenerated) {
      setWizardState("previews_ready");
      return;
    }
    setWizardState("slices_ready");
  }, [storyboard, storyboardLoading]);

  // ─── Handlers ───────────────────────────────────────────────────────

  const handleDecompose = useCallback(() => {
    if (!episodeId) return;
    setWizardState("decomposing");
    decomposeMut.mutate({ episodeId });
  }, [episodeId, decomposeMut]);

  const handleGeneratePreviews = useCallback(() => {
    if (!episodeId) return;
    generateBatchMut.mutate({ episodeId });
  }, [episodeId, generateBatchMut]);

  const handleApproveAll = useCallback(() => {
    if (!episodeId) return;
    approveAllMut.mutate({ episodeId });
  }, [episodeId, approveAllMut]);

  const handleProceedToVideo = useCallback(() => {
    navigate(`/create/video?projectId=${projectId}`);
  }, [navigate, projectId]);





  // ─── Computed values ────────────────────────────────────────────────

  const totalCredits = costSummary?.totalEstimated ?? 0;
  const approvedCount = storyboard?.statusCounts.approved ?? 0;
  const totalSlices = storyboard?.totalSlices ?? 0;
  const allApproved = storyboard?.allApproved ?? false;

  // ─── Render ─────────────────────────────────────────────────────────

  if (!projectId) {
    return (
      <CreateWizardLayout stage={3} projectId="0">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <AlertTriangle className="w-12 h-12 text-white/20 mx-auto mb-4" />
            <p className="text-white/40">No project selected</p>
          </div>
        </div>
      </CreateWizardLayout>
    );
  }

  return (
    <CreateWizardLayout stage={3} projectId={String(projectId)}>
      <div className="max-w-6xl mx-auto px-4 py-6 pb-32">
        {/* Header */}
        <StageHeader
          stageKey="storyboard"
          label={STORYBOARD_COPY.title}
          icon={Grid3X3}
          className="text-cyan-400"
        />
        <p className="text-white/40 text-sm mt-1 mb-8">{STORYBOARD_COPY.subtitle}</p>

        {/* Loading state */}
        {wizardState === "loading" && (
          <div className="flex items-center justify-center min-h-[40vh]">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
              <span className="text-white/40 text-sm">Loading storyboard...</span>
            </div>
          </div>
        )}

        {/* No slices — need to decompose */}
        {wizardState === "no_slices" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center min-h-[40vh] gap-6"
          >
            <div className="w-20 h-20 rounded-2xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20">
              <Grid3X3 className="w-10 h-10 text-cyan-400" />
            </div>
            <div className="text-center max-w-md">
              <h3 className="text-white font-semibold text-lg mb-2">Ready to Decompose</h3>
              <p className="text-white/40 text-sm leading-relaxed">
                AI will analyze your approved script and manga panels, then break them into
                10-second video slices with character assignments, dialogue timing, and
                complexity-based routing for optimal quality and cost.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => navigate(`/create/panels?projectId=${projectId}`)}
                className="border-white/10 text-white/50"
              >
                <ArrowLeft className="w-4 h-4 mr-2" /> Back to Panels
              </Button>
              <AwakliButton
                variant="primary"
                size="md"
                onClick={handleDecompose}
                disabled={decomposeMut.isPending || !episodeId}
              >
                {decomposeMut.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Decomposing...</>
                ) : (
                  <><Sparkles className="w-4 h-4" /> {STORYBOARD_COPY.decompose_btn}</>
                )}
              </AwakliButton>
            </div>
          </motion.div>
        )}

        {/* Decomposing state */}
        {wizardState === "decomposing" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center min-h-[40vh] gap-4"
          >
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-cyan-500/10 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
              </div>
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-cyan-400/20"
                animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </div>
            <p className="text-white/50 text-sm">{STORYBOARD_COPY.decomposing}</p>
          </motion.div>
        )}

        {/* Slices ready — show storyboard + action buttons */}
        {(wizardState === "slices_ready" || wizardState === "generating_previews" ||
          wizardState === "previews_ready" || wizardState === "all_approved") &&
          storyboard && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {/* Action bar */}
            <div className="flex items-center justify-between mb-6 bg-white/[0.02] rounded-xl p-4 border border-white/5">
              <div className="flex items-center gap-4">
                <div className="text-sm">
                  <span className="text-white/30">Slices: </span>
                  <span className="text-white font-mono font-bold">{totalSlices}</span>
                </div>
                <div className="w-px h-6 bg-white/5" />
                <div className="text-sm">
                  <span className="text-white/30">Approved: </span>
                  <span className={`font-mono font-bold ${allApproved ? "text-emerald-400" : "text-white/60"}`}>
                    {approvedCount}/{totalSlices}
                  </span>
                </div>
                <div className="w-px h-6 bg-white/5" />
                <div className="text-sm flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-cyan-400 font-mono font-bold">{totalCredits}</span>
                  <span className="text-white/30">credits</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {wizardState === "slices_ready" && (
                  <AwakliButton
                    variant="primary"
                    size="sm"
                    onClick={handleGeneratePreviews}
                    disabled={generateBatchMut.isPending}
                  >
                    {generateBatchMut.isPending ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
                    ) : (
                      <><Eye className="w-4 h-4" /> {STORYBOARD_COPY.generate_previews_btn}</>
                    )}
                  </AwakliButton>
                )}

                {wizardState === "generating_previews" && (
                  <div className="flex items-center gap-2 text-cyan-400 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{STORYBOARD_COPY.generating_previews}</span>
                  </div>
                )}

                {(wizardState === "previews_ready") && (
                  <>
                    <AwakliButton
                      variant="secondary"
                      size="sm"
                      onClick={handleApproveAll}
                      disabled={approveAllMut.isPending}
                    >
                      {approveAllMut.isPending ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Approving...</>
                      ) : (
                        <><CheckCircle2 className="w-4 h-4" /> {STORYBOARD_COPY.approve_all_btn}</>
                      )}
                    </AwakliButton>
                    <AwakliButton
                      variant="secondary"
                      size="sm"
                      onClick={handleGeneratePreviews}
                      disabled={generateBatchMut.isPending}
                    >
                      <RefreshCw className="w-4 h-4" /> Regenerate Pending
                    </AwakliButton>
                  </>
                )}

                {wizardState === "all_approved" && (
                  <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
                    <CheckCircle2 className="w-5 h-5" />
                    All slices approved — ready for video generation
                  </div>
                )}
              </div>
            </div>

            {/* Info banner for first-time users */}
            {wizardState === "slices_ready" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="mb-6 bg-cyan-500/5 border border-cyan-500/10 rounded-xl p-4 flex items-start gap-3"
              >
                <Info className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-white/50 leading-relaxed">
                  <p className="font-medium text-white/70 mb-1">How the storyboard works:</p>
                  <ol className="list-decimal list-inside space-y-1 text-xs">
                    <li>Click <strong>"Generate Core Scene Previews"</strong> to create a cheap static image for each slice (~2 credits each)</li>
                    <li>Review each preview — click to see details, approve or reject</li>
                    <li>Rejected slices can be regenerated with your feedback</li>
                    <li>Override the AI-assigned quality tier per slice to control cost</li>
                    <li>Once all slices are approved, proceed to video generation</li>
                  </ol>
                </div>
              </motion.div>
            )}

            {/* Storyboard Grid */}
            <StoryboardView
              episodeId={episodeId!}
              onProceedToVideo={handleProceedToVideo}
            />
          </motion.div>
        )}


      </div>

      {/* Sticky Cost Bar */}
      {storyboard && storyboard.totalSlices > 0 && (
        <StoryboardCostBar
          totalCredits={totalCredits}
          totalSlices={totalSlices}
          approvedCount={approvedCount}
          allApproved={allApproved}
          onProceed={handleProceedToVideo}
        />
      )}
    </CreateWizardLayout>
  );
}
