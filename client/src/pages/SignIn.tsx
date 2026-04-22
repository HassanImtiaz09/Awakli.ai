import { motion } from "framer-motion";
import { ArrowRight, Shield } from "lucide-react";
import { Link } from "wouter";
import { getLoginUrl } from "@/const";
import { AwakliButton } from "@/components/awakli/AwakliButton";
import { StarField } from "@/components/awakli/StarField";

export default function SignIn() {
  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#08080F]">
      {/* Animated background */}
      <StarField count={120} />
      <div className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 50% 30%, rgba(107,91,255,0.08) 0%, transparent 60%)" }} />
      <div className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 70% 80%, rgba(0,240,255,0.05) 0%, transparent 50%)" }} />

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
            <p className="text-sm text-[#5C5C7A] mt-2">Sign in to your account</p>
          </div>

          {/* OAuth sign-in */}
          <a href={getLoginUrl()} className="block mb-6">
            <AwakliButton
              variant="primary"
              size="md"
              className="w-full"
              icon={<ArrowRight size={16} />}
              iconPosition="right"
            >
              Continue with Manus Account
            </AwakliButton>
          </a>

          {/* Security note */}
          <div className="flex items-start gap-3 p-3 rounded-lg bg-[#151528] border border-white/5">
            <Shield size={16} className="text-[#00F0FF] mt-0.5 shrink-0" />
            <p className="text-xs text-[#9494B8] leading-relaxed">
              We use secure OAuth authentication — no passwords to remember or manage.
              Your data is protected with industry-standard encryption.
            </p>
          </div>

          {/* Sign up link */}
          <p className="text-center text-sm text-[#9494B8] mt-6">
            Don't have an account?{" "}
            <Link href="/signup">
              <span className="text-[#00F0FF] hover:text-[#B388FF] transition-colors cursor-pointer font-medium">
                Sign up free
              </span>
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
