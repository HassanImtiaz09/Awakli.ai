/**
 * Enhanced Pipeline Agents — quality assessment, upscaling, scene consistency,
 * SFX generation, narrator voice, content moderation, cost estimation,
 * and enhanced video generation with camera presets.
 */

import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";
import { textToSpeech, VOICE_PRESETS, MODELS } from "./elevenlabs";
import {
  getPanelById,
  updatePanel,
  getPanelsByEpisode,
  getEpisodeById,
  getCharactersByProject,
  createPipelineAsset,
} from "./db";
import { scenes, episodeSfx, episodes, panels } from "../drizzle/schema";
import { getDb } from "./db";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";

// ─── Types ──────────────────────────────────────────────────────────────

export interface QualityDetails {
  promptAdherence: number;
  anatomy: number;
  styleConsistency: number;
  composition: number;
  characterAccuracy: number;
}

export interface ModerationFlag {
  category: string;
  severity: "low" | "medium" | "high";
  description: string;
  lineNumber?: number;
}

export interface SfxEntry {
  sfxType: string;
  timestampMs: number;
  volume: number;
  durationMs: number;
  url?: string;
}

export interface SceneContext {
  backgroundElements: string[];
  lightingConditions: string;
  colorPalette: string[];
  mood: string;
  description: string;
}

export interface CostEstimate {
  upscaling: { count: number; unitCost: number; total: number };
  videoGeneration: { count: number; unitCost: number; total: number };
  voiceActing: { count: number; unitCost: number; total: number };
  narrator: { count: number; unitCost: number; total: number };
  music: { count: number; unitCost: number; total: number };
  sfx: { count: number; unitCost: number; total: number };
  assembly: { count: number; unitCost: number; total: number };
  totalCents: number;
}

// ─── Camera Presets for Kling ────────────────────────────────────────────

export const CAMERA_MOTION_PRESETS: Record<string, string> = {
  "wide": "slow pan across scene, establishing shot, minimal movement, cinematic wide angle",
  "medium": "subtle character movement, natural gestures, medium shot framing",
  "close-up": "character expression change, eye movement, emotional close-up, shallow depth of field",
  "extreme-close-up": "dramatic zoom effect, intensity building, extreme detail, macro focus",
  "birds-eye": "slow downward tilt, scene reveal, overhead perspective, sweeping view",
};

export const MOOD_MOTION_INTENSITY: Record<string, string> = {
  "tense": "faster movements, handheld camera feel, slight shake, urgent pacing",
  "romantic": "slow smooth movements, soft focus effect, gentle sway, dreamy atmosphere",
  "action": "rapid cuts, dynamic camera, speed ramping, explosive energy, fast tracking",
  "peaceful": "very slow pan, almost static, breathing room, serene stillness",
  "dramatic": "deliberate slow motion, weight and gravity, impactful pauses",
  "mysterious": "slow creeping movement, shadows shifting, eerie stillness broken by motion",
  "comedic": "snappy movements, exaggerated reactions, quick zooms",
};

export const TRANSITION_FFMPEG_FILTERS: Record<string, string> = {
  "cut": "",  // No filter, natural cut
  "fade": "xfade=transition=fadeblack:duration=0.8",
  "dissolve": "xfade=transition=dissolve:duration=0.5",
  "wipe_right": "xfade=transition=wiperight:duration=0.5",
  "slide_left": "xfade=transition=slideleft:duration=0.3",
  "flash_white": "xfade=transition=fadewhite:duration=0.3",
};

// ─── 1. Quality Assessment Agent ────────────────────────────────────────

