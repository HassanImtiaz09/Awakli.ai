import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { motion } from "framer-motion";
import { Link, useLocation } from "wouter";
import { getLoginUrl } from "@/const";
import {
  Zap, Crown, ArrowRight, TrendingUp, Clock,
  Film, Palette, Mic, Layers, AlertCircle
} from "lucide-react";
import { PlatformLayout } from "@/components/awakli/Layouts";

// ─── Animated Credit Ring ──────────────────────────────────────────────────
function CreditRing({ used, total, label, color = "#E94560" }: { used: number; total: number; label: string; color?: string }) {
  const pct = total > 0 ? Math.min(used / total, 1) : 0;
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-36 h-36">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 128 128">
          {/* Track */}
          <circle cx="64" cy="64" r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
          {/* Progress */}
          <motion.circle
            cx="64" cy="64" r={radius}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.2, ease: "easeOut" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-display font-bold text-white">{Math.round(pct * 100)}%</span>
          <span className="text-xs text-gray-500">used</span>
        </div>
      </div>
      <p className="mt-3 text-sm text-gray-400">{label}</p>
      <p className="text-xs text-gray-500">{used.toLocaleString()} / {total.toLocaleString()}</p>
    </div>
  );
}

// ─── Stat Card ─────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color = "#E94560" }: {
  icon: any; label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      className="p-5 rounded-xl border border-white/5 bg-[#0D0D1A]"
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}15`, color }}>
          <Icon className="w-5 h-5" />
        </div>
        <span className="text-sm text-gray-400">{label}</span>
      </div>
      <p className="text-2xl font-display font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </motion.div>
  );
}

export default function UsageDashboard() {
  const { isAuthenticated, user } = useAuth();
  const [, navigate] = useLocation();

  const usage = trpc.usage.getSummary.useQuery(undefined, { enabled: isAuthenticated });
  const sub = trpc.billing.getSubscription.useQuery(undefined, { enabled: isAuthenticated });

  if (!isAuthenticated) {
    return (
      <PlatformLayout>
        <div className="container py-32 text-center">
          <AlertCircle className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <h2 className="text-2xl font-heading font-bold text-white mb-3">Sign in to view usage</h2>
          <p className="text-gray-400 mb-6">Track your credits, panels, and subscription details.</p>
          <a href={getLoginUrl()} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-[#E94560] to-[#FF6B81] text-white font-semibold">
            Sign In <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </PlatformLayout>
    );
  }

  const u = usage.data;
  const s = sub.data;
  const tier = s?.tier || "free";
  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);

  // Tier limits
  const limits: Record<string, { credits: number; panels: number; videos: number; lora: number; voice: number }> = {
    free: { credits: 100, panels: 5, videos: 0, lora: 0, voice: 0 },
    pro: { credits: 2000, panels: 100, videos: 3, lora: 2, voice: 2 },
    studio: { credits: 10000, panels: 9999, videos: 20, lora: 999, voice: 999 },
  };
  const lim = limits[tier] || limits.free;

  return (
    <PlatformLayout>
      <div className="container py-24">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-10">
            <div>
              <h1 className="text-3xl md:text-4xl font-display font-bold text-white mb-2">Usage Dashboard</h1>
              <p className="text-gray-400">Track your resource consumption and manage your plan.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className={`px-4 py-2 rounded-full border text-sm font-semibold ${
                tier === "studio" ? "border-accent-cyan/40 text-accent-cyan bg-accent-cyan/10" :
                tier === "pro" ? "border-accent-pink/40 text-accent-pink bg-accent-pink/10" :
                "border-white/10 text-gray-400 bg-white/5"
              }`}>
                <Crown className="w-4 h-4 inline mr-1.5" />
                {tierLabel} Plan
              </div>
              {tier === "free" && (
                <Link href="/pricing">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    className="px-5 py-2 rounded-full bg-gradient-to-r from-[#E94560] to-[#FF6B81] text-white text-sm font-semibold"
                  >
                    Upgrade
                  </motion.button>
                </Link>
              )}
            </div>
          </div>

          {/* Credit Rings */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 p-8 rounded-2xl border border-white/5 bg-[#0D0D1A] mb-8">
            <CreditRing
              used={u?.total ?? 0}
              total={lim.credits}
              label="Credits"
              color="#E94560"
            />
            <CreditRing
              used={u?.byType?.panel ?? 0}
              total={lim.panels === 9999 ? Math.max(u?.byType?.panel ?? 0, 100) : lim.panels}
              label="Panels Today"
              color="#00D4FF"
            />
            <CreditRing
              used={u?.byType?.video ?? 0}
              total={Math.max(lim.videos, 1)}
              label="Video Episodes"
              color="#8B5CF6"
            />
            <CreditRing
              used={u?.byType?.lora_train ?? 0}
              total={Math.max(lim.lora, 1)}
              label="LoRA Models"
              color="#FFB800"
            />
          </div>

          {/* Stats Grid */}
          <div className="grid md:grid-cols-4 gap-4 mb-8">
            <StatCard icon={Zap} label="Credits Used" value={(u?.total ?? 0).toLocaleString()} sub={`of ${lim.credits.toLocaleString()} monthly`} color="#E94560" />
            <StatCard icon={Palette} label="Panels Generated" value={u?.byType?.panel ?? 0} sub="today" color="#00D4FF" />
            <StatCard icon={Film} label="Video Episodes" value={u?.byType?.video ?? 0} sub="this month" color="#8B5CF6" />
            <StatCard icon={Mic} label="Voice Clones" value={u?.byType?.voice ?? 0} sub={`of ${lim.voice} allowed`} color="#2ECC71" />
          </div>

          {/* Subscription Info */}
          {s && (
            <div className="p-6 rounded-2xl border border-white/5 bg-[#0D0D1A] mb-8">
              <h2 className="text-lg font-heading font-semibold text-white mb-4">Subscription Details</h2>
              <div className="grid md:grid-cols-3 gap-6">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Plan</p>
                  <p className="text-white font-semibold">{tierLabel}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Status</p>
                  <p className={`font-semibold ${s.status === "active" ? "text-green-400" : "text-gray-400"}`}>
                    {s.status ? s.status.charAt(0).toUpperCase() + s.status.slice(1) : "Free"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Renewal</p>
                  <p className="text-white font-semibold">
                    {"currentPeriodEnd" in s && s.currentPeriodEnd ? new Date(s.currentPeriodEnd).toLocaleDateString() : "N/A"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Upgrade CTA for free users */}
          {tier === "free" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-8 rounded-2xl border border-accent-pink/20 bg-gradient-to-r from-accent-pink/5 via-transparent to-accent-cyan/5"
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h3 className="text-xl font-heading font-bold text-white mb-2">Unlock More Power</h3>
                  <p className="text-gray-400 text-sm">Upgrade to Pro for 20x more credits, video generation, and voice cloning.</p>
                </div>
                <Link href="/pricing">
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    className="px-8 py-3 rounded-xl bg-gradient-to-r from-[#E94560] to-[#FF6B81] text-white font-semibold shadow-lg shadow-accent-pink/20"
                  >
                    View Plans <ArrowRight className="inline ml-2 w-4 h-4" />
                  </motion.button>
                </Link>
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
    </PlatformLayout>
  );
}
