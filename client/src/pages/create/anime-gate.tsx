/**
 * Stage 4 · Anime Gate — upgrade moment (non-subscribed).
 *
 * States:
 *   1. idle        — hero animates, particle field, audio toggle
 *   2. tier-hover  — card lifts, video sample begins
 *   3. checkout    — Stripe tab opens; "Waiting for confirmation…"
 *   4. confirmed   — mint checkmark → "Welcome to Mangaka" → /create/setup
 *
 * Tier routing:
 *   - Audience (free_trial without publish) → /explore
 *   - Apprentice (creator / free_trial) → gate shown, Mangaka highlighted
 *   - Mangaka+ (creator_pro / studio / enterprise) → auto-redirect to /create/setup
 */
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import CreateWizardLayout from "@/layouts/CreateWizardLayout";
import { AnimeGateHero } from "@/components/awakli/AnimeGateHero";
import {
  TierCompareCard,
  TIER_CARD_COPY,
} from "@/components/awakli/TierCompareCard";

type PageState = "idle" | "checkout" | "confirmed";

// Tiers that skip this gate entirely
const SKIP_TIERS = new Set(["creator_pro", "studio", "enterprise"]);
// Tiers that should not be here at all (no publish access)
const REDIRECT_TIERS = new Set<string>(); // free_trial can still arrive via direct URL

