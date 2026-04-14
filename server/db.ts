import { eq, desc, and, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  users, projects, mangaUploads, processingJobs,
  episodes, panels, characters,
  votes, comments, follows, watchlist, notifications,
  InsertUser, InsertProject, InsertMangaUpload, InsertProcessingJob,
  InsertEpisode, InsertPanel, InsertCharacter,
  InsertVote, InsertComment, InsertFollow, InsertWatchlist, InsertNotification,
} from "../drizzle/schema";
import { like, or, asc, count, isNull, ne } from "drizzle-orm";
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

// ─── Guest User ──────────────────────────────────────────────────────────

const GUEST_OPEN_ID = "__guest__";

export async function getOrCreateGuestUser(): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.openId, GUEST_OPEN_ID)).limit(1);
  if (existing.length > 0) return existing[0].id;

  await db.insert(users).values({
    openId: GUEST_OPEN_ID,
    name: "Guest",
    email: null,
    loginMethod: "guest",
    role: "user",
    lastSignedIn: new Date(),
  });

  const created = await db.select({ id: users.id }).from(users).where(eq(users.openId, GUEST_OPEN_ID)).limit(1);
  return created[0].id;
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

// ─── Votes ──────────────────────────────────────────────────────────────

export async function castVote(userId: number, episodeId: number, voteType: "up" | "down") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Remove existing vote first
  await db.delete(votes).where(and(eq(votes.userId, userId), eq(votes.episodeId, episodeId)));
  // Insert new vote
  await db.insert(votes).values({ userId, episodeId, voteType });
}

export async function removeVote(userId: number, episodeId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(votes).where(and(eq(votes.userId, userId), eq(votes.episodeId, episodeId)));
}

export async function getVoteCounts(episodeId: number) {
  const db = await getDb();
  if (!db) return { upvotes: 0, downvotes: 0 };
  const allVotes = await db.select({ voteType: votes.voteType }).from(votes)
    .where(eq(votes.episodeId, episodeId));
  return {
    upvotes: allVotes.filter(v => v.voteType === "up").length,
    downvotes: allVotes.filter(v => v.voteType === "down").length,
  };
}

export async function getUserVote(userId: number, episodeId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(votes)
    .where(and(eq(votes.userId, userId), eq(votes.episodeId, episodeId)))
    .limit(1);
  return result[0] ?? null;
}

// ─── Comments ───────────────────────────────────────────────────────────

export async function createComment(data: InsertComment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(comments).values(data);
  return (result as any).insertId as number;
}

export async function getCommentsByEpisode(episodeId: number, sort: "newest" | "top" | "oldest" = "newest") {
  const db = await getDb();
  if (!db) return [];
  const orderFn = sort === "oldest" ? asc(comments.createdAt)
    : sort === "top" ? desc(comments.upvotes)
    : desc(comments.createdAt);
  const allComments = await db.select({
    id: comments.id,
    episodeId: comments.episodeId,
    userId: comments.userId,
    parentId: comments.parentId,
    content: comments.content,
    upvotes: comments.upvotes,
    downvotes: comments.downvotes,
    createdAt: comments.createdAt,
    userName: users.name,
  }).from(comments)
    .leftJoin(users, eq(comments.userId, users.id))
    .where(eq(comments.episodeId, episodeId))
    .orderBy(orderFn);
  return allComments;
}

export async function deleteComment(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(comments).where(and(eq(comments.id, id), eq(comments.userId, userId)));
}

// ─── Follows ────────────────────────────────────────────────────────────

export async function toggleFollow(followerId: number, followingId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(follows)
    .where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)))
    .limit(1);
  if (existing.length > 0) {
    await db.delete(follows).where(eq(follows.id, existing[0].id));
    return { following: false };
  }
  await db.insert(follows).values({ followerId, followingId });
  return { following: true };
}

export async function getFollowStatus(followerId: number, followingId: number) {
  const db = await getDb();
  if (!db) return false;
  const result = await db.select().from(follows)
    .where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)))
    .limit(1);
  return result.length > 0;
}

export async function getFollowerCount(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ cnt: count() }).from(follows)
    .where(eq(follows.followingId, userId));
  return result[0]?.cnt ?? 0;
}

export async function getFollowingCount(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ cnt: count() }).from(follows)
    .where(eq(follows.followerId, userId));
  return result[0]?.cnt ?? 0;
}

// ─── Watchlist ──────────────────────────────────────────────────────────

export async function addToWatchlist(userId: number, projectId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(watchlist)
    .where(and(eq(watchlist.userId, userId), eq(watchlist.projectId, projectId)))
    .limit(1);
  if (existing.length > 0) return existing[0].id;
  const [result] = await db.insert(watchlist).values({ userId, projectId });
  return (result as any).insertId as number;
}

