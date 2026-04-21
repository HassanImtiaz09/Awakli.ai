import { useRef, useState, useCallback } from "react";

interface TiltCardProps {
  children: React.ReactNode;
  /** Accent color for the hover glow shadow */
  color?: string;
  /** Additional CSS classes */
  className?: string;
  /** Max tilt angle in degrees (default 4) */
  maxTilt?: number;
  /** Whether the card is wrapped in a Link (disables cursor-default) */
  asLink?: boolean;
}

/**
 * Mouse-tracking parallax tilt card.
 * Tracks cursor position and applies a subtle 3D rotation + lift on hover.
 * Uses perspective(600px) for natural depth and per-brand colored glow.
 */
export function TiltCard({
  children,
  color = "#6B5BFF",
  className = "",
  maxTilt = 4,
  asLink = false,
}: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [hovering, setHovering] = useState(false);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      setTilt({ x: (y - 0.5) * -(maxTilt * 2), y: (x - 0.5) * (maxTilt * 2) });
    },
    [maxTilt]
  );

  const handleMouseLeave = useCallback(() => {
    setTilt({ x: 0, y: 0 });
    setHovering(false);
  }, []);

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={handleMouseLeave}
      className={`group ${asLink ? "" : "cursor-default"} ${className}`}
      style={{
        transform: `perspective(600px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) translateY(${hovering ? -3 : 0}px)`,
        transition: hovering ? "transform 0.1s ease-out, box-shadow 0.2s ease-out" : "transform 0.4s ease-out, box-shadow 0.3s ease-out",
        boxShadow: hovering
          ? `0 14px 32px -8px ${color}35, 0 4px 8px rgba(0,0,0,0.3)`
          : "0 2px 8px rgba(0,0,0,0.2)",
      }}
    >
      {children}
    </div>
  );
}
