import { motion, useInView } from "framer-motion";
import { Sparkles, TrendingUp, Clock, Wand2, ArrowRight, Flame, Trophy, Film, Eye, Heart, Search, SlidersHorizontal, ChevronDown, Loader2 } from "lucide-react";
import React, { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "wouter";
import { AwakliCard } from "@/components/awakli/AwakliCard";
import { AwakliiBadge } from "@/components/awakli/AwakliiBadge";
import { PlatformLayout } from "@/components/awakli/Layouts";
import { trpc } from "@/lib/trpc";
import { VoteProgressBar } from "@/components/awakli/VoteProgressBar";
import { useAuth } from "@/_core/hooks/useAuth";
import { SignUpBanner, FloatingSignUpPrompt } from "@/components/awakli/SignUpPrompt";
import { cn } from "@/lib/utils";
import { TiltCard } from "@/components/awakli/TiltCard";

const GENRES = [
  { value: "", label: "All Genres" },
  { value: "action", label: "Action" },
  { value: "romance", label: "Romance" },
  { value: "fantasy", label: "Fantasy" },
  { value: "scifi", label: "Sci-Fi" },
  { value: "horror", label: "Horror" },
  { value: "comedy", label: "Comedy" },
  { value: "drama", label: "Drama" },
  { value: "slice_of_life", label: "Slice of Life" },
  { value: "mystery", label: "Mystery" },
  { value: "thriller", label: "Thriller" },
];

const SORT_OPTIONS = [
  { value: "trending", label: "Trending" },
  { value: "newest", label: "Newest" },
  { value: "most_viewed", label: "Most Viewed" },
  { value: "most_liked", label: "Most Liked" },
];

const PAGE_SIZE = 20;

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

// ─── Just Created Row (quick-create content) ────────────────────────────────
function JustCreatedRow() {
  const { data: justCreated, isLoading } = trpc.quickCreate.justCreated.useQuery({ limit: 8 });

  if (isLoading) {
    return (
      <section>
        <ScrollReveal>
          <div className="flex items-center gap-2 mb-6">
            <Wand2 size={20} className="text-[#00F0FF]" />
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

  if (!justCreated || justCreated.length === 0) return null;

  return (
    <section>
      <ScrollReveal>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Wand2 size={20} className="text-[#00F0FF]" />
            <h2 className="text-h3 text-[#F0F0F5]">Just Created</h2>
            <AwakliiBadge variant="pink" size="sm">AI Generated</AwakliiBadge>
          </div>
          <Link href="/create">
            <span className="text-sm text-[#00F0FF] hover:underline cursor-pointer flex items-center gap-1">
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

// ─── Rising Stars Row ───────────────────────────────────────────────────────
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

// ─── Becoming Anime Row ─────────────────────────────────────────────────────
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
              <AwakliCard variant="elevated" glow="cyan" className="p-4 flex gap-4 cursor-pointer group">
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

// ─── Browse All Section with filters + infinite scroll ──────────────────────
function BrowseAllSection() {
  const [genre, setGenre] = useState("");
  const [sort, setSort] = useState<"trending" | "newest" | "most_viewed" | "most_liked" | "rising">("trending");
  const [searchQuery, setSearchQuery] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const loadMoreInView = useInView(loadMoreRef, { margin: "200px" });

  const stableGenre = useMemo(() => genre, [genre]);
  const stableSort = useMemo(() => sort, [sort]);
  const stableSearch = useMemo(() => searchQuery, [searchQuery]);

  const { data, isLoading, isFetching } = trpc.publicContent.discover.useQuery(
    {
      sort: stableSort,
      genre: stableGenre || undefined,
      limit: PAGE_SIZE,
      offset,
    },
    { placeholderData: (prev) => prev }
  );

  // Reset when filters change
  useEffect(() => {
    setItems([]);
    setOffset(0);
    setHasMore(true);
  }, [stableGenre, stableSort, stableSearch]);

  // Append new items
  useEffect(() => {
    if (data?.items) {
      if (offset === 0) {
        setItems(data.items);
      } else {
        setItems((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const newItems = data.items.filter((item: any) => !existingIds.has(item.id));
          return [...prev, ...newItems];
        });
      }
      setHasMore(data.items.length === PAGE_SIZE);
    }
  }, [data, offset]);

  // Infinite scroll trigger
  useEffect(() => {
    if (loadMoreInView && hasMore && !isFetching) {
      setOffset((prev) => prev + PAGE_SIZE);
    }
  }, [loadMoreInView, hasMore, isFetching]);

  const handleGenreChange = useCallback((g: string) => {
    setGenre(g);
  }, []);

  const handleSortChange = useCallback((s: "trending" | "newest" | "most_viewed" | "most_liked" | "rising") => {
    setSort(s);
  }, []);

  return (
    <section>
      <ScrollReveal>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Search size={20} className="text-[#9B59B6]" />
            <h2 className="text-h3 text-[#F0F0F5]">Browse All</h2>
          </div>
        </div>
      </ScrollReveal>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Genre chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {GENRES.map((g) => (
            <button
              key={g.value}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all",
                genre === g.value
                  ? "bg-[#6B5BFF]/20 text-[#00F0FF] border border-[#6B5BFF]/30"
                  : "text-[#9494B8] hover:text-[#F0F0F5] bg-[#1C1C35]/50 border border-white/5 hover:border-white/10"
              )}
              onClick={() => handleGenreChange(g.value)}
            >
              {g.label}
            </button>
          ))}
        </div>

        {/* Sort dropdown */}
        <div className="relative ml-auto">
          <select
            value={sort}
            onChange={(e) => handleSortChange(e.target.value as typeof sort)}
            className="appearance-none bg-[#1C1C35] border border-white/10 rounded-lg px-3 py-1.5 pr-8 text-xs text-[#F0F0F5] focus:outline-none focus:border-[#6B5BFF]/30"
          >
            {SORT_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#5C5C7A] pointer-events-none" />
        </div>
      </div>

      {/* Search bar */}
      <div className="relative mb-6">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5C5C7A]" />
        <input
          type="text"
          placeholder="Search manga & anime..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-[#1C1C35]/50 border border-white/5 rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#F0F0F5] placeholder:text-[#5C5C7A] focus:outline-none focus:border-[#6B5BFF]/20"
        />
      </div>

      {/* Results grid */}
      {isLoading && items.length === 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-[3/4] rounded-xl bg-[#1C1C35]" />
              <div className="mt-2 h-4 bg-[#1C1C35] rounded w-3/4" />
              <div className="mt-1 h-3 bg-[#1C1C35] rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-dashed border-white/10 bg-white/[0.02]">
          <Search size={32} className="text-white/20 mx-auto mb-3" />
          <p className="text-white/40 mb-2">No content found matching your filters.</p>
          <button
            className="text-sm text-[#00F0FF] hover:underline"
            onClick={() => { setGenre(""); setSort("trending"); setSearchQuery(""); }}
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {items.map((item: any) => (
              <Link key={item.id} href={`/watch/${item.slug}`}>
                <TiltCard color="#6B5BFF" className="cursor-pointer" asLink>
                  <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-[#1C1C35] border border-white/5 group-hover:border-[#6B5BFF]/30 transition-all group-hover:shadow-lg group-hover:shadow-[#6B5BFF]/10">
                    {item.coverImageUrl ? (
                      <img
                        src={item.coverImageUrl}
                        alt={item.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#5C5C7A]">
                        <Sparkles size={32} />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="absolute bottom-2 left-2 right-2 flex items-center gap-2 text-xs text-white/80 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="flex items-center gap-1">
                        <Eye size={12} />
                        {item.viewCount ?? 0}
                      </span>
                      <span className="flex items-center gap-1">
                        <Heart size={12} />
                        {item.voteScore ?? 0}
                      </span>
                    </div>
                    {item.animeStatus === "completed" && (
                      <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-[#6B5BFF]/90 text-[10px] font-bold text-white uppercase tracking-wide">
                        Anime
                      </div>
                    )}
                  </div>
                  <div className="mt-2 px-0.5">
                    <h3 className="text-sm font-medium text-[#F0F0F5] line-clamp-1 group-hover:text-[#00F0FF] transition-colors">
                      {item.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-[#5C5C7A]">{item.userName ?? "Anonymous"}</span>
                      {item.genre && (
                        <>
                          <span className="text-[#5C5C7A]">·</span>
                          <span className="text-xs text-[#5C5C7A]">{item.genre.split(",")[0]}</span>
                        </>
                      )}
                    </div>
                  </div>
                </TiltCard>
              </Link>
            ))}
          </div>

          {/* Infinite scroll trigger */}
          <div ref={loadMoreRef} className="py-8 flex justify-center">
            {isFetching && (
              <div className="flex items-center gap-2 text-[#5C5C7A] text-sm">
                <Loader2 size={16} className="animate-spin" />
                Loading more...
              </div>
            )}
            {!hasMore && items.length > 0 && (
              <p className="text-[#5C5C7A] text-sm">You've reached the end</p>
            )}
          </div>
        </>
      )}
    </section>
  );
}

// ─── Main Discover Page ─────────────────────────────────────────────────────
export default function Discover() {
  const { isAuthenticated } = useAuth();

  return (
    <PlatformLayout>
      <div className="container py-12 space-y-16">
        {/* Hero banner */}
        <ScrollReveal>
          <div className="relative rounded-2xl overflow-hidden p-10 md:p-16"
            style={{ background: "linear-gradient(135deg, #1A0A2E 0%, #0D1A2E 50%, #0A1A1A 100%)" }}>
            <div className="absolute inset-0 opacity-30"
              style={{ background: "radial-gradient(ellipse at 30% 50%, rgba(107,91,255,0.3) 0%, transparent 60%)" }} />
            <div className="relative z-10 max-w-2xl">
              <AwakliiBadge variant="pink" size="md" className="mb-4">
                <Sparkles size={12} className="mr-1" /> Discover
              </AwakliiBadge>
              <h1 className="text-h1 text-[#F0F0F5] mb-3">Explore Manga & Anime</h1>
              <p className="text-body-lg text-[#9494B8] mb-6">
                Watch AI-generated anime for free. Vote for your favorites and help decide what gets animated next.
              </p>
              <div className="flex items-center gap-3">
                <Link href="/trending">
                  <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-[#00F0FF] to-[#6B5BFF] text-white font-medium cursor-pointer text-sm hover:shadow-lg hover:shadow-[#6B5BFF]/20 transition-shadow">
                    <Flame size={16} /> Trending Now
                  </span>
                </Link>
                <Link href="/create">
                  <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-white/10 text-[#F0F0F5] font-medium cursor-pointer text-sm hover:bg-white/5 transition-colors">
                    <Wand2 size={16} /> Create Yours
                  </span>
                </Link>
              </div>
            </div>
          </div>
        </ScrollReveal>

        {/* Just Created — real data from quick create */}
        <JustCreatedRow />

        {/* Rising Stars — close to anime threshold */}
        <RisingStarsRow />

        {/* Becoming Anime — in production */}
        <BecomingAnimeRow />

        {/* Sign-up prompt for anonymous users */}
        {!isAuthenticated && (
          <ScrollReveal>
            <SignUpBanner action="vote" />
          </ScrollReveal>
        )}

        {/* Browse All with filters + infinite scroll */}
        <BrowseAllSection />
      </div>

      {/* Floating sign-up prompt for anonymous visitors */}
      {!isAuthenticated && <FloatingSignUpPrompt />}
    </PlatformLayout>
  );
}
