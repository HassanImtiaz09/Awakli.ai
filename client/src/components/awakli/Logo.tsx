import React from "react";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════════════
   AWAKLI LOGO SYSTEM — UI Improvement Brief
   Mark: Bold brushstroke "A" with filled awakening-eye + speed-line accents
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

/* ─── SVG Mark — Bold Brushstroke A with filled awakening eye + speed lines ─── */
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
        <linearGradient id={`${id}-eye-grad`} x1="24" y1="24" x2="40" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={c.primary} />
          <stop offset="100%" stopColor={c.secondary} />
        </linearGradient>
      </defs>

      {/* Bold brushstroke "A" — thick strokes meeting at apex */}
      <path
        d="M10 56 L32 6 L54 56"
        stroke={`url(#${id}-grad)`}
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        className={animate ? "logo-stroke-reveal" : undefined}
        style={animate ? { strokeDasharray: 140, strokeDashoffset: 140 } : undefined}
      />

      {/* Bold crossbar */}
      <path
        d="M18 42 L46 42"
        stroke={`url(#${id}-grad)`}
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
        className={animate ? "logo-stroke-reveal logo-stroke-delay" : undefined}
        style={animate ? { strokeDasharray: 34, strokeDashoffset: 34 } : undefined}
      />

      {/* Filled awakening eye — bold almond shape at the apex */}
      <path
        d="M24 26 Q28 19 32 19 Q36 19 40 26 Q36 33 32 33 Q28 33 24 26 Z"
        fill={`url(#${id}-eye-grad)`}
        opacity={0.9}
        className={animate ? "logo-eye-reveal" : undefined}
        style={animate ? { opacity: 0 } : undefined}
      />

      {/* Eye pupil — bright center dot */}
      <circle
        cx="32"
        cy="26"
        r="3"
        fill={theme === "dark" ? "#05050C" : "#F0F0F5"}
        className={animate ? "logo-eye-reveal" : undefined}
        style={animate ? { opacity: 0 } : undefined}
      />
      {/* Pupil highlight */}
      <circle
        cx="33.5"
        cy="24.5"
        r="1"
        fill={c.primary}
        opacity={0.8}
        className={animate ? "logo-eye-reveal" : undefined}
        style={animate ? { opacity: 0 } : undefined}
      />

      {/* Speed-line accents — kinetic energy radiating from apex */}
      <line
        x1="42" y1="10" x2="50" y2="4"
        stroke={c.primary}
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity={0.6}
        className={animate ? "logo-eye-reveal" : undefined}
        style={animate ? { opacity: 0 } : undefined}
      />
      <line
        x1="46" y1="16" x2="54" y2="12"
        stroke={c.secondary}
        strokeWidth="2"
        strokeLinecap="round"
        opacity={0.4}
        className={animate ? "logo-eye-reveal" : undefined}
        style={animate ? { opacity: 0 } : undefined}
      />
    </svg>
  );
}

/* ─── Wordmark — now uses Bebas Neue display font ────────────────── */
function Wordmark({ theme = "dark", className }: { theme?: LogoTheme; className?: string }) {
  const c = THEME_COLORS[theme];
  return (
    <span
      className={cn("font-display font-normal tracking-wider select-none uppercase", className)}
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
