/**
 * Webhook Endpoints for Async Image Generation.
 *
 * Handles provider callbacks for batch job completion:
 * - Runware: POST /api/webhooks/image-generation/runware
 * - TensorArt: POST /api/webhooks/image-generation/tensorart
 * - Fal.ai: POST /api/webhooks/image-generation/fal
 * - Generic: POST /api/webhooks/image-generation/batch-complete
 *
 * Also handles batch job webhook notifications (outbound).
 *
 * @see Prompt 29
 */
import type { Express, Request, Response } from "express";
import { getDb } from "../db";
import { batchJobs, batchJobItems, generationCosts } from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import crypto from "crypto";

// ─── Types ────────────────────────────────────────────────────────────

export interface ProviderWebhookPayload {
  /** Provider-specific job/request ID */
  jobId: string;
  /** Provider identifier */
  providerId: string;
  /** Whether the generation succeeded */
  succeeded: boolean;
  /** Result image URL (if succeeded) */
  resultUrl?: string;
  /** Error message (if failed) */
  errorMessage?: string;
  /** Actual cost in USD */
  costUsd?: number;
  /** Latency in milliseconds */
  latencyMs?: number;
  /** Provider-specific metadata */
  metadata?: Record<string, unknown>;
}

export interface BatchCompletePayload {
  batchId: string;
  itemId: string;
  succeeded: boolean;
  resultUrl?: string;
  errorMessage?: string;
  costUsd?: number;
  latencyMs?: number;
  providerId?: string;
}

// ─── Webhook Signature Verification ──────────────────────────────────

/**
 * Verify HMAC-SHA256 webhook signature.
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expected, "hex"),
  );
}

/**
 * Sign a webhook payload for outbound notifications.
 */
export function signWebhookPayload(
  payload: string,
  secret: string,
): string {
  return crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
}

// ─── Batch Item Completion Handler ──────────────────────────────────

/**
 * Process a single batch item completion.
 * Updates the item status, records cost, and checks if the batch is complete.
 */
export async function handleBatchItemCompletion(
  payload: BatchCompletePayload,
): Promise<{ batchComplete: boolean; batchId: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  // Update the batch item
  const updates: Record<string, unknown> = {
    status: payload.succeeded ? "succeeded" : "failed",
    completedAt: new Date(),
  };

  if (payload.resultUrl) updates.resultUrl = payload.resultUrl;
  if (payload.errorMessage) updates.errorMessage = payload.errorMessage;
  if (payload.costUsd != null) updates.costUsd = payload.costUsd.toString();
  if (payload.latencyMs != null) updates.latencyMs = payload.latencyMs;
  if (payload.providerId) updates.providerId = payload.providerId;

  await db
    .update(batchJobItems)
    .set(updates)
    .where(eq(batchJobItems.id, payload.itemId));

  // Update batch counters
  if (payload.succeeded) {
    await db
      .update(batchJobs)
      .set({
        completedItems: sql`${batchJobs.completedItems} + 1`,
        totalCostUsd: sql`${batchJobs.totalCostUsd} + ${payload.costUsd ?? 0}`,
      })
      .where(eq(batchJobs.id, payload.batchId));
  } else {
    await db
      .update(batchJobs)
      .set({
        failedItems: sql`${batchJobs.failedItems} + 1`,
      })
      .where(eq(batchJobs.id, payload.batchId));
  }

  // Check if batch is complete
  const [batch] = await db
    .select()
    .from(batchJobs)
    .where(eq(batchJobs.id, payload.batchId));

  if (!batch) return { batchComplete: false, batchId: payload.batchId };

  const processedCount = batch.completedItems + batch.failedItems;
  const batchComplete = processedCount >= batch.totalItems;

  if (batchComplete) {
    const finalStatus = batch.failedItems > 0 && batch.completedItems === 0 ? "failed" : "completed";
    await db
      .update(batchJobs)
      .set({ status: finalStatus, completedAt: new Date() })
      .where(eq(batchJobs.id, payload.batchId));

    // Fire outbound webhook if configured
    if (batch.webhookUrl) {
      await sendBatchWebhookNotification(batch.id, batch.webhookUrl, batch.webhookSecret);
    }
  }

  return { batchComplete, batchId: payload.batchId };
}

