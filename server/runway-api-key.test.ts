/**
 * Runway Gen-4 API Key Validation Tests
 * Validates the RUNWAY_API_KEY is configured and can authenticate with Runway's API.
 */
import { describe, it, expect } from "vitest";

const RUNWAY_API_KEY = process.env.RUNWAY_API_KEY ?? "";
const BASE_URL = "https://api.dev.runwayml.com/v1";

describe("Runway Gen-4 API Key Validation", () => {
  it("should have RUNWAY_API_KEY set in environment", () => {
    expect(RUNWAY_API_KEY).toBeTruthy();
    expect(RUNWAY_API_KEY.length).toBeGreaterThan(10);
    expect(RUNWAY_API_KEY.startsWith("key_")).toBe(true);
  });

  it("should authenticate with Runway API", async () => {
    if (!RUNWAY_API_KEY) {
      console.warn("RUNWAY_API_KEY not set, skipping live auth test");
      return;
    }

    // Use a lightweight endpoint to verify auth — list tasks or similar
    const res = await fetch(`${BASE_URL}/tasks`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${RUNWAY_API_KEY}`,
        "X-Runway-Version": "2024-11-06",
      },
    });

    // 200 = success, 401 = bad key, other = API issue
    // We accept 200 or any non-401 status as the key being valid
    expect(res.status).not.toBe(401);
    console.log(`Runway API auth check: status ${res.status}`);
  });

  it("should resolve via registry ENV fallback for runway_gen4", async () => {
    if (!RUNWAY_API_KEY) return;

    await import("./provider-router/adapters/runway-gen4");
    const { getActiveApiKey } = await import("./provider-router/registry");
    const result = await getActiveApiKey("runway_gen4");
    expect(result).not.toBeNull();
    if (result && result.id === -1) {
      expect(result.decryptedKey).toBe(RUNWAY_API_KEY);
    }
  });

  it("should have runway_gen4 adapter registered", async () => {
    await import("./provider-router/adapters/runway-gen4");
    const { hasAdapter, getAdapter } = await import("./provider-router/registry");
    expect(hasAdapter("runway_gen4")).toBe(true);
    const adapter = getAdapter("runway_gen4");
    expect(adapter).toBeDefined();
    expect(adapter!.providerId).toBe("runway_gen4");
  });
});
