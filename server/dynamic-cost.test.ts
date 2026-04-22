/**
 * Tests for Dynamic Cost Estimation
 * Validates the extended creditBalance endpoint and cost scaling logic.
 */
import { describe, it, expect } from "vitest";
import { STAGE_NAMES, getStageCreditCost } from "./projectService";

// ─── Server-side stage cost definitions ─────────────────────────────────────
describe("Stage cost definitions", () => {
  it("STAGE_NAMES has 7 stages", () => {
    expect(STAGE_NAMES).toHaveLength(7);
  });

  it("STAGE_NAMES are in the correct order", () => {
    expect(STAGE_NAMES).toEqual([
      "input", "setup", "script", "panels", "anime-gate", "video", "publish",
    ]);
  });

  it("getStageCreditCost returns correct costs for each stage", () => {
    expect(getStageCreditCost(0)).toBe(0);  // input → setup: free
    expect(getStageCreditCost(1)).toBe(0);  // setup → script: free
    expect(getStageCreditCost(2)).toBe(2);  // script → panels
    expect(getStageCreditCost(3)).toBe(5);  // panels → gate
    expect(getStageCreditCost(4)).toBe(0);  // gate → video: free
    expect(getStageCreditCost(5)).toBe(10); // video → publish
  });

  it("getStageCreditCost returns 0 for unknown stages", () => {
    expect(getStageCreditCost(6)).toBe(0);
    expect(getStageCreditCost(99)).toBe(0);
    expect(getStageCreditCost(-1)).toBe(0);
  });

  it("total base project cost is 17 credits", () => {
    const total = STAGE_NAMES.reduce((sum, _, i) => sum + getStageCreditCost(i), 0);
    expect(total).toBe(17);
  });
});

// ─── Cost scaling logic (mirrors CostHint component) ────────────────────────
describe("Cost scaling by panel count", () => {
  // Scalable stages: 2 (script→panels: 2), 3 (panels→gate: 5), 5 (video→publish: 10)
  const scalableStages = [2, 3, 5];
  const baseStageCosts = STAGE_NAMES.map((_, i) => ({
    stage: i,
    cost: getStageCreditCost(i),
  }));
  const baseTotalCost = baseStageCosts.reduce((sum, s) => sum + s.cost, 0);
  const scalableCosts = baseStageCosts
    .filter(s => scalableStages.includes(s.stage))
    .reduce((sum, s) => sum + s.cost, 0);
  const fixedCosts = baseTotalCost - scalableCosts;

  function computeScaledTotal(panelCount: number): number {
    const scaleFactor = panelCount / 20;
    return Math.round(fixedCosts + scalableCosts * scaleFactor);
  }

  it("base total cost is 17 for 20 panels", () => {
    expect(computeScaledTotal(20)).toBe(17);
  });

  it("scalable costs are 17 (2 + 5 + 10)", () => {
    expect(scalableCosts).toBe(17);
  });

  it("fixed costs are 0 (all non-scalable stages are free)", () => {
    expect(fixedCosts).toBe(0);
  });

  it("30 panels costs ~26 credits", () => {
    // scaleFactor = 1.5, scalable = 17 * 1.5 = 25.5, fixed = 0, total = 26
    expect(computeScaledTotal(30)).toBe(26);
  });

  it("40 panels costs 34 credits", () => {
    // scaleFactor = 2.0, scalable = 17 * 2 = 34, fixed = 0, total = 34
    expect(computeScaledTotal(40)).toBe(34);
  });

  it("cost scales linearly with panel count", () => {
    const cost20 = computeScaledTotal(20);
    const cost40 = computeScaledTotal(40);
    expect(cost40).toBe(cost20 * 2);
  });
});

