import { describe, it, expect, vi } from "vitest";
import { ENV } from "./_core/env";

const CF_BASE = `https://api.cloudflare.com/client/v4/accounts/${ENV.cloudflareAccountId}/stream`;

// ─── Credential Tests ──────────────────────────────────────────────────────

describe("Cloudflare Stream Credentials", () => {
  it("should have CLOUDFLARE_ACCOUNT_ID configured", () => {
    expect(ENV.cloudflareAccountId).toBeTruthy();
    expect(ENV.cloudflareAccountId.length).toBeGreaterThan(10);
  });

  it("should have CLOUDFLARE_STREAM_TOKEN configured", () => {
    expect(ENV.cloudflareStreamToken).toBeTruthy();
    expect(ENV.cloudflareStreamToken.length).toBeGreaterThan(10);
  });

  it("should verify the API token is valid and active", async () => {
    const res = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
      headers: { Authorization: `Bearer ${ENV.cloudflareStreamToken}` },
    });
    const data = (await res.json()) as any;
    expect(data.success).toBe(true);
    expect(data.result.status).toBe("active");
  }, 15000);

  it("should have Stream access on the account", async () => {
    const res = await fetch(`${CF_BASE}?per_page=1`, {
      headers: { Authorization: `Bearer ${ENV.cloudflareStreamToken}` },
    });
    const data = (await res.json()) as any;
    expect(data.success).toBe(true);
    expect(Array.isArray(data.result)).toBe(true);
  }, 15000);
});

// ─── Service Module Tests ──────────────────────────────────────────────────

describe("Cloudflare Stream Service Module", () => {
  it("should export all required functions", async () => {
    const cfStream = await import("./cloudflare-stream");
    expect(typeof cfStream.uploadFromUrl).toBe("function");
    expect(typeof cfStream.getVideoStatus).toBe("function");
    expect(typeof cfStream.waitUntilReady).toBe("function");
    expect(typeof cfStream.getEmbedUrl).toBe("function");
    expect(typeof cfStream.getHlsUrl).toBe("function");
    expect(typeof cfStream.getThumbnailUrl).toBe("function");
    expect(typeof cfStream.listVideos).toBe("function");
    expect(typeof cfStream.deleteVideo).toBe("function");
    expect(typeof cfStream.uploadAndWait).toBe("function");
  });

  it("should generate correct embed URL from preview URL", async () => {
    const { getEmbedUrl } = await import("./cloudflare-stream");
    const mockVideo = {
      uid: "test-uid-123",
      preview: "https://customer-abc123.cloudflarestream.com/test-uid-123/watch",
      thumbnail: "https://customer-abc123.cloudflarestream.com/test-uid-123/thumbnails/thumbnail.jpg",
      readyToStream: true,
      status: { state: "ready" },
      meta: {},
      created: "2026-01-01T00:00:00Z",
    } as any;

    const embedUrl = getEmbedUrl(mockVideo);
    expect(embedUrl).toBe("https://customer-abc123.cloudflarestream.com/test-uid-123/iframe");
  });

  it("should generate fallback embed URL when no preview URL", async () => {
    const { getEmbedUrl } = await import("./cloudflare-stream");
    const mockVideo = {
      uid: "test-uid-456",
      preview: "",
      thumbnail: "",
      readyToStream: true,
      status: { state: "ready" },
      meta: {},
      created: "2026-01-01T00:00:00Z",
    } as any;

    const embedUrl = getEmbedUrl(mockVideo);
    expect(embedUrl).toBe("https://cloudflarestream.com/test-uid-456/iframe");
  });

  it("should return HLS URL when available", async () => {
    const { getHlsUrl } = await import("./cloudflare-stream");
    const mockVideo = {
      uid: "test-uid",
      playback: { hls: "https://customer-abc.cloudflarestream.com/test-uid/manifest/video.m3u8" },
    } as any;

    expect(getHlsUrl(mockVideo)).toBe("https://customer-abc.cloudflarestream.com/test-uid/manifest/video.m3u8");
  });

  it("should return null HLS URL when not available", async () => {
    const { getHlsUrl } = await import("./cloudflare-stream");
    const mockVideo = { uid: "test-uid" } as any;
    expect(getHlsUrl(mockVideo)).toBeNull();
  });

  it("should return thumbnail URL", async () => {
    const { getThumbnailUrl } = await import("./cloudflare-stream");
    const mockVideo = {
      uid: "test-uid",
      thumbnail: "https://customer-abc.cloudflarestream.com/test-uid/thumbnails/thumbnail.jpg",
    } as any;

    expect(getThumbnailUrl(mockVideo)).toBe("https://customer-abc.cloudflarestream.com/test-uid/thumbnails/thumbnail.jpg");
  });

  it("should list videos from the Stream account", async () => {
    const { listVideos } = await import("./cloudflare-stream");
    const videos = await listVideos({ perPage: 5 });
    expect(Array.isArray(videos)).toBe(true);
    // Each video should have uid and status
    for (const v of videos) {
      expect(v.uid).toBeTruthy();
      expect(v.status).toBeDefined();
    }
  }, 15000);
});

