import { trpc } from "@/lib/trpc";
import { motion, useInView } from "framer-motion";
import { useRef, useState } from "react";
import { Link } from "wouter";
import { Trophy, Medal, TrendingUp, Eye, ThumbsUp, Film, Crown, Star, Flame } from "lucide-react";

const PERIODS = [
  { value: "week" as const, label: "This Week", icon: Flame },
  { value: "month" as const, label: "This Month", icon: TrendingUp },
  { value: "all" as const, label: "All Time", icon: Crown },
];

const MEDAL_COLORS = [
  "from-yellow-400 to-amber-600", // Gold
  "from-gray-300 to-gray-500",    // Silver
  "from-amber-600 to-orange-800", // Bronze
];

const MEDAL_BORDER = [
  "border-yellow-400/50 shadow-yellow-400/20",
  "border-gray-400/50 shadow-gray-400/20",
  "border-amber-600/50 shadow-amber-600/20",
];

export default function Leaderboard() {
  const [period, setPeriod] = useState<"week" | "month" | "all">("week");
  const leaderboard = trpc.leaderboard.get.useQuery({ period });
  const items = (leaderboard.data ?? []) as Array<any>;

  return (
    <div className="min-h-screen bg-bg-void text-white">
      {/* Hero */}
      <section className="relative py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-accent-pink/5 via-transparent to-transparent" />
        <div className="container relative text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Trophy className="w-16 h-16 text-yellow-400 mx-auto mb-4" />
            <h1 className="text-4xl md:text-5xl font-display font-bold mb-3">Leaderboard</h1>
            <p className="text-gray-400 max-w-lg mx-auto">Top-rated projects by the Awakli community</p>
          </motion.div>

          {/* Period tabs */}
          <div className="flex justify-center gap-2 mt-8">
            {PERIODS.map((p) => {
              const Icon = p.icon;
              return (
                <button
                  key={p.value}
                  onClick={() => setPeriod(p.value)}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    period === p.value
                      ? "bg-accent-pink/10 border border-accent-pink/30 text-accent-pink"
                      : "bg-surface-1/30 border border-white/5 text-gray-400 hover:text-white hover:bg-surface-1/50"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="container pb-20">
        {leaderboard.isLoading ? (
          <div className="space-y-4">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="h-20 bg-surface-1/30 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20">
            <Trophy className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">No projects ranked yet for this period.</p>
          </div>
        ) : (
          <>
            {/* Top 3 podium */}
            <div className="grid md:grid-cols-3 gap-4 mb-10">
              {items.slice(0, 3).map((item, i) => (
                <TopCard key={item.id} item={item} rank={i} />
              ))}
            </div>

            {/* Rest of the list */}
            <div className="space-y-3">
              {items.slice(3).map((item, i) => (
                <RankRow key={item.id} item={item} rank={i + 4} />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function TopCard({ item, rank }: { item: any; rank: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rank * 0.1 }}
    >
      <Link href={item.slug ? `/watch/${item.slug}` : "#"}>
        <div className={`relative rounded-2xl border ${MEDAL_BORDER[rank]} bg-surface-1/50 p-6 hover:bg-surface-1/70 transition-all cursor-pointer shadow-lg ${rank === 0 ? "md:-mt-4 md:pb-8" : ""}`}>
          {/* Medal badge */}
          <div className={`absolute -top-3 -right-3 w-10 h-10 rounded-full bg-gradient-to-br ${MEDAL_COLORS[rank]} flex items-center justify-center shadow-lg`}>
            <span className="text-sm font-bold text-white">{rank + 1}</span>
          </div>

          {/* Cover */}
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

          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1"><ThumbsUp className="w-3 h-3" /> {item.voteScore}</span>
            <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {item.viewCount}</span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function RankRow({ item, rank }: { item: any; rank: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-30px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: -20 }}
      animate={isInView ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 0.3 }}
    >
      <Link href={item.slug ? `/watch/${item.slug}` : "#"}>
        <div className="flex items-center gap-4 p-4 rounded-xl border border-white/5 bg-surface-1/30 hover:bg-surface-1/50 hover:border-accent-pink/20 transition-all cursor-pointer">
          <span className="w-10 text-center text-lg font-display font-bold text-gray-500">#{rank}</span>

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

          {item.genre && (
            <span className="hidden md:inline-block px-3 py-1 rounded-full text-xs bg-white/5 border border-white/10 text-gray-400">
              {item.genre.split(",")[0]}
            </span>
          )}

          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1 text-accent-pink"><ThumbsUp className="w-4 h-4" /> {item.voteScore}</span>
            <span className="flex items-center gap-1 text-gray-400"><Eye className="w-4 h-4" /> {item.viewCount}</span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
