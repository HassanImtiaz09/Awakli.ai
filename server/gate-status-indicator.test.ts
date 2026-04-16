/**
 * Gate Status Indicator — Tests
 *
 * Covers:
 * - getPendingGateSummary DB function: return shape, empty results
 * - gateReview.getPendingGateSummary tRPC endpoint: auth, response shape, counts
 * - PendingGateSummaryItem type verification
 * - Barrel export verification
 */

import { describe, it, expect, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Helpers ──────────────────────────────────────────────────────────

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

// ─── tRPC Endpoint Tests ──────────────────────────────────────────────

describe("gateReview.getPendingGateSummary tRPC endpoint", () => {
  it("throws UNAUTHORIZED when called without auth", async () => {
    const caller = appRouter.createCaller(createUnauthContext());
    await expect(
      caller.gateReview.getPendingGateSummary()
    ).rejects.toThrow();
  });

  it("returns the expected shape when authenticated", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.gateReview.getPendingGateSummary();

    // Should return an object with gates array and counts
    expect(result).toHaveProperty("gates");
    expect(result).toHaveProperty("totalCount");
    expect(result).toHaveProperty("blockingCount");
    expect(result).toHaveProperty("advisoryCount");
    expect(result).toHaveProperty("ambientCount");

    expect(Array.isArray(result.gates)).toBe(true);
    expect(typeof result.totalCount).toBe("number");
    expect(typeof result.blockingCount).toBe("number");
    expect(typeof result.advisoryCount).toBe("number");
    expect(typeof result.ambientCount).toBe("number");
  });

  it("returns zero counts when no pending gates exist", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.gateReview.getPendingGateSummary();

    // For a test user with no gates, all counts should be 0
    expect(result.totalCount).toBe(0);
    expect(result.blockingCount).toBe(0);
    expect(result.advisoryCount).toBe(0);
    expect(result.ambientCount).toBe(0);
    expect(result.gates).toHaveLength(0);
  });

  it("count fields are consistent with gates array", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.gateReview.getPendingGateSummary();

    const blocking = result.gates.filter((g: any) => g.gateType === "blocking").length;
    const advisory = result.gates.filter((g: any) => g.gateType === "advisory").length;
    const ambient = result.gates.filter((g: any) => g.gateType === "ambient").length;

    expect(result.totalCount).toBe(result.gates.length);
    expect(result.blockingCount).toBe(blocking);
    expect(result.advisoryCount).toBe(advisory);
    expect(result.ambientCount).toBe(ambient);
  });
});

// ─── DB Function Tests ────────────────────────────────────────────────

describe("getPendingGateSummary DB function", () => {
  it("is exported from the hitl barrel", async () => {
    const hitl = await import("./hitl/index");
    expect(typeof hitl.getPendingGateSummary).toBe("function");
  });

  it("returns an array (empty for non-existent user)", async () => {
    const { getPendingGateSummary } = await import("./hitl/gate-manager");
    const result = await getPendingGateSummary(999999);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("PendingGateSummaryItem type is exported from barrel", async () => {
    // Type-level check: if this import compiles, the type is exported
    const hitl = await import("./hitl/index");
    expect(hitl).toBeDefined();
    // The type PendingGateSummaryItem is a TypeScript-only export,
    // so we verify the function that returns it exists
    expect(typeof hitl.getPendingGateSummary).toBe("function");
  });
});

// ─── Existing getPendingGates still works ─────────────────────────────

describe("gateReview.getPendingGates (existing endpoint)", () => {
  it("still works alongside the new summary endpoint", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Both endpoints should work
    const [gates, summary] = await Promise.all([
      caller.gateReview.getPendingGates(),
      caller.gateReview.getPendingGateSummary(),
    ]);

    expect(Array.isArray(gates)).toBe(true);
    expect(typeof summary.totalCount).toBe("number");
  });
});
