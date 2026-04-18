/**
 * Ambient Scene Detector — Reads act/scene settings from scripts and
 * auto-selects matching ambient loops from a curated library.
 *
 * Pipeline node that:
 * 1. Analyzes each act/scene's setting (location, time of day, mood) via LLM
 * 2. Maps settings to ambient categories from a curated library
 * 3. Generates ambient audio loops via MiniMax Music API
 * 4. Stores clips as pipeline assets (type: ambient) for the assembly 4-bus mixer
 *
 * Ambient loops are designed to:
 * - Span the full duration of an act/scene (loopable)
 * - Sit at -32 LUFS in the final mix (Bus 4)
 * - Fade in/out at scene boundaries
 */

import { invokeLLM } from "./_core/llm";
import { generateMusic, type MusicResult } from "./minimax-music";
import { storagePut } from "./storage";
import { createPipelineAsset, getPanelsByEpisode, getEpisodeById } from "./db";
import { nanoid } from "nanoid";

// ─── Types ──────────────────────────────────────────────────────────────

export interface AmbientCategory {
  /** Category identifier */
  id: string;
  /** Human-readable label */
  label: string;
  /** Audio generation prompt for MiniMax */
  prompt: string;
  /** Suggested fade in duration in seconds */
  fadeInSeconds: number;
  /** Suggested fade out duration in seconds */
  fadeOutSeconds: number;
  /** Tags for matching */
  tags: string[];
}

export interface SceneAmbientMapping {
  /** Scene/act number */
  sceneNumber: number;
  /** Location description from script */
  location: string;
  /** Time of day */
  timeOfDay: string;
  /** Mood/atmosphere */
  mood: string;
  /** Best matching ambient category ID */
  ambientCategoryId: string;
  /** Secondary ambient layer (optional, for richer soundscapes) */
  secondaryCategoryId?: string;
  /** Confidence of the match (0-1) */
  confidence: number;
  /** LLM reasoning for the selection */
  reasoning: string;
  /** Start panel number in this scene */
  startPanelNumber: number;
  /** End panel number in this scene */
  endPanelNumber: number;
}

export interface AmbientGenerationResult {
  /** Generated audio URL (S3) */
  url: string;
  /** Scene mapping that produced this clip */
  mapping: SceneAmbientMapping;
  /** Ambient category used */
  category: AmbientCategory;
  /** Duration of generated audio in seconds */
  durationSeconds: number;
  /** File size in bytes */
  sizeBytes: number;
  /** Start time in episode timeline (seconds) */
  startTimeSeconds: number;
  /** Whether this is a secondary layer */
  isSecondary: boolean;
}

export interface AmbientNodeResult {
  /** All generated ambient clips */
  clips: AmbientGenerationResult[];
  /** Scene-to-ambient mappings */
  mappings: SceneAmbientMapping[];
  /** Total cost in cents */
  totalCostCents: number;
  /** Number of scenes detected */
  scenesDetected: number;
  /** Number of clips successfully generated */
  clipsGenerated: number;
  /** Number of clips that failed */
  clipsFailed: number;
}

// ─── Curated Ambient Library ────────────────────────────────────────────

