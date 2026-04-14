import { eq, desc, and, sql, count, between, gte, lte, sum } from "drizzle-orm";
import {
  subscriptions, usageRecords, tips, moderationQueue,
  InsertSubscription, InsertUsageRecord, InsertTip, InsertModerationItem,
  users, projects, episodes, pipelineRuns,
} from "../drizzle/schema";
import { getDb } from "./db";

// ─── Subscriptions ─────────────────────────────────────────────────────

export async function getSubscriptionByUserId(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(subscriptions)
    .where(eq(subscriptions.userId, userId)).limit(1);
  return result[0];
}

export async function upsertSubscription(userId: number, data: Partial<InsertSubscription>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(subscriptions)
    .where(eq(subscriptions.userId, userId)).limit(1);
  if (existing.length > 0) {
    await db.update(subscriptions).set(data).where(eq(subscriptions.userId, userId));
    return existing[0].id;
  } else {
    const [result] = await db.insert(subscriptions).values({ userId, ...data } as InsertSubscription);
    return (result as any).insertId as number;
  }
}

export async function getSubscriptionByStripeCustomerId(customerId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(subscriptions)
    .where(eq(subscriptions.stripeCustomerId, customerId)).limit(1);
  return result[0];
}

// ─── Usage Records ─────────────────────────────────────────────────────

export async function createUsageRecord(data: InsertUsageRecord) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(usageRecords).values(data);
  return (result as any).insertId as number;
}

export async function getUsageRecordsByUser(userId: number, startDate?: Date, endDate?: Date) {
  const db = await getDb();
  if (!db) return [];
  let query = db.select().from(usageRecords).where(eq(usageRecords.userId, userId));
  if (startDate && endDate) {
    query = db.select().from(usageRecords).where(
      and(eq(usageRecords.userId, userId), gte(usageRecords.createdAt, startDate), lte(usageRecords.createdAt, endDate))
    );
  }
  return query.orderBy(desc(usageRecords.createdAt));
}

export async function getMonthlyUsageSummary(userId: number) {
  const db = await getDb();
  if (!db) return { total: 0, byType: {} };
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const records = await db.select().from(usageRecords).where(
    and(eq(usageRecords.userId, userId), gte(usageRecords.createdAt, startOfMonth))
  );

  const total = records.reduce((sum, r) => sum + r.creditsUsed, 0);
  const byType: Record<string, number> = {};
  for (const r of records) {
    byType[r.actionType] = (byType[r.actionType] || 0) + r.creditsUsed;
  }
  return { total, byType };
}

// ─── Tips ──────────────────────────────────────────────────────────────

export async function createTip(data: InsertTip) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(tips).values(data);
  return (result as any).insertId as number;
}

export async function getTipsByCreator(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tips)
    .where(eq(tips.toUserId, userId))
    .orderBy(desc(tips.createdAt));
}

export async function getCreatorEarnings(userId: number) {
  const db = await getDb();
  if (!db) return { totalEarnings: 0, totalTips: 0, monthlyEarnings: [] };

  const allTips = await db.select().from(tips)
    .where(and(eq(tips.toUserId, userId), eq(tips.status, "completed")));

  const totalEarnings = allTips.reduce((sum, t) => sum + t.creatorShareCents, 0);
  const totalTips = allTips.length;

  // Group by month (last 6 months)
  const monthlyEarnings: { month: string; amount: number }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStr = d.toISOString().slice(0, 7);
    const monthTips = allTips.filter(t => {
      const td = new Date(t.createdAt);
      return td.getFullYear() === d.getFullYear() && td.getMonth() === d.getMonth();
    });
    monthlyEarnings.push({
      month: monthStr,
      amount: monthTips.reduce((sum, t) => sum + t.creatorShareCents, 0),
    });
  }

  return { totalEarnings, totalTips, monthlyEarnings };
}

// ─── Moderation ────────────────────────────────────────────────────────

export async function createModerationItem(data: InsertModerationItem) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(moderationQueue).values(data);
  return (result as any).insertId as number;
}

export async function getModerationQueue(status: string = "pending") {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(moderationQueue)
    .where(eq(moderationQueue.status, status as any))
    .orderBy(desc(moderationQueue.createdAt));
}

export async function updateModerationItem(id: number, data: { status: string; reviewedBy: number }) {
  const db = await getDb();
  if (!db) return;
  await db.update(moderationQueue).set({
    status: data.status as any,
    reviewedBy: data.reviewedBy,
    reviewedAt: new Date(),
  }).where(eq(moderationQueue.id, id));
}

// ─── Admin Metrics ─────────────────────────────────────────────────────

export async function getAdminMetrics() {
  const db = await getDb();
  if (!db) return { totalUsers: 0, totalCreators: 0, totalProjects: 0, totalRevenue: 0, subscriptionCounts: {} };

  const [userCount] = await db.select({ count: count() }).from(users);
  const [projectCount] = await db.select({ count: count() }).from(projects);

  // Creators = users with at least one project
  const creatorsResult = await db.select({ userId: projects.userId }).from(projects).groupBy(projects.userId);

  // Subscription counts by tier
  const subs = await db.select().from(subscriptions).where(eq(subscriptions.status, "active"));
  const subscriptionCounts: Record<string, number> = { free: 0, pro: 0, studio: 0 };
  for (const s of subs) {
    subscriptionCounts[s.tier] = (subscriptionCounts[s.tier] || 0) + 1;
  }

  // Total revenue from tips
  const completedTips = await db.select().from(tips).where(eq(tips.status, "completed"));
  const totalRevenue = completedTips.reduce((sum, t) => sum + t.platformShareCents, 0);

  // Add subscription revenue estimate (active pro + studio)
  const subRevenue = subscriptionCounts.pro * 2900 + subscriptionCounts.studio * 9900;

  return {
    totalUsers: userCount.count,
    totalCreators: creatorsResult.length,
    totalProjects: projectCount.count,
    totalRevenue: totalRevenue + subRevenue,
    subscriptionCounts,
  };
}

export async function getAdminUserList(page: number = 1, limit: number = 20) {
  const db = await getDb();
  if (!db) return { users: [], total: 0 };
  const offset = (page - 1) * limit;
  const [totalResult] = await db.select({ count: count() }).from(users);
  const userList = await db.select().from(users).orderBy(desc(users.createdAt)).limit(limit).offset(offset);
  return { users: userList, total: totalResult.count };
}

export async function getAllSubscriptions() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(subscriptions).orderBy(desc(subscriptions.createdAt));
}
