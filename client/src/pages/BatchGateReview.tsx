/**
 * BatchGateReview — Review auto-advanced gates in batch mode (Prompt 17 §11.5)
 *
 * Route: /studio/project/:projectId/pipeline/:runId/batch-review
 *
 * Shows all auto-advanced gates that can still be retroactively rejected
 * within the 1-hour review window. Creator can flip through them and
 * reject any, which triggers cascade rewind.
 */

import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { AwakliButton } from "@/components/awakli/AwakliButton";
import { AwakliCard } from "@/components/awakli/AwakliCard";
import { AwakliiBadge } from "@/components/awakli/AwakliiBadge";
import { ConfidenceBadge } from "@/components/awakli/ConfidenceBreakdown";
import {
  CheckCircle, XCircle, ChevronLeft, ChevronRight,
  Loader2, ArrowLeft, AlertTriangle, Clock, Undo2
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

export default function BatchGateReview() {
  const { user } = useAuth();
  const params = useParams<{ projectId: string; runId: string }>();
  const projectId = Number(params.projectId);
  const runId = Number(params.runId);
  const [, navigate] = useLocation();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [showRewindModal, setShowRewindModal] = useState(false);
  const [rewindTargetGate, setRewindTargetGate] = useState<any>(null);

  // Query auto-advanced gates for this run
  const batchQuery = trpc.batchReview.getReviewableGates.useQuery(
    undefined,
    { enabled: !!user }
  );

  const rewindMut = trpc.cascadeRewind.rewind.useMutation({
    onSuccess: (data: any) => {
      toast.success(`Rewound to Stage ${data.rewindToStage}. ${data.stagesInvalidated} stages invalidated, ${data.creditsReleased?.toFixed(1) || 0} credits released.`);
      batchQuery.refetch();
      setShowRewindModal(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const gates = batchQuery.data || [];
  const currentGate = gates[currentIndex];

  const timeRemaining = useMemo(() => {
    if (!currentGate?.decisionAt) return null;
    const decisionTime = new Date(currentGate.decisionAt).getTime();
    const reviewWindow = 60 * 60 * 1000; // 1 hour
    const remaining = (decisionTime + reviewWindow) - Date.now();
    if (remaining <= 0) return "Expired";
    const mins = Math.floor(remaining / 60000);
    return `${mins}m remaining`;
  }, [currentGate]);

  const handleRewind = (gate: any) => {
    setRewindTargetGate(gate);
    setShowRewindModal(true);
  };

  const confirmRewind = () => {
    if (!rewindTargetGate) return;
    rewindMut.mutate({
      pipelineRunId: runId,
      rewindToStage: rewindTargetGate.stageNumber,
    });
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-accent-cyan" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <AwakliButton variant="ghost" size="sm" onClick={() => navigate(`/studio/project/${projectId}/pipeline`)}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Pipeline
        </AwakliButton>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white font-display">Batch Review</h1>
          <p className="text-gray-400 text-sm mt-1">
            {gates.length} auto-advanced gate{gates.length !== 1 ? "s" : ""} to review
          </p>
        </div>
        <AwakliiBadge variant="warning">
          <Clock className="w-3 h-3 mr-1" />
          Review Window
        </AwakliiBadge>
      </div>

      {batchQuery.isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 animate-spin text-accent-cyan" />
        </div>
      ) : gates.length === 0 ? (
        <AwakliCard className="p-12 text-center">
          <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-white">All caught up!</h2>
          <p className="text-gray-400 text-sm mt-2">
            No auto-advanced gates need review right now.
          </p>
        </AwakliCard>
      ) : (
        <>
          {/* Navigation */}
          <div className="flex items-center justify-between">
            <AwakliButton
              variant="ghost"
              size="sm"
              onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
              disabled={currentIndex === 0}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Previous
            </AwakliButton>
            <span className="text-sm text-gray-400">
              {currentIndex + 1} of {gates.length}
            </span>
            <AwakliButton
              variant="ghost"
              size="sm"
              onClick={() => setCurrentIndex(Math.min(gates.length - 1, currentIndex + 1))}
              disabled={currentIndex === gates.length - 1}
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </AwakliButton>
          </div>

          {/* Current Gate Card */}
          {currentGate && (
            <AnimatePresence mode="wait">
              <motion.div
                key={currentGate.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <AwakliCard className="overflow-hidden">
                  {/* Gate header */}
                  <div className="p-4 border-b border-gray-800/50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-white font-bold">
                        Stage {currentGate.stageNumber} — {STAGE_DISPLAY_NAMES[currentGate.stageNumber]}
                      </span>
                      <ConfidenceBadge score={currentGate.confidenceScore || 0} />
                    </div>
                    <div className="flex items-center gap-2">
                      <AwakliiBadge variant="success">Auto-approved</AwakliiBadge>
                      {timeRemaining && (
                        <span className="text-xs text-amber-400">
                          <Clock className="w-3 h-3 inline mr-1" />
                          {timeRemaining}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Preview area */}
                  <div className="aspect-video bg-black flex items-center justify-center">
                    <div className="text-center text-gray-500">
                      <p className="text-sm">Auto-approved output preview</p>
                      <p className="text-xs text-gray-600 mt-1">
                        Score: {currentGate.confidenceScore} — Decision: {currentGate.decisionSource}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                      Looks good — no action needed
                    </div>
                    <AwakliButton
                      variant="danger"
                      size="sm"
                      onClick={() => handleRewind(currentGate)}
                    >
                      <Undo2 className="w-4 h-4 mr-1" />
                      Reject & Rewind
                    </AwakliButton>
                  </div>
                </AwakliCard>
              </motion.div>
            </AnimatePresence>
          )}

          {/* Gate list overview */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {gates.map((gate: any, idx: number) => (
              <motion.button
                key={gate.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setCurrentIndex(idx)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  idx === currentIndex
                    ? "border-accent-cyan bg-accent-cyan/5"
                    : "border-gray-800/50 bg-gray-900/30 hover:border-gray-700"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-white">
                    Stage {gate.stageNumber}
                  </span>
                  <ConfidenceBadge score={gate.confidenceScore || 0} />
                </div>
                <p className="text-[11px] text-gray-500 truncate">
                  {STAGE_DISPLAY_NAMES[gate.stageNumber]}
                </p>
              </motion.button>
            ))}
          </div>
        </>
      )}

      {/* Cascade Rewind Confirmation Modal */}
      <Dialog open={showRewindModal} onOpenChange={setShowRewindModal}>
        <DialogContent className="bg-[#0D0D1A] border border-gray-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white font-display flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              Cascade Rewind
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <p className="text-sm text-gray-400">
              Rejecting Stage {rewindTargetGate?.stageNumber} ({STAGE_DISPLAY_NAMES[rewindTargetGate?.stageNumber]}) will:
            </p>
            <ul className="text-sm text-gray-300 space-y-2 pl-4">
              <li className="flex items-start gap-2">
                <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                Invalidate all downstream stages ({rewindTargetGate?.stageNumber + 1}–12)
              </li>
              <li className="flex items-start gap-2">
                <Undo2 className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                Release credit holds for invalidated stages
              </li>
              <li className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                Re-execute stages after you approve the regenerated result
              </li>
            </ul>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
              <p className="text-xs text-amber-400 font-medium">
                This is an expensive operation. Downstream stages will need to be re-generated.
              </p>
            </div>
          </div>
          <DialogFooter>
            <AwakliButton variant="ghost" onClick={() => setShowRewindModal(false)}>Cancel</AwakliButton>
            <AwakliButton variant="danger" onClick={confirmRewind} disabled={rewindMut.isPending}>
              {rewindMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Undo2 className="w-4 h-4 mr-2" />}
              Confirm Rewind
            </AwakliButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
