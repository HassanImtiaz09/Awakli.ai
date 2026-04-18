import { describe, it, expect } from "vitest";

describe("TensorArt API Key Validation", () => {
  it("TENSORART_API_KEY is set in environment", () => {
    const key = process.env.TENSORART_API_KEY;
    expect(key).toBeTruthy();
    expect(typeof key).toBe("string");
    expect(key!.length).toBeGreaterThan(10);
  });

  it("TENSORART_API_KEY has valid UUID format", () => {
    const key = process.env.TENSORART_API_KEY!;
    // TensorArt keys follow UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(uuidRegex.test(key)).toBe(true);
  });

  it("TensorArt API key authenticates successfully", async () => {
    const key = process.env.TENSORART_API_KEY;
    if (!key) {
      console.warn("TENSORART_API_KEY not set, skipping live validation");
      return;
    }

    // Use a lightweight endpoint to validate the key
    const response = await fetch("https://api.tensor.art/v1/user/info", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
    });

    // A valid key should not return 401/403
    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(403);
  });
});
