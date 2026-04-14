import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Check, X, Crown, Zap, Sparkles, ArrowRight, ChevronDown,
  Film, Palette, Mic, Download, Shield, Users, Star, Wand2,
  PenTool, Upload, Lock,
} from "lucide-react";
import { MarketingLayout } from "@/components/awakli/Layouts";
import { toast } from "sonner";

type BillingInterval = "monthly" | "annual";

const TIERS = [
  {
    key: "free",
    name: "Free",
    monthlyPrice: 0,
    annualMonthlyPrice: 0,
    tagline: "Start creating manga from your ideas",
    icon: Sparkles,
    accent: "from-gray-500 to-gray-600",
    borderAccent: "border-white/5",
    ctaText: "Start Creating Free",
    ctaStyle: "border border-white/10 text-white hover:bg-white/5",
    highlights: [
      { icon: PenTool, text: "3 manga projects" },
      { icon: Wand2, text: "AI script generation (Sonnet)" },
      { icon: Palette, text: "20 panels per chapter" },
      { icon: Users, text: "Publish & earn community votes" },
      { icon: Film, text: "1 free anime preview" },
    ],
    limits: [
      { label: "3 chapters per project" },
      { label: "Watermarked panels" },
      { label: "No anime episodes" },
      { label: "No export" },
    ],
  },
  {
    key: "creator",
    name: "Creator",
    monthlyPrice: 19,
    annualMonthlyPrice: 15,
    tagline: "For serious storytellers who want anime",
    icon: Zap,
    accent: "from-[#E94560] to-[#FF6B81]",
    borderAccent: "border-accent-pink/40 ring-1 ring-accent-pink/20",
    popular: true,
    ctaText: "Upgrade to Creator",
    ctaStyle: "bg-gradient-to-r from-[#E94560] to-[#FF6B81] text-white shadow-lg shadow-accent-pink/20 hover:shadow-accent-pink/40",
    highlights: [
      { icon: PenTool, text: "10 manga projects" },
      { icon: Wand2, text: "AI script generation (Opus)" },
      { icon: Palette, text: "30 panels per chapter" },
      { icon: Film, text: "5 anime episodes/month" },
      { icon: Mic, text: "2 voice clones" },
      { icon: Download, text: "Export manga (PDF, PNG)" },
      { icon: Star, text: "80% revenue share" },
    ],
    limits: [],
  },
  {
    key: "studio",
    name: "Studio",
    monthlyPrice: 49,
    annualMonthlyPrice: 39,
    tagline: "Full pipeline control. Upload your own manga.",
    icon: Crown,
    accent: "from-[#00D4FF] to-[#0099CC]",
    borderAccent: "border-accent-cyan/30 ring-1 ring-accent-cyan/10",
    ctaText: "Go Studio",
    ctaStyle: "bg-gradient-to-r from-[#00D4FF] to-[#0099CC] text-white shadow-lg shadow-accent-cyan/20 hover:shadow-accent-cyan/40",
    highlights: [
      { icon: PenTool, text: "Unlimited projects" },
      { icon: Wand2, text: "AI script generation (Opus)" },
      { icon: Palette, text: "Unlimited panels" },
      { icon: Film, text: "20 anime episodes/month" },
      { icon: Mic, text: "Unlimited voice clones" },
      { icon: Upload, text: "Upload your own manga" },
      { icon: Download, text: "Export all formats (4K, ProRes)" },
      { icon: Star, text: "85% revenue share" },
      { icon: Shield, text: "Priority queue & support" },
    ],
    limits: [],
  },
];

