import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Shield, Zap } from "lucide-react";
import { Link } from "wouter";
import { getLoginUrl } from "@/const";
import { AwakliButton } from "@/components/awakli/AwakliButton";
import { StarField } from "@/components/awakli/StarField";

const BENEFITS = [
  { icon: Sparkles, text: "Character consistency with LoRA training" },
  { icon: Zap, text: "Priority generation queue & batch processing" },
  { icon: Shield, text: "Save projects, export high-res panels" },
];

export default function SignUp() {
  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#08080F]">
      <StarField count={120} />
      <div className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 30% 20%, rgba(0,240,255,0.07) 0%, transparent 60%)" }} />
      <div className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 80% 70%, rgba(107,91,255,0.06) 0%, transparent 50%)" }} />

      <motion.div
        className="relative z-10 w-full max-w-md mx-4"
        initial={{ opacity: 0, y: 32, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      >
        <div className="bg-[#0D0D1A] border border-white/8 rounded-2xl p-8 shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
          <div className="text-center mb-8">
            <span className="font-display text-2xl font-bold text-gradient-pink">AWAKLI</span>
            <p className="text-sm text-[#5C5C7A] mt-2">Create your free account</p>
          </div>

          {/* Benefits */}
          <div className="space-y-3 mb-6">
            {BENEFITS.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3 text-sm text-[#9494B8]">
                <Icon size={16} className="text-[#00F0FF] shrink-0" />
                <span>{text}</span>
              </div>
            ))}
          </div>

          {/* OAuth sign-up */}
          <a href={getLoginUrl()} className="block mb-6">
            <AwakliButton
              variant="primary"
              size="md"
              className="w-full"
              icon={<ArrowRight size={16} />}
              iconPosition="right"
            >
              Get Started with Manus Account
            </AwakliButton>
          </a>

          {/* Terms */}
          <p className="text-xs text-[#5C5C7A] text-center mb-6">
            By signing up, you agree to our{" "}
            <Link href="/terms"><span className="text-[#00F0FF] hover:text-[#33DFFF] cursor-pointer">Terms of Service</span></Link>{" "}
            and{" "}
            <Link href="/privacy"><span className="text-[#00F0FF] hover:text-[#33DFFF] cursor-pointer">Privacy Policy</span></Link>.
          </p>

          {/* Sign in link */}
          <p className="text-center text-sm text-[#9494B8]">
            Already have an account?{" "}
            <Link href="/signin">
              <span className="text-[#00F0FF] hover:text-[#B388FF] transition-colors cursor-pointer font-medium">
                Sign in
              </span>
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
