import { describe, it, expect, vi } from "vitest";
import {
  textToSpeech,
  listVoices,
  getVoice,
  browseSharedVoices,
  getSubscription,
  getRemainingCharacters,
  generateAndUploadVoice,
  MODELS,
  VOICE_PRESETS,
} from "./elevenlabs";

describe("ElevenLabs Integration", () => {
  it("should list available voices", async () => {
    const voices = await listVoices();
    expect(Array.isArray(voices)).toBe(true);
    expect(voices.length).toBeGreaterThan(0);
    expect(voices[0]).toHaveProperty("voice_id");
    expect(voices[0]).toHaveProperty("name");
    console.log(`Available voices: ${voices.map((v) => v.name).join(", ")}`);
  });

  it("should get a specific voice by ID", async () => {
    const voices = await listVoices();
    if (voices.length === 0) return;
    const voice = await getVoice(voices[0].voice_id);
    expect(voice.voice_id).toBe(voices[0].voice_id);
    expect(voice.name).toBe(voices[0].name);
  });

  it("should browse shared voices with filters", async () => {
    const result = await browseSharedVoices({
      gender: "male",
      page_size: 5,
      sort: "trending",
    });
    expect(result).toHaveProperty("voices");
    expect(Array.isArray(result.voices)).toBe(true);
    console.log(
      `Shared voices (male, trending): ${result.voices.map((v) => v.name).join(", ")}`
    );
  });

  it("should get subscription info", async () => {
    const sub = await getSubscription();
    expect(sub).toHaveProperty("tier");
    expect(sub).toHaveProperty("character_count");
    expect(sub).toHaveProperty("character_limit");
    console.log(`Tier: ${sub.tier}, Characters: ${sub.character_count}/${sub.character_limit}`);
  });

  it("should get remaining characters", async () => {
    const remaining = await getRemainingCharacters();
    expect(remaining).toHaveProperty("used");
    expect(remaining).toHaveProperty("limit");
    expect(remaining).toHaveProperty("remaining");
    expect(remaining).toHaveProperty("percentUsed");
    expect(remaining.limit).toBeGreaterThan(0);
    console.log(
      `Characters: ${remaining.used}/${remaining.limit} (${remaining.percentUsed}% used, ${remaining.remaining} remaining)`
    );
  });

  it("should generate speech from text", async () => {
    const voices = await listVoices();
    if (voices.length === 0) return;

    const audioBuffer = await textToSpeech({
      voiceId: voices[0].voice_id,
      text: "Hello, this is a test of the Awakli voice generation system.",
      modelId: MODELS.TURBO_V2_5,
      voiceSettings: VOICE_PRESETS.narrator,
    });

    expect(audioBuffer).toBeInstanceOf(Buffer);
    expect(audioBuffer.length).toBeGreaterThan(1000); // Should be a real audio file
    console.log(`Generated audio: ${audioBuffer.length} bytes`);
  });

  it("should export MODELS and VOICE_PRESETS correctly", () => {
    expect(MODELS.MULTILINGUAL_V2).toBe("eleven_multilingual_v2");
    expect(MODELS.TURBO_V2_5).toBe("eleven_turbo_v2_5");
    expect(VOICE_PRESETS.narrator).toHaveProperty("stability");
    expect(VOICE_PRESETS.heroic).toHaveProperty("similarity_boost");
  });
});