export async function assessPanelQuality(
  panelId: number,
  projectStyle: string = "default"
): Promise<{ score: number; details: QualityDetails; action: "approve" | "warn" | "regenerate" }> {
  const panel = await getPanelById(panelId);
  if (!panel || !panel.imageUrl) {
    throw new Error("Panel not found or has no image");
  }

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an expert anime art quality assessor. Score the given panel image on 5 criteria (1-10 each). The project's target style is "${projectStyle}". Return ONLY valid JSON.`,
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: panel.imageUrl, detail: "high" },
            },
            {
              type: "text",
              text: `Original prompt: "${panel.fluxPrompt || panel.visualDescription || "anime panel"}"

Score this panel on these 5 criteria (1-10 each):
1. promptAdherence - Does it match the visual description?
2. anatomy - Proper body proportions, fingers, faces?
3. styleConsistency - Matches the "${projectStyle}" anime style?
4. composition - Good framing, visual balance?
5. characterAccuracy - Characters look consistent?

Return JSON: {"promptAdherence":N,"anatomy":N,"styleConsistency":N,"composition":N,"characterAccuracy":N}`,
            },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "quality_assessment",
          strict: true,
          schema: {
            type: "object",
            properties: {
              promptAdherence: { type: "integer", description: "1-10 score" },
              anatomy: { type: "integer", description: "1-10 score" },
              styleConsistency: { type: "integer", description: "1-10 score" },
              composition: { type: "integer", description: "1-10 score" },
              characterAccuracy: { type: "integer", description: "1-10 score" },
            },
            required: ["promptAdherence", "anatomy", "styleConsistency", "composition", "characterAccuracy"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    const details: QualityDetails = JSON.parse(typeof content === "string" ? content : "{}");

    // Clamp values to 1-10
    for (const key of Object.keys(details) as (keyof QualityDetails)[]) {
      details[key] = Math.max(1, Math.min(10, details[key] || 5));
    }

    const avgScore = Math.round(
      (details.promptAdherence + details.anatomy + details.styleConsistency +
        details.composition + details.characterAccuracy) / 5
    );
    const score = avgScore * 10; // Scale to 0-100

    let action: "approve" | "warn" | "regenerate";
    if (avgScore >= 8) {
      action = "approve";
    } else if (avgScore >= 5) {
      action = "warn";
    } else {
      action = "regenerate";
    }

    // Update panel with quality data
    await updatePanel(panelId, {
      qualityScore: score,
      qualityDetails: details as any,
    } as any);

    return { score, details, action };
  } catch (error: any) {
    console.error(`[QualityAgent] Assessment failed for panel ${panelId}:`, error.message);
    // Default to warn on failure
    const defaultDetails: QualityDetails = {
      promptAdherence: 6, anatomy: 6, styleConsistency: 6, composition: 6, characterAccuracy: 6,
    };
    await updatePanel(panelId, {
      qualityScore: 60,
      qualityDetails: defaultDetails as any,
    } as any);
    return { score: 60, details: defaultDetails, action: "warn" };
  }
}

/**
 * Auto-retry panel generation if quality is below threshold.
 * Returns the best panel result after up to maxAttempts tries.
 */
export async function qualityCheckWithRetry(
  panelId: number,
  regenerateFn: (panelId: number) => Promise<void>,
  projectStyle: string = "default",
  maxAttempts: number = 3
): Promise<{ score: number; details: QualityDetails; attempts: number }> {
  let bestScore = 0;
  let bestDetails: QualityDetails | null = null;
  let attempts = 0;

  for (let i = 0; i < maxAttempts; i++) {
    attempts++;
    const result = await assessPanelQuality(panelId, projectStyle);

    if (result.score > bestScore) {
      bestScore = result.score;
      bestDetails = result.details;
    }

    if (result.action === "approve" || result.action === "warn") {
      break; // Good enough, stop retrying
    }

    if (i < maxAttempts - 1) {
      // Regenerate and try again
      console.log(`[QualityAgent] Panel ${panelId} scored ${result.score}/100, regenerating (attempt ${i + 2}/${maxAttempts})`);
      await regenerateFn(panelId);
    }
  }

  // Update generation attempts count
  await updatePanel(panelId, {
    generationAttempts: attempts,
    qualityScore: bestScore,
    qualityDetails: bestDetails as any,
  } as any);

  return { score: bestScore, details: bestDetails!, attempts };
}

// ─── 2. Image Upscaler Agent ────────────────────────────────────────────

/**
 * Upscale a panel image using the image generation service with an upscaling prompt.
 * In production, this would call Real-ESRGAN via Fal.ai.
 * For now, we use the image generation service with an enhancement prompt.
 */
