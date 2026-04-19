/**
 * P26 Character Bible — Database Helpers
 *
 * CRUD operations for character_registries, spatial_qa_results,
 * and scene_provider_pins tables.
 */

import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../db";
import {
  characterRegistries,
  spatialQaResults,
  sceneProviderPins,
} from "../../drizzle/schema";
import type { CharacterRegistry, SpatialQaCheckResult } from "./types";

// ─── Character Registry ─────────────────────────────────────────────────

export async function getCharacterRegistry(
  storyId: number,
): Promise<{ id: number; registry: CharacterRegistry; version: number } | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db
    .select()
    .from(characterRegistries)
    .where(eq(characterRegistries.storyId, storyId))
    .orderBy(desc(characterRegistries.version))
    .limit(1);

  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    id: row.id,
    registry: row.registryJson as CharacterRegistry,
    version: row.version,
  };
}

export async function upsertCharacterRegistry(
  storyId: number,
  registry: CharacterRegistry,
): Promise<{ id: number; version: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getCharacterRegistry(storyId);
  const newVersion = existing ? existing.version + 1 : 1;

  const [result] = await db.insert(characterRegistries).values({
    storyId,
    registryJson: registry,
    version: newVersion,
  });

  return { id: result.insertId, version: newVersion };
}

export async function getRegistryHistory(storyId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db
    .select()
    .from(characterRegistries)
    .where(eq(characterRegistries.storyId, storyId))
    .orderBy(desc(characterRegistries.version));
}

// ─── Spatial QA Results ─────────────────────────────────────────────────

export async function saveSpatialQaResult(data: {
  panelId: number;
  episodeId: number;
  projectId: number;
  result: SpatialQaCheckResult;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const worstFace = data.result.faceSimilarity.reduce<{ score: number; verdict: "pass" | "soft_fail" | "hard_fail" }>(
    (worst, r) => (r.score < worst.score ? r : worst),
    { score: 1, verdict: "pass" },
  );
  const worstHeight = data.result.heightRatio.reduce<{ deviationPercent: number; verdict: "pass" | "soft_fail" | "hard_fail" }>(
    (worst, r) => (r.deviationPercent > worst.deviationPercent ? r : worst),
    { deviationPercent: 0, verdict: "pass" },
  );

  const [result] = await db.insert(spatialQaResults).values({
    panelId: data.panelId,
    episodeId: data.episodeId,
    projectId: data.projectId,
    faceSimilarityScore: worstFace.score,
    faceSimilarityVerdict: worstFace.verdict,
    heightRatioDeviation: worstHeight.deviationPercent,
    heightRatioVerdict: worstHeight.verdict,
    styleCoherenceScore: data.result.styleCoherence.score,
    styleCoherenceVerdict: data.result.styleCoherence.verdict,
    overallVerdict: data.result.overallVerdict,
    regenerationCount: 0,
    details: data.result,
  });

  return result.insertId;
}

export async function getQaResultsForPanel(panelId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db
    .select()
    .from(spatialQaResults)
    .where(eq(spatialQaResults.panelId, panelId))
    .orderBy(desc(spatialQaResults.createdAt));
}

export async function getQaResultsForProject(projectId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db
    .select()
    .from(spatialQaResults)
    .where(eq(spatialQaResults.projectId, projectId))
    .orderBy(desc(spatialQaResults.createdAt));
}

// ─── Scene Provider Pins ────────────────────────────────────────────────

export async function getSceneProviderPin(
  projectId: number,
  episodeId: number,
  sceneNumber: number,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db
    .select()
    .from(sceneProviderPins)
    .where(
      and(
        eq(sceneProviderPins.projectId, projectId),
        eq(sceneProviderPins.episodeId, episodeId),
        eq(sceneProviderPins.sceneNumber, sceneNumber),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function setSceneProviderPin(data: {
  projectId: number;
  episodeId: number;
  sceneNumber: number;
  providerId: string;
  qualityTier: "draft" | "hero";
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Upsert: delete existing pin for this scene, then insert
  await db.delete(sceneProviderPins).where(
    and(
      eq(sceneProviderPins.projectId, data.projectId),
      eq(sceneProviderPins.episodeId, data.episodeId),
      eq(sceneProviderPins.sceneNumber, data.sceneNumber),
    ),
  );
  const [result] = await db.insert(sceneProviderPins).values(data);
  return result.insertId;
}

export async function getScenePinsForEpisode(
  projectId: number,
  episodeId: number,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db
    .select()
    .from(sceneProviderPins)
    .where(
      and(
        eq(sceneProviderPins.projectId, projectId),
        eq(sceneProviderPins.episodeId, episodeId),
      ),
    );
}
