/**
 * PageBackground — Reusable anime-themed page background with vignette overlay.
 * Usage: <PageBackground src="..." opacity={0.4} />
 * Place as the first child inside a relative container.
 */
export default function PageBackground({
  src,
  opacity = 0.4,
  blur = 0,
}: {
  src: string;
  opacity?: number;
  blur?: number;
}) {
  return (
    <div className="fixed inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }} aria-hidden="true">
      <img
        src={src}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          opacity,
          filter: blur > 0 ? `blur(${blur}px) saturate(0.85)` : "saturate(0.85)",
        }}
        loading="eager"
      />
      {/* Vignette for edge darkening */}
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at center, transparent 40%, rgba(5,5,12,0.6) 100%)",
        }}
      />
    </div>
  );
}
