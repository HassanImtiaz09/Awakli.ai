import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, ChevronRight, LayoutDashboard, Upload,
  Film, Settings, Layers, Users, Zap
} from "lucide-react";
import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/studio",          label: "Dashboard",  icon: <LayoutDashboard size={18} /> },
  { href: "/studio/upload",   label: "Upload",     icon: <Upload size={18} /> },
  { href: "/studio/projects", label: "Projects",   icon: <Layers size={18} /> },
  { href: "/studio/pipeline", label: "Pipeline",   icon: <Zap size={18} /> },
  { href: "/studio/frames",   label: "Frames",     icon: <Film size={18} /> },
  { href: "/studio/characters", label: "Characters", icon: <Users size={18} /> },
  { href: "/studio/settings", label: "Settings",   icon: <Settings size={18} /> },
];

interface StudioSidebarProps {
  className?: string;
}

export function StudioSidebar({ className }: StudioSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [location] = useLocation();

  // Auto-collapse on smaller screens
  useEffect(() => {
    const check = () => setCollapsed(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return (
    <motion.aside
      className={cn(
        "relative flex flex-col h-full",
        "bg-[#0D0D1A] border-r border-white/5",
        "transition-all duration-300 ease-in-out",
        className
      )}
      animate={{ width: collapsed ? 64 : 240 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
    >
      {/* Logo area */}
      <div className="h-16 flex items-center border-b border-white/5 px-4 shrink-0 overflow-hidden">
        <AnimatePresence mode="wait">
          {collapsed ? (
            <motion.span
              key="logo-short"
              className="font-display text-sm font-bold text-gradient-pink"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              AW
            </motion.span>
          ) : (
            <motion.span
              key="logo-full"
              className="font-display text-base font-bold text-gradient-pink whitespace-nowrap"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              AWAKLI
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-4 space-y-0.5 overflow-y-auto overflow-x-hidden">
        {NAV_ITEMS.map((item) => {
          const isActive = location === item.href || (item.href !== "/studio" && location.startsWith(item.href));
          return (
            <SidebarItem
              key={item.href}
              item={item}
              active={isActive}
              collapsed={collapsed}
            />
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="p-3 border-t border-white/5 shrink-0">
        <motion.button
          className="w-full flex items-center justify-center h-8 rounded-lg text-[#5C5C7A] hover:text-[#F0F0F5] hover:bg-[#1C1C35] transition-colors"
          onClick={() => setCollapsed(!collapsed)}
          whileTap={{ scale: 0.95 }}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </motion.button>
      </div>
    </motion.aside>
  );
}

function SidebarItem({ item, active, collapsed }: { item: NavItem; active: boolean; collapsed: boolean }) {
  return (
    <Link href={item.href}>
      <motion.span
        className={cn(
          "relative flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg",
          "text-sm font-medium transition-colors cursor-pointer",
          "overflow-hidden whitespace-nowrap",
          active
            ? "bg-[#1C1C35] text-[#F0F0F5]"
            : "text-[#9494B8] hover:text-[#F0F0F5] hover:bg-[#1C1C35]/60"
        )}
        whileHover={{ x: 2 }}
        transition={{ duration: 0.15 }}
        title={collapsed ? item.label : undefined}
      >
        {/* Active indicator */}
        {active && (
          <motion.div
            className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-gradient-to-b from-[#E94560] to-[#FF6B81] rounded-full"
            layoutId="sidebar-active"
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          />
        )}
        <span className={cn("shrink-0", active && "text-[#E94560]")}>{item.icon}</span>
        <AnimatePresence>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              {item.label}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.span>
    </Link>
  );
}
