/**
 * Zustand store for the Upgrade Modal + Top-Up Sheet.
 *
 * Manages open/close state, trigger context, active tab, selected tier,
 * selected credit pack, and processing/success lifecycle.
 */
import { create } from "zustand";

// ─── Types ──────────────────────────────────────────────────────────────────

export type TriggerContext = "gate" | "credits" | "voluntary";
export type ActiveTab = "upgrade" | "topup";
export type ModalPhase = "idle" | "browsing" | "processing" | "success" | "error";

export interface UpgradePayload {
  currentTier: string;
  required: string;
  requiredDisplayName: string;
  upgradeSku: string;
  ctaText: string;
  pricingUrl: string;
}

export interface UpgradeModalState {
  // Visibility
  isOpen: boolean;
  phase: ModalPhase;

  // Context
  trigger: TriggerContext;
  activeTab: ActiveTab;

  // Tier upgrade
  payload: UpgradePayload | null;
  selectedTier: string | null;

  // Credit top-up
  selectedPack: string | null;

  // Processing
  checkoutUrl: string | null;
  pollCount: number;
  errorMessage: string | null;

  // Success
  successTierName: string | null;

  // Actions
  openFromGate: (payload: UpgradePayload) => void;
  openFromCredits: () => void;
  openVoluntary: (defaultTab?: ActiveTab) => void;
  close: () => void;
  forceClose: () => void;
  setActiveTab: (tab: ActiveTab) => void;
  setSelectedTier: (tier: string) => void;
  setSelectedPack: (pack: string) => void;
  startProcessing: (checkoutUrl: string) => void;
  incrementPoll: () => void;
  setSuccess: (tierName: string) => void;
  setError: (message: string) => void;
  reset: () => void;
}

// ─── Initial State ──────────────────────────────────────────────────────────

const initialState = {
  isOpen: false,
  phase: "idle" as ModalPhase,
  trigger: "voluntary" as TriggerContext,
  activeTab: "upgrade" as ActiveTab,
  payload: null as UpgradePayload | null,
  selectedTier: null as string | null,
  selectedPack: null as string | null,
  checkoutUrl: null as string | null,
  pollCount: 0,
  errorMessage: null as string | null,
  successTierName: null as string | null,
};

// ─── Store ──────────────────────────────────────────────────────────────────

export const useUpgradeModal = create<UpgradeModalState>((set, get) => ({
  ...initialState,

  /**
   * Open from a tier-gate (PAYMENT_REQUIRED error).
   * Pre-selects the required tier, defaults to Upgrade tab.
   */
  openFromGate: (payload) => {
    set({
      isOpen: true,
      phase: "browsing",
      trigger: "gate",
      activeTab: "upgrade",
      payload,
      selectedTier: payload.required,
      selectedPack: null,
      checkoutUrl: null,
      pollCount: 0,
      errorMessage: null,
      successTierName: null,
    });
    emitAnalytics("upgrade_modal_open", { trigger: "gate", required: payload.required });
  },

  /**
   * Open from a credit-critical event (low balance, insufficient credits).
   * Defaults to Top-up tab.
   */
  openFromCredits: () => {
    set({
      isOpen: true,
      phase: "browsing",
      trigger: "credits",
      activeTab: "topup",
      payload: null,
      selectedTier: null,
      selectedPack: null,
      checkoutUrl: null,
      pollCount: 0,
      errorMessage: null,
      successTierName: null,
    });
    emitAnalytics("upgrade_modal_open", { trigger: "credits" });
  },

  /**
   * Open voluntarily (e.g. from pricing page or nav link).
   * Defaults to Upgrade tab unless overridden.
   */
  openVoluntary: (defaultTab = "upgrade") => {
    set({
      isOpen: true,
      phase: "browsing",
      trigger: "voluntary",
      activeTab: defaultTab,
      payload: null,
      selectedTier: null,
      selectedPack: null,
      checkoutUrl: null,
      pollCount: 0,
      errorMessage: null,
      successTierName: null,
    });
    emitAnalytics("upgrade_modal_open", { trigger: "voluntary" });
  },

  /**
   * Close the modal (blocked during processing phase).
   */
  close: () => {
    const { phase } = get();
    if (phase === "processing") return; // Block close during processing
    emitAnalytics("upgrade_modal_dismiss", { phase });
    set(initialState);
  },

  /**
   * Force-close regardless of phase (for success auto-close).
   */
  forceClose: () => {
    set(initialState);
  },

  setActiveTab: (tab) => set({ activeTab: tab }),

  setSelectedTier: (tier) => set({ selectedTier: tier }),

  setSelectedPack: (pack) => set({ selectedPack: pack }),

  /**
   * Transition to processing state after Stripe Checkout opens.
   */
  startProcessing: (checkoutUrl) => {
    set({ phase: "processing", checkoutUrl, pollCount: 0 });
  },

  incrementPoll: () => {
    set((s) => ({ pollCount: s.pollCount + 1 }));
  },

  /**
   * Transition to success state.
   */
  setSuccess: (tierName) => {
    set({ phase: "success", successTierName: tierName });
  },

  /**
   * Transition to error state.
   */
  setError: (message) => {
    set({ phase: "error", errorMessage: message });
  },

  /**
   * Full reset back to initial state.
   */
  reset: () => set(initialState),
}));

// ─── Analytics Helper ───────────────────────────────────────────────────────

function emitAnalytics(event: string, data?: Record<string, unknown>) {
  try {
    window.dispatchEvent(
      new CustomEvent("awakli:analytics", {
        detail: { event, ...data, timestamp: Date.now() },
      })
    );
  } catch {
    // Silently fail — analytics should never break the app
  }
}
