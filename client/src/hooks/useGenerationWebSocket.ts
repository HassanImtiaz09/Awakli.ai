/**
 * useGenerationWebSocket — React hook for real-time generation dashboard updates.
 *
 * Connects to /ws/generation?episodeId=<id> and provides:
 *   - Live event stream with typed events
 *   - Auto-reconnect with exponential backoff
 *   - Connection status tracking
 *   - Progress state derived from events
 */

import { useState, useEffect, useRef, useCallback } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────

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

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "reconnecting";

export interface SliceStatus {
  sliceId: number;
  sceneIndex: number;
  status: "pending" | "generating" | "complete" | "failed";
  provider?: string;
  durationMs?: number;
  error?: string;
  updatedAt: number;
}

export interface ProgressState {
  totalSlices: number;
  pending: number;
  generating: number;
  complete: number;
  failed: number;
  estimatedTimeRemainingSec: number;
  currentConcurrency: number;
  percentage: number;
}

export interface UseGenerationWebSocketOptions {
  episodeId: number | null;
  enabled?: boolean;
  onSliceStarted?: (data: Record<string, unknown>) => void;
  onSliceComplete?: (data: Record<string, unknown>) => void;
  onSliceFailed?: (data: Record<string, unknown>) => void;
  onEpisodeComplete?: (data: Record<string, unknown>) => void;
  onProgressUpdate?: (data: Record<string, unknown>) => void;
}

