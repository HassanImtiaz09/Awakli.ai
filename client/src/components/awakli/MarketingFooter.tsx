import { motion } from "framer-motion";
import { Github, Twitter, MessageCircle, Youtube } from "lucide-react";
import React from "react";
import { Link } from "wouter";

const FOOTER_LINKS = {
  Product: [
    { label: "Discover", href: "/discover" },
    { label: "Browse", href: "/browse" },
    { label: "Studio", href: "/studio" },
    { label: "Pricing", href: "/#pricing" },
    { label: "Changelog", href: "/changelog" },
  ],
  Creators: [
    { label: "Creator Studio", href: "/studio" },
    { label: "Upload Manga", href: "/studio/upload" },
    { label: "AI Pipeline", href: "/studio/pipeline" },
    { label: "Documentation", href: "/docs" },
    { label: "Creator Program", href: "/creators" },
  ],
  Company: [
    { label: "About", href: "/about" },
    { label: "Blog", href: "/blog" },
    { label: "Careers", href: "/careers" },
    { label: "Press", href: "/press" },
    { label: "Contact", href: "/contact" },
  ],
  Legal: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
    { label: "Cookie Policy", href: "/cookies" },
    { label: "DMCA", href: "/dmca" },
  ],
};

const SOCIAL_LINKS = [
  { icon: <Twitter size={18} />, href: "https://twitter.com/awakli", label: "Twitter" },
  { icon: <Github size={18} />, href: "https://github.com/awakli", label: "GitHub" },
  { icon: <MessageCircle size={18} />, href: "https://discord.gg/awakli", label: "Discord" },
  { icon: <Youtube size={18} />, href: "https://youtube.com/@awakli", label: "YouTube" },
];

export function MarketingFooter() {
  return (
    <footer className="bg-[#0D0D1A] border-t border-white/5 mt-auto">
      <div className="container py-16">
        {/* Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          {Object.entries(FOOTER_LINKS).map(([category, links]) => (
            <div key={category}>
              <h4 className="text-xs font-semibold uppercase tracking-widest text-[#5C5C7A] mb-4">
                {category}
              </h4>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href}>
                      <span className="text-sm text-[#9494B8] hover:text-[#F0F0F5] transition-colors cursor-pointer">
                        {link.label}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/5 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="font-display text-lg font-bold text-gradient-pink">AWAKLI</span>
            <span className="text-[#5C5C7A] text-sm">
              © {new Date().getFullYear()} Awakli. All rights reserved.
            </span>
          </div>

          {/* Social icons */}
          <div className="flex items-center gap-2">
            {SOCIAL_LINKS.map((social) => (
              <motion.a
                key={social.label}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={social.label}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-[#5C5C7A] hover:text-[#F0F0F5] hover:bg-[#1C1C35] transition-colors"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                {social.icon}
              </motion.a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
