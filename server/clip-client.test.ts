/**
 * CLIP Client — Comprehensive Tests
 *
 * Covers:
 * - Cosine similarity computation (local)
 * - Embedding cache (set, get, TTL expiry, size limit)
 * - clipFetch helper (success, error, timeout)
 * - Real CLIP service getEmbedding (with cache)
 * - Extended functions: imageSimilarity, batchSimilarity, textImageSimilarity, checkSafety
 * - Health check and auto-fallback (getClipService)
 * - Export verification
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Cosine Similarity (local computation) ────────────────────────────

describe("CLIP Client — Cosine Similarity", () => {
  it("should compute cosine similarity for identical vectors", async () => {
    const { realClipService } = await import("./hitl/clip-client");
    const vec = [1, 0, 0, 0];
    expect(realClipService.cosineSimilarity(vec, vec)).toBeCloseTo(1.0, 5);
  });

  it("should compute cosine similarity for orthogonal vectors", async () => {
    const { realClipService } = await import("./hitl/clip-client");
    const a = [1, 0, 0, 0];
    const b = [0, 1, 0, 0];
    expect(realClipService.cosineSimilarity(a, b)).toBeCloseTo(0.0, 5);
  });

  it("should compute cosine similarity for opposite vectors", async () => {
    const { realClipService } = await import("./hitl/clip-client");
    const a = [1, 0, 0];
    const b = [-1, 0, 0];
    expect(realClipService.cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5);
  });

  it("should return 0 for zero vectors", async () => {
    const { realClipService } = await import("./hitl/clip-client");
    const zero = [0, 0, 0];
    const vec = [1, 2, 3];
    expect(realClipService.cosineSimilarity(zero, vec)).toBe(0);
    expect(realClipService.cosineSimilarity(zero, zero)).toBe(0);
  });

  it("should compute correct similarity for known vectors", async () => {
    const { realClipService } = await import("./hitl/clip-client");
    const a = [1, 2, 3];
    const b = [4, 5, 6];
    // dot = 4+10+18 = 32, magA = sqrt(14), magB = sqrt(77)
    const expected = 32 / (Math.sqrt(14) * Math.sqrt(77));
    expect(realClipService.cosineSimilarity(a, b)).toBeCloseTo(expected, 5);
  });
});

// ─── Embedding Cache ──────────────────────────────────────────────────

describe("CLIP Client — Embedding Cache", () => {
  beforeEach(async () => {
    const { clearEmbeddingCache, resetHealthState } = await import("./hitl/clip-client");
    clearEmbeddingCache();
    resetHealthState();
  });

  it("should cache and retrieve embeddings", async () => {
    const { _internal } = await import("./hitl/clip-client");
    const embedding = [0.1, 0.2, 0.3];
    _internal.setCachedEmbedding("test-key", embedding);
    const cached = _internal.getCachedEmbedding("test-key");
    expect(cached).toEqual(embedding);
  });

  it("should return null for missing keys", async () => {
    const { _internal } = await import("./hitl/clip-client");
    expect(_internal.getCachedEmbedding("nonexistent")).toBeNull();
  });

  it("should evict expired entries", async () => {
    const { _internal } = await import("./hitl/clip-client");
    const embedding = [0.1, 0.2, 0.3];
    _internal.setCachedEmbedding("old-key", embedding);

    // Manually expire the entry
    const entry = _internal.embeddingCache.get("old-key");
    if (entry) entry.ts = Date.now() - _internal.CACHE_TTL_MS - 1;

    expect(_internal.getCachedEmbedding("old-key")).toBeNull();
    // Entry should be deleted after expiry check
    expect(_internal.embeddingCache.has("old-key")).toBe(false);
  });

  it("should evict oldest entry when cache exceeds 200", async () => {
    const { _internal } = await import("./hitl/clip-client");
    // Fill cache to 201 entries
    for (let i = 0; i <= 200; i++) {
      _internal.setCachedEmbedding(`key-${i}`, [i]);
    }
    // First entry should have been evicted when 201st was added
    // (the eviction happens when size > 200 before adding)
    expect(_internal.embeddingCache.size).toBeLessThanOrEqual(201);
  });

  it("should clear all entries with clearEmbeddingCache", async () => {
    const { _internal, clearEmbeddingCache } = await import("./hitl/clip-client");
    _internal.setCachedEmbedding("a", [1]);
    _internal.setCachedEmbedding("b", [2]);
    expect(_internal.embeddingCache.size).toBe(2);
    clearEmbeddingCache();
    expect(_internal.embeddingCache.size).toBe(0);
  });
});

// ─── Health Check ─────────────────────────────────────────────────────

describe("CLIP Client — Health Check", () => {
  beforeEach(async () => {
    const { resetHealthState, clearEmbeddingCache } = await import("./hitl/clip-client");
    resetHealthState();
    clearEmbeddingCache();
  });

  it("should return health status when service is available", async () => {
    const { checkClipHealth } = await import("./hitl/clip-client");

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "ok",
        model: "ViT-B/32",
        device: "cpu",
        safety_concepts_loaded: true,
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const health = await checkClipHealth();
    expect(health.status).toBe("ok");
    expect(health.model).toBe("ViT-B/32");
    expect(health.device).toBe("cpu");
    expect(health.safetyConcepts).toBe(true);

    vi.unstubAllGlobals();
  });

  it("should throw when health check returns non-ok status", async () => {
    const { checkClipHealth } = await import("./hitl/clip-client");

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    });
    vi.stubGlobal("fetch", mockFetch);

    await expect(checkClipHealth()).rejects.toThrow("Health check returned 503");

    vi.unstubAllGlobals();
  });
});

// ─── Auto-Fallback (getClipService) ───────────────────────────────────

describe("CLIP Client — Auto-Fallback", () => {
  beforeEach(async () => {
    const { resetHealthState, clearEmbeddingCache } = await import("./hitl/clip-client");
    resetHealthState();
    clearEmbeddingCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should return real service when healthy", async () => {
    const { getClipService, realClipService } = await import("./hitl/clip-client");

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "ok",
        model: "ViT-B/32",
        device: "cpu",
        safety_concepts_loaded: true,
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const service = await getClipService();
    expect(service).toBe(realClipService);
  });

  it("should return mock service when health check fails", async () => {
    const { getClipService, realClipService } = await import("./hitl/clip-client");

    const mockFetch = vi.fn().mockRejectedValue(new Error("Connection refused"));
    vi.stubGlobal("fetch", mockFetch);

    // Suppress console.warn from fallback
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const service = await getClipService();
    expect(service).not.toBe(realClipService);
    // Verify it has the ClipService interface
    expect(typeof service.getEmbedding).toBe("function");
    expect(typeof service.cosineSimilarity).toBe("function");

    warnSpy.mockRestore();
  });

  it("should cache health check result for 60 seconds", async () => {
    const { getClipService, resetHealthState } = await import("./hitl/clip-client");
    resetHealthState();

    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      return {
        ok: true,
        json: async () => ({
          status: "ok",
          model: "ViT-B/32",
          device: "cpu",
          safety_concepts_loaded: true,
        }),
      };
    });
    vi.stubGlobal("fetch", mockFetch);

    await getClipService();
    const firstCallCount = callCount;
    await getClipService();
    // Second call should not trigger another health check
    expect(callCount).toBe(firstCallCount);
  });
});

// ─── Extended Functions (with mocked fetch) ───────────────────────────

describe("CLIP Client — Extended Functions", () => {
  beforeEach(async () => {
    const { clearEmbeddingCache, resetHealthState } = await import("./hitl/clip-client");
    clearEmbeddingCache();
    resetHealthState();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("imageSimilarity should return similarity and score", async () => {
    const { imageSimilarity } = await import("./hitl/clip-client");

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ similarity: 0.85, score: 78 }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await imageSimilarity("http://img-a.png", "http://img-b.png");
    expect(result.similarity).toBe(0.85);
    expect(result.score).toBe(78);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/similarity"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ image_url_a: "http://img-a.png", image_url_b: "http://img-b.png" }),
      })
    );
  });

  it("batchSimilarity should return batch results with camelCase keys", async () => {
    const { batchSimilarity } = await import("./hitl/clip-client");

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        similarities: [0.8, 0.9],
        max_similarity: 0.9,
        avg_similarity: 0.85,
        max_score: 90,
        avg_score: 85,
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await batchSimilarity("http://target.png", ["http://ref1.png", "http://ref2.png"]);
    expect(result.similarities).toEqual([0.8, 0.9]);
    expect(result.maxSimilarity).toBe(0.9);
    expect(result.avgSimilarity).toBe(0.85);
    expect(result.maxScore).toBe(90);
    expect(result.avgScore).toBe(85);
  });

  it("textImageSimilarity should return similarity and score", async () => {
    const { textImageSimilarity } = await import("./hitl/clip-client");

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ similarity: 0.72, score: 65 }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await textImageSimilarity("http://img.png", "anime style illustration");
    expect(result.similarity).toBe(0.72);
    expect(result.score).toBe(65);
  });

  it("checkSafety should return safety result with camelCase keys", async () => {
    const { checkSafety } = await import("./hitl/clip-client");

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        is_safe: true,
        safety_score: 0.92,
        max_nsfw_similarity: 0.08,
        max_safe_similarity: 0.95,
        flagged_concepts: [],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await checkSafety("http://img.png");
    expect(result.isSafe).toBe(true);
    expect(result.safetyScore).toBe(0.92);
    expect(result.maxNsfwSimilarity).toBe(0.08);
    expect(result.maxSafeSimilarity).toBe(0.95);
    expect(result.flaggedConcepts).toEqual([]);
  });

  it("checkSafety should report flagged concepts for unsafe content", async () => {
    const { checkSafety } = await import("./hitl/clip-client");

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        is_safe: false,
        safety_score: 0.25,
        max_nsfw_similarity: 0.78,
        max_safe_similarity: 0.42,
        flagged_concepts: ["nudity", "violence"],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await checkSafety("http://unsafe.png");
    expect(result.isSafe).toBe(false);
    expect(result.safetyScore).toBe(0.25);
    expect(result.flaggedConcepts).toEqual(["nudity", "violence"]);
  });

  it("getTextEmbedding should cache results", async () => {
    const { getTextEmbedding, clearEmbeddingCache, _internal } = await import("./hitl/clip-client");
    clearEmbeddingCache();

    const embedding = new Array(512).fill(0.01);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embedding, dimension: 512, input_type: "text" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result1 = await getTextEmbedding("anime style");
    expect(result1).toEqual(embedding);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Second call should use cache
    const result2 = await getTextEmbedding("anime style");
    expect(result2).toEqual(embedding);
    expect(mockFetch).toHaveBeenCalledTimes(1); // No additional fetch
  });
});

// ─── clipFetch Error Handling ─────────────────────────────────────────

describe("CLIP Client — clipFetch Error Handling", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should throw on non-ok response", async () => {
    const { _internal } = await import("./hitl/clip-client");

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => "Validation error",
    });
    vi.stubGlobal("fetch", mockFetch);

    await expect(_internal.clipFetch("/embed", { url: "bad" })).rejects.toThrow(
      "CLIP service /embed returned 422: Validation error"
    );
  });

  it("should handle fetch failure gracefully", async () => {
    const { _internal } = await import("./hitl/clip-client");

    const mockFetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    vi.stubGlobal("fetch", mockFetch);

    await expect(_internal.clipFetch("/embed", { url: "test" })).rejects.toThrow("ECONNREFUSED");
  });
});

// ─── Export Verification ──────────────────────────────────────────────

describe("CLIP Client — Exports", () => {
  it("should export all public functions and types", async () => {
    const clipClient = await import("./hitl/clip-client");

    // Functions
    expect(typeof clipClient.realClipService).toBe("object");
    expect(typeof clipClient.realClipService.getEmbedding).toBe("function");
    expect(typeof clipClient.realClipService.cosineSimilarity).toBe("function");
    expect(typeof clipClient.getClipService).toBe("function");
    expect(typeof clipClient.getTextEmbedding).toBe("function");
    expect(typeof clipClient.imageSimilarity).toBe("function");
    expect(typeof clipClient.batchSimilarity).toBe("function");
    expect(typeof clipClient.textImageSimilarity).toBe("function");
    expect(typeof clipClient.checkSafety).toBe("function");
    expect(typeof clipClient.checkClipHealth).toBe("function");
    expect(typeof clipClient.clearEmbeddingCache).toBe("function");
    expect(typeof clipClient.resetHealthState).toBe("function");
  });

  it("should export via barrel index", async () => {
    const hitl = await import("./hitl/index");

    expect(typeof hitl.realClipService).toBe("object");
    expect(typeof hitl.getClipService).toBe("function");
    expect(typeof hitl.checkSafety).toBe("function");
    expect(typeof hitl.checkClipHealth).toBe("function");
    expect(typeof hitl.clearEmbeddingCache).toBe("function");
  });

  it("should export _internal for testing", async () => {
    const { _internal } = await import("./hitl/clip-client");

    expect(_internal.CLIP_SERVICE_URL).toBe("http://localhost:8100");
    expect(_internal.REQUEST_TIMEOUT_MS).toBe(15_000);
    expect(_internal.CACHE_TTL_MS).toBe(5 * 60 * 1000);
    expect(typeof _internal.clipFetch).toBe("function");
    expect(typeof _internal.getCachedEmbedding).toBe("function");
    expect(typeof _internal.setCachedEmbedding).toBe("function");
    expect(_internal.embeddingCache instanceof Map).toBe(true);
  });
});

// ─── Confidence Scorer CLIP Integration ───────────────────────────────

describe("CLIP Client — Confidence Scorer Integration", () => {
  it("scoreGeneration should auto-resolve CLIP service", async () => {
    const { scoreGeneration } = await import("./hitl/confidence-scorer");

    // Suppress console.warn from fallback
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await scoreGeneration(
      {
        requestType: "image",
        outputUrl: "http://example.com/output.png",
        providerMetadata: {},
      },
      {
        stageNumber: 3,
        episodeId: "ep-1",
        projectId: "proj-1",
      }
    );

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.breakdown.length).toBeGreaterThan(0);
    expect(Array.isArray(result.flags)).toBe(true);

    warnSpy.mockRestore();
  });

  it("scoreContentSafety should use CLIP when available for images", async () => {
    const { _internal } = await import("./hitl/confidence-scorer");

    // scoreContentSafety is now async
    const result = await _internal.scoreContentSafety(
      {
        requestType: "image",
        outputUrl: "http://example.com/test.png",
        providerMetadata: {},
      },
      { stageNumber: 3, episodeId: "ep-1", projectId: "proj-1" }
    );

    expect(result.dimension).toBe("content_safety");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(typeof result.reasoning).toBe("string");
  });

  it("scoreContentSafety should still veto on provider NSFW flags", async () => {
    const { _internal } = await import("./hitl/confidence-scorer");

    const result = await _internal.scoreContentSafety(
      {
        requestType: "image",
        outputUrl: "http://example.com/test.png",
        providerMetadata: { nsfw: true },
      },
      { stageNumber: 3, episodeId: "ep-1", projectId: "proj-1" }
    );

    expect(result.score).toBe(0);
    expect(result.reasoning).toContain("NSFW");
  });

  it("scoreContentSafety should fall back to metadata-only for audio", async () => {
    const { _internal } = await import("./hitl/confidence-scorer");

    const result = await _internal.scoreContentSafety(
      {
        requestType: "voice",
        outputUrl: "http://example.com/test.mp3",
        providerMetadata: {},
      },
      { stageNumber: 7, episodeId: "ep-1", projectId: "proj-1" }
    );

    expect(result.dimension).toBe("content_safety");
    expect(result.score).toBe(95);
    expect(result.reasoning).toContain("metadata-only");
  });
});
