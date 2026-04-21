import { useEffect, useState, useRef } from "react";

const SCROLL_BACKGROUNDS = [
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/scroll-bg-01-EdyWFrShLvzzLnZiDjoa9U.webp",
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/scroll-bg-02-NSY75i4q8NHzDhEeXHBH22.webp",
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/scroll-bg-03-VAbNht5MpLyygztAdgJBxR.webp",
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/scroll-bg-04-JMdxz5NkhdYSe4rS8WwG9V.webp",
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/scroll-bg-05-8UcmeHuDmesRWRmKdL4fKB.webp",
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/scroll-bg-06-Ac5RCRzpJRg3C6Jj2TWZSG.webp",
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/scroll-bg-07-nF8LrAdBC9XeeMbQasaJBR.webp",
];

export default function ScrollBackground() {
  const [scrollProgress, setScrollProgress] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const handleScroll = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const progress = docHeight > 0 ? window.scrollY / docHeight : 0;
        setScrollProgress(Math.min(1, Math.max(0, progress)));
      });
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Calculate which two images to crossfade between
  const totalSegments = SCROLL_BACKGROUNDS.length - 1;
  const rawIndex = scrollProgress * totalSegments;
  const currentIndex = Math.min(Math.floor(rawIndex), totalSegments - 1);
  const nextIndex = currentIndex + 1;
  const blendFactor = rawIndex - currentIndex;

  return (
    <div
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: -1 }}
      aria-hidden="true"
    >
      {/* Dark base layer */}
      <div className="absolute inset-0 bg-[#05050C]" />

      {/* Background images — all preloaded, only active pair visible */}
      {SCROLL_BACKGROUNDS.map((src, i) => {
        // Determine opacity: current image fades out, next image fades in
        let opacity = 0;
        if (i === currentIndex) {
          opacity = 1 - blendFactor;
        } else if (i === nextIndex) {
          opacity = blendFactor;
        }

        // Also keep the last image visible when fully scrolled
        if (scrollProgress >= 1 && i === SCROLL_BACKGROUNDS.length - 1) {
          opacity = 1;
        }

        return (
          <img
            key={i}
            src={src}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            style={{
              opacity: opacity * 0.25,
              filter: "blur(2px) saturate(0.8)",
              transition: "opacity 0.15s ease-out",
              willChange: opacity > 0 ? "opacity" : "auto",
            }}
            loading={i <= 1 ? "eager" : "lazy"}
          />
        );
      })}

      {/* Dark vignette overlay for content readability */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(5,5,12,0.4) 0%, rgba(5,5,12,0.85) 100%)",
        }}
      />
    </div>
  );
}
