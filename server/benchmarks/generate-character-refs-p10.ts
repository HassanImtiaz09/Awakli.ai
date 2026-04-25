/**
 * P3: Single-Character Dialogue References
 *
 * Generates two new reference images:
 *   - dialogue_mira_closeup: Tight single-character portrait of Mira
 *   - dialogue_ren_closeup:  Tight single-character portrait of Ren
 *
 * Then creates the v4 fixture that maps each dialogue slice to the
 * correct character-specific reference image.
 *
 * Usage: npx tsx server/benchmarks/generate-character-refs-p10.ts
 */

import { fal } from "@fal-ai/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configure fal.ai
const FAL_KEY = process.env.FAL_API_KEY || process.env.FAL_KEY;
if (!FAL_KEY) {
  console.error("FAL_API_KEY not set");
  process.exit(1);
}
fal.config({ credentials: FAL_KEY as string });

// Character reference prompts — tight single-character portraits
const CHARACTER_REFS = {
  dialogue_mira_closeup: {
    prompt: "Close-up portrait of a young anime woman, silver-white hair with cerulean blue tips, glowing blue eyes, mechanical left arm with amber energy lines visible at shoulder. Navy sailor uniform collar visible. Determined expression, soft backlight. Neo-futuristic Japanese city background blurred. Cinematic 2D anime style, high detail face, 16:9 aspect ratio, 1280x720.",
    character: "Mira",
  },
  dialogue_ren_closeup: {
    prompt: "Close-up portrait of a young anime man, spiky dark hair with cyan streaks, sharp amber eyes, subtle scar on left cheek. Black tactical jacket with glowing cyan circuit patterns at collar. Confident smirk, cool blue shadows. Neo-futuristic Japanese city background blurred. Cinematic 2D anime style, high detail face, 16:9 aspect ratio, 1280x720.",
    character: "Ren",
  },
};

async function generateRef(key: string, prompt: string): Promise<string> {
  console.log(`\nGenerating ${key}...`);
  console.log(`  Prompt: ${prompt.slice(0, 100)}...`);

  const result = (await fal.subscribe("fal-ai/flux/dev", {
    input: {
      prompt,
      image_size: { width: 1280, height: 720 },
      num_inference_steps: 28,
      guidance_scale: 3.5,
      num_images: 1,
      enable_safety_checker: false,
    },
  })) as any;

  const url = result.images?.[0]?.url;
  if (!url) throw new Error(`No image URL returned for ${key}`);
  console.log(`  ✓ Generated: ${url}`);
  return url;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("P3: Generating Single-Character Dialogue Reference Images");
  console.log("═══════════════════════════════════════════════════════════════");

  // Generate both reference images
  const refs: Record<string, string> = {};
  for (const [key, config] of Object.entries(CHARACTER_REFS)) {
    refs[key] = await generateRef(key, config.prompt);
  }

  console.log("\n─── Generated References ───");
  for (const [key, url] of Object.entries(refs)) {
    console.log(`  ${key}: ${url}`);
  }

  // Load v3 fixture and create v4
  const v3Path = path.join(__dirname, "fixtures/pilot-3min-script-16x9-v3.json");
  const v3 = JSON.parse(fs.readFileSync(v3Path, "utf-8"));

  // Update _meta
  v3._meta.version = "1.4.0";
  v3._meta.description += " V4: per-character dialogue reference images (Mira closeup + Ren closeup).";
  v3._meta.referenceImages.dialogue_mira_closeup = refs.dialogue_mira_closeup;
  v3._meta.referenceImages.dialogue_ren_closeup = refs.dialogue_ren_closeup;
  v3._meta.generatedAt = new Date().toISOString().split("T")[0];

  // Map each dialogue slice to the correct character reference
  for (const slice of v3.slices) {
    if (slice.audio && slice.dialogue) {
      const character = slice.dialogue.character;
      if (character === "Mira" && refs.dialogue_mira_closeup) {
        slice.referenceImage = refs.dialogue_mira_closeup;
      } else if (character === "Ren" && refs.dialogue_ren_closeup) {
        slice.referenceImage = refs.dialogue_ren_closeup;
      }
      // Other characters keep the generic dialogue reference
    }
  }

  // Save v4 fixture
  const v4Path = path.join(__dirname, "fixtures/pilot-3min-script-16x9-v4.json");
  fs.writeFileSync(v4Path, JSON.stringify(v3, null, 2) + "\n");
  console.log(`\n✓ V4 fixture saved: ${v4Path}`);

  // Summary
  const miraSlices = v3.slices.filter((s: any) => s.dialogue?.character === "Mira").length;
  const renSlices = v3.slices.filter((s: any) => s.dialogue?.character === "Ren").length;
  console.log(`\n─── V4 Fixture Summary ───`);
  console.log(`  Mira dialogue slices: ${miraSlices} → dialogue_mira_closeup`);
  console.log(`  Ren dialogue slices:  ${renSlices} → dialogue_ren_closeup`);
  console.log(`  Silent/other slices:  ${v3.slices.length - miraSlices - renSlices} → unchanged`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
