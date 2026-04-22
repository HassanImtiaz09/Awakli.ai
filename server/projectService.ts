/**
 * F3: Project Persistence Service
 * Handles stage advancement, checkpoint recording, and tier/credit validation.
 */
import { eq, and, sql, count } from "drizzle-orm";
import { getDb, getUserSubscriptionTier } from "./db";
import { projects, projectCheckpoints, tierLimits, subscriptions, usageRecords } from "../drizzle/schema";

// ─── Stage Names ─────────────────────────────────────────────────────────
export const STAGE_NAMES = [
  "input",      // 0
  "setup",      // 1
  "script",     // 2
  "panels",     // 3
  "anime-gate", // 4
  "video",      // 5
  "publish",    // 6
] as const;

// ─── Credit Costs Per Stage Transition ───────────────────────────────────
// Credits required to advance FROM a given stage (index) to the next.
const STAGE_CREDIT_COSTS: Record<number, number> = {
  0: 0,   // input → setup: free
  1: 0,   // setup → script: free
  2: 2,   // script → panels: 2 credits (script generation)
  3: 5,   // panels → anime-gate: 5 credits (panel generation)
  4: 0,   // anime-gate → video: free (community gate)
  5: 10,  // video → publish: 10 credits (video generation)
};

// ─── Tier Capability Matrix ──────────────────────────────────────────────
// Which stages each tier can access.
// New order: Input(0) → Script(1) → Panels(2) → Publish(3) → Gate(4) → Setup(5) → Video(6)
// Free path: 0–3 (manga). Anime path (4–6) requires Mangaka+.
const TIER_STAGE_ACCESS: Record<string, number> = {
  free_trial: 3,    // Manga path: Input → Script → Panels → Publish
  creator: 6,       // Mangaka: full pipeline including anime
  creator_pro: 6,   // Studio: full access
  studio: 6,        // Studio Pro: full access
  enterprise: 6,    // Enterprise: full access
};

// ─── Active Project Limits Per Tier ──────────────────────────────────────
const TIER_PROJECT_LIMITS: Record<string, number> = {
  free_trial: 3,
  creator: 10,
  creator_pro: 25,
  studio: 100,
  enterprise: Infinity,
};

// ─── Error Messages (exact strings from spec) ───────────────────────────
export const ERROR_MESSAGES = {
  insufficientCredits: (needed: number) =>
    `You need ${needed} more credits to continue. Top up or upgrade to Mangaka.`,
  tierLocked: "Studio Pro unlocks voice cloning. Upgrade to proceed.",
  validationFailed: "Please complete all required fields before advancing.",
  projectLimitReached: (limit: number) =>
    `You've reached the maximum of ${limit} active projects for your tier. Archive a project or upgrade.`,
  projectArchived: "This project has been archived and cannot be modified.",
  stageNotReached: "Complete the previous stage first.",
};

// ─── Types ───────────────────────────────────────────────────────────────
export type AdvanceStageResult =
  | { ok: true; newStage: number; checkpoint: { id: number } }
  | {
      ok: false;
      reason: "insufficient_credits" | "tier_locked" | "validation_failed" | "project_archived" | "stage_not_reached";
      message: string;
      upgrade?: { tier: string; url: string };
    };

export type CheckpointRow = {
  id: number;
  stageFrom: number;
  stageTo: number;
  inputs: unknown;
  outputs: unknown;
  creditsSpent: number;
  createdAt: Date;
};

// ─── Get User Credit Balance ─────────────────────────────────────────────
export async function getUserCreditBalance(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  // Get subscription credit grant
  const sub = await db
    .select({
      monthlyCreditGrant: subscriptions.monthlyCreditGrant,
    })
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")))
    .limit(1);

  const monthlyGrant = sub[0]?.monthlyCreditGrant ?? 15; // free_trial default

  // Get total credits used this month
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const used = await db
    .select({ total: sql<number>`COALESCE(SUM(${usageRecords.creditsUsed}), 0)` })
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.userId, userId),
        sql`${usageRecords.createdAt} >= ${monthStart.toISOString().slice(0, 19).replace("T", " ")}`
      )
    );

  const totalUsed = Number(used[0]?.total ?? 0);
  return Math.max(0, monthlyGrant - totalUsed);
}

// ─── Count Active Projects ───────────────────────────────────────────────
export async function countActiveProjects(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const result = await db
    .select({ count: count() })
    .from(projects)
    .where(
      and(
        eq(projects.userId, userId),
        sql`${projects.projectState} != 'archived'`
      )
    );

  return Number(result[0]?.count ?? 0);
}

