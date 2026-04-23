/**
 * Anime Watch Page — Public anime episode player
 *
 * Route: /anime/:projectId/:episodeId
 *
 * Features:
 *   - Cloudflare Stream iframe embed with poster thumbnail
 *   - SRT subtitle track support
 *   - Episode metadata sidebar (title, synopsis, characters, episode number)
 *   - Previous/next episode navigation
 *   - Social sharing (copy link, share to X/Twitter)
 *   - Creator attribution with link to profile
 *   - View count tracking
 *   - Responsive: full-width video on mobile, sidebar on desktop
 */
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Link, useLocation, useParams } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Film,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Share2,
  Copy,
  ExternalLink,
  Eye,
  Clock,
  BookOpen,
  Subtitles,
  Users,
  Play,
  Loader2,
  Check,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { SEOHead, buildEpisodeJsonLd } from "@/components/awakli/SEOHead";

// ─── Format helpers ──────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatViewCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
}

// ─── Share helpers ───────────────────────────────────────────────────────

function getShareUrl(projectId: number, episodeId: number): string {
  return `${window.location.origin}/anime/${projectId}/${episodeId}`;
}

function shareToTwitter(title: string, url: string) {
  const text = encodeURIComponent(`Watch "${title}" on Awakli`);
  const encodedUrl = encodeURIComponent(url);
  window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodedUrl}`, "_blank");
}

// ─── Main Component ─────────────────────────────────────────────────────

export default function AnimeWatchPage() {
  const params = useParams<{ projectId: string; episodeId: string }>();
  const projectId = parseInt(params.projectId || "0", 10);
  const episodeId = parseInt(params.episodeId || "0", 10);
  const [, navigate] = useLocation();
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);

  // Fetch episode player data (public endpoint)
  const playerQuery = trpc.animePublish.getEpisodePlayer.useQuery(
    { projectId, episodeId },
    { enabled: projectId > 0 && episodeId > 0, retry: 1 },
  );

  const data = playerQuery.data;
  const episode = data?.episode;
  const project = data?.project;
  const player = data?.player;
  const characters = data?.characters ?? [];
  const navigation = data?.navigation;

  // Close share menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) {
        setShowShareMenu(false);
      }
    }
    if (showShareMenu) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showShareMenu]);

  // SEO
  const jsonLd = useMemo(() => {
    if (!episode || !project) return undefined;
    return buildEpisodeJsonLd({
      title: episode.title,
      description: episode.synopsis || undefined,
      thumbnailUrl: player?.streamThumbnailUrl || project.coverImageUrl || undefined,
      projectTitle: project.title,
      projectSlug: project.slug || String(project.id),
      episodeNumber: episode.episodeNumber,
      duration: episode.duration || undefined,
    });
  }, [episode, project, player]);

  // Copy share link
  const copyLink = useCallback(() => {
    const url = getShareUrl(projectId, episodeId);
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      toast.success("Link copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    });
  }, [projectId, episodeId]);

  // ─── Loading ──────────────────────────────────────────────────────────

  if (playerQuery.isLoading) {
    return (
      <div className="min-h-screen bg-bg-void flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <div className="w-16 h-16 rounded-full border-2 border-token-violet/30 border-t-token-violet animate-spin mx-auto mb-4" />
          <p className="text-text-secondary font-sans text-sm">Loading episode...</p>
        </motion.div>
      </div>
    );
  }

  // ─── Error / Not Found ────────────────────────────────────────────────

  if (playerQuery.error || !data) {
    return (
      <div className="min-h-screen bg-bg-void flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-md mx-auto px-6"
        >
          <Film className="w-16 h-16 text-text-muted mx-auto mb-4" />
          <h1 className="text-2xl font-display font-bold text-text-primary mb-2">
            Episode Not Found
          </h1>
          <p className="text-text-secondary mb-6">
            This episode may not be published yet, or the link may be incorrect.
          </p>
          <Button
            onClick={() => navigate("/discover")}
            className="bg-token-violet hover:bg-token-violet/80 text-white"
          >
            Browse Discover
          </Button>
        </motion.div>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────

  const shareUrl = getShareUrl(projectId, episodeId);

  return (
    <div className="min-h-screen bg-bg-void text-text-primary">
      {/* SEO */}
      {episode && project && (
        <SEOHead
          title={`${project.title} - Ep ${episode.episodeNumber}: ${episode.title}`}
          description={episode.synopsis || `Watch Episode ${episode.episodeNumber} of ${project.title} on Awakli`}
          image={player?.streamThumbnailUrl || project.coverImageUrl || undefined}
          url={shareUrl}
          type="video.other"
          jsonLd={jsonLd}
        />
      )}

      {/* Top navigation bar */}
      <header className="sticky top-0 z-50 bg-bg-void/90 backdrop-blur-md border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(project?.slug ? `/watch/${project.slug}` : "/discover")}
              className="p-2 rounded-lg hover:bg-bg-twilight transition-colors text-text-secondary hover:text-text-primary"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="hidden sm:block">
              <Link href={project?.slug ? `/watch/${project.slug}` : "/discover"}>
                <span className="text-sm text-text-secondary hover:text-token-violet transition-colors cursor-pointer">
                  {project?.title}
                </span>
              </Link>
              <span className="text-text-muted mx-2">/</span>
              <span className="text-sm text-text-primary font-medium">
                Ep {episode?.episodeNumber}
              </span>
            </div>
          </div>

          {/* Share button */}
          <div className="relative" ref={shareRef}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowShareMenu(!showShareMenu)}
              className="gap-2 border-white/10 text-text-secondary hover:text-text-primary"
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">Share</span>
            </Button>

            <AnimatePresence>
              {showShareMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.95 }}
                  className="absolute right-0 top-full mt-2 w-56 bg-bg-twilight border border-white/10 rounded-xl shadow-xl overflow-hidden z-50"
                >
                  <button
                    onClick={copyLink}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-bg-overlay transition-colors text-sm"
                  >
                    {copied ? <Check className="w-4 h-4 text-token-mint" /> : <Copy className="w-4 h-4 text-text-secondary" />}
                    <span>{copied ? "Copied!" : "Copy link"}</span>
                  </button>
                  <button
                    onClick={() => {
                      shareToTwitter(episode?.title || "Anime Episode", shareUrl);
                      setShowShareMenu(false);
                    }}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-bg-overlay transition-colors text-sm"
                  >
                    <ExternalLink className="w-4 h-4 text-text-secondary" />
                    <span>Share on X / Twitter</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Video player — takes 2/3 on desktop */}
          <div className="lg:col-span-2 space-y-4">
            {/* Video embed */}
            <div className="relative aspect-video bg-bg-ink rounded-2xl overflow-hidden border border-white/5 shadow-lg">
              {player?.streamEmbedUrl ? (
                <iframe
                  src={player.streamEmbedUrl}
                  className="absolute inset-0 w-full h-full"
                  allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                  title={episode?.title || "Anime Episode"}
                />
              ) : player?.videoUrl ? (
                <video
                  src={player.videoUrl}
                  controls
                  className="absolute inset-0 w-full h-full object-contain bg-black"
                  poster={player.streamThumbnailUrl || undefined}
                >
                  {(player.vttUrl || player.srtUrl) && (
                    <track
                      kind="subtitles"
                      src={(player.vttUrl || player.srtUrl) ?? undefined}
                      srcLang="en"
                      label="English"
                      default
                    />
                  )}
                </video>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <Play className="w-16 h-16 text-text-muted mx-auto mb-3" />
                    <p className="text-text-secondary text-sm">Video not available</p>
                  </div>
                </div>
              )}
            </div>

            {/* Episode title and metadata */}
            <div className="space-y-3">
              <h1 className="text-xl sm:text-2xl font-display font-bold text-text-primary">
                Episode {episode?.episodeNumber}: {episode?.title}
              </h1>

              <div className="flex flex-wrap items-center gap-4 text-sm text-text-secondary">
                {episode?.viewCount !== undefined && (
                  <span className="flex items-center gap-1.5">
                    <Eye className="w-4 h-4" />
                    {formatViewCount(episode.viewCount)} views
                  </span>
                )}
                {episode?.duration != null && episode.duration > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    {formatDuration(episode.duration!)}
                  </span>
                )}
                {episode?.publishedAt && (
                  <span className="flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4" />
                    {formatDate(episode.publishedAt)}
                  </span>
                )}
                {(player?.srtUrl || player?.vttUrl) && (
                  <span className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-token-mint/15 text-token-mint text-xs font-semibold">
                      <Subtitles className="w-3.5 h-3.5" />
                      CC
                    </span>
                    <span className="text-text-secondary">Subtitles</span>
                  </span>
                )}
              </div>
            </div>

            {/* Episode navigation */}
            <div className="flex items-center justify-between py-3 border-t border-b border-white/5">
              {navigation?.prevEpisode ? (
                <button
                  onClick={() => navigate(`/anime/${projectId}/${navigation.prevEpisode!.id}`)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-bg-twilight transition-colors text-sm"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <div className="text-left">
                    <div className="text-text-muted text-xs">Previous</div>
                    <div className="text-text-primary">Ep {navigation.prevEpisode.episodeNumber}</div>
                  </div>
                </button>
              ) : (
                <div />
              )}

              <span className="text-text-muted text-xs">
                {navigation?.currentIndex} of {navigation?.totalEpisodes}
              </span>

              {navigation?.nextEpisode ? (
                <button
                  onClick={() => navigate(`/anime/${projectId}/${navigation.nextEpisode!.id}`)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-bg-twilight transition-colors text-sm"
                >
                  <div className="text-right">
                    <div className="text-text-muted text-xs">Next</div>
                    <div className="text-text-primary">Ep {navigation.nextEpisode.episodeNumber}</div>
                  </div>
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <div />
              )}
            </div>

            {/* Synopsis */}
            {episode?.synopsis && (
              <div className="bg-bg-ink rounded-xl p-5 border border-white/5">
                <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-2">
                  Synopsis
                </h3>
                <p className="text-text-primary text-sm leading-relaxed">
                  {episode.synopsis}
                </p>
              </div>
            )}
          </div>

          {/* Sidebar — 1/3 on desktop */}
          <div className="space-y-5">
            {/* Project card */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-bg-ink rounded-2xl border border-white/5 overflow-hidden"
            >
              {project?.coverImageUrl && (
                <Link href={project.slug ? `/watch/${project.slug}` : `/discover`}>
                  <img
                    src={project.coverImageUrl}
                    alt={project.title}
                    className="w-full h-40 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                  />
                </Link>
              )}
              <div className="p-4 space-y-3">
                <Link href={project?.slug ? `/watch/${project.slug}` : `/discover`}>
                  <h2 className="text-lg font-display font-bold text-text-primary hover:text-token-violet transition-colors cursor-pointer">
                    {project?.title}
                  </h2>
                </Link>
                {project?.description && (
                  <p className="text-text-secondary text-sm line-clamp-3">
                    {project.description}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {project?.genre && (
                    <span className="px-2.5 py-1 rounded-full bg-token-violet/10 text-token-violet text-xs font-medium">
                      {project.genre}
                    </span>
                  )}
                  {project?.animeStyle && project.animeStyle !== "default" && (
                    <span className="px-2.5 py-1 rounded-full bg-token-cyan/10 text-token-cyan text-xs font-medium">
                      {project.animeStyle}
                    </span>
                  )}
                </div>

                {/* Creator link */}
                {project?.creatorId && (
                  <Link href={`/profile/${project.creatorId}`}>
                    <div className="flex items-center gap-2 pt-2 border-t border-white/5 cursor-pointer hover:opacity-80 transition-opacity">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-token-violet to-token-cyan flex items-center justify-center text-xs font-bold text-white">
                        C
                      </div>
                      <span className="text-sm text-text-secondary">View creator profile</span>
                    </div>
                  </Link>
                )}
              </div>
            </motion.div>

            {/* Characters */}
            {characters.length > 0 && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-bg-ink rounded-2xl border border-white/5 p-4"
              >
                <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Characters
                </h3>
                <div className="space-y-2">
                  {characters.slice(0, 6).map((char) => {
                    const traits = char.visualTraits as any;
                    return (
                      <div
                        key={char.id}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-bg-twilight transition-colors"
                      >
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-token-violet/30 to-token-cyan/30 flex items-center justify-center text-xs font-bold text-text-primary border border-white/10">
                          {(char.name || "?")[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-text-primary">{char.name}</div>
                          {char.role && (
                            <div className="text-xs text-text-muted capitalize">{char.role}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {characters.length > 6 && (
                    <p className="text-xs text-text-muted text-center pt-1">
                      +{characters.length - 6} more characters
                    </p>
                  )}
                </div>
              </motion.div>
            )}

            {/* Subtitle download */}
            {player?.srtUrl && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-bg-ink rounded-2xl border border-white/5 p-4"
              >
                <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Subtitles className="w-4 h-4" />
                  Subtitles
                </h3>
                <a
                  href={player.srtUrl}
                  download={`${project?.title || "episode"}-ep${episode?.episodeNumber || 1}.srt`}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-twilight hover:bg-bg-overlay transition-colors text-sm text-text-primary"
                >
                  <Download className="w-4 h-4 text-token-mint" />
                  Download SRT
                </a>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
