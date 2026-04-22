/**
 * Panel Generation Service — Stage 2
 *
 * Provides SSE-based streaming for sequential panel generation,
 * per-project regen tracking, and rate-limit awareness.
 */
import type { Express, Request, Response } from "express";
import { getDb, getProjectById, updatePanel, getPanelsByEpisode } from "./db";
import { panels, projects } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// ─── In-memory generation state ────────────────────────────────────────────
interface GenJob {
  projectId: number;
  episodeId: number;
  userId: number;
  totalPanels: number;
  completedPanels: number;
  status: "streaming" | "rate_limited" | "complete" | "error";
  rateLimitResumeAt?: number; // unix ms
  listeners: Set<Response>;
}

const activeJobs = new Map<string, GenJob>(); // key: `${projectId}:${episodeId}`

function jobKey(projectId: number, episodeId: number): string {
  return `${projectId}:${episodeId}`;
}

// ─── SSE helpers ───────────────────────────────────────────────────────────
function sendSSE(res: Response, event: string, data: unknown): void {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    // Connection closed
  }
}

function broadcastToJob(job: GenJob, event: string, data: unknown): void {
  job.listeners.forEach((res) => {
    sendSSE(res, event, data);
  });
}

// ─── Regen tracking ────────────────────────────────────────────────────────
/** Get the current regen count for a project from the settings JSON */
export async function getProjectRegenCount(projectId: number): Promise<number> {
  const db = (await getDb())!;
  const [project] = await db
    .select({ settings: projects.settings })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project?.settings) return 0;
  const settings = project.settings as Record<string, unknown>;
  return (settings.panelRegenCount as number) || 0;
}

/** Increment the regen count for a project */
export async function incrementRegenCount(projectId: number): Promise<number> {
  const db = (await getDb())!;
  const [project] = await db
    .select({ settings: projects.settings })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  const settings = (project?.settings as Record<string, unknown>) || {};
  const newCount = ((settings.panelRegenCount as number) || 0) + 1;
  await db
    .update(projects)
    .set({ settings: { ...settings, panelRegenCount: newCount } })
    .where(eq(projects.id, projectId));
  return newCount;
}

/** Get the regen limit for a given tier */
export function getRegenLimit(tier: string): number {
  switch (tier) {
    case "free_trial":
    case "creator":
      return 5; // Apprentice
    case "creator_pro":
      return 15; // Mangaka
    case "studio":
    case "studio_pro":
      return Infinity; // Studio
    default:
      return 5;
  }
}

// ─── Panel generation status ───────────────────────────────────────────────
export interface PanelStreamStatus {
  projectId: number;
  episodeId: number;
  totalPanels: number;
  completedPanels: number;
  status: "streaming" | "rate_limited" | "complete" | "error" | "idle";
  rateLimitResumeIn?: number; // seconds
}

export function getStreamStatus(projectId: number, episodeId: number): PanelStreamStatus {
  const key = jobKey(projectId, episodeId);
  const job = activeJobs.get(key);
  if (!job) {
    return {
      projectId,
      episodeId,
      totalPanels: 0,
      completedPanels: 0,
      status: "idle",
    };
  }
  const result: PanelStreamStatus = {
    projectId: job.projectId,
    episodeId: job.episodeId,
    totalPanels: job.totalPanels,
    completedPanels: job.completedPanels,
    status: job.status,
  };
  if (job.status === "rate_limited" && job.rateLimitResumeAt) {
    result.rateLimitResumeIn = Math.max(0, Math.ceil((job.rateLimitResumeAt - Date.now()) / 1000));
  }
  return result;
}

// ─── SSE route registration ────────────────────────────────────────────────
export function registerPanelStreamRoutes(app: Express): void {
  app.get("/api/panels/stream", async (req: Request, res: Response) => {
    // Auth check
    const { createContext } = await import("./_core/context");
    let userId: number;
    try {
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      userId = ctx.user.id;
    } catch {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const projectId = parseInt(req.query.projectId as string, 10);
    const episodeId = parseInt(req.query.episodeId as string, 10);
    if (isNaN(projectId) || isNaN(episodeId)) {
      res.status(400).json({ error: "Missing projectId or episodeId" });
      return;
    }

    // Set SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    // Send initial status
    const status = getStreamStatus(projectId, episodeId);
    sendSSE(res, "status", status);

    // Register listener
    const key = jobKey(projectId, episodeId);
    const job = activeJobs.get(key);
    if (job) {
      job.listeners.add(res);
    }

    // Heartbeat every 15s
    const heartbeat = setInterval(() => {
      try {
        res.write(`:heartbeat\n\n`);
      } catch {
        clearInterval(heartbeat);
      }
    }, 15000);

    // Cleanup on close
    req.on("close", () => {
      clearInterval(heartbeat);
      if (job) {
        job.listeners.delete(res);
      }
    });
  });
}

// ─── Notify connected clients of panel completion ──────────────────────────
export function notifyPanelComplete(
  projectId: number,
  episodeId: number,
  panelId: number,
  panelNumber: number,
  imageUrl: string,
  status: string,
): void {
  const key = jobKey(projectId, episodeId);
  const job = activeJobs.get(key);
  if (!job) return;

  job.completedPanels++;
  broadcastToJob(job, "panel_complete", {
    panelId,
    panelNumber,
    imageUrl,
    status,
    progress: job.completedPanels / job.totalPanels,
  });

  if (job.completedPanels >= job.totalPanels) {
    job.status = "complete";
    broadcastToJob(job, "generation_complete", {
      totalPanels: job.totalPanels,
      completedPanels: job.completedPanels,
    });
    // Cleanup after a short delay
    setTimeout(() => activeJobs.delete(key), 5000);
  }
}

/** Notify rate limit */
export function notifyRateLimit(
  projectId: number,
  episodeId: number,
  resumeInSeconds: number,
): void {
  const key = jobKey(projectId, episodeId);
  const job = activeJobs.get(key);
  if (!job) return;
  job.status = "rate_limited";
  job.rateLimitResumeAt = Date.now() + resumeInSeconds * 1000;
  broadcastToJob(job, "rate_limited", { resumeInSeconds });
}

/** Register a new generation job for SSE tracking */
export function registerGenJob(
  projectId: number,
  episodeId: number,
  userId: number,
  totalPanels: number,
): void {
  const key = jobKey(projectId, episodeId);
  // Clean up existing job if any
  const existing = activeJobs.get(key);
  if (existing) {
    existing.listeners.forEach((res) => {
      sendSSE(res, "job_replaced", { reason: "New generation started" });
    });
  }
  activeJobs.set(key, {
    projectId,
    episodeId,
    userId,
    totalPanels,
    completedPanels: 0,
    status: "streaming",
    listeners: existing?.listeners || new Set(),
  });
}
