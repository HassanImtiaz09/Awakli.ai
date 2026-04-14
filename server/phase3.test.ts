import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createTestContext(userId = 1): TrpcContext {
  return {
    user: {
      id: userId,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

function createAnonContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("Phase 3: Panel Generation & Review", () => {
  it("panels.listByEpisode requires authentication", async () => {
    const caller = appRouter.createCaller(createAnonContext());
    await expect(caller.panels.listByEpisode({ episodeId: 1 })).rejects.toThrow();
  });

  it("panels.approve requires authentication", async () => {
    const caller = appRouter.createCaller(createAnonContext());
    await expect(caller.panels.approve({ id: 1 })).rejects.toThrow();
  });

  it("panels.reject requires authentication", async () => {
    const caller = appRouter.createCaller(createAnonContext());
    await expect(caller.panels.reject({ id: 1 })).rejects.toThrow();
  });

  it("panels.regenerate requires authentication", async () => {
    const caller = appRouter.createCaller(createAnonContext());
    await expect(caller.panels.regenerate({ id: 1 })).rejects.toThrow();
  });

  it("panels.get requires authentication", async () => {
    const caller = appRouter.createCaller(createAnonContext());
    await expect(caller.panels.get({ id: 1 })).rejects.toThrow();
  });

  it("panels.update requires authentication", async () => {
    const caller = appRouter.createCaller(createAnonContext());
    await expect(
      caller.panels.update({ id: 1, visualDescription: "test" })
    ).rejects.toThrow();
  });

  it("panels.applyOverlay requires authentication", async () => {
    const caller = appRouter.createCaller(createAnonContext());
    await expect(caller.panels.applyOverlay({ id: 1 })).rejects.toThrow();
  });

  it("panels.aiRewrite requires authentication", async () => {
    const caller = appRouter.createCaller(createAnonContext());
    await expect(
      caller.panels.aiRewrite({ panelId: 1, currentText: "test" })
    ).rejects.toThrow();
  });
});

describe("Phase 3: Batch Operations", () => {
  it("episodes.approveAllPanels requires authentication", async () => {
    const caller = appRouter.createCaller(createAnonContext());
    await expect(
      caller.episodes.approveAllPanels({ episodeId: 1 })
    ).rejects.toThrow();
  });

  it("panels.regenerateFailed requires authentication", async () => {
    const caller = appRouter.createCaller(createAnonContext());
    await expect(
      caller.panels.regenerateFailed({ episodeId: 1 })
    ).rejects.toThrow();
  });

  it("episodes.generatePanels requires authentication", async () => {
    const caller = appRouter.createCaller(createAnonContext());
    await expect(
      caller.episodes.generatePanels({ episodeId: 1 })
    ).rejects.toThrow();
  });
});

describe("Phase 3: LoRA Training", () => {
  it("characters.trainLora requires authentication", async () => {
    const caller = appRouter.createCaller(createAnonContext());
    await expect(
      caller.characters.trainLora({ characterId: 1 })
    ).rejects.toThrow();
  });

  it("characters.loraStatus requires authentication", async () => {
    const caller = appRouter.createCaller(createAnonContext());
    await expect(
      caller.characters.loraStatus({ characterId: 1 })
    ).rejects.toThrow();
  });

  it("trainLora requires valid characterId input", async () => {
    const caller = appRouter.createCaller(createTestContext());
    // Should reject invalid input shape
    await expect(
      (caller.characters.trainLora as any)({ characterId: "abc" })
    ).rejects.toThrow();
  });

  it("loraStatus rejects non-existent character", async () => {
    const caller = appRouter.createCaller(createTestContext());
    await expect(
      caller.characters.loraStatus({ characterId: 999999 })
    ).rejects.toThrow("Character not found");
  });
});

describe("Phase 3: Panel procedures input validation", () => {
  it("panels.approve validates id is a number", async () => {
    const caller = appRouter.createCaller(createTestContext());
    await expect(
      (caller.panels.approve as any)({ id: "not-a-number" })
    ).rejects.toThrow();
  });

  it("panels.update validates input shape", async () => {
    const caller = appRouter.createCaller(createTestContext());
    // Missing required id
    await expect(
      (caller.panels.update as any)({})
    ).rejects.toThrow();
  });

  it("panels.aiRewrite validates input shape", async () => {
    const caller = appRouter.createCaller(createTestContext());
    await expect(
      (caller.panels.aiRewrite as any)({ panelId: "abc" })
    ).rejects.toThrow();
  });
});
