import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db module
vi.mock("./db", () => ({
  getUserByOpenId: vi.fn(),
  upsertUser: vi.fn(),
  getProjectsByUserId: vi.fn().mockResolvedValue([]),
}));

// Mock the sdk module
vi.mock("./_core/sdk", () => ({
  sdk: {
    verifySession: vi.fn(),
    authenticateRequest: vi.fn(),
    createSessionToken: vi.fn(),
    exchangeCodeForToken: vi.fn(),
    getUserInfo: vi.fn(),
  },
}));

// Mock LLM, imageGeneration, notification, pipeline, storage
vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn() }));
vi.mock("./_core/imageGeneration", () => ({ generateImage: vi.fn() }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn() }));
vi.mock("./pipeline", () => ({ runMangaToAnimeJob: vi.fn() }));
vi.mock("./pipelineOrchestrator", () => ({ runPipeline: vi.fn() }));
vi.mock("./storage", () => ({ storagePut: vi.fn(), storageGet: vi.fn() }));
vi.mock("nanoid", () => ({ nanoid: () => "test-id-123" }));

import { appRouter } from "./routers";

describe("auth.clearSession", () => {
  const mockClearCookie = vi.fn();
  const mockRes = {
    clearCookie: mockClearCookie,
    cookie: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should clear the session cookie and return cleared: true", async () => {
    const caller = appRouter.createCaller({
      user: null,
      req: {
        headers: { cookie: "" },
        protocol: "https",
        get: (name: string) => name === "x-forwarded-proto" ? "https" : undefined,
      } as any,
      res: mockRes as any,
    });

    const result = await caller.auth.clearSession();

    expect(result).toEqual({ cleared: true });
    expect(mockClearCookie).toHaveBeenCalledWith(
      "app_session_id",
      expect.objectContaining({ maxAge: -1 })
    );
  });

  it("should work even when no session cookie exists", async () => {
    const caller = appRouter.createCaller({
      user: null,
      req: {
        headers: {},
        protocol: "http",
        get: (name: string) => undefined,
      } as any,
      res: mockRes as any,
    });

    const result = await caller.auth.clearSession();

    expect(result).toEqual({ cleared: true });
    expect(mockClearCookie).toHaveBeenCalled();
  });
});

describe("auth.me returns null for unauthenticated users", () => {
  it("should return null when no user in context", async () => {
    const caller = appRouter.createCaller({
      user: null,
      req: {
        headers: {},
        protocol: "https",
        get: () => undefined,
      } as any,
      res: {
        clearCookie: vi.fn(),
        cookie: vi.fn(),
      } as any,
    });

    const result = await caller.auth.me();
    expect(result).toBeNull();
  });
});

describe("trust proxy configuration", () => {
  it("should have trust proxy documented in index.ts", async () => {
    // Read the server index file to verify trust proxy is set
    const fs = await import("fs");
    const indexContent = fs.readFileSync(
      new URL("./_core/index.ts", import.meta.url).pathname.replace("file:", ""),
      "utf-8"
    );
    expect(indexContent).toContain("trust proxy");
  });
});