// ─── Advance Stage ───────────────────────────────────────────────────────
export async function advanceStage(
  projectId: number,
  userId: number,
  inputs?: Record<string, unknown>,
  outputs?: Record<string, unknown>
): Promise<AdvanceStageResult> {
  const db = await getDb();
  if (!db) return { ok: false, reason: "validation_failed", message: "Database unavailable" };

  // 1. Fetch project
  const project = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);

  if (!project[0]) {
    return { ok: false, reason: "validation_failed", message: "Project not found" };
  }

  const proj = project[0];

  // 2. Check project state
  if (proj.projectState === "archived") {
    return { ok: false, reason: "project_archived", message: ERROR_MESSAGES.projectArchived };
  }

  const currentStage = proj.wizardStage;
  const nextStage = currentStage + 1;

  if (nextStage > 6) {
    return { ok: false, reason: "validation_failed", message: "Project is already at the final stage." };
  }

  // 3. Get user tier
  const tier = await getUserSubscriptionTier(userId);

  // 4. Check tier access
  const maxStage = TIER_STAGE_ACCESS[tier] ?? 3;
  if (nextStage > maxStage) {
    const upgradeTier = nextStage <= 4 ? "creator" : "creator_pro";
    return {
      ok: false,
      reason: "tier_locked",
      message: ERROR_MESSAGES.tierLocked,
      upgrade: { tier: upgradeTier, url: "/pricing" },
    };
  }

  // 5. Check credit balance
  const creditCost = STAGE_CREDIT_COSTS[currentStage] ?? 0;
  if (creditCost > 0) {
    const balance = await getUserCreditBalance(userId);
    if (balance < creditCost) {
      const needed = creditCost - balance;
      return {
        ok: false,
        reason: "insufficient_credits",
        message: ERROR_MESSAGES.insufficientCredits(needed),
        upgrade: { tier: "creator_pro", url: "/pricing" },
      };
    }

    // Deduct credits by recording usage
    await db.insert(usageRecords).values({
      userId,
      actionType: "script", // generic action type for stage advancement
      creditsUsed: creditCost,
      projectId,
      metadata: { stage: currentStage, nextStage },
    });
  }

  // 6. Advance stage
  await db
    .update(projects)
    .set({ wizardStage: nextStage })
    .where(eq(projects.id, projectId));

  // 7. Update project state based on stage
  if (nextStage === 3) {
    // Reaching panels stage = published manga potential
  }
  if (nextStage === 6) {
    // Reaching publish stage
    await db
      .update(projects)
      .set({ projectState: "published_manga" })
      .where(eq(projects.id, projectId));
  }

  // 8. Write checkpoint
  const checkpointResult = await db.insert(projectCheckpoints).values({
    projectId,
    userId,
    stageFrom: currentStage,
    stageTo: nextStage,
    inputs: inputs ?? null,
    outputs: outputs ?? null,
    creditsSpent: creditCost,
    metadata: { tier, timestamp: Date.now() },
  });

  const checkpointId = Number(checkpointResult[0].insertId);

  return {
    ok: true,
    newStage: nextStage,
    checkpoint: { id: checkpointId },
  };
}

// ─── Get Checkpoint History ──────────────────────────────────────────────
export async function getCheckpointHistory(
  projectId: number,
  userId: number
): Promise<CheckpointRow[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: projectCheckpoints.id,
      stageFrom: projectCheckpoints.stageFrom,
      stageTo: projectCheckpoints.stageTo,
      inputs: projectCheckpoints.inputs,
      outputs: projectCheckpoints.outputs,
      creditsSpent: projectCheckpoints.creditsSpent,
      createdAt: projectCheckpoints.createdAt,
    })
    .from(projectCheckpoints)
    .where(
      and(
        eq(projectCheckpoints.projectId, projectId),
        eq(projectCheckpoints.userId, userId)
      )
    )
    .orderBy(projectCheckpoints.createdAt);

  return rows.map((r) => ({
    ...r,
    creditsSpent: r.creditsSpent ?? 0,
  }));
}

// ─── Archive Project ─────────────────────────────────────────────────────
export async function archiveProject(projectId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const result = await db
    .update(projects)
    .set({ projectState: "archived", status: "archived" })
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));

  return true;
}

// ─── Validate Stage Requirements ─────────────────────────────────────────
// Returns true if the project has met the requirements for the current stage.
export async function validateStageRequirements(
  projectId: number,
  currentStage: number
): Promise<{ valid: boolean; message?: string }> {
  const db = await getDb();
  if (!db) return { valid: false, message: "Database unavailable" };

  switch (currentStage) {
    case 0: // Input: needs title and description
      const proj = await db
        .select({ title: projects.title, description: projects.description })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      if (!proj[0]?.title) return { valid: false, message: "Project needs a title" };
      return { valid: true };

    case 1: // Setup: needs genre and style
      const setup = await db
        .select({ genre: projects.genre, animeStyle: projects.animeStyle })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      return { valid: true }; // Setup has defaults, always valid

    case 2: // Script: needs at least one episode with script
      // Checked in the router
      return { valid: true };

    case 3: // Panels: needs approved panels
      return { valid: true };

    case 4: // Anime gate: needs community votes
      return { valid: true };

    case 5: // Video: needs generated video
      return { valid: true };

    default:
      return { valid: true };
  }
}

// ─── Get Stage Credit Cost ───────────────────────────────────────────────
export function getStageCreditCost(stage: number): number {
  return STAGE_CREDIT_COSTS[stage] ?? 0;
}

// ─── Get Tier Project Limit ─────────────────────────────────────────────
export function getTierProjectLimit(tier: string): number {
  return TIER_PROJECT_LIMITS[tier] ?? 3;
}
