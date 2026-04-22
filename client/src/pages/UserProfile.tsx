import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { motion } from "framer-motion";
import { useState } from "react";
import { Link, useParams } from "wouter";
import { toast } from "sonner";
import {
  User, Film, Eye, ThumbsUp, Users, Calendar, UserPlus, UserMinus,
  Bookmark, Star, ArrowLeft
} from "lucide-react";

const TABS = ["Created", "Watchlist"] as const;

export default function UserProfile() {
  const params = useParams<{ userId: string }>();
  const userId = parseInt(params.userId || "0", 10);
  const { user, isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<typeof TABS[number]>("Created");

  const profile = trpc.userProfile.get.useQuery({ userId }, { enabled: userId > 0 });
  const followStatus = trpc.follows.status.useQuery(
    { userId },
    { enabled: isAuthenticated && userId > 0 && user?.id !== userId }
  );
  const toggleFollow = trpc.follows.toggle.useMutation({
    onSuccess: () => { followStatus.refetch(); profile.refetch(); toast.success("Updated!"); },
  });

  const p = profile.data as any;
  const isFollowing = followStatus.data?.isFollowing ?? false;
  const isOwnProfile = user?.id === userId;

  if (profile.isLoading) {
    return (
      <div className="min-h-screen bg-bg-void">
        <div className="h-48 bg-surface-1 animate-pulse" />
        <div className="container py-8">
          <div className="h-20 w-20 rounded-full bg-surface-1 animate-pulse mx-auto -mt-10" />
        </div>
      </div>
    );
  }

  if (!p) {
    return (
      <div className="min-h-screen bg-bg-void flex items-center justify-center text-white">
        <div className="text-center">
          <User className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h1 className="text-2xl font-display font-bold mb-2">User Not Found</h1>
          <Link href="/">
            <button className="px-6 py-3 rounded-xl bg-token-violet text-white font-semibold mt-4">Go Home</button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-void text-white">
      {/* Banner */}
      <div className="relative h-48 md:h-56 bg-gradient-to-br from-token-violet/20 via-token-lavender/10 to-token-cyan/20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-bg-void to-transparent" />
      </div>

      {/* Profile header */}
      <div className="container relative -mt-16">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row items-start md:items-end gap-6">
          {/* Avatar */}
          <div className="w-24 h-24 md:w-28 md:h-28 rounded-full bg-gradient-to-br from-token-violet to-token-lavender flex items-center justify-center border-4 border-bg-void shadow-xl text-3xl font-display font-bold">
            {(p.name || "U").charAt(0).toUpperCase()}
          </div>

          <div className="flex-1">
            <h1 className="text-2xl md:text-3xl font-display font-bold">{p.name || "Anonymous"}</h1>
            <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-gray-400">
              <span className="flex items-center gap-1"><Film className="w-4 h-4" /> {p.projectCount ?? 0} Projects</span>
              <span className="flex items-center gap-1"><Users className="w-4 h-4" /> {p.followerCount ?? 0} Followers</span>
              <span className="flex items-center gap-1"><Users className="w-4 h-4" /> {p.followingCount ?? 0} Following</span>
              <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> Joined {new Date(p.createdAt).toLocaleDateString()}</span>
            </div>
          </div>

          {/* Follow button */}
          {!isOwnProfile && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                if (!isAuthenticated) { window.location.href = getLoginUrl(); return; }
                toggleFollow.mutate({ userId });
              }}
              disabled={toggleFollow.isPending}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium transition-colors ${
                isFollowing
                  ? "border border-token-cyan/50 bg-token-cyan/10 text-token-cyan hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/50"
                  : "bg-token-violet text-white hover:bg-token-violet/80"
              }`}
            >
              {isFollowing ? <><UserMinus className="w-4 h-4" /> Unfollow</> : <><UserPlus className="w-4 h-4" /> Follow</>}
            </motion.button>
          )}
        </motion.div>

        {/* Tabs */}
        <div className="flex gap-1 mt-8 border-b border-white/5">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === tab
                  ? "border-token-violet text-token-violet"
                  : "border-transparent text-gray-400 hover:text-white"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="py-8">
          {activeTab === "Created" && (
            <ProjectGrid projects={p.projects ?? []} emptyText="No projects created yet." />
          )}
          {activeTab === "Watchlist" && (
            <ProjectGrid projects={p.watchlist ?? []} emptyText="Watchlist is empty." />
          )}
        </div>
      </div>
    </div>
  );
}

function ProjectGrid({ projects, emptyText }: { projects: any[]; emptyText: string }) {
  if (projects.length === 0) {
    return (
      <div className="text-center py-16">
        <Film className="w-10 h-10 text-gray-600 mx-auto mb-3" />
        <p className="text-gray-400">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {projects.map((p: any) => (
        <Link key={p.id} href={p.slug ? `/watch/${p.slug}` : "#"}>
          <motion.div
            whileHover={{ scale: 1.03 }}
            className="group rounded-xl overflow-hidden border border-white/5 bg-surface-1/30 hover:border-token-violet/20 transition-all cursor-pointer"
          >
            <div className="aspect-[3/4] bg-surface-2 relative overflow-hidden">
              {p.coverImageUrl ? (
                <img src={p.coverImageUrl} alt={p.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-token-violet/20 to-token-lavender/20 flex items-center justify-center">
                  <Film className="w-8 h-8 text-gray-600" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="p-3">
              <h3 className="text-sm font-medium text-white truncate">{p.title}</h3>
              {p.genre && <p className="text-xs text-gray-500 mt-1">{p.genre.split(",")[0]}</p>}
            </div>
          </motion.div>
        </Link>
      ))}
    </div>
  );
}
