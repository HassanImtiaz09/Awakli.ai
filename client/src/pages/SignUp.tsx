import { motion } from "framer-motion";
import { ArrowRight, Chrome, Github } from "lucide-react";
import React, { useState } from "react";
import { Link } from "wouter";
import { getLoginUrl } from "@/const";
import { AwakliButton } from "@/components/awakli/AwakliButton";
import { AwakliInput } from "@/components/awakli/AwakliInput";
import { StarField } from "@/components/awakli/StarField";

export default function SignUp() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#08080F]">
      <StarField count={120} />
      <div className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 30% 20%, rgba(0,212,255,0.07) 0%, transparent 60%)" }} />
      <div className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 80% 70%, rgba(233,69,96,0.06) 0%, transparent 50%)" }} />

      <motion.div
        className="relative z-10 w-full max-w-md mx-4"
        initial={{ opacity: 0, y: 32, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      >
        <div className="bg-[#0D0D1A] border border-white/8 rounded-2xl p-8 shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
          <div className="text-center mb-8">
            <span className="font-display text-2xl font-bold text-gradient-pink">AWAKLI</span>
            <p className="text-sm text-[#5C5C7A] mt-1">Create your free account</p>
          </div>

          <div className="space-y-3 mb-6">
            <a href={getLoginUrl()} className="block">
              <motion.button
                className="w-full flex items-center justify-center gap-3 h-11 bg-[#151528] border border-white/10 rounded-lg text-sm text-[#F0F0F5] hover:bg-[#1C1C35] hover:border-white/20 transition-all"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                <Chrome size={18} className="text-[#4285F4]" />
                Sign up with Google
              </motion.button>
            </a>
            <a href={getLoginUrl()} className="block">
              <motion.button
                className="w-full flex items-center justify-center gap-3 h-11 bg-[#151528] border border-white/10 rounded-lg text-sm text-[#F0F0F5] hover:bg-[#1C1C35] hover:border-white/20 transition-all"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                <Github size={18} className="text-[#9494B8]" />
                Sign up with GitHub
              </motion.button>
            </a>
          </div>

          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-white/8" />
            <span className="text-xs text-[#5C5C7A]">or continue with email</span>
            <div className="flex-1 h-px bg-white/8" />
          </div>

          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); window.location.href = getLoginUrl(); }}>
            <AwakliInput
              label="Full name"
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
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
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              hint="Use 8+ characters with a mix of letters, numbers and symbols"
            />

            <p className="text-xs text-[#5C5C7A]">
              By signing up, you agree to our{" "}
              <a href="/terms" className="text-[#00D4FF] hover:text-[#33DFFF]">Terms of Service</a>{" "}
              and{" "}
              <a href="/privacy" className="text-[#00D4FF] hover:text-[#33DFFF]">Privacy Policy</a>.
            </p>

            <AwakliButton
              type="submit"
              variant="primary"
              size="md"
              className="w-full"
              icon={<ArrowRight size={16} />}
              iconPosition="right"
            >
              Create Account
            </AwakliButton>
          </form>

          <p className="text-center text-sm text-[#9494B8] mt-6">
            Already have an account?{" "}
            <Link href="/signin">
              <span className="text-[#E94560] hover:text-[#FF5A7A] transition-colors cursor-pointer font-medium">
                Sign in
              </span>
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
