/**
 * HITL Notification Dispatcher (Prompt 17)
 *
 * Handles real-time notifications for gate events via WebSocket,
 * with email digest fallback. Deduplicates notifications per gate.
 *
 * Channels:
 * - WebSocket: < 2s latency, primary for all gate types
 * - Email digest: every 15 minutes for offline creators
 */

import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { STAGE_DISPLAY_NAMES } from "./stage-config";
import type { GateRow } from "./gate-manager";

// ─── Types ──────────────────────────────────────────────────────────────

export type NotificationType =
  | "gate_ready"
  | "review_recommended"
  | "review_required"
  | "timeout_warning_1h"
  | "timeout_warning_6h"
  | "timeout_warning_23h"
  | "timeout_fired"
  | "escalation";

export type NotificationChannel = "websocket" | "email" | "push";

export interface GateNotificationPayload {
  type: string;
  gateId: number;
  pipelineRunId: number;
  stageName: string;
  stageNumber: number;
  gateType: string;
  confidenceScore?: number;
  thumbnailUrl?: string;
  creditsAtStake?: number;
  message: string;
  hoursRemaining?: number;
  previousGateType?: string;
  escalatedTo?: string;
  reason?: string;
  createdAt: string;
}

// ─── WebSocket Connection Registry ──────────────────────────────────────
// In-memory map of userId → Set of WebSocket-like send functions.
// In production, this would be backed by a proper WebSocket server.

type WsSendFn = (payload: GateNotificationPayload) => void;
const wsConnections = new Map<number, Set<WsSendFn>>();

/**
 * Register a WebSocket connection for a user.
 */
export function registerWsConnection(userId: number, sendFn: WsSendFn): () => void {
  if (!wsConnections.has(userId)) {
    wsConnections.set(userId, new Set());
  }
  wsConnections.get(userId)!.add(sendFn);

  // Return unregister function
  return () => {
    const conns = wsConnections.get(userId);
    if (conns) {
      conns.delete(sendFn);
      if (conns.size === 0) wsConnections.delete(userId);
    }
  };
}

/**
 * Check if a user has active WebSocket connections.
 */
export function hasActiveWsConnection(userId: number): boolean {
  const conns = wsConnections.get(userId);
  return !!conns && conns.size > 0;
}

/**
 * Send a payload to all active WebSocket connections for a user.
 */
function sendViaWebSocket(userId: number, payload: GateNotificationPayload): boolean {
  const conns = wsConnections.get(userId);
  if (!conns || conns.size === 0) return false;

  Array.from(conns).forEach(sendFn => {
    try {
      sendFn(payload);
    } catch (err) {
      console.error("[Notification] WebSocket send failed:", err);
      conns.delete(sendFn);
    }
  });
  return true;
}

// ─── Notification Deduplication ─────────────────────────────────────────

/**
 * Check if a notification of the same type has already been delivered for this gate.
 */
async function isNotificationDelivered(
  gateId: number,
  notificationType: NotificationType,
  channel: NotificationChannel
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const [rows] = await db.execute(sql`
    SELECT id FROM gate_notifications
    WHERE gateId = ${gateId}
      AND notificationType = ${notificationType}
      AND channel = ${channel}
      AND delivered = 1
    LIMIT 1
  `);
  return (rows as unknown as any[]).length > 0;
}

/**
 * Record a notification attempt.
 */
async function recordNotification(
  gateId: number,
  userId: number,
  channel: NotificationChannel,
  notificationType: NotificationType,
  delivered: boolean
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.execute(sql`
    INSERT INTO gate_notifications (
      gateId, userId, channel, notificationType, delivered, deliveredAt
    ) VALUES (
      ${gateId}, ${userId}, ${channel}, ${notificationType},
      ${delivered ? 1 : 0}, ${delivered ? sql`NOW()` : null}
    )
  `);
}

// ─── Notification Builders ──────────────────────────────────────────────

function buildGateReadyPayload(gate: GateRow): GateNotificationPayload {
  return {
    type: "gate:ready",
    gateId: gate.id,
    pipelineRunId: gate.pipelineRunId,
    stageName: STAGE_DISPLAY_NAMES[gate.stageNumber] || gate.stageName,
    stageNumber: gate.stageNumber,
    gateType: gate.gateType,
    confidenceScore: gate.confidenceScore ?? undefined,
    creditsAtStake: gate.creditsToProceed ? Number(gate.creditsToProceed) : undefined,
    message: `Stage ${gate.stageNumber} — ${STAGE_DISPLAY_NAMES[gate.stageNumber]} is ready for review.`,
    createdAt: new Date().toISOString(),
  };
}

function buildAutoAdvancedPayload(gate: GateRow): GateNotificationPayload {
  return {
    type: "gate:auto_advanced",
    gateId: gate.id,
    pipelineRunId: gate.pipelineRunId,
    stageName: STAGE_DISPLAY_NAMES[gate.stageNumber] || gate.stageName,
    stageNumber: gate.stageNumber,
    gateType: gate.gateType,
    confidenceScore: gate.confidenceScore ?? undefined,
    message: `Auto-approved (score ${gate.confidenceScore} >= threshold ${gate.autoAdvanceThreshold}). Review within 1h if needed.`,
    createdAt: new Date().toISOString(),
  };
}

