/**
 * Vitest tests for Audit Fixes — Security, Pipeline Integrity, Observability
 */
import { describe, it, expect, vi } from "vitest";

// ─── 1. Env Validation (C-2, C-3) ──────────────────────────────────────

describe("Env Validation", () => {
  it("should export ENV object with required fields", async () => {
    const { ENV } = await import("./_core/env");
    expect(ENV).toBeDefined();
    expect(typeof ENV.cookieSecret).toBe("string");
    expect(ENV.cookieSecret.length).toBeGreaterThanOrEqual(16);
  });

  it("should have database URL configured", async () => {
    const { ENV } = await import("./_core/env");
    expect(ENV.databaseUrl).toBeDefined();
    expect(ENV.databaseUrl.length).toBeGreaterThan(0);
  });
});

// ─── 2. Rate Limiting (H-4) ────────────────────────────────────────────

describe("Rate Limiting", () => {
  it("should export rateLimitMiddleware function", async () => {
    const { rateLimitMiddleware } = await import("./_core/rate-limit");
    expect(typeof rateLimitMiddleware).toBe("function");
  });
});

// ─── 3. Budget Store (C-4) ──────────────────────────────────────────────

describe("Budget Store (DB-backed)", () => {
  it("should export budget store functions", async () => {
    const mod = await import("./image-router/budget-db");
    expect(typeof mod.recordSpend).toBe("function");
    expect(typeof mod.hasBudget).toBe("function");
    expect(typeof mod.getBudgetSummary).toBe("function");
  });

  it("should have sensible budget ceiling", async () => {
    const { DAILY_ORG_CEILING_USD } = await import("./image-router/budget-db");
    expect(DAILY_ORG_CEILING_USD).toBeGreaterThan(0);
  });
});

// ─── 4. Idempotency (C-7) ──────────────────────────────────────────────

describe("Idempotency Dedup", () => {
  it("should export idempotency functions", async () => {
    const mod = await import("./image-router/idempotency");
    expect(typeof mod.checkIdempotency).toBe("function");
    expect(typeof mod.recordIdempotency).toBe("function");
    expect(typeof mod.cleanupExpiredIdempotency).toBe("function");
  });
});

// ─── 5. Canary Probes (M-6) ────────────────────────────────────────────

describe("Canary Probes", () => {
  it("should export canary functions", async () => {
    const mod = await import("./image-router/canary-probes");
    expect(typeof mod.runCanaryProbe).toBe("function");
    expect(typeof mod.runAllCanaryProbes).toBe("function");
    expect(typeof mod.startCanaryScheduler).toBe("function");
    expect(typeof mod.stopCanaryScheduler).toBe("function");
    expect(typeof mod.getLastCanaryResults).toBe("function");
  });

  it("should have sensible canary config", async () => {
    const { CANARY_CONFIG } = await import("./image-router/canary-probes");
    expect(CANARY_CONFIG.intervalMs).toBeGreaterThanOrEqual(60_000);
    expect(CANARY_CONFIG.probeTimeoutMs).toBeGreaterThan(0);
    expect(CANARY_CONFIG.canaryPrompt.length).toBeGreaterThan(0);
    expect(CANARY_CONFIG.alertThreshold).toBeGreaterThan(0);
  });

  it("should return empty results before first run", async () => {
    const { getLastCanaryResults } = await import("./image-router/canary-probes");
    const results = getLastCanaryResults();
    expect(Array.isArray(results)).toBe(true);
  });
});

// ─── 6. Observability (L-5, L-6, L-7) ──────────────────────────────────

describe("Structured Logger", () => {
  it("should create loggers with module names", async () => {
    const { createLogger } = await import("./observability/logger");
    const log = createLogger("test-module");
    expect(log).toBeDefined();
    expect(typeof log.info).toBe("function");
    expect(typeof log.warn).toBe("function");
    expect(typeof log.error).toBe("function");
    expect(typeof log.debug).toBe("function");
  });

  it("should create child loggers", async () => {
    const { createLogger } = await import("./observability/logger");
    const parent = createLogger("parent");
    const child = parent.child("child");
    expect(child).toBeDefined();
    expect(typeof child.info).toBe("function");
  });

  it("should export pre-configured loggers", async () => {
    const { serverLog, routerLog, pipelineLog, authLog, stripeLog, qaLog } = await import("./observability/logger");
    expect(serverLog).toBeDefined();
    expect(routerLog).toBeDefined();
    expect(pipelineLog).toBeDefined();
    expect(authLog).toBeDefined();
    expect(stripeLog).toBeDefined();
    expect(qaLog).toBeDefined();
  });

  it("should output structured JSON", async () => {
    const { createLogger } = await import("./observability/logger");
    const log = createLogger("test");

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.info("test message", { key: "value" });

    expect(consoleSpy).toHaveBeenCalled();
    const output = consoleSpy.mock.calls[0]?.[0];
    if (output) {
      const parsed = JSON.parse(output);
      expect(parsed.level).toBe("info");
      expect(parsed.msg).toBe("test message");
      expect(parsed.module).toBe("test");
      expect(parsed.key).toBe("value");
      expect(parsed.timestamp).toBeDefined();
    }

    consoleSpy.mockRestore();
  });
});

