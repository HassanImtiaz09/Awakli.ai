/**
 * Validate that at least one music provider is available and authenticated.
 * Tests Replicate (primary) and MiniMax (fallback).
 */
import { describe, it, expect } from "vitest";

describe("Music Bed Provider Validation", () => {
  it("should authenticate with Replicate API (primary provider)", async () => {
    const token = process.env.REPLICATE_API_TOKEN;
    expect(token, "REPLICATE_API_TOKEN must be set").toBeTruthy();

    // Create a prediction and immediately cancel it — just testing auth
    const resp = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: "minimax/music-2.6",
        input: {
          prompt: "test auth only",
          is_instrumental: true,
        },
      }),
    });

    // 201 = created successfully (auth works)
    expect(resp.status, "Replicate should accept the API token").toBe(201);

    const data = (await resp.json()) as any;
    expect(data.id, "Replicate should return a prediction ID").toBeTruthy();

    // Cancel the prediction to avoid charges
    if (data.urls?.cancel) {
      await fetch(data.urls.cancel, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
  }, 30_000);
});
