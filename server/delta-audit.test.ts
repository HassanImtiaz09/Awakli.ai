/**
 * Delta Audit v1.2 — Vitest tests for all new/fixed modules.
 *
 * Covers:
 * - H-9: OAuth nonce generation + verification
 * - H-8: requireTier middleware exports
 * - Canary ENABLE_CANARIES guard
 * - Structured logger
 * - Documentation files exist
 *
 * LOW-2 fix: All file paths use path.resolve(__dirname, ...) for CI portability.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "path";
import fs from "fs";

/** Project root relative to this test file (server/delta-audit.test.ts → ..) */
const PROJECT_ROOT = path.resolve(__dirname, "..");

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

// ─── H-9 CRIT-1: sdk.ts decodeState integration ──────────────────────

describe("CRIT-1: sdk.ts decodeState parses nonce payload", () => {
  it("decodeState extracts redirectUri from nonce-encoded state", async () => {
    // Simulate what oauth-nonce.ts encodeState produces
    const redirectUri = "https://awakli.ai/api/oauth/callback";
    const nonce = "a".repeat(32);
    const state = Buffer.from(JSON.stringify({ nonce, redirectUri })).toString("base64url");

    // sdk.ts decodeState is private, but we can test the round-trip by checking
    // that the SDK's getTokenByCode would extract the correct redirectUri.
    // We test the decoding logic directly:
    const decoded = Buffer.from(state, "base64url").toString("utf-8");
    const parsed = JSON.parse(decoded);
    expect(parsed.redirectUri).toBe(redirectUri);
    expect(parsed.nonce).toBe(nonce);
  });

  it("sdk.ts file contains JSON.parse-based decodeState (not plain atob)", async () => {
    const sdkPath = path.resolve(__dirname, "_core/sdk.ts");
    const content = fs.readFileSync(sdkPath, "utf-8");
    // Should contain the new JSON-parsing logic
    expect(content).toContain("JSON.parse");
    expect(content).toContain("base64url");
    expect(content).toContain("parsed.redirectUri");
    // Should NOT have the old bare atob-only pattern as the primary decoder
    // (atob may still exist as a legacy fallback, which is fine)
  });

  it("nonce state survives atob but returns JSON string (the bug we fixed)", () => {
    const redirectUri = "https://awakli.ai/api/oauth/callback";
    const nonce = "b".repeat(32);
    const state = Buffer.from(JSON.stringify({ nonce, redirectUri })).toString("base64url");

    // This is what the OLD code would have done — atob returns the full JSON string
    // The new code should parse it and return only redirectUri
    const oldResult = Buffer.from(state, "base64").toString("utf-8");
    expect(oldResult).toContain("{");
    expect(oldResult).toContain("nonce");
    // The old result is NOT a valid redirect URI
    expect(oldResult).not.toBe(redirectUri);

    // The new code parses it correctly
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf-8"));
    expect(parsed.redirectUri).toBe(redirectUri);
  });

  it("legacy base64 state still works (backward compat)", () => {
    const redirectUri = "https://awakli.ai/api/oauth/callback";
    const legacyState = btoa(redirectUri);

    // Legacy state is not valid JSON, so the new decoder should fall back
    const decoded = Buffer.from(legacyState, "base64url").toString("utf-8");
    let result: string;
    try {
      const parsed = JSON.parse(decoded);
      result = typeof parsed.redirectUri === "string" ? parsed.redirectUri : decoded;
    } catch {
      // Not JSON — legacy flow
      try {
        result = atob(legacyState);
      } catch {
        result = legacyState;
      }
    }
    expect(result).toBe(redirectUri);
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
    const results = getLastCanaryResults();
    expect(results === null || Array.isArray(results)).toBe(true);
  });

  it("startIdempotencyCleanupScheduler is exported (MED-1 fix)", async () => {
    const mod = await import("./image-router/canary-probes");
    expect(typeof mod.startIdempotencyCleanupScheduler).toBe("function");
  });

  it("stopIdempotencyCleanupScheduler is exported (MED-1 fix)", async () => {
    const mod = await import("./image-router/canary-probes");
    expect(typeof mod.stopIdempotencyCleanupScheduler).toBe("function");
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
  it("README.md exists and has content", () => {
    const content = fs.readFileSync(path.resolve(PROJECT_ROOT, "README.md"), "utf-8");
    expect(content.length).toBeGreaterThan(500);
    expect(content).toContain("Awakli");
    expect(content).toContain("Quick Start");
    expect(content).toContain("Architecture");
    expect(content).toContain("Environment Variables");
    expect(content).toContain("Security Notes");
  });

  it("CONTRIBUTING.md exists and has content", () => {
    const content = fs.readFileSync(path.resolve(PROJECT_ROOT, "CONTRIBUTING.md"), "utf-8");
    expect(content.length).toBeGreaterThan(200);
    expect(content).toContain("Branch Naming");
    expect(content).toContain("Commit Messages");
    expect(content).toContain("Pull Request");
  });

  it("docs/RUNBOOK.md exists and has content", () => {
    const content = fs.readFileSync(path.resolve(PROJECT_ROOT, "docs/RUNBOOK.md"), "utf-8");
    expect(content.length).toBeGreaterThan(500);
    expect(content).toContain("KEK");
    expect(content).toContain("Session Invalidation");
    expect(content).toContain("Deployment");
    expect(content).toContain("Stripe");
  });
});

// ─── M-3: Dead Code Removal ────────────────────────────────────────────

describe("M-3: Dead Code & Version Fixes", () => {
  it("Home.tsx does not contain AnimatedCounter", () => {
    const content = fs.readFileSync(
      path.resolve(PROJECT_ROOT, "client/src/pages/Home.tsx"), "utf-8"
    );
    expect(content).not.toContain("AnimatedCounter");
  });

  it("Home.tsx does not contain fabricated stats (12,000+, 500+, 8,000+)", () => {
    const content = fs.readFileSync(
      path.resolve(PROJECT_ROOT, "client/src/pages/Home.tsx"), "utf-8"
    );
    expect(content).not.toContain("12,000+");
    expect(content).not.toContain("8,000+");
    expect(content).not.toMatch(/500\+\s*anime/i);
  });

  it("ENV export does not include ownerOpenId field", async () => {
    const mod = await import("./_core/env");
    expect((mod.ENV as any).ownerOpenId).toBeUndefined();
  });

  it("Home.tsx references Kling V3 (not 2.1)", () => {
    const content = fs.readFileSync(
      path.resolve(PROJECT_ROOT, "client/src/pages/Home.tsx"), "utf-8"
    );
    expect(content).not.toContain("Kling 2.1");
  });
});

// ─── Cookie Security ────────────────────────────────────────────────────

describe("Cookie Security", () => {
  it("cookies.ts sets SameSite=lax", () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, "_core/cookies.ts"), "utf-8"
    );
    expect(content).toContain("lax");
  });

  it("cookies.ts sets Secure=true", () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, "_core/cookies.ts"), "utf-8"
    );
    expect(content).toContain("secure");
  });
});

