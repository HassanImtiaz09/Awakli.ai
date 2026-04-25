/**
 * Generate a clean, weapon-free action reference image for slice 13 (stylised_action).
 * The current action reference image contains katana/blade imagery that triggers
 * Wan 2.5's content filter. This generates a new image focused on dynamic energy
 * and motion without weapons.
 *
 * Also creates pilot-3min-script-16x9-v3.json with:
 * 1. New action reference image for slice 13
 * 2. Further softened slice 13 prompt (no katana/blade/shield)
 *
 * Usage: npx tsx server/benchmarks/regen-action-panel-v3.ts
 */

import { fal } from "@fal-ai/client";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function ensureFalConfigured(): void {
  const key = process.env.FAL_API_KEY;
  if (!key) throw new Error("FAL_API_KEY not set");
  fal.config({ credentials: key });
}

async function main() {
  ensureFalConfigured();

  console.log("=== Generating weapon-free action reference image for slice 13 ===\n");

  // Generate a new action reference image without weapons
  const actionPrompt = `Dynamic action shot of two anime characters in an intense energy confrontation on a cyberpunk rooftop at night. Left: young man with dark spiky hair leaping through the air with cyan energy swirling around his hands. Right: young woman with silver-white hair, her glowing amber mechanical left arm radiating a powerful energy shield. Brilliant cyan and amber energy beams collide between them creating a spectacular light burst. Radial speed lines, energy shockwave rings. Neo-Kyoto cityscape background with neon lights. Cinematic 2D anime style, extreme dynamic composition, widescreen format. 16:9 aspect ratio, no black bars. No weapons, no swords, no blades.`;

  console.log(`Prompt: ${actionPrompt.substring(0, 120)}...`);

  const start = Date.now();
  const result = await fal.subscribe("fal-ai/flux/dev", {
    input: {
      prompt: actionPrompt,
      image_size: { width: 1280, height: 720 },
      num_images: 1,
      num_inference_steps: 28,
      guidance_scale: 3.5,
    },
    logs: false,
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const data = (result as any).data || result;

  if (!data?.images?.[0]?.url) {
    throw new Error(`No image URL in response: ${JSON.stringify(data).substring(0, 200)}`);
  }

  const newActionUrl = data.images[0].url;
  console.log(`✓ Generated in ${elapsed}s: ${newActionUrl}`);

  // Now create v3 fixture
  const v2Path = path.join(__dirname, "fixtures", "pilot-3min-script-16x9-v2.json");
  const script = JSON.parse(fs.readFileSync(v2Path, "utf-8"));

  // Update meta
  script._meta.version = "1.3.0";
  script._meta.description += " V3: weapon-free action reference image for slice 13, further softened prompt.";
  script._meta.referenceImages.action_clean = newActionUrl;

  // Update slice 13 with new reference image and further softened prompt
  for (const slice of script.slices) {
    if (slice.sliceId === 13) {
      slice.referenceImage = newActionUrl;
      slice.prompt = "Ren channels intense cyan energy through his outstretched hands in a dramatic arc. Mira raises her mechanical left arm, which radiates a powerful amber energy shield, meeting the energy blast. Cyan and amber light bursts radiate from the point of contact. Radial manga speed lines, shockwave ring. Near-monochrome cyberpunk background. Cinematic 2D anime style, extreme dynamic composition.";
      console.log(`\nUpdated slice 13:`);
      console.log(`  referenceImage: ${newActionUrl.slice(0, 80)}...`);
      console.log(`  prompt: ${slice.prompt.slice(0, 100)}...`);
    }
  }

  const v3Path = path.join(__dirname, "fixtures", "pilot-3min-script-16x9-v3.json");
  fs.writeFileSync(v3Path, JSON.stringify(script, null, 2));
  console.log(`\nSaved v3 fixture to ${v3Path}`);
}

main().catch(console.error);
