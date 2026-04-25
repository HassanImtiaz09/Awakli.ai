/**
 * V4 Debug — Veo 3.1 Lite with verbose error logging
 */
import { fal } from "@fal-ai/client";

const key = process.env.FAL_API_KEY;
if (!key) throw new Error("FAL_API_KEY not set");
fal.config({ credentials: key });

const DIALOGUE_REF = "https://v3b.fal.media/files/b/0a97979c/GSxYn68gkCzZS2hnJCabw.jpg";
const DIALOGUE_PROMPT = "Close-up of a young woman with silver hair and glowing blue eyes, mechanical left arm with amber energy lines, speaking with determined expression. Neon-lit city street background, soft bokeh lights. Cinematic 2D anime style, detailed character animation.";

async function main() {
  console.log("=== V4 Debug: Veo 3.1 Lite ===\n");

  // First, check the image dimensions
  console.log("Checking reference image...");
  const imgResp = await fetch(DIALOGUE_REF, { method: "HEAD" });
  console.log("Image status:", imgResp.status);
  console.log("Image content-type:", imgResp.headers.get("content-type"));
  console.log("Image content-length:", imgResp.headers.get("content-length"));

  // Try the simplest possible request first
  const input = {
    prompt: DIALOGUE_PROMPT,
    image_url: DIALOGUE_REF,
    duration: "8s",
    aspect_ratio: "16:9",
    resolution: "720p",
    generate_audio: true,
    safety_tolerance: "4",
  };

  console.log("\nRequest input:", JSON.stringify(input, null, 2));

  try {
    const result = await fal.subscribe("fal-ai/veo3.1/lite/image-to-video" as any, {
      input: input as any,
      logs: true,
      pollInterval: 5000,
      onQueueUpdate: (update: any) => {
        console.log("Queue update:", update.status);
        if (update.status === "IN_PROGRESS" && update.logs) {
          update.logs.map((l: any) => l.message).forEach((m: string) => console.log("  Log:", m));
        }
      },
    });
    console.log("\nSUCCESS:", JSON.stringify(result.data, null, 2));
  } catch (err: any) {
    console.error("\nFAILED:");
    console.error("  Message:", err.message);
    console.error("  Status:", err.status);
    console.error("  Body:", JSON.stringify(err.body, null, 2));
    
    // Try to get more details
    if (err.body?.detail) {
      console.error("  Detail:", JSON.stringify(err.body.detail, null, 2));
    }
    
    // Full error object
    console.error("\n  Full error keys:", Object.keys(err));
    try {
      console.error("  Stringified:", JSON.stringify(err, null, 2));
    } catch {
      console.error("  (not JSON-serializable)");
    }
  }

  // Try a minimal request without optional params
  console.log("\n\n=== Retry with minimal params ===\n");
  const minimalInput = {
    prompt: "A woman turns to face the camera and smiles warmly.",
    image_url: DIALOGUE_REF,
  };
  console.log("Minimal input:", JSON.stringify(minimalInput, null, 2));

  try {
    const result2 = await fal.subscribe("fal-ai/veo3.1/lite/image-to-video" as any, {
      input: minimalInput as any,
      logs: true,
      pollInterval: 5000,
      onQueueUpdate: (update: any) => {
        console.log("Queue update:", update.status);
      },
    });
    console.log("\nMINIMAL SUCCESS:", JSON.stringify(result2.data, null, 2));
  } catch (err: any) {
    console.error("\nMINIMAL FAILED:");
    console.error("  Message:", err.message);
    console.error("  Status:", err.status);
    console.error("  Body:", JSON.stringify(err.body, null, 2));
  }
}

main().catch(console.error);
