import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface AwakliButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
  asChild?: boolean;
}

const variantStyles: Record<Variant, string> = {
  primary: [
    "bg-opening-sequence",
    "text-white font-semibold",
    "border border-transparent",
    "shadow-[0_0_0_0_rgba(0,240,255,0)]",
    "hover:shadow-[0_0_20px_rgba(0,240,255,0.4),0_0_40px_rgba(107,91,255,0.25)]",
    "hover:brightness-110",
    "active:scale-[0.98]",
  ].join(" "),
  secondary: [
    "bg-transparent",
    "text-[#00F0FF] font-semibold",
    "border border-[#00F0FF]",
    "hover:bg-[rgba(0,212,255,0.1)]",
    "hover:shadow-[0_0_16px_rgba(0,212,255,0.3)]",
    "active:scale-[0.98]",
  ].join(" "),
  ghost: [
    "bg-transparent",
    "text-[#9494B8]",
    "border border-transparent",
    "hover:bg-[#1C1C35]",
    "hover:text-[#F0F0F5]",
    "active:scale-[0.98]",
  ].join(" "),
  danger: [
    "bg-transparent",
    "text-[#E74C3C] font-semibold",
    "border border-[#E74C3C]",
    "hover:bg-[rgba(231,76,60,0.1)]",
    "hover:shadow-[0_0_16px_rgba(231,76,60,0.3)]",
    "active:scale-[0.98]",
  ].join(" "),
};

const sizeStyles: Record<Size, string> = {
  sm: "h-8 px-4 text-sm gap-1.5",
  md: "h-10 px-6 text-base gap-2",
  lg: "h-12 px-8 text-lg gap-2.5",
};

export const AwakliButton = React.forwardRef<HTMLButtonElement, AwakliButtonProps>(
  ({ variant = "primary", size = "md", loading, icon, iconPosition = "left", className, children, disabled, ...props }, ref) => {
    const isDisabled = disabled || loading;

    return (
      <motion.button
        ref={ref}
        whileHover={!isDisabled ? { scale: 1.02 } : {}}
        whileTap={!isDisabled ? { scale: 0.98 } : {}}
        transition={{ duration: 0.15, ease: "easeOut" }}
        className={cn(
          "inline-flex items-center justify-center rounded-full",
          "transition-all duration-200 ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F0FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#08080F]",
          "disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none",
          "select-none whitespace-nowrap",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        disabled={isDisabled}
        {...(props as React.ComponentPropsWithoutRef<typeof motion.button>)}
      >
        {loading ? (
          <Loader2 className="animate-spin shrink-0" size={size === "sm" ? 14 : size === "lg" ? 20 : 16} />
        ) : (
          icon && iconPosition === "left" && <span className="shrink-0">{icon}</span>
        )}
        {children}
        {!loading && icon && iconPosition === "right" && <span className="shrink-0">{icon}</span>}
      </motion.button>
    );
  }
);

AwakliButton.displayName = "AwakliButton";
