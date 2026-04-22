import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { useState, useRef } from "react";
import { Link, useLocation } from "wouter";
import {
  Check, X, Crown, Zap, Sparkles, ArrowRight, ChevronDown,
  Film, Palette, Mic, Download, Shield, Users, Star, Wand2,
  PenTool, Upload, Lock, BookOpen, Clapperboard,
} from "lucide-react";
import { MarketingLayout } from "@/components/awakli/Layouts";
import PageBackground from "@/components/awakli/PageBackground";
import { toast } from "sonner";
import { TIER_DISPLAY_NAMES, tierPriceLabel, TIER_MONTHLY_PRICE_CENTS, TIER_ANNUAL_MONTHLY_PRICE_CENTS } from "../../../shared/pricingCatalog";

type BillingInterval = "monthly" | "annual";

/* ─── Tier Data ───────────────────────────────────────────────────────── */
const TIERS = [
  {
    key: "free",
    name: TIER_DISPLAY_NAMES.free_trial,
    monthlyPrice: 0,
    annualMonthlyPrice: 0,
    narrative: "Start telling stories. Feel what creation feels like.",
    icon: BookOpen,
    accentColor: "#9494B8",
    gradientFrom: "#9494B8",
    gradientTo: "#5C5C7A",
    ctaText: "Start Creating Free",
    highlights: [
      { icon: PenTool, text: "3 manga projects" },
      { icon: Wand2, text: "AI script generation (Sonnet)" },
      { icon: Palette, text: "20 panels per chapter" },
      { icon: Users, text: "Publish & earn community votes" },
      { icon: Film, text: "1 free anime preview" },
    ],
    limits: [
      "3 chapters per project",
      "Watermarked panels",
      "No anime episodes",
      "No export",
    ],
  },
  {
    key: "creator",
    name: TIER_DISPLAY_NAMES.creator,
    monthlyPrice: TIER_MONTHLY_PRICE_CENTS.creator / 100,
    annualMonthlyPrice: TIER_ANNUAL_MONTHLY_PRICE_CENTS.creator / 100,
    narrative: "Become the animator you were always going to be.",
    icon: Zap,
    accentColor: "#6B5BFF",
    gradientFrom: "#6B5BFF",
    gradientTo: "#7C3AED",
    popular: true,
    ctaText: `Upgrade to ${TIER_DISPLAY_NAMES.creator}`,
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
    name: TIER_DISPLAY_NAMES.creator_pro,
    monthlyPrice: TIER_MONTHLY_PRICE_CENTS.creator_pro / 100,
    annualMonthlyPrice: TIER_ANNUAL_MONTHLY_PRICE_CENTS.creator_pro / 100,
    narrative: "Run the studio. Ship the universe.",
    icon: Crown,
    accentColor: "#00D4FF",
    gradientFrom: "#00D4FF",
    gradientTo: "#00FFB2",
    ctaText: `Go ${TIER_DISPLAY_NAMES.creator_pro}`,
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
      { icon: Zap, text: "Motion LoRA (20 trainings/mo)" },
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
      { label: "Video resolution", free: "\u2014", creator: "1080p", studio: "4K" },
      { label: "LoRA character models", free: "0", creator: "3", studio: "Unlimited" },
      { label: "Voice clones", free: "0", creator: "2", studio: "Unlimited" },
      { label: "Custom narrator voice", free: false, creator: false, studio: true },
      { label: "Motion LoRA", free: false, creator: false, studio: true },
      { label: "LoRA stack layers", free: "None", creator: "Appearance", studio: "All 4 (Flagship)" },
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
      { label: "Revenue share", free: "\u2014", creator: "80%", studio: "85%" },
    ],
  },
  {
    title: "Platform",
    rows: [
      { label: "Community voting", free: true, creator: true, studio: true },
      { label: "Publish to Discover", free: true, creator: true, studio: true },
      { label: "Priority generation queue", free: false, creator: false, studio: true },
      { label: "Priority support", free: false, creator: false, studio: true },
      { label: "Motion LoRA training jobs/mo", free: "\u2014", creator: "\u2014", studio: "20" },
    ],
  },
];

