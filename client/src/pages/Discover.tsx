import { motion } from "framer-motion";
import { Sparkles, TrendingUp, Clock, Star } from "lucide-react";
import React, { useRef } from "react";
import { useInView } from "framer-motion";
import { AwakliCard } from "@/components/awakli/AwakliCard";
import { AwakliiBadge } from "@/components/awakli/AwakliiBadge";
import { AwakliPosterSkeleton } from "@/components/awakli/AwakliSkeleton";
import { PlatformLayout } from "@/components/awakli/Layouts";

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
