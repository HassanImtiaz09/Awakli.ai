import React from "react";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════════════
   AWAKLI LOGO SYSTEM — B2 Brand Refresh
   Mark: Brushstroke "A" with awakening-eye motif
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

/* ─── Theme colour map ─────────────────────────────────────────────── */
const THEME_COLORS: Record<LogoTheme, { primary: string; secondary: string; text: string }> = {
  dark:  { primary: "#00F0FF", secondary: "#6B5BFF", text: "#F0F0F5" },
  light: { primary: "#0090A0", secondary: "#5040CC", text: "#0D0D1A" },
  ink:   { primary: "#1A1A2E", secondary: "#1A1A2E", text: "#1A1A2E" },
};

/* ─── SVG Mark — Brushstroke A with awakening eye ─────────────────── */
function AwakliMark({ theme = "dark", size = 40, animate = false, className }: Omit<LogoProps, "variant">) {
  const c = THEME_COLORS[theme];
  const id = React.useId();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("flex-shrink-0", className)}
      aria-label="Awakli logo mark"
    >
      <defs>
        <linearGradient id={`${id}-grad`} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={c.primary} />
          <stop offset="100%" stopColor={c.secondary} />
        </linearGradient>
      </defs>

      {/* Brushstroke "A" — two bold strokes meeting at apex */}
      <path
        d="M12 54 L32 8 L52 54"
        stroke={`url(#${id}-grad)`}
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        className={animate ? "logo-stroke-reveal" : undefined}
        style={animate ? { strokeDasharray: 120, strokeDashoffset: 120 } : undefined}
      />

      {/* Crossbar */}
      <path
        d="M20 40 L44 40"
        stroke={`url(#${id}-grad)`}
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
        className={animate ? "logo-stroke-reveal logo-stroke-delay" : undefined}
        style={animate ? { strokeDasharray: 30, strokeDashoffset: 30 } : undefined}
      />

      {/* Awakening eye — almond shape at the apex */}
      <ellipse
        cx="32"
        cy="26"
        rx="7"
        ry="4.5"
        stroke={c.primary}
        strokeWidth="2"
        fill="none"
        className={animate ? "logo-eye-reveal" : undefined}
        style={animate ? { opacity: 0 } : undefined}
      />
      {/* Eye pupil */}
      <circle
        cx="32"
        cy="26"
        r="2"
        fill={c.primary}
        className={animate ? "logo-eye-reveal" : undefined}
        style={animate ? { opacity: 0 } : undefined}
      />
    </svg>
  );
}

/* ─── Wordmark ────────────────────────────────────────────────────── */
function Wordmark({ theme = "dark", className }: { theme?: LogoTheme; className?: string }) {
  const c = THEME_COLORS[theme];
  return (
    <span
      className={cn("font-heading font-bold tracking-tight select-none", className)}
      style={{ color: c.text }}
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
    return <AwakliMark theme={theme} size={size} animate={animate} className={className} />;
  }

  if (variant === "stacked") {
    return (
      <div className={cn("flex flex-col items-center gap-1", className)}>
        <AwakliMark theme={theme} size={size} animate={animate} />
        <Wordmark theme={theme} className="text-lg" />
      </div>
    );
  }

  /* horizontal (default) */
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <AwakliMark theme={theme} size={size} animate={animate} />
      <Wordmark theme={theme} className="text-xl" />
    </div>
  );
}

export default Logo;
