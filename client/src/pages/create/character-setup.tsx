/**
 * Stage 5 · Setup — Character/Voice from Catalog (Mangaka variant)
 *
 * Three substeps:
 *   1. Character look  — pick from 12 pre-baked style presets
 *   2. Voices          — 24 stock voices, filterable, 6s preview
 *   3. Pose references — AI-generated front/side/back, approve or regen (2c)
 *
 * States:
 *   substep 1-3  — sequential, each must be approved before next unlocks
 *   ready        — all three approved; "Go to video →" CTA
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import CreateWizardLayout from "@/layouts/CreateWizardLayout";
import {
  SetupStepper,
  type SetupSubstep,
} from "@/components/awakli/SetupStepper";
import {
  CharacterBakery,
  type CharacterForBakery,
} from "@/components/awakli/CharacterBakery";
import {
  VoiceCatalog,
  type CharacterForVoice,
} from "@/components/awakli/VoiceCatalog";
import {
  PoseSheet,
  type CharacterPoses,
  type PoseAngle,
  POSE_ANGLES,
  POSE_CREDITS,
} from "@/components/awakli/PoseSheet";

// ─── Copy strings (exact spec) ─────────────────────────────────────────
export const SETUP_COPY = {
  pageTitle: "Studio setup",
  subhead: "A few choices and we're ready to render.",
  readyCTA: "Go to video →",
};

export default function WizardCharacterSetup() {
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

  const { data: subscription } = trpc.billing.getSubscription.useQuery(
    undefined,
    { enabled: !!user }
  );
  const tier = subscription?.tier ?? "free_trial";

  const { data: creditData } = trpc.billing.getBalance.useQuery(undefined, {
    enabled: !!user,
  });
  const credits = creditData?.availableBalance ?? 0;

  const { data: projectCharacters } = trpc.characters.listByProject.useQuery(
    { projectId: numId },
    { enabled: !isNaN(numId) }
  );

  // ─── Completed stages for wizard layout ────────────────────────────
  const completedStages = useMemo(() => {
    const s = new Set<number>();
    for (let i = 0; i <= 4; i++) s.add(i); // stages 0-4 completed to reach here
    return s;
  }, []);

  // ─── Characters mapped for components ──────────────────────────────
  const characters: CharacterForBakery[] = useMemo(() => {
    if (!projectCharacters) return [];
    return projectCharacters.map((c: any) => ({
      id: c.id,
      name: c.name,
      role: c.role,
      referenceImageUrl:
        c.referenceImages && Array.isArray(c.referenceImages)
          ? c.referenceImages[0]
          : null,
    }));
  }, [projectCharacters]);

  const voiceCharacters: CharacterForVoice[] = useMemo(
    () => characters.map((c) => ({ id: c.id, name: c.name })),
    [characters]
  );

  // ─── Substep state ────────────────────────────────────────────────
  const [currentStep, setCurrentStep] = useState<SetupSubstep>(1);
  const [completedSubsteps, setCompletedSubsteps] = useState<
    Set<SetupSubstep>
  >(new Set());

  // Substep 1: Character style selections
  const [styleSelections, setStyleSelections] = useState<
    Record<number, string>
  >({});

  // Substep 2: Voice selections
  const [voiceSelections, setVoiceSelections] = useState<
    Record<number, string>
  >({});

  // Substep 3: Pose data
  const [characterPoses, setCharacterPoses] = useState<CharacterPoses[]>([]);

  // Initialize pose data when characters load
  useEffect(() => {
    if (characters.length > 0 && characterPoses.length === 0) {
      setCharacterPoses(
        characters.map((c) => ({
          characterId: c.id,
          characterName: c.name,
          poses: Object.fromEntries(
            POSE_ANGLES.map((angle) => [
              angle,
              {
                angle,
                imageUrl: null,
                status: "pending" as const,
                approved: false,
              },
            ])
          ) as Record<PoseAngle, any>,
        }))
      );
    }
  }, [characters]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Substep 1: Character style handlers ──────────────────────────
  const handleStyleSelect = useCallback(
    (characterId: number, presetKey: string) => {
      // stage5_preset_pick
      setStyleSelections((prev) => ({ ...prev, [characterId]: presetKey }));
    },
    []
  );

  const allCharactersStyled =
    characters.length > 0 &&
    characters.every((c) => !!styleSelections[c.id]);

  const handleApproveCharacters = useCallback(() => {
    if (!allCharactersStyled) {
      toast.error("Please select a style for every character.");
      return;
    }
    setCompletedSubsteps((prev) => { const n = new Set(prev); n.add(1); return n; });
    setCurrentStep(2);
    // stage5_substep_enter (voices)
  }, [allCharactersStyled]);

  // ─── Substep 2: Voice handlers ────────────────────────────────────
  const handleVoiceSelect = useCallback(
    (characterId: number, voiceId: string) => {
      // stage5_voice_pick
      setVoiceSelections((prev) => ({ ...prev, [characterId]: voiceId }));
    },
    []
  );

  const allCharactersVoiced =
    characters.length > 0 &&
    characters.every((c) => !!voiceSelections[c.id]);

  const handleApproveVoices = useCallback(() => {
    if (!allCharactersVoiced) {
      toast.error("Please select a voice for every character.");
      return;
    }
    setCompletedSubsteps((prev) => { const n = new Set(prev); n.add(2); return n; });
    setCurrentStep(3);
    // stage5_substep_enter (poses)
  }, [allCharactersVoiced]);

  // ─── Substep 3: Pose handlers ────────────────────────────────────
  const handlePoseApprove = useCallback(
    (characterId: number, angle: PoseAngle) => {
      setCharacterPoses((prev) =>
        prev.map((cp) =>
          cp.characterId === characterId
            ? {
                ...cp,
                poses: {
                  ...cp.poses,
                  [angle]: { ...cp.poses[angle], approved: true },
                },
              }
            : cp
        )
      );
    },
    []
  );

  const handlePoseRegenerate = useCallback(
    (characterId: number, angle: PoseAngle) => {
      // stage5_pose_regen
      if (credits < POSE_CREDITS.regenerateSingle) {
        toast.error("Not enough credits to regenerate this pose.");
        return;
      }

      setCharacterPoses((prev) =>
        prev.map((cp) =>
          cp.characterId === characterId
            ? {
                ...cp,
                poses: {
                  ...cp.poses,
                  [angle]: {
                    ...cp.poses[angle],
                    status: "generating" as const,
                    approved: false,
                  },
                },
              }
            : cp
        )
      );

      // Simulate generation (in production, calls server)
      setTimeout(() => {
        setCharacterPoses((prev) =>
          prev.map((cp) =>
            cp.characterId === characterId
              ? {
                  ...cp,
                  poses: {
                    ...cp.poses,
                    [angle]: {
                      ...cp.poses[angle],
                      status: "ready" as const,
                      imageUrl: null,
                    },
                  },
                }
              : cp
          )
        );
      }, 2000);
    },
    [credits]
  );

  const handleGenerateAllPoses = useCallback((characterId: number) => {
    setCharacterPoses((prev) =>
      prev.map((cp) =>
        cp.characterId === characterId
          ? {
              ...cp,
              poses: Object.fromEntries(
                POSE_ANGLES.map((angle) => [
                  angle,
                  { ...cp.poses[angle], status: "generating" as const },
                ])
              ) as Record<PoseAngle, any>,
            }
          : cp
      )
    );

    // Simulate staggered generation
    POSE_ANGLES.forEach((angle, idx) => {
      setTimeout(() => {
        setCharacterPoses((prev) =>
          prev.map((cp) =>
            cp.characterId === characterId
              ? {
                  ...cp,
                  poses: {
                    ...cp.poses,
                    [angle]: {
                      ...cp.poses[angle],
                      status: "ready" as const,
                      imageUrl: null,
                    },
                  },
                }
              : cp
          )
        );
      }, 1500 + idx * 1000);
    });
  }, []);

  const allPosesApproved =
    characterPoses.length > 0 &&
    characterPoses.every((cp) =>
      POSE_ANGLES.every((a) => cp.poses[a].approved)
    );

  const handleApprovePoses = useCallback(() => {
    if (!allPosesApproved) {
      toast.error("Please approve all poses for every character.");
      return;
    }
    setCompletedSubsteps((prev) => { const n = new Set(prev); n.add(3); return n; });
    // stage5_ready
  }, [allPosesApproved]);

  // ─── Ready state ──────────────────────────────────────────────────
  const isReady =
    completedSubsteps.has(1) &&
    completedSubsteps.has(2) &&
    completedSubsteps.has(3);

  const handleGoToVideo = useCallback(() => {
    navigate(`/create/video?projectId=${projectId}`);
  }, [navigate, projectId]);

  // ─── Step click handler ───────────────────────────────────────────
  const handleStepClick = useCallback((step: SetupSubstep) => {
    // stage5_substep_enter
    setCurrentStep(step);
  }, []);

  return (
    <CreateWizardLayout
      stage={5}
      projectId={projectId}
      projectTitle={project?.title || "Untitled Project"}
      completedStages={completedStages}
    >
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white/90">
            {SETUP_COPY.pageTitle}
          </h1>
          <p className="text-sm text-white/40 mt-2">{SETUP_COPY.subhead}</p>
        </div>

        {/* Stepper */}
        <SetupStepper
          currentStep={currentStep}
          completedSteps={completedSubsteps}
          onStepClick={handleStepClick}
        />

        {/* Substep content */}
        <AnimatePresence mode="wait">
          {/* ─── Substep 1: Character Look ─────────────────────────── */}
          {currentStep === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              {characters.length === 0 ? (
                <div className="text-center py-16">
                  <Loader2 className="w-6 h-6 text-white/20 animate-spin mx-auto mb-3" />
                  <p className="text-sm text-white/30">
                    Loading characters…
                  </p>
                </div>
              ) : (
                <>
                  <CharacterBakery
                    characters={characters}
                    selections={styleSelections}
                    onSelect={handleStyleSelect}
                    currentTier={tier}
                  />

                  <div className="flex justify-end">
                    <button
                      onClick={handleApproveCharacters}
                      disabled={!allCharactersStyled}
                      className="flex items-center gap-2 px-6 py-3 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Approve & continue
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* ─── Substep 2: Voices ─────────────────────────────────── */}
          {currentStep === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              <VoiceCatalog
                characters={voiceCharacters}
                selections={voiceSelections}
                onSelect={handleVoiceSelect}
                currentTier={tier}
              />

              <div className="flex justify-end">
                <button
                  onClick={handleApproveVoices}
                  disabled={!allCharactersVoiced}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Approve & continue
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* ─── Substep 3: Pose References ────────────────────────── */}
          {currentStep === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              <PoseSheet
                characterPoses={characterPoses}
                onApprove={handlePoseApprove}
                onRegenerate={handlePoseRegenerate}
                onGenerateAll={handleGenerateAllPoses}
                creditBalance={credits}
              />

              <div className="flex justify-end">
                <button
                  onClick={handleApprovePoses}
                  disabled={!allPosesApproved}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Approve all poses
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── Ready state banner ──────────────────────────────────── */}
        {isReady && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between p-6 rounded-2xl bg-gradient-to-r from-violet-500/[0.08] to-[#00E5A0]/[0.08] border border-violet-500/15"
          >
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-violet-400" />
              <div>
                <p className="text-sm font-semibold text-white/90">
                  Setup complete
                </p>
                <p className="text-xs text-white/40">
                  Characters styled, voices assigned, poses approved.
                </p>
              </div>
            </div>

            <button
              onClick={handleGoToVideo}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 text-white text-sm font-semibold hover:from-violet-500 hover:to-violet-400 transition-all shadow-lg shadow-violet-500/20"
            >
              {SETUP_COPY.readyCTA}
            </button>
          </motion.div>
        )}
      </div>
    </CreateWizardLayout>
  );
}
