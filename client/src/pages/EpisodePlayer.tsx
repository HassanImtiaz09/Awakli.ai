import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useLocation, useParams } from "wouter";
import { toast } from "sonner";
import {
  Play, Pause, SkipForward, SkipBack, ChevronLeft, ChevronRight,
  ThumbsUp, ThumbsDown, MessageSquare, Share2, Maximize, Minimize,
  ArrowLeft, Film, Clock, Eye, BookOpen, Send, Trash2, ChevronDown
} from "lucide-react";

// ─── Typewriter Effect ─────────────────────────────────────────────────────
function TypewriterText({ text, speed = 40 }: { text: string; speed?: number }) {
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    setDisplayed("");
    let i = 0;
    const timer = setInterval(() => {
      if (i < text.length) {
        setDisplayed(text.slice(0, i + 1));
        i++;
      } else {
        clearInterval(timer);
      }
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed]);
  return <span>{displayed}<span className="animate-pulse">|</span></span>;
}

// ─── Panel type ────────────────────────────────────────────────────────────
interface PanelData {
  id: number;
  sceneNumber: number;
  panelNumber: number;
  imageUrl: string | null;
  rawImageUrl?: string | null;
  visualDescription: string | null;
  cameraAngle: string | null;
  dialogue: unknown;
  sfx: string | null;
  transition: string | null;
}

