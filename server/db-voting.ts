import { eq, desc, and, sql, gte, lte, count } from "drizzle-orm";
import {
  projects, users, votes, episodes, notifications,
  platformConfig, animePromotions,
  InsertNotification,
} from "../drizzle/schema";
import { getDb } from "./db";

// ─── Platform Config ───────────────────────────────────────────────────

export async function getConfigValue(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(platformConfig).where(eq(platformConfig.key, key)).limit(1);
  return result[0]?.value ?? null;
}

export async function setConfigValue(key: string, value: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(platformConfig).values({ key, value })
    .onDuplicateKeyUpdate({ set: { value } });
}

export async function getAnimeVoteThreshold(): Promise<number> {
  const val = await getConfigValue("anime_vote_threshold");
  return val ? parseInt(val, 10) : 500;
}

export async function getAnimeFeaturedThreshold(): Promise<number> {
  const val = await getConfigValue("anime_featured_threshold");
  return val ? parseInt(val, 10) : 1000;
}

// ─── Vote Progress ─────────────────────────────────────────────────────

export async function getProjectVoteProgress(projectId: number) {
  const db = await getDb();
  if (!db) return { totalVotes: 0, threshold: 500, percentage: 0, isEligible: false, animeStatus: "not_eligible" as const };

  const result = await db.select({
    totalVotes: projects.totalVotes,
    animeStatus: projects.animeStatus,
  }).from(projects).where(eq(projects.id, projectId)).limit(1);

  const project = result[0];
  if (!project) return { totalVotes: 0, threshold: 500, percentage: 0, isEligible: false, animeStatus: "not_eligible" as const };

  const threshold = await getAnimeVoteThreshold();
  const totalVotes = project.totalVotes ?? 0;
  const percentage = Math.min(Math.round((totalVotes / threshold) * 100), 100);

  return {
    totalVotes,
    threshold,
    percentage,
    isEligible: project.animeStatus !== "not_eligible",
    animeStatus: project.animeStatus,
  };
}

// ─── Enhanced Vote with Threshold Check ────────────────────────────────

export async function recalculateProjectVotes(projectId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  // Count all upvotes for episodes in this project
  const result = await db.select({
    total: sql<number>`COUNT(*)`,
  }).from(votes)
    .innerJoin(episodes, eq(votes.episodeId, episodes.id))
    .where(and(
      eq(episodes.projectId, projectId),
      eq(votes.voteType, "up")
    ));

  const totalVotes = result[0]?.total ?? 0;

  // Update denormalized counter
  await db.update(projects)
    .set({ totalVotes, voteScore: totalVotes })
    .where(eq(projects.id, projectId));

  return totalVotes;
}

export async function checkAndPromoteProject(projectId: number): Promise<{
  promoted: boolean;
  totalVotes: number;
  threshold: number;
}> {
  const totalVotes = await recalculateProjectVotes(projectId);
  const threshold = await getAnimeVoteThreshold();

  const db = await getDb();
  if (!db) return { promoted: false, totalVotes, threshold };

  // Check if already eligible
  const project = await db.select({
    animeStatus: projects.animeStatus,
    userId: projects.userId,
    title: projects.title,
  }).from(projects).where(eq(projects.id, projectId)).limit(1);

  if (!project[0]) return { promoted: false, totalVotes, threshold };

  if (project[0].animeStatus !== "not_eligible") {
    return { promoted: false, totalVotes, threshold };
  }

  if (totalVotes >= threshold) {
    // Promote!
    await db.update(projects).set({
      animeStatus: "eligible",
      animeEligible: 1,
      animePromotedAt: new Date(),
    }).where(eq(projects.id, projectId));

    // Create anime_promotions record
    await db.insert(animePromotions).values({
      projectId,
      voteCountAtPromotion: totalVotes,
    });

    // Notify creator
    await db.insert(notifications).values({
      userId: project[0].userId,
      type: "anime_eligible",
      title: "Your manga has earned anime conversion!",
      content: `"${project[0].title}" has reached ${totalVotes} votes! The community has voted for your manga to become anime. Start production now!`,
      linkUrl: `/studio/${projectId}`,
    });

    return { promoted: true, totalVotes, threshold };
  }

  return { promoted: false, totalVotes, threshold };
}

// ─── Start Anime Production ────────────────────────────────────────────

export async function startAnimeProduction(projectId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Verify project is eligible and belongs to user
  const project = await db.select({
    animeStatus: projects.animeStatus,
    userId: projects.userId,
  }).from(projects).where(eq(projects.id, projectId)).limit(1);

  if (!project[0] || project[0].userId !== userId) return false;
  if (project[0].animeStatus !== "eligible") return false;

  // Update project status
  await db.update(projects).set({
    animeStatus: "in_production",
  }).where(eq(projects.id, projectId));

  // Update anime_promotions record
  await db.update(animePromotions).set({
    status: "in_production",
    productionStartedAt: new Date(),
  }).where(eq(animePromotions.projectId, projectId));

  return true;
}

// ─── Rising Stars (50-80% of threshold) ────────────────────────────────