export async function upscalePanel(panelId: number): Promise<{ url: string }> {
  const panel = await getPanelById(panelId);
  if (!panel || !panel.imageUrl) {
    throw new Error("Panel not found or has no image");
  }

  try {
    // Use image generation with the original image as reference for upscaling
    const { generateImage } = await import("./_core/imageGeneration");
    const result = await generateImage({
      prompt: `High resolution, ultra detailed, sharp, 4K quality enhancement of this anime panel. Maintain exact same composition, characters, and style. Enhance details, sharpen edges, improve clarity. ${panel.visualDescription || ""}`,
      originalImages: [{ url: panel.imageUrl, mimeType: "image/png" }],
    });

    if (!result?.url) {
      throw new Error("Upscale returned no URL");
    }

    // Store upscaled URL on the panel
    await updatePanel(panelId, {
      upscaledImageUrl: result.url,
    } as any);

    return { url: result.url };
  } catch (error: any) {
    console.error(`[UpscaleAgent] Failed for panel ${panelId}:`, error.message);
    // Fallback: use original image
    await updatePanel(panelId, {
      upscaledImageUrl: panel.imageUrl,
    } as any);
    return { url: panel.imageUrl! };
  }
}

/**
 * Batch upscale all approved panels for an episode.
 */
export async function upscaleEpisodePanels(episodeId: number): Promise<number> {
  const allPanels = await getPanelsByEpisode(episodeId);
  const approvedPanels = allPanels.filter(p => p.imageUrl && (p.status === "approved" || p.status === "generated"));
  let upscaledCount = 0;

  for (const panel of approvedPanels) {
    try {
      await upscalePanel(panel.id);
      upscaledCount++;
    } catch (err) {
      console.error(`[UpscaleAgent] Skipping panel ${panel.id}:`, err);
    }
  }

  return upscaledCount;
}

// ─── 3. Scene Consistency System ────────────────────────────────────────

/**
 * Extract visual context from a panel image for scene consistency.
 */
export async function extractSceneContext(
  panelId: number,
  episodeId: number,
  projectId: number,
  sceneNumber: number
): Promise<SceneContext> {
  const panel = await getPanelById(panelId);
  if (!panel || !panel.imageUrl) {
    throw new Error("Panel not found or has no image");
  }

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "You are a visual scene analyzer for anime production. Extract the visual context from this panel to maintain consistency in subsequent panels of the same scene. Return ONLY valid JSON.",
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: panel.imageUrl, detail: "high" },
            },
            {
              type: "text",
              text: `Analyze this anime panel and extract the scene context:
1. backgroundElements: List all background elements (buildings, trees, furniture, etc.)
2. lightingConditions: Describe the lighting (direction, color temperature, shadows)
3. colorPalette: List the dominant colors as hex codes
4. mood: One word describing the mood
5. description: A brief description of the overall scene setting

Return JSON: {"backgroundElements":[],"lightingConditions":"","colorPalette":[],"mood":"","description":""}`,
            },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "scene_context",
          strict: true,
          schema: {
            type: "object",
            properties: {
              backgroundElements: { type: "array", items: { type: "string" } },
              lightingConditions: { type: "string" },
              colorPalette: { type: "array", items: { type: "string" } },
              mood: { type: "string" },
              description: { type: "string" },
            },
            required: ["backgroundElements", "lightingConditions", "colorPalette", "mood", "description"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    const context: SceneContext = JSON.parse(typeof content === "string" ? content : "{}");

    // Store scene context in database
    const db = await getDb();
    if (db) {
      // Check if scene already exists
      const existing = await db.select().from(scenes)
        .where(and(eq(scenes.episodeId, episodeId), eq(scenes.sceneNumber, sceneNumber)))
        .limit(1);

      if (existing.length > 0) {
        await db.update(scenes)
          .set({ sceneContext: context as any, updatedAt: new Date() })
          .where(eq(scenes.id, existing[0].id));
      } else {
        await db.insert(scenes).values({
          episodeId,
          projectId,
          sceneNumber,
          location: context.description,
          mood: context.mood,
          sceneContext: context as any,
        });
      }
    }

    return context;
  } catch (error: any) {
    console.error(`[SceneConsistency] Context extraction failed:`, error.message);
    return {
      backgroundElements: [],
      lightingConditions: "neutral lighting",
      colorPalette: [],
      mood: "neutral",
      description: "Scene context unavailable",
    };
  }
}

/**
 * Get the scene context for a given scene number to inject into panel prompts.
 */
export async function getSceneContextForPrompt(
  episodeId: number,
  sceneNumber: number
): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(scenes)
    .where(and(eq(scenes.episodeId, episodeId), eq(scenes.sceneNumber, sceneNumber)))
    .limit(1);

  if (result.length === 0 || !result[0].sceneContext) return null;

  const ctx = result[0].sceneContext as unknown as SceneContext;
  return `[MAINTAIN CONSISTENCY: Background: ${ctx.backgroundElements.join(", ")}. Lighting: ${ctx.lightingConditions}. Colors: ${ctx.colorPalette.join(", ")}. Mood: ${ctx.mood}. ${ctx.description}]`;
}

