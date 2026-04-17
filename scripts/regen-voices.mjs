import 'dotenv/config';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const BASE_URL = "https://api.elevenlabs.io/v1";

// Storage upload
const FORGE_API_URL = process.env.BUILT_IN_FORGE_API_URL;
const FORGE_API_KEY = process.env.BUILT_IN_FORGE_API_KEY;

if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY not set");

async function apiRequest(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ElevenLabs ${res.status}: ${body}`);
  }
  return res;
}

async function listVoices() {
  const res = await apiRequest("/voices");
  const data = await res.json();
  return data.voices;
}

async function textToSpeech(voiceId, text, voiceSettings = {}) {
  const settings = {
    stability: 0.55,        // Slightly higher for consistency
    similarity_boost: 0.85, // High similarity for consistency
    style: 0.25,            // Some expressiveness for anime
    use_speaker_boost: true,
    ...voiceSettings,
  };

  const res = await apiRequest(
    `/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: settings,
      }),
    }
  );

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function appendHashSuffix(relKey) {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const segmentStart = relKey.lastIndexOf("/");
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1 || lastDot <= segmentStart) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

async function uploadToS3(relKey, buffer, contentType) {
  const key = appendHashSuffix(relKey.replace(/^\/+/, ""));
  const baseUrl = FORGE_API_URL.endsWith("/") ? FORGE_API_URL : FORGE_API_URL + "/";
  const uploadUrl = new URL("v1/storage/upload", baseUrl);
  uploadUrl.searchParams.set("path", key);

  const blob = new Blob([buffer], { type: contentType });
  const formData = new FormData();
  formData.append("file", blob, key.split("/").pop());

  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${FORGE_API_KEY}` },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`S3 upload failed (${res.status}): ${errText}`);
  }
  const data = await res.json();
  return data.url;
}

// Panel dialogue data (all Kael)
const panels = [
  { id: 1, scene: 1, text: "Another day. Another hunt. Always the same.", emotion: "thought", cam: "wide" },
  { id: 2, scene: 1, text: "Is this all there is? This small world, these familiar mountains?", emotion: "thought", cam: "medium" },
  { id: 3, scene: 1, text: "I know there's more out there. I feel it.", emotion: "thought", cam: "close-up" },
  { id: 4, scene: 2, text: "Almost got it... a rare Shadow-Deer.", emotion: "focused", cam: "medium" },
  { id: 5, scene: 2, text: "What's that? The air... it feels strange here.", emotion: "curious", cam: "medium" },
  { id: 6, scene: 2, text: "A hidden cave? I've never seen this before.", emotion: "surprised", cam: "wide" },
  { id: 7, scene: 3, text: "Incredible... what is this place?", emotion: "awe", cam: "medium" },
  { id: 8, scene: 3, text: "A sword... it calls to me.", emotion: "thought", cam: "wide" },
  { id: 9, scene: 3, text: "Whoa!", emotion: "shock", cam: "extreme-close-up" },
  { id: 10, scene: 3, text: "What's happening?!", emotion: "shouting", cam: "medium" },
  { id: 11, scene: 4, text: "A... a gateway?!", emotion: "gasping", cam: "wide" },
  { id: 12, scene: 4, text: "This... this is what I've been searching for.", emotion: "thought", cam: "close-up" },
  { id: 13, scene: 4, text: "My world just got a whole lot bigger.", emotion: "determined", cam: "medium" },
];

async function main() {
  // Step 1: List available voices and pick a good male voice for Kael
  console.log("Listing available voices...");
  const voices = await listVoices();
  
  console.log(`Found ${voices.length} voices:`);
  const maleVoices = [];
  for (const v of voices) {
    const gender = v.labels?.gender || "unknown";
    const age = v.labels?.age || "unknown";
    const accent = v.labels?.accent || "unknown";
    const desc = v.labels?.description || v.labels?.use_case || "";
    console.log(`  ${v.voice_id} | ${v.name} | ${v.category} | ${gender}/${age}/${accent} | ${desc}`);
    if (gender === "male") maleVoices.push(v);
  }

  // Pick the best voice for Kael (young male hero)
  // Prefer: young male, American/British accent, narrative/characters use case
  let kaelVoice = maleVoices.find(v => 
    v.labels?.age === "young" && v.labels?.use_case?.includes("characters")
  ) || maleVoices.find(v => 
    v.labels?.age === "young"
  ) || maleVoices.find(v =>
    v.name.toLowerCase().includes("adam") || v.name.toLowerCase().includes("josh")
  ) || maleVoices[0];

  if (!kaelVoice) {
    // Fallback to any voice
    kaelVoice = voices[0];
  }

  console.log(`\nSelected voice for Kael: ${kaelVoice.name} (${kaelVoice.voice_id})`);
  console.log(`Labels: ${JSON.stringify(kaelVoice.labels)}`);

  // Step 2: Generate voice clips for all 13 panels with the same voice
  console.log("\nGenerating voice clips...");
  const voiceClips = [];

  for (const panel of panels) {
    console.log(`  Panel ${panel.id}: "${panel.text.substring(0, 50)}..." (${panel.emotion})`);
    
    // Adjust voice settings based on emotion
    let settings = {};
    switch (panel.emotion) {
      case "thought":
        settings = { stability: 0.6, similarity_boost: 0.85, style: 0.15 }; // Calmer, introspective
        break;
      case "shouting":
      case "shock":
      case "gasping":
        settings = { stability: 0.35, similarity_boost: 0.85, style: 0.45 }; // More expressive
        break;
      case "awe":
      case "surprised":
        settings = { stability: 0.45, similarity_boost: 0.85, style: 0.35 };
        break;
      case "focused":
      case "curious":
        settings = { stability: 0.5, similarity_boost: 0.85, style: 0.25 };
        break;
      case "determined":
        settings = { stability: 0.45, similarity_boost: 0.85, style: 0.3 };
        break;
      default:
        settings = { stability: 0.55, similarity_boost: 0.85, style: 0.25 };
    }

    try {
      const audioBuffer = await textToSpeech(kaelVoice.voice_id, panel.text, settings);
      
      // Upload to S3
      const key = `pipeline/60005/voice-v2-panel${panel.id}-${Date.now()}.mp3`;
      const url = await uploadToS3(key, audioBuffer, "audio/mpeg");
      
      voiceClips.push({
        panelId: panel.id,
        url,
        size: audioBuffer.length,
      });
      
      console.log(`    ✓ Generated: ${audioBuffer.length} bytes → ${url.substring(0, 60)}...`);
    } catch (err) {
      console.error(`    ✗ Failed: ${err.message}`);
      voiceClips.push({ panelId: panel.id, url: null, error: err.message });
    }

    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 500));
  }

  // Output results as JSON for the next step
  const output = {
    voiceId: kaelVoice.voice_id,
    voiceName: kaelVoice.name,
    clips: voiceClips,
  };
  
  // Write to file for the assembly script to read
  const fs = await import("fs");
  fs.writeFileSync("/tmp/voice-clips-v2.json", JSON.stringify(output, null, 2));
  
  console.log("\n=== COMPLETE ===");
  console.log(`Voice: ${kaelVoice.name} (${kaelVoice.voice_id})`);
  console.log(`Generated: ${voiceClips.filter(c => c.url).length}/${panels.length} clips`);
  console.log("Output saved to /tmp/voice-clips-v2.json");
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
