/**
 * Prompt 25 — Motion LoRA Database Helpers
 *
 * CRUD operations for motion_loras, motion_lora_configs, and motion_coverage_matrix tables.
 * All helpers follow the project pattern: getDb(), early-return on missing DB, return raw Drizzle rows.
 */

import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  motionLoras, motionLoraConfigs, motionCoverageMatrix,
  type InsertMotionLora, type InsertMotionLoraConfig, type InsertMotionCoverageMatrix,
  type MotionLora, type MotionLoraConfig, type MotionCoverageMatrix,
} from "../drizzle/schema";

// ─── Motion LoRA CRUD ──────────────────────────────────────────────────

/** Get all motion LoRAs for a character, newest first */
export async function getMotionLorasByCharacter(characterId: number): Promise<MotionLora[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(motionLoras)
    .where(eq(motionLoras.characterId, characterId))
    .orderBy(desc(motionLoras.version));
}

/** Get a single motion LoRA by ID */
export async function getMotionLoraById(id: number): Promise<MotionLora | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(motionLoras).where(eq(motionLoras.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Get the currently promoted (active) motion LoRA for a character */
export async function getActiveMotionLora(characterId: number): Promise<MotionLora | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(motionLoras)
    .where(and(
      eq(motionLoras.characterId, characterId),
      eq(motionLoras.status, "promoted"),
    ))
    .orderBy(desc(motionLoras.version))
    .limit(1);
  return rows[0] ?? null;
}

/** Create a new motion LoRA record */
export async function createMotionLora(data: InsertMotionLora): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Auto-increment version for this character
  const existing = await db.select({ maxVersion: sql<number>`COALESCE(MAX(${motionLoras.version}), 0)` })
    .from(motionLoras)
    .where(eq(motionLoras.characterId, data.characterId));
  const nextVersion = (existing[0]?.maxVersion ?? 0) + 1;

  const result = await db.insert(motionLoras).values({
    ...data,
    version: nextVersion,
  });
  return (result as any)[0].insertId;
}

/** Update a motion LoRA record */
export async function updateMotionLora(
  id: number,
  updates: Partial<Pick<MotionLora,
    "status" | "artifactUrl" | "artifactKey" | "triggerToken" |
    "trainingSteps" | "trainingClipCount" | "frameCount" | "baseWeight" |
    "evaluationResults" | "evaluationVerdict" | "evaluationCostUsd" |
    "trainingCostCredits" | "trainingStartedAt" | "trainingCompletedAt" | "evaluatedAt"
  >>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(motionLoras).set(updates).where(eq(motionLoras.id, id));
}

/** Retire a motion LoRA (soft-delete: set status to "retired") */
export async function retireMotionLora(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(motionLoras).set({ status: "retired" }).where(eq(motionLoras.id, id));
}

/** Promote a motion LoRA and retire all previous versions for the same character */
export async function promoteMotionLora(id: number, characterId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Retire all currently promoted versions for this character
  await db.update(motionLoras)
    .set({ status: "retired" })
    .where(and(
      eq(motionLoras.characterId, characterId),
      eq(motionLoras.status, "promoted"),
    ));

  // Promote the specified version
  await db.update(motionLoras)
    .set({ status: "promoted" })
    .where(eq(motionLoras.id, id));
}

/** Count training jobs this month for a user (for quota enforcement) */
export async function countTrainingsThisMonth(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.select({ count: sql<number>`COUNT(*)` })
    .from(motionLoras)
    .where(and(
      eq(motionLoras.userId, userId),
      sql`${motionLoras.createdAt} >= DATE_FORMAT(NOW(), '%Y-%m-01')`,
    ));
  return rows[0]?.count ?? 0;
}

// ─── Motion LoRA Config CRUD ───────────────────────────────────────────

/** Get the training config for a motion LoRA */
export async function getMotionLoraConfig(motionLoraId: number): Promise<MotionLoraConfig | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(motionLoraConfigs)
    .where(eq(motionLoraConfigs.motionLoraId, motionLoraId))
    .limit(1);
  return rows[0] ?? null;
}

/** Create a training config snapshot */
export async function createMotionLoraConfig(data: InsertMotionLoraConfig): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(motionLoraConfigs).values(data);
  return (result as any)[0].insertId;
}

// ─── Motion Coverage Matrix CRUD ───────────────────────────────────────

/** Get coverage matrix for a character */
export async function getCoverageByCharacter(characterId: number): Promise<MotionCoverageMatrix[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(motionCoverageMatrix)
    .where(eq(motionCoverageMatrix.characterId, characterId))
    .orderBy(motionCoverageMatrix.sceneType);
}

/** Get coverage matrix for a specific motion LoRA */
export async function getCoverageByMotionLora(motionLoraId: number): Promise<MotionCoverageMatrix[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(motionCoverageMatrix)
    .where(eq(motionCoverageMatrix.motionLoraId, motionLoraId))
    .orderBy(motionCoverageMatrix.sceneType);
}

/** Upsert a coverage matrix entry */
export async function upsertCoverageEntry(data: InsertMotionCoverageMatrix): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Check if entry exists for this motionLoraId + sceneType
  const existing = await db.select().from(motionCoverageMatrix)
    .where(and(
      eq(motionCoverageMatrix.motionLoraId, data.motionLoraId),
      eq(motionCoverageMatrix.sceneType, data.sceneType),
    ))
    .limit(1);

  if (existing.length > 0) {
    await db.update(motionCoverageMatrix)
      .set({
        clipCount: data.clipCount,
        qualityScore: data.qualityScore ?? null,
        passed: data.passed ?? 0,
        evaluatedAt: data.evaluatedAt ?? null,
      })
      .where(eq(motionCoverageMatrix.id, existing[0].id));
  } else {
    await db.insert(motionCoverageMatrix).values(data);
  }
}

/** Batch upsert coverage entries (used after evaluation) */
export async function batchUpsertCoverage(
  entries: InsertMotionCoverageMatrix[]
): Promise<void> {
  for (const entry of entries) {
    await upsertCoverageEntry(entry);
  }
}

/** Delete all coverage entries for a motion LoRA (used when retraining) */
export async function deleteCoverageByMotionLora(motionLoraId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(motionCoverageMatrix)
    .where(eq(motionCoverageMatrix.motionLoraId, motionLoraId));
}
