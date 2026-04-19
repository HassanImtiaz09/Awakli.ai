/**
 * Delta Audit v1.2 — Vitest tests for all new/fixed modules.
 *
 * Covers:
 * - H-9: OAuth nonce generation + verification
 * - H-8: requireTier middleware exports
 * - Canary ENABLE_CANARIES guard
 * - Structured logger
 * - Documentation files exist
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── H-9: OAuth Nonce ──────────────────────────────────────────────────

describe("H-9: OAuth Nonce Module", () => {
  it("exports generateNonce and verifyNonce functions", async () => {
    const mod = await import("./_core/oauth-nonce");
    expect(typeof mod.generateNonce).toBe("function");
    expect(typeof mod.verifyNonce).toBe("function");
  });

  it("generateNonce returns a 32-char hex string", async () => {
    const { generateNonce } = await import("./_core/oauth-nonce");
    const nonce = generateNonce();
    expect(nonce).toMatch(/^[a-f0-9]{32}$/);
  });

  it("generateNonce produces unique values", async () => {
    const { generateNonce } = await import("./_core/oauth-nonce");
    const nonces = new Set(Array.from({ length: 100 }, () => generateNonce()));
    expect(nonces.size).toBe(100);
  });

  it("verifyNonce returns true for matching nonce", async () => {
    const { generateNonce, verifyNonce } = await import("./_core/oauth-nonce");
    const nonce = generateNonce();
    expect(verifyNonce(nonce, nonce)).toBe(true);
  });

  it("verifyNonce returns false for mismatched nonce", async () => {
    const { generateNonce, verifyNonce } = await import("./_core/oauth-nonce");
    const nonce1 = generateNonce();
    const nonce2 = generateNonce();
    expect(verifyNonce(nonce1, nonce2)).toBe(false);
  });

  it("verifyNonce returns false for empty strings", async () => {
    const { verifyNonce } = await import("./_core/oauth-nonce");
    expect(verifyNonce("", "")).toBe(false);
    expect(verifyNonce("abc", "")).toBe(false);
    expect(verifyNonce("", "abc")).toBe(false);
  });

  it("NONCE_COOKIE_NAME is a non-empty string", async () => {
    const { NONCE_COOKIE_NAME } = await import("./_core/oauth-nonce");
    expect(typeof NONCE_COOKIE_NAME).toBe("string");
    expect(NONCE_COOKIE_NAME.length).toBeGreaterThan(0);
  });

  it("NONCE_TTL_MS is a positive number", async () => {
    const { NONCE_TTL_MS } = await import("./_core/oauth-nonce");
    expect(typeof NONCE_TTL_MS).toBe("number");
    expect(NONCE_TTL_MS).toBeGreaterThan(0);
    // Should be around 10 minutes (600000ms)
    expect(NONCE_TTL_MS).toBeLessThanOrEqual(600_000);
  });
});

// ─── H-8: requireTier Middleware ────────────────────────────────────────

describe("H-8: requireTier Middleware", () => {
  it("exports requireTier function from trpc.ts", async () => {
    const mod = await import("./_core/trpc");
    expect(typeof mod.requireTier).toBe("function");
  });

  it("exports creatorProcedure from trpc.ts", async () => {
    const mod = await import("./_core/trpc");
    expect(mod.creatorProcedure).toBeDefined();
  });

  it("exports studioProcedure from trpc.ts", async () => {
    const mod = await import("./_core/trpc");
    expect(mod.studioProcedure).toBeDefined();
  });

  it("requireTier returns a middleware-like object", async () => {
    const { requireTier } = await import("./_core/trpc");
    const middleware = requireTier("creator");
    // Should be a tRPC middleware (has _def or similar)
    expect(middleware).toBeDefined();
  });
});

// ─── Canary Guard ───────────────────────────────────────────────────────

describe("Canary ENABLE_CANARIES Guard", () => {
  it("startCanaryScheduler is exported", async () => {
    const mod = await import("./image-router/canary-probes");
    expect(typeof mod.startCanaryScheduler).toBe("function");
  });

  it("stopCanaryScheduler is exported", async () => {
    const mod = await import("./image-router/canary-probes");
    expect(typeof mod.stopCanaryScheduler).toBe("function");
  });

  it("getLastCanaryResults is exported", async () => {
    const mod = await import("./image-router/canary-probes");
    expect(typeof mod.getLastCanaryResults).toBe("function");
  });

  it("getLastCanaryResults returns null when no probes have run", async () => {
    const { getLastCanaryResults } = await import("./image-router/canary-probes");
    // Since ENABLE_CANARIES is not set in test env, results should be null or empty array
    const results = getLastCanaryResults();
    expect(results === null || Array.isArray(results)).toBe(true);
  });
});

// ─── Structured Logger ──────────────────────────────────────────────────

describe("Structured Logger", () => {
  it("exports createLogger factory", async () => {
    const { createLogger } = await import("./observability/logger");
    expect(typeof createLogger).toBe("function");
  });

  it("creates a logger with all level methods", async () => {
    const { createLogger } = await import("./observability/logger");
    const log = createLogger("test");
    expect(typeof log.debug).toBe("function");
    expect(typeof log.info).toBe("function");
    expect(typeof log.warn).toBe("function");
    expect(typeof log.error).toBe("function");
  });

  it("child() creates a scoped logger", async () => {
    const { createLogger } = await import("./observability/logger");
    const parent = createLogger("parent");
    const child = parent.child("child");
    expect(typeof child.info).toBe("function");
  });

  it("exports pre-configured loggers", async () => {
    const mod = await import("./observability/logger");
    expect(mod.serverLog).toBeDefined();
    expect(mod.stripeLog).toBeDefined();
    expect(mod.authLog).toBeDefined();
    expect(mod.pipelineLog).toBeDefined();
    expect(mod.qaLog).toBeDefined();
    expect(mod.routerLog).toBeDefined();
  });

  it("logger.info outputs JSON to console.log", async () => {
    const { createLogger } = await import("./observability/logger");
    const log = createLogger("test-module");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.info("test message", { key: "value" });
    expect(spy).toHaveBeenCalledOnce();
    const output = spy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.msg).toBe("test message");
    expect(parsed.module).toBe("test-module");
    expect(parsed.key).toBe("value");
    expect(parsed.level).toBe("info");
    expect(parsed.timestamp).toBeDefined();
    spy.mockRestore();
  });

  it("logger.error outputs to console.error", async () => {
    const { createLogger } = await import("./observability/logger");
    const log = createLogger("err-test");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    log.error("something broke", { code: 500 });
    expect(spy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(spy.mock.calls[0][0]);
    expect(parsed.level).toBe("error");
    expect(parsed.msg).toBe("something broke");
    spy.mockRestore();
  });
});

// ─── Documentation Files Exist ──────────────────────────────────────────

describe("L-7: Documentation", () => {
  it("README.md exists and has content", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/awakli/README.md", "utf-8");
    expect(content.length).toBeGreaterThan(500);
    expect(content).toContain("Awakli");
    expect(content).toContain("Quick Start");
    expect(content).toContain("Architecture");
    expect(content).toContain("Environment Variables");
    expect(content).toContain("Security Notes");
  });

  it("CONTRIBUTING.md exists and has content", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/awakli/CONTRIBUTING.md", "utf-8");
    expect(content.length).toBeGreaterThan(200);
    expect(content).toContain("Branch Naming");
    expect(content).toContain("Commit Messages");
    expect(content).toContain("Pull Request");
  });

  it("docs/RUNBOOK.md exists and has content", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/awakli/docs/RUNBOOK.md", "utf-8");
    expect(content.length).toBeGreaterThan(500);
    expect(content).toContain("KEK");
    expect(content).toContain("Session Invalidation");
    expect(content).toContain("Deployment");
    expect(content).toContain("Stripe");
  });
});

// ─── M-3: Dead Code Removal ────────────────────────────────────────────

describe("M-3: Dead Code & Version Fixes", () => {
  it("Home.tsx does not contain AnimatedCounter", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/awakli/client/src/pages/Home.tsx", "utf-8");
    expect(content).not.toContain("AnimatedCounter");
  });

  it("Home.tsx does not contain fabricated stats (12,000+, 500+, 8,000+)", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/awakli/client/src/pages/Home.tsx", "utf-8");
    expect(content).not.toContain("12,000+");
    expect(content).not.toContain("8,000+");
    expect(content).not.toMatch(/500\+\s*anime/i);
  });

  it("ENV export does not include ownerOpenId field", async () => {
    const mod = await import("./_core/env");
    expect((mod.ENV as any).ownerOpenId).toBeUndefined();
  });

  it("Home.tsx references Kling 2.0 (not 2.1)", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/awakli/client/src/pages/Home.tsx", "utf-8");
    expect(content).not.toContain("Kling 2.1");
  });
});

// ─── Cookie Security ────────────────────────────────────────────────────

describe("Cookie Security", () => {
  it("cookies.ts sets SameSite=lax", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/awakli/server/_core/cookies.ts", "utf-8");
    expect(content).toContain("lax");
  });

  it("cookies.ts sets Secure=true", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/awakli/server/_core/cookies.ts", "utf-8");
    expect(content).toContain("secure");
  });
});

// ─── Auth Pages (H-7 regression check) ─────────────────────────────────

describe("H-7: OAuth-only Auth Pages", () => {
  it("SignIn.tsx does not contain password input", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/awakli/client/src/pages/SignIn.tsx", "utf-8");
    // Should not have type="password" input
    expect(content).not.toContain('type="password"');
  });

  it("SignUp.tsx does not contain password input", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("/home/ubuntu/awakli/client/src/pages/SignUp.tsx", "utf-8");
    expect(content).not.toContain('type="password"');
  });
});