const COMPARISON_SECTIONS = [
  {
    title: "Manga Creation",
    rows: [
      { label: "Projects", free: "3", creator: "10", studio: "Unlimited" },
      { label: "Chapters per project", free: "3", creator: "12", studio: "Unlimited" },
      { label: "Panels per chapter", free: "20", creator: "30", studio: "Unlimited" },
      { label: "Script AI model", free: "Claude Sonnet", creator: "Claude Opus", studio: "Claude Opus" },
      { label: "Image generation", free: "FLUX 1.1 Pro", creator: "FLUX 1.1 Pro", studio: "FLUX 1.1 Pro" },
      { label: "Upload your own manga", free: false, creator: false, studio: true },
    ],
  },
  {
    title: "Anime Production",
    rows: [
      { label: "Anime episodes/month", free: "0", creator: "5", studio: "20" },
      { label: "Free anime preview", free: "1 (one-time)", creator: "Full access", studio: "Full access" },
      { label: "Video resolution", free: "—", creator: "1080p", studio: "4K" },
      { label: "LoRA character models", free: "0", creator: "3", studio: "Unlimited" },
      { label: "Voice clones", free: "0", creator: "2", studio: "Unlimited" },
      { label: "Custom narrator voice", free: false, creator: false, studio: true },
    ],
  },
  {
    title: "Export & Monetization",
    rows: [
      { label: "Manga export (PDF/PNG)", free: false, creator: true, studio: true },
      { label: "Anime export (MP4)", free: false, creator: true, studio: true },
      { label: "ProRes / stems export", free: false, creator: false, studio: true },
      { label: "Subtitle export (SRT)", free: false, creator: true, studio: true },
      { label: "Watermark-free", free: false, creator: true, studio: true },
      { label: "Premium episodes", free: false, creator: true, studio: true },
      { label: "Revenue share", free: "—", creator: "80%", studio: "85%" },
    ],
  },
  {
    title: "Platform",
    rows: [
      { label: "Community voting", free: true, creator: true, studio: true },
      { label: "Publish to Discover", free: true, creator: true, studio: true },
      { label: "Priority generation queue", free: false, creator: false, studio: true },
      { label: "Priority support", free: false, creator: false, studio: true },
    ],
  },
];

const FAQS = [
  {
    q: "What's the difference between Free and Creator?",
    a: "Free lets you create manga from text and publish to the community. Creator unlocks anime production (5 episodes/month), voice clones, manga export, and monetization with 80% revenue share. Think of Free as your playground and Creator as your studio.",
  },
  {
    q: "What is the free anime preview?",
    a: "Every free user gets one complimentary anime preview — a 15-second clip generated from your best manga panels. It's a taste of what your story looks like animated. After that, upgrade to Creator for full anime production.",
  },
  {
    q: "How does the voting-to-anime system work?",
    a: "When you publish manga, the community votes on it. When your manga reaches the vote threshold, it becomes eligible for anime production. Creator and Studio users can then produce anime episodes from their eligible manga.",
  },
  {
    q: "Can I upgrade or downgrade anytime?",
    a: "Yes! Upgrades are prorated and take effect immediately. Downgrades apply at the end of your current billing cycle. You keep access to all features until then.",
  },
  {
    q: "What happens to my content if I downgrade?",
    a: "Your content is never deleted. You keep everything you've created. You just won't be able to create new content beyond the lower tier's limits until you upgrade again.",
  },
  {
    q: "Do I need Studio to upload my own manga?",
    a: "Yes, manga upload (bringing your own artwork for anime conversion) is a Studio-exclusive feature. Free and Creator users create manga through AI generation from text prompts.",
  },
  {
    q: "What payment methods do you accept?",
    a: "We accept all major credit cards, debit cards, and Apple Pay / Google Pay through Stripe. All payments are processed securely.",
  },
  {
    q: "Is there a refund policy?",
    a: "We offer a 7-day money-back guarantee on your first subscription. If you're not satisfied, contact support within 7 days for a full refund.",
  },
];

