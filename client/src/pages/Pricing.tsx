import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { motion } from "framer-motion";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Check, X, Crown, Zap, Shield, ArrowRight, Sparkles } from "lucide-react";
import { MarketingLayout } from "@/components/awakli/Layouts";
import { toast } from "sonner";

type BillingInterval = "monthly" | "annual";

const TIERS = [
  {
    key: "free",
    name: "Free",
    monthlyPrice: 0,
    annualPrice: 0,
    desc: "Perfect for exploring Awakli",
    icon: Sparkles,
    accent: "from-gray-500 to-gray-600",
    features: {
      projects: "1",
      episodesPerProject: "3",
      credits: "100",
      panelsPerDay: "5",
      videoEpisodes: "0",
      loraModels: "0",
      voiceClones: "0",
      watermark: true,
      apiAccess: false,
      prioritySupport: false,
    },
  },
  {
    key: "pro",
    name: "Pro",
    monthlyPrice: 29,
    annualPrice: 23.20,
    desc: "For serious creators",
    icon: Zap,
    accent: "from-[#E94560] to-[#FF6B81]",
    popular: true,
    features: {
      projects: "5",
      episodesPerProject: "12",
      credits: "2,000",
      panelsPerDay: "100",
      videoEpisodes: "3",
      loraModels: "2",
      voiceClones: "2",
      watermark: false,
      apiAccess: false,
      prioritySupport: false,
    },
  },
  {
    key: "studio",
    name: "Studio",
    monthlyPrice: 99,
    annualPrice: 79.20,
    desc: "For professional studios",
    icon: Crown,
    accent: "from-[#00D4FF] to-[#0099CC]",
    features: {
      projects: "Unlimited",
      episodesPerProject: "Unlimited",
      credits: "10,000",
      panelsPerDay: "Unlimited",
      videoEpisodes: "20",
      loraModels: "Unlimited",
      voiceClones: "Unlimited",
      watermark: false,
      apiAccess: true,
      prioritySupport: true,
    },
  },
];

const COMPARISON_ROWS = [
  { label: "Projects", key: "projects" },
  { label: "Episodes per project", key: "episodesPerProject" },
  { label: "Monthly credits", key: "credits" },
  { label: "Panels per day", key: "panelsPerDay" },
  { label: "Video episodes/month", key: "videoEpisodes" },
  { label: "LoRA models", key: "loraModels" },
  { label: "Voice clones", key: "voiceClones" },
  { label: "Watermark-free", key: "watermark", invert: true },
  { label: "API access", key: "apiAccess", boolean: true },
  { label: "Priority support", key: "prioritySupport", boolean: true },
];

