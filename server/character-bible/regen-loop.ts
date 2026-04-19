/**
 * Regeneration Loop — Auto-retry on QA failure with exponential backoff.
 *
 * Audit fix H-6: When a panel fails QA, automatically regenerate up to 3 times
 * with exponential backoff. After 3 failures, mark as 'human_review'.
 */

// ─── Types ──────────────────────────────────────────────────────────────

export interface RegenAttempt {
  attemptNumber: number;
  imageUrl: string;
  qaScore: number;
  qaVerdict: "pass" | "soft_fail" | "hard_fail";
  timestamp: Date;
}

export interface RegenResult {
  finalImageUrl: string;
  totalAttempts: number;
  finalVerdict: "pass" | "soft_fail" | "human_review";
  attempts: RegenAttempt[];
}

export interface RegenConfig {
  maxAttempts: number;
  baseDelayMs: number;
  passThreshold: number;
  softFailThreshold: number;
}

// ─── Default Config ─────────────────────────────────────────────────────

export const DEFAULT_REGEN_CONFIG: RegenConfig = {
  maxAttempts: 3,
  baseDelayMs: 2000,
  passThreshold: 0.80,
  softFailThreshold: 0.72,
};

// ─── Regeneration Loop ──────────────────────────────────────────────────

/**
 * Run the regeneration loop for a single panel.
 *
 * @param generateFn - Function that generates a new image and returns its URL
 * @param qaFn - Function that runs QA on the image and returns a score
 * @param config - Regeneration configuration
 * @param onAttempt - Optional callback for progress tracking
 */
export async function runRegenLoop(
  generateFn: () => Promise<string>,
  qaFn: (imageUrl: string) => Promise<{ score: number; verdict: "pass" | "soft_fail" | "hard_fail" }>,
  config: RegenConfig = DEFAULT_REGEN_CONFIG,
  onAttempt?: (attempt: RegenAttempt) => void,
): Promise<RegenResult> {
  const attempts: RegenAttempt[] = [];
  let bestImageUrl = "";
  let bestScore = 0;

  for (let i = 1; i <= config.maxAttempts; i++) {
    // Exponential backoff (skip delay on first attempt)
    if (i > 1) {
      const delay = config.baseDelayMs * Math.pow(2, i - 2);
      await sleep(delay);
    }

    try {
      // Generate new image
      const imageUrl = await generateFn();

      // Run QA
      const qa = await qaFn(imageUrl);

      const attempt: RegenAttempt = {
        attemptNumber: i,
        imageUrl,
        qaScore: qa.score,
        qaVerdict: qa.verdict,
        timestamp: new Date(),
      };
      attempts.push(attempt);
      onAttempt?.(attempt);

      // Track best result
      if (qa.score > bestScore) {
        bestScore = qa.score;
        bestImageUrl = imageUrl;
      }

      // Pass: return immediately
      if (qa.verdict === "pass") {
        return {
          finalImageUrl: imageUrl,
          totalAttempts: i,
          finalVerdict: "pass",
          attempts,
        };
      }

      // Soft fail on last attempt: accept the best result
      if (i === config.maxAttempts && qa.verdict === "soft_fail") {
        return {
          finalImageUrl: bestImageUrl,
          totalAttempts: i,
          finalVerdict: "soft_fail",
          attempts,
        };
      }
    } catch (error) {
      console.error(`[RegenLoop] Attempt ${i} failed:`, error);
      const attempt: RegenAttempt = {
        attemptNumber: i,
        imageUrl: "",
        qaScore: 0,
        qaVerdict: "hard_fail",
        timestamp: new Date(),
      };
      attempts.push(attempt);
      onAttempt?.(attempt);
    }
  }

  // All attempts exhausted with hard failures → human review
  return {
    finalImageUrl: bestImageUrl || attempts[0]?.imageUrl || "",
    totalAttempts: attempts.length,
    finalVerdict: "human_review",
    attempts,
  };
}

// ─── Budget Tracking ────────────────────────────────────────────────────

interface SceneRegenBudget {
  sceneId: string;
  maxRegenerations: number;
  usedRegenerations: number;
}

const sceneRegenBudgets = new Map<string, SceneRegenBudget>();

/**
 * Create or get a regeneration budget for a scene.
 * Default: 3x the number of panels in the scene.
 */
export function getOrCreateRegenBudget(sceneId: string, panelCount: number): SceneRegenBudget {
  let budget = sceneRegenBudgets.get(sceneId);
  if (!budget) {
    budget = {
      sceneId,
      maxRegenerations: panelCount * 3,
      usedRegenerations: 0,
    };
    sceneRegenBudgets.set(sceneId, budget);
  }
  return budget;
}

/**
 * Consume one regeneration from the scene budget.
 * Returns false if budget is exhausted.
 */
export function consumeRegenBudget(sceneId: string): boolean {
  const budget = sceneRegenBudgets.get(sceneId);
  if (!budget) return false;
  if (budget.usedRegenerations >= budget.maxRegenerations) return false;
  budget.usedRegenerations++;
  return true;
}

/**
 * Check remaining regeneration budget for a scene.
 */
export function getRemainingRegenBudget(sceneId: string): number {
  const budget = sceneRegenBudgets.get(sceneId);
  if (!budget) return 0;
  return budget.maxRegenerations - budget.usedRegenerations;
}

// ─── Helpers ────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
