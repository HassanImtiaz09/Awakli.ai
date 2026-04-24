/**
 * Fixture Panel Generator — Uses Awakli's own Stage 1 pipeline (Forge ImageService)
 * to generate the 3 benchmark reference panels from the Fixture Panel Spec v1.0.
 *
 * Usage: npx tsx server/benchmarks/generate-fixture-panels.ts [shot1|shot2|shot3|all]
 *
 * Generates 4 variations per shot. Approved panels should be saved to:
 *   server/benchmarks/fixtures/reference/shot-01-establishing.png
 *   server/benchmarks/fixtures/reference/shot-02-dialogue.png
 *   server/benchmarks/fixtures/reference/shot-03-action.png
 */

import { ENV } from "../_core/env";
import { storagePut } from "../storage";

// ─── Forge ImageService client (same as _core/imageGeneration but with more control) ───

interface GenerateResult {
  url: string;
  variationIndex: number;
  shotId: string;
}

async function generateViaForge(prompt: string, originalImages?: Array<{ url: string; mimeType: string }>): Promise<string> {
  if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
    throw new Error("BUILT_IN_FORGE_API_URL or BUILT_IN_FORGE_API_KEY not configured");
  }

  const baseUrl = ENV.forgeApiUrl.endsWith("/") ? ENV.forgeApiUrl : `${ENV.forgeApiUrl}/`;
  const fullUrl = new URL("images.v1.ImageService/GenerateImage", baseUrl).toString();

  const response = await fetch(fullUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "connect-protocol-version": "1",
      authorization: `Bearer ${ENV.forgeApiKey}`,
    },
    body: JSON.stringify({
      prompt,
      original_images: originalImages || [],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Image generation failed (${response.status}): ${detail}`);
  }

  const result = (await response.json()) as { image: { b64Json: string; mimeType: string } };
  const buffer = Buffer.from(result.image.b64Json, "base64");
  const suffix = Math.random().toString(36).slice(2, 8);
  const { url } = await storagePut(`benchmark/fixtures/${Date.now()}-${suffix}.png`, buffer, result.image.mimeType);
  return url;
}

// ─── Shot prompts from Fixture Panel Spec v1.0 ───

const SHOT_PROMPTS: Record<string, { prompt: string; description: string }> = {
  shot1: {
    description: "Wide establishing cityscape — Tsurugi Bay at dusk",
    prompt: `Wide establishing shot, cyberpunk-fusion Japanese coastal city at dusk, three-tiered pagoda in foreground centre with pulsing red signal lights, cascading tiled rooftops of old town, bay waters with neon reflections and light mist, neon skyscrapers 40-70 stories with vertical magenta/cyan/amber kanji signage in background, monorail tracks threading between towers, two capsule monorails lit from within, amber sunset breaking through overcast sky, light rain angled streaks, flock of black bird silhouettes upper-left, three light sources (amber sunset / neon / red pagoda pulses), seinen manga style, variable-weight black ink linework, screentone mid-tones, 16:9 landscape, 1920x1080, high architectural detail density, no chibi, no super-deformed`,
  },
  shot2: {
    description: "Medium dialogue shot — Ren and Mira rooftop confrontation",
    prompt: `Medium shot, two characters on traditional Japanese rooftop at dusk, cyberpunk city background slightly blurred. LEFT CHARACTER: 17yo male Ren, black undercut with exactly two crimson streaks on right side of top sweep, emerald green eyes with gold inner ring, thin scar left cheek, modified gakuran jacket black with silver circuit embroidery on collar/cuffs (glowing cyan), katana on left hip, tense urgent expression brow furrowed. RIGHT CHARACTER: 16yo female Mira, long silver-white hair with cerulean blue tips, thin braid right temple, heterochromia left gold right amber, beauty mark under right eye, navy sailor uniform with white collar gold piping red neckerchief, LEFT ARM is matte grey mechanical prosthetic with amber light-lines, prosthetic folded across chest, searching concerned expression head tilted right. Three-tiered pagoda visible over her right shoulder in background. Amber sunset key light from right, cyan rim light from city behind. Seinen manga style, variable-weight ink line, screentone shading, 16:9 landscape 1920x1080, no chibi, no super-deformed.`,
  },
  shot3: {
    description: "Close-up action — Ren's strike, Mira's shield block",
    prompt: `Close-up action shot, low-angle 30-degree tilt, dynamic swing impact moment. Teen male Ren left (black undercut with exactly two crimson streaks on right side of sweep, emerald green eyes with gold ring, scar left cheek, gakuran jacket with silver circuit embroidery glowing cyan, mid-swing with curved katana drawn diagonal upper-left to lower-right, blade glowing ice-blue, hair whipped back two red streaks trailing, focused battle intensity expression teeth slightly bared eyes narrowed). Teen female Mira right (long silver-blue-tipped hair lifting from shockwave, braid right temple, heterochromia left gold right amber, beauty mark right eye, mechanical LEFT arm hardened vertically into flat shield form glowing amber at impact point, right hand bracing elbow, precise defensive focus expression). BURST of cyan-amber sparks at katana-shield meeting point, radial speed lines from impact centre, thin concentric white shockwave ring. Near-monochrome background, distant neon bokeh, cyan+amber glow as primary light sources. Seinen manga action panel, variable-weight ink line, bold screentone for contrast, 16:9 landscape 1920x1080, no chibi, no super-deformed.`,
  },
};

// ─── Generation logic ───

const VARIATIONS_PER_SHOT = 4;

async function generateShot(shotId: string): Promise<GenerateResult[]> {
  const shot = SHOT_PROMPTS[shotId];
  if (!shot) throw new Error(`Unknown shot: ${shotId}`);

  console.log(`\n${"=".repeat(70)}`);
  console.log(`Generating ${VARIATIONS_PER_SHOT} variations for: ${shot.description}`);
  console.log(`${"=".repeat(70)}\n`);

  const results: GenerateResult[] = [];

  for (let i = 0; i < VARIATIONS_PER_SHOT; i++) {
    console.log(`  [${shotId}] Variation ${i + 1}/${VARIATIONS_PER_SHOT}...`);
    const startTime = Date.now();
    try {
      const url = await generateViaForge(shot.prompt);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`  [${shotId}] Variation ${i + 1} ✓ (${elapsed}s) → ${url}`);
      results.push({ url, variationIndex: i + 1, shotId });
    } catch (err: any) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.error(`  [${shotId}] Variation ${i + 1} ✗ (${elapsed}s) → ${err.message}`);
    }
  }

  return results;
}

async function generateShot3WithReference(shot2Url: string): Promise<GenerateResult[]> {
  const shot = SHOT_PROMPTS.shot3;
  console.log(`\n${"=".repeat(70)}`);
  console.log(`Generating ${VARIATIONS_PER_SHOT} variations for: ${shot.description}`);
  console.log(`Using Shot 2 reference for character consistency: ${shot2Url}`);
  console.log(`${"=".repeat(70)}\n`);

  const results: GenerateResult[] = [];

  for (let i = 0; i < VARIATIONS_PER_SHOT; i++) {
    console.log(`  [shot3] Variation ${i + 1}/${VARIATIONS_PER_SHOT}...`);
    const startTime = Date.now();
    try {
      // Use Shot 2 as reference image for character consistency
      const url = await generateViaForge(shot.prompt, [{ url: shot2Url, mimeType: "image/png" }]);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`  [shot3] Variation ${i + 1} ✓ (${elapsed}s) → ${url}`);
      results.push({ url, variationIndex: i + 1, shotId: "shot3" });
    } catch (err: any) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.error(`  [shot3] Variation ${i + 1} ✗ (${elapsed}s) → ${err.message}`);
    }
  }

  return results;
}

// ─── Main ───

async function main() {
  const target = process.argv[2] || "all";
  const allResults: Record<string, GenerateResult[]> = {};

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  Awakli Fixture Panel Generator — Stage 1 Pipeline     ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`Target: ${target} | Variations per shot: ${VARIATIONS_PER_SHOT}\n`);

  if (target === "all" || target === "shot1") {
    allResults.shot1 = await generateShot("shot1");
  }

  if (target === "all" || target === "shot2") {
    allResults.shot2 = await generateShot("shot2");
  }

  if (target === "all" || target === "shot3") {
    // For Shot 3, use Shot 2 reference for character consistency
    // Accept reference URL as 3rd arg: npx tsx ... shot3 <shot2-url>
    const shot2Ref = process.argv[3] || allResults.shot2?.[0]?.url;
    if (shot2Ref) {
      allResults.shot3 = await generateShot3WithReference(shot2Ref);
    } else {
      console.log("  [shot3] No Shot 2 reference available, generating without reference...");
      allResults.shot3 = await generateShot("shot3");
    }
  }

  // ─── Summary ───
  console.log(`\n${"═".repeat(70)}`);
  console.log("GENERATION SUMMARY");
  console.log(`${"═".repeat(70)}\n`);

  for (const [shotId, results] of Object.entries(allResults)) {
    const succeeded = results.length;
    console.log(`${shotId}: ${succeeded}/${VARIATIONS_PER_SHOT} variations generated`);
    for (const r of results) {
      console.log(`  Variation ${r.variationIndex}: ${r.url}`);
    }
    console.log();
  }

  console.log("Next steps:");
  console.log("1. Review each variation against the consistency markers in the Fixture Panel Spec");
  console.log("2. Pick the best match for each shot");
  console.log("3. The approved URLs will be wired into shots.json and pilot-3min-script.json");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
