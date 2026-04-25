/**
 * F1 — Mira Action Close-Up Reference Images
 * 
 * Generates two new reference images for action slices (11, 13, 14):
 *   1. mira_action_closeup — Mira in action pose, close-up, matching her canonical look
 *   2. mira_action_clean — Mira in action, wider shot, no weapons
 * 
 * Then creates pilot-3min-script-16x9-v5.json with:
 *   - New reference images for slices 11, 13, 14
 *   - Updated _meta.referenceImages with new action refs
 * 
 * Canonical Mira: silver-white hair with cerulean blue tips in ponytail,
 *   glowing BLUE eyes (cyan-blue iris), mechanical LEFT arm only with amber energy lines,
 *   navy sailor uniform, petite build
 * 
 * Usage: npx tsx server/benchmarks/generate-mira-action-refs-p11.ts
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

async function generateImage(prompt: string, label: string): Promise<string> {
  console.log(`\n--- Generating: ${label} ---`);
  console.log(`  Prompt: ${prompt.slice(0, 120)}...`);

  const start = Date.now();
  const result = await fal.subscribe("fal-ai/flux-pro/v1.1", {
    input: {
      prompt,
      image_size: { width: 1280, height: 720 },
      num_images: 1,
    },
    logs: false,
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const data = (result as any).data || result;

  if (!data?.images?.[0]?.url) {
    throw new Error(`No image URL in response: ${JSON.stringify(data).substring(0, 200)}`);
  }

  const url = data.images[0].url;
  console.log(`  ✅ Generated in ${elapsed}s: ${url}`);
  return url;
}

async function main() {
  ensureFalConfigured();

  console.log("=== F1: Mira Action Close-Up Reference Images ===\n");

  // 1. Mira action close-up (for dialogue-adjacent action slices)
  const closeupUrl = await generateImage(
    `Close-up action portrait of a young anime girl named Mira in dynamic running pose. Silver-white hair with cerulean blue tips pulled back in a ponytail streaming behind her. Glowing BLUE eyes (cyan-blue iris, vivid and bright). Mechanical LEFT arm only (right arm is normal human arm) with amber energy lines pulsing along the prosthetic joints. Navy sailor uniform with wind-blown collar. Underground cyberpunk passage with neon reflections. Motion blur, speed lines. Cinematic 2D anime style, dramatic lighting, 16:9 widescreen. No weapons, no swords.`,
    "mira_action_closeup"
  );

  // 2. Mira action clean (wider shot, for stylised action slices)
  const cleanUrl = await generateImage(
    `Dynamic wide action shot of a young anime girl named Mira leaping through a cyberpunk underground corridor. Silver-white hair with cerulean blue tips in ponytail, flowing behind her. Glowing BLUE eyes (cyan-blue iris). Her mechanical LEFT arm (right arm is normal human) radiates amber energy in a defensive shield pose. Navy sailor uniform. Neon-lit tunnel with pipes and holographic signs. Speed lines, motion blur, energy particles. Cinematic 2D anime style, extreme dynamic composition, 16:9 widescreen. No weapons, no blades.`,
    "mira_action_clean"
  );

  // 3. Create v5 fixture from v3
  const v3Path = path.join(__dirname, "fixtures", "pilot-3min-script-16x9-v3.json");
  const script = JSON.parse(fs.readFileSync(v3Path, "utf-8"));

  // Update meta
  script._meta.version = "1.5.0";
  script._meta.description += " V5: Mira-specific action reference images for slices 11/13/14, eye-colour reinforcement.";
  script._meta.referenceImages.mira_action_closeup = closeupUrl;
  script._meta.referenceImages.mira_action_clean = cleanUrl;

  // Update action slices to use Mira-specific references
  const actionSliceIds = [11, 13, 14];
  for (const slice of script.slices) {
    if (actionSliceIds.includes(slice.sliceId)) {
      const oldRef = slice.referenceImage;
      // Slice 11 and 14 are action/tracking — use closeup
      // Slice 13 is stylised_action — use clean wide shot
      if (slice.sliceId === 13) {
        slice.referenceImage = cleanUrl;
      } else {
        slice.referenceImage = closeupUrl;
      }
      console.log(`\n  Updated slice ${slice.sliceId} (${slice.type}):`);
      console.log(`    Old ref: ${oldRef.slice(0, 60)}...`);
      console.log(`    New ref: ${slice.referenceImage.slice(0, 60)}...`);
    }
  }

  const v5Path = path.join(__dirname, "fixtures", "pilot-3min-script-16x9-v5.json");
  fs.writeFileSync(v5Path, JSON.stringify(script, null, 2));
  console.log(`\n✅ Saved v5 fixture to ${v5Path}`);
  console.log(`  mira_action_closeup: ${closeupUrl}`);
  console.log(`  mira_action_clean: ${cleanUrl}`);
}

main().catch(console.error);
