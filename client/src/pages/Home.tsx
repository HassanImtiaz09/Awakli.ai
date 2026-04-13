import { motion, useInView } from "framer-motion";
import {
  ArrowRight, Sparkles, Zap, Shield, Film, Upload, Layers, ChevronRight, Check
} from "lucide-react";
import React, { useRef } from "react";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { AwakliButton } from "@/components/awakli/AwakliButton";
import { AwakliCard } from "@/components/awakli/AwakliCard";
import { AwakliiBadge } from "@/components/awakli/AwakliiBadge";
import { StarField } from "@/components/awakli/StarField";
import { MarketingLayout } from "@/components/awakli/Layouts";
import { StaggerGrid, StaggerItem } from "@/components/awakli/StaggerGrid";

// ─── Scroll Reveal ─────────────────────────────────────────────────────────

function ScrollReveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ─── Feature data ──────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: <Upload size={24} />,
    title: "Upload Any Manga",
    description: "Drag and drop manga pages or panels in any format. Our pipeline handles the rest — panel detection, character recognition, and scene analysis.",
    color: "pink",
  },
  {
    icon: <Zap size={24} />,
    title: "AI-Powered Conversion",
    description: "State-of-the-art diffusion models transform static manga panels into fluid, expressive anime-style frames with consistent character designs.",
    color: "cyan",
  },
  {
    icon: <Film size={24} />,
    title: "Cinematic Output",
    description: "Export studio-quality anime frames with proper aspect ratios, dynamic lighting, and motion blur — ready for animation or streaming.",
    color: "gold",
  },
  {
    icon: <Layers size={24} />,
    title: "Project Management",
    description: "Organize your manga projects, track processing jobs in real-time, and manage multiple series from a single creator dashboard.",
    color: "pink",
  },
  {
    icon: <Shield size={24} />,
    title: "Secure & Private",
    description: "Your uploads are encrypted and stored securely. Full control over visibility — keep projects private or share with the community.",
    color: "cyan",
  },
  {
    icon: <Sparkles size={24} />,
    title: "Style Customization",
    description: "Choose from multiple anime art styles — classic shonen, modern seinen, soft shoujo — and fine-tune color grading and line weight.",
    color: "gold",
  },
];

const HOW_IT_WORKS = [
  { step: "01", title: "Upload Manga Panels", desc: "Upload your manga pages or individual panels. We support JPG, PNG, WebP, and PDF formats." },
  { step: "02", title: "AI Analyzes & Processes", desc: "Our pipeline detects panels, identifies characters, and prepares each frame for style transfer." },
  { step: "03", title: "Anime Frames Generated", desc: "Diffusion models render each panel as a high-quality anime-style frame with consistent aesthetics." },
  { step: "04", title: "Download & Share", desc: "Preview results, download individual frames or full sequences, and share your creations." },
];

const PRICING = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Perfect for trying out the platform",
    features: ["5 manga uploads/month", "Up to 20 panels per upload", "Standard processing queue", "720p output resolution", "Community support"],
    cta: "Get Started Free",
    variant: "secondary" as const,
    badge: null,
  },
  {
    name: "Pro",
    price: "$19",
    period: "/month",
    description: "For serious manga creators",
    features: ["100 manga uploads/month", "Unlimited panels per upload", "Priority processing queue", "4K output resolution", "Style customization", "Email support", "API access"],
    cta: "Start Pro Trial",
    variant: "primary" as const,
    badge: "Most Popular",
    highlight: true,
  },
  {
    name: "Studio",
    price: "$79",
    period: "/month",
    description: "For studios and power creators",
    features: ["Unlimited uploads", "Unlimited panels", "Dedicated processing", "8K output resolution", "Custom style training", "Priority support", "Team collaboration", "White-label export"],
    cta: "Contact Sales",
    variant: "secondary" as const,
    badge: null,
  },
];

// ─── Landing Page ──────────────────────────────────────────────────────────

