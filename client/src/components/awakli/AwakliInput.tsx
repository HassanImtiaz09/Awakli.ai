import React from "react";
import { cn } from "@/lib/utils";

interface AwakliInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
}

export const AwakliInput = React.forwardRef<HTMLInputElement, AwakliInputProps>(
  ({ label, error, hint, icon, iconPosition = "left", className, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="space-y-1.5 w-full">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-[#9494B8]">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && iconPosition === "left" && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5C5C7A] pointer-events-none">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              "w-full bg-[#151528] border border-white/10 rounded-lg",
              "text-[#F0F0F5] placeholder:text-[#5C5C7A]",
              "px-4 py-2.5 text-sm",
              "transition-all duration-200",
              "focus:outline-none focus:border-[#00D4FF] focus:ring-2 focus:ring-[rgba(0,212,255,0.2)]",
              error && "border-[#E74C3C] focus:border-[#E74C3C] focus:ring-[rgba(231,76,60,0.2)]",
              icon && iconPosition === "left" && "pl-10",
              icon && iconPosition === "right" && "pr-10",
              className
            )}
            {...props}
          />
          {icon && iconPosition === "right" && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5C5C7A] pointer-events-none">
              {icon}
            </div>
          )}
        </div>
        {error && <p className="text-xs text-[#E74C3C]">{error}</p>}
        {hint && !error && <p className="text-xs text-[#5C5C7A]">{hint}</p>}
      </div>
    );
  }
);
AwakliInput.displayName = "AwakliInput";

interface AwakliTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const AwakliTextarea = React.forwardRef<HTMLTextAreaElement, AwakliTextareaProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="space-y-1.5 w-full">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-[#9494B8]">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          className={cn(
            "w-full bg-[#151528] border border-white/10 rounded-lg",
            "text-[#F0F0F5] placeholder:text-[#5C5C7A]",
            "px-4 py-3 text-sm resize-y min-h-[100px]",
            "transition-all duration-200",
            "focus:outline-none focus:border-[#00D4FF] focus:ring-2 focus:ring-[rgba(0,212,255,0.2)]",
            error && "border-[#E74C3C] focus:border-[#E74C3C] focus:ring-[rgba(231,76,60,0.2)]",
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-[#E74C3C]">{error}</p>}
        {hint && !error && <p className="text-xs text-[#5C5C7A]">{hint}</p>}
      </div>
    );
  }
);
AwakliTextarea.displayName = "AwakliTextarea";
