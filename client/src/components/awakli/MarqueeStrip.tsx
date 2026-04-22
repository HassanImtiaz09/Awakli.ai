import { trpc } from "@/lib/trpc";
import { useMemo } from "react";

/* ═══════════════════════════════════════════════════════════════════════
   B4 — Ambient Marquee Strip
   Continuously scrolling strip of 12 panel thumbnails.
   Pure CSS animation — no JS timers.
   ═══════════════════════════════════════════════════════════════════════ */

export function MarqueeStrip() {
  const trending = trpc.discover.trending.useQuery(undefined, { staleTime: 60_000 });

  const thumbnails = useMemo(() => {
    if (!trending.data) return [];
    return trending.data
      .filter((p: any) => p.coverUrl)
      .map((p: any) => p.coverUrl)
      .slice(0, 12);
  }, [trending.data]);

  if (thumbnails.length < 3) return null;

  /* Duplicate for seamless loop */
  const doubled = [...thumbnails, ...thumbnails];

  return (
    <div
      className="relative py-6 overflow-hidden select-none pointer-events-none"
      data-component="marquee-strip"
      aria-hidden="true"
    >
      {/* Fade edges */}
      <div className="absolute inset-y-0 left-0 w-24 z-10 bg-gradient-to-r from-[#05050C] to-transparent" />
      <div className="absolute inset-y-0 right-0 w-24 z-10 bg-gradient-to-l from-[#05050C] to-transparent" />

      <div className="marquee-track flex gap-3">
        {doubled.map((url, i) => (
          <div
            key={`${url}-${i}`}
            className="shrink-0 w-20 h-28 rounded-lg overflow-hidden border border-white/5 opacity-40"
          >
            <img
              src={url}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default MarqueeStrip;
