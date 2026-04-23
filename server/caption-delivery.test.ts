/**
 * Tests for srt-to-vtt.ts converter and caption-delivery.ts service
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── SRT-to-VTT converter tests ─────────────────────────────────────

import {
  convertSrtToVtt,
  isValidVtt,
  srtTimestampToVtt,
} from "./srt-to-vtt";

describe("srtTimestampToVtt", () => {
  it("converts comma to dot in timestamps", () => {
    expect(srtTimestampToVtt("00:01:23,456")).toBe("00:01:23.456");
  });

  it("handles multiple commas", () => {
    expect(srtTimestampToVtt("00:01:23,456 --> 00:01:25,789")).toBe(
      "00:01:23.456 --> 00:01:25.789",
    );
  });

  it("passes through timestamps without commas", () => {
    expect(srtTimestampToVtt("00:01:23.456")).toBe("00:01:23.456");
  });
});

describe("isValidVtt", () => {
  it("returns true for valid VTT content", () => {
    expect(isValidVtt("WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\nHello")).toBe(true);
  });

  it("returns false for empty string", () => {
    expect(isValidVtt("")).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(isValidVtt(null as any)).toBe(false);
    expect(isValidVtt(undefined as any)).toBe(false);
  });

  it("returns false for SRT content (no WEBVTT header)", () => {
    expect(isValidVtt("1\n00:00:01,000 --> 00:00:04,000\nHello")).toBe(false);
  });

  it("returns false for WEBVTT header without timestamps", () => {
    expect(isValidVtt("WEBVTT\n\nJust some text")).toBe(false);
  });
});

describe("convertSrtToVtt", () => {
  it("converts a basic SRT to VTT", () => {
    const srt = `1
00:00:01,000 --> 00:00:04,000
Hello world

2
00:00:05,000 --> 00:00:08,000
Second subtitle`;

    const result = convertSrtToVtt(srt);
    expect(result.success).toBe(true);
    expect(result.cueCount).toBe(2);
    expect(result.vttContent).toContain("WEBVTT");
    expect(result.vttContent).toContain("00:00:01.000 --> 00:00:04.000");
    expect(result.vttContent).toContain("Hello world");
    expect(result.vttContent).toContain("00:00:05.000 --> 00:00:08.000");
    expect(result.vttContent).toContain("Second subtitle");
    expect(result.vttContent).not.toContain(",");
  });

  it("strips BOM from SRT content", () => {
    const srt = `\uFEFF1
00:00:01,000 --> 00:00:04,000
Hello`;

    const result = convertSrtToVtt(srt);
    expect(result.success).toBe(true);
    expect(result.vttContent?.startsWith("WEBVTT")).toBe(true);
    expect(result.vttContent).not.toContain("\uFEFF");
  });

  it("handles Windows line endings (\\r\\n)", () => {
    const srt = "1\r\n00:00:01,000 --> 00:00:04,000\r\nHello\r\n\r\n2\r\n00:00:05,000 --> 00:00:08,000\r\nWorld";
    const result = convertSrtToVtt(srt);
    expect(result.success).toBe(true);
    expect(result.cueCount).toBe(2);
  });

  it("handles old Mac line endings (\\r)", () => {
    const srt = "1\r00:00:01,000 --> 00:00:04,000\rHello\r\r2\r00:00:05,000 --> 00:00:08,000\rWorld";
    const result = convertSrtToVtt(srt);
    expect(result.success).toBe(true);
    expect(result.cueCount).toBe(2);
  });

  it("preserves cue indices", () => {
    const srt = `1
00:00:01,000 --> 00:00:04,000
Hello`;

    const result = convertSrtToVtt(srt);
    expect(result.success).toBe(true);
    expect(result.vttContent).toContain("1\n00:00:01.000");
  });

  it("handles multi-line subtitle text", () => {
    const srt = `1
00:00:01,000 --> 00:00:04,000
Line one
Line two`;

    const result = convertSrtToVtt(srt);
    expect(result.success).toBe(true);
    expect(result.vttContent).toContain("Line one\nLine two");
  });

  it("handles SRT with HTML-like formatting tags", () => {
    const srt = `1
00:00:01,000 --> 00:00:04,000
<i>Italic text</i>`;

    const result = convertSrtToVtt(srt);
    expect(result.success).toBe(true);
    expect(result.vttContent).toContain("<i>Italic text</i>");
  });

  it("returns error for empty input", () => {
    const result = convertSrtToVtt("");
    expect(result.success).toBe(false);
    expect(result.cueCount).toBe(0);
    expect(result.error).toContain("Empty SRT content");
  });

  it("returns error for whitespace-only input", () => {
    const result = convertSrtToVtt("   \n\n  ");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Empty SRT content");
  });

  it("returns error for content with no valid cues", () => {
    const result = convertSrtToVtt("Just some random text\nwithout any timestamps");
    expect(result.success).toBe(false);
    expect(result.error).toContain("No valid subtitle cues");
  });

  it("skips blocks without timestamp arrows", () => {
    const srt = `Some header text

1
00:00:01,000 --> 00:00:04,000
Hello`;

    const result = convertSrtToVtt(srt);
    expect(result.success).toBe(true);
    expect(result.cueCount).toBe(1);
  });

  it("skips blocks with timestamp but no text", () => {
    const srt = `1
00:00:01,000 --> 00:00:04,000


2
00:00:05,000 --> 00:00:08,000
Has text`;

    const result = convertSrtToVtt(srt);
    expect(result.success).toBe(true);
    // First cue has no text lines, so it should be skipped
    expect(result.cueCount).toBe(1);
    expect(result.vttContent).toContain("Has text");
  });

  it("handles many cues", () => {
    const cues = Array.from({ length: 50 }, (_, i) => {
      const s = i * 3;
      const e = s + 2;
      return `${i + 1}\n00:00:${String(s).padStart(2, "0")},000 --> 00:00:${String(e).padStart(2, "0")},000\nCue ${i + 1}`;
    });
    const srt = cues.join("\n\n");
    const result = convertSrtToVtt(srt);
    expect(result.success).toBe(true);
    expect(result.cueCount).toBe(50);
  });

  it("handles SRT without cue numbers", () => {
    const srt = `00:00:01,000 --> 00:00:04,000
Hello

00:00:05,000 --> 00:00:08,000
World`;

    const result = convertSrtToVtt(srt);
    expect(result.success).toBe(true);
    expect(result.cueCount).toBe(2);
  });

  it("handles character name prefixes in subtitle text", () => {
    const srt = `1
00:00:01,000 --> 00:00:04,000
[Naruto]: Believe it!`;

    const result = convertSrtToVtt(srt);
    expect(result.success).toBe(true);
    expect(result.vttContent).toContain("[Naruto]: Believe it!");
  });
});

// ─── Caption Delivery Service tests ─────────────────────────────────

// Mock dependencies
vi.mock("./db", () => ({
  getEpisodeById: vi.fn(),
  updateEpisode: vi.fn(),
}));

vi.mock("./cloudflare-stream", () => ({
  uploadCaption: vi.fn(),
  listCaptions: vi.fn(),
  deleteCaption: vi.fn(),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn(),
}));

vi.mock("nanoid", () => ({
  nanoid: vi.fn(() => "abc12345"),
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import {
  deliverCaptions,
  getCaptionStatus,
  retryCaptionDelivery,
  deleteCaptionFromStream,
  triggerCaptionDeliveryAsync,
  DEFAULT_CAPTION_LANGUAGE,
  MAX_SRT_SIZE_BYTES,
} from "./caption-delivery";

import { getEpisodeById, updateEpisode } from "./db";
import { uploadCaption, listCaptions, deleteCaption } from "./cloudflare-stream";
import { storagePut } from "./storage";

const mockGetEpisodeById = vi.mocked(getEpisodeById);
const mockUpdateEpisode = vi.mocked(updateEpisode);
const mockUploadCaption = vi.mocked(uploadCaption);
const mockDeleteCaption = vi.mocked(deleteCaption);
const mockStoragePut = vi.mocked(storagePut);

const VALID_SRT = `1
00:00:01,000 --> 00:00:04,000
Hello world

2
00:00:05,000 --> 00:00:08,000
Second line`;

function makeEpisode(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    srtUrl: "https://s3.example.com/subs/ep-1.srt",
    streamUid: "stream-uid-123",
    streamStatus: "ready",
    vttUrl: null,
    captionStatus: "none",
    captionLanguage: "en",
    ...overrides,
  };
}

describe("deliverCaptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoragePut.mockResolvedValue({ key: "captions/ep-1-en-abc12345.vtt", url: "https://s3.example.com/captions/ep-1-en-abc12345.vtt" });
    mockUploadCaption.mockResolvedValue(undefined);
    mockUpdateEpisode.mockResolvedValue(undefined as any);
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(VALID_SRT),
    });
  });

  it("returns error when episode not found", async () => {
    mockGetEpisodeById.mockResolvedValue(null as any);
    const result = await deliverCaptions(999);
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
    expect(result.captionStatus).toBe("error");
  });

  it("returns error when episode has no SRT", async () => {
    mockGetEpisodeById.mockResolvedValue(makeEpisode({ srtUrl: null }) as any);
    const result = await deliverCaptions(1);
    expect(result.success).toBe(false);
    expect(result.error).toContain("no SRT subtitles");
  });

  it("returns error when episode has no stream UID", async () => {
    mockGetEpisodeById.mockResolvedValue(makeEpisode({ streamUid: null }) as any);
    const result = await deliverCaptions(1);
    expect(result.success).toBe(false);
    expect(result.error).toContain("no Cloudflare Stream video");
  });

  it("returns error when stream is not ready", async () => {
    mockGetEpisodeById.mockResolvedValue(makeEpisode({ streamStatus: "processing" }) as any);
    const result = await deliverCaptions(1);
    expect(result.success).toBe(false);
    expect(result.error).toContain("not ready");
  });

  it("successfully delivers captions through full pipeline", async () => {
    mockGetEpisodeById.mockResolvedValue(makeEpisode() as any);

    const progressSteps: string[] = [];
    const result = await deliverCaptions(1, {
      onProgress: (status) => progressSteps.push(status),
    });

    expect(result.success).toBe(true);
    expect(result.cueCount).toBe(2);
    expect(result.captionStatus).toBe("ready");
    expect(result.vttUrl).toBe("https://s3.example.com/captions/ep-1-en-abc12345.vtt");
    expect(result.language).toBe("en");

    // Verify pipeline steps
    expect(mockFetch).toHaveBeenCalledWith("https://s3.example.com/subs/ep-1.srt");
    expect(mockStoragePut).toHaveBeenCalledWith(
      "captions/ep-1-en-abc12345.vtt",
      expect.any(Buffer),
      "text/vtt",
    );
    expect(mockUploadCaption).toHaveBeenCalledWith(
      "stream-uid-123",
      "en",
      expect.stringContaining("WEBVTT"),
    );

    // Verify status updates
    expect(mockUpdateEpisode).toHaveBeenCalledWith(1, expect.objectContaining({ captionStatus: "converting" }));
    expect(mockUpdateEpisode).toHaveBeenCalledWith(1, expect.objectContaining({ captionStatus: "uploading" }));
    expect(mockUpdateEpisode).toHaveBeenCalledWith(1, expect.objectContaining({
      captionStatus: "ready",
      vttUrl: "https://s3.example.com/captions/ep-1-en-abc12345.vtt",
      captionLanguage: "en",
    }));

    // Verify progress callbacks
    expect(progressSteps).toEqual(["converting", "uploading", "ready"]);
  });

  it("uses custom language when provided", async () => {
    mockGetEpisodeById.mockResolvedValue(makeEpisode() as any);
    const result = await deliverCaptions(1, { language: "ja" });
    expect(result.success).toBe(true);
    expect(result.language).toBe("ja");
    expect(mockUploadCaption).toHaveBeenCalledWith("stream-uid-123", "ja", expect.any(String));
  });

  it("handles SRT fetch failure", async () => {
    mockGetEpisodeById.mockResolvedValue(makeEpisode() as any);
    mockFetch.mockResolvedValue({ ok: false, status: 404, text: () => Promise.resolve("") });

    const result = await deliverCaptions(1);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to fetch SRT");
    expect(mockUpdateEpisode).toHaveBeenCalledWith(1, expect.objectContaining({ captionStatus: "error" }));
  });

  it("handles empty SRT content", async () => {
    mockGetEpisodeById.mockResolvedValue(makeEpisode() as any);
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve("") });

    const result = await deliverCaptions(1);
    expect(result.success).toBe(false);
    expect(result.error).toContain("empty");
  });

  it("handles SRT too large", async () => {
    mockGetEpisodeById.mockResolvedValue(makeEpisode() as any);
    const hugeSrt = "x".repeat(MAX_SRT_SIZE_BYTES + 1);
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve(hugeSrt) });

    const result = await deliverCaptions(1);
    expect(result.success).toBe(false);
    expect(result.error).toContain("too large");
  });

  it("handles Cloudflare upload failure", async () => {
    mockGetEpisodeById.mockResolvedValue(makeEpisode() as any);
    mockUploadCaption.mockRejectedValue(new Error("Cloudflare API error"));

    const result = await deliverCaptions(1);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Cloudflare API error");
    expect(mockUpdateEpisode).toHaveBeenCalledWith(1, expect.objectContaining({ captionStatus: "error" }));
  });

  it("handles S3 upload failure", async () => {
    mockGetEpisodeById.mockResolvedValue(makeEpisode() as any);
    mockStoragePut.mockRejectedValue(new Error("S3 upload failed"));

    const result = await deliverCaptions(1);
    expect(result.success).toBe(false);
    expect(result.error).toContain("S3 upload failed");
  });
});

describe("getCaptionStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns default status when episode not found", async () => {
    mockGetEpisodeById.mockResolvedValue(null as any);
    const status = await getCaptionStatus(999);
    expect(status.captionStatus).toBe("none");
    expect(status.hasSrt).toBe(false);
    expect(status.hasVtt).toBe(false);
    expect(status.hasStreamCaption).toBe(false);
  });

  it("returns correct status for episode with no captions", async () => {
    mockGetEpisodeById.mockResolvedValue(makeEpisode({ srtUrl: null, vttUrl: null }) as any);
    const status = await getCaptionStatus(1);
    expect(status.hasSrt).toBe(false);
    expect(status.hasVtt).toBe(false);
    expect(status.captionStatus).toBe("none");
  });

  it("returns correct status for episode with SRT only", async () => {
    mockGetEpisodeById.mockResolvedValue(makeEpisode({ captionStatus: "none" }) as any);
    const status = await getCaptionStatus(1);
    expect(status.hasSrt).toBe(true);
    expect(status.hasVtt).toBe(false);
    expect(status.hasStreamCaption).toBe(false);
  });

  it("returns correct status for fully delivered captions", async () => {
    mockGetEpisodeById.mockResolvedValue(
      makeEpisode({
        vttUrl: "https://s3.example.com/captions/ep-1.vtt",
        captionStatus: "ready",
        captionLanguage: "en",
      }) as any,
    );
    const status = await getCaptionStatus(1);
    expect(status.hasSrt).toBe(true);
    expect(status.hasVtt).toBe(true);
    expect(status.hasStreamCaption).toBe(true);
    expect(status.captionLanguage).toBe("en");
    expect(status.vttUrl).toBe("https://s3.example.com/captions/ep-1.vtt");
  });

  it("returns error status correctly", async () => {
    mockGetEpisodeById.mockResolvedValue(makeEpisode({ captionStatus: "error" }) as any);
    const status = await getCaptionStatus(1);
    expect(status.captionStatus).toBe("error");
    expect(status.hasStreamCaption).toBe(false);
  });
});

describe("retryCaptionDelivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateEpisode.mockResolvedValue(undefined as any);
    mockGetEpisodeById.mockResolvedValue(makeEpisode() as any);
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve(VALID_SRT) });
    mockStoragePut.mockResolvedValue({ key: "captions/ep-1-en-abc12345.vtt", url: "https://s3.example.com/captions/ep-1-en-abc12345.vtt" });
    mockUploadCaption.mockResolvedValue(undefined);
  });

  it("clears previous caption fields before retrying", async () => {
    const result = await retryCaptionDelivery(1);
    expect(result.success).toBe(true);
    // First call should clear fields
    expect(mockUpdateEpisode).toHaveBeenCalledWith(1, expect.objectContaining({
      vttUrl: null,
      captionStatus: "none",
    }));
  });

  it("runs full delivery pipeline after clearing", async () => {
    const result = await retryCaptionDelivery(1);
    expect(result.success).toBe(true);
    expect(result.captionStatus).toBe("ready");
    expect(mockFetch).toHaveBeenCalled();
    expect(mockUploadCaption).toHaveBeenCalled();
  });
});

describe("deleteCaptionFromStream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateEpisode.mockResolvedValue(undefined as any);
    mockDeleteCaption.mockResolvedValue(undefined);
  });

  it("returns error when episode not found", async () => {
    mockGetEpisodeById.mockResolvedValue(null as any);
    const result = await deleteCaptionFromStream(999);
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("returns error when episode has no stream UID", async () => {
    mockGetEpisodeById.mockResolvedValue(makeEpisode({ streamUid: null }) as any);
    const result = await deleteCaptionFromStream(1);
    expect(result.success).toBe(false);
    expect(result.error).toContain("no stream UID");
  });

  it("deletes caption and updates episode status", async () => {
    mockGetEpisodeById.mockResolvedValue(makeEpisode({ captionLanguage: "en" }) as any);
    const result = await deleteCaptionFromStream(1);
    expect(result.success).toBe(true);
    expect(mockDeleteCaption).toHaveBeenCalledWith("stream-uid-123", "en");
    expect(mockUpdateEpisode).toHaveBeenCalledWith(1, expect.objectContaining({ captionStatus: "none" }));
  });

  it("uses custom language when provided", async () => {
    mockGetEpisodeById.mockResolvedValue(makeEpisode() as any);
    const result = await deleteCaptionFromStream(1, "ja");
    expect(result.success).toBe(true);
    expect(mockDeleteCaption).toHaveBeenCalledWith("stream-uid-123", "ja");
  });

  it("handles Cloudflare delete failure", async () => {
    mockGetEpisodeById.mockResolvedValue(makeEpisode() as any);
    mockDeleteCaption.mockRejectedValue(new Error("Cloudflare API error"));
    const result = await deleteCaptionFromStream(1);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Cloudflare API error");
  });
});

describe("triggerCaptionDeliveryAsync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fires and forgets without throwing", () => {
    mockGetEpisodeById.mockResolvedValue(makeEpisode() as any);
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve(VALID_SRT) });
    mockStoragePut.mockResolvedValue({ key: "k", url: "u" });
    mockUploadCaption.mockResolvedValue(undefined);
    mockUpdateEpisode.mockResolvedValue(undefined as any);

    // Should not throw
    expect(() => triggerCaptionDeliveryAsync(1)).not.toThrow();
  });

  it("catches errors without propagating", () => {
    mockGetEpisodeById.mockRejectedValue(new Error("DB error"));

    // Should not throw even if internal call fails
    expect(() => triggerCaptionDeliveryAsync(1)).not.toThrow();
  });
});

describe("DEFAULT_CAPTION_LANGUAGE", () => {
  it("is set to English", () => {
    expect(DEFAULT_CAPTION_LANGUAGE).toBe("en");
  });
});

describe("MAX_SRT_SIZE_BYTES", () => {
  it("is 5 MB", () => {
    expect(MAX_SRT_SIZE_BYTES).toBe(5 * 1024 * 1024);
  });
});
