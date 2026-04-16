import { describe, it, expect } from "vitest";

describe("Fal.ai API Key Configuration", () => {
  it("FAL_API_KEY environment variable is set", () => {
    const key = process.env.FAL_API_KEY ?? "";
    expect(key.length).toBeGreaterThan(0);
  });

  it("FAL_API_KEY has the correct format (key_id:key_secret)", () => {
    const key = process.env.FAL_API_KEY ?? "";
    const parts = key.split(":");
    expect(parts.length).toBe(2);
    // key_id is a UUID format
    expect(parts[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    // key_secret is a hex string
    expect(parts[1]).toMatch(/^[0-9a-f]{32}$/);
  });

  it("FAL_API_KEY is accessible via ENV config", async () => {
    const { ENV } = await import("./_core/env");
    expect(ENV.falApiKey).toBeTruthy();
    expect(ENV.falApiKey.includes(":")).toBe(true);
  });

  it("can authenticate with Fal.ai API", async () => {
    const key = process.env.FAL_API_KEY ?? "";
    if (!key) {
      console.warn("FAL_API_KEY not set, skipping live API test");
      return;
    }

    try {
      // Use the queue endpoint to validate auth without running a model
      const response = await fetch("https://queue.fal.run/fal-ai/fast-sdxl", {
        method: "POST",
        headers: {
          Authorization: `Key ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: "test",
          num_inference_steps: 1,
          image_size: "square",
        }),
      });

      // 200 = queued successfully (proves key works)
      // 422 = valid auth but bad params (still proves key works)
      // 401/403 = invalid key
      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
    } catch (err: any) {
      // DNS resolution may fail in sandbox environments
      if (err?.cause?.code === "ENOTFOUND") {
        console.warn("DNS resolution failed for fal.ai - skipping live test (key format validated above)");
        return;
      }
      throw err;
    }
  });
});
