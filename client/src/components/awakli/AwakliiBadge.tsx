import React from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "pink" | "cyan" | "gold" | "success" | "warning" | "error" | "action" | "romance" | "scifi" | "fantasy" | "horror" | "comedy";

interface AwakliiBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: "sm" | "md";
}

const variantStyles: Record<BadgeVariant, string> = {
  default:  "bg-[#1C1C35] text-[#9494B8] border border-white/10",
  pink:     "bg-[rgba(107,91,255,0.15)] text-[#00F0FF] border border-[rgba(107,91,255,0.2)]",
  cyan:     "bg-token-cyan/15 text-token-cyan border border-token-cyan/20",
  gold:     "bg-[rgba(255,184,0,0.15)] text-[#FFD60A] border border-[rgba(255,184,0,0.2)]",
  success:  "bg-[rgba(46,204,113,0.15)] text-[#2ECC71] border border-[rgba(46,204,113,0.2)]",
  warning:  "bg-[rgba(243,156,18,0.15)] text-[#F39C12] border border-[rgba(243,156,18,0.2)]",
  error:    "bg-[rgba(231,76,60,0.15)] text-[#E74C3C] border border-[rgba(231,76,60,0.2)]",
  action:   "badge-action border border-[rgba(255,68,68,0.2)]",
  romance:  "badge-romance border border-[rgba(255,105,180,0.2)]",
  scifi:    "badge-scifi border border-token-cyan/20",
  fantasy:  "badge-fantasy border border-[rgba(155,89,182,0.2)]",
  horror:   "badge-horror border border-[rgba(231,76,60,0.2)]",
  comedy:   "badge-comedy border border-[rgba(243,156,18,0.2)]",
};

export function AwakliiBadge({ variant = "default", size = "sm", className, children, ...props }: AwakliiBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium",
        "uppercase tracking-wider",
        size === "sm" ? "px-2.5 py-0.5 text-[10px]" : "px-3 py-1 text-xs",
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export function JobStatusBadge({ status }: { status: string }) {
  const map: Record<string, BadgeVariant> = {
    pending:    "warning",
    processing: "cyan",
    completed:  "success",
    failed:     "error",
    queued:     "default",
  };
  return <AwakliiBadge variant={map[status] ?? "default"}>{status}</AwakliiBadge>;
}
