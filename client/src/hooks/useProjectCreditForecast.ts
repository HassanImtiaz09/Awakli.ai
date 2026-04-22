/**
 * useProjectCreditForecast — X4-F: Live credit forecast hook.
 *
 * Reads the current project's panel count, scene count, voice/motion
 * duration, and LoRA/voice-clone flags, then returns per-stage costs
 * via shared/creditMath.ts.
 *
 * Cross-reacts with CreditMeter within 200ms of any input change.
 */
import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import {
  calculateProjectCosts,
  DEFAULT_PROJECT_PARAMS,
  type StageCost,
  type ProjectParams,
} from "@shared/creditMath";

export interface CreditForecast {
  stages: StageCost[];
  total: number;
  isLoading: boolean;
  params: ProjectParams;
}

/**
 * Hook that computes a live credit forecast for a given project.
 * Falls back to DEFAULT_PROJECT_PARAMS when project data isn't available yet.
 */
export function useProjectCreditForecast(projectId: number | null): CreditForecast {
  const { data: project, isLoading: projectLoading } = trpc.projects.get.useQuery(
    { id: projectId! },
    { enabled: !!projectId && !isNaN(projectId!) }
  );

  const { data: episodes = [] } = trpc.episodes.listByProject.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId && !isNaN(projectId!) }
  );

  const params: ProjectParams = useMemo(() => {
    if (!project) return DEFAULT_PROJECT_PARAMS;

    // Derive panel count from project metadata
    const panelCount = (project as any).panelCount ?? (project as any).pageCount ?? 20;

    // Count scenes from all episodes
    const sceneCount = episodes.reduce(
      (sum: number, ep: any) => sum + (ep.sceneCount ?? 0),
      0
    ) || 5; // fallback to 5 scenes

    // Check for LoRA and voice clone from project flags
    const hasLora = !!(project as any).hasLora;
    const hasVoiceClone = !!(project as any).hasVoiceClone;

    // Voice and motion duration from project metadata (0 until video stage)
    const voiceDurationSec = (project as any).voiceDurationSec ?? 0;
    const motionDurationSec = (project as any).motionDurationSec ?? 0;

    return {
      panelCount,
      voiceDurationSec,
      motionDurationSec,
      hasLora,
      hasVoiceClone,
      sceneCount,
    };
  }, [project, episodes]);

  const { stages, total } = useMemo(() => calculateProjectCosts(params), [params]);

  return {
    stages,
    total,
    isLoading: projectLoading,
    params,
  };
}
