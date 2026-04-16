/**
 * HITL Gate SSE Handler (Prompt 17)
 *
 * Server-Sent Events endpoint for real-time gate notifications.
 * Uses SSE instead of raw WebSocket since it works natively with Express
 * and doesn't require additional dependencies.
 *
 * Endpoint: GET /api/hitl/events
 * Auth: Session cookie (same as tRPC)
 */

import type { Express, Request, Response } from "express";
import { registerWsConnection, type GateNotificationPayload } from "./notification-dispatcher";

// Active SSE connections
const sseConnections = new Map<number, Set<Response>>();

/**
 * Register the SSE endpoint on the Express app.
 * Must be called before Vite middleware to avoid conflicts.
 */
export function registerHitlSseRoutes(app: Express): void {
  app.get("/api/hitl/events", async (req: Request, res: Response) => {
    // Auth check — extract user from session cookie
    const { createContext } = await import("../_core/context");
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

    // Set SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // Disable Nginx buffering
    });

    // Send initial connection event
    res.write(`event: connected\ndata: ${JSON.stringify({ userId, timestamp: Date.now() })}\n\n`);

    // Register this connection in the notification dispatcher
    const sendFn = (payload: GateNotificationPayload) => {
      try {
        res.write(`event: gate\ndata: ${JSON.stringify(payload)}\n\n`);
      } catch {
        // Connection closed
      }
    };

    const unregister = registerWsConnection(userId, sendFn);

    // Track SSE connection
    if (!sseConnections.has(userId)) {
      sseConnections.set(userId, new Set());
    }
    sseConnections.get(userId)!.add(res);

    // Heartbeat every 30s to keep connection alive
    const heartbeat = setInterval(() => {
      try {
        res.write(`event: heartbeat\ndata: ${JSON.stringify({ t: Date.now() })}\n\n`);
      } catch {
        clearInterval(heartbeat);
      }
    }, 30000);

    // Cleanup on disconnect
    req.on("close", () => {
      clearInterval(heartbeat);
      unregister();
      const conns = sseConnections.get(userId);
      if (conns) {
        conns.delete(res);
        if (conns.size === 0) sseConnections.delete(userId);
      }
    });
  });

  // Health check endpoint
  app.get("/api/hitl/health", (_req: Request, res: Response) => {
    const totalConnections = Array.from(sseConnections.values())
      .reduce((sum, set) => sum + set.size, 0);

    res.json({
      status: "ok",
      activeConnections: totalConnections,
      connectedUsers: sseConnections.size,
    });
  });
}

/**
 * Get the count of active SSE connections.
 */
export function getActiveSseConnectionCount(): number {
  return Array.from(sseConnections.values())
    .reduce((sum, set) => sum + set.size, 0);
}