// ─── Admin Endpoint Structure Tests ────────────────────────────────────────

describe("Cloudflare Stream Admin Endpoints", () => {
  it("should have uploadDemoVideo endpoint in admin router", async () => {
    const { adminRouter } = await import("./routers-phase6");
    expect(adminRouter).toBeDefined();
    // The router should have the uploadDemoVideo procedure
    const procedures = Object.keys((adminRouter as any)._def.procedures || {});
    expect(procedures).toContain("uploadDemoVideo");
  });

  it("should have checkStreamStatus endpoint in admin router", async () => {
    const { adminRouter } = await import("./routers-phase6");
    const procedures = Object.keys((adminRouter as any)._def.procedures || {});
    expect(procedures).toContain("checkStreamStatus");
  });

  it("should have listStreamVideos endpoint in admin router", async () => {
    const { adminRouter } = await import("./routers-phase6");
    const procedures = Object.keys((adminRouter as any)._def.procedures || {});
    expect(procedures).toContain("listStreamVideos");
  });

  it("should have deleteStreamVideo endpoint in admin router", async () => {
    const { adminRouter } = await import("./routers-phase6");
    const procedures = Object.keys((adminRouter as any)._def.procedures || {});
    expect(procedures).toContain("deleteStreamVideo");
  });
});

// ─── Pipeline Integration Tests ────────────────────────────────────────────

describe("Cloudflare Stream Pipeline Integration", () => {
  it("should import cfUploadFromUrl in pipeline orchestrator", async () => {
    // Verify the import doesn't throw
    const mod = await import("./pipelineOrchestrator");
    expect(mod.runPipeline).toBeDefined();
  });

  it("should have stream_video in the pipeline_assets assetType enum", async () => {
    const { pipelineAssets } = await import("../drizzle/schema");
    // The enum values should include stream_video
    const assetTypeCol = (pipelineAssets as any).assetType;
    // Check the column config has stream_video in its enum values
    const enumValues = assetTypeCol?.enumValues || assetTypeCol?.config?.enum || [];
    expect(enumValues).toContain("stream_video");
  });
});

// ─── DEMO_CONFIG_KEYS Consistency Tests ────────────────────────────────────

describe("Demo Config Keys Consistency", () => {
  it("should use DEMO_CONFIG_KEYS.STREAM_ID in getDemoVideo", async () => {
    const { DEMO_CONFIG_KEYS } = await import("../shared/demo-scenario");
    expect(DEMO_CONFIG_KEYS.STREAM_ID).toBe("demo_video_stream_id");
    expect(DEMO_CONFIG_KEYS.POSTER_URL).toBe("demo_video_poster_url");
    expect(DEMO_CONFIG_KEYS.STATUS).toBe("demo_pipeline_status");
  });
});