/**
 * Build an enhanced FLUX prompt with scene context injection.
 */
export function buildConsistentPrompt(
  basePrompt: string,
  sceneContextPrefix: string | null
): string {
  if (!sceneContextPrefix) return basePrompt;
  return `${sceneContextPrefix} ${basePrompt}`;
}

// ─── 4. SFX Generation Agent ────────────────────────────────────────────

// Curated SFX library categories
export const SFX_LIBRARY: Record<string, string[]> = {
  impact: ["punch", "kick", "explosion", "crash", "slam", "shatter", "thud"],
  ambient: ["rain", "wind", "city_traffic", "forest_birds", "ocean_waves", "thunder", "crickets"],
  ui: ["whoosh", "sparkle", "magic_cast", "power_up", "energy_charge", "shimmer", "glitch"],
  human: ["gasp", "laugh", "scream", "footsteps", "heartbeat", "breathing", "applause"],
  mechanical: ["door_open", "door_close", "engine_rev", "sword_draw", "gun_cock", "typing", "alarm"],
  nature: ["fire_crackle", "water_splash", "earthquake", "avalanche", "lightning_strike"],
};

/**
 * Parse script content for SFX markers and generate SFX timeline.
 */
export async function generateSfxTimeline(
  episodeId: number
): Promise<SfxEntry[]> {
  const episode = await getEpisodeById(episodeId);
  if (!episode || !episode.scriptContent) {
    throw new Error("Episode not found or has no script");
  }

  const allPanels = await getPanelsByEpisode(episodeId);

  try {
    // Use LLM to analyze script and identify SFX opportunities
    const scriptText = typeof episode.scriptContent === "string"
      ? episode.scriptContent
      : JSON.stringify(episode.scriptContent);

    const panelSfxTags = allPanels
      .filter(p => p.sfx)
      .map(p => `Panel ${p.sceneNumber}.${p.panelNumber}: SFX="${p.sfx}"`)
      .join("\n");

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an anime sound designer. Analyze the script and panel SFX tags to create a sound effects timeline. Select appropriate SFX from these categories:
${Object.entries(SFX_LIBRARY).map(([cat, items]) => `${cat}: ${items.join(", ")}`).join("\n")}
Return ONLY valid JSON array.`,
        },
        {
          role: "user",
          content: `Script excerpt: ${scriptText.slice(0, 3000)}

Panel SFX tags:
${panelSfxTags || "No explicit SFX tags found"}

Total panels: ${allPanels.length}
Estimated duration per panel: 3000ms

Generate a SFX timeline. Each entry needs: sfxType (from library), timestampMs (based on panel order * 3000ms), volume (0-100, default 80), durationMs (typical 500-2000ms).

Return JSON array: [{"sfxType":"explosion","timestampMs":0,"volume":90,"durationMs":1500}]`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "sfx_timeline",
          strict: true,
          schema: {
            type: "object",
            properties: {
              sfx: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    sfxType: { type: "string" },
                    timestampMs: { type: "integer" },
                    volume: { type: "integer" },
                    durationMs: { type: "integer" },
                  },
                  required: ["sfxType", "timestampMs", "volume", "durationMs"],
                  additionalProperties: false,
                },
              },
            },
            required: ["sfx"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    const parsed = JSON.parse(typeof content === "string" ? content : '{"sfx":[]}');
    const sfxEntries: SfxEntry[] = (parsed.sfx || []).map((s: any) => ({
      sfxType: s.sfxType || "whoosh",
      timestampMs: Math.max(0, s.timestampMs || 0),
      volume: Math.max(0, Math.min(100, s.volume || 80)),
      durationMs: Math.max(100, Math.min(5000, s.durationMs || 1000)),
    }));

    // Store SFX data on episode
    const db = await getDb();
    if (db) {
      await db.update(episodes)
        .set({ sfxData: sfxEntries as any })
        .where(eq(episodes.id, episodeId));

      // Also store individual SFX entries in episode_sfx table
      for (const sfx of sfxEntries) {
        await db.insert(episodeSfx).values({
          episodeId,
          sfxType: sfx.sfxType,
          timestampMs: sfx.timestampMs,
          volume: sfx.volume,
          durationMs: sfx.durationMs,
          source: "library",
        });
      }
    }

    return sfxEntries;
  } catch (error: any) {
    console.error(`[SFXAgent] Timeline generation failed:`, error.message);
    return [];
  }
}

// ─── 5. Narrator Voice Agent ────────────────────────────────────────────

/**
 * Extract narrator lines from script content.
 * Narrator lines are marked with character "__narrator__" or are scene descriptions.
 */
export function extractNarratorLines(
  scriptContent: any
): Array<{ text: string; sceneNumber: number; panelNumber: number }> {
  const lines: Array<{ text: string; sceneNumber: number; panelNumber: number }> = [];

  if (!scriptContent) return lines;

  const script = typeof scriptContent === "string" ? JSON.parse(scriptContent) : scriptContent;

  // Handle structured script format
  if (script.scenes && Array.isArray(script.scenes)) {
    for (const scene of script.scenes) {
      // Scene description as narrator line
      if (scene.description) {
        lines.push({
          text: scene.description,
          sceneNumber: scene.sceneNumber || 0,
          panelNumber: 0,
        });
      }

      if (scene.panels && Array.isArray(scene.panels)) {
        for (const panel of scene.panels) {
          // Check for narrator dialogue
          if (panel.dialogue && Array.isArray(panel.dialogue)) {
            for (const d of panel.dialogue) {
              if (d.character === "__narrator__" || d.character === "narrator" || d.character === "Narrator") {
                lines.push({
                  text: d.text || d.line || "",
                  sceneNumber: scene.sceneNumber || 0,
                  panelNumber: panel.panelNumber || 0,
                });
              }
            }
          }

          // Inner monologue / narration
          if (panel.narration) {
            lines.push({
              text: panel.narration,
              sceneNumber: scene.sceneNumber || 0,
              panelNumber: panel.panelNumber || 0,
            });
          }
        }
      }
    }
  }

  return lines;
}

/**
 * Generate narrator voice clips for an episode.
 * In production, this would call ElevenLabs with a narrator voice.
 */
export async function generateNarratorVoice(
  episodeId: number,
  runId: number
): Promise<number> {
  const episode = await getEpisodeById(episodeId);
  if (!episode || !episode.scriptContent) return 0;
  if (!episode.narratorEnabled) return 0;

  const narratorLines = extractNarratorLines(episode.scriptContent);
  let generatedCount = 0;

  for (const line of narratorLines) {
    if (!line.text.trim()) continue;

    try {
      // Generate narrator voice using ElevenLabs
      const key = `pipeline/${runId}/narrator-s${line.sceneNumber}-p${line.panelNumber}-${nanoid(6)}.mp3`;

      // Use "Roger" as default narrator voice (deep, resonant, laid-back)
      const narratorVoiceId = "CwhRBWXzGAHq8TQ4Fs17";
      const audioBuffer = await textToSpeech({
        voiceId: narratorVoiceId,
        text: line.text.slice(0, 5000),
        modelId: MODELS.MULTILINGUAL_V2,
        voiceSettings: VOICE_PRESETS.narrator,
      });

      const { url } = await storagePut(key, audioBuffer, "audio/mpeg");
      const estimatedDuration = Math.ceil(line.text.split(/\s+/).length / 2.5); // ~2.5 words/sec for narration

      await createPipelineAsset({
        pipelineRunId: runId,
        episodeId,
        assetType: "narrator_clip",
        url,
        metadata: {
          text: line.text.slice(0, 500),
          sceneNumber: line.sceneNumber,
          panelNumber: line.panelNumber,
          duration: estimatedDuration,
        } as any,
        nodeSource: "narrator_gen",
      });
      console.log(`[NarratorAgent] Generated clip: scene ${line.sceneNumber}, panel ${line.panelNumber}, ~${estimatedDuration}s`);

      generatedCount++;
    } catch (err) {
      console.error(`[NarratorAgent] Failed for line:`, err);
    }
  }

  return generatedCount;
}

// ─── 6. Enhanced Video Generation Prompts ───────────────────────────────

/**
 * Build an enhanced Kling video generation prompt based on camera angle, mood, and transition.
 */
export function buildEnhancedVideoPrompt(
  visualDescription: string,
  cameraAngle: string = "medium",
  mood: string = "dramatic",
  transition: string = "cut"
): string {
  const cameraMotion = CAMERA_MOTION_PRESETS[cameraAngle] || CAMERA_MOTION_PRESETS["medium"];
  const moodIntensity = MOOD_MOTION_INTENSITY[mood] || MOOD_MOTION_INTENSITY["dramatic"];

  return `${visualDescription}. Camera: ${cameraMotion}. Motion style: ${moodIntensity}. Anime cinematography, high quality animation.`;
}

/**
 * Get the FFmpeg transition filter for a given transition type.
 */
export function getTransitionFilter(transition: string): string {
  return TRANSITION_FFMPEG_FILTERS[transition] || TRANSITION_FFMPEG_FILTERS["dissolve"];
}

/**
 * Build the FFmpeg filter chain for assembling clips with transitions.
 */
export function buildAssemblyFilterChain(
  clipTransitions: Array<{ transition: string; duration?: number }>
): string[] {
  return clipTransitions.map(ct => {
    const filter = TRANSITION_FFMPEG_FILTERS[ct.transition];
    if (!filter) return "";
    if (ct.duration) {
      // Override duration in the filter
      return filter.replace(/duration=[\d.]+/, `duration=${ct.duration}`);
    }
    return filter;
  }).filter(Boolean);
}

// ─── 7. Content Moderation Gate ─────────────────────────────────────────

/**
 * Moderate script content before panel generation.
 */
export async function moderateScript(
  episodeId: number
): Promise<{ status: "clean" | "flagged"; flags: ModerationFlag[] }> {
  const episode = await getEpisodeById(episodeId);
  if (!episode || !episode.scriptContent) {
    return { status: "clean", flags: [] };
  }

  const scriptText = typeof episode.scriptContent === "string"
    ? episode.scriptContent
    : JSON.stringify(episode.scriptContent);

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a content moderator for an anime creation platform. Review the script for policy violations including: extreme graphic violence, explicit sexual content, hate speech, self-harm promotion, child exploitation, or illegal activities. Flag issues with specific categories and severity levels. Most anime content (action, romance, drama) is acceptable. Only flag genuinely problematic content. Return ONLY valid JSON.`,
        },
        {
          role: "user",
          content: `Review this anime script for content policy violations:

${scriptText.slice(0, 5000)}

Return JSON: {"status":"clean"|"flagged","flags":[{"category":"violence|sexual|hate|self_harm|illegal","severity":"low|medium|high","description":"...","lineNumber":0}]}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "moderation_result",
          strict: true,
          schema: {
            type: "object",
            properties: {
              status: { type: "string", enum: ["clean", "flagged"] },
              flags: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    category: { type: "string" },
                    severity: { type: "string", enum: ["low", "medium", "high"] },
                    description: { type: "string" },
                    lineNumber: { type: "integer" },
                  },
                  required: ["category", "severity", "description", "lineNumber"],
                  additionalProperties: false,
                },
              },
            },
            required: ["status", "flags"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    const result = JSON.parse(typeof content === "string" ? content : '{"status":"clean","flags":[]}');

    // Update episode moderation status
    const db = await getDb();
    if (db) {
      await db.update(episodes)
        .set({
          scriptModerationStatus: result.status as any,
          scriptModerationFlags: result.flags as any,
        })
        .where(eq(episodes.id, episodeId));
    }

    return {
      status: result.status as "clean" | "flagged",
      flags: result.flags || [],
    };
  } catch (error: any) {
    console.error(`[ModerationAgent] Script moderation failed:`, error.message);
    return { status: "clean", flags: [] };
  }
}

/**
 * Moderate a generated panel image.
 */
export async function moderatePanel(
  panelId: number
): Promise<{ status: "clean" | "flagged"; flags: ModerationFlag[] }> {
  const panel = await getPanelById(panelId);
  if (!panel || !panel.imageUrl) {
    return { status: "clean", flags: [] };
  }

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a visual content moderator for an anime platform. Review this generated panel image for policy violations: explicit nudity, extreme graphic violence, hate symbols, or disturbing content. Standard anime action, romance, and drama is acceptable. Only flag genuinely problematic content. Return ONLY valid JSON.`,
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: panel.imageUrl, detail: "low" },
            },
            {
              type: "text",
              text: `Review this anime panel for content policy violations.
Return JSON: {"status":"clean"|"flagged","flags":[{"category":"nudity|violence|hate|disturbing","severity":"low|medium|high","description":"..."}]}`,
            },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "panel_moderation",
          strict: true,
          schema: {
            type: "object",
            properties: {
              status: { type: "string", enum: ["clean", "flagged"] },
              flags: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    category: { type: "string" },
                    severity: { type: "string", enum: ["low", "medium", "high"] },
                    description: { type: "string" },
                  },
                  required: ["category", "severity", "description"],
                  additionalProperties: false,
                },
              },
            },
            required: ["status", "flags"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    const result = JSON.parse(typeof content === "string" ? content : '{"status":"clean","flags":[]}');

    // Update panel moderation status
    await updatePanel(panelId, {
      moderationStatus: result.status as any,
      moderationFlags: result.flags as any,
    } as any);

    return {
      status: result.status as "clean" | "flagged",
      flags: result.flags || [],
    };
  } catch (error: any) {
    console.error(`[ModerationAgent] Panel moderation failed:`, error.message);
    await updatePanel(panelId, { moderationStatus: "clean" } as any);
    return { status: "clean", flags: [] };
  }
}