export default function EpisodePlayer() {
  const params = useParams<{ slug: string; episodeNumber: string }>();
  const slug = params.slug || "";
  const episodeNumber = parseInt(params.episodeNumber || "1", 10);
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  // Fetch episode data via watch.project to get episode list, then find the right episode
  const projectQuery = trpc.watch.project.useQuery({ slug }, { enabled: !!slug });
  const project = projectQuery.data;
  const episodes = project?.episodes ?? [];
  const currentEpisode = episodes.find((ep: any) => ep.episodeNumber === episodeNumber);

  const storyboard = trpc.watch.storyboard.useQuery(
    { episodeId: currentEpisode?.id ?? 0 },
    { enabled: !!currentEpisode?.id }
  );

  const panels: PanelData[] = (storyboard.data?.panels ?? []) as PanelData[];

  // Player state
  const [currentPanel, setCurrentPanel] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const controlsTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const playerRef = useRef<HTMLDivElement>(null);

  // Auto-advance
  useEffect(() => {
    if (!isPlaying || panels.length === 0) return;
    const timer = setInterval(() => {
      setCurrentPanel((prev) => {
        if (prev >= panels.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 4000);
    return () => clearInterval(timer);
  }, [isPlaying, panels.length]);

  // Auto-hide controls
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  useEffect(() => {
    resetControlsTimer();
    return () => { if (controlsTimer.current) clearTimeout(controlsTimer.current); };
  }, [resetControlsTimer]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case "ArrowRight": setCurrentPanel((p) => Math.min(p + 1, panels.length - 1)); break;
        case "ArrowLeft": setCurrentPanel((p) => Math.max(p - 1, 0)); break;
        case " ": e.preventDefault(); setIsPlaying((p) => !p); break;
        case "f": toggleFullscreen(); break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [panels.length]);

  const toggleFullscreen = () => {
    if (!playerRef.current) return;
    if (!document.fullscreenElement) {
      playerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const panel = panels[currentPanel];
  const dialogue = panel?.dialogue as Array<{ character: string; text: string; emotion: string }> | null;

  // Navigation
  const prevEpisode = episodes.find((ep: any) => ep.episodeNumber === episodeNumber - 1);
  const nextEpisode = episodes.find((ep: any) => ep.episodeNumber === episodeNumber + 1);

  if (projectQuery.isLoading || storyboard.isLoading) {
    return (
      <div className="min-h-screen bg-bg-void flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full border-2 border-accent-pink/30 border-t-accent-pink animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading episode...</p>
        </div>
      </div>
    );
  }

  if (!currentEpisode || !project) {
    return (
      <div className="min-h-screen bg-bg-void flex items-center justify-center">
        <div className="text-center">
          <Film className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h1 className="text-2xl font-display font-bold text-white mb-2">Episode Not Found</h1>
          <Link href={`/watch/${slug}`}>
            <button className="px-6 py-3 rounded-xl bg-accent-pink text-white font-semibold mt-4">
              Back to Project
            </button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-void text-white">
      {/* Player */}
      <div
        ref={playerRef}
        className="relative bg-black aspect-video max-h-[75vh] w-full overflow-hidden cursor-pointer"
        onMouseMove={resetControlsTimer}
        onClick={() => { if (panels.length > 0) setIsPlaying((p) => !p); }}
      >
        {/* Panel display */}
        <AnimatePresence mode="wait">
          {panel?.imageUrl ? (
            <motion.img
              key={panel.id}
              src={panel.imageUrl}
              alt={panel.visualDescription || "Panel"}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
              className="absolute inset-0 w-full h-full object-contain"
            />
          ) : (
            <motion.div
              key="placeholder"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-surface-1 to-surface-2"
            >
              <div className="text-center">
                <BookOpen className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400">{panels.length === 0 ? "No panels generated yet" : "Panel image not available"}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dialogue overlay */}
        {dialogue && dialogue.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute bottom-20 left-1/2 -translate-x-1/2 max-w-2xl w-full px-4"
          >
            <div className="bg-black/80 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              {dialogue.map((d, i) => (
                <div key={i} className="mb-1 last:mb-0">
                  <span className="text-accent-pink font-semibold text-sm">{d.character}: </span>
                  <span className="text-white text-sm">
                    {isPlaying ? <TypewriterText text={d.text} /> : d.text}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* SFX overlay */}
        {panel?.sfx && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute top-8 right-8 px-4 py-2 bg-accent-pink/80 rounded-lg font-display font-bold text-lg transform rotate-[-5deg]"
          >
            {panel.sfx}
          </motion.div>
        )}

        {/* Controls overlay */}
        <AnimatePresence>
          {showControls && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30 pointer-events-none"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Top bar */}
              <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between pointer-events-auto">
                <button
                  onClick={(e) => { e.stopPropagation(); navigate(`/watch/${slug}`); }}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/40 text-white hover:bg-black/60 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span className="text-sm">{project.title}</span>
                </button>
                <span className="text-sm text-gray-300 bg-black/40 px-3 py-1.5 rounded-lg">
                  Ep {episodeNumber}: {currentEpisode.title}
                </span>
              </div>

              {/* Bottom controls */}
              <div className="absolute bottom-0 left-0 right-0 p-4 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
                {/* Progress bar */}
                <div className="w-full h-1.5 bg-white/20 rounded-full mb-3 cursor-pointer"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pct = (e.clientX - rect.left) / rect.width;
                    setCurrentPanel(Math.round(pct * (panels.length - 1)));
                  }}
                >
                  <div
                    className="h-full bg-gradient-to-r from-accent-pink to-accent-cyan rounded-full transition-all duration-300"
                    style={{ width: panels.length > 0 ? `${((currentPanel + 1) / panels.length) * 100}%` : "0%" }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {prevEpisode && (
                      <button onClick={() => navigate(`/watch/${slug}/${prevEpisode.episodeNumber}`)} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                        <SkipBack className="w-5 h-5" />
                      </button>
                    )}
                    <button onClick={() => setCurrentPanel((p) => Math.max(p - 1, 0))} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setIsPlaying((p) => !p)}
                      className="w-12 h-12 rounded-full bg-accent-pink/90 flex items-center justify-center hover:bg-accent-pink transition-colors"
                    >
                      {isPlaying ? <Pause className="w-6 h-6 fill-white" /> : <Play className="w-6 h-6 fill-white ml-0.5" />}
                    </button>
                    <button onClick={() => setCurrentPanel((p) => Math.min(p + 1, panels.length - 1))} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                      <ChevronRight className="w-5 h-5" />
                    </button>
                    {nextEpisode && (
                      <button onClick={() => navigate(`/watch/${slug}/${nextEpisode.episodeNumber}`)} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                        <SkipForward className="w-5 h-5" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-300">
                      {currentPanel + 1} / {panels.length}
                    </span>
                    <button onClick={toggleFullscreen} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                      {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* End screen */}
        {currentPanel >= panels.length - 1 && !isPlaying && panels.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-black/80 flex items-center justify-center pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center">
              <h3 className="text-2xl font-display font-bold mb-4">Episode Complete</h3>
              <div className="flex gap-3 justify-center">
                {nextEpisode ? (
                  <button
                    onClick={() => navigate(`/watch/${slug}/${nextEpisode.episodeNumber}`)}
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-accent-pink to-accent-purple text-white font-semibold flex items-center gap-2"
                  >
                    <SkipForward className="w-5 h-5" />
                    Next Episode
                  </button>
                ) : (
                  <Link href={`/watch/${slug}`}>
                    <button className="px-6 py-3 rounded-xl bg-white/10 text-white font-semibold">
                      Back to Project
                    </button>
                  </Link>
                )}
                <button
                  onClick={() => { setCurrentPanel(0); setIsPlaying(true); }}
                  className="px-6 py-3 rounded-xl border border-white/10 text-white font-semibold"
                >
                  Replay
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Below player: Voting, Comments, Episode info */}
      <div className="container py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left: Episode info + comments */}
          <div className="lg:col-span-2 space-y-8">
            {/* Episode title and voting */}
            <div>
              <h1 className="text-2xl md:text-3xl font-display font-bold mb-2">
                Episode {episodeNumber}: {currentEpisode.title}
              </h1>
              {currentEpisode.synopsis && (
                <p className="text-gray-400 mb-4">{currentEpisode.synopsis}</p>
              )}
              <VotingSection episodeId={currentEpisode.id} />
            </div>

            {/* Comments */}
            <CommentsSection episodeId={currentEpisode.id} />
          </div>

          {/* Right: Episode list */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Film className="w-4 h-4 text-accent-pink" />
              Episodes
            </h3>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}>
              {episodes.map((ep: any) => (
                <Link key={ep.id} href={`/watch/${slug}/${ep.episodeNumber}`}>
                  <div className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                    ep.episodeNumber === episodeNumber
                      ? "bg-accent-pink/10 border border-accent-pink/30"
                      : "bg-surface-1/30 border border-white/5 hover:bg-surface-1/50"
                  }`}>
                    <span className="w-8 h-8 rounded-md bg-white/5 flex items-center justify-center text-sm font-bold">
                      {ep.episodeNumber}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{ep.title}</p>
                      <p className="text-xs text-gray-500">{ep.panelCount || 0} panels</p>
                    </div>
                    {ep.episodeNumber === episodeNumber && (
                      <Play className="w-4 h-4 text-accent-pink fill-accent-pink flex-shrink-0" />
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Voting Section ────────────────────────────────────────────────────────
function VotingSection({ episodeId }: { episodeId: number }) {
  const { isAuthenticated } = useAuth();
  const voting = trpc.voting.get.useQuery({ episodeId });
  const castVote = trpc.voting.cast.useMutation({
    onSuccess: () => voting.refetch(),
  });
  const removeVote = trpc.voting.remove.useMutation({
    onSuccess: () => voting.refetch(),
  });

  const handleVote = (type: "up" | "down") => {
    if (!isAuthenticated) { window.location.href = getLoginUrl(); return; }
    if (voting.data?.userVote === type) {
      removeVote.mutate({ episodeId });
    } else {
      castVote.mutate({ episodeId, voteType: type });
    }
  };

  const upvotes = (voting.data as any)?.upvotes ?? 0;
  const downvotes = (voting.data as any)?.downvotes ?? 0;
  const userVote = voting.data?.userVote;

  return (
    <div className="flex items-center gap-4">
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => handleVote("up")}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
          userVote === "up"
            ? "border-accent-pink/50 bg-accent-pink/10 text-accent-pink"
            : "border-white/10 bg-white/5 text-gray-400 hover:text-white"
        }`}
      >
        <ThumbsUp className={`w-4 h-4 ${userVote === "up" ? "fill-accent-pink" : ""}`} />
        <motion.span key={upvotes} initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          {upvotes}
        </motion.span>
      </motion.button>

      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => handleVote("down")}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
          userVote === "down"
            ? "border-red-500/50 bg-red-500/10 text-red-400"
            : "border-white/10 bg-white/5 text-gray-400 hover:text-white"
        }`}
      >
        <ThumbsDown className={`w-4 h-4 ${userVote === "down" ? "fill-red-400" : ""}`} />
        <motion.span key={downvotes} initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          {downvotes}
        </motion.span>
      </motion.button>

      <button
        onClick={async () => {
          try { await navigator.clipboard.writeText(window.location.href); toast.success("Link copied!"); } catch { toast.error("Failed to copy"); }
        }}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 bg-white/5 text-gray-400 hover:text-white transition-colors"
      >
        <Share2 className="w-4 h-4" />
        Share
      </button>
    </div>
  );
}

// ─── Comments Section ──────────────────────────────────────────────────────
function CommentsSection({ episodeId }: { episodeId: number }) {
  const { user, isAuthenticated } = useAuth();
  const [newComment, setNewComment] = useState("");
  const [sort, setSort] = useState<"newest" | "top" | "oldest">("newest");

  const comments = trpc.comments.list.useQuery({ episodeId, sort });
  const createComment = trpc.comments.create.useMutation({
    onSuccess: () => { setNewComment(""); comments.refetch(); toast.success("Comment posted!"); },
  });
  const deleteComment = trpc.comments.delete.useMutation({
    onSuccess: () => { comments.refetch(); toast.success("Comment deleted"); },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    if (!isAuthenticated) { window.location.href = getLoginUrl(); return; }
    createComment.mutate({ episodeId, content: newComment.trim() });
  };

  const commentList = (comments.data ?? []) as Array<{ id: number; content: string; userId: number; userName?: string | null; createdAt: Date; parentId: number | null }>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-accent-pink" />
          Comments ({commentList.length})
        </h3>
        <div className="flex gap-1">
          {(["newest", "top", "oldest"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                sort === s ? "bg-accent-pink/10 text-accent-pink" : "text-gray-400 hover:text-white"
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Comment input */}
      <form onSubmit={handleSubmit} className="mb-6">
        <div className="flex gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent-pink/30 to-accent-purple/30 flex items-center justify-center flex-shrink-0 text-sm font-bold">
            {user?.name?.charAt(0) || "?"}
          </div>
          <div className="flex-1">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder={isAuthenticated ? "Add a comment..." : "Sign in to comment"}
              rows={2}
              className="w-full bg-surface-1/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-accent-pink/50 resize-none"
            />
            <div className="flex justify-end mt-2">
              <button
                type="submit"
                disabled={!newComment.trim() || createComment.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-pink text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent-pink/80 transition-colors"
              >
                <Send className="w-4 h-4" />
                {createComment.isPending ? "Posting..." : "Post"}
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Comment list */}
      <div className="space-y-4">
        {commentList.map((comment) => (
          <motion.div
            key={comment.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-3"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent-cyan/30 to-accent-purple/30 flex items-center justify-center flex-shrink-0 text-xs font-bold">
              {(comment.userName || "U").charAt(0)}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-white">{comment.userName || "Anonymous"}</span>
                <span className="text-xs text-gray-500">{new Date(comment.createdAt).toLocaleDateString()}</span>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">{comment.content}</p>
              {user && comment.userId === user.id && (
                <button
                  onClick={() => deleteComment.mutate({ id: comment.id })}
                  className="text-xs text-gray-500 hover:text-red-400 mt-1 flex items-center gap-1 transition-colors"
                >
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
              )}
            </div>
          </motion.div>
        ))}
        {commentList.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No comments yet. Be the first!</p>
          </div>
        )}
      </div>
    </div>
  );
}
