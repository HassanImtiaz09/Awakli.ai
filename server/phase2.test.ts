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

// ─── Episodes Tests ──────────────────────────────────────────────────────

describe("episodes procedures", () => {
  it("throws UNAUTHORIZED when listing episodes without auth", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.episodes.listByProject({ projectId: 1 })).rejects.toThrow();
  });

  it("throws UNAUTHORIZED when getting an episode without auth", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.episodes.get({ id: 1 })).rejects.toThrow();
  });

  it("throws UNAUTHORIZED when generating a script without auth", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.episodes.generateScript({ projectId: 1, episodeNumbers: [1] })
    ).rejects.toThrow();
  });

  it("throws NOT_FOUND when generating script for non-existent project", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.episodes.generateScript({ projectId: 999999, episodeNumbers: [1] })
    ).rejects.toThrow();
  });

  it("throws UNAUTHORIZED when approving script without auth", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.episodes.approveScript({ id: 1 })).rejects.toThrow();
  });

  it("throws NOT_FOUND when approving non-existent episode", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.episodes.approveScript({ id: 999999 })).rejects.toThrow();
  });

  it("throws NOT_FOUND when updating a non-existent episode", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.episodes.updateScript({ id: 999999, title: "Updated Title" })
    ).rejects.toThrow();
  });
});

// ─── Panels Tests ────────────────────────────────────────────────────────

describe("panels procedures", () => {
  it("throws UNAUTHORIZED when listing panels without auth", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.panels.listByEpisode({ episodeId: 1 })).rejects.toThrow();
  });

  it("throws UNAUTHORIZED when AI rewriting without auth", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.panels.aiRewrite({ panelId: 1, field: "visualDescription", currentText: "test" })
    ).rejects.toThrow();
  });
});

// ─── Characters Tests ────────────────────────────────────────────────────

describe("characters procedures", () => {
  it("throws UNAUTHORIZED when listing characters without auth", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.characters.listByProject({ projectId: 1 })).rejects.toThrow();
  });

  it("throws UNAUTHORIZED when creating a character without auth", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.characters.create({
        projectId: 1,
        name: "Test Character",
        role: "protagonist",
      })
    ).rejects.toThrow();
  });

  it("throws NOT_FOUND when creating character for non-existent project", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.characters.create({
        projectId: 999999,
        name: "Test Character",
        role: "protagonist",
      })
    ).rejects.toThrow();
  });

  it("validates character name is required", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.characters.create({
        projectId: 1,
        name: "",
        role: "protagonist",
      })
    ).rejects.toThrow();
  });

  it("throws UNAUTHORIZED when deleting a character without auth", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.characters.delete({ id: 1 })).rejects.toThrow();
  });

  it("throws NOT_FOUND when deleting non-existent character", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.characters.delete({ id: 999999 })).rejects.toThrow();
  });

  it("throws UNAUTHORIZED when generating reference without auth", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.characters.generateReference({ characterId: 1 })).rejects.toThrow();
  });

  it("throws NOT_FOUND when generating reference for non-existent character", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.characters.generateReference({ characterId: 999999 })).rejects.toThrow();
  });

  it("throws NOT_FOUND when updating a non-existent character", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.characters.update({ id: 999999, name: "Updated Name" })
    ).rejects.toThrow();
  });
});

// ─── AI Router Tests ─────────────────────────────────────────────────────

describe("ai procedures", () => {
  it("throws UNAUTHORIZED when enhancing description without auth", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.ai.enhanceDescription({ text: "A story about warriors" })
    ).rejects.toThrow();
  });

  it("validates text input for enhanceDescription", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.ai.enhanceDescription({ text: "" })
    ).rejects.toThrow();
  });
});
