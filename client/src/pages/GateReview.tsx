/**
 * GateReview — Main HITL gate review screen (Prompt 17)
 *
 * Route: /studio/project/:projectId/pipeline/:runId/gate/:gateId
 *
 * Layout per spec §11.1:
 * - Top bar: episode title, stage name, stage number, confidence badge
 * - Main content: generated output (image viewer, video player, audio waveform)
 * - Reference panel: collapsible sidebar with character sheets, manga panels, prev stage
 * - Credit panel: fixed bottom bar with credit breakdown
 * - Action bar: Approve, Regenerate, Reject, Abort
 */

import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { AwakliButton } from "@/components/awakli/AwakliButton";
import { AwakliCard } from "@/components/awakli/AwakliCard";
import { AwakliiBadge } from "@/components/awakli/AwakliiBadge";
import { PipelineStepper, type StageInfo } from "@/components/awakli/PipelineStepper";
import { ConfidenceBreakdown } from "@/components/awakli/ConfidenceBreakdown";
import { CreditPanel } from "@/components/awakli/CreditPanel";
import {
  CheckCircle, XCircle, RefreshCw, AlertTriangle, Loader2,
  ArrowLeft, ChevronRight, ChevronLeft, Image, Film, Mic, Music,
  PanelLeftClose, PanelLeftOpen, Star, OctagonX
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

const STAGE_DISPLAY_NAMES: Record<number, string> = {
  1: "Manga Analysis", 2: "Scene Planning", 3: "Character Sheet Gen",
  4: "Keyframe Generation", 5: "Video Generation", 6: "Voice Synthesis",
  7: "Music Scoring", 8: "SFX & Foley", 9: "Audio Mix",
  10: "Video Composite", 11: "Subtitle Render", 12: "Episode Publish",
};

function getMediaType(stageNumber: number): "image" | "video" | "audio" | "text" {
  if ([3, 4].includes(stageNumber)) return "image";
  if ([5, 10].includes(stageNumber)) return "video";
  if ([6, 7, 8, 9].includes(stageNumber)) return "audio";
  return "text";
}

function MediaIcon({ stageNumber }: { stageNumber: number }) {
  const type = getMediaType(stageNumber);
  if (type === "image") return <Image className="w-5 h-5" />;
  if (type === "video") return <Film className="w-5 h-5" />;
  if (type === "audio") return <Mic className="w-5 h-5" />;
  return <Music className="w-5 h-5" />;
}

export default function GateReview() {
  const { user } = useAuth();
  const params = useParams<{ projectId: string; runId: string; gateId: string }>();
  const projectId = Number(params.projectId);
  const runId = Number(params.runId);
  const gateId = Number(params.gateId);
  const [, navigate] = useLocation();

  const [showReference, setShowReference] = useState(true);
  const [showAbortModal, setShowAbortModal] = useState(false);
  const [showRegenModal, setShowRegenModal] = useState(false);
  const [regenReason, setRegenReason] = useState("");
  const [qualityRating, setQualityRating] = useState(0);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [abComparison, setAbComparison] = useState<"current" | "previous">("current");

  // Queries
  const gateQuery = trpc.gateReview.getGate.useQuery(
    { gateId },
    { enabled: !!user && !!gateId }
  );

  const stagesQuery = trpc.pipelineStage.getStages.useQuery(
    { pipelineRunId: runId },
    { enabled: !!user && !!runId }
  );

  const gatesForRunQuery = trpc.gateReview.getGatesForRun.useQuery(
    { pipelineRunId: runId },
    { enabled: !!user && !!runId }
  );

  // Mutations
  const utils = trpc.useUtils();

  const submitDecision = trpc.gateReview.submitDecision.useMutation({
    onSuccess: (data) => {
      if (data.decision === "approved") {
        toast.success("Stage approved! Pipeline advancing...");
      } else if (data.decision === "rejected") {
        toast.success("Stage rejected. Pipeline paused.");
      } else {
        toast.success("Regeneration requested. Please wait...");
      }
      utils.gateReview.getGate.invalidate({ gateId });
      utils.pipelineStage.getStages.invalidate({ pipelineRunId: runId });
      utils.gateReview.getGatesForRun.invalidate({ pipelineRunId: runId });
    },
    onError: (err) => toast.error(err.message),
  });

  const abortMut = trpc.pipelineStage.abort.useMutation({
    onSuccess: () => {
      toast.success("Pipeline aborted.");
      navigate(`/studio/project/${projectId}/pipeline`);
    },
    onError: (err) => toast.error(err.message),
  });

  const gate = gateQuery.data;
  const stages = stagesQuery.data || [];
  const allGates = gatesForRunQuery.data || [];

  // Map stages for stepper
  const stepperStages: StageInfo[] = useMemo(() => {
    if (stages.length === 0) {
      return Array.from({ length: 12 }, (_, i) => ({
        stageNumber: i + 1,
        stageName: STAGE_DISPLAY_NAMES[i + 1],
        status: "pending" as const,
      }));
    }
    return stages.map((s: any) => ({
      stageNumber: s.stageNumber,
      stageName: s.stageName,
      status: s.status,
      attempts: s.attempts,
      confidenceScore: allGates.find((g: any) => g.stageNumber === s.stageNumber)?.confidenceScore ?? undefined,
    }));
  }, [stages, allGates]);

  const confidenceDetails = gate?.confidenceDetails
    ? (typeof gate.confidenceDetails === "string"
        ? JSON.parse(gate.confidenceDetails)
        : gate.confidenceDetails)
    : [];

  const handleApprove = () => {
    submitDecision.mutate({
      gateId,
      decision: "approved",
      qualityScore: qualityRating > 0 ? qualityRating : undefined,
    });
  };

  const handleReject = () => {
    submitDecision.mutate({
      gateId,
      decision: "rejected",
      reason: rejectReason || undefined,
    });
    setShowRejectModal(false);
  };

  const handleRegenerate = () => {
    submitDecision.mutate({
      gateId,
      decision: "regenerate",
      reason: regenReason || undefined,
    });
    setShowRegenModal(false);
  };

  const handleStageClick = (stageNumber: number) => {
    const stageGate = allGates.find((g: any) => g.stageNumber === stageNumber);
    if (stageGate && stageGate.id !== gateId) {
      navigate(`/studio/project/${projectId}/pipeline/${runId}/gate/${stageGate.id}`);
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-accent-cyan" />
      </div>
    );
  }

  if (gateQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-accent-cyan mx-auto" />
          <p className="text-gray-400 text-sm">Loading gate review...</p>
        </div>
      </div>
    );
  }

  if (!gate) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
          <p className="text-gray-400">Gate not found</p>
          <AwakliButton variant="ghost" onClick={() => navigate(`/studio/project/${projectId}/pipeline`)}>
            Back to Pipeline
          </AwakliButton>
        </div>
      </div>
    );
  }

  const isPending = gate.decision === "pending";
  const mediaType = getMediaType(gate.stageNumber);

  return (
    <div className="flex flex-col h-full">
      {/* Top Bar */}
      <div className="border-b border-gray-800/50 bg-gray-900/50 backdrop-blur-sm px-6 py-3">
        <div className="flex items-center gap-4">
          <AwakliButton variant="ghost" size="sm" onClick={() => navigate(`/studio/project/${projectId}/pipeline`)}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Pipeline
          </AwakliButton>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <MediaIcon stageNumber={gate.stageNumber} />
              <div>
                <h1 className="text-lg font-bold text-white font-display truncate">
                  Stage {gate.stageNumber} of 12 — {STAGE_DISPLAY_NAMES[gate.stageNumber]}
                </h1>
                <p className="text-xs text-gray-500">
                  Gate: {gate.gateType} • {gate.decision === "pending" ? "Awaiting your decision" : gate.decision}
                </p>
              </div>
            </div>
          </div>

          {/* Confidence badge */}
          {gate.confidenceScore !== undefined && gate.confidenceScore !== null && (
            <ConfidenceBreakdown
              score={gate.confidenceScore}
              breakdown={Array.isArray(confidenceDetails) ? confidenceDetails : []}
              flags={[]}
              compact
            />
          )}

          {/* Gate type badge */}
          <AwakliiBadge variant={
            gate.gateType === "blocking" ? "error" :
            gate.gateType === "advisory" ? "warning" :
            "default"
          }>
            {gate.gateType}
          </AwakliiBadge>
        </div>
      </div>

      {/* Pipeline Stepper */}
      <div className="border-b border-gray-800/30 bg-gray-900/30 px-4">
        <PipelineStepper
          stages={stepperStages}
          currentStage={gate.stageNumber}
          onStageClick={handleStageClick}
          compact
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Generated Output */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Media Preview Card */}
          <AwakliCard className="overflow-hidden">
            {/* A/B comparison toggle for regenerated stages */}
            {gate.regenGenerationRequestId && (
              <div className="flex items-center gap-2 p-3 border-b border-gray-800/50 bg-gray-900/30">
                <span className="text-xs text-gray-400">Comparing:</span>
                <button
                  onClick={() => setAbComparison("current")}
                  className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                    abComparison === "current"
                      ? "bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/30"
                      : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  Current
                </button>
                <button
                  onClick={() => setAbComparison("previous")}
                  className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                    abComparison === "previous"
                      ? "bg-violet-500/20 text-violet-400 border border-violet-500/30"
                      : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  Previous
                </button>
              </div>
            )}

            <div className="relative aspect-video bg-black flex items-center justify-center">
              {mediaType === "image" && (
                <img
                  src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='450'%3E%3Crect fill='%23111' width='800' height='450'/%3E%3Ctext fill='%23555' x='400' y='225' text-anchor='middle' font-size='16'%3EGenerated image will appear here%3C/text%3E%3C/svg%3E"
                  alt="Generated output"
                  className="w-full h-full object-contain"
                />
              )}
              {mediaType === "video" && (
                <div className="text-center text-gray-500">
                  <Film className="w-16 h-16 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">Video preview</p>
                  <p className="text-xs text-gray-600 mt-1">Generated video will play here</p>
                </div>
              )}
              {mediaType === "audio" && (
                <div className="text-center text-gray-500 w-full px-8">
                  <Mic className="w-16 h-16 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">Audio preview</p>
                  <div className="mt-4 h-16 bg-gray-800/50 rounded-lg flex items-center justify-center">
                    <div className="flex items-end gap-0.5 h-8">
                      {Array.from({ length: 40 }, (_, i) => (
                        <div
                          key={i}
                          className="w-1 bg-accent-cyan/40 rounded-full"
                          style={{ height: `${Math.random() * 100}%` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {mediaType === "text" && (
                <div className="text-center text-gray-500">
                  <p className="text-sm">Stage output data</p>
                  <p className="text-xs text-gray-600 mt-1">Review the processed data below</p>
                </div>
              )}
            </div>
          </AwakliCard>

          {/* Quality Rating (optional) */}
          {isPending && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400">Quality rating (optional):</span>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <motion.button
                    key={star}
                    whileHover={{ scale: 1.2 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setQualityRating(star === qualityRating ? 0 : star)}
                    className="p-0.5"
                  >
                    <Star
                      className={`w-5 h-5 transition-colors ${
                        star <= qualityRating
                          ? "text-amber-400 fill-amber-400"
                          : "text-gray-600"
                      }`}
                    />
                  </motion.button>
                ))}
              </div>
              {qualityRating > 0 && (
                <span className="text-xs text-gray-500">{qualityRating}/5</span>
              )}
            </div>
          )}

          {/* Confidence Breakdown (full) */}
          {gate.confidenceScore !== undefined && gate.confidenceScore !== null && (
            <ConfidenceBreakdown
              score={gate.confidenceScore}
              breakdown={Array.isArray(confidenceDetails) ? confidenceDetails : []}
              flags={[]}
            />
          )}
        </div>

        {/* Reference Panel (collapsible sidebar) */}
        <AnimatePresence>
          {showReference && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="border-l border-gray-800/50 bg-gray-900/30 overflow-y-auto flex-shrink-0"
            >
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white">Reference</h3>
                  <button onClick={() => setShowReference(false)} className="text-gray-500 hover:text-white">
                    <PanelLeftClose className="w-4 h-4" />
                  </button>
                </div>

                {/* Character reference sheets */}
                <div className="space-y-2">
                  <h4 className="text-xs text-gray-500 uppercase tracking-wider">Character Sheets</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="aspect-square bg-gray-800/50 rounded-lg flex items-center justify-center text-gray-600 text-xs">
                      No ref
                    </div>
                  </div>
                </div>

                {/* Manga source panels */}
                <div className="space-y-2">
                  <h4 className="text-xs text-gray-500 uppercase tracking-wider">Manga Source</h4>
                  <div className="aspect-video bg-gray-800/50 rounded-lg flex items-center justify-center text-gray-600 text-xs">
                    Source panel
                  </div>
                </div>

                {/* Previous stage output */}
                <div className="space-y-2">
                  <h4 className="text-xs text-gray-500 uppercase tracking-wider">Previous Stage</h4>
                  <div className="aspect-video bg-gray-800/50 rounded-lg flex items-center justify-center text-gray-600 text-xs">
                    Previous output
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toggle reference panel */}
        {!showReference && (
          <button
            onClick={() => setShowReference(true)}
            className="flex-shrink-0 w-8 bg-gray-900/50 border-l border-gray-800/50 flex items-center justify-center text-gray-500 hover:text-white transition-colors"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Credit Panel */}
      <CreditPanel
        creditsSpentSoFar={Number(gate.creditsSpentSoFar) || 0}
        creditsToProceed={Number(gate.creditsToProceed) || 0}
        creditsToRegenerate={Number(gate.creditsToRegenerate) || 0}
        creditsSavedIfReject={Number(gate.creditsSavedIfReject) || 0}
      />

      {/* Action Bar */}
      {isPending && (
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="border-t border-gray-800/50 bg-[#0D0D1A] px-6 py-4"
        >
          <div className="flex items-center justify-center gap-4 max-w-3xl mx-auto">
            <AwakliButton
              variant="primary"
              size="lg"
              onClick={handleApprove}
              disabled={submitDecision.isPending}
            >
              {submitDecision.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
              ) : (
                <CheckCircle className="w-5 h-5 mr-2" />
              )}
              Approve
            </AwakliButton>

            <AwakliButton
              variant="secondary"
              size="lg"
              onClick={() => setShowRegenModal(true)}
              disabled={submitDecision.isPending}
            >
              <RefreshCw className="w-5 h-5 mr-2" />
              Regenerate
            </AwakliButton>

            <AwakliButton
              variant="danger"
              size="lg"
              onClick={() => setShowRejectModal(true)}
              disabled={submitDecision.isPending}
            >
              <XCircle className="w-5 h-5 mr-2" />
              Reject
            </AwakliButton>

            <div className="w-px h-8 bg-gray-700/50" />

            <AwakliButton
              variant="ghost"
              size="lg"
              onClick={() => setShowAbortModal(true)}
              disabled={submitDecision.isPending}
              className="text-gray-500"
            >
              <OctagonX className="w-5 h-5 mr-2" />
              Abort
            </AwakliButton>
          </div>
        </motion.div>
      )}

      {/* Decision already made */}
      {!isPending && (
        <div className="border-t border-gray-800/50 bg-[#0D0D1A] px-6 py-4">
          <div className="flex items-center justify-center gap-3">
            <AwakliiBadge variant={
              gate.decision === "approved" || gate.decision === "auto_approved" ? "success" :
              gate.decision === "rejected" || gate.decision === "auto_rejected" ? "error" :
              "warning"
            }>
              {gate.decision}
            </AwakliiBadge>
            <span className="text-sm text-gray-400">
              Decision by {gate.decisionSource} {gate.decisionAt ? `at ${new Date(gate.decisionAt).toLocaleString()}` : ""}
            </span>
            {gate.decisionReason && (
              <span className="text-sm text-gray-500">— {gate.decisionReason}</span>
            )}
          </div>
        </div>
      )}

      {/* Regenerate Modal */}
      <Dialog open={showRegenModal} onOpenChange={setShowRegenModal}>
        <DialogContent className="bg-[#0D0D1A] border border-gray-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white font-display">Regenerate Stage</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <p className="text-sm text-gray-400">
              This will regenerate {STAGE_DISPLAY_NAMES[gate.stageNumber]} using the same parameters.
              Credits will be charged for the new generation.
            </p>
            <textarea
              value={regenReason}
              onChange={(e) => setRegenReason(e.target.value)}
              placeholder="Optional: describe what to improve..."
              className="w-full p-3 bg-gray-900/50 border border-gray-700/50 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-accent-cyan resize-none"
              rows={3}
            />
          </div>
          <DialogFooter>
            <AwakliButton variant="ghost" onClick={() => setShowRegenModal(false)}>Cancel</AwakliButton>
            <AwakliButton variant="secondary" onClick={handleRegenerate} disabled={submitDecision.isPending}>
              {submitDecision.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Regenerate
            </AwakliButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Modal */}
      <Dialog open={showRejectModal} onOpenChange={setShowRejectModal}>
        <DialogContent className="bg-[#0D0D1A] border border-gray-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white font-display">Reject Stage</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <p className="text-sm text-gray-400">
              Rejecting will pause the pipeline. You can resume later or abort.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Optional: reason for rejection..."
              className="w-full p-3 bg-gray-900/50 border border-gray-700/50 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-accent-cyan resize-none"
              rows={3}
            />
          </div>
          <DialogFooter>
            <AwakliButton variant="ghost" onClick={() => setShowRejectModal(false)}>Cancel</AwakliButton>
            <AwakliButton variant="danger" onClick={handleReject} disabled={submitDecision.isPending}>
              {submitDecision.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <XCircle className="w-4 h-4 mr-2" />}
              Reject
            </AwakliButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Abort Confirmation Modal */}
      <Dialog open={showAbortModal} onOpenChange={setShowAbortModal}>
        <DialogContent className="bg-[#0D0D1A] border border-gray-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white font-display">Abort Pipeline?</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-400">
              This will abort the entire pipeline run. All pending credit holds will be released.
              This action cannot be undone.
            </p>
          </div>
          <DialogFooter>
            <AwakliButton variant="ghost" onClick={() => setShowAbortModal(false)}>Cancel</AwakliButton>
            <AwakliButton
              variant="danger"
              onClick={() => {
                abortMut.mutate({ pipelineRunId: runId, reason: "Creator aborted from gate review" });
                setShowAbortModal(false);
              }}
              disabled={abortMut.isPending}
            >
              {abortMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <OctagonX className="w-4 h-4 mr-2" />}
              Abort Pipeline
            </AwakliButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
