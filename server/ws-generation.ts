/**
 * ws-generation.ts — WebSocket server for real-time generation dashboard events.
 *
 * Clients connect to /ws/generation?episodeId=<id> and receive events:
 *   slice_started, slice_complete, slice_failed, episode_complete, progress_update
 *
 * The server uses room-based subscriptions so each client only receives
 * events for the episode they are watching. Heartbeat pings keep connections
 * alive and detect stale clients.
 */

import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer } from "http";
import type { IncomingMessage } from "http";
import { URL } from "url";

// ─── Event Types ────────────────────────────────────────────────────────────

export type GenerationEventType =
  | "slice_started"
  | "slice_complete"
  | "slice_failed"
  | "episode_complete"
  | "progress_update"
  | "connection_ack"
  | "error";

export interface GenerationEvent {
  type: GenerationEventType;
  episodeId: number;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface SliceStartedData {
  sliceId: number;
  sceneIndex: number;
  provider?: string;
}

export interface SliceCompleteData {
  sliceId: number;
  sceneIndex: number;
  durationMs: number;
  resultUrl?: string;
}

export interface SliceFailedData {
  sliceId: number;
  sceneIndex: number;
  error: string;
  retriesLeft: number;
}

export interface ProgressUpdateData {
  totalSlices: number;
  pending: number;
  generating: number;
  complete: number;
  failed: number;
  estimatedTimeRemainingSec: number;
  currentConcurrency: number;
}

export interface EpisodeCompleteData {
  totalSlices: number;
  successCount: number;
  failCount: number;
  totalDurationMs: number;
}

// ─── Room Management ────────────────────────────────────────────────────────

/** Map of episodeId → Set of connected WebSocket clients */
const rooms = new Map<number, Set<WebSocket>>();

/** Map of WebSocket → episodeId for cleanup */
const clientEpisodeMap = new Map<WebSocket, number>();

/** Heartbeat tracking */
const aliveMap = new Map<WebSocket, boolean>();

const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 10_000;

function addToRoom(ws: WebSocket, episodeId: number): void {
  if (!rooms.has(episodeId)) {
    rooms.set(episodeId, new Set());
  }
  rooms.get(episodeId)!.add(ws);
  clientEpisodeMap.set(ws, episodeId);
  aliveMap.set(ws, true);
}

function removeFromRoom(ws: WebSocket): void {
  const episodeId = clientEpisodeMap.get(ws);
  if (episodeId !== undefined) {
    const room = rooms.get(episodeId);
    if (room) {
      room.delete(ws);
      if (room.size === 0) {
        rooms.delete(episodeId);
      }
    }
  }
  clientEpisodeMap.delete(ws);
  aliveMap.delete(ws);
}

// ─── Broadcasting ───────────────────────────────────────────────────────────

/**
 * Broadcast an event to all clients subscribed to a specific episode.
 * This is the main API other modules call to push real-time updates.
 */
export function broadcastToEpisode(
  episodeId: number,
  type: GenerationEventType,
  data: Record<string, unknown>,
): void {
  const event: GenerationEvent = {
    type,
    episodeId,
    timestamp: Date.now(),
    data,
  };
  const payload = JSON.stringify(event);
  const room = rooms.get(episodeId);
  if (!room) return;

  for (const client of Array.from(room)) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(payload);
      } catch {
        // Client will be cleaned up by heartbeat
      }
    }
  }
}

// ─── Convenience Emitters ───────────────────────────────────────────────────

export function emitSliceStarted(episodeId: number, data: SliceStartedData): void {
  broadcastToEpisode(episodeId, "slice_started", data as unknown as Record<string, unknown>);
}

export function emitSliceComplete(episodeId: number, data: SliceCompleteData): void {
  broadcastToEpisode(episodeId, "slice_complete", data as unknown as Record<string, unknown>);
}

export function emitSliceFailed(episodeId: number, data: SliceFailedData): void {
  broadcastToEpisode(episodeId, "slice_failed", data as unknown as Record<string, unknown>);
}