export default function Pricing() {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  const checkout = trpc.billing.createCheckout.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        toast.info("Redirecting to checkout...");
        window.open(data.url, "_blank");
      }
    },
    onError: (err) => {
      toast.error(err.message || "Failed to create checkout session");
    },
  });

  const handleSubscribe = (tierKey: string) => {
    if (!isAuthenticated) {
      navigate("/signup");
      return;
    }
    if (tierKey === "free") {
      navigate("/create");
      return;
    }
    checkout.mutate({ tier: tierKey as "creator" | "studio", interval });
  };

  return (
    <MarketingLayout>
      <div className="pt-28 pb-24">
        <div className="container">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-accent-pink/30 bg-accent-pink/5 text-accent-pink text-xs font-semibold mb-6">
              <Sparkles className="w-3.5 h-3.5" />
              Simple, transparent pricing
            </div>
            <h1 className="text-4xl md:text-6xl font-display font-bold text-white mb-4">
              Start Free. <span className="text-gradient-pink">Create Unlimited.</span>
            </h1>
            <p className="text-gray-400 max-w-2xl mx-auto text-lg mb-8">
              Every great anime starts with an idea. Start creating manga for free,
              then upgrade when you're ready for anime production, voice clones, and monetization.
            </p>

            {/* Billing toggle */}
            <div className="inline-flex items-center gap-3 p-1.5 rounded-full border border-white/10 bg-[#0D0D1A]">
              <button
                onClick={() => setInterval("monthly")}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                  interval === "monthly"
                    ? "bg-gradient-to-r from-[#E94560] to-[#FF6B81] text-white shadow-lg"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setInterval("annual")}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all relative ${
                  interval === "annual"
                    ? "bg-gradient-to-r from-[#E94560] to-[#FF6B81] text-white shadow-lg"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                Annual
                <span className="ml-2 text-xs text-accent-cyan font-bold">Save 20%</span>
              </button>
            </div>
          </motion.div>

          {/* Pricing cards */}
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-24">
            {TIERS.map((tier, i) => {
              const Icon = tier.icon;
              const price = interval === "annual" ? tier.annualMonthlyPrice : tier.monthlyPrice;
              return (
                <motion.div
                  key={tier.key}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  whileHover={{ y: -6 }}
                  className={`relative p-8 rounded-2xl border bg-gradient-to-b from-[#0D0D1A] to-[#08080F] transition-all ${tier.borderAccent}`}
                >
                  {tier.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-[#E94560] to-[#FF6B81] text-xs font-semibold text-white whitespace-nowrap">
                      Most Popular
                    </div>
                  )}

                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${tier.accent} flex items-center justify-center mb-4`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>

                  <h3 className="text-2xl font-heading font-bold text-white mb-1">{tier.name}</h3>
                  <p className="text-sm text-gray-500 mb-6">{tier.tagline}</p>

                  <div className="mb-8">
                    <span className="text-5xl font-display font-bold text-white">
                      ${price === 0 ? "0" : price}
                    </span>
                    <span className="text-gray-500 ml-1">
                      {price === 0 ? "/forever" : "/mo"}
                    </span>
                    {interval === "annual" && price > 0 && (
                      <p className="text-xs text-accent-cyan mt-1">
                        Billed ${price * 12}/year (save ${(tier.monthlyPrice - tier.annualMonthlyPrice) * 12}/yr)
                      </p>
                    )}
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleSubscribe(tier.key)}
                    disabled={checkout.isPending}
                    className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 ${tier.ctaStyle}`}
                  >
                    {checkout.isPending ? "Processing..." : tier.ctaText}
                  </motion.button>

                  {/* Feature highlights */}
                  <div className="mt-8 pt-6 border-t border-white/5 space-y-3">
                    {tier.highlights.map((h, j) => {
                      const HIcon = h.icon;
                      return (
                        <div key={j} className="flex items-center gap-3 text-sm">
                          <HIcon className="w-4 h-4 text-accent-pink shrink-0" />
                          <span className="text-gray-300">{h.text}</span>
                        </div>
                      );
                    })}
                    {tier.limits.map((l, j) => (
                      <div key={`l-${j}`} className="flex items-center gap-3 text-sm">
                        <Lock className="w-4 h-4 text-gray-600 shrink-0" />
                        <span className="text-gray-600">{l.label}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Anime Preview Callout */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-3xl mx-auto mb-24 p-8 rounded-2xl border border-accent-cyan/20 bg-gradient-to-r from-accent-cyan/5 to-transparent"
          >
            <div className="flex items-start gap-6">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#00D4FF] to-[#0099CC] flex items-center justify-center shrink-0">
                <Film className="w-7 h-7 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-heading font-bold text-white mb-2">
                  Free Anime Preview for Everyone
                </h3>
                <p className="text-gray-400 text-sm leading-relaxed mb-4">
                  Every user gets one complimentary 15-second anime preview. See your manga come alive
                  with AI-generated animation, voice acting, and music. No credit card required.
                </p>
                <Link href="/create" className="inline-flex items-center gap-2 text-accent-cyan text-sm font-semibold hover:underline">
                  Create your first manga <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </motion.div>

          {/* Full comparison table */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-5xl mx-auto mb-24"
          >
            <h2 className="text-3xl font-heading font-bold text-white text-center mb-4">
              Full Feature Comparison
            </h2>
            <p className="text-gray-500 text-center mb-10">
              Every detail, side by side
            </p>

            <div className="rounded-2xl border border-white/5 overflow-hidden bg-[#0D0D1A]">
              {/* Header */}
              <div className="grid grid-cols-4 gap-4 p-4 border-b border-white/10 bg-[#151528] sticky top-0 z-10">
                <div className="text-sm font-semibold text-gray-400">Feature</div>
                {TIERS.map((t) => (
                  <div key={t.key} className="text-sm font-semibold text-white text-center">
                    {t.name}
                    {t.monthlyPrice > 0 && (
                      <span className="block text-xs text-gray-500 font-normal mt-0.5">
                        ${interval === "annual" ? t.annualMonthlyPrice : t.monthlyPrice}/mo
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Sections */}
              {COMPARISON_SECTIONS.map((section) => (
                <div key={section.title}>
                  <div className="px-4 py-3 bg-[#0A0A18] border-b border-white/5">
                    <span className="text-xs font-bold text-accent-pink uppercase tracking-wider">
                      {section.title}
                    </span>
                  </div>
                  {section.rows.map((row, i) => (
                    <div
                      key={row.label}
                      className={`grid grid-cols-4 gap-4 px-4 py-3 ${
                        i < section.rows.length - 1 ? "border-b border-white/5" : ""
                      } hover:bg-white/[0.02] transition-colors`}
                    >
                      <div className="text-sm text-gray-400">{row.label}</div>
                      {(["free", "creator", "studio"] as const).map((tierKey) => {
                        const val = row[tierKey];
                        if (typeof val === "boolean") {
                          return (
                            <div key={tierKey} className="flex justify-center">
                              {val ? (
                                <Check className="w-5 h-5 text-accent-pink" />
                              ) : (
                                <X className="w-5 h-5 text-gray-700" />
                              )}
                            </div>
                          );
                        }
                        return (
                          <div key={tierKey} className="text-sm text-white text-center font-medium">
                            {val === "0" || val === "—" ? (
                              <span className="text-gray-600">{val}</span>
                            ) : (
                              val
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </motion.div>

          {/* FAQ */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-3xl mx-auto"
          >
            <h2 className="text-3xl font-heading font-bold text-white text-center mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-gray-500 text-center mb-10">
              Everything you need to know about Awakli plans
            </p>

            <div className="space-y-3">
              {FAQS.map((faq, i) => (
                <motion.div
                  key={i}
                  initial={false}
                  className="rounded-xl border border-white/5 bg-[#0D0D1A] overflow-hidden"
                >
                  <button
                    onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                    className="w-full flex items-center justify-between p-5 text-left hover:bg-white/[0.02] transition-colors"
                  >
                    <span className="text-sm font-semibold text-white pr-4">{faq.q}</span>
                    <ChevronDown
                      className={`w-5 h-5 text-gray-500 shrink-0 transition-transform ${
                        expandedFaq === i ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  <AnimatePresence>
                    {expandedFaq === i && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <p className="px-5 pb-5 text-sm text-gray-400 leading-relaxed">
                          {faq.a}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Bottom CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mt-20"
          >
            <h3 className="text-2xl font-heading font-bold text-white mb-3">
              Ready to bring your stories to life?
            </h3>
            <p className="text-gray-500 mb-6">
              Start creating manga for free. No credit card required.
            </p>
            <Link
              href="/create"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-[#E94560] to-[#FF6B81] text-white font-semibold shadow-lg shadow-accent-pink/20 hover:shadow-accent-pink/40 transition-all"
            >
              <Wand2 className="w-5 h-5" />
              Start Creating Free
              <ArrowRight className="w-5 h-5" />
            </Link>
          </motion.div>
        </div>
      </div>
    </MarketingLayout>
  );
}
