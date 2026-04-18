/**
 * Foley Generator — AI-powered sound effects generation for anime panels.
 *
 * Pipeline node that:
 * 1. Analyzes each panel's visual description, SFX tags, and dialogue to extract foley cues
 * 2. Generates actual audio clips via MiniMax Music API with SFX-specific prompts
 * 3. Stores clips as pipeline assets (type: sfx_clip) for the assembly 4-bus mixer
 *
 * Foley categories (from SFX_LIBRARY):
 *   impact:     punch, kick, explosion, crash, slam, shatter, thud
 *   human:      gasp, laugh, scream, footsteps, heartbeat, breathing, applause
 *   mechanical: door_open, door_close, engine_rev, sword_draw, gun_cock, typing, alarm
 *   nature:     fire_crackle, water_splash, earthquake, avalanche, lightning_strike
 *   ui:         whoosh, sparkle, magic_cast, power_up, energy_charge, shimmer, glitch
 */

import { invokeLLM } from "./_core/llm";
import { generateMusic, type MusicResult } from "./minimax-music";
import { storagePut } from "./storage";
import { createPipelineAsset, getPanelsByEpisode, getEpisodeById } from "./db";
import { nanoid } from "nanoid";

// ─── Types ──────────────────────────────────────────────────────────────

export interface FoleyCue {
  /** Panel ID this cue belongs to */
  panelId: number;
  /** Panel number for ordering */
  panelNumber: number;
  /** Scene number */
  sceneNumber: number;
  /** SFX type from library (e.g., "footsteps", "sword_draw") */
  sfxType: string;
  /** Foley category (impact, human, mechanical, nature, ui) */
  category: "impact" | "human" | "mechanical" | "nature" | "ui";
  /** Natural language description for audio generation */
  audioPrompt: string;
  /** Estimated duration in milliseconds */
  durationMs: number;
  /** Volume 0-100 */
  volume: number;
  /** Timing offset within the panel in ms (0 = start of panel) */
  offsetMs: number;
  /** Confidence score 0-1 from LLM extraction */
  confidence: number;
}

export interface FoleyGenerationResult {
  /** Generated audio URL (S3) */
  url: string;
  /** Original cue that produced this clip */
  cue: FoleyCue;
  /** Duration of generated audio in seconds */
  durationSeconds: number;
  /** File size in bytes */
  sizeBytes: number;
  /** Absolute timestamp in the episode timeline (seconds) */
  timelinePositionSeconds: number;
}

export interface FoleyNodeResult {
  /** All generated foley clips */
  clips: FoleyGenerationResult[];
  /** Total cost in cents */
  totalCostCents: number;
  /** Number of cues extracted */
  cuesExtracted: number;
  /** Number of clips successfully generated */
  clipsGenerated: number;
  /** Number of clips that failed generation */
  clipsFailed: number;
}

// ─── Constants ──────────────────────────────────────────────────────────

/** Foley-specific SFX library with audio generation prompts */
export const FOLEY_PROMPT_MAP: Record<string, string> = {
  // Impact
  punch: "heavy punch impact, martial arts, anime fight scene",
  kick: "powerful kick impact, body hit, anime combat",
  explosion: "dramatic explosion, debris, anime action",
  crash: "glass or metal crash, destruction, anime",
  slam: "heavy door slam or body slam, impact",
  shatter: "glass shattering, crystalline breaking",
  thud: "heavy thud, body hitting ground",
  // Human
  footsteps: "footsteps on hard floor, walking pace, indoor",
  footsteps_running: "running footsteps, urgent pace, hard surface",
  footsteps_gravel: "footsteps on gravel, outdoor walking",
  gasp: "dramatic gasp, surprise reaction, anime",
  scream: "dramatic scream, anime character",
  heartbeat: "tense heartbeat, dramatic moment",
  breathing: "heavy breathing, exhaustion, tension",
  // Mechanical
  door_open: "mechanical door opening, sci-fi hiss",
  door_close: "heavy door closing, metallic clang",
  engine_rev: "engine revving, vehicle starting",
  sword_draw: "sword unsheathing, metallic ring, anime",
  sword_clash: "swords clashing, metal on metal, anime fight",
  gun_cock: "gun cocking, weapon ready",
  typing: "keyboard typing, rapid, computer",
  alarm: "alarm siren, warning, urgent",
  // Nature
  fire_crackle: "fire crackling, flames, warmth",
  water_splash: "water splash, liquid impact",
  earthquake: "ground rumbling, earthquake tremor",
  lightning_strike: "lightning strike, thunder crack",
  // UI / Magic
  whoosh: "fast whoosh, speed line, anime motion",
  sparkle: "magical sparkle, shimmer, anime effect",
  magic_cast: "magic spell casting, energy release, anime",
  power_up: "power up charging, energy building, anime",
  energy_charge: "energy charging, building power, dramatic",
  shimmer: "ethereal shimmer, crystal resonance",
  glitch: "digital glitch, distortion, cyber",
};

