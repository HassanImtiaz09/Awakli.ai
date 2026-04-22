/**
 * Stage 5 · Anime Setup — Character look → Voices → Pose references.
 *
 * Mangaka: bakery presets, 24-voice catalog, auto pose sheet (2c regen)
 * Studio: LoRATrainer (120c), VoiceClone (80c, consent), UserVoiceOverlay (6c/line)
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings2,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import CreateWizardLayout from "@/layouts/CreateWizardLayout";
import { useAdvanceStage } from "@/hooks/useAdvanceStage";
import {
  SetupStepper,
  type SetupSubstep,
} from "@/components/awakli/SetupStepper";
import { CharacterBakery } from "@/components/awakli/CharacterBakery";
import { VoiceCatalog } from "@/components/awakli/VoiceCatalog";
import { PoseSheet, type CharacterPoses, type PoseAngle, type PoseData } from "@/components/awakli/PoseSheet";
import { LoRATrainer } from "@/components/awakli/LoRATrainer";
import { VoiceClone } from "@/components/awakli/VoiceClone";
import { WithTier } from "@/components/awakli/withTier";

// ─── Tier helpers ───────────────────────────────────────────────────────
const STUDIO_TIERS = ["studio", "studio_pro"];
function isStudioTier(tier: string) {
  return STUDIO_TIERS.includes(tier);
}

export default function WizardSetup() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const projectId = params.get("projectId") || "";
  const numId = parseInt(projectId, 10);

  const { user } = useAuth();
  const { advance, advancing } = useAdvanceStage(projectId, 5);

  // ─── Data queries ──────────────────────────────────────────────────
  const { data: project } = trpc.projects.get.useQuery(
    { id: numId },
    { enabled: !isNaN(numId) },
  );

  const { data: preproData } = trpc.preProduction.getStatus.useQuery(
    { projectId: numId },
    { enabled: !isNaN(numId) },
  );

  const { data: eligibility } = trpc.publish.checkEligibility.useQuery(
    undefined,
    { enabled: !!user },
  );

  const { data: balanceData } = trpc.billing.getBalance.useQuery(
    undefined,
    { enabled: !!user },
  );

  const tier = eligibility?.tier ?? "free_trial";
  const creditBalance = balanceData?.availableBalance ?? 0;

  // Characters from pre-production
  const projectCharacters = preproData?.characters ?? [];

  // ─── Stepper state ─────────────────────────────────────────────────
  const [currentStep, setCurrentStep] = useState<SetupSubstep>(1);
  const [completedSteps, setCompletedSteps] = useState<Set<SetupSubstep>>(
    new Set(),
  );

  // ─── Step 1: Character look ────────────────────────────────────────
  const [bakerySelections, setBakerySelections] = useState<
    Record<number, string>
  >({});

  const handleBakerySelect = useCallback(
    (characterId: number, presetKey: string) => {
      setBakerySelections((prev) => ({ ...prev, [characterId]: presetKey }));
    },
    [],
  );

  // Auto-complete step 1 when all characters have a selection
  useEffect(() => {
    if (
      projectCharacters.length > 0 &&
      projectCharacters.every((c: any) => bakerySelections[c.id])
    ) {
      setCompletedSteps((prev) => new Set(Array.from(prev).concat(1)));
    }
  }, [bakerySelections, projectCharacters]);

  // ─── Step 2: Voices ────────────────────────────────────────────────
  const [voiceSelections, setVoiceSelections] = useState<
    Record<number, string>
  >({});

  const handleVoiceSelect = useCallback(
    (characterId: number, voiceId: string) => {
      setVoiceSelections((prev) => ({ ...prev, [characterId]: voiceId }));
    },
    [],
  );

  // Auto-complete step 2 when all characters have a voice
  useEffect(() => {
    if (
      projectCharacters.length > 0 &&
      projectCharacters.every((c: any) => voiceSelections[c.id])
    ) {
      setCompletedSteps((prev) => new Set(Array.from(prev).concat(2)));
    }
  }, [voiceSelections, projectCharacters]);

  // ─── Step 3: Pose references ───────────────────────────────────────
  const [approvedPoses, setApprovedPoses] = useState<
    Record<string, boolean>
  >({});

  const characterPoses: CharacterPoses[] = useMemo(() => {
    return projectCharacters.map((c: any) => ({
      characterId: c.id,
      characterName: c.name,
      poses: {
        front: {
          angle: "front" as PoseAngle,
          imageUrl: c.frontPoseUrl || null,
          status: "pending" as const,
          approved: approvedPoses[`${c.id}-front`] || false,
        },
        side: {
          angle: "side" as PoseAngle,
          imageUrl: c.sidePoseUrl || null,
          status: "pending" as const,
          approved: approvedPoses[`${c.id}-side`] || false,
        },
        back: {
          angle: "back" as PoseAngle,
          imageUrl: c.backPoseUrl || null,
          status: "pending" as const,
          approved: approvedPoses[`${c.id}-back`] || false,
        },
      } as Record<PoseAngle, PoseData>,
    }));
  }, [projectCharacters, approvedPoses]);

  const handleApprovePose = useCallback(
    (characterId: number, angle: PoseAngle) => {
      setApprovedPoses((prev) => ({
        ...prev,
        [`${characterId}-${angle}`]: true,
      }));
    },
    [],
  );

  const handleRegenPose = useCallback(
    (characterId: number, angle: PoseAngle) => {
      toast.info(`Regenerating ${angle} pose (2c)…`);
      // In production, this would call the API
    },
    [],
  );

  const handleGenerateAllPoses = useCallback(
    (characterId: number) => {
      toast.info("Generating all poses for character…");
    },
    [],
  );

  // Auto-complete step 3 when all characters have at least front+side approved
  useEffect(() => {
    if (projectCharacters.length > 0) {
      const allHaveBasicPoses = projectCharacters.every(
        (c: any) =>
          approvedPoses[`${c.id}-front`] && approvedPoses[`${c.id}-side`],
      );
      if (allHaveBasicPoses) {
        setCompletedSteps((prev) => new Set(Array.from(prev).concat(3)));
      }
    }
  }, [approvedPoses, projectCharacters]);

  // ─── Completed stages for rail ─────────────────────────────────────
  const completedStages = useMemo(() => {
    const s = new Set<number>();
    if (project?.description && project?.genre) s.add(0);
    for (let i = 1; i <= 4; i++) s.add(i);
    if (completedSteps.has(1) && completedSteps.has(2) && completedSteps.has(3))
      s.add(5);
    return s;
  }, [project, completedSteps]);

  const allStepsComplete =
    completedSteps.has(1) && completedSteps.has(2) && completedSteps.has(3);

  // ─── Studio-only: LoRA & VoiceClone handlers ──────────────────────
  const handleStartLoRA = useCallback(
    (characterId: number) => {
      toast.info("Starting LoRA training (120c)…");
    },
    [],
  );

  const handleStartVoiceClone = useCallback(
    (characterId: number) => {
      toast.info("Starting voice cloning (80c)…");
    },
    [],
  );

  // ─── Render ────────────────────────────────────────────────────────
  return (
    <CreateWizardLayout
      stage={5}
      projectId={projectId}
      projectTitle={project?.title || "Untitled Project"}
      completedStages={completedStages}
    >
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-violet-400 text-xs font-semibold uppercase tracking-widest">
            <Settings2 className="w-3.5 h-3.5" />
            Stage 05 — Anime Setup
          </div>
          <h1 className="text-3xl lg:text-4xl font-bold text-white/90">
            Prepare your characters
          </h1>
          <p className="text-white/40 text-sm">
            Define looks, assign voices, and generate pose references for
            animation.
          </p>
        </div>

        {/* Stepper nav */}
        <SetupStepper
          currentStep={currentStep}
          completedSteps={completedSteps}
          onStepClick={setCurrentStep}
        />

        {/* Step content */}
        <AnimatePresence mode="wait">
          {/* ─── Step 1: Character Look ─────────────────────────── */}
          {currentStep === 1 && (
            <motion.div
              key="step-1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-white/80">
                  Character Look
                </h2>
                <p className="text-sm text-white/40">
                  {isStudioTier(tier)
                    ? "Choose a bakery preset or train a custom LoRA model (120c) for each character."
                    : "Choose a visual style preset for each character from the bakery."}
                </p>
              </div>

              {projectCharacters.length > 0 ? (
                <>
                  <CharacterBakery
                    characters={projectCharacters.map((c: any) => ({
                      id: c.id,
                      name: c.name,
                      role: c.role || "main",
                      referenceImageUrl: c.referenceImageUrl || null,
                    }))}
                    selections={bakerySelections}
                    onSelect={handleBakerySelect}
                    currentTier={tier}
                  />

                  {/* Studio: LoRA Trainer (inline tier-locked affordance) */}
                  <WithTier capability="custom_lora_training" mode="soft">
                    <div className="mt-6 pt-6 border-t border-white/[0.06]">
                      <div className="flex items-center gap-2 mb-4">
                        <Sparkles className="w-4 h-4 text-violet-400" />
                        <span className="text-sm font-medium text-violet-400">
                          Studio Feature
                        </span>
                      </div>
                      <LoRATrainer
                        characters={projectCharacters.map((c: any) => ({
                          characterId: c.id,
                          characterName: c.name,
                          referenceCount: (c.referenceImages || []).length,
                          status: (c.loraStatus || "not_started") as any,
                          progress: c.loraProgress || 0,
                        }))}
                        onStartTraining={handleStartLoRA}
                        onRetry={handleStartLoRA}
                        creditBalance={creditBalance}
                        currentTier={tier}
                      />
                    </div>
                  </WithTier>
                </>
              ) : (
                <div className="text-center py-12 border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
                  <p className="text-white/30 text-sm">
                    No characters found. Characters are extracted from your
                    script automatically.
                  </p>
                </div>
              )}

              {/* Step 1 → Step 2 */}
              <div className="flex justify-end pt-4">
                <motion.button
                  whileHover={{
                    scale: completedSteps.has(1) ? 1.02 : 1,
                  }}
                  whileTap={{
                    scale: completedSteps.has(1) ? 0.98 : 1,
                  }}
                  onClick={() => {
                    if (completedSteps.has(1)) {
                      setCurrentStep(2);
                    } else if (projectCharacters.length === 0) {
                      // Allow skip if no characters
                      setCompletedSteps((prev) => new Set(Array.from(prev).concat(1)));
                      setCurrentStep(2);
                    } else {
                      toast.error(
                        "Select a look for all characters to continue.",
                      );
                    }
                  }}
                  className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-semibold text-sm transition-all ${
                    completedSteps.has(1) || projectCharacters.length === 0
                      ? "bg-gradient-to-r from-violet-500 to-cyan-500 text-white shadow-[0_4px_20px_rgba(107,91,255,0.3)]"
                      : "bg-white/5 text-white/20 cursor-not-allowed"
                  }`}
                >
                  Continue to Voices
                  <ArrowRight className="w-4 h-4" />
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ─── Step 2: Voices ─────────────────────────────────── */}
          {currentStep === 2 && (
            <motion.div
              key="step-2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-white/80">Voices</h2>
                <p className="text-sm text-white/40">
                  {isStudioTier(tier)
                    ? "Browse the 24-voice catalog or clone a custom voice (80c, consent required)."
                    : "Browse the 24-voice catalog and assign a voice to each character."}
                </p>
              </div>

              {projectCharacters.length > 0 ? (
                <>
                  <VoiceCatalog
                    characters={projectCharacters.map((c: any) => ({
                      id: c.id,
                      name: c.name,
                      gender: c.gender || "unknown",
                    }))}
                    selections={voiceSelections}
                    onSelect={handleVoiceSelect}
                    currentTier={tier}
                  />

                  {/* Studio: Voice Clone (inline tier-locked affordance) */}
                  <WithTier capability="voice_cloning" mode="soft">
                    <div className="mt-6 pt-6 border-t border-white/[0.06]">
                      <div className="flex items-center gap-2 mb-4">
                        <Sparkles className="w-4 h-4 text-violet-400" />
                        <span className="text-sm font-medium text-violet-400">
                          Studio Feature
                        </span>
                      </div>
                      <VoiceClone
                        characters={projectCharacters.map((c: any) => ({
                          characterId: c.id,
                          characterName: c.name,
                          status: (c.voiceCloneStatus || "not_started") as any,
                          progress: c.voiceCloneProgress || 0,
                          sampleDuration: null,
                          sampleUrl: c.voiceSampleUrl || null,
                          consentGiven: c.voiceCloneConsent || false,
                        }))}
                        onUploadSample={(id, file) =>
                          toast.info(`Uploading voice sample for character…`)
                        }
                        onConsentChange={(id, consented) =>
                          toast.info(
                            consented ? "Consent given" : "Consent revoked",
                          )
                        }
                        onStartCloning={handleStartVoiceClone}
                        onRetry={handleStartVoiceClone}
                        creditBalance={creditBalance}
                      />
                    </div>
                  </WithTier>
                </>
              ) : (
                <div className="text-center py-12 border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
                  <p className="text-white/30 text-sm">
                    No characters to assign voices to.
                  </p>
                </div>
              )}

              {/* Step 2 navigation */}
              <div className="flex justify-between pt-4">
                <button
                  onClick={() => setCurrentStep(1)}
                  className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/5 text-white/50 hover:text-white/70 text-sm transition-all"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>
                <motion.button
                  whileHover={{
                    scale: completedSteps.has(2) ? 1.02 : 1,
                  }}
                  whileTap={{
                    scale: completedSteps.has(2) ? 0.98 : 1,
                  }}
                  onClick={() => {
                    if (completedSteps.has(2)) {
                      setCurrentStep(3);
                    } else if (projectCharacters.length === 0) {
                      setCompletedSteps((prev) => new Set(Array.from(prev).concat(2)));
                      setCurrentStep(3);
                    } else {
                      toast.error(
                        "Assign a voice to all characters to continue.",
                      );
                    }
                  }}
                  className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-semibold text-sm transition-all ${
                    completedSteps.has(2) || projectCharacters.length === 0
                      ? "bg-gradient-to-r from-violet-500 to-cyan-500 text-white shadow-[0_4px_20px_rgba(107,91,255,0.3)]"
                      : "bg-white/5 text-white/20 cursor-not-allowed"
                  }`}
                >
                  Continue to Poses
                  <ArrowRight className="w-4 h-4" />
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ─── Step 3: Pose References ────────────────────────── */}
          {currentStep === 3 && (
            <motion.div
              key="step-3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-white/80">
                  Pose References
                </h2>
                <p className="text-sm text-white/40">
                  Generate and approve pose sheets for each character. Front and
                  side views are required. Regen costs 2c per pose.
                </p>
              </div>

              {projectCharacters.length > 0 ? (
                <PoseSheet
                  characterPoses={characterPoses}
                  onApprove={handleApprovePose}
                  onRegenerate={handleRegenPose}
                  onGenerateAll={handleGenerateAllPoses}
                  creditBalance={creditBalance}
                />
              ) : (
                <div className="text-center py-12 border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
                  <p className="text-white/30 text-sm">
                    No characters to generate poses for.
                  </p>
                </div>
              )}

              {/* Step 3 navigation */}
              <div className="flex justify-between pt-4">
                <button
                  onClick={() => setCurrentStep(2)}
                  className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/5 text-white/50 hover:text-white/70 text-sm transition-all"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>
                <motion.button
                  whileHover={{
                    scale: allStepsComplete && !advancing ? 1.02 : 1,
                  }}
                  whileTap={{
                    scale: allStepsComplete && !advancing ? 0.98 : 1,
                  }}
                  onClick={() => {
                    if (allStepsComplete) {
                      advance({
                        inputs: {
                          bakerySelections,
                          voiceSelections,
                          posesApproved: true,
                        },
                      });
                    } else if (projectCharacters.length === 0) {
                      // Allow skip if no characters
                      advance({
                        inputs: {
                          bakerySelections: {},
                          voiceSelections: {},
                          posesApproved: false,
                        },
                      });
                    } else {
                      toast.error(
                        "Approve front and side poses for all characters to continue.",
                      );
                    }
                  }}
                  disabled={
                    (!allStepsComplete && projectCharacters.length > 0) ||
                    advancing
                  }
                  className={`flex items-center gap-2 px-8 py-3 rounded-2xl font-semibold text-sm transition-all ${
                    (allStepsComplete || projectCharacters.length === 0) &&
                    !advancing
                      ? "bg-gradient-to-r from-token-mint to-token-cyan text-white shadow-[0_4px_20px_rgba(0,232,160,0.3)]"
                      : "bg-white/5 text-white/20 cursor-not-allowed"
                  }`}
                >
                  {advancing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Advancing...
                    </>
                  ) : (
                    <>
                      Continue to Video
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Back to gate navigation */}
        <div className="flex justify-start pt-2">
          <button
            onClick={() =>
              navigate(`/create/anime-gate?projectId=${projectId}`)
            }
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/5 text-white/50 hover:text-white/70 text-sm transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Gate
          </button>
        </div>
      </div>
    </CreateWizardLayout>
  );
}
