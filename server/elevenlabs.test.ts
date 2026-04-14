import { describe, it, expect } from "vitest";

describe("ElevenLabs API Key Validation", () => {
  it("should have ELEVENLABS_API_KEY configured", () => {
    const key = process.env.ELEVENLABS_API_KEY;
    expect(key).toBeDefined();
    expect(key).not.toBe("");
    expect(key!.startsWith("sk_")).toBe(true);
  });

  it("should connect to ElevenLabs API and list voices", { timeout: 15000 }, async () => {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) {
      console.warn("ELEVENLABS_API_KEY not set, skipping API test");
      return;
    }

    const response = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: {
        "xi-api-key": key,
      },
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.voices).toBeDefined();
    expect(Array.isArray(data.voices)).toBe(true);
    expect(data.voices.length).toBeGreaterThan(0);

    // Log first voice for verification
    console.log(`ElevenLabs connected: ${data.voices.length} voices available`);
    console.log(`First voice: ${data.voices[0].name} (${data.voices[0].voice_id})`);
  });

  it("should retrieve subscription info", { timeout: 15000 }, async () => {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) return;

    const response = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
      headers: {
        "xi-api-key": key,
      },
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.tier).toBeDefined();
    console.log(`ElevenLabs tier: ${data.tier}, characters remaining: ${data.character_count}/${data.character_limit}`);
  });
});
