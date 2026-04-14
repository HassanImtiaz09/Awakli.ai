import { describe, it, expect } from "vitest";

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
const BASE_URL = "https://api.minimax.io/v1";

describe("MiniMax Music API Key Validation", () => {
  it("should have MINIMAX_API_KEY set", () => {
    expect(MINIMAX_API_KEY).toBeDefined();
    expect(MINIMAX_API_KEY!.length).toBeGreaterThan(10);
  });

  it("should authenticate and generate lyrics", async () => {
    const res = await fetch(`${BASE_URL}/lyrics_generation`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MINIMAX_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "write_full_song",
        prompt: "A short test song about coding",
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.base_resp.status_code).toBe(0);
    expect(data.song_title).toBeDefined();
    expect(data.lyrics).toBeDefined();
    expect(data.style_tags).toBeDefined();
    console.log("Lyrics generated:", data.song_title);
    console.log("Style tags:", data.style_tags);
  }, 30000);

  it("should generate instrumental music with free model", async () => {
    const res = await fetch(`${BASE_URL}/music_generation`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MINIMAX_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "music-2.6-free",
        prompt: "short upbeat electronic jingle, 10 seconds",
        is_instrumental: true,
        output_format: "url",
        audio_setting: {
          sample_rate: 44100,
          bitrate: 256000,
          format: "mp3",
        },
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.base_resp.status_code).toBe(0);
    expect(data.extra_info).toBeDefined();
    expect(data.extra_info.music_duration).toBeGreaterThan(0);
    console.log("Music duration:", data.extra_info.music_duration, "ms");
    console.log("Music size:", data.extra_info.music_size, "bytes");
    if (data.data?.audio) {
      console.log("Audio URL/data received:", typeof data.data.audio === "string" ? data.data.audio.substring(0, 80) + "..." : "hex data");
    }
  }, 120000);
});