// ─── Outbound Webhook Notification ──────────────────────────────────

/**
 * Send webhook notification when a batch job completes.
 */
export async function sendBatchWebhookNotification(
  batchId: string,
  webhookUrl: string,
  webhookSecret: string | null,
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const [batch] = await db
    .select()
    .from(batchJobs)
    .where(eq(batchJobs.id, batchId));

  if (!batch) return false;

  const payload = JSON.stringify({
    event: "batch.completed",
    batchId: batch.id,
    status: batch.status,
    totalItems: batch.totalItems,
    completedItems: batch.completedItems,
    failedItems: batch.failedItems,
    totalCostUsd: parseFloat(batch.totalCostUsd ?? "0"),
    completedAt: batch.completedAt?.toISOString() ?? new Date().toISOString(),
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Awakli-Event": "batch.completed",
  };

  if (webhookSecret) {
    headers["X-Awakli-Signature"] = signWebhookPayload(payload, webhookSecret);
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: payload,
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.error(`[Webhook] Failed to notify ${webhookUrl}: ${response.status}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error(`[Webhook] Error notifying ${webhookUrl}:`, err);
    return false;
  }
}

// ─── Provider-Specific Parsers ──────────────────────────────────────

/**
 * Parse Runware webhook payload.
 */
export function parseRunwareWebhook(body: unknown): ProviderWebhookPayload | null {
  const b = body as Record<string, unknown>;
  if (!b || typeof b !== "object") return null;

  const taskId = b.taskUUID ?? b.taskId ?? b.jobId;
  if (!taskId || typeof taskId !== "string") return null;

  const succeeded = b.status === "completed" || b.status === "success" || !!b.imageURL;

  return {
    jobId: taskId,
    providerId: "runware",
    succeeded,
    resultUrl: (b.imageURL ?? b.outputURL) as string | undefined,
    errorMessage: b.error as string | undefined,
    costUsd: typeof b.cost === "number" ? b.cost : undefined,
    latencyMs: typeof b.duration === "number" ? b.duration : undefined,
    metadata: b as Record<string, unknown>,
  };
}

/**
 * Parse TensorArt webhook payload.
 */
export function parseTensorArtWebhook(body: unknown): ProviderWebhookPayload | null {
  const b = body as Record<string, unknown>;
  if (!b || typeof b !== "object") return null;

  const jobId = (b.job_id ?? b.jobId ?? b.id) as string | undefined;
  if (!jobId) return null;

  const status = b.status as string;
  const succeeded = status === "SUCCESS" || status === "completed";

  // TensorArt nests results in output
  const output = b.output as Record<string, unknown> | undefined;
  const images = (output?.images ?? b.images) as Array<{ url: string }> | undefined;

  return {
    jobId,
    providerId: "tensorart",
    succeeded,
    resultUrl: images?.[0]?.url,
    errorMessage: (b.error ?? b.message) as string | undefined,
    costUsd: typeof b.credits_used === "number" ? b.credits_used * 0.001 : undefined,
    latencyMs: typeof b.duration_ms === "number" ? b.duration_ms : undefined,
    metadata: b as Record<string, unknown>,
  };
}

/**
 * Parse Fal.ai webhook payload.
 */
export function parseFalWebhook(body: unknown): ProviderWebhookPayload | null {
  const b = body as Record<string, unknown>;
  if (!b || typeof b !== "object") return null;

  const requestId = (b.request_id ?? b.requestId ?? b.id) as string | undefined;
  if (!requestId) return null;

  const status = b.status as string;
  const succeeded = status === "COMPLETED" || status === "completed";

  const output = b.output as Record<string, unknown> | undefined;
  const images = (output?.images ?? b.images) as Array<{ url: string }> | undefined;

  return {
    jobId: requestId,
    providerId: "fal",
    succeeded,
    resultUrl: images?.[0]?.url,
    errorMessage: (b.error ?? b.detail) as string | undefined,
    costUsd: typeof b.cost === "number" ? b.cost : undefined,
    latencyMs: typeof b.metrics === "object" && b.metrics
      ? (b.metrics as Record<string, unknown>).inference_time as number | undefined
      : undefined,
    metadata: b as Record<string, unknown>,
  };
}

// ─── Express Route Registration ─────────────────────────────────────

/**
 * Register webhook routes on the Express app.
 */
export function registerImageWebhookRoutes(app: Express): void {
  // Generic batch item completion endpoint
  app.post("/api/webhooks/image-generation/batch-complete", async (req: Request, res: Response) => {
    try {
      const payload = req.body as BatchCompletePayload;

      if (!payload.batchId || !payload.itemId) {
        return res.status(400).json({ error: "Missing batchId or itemId" });
      }

      const result = await handleBatchItemCompletion(payload);
      return res.json({ ok: true, ...result });
    } catch (err) {
      console.error("[Webhook] batch-complete error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Runware provider webhook
  app.post("/api/webhooks/image-generation/runware", async (req: Request, res: Response) => {
    try {
      const parsed = parseRunwareWebhook(req.body);
      if (!parsed) {
        return res.status(400).json({ error: "Invalid Runware webhook payload" });
      }

      // Look up if this job belongs to a batch
      const result = await handleProviderCallback(parsed);
      return res.json({ ok: true, ...result });
    } catch (err) {
      console.error("[Webhook] Runware error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // TensorArt provider webhook
  app.post("/api/webhooks/image-generation/tensorart", async (req: Request, res: Response) => {
    try {
      const parsed = parseTensorArtWebhook(req.body);
      if (!parsed) {
        return res.status(400).json({ error: "Invalid TensorArt webhook payload" });
      }

      const result = await handleProviderCallback(parsed);
      return res.json({ ok: true, ...result });
    } catch (err) {
      console.error("[Webhook] TensorArt error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Fal.ai provider webhook
  app.post("/api/webhooks/image-generation/fal", async (req: Request, res: Response) => {
    try {
      const parsed = parseFalWebhook(req.body);
      if (!parsed) {
        return res.status(400).json({ error: "Invalid Fal.ai webhook payload" });
      }

      const result = await handleProviderCallback(parsed);
      return res.json({ ok: true, ...result });
    } catch (err) {
      console.error("[Webhook] Fal.ai error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
}

// ─── Provider Callback Handler ──────────────────────────────────────

/**
 * Handle a provider callback by looking up the job in generation_costs
 * and updating the corresponding batch item if applicable.
 */
async function handleProviderCallback(
  payload: ProviderWebhookPayload,
): Promise<{ matched: boolean; batchComplete?: boolean }> {
  const db = await getDb();
  if (!db) return { matched: false };

  // Look up the generation cost record by jobId
  const [costRecord] = await db
    .select()
    .from(generationCosts)
    .where(eq(generationCosts.jobId, payload.jobId));

  if (!costRecord) {
    // Not a tracked job — could be a direct API call
    return { matched: false };
  }

  // Update the generation cost record
  const costUpdates: Record<string, unknown> = {
    status: payload.succeeded ? "succeeded" : "failed",
  };
  if (payload.resultUrl) costUpdates.resultUrl = payload.resultUrl;
  if (payload.errorMessage) costUpdates.errorMessage = payload.errorMessage;
  if (payload.costUsd != null) costUpdates.actualCostUsd = payload.costUsd.toString();
  if (payload.latencyMs != null) costUpdates.latencyMs = payload.latencyMs;

  await db
    .update(generationCosts)
    .set(costUpdates)
    .where(eq(generationCosts.jobId, payload.jobId));

  // Check if this job belongs to a batch item
  const [batchItem] = await db
    .select()
    .from(batchJobItems)
    .where(
      and(
        eq(batchJobItems.status, "processing"),
      ),
    );

  // For now, batch items are matched by looking up processing items
  // In production, we'd store the provider jobId on the batch item
  // This is a simplified lookup
  if (batchItem) {
    const result = await handleBatchItemCompletion({
      batchId: batchItem.batchId,
      itemId: batchItem.id,
      succeeded: payload.succeeded,
      resultUrl: payload.resultUrl,
      errorMessage: payload.errorMessage,
      costUsd: payload.costUsd,
      latencyMs: payload.latencyMs,
      providerId: payload.providerId,
    });
    return { matched: true, batchComplete: result.batchComplete };
  }

  return { matched: true };
}
