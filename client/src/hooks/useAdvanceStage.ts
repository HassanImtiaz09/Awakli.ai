/**
 * Shared hook for wizard stage advancement.
 * Calls trpc.projects.advanceStage, handles errors with toast, navigates on success.
 */
import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { STAGES } from "@/layouts/CreateWizardLayout";

export function useAdvanceStage(projectId: string, currentStageIndex: number) {
  const [, navigate] = useLocation();
  const [advancing, setAdvancing] = useState(false);
  const advanceMut = trpc.projects.advanceStage.useMutation();
  const utils = trpc.useUtils();

  const advance = useCallback(
    async (opts?: { inputs?: Record<string, unknown>; outputs?: Record<string, unknown> }) => {
      const numId = parseInt(projectId, 10);
      if (isNaN(numId) || advancing) return;

      setAdvancing(true);
      try {
        const result = await advanceMut.mutateAsync({
          id: numId,
          inputs: opts?.inputs,
          outputs: opts?.outputs,
        });

        if (result.ok) {
          // Navigate to the next stage
          const nextStage = STAGES[currentStageIndex + 1];
          if (nextStage) {
            navigate(`/create/${nextStage.path}?projectId=${projectId}`);
          }
          // Invalidate project data so other components see the updated wizardStage
          utils.projects.get.invalidate({ id: numId });
          utils.projects.creditBalance.invalidate();
        } else {
          // Handle specific error reasons with exact copy strings
          const reason = result.reason;
          if (reason === "insufficient_credits") {
            toast.error("Insufficient credits", {
              description: result.message,
              action: result.upgrade
                ? {
                    label: "Upgrade",
                    onClick: () => navigate(result.upgrade!.url),
                  }
                : undefined,
            });
          } else if (reason === "tier_locked") {
            toast.error("Tier locked", {
              description: result.message,
              action: result.upgrade
                ? {
                    label: "Upgrade",
                    onClick: () => navigate(result.upgrade!.url),
                  }
                : undefined,
            });
          } else {
            toast.error("Cannot advance", {
              description: result.message || "Please complete all required fields before advancing.",
            });
          }
        }
      } catch (e: any) {
        toast.error("Stage advancement failed", {
          description: e.message || "An unexpected error occurred. Please try again.",
        });
      } finally {
        setAdvancing(false);
      }
    },
    [projectId, currentStageIndex, advancing, advanceMut, navigate, utils]
  );

  return { advance, advancing };
}