export default function Pricing() {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
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
      navigate("/studio");
      return;
    }
    checkout.mutate({ tier: tierKey as "pro" | "studio", interval });
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
            <h1 className="text-4xl md:text-6xl font-display font-bold text-white mb-4">
              Choose Your <span className="text-gradient-pink">Plan</span>
            </h1>
            <p className="text-gray-400 max-w-xl mx-auto text-lg mb-8">
              Start free and scale as you grow. All plans include community features.
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
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                  interval === "annual"
                    ? "bg-gradient-to-r from-[#E94560] to-[#FF6B81] text-white shadow-lg"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                Annual
                <span className="ml-2 text-xs text-accent-cyan font-semibold">Save 20%</span>
              </button>
            </div>
          </motion.div>

          {/* Pricing cards */}
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-20">
            {TIERS.map((tier, i) => {
              const Icon = tier.icon;
              const price = interval === "annual" ? tier.annualPrice : tier.monthlyPrice;
              return (
                <motion.div
                  key={tier.key}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  whileHover={{ y: -6 }}
                  className={`relative p-8 rounded-2xl border bg-gradient-to-b from-[#0D0D1A] to-[#08080F] transition-all ${
                    tier.popular ? "border-accent-pink/40 ring-1 ring-accent-pink/20" : "border-white/5"
                  }`}
                >
                  {tier.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-[#E94560] to-[#FF6B81] text-xs font-semibold text-white">
                      Most Popular
                    </div>
                  )}

                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${tier.accent} flex items-center justify-center mb-4`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>

                  <h3 className="text-2xl font-heading font-bold text-white mb-1">{tier.name}</h3>
                  <p className="text-sm text-gray-500 mb-6">{tier.desc}</p>

                  <div className="mb-8">
                    <span className="text-5xl font-display font-bold text-white">
                      ${price === 0 ? "0" : price.toFixed(price % 1 === 0 ? 0 : 2)}
                    </span>
                    <span className="text-gray-500 ml-1">
                      {price === 0 ? "/forever" : "/month"}
                    </span>
                    {interval === "annual" && price > 0 && (
                      <p className="text-xs text-accent-cyan mt-1">
                        Billed ${(price * 12).toFixed(0)}/year
                      </p>
                    )}
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleSubscribe(tier.key)}
                    disabled={checkout.isPending}
                    className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 ${
                      tier.popular
                        ? "bg-gradient-to-r from-[#E94560] to-[#FF6B81] text-white shadow-lg shadow-accent-pink/20 hover:shadow-accent-pink/40"
                        : "border border-white/10 text-white hover:bg-white/5"
                    }`}
                  >
                    {checkout.isPending ? "Processing..." : tier.key === "free" ? "Get Started" : `Subscribe to ${tier.name}`}
                  </motion.button>

                  <div className="mt-8 pt-6 border-t border-white/5 space-y-3">
                    {COMPARISON_ROWS.slice(0, 7).map((row) => {
                      const val = (tier.features as any)[row.key];
                      return (
                        <div key={row.key} className="flex items-center justify-between text-sm">
                          <span className="text-gray-500">{row.label}</span>
                          <span className="text-white font-medium">{val === "0" ? "—" : val}</span>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Full comparison table */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-5xl mx-auto"
          >
            <h2 className="text-2xl font-heading font-bold text-white text-center mb-8">
              Full Feature Comparison
            </h2>
            <div className="rounded-2xl border border-white/5 overflow-hidden bg-[#0D0D1A]">
              {/* Header */}
              <div className="grid grid-cols-4 gap-4 p-4 border-b border-white/5 bg-[#151528]">
                <div className="text-sm font-semibold text-gray-400">Feature</div>
                {TIERS.map((t) => (
                  <div key={t.key} className="text-sm font-semibold text-white text-center">{t.name}</div>
                ))}
              </div>
              {/* Rows */}
              {COMPARISON_ROWS.map((row, i) => (
                <div key={row.key} className={`grid grid-cols-4 gap-4 p-4 ${i < COMPARISON_ROWS.length - 1 ? "border-b border-white/5" : ""}`}>
                  <div className="text-sm text-gray-400">{row.label}</div>
                  {TIERS.map((t) => {
                    const val = (t.features as any)[row.key];
                    if (row.boolean) {
                      return (
                        <div key={t.key} className="flex justify-center">
                          {val ? <Check className="w-5 h-5 text-accent-pink" /> : <X className="w-5 h-5 text-gray-600" />}
                        </div>
                      );
                    }
                    if (row.invert) {
                      return (
                        <div key={t.key} className="flex justify-center">
                          {!val ? <Check className="w-5 h-5 text-accent-pink" /> : <X className="w-5 h-5 text-gray-600" />}
                        </div>
                      );
                    }
                    return (
                      <div key={t.key} className="text-sm text-white text-center font-medium">
                        {val === "0" ? "—" : val}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </motion.div>

          {/* FAQ */}
          <div className="max-w-3xl mx-auto mt-20">
            <h2 className="text-2xl font-heading font-bold text-white text-center mb-8">
              Frequently Asked Questions
            </h2>
            <div className="space-y-4">
              {[
                { q: "Can I upgrade or downgrade anytime?", a: "Yes! You can change your plan at any time. Upgrades are prorated, and downgrades take effect at the end of your billing cycle." },
                { q: "What happens when I run out of credits?", a: "Free users will need to wait until the next month. Pro and Studio users can purchase additional credits at $0.05 per credit." },
                { q: "Is there a free trial for Pro?", a: "We offer a generous free tier so you can try all core features. When you're ready for more, upgrade to Pro with no commitment." },
                { q: "Can I cancel anytime?", a: "Absolutely. Cancel anytime from your billing dashboard. You'll retain access until the end of your current billing period." },
              ].map((faq) => (
                <div key={faq.q} className="p-5 rounded-xl border border-white/5 bg-[#0D0D1A]">
                  <h3 className="text-sm font-semibold text-white mb-2">{faq.q}</h3>
                  <p className="text-sm text-gray-400 leading-relaxed">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </MarketingLayout>
  );
}