// ─── 8. Smart Cost Estimation ───────────────────────────────────────────

const COST_PER_UNIT = {
  upscale: 1,       // $0.01 per panel
  videoGen: 15,     // $0.15 per clip
  voice: 2,         // $0.02 per dialogue line
  narrator: 2,      // $0.02 per narrator line
  music: 10,        // $0.10 per segment
  sfx: 1,           // $0.01 per SFX
  assembly: 5,      // $0.05 flat
};

/**
 * Estimate the cost of running the full pipeline for an episode.
 */
export async function estimatePipelineCost(
  episodeId: number
): Promise<CostEstimate> {
  const episode = await getEpisodeById(episodeId);
  if (!episode) throw new Error("Episode not found");

  const allPanels = await getPanelsByEpisode(episodeId);
  const panelCount = allPanels.filter(p => p.imageUrl).length;

  // Count dialogue lines
  let dialogueLineCount = 0;
  let narratorLineCount = 0;

  for (const panel of allPanels) {
    const dialogue = panel.dialogue as any;
    if (dialogue && Array.isArray(dialogue)) {
      for (const d of dialogue) {
        if (d.character === "__narrator__" || d.character === "narrator" || d.character === "Narrator") {
          narratorLineCount++;
        } else {
          dialogueLineCount++;
        }
      }
    }
  }

  // Also count narrator lines from script
  if (episode.scriptContent) {
    const scriptNarratorLines = extractNarratorLines(episode.scriptContent);
    narratorLineCount = Math.max(narratorLineCount, scriptNarratorLines.length);
  }

  // Estimate SFX count (roughly 1 per 2 panels)
  const sfxCount = Math.ceil(panelCount / 2);

  // Music segments (1 per scene, estimate 1 per 4 panels)
  const musicSegments = Math.max(1, Math.ceil(panelCount / 4));

  const estimate: CostEstimate = {
    upscaling: { count: panelCount, unitCost: COST_PER_UNIT.upscale, total: panelCount * COST_PER_UNIT.upscale },
    videoGeneration: { count: panelCount, unitCost: COST_PER_UNIT.videoGen, total: panelCount * COST_PER_UNIT.videoGen },
    voiceActing: { count: dialogueLineCount, unitCost: COST_PER_UNIT.voice, total: dialogueLineCount * COST_PER_UNIT.voice },
    narrator: { count: narratorLineCount, unitCost: COST_PER_UNIT.narrator, total: narratorLineCount * COST_PER_UNIT.narrator },
    music: { count: musicSegments, unitCost: COST_PER_UNIT.music, total: musicSegments * COST_PER_UNIT.music },
    sfx: { count: sfxCount, unitCost: COST_PER_UNIT.sfx, total: sfxCount * COST_PER_UNIT.sfx },
    assembly: { count: 1, unitCost: COST_PER_UNIT.assembly, total: COST_PER_UNIT.assembly },
    totalCents: 0,
  };

  estimate.totalCents = estimate.upscaling.total + estimate.videoGeneration.total +
    estimate.voiceActing.total + estimate.narrator.total +
    estimate.music.total + estimate.sfx.total + estimate.assembly.total;

  // Store estimate on episode
  const db = await getDb();
  if (db) {
    await db.update(episodes)
      .set({ estimatedCostCents: estimate.totalCents })
      .where(eq(episodes.id, episodeId));
  }

  return estimate;
}
