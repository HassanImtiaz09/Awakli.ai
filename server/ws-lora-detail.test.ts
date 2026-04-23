/**
 * WebSocket Generation & LoRA Detail Page — Unit Tests
 *
 * Tests for:
 *   - WebSocket event broadcasting and room management
 *   - LoRA detail page backend (getLoraById, getReviews, addReview)
 *   - Revenue share & training savings calculations
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── WebSocket Generation Module ────────────────────────────────────────
import {
  broadcastToEpisode,
  getConnectionStats,
  emitSliceStarted,
  emitSliceComplete,
  emitSliceFailed,
  emitProgressUpdate,
  emitEpisodeComplete,
} from "./ws-generation";

import type {
  GenerationEvent,
  GenerationEventType,
  SliceStartedData,
  SliceCompleteData,
  SliceFailedData,
  ProgressUpdateData,
  EpisodeCompleteData,
} from "./ws-generation";

describe("WebSocket Generation Module", () => {
  describe("getConnectionStats", () => {
    it("returns stats structure with totalConnections, activeRooms, roomSizes", () => {
      const stats = getConnectionStats();
      expect(stats).toHaveProperty("totalConnections");
      expect(stats).toHaveProperty("activeRooms");
      expect(stats).toHaveProperty("roomSizes");
      expect(typeof stats.totalConnections).toBe("number");
      expect(typeof stats.activeRooms).toBe("number");
      expect(typeof stats.roomSizes).toBe("object");
    });

    it("starts with zero connections when no clients connected", () => {
      const stats = getConnectionStats();
      expect(stats.totalConnections).toBe(0);
      expect(stats.activeRooms).toBe(0);
    });
  });

  describe("broadcastToEpisode", () => {
    it("does not throw when broadcasting to non-existent room", () => {
      expect(() => {
        broadcastToEpisode(99999, "slice_started", { sliceId: 1 });
      }).not.toThrow();
    });

    it("does not throw for any valid event type", () => {
      const eventTypes: GenerationEventType[] = [
        "slice_started",
        "slice_complete",
        "slice_failed",
        "episode_complete",
        "progress_update",
        "connection_ack",
        "error",
      ];
      for (const type of eventTypes) {
        expect(() => broadcastToEpisode(1, type, {})).not.toThrow();
      }
    });
  });

  describe("convenience emitters", () => {
    it("emitSliceStarted does not throw", () => {
      expect(() => {
        emitSliceStarted(1, { sliceId: 1, sceneIndex: 0, provider: "kling" });
      }).not.toThrow();
    });

    it("emitSliceComplete does not throw", () => {
      expect(() => {
        emitSliceComplete(1, { sliceId: 1, sceneIndex: 0, durationMs: 5000, resultUrl: "https://example.com/result.mp4" });
      }).not.toThrow();
    });

    it("emitSliceFailed does not throw", () => {
      expect(() => {
        emitSliceFailed(1, { sliceId: 1, sceneIndex: 0, error: "timeout", retriesLeft: 2 });
      }).not.toThrow();
    });

    it("emitProgressUpdate does not throw", () => {
      expect(() => {
        emitProgressUpdate(1, {
          totalSlices: 10,
          pending: 3,
          generating: 2,
          complete: 4,
          failed: 1,
          estimatedTimeRemainingSec: 120,
          currentConcurrency: 2,
        });
      }).not.toThrow();
    });

    it("emitEpisodeComplete does not throw", () => {
      expect(() => {
        emitEpisodeComplete(1, {
          totalSlices: 10,
          successCount: 9,
          failCount: 1,
          totalDurationMs: 60000,
        });
      }).not.toThrow();
    });
  });
});

// ─── LoRA Marketplace Detail Page Backend ───────────────────────────────
import {
  getLoraById,
  getReviews,
  calculateRevenueShare,
  calculateTrainingSavings,
  CREATOR_REVENUE_SHARE,
  FULL_TRAINING_COST,
  BASE_LORA_TRAINING_COST,
  BASE_LORA_SAVINGS,
} from "./lora-marketplace";

describe("LoRA Detail Page Backend", () => {
  describe("getLoraById", () => {
    it("returns null for non-existent LoRA", async () => {
      const result = await getLoraById(999999);
      expect(result).toBeNull();
    });

    it("returns LoRA with averageRating field when found", async () => {
      // This tests the shape — actual data depends on DB state
      const result = await getLoraById(1);
      if (result) {
        expect(result).toHaveProperty("id");
        expect(result).toHaveProperty("name");
        expect(result).toHaveProperty("averageRating");
        expect(typeof result.averageRating).toBe("number");
        expect(result).toHaveProperty("downloads");
        expect(result).toHaveProperty("ratingCount");
        expect(result).toHaveProperty("ratingSum");
        expect(result).toHaveProperty("license");
        expect(result).toHaveProperty("category");
        expect(result).toHaveProperty("priceCents");
      }
    });
  });

  describe("getReviews", () => {
    it("returns paginated structure with items and total", async () => {
      const result = await getReviews(1, 10, 0);
      expect(result).toHaveProperty("items");
      expect(result).toHaveProperty("total");
      expect(Array.isArray(result.items)).toBe(true);
      expect(typeof result.total).toBe("number");
    });

    it("returns empty items for non-existent LoRA", async () => {
      const result = await getReviews(999999, 10, 0);
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it("respects limit parameter", async () => {
      const result = await getReviews(1, 3, 0);
      expect(result.items.length).toBeLessThanOrEqual(3);
    });

    it("respects offset parameter", async () => {
      const result = await getReviews(1, 10, 1000);
      expect(result.items).toEqual([]);
    });
  });

  describe("calculateRevenueShare (detail page context)", () => {
    it("calculates correct 70/30 split for typical LoRA prices", () => {
      // $4.99 LoRA
      const result = calculateRevenueShare(499);
      expect(result.creatorEarnings).toBe(349);
      expect(result.platformFee).toBe(150);
      expect(result.creatorEarnings + result.platformFee).toBe(499);
    });

    it("handles $0 free LoRA", () => {
      const result = calculateRevenueShare(0);
      expect(result.creatorEarnings).toBe(0);
      expect(result.platformFee).toBe(0);
    });

    it("handles odd cent amounts correctly", () => {
      const result = calculateRevenueShare(1);
      expect(result.creatorEarnings + result.platformFee).toBe(1);
    });
  });

  describe("calculateTrainingSavings (detail page context)", () => {
    it("shows 75% savings when using base LoRA", () => {
      const result = calculateTrainingSavings(1);
      expect(result.savingsPercent).toBe(75);
      expect(result.savings).toBe(BASE_LORA_SAVINGS);
      expect(result.withBaseCost).toBe(BASE_LORA_TRAINING_COST);
      expect(result.fullCost).toBe(FULL_TRAINING_COST);
    });

    it("shows no savings without base LoRA", () => {
      const result = calculateTrainingSavings();
      expect(result.savings).toBe(0);
      expect(result.savingsPercent).toBe(0);
      expect(result.withBaseCost).toBe(result.fullCost);
    });
  });

  describe("constants", () => {
    it("CREATOR_REVENUE_SHARE is 70%", () => {
      expect(CREATOR_REVENUE_SHARE).toBe(0.7);
    });

    it("training cost constants are consistent", () => {
      expect(FULL_TRAINING_COST - BASE_LORA_TRAINING_COST).toBe(BASE_LORA_SAVINGS);
    });
  });
});