export function emitProgressUpdate(episodeId: number, data: ProgressUpdateData): void {
  broadcastToEpisode(episodeId, "progress_update", data as unknown as Record<string, unknown>);
}

export function emitEpisodeComplete(episodeId: number, data: EpisodeCompleteData): void {
  broadcastToEpisode(episodeId, "episode_complete", data as unknown as Record<string, unknown>);
}

// ─── Server Setup ───────────────────────────────────────────────────────────

let wss: WebSocketServer | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Attach the WebSocket server to an existing HTTP server.
 * Handles upgrade requests on the /ws/generation path.
 */
export function setupGenerationWebSocket(httpServer: HttpServer): WebSocketServer {
  wss = new WebSocketServer({ noServer: true });

  // Handle upgrade requests
  httpServer.on("upgrade", (request: IncomingMessage, socket, head) => {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

    if (url.pathname !== "/ws/generation") {
      // Not our path — ignore (let other WS handlers or Vite HMR handle it)
      return;
    }

    const episodeIdStr = url.searchParams.get("episodeId");
    if (!episodeIdStr || isNaN(Number(episodeIdStr))) {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
      return;
    }

    wss!.handleUpgrade(request, socket, head, (ws) => {
      wss!.emit("connection", ws, request, Number(episodeIdStr));
    });
  });

  // Handle new connections
  wss.on("connection", (ws: WebSocket, _request: IncomingMessage, episodeId: number) => {
    addToRoom(ws, episodeId);

    // Send connection acknowledgment
    const ackEvent: GenerationEvent = {
      type: "connection_ack",
      episodeId,
      timestamp: Date.now(),
      data: {
        message: `Subscribed to generation events for episode ${episodeId}`,
        roomSize: rooms.get(episodeId)?.size ?? 1,
      },
    };
    ws.send(JSON.stringify(ackEvent));

    // Handle pong responses for heartbeat
    ws.on("pong", () => {
      aliveMap.set(ws, true);
    });

    // Handle client messages (for future use: e.g., switching episodes)
    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "subscribe" && typeof msg.episodeId === "number") {
          removeFromRoom(ws);
          addToRoom(ws, msg.episodeId);
          ws.send(JSON.stringify({
            type: "connection_ack",
            episodeId: msg.episodeId,
            timestamp: Date.now(),
            data: { message: `Switched to episode ${msg.episodeId}` },
          }));
        }
      } catch {
        // Ignore malformed messages
      }
    });

    // Cleanup on close
    ws.on("close", () => {
      removeFromRoom(ws);
    });

    ws.on("error", () => {
      removeFromRoom(ws);
    });
  });

  // Start heartbeat interval
  heartbeatTimer = setInterval(() => {
    if (!wss) return;
    for (const client of Array.from(wss.clients)) {
      if (aliveMap.get(client) === false) {
        removeFromRoom(client);
        client.terminate();
        continue;
      }
      aliveMap.set(client, false);
      client.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);

  console.log("[WS] Generation WebSocket server attached on /ws/generation");
  return wss;
}

/**
 * Gracefully shut down the WebSocket server.
 */
export function shutdownGenerationWebSocket(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (wss) {
    for (const client of Array.from(wss.clients)) {
      client.close(1001, "Server shutting down");
    }
    wss.close();
    wss = null;
  }
  rooms.clear();
  clientEpisodeMap.clear();
  aliveMap.clear();
}

// ─── Stats (for monitoring / tests) ────────────────────────────────────────

export function getConnectionStats(): {
  totalConnections: number;
  activeRooms: number;
  roomSizes: Record<number, number>;
} {
  const roomSizes: Record<number, number> = {};
  let totalConnections = 0;
  for (const [episodeId, clients] of Array.from(rooms)) {
    roomSizes[episodeId] = clients.size;
    totalConnections += clients.size;
  }
  return { totalConnections, activeRooms: rooms.size, roomSizes };
}
