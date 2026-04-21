import { motion } from "framer-motion";
import { Eye, Heart, BookOpen, TrendingUp, BarChart3, ArrowUpRight, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { TopNav } from "@/components/awakli/TopNav";
import { cn } from "@/lib/utils";

export default function CreatorAnalytics() {
  const { user, isAuthenticated } = useAuth();
  const overviewQuery = trpc.creatorAnalytics.overview.useQuery(undefined, { enabled: isAuthenticated });
  const contentQuery = trpc.creatorAnalytics.contentBreakdown.useQuery(undefined, { enabled: isAuthenticated });

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#08080F] text-[#F0F0F5]">
        <TopNav />
        <div className="pt-24 pb-16 container max-w-4xl text-center">
          <BarChart3 size={48} className="mx-auto text-[#5C5C7A] mb-4" />
          <h1 className="text-2xl font-display font-bold mb-2">Creator Analytics</h1>
          <p className="text-[#9494B8]">Sign in to view your content analytics.</p>
        </div>
      </div>
    );
  }

  const overview = overviewQuery.data;
  const content = contentQuery.data ?? [];

  const stats = [
    { label: "Total Views", value: overview?.totalViews ?? 0, icon: Eye, color: "#3498DB" },
    { label: "Total Votes", value: overview?.totalVotes ?? 0, icon: Heart, color: "#6B5BFF" },
    { label: "Published", value: overview?.publishedProjects ?? 0, icon: TrendingUp, color: "#2ECC71" },
    { label: "Total Projects", value: overview?.totalProjects ?? 0, icon: BookOpen, color: "#9B59B6" },
  ];

  return (
    <div className="min-h-screen bg-[#08080F] text-[#F0F0F5]">
      <TopNav />
      <div className="pt-24 pb-16 container max-w-5xl">
        {/* Header */}
        <motion.div
          className="mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-3xl font-display font-bold mb-1">
            Creator <span className="text-gradient-pink">Analytics</span>
          </h1>
          <p className="text-[#9494B8] text-sm">Track how your content is performing across Awakli.</p>
        </motion.div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {stats.map((stat, i) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={stat.label}
                className="rounded-xl border border-white/5 bg-[#0D0D1A] p-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${stat.color}15` }}
                  >
                    <Icon size={16} style={{ color: stat.color }} />
                  </div>
                  <span className="text-xs text-[#9494B8]">{stat.label}</span>
                </div>
                <p className="text-2xl font-bold text-[#F0F0F5]">
                  {overviewQuery.isLoading ? "—" : stat.value.toLocaleString()}
                </p>
              </motion.div>
            );
          })}
        </div>

        {/* Content breakdown */}
        <motion.div
          className="rounded-xl border border-white/5 bg-[#0D0D1A] overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="p-4 border-b border-white/5">
            <h2 className="text-lg font-semibold text-[#F0F0F5]">Content Performance</h2>
          </div>
          {contentQuery.isLoading ? (
            <div className="p-8 text-center text-[#5C5C7A]">Loading...</div>
          ) : content.length === 0 ? (
            <div className="p-8 text-center">
              <BookOpen size={32} className="mx-auto text-[#5C5C7A] mb-3" />
              <p className="text-[#9494B8] text-sm">No content yet. Create your first project!</p>
              <Link href="/create">
                <span className="inline-block mt-3 text-sm text-[#00F0FF] hover:underline cursor-pointer">
                  Start creating →
                </span>
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {content.map((item: any) => (
                <div key={item.id} className="flex items-center gap-4 p-4 hover:bg-[#1C1C35]/30 transition-colors">
                  {/* Cover */}
                  <div className="w-12 h-16 rounded-lg overflow-hidden bg-[#1C1C35] shrink-0">
                    {item.coverImageUrl ? (
                      <img src={item.coverImageUrl} alt={item.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#5C5C7A]">
                        <BookOpen size={16} />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-[#F0F0F5] truncate">{item.title}</h3>
                      <span className={cn(
                        "px-1.5 py-0.5 rounded text-[10px] font-medium uppercase",
                        item.publicationStatus === "published"
                          ? "bg-[#2ECC71]/10 text-[#2ECC71]"
                          : "bg-[#5C5C7A]/10 text-[#5C5C7A]"
                      )}>
                        {item.publicationStatus ?? "draft"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-[#5C5C7A]">
                      <span className="flex items-center gap-1">
                        <Eye size={12} />
                        {item.viewCountFormatted ?? item.viewCount ?? 0}
                      </span>
                      <span className="flex items-center gap-1">
                        <Heart size={12} />
                        {item.voteScore ?? 0}
                      </span>
                      {item.publishedAt && (
                        <span>Published {new Date(item.publishedAt).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {item.slug && (
                      <Link href={`/watch/${item.slug}`}>
                        <span className="w-8 h-8 rounded-lg flex items-center justify-center text-[#5C5C7A] hover:text-[#F0F0F5] hover:bg-[#1C1C35] transition-colors cursor-pointer">
                          <ExternalLink size={14} />
                        </span>
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