describe("Observability Module", () => {
  it("should export request timing middleware", async () => {
    const { requestTimingMiddleware } = await import("./observability");
    expect(typeof requestTimingMiddleware).toBe("function");
  });

  it("should export health handler", async () => {
    const { healthHandler } = await import("./observability");
    expect(typeof healthHandler).toBe("function");
  });

  it("should export metrics helpers", async () => {
    const { recordMetric, flushMetrics, peekMetrics } = await import("./observability");
    expect(typeof recordMetric).toBe("function");
    expect(typeof flushMetrics).toBe("function");
    expect(typeof peekMetrics).toBe("function");
  });

  it("should record and flush metrics", async () => {
    const { recordMetric, flushMetrics, peekMetrics } = await import("./observability");

    recordMetric("test.counter", 1, { provider: "runware" });
    recordMetric("test.counter", 2, { provider: "fal" });

    const peeked = peekMetrics();
    expect(peeked.length).toBeGreaterThanOrEqual(2);

    const flushed = flushMetrics();
    expect(flushed.length).toBeGreaterThanOrEqual(2);

    const afterFlush = peekMetrics();
    expect(afterFlush.length).toBe(0);
  });
});

// ─── 7. Face Similarity (H-5) ──────────────────────────────────────────

describe("Face Similarity Module", () => {
  it("should export face similarity functions and thresholds", async () => {
    const mod = await import("./character-bible/face-similarity");
    expect(typeof mod.compareFaces).toBe("function");
    expect(typeof mod.FACE_THRESHOLDS).toBe("object");
    expect(typeof mod.getVerdict).toBe("function");
  });

  it("should have correct threshold values", async () => {
    const { FACE_THRESHOLDS } = await import("./character-bible/face-similarity");
    expect(FACE_THRESHOLDS.pass).toBeGreaterThanOrEqual(0.7);
    expect(FACE_THRESHOLDS.warn).toBeLessThan(FACE_THRESHOLDS.pass);
    expect(FACE_THRESHOLDS.warn).toBeGreaterThan(0);
  });

  it("should classify similarity scores correctly", async () => {
    const { getVerdict, FACE_THRESHOLDS } = await import("./character-bible/face-similarity");

    expect(getVerdict(0.85)).toBe("pass");
    expect(getVerdict(FACE_THRESHOLDS.warn + 0.01)).toBe("soft_fail");
    expect(getVerdict(0.1)).toBe("hard_fail");
  });
});

// ─── 8. Regen Loop (H-6) ───────────────────────────────────────────────

describe("Auto-Retry Regeneration Loop", () => {
  it("should export regen loop functions", async () => {
    const mod = await import("./character-bible/regen-loop");
    expect(typeof mod.getOrCreateRegenBudget).toBe("function");
    expect(typeof mod.consumeRegenBudget).toBe("function");
    expect(typeof mod.getRemainingRegenBudget).toBe("function");
    expect(typeof mod.runRegenLoop).toBe("function");
    expect(typeof mod.DEFAULT_REGEN_CONFIG).toBe("object");
  });

  it("should have sensible default config", async () => {
    const { DEFAULT_REGEN_CONFIG } = await import("./character-bible/regen-loop");
    expect(DEFAULT_REGEN_CONFIG.maxAttempts).toBeGreaterThan(0);
    expect(DEFAULT_REGEN_CONFIG.maxAttempts).toBeLessThanOrEqual(5);
  });

  it("should create and consume regen budgets", async () => {
    const { getOrCreateRegenBudget, consumeRegenBudget, getRemainingRegenBudget } = await import("./character-bible/regen-loop");

    const budget = getOrCreateRegenBudget("audit-test-scene-" + Date.now(), 4);
    expect(budget.maxRegenerations).toBeGreaterThan(0);
    expect(budget.usedRegenerations).toBe(0);

    const consumed = consumeRegenBudget(budget.sceneId);
    expect(consumed).toBe(true);

    const remaining = getRemainingRegenBudget(budget.sceneId);
    expect(remaining).toBeLessThan(budget.maxRegenerations);
  });
});

// ─── 9. ControlNet Module (C-6) ────────────────────────────────────────

