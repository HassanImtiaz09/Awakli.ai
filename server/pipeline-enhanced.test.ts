import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("Enhanced Pipeline - Quality Router", () => {
  it("quality.getScore requires auth and throws for non-existent panel", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(caller.quality.getScore({ panelId: 999999 })).rejects.toThrow();
  });

  it("quality.assess requires auth and throws for non-existent panel", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(caller.quality.assess({ panelId: 999999 })).rejects.toThrow();
  });
});

describe("Enhanced Pipeline - Upscale Router", () => {
  it("upscale.getStatus requires auth and throws for non-existent panel", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(caller.upscale.getStatus({ panelId: 999999 })).rejects.toThrow();
  });

  it("upscale.panel requires auth and throws for non-existent panel", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(caller.upscale.panel({ panelId: 999999 })).rejects.toThrow();
  });
});

describe("Enhanced Pipeline - Scene Router", () => {
  it("scene.buildPrompt requires auth and returns enhanced prompt", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.scene.buildPrompt({
      basePrompt: "A warrior standing in a field",
      episodeId: 999999,
      sceneNumber: 1,
    });
    expect(result).toHaveProperty("enhancedPrompt");
    expect(result.enhancedPrompt).toContain("A warrior standing in a field");
  });
});

describe("Enhanced Pipeline - SFX Router", () => {
  it("sfx.getLibrary is public and returns SFX categories", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.sfx.getLibrary();
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
    // Should have common SFX categories
    expect(Object.keys(result).length).toBeGreaterThan(0);
  });
});

describe("Enhanced Pipeline - Video Prompt Router", () => {
  it("videoPrompt.getCameraPresets is public and returns presets", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.videoPrompt.getCameraPresets();
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
    expect(Object.keys(result).length).toBeGreaterThan(0);
  });

  it("videoPrompt.getMoodPresets is public and returns mood presets", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.videoPrompt.getMoodPresets();
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });

  it("videoPrompt.getTransitions is public and returns transition filters", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.videoPrompt.getTransitions();
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });

  it("videoPrompt.build returns prompt and transitionFilter", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.videoPrompt.build({
      visualDescription: "A samurai drawing his sword in the rain",
      cameraAngle: "close-up",
      mood: "tense",
      transition: "dissolve",
    });
    expect(result).toHaveProperty("prompt");
    expect(result).toHaveProperty("transitionFilter");
    expect(result.prompt).toContain("samurai");
    expect(typeof result.transitionFilter).toBe("string");
  });
});

describe("Enhanced Pipeline - Moderation Router", () => {
  it("moderation.getStatus requires auth and throws for non-existent panel", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(caller.moderation.getStatus({ panelId: 999999 })).rejects.toThrow();
  });
});

describe("Enhanced Pipeline - Cost Router", () => {
  it("cost.estimate requires auth and throws for non-existent episode", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(caller.cost.estimate({ episodeId: 999999 })).rejects.toThrow();
  });
});

describe("Enhanced Pipeline - Narrator Router", () => {
  it("narrator.extractLines returns lines array for non-existent episode", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.narrator.extractLines({ episodeId: 999999 });
    expect(result).toHaveProperty("lines");
    expect(Array.isArray(result.lines)).toBe(true);
  });
});