function buildTimeoutWarningPayload(gate: GateRow, hoursRemaining: number): GateNotificationPayload {
  return {
    type: "gate:timeout_warning",
    gateId: gate.id,
    pipelineRunId: gate.pipelineRunId,
    stageName: STAGE_DISPLAY_NAMES[gate.stageNumber] || gate.stageName,
    stageNumber: gate.stageNumber,
    gateType: gate.gateType,
    hoursRemaining,
    message: `Gate will ${gate.timeoutAction.replace("auto_", "auto-")} in ${hoursRemaining} hour${hoursRemaining !== 1 ? "s" : ""} if no action taken.`,
    createdAt: new Date().toISOString(),
  };
}

function buildEscalationPayload(
  gate: GateRow,
  previousGateType: string,
  reason: string
): GateNotificationPayload {
  return {
    type: "gate:escalated",
    gateId: gate.id,
    pipelineRunId: gate.pipelineRunId,
    stageName: STAGE_DISPLAY_NAMES[gate.stageNumber] || gate.stageName,
    stageNumber: gate.stageNumber,
    gateType: "blocking",
    previousGateType,
    escalatedTo: "blocking",
    reason,
    confidenceScore: gate.confidenceScore ?? undefined,
    message: `Automatic quality check flagged an issue. Review required.`,
    createdAt: new Date().toISOString(),
  };
}

// ─── Public Dispatch Functions ──────────────────────────────────────────

/**
 * Dispatch a gate:ready notification.
 */
export async function notifyGateReady(gate: GateRow): Promise<void> {
  const payload = buildGateReadyPayload(gate);
  const notifType: NotificationType = gate.gateType === "blocking"
    ? "review_required"
    : "review_recommended";

  // Check dedup
  if (await isNotificationDelivered(gate.id, notifType, "websocket")) return;

  // Try WebSocket first
  const wsDelivered = sendViaWebSocket(gate.userId, payload);
  await recordNotification(gate.id, gate.userId, "websocket", notifType, wsDelivered);

  // If WebSocket failed, queue email fallback
  if (!wsDelivered) {
    await recordNotification(gate.id, gate.userId, "email", notifType, false);
  }
}

/**
 * Dispatch a gate:auto_advanced notification (for advisory gates).
 */
export async function notifyAutoAdvanced(gate: GateRow): Promise<void> {
  const payload = buildAutoAdvancedPayload(gate);

  if (await isNotificationDelivered(gate.id, "gate_ready", "websocket")) return;

  const wsDelivered = sendViaWebSocket(gate.userId, payload);
  await recordNotification(gate.id, gate.userId, "websocket", "gate_ready", wsDelivered);
}

/**
 * Dispatch a timeout warning notification.
 */
export async function notifyTimeoutWarning(
  gate: GateRow,
  hoursRemaining: number
): Promise<void> {
  const notifType: NotificationType = hoursRemaining <= 1
    ? "timeout_warning_1h"
    : hoursRemaining <= 6
    ? "timeout_warning_6h"
    : "timeout_warning_23h";

  if (await isNotificationDelivered(gate.id, notifType, "websocket")) return;

  const payload = buildTimeoutWarningPayload(gate, hoursRemaining);
  const wsDelivered = sendViaWebSocket(gate.userId, payload);
  await recordNotification(gate.id, gate.userId, "websocket", notifType, wsDelivered);

  if (!wsDelivered) {
    await recordNotification(gate.id, gate.userId, "email", notifType, false);
  }
}

/**
 * Dispatch an escalation notification (ambient/advisory → blocking).
 */
export async function notifyEscalation(
  gate: GateRow,
  previousGateType: string,
  reason: string
): Promise<void> {
  if (await isNotificationDelivered(gate.id, "escalation", "websocket")) return;

  const payload = buildEscalationPayload(gate, previousGateType, reason);
  const wsDelivered = sendViaWebSocket(gate.userId, payload);
  await recordNotification(gate.id, gate.userId, "websocket", "escalation", wsDelivered);

  if (!wsDelivered) {
    await recordNotification(gate.id, gate.userId, "email", "escalation", false);
  }
}

/**
 * Get undelivered email notifications for batch digest.
 */
export async function getUndeliveredEmailNotifications(
  userId: number
): Promise<Array<{ gateId: number; notificationType: string; createdAt: Date }>> {
  const db = await getDb();
  if (!db) return [];

  const [rows] = await db.execute(sql`
    SELECT gateId, notificationType, createdAt
    FROM gate_notifications
    WHERE userId = ${userId}
      AND channel = 'email'
      AND delivered = 0
    ORDER BY createdAt ASC
  `);
  return (rows as unknown as any[]) as any[];
}

/**
 * Mark email notifications as delivered.
 */
export async function markEmailNotificationsDelivered(
  userId: number,
  gateIds: number[]
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  if (gateIds.length === 0) return;

  await db.execute(sql`
    UPDATE gate_notifications SET
      delivered = 1,
      deliveredAt = NOW()
    WHERE userId = ${userId}
      AND channel = 'email'
      AND delivered = 0
      AND gateId IN (${sql.join(gateIds.map(id => sql`${id}`), sql`, `)})
  `);
}

// ─── Export for testing ─────────────────────────────────────────────────

export const _internal = {
  wsConnections,
  sendViaWebSocket,
  isNotificationDelivered,
  recordNotification,
  buildGateReadyPayload,
  buildAutoAdvancedPayload,
  buildTimeoutWarningPayload,
  buildEscalationPayload,
};
