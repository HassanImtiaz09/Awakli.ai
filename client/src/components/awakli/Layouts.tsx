import { motion } from "framer-motion";
import React from "react";
import { TopNav } from "./TopNav";
import { StudioSidebar } from "./StudioSidebar";
import { MarketingFooter } from "./MarketingFooter";

// ─── Page Transition Wrapper ────────────────────────────────────────────────

export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

// ─── Marketing Layout (landing, pricing, auth) ───────────────────────────────

export function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-[#08080F]">
      <TopNav />
      <main className="flex-1">
        <PageTransition>{children}</PageTransition>
      </main>
      <MarketingFooter />
    </div>
  );
}

// ─── Platform Layout (discover, browse) ─────────────────────────────────────

export function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-[#08080F]">
      <TopNav />
      <main className="flex-1 pt-16">
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}

// ─── Studio Layout (creator tools) ──────────────────────────────────────────

export function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen flex overflow-hidden bg-[#08080F]">
      <StudioSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopNav />
        <main className="flex-1 overflow-y-auto pt-16">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}
