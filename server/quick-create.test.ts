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
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("quickCreate", () => {
  describe("quickCreate.justCreated", () => {
    it("returns an array (public procedure)", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.quickCreate.justCreated({ limit: 5 });
      expect(Array.isArray(result)).toBe(true);
    });

    it("respects the limit parameter", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.quickCreate.justCreated({ limit: 3 });
      expect(result.length).toBeLessThanOrEqual(3);
    });
  });

  describe("quickCreate.status", () => {
    it("throws NOT_FOUND for non-existent project", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.quickCreate.status({ projectId: 999999 })).rejects.toThrow();
    });
  });

  describe("quickCreate.getScript", () => {
    it("throws NOT_FOUND for non-existent episode", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);
      await expect(caller.quickCreate.getScript({ episodeId: 999999 })).rejects.toThrow();
    });
  });

  describe("quickCreate.getPanels", () => {
    it("returns empty array for non-existent project", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);
      const result = await caller.quickCreate.getPanels({ projectId: 999999 });
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });

  describe("quickCreate.start", () => {
    it("allows unauthenticated (guest) access", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);
      // Should NOT throw auth error — guests can generate
      // It will throw a different error (e.g., DB/LLM) but not UNAUTHORIZED
      try {
        await caller.quickCreate.start({
          prompt: "A samurai discovers a hidden portal to another dimension",
          genre: "Fantasy",
          style: "shonen",
          chapters: 1,
        });
      } catch (err: any) {
        // Should not be an auth error
        expect(err.code).not.toBe("UNAUTHORIZED");
      }
    });

    it("validates minimum prompt length", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.quickCreate.start({
          prompt: "short",
          genre: "Fantasy",
          style: "shonen",
          chapters: 1,
        })
      ).rejects.toThrow();
    });
  });

  describe("quickCreate.publish", () => {
    it("requires authentication", async () => {
      const ctx = createPublicContext();
      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.quickCreate.publish({ projectId: 1 })
      ).rejects.toThrow();
    });

    it("throws NOT_FOUND for non-existent project", async () => {
      const ctx = createAuthContext();
      const caller = appRouter.createCaller(ctx);
      await expect(
        caller.quickCreate.publish({ projectId: 999999 })
      ).rejects.toThrow();
    });
  });
});
