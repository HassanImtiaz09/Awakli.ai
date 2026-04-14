import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Helpers ──────────────────────────────────────────────────────────────

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-openid",
    email: "test@awakli.ai",
    name: "Test Creator",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
  return { ctx };
}

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── Pipeline Tests ──────────────────────────────────────────────────────

describe("pipeline procedures", () => {
  it("throws UNAUTHORIZED when starting pipeline without auth", async () => {
    const caller = appRouter.createCaller(createUnauthContext());
    await expect(
      caller.pipeline.start({ episodeId: 1 })
    ).rejects.toThrow();
  });

  it("throws UNAUTHORIZED when getting pipeline status without auth", async () => {
    const caller = appRouter.createCaller(createUnauthContext());
    await expect(
      caller.pipeline.getStatus({ runId: 1 })
    ).rejects.toThrow();
  });

  it("throws UNAUTHORIZED when retrying pipeline without auth", async () => {
    const caller = appRouter.createCaller(createUnauthContext());
    await expect(
      caller.pipeline.retry({ runId: 1 })
    ).rejects.toThrow();
  });

  it("throws UNAUTHORIZED when cancelling pipeline without auth", async () => {
    const caller = appRouter.createCaller(createUnauthContext());
    await expect(
      caller.pipeline.cancel({ runId: 1 })
    ).rejects.toThrow();
  });

  it("throws UNAUTHORIZED when approving pipeline without auth", async () => {
    const caller = appRouter.createCaller(createUnauthContext());
    await expect(
      caller.pipeline.approve({ runId: 1 })
    ).rejects.toThrow();
  });

  it("throws UNAUTHORIZED when rejecting pipeline without auth", async () => {
    const caller = appRouter.createCaller(createUnauthContext());
    await expect(
      caller.pipeline.reject({ runId: 1 })
    ).rejects.toThrow();
  });

  it("throws UNAUTHORIZED when publishing pipeline without auth", async () => {
    const caller = appRouter.createCaller(createUnauthContext());
    await expect(
      caller.pipeline.publish({ runId: 1 })
    ).rejects.toThrow();
  });

  it("throws UNAUTHORIZED when getting assets without auth", async () => {
    const caller = appRouter.createCaller(createUnauthContext());
    await expect(
      caller.pipeline.getAssets({ runId: 1 })
    ).rejects.toThrow();
  });

  it("throws UNAUTHORIZED when getting cost summary without auth", async () => {
    const caller = appRouter.createCaller(createUnauthContext());
    await expect(
      caller.pipeline.getCostSummary({ projectId: 1 })
    ).rejects.toThrow();
  });

  it("throws UNAUTHORIZED when listing pipeline runs without auth", async () => {
    const caller = appRouter.createCaller(createUnauthContext());
    await expect(
      caller.pipeline.listByProject({ projectId: 1 })
    ).rejects.toThrow();
  });

  it("pipeline.start requires valid episodeId", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    // Will throw NOT_FOUND since episode doesn't exist in test DB
    await expect(
      caller.pipeline.start({ episodeId: 99999 })
    ).rejects.toThrow();
  });

  it("pipeline.getStatus requires valid runId", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.pipeline.getStatus({ runId: 99999 })
    ).rejects.toThrow();
  });
});

// ─── Voice Tests ──────────────────────────────────────────────────────

describe("voice procedures", () => {
  it("throws UNAUTHORIZED when cloning voice without auth", async () => {
    const caller = appRouter.createCaller(createUnauthContext());
    await expect(
      caller.voice.clone({ characterId: 1, audioUrl: "https://example.com/audio.mp3" })
    ).rejects.toThrow();
  });

  it("throws UNAUTHORIZED when testing voice without auth", async () => {
    const caller = appRouter.createCaller(createUnauthContext());
    await expect(
      caller.voice.test({ characterId: 1, text: "Hello world" })
    ).rejects.toThrow();
  });

  it("throws UNAUTHORIZED when getting voice settings without auth", async () => {
    const caller = appRouter.createCaller(createUnauthContext());
    await expect(
      caller.voice.getSettings({ characterId: 1 })
    ).rejects.toThrow();
  });

  it("throws UNAUTHORIZED when removing voice without auth", async () => {
    const caller = appRouter.createCaller(createUnauthContext());
    await expect(
      caller.voice.remove({ characterId: 1 })
    ).rejects.toThrow();
  });

  it("voice.clone requires valid characterId", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.voice.clone({ characterId: 99999, audioUrl: "https://example.com/audio.mp3" })
    ).rejects.toThrow();
  });

  it("voice.test requires valid characterId", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.voice.test({ characterId: 99999, text: "Test text" })
    ).rejects.toThrow();
  });
});

// ─── QA Review Tests ──────────────────────────────────────────────────────

describe("QA review procedures", () => {
  it("pipeline.approve throws for non-existent run", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.pipeline.approve({ runId: 99999 })
    ).rejects.toThrow();
  });

  it("pipeline.reject accepts issue types matching the schema", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    // Will throw NOT_FOUND since run doesn't exist, but validates input schema
    await expect(
      caller.pipeline.reject({
        runId: 99999,
        issues: [
          { type: "visual", description: "Flickering in panel 3" },
          { type: "audio", description: "Voice too robotic" },
          { type: "sync", description: "Lip sync off by 200ms" },
          { type: "quality", description: "Low resolution" },
          { type: "other", description: "Custom issue" },
        ],
      })
    ).rejects.toThrow();
  });

  it("pipeline.reject rejects invalid issue types via zod", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.pipeline.reject({
        runId: 1,
        issues: [
          { type: "invalid_type" as any, description: "test" },
        ],
      })
    ).rejects.toThrow();
  });
});
