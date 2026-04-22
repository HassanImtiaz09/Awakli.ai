/**
 * SetupStepper — Three sub-steps inside Stage 5.
 *
 * Characters → Voices → Poses
 * Sequential enforcement: each step must be approved before the next unlocks.
 */
import { motion } from "framer-motion";
import { Check, Lock } from "lucide-react";

// ─── Copy strings (exact spec) ─────────────────────────────────────────
export const SETUP_STEPPER_COPY = {
  substep1: "Character look",
  substep2: "Voices",
  substep3: "Pose references",
};

export type SetupSubstep = 1 | 2 | 3;

interface SubstepDef {
  step: SetupSubstep;
  label: string;
}

const SUBSTEPS: SubstepDef[] = [
  { step: 1, label: SETUP_STEPPER_COPY.substep1 },
  { step: 2, label: SETUP_STEPPER_COPY.substep2 },
  { step: 3, label: SETUP_STEPPER_COPY.substep3 },
];

interface SetupStepperProps {
  currentStep: SetupSubstep;
  completedSteps: Set<SetupSubstep>;
  onStepClick: (step: SetupSubstep) => void;
}

export function SetupStepper({
  currentStep,
  completedSteps,
  onStepClick,
}: SetupStepperProps) {
  return (
    <nav className="flex gap-6 border-b border-white/[0.06] mb-8">
      {SUBSTEPS.map(({ step, label }) => {
        const isActive = currentStep === step;
        const isCompleted = completedSteps.has(step);
        // A step is locked if any previous step is not completed
        const isLocked =
          step > 1 &&
          !completedSteps.has((step - 1) as SetupSubstep);

        return (
          <button
            key={step}
            onClick={() => {
              if (!isLocked) onStepClick(step);
            }}
            disabled={isLocked}
            className={`relative pb-3 text-sm font-medium transition-colors flex items-center gap-2 ${
              isActive
                ? "text-violet-400 border-b-2 border-violet-400 -mb-px"
                : isCompleted
                ? "text-[#00E5A0] hover:text-[#00E5A0]/80 cursor-pointer"
                : isLocked
                ? "text-white/20 cursor-not-allowed"
                : "text-white/40 hover:text-white/60 cursor-pointer"
            }`}
          >
            {/* Step indicator */}
            {isCompleted ? (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="w-5 h-5 rounded-full bg-[#00E5A0]/10 flex items-center justify-center"
              >
                <Check className="w-3 h-3 text-[#00E5A0]" />
              </motion.span>
            ) : isLocked ? (
              <span className="w-5 h-5 rounded-full bg-white/5 flex items-center justify-center">
                <Lock className="w-3 h-3 text-white/20" />
              </span>
            ) : (
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  isActive
                    ? "bg-violet-500/20 text-violet-400"
                    : "bg-white/5 text-white/30"
                }`}
              >
                {step}
              </span>
            )}

            {label}
          </button>
        );
      })}
    </nav>
  );
}
