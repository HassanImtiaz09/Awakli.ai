import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { AwakliButton } from "@/components/awakli/AwakliButton";
import { AwakliCard } from "@/components/awakli/AwakliCard";
import { AwakliiBadge } from "@/components/awakli/AwakliiBadge";
import {
  CheckCircle, XCircle, AlertTriangle, Play, Loader2,
  ArrowLeft, Send, Film, Mic, Music, Layers, Clapperboard
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const ISSUE_TYPES = [
  { id: "visual" as const, label: "Visual Artifact", icon: Film, desc: "Visual glitches, flickering, or distortion" },
  { id: "audio" as const, label: "Audio Quality", icon: Mic, desc: "Voice sounds unnatural or doesn't match character" },
  { id: "sync" as const, label: "Sync Issue", icon: Layers, desc: "Audio/visual sync issues, lip sync, or pacing problems" },
  { id: "quality" as const, label: "Quality Issue", icon: Music, desc: "Background music mismatch or general quality problem" },
  { id: "other" as const, label: "Other", icon: AlertTriangle, desc: "Other issue not listed above" },
];

type IssueType = "visual" | "audio" | "sync" | "quality" | "other";

export default function QAReview() {
  const { user } = useAuth();
  const params = useParams<{ projectId: string; runId: string }>();
  const projectId = Number(params.projectId);
  const runId = Number(params.runId);
  const [, navigate] = useLocation();

  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedIssues, setSelectedIssues] = useState<Set<IssueType>>(new Set());
  const [otherDescription, setOtherDescription] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);

  // Queries
  const runQuery = trpc.pipeline.getStatus.useQuery(
    { runId },
    { enabled: !!user && !!runId }
  );

  const assetsQuery = trpc.pipeline.getAssets.useQuery(
    { runId },
    { enabled: !!user && !!runId }
  );

  // Mutations
  const approveMut = trpc.pipeline.approve.useMutation({
    onSuccess: () => {
      toast.success("Episode approved and published!");
      navigate(`/studio/${projectId}/pipeline`);
    },
    onError: (err) => toast.error(err.message),
  });

  const rejectMut = trpc.pipeline.reject.useMutation({
    onSuccess: () => {
      toast.success("Issues flagged. Pipeline nodes will be re-processed.");
      setShowRejectModal(false);
      navigate(`/studio/${projectId}/pipeline`);
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleIssue = (issue: IssueType) => {
    const next = new Set(selectedIssues);
    if (next.has(issue)) next.delete(issue);
    else next.add(issue);
    setSelectedIssues(next);
  };

  const handleReject = () => {
    if (selectedIssues.size === 0) {
      toast.error("Please select at least one issue type");
      return;
    }
    const issues = Array.from(selectedIssues).map((type) => ({
      type,
      description: type === "other" ? otherDescription : "",
    }));
    rejectMut.mutate({ runId, issues });
  };

  const run = runQuery.data;
  const assets = assetsQuery.data || [];
  const assemblyAssets = assets.filter((a: any) => String(a.assetType) === "final_video" || String(a.assetType) === "thumbnail");
  const finalVideo = assemblyAssets.find((a: any) => String(a.assetType) === "final_video");

  if (!user) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-accent-cyan" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <AwakliButton variant="ghost" size="sm" onClick={() => navigate(`/studio/${projectId}/pipeline`)}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Pipeline
        </AwakliButton>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white font-display">QA Review</h1>
          <p className="text-gray-400 text-sm mt-1">
            Pipeline Run #{runId} — Review the assembled episode before publishing
          </p>
        </div>
        {run && (
          <AwakliiBadge variant={run.status === "completed" ? "success" : run.status === "failed" ? "error" : "cyan"}>
            {String(run.status)}
          </AwakliiBadge>
        )}
      </div>

      {/* Video Player */}
      <AwakliCard className="overflow-hidden">
        <div className="relative aspect-video bg-black">
          {finalVideo?.url ? (
            <div className="relative w-full h-full">
              {/* Since we're using image gen as proxy, show the final assembled image/video */}
              <img
                src={finalVideo.url}
                alt="Assembled episode"
                className="w-full h-full object-contain"
              />
              {!isPlaying && (
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setIsPlaying(true)}
                  className="absolute inset-0 flex items-center justify-center bg-black/40"
                >
                  <div className="w-20 h-20 rounded-full bg-accent-pink/90 flex items-center justify-center">
                    <Play className="w-8 h-8 text-white ml-1" />
                  </div>
                </motion.button>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <Film className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No assembled video available yet</p>
                <p className="text-sm mt-1">Complete the pipeline to generate the final video</p>
              </div>
            </div>
          )}
        </div>

        {/* Player info bar */}
        {run && (
          <div className="p-4 border-t border-gray-800/50 flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm text-gray-400">
              <span>Episode Pipeline #{run.id}</span>
              {run.totalCost && (
                <span className="text-accent-cyan">
                  Cost: ${(Number(run.totalCost) / 100).toFixed(2)}
                </span>
              )}
            </div>
            <div className="text-sm text-gray-400">
              {assets.length} assets generated
            </div>
          </div>
        )}
      </AwakliCard>

      {/* Asset Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { type: "video_clip", label: "Video Clips", icon: Film, color: "cyan" },
          { type: "voice_clip", label: "Voice Clips", icon: Mic, color: "pink" },
          { type: "lip_sync_clip", label: "Lip Sync", icon: Layers, color: "gold" },
          { type: "music_segment", label: "Music", icon: Music, color: "success" },
          { type: "final_video", label: "Final", icon: Clapperboard, color: "cyan" },
        ].map(({ type, label, icon: Icon, color }) => {
          const count = assets.filter((a: any) => String(a.assetType) === type).length;
          return (
            <AwakliCard key={type} className="p-4 text-center">
              <Icon className="w-6 h-6 mx-auto mb-2 text-gray-400" />
              <p className="text-2xl font-bold text-white">{count}</p>
              <p className="text-xs text-gray-400">{label}</p>
            </AwakliCard>
          );
        })}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-4 justify-center py-4">
        <AwakliButton
          variant="primary"
          size="lg"
          onClick={() => approveMut.mutate({ runId })}
          disabled={approveMut.isPending}
        >
          {approveMut.isPending ? (
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
          ) : (
            <CheckCircle className="w-5 h-5 mr-2" />
          )}
          Approve & Publish
        </AwakliButton>

        <AwakliButton
          variant="secondary"
          size="lg"
          onClick={() => setShowRejectModal(true)}
          disabled={rejectMut.isPending}
        >
          <AlertTriangle className="w-5 h-5 mr-2" />
          Request Changes
        </AwakliButton>
      </div>

      {/* Reject / Request Changes Modal */}
      <Dialog open={showRejectModal} onOpenChange={setShowRejectModal}>
        <DialogContent className="bg-[#0D0D1A] border border-gray-800 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white font-display">Flag Issues for Re-Processing</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-4">
            <p className="text-sm text-gray-400 mb-4">
              Select the issue types to flag. Affected pipeline nodes will be re-processed.
            </p>

            {ISSUE_TYPES.map(({ id, label, icon: Icon, desc }) => (
              <motion.button
                key={id}
                whileTap={{ scale: 0.98 }}
                onClick={() => toggleIssue(id)}
                className={`w-full flex items-start gap-3 p-3 rounded-lg border transition-all text-left ${
                  selectedIssues.has(id)
                    ? "border-accent-pink bg-accent-pink/10"
                    : "border-gray-700/50 bg-gray-800/30 hover:border-gray-600"
                }`}
              >
                <div className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center ${
                  selectedIssues.has(id)
                    ? "bg-accent-pink border-accent-pink"
                    : "border-gray-600"
                }`}>
                  {selectedIssues.has(id) && (
                    <CheckCircle className="w-3 h-3 text-white" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-gray-400" />
                    <span className="text-white font-medium text-sm">{label}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{desc}</p>
                </div>
              </motion.button>
            ))}

            {/* Other description textarea */}
            <AnimatePresence>
              {selectedIssues.has("other") && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <textarea
                    value={otherDescription}
                    onChange={(e) => setOtherDescription(e.target.value)}
                    placeholder="Describe the issue..."
                    className="w-full mt-2 p-3 bg-gray-900/50 border border-gray-700/50 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-accent-cyan resize-none"
                    rows={3}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <DialogFooter>
            <AwakliButton variant="ghost" onClick={() => setShowRejectModal(false)}>
              Cancel
            </AwakliButton>
            <AwakliButton
              variant="primary"
              onClick={handleReject}
              disabled={rejectMut.isPending || selectedIssues.size === 0}
            >
              {rejectMut.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Submit Issues ({selectedIssues.size})
            </AwakliButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