export const AMBIENT_LIBRARY: AmbientCategory[] = [
  // Natural environments
  {
    id: "ocean_waves",
    label: "Ocean Waves",
    prompt: "gentle ocean waves, sea breeze, coastal ambient, calm water lapping, continuous loop, no music",
    fadeInSeconds: 2.0,
    fadeOutSeconds: 2.5,
    tags: ["ocean", "sea", "beach", "coast", "shore", "harbor", "port", "dock", "pier", "waterfront"],
  },
  {
    id: "forest_birds",
    label: "Forest & Birds",
    prompt: "forest ambience, birdsong, gentle breeze through leaves, woodland, continuous loop, no music",
    fadeInSeconds: 1.5,
    fadeOutSeconds: 2.0,
    tags: ["forest", "woods", "jungle", "grove", "garden", "park", "nature", "trees", "wilderness"],
  },
  {
    id: "rain_light",
    label: "Light Rain",
    prompt: "light rain falling, gentle rainfall, soft patter on surfaces, ambient rain, continuous loop, no music",
    fadeInSeconds: 2.0,
    fadeOutSeconds: 3.0,
    tags: ["rain", "drizzle", "shower", "rainy", "wet"],
  },
  {
    id: "rain_heavy",
    label: "Heavy Rain & Thunder",
    prompt: "heavy rain, thunderstorm, distant thunder rumbles, intense rainfall, dramatic weather, continuous loop, no music",
    fadeInSeconds: 1.5,
    fadeOutSeconds: 2.0,
    tags: ["storm", "thunderstorm", "heavy rain", "downpour", "tempest"],
  },
  {
    id: "wind",
    label: "Wind",
    prompt: "wind blowing, gentle to moderate breeze, open area, atmospheric wind, continuous loop, no music",
    fadeInSeconds: 1.5,
    fadeOutSeconds: 2.0,
    tags: ["wind", "windy", "breeze", "hilltop", "cliff", "mountain peak", "rooftop", "open field"],
  },
  {
    id: "river_stream",
    label: "River & Stream",
    prompt: "flowing river, babbling brook, water over rocks, peaceful stream, continuous loop, no music",
    fadeInSeconds: 1.5,
    fadeOutSeconds: 2.0,
    tags: ["river", "stream", "brook", "creek", "waterfall", "rapids"],
  },
  {
    id: "night_crickets",
    label: "Night Crickets",
    prompt: "nighttime crickets, cicadas, nocturnal insects, warm summer night ambience, continuous loop, no music",
    fadeInSeconds: 2.0,
    fadeOutSeconds: 2.5,
    tags: ["night", "evening", "dusk", "twilight", "nocturnal", "crickets"],
  },
  {
    id: "cave_drips",
    label: "Cave & Underground",
    prompt: "cave ambience, water dripping, echo, underground cavern, mysterious atmosphere, continuous loop, no music",
    fadeInSeconds: 1.0,
    fadeOutSeconds: 1.5,
    tags: ["cave", "cavern", "underground", "tunnel", "mine", "dungeon", "crypt", "catacomb"],
  },

  // Urban environments
  {
    id: "city_traffic",
    label: "City Traffic",
    prompt: "city traffic ambience, distant cars, urban background noise, metropolitan atmosphere, continuous loop, no music",
    fadeInSeconds: 1.0,
    fadeOutSeconds: 1.5,
    tags: ["city", "urban", "street", "downtown", "metropolitan", "traffic", "road", "highway"],
  },
  {
    id: "city_night",
    label: "City Night",
    prompt: "nighttime city ambience, distant traffic, occasional sirens, urban night atmosphere, quiet streets, continuous loop, no music",
    fadeInSeconds: 1.5,
    fadeOutSeconds: 2.0,
    tags: ["city night", "urban night", "alley", "neon", "nightlife"],
  },
  {
    id: "crowd_indoor",
    label: "Indoor Crowd",
    prompt: "indoor crowd murmur, restaurant chatter, cafe ambience, people talking softly, continuous loop, no music",
    fadeInSeconds: 1.0,
    fadeOutSeconds: 1.5,
    tags: ["restaurant", "cafe", "bar", "tavern", "inn", "pub", "canteen", "cafeteria", "hall", "ballroom"],
  },
  {
    id: "crowd_outdoor",
    label: "Outdoor Crowd",
    prompt: "outdoor crowd ambience, market bustle, people walking and talking, open-air gathering, continuous loop, no music",
    fadeInSeconds: 1.0,
    fadeOutSeconds: 1.5,
    tags: ["market", "bazaar", "festival", "plaza", "square", "stadium", "arena", "fairground"],
  },
  {
    id: "school",
    label: "School",
    prompt: "school hallway ambience, distant chatter, lockers, footsteps, school bell, continuous loop, no music",
    fadeInSeconds: 1.0,
    fadeOutSeconds: 1.0,
    tags: ["school", "classroom", "hallway", "campus", "university", "academy", "library"],
  },

  // Sci-fi / Fantasy
  {
    id: "spaceship_hum",
    label: "Spaceship Interior",
    prompt: "spaceship interior hum, engine drone, sci-fi ambient, control room atmosphere, continuous loop, no music",
    fadeInSeconds: 1.0,
    fadeOutSeconds: 1.5,
    tags: ["spaceship", "spacecraft", "starship", "cockpit", "bridge", "space station", "orbital"],
  },
  {
    id: "space_void",
    label: "Deep Space",
    prompt: "deep space ambient, cosmic void, ethereal drone, distant stars, eerie silence, continuous loop, no music",
    fadeInSeconds: 2.0,
    fadeOutSeconds: 3.0,
    tags: ["space", "cosmos", "void", "nebula", "asteroid", "orbit", "zero gravity"],
  },
  {
    id: "crystal_resonance",
    label: "Crystal / Magical",
    prompt: "crystal resonance, ethereal hum, magical ambient, mystical energy, shimmering tones, continuous loop, no music",
    fadeInSeconds: 1.5,
    fadeOutSeconds: 2.0,
    tags: ["crystal", "magic", "mystical", "enchanted", "arcane", "temple", "shrine", "sacred", "ethereal", "spiritual"],
  },
  {
    id: "cyber_hum",
    label: "Cyberpunk / Digital",
    prompt: "cyberpunk ambient, digital hum, neon city, electronic atmosphere, data streams, continuous loop, no music",
    fadeInSeconds: 1.0,
    fadeOutSeconds: 1.5,
    tags: ["cyber", "digital", "virtual", "matrix", "network", "server", "hologram", "neon", "cyberpunk"],
  },
  {
    id: "factory_machinery",
    label: "Factory / Industrial",
    prompt: "factory machinery ambient, industrial hum, metal clanking, steam, mechanical atmosphere, continuous loop, no music",
    fadeInSeconds: 1.0,
    fadeOutSeconds: 1.5,
    tags: ["factory", "industrial", "warehouse", "workshop", "forge", "foundry", "machinery", "engine room"],
  },

  // Interior / Quiet
  {
    id: "room_quiet",
    label: "Quiet Room",
    prompt: "quiet room ambience, soft air conditioning hum, clock ticking, minimal background noise, continuous loop, no music",
    fadeInSeconds: 0.5,
    fadeOutSeconds: 1.0,
    tags: ["room", "bedroom", "office", "study", "apartment", "house", "home", "interior", "indoors"],
  },
  {
    id: "hospital",
    label: "Hospital",
    prompt: "hospital ambient, heart monitor beeping, distant PA announcements, sterile atmosphere, continuous loop, no music",
    fadeInSeconds: 1.0,
    fadeOutSeconds: 1.0,
    tags: ["hospital", "clinic", "medical", "infirmary", "sickbay", "operating room", "ward"],
  },

  // Battle / Tension
  {
    id: "battlefield",
    label: "Distant Battle",
    prompt: "distant battlefield ambience, far-off explosions, rumbling, war atmosphere, tension, continuous loop, no music",
    fadeInSeconds: 1.5,
    fadeOutSeconds: 2.0,
    tags: ["battle", "war", "battlefield", "combat zone", "siege", "front line", "warzone"],
  },
  {
    id: "tension_drone",
    label: "Tension Drone",
    prompt: "tense atmospheric drone, suspenseful ambient, low frequency rumble, ominous, continuous loop, no music",
    fadeInSeconds: 2.0,
    fadeOutSeconds: 2.5,
    tags: ["tense", "suspense", "danger", "ominous", "dark", "horror", "creepy", "eerie", "sinister"],
  },

  // Fallback
  {
    id: "silence",
    label: "Near Silence",
    prompt: "near silence, very faint room tone, barely audible ambient, continuous loop, no music",
    fadeInSeconds: 0.5,
    fadeOutSeconds: 0.5,
    tags: [],
  },
];

