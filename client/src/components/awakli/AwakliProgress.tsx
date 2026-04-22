import { motion } from "framer-motion";
import React from "react";
import { cn } from "@/lib/utils";

interface AwakliProgressProps {
  value: number; // 0–100
  max?: number;
  variant?: "pink" | "cyan" | "gold";
  size?: "sm" | "md" | "lg";
  label?: string;
  showValue?: boolean;
  className?: string;
  animated?: boolean;
}

const variantGradient = {
  pink: "linear-gradient(90deg, #00F0FF, #6B5BFF)",
  cyan: "linear-gradient(90deg, #00F0FF, #0099CC)",
  gold: "linear-gradient(90deg, #FFD60A, #FF8C00)",
};

const sizeHeight = { sm: "h-1", md: "h-2", lg: "h-3" };

export function AwakliProgress({
  value,
  max = 100,
  variant = "pink",
  size = "md",
  label,
  showValue = false,
  className,
  animated = true,
}: AwakliProgressProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={cn("w-full space-y-1", className)}>
      {(label || showValue) && (
        <div className="flex justify-between items-center">
          {label && <span className="text-xs text-[#9494B8]">{label}</span>}
          {showValue && <span className="text-xs font-mono text-[#9494B8]">{Math.round(pct)}%</span>}
        </div>
      )}
      <div className={cn("w-full bg-[#1C1C35] rounded-full overflow-hidden", sizeHeight[size])}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: variantGradient[variant] }}
          initial={animated ? { width: 0 } : { width: `${pct}%` }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}
