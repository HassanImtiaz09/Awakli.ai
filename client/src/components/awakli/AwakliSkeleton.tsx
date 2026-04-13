import React from "react";
import { cn } from "@/lib/utils";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "rect" | "circle" | "text";
  lines?: number;
}

export function AwakliSkeleton({ variant = "rect", lines = 1, className, style, ...props }: SkeletonProps) {
  if (variant === "text") {
    return (
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={cn("skeleton-shimmer rounded", className)}
            style={{ height: "1em", width: i === lines - 1 && lines > 1 ? "70%" : "100%", ...style }}
            {...props}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "skeleton-shimmer",
        variant === "circle" ? "rounded-full" : "rounded-lg",
        className
      )}
      style={style}
      {...props}
    />
  );
}

export function AwakliCardSkeleton() {
  return (
    <div className="bg-[#0D0D1A] border border-white/5 rounded-lg overflow-hidden p-4 space-y-3">
      <AwakliSkeleton className="w-full h-40" />
      <AwakliSkeleton variant="text" lines={2} />
      <div className="flex gap-2">
        <AwakliSkeleton className="h-6 w-16 rounded-full" />
        <AwakliSkeleton className="h-6 w-16 rounded-full" />
      </div>
    </div>
  );
}

export function AwakliPosterSkeleton() {
  return (
    <div className="bg-[#0D0D1A] border border-white/5 rounded-lg overflow-hidden" style={{ aspectRatio: "2/3" }}>
      <AwakliSkeleton className="w-full h-full rounded-none" />
    </div>
  );
}