export async function removeFromWatchlist(userId: number, projectId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(watchlist).where(and(eq(watchlist.userId, userId), eq(watchlist.projectId, projectId)));
}

export async function getUserWatchlist(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: watchlist.id,
    projectId: watchlist.projectId,
    lastEpisodeId: watchlist.lastEpisodeId,
    progress: watchlist.progress,
    projectTitle: projects.title,
    projectSlug: projects.slug,
    projectCover: projects.coverImageUrl,
    projectGenre: projects.genre,
  }).from(watchlist)
    .leftJoin(projects, eq(watchlist.projectId, projects.id))
    .where(eq(watchlist.userId, userId))
    .orderBy(desc(watchlist.updatedAt));
}

export async function updateWatchlistProgress(userId: number, projectId: number, lastEpisodeId: number, progress: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(watchlist)
    .set({ lastEpisodeId, progress })
    .where(and(eq(watchlist.userId, userId), eq(watchlist.projectId, projectId)));
}

export async function isInWatchlist(userId: number, projectId: number) {
  const db = await getDb();
  if (!db) return false;
  const result = await db.select().from(watchlist)
    .where(and(eq(watchlist.userId, userId), eq(watchlist.projectId, projectId)))
    .limit(1);
  return result.length > 0;
}

// ─── Notifications ──────────────────────────────────────────────────────

export async function createNotification(data: InsertNotification) {
  const db = await getDb();
  if (!db) return;
  await db.insert(notifications).values(data);
}

export async function getUserNotifications(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function markAllNotificationsRead(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(notifications).set({ isRead: 1 }).where(eq(notifications.userId, userId));
}

export async function getUnreadNotificationCount(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ cnt: count() }).from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, 0)));
  return result[0]?.cnt ?? 0;
}

// ─── Discover & Search ──────────────────────────────────────────────────

export async function getPublicProjects(opts: { limit?: number; offset?: number; genre?: string; sort?: string }) {
  const db = await getDb();
  if (!db) return [];
  const { limit: lim = 20, offset = 0, genre, sort = "trending" } = opts;
  let query = db.select({
    id: projects.id,
    title: projects.title,
    description: projects.description,
    genre: projects.genre,
    coverImageUrl: projects.coverImageUrl,
    slug: projects.slug,
    viewCount: projects.viewCount,
    voteScore: projects.voteScore,
    animeStyle: projects.animeStyle,
    createdAt: projects.createdAt,
    userId: projects.userId,
    userName: users.name,
  }).from(projects)
    .leftJoin(users, eq(projects.userId, users.id))
    .where(
      genre
        ? and(eq(projects.visibility, "public"), like(projects.genre, `%${genre}%`))
        : eq(projects.visibility, "public")
    )
    .limit(lim)
    .offset(offset);

  if (sort === "newest") query = query.orderBy(desc(projects.createdAt)) as any;
  else if (sort === "top_rated") query = query.orderBy(desc(projects.voteScore)) as any;
  else query = query.orderBy(desc(projects.voteScore), desc(projects.viewCount)) as any;

  return query;
}

export async function getFeaturedProjects() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: projects.id,
    title: projects.title,
    description: projects.description,
    genre: projects.genre,
    coverImageUrl: projects.coverImageUrl,
    slug: projects.slug,
    viewCount: projects.viewCount,
    voteScore: projects.voteScore,
    animeStyle: projects.animeStyle,
    trailerVideoUrl: projects.trailerVideoUrl,
    userId: projects.userId,
    userName: users.name,
  }).from(projects)
    .leftJoin(users, eq(projects.userId, users.id))
    .where(and(eq(projects.visibility, "public"), ne(projects.featured, 0)))
    .orderBy(desc(projects.featured))
    .limit(5);
}

export async function searchProjects(query: string, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  const term = `%${query}%`;
  return db.select({
    id: projects.id,
    title: projects.title,
    description: projects.description,
    genre: projects.genre,
    coverImageUrl: projects.coverImageUrl,
    slug: projects.slug,
    voteScore: projects.voteScore,
    userName: users.name,
  }).from(projects)
    .leftJoin(users, eq(projects.userId, users.id))
    .where(
      and(
        eq(projects.visibility, "public"),
        or(like(projects.title, term), like(projects.description, term))
      )
    )
    .orderBy(desc(projects.voteScore))
    .limit(limit);
}

export async function getProjectBySlug(slug: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select({
    id: projects.id,
    title: projects.title,
    description: projects.description,
    genre: projects.genre,
    coverImageUrl: projects.coverImageUrl,
    slug: projects.slug,
    viewCount: projects.viewCount,
    voteScore: projects.voteScore,
    animeStyle: projects.animeStyle,
    visibility: projects.visibility,
    trailerVideoUrl: projects.trailerVideoUrl,
    totalVotes: projects.totalVotes,
    animeStatus: projects.animeStatus,
    animePromotedAt: projects.animePromotedAt,
    userId: projects.userId,
    userName: users.name,
    createdAt: projects.createdAt,
  }).from(projects)
    .leftJoin(users, eq(projects.userId, users.id))
    .where(eq(projects.slug, slug))
    .limit(1);
  return result[0];
}

