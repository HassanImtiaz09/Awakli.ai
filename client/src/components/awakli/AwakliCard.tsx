import { motion } from "framer-motion";
import React, { useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface AwakliCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated" | "poster";
  glow?: "pink" | "cyan" | "none";
  hoverable?: boolean;
  aspectRatio?: string;
  imageUrl?: string;
  imageAlt?: string;
  /** Enable mouse-tracking parallax tilt (default true) */
  tilt?: boolean;
  /** Max tilt angle in degrees (default 4) */
  maxTilt?: number;
}

const GLOW_COLORS: Record<string, string> = {
  pink: "rgba(107,91,255,0.35)",
  cyan: "rgba(0,240,255,0.35)",
  none: "rgba(0,0,0,0.3)",
};

export const AwakliCard = React.forwardRef<HTMLDivElement, AwakliCardProps>(
  (
    {
      variant = "default",
      glow = "none",
      hoverable = true,
      tilt: enableTilt = true,
      maxTilt = 4,
      aspectRatio,
      imageUrl,
      imageAlt,
      className,
      children,
      style: styleProp,
      ...props
    },
    ref
  ) => {
    const innerRef = useRef<HTMLDivElement>(null);
    const [tiltState, setTiltState] = useState({ x: 0, y: 0 });
    const [hovering, setHovering] = useState(false);

    const handleMouseMove = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!enableTilt || !hoverable) return;
        const el = innerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        setTiltState({
          x: (y - 0.5) * -(maxTilt * 2),
          y: (x - 0.5) * (maxTilt * 2),
        });
      },
      [enableTilt, hoverable, maxTilt]
    );

    const handleMouseEnter = useCallback(() => {
      if (enableTilt && hoverable) setHovering(true);
    }, [enableTilt, hoverable]);

    const handleMouseLeave = useCallback(() => {
      setTiltState({ x: 0, y: 0 });
      setHovering(false);
    }, []);

    const glowColor = GLOW_COLORS[glow] || GLOW_COLORS.none;

    const tiltTransform =
      enableTilt && hoverable
        ? `perspective(600px) rotateX(${tiltState.x}deg) rotateY(${tiltState.y}deg)`
        : undefined;

    const tiltShadow =
      enableTilt && hoverable && hovering
        ? `0 14px 32px -8px ${glowColor}, 0 4px 8px rgba(0,0,0,0.3)`
        : undefined;

    const tiltTransition =
      enableTilt && hoverable
        ? hovering
          ? "transform 0.1s ease-out, box-shadow 0.2s ease-out"
          : "transform 0.4s ease-out, box-shadow 0.3s ease-out"
        : undefined;

    const glowStyles = {
      pink: "hover:border-[rgba(107,91,255,0.3)] hover:shadow-[0_8px_32px_rgba(107,91,255,0.2)]",
      cyan: "hover:border-token-cyan/30 hover:shadow-[0_8px_32px_rgba(0,240,255,0.15)]",
      none: "hover:border-white/10 hover:shadow-[0_8px_32px_rgba(0,0,0,0.4)]",
    };

    const variantStyles = {
      default: "bg-[#0D0D1A] border border-white/5 rounded-lg overflow-hidden",
      elevated: "bg-[#151528] border border-white/5 rounded-xl overflow-hidden",
      poster: "bg-[#0D0D1A] border border-white/5 rounded-lg overflow-hidden",
    };

    const mergedStyle: React.CSSProperties = {
      ...(aspectRatio ? { aspectRatio } : {}),
      ...(tiltTransform ? { transform: tiltTransform } : {}),
      ...(tiltShadow ? { boxShadow: tiltShadow } : {}),
      ...(tiltTransition ? { transition: tiltTransition } : {}),
      ...styleProp,
    };

    if (variant === "poster" && imageUrl) {
      return (
        <div
          ref={(node) => {
            (innerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
            if (typeof ref === "function") ref(node);
            else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
          }}
          onMouseMove={handleMouseMove}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          className={cn(
            variantStyles[variant],
            hoverable && !enableTilt && glowStyles[glow],
            "transition-all duration-300 cursor-pointer group",
            className
          )}
          style={mergedStyle}
          {...props}
        >
          <div className="relative w-full h-full" style={aspectRatio ? { aspectRatio } : {}}>
            <img
              src={imageUrl}
              alt={imageAlt ?? ""}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div
              className="absolute inset-0"
              style={{
                background: "linear-gradient(180deg, transparent 40%, rgba(13,13,26,0.95) 100%)",
              }}
            />
            <div className="absolute bottom-0 left-0 right-0 p-4">{children}</div>
          </div>
        </div>
      );
    }

    return (
      <div
        ref={(node) => {
          (innerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn(
          variantStyles[variant],
          hoverable && !enableTilt && glowStyles[glow],
          "transition-all duration-300",
          className
        )}
        style={mergedStyle}
        {...props}
      >
        {children}
      </div>
    );
  }
);

AwakliCard.displayName = "AwakliCard";
