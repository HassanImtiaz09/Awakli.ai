/**
 * Fish Audio API Key Validation Tests
 * Verifies the FISH_AUDIO_API_KEY is set, accessible via ENV, and can authenticate.
 */
import { describe, it, expect } from "vitest";

describe("Fish Audio API Key Validation", () => {
  it("FISH_AUDIO_API_KEY environment variable is set", () => {
    const key = process.env.FISH_AUDIO_API_KEY ?? "";
    expect(key.length).toBeGreaterThan(0);
  });

  it("FISH_AUDIO_API_KEY is a 32-char hex string", () => {
    const key = process.env.FISH_AUDIO_API_KEY ?? "";
    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });

  it("FISH_AUDIO_API_KEY is accessible via ENV config", async () => {
    const { ENV } = await import("./_core/env");
    expect(ENV.fishAudioApiKey).toBeTruthy();
    expect(ENV.fishAudioApiKey.length).toBe(32);
  });

  it("can authenticate with Fish Audio API", async () => {
    const key = process.env.FISH_AUDIO_API_KEY ?? "";
    if (!key) {
      console.warn("FISH_AUDIO_API_KEY not set, skipping live API test");
      return;
    }

    try {
      // Use the models list endpoint to validate auth
      const response = await fetch("https://api.fish.audio/model", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${key}`,
        },
      });

      // 200 = authenticated successfully
      // 401/403 = invalid key
      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
      console.log(`Fish Audio API responded with status: ${response.status}`);
    } catch (err: any) {
      // DNS resolution may fail in sandbox environments
      if (err?.cause?.code === "ENOTFOUND") {
        console.warn("DNS resolution failed for Fish Audio - skipping live test (key format validated above)");
        return;
      }
      throw err;
    }
  });
});