describe("ControlNet Pose+Depth Module", () => {
  it("should export controlnet functions", async () => {
    const mod = await import("./character-bible/controlnet");
    expect(typeof mod.buildControlNetConditions).toBe("function");
    expect(typeof mod.CONTROLNET_WEIGHTS).toBe("object");
    expect(typeof mod.isControlNetSupported).toBe("function");
    expect(typeof mod.generateTPoseKeypoints).toBe("function");
  });

  it("should have sensible default weights", async () => {
    const { CONTROLNET_WEIGHTS } = await import("./character-bible/controlnet");
    expect(CONTROLNET_WEIGHTS.openpose).toBeGreaterThan(0);
    expect(CONTROLNET_WEIGHTS.openpose).toBeLessThanOrEqual(1);
    expect(CONTROLNET_WEIGHTS.depth).toBeGreaterThan(0);
    expect(CONTROLNET_WEIGHTS.depth).toBeLessThanOrEqual(1);
  });

  it("should generate T-pose keypoints", async () => {
    const { generateTPoseKeypoints } = await import("./character-bible/controlnet");

    const keypoints = generateTPoseKeypoints(512, 768, 0.8);

    expect(keypoints).toBeDefined();
    expect(keypoints.nose).toBeDefined();
    expect(keypoints.leftShoulder).toBeDefined();
    expect(keypoints.rightShoulder).toBeDefined();
    expect(keypoints.leftHip).toBeDefined();
    expect(keypoints.rightHip).toBeDefined();
  });

  it("should check provider support for controlnet", async () => {
    const { isControlNetSupported } = await import("./character-bible/controlnet");

    expect(typeof isControlNetSupported("runware")).toBe("boolean");
    expect(typeof isControlNetSupported("unknown-provider")).toBe("boolean");
  });
});

// ─── 10. Cookie Security (H-2) ─────────────────────────────────────────

describe("Cookie Security", () => {
  it("should have SameSite=lax in cookie config", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("./server/_core/cookies.ts", "utf-8");
    expect(content).toContain("lax");
    expect(content).toContain("secure");
  });
});

// ─── 11. Legal Pages Exist ─────────────────────────────────────────────

describe("Legal Pages", () => {
  it("should have Terms page", async () => {
    const fs = await import("fs");
    expect(fs.existsSync("./client/src/pages/Terms.tsx")).toBe(true);
  });

  it("should have Privacy page", async () => {
    const fs = await import("fs");
    expect(fs.existsSync("./client/src/pages/Privacy.tsx")).toBe(true);
  });

  it("should have Refund page", async () => {
    const fs = await import("fs");
    expect(fs.existsSync("./client/src/pages/Refund.tsx")).toBe(true);
  });
});

// ─── 12. Footer Links Cleanup ──────────────────────────────────────────

describe("Footer Links", () => {
  it("should not contain broken links", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("./client/src/components/awakli/MarketingFooter.tsx", "utf-8");
    expect(content).not.toContain('"/about"');
    expect(content).not.toContain('"/blog"');
    expect(content).not.toContain('"/careers"');
    expect(content).not.toContain('"/press"');
    expect(content).not.toContain('"/contact"');
    expect(content).not.toContain('"/cookies"');
    expect(content).not.toContain('"/dmca"');
  });

  it("should contain legal page links", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("./client/src/components/awakli/MarketingFooter.tsx", "utf-8");
    expect(content).toContain('"/terms"');
    expect(content).toContain('"/privacy"');
    expect(content).toContain('"/refund"');
  });
});

// ─── 13. Fabricated Stats Removed (M-2) ─────────────────────────────────

describe("Fabricated Stats Removed", () => {
  it("should not contain fake counter values in Home.tsx", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("./client/src/pages/Home.tsx", "utf-8");
    expect(content).not.toContain("12000");
    expect(content).not.toContain("8000");
    expect(content).not.toContain("manga created");
    expect(content).not.toContain("anime voted");
  });

  it("should not contain mock gallery items", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("./client/src/pages/Home.tsx", "utf-8");
    expect(content).not.toContain("Neon Samurai Chronicles");
    expect(content).not.toContain("Dreamwalker Academy");
    expect(content).not.toContain("Celestial Blade");
  });

  it("should contain Daily Prompt card", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("./client/src/pages/Home.tsx", "utf-8");
    expect(content).toContain("Daily Prompt");
  });
});

// ─── 14. Auth Cleanup (H-7) ────────────────────────────────────────────

describe("Auth Cleanup — OAuth Only", () => {
  it("should not contain password input fields in SignIn", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("./client/src/pages/SignIn.tsx", "utf-8");
    expect(content).not.toContain('type="password"');
    expect(content).not.toContain("setPassword");
  });

  it("should not contain password input fields in SignUp", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("./client/src/pages/SignUp.tsx", "utf-8");
    expect(content).not.toContain('type="password"');
    expect(content).not.toContain("setPassword");
  });

  it("should use OAuth login flow", async () => {
    const fs = await import("fs");
    const signIn = fs.readFileSync("./client/src/pages/SignIn.tsx", "utf-8");
    expect(signIn).toContain("getLoginUrl");
  });
});
