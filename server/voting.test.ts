import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { AuthenticatedUser } from "./_core/auth";

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-voter",
    email: "voter@example.com",
    name: "Test Voter",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

describe("Voting & Anime Pipeline", () => {
  // ─── discoverVoting router ─────────────────────────────────────────
  describe("discoverVoting.rising", () => {
    it("returns an array with limit", async () => {
      const caller = appRouter.createCaller(createPublicContext());
      const result = await caller.discoverVoting.rising({ limit: 5 });
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("discoverVoting.becomingAnime", () => {
    it("returns an array with limit", async () => {
      const caller = appRouter.createCaller(createPublicContext());
      const result = await caller.discoverVoting.becomingAnime({ limit: 5 });
      expect(Array.isArray(result)).toBe(true);
    });
  });

  // ─── roadToAnime router ────────────────────────────────────────────
  describe("roadToAnime.rising", () => {
    it("returns items array and threshold", async () => {
      const caller = appRouter.createCaller(createPublicContext());
      const result = await caller.roadToAnime.rising({ limit: 10 });
      expect(result).toHaveProperty("items");
      expect(result).toHaveProperty("threshold");
      expect(Array.isArray(result.items)).toBe(true);
      expect(typeof result.threshold).toBe("number");
    });
  });

  describe("roadToAnime.promoted", () => {
    it("returns an array", async () => {
      const caller = appRouter.createCaller(createPublicContext());
      const result = await caller.roadToAnime.promoted({ limit: 10 });
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("roadToAnime.completed", () => {
    it("returns an array", async () => {
      const caller = appRouter.createCaller(createPublicContext());
      const result = await caller.roadToAnime.completed({ limit: 10 });
      expect(Array.isArray(result)).toBe(true);
    });
  });

  // ─── votingEnhanced router ─────────────────────────────────────────
  // ─── voteProgress router ────────────────────────────────────────────
  describe("voteProgress.get", () => {
    it("returns progress data for a project", async () => {
      // Non-existent project should still return data structure
      const caller = appRouter.createCaller(createPublicContext());
      const result = await caller.voteProgress.get({ projectId: 999999 });
      expect(result).toHaveProperty("totalVotes");
      expect(result).toHaveProperty("threshold");
      expect(result).toHaveProperty("percentage");
    });
  });

  describe("voteProgress.getThreshold", () => {
    it("returns an object with threshold number", async () => {
      const caller = appRouter.createCaller(createPublicContext());
      const result = await caller.voteProgress.getThreshold();
      expect(result).toHaveProperty("threshold");
      expect(typeof result.threshold).toBe("number");
      expect(result.threshold).toBeGreaterThan(0);
    });
  });

  // ─── creatorVoting router ──────────────────────────────────────────
  describe("creatorVoting.projectsWithProgress", () => {
    it("requires authentication", async () => {
      const caller = appRouter.createCaller(createPublicContext());
      await expect(caller.creatorVoting.projectsWithProgress())
        .rejects.toThrow();
    });

    it("returns projects array for authenticated user", async () => {
      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.creatorVoting.projectsWithProgress();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  // ─── animeProduction router ────────────────────────────────────────
  describe("animeProduction.start", () => {
    it("requires authentication", async () => {
      const caller = appRouter.createCaller(createPublicContext());
      await expect(caller.animeProduction.start({ projectId: 1 }))
        .rejects.toThrow();
    });

    it("throws NOT_FOUND for non-existent project", async () => {
      const caller = appRouter.createCaller(createAuthContext());
      await expect(caller.animeProduction.start({ projectId: 999999 }))
        .rejects.toThrow();
    });
  });
});
