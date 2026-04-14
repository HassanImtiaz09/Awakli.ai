import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-creator",
    email: "creator@example.com",
    name: "Test Creator",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: {
      protocol: "https",
      headers: { origin: "https://test.example.com" },
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: { origin: "https://test.example.com" },
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("Tier Enforcement", () => {
  it("tier.compare returns public tier comparison data", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.tier.compare();
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    // Each tier should have name, key, and monthlyPrice
    const tier = result[0];
    expect(tier).toHaveProperty("name");
    expect(tier).toHaveProperty("key");
    expect(tier).toHaveProperty("monthlyPrice");
  });

  it("tier.getStatus requires authentication", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await expect(caller.tier.getStatus()).rejects.toThrow();
  });

  it("tier.getStatus returns tier info for authenticated user", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.tier.getStatus();
    expect(result).toBeDefined();
    expect(result).toHaveProperty("tier");
    expect(result).toHaveProperty("config");
    expect(result).toHaveProperty("usage");
  });

  it("tier.check requires authentication", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await expect(
      caller.tier.check({ action: "create_project" })
    ).rejects.toThrow();
  });

  it("tier.check returns allowed status for authenticated user", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.tier.check({ action: "create_project" });
    expect(result).toBeDefined();
    expect(result).toHaveProperty("allowed");
    expect(typeof result.allowed).toBe("boolean");
  });
});

describe("Anime Preview", () => {
  it("animePreview.canGenerate requires authentication", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await expect(caller.animePreview.canGenerate()).rejects.toThrow();
  });

  it("animePreview.canGenerate returns status for authenticated user", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.animePreview.canGenerate();
    expect(result).toBeDefined();
    expect(result).toHaveProperty("canGenerate");
    expect(result).toHaveProperty("hasFullAccess");
    expect(result).toHaveProperty("previewUsed");
  });

  it("animePreview.getStatus requires authentication and valid projectId", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(
      caller.animePreview.getStatus({ projectId: 99999 })
    ).rejects.toThrow();
  });
});

describe("Export", () => {
  it("export.estimate requires authentication", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await expect(
      caller.export.estimate({ projectId: 1, type: "manga", format: "pdf" })
    ).rejects.toThrow();
  });

  it("export.generate requires authentication", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await expect(
      caller.export.generate({ projectId: 1, type: "manga", format: "pdf" })
    ).rejects.toThrow();
  });
});

describe("Premium Episodes", () => {
  it("premium.setStatus requires authentication", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await expect(
      caller.premium.setStatus({ episodeId: 1, isPremium: "premium" })
    ).rejects.toThrow();
  });

  it("premium.getStatus requires authentication and valid episodeId", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(
      caller.premium.getStatus({ episodeId: 99999 })
    ).rejects.toThrow();
  });
});