export default function Home() {
  const { isAuthenticated } = useAuth();

  return (
    <MarketingLayout>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center overflow-hidden pt-16">
        {/* Background */}
        <div className="absolute inset-0" style={{ background: "var(--gradient-hero)" }} />
        <StarField count={150} />

        {/* Glow orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-20"
          style={{ background: "radial-gradient(ellipse, #E94560 0%, transparent 70%)" }} />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full blur-3xl opacity-15"
          style={{ background: "radial-gradient(ellipse, #00D4FF 0%, transparent 70%)" }} />

        <div className="container relative z-10 py-24">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left: text */}
            <div className="space-y-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                <AwakliiBadge variant="cyan" size="md" className="mb-6">
                  AI-Powered Manga → Anime
                </AwakliiBadge>
              </motion.div>

              <motion.h1
                className="text-display text-[#F0F0F5] leading-tight"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
              >
                Transform Manga Into{" "}
                <span className="text-gradient-pink">Cinematic</span>{" "}
                Anime Frames
              </motion.h1>

              <motion.p
                className="text-body-lg text-[#9494B8] max-w-lg"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.35 }}
              >
                Upload manga panels and watch our AI pipeline render stunning anime-style frames in seconds. Professional quality, instant results.
              </motion.p>

              <motion.div
                className="flex flex-wrap gap-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.5 }}
              >
                {isAuthenticated ? (
                  <Link href="/studio/upload">
                    <AwakliButton variant="primary" size="lg" icon={<ArrowRight size={18} />} iconPosition="right">
                      Start Creating
                    </AwakliButton>
                  </Link>
                ) : (
                  <a href={getLoginUrl()}>
                    <AwakliButton variant="primary" size="lg" icon={<ArrowRight size={18} />} iconPosition="right">
                      Start for Free
                    </AwakliButton>
                  </a>
                )}
                <Link href="/discover">
                  <AwakliButton variant="secondary" size="lg">
                    Browse Gallery
                  </AwakliButton>
                </Link>
              </motion.div>

              <motion.div
                className="flex items-center gap-6 text-sm text-[#5C5C7A]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.7 }}
              >
                <span className="flex items-center gap-1.5"><Check size={14} className="text-[#2ECC71]" /> No credit card required</span>
                <span className="flex items-center gap-1.5"><Check size={14} className="text-[#2ECC71]" /> 5 free uploads</span>
                <span className="flex items-center gap-1.5"><Check size={14} className="text-[#2ECC71]" /> Cancel anytime</span>
              </motion.div>
            </div>

            {/* Right: demo visual */}
            <motion.div
              className="relative hidden lg:block"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.3 }}
            >
              <HeroDemoVisual />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Stats bar ─────────────────────────────────────────────────── */}
      <ScrollReveal>
        <section className="border-y border-white/5 bg-[#0D0D1A]">
          <div className="container py-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {[
                { value: "50K+", label: "Manga Panels Processed" },
                { value: "2.4K+", label: "Active Creators" },
                { value: "99.2%", label: "Uptime SLA" },
                { value: "<30s", label: "Avg. Processing Time" },
              ].map((stat) => (
                <div key={stat.label} className="text-center">
                  <div className="text-h2 text-gradient-pink font-bold mb-1">{stat.value}</div>
                  <div className="text-sm text-[#5C5C7A]">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </ScrollReveal>

      {/* ── Features ──────────────────────────────────────────────────── */}
      <section className="py-32 relative overflow-hidden">
        <div className="absolute inset-0 opacity-30"
          style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(0,212,255,0.08) 0%, transparent 60%)" }} />
        <div className="container relative z-10">
          <ScrollReveal className="text-center mb-16">
            <AwakliiBadge variant="pink" size="md" className="mb-4">Features</AwakliiBadge>
            <h2 className="text-h1 text-[#F0F0F5] mb-4">Everything You Need to Create</h2>
            <p className="text-body-lg text-[#9494B8] max-w-2xl mx-auto">
              From raw manga scans to polished anime frames — our platform handles the entire production pipeline.
            </p>
          </ScrollReveal>

          <StaggerGrid className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature) => (
              <StaggerItem key={feature.title}>
                <AwakliCard variant="elevated" glow={feature.color as "pink" | "cyan"} className="p-6 h-full">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${
                    feature.color === "pink"
                      ? "bg-[rgba(233,69,96,0.15)] text-[#E94560]"
                      : feature.color === "cyan"
                      ? "bg-[rgba(0,212,255,0.15)] text-[#00D4FF]"
                      : "bg-[rgba(255,184,0,0.15)] text-[#FFB800]"
                  }`}>
                    {feature.icon}
                  </div>
                  <h3 className="text-h3 text-[#F0F0F5] mb-2">{feature.title}</h3>
                  <p className="text-sm text-[#9494B8] leading-relaxed">{feature.description}</p>
                </AwakliCard>
              </StaggerItem>
            ))}
          </StaggerGrid>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────── */}
      <section className="py-32 bg-[#0D0D1A] relative overflow-hidden">
        <div className="absolute inset-0 opacity-20"
          style={{ background: "radial-gradient(ellipse at 50% 100%, rgba(233,69,96,0.1) 0%, transparent 60%)" }} />
        <div className="container relative z-10">
          <ScrollReveal className="text-center mb-16">
            <AwakliiBadge variant="gold" size="md" className="mb-4">How It Works</AwakliiBadge>
            <h2 className="text-h1 text-[#F0F0F5] mb-4">From Panel to Frame in 4 Steps</h2>
          </ScrollReveal>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 relative">
            {/* Connector line */}
            <div className="hidden lg:block absolute top-8 left-[12.5%] right-[12.5%] h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            {HOW_IT_WORKS.map((step, i) => (
              <ScrollReveal key={step.step} delay={i * 0.1} className="relative text-center">
                <div className="w-16 h-16 rounded-full bg-[#151528] border border-white/10 flex items-center justify-center mx-auto mb-4 relative z-10">
                  <span className="font-mono text-sm font-bold text-gradient-cyan">{step.step}</span>
                </div>
                <h3 className="text-base font-semibold text-[#F0F0F5] mb-2">{step.title}</h3>
                <p className="text-sm text-[#9494B8] leading-relaxed">{step.desc}</p>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ───────────────────────────────────────────────────── */}
      <section id="pricing" className="py-32 relative overflow-hidden">
        <div className="absolute inset-0 opacity-25"
          style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(155,89,182,0.08) 0%, transparent 70%)" }} />
        <div className="container relative z-10">
          <ScrollReveal className="text-center mb-16">
            <AwakliiBadge variant="cyan" size="md" className="mb-4">Pricing</AwakliiBadge>
            <h2 className="text-h1 text-[#F0F0F5] mb-4">Simple, Transparent Pricing</h2>
            <p className="text-body-lg text-[#9494B8]">Start free. Scale as you create.</p>
          </ScrollReveal>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {PRICING.map((plan, i) => (
              <ScrollReveal key={plan.name} delay={i * 0.1}>
                <div className={`relative rounded-2xl border p-8 h-full flex flex-col ${
                  plan.highlight
                    ? "bg-gradient-to-b from-[rgba(233,69,96,0.08)] to-[#0D0D1A] border-[rgba(233,69,96,0.3)] shadow-[0_0_40px_rgba(233,69,96,0.1)]"
                    : "bg-[#0D0D1A] border-white/5"
                }`}>
                  {plan.badge && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <AwakliiBadge variant="pink" size="md">{plan.badge}</AwakliiBadge>
                    </div>
                  )}
                  <div className="mb-6">
                    <h3 className="text-lg font-bold text-[#F0F0F5] mb-1">{plan.name}</h3>
                    <div className="flex items-baseline gap-1 mb-2">
                      <span className="text-4xl font-bold text-[#F0F0F5]">{plan.price}</span>
                      <span className="text-[#5C5C7A] text-sm">{plan.period}</span>
                    </div>
                    <p className="text-sm text-[#9494B8]">{plan.description}</p>
                  </div>

                  <ul className="space-y-3 mb-8 flex-1">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2.5 text-sm text-[#9494B8]">
                        <Check size={14} className="text-[#2ECC71] shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <a href={getLoginUrl()}>
                    <AwakliButton variant={plan.variant} size="md" className="w-full">
                      {plan.cta}
                    </AwakliButton>
                  </a>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────── */}
      <ScrollReveal>
        <section className="py-24 relative overflow-hidden">
          <div className="absolute inset-0"
            style={{ background: "linear-gradient(135deg, rgba(233,69,96,0.08) 0%, rgba(0,212,255,0.05) 100%)" }} />
          <div className="container relative z-10 text-center">
            <h2 className="text-h1 text-[#F0F0F5] mb-4">
              Ready to Bring Your Manga to Life?
            </h2>
            <p className="text-body-lg text-[#9494B8] mb-8 max-w-xl mx-auto">
              Join thousands of creators already using Awakli to transform their manga into stunning anime-style frames.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <a href={getLoginUrl()}>
                <AwakliButton variant="primary" size="lg" icon={<ArrowRight size={18} />} iconPosition="right">
                  Start Creating Free
                </AwakliButton>
              </a>
              <Link href="/discover">
                <AwakliButton variant="ghost" size="lg">
                  View Gallery <ChevronRight size={16} className="ml-1" />
                </AwakliButton>
              </Link>
            </div>
          </div>
        </section>
      </ScrollReveal>
    </MarketingLayout>
  );
}

// ─── Hero Demo Visual ──────────────────────────────────────────────────────

function HeroDemoVisual() {
  return (
    <div className="relative w-full max-w-lg mx-auto">
      {/* Main card */}
      <motion.div
        className="relative bg-[#0D0D1A] border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      >
        {/* Mock manga panel → anime frame */}
        <div className="grid grid-cols-2 gap-0">
          <div className="relative aspect-[3/4] bg-[#151528] flex items-center justify-center border-r border-white/5">
            <div className="text-center p-4">
              <div className="w-16 h-16 mx-auto mb-3 rounded-lg bg-[#1C1C35] flex items-center justify-center">
                <Layers size={28} className="text-[#5C5C7A]" />
              </div>
              <p className="text-xs text-[#5C5C7A]">Manga Panel</p>
              <div className="mt-2 space-y-1">
                {[80, 60, 90, 50].map((w, i) => (
                  <div key={i} className="h-1 bg-[#1C1C35] rounded" style={{ width: `${w}%` }} />
                ))}
              </div>
            </div>
          </div>
          <div className="relative aspect-[3/4] flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #1A0A2E, #0D1A2E)" }}>
            <div className="text-center p-4">
              <div className="w-16 h-16 mx-auto mb-3 rounded-lg bg-[rgba(233,69,96,0.15)] flex items-center justify-center">
                <Sparkles size={28} className="text-[#E94560]" />
              </div>
              <p className="text-xs text-[#E94560]">Anime Frame</p>
              <div className="mt-2 space-y-1">
                {[90, 70, 85, 65].map((w, i) => (
                  <div key={i} className="h-1 rounded"
                    style={{ width: `${w}%`, background: "linear-gradient(90deg, #E94560, #FF6B81)" }} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="p-4 border-t border-white/5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-[#9494B8]">Processing...</span>
            <span className="text-xs font-mono text-[#E94560]">78%</span>
          </div>
          <div className="h-1.5 bg-[#1C1C35] rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ background: "linear-gradient(90deg, #E94560, #FF6B81)" }}
              initial={{ width: "0%" }}
              animate={{ width: "78%" }}
              transition={{ duration: 1.5, delay: 0.5, ease: "easeOut" }}
            />
          </div>
        </div>
      </motion.div>

      {/* Floating badges */}
      <motion.div
        className="absolute -top-4 -right-4 bg-[#151528] border border-white/10 rounded-xl px-3 py-2 shadow-xl"
        animate={{ y: [0, -4, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#2ECC71] animate-pulse" />
          <span className="text-xs text-[#9494B8]">AI Processing</span>
        </div>
      </motion.div>

      <motion.div
        className="absolute -bottom-4 -left-4 bg-[#151528] border border-white/10 rounded-xl px-3 py-2 shadow-xl"
        animate={{ y: [0, 4, 0] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      >
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-[#FFB800]" />
          <span className="text-xs text-[#9494B8]">Anime Style</span>
        </div>
      </motion.div>
    </div>
  );
}
