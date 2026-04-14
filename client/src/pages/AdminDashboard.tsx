import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { motion } from "framer-motion";
import { useState } from "react";
import { useLocation } from "wouter";
import {
  Users, DollarSign, Film, Zap, Shield, AlertTriangle,
  CheckCircle, XCircle, Eye, ChevronRight, Crown, TrendingUp,
  Clock, BarChart3
} from "lucide-react";
import { PlatformLayout } from "@/components/awakli/Layouts";
import { toast } from "sonner";

// ─── Metric Card ───────────────────────────────────────────────────────────
function MetricCard({ icon: Icon, label, value, change, color = "#E94560" }: {
  icon: any; label: string; value: string | number; change?: string; color?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      className="p-6 rounded-xl border border-white/5 bg-[#0D0D1A]"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="w-11 h-11 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}15`, color }}>
          <Icon className="w-5 h-5" />
        </div>
        {change && (
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${
            change.startsWith("+") ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
          }`}>
            {change}
          </span>
        )}
      </div>
      <p className="text-2xl font-display font-bold text-white">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </motion.div>
  );
}

// ─── Moderation Queue ──────────────────────────────────────────────────────
function ModerationQueue() {
  const queue = trpc.admin.getModerationQueue.useQuery({ status: "pending" });
  const moderate = trpc.admin.reviewModeration.useMutation({
    onSuccess: () => {
      queue.refetch();
      toast.success("Item moderated");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const items = queue.data ?? [];

  return (
    <div className="rounded-2xl border border-white/5 bg-[#0D0D1A] overflow-hidden">
      <div className="p-6 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-amber-400" />
          <h2 className="text-lg font-heading font-semibold text-white">Moderation Queue</h2>
        </div>
        <span className="text-xs text-gray-500">{items.length} pending</span>
      </div>

      {items.length === 0 ? (
        <div className="p-12 text-center">
          <CheckCircle className="w-10 h-10 text-green-400/50 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">All clear! No items pending review.</p>
        </div>
      ) : (
        <div className="divide-y divide-white/5">
          {items.slice(0, 10).map((item: any) => (
            <div key={item.id} className="p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  item.severity === "high" ? "bg-red-400" :
                  item.severity === "medium" ? "bg-amber-400" : "bg-blue-400"
                }`} />
                <div className="min-w-0">
                  <p className="text-sm text-white font-medium truncate">
                    {item.contentType}: {item.reason || "Flagged for review"}
                  </p>
                  <p className="text-xs text-gray-500">
                    ID: {item.contentId} · {new Date(item.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-4">
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => moderate.mutate({ id: item.id, status: "approved" })}
                  className="w-8 h-8 rounded-lg bg-green-500/10 text-green-400 flex items-center justify-center hover:bg-green-500/20 transition-colors"
                  title="Approve"
                >
                  <CheckCircle className="w-4 h-4" />
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => moderate.mutate({ id: item.id, status: "removed" })}
                  className="w-8 h-8 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center hover:bg-red-500/20 transition-colors"
                  title="Reject"
                >
                  <XCircle className="w-4 h-4" />
                </motion.button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── User List ─────────────────────────────────────────────────────────────
function UserList() {
  const [page, setPage] = useState(1);
  const users = trpc.admin.getUsers.useQuery({ page, limit: 20 });
  const data = users.data;

  return (
    <div className="rounded-2xl border border-white/5 bg-[#0D0D1A] overflow-hidden">
      <div className="p-6 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-accent-cyan" />
          <h2 className="text-lg font-heading font-semibold text-white">Users</h2>
        </div>
        <span className="text-xs text-gray-500">{data?.total ?? 0} total</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left text-xs text-gray-500 font-medium p-4">User</th>
              <th className="text-left text-xs text-gray-500 font-medium p-4">Role</th>
              <th className="text-left text-xs text-gray-500 font-medium p-4">Tier</th>
              <th className="text-left text-xs text-gray-500 font-medium p-4">Projects</th>
              <th className="text-left text-xs text-gray-500 font-medium p-4">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {(data?.users ?? []).map((u: any) => (
              <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent-pink to-accent-cyan flex items-center justify-center text-xs font-bold text-white">
                      {(u.name || "?").charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm text-white font-medium">{u.name || "Unknown"}</p>
                      <p className="text-xs text-gray-500">{u.email || ""}</p>
                    </div>
                  </div>
                </td>
                <td className="p-4">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    u.role === "admin" ? "bg-amber-500/10 text-amber-400" : "bg-white/5 text-gray-400"
                  }`}>
                    {u.role || "user"}
                  </span>
                </td>
                <td className="p-4">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    u.tier === "studio" ? "bg-accent-cyan/10 text-accent-cyan" :
                    u.tier === "pro" ? "bg-accent-pink/10 text-accent-pink" :
                    "bg-white/5 text-gray-400"
                  }`}>
                    {u.tier || "free"}
                  </span>
                </td>
                <td className="p-4 text-sm text-gray-400">{u.projectCount ?? 0}</td>
                <td className="p-4 text-xs text-gray-500">
                  {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.total > 20 && (
        <div className="p-4 border-t border-white/5 flex items-center justify-between">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-xs text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
          >
            Previous
          </button>
          <span className="text-xs text-gray-500">Page {page} of {Math.ceil(data.total / 20)}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page * 20 >= data.total}
            className="text-xs text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Subscription Overview ─────────────────────────────────────────────────
function SubscriptionOverview() {
  const subs = trpc.admin.getSubscriptions.useQuery();
  const data = subs.data ?? [];

  const tierCounts = { free: 0, pro: 0, studio: 0 };
  data.forEach((s: any) => {
    const t = s.tier as keyof typeof tierCounts;
    if (t in tierCounts) tierCounts[t]++;
  });

  const total = data.length || 1;

  return (
    <div className="rounded-2xl border border-white/5 bg-[#0D0D1A] p-6">
      <div className="flex items-center gap-3 mb-6">
        <Crown className="w-5 h-5 text-amber-400" />
        <h2 className="text-lg font-heading font-semibold text-white">Subscription Distribution</h2>
      </div>

      <div className="space-y-4">
        {(["free", "pro", "studio"] as const).map((tier) => {
          const count = tierCounts[tier];
          const pct = (count / total) * 100;
          const colors = {
            free: { bar: "#6B7280", label: "text-gray-400" },
            pro: { bar: "#E94560", label: "text-accent-pink" },
            studio: { bar: "#00D4FF", label: "text-accent-cyan" },
          };
          return (
            <div key={tier}>
              <div className="flex items-center justify-between mb-1">
                <span className={`text-sm font-medium capitalize ${colors[tier].label}`}>{tier}</span>
                <span className="text-xs text-gray-500">{count} ({pct.toFixed(0)}%)</span>
              </div>
              <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className="h-full rounded-full"
                  style={{ backgroundColor: colors[tier].bar }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Admin Dashboard ──────────────────────────────────────────────────
export default function AdminDashboard() {
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  const metrics = trpc.admin.getMetrics.useQuery(undefined, {
    enabled: isAuthenticated && user?.role === "admin",
  });

  // Redirect non-admins
  if (!isAuthenticated || (user && user.role !== "admin")) {
    return (
      <PlatformLayout>
        <div className="container py-32 text-center">
          <Shield className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <h2 className="text-2xl font-heading font-bold text-white mb-3">Admin Access Required</h2>
          <p className="text-gray-400 mb-6">This page is restricted to platform administrators.</p>
        </div>
      </PlatformLayout>
    );
  }

  const m = metrics.data;

  return (
    <PlatformLayout>
      <div className="container py-24">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          {/* Header */}
          <div className="mb-10">
            <h1 className="text-3xl md:text-4xl font-display font-bold text-white mb-2">Admin Dashboard</h1>
            <p className="text-gray-400">Platform overview and content moderation.</p>
          </div>

          {/* Metric Cards */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <MetricCard icon={Users} label="Total Users" value={m?.totalUsers ?? 0} change="+12%" color="#00D4FF" />
            <MetricCard icon={Film} label="Total Projects" value={m?.totalProjects ?? 0} change="+8%" color="#E94560" />
            <MetricCard icon={Zap} label="Total Creators" value={m?.totalCreators ?? 0} color="#FFB800" />
            <MetricCard icon={DollarSign} label="Revenue" value={`$${((m?.totalRevenue ?? 0) / 100).toFixed(0)}`} change="+15%" color="#2ECC71" />
          </div>

          {/* Two column layout */}
          <div className="grid lg:grid-cols-2 gap-6 mb-8">
            <SubscriptionOverview />
            <ModerationQueue />
          </div>

          {/* User List */}
          <UserList />
        </motion.div>
      </div>
    </PlatformLayout>
  );
}
