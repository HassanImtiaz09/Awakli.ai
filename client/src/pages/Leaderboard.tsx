import { trpc } from "@/lib/trpc";
import { motion, useInView } from "framer-motion";
import { useRef, useState } from "react";
import { Link } from "wouter";
import { Trophy, TrendingUp, Eye, ThumbsUp, Film, Crown, Flame, Sparkles, ArrowUp, CheckCircle2 } from "lucide-react";
import { VoteProgressBar } from "@/components/awakli/VoteProgressBar";

type TabKey = "rising" | "promoted" | "completed";

const TABS: { key: TabKey; label: string; icon: typeof Flame; desc: string }[] = [
  { key: "rising", label: "Rising", icon: Flame, desc: "Climbing toward the anime vote threshold" },
  { key: "promoted", label: "Earned Anime", icon: Trophy, desc: "Reached the threshold — anime production unlocked" },
  { key: "completed", label: "Completed", icon: CheckCircle2, desc: "Fully converted from manga to anime" },
];

const MEDAL_COLORS = [
  "from-yellow-400 to-amber-600",
  "from-gray-300 to-gray-500",
  "from-amber-600 to-orange-800",
];

const MEDAL_BORDER = [
  "border-yellow-400/50 shadow-yellow-400/20",
  "border-gray-400/50 shadow-gray-400/20",
  "border-amber-600/50 shadow-amber-600/20",
];

