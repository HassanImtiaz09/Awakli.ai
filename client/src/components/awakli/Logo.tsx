import React from "react";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════════════
   AWAKLI LOGO SYSTEM — Kitsune Mask Identity
   Mark: AI-generated Kitsune mask (manga↔anime split) 
   Lockup: mark + wordmark (horizontal or stacked)
   Themes: dark (default), light, ink
   ═══════════════════════════════════════════════════════════════════════ */

type LogoVariant = "mark" | "horizontal" | "stacked";
type LogoTheme = "dark" | "light" | "ink";

interface LogoProps {
  variant?: LogoVariant;
  theme?: LogoTheme;
  className?: string;
  animate?: boolean;
  size?: number;
}

const LOGO_SRC = "/manus-storage/awakli-logo-anime-6_e6f954a0.png";

/* ─── Theme colour map ─────────────────────────────────────────────── */
const THEME_COLORS: Record<LogoTheme, { text: string }> = {
  dark:  { text: "#F0F0F5" },
  light: { text: "#0D0D1A" },
  ink:   { text: "#1A1A2E" },
};

/* ─── Image Mark — Kitsune Mask ──────────────────────────────────── */
function AwakliMark({ size = 40, animate = false, className }: Omit<LogoProps, "variant" | "theme">) {
  return (
    <img
      src={LOGO_SRC}
      alt="Awakli logo — Kitsune mask"
      width={size}
      height={size}
      className={cn(
        "flex-shrink-0 object-contain",
        animate && "animate-logo-entrance",
        className
      )}
      loading="eager"
    />
  );
}

/* ─── Wordmark — Orbitron display font ───────────────────────────── */
function Wordmark({ theme = "dark", className }: { theme?: LogoTheme; className?: string }) {
  const c = THEME_COLORS[theme];
  return (
    <span
      className={cn("font-display font-bold tracking-widest select-none uppercase", className)}
      style={{ color: c.text, fontFamily: "'Orbitron', sans-serif" }}
    >
      AWAKLI
    </span>
  );
}

/* ─── Exported Logo Component ─────────────────────────────────────── */
export function Logo({
  variant = "horizontal",
  theme = "dark",
  className,
  animate = false,
  size = 40,
}: LogoProps) {
  if (variant === "mark") {
    return <AwakliMark size={size} animate={animate} className={className} />;
  }

  if (variant === "stacked") {
    return (
      <div className={cn("flex flex-col items-center gap-1", className)}>
        <AwakliMark size={size} animate={animate} />
        <Wordmark theme={theme} className="text-lg" />
      </div>
    );
  }

  /* horizontal (default) */
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <AwakliMark size={size} animate={animate} />
      <Wordmark theme={theme} className="text-xl" />
    </div>
  );
}

export default Logo;
