import { motion } from "framer-motion";
import React from "react";
import { cn } from "@/lib/utils";

interface AwakliCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated" | "poster";
  glow?: "pink" | "cyan" | "none";
  hoverable?: boolean;
  aspectRatio?: string;
  imageUrl?: string;
  imageAlt?: string;
}

export const AwakliCard = React.forwardRef<HTMLDivElement, AwakliCardProps>(
  ({ variant = "default", glow = "none", hoverable = true, aspectRatio, imageUrl, imageAlt, className, children, ...props }, ref) => {
    const glowStyles = {
      pink: "hover:border-[rgba(233,69,96,0.3)] hover:shadow-[0_8px_32px_rgba(233,69,96,0.2)]",
      cyan: "hover:border-[rgba(0,212,255,0.3)] hover:shadow-[0_8px_32px_rgba(0,212,255,0.15)]",
      none: "hover:border-white/10 hover:shadow-[0_8px_32px_rgba(0,0,0,0.4)]",
    };

    const variantStyles = {
      default: "bg-[#0D0D1A] border border-white/5 rounded-lg overflow-hidden",
      elevated: "bg-[#151528] border border-white/5 rounded-xl overflow-hidden",
      poster: "bg-[#0D0D1A] border border-white/5 rounded-lg overflow-hidden",
    };

    if (variant === "poster" && imageUrl) {
      return (
        <motion.div
          ref={ref}
          whileHover={hoverable ? { y: -4, scale: 1.01 } : {}}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className={cn(
            variantStyles[variant],
            hoverable && glowStyles[glow],
            "transition-all duration-300 cursor-pointer group",
            className
          )}
          style={aspectRatio ? { aspectRatio } : {}}
          {...(props as React.ComponentPropsWithoutRef<typeof motion.div>)}
        >
          <div className="relative w-full h-full" style={aspectRatio ? { aspectRatio } : {}}>
            <img
              src={imageUrl}
              alt={imageAlt ?? ""}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(180deg, transparent 40%, rgba(13,13,26,0.95) 100%)" }}
            />
            <div className="absolute bottom-0 left-0 right-0 p-4">{children}</div>
          </div>
        </motion.div>
      );
    }

    return (
      <motion.div
        ref={ref}
        whileHover={hoverable ? { y: -2 } : {}}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className={cn(
          variantStyles[variant],
          hoverable && glowStyles[glow],
          "transition-all duration-300",
          className
        )}
        {...(props as React.ComponentPropsWithoutRef<typeof motion.div>)}
      >
        {children}
      </motion.div>
    );
  }
);

AwakliCard.displayName = "AwakliCard";
