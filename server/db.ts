import { eq, desc, and, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  users, projects, mangaUploads, processingJobs,
  episodes, panels, characters,
  InsertUser, InsertProject, InsertMangaUpload, InsertProcessingJob,
  InsertEpisode, InsertPanel, InsertCharacter,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Projects ─────────────────────────────────────────────────────────────

export async function getProjectsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.createdAt));
}

export async function getProjectById(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .limit(1);
  return result[0];
}

export async function createProject(data: InsertProject) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(projects).values(data);
  return (result as any).insertId as number;
}

export async function updateProject(id: number, userId: number, data: Partial<InsertProject>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(projects).set(data).where(and(eq(projects.id, id), eq(projects.userId, userId)));
}

export async function deleteProject(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(projects).where(and(eq(projects.id, id), eq(projects.userId, userId)));
}

// ─── Manga Uploads ────────────────────────────────────────────────────────

export async function createMangaUpload(data: InsertMangaUpload) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(mangaUploads).values(data);
  return (result as any).insertId as number;
}

export async function getMangaUploadsByProject(projectId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(mangaUploads)
    .where(and(eq(mangaUploads.projectId, projectId), eq(mangaUploads.userId, userId)))
    .orderBy(desc(mangaUploads.createdAt));
}

export async function getMangaUploadById(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(mangaUploads)
    .where(and(eq(mangaUploads.id, id), eq(mangaUploads.userId, userId)))
    .limit(1);
  return result[0];
}

export async function updateMangaUploadStatus(id: number, status: InsertMangaUpload["status"]) {
  const db = await getDb();
  if (!db) return;
  await db.update(mangaUploads).set({ status }).where(eq(mangaUploads.id, id));
}

// ─── Processing Jobs ──────────────────────────────────────────────────────

export async function createProcessingJob(data: InsertProcessingJob) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(processingJobs).values(data);
  return (result as any).insertId as number;
}

export async function getJobsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(processingJobs)
    .where(eq(processingJobs.userId, userId))
    .orderBy(desc(processingJobs.createdAt));
}

export async function getJobsByProject(projectId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(processingJobs)
    .where(and(eq(processingJobs.projectId, projectId), eq(processingJobs.userId, userId)))
    .orderBy(desc(processingJobs.createdAt));
}

export async function getJobById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(processingJobs).where(eq(processingJobs.id, id)).limit(1);
  return result[0];
}

export async function updateJob(id: number, data: Partial<InsertProcessingJob>) {
  const db = await getDb();
  if (!db) return;
  await db.update(processingJobs).set(data).where(eq(processingJobs.id, id));
}

// ─── Episodes ────────────────────────────────────────────────────────────

export async function createEpisode(data: InsertEpisode) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(episodes).values(data);
  return (result as any).insertId as number;
}

export async function getEpisodesByProject(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(episodes)
    .where(eq(episodes.projectId, projectId))
    .orderBy(episodes.episodeNumber);
}

export async function getEpisodeById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(episodes).where(eq(episodes.id, id)).limit(1);
  return result[0];
}

export async function updateEpisode(id: number, data: Partial<InsertEpisode>) {
  const db = await getDb();
  if (!db) return;
  await db.update(episodes).set(data).where(eq(episodes.id, id));
}

export async function deleteEpisode(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(episodes).where(eq(episodes.id, id));
}

// ─── Panels ──────────────────────────────────────────────────────────────

export async function createPanel(data: InsertPanel) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(panels).values(data);
  return (result as any).insertId as number;
}

export async function createPanelsBulk(data: InsertPanel[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.length === 0) return;
  await db.insert(panels).values(data);
}

export async function getPanelsByEpisode(episodeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(panels)
    .where(eq(panels.episodeId, episodeId))
    .orderBy(panels.sceneNumber, panels.panelNumber);
}

export async function updatePanel(id: number, data: Partial<InsertPanel>) {
  const db = await getDb();
  if (!db) return;
  await db.update(panels).set(data).where(eq(panels.id, id));
}

export async function deletePanelsByEpisode(episodeId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(panels).where(eq(panels.episodeId, episodeId));
}

export async function getPanelById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(panels).where(eq(panels.id, id)).limit(1);
  return result[0];
}

export async function getPanelsByProject(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(panels)
    .where(eq(panels.projectId, projectId))
    .orderBy(panels.sceneNumber, panels.panelNumber);
}

export async function batchUpdatePanelStatus(panelIds: number[], status: string, reviewStatus: string) {
  const db = await getDb();
  if (!db) return;
  if (panelIds.length === 0) return;
  await db.update(panels)
    .set({ status: status as any, reviewStatus: reviewStatus as any })
    .where(inArray(panels.id, panelIds));
}

export async function getPanelsGeneratingCount(episodeId: number) {
  const db = await getDb();
  if (!db) return { total: 0, completed: 0, generating: 0 };
  const allPanels = await db.select({ status: panels.status }).from(panels)
    .where(eq(panels.episodeId, episodeId));
  return {
    total: allPanels.length,
    completed: allPanels.filter(p => p.status === 'generated' || p.status === 'approved').length,
    generating: allPanels.filter(p => p.status === 'generating').length,
  };
}

// ─── Characters ──────────────────────────────────────────────────────────

export async function createCharacter(data: InsertCharacter) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(characters).values(data);
  return (result as any).insertId as number;
}

export async function getCharactersByProject(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(characters)
    .where(eq(characters.projectId, projectId))
    .orderBy(desc(characters.createdAt));
}

export async function getCharacterById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(characters).where(eq(characters.id, id)).limit(1);
  return result[0];
}

export async function updateCharacter(id: number, data: Partial<InsertCharacter>) {
  const db = await getDb();
  if (!db) return;
  await db.update(characters).set(data).where(eq(characters.id, id));
}

export async function deleteCharacter(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(characters).where(eq(characters.id, id));
}
