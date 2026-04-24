/**
 * Regenerate the 3 pilot reference panels at 16:9 (1280x720) using fal.ai Flux.
 * This fixes:
 * 1. Letterboxing/pillarboxing from 1:1 images
 * 2. Wan 2.5 422 errors on action images (likely caused by square aspect ratio)
 * 
 * Usage: npx tsx server/benchmarks/regen-panels-16x9.ts
 */

import { fal } from "@fal-ai/client";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure fal.ai
function ensureFalConfigured(): void {
  const key = process.env.FAL_API_KEY;
  if (!key) throw new Error("FAL_API_KEY not set");
  fal.config({ credentials: key });
}

interface PanelSpec {
  name: string;
  prompt: string;
  /** Original 1:1 URL for reference */
  original_url: string;
}

const PANELS: PanelSpec[] = [
  {
    name: "establishing",
    original_url: "https://v3b.fal.media/files/b/0a977f41/-UlETqlRvCmCgdZsuKIqR_shot1_establishing_v4.png",
    prompt: `Wide cinematic panorama of Neo-Kyoto bay at sunrise, neon-lit skyscrapers reflected in dark harbour water, traditional pagoda silhouette among futuristic towers, cargo drones crossing the sky. Heavy morning mist, pink and amber light. Cinematic 2D anime style, detailed background art, widescreen composition. 16:9 aspect ratio, no black bars.`,
  },
  {
    name: "dialogue",
    original_url: "https://v3b.fal.media/files/b/0a977f42/WwhqUYCNKEbSkW9FS6Suo_shot2_dialogue_v2.png",
    prompt: `Close-up two-shot of two anime characters facing each other on a neon-lit rooftop at night. Left: young man with dark spiky hair, wearing a dark jacket, katana strapped to his back. Right: young woman with silver-white hair, glowing amber mechanical left arm (prosthetic), wearing a tech-enhanced outfit. Neo-Kyoto cityscape in background with neon signs and holographic billboards. Cinematic 2D anime style, dramatic lighting, widescreen composition. 16:9 aspect ratio.`,
  },
  {
    name: "action",
    original_url: "https://v3b.fal.media/files/b/0a977f42/d-B6Quj2YVLjykmKkKuQQ_shot3_action_v2.png",
    prompt: `Dynamic action shot of a young woman with silver-white hair running through an underground cyberpunk passage, her glowing amber mechanical left arm raised, speed lines and motion blur. Flickering neon lights, wet concrete floor, sparks flying. Cinematic 2D anime style, high energy composition, widescreen format. 16:9 aspect ratio, no black bars.`,
  },
];

async function generatePanel(spec: PanelSpec): Promise<string> {
  console.log(`\n[Panel: ${spec.name}] Generating at 1280x720 (16:9)...`);
  console.log(`  Prompt: ${spec.prompt.substring(0, 100)}...`);
  
  const start = Date.now();
  
  const result = await fal.subscribe("fal-ai/flux/dev", {
    input: {
      prompt: spec.prompt,
      image_size: {
        width: 1280,
        height: 720,
      },
      num_images: 1,
      num_inference_steps: 28,
      guidance_scale: 3.5,
    },
    logs: false,
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const data = (result as any).data || result;
  
  if (!data?.images?.[0]?.url) {
    throw new Error(`No image URL in response for ${spec.name}: ${JSON.stringify(data).substring(0, 200)}`);
  }

  const url = data.images[0].url;
  console.log(`  ✓ Generated in ${elapsed}s: ${url}`);
  return url;
}

async function main() {
  ensureFalConfigured();
  console.log("=== Regenerating 3 reference panels at 16:9 (1280x720) ===\n");
  
  const results: Record<string, string> = {};
  
  for (const panel of PANELS) {
    try {
      results[panel.name] = await generatePanel(panel);
    } catch (err: any) {
      console.error(`  ✗ FAILED: ${err.message}`);
    }
  }

  console.log("\n=== RESULTS ===");
  for (const [name, url] of Object.entries(results)) {
    console.log(`  ${name}: ${url}`);
  }

  // Save results to JSON for the next step
  const outPath = path.join(__dirname, "fixtures", "panels-16x9.json");
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nSaved to ${outPath}`);
  
  // Now update the pilot script with new reference images
  const scriptPath = path.join(__dirname, "fixtures", "pilot-3min-script.json");
  const script = JSON.parse(fs.readFileSync(scriptPath, "utf-8"));
  
  const oldToNew: Record<string, string> = {};
  for (const panel of PANELS) {
    if (results[panel.name]) {
      oldToNew[panel.original_url] = results[panel.name];
    }
  }

  let updated = 0;
  for (const slice of script.slices) {
    if (oldToNew[slice.referenceImage]) {
      slice.referenceImage = oldToNew[slice.referenceImage];
      updated++;
    }
  }

  // Update meta
  if (script._meta?.referenceImages) {
    for (const [key, val] of Object.entries(script._meta.referenceImages)) {
      if (typeof val === 'string' && oldToNew[val]) {
        script._meta.referenceImages[key] = oldToNew[val];
      }
    }
  }

  // Save updated script as v2
  const v2Path = path.join(__dirname, "fixtures", "pilot-3min-script-16x9.json");
  fs.writeFileSync(v2Path, JSON.stringify(script, null, 2));
  console.log(`\nUpdated ${updated} slice references in ${v2Path}`);
}

main().catch(console.error);
