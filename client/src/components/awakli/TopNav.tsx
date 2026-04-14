import { motion, AnimatePresence } from "framer-motion";
import { Menu, Search, X, LogOut, User, Settings, LayoutDashboard, Upload, Trophy } from "lucide-react";
import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { AwakliButton } from "./AwakliButton";
import { cn } from "@/lib/utils";
import SearchOverlay from "./SearchOverlay";
import { NotificationBell } from "./NotificationCenter";

const NAV_LINKS = [
  { href: "/explore", label: "Explore" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/studio", label: "Studio" },
];

export function TopNav() {
  const [scrolled, setScrolled] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [location] = useLocation();
  const { user, isAuthenticated, logout } = useAuth();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => { logout(); window.location.href = "/"; },
  });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => { setDrawerOpen(false); }, [location]);

  // Cmd+K / Ctrl+K to open search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      <motion.header
        className={cn(
          "fixed top-0 left-0 right-0 z-50 h-16",
          "transition-all duration-300",
          scrolled
            ? "bg-[rgba(8,8,15,0.92)] backdrop-blur-xl border-b border-white/5 shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
            : "bg-transparent"
        )}
        initial={{ y: -64 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <div className="container h-full flex items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/">
            <motion.span
              className="font-display text-xl font-bold text-gradient-pink cursor-pointer select-none shrink-0"
              whileHover={{ textShadow: "0 0 20px rgba(233,69,96,0.6)" }}
              transition={{ duration: 0.2 }}
            >
              AWAKLI
            </motion.span>
          </Link>

          {/* Desktop nav links */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <NavLink key={link.href} href={link.href} active={location.startsWith(link.href)}>
                {link.label}
              </NavLink>
            ))}
          </nav>

          {/* Right controls */}
          <div className="flex items-center gap-2">
            {/* Search toggle */}
            <motion.button
              className="hidden md:flex items-center justify-center gap-2 h-9 px-3 rounded-lg text-[#9494B8] hover:text-[#F0F0F5] bg-[#1C1C35]/50 hover:bg-[#1C1C35] border border-white/5 transition-colors text-xs"
              onClick={() => setSearchOpen(true)}
              whileTap={{ scale: 0.95 }}
            >
              <Search size={14} />
              <span>Search</span>
              <kbd className="hidden lg:inline-block px-1.5 py-0.5 rounded bg-white/5 text-[10px] text-[#5C5C7A] font-mono">⌘K</kbd>
            </motion.button>

            {isAuthenticated ? (
              <>
                {/* Notification bell */}
                <NotificationBell />

                {/* Avatar dropdown */}
                <div className="relative" ref={dropdownRef}>
                  <motion.button
                    className="flex items-center gap-2 rounded-full border border-white/10 hover:border-[#E94560]/40 transition-colors p-0.5 pr-3"
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    whileTap={{ scale: 0.97 }}
                  >
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#E94560] to-[#9B59B6] flex items-center justify-center text-xs font-bold text-white shrink-0">
                      {user?.name?.[0]?.toUpperCase() ?? "U"}
                    </div>
                    <span className="hidden lg:block text-sm text-[#F0F0F5] max-w-[100px] truncate">
                      {user?.name ?? "User"}
                    </span>
                  </motion.button>

                  <AnimatePresence>
                    {dropdownOpen && (
                      <motion.div
                        className="absolute right-0 top-full mt-2 w-52 bg-[#151528] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50"
                        initial={{ opacity: 0, scale: 0.95, y: -8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -8 }}
                        transition={{ duration: 0.15 }}
                      >
                        <div className="p-3 border-b border-white/5">
                          <p className="text-sm font-medium text-[#F0F0F5] truncate">{user?.name}</p>
                          <p className="text-xs text-[#5C5C7A] truncate">{user?.email}</p>
                        </div>
                        <div className="p-1.5 space-y-0.5">
                          <DropdownItem href={`/profile/${user?.id}`} icon={<User size={15} />}>My Profile</DropdownItem>
                          <DropdownItem href="/studio" icon={<LayoutDashboard size={15} />}>Studio</DropdownItem>
                          <DropdownItem href="/studio/upload" icon={<Upload size={15} />}>Upload Manga</DropdownItem>
                          <DropdownItem href="/leaderboard" icon={<Trophy size={15} />}>Leaderboard</DropdownItem>
                          <div className="border-t border-white/5 my-1" />
                          <button
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-[#E74C3C] hover:bg-[rgba(231,76,60,0.1)] transition-colors"
                            onClick={() => logoutMutation.mutate()}
                          >
                            <LogOut size={15} />
                            Sign out
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </>
            ) : (
              <div className="hidden md:flex items-center gap-2">
                <a href={getLoginUrl()}>
                  <AwakliButton variant="ghost" size="sm">Sign in</AwakliButton>
                </a>
                <a href={getLoginUrl()}>
                  <AwakliButton variant="primary" size="sm">Get Started</AwakliButton>
                </a>
              </div>
            )}

            {/* Mobile hamburger */}
            <motion.button
              className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg text-[#9494B8] hover:text-[#F0F0F5] hover:bg-[#1C1C35] transition-colors"
              onClick={() => setDrawerOpen(true)}
              whileTap={{ scale: 0.9 }}
            >
              <Menu size={20} />
            </motion.button>
          </div>
        </div>
      </motion.header>

      {/* Search overlay */}
      <SearchOverlay isOpen={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Mobile drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
            />
            <motion.div
              className="fixed top-0 right-0 bottom-0 z-50 w-72 bg-[#0D0D1A] border-l border-white/5 flex flex-col"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
            >
              <div className="flex items-center justify-between p-4 border-b border-white/5">
                <span className="font-display text-lg font-bold text-gradient-pink">AWAKLI</span>
                <button
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-[#9494B8] hover:text-[#F0F0F5] hover:bg-[#1C1C35]"
                  onClick={() => setDrawerOpen(false)}
                >
                  <X size={18} />
                </button>
              </div>
              <nav className="flex-1 p-4 space-y-1">
                {NAV_LINKS.map((link) => (
                  <Link key={link.href} href={link.href}>
                    <span className={cn(
                      "flex items-center px-3 py-2.5 rounded-lg text-sm transition-colors",
                      location.startsWith(link.href)
                        ? "bg-[#1C1C35] text-[#F0F0F5] font-medium"
                        : "text-[#9494B8] hover:text-[#F0F0F5] hover:bg-[#1C1C35]"
                    )}>
                      {link.label}
                    </span>
                  </Link>
                ))}
              </nav>
              <div className="p-4 border-t border-white/5 space-y-2">
                {isAuthenticated ? (
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-[#E74C3C] hover:bg-[rgba(231,76,60,0.1)]"
                    onClick={() => logoutMutation.mutate()}
                  >
                    <LogOut size={15} />
                    Sign out
                  </button>
                ) : (
                  <>
                    <a href={getLoginUrl()} className="block">
                      <AwakliButton variant="secondary" size="md" className="w-full">Sign in</AwakliButton>
                    </a>
                    <a href={getLoginUrl()} className="block">
                      <AwakliButton variant="primary" size="md" className="w-full">Get Started</AwakliButton>
                    </a>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href}>
      <motion.span
        className={cn(
          "relative px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer",
          active ? "text-[#F0F0F5]" : "text-[#9494B8] hover:text-[#F0F0F5]"
        )}
        whileHover={{ backgroundColor: "rgba(28,28,53,0.6)" }}
        transition={{ duration: 0.15 }}
      >
        {children}
        {active && (
          <motion.div
            className="absolute bottom-0 left-4 right-4 h-0.5 bg-gradient-to-r from-[#E94560] to-[#FF6B81] rounded-full"
            layoutId="nav-underline"
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          />
        )}
      </motion.span>
    </Link>
  );
}

function DropdownItem({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link href={href}>
      <span className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-[#9494B8] hover:text-[#F0F0F5] hover:bg-[#1C1C35] transition-colors cursor-pointer">
        {icon}
        {children}
      </span>
    </Link>
  );
}
