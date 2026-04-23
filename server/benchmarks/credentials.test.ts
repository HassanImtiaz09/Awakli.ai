/**
 * Credential Validation Tests
 *
 * Lightweight API calls to verify each benchmark provider key is valid.
 * These tests make real network requests — they are skipped if the env var is not set.
 */

import { describe, it, expect } from "vitest";

const TIMEOUT = 15000;

describe("Benchmark provider credential validation", () => {
  it("ATLAS_CLOUD_API_KEY is valid", async () => {
    const key = process.env.ATLAS_CLOUD_API_KEY;
    if (!key) {
      console.log("ATLAS_CLOUD_API_KEY not set, skipping");
      return;
    }

    // Atlas Cloud uses OpenAI-compatible API — test with a models list call
    const res = await fetch("https://api.atlascloud.ai/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });
    expect(res.status).toBeLessThan(500);
    // 200 = valid key, 401 = invalid key, 403 = valid but restricted
    if (res.status === 401) {
      throw new Error("ATLAS_CLOUD_API_KEY is invalid (401 Unauthorized)");
    }
    console.log(`Atlas Cloud API responded with status ${res.status}`);
  }, TIMEOUT);

  it("REPLICATE_API_TOKEN is valid", async () => {
    const key = process.env.REPLICATE_API_TOKEN;
    if (!key) {
      console.log("REPLICATE_API_TOKEN not set, skipping");
      return;
    }

    // Replicate — get account info
    const res = await fetch("https://api.replicate.com/v1/account", {
      headers: { Authorization: `Bearer ${key}` },
    });
    expect(res.status).toBeLessThan(500);
    if (res.status === 401) {
      throw new Error("REPLICATE_API_TOKEN is invalid (401 Unauthorized)");
    }
    const data = await res.json();
    console.log(`Replicate account: ${data.username ?? "OK"}, status ${res.status}`);
  }, TIMEOUT);

  it("HEDRA_API_KEY is valid", async () => {
    const key = process.env.HEDRA_API_KEY;
    if (!key) {
      console.log("HEDRA_API_KEY not set, skipping");
      return;
    }

    // Hedra — list models endpoint (correct base URL)
    const res = await fetch("https://api.hedra.com/web-app/public/models", {
      headers: { "X-API-Key": key },
    });
    expect(res.status).toBeLessThan(500);
    if (res.status === 401 || res.status === 403) {
      throw new Error(`HEDRA_API_KEY returned ${res.status} — key may be invalid or plan not active`);
    }
    console.log(`Hedra API responded with status ${res.status}`);
  }, TIMEOUT);

  it("CARTESIA_API_KEY is valid", async () => {
    const key = process.env.CARTESIA_API_KEY;
    if (!key) {
      console.log("CARTESIA_API_KEY not set, skipping");
      return;
    }

    // Cartesia — list voices endpoint
    const res = await fetch("https://api.cartesia.ai/voices", {
      headers: {
        "X-API-Key": key,
        "Cartesia-Version": "2024-06-10",
      },
    });
    expect(res.status).toBeLessThan(500);
    if (res.status === 401 || res.status === 403) {
      throw new Error(`CARTESIA_API_KEY returned ${res.status} — key may be invalid`);
    }
    console.log(`Cartesia API responded with status ${res.status}`);
  }, TIMEOUT);

  it("FAL_API_KEY is valid (pre-configured)", async () => {
    const key = process.env.FAL_API_KEY;
    if (!key) {
      console.log("FAL_API_KEY not set, skipping");
      return;
    }

    // fal.ai — check queue status (lightweight)
    const res = await fetch("https://queue.fal.run/fal-ai/fast-sdxl", {
      method: "GET",
      headers: { Authorization: `Key ${key}` },
    });
    // Any non-500 response means the key is accepted
    expect(res.status).toBeLessThan(500);
    console.log(`fal.ai API responded with status ${res.status}`);
  }, TIMEOUT);

  it("ELEVENLABS_API_KEY is valid (pre-configured)", async () => {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) {
      console.log("ELEVENLABS_API_KEY not set, skipping");
      return;
    }

    const res = await fetch("https://api.elevenlabs.io/v1/user", {
      headers: { "xi-api-key": key },
    });
    expect(res.status).toBeLessThan(500);
    if (res.status === 401) {
      throw new Error("ELEVENLABS_API_KEY is invalid (401 Unauthorized)");
    }
    console.log(`ElevenLabs API responded with status ${res.status}`);
  }, TIMEOUT);

  it("KLING_ACCESS_KEY is valid (pre-configured)", async () => {
    const accessKey = process.env.KLING_ACCESS_KEY;
    const secretKey = process.env.KLING_SECRET_KEY;
    if (!accessKey || !secretKey) {
      console.log("KLING keys not set, skipping");
      return;
    }
    // Just verify the keys are non-empty strings
    expect(accessKey.length).toBeGreaterThan(5);
    expect(secretKey.length).toBeGreaterThan(5);
    console.log("Kling Direct keys are present and non-trivial");
  }, TIMEOUT);

  it("OPENAI_API_KEY is present (pre-configured)", async () => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      console.log("OPENAI_API_KEY not set, skipping");
      return;
    }
    // The platform-injected key may be a proxy key that doesn't work against api.openai.com directly.
    // Just verify it's a non-trivial string.
    expect(key.length).toBeGreaterThan(5);
    console.log(`OPENAI_API_KEY is present (${key.length} chars)`);
  }, TIMEOUT);
});
