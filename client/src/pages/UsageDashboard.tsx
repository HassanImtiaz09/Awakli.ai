import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { motion } from "framer-motion";
import { Link, useLocation } from "wouter";
import { getLoginUrl } from "@/const";
import {
  Zap, Crown, ArrowRight, TrendingUp, Clock, ShoppingCart,
  Film, Palette, Mic, Layers, AlertCircle, CreditCard,
  RefreshCw, History, Package, DollarSign, BarChart3, Shield
} from "lucide-react";
import { PlatformLayout } from "@/components/awakli/Layouts";
import { useState } from "react";

// ─── Animated Credit Ring ──────────────────────────────────────────────────
function CreditRing({ used, total, label, color = "#6B5BFF" }: { used: number; total: number; label: string; color?: string }) {
  const pct = total > 0 ? Math.min(used / total, 1) : 0;
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-36 h-36">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 128 128">
          <circle cx="64" cy="64" r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
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
function StatCard({ icon: Icon, label, value, sub, color = "#6B5BFF" }: {
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

// ─── Transaction Type Labels ───────────────────────────────────────────────
const TX_LABELS: Record<string, { label: string; color: string; icon: any }> = {
  grant_subscription: { label: "Subscription Grant", color: "#2ECC71", icon: Crown },
  grant_pack_purchase: { label: "Pack Purchase", color: "#00F0FF", icon: Package },
  grant_promotional: { label: "Promo Credit", color: "#FFD60A", icon: Zap },
  hold_preauth: { label: "Hold (Pending)", color: "#F59E0B", icon: Clock },
  commit_consumption: { label: "Used", color: "#6B5BFF", icon: Film },
  release_hold: { label: "Hold Released", color: "#8B5CF6", icon: RefreshCw },
  refund_generation: { label: "Refund", color: "#2ECC71", icon: RefreshCw },
  rollover: { label: "Rollover", color: "#00F0FF", icon: TrendingUp },
  expiry: { label: "Expired", color: "#6B7280", icon: AlertCircle },
  admin_adjustment: { label: "Admin Adjustment", color: "#FFD60A", icon: Shield },
};

// ─── Ledger History Row ────────────────────────────────────────────────────
function LedgerRow({ entry }: { entry: any }) {
  const tx = TX_LABELS[entry.transactionType] || { label: entry.transactionType, color: "#6B7280", icon: History };
  const Icon = tx.icon;
  const isPositive = entry.amountCredits > 0;

  return (
    <div className="flex items-center gap-4 py-3 border-b border-white/5 last:border-0">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${tx.color}15`, color: tx.color }}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white font-medium truncate">{tx.label}</p>
        <p className="text-xs text-gray-500 truncate">{entry.description || "—"}</p>
      </div>
      <div className="text-right shrink-0">
        <p className={`text-sm font-mono font-semibold ${isPositive ? "text-green-400" : "text-red-400"}`}>
          {isPositive ? "+" : ""}{entry.amountCredits}
        </p>
        <p className="text-xs text-gray-500">{new Date(entry.createdAt).toLocaleDateString()}</p>
      </div>
    </div>
  );
}

export default function UsageDashboard() {
  const { isAuthenticated, user } = useAuth();
  const [, navigate] = useLocation();
  const [ledgerPage, setLedgerPage] = useState(0);

  const balance = trpc.billing.getBalance.useQuery(undefined, { enabled: isAuthenticated });
  const sub = trpc.billing.getSubscription.useQuery(undefined, { enabled: isAuthenticated });
  const usageSummary = trpc.billing.getUsageSummary.useQuery(undefined, { enabled: isAuthenticated });
  const ledger = trpc.billing.getLedgerHistory.useQuery(
    { limit: 20, offset: ledgerPage * 20 },
    { enabled: isAuthenticated }
  );
  const costs = trpc.creditGateway.getCosts.useQuery();

  if (!isAuthenticated) {
    return (
      <PlatformLayout>
        <div className="container py-32 text-center">
          <AlertCircle className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <h2 className="text-2xl font-heading font-bold text-white mb-3">Sign in to view billing</h2>
          <p className="text-gray-400 mb-6">Track your credits, usage, and subscription details.</p>
          <a href={getLoginUrl()} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-[#00F0FF] to-[#6B5BFF] text-white font-semibold">
            Sign In <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </PlatformLayout>
    );
  }

  const b = balance.data;
  const s = sub.data;
  const u = usageSummary.data;
  const tier = (s?.tier || "free_trial") as string;
  const tierLabel = tier.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const allocation = (s?.limits as any)?.credits || 15;

  return (
    <PlatformLayout>
      <div className="container py-24">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-10">
            <div>
              <h1 className="text-3xl md:text-4xl font-display font-bold text-white mb-2">Billing & Credits</h1>
              <p className="text-gray-400">Manage your subscription, track credit usage, and purchase top-ups.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className={`px-4 py-2 rounded-full border text-sm font-semibold ${
                tier === "studio" ? "border-token-cyan/40 text-token-cyan bg-token-cyan/10" :
                tier === "creator_pro" ? "border-token-violet/40 text-token-violet bg-token-violet/10" :
                tier === "creator" ? "border-purple-400/40 text-purple-400 bg-purple-400/10" :
                "border-white/10 text-gray-400 bg-white/5"
              }`}>
                <Crown className="w-4 h-4 inline mr-1.5" />
                {tierLabel}
              </div>
              {tier === "free_trial" && (
                <Link href="/pricing">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    className="px-5 py-2 rounded-full bg-gradient-to-r from-[#00F0FF] to-[#6B5BFF] text-white text-sm font-semibold"
                  >
                    Upgrade
                  </motion.button>
                </Link>
              )}
            </div>
          </div>

          {/* Balance Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="md:col-span-1 p-8 rounded-2xl border border-token-violet/20 bg-gradient-to-br from-[#0D0D1A] to-[#1A0A1A]"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-token-violet/10 flex items-center justify-center">
                  <Zap className="w-6 h-6 text-token-violet" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Available Credits</p>
                  <p className="text-3xl font-display font-bold text-white">{b?.availableBalance ?? 0}</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Committed Balance</span>
                  <span className="text-white font-mono">{b?.committedBalance ?? 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Active Holds</span>
                  <span className="text-yellow-400 font-mono">{b?.activeHolds ?? 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Lifetime Grants</span>
                  <span className="text-green-400 font-mono">{b?.lifetimeGrants ?? 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Lifetime Consumed</span>
                  <span className="text-red-400 font-mono">{b?.lifetimeConsumption ?? 0}</span>
                </div>
              </div>
            </motion.div>

            {/* Credit Rings */}
            <div className="md:col-span-2 grid grid-cols-2 gap-6 p-6 rounded-2xl border border-white/5 bg-[#0D0D1A]">
              <CreditRing
                used={b?.lifetimeConsumption ?? 0}
                total={allocation}
                label="Period Credits"
                color="#6B5BFF"
              />
              <CreditRing
                used={b?.activeHolds ?? 0}
                total={Math.max(b?.committedBalance ?? 1, 1)}
                label="Active Holds"
                color="#F59E0B"
              />
              <CreditRing
                used={u?.byType?.video ?? 0}
                total={Math.max(u?.byType?.video ?? 0, 10)}
                label="Video Generations"
                color="#8B5CF6"
              />
              <CreditRing
                used={u?.byType?.image ?? 0}
                total={Math.max(u?.byType?.image ?? 0, 20)}
                label="Image Generations"
                color="#00F0FF"
              />
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid md:grid-cols-3 gap-4 mb-8">
            <Link href="/pricing">
              <motion.div whileHover={{ y: -2 }} className="p-5 rounded-xl border border-white/5 bg-[#0D0D1A] cursor-pointer hover:border-token-violet/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-token-violet/10 flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-token-violet" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Buy Credit Pack</p>
                    <p className="text-xs text-gray-500">Top up your balance</p>
                  </div>
                </div>
              </motion.div>
            </Link>
            <Link href="/pricing">
              <motion.div whileHover={{ y: -2 }} className="p-5 rounded-xl border border-white/5 bg-[#0D0D1A] cursor-pointer hover:border-purple-400/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-400/10 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Upgrade Plan</p>
                    <p className="text-xs text-gray-500">Get more credits monthly</p>
                  </div>
                </div>
              </motion.div>
            </Link>
            <motion.div whileHover={{ y: -2 }} className="p-5 rounded-xl border border-white/5 bg-[#0D0D1A]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-token-cyan/10 flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-token-cyan" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Period Usage</p>
                  <p className="text-xs text-gray-500">
                    {u?.totalConsumed ?? 0} credits consumed
                  </p>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Usage Breakdown */}
          {u && (
            <div className="grid md:grid-cols-5 gap-4 mb-8">
              <StatCard icon={Film} label="Video" value={u.byType?.video ?? 0} sub="credits" color="#8B5CF6" />
              <StatCard icon={Palette} label="Image" value={u.byType?.image ?? 0} sub="credits" color="#00F0FF" />
              <StatCard icon={Mic} label="Voice" value={u.byType?.voice ?? 0} sub="credits" color="#2ECC71" />
              <StatCard icon={Layers} label="Script" value={u.byType?.script ?? 0} sub="credits" color="#FFD60A" />
              <StatCard icon={Package} label="Music" value={u.byType?.music ?? 0} sub="credits" color="#6B5BFF" />
            </div>
          )}

          {/* Subscription Info */}
          {s && (
            <div className="p-6 rounded-2xl border border-white/5 bg-[#0D0D1A] mb-8">
              <h2 className="text-lg font-heading font-semibold text-white mb-4">Subscription Details</h2>
              <div className="grid md:grid-cols-4 gap-6">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Plan</p>
                  <p className="text-white font-semibold">{tierLabel}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Status</p>
                  <p className={`font-semibold ${s.status === "active" ? "text-green-400" : "text-gray-400"}`}>
                    {s.status ? s.status.charAt(0).toUpperCase() + s.status.slice(1) : "Active"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Monthly Allocation</p>
                  <p className="text-white font-semibold">{allocation} credits</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Renewal</p>
                  <p className="text-white font-semibold">
                    {"currentPeriodEnd" in s && s.currentPeriodEnd ? new Date(s.currentPeriodEnd as unknown as string).toLocaleDateString() : "N/A"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Credit Cost Reference */}
          {costs.data && (
            <div className="p-6 rounded-2xl border border-white/5 bg-[#0D0D1A] mb-8">
              <h2 className="text-lg font-heading font-semibold text-white mb-4">Credit Costs</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(costs.data).filter(([_, v]) => v > 0).map(([action, cost]) => (
                  <div key={action} className="flex justify-between items-center px-3 py-2 rounded-lg bg-white/[0.02] border border-white/5">
                    <span className="text-xs text-gray-400 truncate">{action.replace(/_/g, " ")}</span>
                    <span className="text-xs font-mono text-token-violet ml-2">{cost}cr</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ledger History */}
          <div className="p-6 rounded-2xl border border-white/5 bg-[#0D0D1A] mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-heading font-semibold text-white">Transaction History</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setLedgerPage(Math.max(0, ledgerPage - 1))}
                  disabled={ledgerPage === 0}
                  className="px-3 py-1 rounded-lg text-xs text-gray-400 bg-white/5 disabled:opacity-30 hover:bg-white/10 transition-colors"
                >
                  Prev
                </button>
                <span className="text-xs text-gray-500">Page {ledgerPage + 1}</span>
                <button
                  onClick={() => setLedgerPage(ledgerPage + 1)}
                  disabled={!ledger.data || ledger.data.entries.length < 20}
                  className="px-3 py-1 rounded-lg text-xs text-gray-400 bg-white/5 disabled:opacity-30 hover:bg-white/10 transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
            {ledger.isLoading ? (
              <div className="py-8 text-center text-gray-500">Loading transactions...</div>
            ) : ledger.data && ledger.data.entries.length > 0 ? (
              <div className="divide-y divide-white/5">
                {ledger.data.entries.map((entry: any) => (
                  <LedgerRow key={entry.id} entry={entry} />
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-gray-500">
                <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No transactions yet. Start creating to see your credit history.</p>
              </div>
            )}
          </div>

          {/* Upgrade CTA for free users */}
          {tier === "free_trial" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-8 rounded-2xl border border-token-violet/20 bg-gradient-to-r from-token-violet/5 via-transparent to-token-cyan/5"
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h3 className="text-xl font-heading font-bold text-white mb-2">Unlock More Power</h3>
                  <p className="text-gray-400 text-sm">Upgrade to Creator for 35 monthly credits, Standard model tier, and 15-minute episodes.</p>
                </div>
                <Link href="/pricing">
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    className="px-8 py-3 rounded-xl bg-gradient-to-r from-[#00F0FF] to-[#6B5BFF] text-white font-semibold shadow-lg shadow-[#6B5BFF]/20"
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