export interface UseGenerationWebSocketReturn {
  connectionStatus: ConnectionStatus;
  events: GenerationEvent[];
  sliceStatuses: Map<number, SliceStatus>;
  progress: ProgressState | null;
  isEpisodeComplete: boolean;
  switchEpisode: (newEpisodeId: number) => void;
  disconnect: () => void;
  reconnect: () => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const MAX_EVENTS_BUFFER = 200;

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useGenerationWebSocket(
  options: UseGenerationWebSocketOptions,
): UseGenerationWebSocketReturn {
  const { episodeId, enabled = true, onSliceStarted, onSliceComplete, onSliceFailed, onEpisodeComplete, onProgressUpdate } = options;

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [events, setEvents] = useState<GenerationEvent[]>([]);
  const [sliceStatuses, setSliceStatuses] = useState<Map<number, SliceStatus>>(new Map());
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [isEpisodeComplete, setIsEpisodeComplete] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // Build WS URL
  const getWsUrl = useCallback((epId: number): string => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/ws/generation?episodeId=${epId}`;
  }, []);

  // Process incoming events
  const processEvent = useCallback((event: GenerationEvent) => {
    // Buffer events (keep last N)
    setEvents((prev) => {
      const next = [...prev, event];
      return next.length > MAX_EVENTS_BUFFER ? next.slice(-MAX_EVENTS_BUFFER) : next;
    });

    switch (event.type) {
      case "slice_started": {
        const sliceId = event.data.sliceId as number;
        const sceneIndex = event.data.sceneIndex as number;
        setSliceStatuses((prev) => {
          const next = new Map(prev);
          next.set(sliceId, {
            sliceId,
            sceneIndex,
            status: "generating",
            provider: event.data.provider as string | undefined,
            updatedAt: event.timestamp,
          });
          return next;
        });
        onSliceStarted?.(event.data);
        break;
      }

      case "slice_complete": {
        const sliceId = event.data.sliceId as number;
        const sceneIndex = event.data.sceneIndex as number;
        setSliceStatuses((prev) => {
          const next = new Map(prev);
          const existing = next.get(sliceId);
          next.set(sliceId, {
            ...existing,
            sliceId,
            sceneIndex,
            status: "complete",
            durationMs: event.data.durationMs as number,
            updatedAt: event.timestamp,
          });
          return next;
        });
        onSliceComplete?.(event.data);
        break;
      }

      case "slice_failed": {
        const sliceId = event.data.sliceId as number;
        const sceneIndex = event.data.sceneIndex as number;
        setSliceStatuses((prev) => {
          const next = new Map(prev);
          next.set(sliceId, {
            sliceId,
            sceneIndex,
            status: "failed",
            error: event.data.error as string,
            updatedAt: event.timestamp,
          });
          return next;
        });
        onSliceFailed?.(event.data);
        break;
      }

      case "progress_update": {
        const d = event.data;
        const total = (d.totalSlices as number) || 1;
        const complete = (d.complete as number) || 0;
        setProgress({
          totalSlices: total,
          pending: (d.pending as number) || 0,
          generating: (d.generating as number) || 0,
          complete,
          failed: (d.failed as number) || 0,
          estimatedTimeRemainingSec: (d.estimatedTimeRemainingSec as number) || 0,
          currentConcurrency: (d.currentConcurrency as number) || 0,
          percentage: Math.round((complete / total) * 100),
        });
        onProgressUpdate?.(event.data);
        break;
      }

      case "episode_complete": {
        setIsEpisodeComplete(true);
        onEpisodeComplete?.(event.data);
        break;
      }
    }
  }, [onSliceStarted, onSliceComplete, onSliceFailed, onEpisodeComplete, onProgressUpdate]);

  // Connect to WebSocket
  const connect = useCallback((epId: number) => {
    if (!mountedRef.current) return;

    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setConnectionStatus(reconnectAttemptsRef.current > 0 ? "reconnecting" : "connecting");

    try {
      const ws = new WebSocket(getWsUrl(epId));
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        setConnectionStatus("connected");
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (messageEvent) => {
        if (!mountedRef.current) return;
        try {
          const event: GenerationEvent = JSON.parse(messageEvent.data as string);
          processEvent(event);
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = (closeEvent) => {
        if (!mountedRef.current) return;
        wsRef.current = null;
        setConnectionStatus("disconnected");

        // Auto-reconnect unless intentionally closed (code 1000) or max attempts reached
        if (closeEvent.code !== 1000 && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.min(
            BASE_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttemptsRef.current),
            MAX_RECONNECT_DELAY_MS,
          );
          reconnectAttemptsRef.current += 1;
          reconnectTimerRef.current = setTimeout(() => {
            if (mountedRef.current) {
              connect(epId);
            }
          }, delay);
        }
      };

      ws.onerror = () => {
        // onclose will fire after this
      };
    } catch {
      setConnectionStatus("disconnected");
    }
  }, [getWsUrl, processEvent]);

  // Switch episode without full reconnect
  const switchEpisode = useCallback((newEpisodeId: number) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "subscribe", episodeId: newEpisodeId }));
      // Reset state for new episode
      setEvents([]);
      setSliceStatuses(new Map());
      setProgress(null);
      setIsEpisodeComplete(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    reconnectAttemptsRef.current = MAX_RECONNECT_ATTEMPTS; // Prevent auto-reconnect
    if (wsRef.current) {
      wsRef.current.close(1000, "Client disconnect");
      wsRef.current = null;
    }
    setConnectionStatus("disconnected");
  }, []);

  const reconnect = useCallback(() => {
    if (episodeId) {
      reconnectAttemptsRef.current = 0;
      connect(episodeId);
    }
  }, [episodeId, connect]);

  // Effect: connect/disconnect based on episodeId and enabled
  useEffect(() => {
    mountedRef.current = true;

    if (enabled && episodeId) {
      // Reset state
      setEvents([]);
      setSliceStatuses(new Map());
      setProgress(null);
      setIsEpisodeComplete(false);
      reconnectAttemptsRef.current = 0;
      connect(episodeId);
    }

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close(1000, "Component unmount");
        wsRef.current = null;
      }
    };
  }, [episodeId, enabled, connect]);

  return {
    connectionStatus,
    events,
    sliceStatuses,
    progress,
    isEpisodeComplete,
    switchEpisode,
    disconnect,
    reconnect,
  };
}