export async function getRisingStars(limit = 20) {
  const db = await getDb();
  if (!db) return [];
  const threshold = await getAnimeVoteThreshold();
  const minVotes = Math.floor(threshold * 0.1); // 10% minimum to show
  const maxVotes = threshold - 1; // Below threshold

  return db.select({
    id: projects.id,
    title: projects.title,
    description: projects.description,
    coverImageUrl: projects.coverImageUrl,
    slug: projects.slug,
    genre: projects.genre,
    totalVotes: projects.totalVotes,
    animeStatus: projects.animeStatus,
    userId: projects.userId,
    userName: users.name,
    createdAt: projects.createdAt,
  }).from(projects)
    .leftJoin(users, eq(projects.userId, users.id))
    .where(and(
      eq(projects.visibility, "public"),
      eq(projects.animeStatus, "not_eligible"),
      gte(projects.totalVotes, minVotes),
      lte(projects.totalVotes, maxVotes),
    ))
    .orderBy(desc(projects.totalVotes))
    .limit(limit);
}

// ─── Becoming Anime (in production) ────────────────────────────────────

export async function getBecomingAnime(limit = 20) {
  const db = await getDb();
  if (!db) return [];

  return db.select({
    id: projects.id,
    title: projects.title,
    description: projects.description,
    coverImageUrl: projects.coverImageUrl,
    slug: projects.slug,
    genre: projects.genre,
    totalVotes: projects.totalVotes,
    animeStatus: projects.animeStatus,
    animePromotedAt: projects.animePromotedAt,
    userId: projects.userId,
    userName: users.name,
    createdAt: projects.createdAt,
  }).from(projects)
    .leftJoin(users, eq(projects.userId, users.id))
    .where(and(
      eq(projects.visibility, "public"),
      eq(projects.animeStatus, "in_production"),
    ))
    .orderBy(desc(projects.animePromotedAt))
    .limit(limit);
}

// ─── Leaderboard: Rising (sorted by votes, closest to threshold) ───────

export async function getLeaderboardRising(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  const threshold = await getAnimeVoteThreshold();

  return db.select({
    id: projects.id,
    title: projects.title,
    coverImageUrl: projects.coverImageUrl,
    slug: projects.slug,
    genre: projects.genre,
    totalVotes: projects.totalVotes,
    animeStatus: projects.animeStatus,
    userId: projects.userId,
    userName: users.name,
    createdAt: projects.createdAt,
  }).from(projects)
    .leftJoin(users, eq(projects.userId, users.id))
    .where(and(
      eq(projects.visibility, "public"),
      eq(projects.animeStatus, "not_eligible"),
      gte(projects.totalVotes, 1),
    ))
    .orderBy(desc(projects.totalVotes))
    .limit(limit);
}

// ─── Leaderboard: Promoted (earned anime, sorted by promotion date) ────

export async function getLeaderboardPromoted(limit = 50) {
  const db = await getDb();
  if (!db) return [];

  return db.select({
    id: projects.id,
    title: projects.title,
    coverImageUrl: projects.coverImageUrl,
    slug: projects.slug,
    genre: projects.genre,
    totalVotes: projects.totalVotes,
    animeStatus: projects.animeStatus,
    animePromotedAt: projects.animePromotedAt,
    userId: projects.userId,
    userName: users.name,
    promotionStatus: animePromotions.status,
    productionStartedAt: animePromotions.productionStartedAt,
  }).from(projects)
    .leftJoin(users, eq(projects.userId, users.id))
    .leftJoin(animePromotions, eq(animePromotions.projectId, projects.id))
    .where(and(
      eq(projects.visibility, "public"),
      eq(projects.animeStatus, "eligible"),
    ))
    .orderBy(desc(projects.animePromotedAt))
    .limit(limit);
}

// ─── Leaderboard: Completed (finished anime) ───────────────────────────

export async function getLeaderboardCompleted(limit = 50) {
  const db = await getDb();
  if (!db) return [];

  return db.select({
    id: projects.id,
    title: projects.title,
    coverImageUrl: projects.coverImageUrl,
    slug: projects.slug,
    genre: projects.genre,
    totalVotes: projects.totalVotes,
    animeStatus: projects.animeStatus,
    userId: projects.userId,
    userName: users.name,
    productionCompletedAt: animePromotions.productionCompletedAt,
  }).from(projects)
    .leftJoin(users, eq(projects.userId, users.id))
    .leftJoin(animePromotions, eq(animePromotions.projectId, projects.id))
    .where(and(
      eq(projects.visibility, "public"),
      eq(projects.animeStatus, "completed"),
    ))
    .orderBy(desc(animePromotions.productionCompletedAt))
    .limit(limit);
}

// ─── Get Project Anime Promotion Details ───────────────────────────────

export async function getAnimePromotion(projectId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(animePromotions)
    .where(eq(animePromotions.projectId, projectId))
    .limit(1);
  return result[0] ?? null;
}

// ─── Creator's Projects with Vote Progress ─────────────────────────────

export async function getCreatorProjectsWithVoteProgress(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const threshold = await getAnimeVoteThreshold();

  const result = await db.select({
    id: projects.id,
    title: projects.title,
    coverImageUrl: projects.coverImageUrl,
    slug: projects.slug,
    visibility: projects.visibility,
    totalVotes: projects.totalVotes,
    animeStatus: projects.animeStatus,
    animePromotedAt: projects.animePromotedAt,
    createdAt: projects.createdAt,
  }).from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.createdAt));

  return result.map(p => ({
    ...p,
    threshold,
    percentage: Math.min(Math.round(((p.totalVotes ?? 0) / threshold) * 100), 100),
  }));
}

// ─── Admin: Update Threshold ───────────────────────────────────────────

export async function updateAnimeThreshold(threshold: number): Promise<void> {
  await setConfigValue("anime_vote_threshold", threshold.toString());
}

export async function updateFeaturedThreshold(threshold: number): Promise<void> {
  await setConfigValue("anime_featured_threshold", threshold.toString());
}
