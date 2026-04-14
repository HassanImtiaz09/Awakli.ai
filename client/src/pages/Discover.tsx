import { motion } from "framer-motion";
import { Sparkles, TrendingUp, Clock, Star, Wand2, ArrowRight, Flame, Trophy, Film } from "lucide-react";
import React, { useRef } from "react";
import { useInView } from "framer-motion";
import { Link } from "wouter";
import { AwakliCard } from "@/components/awakli/AwakliCard";
import { AwakliiBadge } from "@/components/awakli/AwakliiBadge";
import { AwakliPosterSkeleton } from "@/components/awakli/AwakliSkeleton";
import { PlatformLayout } from "@/components/awakli/Layouts";
import { trpc } from "@/lib/trpc";
import { VoteProgressBar } from "@/components/awakli/VoteProgressBar";

// Mock featured content
const FEATURED = [
  { id: 1, title: "Void Chronicles", genre: "scifi", style: "Seinen", frames: 48, rating: 4.9 },
  { id: 2, title: "Cherry Storm", genre: "action", style: "Shonen", frames: 32, rating: 4.7 },
  { id: 3, title: "Lunar Petals", genre: "romance", style: "Shoujo", frames: 24, rating: 4.8 },
  { id: 4, title: "Iron Colossus", genre: "fantasy", style: "Mecha", frames: 56, rating: 4.6 },
  { id: 5, title: "Midnight Bloom", genre: "romance", style: "Shoujo", frames: 18, rating: 4.5 },
  { id: 6, title: "Neon Samurai", genre: "action", style: "Seinen", frames: 40, rating: 4.8 },
];

const GENRE_COLORS: Record<string, string> = {
  scifi: "#00D4FF", action: "#FF4444", romance: "#FF69B4",
  fantasy: "#9B59B6", horror: "#E74C3C", comedy: "#F39C12",
};

function ScrollReveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

