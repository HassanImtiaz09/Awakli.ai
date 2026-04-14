import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { getLoginUrl } from "@/const";
import {
  DollarSign, TrendingUp, Users, Heart, ArrowRight, AlertCircle,
  Calendar, Gift
} from "lucide-react";
import { PlatformLayout } from "@/components/awakli/Layouts";

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

export default function CreatorEarnings() {
  const { isAuthenticated } = useAuth();

  const earnings = trpc.marketplace.getEarnings.useQuery(undefined, { enabled: isAuthenticated });
  const tips = trpc.marketplace.getTips.useQuery(undefined, { enabled: isAuthenticated });

  if (!isAuthenticated) {
    return (
      <PlatformLayout>
        <div className="container py-32 text-center">
          <AlertCircle className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <h2 className="text-2xl font-heading font-bold text-white mb-3">Sign in to view earnings</h2>
          <p className="text-gray-400 mb-6">Track your tips, earnings, and creator analytics.</p>
          <a href={getLoginUrl()} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-[#E94560] to-[#FF6B81] text-white font-semibold">
            Sign In <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </PlatformLayout>
    );
  }

  const e = earnings.data;
  const t = tips.data ?? [];

  return (
    <PlatformLayout>
      <div className="container py-24">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          {/* Header */}
          <div className="mb-10">
            <h1 className="text-3xl md:text-4xl font-display font-bold text-white mb-2">Creator Earnings</h1>
            <p className="text-gray-400">Track your tips, revenue, and supporter activity.</p>
          </div>

          {/* Stats */}
          <div className="grid md:grid-cols-4 gap-4 mb-8">
            <StatCard
              icon={DollarSign}
              label="Total Earnings"
              value={`$${((e?.totalEarnings ?? 0) / 100).toFixed(2)}`}
              sub="all time"
              color="#2ECC71"
            />
            <StatCard
              icon={TrendingUp}
              label="This Month"
              value={`$${((e?.monthlyEarnings?.[0]?.amount ?? 0) / 100).toFixed(2)}`}
              sub="current period"
              color="#E94560"
            />
            <StatCard
              icon={Heart}
              label="Total Tips"
              value={e?.totalTips ?? 0}
              sub="received"
              color="#FF6B81"
            />
            <StatCard
              icon={Users}
              label="Supporters"
              value={t.length}
              sub="all time"
              color="#00D4FF"
            />
          </div>

          {/* Recent Tips */}
          <div className="rounded-2xl border border-white/5 bg-[#0D0D1A] overflow-hidden">
            <div className="p-6 border-b border-white/5">
              <h2 className="text-lg font-heading font-semibold text-white">Recent Tips</h2>
            </div>

            {t.length === 0 ? (
              <div className="p-12 text-center">
                <Gift className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">No tips received yet. Share your creations to start earning!</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {t.map((tip: any) => (
                  <div key={tip.id} className="p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accent-pink to-accent-cyan flex items-center justify-center text-xs font-bold text-white">
                        {(tip.senderName || "?").charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm text-white font-medium">{tip.senderName || "Anonymous"}</p>
                        {tip.message && <p className="text-xs text-gray-500 truncate max-w-xs">"{tip.message}"</p>}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-green-400">+${(tip.amount / 100).toFixed(2)}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(tip.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Payout info */}
          <div className="mt-8 p-6 rounded-2xl border border-accent-cyan/20 bg-accent-cyan/5">
            <div className="flex items-start gap-4">
              <Calendar className="w-6 h-6 text-accent-cyan mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="text-sm font-semibold text-white mb-1">Payout Information</h3>
                <p className="text-sm text-gray-400 leading-relaxed">
                  Earnings are paid out monthly via Stripe Connect. Minimum payout threshold is $10.00.
                  Connect your Stripe account in settings to enable payouts.
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </PlatformLayout>
  );
}
