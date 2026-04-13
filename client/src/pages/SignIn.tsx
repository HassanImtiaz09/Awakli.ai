import { motion } from "framer-motion";
import { ArrowRight, Github, Chrome } from "lucide-react";
import React, { useState } from "react";
import { Link } from "wouter";
import { getLoginUrl } from "@/const";
import { AwakliButton } from "@/components/awakli/AwakliButton";
import { AwakliInput } from "@/components/awakli/AwakliInput";
import { StarField } from "@/components/awakli/StarField";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#08080F]">
      {/* Animated background */}
      <StarField count={120} />
      <div className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 50% 30%, rgba(233,69,96,0.08) 0%, transparent 60%)" }} />
      <div className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 70% 80%, rgba(0,212,255,0.05) 0%, transparent 50%)" }} />

      {/* Card */}
      <motion.div
        className="relative z-10 w-full max-w-md mx-4"
        initial={{ opacity: 0, y: 32, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      >
        <div className="bg-[#0D0D1A] border border-white/8 rounded-2xl p-8 shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
          {/* Logo */}
          <div className="text-center mb-8">
            <span className="font-display text-2xl font-bold text-gradient-pink">AWAKLI</span>
            <p className="text-sm text-[#5C5C7A] mt-1">Sign in to your account</p>
          </div>

          {/* OAuth buttons */}
          <div className="space-y-3 mb-6">
            <a href={getLoginUrl()} className="block">
              <motion.button
                className="w-full flex items-center justify-center gap-3 h-11 bg-[#151528] border border-white/10 rounded-lg text-sm text-[#F0F0F5] hover:bg-[#1C1C35] hover:border-white/20 transition-all"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                <Chrome size={18} className="text-[#4285F4]" />
                Continue with Google
              </motion.button>
            </a>
            <a href={getLoginUrl()} className="block">
              <motion.button
                className="w-full flex items-center justify-center gap-3 h-11 bg-[#151528] border border-white/10 rounded-lg text-sm text-[#F0F0F5] hover:bg-[#1C1C35] hover:border-white/20 transition-all"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                <Github size={18} className="text-[#9494B8]" />
                Continue with GitHub
              </motion.button>
            </a>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-white/8" />
            <span className="text-xs text-[#5C5C7A]">or continue with email</span>
            <div className="flex-1 h-px bg-white/8" />
          </div>

          {/* Email form */}
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); window.location.href = getLoginUrl(); }}>
            <AwakliInput
              label="Email address"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            <AwakliInput
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded border-white/20 bg-[#151528] accent-[#E94560]" />
                <span className="text-xs text-[#9494B8]">Remember me</span>
              </label>
              <a href="#" className="text-xs text-[#00D4FF] hover:text-[#33DFFF] transition-colors">
                Forgot password?
              </a>
            </div>

            <AwakliButton
              type="submit"
              variant="primary"
              size="md"
              className="w-full"
              icon={<ArrowRight size={16} />}
              iconPosition="right"
            >
              Sign In
            </AwakliButton>
          </form>

          {/* Sign up link */}
          <p className="text-center text-sm text-[#9494B8] mt-6">
            Don't have an account?{" "}
            <Link href="/signup">
              <span className="text-[#E94560] hover:text-[#FF5A7A] transition-colors cursor-pointer font-medium">
                Sign up free
              </span>
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