function JustCreatedRow() {
  const { data: justCreated, isLoading } = trpc.quickCreate.justCreated.useQuery({ limit: 8 });

  if (isLoading) {
    return (
      <section>
        <ScrollReveal>
          <div className="flex items-center gap-2 mb-6">
            <Wand2 size={20} className="text-[#E94560]" />
            <h2 className="text-h3 text-[#F0F0F5]">Just Created</h2>
          </div>
        </ScrollReveal>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="aspect-[3/4] rounded-xl bg-white/[0.03] border border-white/5 animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  if (!justCreated || justCreated.length === 0) {
    return (
      <section>
        <ScrollReveal>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Wand2 size={20} className="text-[#E94560]" />
              <h2 className="text-h3 text-[#F0F0F5]">Just Created</h2>
            </div>
            <Link href="/create">
              <span className="text-sm text-[#E94560] hover:underline cursor-pointer flex items-center gap-1">
                Create yours <ArrowRight size={14} />
              </span>
            </Link>
          </div>
        </ScrollReveal>
        <div className="text-center py-12 rounded-2xl border border-dashed border-white/10 bg-white/[0.02]">
          <Wand2 size={32} className="text-white/20 mx-auto mb-3" />
          <p className="text-white/40 mb-4">No manga created yet. Be the first!</p>
          <Link href="/create">
            <span className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-gradient-to-r from-[#E94560] to-[#FF6B81] text-white font-medium cursor-pointer">
              <Wand2 size={16} /> Create Manga
            </span>
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section>
      <ScrollReveal>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Wand2 size={20} className="text-[#E94560]" />
            <h2 className="text-h3 text-[#F0F0F5]">Just Created</h2>
            <AwakliiBadge variant="pink" size="sm">AI Generated</AwakliiBadge>
          </div>
          <Link href="/create">
            <span className="text-sm text-[#E94560] hover:underline cursor-pointer flex items-center gap-1">
              Create yours <ArrowRight size={14} />
            </span>
          </Link>
        </div>
      </ScrollReveal>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {justCreated.map((item, i) => (
          <ScrollReveal key={item.id} delay={i * 0.06}>
            <Link href={`/watch/${item.slug}`}>
              <AwakliCard
                variant="poster"
                glow="pink"
                imageUrl={item.coverImageUrl || `https://picsum.photos/seed/${item.id}/300/450`}
                imageAlt={item.title}
                className="cursor-pointer"
                style={{ aspectRatio: "2/3" }}
              >
                <h3 className="text-sm font-semibold text-[#F0F0F5] truncate">{item.title}</h3>
                <div className="flex items-center gap-1.5 mt-1">
                  <AwakliiBadge variant={(item.genre?.toLowerCase() || "fantasy") as any} size="sm">
                    {item.genre || "Fantasy"}
                  </AwakliiBadge>
                  <span className="text-xs text-[#5C5C7A]">{item.animeStyle || "AI"}</span>
                </div>
                {item.userName && (
                  <p className="text-[10px] text-[#5C5C7A] mt-1 truncate">by {item.userName}</p>
                )}
              </AwakliCard>
            </Link>
          </ScrollReveal>
        ))}
      </div>
    </section>
  );
}

function RisingStarsRow() {
  const { data: rising, isLoading } = trpc.discoverVoting.rising.useQuery({ limit: 8 });

  if (isLoading) {
    return (
      <section>
        <ScrollReveal>
          <div className="flex items-center gap-2 mb-6">
            <Flame size={20} className="text-orange-400" />
            <h2 className="text-h3 text-[#F0F0F5]">Rising Stars</h2>
          </div>
        </ScrollReveal>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="aspect-[3/4] rounded-xl bg-white/[0.03] border border-white/5 animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  if (!rising || rising.length === 0) return null;

  return (
    <section>
      <ScrollReveal>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Flame size={20} className="text-orange-400" />
            <h2 className="text-h3 text-[#F0F0F5]">Rising Stars</h2>
            <AwakliiBadge variant="pink" size="sm">Vote to Anime</AwakliiBadge>
          </div>
          <Link href="/leaderboard">
            <span className="text-sm text-orange-400 hover:underline cursor-pointer flex items-center gap-1">
              See all <ArrowRight size={14} />
            </span>
          </Link>
        </div>
      </ScrollReveal>
      <p className="text-white/40 text-sm mb-4 -mt-3">
        These manga are climbing toward the anime vote threshold. Your vote could make the difference!
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {rising.map((item, i) => (
          <ScrollReveal key={item.id} delay={i * 0.06}>
            <Link href={`/watch/${item.slug}`}>
              <AwakliCard variant="elevated" glow="pink" className="p-0 overflow-hidden cursor-pointer group">
                <div className="aspect-[3/2] relative overflow-hidden">
                  <img
                    src={item.coverImageUrl || `https://picsum.photos/seed/${item.id}/400/260`}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0D0D1A] via-transparent to-transparent" />
                  <div className="absolute top-2 right-2">
                    <span className="text-xs font-bold bg-orange-500/90 text-white px-2 py-0.5 rounded-full">
                      {item.percentage}%
                    </span>
                  </div>
                </div>
                <div className="p-3">
                  <h3 className="text-sm font-semibold text-[#F0F0F5] truncate">{item.title}</h3>
                  <div className="flex items-center gap-1.5 mt-1 mb-2">
                    <AwakliiBadge variant={(item.genre?.toLowerCase() || "fantasy") as any} size="sm">
                      {item.genre || "Fantasy"}
                    </AwakliiBadge>
                    {item.userName && <span className="text-[10px] text-[#5C5C7A]">by {item.userName}</span>}
                  </div>
                  <VoteProgressBar projectId={item.id} compact />
                </div>
              </AwakliCard>
            </Link>
          </ScrollReveal>
        ))}
      </div>
    </section>
  );
}

function BecomingAnimeRow() {
  const { data: becoming, isLoading } = trpc.discoverVoting.becomingAnime.useQuery({ limit: 6 });

  if (isLoading) {
    return (
      <section>
        <ScrollReveal>
          <div className="flex items-center gap-2 mb-6">
            <Film size={20} className="text-cyan-400" />
            <h2 className="text-h3 text-[#F0F0F5]">Becoming Anime</h2>
          </div>
        </ScrollReveal>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 rounded-xl bg-white/[0.03] border border-white/5 animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  if (!becoming || becoming.length === 0) return null;

  return (
    <section>
      <ScrollReveal>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Film size={20} className="text-cyan-400" />
            <h2 className="text-h3 text-[#F0F0F5]">Becoming Anime</h2>
            <AwakliiBadge variant="default" size="sm">
              <Sparkles size={10} className="mr-1" /> In Production
            </AwakliiBadge>
          </div>
          <Link href="/leaderboard">
            <span className="text-sm text-cyan-400 hover:underline cursor-pointer flex items-center gap-1">
              View all <ArrowRight size={14} />
            </span>
          </Link>
        </div>
      </ScrollReveal>
      <p className="text-white/40 text-sm mb-4 -mt-3">
        These manga earned enough community votes and are now being converted to anime!
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {becoming.map((item, i) => (
          <ScrollReveal key={item.id} delay={i * 0.08}>
            <Link href={`/watch/${item.slug}`}>
              <AwakliCard variant="elevated" className="p-4 flex gap-4 cursor-pointer group border-cyan-500/20">
                <div className="w-20 h-28 rounded-lg overflow-hidden shrink-0 relative">
                  <img
                    src={item.coverImageUrl || `https://picsum.photos/seed/${item.id}/120/170`}
                    alt={item.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 border-2 border-cyan-400/30 rounded-lg" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Trophy size={14} className="text-amber-400 shrink-0" />
                    <h3 className="font-semibold text-[#F0F0F5] truncate">{item.title}</h3>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <AwakliiBadge variant={(item.genre?.toLowerCase() || "fantasy") as any} size="sm">
                      {item.genre || "Fantasy"}
                    </AwakliiBadge>
                    <span className="text-xs text-cyan-400 font-medium">
                      {(item.totalVotes ?? 0).toLocaleString()} votes
                    </span>
                  </div>
                  {item.userName && (
                    <p className="text-[10px] text-[#5C5C7A] mt-1.5">Created by {item.userName}</p>
                  )}
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-cyan-400/70">
                    <motion.div
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="w-1.5 h-1.5 rounded-full bg-cyan-400"
                    />
                    Anime production in progress
                  </div>
                </div>
              </AwakliCard>
            </Link>
          </ScrollReveal>
        ))}
      </div>
    </section>
  );
}

export default function Discover() {
  return (
    <PlatformLayout>
      <div className="container py-12 space-y-16">
        {/* Hero banner */}
        <ScrollReveal>
          <div className="relative rounded-2xl overflow-hidden p-10 md:p-16"
            style={{ background: "linear-gradient(135deg, #1A0A2E 0%, #0D1A2E 50%, #0A1A1A 100%)" }}>
            <div className="absolute inset-0 opacity-30"
              style={{ background: "radial-gradient(ellipse at 30% 50%, rgba(233,69,96,0.3) 0%, transparent 60%)" }} />
            <div className="relative z-10 max-w-2xl">
              <AwakliiBadge variant="pink" size="md" className="mb-4">
                <Sparkles size={12} className="mr-1" /> Featured This Week
              </AwakliiBadge>
              <h1 className="text-h1 text-[#F0F0F5] mb-3">Void Chronicles</h1>
              <p className="text-body-lg text-[#9494B8] mb-6">
                A sci-fi epic transformed from manga to stunning anime frames. 48 panels, Seinen style.
              </p>
              <div className="flex items-center gap-3">
                <AwakliiBadge variant="scifi">Sci-Fi</AwakliiBadge>
                <AwakliiBadge variant="default">Seinen</AwakliiBadge>
                <span className="text-sm text-[#5C5C7A]">48 frames</span>
              </div>
            </div>
          </div>
        </ScrollReveal>

        {/* Trending */}
        <section>
          <ScrollReveal>
            <div className="flex items-center gap-2 mb-6">
              <TrendingUp size={20} className="text-[#E94560]" />
              <h2 className="text-h3 text-[#F0F0F5]">Trending Now</h2>
            </div>
          </ScrollReveal>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {FEATURED.map((item, i) => (
              <ScrollReveal key={item.id} delay={i * 0.06}>
                <AwakliCard
                  variant="poster"
                  glow="pink"
                  imageUrl={`https://picsum.photos/seed/${item.id + 10}/300/450`}
                  imageAlt={item.title}
                  className="cursor-pointer"
                  style={{ aspectRatio: "2/3" }}
                >
                  <h3 className="text-sm font-semibold text-[#F0F0F5] truncate">{item.title}</h3>
                  <div className="flex items-center gap-1.5 mt-1">
                    <AwakliiBadge variant={item.genre as any} size="sm">{item.genre}</AwakliiBadge>
                    <span className="text-xs text-[#5C5C7A]">
                      <Star size={10} className="inline mr-0.5 text-[#FFB800]" />{item.rating}
                    </span>
                  </div>
                </AwakliCard>
              </ScrollReveal>
            ))}
          </div>
        </section>

        {/* Just Created — real data from quick create */}
        <JustCreatedRow />

        {/* Rising Stars — close to anime threshold */}
        <RisingStarsRow />

        {/* Becoming Anime — in production */}
        <BecomingAnimeRow />

        {/* Recently Added */}
        <section>
          <ScrollReveal>
            <div className="flex items-center gap-2 mb-6">
              <Clock size={20} className="text-[#00D4FF]" />
              <h2 className="text-h3 text-[#F0F0F5]">Recently Added</h2>
            </div>
          </ScrollReveal>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURED.slice().reverse().map((item, i) => (
              <ScrollReveal key={item.id} delay={i * 0.07}>
                <AwakliCard variant="elevated" glow="cyan" className="p-4 flex gap-4 cursor-pointer">
                  <div className="w-16 h-20 rounded-lg overflow-hidden shrink-0">
                    <img
                      src={`https://picsum.photos/seed/${item.id + 20}/100/140`}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-[#F0F0F5] truncate">{item.title}</h3>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <AwakliiBadge variant={item.genre as any} size="sm">{item.genre}</AwakliiBadge>
                      <span className="text-xs text-[#5C5C7A]">{item.frames} frames</span>
                    </div>
                    <div className="flex items-center gap-1 mt-2 text-xs text-[#FFB800]">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <Star key={j} size={10} fill={j < Math.floor(item.rating) ? "#FFB800" : "none"} />
                      ))}
                      <span className="text-[#5C5C7A] ml-1">{item.rating}</span>
                    </div>
                  </div>
                </AwakliCard>
              </ScrollReveal>
            ))}
          </div>
        </section>
      </div>
    </PlatformLayout>
  );
}