/** Quick lookup by ID */
const AMBIENT_BY_ID = new Map(AMBIENT_LIBRARY.map((a) => [a.id, a]));

/** Estimated panel duration in seconds */
const PANEL_DURATION_SECONDS = 3.0;

// ─── Deterministic Matching ─────────────────────────────────────────────

/**
 * Try to match a location/setting string to an ambient category using tag matching.
 * Returns the best match or null if no confident match is found.
 */
export function matchAmbientByTags(
  location: string,
  timeOfDay?: string,
  mood?: string,
): { category: AmbientCategory; score: number } | null {
  const searchText = [location, timeOfDay, mood].filter(Boolean).join(" ").toLowerCase();
  if (!searchText.trim()) return null;

  let bestMatch: AmbientCategory | null = null;
  let bestScore = 0;

  for (const cat of AMBIENT_LIBRARY) {
    if (cat.id === "silence") continue; // Skip fallback

    let score = 0;
    for (const tag of cat.tags) {
      if (searchText.includes(tag.toLowerCase())) {
        // Longer tags are more specific, so weight them higher
        score += tag.length;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = cat;
    }
  }

  // Require a minimum score to be confident
  if (bestMatch && bestScore >= 3) {
    return { category: bestMatch, score: bestScore };
  }

  return null;
}

// ─── LLM Scene Analysis ────────────────────────────────────────────────

/**
 * Use LLM to analyze episode scenes and map each to ambient categories.
 * Groups panels by scene number and analyzes the collective setting.
 */
export async function detectSceneAmbients(
  episodeId: number,
): Promise<SceneAmbientMapping[]> {
  const episode = await getEpisodeById(episodeId);
  if (!episode) throw new Error(`Episode ${episodeId} not found`);

  const panels = await getPanelsByEpisode(episodeId);
  if (panels.length === 0) return [];

  // Group panels by scene number
  const sceneGroups = new Map<number, typeof panels>();
  for (const p of panels) {
    const scene = p.sceneNumber || 1;
    if (!sceneGroups.has(scene)) sceneGroups.set(scene, []);
    sceneGroups.get(scene)!.push(p);
  }

  // Build scene summaries
  const sceneSummaries = Array.from(sceneGroups.entries()).map(([sceneNum, scenePanels]) => {
    const descriptions = scenePanels
      .map((p) => p.visualDescription || "")
      .filter(Boolean)
      .join("; ");
    const sfxTags = scenePanels
      .map((p) => p.sfx || "")
      .filter(Boolean)
      .join(", ");
    const panelRange = {
      start: Math.min(...scenePanels.map((p) => p.panelNumber)),
      end: Math.max(...scenePanels.map((p) => p.panelNumber)),
    };

    return {
      sceneNumber: sceneNum,
      panelCount: scenePanels.length,
      startPanel: panelRange.start,
      endPanel: panelRange.end,
      descriptions: descriptions.slice(0, 500),
      sfxTags,
    };
  });

  // Available ambient categories for LLM
  const categoryList = AMBIENT_LIBRARY.map((c) => `${c.id}: ${c.label} (${c.tags.slice(0, 5).join(", ")})`).join("\n");

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are an expert anime sound designer specializing in ambient soundscapes. Analyze each scene's visual descriptions to determine the best ambient background sound.

Available ambient categories:
${categoryList}

For each scene, determine:
1. The primary location/setting
2. Time of day (if discernible)
3. Overall mood
4. Best matching ambient category (primary)
5. Optional secondary ambient layer for richer soundscapes (e.g., rain + city_traffic)

Rules:
- Every scene MUST have a primary ambient category
- Use "silence" or "room_quiet" for indoor scenes with no clear environmental sounds
- Use "tension_drone" for suspenseful or ominous scenes
- Secondary ambient is optional — only add when it meaningfully enriches the soundscape
- Set confidence 0.0-1.0 based on how clearly the setting is described`,
      },
      {
        role: "user",
        content: `Episode: "${episode.title || "Untitled"}"

Scenes:
${sceneSummaries.map((s) => `[Scene ${s.sceneNumber}] Panels ${s.startPanel}-${s.endPanel} (${s.panelCount} panels)\nDescriptions: "${s.descriptions}"\nSFX tags: "${s.sfxTags}"`).join("\n\n")}

Map each scene to ambient categories.`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "scene_ambients",
        strict: true,
        schema: {
          type: "object",
          properties: {
            scenes: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  sceneNumber: { type: "integer" },
                  location: { type: "string", description: "Detected location/setting" },
                  timeOfDay: { type: "string", description: "Detected time of day or 'unknown'" },
                  mood: { type: "string", description: "Overall mood of the scene" },
                  ambientCategoryId: { type: "string", description: "Primary ambient category ID" },
                  secondaryCategoryId: { type: "string", description: "Secondary ambient category ID or empty string" },
                  confidence: { type: "number", description: "Confidence 0.0-1.0" },
                  reasoning: { type: "string", description: "Brief reasoning for the selection" },
                },
                required: ["sceneNumber", "location", "timeOfDay", "mood", "ambientCategoryId", "secondaryCategoryId", "confidence", "reasoning"],
                additionalProperties: false,
              },
            },
          },
          required: ["scenes"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices[0]?.message?.content;
  const parsed = JSON.parse(typeof content === "string" ? content : '{"scenes":[]}');

  // Validate and enrich mappings
  const mappings: SceneAmbientMapping[] = (parsed.scenes || []).map((s: any) => {
    const sceneGroup = sceneGroups.get(s.sceneNumber);
    const startPanel = sceneGroup ? Math.min(...sceneGroup.map((p) => p.panelNumber)) : 1;
    const endPanel = sceneGroup ? Math.max(...sceneGroup.map((p) => p.panelNumber)) : 1;

    // Validate category IDs
    const primaryId = AMBIENT_BY_ID.has(s.ambientCategoryId) ? s.ambientCategoryId : "room_quiet";
    const secondaryId = s.secondaryCategoryId && AMBIENT_BY_ID.has(s.secondaryCategoryId) ? s.secondaryCategoryId : undefined;

    return {
      sceneNumber: s.sceneNumber,
      location: s.location || "unknown",
      timeOfDay: s.timeOfDay || "unknown",
      mood: s.mood || "neutral",
      ambientCategoryId: primaryId,
      secondaryCategoryId: secondaryId,
      confidence: Math.max(0, Math.min(1, s.confidence || 0.5)),
      reasoning: s.reasoning || "",
      startPanelNumber: startPanel,
      endPanelNumber: endPanel,
    };
  });

  console.log(`[AmbientDetect] Detected ${mappings.length} scene ambients from ${sceneGroups.size} scenes`);
  for (const m of mappings) {
    const primary = AMBIENT_BY_ID.get(m.ambientCategoryId);
    const secondary = m.secondaryCategoryId ? AMBIENT_BY_ID.get(m.secondaryCategoryId) : null;
    console.log(`[AmbientDetect] Scene ${m.sceneNumber}: ${primary?.label || m.ambientCategoryId}${secondary ? ` + ${secondary.label}` : ""} (${m.location}, ${m.timeOfDay}, conf=${m.confidence.toFixed(2)})`);
  }

  return mappings;
}

// ─── Audio Generation ───────────────────────────────────────────────────

/**
 * Generate an ambient audio loop using MiniMax Music API.
 */
async function generateAmbientLoop(
  category: AmbientCategory,
  sceneMood: string,
  durationHint: string,
): Promise<MusicResult> {
  const prompt = [
    category.prompt,
    `mood: ${sceneMood}`,
    durationHint,
    "ambient background loop, seamless, no melody, no rhythm",
  ].join(", ");

  console.log(`[AmbientDetect] Generating: ${category.label} — "${prompt.slice(0, 100)}..."`);

  return generateMusic({
    prompt,
    instrumental: true,
    format: "mp3",
    sampleRate: 44100,
    bitrate: 128000,
  });
}

// ─── Pipeline Node ──────────────────────────────────────────────────────

/**
 * Run the ambient detection and generation pipeline node.
 *
 * 1. Detect scene settings via LLM
 * 2. Map each scene to ambient categories
 * 3. Generate ambient loops via MiniMax
 * 4. Upload to S3 and store as pipeline assets
 */
export async function ambientGenNode(
  runId: number,
  episodeId: number,
  options?: {
    targetLufs?: number;
    enableSecondaryLayers?: boolean;
    minConfidence?: number;
  },
): Promise<AmbientNodeResult> {
  const targetLufs = options?.targetLufs ?? -32;
  const enableSecondary = options?.enableSecondaryLayers ?? true;
  const minConfidence = options?.minConfidence ?? 0.2;

  console.log(`[AmbientDetect] Starting ambient detection for episode ${episodeId}, run ${runId}`);
  console.log(`[AmbientDetect] Config: targetLufs=${targetLufs}, secondary=${enableSecondary}, minConfidence=${minConfidence}`);

  // Step 1: Detect scene ambients
  let mappings: SceneAmbientMapping[];
  try {
    mappings = await detectSceneAmbients(episodeId);
  } catch (err: any) {
    console.error(`[AmbientDetect] Scene detection failed:`, err.message);
    return { clips: [], mappings: [], totalCostCents: 0, scenesDetected: 0, clipsGenerated: 0, clipsFailed: 0 };
  }

  // Filter by confidence
  mappings = mappings.filter((m) => m.confidence >= minConfidence);
  console.log(`[AmbientDetect] ${mappings.length} scenes above confidence threshold ${minConfidence}`);

  if (mappings.length === 0) {
    return { clips: [], mappings: [], totalCostCents: 0, scenesDetected: 0, clipsGenerated: 0, clipsFailed: 0 };
  }

  // Step 2: Generate ambient clips
  const results: AmbientGenerationResult[] = [];
  let clipsFailed = 0;
  let totalCostCents = 0;

  for (const mapping of mappings) {
    const primaryCategory = AMBIENT_BY_ID.get(mapping.ambientCategoryId);
    if (!primaryCategory) continue;

    // Calculate scene duration based on panel range
    const scenePanelCount = mapping.endPanelNumber - mapping.startPanelNumber + 1;
    const sceneDurationSeconds = scenePanelCount * PANEL_DURATION_SECONDS;
    const startTimeSeconds = (mapping.startPanelNumber - 1) * PANEL_DURATION_SECONDS;

    // Skip silence category — no audio needed
    if (primaryCategory.id === "silence") {
      console.log(`[AmbientDetect] Scene ${mapping.sceneNumber}: silence — skipping generation`);
      continue;
    }

    // Generate primary ambient
    try {
      const durationHint = `approximately ${Math.ceil(sceneDurationSeconds)} seconds`;
      const musicResult = await generateAmbientLoop(primaryCategory, mapping.mood, durationHint);

      // Download and upload to S3
      const audioRes = await fetch(musicResult.audioUrl);
      if (!audioRes.ok) throw new Error(`Download failed: ${audioRes.status}`);
      const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

      const s3Key = `pipeline/${runId}/ambient/${primaryCategory.id}-scene${mapping.sceneNumber}-${nanoid(6)}.mp3`;
      const { url } = await storagePut(s3Key, audioBuffer, "audio/mpeg");

      // Store as pipeline asset
      await createPipelineAsset({
        pipelineRunId: runId,
        episodeId,
        assetType: "sfx_clip", // Using sfx_clip since "ambient" isn't in the enum
        url,
        metadata: {
          ambientCategory: primaryCategory.id,
          ambientLabel: primaryCategory.label,
          sceneNumber: mapping.sceneNumber,
          location: mapping.location,
          timeOfDay: mapping.timeOfDay,
          mood: mapping.mood,
          duration: musicResult.durationMs / 1000,
          startTimeSeconds,
          loop: true,
          fadeInSeconds: primaryCategory.fadeInSeconds,
          fadeOutSeconds: primaryCategory.fadeOutSeconds,
          targetLufs,
          isAmbient: true,
          isPrimary: true,
          sizeBytes: musicResult.sizeBytes,
          confidence: mapping.confidence,
        } as any,
        nodeSource: "sfx_gen",
      });

      results.push({
        url,
        mapping,
        category: primaryCategory,
        durationSeconds: musicResult.durationMs / 1000,
        sizeBytes: musicResult.sizeBytes,
        startTimeSeconds,
        isSecondary: false,
      });

      totalCostCents += 5;
      console.log(`[AmbientDetect] ✓ Scene ${mapping.sceneNumber}: ${primaryCategory.label} → ${(musicResult.durationMs / 1000).toFixed(1)}s`);
    } catch (err: any) {
      console.error(`[AmbientDetect] ✗ Scene ${mapping.sceneNumber} primary (${primaryCategory.label}): ${err.message}`);
      clipsFailed++;
    }

    // Generate secondary ambient layer (if enabled and specified)
    if (enableSecondary && mapping.secondaryCategoryId) {
      const secondaryCategory = AMBIENT_BY_ID.get(mapping.secondaryCategoryId);
      if (secondaryCategory && secondaryCategory.id !== "silence") {
        try {
          const durationHint = `approximately ${Math.ceil(sceneDurationSeconds)} seconds`;
          const musicResult = await generateAmbientLoop(secondaryCategory, mapping.mood, durationHint);

          const audioRes = await fetch(musicResult.audioUrl);
          if (!audioRes.ok) throw new Error(`Download failed: ${audioRes.status}`);
          const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

          const s3Key = `pipeline/${runId}/ambient/${secondaryCategory.id}-scene${mapping.sceneNumber}-secondary-${nanoid(6)}.mp3`;
          const { url } = await storagePut(s3Key, audioBuffer, "audio/mpeg");

          await createPipelineAsset({
            pipelineRunId: runId,
            episodeId,
            assetType: "sfx_clip",
            url,
            metadata: {
              ambientCategory: secondaryCategory.id,
              ambientLabel: secondaryCategory.label,
              sceneNumber: mapping.sceneNumber,
              location: mapping.location,
              timeOfDay: mapping.timeOfDay,
              mood: mapping.mood,
              duration: musicResult.durationMs / 1000,
              startTimeSeconds,
              loop: true,
              fadeInSeconds: secondaryCategory.fadeInSeconds,
              fadeOutSeconds: secondaryCategory.fadeOutSeconds,
              targetLufs: targetLufs - 3, // Secondary layer 3 LUFS quieter
              isAmbient: true,
              isPrimary: false,
              sizeBytes: musicResult.sizeBytes,
              confidence: mapping.confidence,
            } as any,
            nodeSource: "sfx_gen",
          });

          results.push({
            url,
            mapping,
            category: secondaryCategory,
            durationSeconds: musicResult.durationMs / 1000,
            sizeBytes: musicResult.sizeBytes,
            startTimeSeconds,
            isSecondary: true,
          });

          totalCostCents += 5;
          console.log(`[AmbientDetect] ✓ Scene ${mapping.sceneNumber} secondary: ${secondaryCategory.label} → ${(musicResult.durationMs / 1000).toFixed(1)}s`);
        } catch (err: any) {
          console.error(`[AmbientDetect] ✗ Scene ${mapping.sceneNumber} secondary (${secondaryCategory.label}): ${err.message}`);
          clipsFailed++;
        }
      }
    }

    // Brief pause between scenes to respect rate limits
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log(`[AmbientDetect] Complete: ${results.length} clips generated for ${mappings.length} scenes, ${clipsFailed} failed, cost ~$${(totalCostCents / 100).toFixed(2)}`);

  return {
    clips: results,
    mappings,
    totalCostCents,
    scenesDetected: mappings.length,
    clipsGenerated: results.length,
    clipsFailed,
  };
}