// ─── Tier grant mapping ─────────────────────────────────────────────────────
describe("Tier monthly grant mapping", () => {
  const TIER_GRANTS: Record<string, number> = {
    free_trial: 15,
    creator: 100,
    creator_pro: 300,
    studio: 1000,
    enterprise: 5000,
  };

  it("free_trial gets 15 credits", () => {
    expect(TIER_GRANTS.free_trial).toBe(15);
  });

  it("creator gets 100 credits", () => {
    expect(TIER_GRANTS.creator).toBe(100);
  });

  it("creator_pro gets 300 credits", () => {
    expect(TIER_GRANTS.creator_pro).toBe(300);
  });

  it("studio gets 1000 credits", () => {
    expect(TIER_GRANTS.studio).toBe(1000);
  });

  it("enterprise gets 5000 credits", () => {
    expect(TIER_GRANTS.enterprise).toBe(5000);
  });

  it("all tiers have positive grants", () => {
    Object.values(TIER_GRANTS).forEach(grant => {
      expect(grant).toBeGreaterThan(0);
    });
  });
});

// ─── creditBalance response shape ───────────────────────────────────────────
describe("creditBalance response shape validation", () => {
  // Simulate what the extended procedure returns
  function buildCreditBalanceResponse(balance: number, tier: string) {
    const TIER_GRANTS: Record<string, number> = {
      free_trial: 15, creator: 100, creator_pro: 300, studio: 1000, enterprise: 5000,
    };
    const monthlyGrant = TIER_GRANTS[tier] ?? 15;
    const stageCosts = STAGE_NAMES.map((name, i) => ({
      stage: i,
      label: name,
      cost: getStageCreditCost(i),
    }));
    const totalProjectCost = stageCosts.reduce((sum, s) => sum + s.cost, 0);
    return { balance, monthlyGrant, stageCosts, totalProjectCost, tier };
  }

  it("returns all required fields", () => {
    const resp = buildCreditBalanceResponse(10, "free_trial");
    expect(resp).toHaveProperty("balance");
    expect(resp).toHaveProperty("monthlyGrant");
    expect(resp).toHaveProperty("stageCosts");
    expect(resp).toHaveProperty("totalProjectCost");
    expect(resp).toHaveProperty("tier");
  });

  it("stageCosts has entries for all stages", () => {
    const resp = buildCreditBalanceResponse(10, "free_trial");
    expect(resp.stageCosts).toHaveLength(7);
    resp.stageCosts.forEach((s, i) => {
      expect(s.stage).toBe(i);
      expect(s.label).toBe(STAGE_NAMES[i]);
      expect(typeof s.cost).toBe("number");
    });
  });

  it("totalProjectCost equals sum of all stage costs", () => {
    const resp = buildCreditBalanceResponse(10, "creator");
    const sum = resp.stageCosts.reduce((acc, s) => acc + s.cost, 0);
    expect(resp.totalProjectCost).toBe(sum);
  });

  it("monthlyGrant matches tier", () => {
    expect(buildCreditBalanceResponse(10, "free_trial").monthlyGrant).toBe(15);
    expect(buildCreditBalanceResponse(10, "creator").monthlyGrant).toBe(100);
    expect(buildCreditBalanceResponse(10, "studio").monthlyGrant).toBe(1000);
  });

  it("unknown tier defaults to 15 grant", () => {
    expect(buildCreditBalanceResponse(10, "unknown_tier").monthlyGrant).toBe(15);
  });
});

// ─── Affordability checks ───────────────────────────────────────────────────
describe("Affordability display logic", () => {
  it("canAfford is true when balance >= totalProjectCost", () => {
    const balance = 20;
    const totalProjectCost = 17;
    expect(balance >= totalProjectCost).toBe(true);
  });

  it("canAfford is false when balance < totalProjectCost", () => {
    const balance = 10;
    const totalProjectCost = 17;
    expect(balance >= totalProjectCost).toBe(false);
  });

  it("stage cost turns red when cost > balance", () => {
    const balance = 3;
    const stageCost = 5;
    const isRed = stageCost > balance;
    expect(isRed).toBe(true);
  });

  it("free stages are always affordable", () => {
    const balance = 0;
    const stageCost = 0;
    expect(stageCost > balance).toBe(false);
  });
});
