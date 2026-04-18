import { describe, it, expect } from "vitest";

describe("Runware API Key Validation", () => {
  it("RUNWARE_API_KEY is set in environment", () => {
    const key = process.env.RUNWARE_API_KEY;
    expect(key).toBeTruthy();
    expect(typeof key).toBe("string");
    expect(key!.length).toBeGreaterThan(10);
  });

  it("RUNWARE_API_KEY has valid format", () => {
    const key = process.env.RUNWARE_API_KEY!;
    // Runware keys are alphanumeric strings
    expect(/^[a-zA-Z0-9]+$/.test(key)).toBe(true);
  });

  it("Runware API key authenticates successfully", async () => {
    const key = process.env.RUNWARE_API_KEY;
    if (!key) {
      console.warn("RUNWARE_API_KEY not set, skipping live validation");
      return;
    }

    // Use a lightweight WebSocket connection test to validate the key
    // Runware uses WebSocket API, so we test with a simple HTTP request to their REST endpoint
    const response = await fetch("https://api.runware.ai/v1", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify([
        {
          taskType: "authentication",
          apiKey: key,
        },
      ]),
    });

    // A valid key should not return 401/403
    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(403);
  });
});