export default function Leaderboard() {
  const [tab, setTab] = useState<TabKey>("rising");

  return (
    <div className="min-h-screen bg-bg-void text-white">
      {/* Hero */}
      <section className="relative py-16 md:py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-accent-pink/5 via-transparent to-transparent" />
        <div className="absolute inset-0 opacity-20"
          style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(233,69,96,0.15) 0%, transparent 60%)" }} />
        <div className="container relative text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent-pink/10 border border-accent-pink/20 text-accent-pink text-sm mb-4">
              <Crown className="w-4 h-4" /> Community-Driven
            </div>
            <h1 className="text-4xl md:text-5xl font-display font-bold mb-3">Road to Anime</h1>
            <p className="text-gray-400 max-w-xl mx-auto">
              The community decides which manga become anime. Vote for the stories you want to see animated.
            </p>
          </motion.div>

          {/* Tab bar */}
          <div className="flex justify-center gap-2 mt-8 flex-wrap">
            {TABS.map((t) => {
              const Icon = t.icon;
              const isActive = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? t.key === "rising"
                        ? "bg-orange-500/10 border border-orange-400/30 text-orange-400"
                        : t.key === "promoted"
                          ? "bg-amber-500/10 border border-amber-400/30 text-amber-400"
                          : "bg-cyan-500/10 border border-cyan-400/30 text-cyan-400"
                      : "bg-surface-1/30 border border-white/5 text-gray-400 hover:text-white hover:bg-surface-1/50"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Tab description */}
          <p className="text-gray-500 text-sm mt-4">
            {TABS.find(t => t.key === tab)?.desc}
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="container pb-20">
        {tab === "rising" && <RisingTab />}
        {tab === "promoted" && <PromotedTab />}
        {tab === "completed" && <CompletedTab />}
      </section>
    </div>
  );
}

// ─── Rising Tab ────────────────────────────────────────────────────────

function RisingTab() {
  const { data, isLoading } = trpc.roadToAnime.rising.useQuery({ limit: 50 });
  const items = data?.items ?? [];
  const threshold = data?.threshold ?? 500;

  if (isLoading) return <LoadingSkeleton />;
  if (items.length === 0) return <EmptyState icon={Flame} message="No rising manga yet. Create one and start collecting votes!" />;

  return (
    <>
      {/* Threshold info */}
      <div className="text-center mb-8 p-4 rounded-xl bg-orange-500/5 border border-orange-400/10">
        <p className="text-orange-400 text-sm">
          Manga need <span className="font-bold">{threshold.toLocaleString()} votes</span> to earn anime conversion
        </p>
      </div>

      {/* Top 3 podium */}
      {items.length >= 3 && (
        <div className="grid md:grid-cols-3 gap-4 mb-10">
          {items.slice(0, 3).map((item, i) => (
            <RisingTopCard key={item.id} item={item} rank={i} threshold={threshold} />
          ))}
        </div>
      )}

      {/* Rest */}
      <div className="space-y-3">
        {items.slice(items.length >= 3 ? 3 : 0).map((item) => (
          <RisingRow key={item.id} item={item} threshold={threshold} />
        ))}
      </div>
    </>
  );
}

function RisingTopCard({ item, rank, threshold }: { item: any; rank: number; threshold: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rank * 0.1 }}
    >
      <Link href={item.slug ? `/watch/${item.slug}` : "#"}>
        <div className={`relative rounded-2xl border ${MEDAL_BORDER[rank]} bg-surface-1/50 p-6 hover:bg-surface-1/70 transition-all cursor-pointer shadow-lg ${rank === 0 ? "md:-mt-4 md:pb-8" : ""}`}>
          <div className={`absolute -top-3 -right-3 w-10 h-10 rounded-full bg-gradient-to-br ${MEDAL_COLORS[rank]} flex items-center justify-center shadow-lg`}>
            <span className="text-sm font-bold text-white">#{item.rank}</span>
          </div>

          <div className="aspect-[3/4] rounded-xl overflow-hidden mb-4 bg-surface-2">
            {item.coverImageUrl ? (
              <img src={item.coverImageUrl} alt={item.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-accent-pink/20 to-accent-purple/20 flex items-center justify-center">
                <Film className="w-10 h-10 text-gray-600" />
              </div>
            )}
          </div>

          <h3 className="font-semibold text-white truncate mb-1">{item.title}</h3>
          <p className="text-xs text-gray-400 mb-3">by {item.userName || "Anonymous"}</p>

          {/* Vote progress */}
          <VoteProgressBar projectId={item.id} compact />

          <div className="flex items-center gap-3 text-xs text-gray-500 mt-2">
            <span className="flex items-center gap-1 text-orange-400">
              <ArrowUp className="w-3 h-3" /> {(item.totalVotes ?? 0).toLocaleString()}
            </span>
            <span>{(threshold - (item.totalVotes ?? 0)).toLocaleString()} to go</span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function RisingRow({ item, threshold }: { item: any; threshold: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-30px" });

  return (
    <motion.div ref={ref} initial={{ opacity: 0, x: -20 }} animate={isInView ? { opacity: 1, x: 0 } : {}} transition={{ duration: 0.3 }}>
      <Link href={item.slug ? `/watch/${item.slug}` : "#"}>
        <div className="flex items-center gap-4 p-4 rounded-xl border border-white/5 bg-surface-1/30 hover:bg-surface-1/50 hover:border-orange-400/20 transition-all cursor-pointer">
          <span className="w-10 text-center text-lg font-display font-bold text-gray-500">#{item.rank}</span>

          <div className="w-12 h-16 rounded-lg overflow-hidden bg-surface-2 flex-shrink-0">
            {item.coverImageUrl ? (
              <img src={item.coverImageUrl} alt={item.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-accent-pink/20 to-accent-purple/20 flex items-center justify-center">
                <Film className="w-5 h-5 text-gray-600" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-white truncate">{item.title}</h3>
            <p className="text-xs text-gray-400">by {item.userName || "Anonymous"}</p>
          </div>

          {/* Mini progress bar */}
          <div className="hidden md:block w-32">
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-orange-500 to-orange-300"
                style={{ width: `${item.percentage}%` }}
              />
            </div>
            <p className="text-[10px] text-gray-500 mt-0.5 text-right">{item.percentage}%</p>
          </div>

          <div className="flex items-center gap-1 text-sm text-orange-400">
            <ArrowUp className="w-4 h-4" /> {(item.totalVotes ?? 0).toLocaleString()}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// ─── Promoted Tab ──────────────────────────────────────────────────────

function PromotedTab() {
  const { data: items, isLoading } = trpc.roadToAnime.promoted.useQuery({ limit: 50 });

  if (isLoading) return <LoadingSkeleton />;
  if (!items || items.length === 0) return <EmptyState icon={Trophy} message="No manga has earned anime conversion yet. Keep voting!" />;

  return (
    <div className="space-y-4">
      {(items as any[]).map((item, i) => (
        <PromotedRow key={item.id} item={item} rank={i + 1} />
      ))}
    </div>
  );
}

function PromotedRow({ item, rank }: { item: any; rank: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-30px" });

  return (
    <motion.div ref={ref} initial={{ opacity: 0, x: -20 }} animate={isInView ? { opacity: 1, x: 0 } : {}} transition={{ duration: 0.3, delay: rank * 0.03 }}>
      <Link href={item.slug ? `/watch/${item.slug}` : "#"}>
        <div className="flex items-center gap-4 p-4 rounded-xl border border-amber-400/10 bg-amber-500/5 hover:bg-amber-500/10 transition-all cursor-pointer">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-yellow-600 flex items-center justify-center flex-shrink-0">
            <Trophy className="w-5 h-5 text-white" />
          </div>

          <div className="w-14 h-20 rounded-lg overflow-hidden bg-surface-2 flex-shrink-0">
            {item.coverImageUrl ? (
              <img src={item.coverImageUrl} alt={item.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-amber-400/20 to-yellow-600/20 flex items-center justify-center">
                <Film className="w-6 h-6 text-gray-600" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-white truncate">{item.title}</h3>
            <p className="text-xs text-gray-400">by {item.userName || "Anonymous"}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-amber-400 font-medium">
                {(item.totalVotes ?? 0).toLocaleString()} votes
              </span>
              {item.promotionStatus === "in_production" && (
                <span className="inline-flex items-center gap-1 text-xs text-cyan-400">
                  <Sparkles className="w-3 h-3" /> In Production
                </span>
              )}
              {item.promotionStatus === "pending_creator" && (
                <span className="text-xs text-gray-400">Awaiting creator</span>
              )}
            </div>
          </div>

          {item.animePromotedAt && (
            <span className="hidden md:block text-xs text-gray-500">
              Promoted {new Date(item.animePromotedAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </Link>
    </motion.div>
  );
}

// ─── Completed Tab ─────────────────────────────────────────────────────

function CompletedTab() {
  const { data: items, isLoading } = trpc.roadToAnime.completed.useQuery({ limit: 50 });

  if (isLoading) return <LoadingSkeleton />;
  if (!items || items.length === 0) return <EmptyState icon={CheckCircle2} message="No anime has been completed yet. The first one is on its way!" />;

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
      {(items as any[]).map((item, i) => (
        <CompletedCard key={item.id} item={item} index={i} />
      ))}
    </div>
  );
}

function CompletedCard({ item, index }: { item: any; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
    >
      <Link href={item.slug ? `/watch/${item.slug}` : "#"}>
        <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/5 overflow-hidden hover:bg-cyan-500/10 transition-all cursor-pointer group">
          <div className="aspect-video relative overflow-hidden">
            {item.coverImageUrl ? (
              <img src={item.coverImageUrl} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-cyan-400/20 to-blue-600/20 flex items-center justify-center">
                <Film className="w-12 h-12 text-gray-600" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0D0D1A] via-transparent to-transparent" />
            <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/90 text-white text-xs font-semibold">
              <CheckCircle2 className="w-3 h-3" /> Anime Complete
            </div>
          </div>
          <div className="p-4">
            <h3 className="font-semibold text-white truncate">{item.title}</h3>
            <p className="text-xs text-gray-400 mt-0.5">by {item.userName || "Anonymous"}</p>
            <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
              <span className="flex items-center gap-1 text-cyan-400">
                <ArrowUp className="w-3 h-3" /> {(item.totalVotes ?? 0).toLocaleString()} votes
              </span>
              {item.productionCompletedAt && (
                <span>Completed {new Date(item.productionCompletedAt).toLocaleDateString()}</span>
              )}
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// ─── Shared Components ─────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="h-20 bg-surface-1/30 rounded-xl animate-pulse" />
      ))}
    </div>
  );
}

function EmptyState({ icon: Icon, message }: { icon: typeof Trophy; message: string }) {
  return (
    <div className="text-center py-20">
      <Icon className="w-12 h-12 text-gray-600 mx-auto mb-3" />
      <p className="text-gray-400 max-w-md mx-auto">{message}</p>
      <Link href="/discover">
        <span className="inline-block mt-4 px-6 py-2.5 rounded-lg bg-accent-pink/10 border border-accent-pink/20 text-accent-pink text-sm font-medium hover:bg-accent-pink/20 transition-colors cursor-pointer">
          Explore Manga
        </span>
      </Link>
    </div>
  );
}