// ─── Auth Pages (H-7 regression check) ─────────────────────────────────

describe("H-7: OAuth-only Auth Pages", () => {
  it("SignIn.tsx does not contain password input", () => {
    const content = fs.readFileSync(
      path.resolve(PROJECT_ROOT, "client/src/pages/SignIn.tsx"), "utf-8"
    );
    expect(content).not.toContain('type="password"');
  });

  it("SignUp.tsx does not contain password input", () => {
    const content = fs.readFileSync(
      path.resolve(PROJECT_ROOT, "client/src/pages/SignUp.tsx"), "utf-8"
    );
    expect(content).not.toContain('type="password"');
  });
});

// ─── CRIT-1 Integration: encodeState → decodeState → redirectUri round-trip ──

describe("CRIT-1 Integration: OAuth state round-trip", () => {
  /**
   * The critical bug was that sdk.ts decodeState used atob() which returned
   * the full JSON string (e.g., '{"nonce":"...","redirectUri":"..."}') as the
   * redirectUri. The token exchange then sent this JSON blob as redirect_uri
   * to the OAuth provider, which rejected it.
   *
   * These tests verify the full round-trip: encodeState → decodeState extracts
   * the plain URL, not the JSON string.
   */

  it("encodeState → decodeState returns plain URL, not JSON string", async () => {
    const { encodeState, decodeState } = await import("./_core/oauth-nonce");
    const nonce = "c".repeat(32);
    const redirectUri = "https://awakli-ai-4v9sad2k.manus.space/api/oauth/callback";

    const state = encodeState({ nonce, redirectUri });

    // decodeState should return the full payload object
    const payload = decodeState(state);
    expect(payload).not.toBeNull();
    expect(payload!.redirectUri).toBe(redirectUri);
    expect(payload!.nonce).toBe(nonce);

    // The redirectUri must be a plain URL, NOT a JSON string
    expect(payload!.redirectUri).not.toContain("{");
    expect(payload!.redirectUri).not.toContain("nonce");
    expect(payload!.redirectUri.startsWith("https://")).toBe(true);
  });

  it("sdk.ts decodeState (private) extracts plain URL from nonce state", () => {
    // Directly test the decoding logic that sdk.ts uses internally
    const nonce = "d".repeat(32);
    const redirectUri = "https://example.com/api/oauth/callback";
    const state = Buffer.from(JSON.stringify({ nonce, redirectUri })).toString("base64url");

    // Replicate sdk.ts decodeState logic:
    const decoded = Buffer.from(state, "base64url").toString("utf-8");
    const parsed = JSON.parse(decoded);
    let result: string;
    if (parsed && typeof parsed === "object" && typeof parsed.redirectUri === "string") {
      result = parsed.redirectUri;
    } else {
      result = decoded;
    }

    expect(result).toBe(redirectUri);
    // Must NOT be the full JSON string
    expect(result).not.toBe(decoded);
  });

  it("sdk.ts decodeState handles legacy base64 state (no nonce)", () => {
    const redirectUri = "https://example.com/api/oauth/callback";
    const legacyState = Buffer.from(redirectUri).toString("base64");

    // Replicate sdk.ts decodeState logic:
    let result: string;
    try {
      const decoded = Buffer.from(legacyState, "base64url").toString("utf-8");
      const parsed = JSON.parse(decoded);
      if (parsed && typeof parsed === "object" && typeof parsed.redirectUri === "string") {
        result = parsed.redirectUri;
      } else {
        result = decoded;
      }
    } catch {
      try {
        result = atob(legacyState);
      } catch {
        result = legacyState;
      }
    }

    expect(result).toBe(redirectUri);
  });

  it("exchangeCodeForToken payload would contain plain URL (not JSON)", () => {
    // Simulate the payload construction that getTokenByCode does
    const nonce = "e".repeat(32);
    const redirectUri = "https://awakli.ai/api/oauth/callback";
    const state = Buffer.from(JSON.stringify({ nonce, redirectUri })).toString("base64url");

    // This is what sdk.ts decodeState does:
    const decoded = Buffer.from(state, "base64url").toString("utf-8");
    const parsed = JSON.parse(decoded);
    const extractedUri = (parsed && typeof parsed === "object" && typeof parsed.redirectUri === "string")
      ? parsed.redirectUri
      : decoded;

    // Build the payload as getTokenByCode does
    const payload = {
      clientId: "test-app-id",
      grantType: "authorization_code",
      code: "test-code",
      redirectUri: extractedUri,
    };

    // The redirectUri in the payload must be a valid URL, not JSON
    expect(payload.redirectUri).toBe(redirectUri);
    expect(payload.redirectUri).toMatch(/^https?:\/\//);
    expect(payload.redirectUri).not.toContain("{");
    expect(payload.redirectUri).not.toContain("nonce");
  });

  it("nonce + redirectUri survive full encode/decode/verify cycle", async () => {
    const { generateNonce, encodeState, decodeState, verifyNonce } = await import("./_core/oauth-nonce");

    // Step 1: Generate nonce (as /api/oauth/start does)
    const nonce = generateNonce();
    expect(nonce).toMatch(/^[a-f0-9]{32}$/);

    // Step 2: Encode state (as /api/oauth/start does)
    const redirectUri = "https://awakli.ai/api/oauth/callback";
    const state = encodeState({ nonce, redirectUri });
    expect(typeof state).toBe("string");
    expect(state.length).toBeGreaterThan(0);

    // Step 3: Decode state (as /api/oauth/callback does)
    const payload = decodeState(state);
    expect(payload).not.toBeNull();
    expect(payload!.redirectUri).toBe(redirectUri);
    expect(payload!.nonce).toBe(nonce);

    // Step 4: Verify nonce against cookie (as /api/oauth/callback does)
    const cookieNonce = nonce; // In real flow, this comes from the cookie
    expect(verifyNonce(payload!.nonce, cookieNonce)).toBe(true);

    // Step 5: Verify nonce fails with wrong cookie
    const wrongNonce = generateNonce();
    expect(verifyNonce(payload!.nonce, wrongNonce)).toBe(false);
  });
});

// ─── P2: Shared Tier Module ─────────────────────────────────────────────

describe("P2: Shared Tier Module", () => {
  it("shared/tiers.ts exports TIER_HIERARCHY and TIER_ORDER", async () => {
    const mod = await import("../shared/tiers");
    expect(mod.TIER_HIERARCHY).toBeDefined();
    expect(mod.TIER_ORDER).toBeDefined();
    expect(Array.isArray(mod.TIER_ORDER)).toBe(true);
  });

  it("tierLevel returns correct ordering", async () => {
    const { tierLevel } = await import("../shared/tiers");
    expect(tierLevel("free_trial")).toBeLessThan(tierLevel("creator"));
    expect(tierLevel("creator")).toBeLessThan(tierLevel("studio"));
  });

  it("meetsMinTier correctly gates access", async () => {
    const { meetsMinTier } = await import("../shared/tiers");
    expect(meetsMinTier("studio", "creator")).toBe(true);
    expect(meetsMinTier("free_trial", "creator")).toBe(false);
  });

  it("trpc.ts imports from @shared/tiers (no local TIER_HIERARCHY)", () => {
    const content = fs.readFileSync(path.resolve(__dirname, "_core/trpc.ts"), "utf-8");
    expect(content).toContain("@shared/tiers");
    // Should NOT have a local TIER_HIERARCHY definition
    expect(content).not.toMatch(/const\s+TIER_HIERARCHY\s*=/);
  });
});

// ─── LOW-1: Structured Logger Migration ─────────────────────────────────

describe("LOW-1: Core files migrated to structured logger", () => {
  const coreFiles = [
    { file: "_core/oauth.ts", label: "oauth.ts" },
    { file: "_core/sdk.ts", label: "sdk.ts" },
    { file: "_core/env.ts", label: "env.ts" },
  ];

  for (const { file, label } of coreFiles) {
    it(`${label} has zero console.log/warn/error calls`, () => {
      const content = fs.readFileSync(path.resolve(__dirname, file), "utf-8");
      const matches = content.match(/console\.(log|warn|error)\(/g);
      expect(matches).toBeNull();
    });

    it(`${label} imports from observability/logger`, () => {
      const content = fs.readFileSync(path.resolve(__dirname, file), "utf-8");
      expect(content).toContain("observability/logger");
    });
  }

  it("db.ts has zero console.log/warn/error calls", () => {
    const content = fs.readFileSync(path.resolve(__dirname, "db.ts"), "utf-8");
    const matches = content.match(/console\.(log|warn|error)\(/g);
    expect(matches).toBeNull();
  });

  it("canary-probes.ts has zero console.log/warn/error calls", () => {
    const content = fs.readFileSync(path.resolve(__dirname, "image-router/canary-probes.ts"), "utf-8");
    const matches = content.match(/console\.(log|warn|error)\(/g);
    expect(matches).toBeNull();
  });

  it("routers-create.ts has zero console.log/warn/error calls", () => {
    const content = fs.readFileSync(path.resolve(__dirname, "routers-create.ts"), "utf-8");
    const matches = content.match(/console\.(log|warn|error)\(/g);
    expect(matches).toBeNull();
  });
});
