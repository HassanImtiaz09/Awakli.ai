/**
 * L1: Generate v6 fixture from v5
 *
 * Changes from v5:
 * - Insert a new stylised_action "climax" slice between slice 14 (awe) and slice 15 (resolution)
 * - Renumber subsequent slices
 * - Update meta version and description
 * - Total slices: 19 (was 18), total duration: 190s (was 180s)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const v5Path = path.join(__dirname, "fixtures", "pilot-3min-script-16x9-v5.json");
const v6Path = path.join(__dirname, "fixtures", "pilot-3min-script-16x9-v6.json");

const v5 = JSON.parse(fs.readFileSync(v5Path, "utf-8"));

// The new climax slice — inserted after slice 14 (awe/crystal reveal), before slice 15 (resolution/emotional dialogue)
const climaxSlice = {
  sliceId: 15, // will be renumbered
  type: "stylised_action",
  prompt: "The underground crystal shatters into a thousand shards of light. Mira and Ren stand back-to-back, silhouetted against the explosion of cyan and amber energy. Mira's mechanical left arm channels the crystal's power, glowing circuits pulsing bright cyan. Ren's katana catches the light, reflecting prismatic beams. Radial speed lines, lens flare, shockwave distortion. Near-monochrome cyberpunk background dissolving into pure light. Cinematic 2D anime style, extreme dynamic composition, climactic energy release.",
  duration: 10,
  audio: false,
  dialogue: null,
  referenceImage: v5._meta.referenceImages.action_clean,
  cameraAngle: "dynamic_rotating",
};

// Build v6 slices: insert climax after slice 14
const v6Slices: any[] = [];
for (const slice of v5.slices) {
  v6Slices.push({ ...slice });
  // After slice 14 (awe/crystal reveal), insert the new climax
  if (slice.sliceId === 14) {
    v6Slices.push(climaxSlice);
  }
}

// Renumber all slices sequentially
for (let i = 0; i < v6Slices.length; i++) {
  v6Slices[i].sliceId = i + 1;
}

// Build v6 meta
const v6 = {
  _meta: {
    ...v5._meta,
    version: "1.6.0",
    description: v5._meta.description + " V6: Added stylised_action climax slice between awe (crystal reveal) and resolution (emotional dialogue). 19 slices, 190s total.",
    totalSlices: 19,
    totalDuration: 190,
    shotDistribution: {
      silent_establishing: 5,
      silent_action: 2,
      dialogue_closeup: 10,
      stylised_action: 2, // was 1
      total: 19,
    },
  },
  slices: v6Slices,
};

fs.writeFileSync(v6Path, JSON.stringify(v6, null, 2));
console.log(`✓ v6 fixture written to ${v6Path}`);
console.log(`  Total slices: ${v6Slices.length}`);
console.log(`  Shot distribution:`);
const dist: Record<string, number> = {};
for (const s of v6Slices) {
  dist[s.type] = (dist[s.type] || 0) + 1;
}
for (const [type, count] of Object.entries(dist)) {
  console.log(`    ${type}: ${count}`);
}
console.log(`  New climax slice inserted at position ${v6Slices.findIndex((s: any) => s.prompt.includes("crystal shatters")) + 1}`);
