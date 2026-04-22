/**
 * Stage 5 · Setup — Character/Voice/Pose (Mangaka) + LoRA/Clone/Overlay (Studio)
 *
 * Three substeps:
 *   1. Character look  — presets (Mangaka) + LoRA training (Studio+)
 *   2. Voices          — stock catalog (Mangaka) + voice cloning (Studio+) + overlay (Studio+)
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
import {
  LoRATrainer,
  type CharacterLoRA,
  LORA_CREDITS,
} from "@/components/awakli/LoRATrainer";
import {
  VoiceClone,
  type CharacterVoiceClone,
  VOICE_CLONE_COPY,
  VOICE_CLONE_CREDITS,
} from "@/components/awakli/VoiceClone";
import {
  UserVoiceOverlay,
  type DialogueLine,
  type TargetVoice,
  OVERLAY_CREDITS,
} from "@/components/awakli/UserVoiceOverlay";

// ─── Tier helpers ───────────────────────────────────────────────────────
const STUDIO_TIERS = new Set(["studio", "enterprise"]);
function isStudioTier(tier: string): boolean {
  return STUDIO_TIERS.has(tier);
}

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
  const studioAccess = isStudioTier(tier);

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
    for (let i = 0; i <= 4; i++) s.add(i);
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

  // ─── Studio: LoRA state ───────────────────────────────────────────
  const [loraCharacters, setLoraCharacters] = useState<CharacterLoRA[]>([]);

  useEffect(() => {
    if (characters.length > 0 && loraCharacters.length === 0 && studioAccess) {
      setLoraCharacters(
        characters.map((c) => ({
          characterId: c.id,
          characterName: c.name,
          referenceCount: Math.floor(Math.random() * 20) + 5, // placeholder
          status: "idle" as const,
          progress: 0,
        }))
      );
    }
  }, [characters, studioAccess]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLoraStart = useCallback((characterId: number) => {
    // stage5_lora_start
    if (credits < LORA_CREDITS.perCharacter) {
      toast.error("Not enough credits for LoRA training.");
      return;
    }
    setLoraCharacters((prev) =>
      prev.map((c) =>
        c.characterId === characterId
          ? { ...c, status: "training" as const, progress: 0 }
          : c
      )
    );
    // Simulate progress
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 15) + 5;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setLoraCharacters((prev) =>
          prev.map((c) =>
            c.characterId === characterId
              ? { ...c, status: "ready" as const, progress: 100 }
              : c
          )
        );
        // stage5_lora_ready
      } else {
        setLoraCharacters((prev) =>
          prev.map((c) =>
            c.characterId === characterId ? { ...c, progress } : c
          )
        );
      }
    }, 2000);
  }, [credits]);

  const handleLoraBatchTrain = useCallback(
    (ids: number[]) => {
      ids.forEach((id) => handleLoraStart(id));
    },
    [handleLoraStart]
  );

  const handleLoraRetry = useCallback(
    (characterId: number) => {
      setLoraCharacters((prev) =>
        prev.map((c) =>
          c.characterId === characterId
            ? { ...c, status: "idle" as const, progress: 0, errorMessage: undefined }
            : c
        )
      );
    },
    []
  );

  // ─── Studio: Voice Clone state ────────────────────────────────────
  const [voiceCloneCharacters, setVoiceCloneCharacters] = useState<
    CharacterVoiceClone[]
  >([]);

  useEffect(() => {
    if (
      characters.length > 0 &&
      voiceCloneCharacters.length === 0 &&
      studioAccess
    ) {
      setVoiceCloneCharacters(
        characters.map((c) => ({
          characterId: c.id,
          characterName: c.name,
          status: "idle" as const,
          progress: 0,
          sampleDuration: null,
          sampleUrl: null,
          consentGiven: false, // NEVER pre-checked
        }))
      );
    }
  }, [characters, studioAccess]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleVoiceCloneUpload = useCallback(
    (characterId: number, file: File) => {
      // Simulate getting duration from file
      const audio = new Audio();
      audio.src = URL.createObjectURL(file);
      audio.addEventListener("loadedmetadata", () => {
        const duration = Math.round(audio.duration);
        setVoiceCloneCharacters((prev) =>
          prev.map((c) =>
            c.characterId === characterId
              ? {
                  ...c,
                  sampleDuration: duration,
                  sampleUrl: audio.src,
                  status:
                    duration < VOICE_CLONE_COPY.sampleRange.min
                      ? ("idle" as const)
                      : ("idle" as const),
                }
              : c
          )
        );
        if (duration < VOICE_CLONE_COPY.sampleRange.min) {
          toast.error(VOICE_CLONE_COPY.tooShort);
        }
      });
    },
    []
  );

  const handleVoiceCloneConsent = useCallback(
    (characterId: number, consented: boolean) => {
      // stage5_voiceclone_consent
      setVoiceCloneCharacters((prev) =>
        prev.map((c) =>
          c.characterId === characterId
            ? { ...c, consentGiven: consented }
            : c
        )
      );
    },
    []
  );

  const handleVoiceCloneStart = useCallback(
    (characterId: number) => {
      const char = voiceCloneCharacters.find(
        (c) => c.characterId === characterId
      );
      if (!char) return;
      if (!char.consentGiven) {
        toast.error("You must agree to the consent statement before cloning.");
        return;
      }
      if (
        char.sampleDuration === null ||
        char.sampleDuration < VOICE_CLONE_COPY.sampleRange.min
      ) {
        toast.error(VOICE_CLONE_COPY.tooShort);
        return;
      }
      if (credits < VOICE_CLONE_CREDITS.perVoice) {
        toast.error("Not enough credits for voice cloning.");
        return;
      }

      setVoiceCloneCharacters((prev) =>
        prev.map((c) =>
          c.characterId === characterId
            ? { ...c, status: "training" as const, progress: 0 }
            : c
        )
      );

      // Simulate progress
      let progress = 0;
      const interval = setInterval(() => {
        progress += Math.floor(Math.random() * 12) + 3;
        if (progress >= 100) {
          progress = 100;
          clearInterval(interval);
          setVoiceCloneCharacters((prev) =>
            prev.map((c) =>
              c.characterId === characterId
                ? { ...c, status: "ready" as const, progress: 100 }
                : c
            )
          );
          // stage5_voiceclone_ready
        } else {
          setVoiceCloneCharacters((prev) =>
            prev.map((c) =>
              c.characterId === characterId ? { ...c, progress } : c
            )
          );
        }
      }, 3000);
    },
    [voiceCloneCharacters, credits]
  );

  const handleVoiceCloneRetry = useCallback((characterId: number) => {
    setVoiceCloneCharacters((prev) =>
      prev.map((c) =>
        c.characterId === characterId
          ? {
              ...c,
              status: "idle" as const,
              progress: 0,
              errorMessage: undefined,
            }
          : c
      )
    );
  }, []);

  // ─── Studio: User Voice Overlay state ─────────────────────────────
  const [overlayLines, setOverlayLines] = useState<DialogueLine[]>([]);
  const [overlayConsent, setOverlayConsent] = useState(false); // NEVER pre-checked

  const targetVoices: TargetVoice[] = useMemo(() => {
    // Use stock voices as targets
    return [
      { id: "tv01", name: "Akira", gender: "male" as const },
      { id: "tv02", name: "Haruki", gender: "male" as const },
      { id: "tv03", name: "Sakura", gender: "female" as const },
      { id: "tv04", name: "Yuki", gender: "female" as const },
      { id: "tv05", name: "Ren", gender: "neutral" as const },
    ];
  }, []);

  // Initialize overlay lines from project scenes (placeholder)
  useEffect(() => {
    if (studioAccess && overlayLines.length === 0 && characters.length > 0) {
      // In production, these come from the script/scenes
      setOverlayLines(
        characters.slice(0, 3).map((c, i) => ({
          id: `line_${i}`,
          characterId: c.id,
          characterName: c.name,
          lineText: `Sample dialogue line for ${c.name}`,
          status: "idle" as const,
          userAudioUrl: null,
          userAudioDuration: null,
          targetVoiceId: null,
          previewUrl: null,
        }))
      );
    }
  }, [studioAccess, characters]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOverlayRecordStart = useCallback((lineId: string) => {
    setOverlayLines((prev) =>
      prev.map((l) =>
        l.id === lineId ? { ...l, status: "recording" as const } : l
      )
    );
  }, []);

  const handleOverlayRecordStop = useCallback((lineId: string) => {
    setOverlayLines((prev) =>
      prev.map((l) =>
        l.id === lineId
          ? {
              ...l,
              status: "mapping" as const,
              userAudioUrl: "recorded://placeholder",
              userAudioDuration: 5,
            }
          : l
      )
    );
  }, []);

  const handleOverlayUpload = useCallback((lineId: string, _file: File) => {
    setOverlayLines((prev) =>
      prev.map((l) =>
        l.id === lineId
          ? {
              ...l,
              status: "mapping" as const,
              userAudioUrl: "uploaded://placeholder",
              userAudioDuration: 8,
            }
          : l
      )
    );
  }, []);

  const handleOverlaySelectVoice = useCallback(
    (lineId: string, voiceId: string) => {
      setOverlayLines((prev) =>
        prev.map((l) =>
          l.id === lineId ? { ...l, targetVoiceId: voiceId } : l
        )
      );
    },
    []
  );

  const handleOverlayPreview = useCallback((lineId: string) => {
    // stage5_overlay_preview
    setOverlayLines((prev) =>
      prev.map((l) =>
        l.id === lineId ? { ...l, status: "previewing" as const } : l
      )
    );
    // Simulate preview generation (within 8s per spec)
    setTimeout(() => {
      setOverlayLines((prev) =>
        prev.map((l) =>
          l.id === lineId
            ? {
                ...l,
                status: "preview_ready" as const,
                previewUrl: "preview://placeholder",
              }
            : l
        )
      );
    }, 4000);
  }, []);

  const handleOverlayApply = useCallback((lineId: string) => {
    setOverlayLines((prev) =>
      prev.map((l) =>
        l.id === lineId ? { ...l, status: "applied" as const } : l
      )
    );
  }, []);

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
    setCompletedSubsteps((prev) => {
      const n = new Set(prev);
      n.add(1);
      return n;
    });
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
    setCompletedSubsteps((prev) => {
      const n = new Set(prev);
      n.add(2);
      return n;
    });
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
    setCompletedSubsteps((prev) => {
      const n = new Set(prev);
      n.add(3);
      return n;
    });
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
                  <p className="text-sm text-white/30">Loading characters…</p>
                </div>
              ) : (
                <>
                  <CharacterBakery
                    characters={characters}
                    selections={styleSelections}
                    onSelect={handleStyleSelect}
                    currentTier={tier}
                  />

                  {/* Studio: LoRA Training */}
                  {studioAccess && loraCharacters.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-violet-400" />
                        <h3 className="text-sm font-semibold text-white/70">
                          LoRA Character Consistency
                        </h3>
                        <span className="text-[10px] text-white/20 ml-auto">
                          Studio feature
                        </span>
                      </div>
                      <LoRATrainer
                        characters={loraCharacters}
                        onStartTraining={handleLoraStart}
                        onBatchTrain={
                          tier === "enterprise"
                            ? handleLoraBatchTrain
                            : undefined
                        }
                        onRetry={handleLoraRetry}
                        creditBalance={credits}
                        currentTier={tier}
                      />
                    </div>
                  )}

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

              {/* Studio: Voice Cloning */}
              {studioAccess && voiceCloneCharacters.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-violet-400" />
                    <h3 className="text-sm font-semibold text-white/70">
                      Voice Cloning
                    </h3>
                    <span className="text-[10px] text-white/20 ml-auto">
                      Studio feature
                    </span>
                  </div>
                  <VoiceClone
                    characters={voiceCloneCharacters}
                    onUploadSample={handleVoiceCloneUpload}
                    onConsentChange={handleVoiceCloneConsent}
                    onStartCloning={handleVoiceCloneStart}
                    onRetry={handleVoiceCloneRetry}
                    creditBalance={credits}
                  />
                </div>
              )}

              {/* Studio: User Voice Overlay */}
              {studioAccess && overlayLines.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-violet-400" />
                    <h3 className="text-sm font-semibold text-white/70">
                      Voice Overlay
                    </h3>
                    <span className="text-[10px] text-white/20 ml-auto">
                      Studio feature
                    </span>
                  </div>
                  <UserVoiceOverlay
                    lines={overlayLines}
                    targetVoices={targetVoices}
                    onRecordStart={handleOverlayRecordStart}
                    onRecordStop={handleOverlayRecordStop}
                    onUploadAudio={handleOverlayUpload}
                    onSelectTargetVoice={handleOverlaySelectVoice}
                    onGeneratePreview={handleOverlayPreview}
                    onApply={handleOverlayApply}
                    creditBalance={credits}
                    consentGiven={overlayConsent}
                    onConsentChange={setOverlayConsent}
                  />
                </div>
              )}

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