/** Category to prompt style mapping for better generation */
const CATEGORY_STYLE: Record<string, string> = {
  impact: "punchy, short, dramatic, cinematic sound effect",
  human: "realistic human sound, anime voice acting style",
  mechanical: "crisp mechanical sound effect, cinematic foley",
  nature: "natural ambient sound effect, realistic",
  ui: "stylized anime sound effect, magical, dramatic",
};

/** Default duration per category in ms */
const DEFAULT_DURATION: Record<string, number> = {
  impact: 800,
  human: 1200,
  mechanical: 1000,
  nature: 2000,
  ui: 1000,
};

/** Estimated panel duration in seconds */
const PANEL_DURATION_SECONDS = 3.0;

/** Max foley clips per episode to control costs */
const MAX_FOLEY_CLIPS = 24;

/** Max concurrent generations */
const CONCURRENCY = 3;

// ─── LLM Cue Extraction ────────────────────────────────────────────────

/**
 * Use LLM to analyze panel descriptions and extract foley cues.
 * Returns a prioritized list of foley cues sorted by importance.
 */
export async function extractFoleyCues(
  episodeId: number,
): Promise<FoleyCue[]> {
  const episode = await getEpisodeById(episodeId);
  if (!episode) throw new Error(`Episode ${episodeId} not found`);

  const panels = await getPanelsByEpisode(episodeId);
  if (panels.length === 0) return [];

  // Build panel summaries for LLM
  const panelSummaries = panels.map((p) => ({
    panelId: p.id,
    panelNumber: p.panelNumber,
    sceneNumber: p.sceneNumber,
    visual: p.visualDescription || "",
    sfxTag: p.sfx || "",
    dialogue: typeof p.dialogue === "string"
      ? p.dialogue
      : Array.isArray(p.dialogue)
        ? (p.dialogue as any[]).map((d: any) => d.text || "").join("; ")
        : "",
    cameraAngle: p.cameraAngle || "",
  }));

  const availableSfxTypes = Object.keys(FOLEY_PROMPT_MAP).join(", ");

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are an expert anime sound designer (foley artist). Analyze each panel's visual description, SFX tags, and dialogue to identify foley sound effects needed.

For each panel, extract 0-3 foley cues. Focus on:
- Physical actions (footsteps, impacts, door sounds)
- Character reactions (gasps, breathing)
- Environmental interactions (sword draws, explosions, water splashes)
- Magical/energy effects (power ups, energy charges, sparkles)

Available SFX types: ${availableSfxTypes}

Categories: impact, human, mechanical, nature, ui

Rules:
- Only include sounds that are clearly implied by the visual description or SFX tags
- Prioritize sounds that enhance the scene's emotional impact
- Set confidence 0.0-1.0 based on how clearly the sound is implied
- Set volume 40-100 based on the sound's prominence in the scene
- Set offsetMs for timing within the panel (0 = start, max = 2500)
- Set durationMs appropriate for the sound type (200-3000ms)
- Maximum ${MAX_FOLEY_CLIPS} cues total across all panels`,
      },
      {
        role: "user",
        content: `Episode: "${episode.title || "Untitled"}"

Panels:
${panelSummaries.map((p) => `[P${p.sceneNumber}.${p.panelNumber}] (id:${p.panelId}) Visual: "${p.visual}" | SFX: "${p.sfxTag}" | Camera: "${p.cameraAngle}" | Dialogue: "${p.dialogue}"`).join("\n")}

Extract foley cues as JSON.`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "foley_cues",
        strict: true,
        schema: {
          type: "object",
          properties: {
            cues: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  panelId: { type: "integer", description: "Panel ID from the input" },
                  panelNumber: { type: "integer" },
                  sceneNumber: { type: "integer" },
                  sfxType: { type: "string", description: "SFX type from available list" },
                  category: { type: "string", enum: ["impact", "human", "mechanical", "nature", "ui"] },
                  audioPrompt: { type: "string", description: "Natural language description for audio generation" },
                  durationMs: { type: "integer", description: "Duration in milliseconds (200-3000)" },
                  volume: { type: "integer", description: "Volume 0-100" },
                  offsetMs: { type: "integer", description: "Offset within panel in ms (0-2500)" },
                  confidence: { type: "number", description: "Confidence 0.0-1.0" },
                },
                required: ["panelId", "panelNumber", "sceneNumber", "sfxType", "category", "audioPrompt", "durationMs", "volume", "offsetMs", "confidence"],
                additionalProperties: false,
              },
            },
          },
          required: ["cues"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices[0]?.message?.content;
  const parsed = JSON.parse(typeof content === "string" ? content : '{"cues":[]}');

  // Validate and clamp values
  const cues: FoleyCue[] = (parsed.cues || [])
    .map((c: any) => ({
      panelId: c.panelId,
      panelNumber: c.panelNumber || 0,
      sceneNumber: c.sceneNumber || 0,
      sfxType: c.sfxType || "whoosh",
      category: (["impact", "human", "mechanical", "nature", "ui"].includes(c.category) ? c.category : "ui") as FoleyCue["category"],
      audioPrompt: c.audioPrompt || FOLEY_PROMPT_MAP[c.sfxType] || "anime sound effect",
      durationMs: Math.max(200, Math.min(3000, c.durationMs || DEFAULT_DURATION[c.category] || 1000)),
      volume: Math.max(20, Math.min(100, c.volume || 80)),
      offsetMs: Math.max(0, Math.min(2500, c.offsetMs || 0)),
      confidence: Math.max(0, Math.min(1, c.confidence || 0.5)),
    }))
    // Sort by confidence descending, take top MAX_FOLEY_CLIPS
    .sort((a: FoleyCue, b: FoleyCue) => b.confidence - a.confidence)
    .slice(0, MAX_FOLEY_CLIPS);

  console.log(`[FoleyGen] Extracted ${cues.length} foley cues from ${panels.length} panels`);
  return cues;
}

// ─── Audio Generation ───────────────────────────────────────────────────

/**
 * Generate a single foley audio clip using MiniMax Music API.
 * Uses instrumental mode with SFX-specific prompts.
 */
export async function generateFoleyClip(
  cue: FoleyCue,
): Promise<MusicResult> {
  // Build a rich prompt combining the cue's audio description with category style
  const categoryStyle = CATEGORY_STYLE[cue.category] || "cinematic sound effect";
  const libraryPrompt = FOLEY_PROMPT_MAP[cue.sfxType] || "";

  const prompt = [
    cue.audioPrompt,
    libraryPrompt,
    categoryStyle,
    `${(cue.durationMs / 1000).toFixed(1)} seconds`,
    "single isolated sound effect, no music, no background noise",
  ]
    .filter(Boolean)
    .join(", ");

  console.log(`[FoleyGen] Generating: ${cue.sfxType} (${cue.category}) — "${prompt.slice(0, 100)}..."`);

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
 * Run the foley generation pipeline node.
 *
 * 1. Extract foley cues from all panels via LLM
 * 2. Generate audio clips for each cue via MiniMax
 * 3. Upload to S3 and store as pipeline assets
 * 4. Return results for the assembly node
 */
export async function foleyGenNode(
  runId: number,
  episodeId: number,
  options?: {
    maxClips?: number;
    minConfidence?: number;
    targetLufs?: number;
  },
): Promise<FoleyNodeResult> {
  const maxClips = options?.maxClips ?? MAX_FOLEY_CLIPS;
  const minConfidence = options?.minConfidence ?? 0.3;
  const targetLufs = options?.targetLufs ?? -28;

  console.log(`[FoleyGen] Starting foley generation for episode ${episodeId}, run ${runId}`);
  console.log(`[FoleyGen] Config: maxClips=${maxClips}, minConfidence=${minConfidence}, targetLufs=${targetLufs}`);

  // Step 1: Extract foley cues
  let cues: FoleyCue[];
  try {
    cues = await extractFoleyCues(episodeId);
  } catch (err: any) {
    console.error(`[FoleyGen] Cue extraction failed:`, err.message);
    return { clips: [], totalCostCents: 0, cuesExtracted: 0, clipsGenerated: 0, clipsFailed: 0 };
  }

  // Filter by confidence threshold
  cues = cues.filter((c) => c.confidence >= minConfidence).slice(0, maxClips);
  console.log(`[FoleyGen] ${cues.length} cues above confidence threshold ${minConfidence}`);

  if (cues.length === 0) {
    return { clips: [], totalCostCents: 0, cuesExtracted: 0, clipsGenerated: 0, clipsFailed: 0 };
  }

  // Step 2: Generate audio clips (with concurrency control)
  const results: FoleyGenerationResult[] = [];
  let clipsFailed = 0;
  let totalCostCents = 0;

  // Process in batches of CONCURRENCY
  for (let i = 0; i < cues.length; i += CONCURRENCY) {
    const batch = cues.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map(async (cue) => {
        try {
          const musicResult = await generateFoleyClip(cue);

          // Download from temporary MiniMax URL
          const audioRes = await fetch(musicResult.audioUrl);
          if (!audioRes.ok) throw new Error(`Download failed: ${audioRes.status}`);
          const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

          // Upload to S3
          const s3Key = `pipeline/${runId}/foley/${cue.sfxType}-P${cue.sceneNumber}.${cue.panelNumber}-${nanoid(6)}.mp3`;
          const { url } = await storagePut(s3Key, audioBuffer, "audio/mpeg");

          // Calculate timeline position
          // Each panel is ~PANEL_DURATION_SECONDS, offset within panel adds to position
          const panelStartSeconds = (cue.panelNumber - 1) * PANEL_DURATION_SECONDS;
          const timelinePositionSeconds = panelStartSeconds + cue.offsetMs / 1000;

          // Store as pipeline asset
          await createPipelineAsset({
            pipelineRunId: runId,
            episodeId,
            panelId: cue.panelId,
            assetType: "sfx_clip",
            url,
            metadata: {
              sfxType: cue.sfxType,
              category: cue.category,
              duration: musicResult.durationMs / 1000,
              volume: cue.volume,
              offsetMs: cue.offsetMs,
              confidence: cue.confidence,
              audioPrompt: cue.audioPrompt.slice(0, 200),
              targetLufs,
              timelinePositionSeconds,
              panelNumber: cue.panelNumber,
              sceneNumber: cue.sceneNumber,
              sizeBytes: musicResult.sizeBytes,
            } as any,
            nodeSource: "sfx_gen",
          });

          const result: FoleyGenerationResult = {
            url,
            cue,
            durationSeconds: musicResult.durationMs / 1000,
            sizeBytes: musicResult.sizeBytes,
            timelinePositionSeconds,
          };

          console.log(`[FoleyGen] ✓ ${cue.sfxType} for P${cue.sceneNumber}.${cue.panelNumber} → ${(musicResult.durationMs / 1000).toFixed(1)}s, ${(musicResult.sizeBytes / 1024).toFixed(0)}KB`);
          return result;
        } catch (err: any) {
          console.error(`[FoleyGen] ✗ ${cue.sfxType} for P${cue.sceneNumber}.${cue.panelNumber}: ${err.message}`);
          throw err;
        }
      }),
    );

    for (const r of batchResults) {
      if (r.status === "fulfilled") {
        results.push(r.value);
        totalCostCents += 5; // ~$0.05 per SFX clip via MiniMax
      } else {
        clipsFailed++;
      }
    }

    // Brief pause between batches to respect rate limits
    if (i + CONCURRENCY < cues.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  console.log(`[FoleyGen] Complete: ${results.length}/${cues.length} clips generated, ${clipsFailed} failed, cost ~$${(totalCostCents / 100).toFixed(2)}`);

  return {
    clips: results,
    totalCostCents,
    cuesExtracted: cues.length,
    clipsGenerated: results.length,
    clipsFailed,
  };
}
