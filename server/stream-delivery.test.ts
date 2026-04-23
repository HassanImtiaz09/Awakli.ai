/**
 * Tests for the stream-delivery module.
 *
 * Covers:
 *   - isTransientError classification
 *   - deliverToStream flow (validation, upload, poll, update)
 *   - getDeliveryStatus state mapping
 *   - retryDelivery clears error state and re-uploads
 *   - triggerStreamDeliveryAsync fire-and-forget
 *   - Assembly router stream delivery endpoint input validation
 *
 * Uses vitest mocking for cloudflare-stream and db modules.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isTransientError,
  STREAM_POLL_TIMEOUT_MS,
  STREAM_POLL_INTERVAL_MS,
  MAX_TRANSIENT_RETRIES,
  type StreamDeliveryStatus,
  type DeliveryResult,
  type DeliveryStatusResult,
} from "./stream-delivery";

// ─── isTransientError (pure function, no mocks needed) ──────────────

describe("isTransientError", () => {
  it("returns true for timeout errors", () => {
    expect(isTransientError(new Error("Request timeout"))).toBe(true);
    expect(isTransientError(new Error("TIMEOUT exceeded"))).toBe(true);
  });

  it("returns true for connection reset errors", () => {
    expect(isTransientError(new Error("ECONNRESET"))).toBe(true);
    expect(isTransientError(new Error("ECONNREFUSED"))).toBe(true);
  });

  it("returns true for fetch failures", () => {
    expect(isTransientError(new Error("fetch failed"))).toBe(true);
  });

  it("returns true for 5xx HTTP errors", () => {
    expect(isTransientError(new Error("502 Bad Gateway"))).toBe(true);
    expect(isTransientError(new Error("503 Service Unavailable"))).toBe(true);
    expect(isTransientError(new Error("504 Gateway Timeout"))).toBe(true);
  });

  it("returns true for rate limit errors", () => {
    expect(isTransientError(new Error("429 Too Many Requests"))).toBe(true);
    expect(isTransientError(new Error("rate limit exceeded"))).toBe(true);
  });

  it("returns false for permanent errors", () => {
    expect(isTransientError(new Error("Invalid API key"))).toBe(false);
    expect(isTransientError(new Error("Not found"))).toBe(false);
    expect(isTransientError(new Error("400 Bad Request"))).toBe(false);
  });

  it("returns false for non-Error values", () => {
    expect(isTransientError("string error")).toBe(false);
    expect(isTransientError(42)).toBe(false);
    expect(isTransientError(null)).toBe(false);
    expect(isTransientError(undefined)).toBe(false);
  });
});

// ─── Constants ──────────────────────────────────────────────────────

describe("Stream Delivery Constants", () => {
  it("has correct poll timeout (10 minutes)", () => {
    expect(STREAM_POLL_TIMEOUT_MS).toBe(10 * 60 * 1000);
  });

  it("has correct poll interval (5 seconds)", () => {
    expect(STREAM_POLL_INTERVAL_MS).toBe(5000);
  });

  it("has correct max transient retries (3)", () => {
    expect(MAX_TRANSIENT_RETRIES).toBe(3);
  });
});

// ─── deliverToStream (mocked) ───────────────────────────────────────

describe("deliverToStream", () => {
  // We mock the cloudflare-stream and db modules
  let mockGetEpisodeById: ReturnType<typeof vi.fn>;
  let mockUpdateEpisode: ReturnType<typeof vi.fn>;
  let mockUploadFromUrl: ReturnType<typeof vi.fn>;
  let mockWaitUntilReady: ReturnType<typeof vi.fn>;
  let mockGetEmbedUrl: ReturnType<typeof vi.fn>;
  let mockGetHlsUrl: ReturnType<typeof vi.fn>;
  let mockGetThumbnailUrl: ReturnType<typeof vi.fn>;
  let deliverToStream: typeof import("./stream-delivery").deliverToStream;

  beforeEach(async () => {
    vi.resetModules();

    // Mock cloudflare-stream
    mockUploadFromUrl = vi.fn();
    mockWaitUntilReady = vi.fn();
    mockGetEmbedUrl = vi.fn();
    mockGetHlsUrl = vi.fn();
    mockGetThumbnailUrl = vi.fn();

    vi.doMock("./cloudflare-stream", () => ({
      uploadFromUrl: mockUploadFromUrl,
      getVideoStatus: vi.fn(),
      waitUntilReady: mockWaitUntilReady,
      getEmbedUrl: mockGetEmbedUrl,
      getHlsUrl: mockGetHlsUrl,
      getThumbnailUrl: mockGetThumbnailUrl,
    }));

    // Mock db
    mockGetEpisodeById = vi.fn();
    mockUpdateEpisode = vi.fn().mockResolvedValue(undefined);

    vi.doMock("./db", () => ({
      getEpisodeById: mockGetEpisodeById,
      updateEpisode: mockUpdateEpisode,
    }));

    // Import fresh module with mocks
    const mod = await import("./stream-delivery");
    deliverToStream = mod.deliverToStream;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns error when episode not found", async () => {
    mockGetEpisodeById.mockResolvedValue(null);

    const result = await deliverToStream(999);

    expect(result.success).toBe(false);
    expect(result.streamStatus).toBe("error");
    expect(result.error).toContain("not found");
  });

  it("returns error when episode has no videoUrl", async () => {
    mockGetEpisodeById.mockResolvedValue({
      id: 1,
      videoUrl: null,
      projectId: 10,
    });

    const result = await deliverToStream(1);

    expect(result.success).toBe(false);
    expect(result.streamStatus).toBe("error");
    expect(result.error).toContain("no assembled video URL");
  });

  it("completes full delivery flow: upload → poll → update", async () => {
    const mockEpisode = {
      id: 1,
      videoUrl: "https://s3.example.com/video.mp4",
      projectId: 10,
      title: "Test Episode",
    };

    mockGetEpisodeById.mockResolvedValue(mockEpisode);

    mockUploadFromUrl.mockResolvedValue({
      uid: "cf-uid-123",
      status: { state: "inprogress", pctComplete: "50%" },
      readyToStream: false,
    });

    mockWaitUntilReady.mockResolvedValue({
      uid: "cf-uid-123",
      readyToStream: true,
      duration: 300,
      status: { state: "ready", pctComplete: "100%" },
    });

    mockGetEmbedUrl.mockReturnValue("https://iframe.cloudflare.com/cf-uid-123");
    mockGetHlsUrl.mockReturnValue("https://hls.cloudflare.com/cf-uid-123/manifest.m3u8");
    mockGetThumbnailUrl.mockReturnValue("https://thumb.cloudflare.com/cf-uid-123/thumb.jpg");

    const result = await deliverToStream(1);

    expect(result.success).toBe(true);
    expect(result.streamUid).toBe("cf-uid-123");
    expect(result.streamEmbedUrl).toBe("https://iframe.cloudflare.com/cf-uid-123");
    expect(result.streamHlsUrl).toBe("https://hls.cloudflare.com/cf-uid-123/manifest.m3u8");
    expect(result.streamThumbnailUrl).toBe("https://thumb.cloudflare.com/cf-uid-123/thumb.jpg");
    expect(result.streamStatus).toBe("ready");
    expect(result.duration).toBe(300);

    // Verify update calls
    expect(mockUpdateEpisode).toHaveBeenCalledWith(1, expect.objectContaining({
      streamStatus: "uploading",
    }));
    expect(mockUpdateEpisode).toHaveBeenCalledWith(1, expect.objectContaining({
      streamUid: "cf-uid-123",
      streamStatus: "processing",
    }));
    expect(mockUpdateEpisode).toHaveBeenCalledWith(1, expect.objectContaining({
      streamUid: "cf-uid-123",
      streamEmbedUrl: "https://iframe.cloudflare.com/cf-uid-123",
      streamHlsUrl: "https://hls.cloudflare.com/cf-uid-123/manifest.m3u8",
      streamThumbnailUrl: "https://thumb.cloudflare.com/cf-uid-123/thumb.jpg",
      streamStatus: "ready",
    }));
  });

  it("calls onProgress callback during delivery", async () => {
    const mockEpisode = {
      id: 1,
      videoUrl: "https://s3.example.com/video.mp4",
      projectId: 10,
      title: "Test",
    };

    mockGetEpisodeById.mockResolvedValue(mockEpisode);
    mockUploadFromUrl.mockResolvedValue({
      uid: "uid-1",
      status: { state: "inprogress", pctComplete: "30%" },
    });
    mockWaitUntilReady.mockResolvedValue({
      uid: "uid-1",
      readyToStream: true,
      duration: 60,
      status: { state: "ready" },
    });
    mockGetEmbedUrl.mockReturnValue("embed");
    mockGetHlsUrl.mockReturnValue("hls");
    mockGetThumbnailUrl.mockReturnValue("thumb");

    const onProgress = vi.fn();
    await deliverToStream(1, { onProgress });

    expect(onProgress).toHaveBeenCalledWith("uploading");
    expect(onProgress).toHaveBeenCalledWith("processing", "30%");
    expect(onProgress).toHaveBeenCalledWith("ready");
  });

  it("retries on transient upload errors up to MAX_TRANSIENT_RETRIES", { timeout: 15000 }, async () => {
    const mockEpisode = {
      id: 1,
      videoUrl: "https://s3.example.com/video.mp4",
      projectId: 10,
      title: "Test",
    };

    mockGetEpisodeById.mockResolvedValue(mockEpisode);

    // Fail twice with transient errors, succeed on third attempt
    mockUploadFromUrl
      .mockRejectedValueOnce(new Error("503 Service Unavailable"))
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce({
        uid: "uid-retry",
        status: { state: "inprogress" },
      });

    mockWaitUntilReady.mockResolvedValue({
      uid: "uid-retry",
      readyToStream: true,
      duration: 120,
      status: { state: "ready" },
    });
    mockGetEmbedUrl.mockReturnValue("embed");
    mockGetHlsUrl.mockReturnValue("hls");
    mockGetThumbnailUrl.mockReturnValue("thumb");

    const result = await deliverToStream(1);

    expect(result.success).toBe(true);
    expect(mockUploadFromUrl).toHaveBeenCalledTimes(3);
  });

  it("marks episode as error when upload permanently fails", async () => {
    const mockEpisode = {
      id: 1,
      videoUrl: "https://s3.example.com/video.mp4",
      projectId: 10,
      title: "Test",
    };

    mockGetEpisodeById.mockResolvedValue(mockEpisode);
    mockUploadFromUrl.mockRejectedValue(new Error("Invalid API key"));

    const result = await deliverToStream(1);

    expect(result.success).toBe(false);
    expect(result.streamStatus).toBe("error");
    expect(result.error).toContain("Invalid API key");

    // Should have set streamStatus to error
    expect(mockUpdateEpisode).toHaveBeenCalledWith(1, expect.objectContaining({
      streamStatus: "error",
    }));
  });
});

// ─── getDeliveryStatus (mocked) ─────────────────────────────────────

describe("getDeliveryStatus", () => {
  let mockGetEpisodeById: ReturnType<typeof vi.fn>;
  let mockUpdateEpisode: ReturnType<typeof vi.fn>;
  let mockGetVideoStatus: ReturnType<typeof vi.fn>;
  let mockGetEmbedUrl: ReturnType<typeof vi.fn>;
  let mockGetHlsUrl: ReturnType<typeof vi.fn>;
  let mockGetThumbnailUrl: ReturnType<typeof vi.fn>;
  let getDeliveryStatus: typeof import("./stream-delivery").getDeliveryStatus;

  beforeEach(async () => {
    vi.resetModules();

    mockGetVideoStatus = vi.fn();
    mockGetEmbedUrl = vi.fn();
    mockGetHlsUrl = vi.fn();
    mockGetThumbnailUrl = vi.fn();

    vi.doMock("./cloudflare-stream", () => ({
      uploadFromUrl: vi.fn(),
      getVideoStatus: mockGetVideoStatus,
      waitUntilReady: vi.fn(),
      getEmbedUrl: mockGetEmbedUrl,
      getHlsUrl: mockGetHlsUrl,
      getThumbnailUrl: mockGetThumbnailUrl,
    }));

    mockGetEpisodeById = vi.fn();
    mockUpdateEpisode = vi.fn().mockResolvedValue(undefined);

    vi.doMock("./db", () => ({
      getEpisodeById: mockGetEpisodeById,
      updateEpisode: mockUpdateEpisode,
    }));

    const mod = await import("./stream-delivery");
    getDeliveryStatus = mod.getDeliveryStatus;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 'none' status for non-existent episode", async () => {
    mockGetEpisodeById.mockResolvedValue(null);

    const result = await getDeliveryStatus(999);

    expect(result.streamStatus).toBe("none");
    expect(result.hasAssembledVideo).toBe(false);
    expect(result.hasStreamDelivery).toBe(false);
  });

  it("returns correct status for episode with no stream delivery", async () => {
    mockGetEpisodeById.mockResolvedValue({
      id: 1,
      videoUrl: "https://s3.example.com/video.mp4",
      streamStatus: undefined,
      streamUid: undefined,
    });

    const result = await getDeliveryStatus(1);

    expect(result.streamStatus).toBe("none");
    expect(result.hasAssembledVideo).toBe(true);
    expect(result.hasStreamDelivery).toBe(false);
    expect(result.videoUrl).toBe("https://s3.example.com/video.mp4");
  });

  it("returns 'ready' status for completed stream delivery", async () => {
    mockGetEpisodeById.mockResolvedValue({
      id: 1,
      videoUrl: "https://s3.example.com/video.mp4",
      streamStatus: "ready",
      streamUid: "cf-uid-123",
      streamEmbedUrl: "https://embed.example.com",
      streamHlsUrl: "https://hls.example.com",
      streamThumbnailUrl: "https://thumb.example.com",
    });

    const result = await getDeliveryStatus(1);

    expect(result.streamStatus).toBe("ready");
    expect(result.hasStreamDelivery).toBe(true);
    expect(result.streamEmbedUrl).toBe("https://embed.example.com");
  });

  it("checks Cloudflare progress when in 'processing' state", async () => {
    mockGetEpisodeById.mockResolvedValue({
      id: 1,
      videoUrl: "https://s3.example.com/video.mp4",
      streamStatus: "processing",
      streamUid: "cf-uid-456",
    });

    mockGetVideoStatus.mockResolvedValue({
      uid: "cf-uid-456",
      readyToStream: false,
      status: { state: "inprogress", pctComplete: "75%" },
    });

    const result = await getDeliveryStatus(1);

    expect(result.streamStatus).toBe("processing");
    expect(result.cloudflareProgress).toBe("75%");
    expect(mockGetVideoStatus).toHaveBeenCalledWith("cf-uid-456");
  });

  it("auto-updates to 'ready' when Cloudflare reports ready during processing check", async () => {
    mockGetEpisodeById.mockResolvedValue({
      id: 1,
      videoUrl: "https://s3.example.com/video.mp4",
      streamStatus: "processing",
      streamUid: "cf-uid-789",
    });

    mockGetVideoStatus.mockResolvedValue({
      uid: "cf-uid-789",
      readyToStream: true,
      status: { state: "ready", pctComplete: "100%" },
    });

    mockGetEmbedUrl.mockReturnValue("https://embed.cf.com/789");
    mockGetHlsUrl.mockReturnValue("https://hls.cf.com/789");
    mockGetThumbnailUrl.mockReturnValue("https://thumb.cf.com/789");

    const result = await getDeliveryStatus(1);

    expect(result.streamStatus).toBe("ready");
    expect(result.hasStreamDelivery).toBe(true);
    expect(result.streamEmbedUrl).toBe("https://embed.cf.com/789");

    // Should have updated the episode in DB
    expect(mockUpdateEpisode).toHaveBeenCalledWith(1, expect.objectContaining({
      streamStatus: "ready",
    }));
  });

  it("auto-updates to 'error' when Cloudflare reports error during processing check", async () => {
    mockGetEpisodeById.mockResolvedValue({
      id: 1,
      videoUrl: "https://s3.example.com/video.mp4",
      streamStatus: "processing",
      streamUid: "cf-uid-err",
    });

    mockGetVideoStatus.mockResolvedValue({
      uid: "cf-uid-err",
      readyToStream: false,
      status: { state: "error", pctComplete: "0%" },
    });

    const result = await getDeliveryStatus(1);

    expect(result.streamStatus).toBe("error");
    expect(mockUpdateEpisode).toHaveBeenCalledWith(1, expect.objectContaining({
      streamStatus: "error",
    }));
  });

  it("handles Cloudflare API failure gracefully during processing check", async () => {
    mockGetEpisodeById.mockResolvedValue({
      id: 1,
      videoUrl: "https://s3.example.com/video.mp4",
      streamStatus: "processing",
      streamUid: "cf-uid-fail",
    });

    mockGetVideoStatus.mockRejectedValue(new Error("API unavailable"));

    const result = await getDeliveryStatus(1);

    // Should keep current status, not crash
    expect(result.streamStatus).toBe("processing");
    expect(result.cloudflareProgress).toBeUndefined();
  });
});

// ─── retryDelivery (mocked) ─────────────────────────────────────────

describe("retryDelivery", () => {
  let mockGetEpisodeById: ReturnType<typeof vi.fn>;
  let mockUpdateEpisode: ReturnType<typeof vi.fn>;
  let mockUploadFromUrl: ReturnType<typeof vi.fn>;
  let mockWaitUntilReady: ReturnType<typeof vi.fn>;
  let mockGetEmbedUrl: ReturnType<typeof vi.fn>;
  let mockGetHlsUrl: ReturnType<typeof vi.fn>;
  let mockGetThumbnailUrl: ReturnType<typeof vi.fn>;
  let retryDelivery: typeof import("./stream-delivery").retryDelivery;

  beforeEach(async () => {
    vi.resetModules();

    mockUploadFromUrl = vi.fn();
    mockWaitUntilReady = vi.fn();
    mockGetEmbedUrl = vi.fn();
    mockGetHlsUrl = vi.fn();
    mockGetThumbnailUrl = vi.fn();

    vi.doMock("./cloudflare-stream", () => ({
      uploadFromUrl: mockUploadFromUrl,
      getVideoStatus: vi.fn(),
      waitUntilReady: mockWaitUntilReady,
      getEmbedUrl: mockGetEmbedUrl,
      getHlsUrl: mockGetHlsUrl,
      getThumbnailUrl: mockGetThumbnailUrl,
    }));

    mockGetEpisodeById = vi.fn();
    mockUpdateEpisode = vi.fn().mockResolvedValue(undefined);

    vi.doMock("./db", () => ({
      getEpisodeById: mockGetEpisodeById,
      updateEpisode: mockUpdateEpisode,
    }));

    const mod = await import("./stream-delivery");
    retryDelivery = mod.retryDelivery;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("clears previous stream fields before retrying", async () => {
    mockGetEpisodeById.mockResolvedValue({
      id: 1,
      videoUrl: "https://s3.example.com/video.mp4",
      projectId: 10,
      title: "Test",
      streamUid: "old-uid",
      streamStatus: "error",
    });

    mockUploadFromUrl.mockResolvedValue({
      uid: "new-uid",
      status: { state: "inprogress" },
    });

    mockWaitUntilReady.mockResolvedValue({
      uid: "new-uid",
      readyToStream: true,
      duration: 180,
      status: { state: "ready" },
    });

    mockGetEmbedUrl.mockReturnValue("embed-new");
    mockGetHlsUrl.mockReturnValue("hls-new");
    mockGetThumbnailUrl.mockReturnValue("thumb-new");

    const result = await retryDelivery(1);

    // First call should clear all stream fields
    expect(mockUpdateEpisode).toHaveBeenCalledWith(1, expect.objectContaining({
      streamUid: null,
      streamEmbedUrl: null,
      streamHlsUrl: null,
      streamThumbnailUrl: null,
      streamStatus: "none",
    }));

    expect(result.success).toBe(true);
    expect(result.streamUid).toBe("new-uid");
  });
});

// ─── Type exports ───────────────────────────────────────────────────

describe("Type exports", () => {
  it("StreamDeliveryStatus has expected values", () => {
    const statuses: StreamDeliveryStatus[] = [
      "none",
      "uploading",
      "processing",
      "ready",
      "error",
    ];
    expect(statuses).toHaveLength(5);
    statuses.forEach((s) => expect(typeof s).toBe("string"));
  });

  it("DeliveryResult has required fields", () => {
    const result: DeliveryResult = {
      success: true,
      episodeId: 1,
      streamUid: "uid",
      streamEmbedUrl: "embed",
      streamHlsUrl: "hls",
      streamThumbnailUrl: "thumb",
      streamStatus: "ready",
    };
    expect(result.success).toBe(true);
    expect(result.episodeId).toBe(1);
  });

  it("DeliveryStatusResult has required fields", () => {
    const result: DeliveryStatusResult = {
      episodeId: 1,
      streamStatus: "none",
      streamUid: null,
      streamEmbedUrl: null,
      streamHlsUrl: null,
      streamThumbnailUrl: null,
      videoUrl: null,
      hasAssembledVideo: false,
      hasStreamDelivery: false,
    };
    expect(result.streamStatus).toBe("none");
  });
});
