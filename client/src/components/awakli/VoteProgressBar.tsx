import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, Trophy, Sparkles, ArrowUp } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface VoteProgressBarProps {
  projectId: number;
  compact?: boolean; // For card-level mini version
  className?: string;
}

export function VoteProgressBar({ projectId, compact = false, className = "" }: VoteProgressBarProps) {
  const { data, isLoading } = trpc.voteProgress.get.useQuery({ projectId });
  const [showConfetti, setShowConfetti] = useState(false);
  const prevPercentage = useRef(0);

  useEffect(() => {
    if (data && data.percentage >= 100 && prevPercentage.current < 100) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 4000);
    }
    if (data) prevPercentage.current = data.percentage;
  }, [data?.percentage]);

  if (isLoading || !data) {
    if (compact) return <div className="h-2 bg-white/10 rounded-full animate-pulse" />;
    return <div className="h-8 bg-white/10 rounded-full animate-pulse" />;
  }

  const { totalVotes, threshold, percentage, isEligible, animeStatus } = data;
  const isNearThreshold = percentage >= 80 && percentage < 100;
  const isReached = percentage >= 100;
  const isInProduction = animeStatus === "in_production";
  const isCompleted = animeStatus === "completed";

  // Compact version for cards
  if (compact) {
    return (
      <div className={`space-y-1 ${className}`}>
        <div className="flex items-center justify-between text-xs">
          <span className={`font-medium ${isNearThreshold ? "text-[#00F0FF]" : "text-white/60"}`}>
            {totalVotes}/{threshold}
          </span>
          <span className={`${isNearThreshold ? "text-[#00F0FF] font-semibold" : "text-white/40"}`}>
            {percentage}%
          </span>
        </div>
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 1, ease: "easeOut" }}
            className={`h-full rounded-full ${
              isReached
                ? "bg-gradient-to-r from-amber-400 to-yellow-300"
                : isNearThreshold
                  ? "bg-gradient-to-r from-[#00F0FF] to-[#6B5BFF]"
                  : "bg-gradient-to-r from-[#00F0FF]/60 to-[#6B5BFF]/60"
            }`}
          />
        </div>
      </div>
    );
  }

  // Full version
  return (
    <div className={`relative ${className}`}>
      {/* Confetti effect */}
      <AnimatePresence>
        {showConfetti && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
            {Array.from({ length: 30 }).map((_, i) => (
              <motion.div
                key={i}
                initial={{
                  x: "50%",
                  y: "50%",
                  scale: 0,
                  opacity: 1,
                }}
                animate={{
                  x: `${Math.random() * 100}%`,
                  y: `${-50 + Math.random() * 150}%`,
                  scale: [0, 1, 0.5],
                  opacity: [1, 1, 0],
                  rotate: Math.random() * 720,
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: 2 + Math.random() * 2, delay: Math.random() * 0.5 }}
                className="absolute w-2 h-2 rounded-sm"
                style={{
                  backgroundColor: ["#6B5BFF", "#FFD700", "#B388FF", "#00D4FF", "#A855F7"][i % 5],
                }}
              />
            ))}
          </div>
        )}
      </AnimatePresence>

      {/* Status message */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isCompleted ? (
            <>
              <Trophy className="w-5 h-5 text-amber-400" />
              <span className="text-amber-400 font-semibold">Anime Complete!</span>
            </>
          ) : isInProduction ? (
            <>
              <Sparkles className="w-5 h-5 text-cyan-400 animate-pulse" />
              <span className="text-cyan-400 font-semibold">Anime in Production</span>
            </>
          ) : isReached ? (
            <>
              <Trophy className="w-5 h-5 text-amber-400" />
              <span className="text-amber-400 font-bold">Voted for Anime! Production begins soon.</span>
            </>
          ) : isNearThreshold ? (
            <>
              <Flame className="w-5 h-5 text-[#00F0FF] animate-pulse" />
              <span className="text-[#00F0FF] font-semibold">Almost there! This manga is close to becoming anime!</span>
            </>
          ) : (
            <>
              <ArrowUp className="w-4 h-4 text-white/50" />
              <span className="text-white/60 text-sm">Vote to help this manga become anime</span>
            </>
          )}
        </div>
        <span className={`text-sm font-mono ${
          isReached ? "text-amber-400" : isNearThreshold ? "text-[#00F0FF]" : "text-white/50"
        }`}>
          {percentage}%
        </span>
      </div>

      {/* Progress bar */}
      <div className={`relative h-4 rounded-full overflow-hidden ${
        isReached ? "bg-amber-900/30" : "bg-white/10"
      }`}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 1.5, ease: "easeOut" }}
          className={`h-full rounded-full relative ${
            isReached
              ? "bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-300"
              : isNearThreshold
                ? "bg-gradient-to-r from-[#00F0FF] to-[#6B5BFF]"
                : "bg-gradient-to-r from-[#00F0FF]/70 to-[#6B5BFF]/70"
          }`}
        >
          {/* Shimmer effect at leading edge */}
          {!isReached && percentage > 0 && (
            <motion.div
              animate={{ x: ["-100%", "200%"] }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 w-1/3 bg-gradient-to-r from-transparent via-white/30 to-transparent"
            />
          )}
          {/* Gold shimmer for reached state */}
          {isReached && (
            <motion.div
              animate={{ x: ["-100%", "200%"] }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 w-1/4 bg-gradient-to-r from-transparent via-white/40 to-transparent"
            />
          )}
        </motion.div>

        {/* Pulsing glow for near-threshold */}
        {isNearThreshold && (
          <motion.div
            animate={{ opacity: [0.3, 0.7, 0.3] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute inset-0 rounded-full"
            style={{
              boxShadow: "0 0 20px rgba(107,91,255,0.5), inset 0 0 20px rgba(107,91,255,0.2)",
            }}
          />
        )}
      </div>

      {/* Vote count label */}
      <div className="flex items-center justify-between mt-1.5">
        <span className={`text-sm ${
          isReached ? "text-amber-400/80" : "text-white/40"
        }`}>
          {totalVotes.toLocaleString()} / {threshold.toLocaleString()} votes for anime
        </span>
        {!isReached && totalVotes > 0 && (
          <span className="text-xs text-white/30">
            {(threshold - totalVotes).toLocaleString()} more needed
          </span>
        )}
      </div>
    </div>
  );
}

// ─── First-Time Voter Explainer Modal ──────────────────────────────────

interface FirstVoterModalProps {
  open: boolean;
  onClose: () => void;
  onVote: () => void;
}

export function FirstVoterModal({ open, onClose, onVote }: FirstVoterModalProps) {
  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-[#1A1A2E] border border-white/10 rounded-2xl p-8 max-w-md mx-4 text-center"
          >
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-[#00F0FF] to-[#6B5BFF] flex items-center justify-center">
              <Trophy className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Your Vote Matters!</h3>
            <p className="text-white/60 mb-6 leading-relaxed">
              On Awakli, your votes decide which manga become anime series.
              Vote for the stories you want to see animated!
              When a manga reaches the vote threshold, it earns anime conversion.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={onClose}
                className="px-5 py-2.5 rounded-lg border border-white/10 text-white/60 hover:text-white hover:border-white/20 transition-colors"
              >
                Got it
              </button>
              <button
                onClick={() => { onVote(); onClose(); }}
                className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-[#00F0FF] to-[#6B5BFF] text-white font-semibold hover:shadow-lg hover:shadow-[#6B5BFF]/25 transition-all"
              >
                Cast My Vote
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Enhanced Vote Button ──────────────────────────────────────────────

interface EnhancedVoteButtonProps {
  episodeId: number;
  size?: "sm" | "md" | "lg";
  showCount?: boolean;
  className?: string;
}

export function EnhancedVoteButton({ episodeId, size = "md", showCount = true, className = "" }: EnhancedVoteButtonProps) {
  const utils = trpc.useUtils();
  const { data: voteData } = trpc.voting.get.useQuery({ episodeId });
  const castVote = trpc.voting.cast.useMutation({
    onSuccess: (result) => {
      utils.voting.get.invalidate({ episodeId });
      if (result.promoted) {
        toast.success("🎉 Anime Unlocked! This manga has reached the vote threshold and will become anime!");
      } else if (result.votesRemaining > 0) {
        toast.success(`Vote counted! ${result.votesRemaining.toLocaleString()} more votes until this becomes anime.`);
      }
    },
  });
  const removeVote = trpc.voting.remove.useMutation({
    onSuccess: () => {
      utils.voting.get.invalidate({ episodeId });
    },
  });

  const [showFirstVoterModal, setShowFirstVoterModal] = useState(false);
  const hasVotedBefore = useRef(false);

  const isUpvoted = voteData?.userVote === "up";
  const upvoteCount = voteData?.upvotes ?? 0;

  const handleVote = () => {
    if (!hasVotedBefore.current && !isUpvoted && !localStorage.getItem("awakli_has_voted")) {
      setShowFirstVoterModal(true);
      return;
    }
    doVote();
  };

  const doVote = () => {
    hasVotedBefore.current = true;
    localStorage.setItem("awakli_has_voted", "true");
    if (isUpvoted) {
      removeVote.mutate({ episodeId });
    } else {
      castVote.mutate({ episodeId, voteType: "up" });
    }
  };

  const sizeClasses = {
    sm: "px-2.5 py-1 text-xs gap-1",
    md: "px-3.5 py-2 text-sm gap-1.5",
    lg: "px-5 py-3 text-base gap-2",
  };

  const iconSizes = { sm: "w-3.5 h-3.5", md: "w-4 h-4", lg: "w-5 h-5" };

  return (
    <>
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={handleVote}
        disabled={castVote.isPending || removeVote.isPending}
        title="Vote to help this manga become anime"
        className={`
          inline-flex items-center rounded-lg font-medium transition-all
          ${sizeClasses[size]}
          ${isUpvoted
            ? "bg-[#6B5BFF] text-white shadow-lg shadow-[#6B5BFF]/25"
            : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white border border-white/10"
          }
          disabled:opacity-50
          ${className}
        `}
      >
        <ArrowUp className={`${iconSizes[size]} ${isUpvoted ? "fill-current" : ""}`} />
        {showCount && <span>{upvoteCount}</span>}
      </motion.button>

      <FirstVoterModal
        open={showFirstVoterModal}
        onClose={() => setShowFirstVoterModal(false)}
        onVote={doVote}
      />
    </>
  );
}