const FAQS = [
  {
    q: "What\u2019s the difference between Free and Creator?",
    a: "Free lets you create manga from text and publish to the community. Creator unlocks anime production (5 episodes/month), voice clones, manga export, and monetization with 80% revenue share. Think of Free as your playground and Creator as your studio.",
  },
  {
    q: "What is the free anime preview?",
    a: "Every free user gets one complimentary anime preview \u2014 a 15-second clip generated from your best manga panels. It\u2019s a taste of what your story looks like animated. After that, upgrade to Creator for full anime production.",
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
    a: "Your content is never deleted. You keep everything you\u2019ve created. You just won\u2019t be able to create new content beyond the lower tier\u2019s limits until you upgrade again.",
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
    a: "We offer a 14-day no-questions refund on subscriptions. Credits already consumed are non-refundable. See our full Refund Policy for details.",
  },
];

/* ─── Scroll Reveal ───────────────────────────────────────────────────── */
function ScrollReveal({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40, scale: 0.96 }}
      animate={isInView ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 40, scale: 0.96 }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   NARRATIVE TIER SCENE — §3.7
   Each tier is a 70vh tall cinematic scene, not a box
   ═══════════════════════════════════════════════════════════════════════ */
function TierScene({
  tier,
  interval,
  onSubscribe,
  isPending,
  index,
}: {
  tier: typeof TIERS[0];
  interval: BillingInterval;
  onSubscribe: (key: string) => void;
  isPending: boolean;
  index: number;
}) {
  const Icon = tier.icon;
  const price = interval === "annual" ? tier.annualMonthlyPrice : tier.monthlyPrice;

  return (
    <ScrollReveal delay={index * 0.1}>
      <motion.section
        className="relative min-h-[70vh] flex items-center overflow-hidden rounded-3xl border border-white/5 mb-8 transition-all"
        style={{
          background: `linear-gradient(135deg, ${tier.gradientFrom}08, ${tier.gradientTo}04, #0D0D1A)`,
        }}
        whileHover={{ borderColor: `${tier.accentColor}30`, boxShadow: `0 0 60px ${tier.accentColor}15, 0 8px 32px ${tier.accentColor}10` }}
      >
        {/* Accent glow */}
        <div
          className="absolute top-1/2 right-0 -translate-y-1/2 w-[500px] h-[500px] rounded-full blur-[150px] opacity-15"
          style={{ backgroundColor: tier.accentColor }}
        />

        <div className="relative z-10 w-full px-8 md:px-16 py-16">
          <div className={`flex flex-col ${index % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"} items-center gap-12 md:gap-20`}>
            {/* Text side */}
            <div className="flex-1 max-w-lg">
              {/* Badge */}
              {tier.popular && (
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#6B5BFF]/10 border border-[#6B5BFF]/30 text-[#00F0FF] text-xs font-semibold mb-4">
                  <Star className="w-3 h-3 fill-current" />
                  Most Popular
                </div>
              )}

              {/* Icon + Name */}
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{
                    background: `linear-gradient(135deg, ${tier.gradientFrom}, ${tier.gradientTo})`,
                  }}
                >
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-3xl md:text-4xl font-display font-bold text-white">
                  {tier.name}
                </h2>
              </div>

              {/* Narrative copy — §10 */}
              <p
                className="text-xl md:text-2xl font-heading leading-relaxed mb-6"
                style={{ color: tier.accentColor }}
              >
                {tier.narrative}
              </p>

              {/* Price */}
              <div className="mb-8">
                <span className="text-5xl font-display font-bold text-white">
                  ${price === 0 ? "0" : price}
                </span>
                <span className="text-[#5C5C7A] ml-2 text-lg">
                  {price === 0 ? "/forever" : "/mo"}
                </span>
                {interval === "annual" && price > 0 && (
                  <p className="text-xs text-[#00D4FF] mt-1 font-mono">
                    Billed ${price * 12}/year (save ${(tier.monthlyPrice - tier.annualMonthlyPrice) * 12}/yr)
                  </p>
                )}
              </div>

              {/* CTA */}
              <motion.button
                whileHover={{ scale: 1.03, boxShadow: `0 0 40px ${tier.accentColor}40` }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onSubscribe(tier.key)}
                disabled={isPending}
                className="px-8 py-4 rounded-xl font-semibold text-white text-base transition-all disabled:opacity-50 shadow-lg"
                style={{
                  background: `linear-gradient(135deg, ${tier.gradientFrom}, ${tier.gradientTo})`,
                  boxShadow: `0 8px 32px ${tier.accentColor}25`,
                }}
              >
                {isPending ? "Processing..." : tier.ctaText}
              </motion.button>

              {/* Limits for free tier */}
              {tier.limits.length > 0 && (
                <div className="mt-6 flex flex-wrap gap-2">
                  {tier.limits.map((l) => (
                    <span key={l} className="px-3 py-1 rounded-full bg-white/5 text-[#5C5C7A] text-xs border border-white/5">
                      {l}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Feature list side */}
            <div className="flex-1 max-w-md">
              <div className="space-y-3">
                {tier.highlights.map((h, j) => {
                  const HIcon = h.icon;
                  return (
                    <motion.div
                      key={j}
                      initial={{ opacity: 0, x: 20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: j * 0.05 + 0.2 }}
                      className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] transition-colors"
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${tier.accentColor}15` }}
                      >
                        <HIcon className="w-4 h-4" style={{ color: tier.accentColor }} />
                      </div>
                      <span className="text-sm text-[#F0F0F5]">{h.text}</span>
                    </motion.div>
                  );
                })}
              </div>

              {/* Refund policy card — §3.7 */}
              <div className="mt-6 p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                <p className="text-xs text-[#5C5C7A] leading-relaxed">
                  <Shield className="w-3.5 h-3.5 inline mr-1.5 text-[#00FFB2]" />
                  14-day no-questions refund. Credits consumed are non-refundable.{" "}
                  <Link href="/refund">
                    <span className="text-[#00D4FF] hover:underline cursor-pointer">Full policy</span>
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </motion.section>
    </ScrollReveal>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   PRICING PAGE
   ═══════════════════════════════════════════════════════════════════════ */
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
      <PageBackground src="https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/page-bg-pricing-HaVAWWEjDUAQYS42eNKgym.webp" opacity={0.35} />
      <div className="pt-28 pb-24 relative" style={{ zIndex: 1 }}>
        <div className="container">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#6B5BFF]/30 bg-[#6B5BFF]/5 text-[#00F0FF] text-xs font-semibold mb-6">
              <Sparkles className="w-3.5 h-3.5" />
              Choose your story
            </div>
            <h1 className="text-display text-white mb-4">
              Every creator has a{" "}
              <span className="text-gradient-opening">chapter one.</span>
            </h1>
            <p className="text-[#9494B8] max-w-2xl mx-auto text-lg mb-8">
              Start free. Upgrade when your story demands it.
            </p>

            {/* Billing toggle */}
            <div className="inline-flex items-center gap-1 p-1 rounded-full bg-[#0D0D1A] border border-white/10">
              <button
                onClick={() => setInterval("monthly")}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                  interval === "monthly"
                    ? "bg-opening-sequence text-white shadow-lg"
                    : "text-[#5C5C7A] hover:text-white"
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setInterval("annual")}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all relative ${
                  interval === "annual"
                    ? "bg-opening-sequence text-white shadow-lg"
                    : "text-[#5C5C7A] hover:text-white"
                }`}
              >
                Annual
                <span className="ml-2 text-xs text-[#00D4FF] font-bold">Save 20%</span>
              </button>
            </div>
          </motion.div>

          {/* Three narrative scenes — §3.7 */}
          {TIERS.map((tier, i) => (
            <TierScene
              key={tier.key}
              tier={tier}
              interval={interval}
              onSubscribe={handleSubscribe}
              isPending={checkout.isPending}
              index={i}
            />
          ))}

          {/* Anime Preview Callout */}
          <ScrollReveal>
            <div className="max-w-3xl mx-auto my-16 p-8 rounded-2xl border border-[#00D4FF]/20 bg-gradient-to-r from-[#00D4FF]/5 to-transparent">
              <div className="flex items-start gap-6">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#00D4FF] to-[#0099CC] flex items-center justify-center shrink-0">
                  <Film className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-heading font-bold text-white mb-2">
                    Free Anime Preview for Everyone
                  </h3>
                  <p className="text-[#9494B8] text-sm leading-relaxed mb-4">
                    Every user gets one complimentary 15-second anime preview. See your manga come alive
                    with AI-generated animation, voice acting, and music. No credit card required.
                  </p>
                  <Link href="/create" className="inline-flex items-center gap-2 text-[#00D4FF] text-sm font-semibold hover:underline">
                    Create your first manga <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>
          </ScrollReveal>

          {/* Full comparison table */}
          <ScrollReveal>
            <div className="max-w-5xl mx-auto mb-24">
              <h2 className="text-h1 text-white text-center mb-4">
                Full Feature Comparison
              </h2>
              <p className="text-[#5C5C7A] text-center mb-10">
                Every detail, side by side
              </p>

              <div className="rounded-2xl border border-white/5 overflow-hidden bg-[#0D0D1A]">
                {/* Header */}
                <div className="grid grid-cols-4 gap-4 p-4 border-b border-white/10 bg-[#151528] sticky top-0 z-10">
                  <div className="text-sm font-semibold text-[#9494B8]">Feature</div>
                  {TIERS.map((t) => (
                    <div key={t.key} className="text-sm font-semibold text-white text-center">
                      {t.name}
                      {t.monthlyPrice > 0 && (
                        <span className="block text-xs text-[#5C5C7A] font-normal mt-0.5">
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
                      <span className="text-xs font-bold text-[#00F0FF] uppercase tracking-wider">
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
                        <div className="text-sm text-[#9494B8]">{row.label}</div>
                        {(["free", "creator", "studio"] as const).map((tierKey) => {
                          const val = row[tierKey];
                          if (typeof val === "boolean") {
                            return (
                              <div key={tierKey} className="flex justify-center">
                                {val ? (
                                  <Check className="w-5 h-5 text-[#00FFB2]" />
                                ) : (
                                  <X className="w-5 h-5 text-[#2A2A40]" />
                                )}
                              </div>
                            );
                          }
                          return (
                            <div key={tierKey} className="text-sm text-white text-center font-medium">
                              {val === "0" || val === "\u2014" ? (
                                <span className="text-[#5C5C7A]">{val}</span>
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
            </div>
          </ScrollReveal>

          {/* FAQ */}
          <ScrollReveal>
            <div className="max-w-3xl mx-auto mb-24">
              <h2 className="text-h1 text-white text-center mb-4">
                Frequently Asked Questions
              </h2>
              <p className="text-[#5C5C7A] text-center mb-10">
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
                        className={`w-5 h-5 text-[#5C5C7A] shrink-0 transition-transform ${
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
                          <p className="px-5 pb-5 text-sm text-[#9494B8] leading-relaxed">
                            {faq.a}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              </div>
            </div>
          </ScrollReveal>

          {/* Bottom CTA */}
          <ScrollReveal>
            <div className="text-center">
              <h3 className="text-h2 text-white mb-3">
                Ready to bring your stories to life?
              </h3>
              <p className="text-[#5C5C7A] mb-6">
                Start creating manga for free. No credit card required.
              </p>
              <Link href="/create">
                <motion.span
                  whileHover={{ scale: 1.03, boxShadow: "0 0 40px rgba(107,91,255,0.4)" }}
                  whileTap={{ scale: 0.97 }}
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-opening-sequence text-white font-semibold shadow-lg shadow-[#6B5BFF]/25 cursor-pointer"
                >
                  <Wand2 className="w-5 h-5" />
                  Start Creating Free
                  <ArrowRight className="w-5 h-5" />
                </motion.span>
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </MarketingLayout>
  );
}