export async function getEpisodeCountForProject(projectId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ cnt: count() }).from(episodes)
    .where(eq(episodes.projectId, projectId));
  return result[0]?.cnt ?? 0;
}

// ─── Leaderboard ────────────────────────────────────────────────────────

export async function getLeaderboard(period: "week" | "month" | "all", limit = 20) {
  const db = await getDb();
  if (!db) return [];
  // For simplicity, use voteScore which can be periodically recalculated
  return db.select({
    id: projects.id,
    title: projects.title,
    coverImageUrl: projects.coverImageUrl,
    slug: projects.slug,
    voteScore: projects.voteScore,
    viewCount: projects.viewCount,
    genre: projects.genre,
    userId: projects.userId,
    userName: users.name,
    createdAt: projects.createdAt,
  }).from(projects)
    .leftJoin(users, eq(projects.userId, users.id))
    .where(eq(projects.visibility, "public"))
    .orderBy(desc(projects.voteScore), desc(projects.viewCount))
    .limit(limit);
}

// ─── User Profile ───────────────────────────────────────────────────────

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function getProjectsByUserIdPublic(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: projects.id,
    title: projects.title,
    coverImageUrl: projects.coverImageUrl,
    slug: projects.slug,
    genre: projects.genre,
    voteScore: projects.voteScore,
    createdAt: projects.createdAt,
  }).from(projects)
    .where(and(eq(projects.userId, userId), eq(projects.visibility, "public")))
    .orderBy(desc(projects.createdAt));
}

// ─── Pipeline Runs ─────────────────────────────────────────────────────

import { pipelineRuns, pipelineAssets, InsertPipelineRun, InsertPipelineAsset } from "../drizzle/schema";

export async function createPipelineRun(data: InsertPipelineRun) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(pipelineRuns).values(data);
  return (result as any).insertId as number;
}

export async function getPipelineRunById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(pipelineRuns).where(eq(pipelineRuns.id, id)).limit(1);
  return result[0];
}

export async function getPipelineRunsByEpisode(episodeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pipelineRuns)
    .where(eq(pipelineRuns.episodeId, episodeId))
    .orderBy(desc(pipelineRuns.createdAt));
}

export async function getPipelineRunsByProject(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pipelineRuns)
    .where(eq(pipelineRuns.projectId, projectId))
    .orderBy(desc(pipelineRuns.createdAt));
}

export async function updatePipelineRun(id: number, data: Partial<InsertPipelineRun>) {
  const db = await getDb();
  if (!db) return;
  await db.update(pipelineRuns).set(data).where(eq(pipelineRuns.id, id));
}

// ─── Pipeline Assets ───────────────────────────────────────────────────

export async function createPipelineAsset(data: InsertPipelineAsset) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(pipelineAssets).values(data);
  return (result as any).insertId as number;
}

export async function getPipelineAssetsByRun(pipelineRunId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pipelineAssets)
    .where(eq(pipelineAssets.pipelineRunId, pipelineRunId))
    .orderBy(pipelineAssets.createdAt);
}

export async function getPipelineAssetsByEpisode(episodeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pipelineAssets)
    .where(eq(pipelineAssets.episodeId, episodeId))
    .orderBy(pipelineAssets.createdAt);
}

// ─── Voice Cloning ─────────────────────────────────────────────────────

export async function updateCharacterVoice(id: number, data: {
  voiceId?: string | null;
  voiceCloneUrl?: string | null;
  voiceSettings?: any;
}) {
  const db = await getDb();
  if (!db) return;
  await db.update(characters).set(data).where(eq(characters.id, id));
}

export async function getCharactersWithVoice(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(characters)
    .where(and(eq(characters.projectId, projectId), sql`${characters.voiceId} IS NOT NULL`))
    .orderBy(characters.name);
}

// ─── Platform Config ────────────────────────────────────────────────────

import { platformConfig } from "../drizzle/schema";

export async function getPlatformConfig(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(platformConfig).where(eq(platformConfig.key, key)).limit(1);
  return result.length > 0 ? result[0].value : null;
}

export async function setPlatformConfig(key: string, value: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(platformConfig).values({ key, value })
    .onDuplicateKeyUpdate({ set: { value, updatedAt: new Date() } });
}

export async function getPlatformConfigMulti(keys: string[]): Promise<Record<string, string>> {
  const db = await getDb();
  if (!db) return {};
  const result = await db.select().from(platformConfig).where(inArray(platformConfig.key, keys));
  return Object.fromEntries(result.map(r => [r.key, r.value]));
}