export default function WizardAnimeGate() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const projectId = params.get("projectId") || "";
  const numId = parseInt(projectId, 10);

  const { user } = useAuth();

  // ─── Data queries ──────────────────────────────────────────────────
  const { data: project } = trpc.projects.get.useQuery(
    { id: numId },
    { enabled: !isNaN(numId) }
  );
  const { data: subscription, refetch: refetchSub } =
    trpc.billing.getSubscription.useQuery(undefined, { enabled: !!user });

  const tier = subscription?.tier ?? "free_trial";

  // ─── Tier-aware routing ────────────────────────────────────────────
  const hasRedirected = useRef(false);
  useEffect(() => {
    if (hasRedirected.current || !subscription) return;

    if (SKIP_TIERS.has(tier)) {
      hasRedirected.current = true;
      navigate(`/create/setup?projectId=${projectId}`, { replace: true });
      return;
    }

    if (REDIRECT_TIERS.has(tier)) {
      hasRedirected.current = true;
      navigate("/explore", { replace: true });
      return;
    }
  }, [tier, subscription, navigate, projectId]);

  // ─── State ─────────────────────────────────────────────────────────
  const [pageState, setPageState] = useState<PageState>("idle");
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [confirmedTierName, setConfirmedTierName] = useState<string | null>(
    null
  );
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Completed stages ──────────────────────────────────────────────
  const completedStages = useMemo(() => {
    const s = new Set<number>();
    for (let i = 0; i <= 5; i++) s.add(i);
    return s;
  }, []);

  // ─── Analytics ─────────────────────────────────────────────────────
  const analyticsRef = useRef(false);
  useEffect(() => {
    if (!analyticsRef.current && subscription && !SKIP_TIERS.has(tier)) {
      analyticsRef.current = true;
      // stage4_gate_shown
    }
  }, [subscription, tier]);

  // ─── Stripe checkout ──────────────────────────────────────────────
  const createCheckout = trpc.billing.createCheckout.useMutation();

  const handleSelectTier = useCallback(
    async (tierKey: "creator_pro" | "studio" | "enterprise") => {
      // stage4_tier_select
      setLoadingTier(tierKey);

      // Enterprise requires contact — show toast
      if (tierKey === "enterprise") {
        toast.info("Enterprise plans require a custom quote. Contact us.");
        setLoadingTier(null);
        return;
      }

      try {
        const result = await createCheckout.mutateAsync({
          tier: tierKey as "creator_pro" | "studio",
          interval: "monthly",
        });

        if (result.url) {
          // stage4_checkout_opened
          window.open(result.url, "_blank");
          setPageState("checkout");
          toast.info(TIER_CARD_COPY.waitingState);

          // Start polling for subscription confirmation
          startPolling(tierKey);
        } else if ('upgraded' in result && result.upgraded || 'downgraded' in result && result.downgraded) {
          // Upgrade/downgrade handled inline (existing subscription)
          const tierName = tierKey === "creator_pro" ? "Mangaka" : "Studio";
          toast.success(`Successfully switched to ${tierName}!`);
          setConfirmedTierName(tierName);
          setPageState("confirmed");
          // stage4_confirmed
          setTimeout(() => {
            navigate(`/create/setup?projectId=${projectId}`);
          }, 2000);
        }
      } catch (err: any) {
        toast.error(err.message || "Failed to create checkout session");
      } finally {
        setLoadingTier(null);
      }
    },
    [createCheckout, navigate, projectId]
  );

  // ─── Subscription polling ─────────────────────────────────────────
  const startPolling = useCallback(
    (selectedTier: string) => {
      if (pollingRef.current) clearInterval(pollingRef.current);

      pollingRef.current = setInterval(async () => {
        try {
          const { data: freshSub } = await refetchSub();
          if (freshSub && SKIP_TIERS.has(freshSub.tier)) {
            // Subscription confirmed!
            if (pollingRef.current) clearInterval(pollingRef.current);
            pollingRef.current = null;
            setLoadingTier(null);

            const tierName =
              selectedTier === "creator_pro"
                ? "Mangaka"
                : selectedTier === "studio"
                ? "Studio"
                : "Studio Pro";
            setConfirmedTierName(tierName);
            setPageState("confirmed");
            // stage4_confirmed

            // Auto-navigate after 2s
            setTimeout(() => {
              navigate(`/create/setup?projectId=${projectId}`);
            }, 2000);
          }
        } catch {
          // Silently retry
        }
      }, 3000);
    },
    [refetchSub, navigate, projectId]
  );

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // ─── Decline handler ──────────────────────────────────────────────
  const handleDecline = useCallback(() => {
    // stage4_declined
    const slug = project?.slug;
    if (slug) {
      navigate(`/m/${slug}`);
    } else {
      navigate("/explore");
    }
  }, [project?.slug, navigate]);

  // ─── Don't render if tier should skip ──────────────────────────────
  if (subscription && SKIP_TIERS.has(tier)) {
    return null;
  }

  return (
    <CreateWizardLayout
      stage={4}
      projectId={projectId}
      projectTitle={project?.title || "Untitled Project"}
      completedStages={completedStages}
    >
      <div className="space-y-0">
        <AnimatePresence mode="wait">
          {/* ─── Confirmed state ──────────────────────────────────── */}
          {pageState === "confirmed" && (
            <motion.div
              key="confirmed"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="min-h-[70vh] grid place-items-center"
            >
              <div className="text-center space-y-6">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", delay: 0.2 }}
                  className="w-20 h-20 rounded-full bg-[#00E5A0]/10 flex items-center justify-center mx-auto"
                >
                  <Check className="w-10 h-10 text-[#00E5A0]" />
                </motion.div>
                <motion.h2
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="text-3xl font-bold text-white/90"
                >
                  Welcome to {confirmedTierName}
                </motion.h2>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  className="text-white/40 text-sm"
                >
                  Redirecting to your anime setup…
                </motion.p>
                <Loader2 className="w-5 h-5 text-white/20 animate-spin mx-auto" />
              </div>
            </motion.div>
          )}

          {/* ─── Checkout waiting state ───────────────────────────── */}
          {pageState === "checkout" && (
            <motion.div
              key="checkout"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-0"
            >
              <AnimeGateHero coverImageUrl={null} ambientAudioUrl={null} />

              <div className="max-w-5xl mx-auto px-6 py-12 space-y-8">
                {/* Waiting banner */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-center gap-3 p-5 rounded-2xl bg-violet-500/[0.06] border border-violet-500/15 max-w-lg mx-auto"
                >
                  <Loader2 className="w-5 h-5 text-violet-400 animate-spin flex-shrink-0" />
                  <span className="text-sm text-white/60">
                    {TIER_CARD_COPY.waitingState}
                  </span>
                </motion.div>

                <TierCompareCard
                  onSelectTier={handleSelectTier}
                  loadingTier={loadingTier}
                  onDecline={handleDecline}
                />
              </div>
            </motion.div>
          )}

          {/* ─── Idle state (default) ─────────────────────────────── */}
          {pageState === "idle" && (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-0"
            >
              <AnimeGateHero coverImageUrl={null} ambientAudioUrl={null} />

              <div className="max-w-5xl mx-auto px-6 py-12">
                <TierCompareCard
                  onSelectTier={handleSelectTier}
                  loadingTier={loadingTier}
                  onDecline={handleDecline}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </CreateWizardLayout>
  );
}
