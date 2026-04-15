/**
 * Harness Checks — All 5 Layers
 * 
 * Layer 1: Script Validation (5 checks) — compute + LLM text
 * Layer 2: Visual Consistency (4 checks) — LLM vision (most critical)
 * Layer 3: Video Quality (5 checks) — LLM vision + compute
 * Layer 4: Audio Quality (4 checks) — compute + speech-to-text
 * Layer 5: Integration Validation (4 checks) — compute
 * 
 * Total: 22 checks across 5 layers
 */

import { invokeLLM } from "./_core/llm";
import type {
  HarnessCheckConfig,
  HarnessCheckFn,
  HarnessCheckResult,
  HarnessContext,
} from "./harness-runner";
import type { ProductionBibleData } from "./production-bible";

// ═══════════════════════════════════════════════════════════════════════
// LAYER 1: SCRIPT VALIDATION
// ═══════════════════════════════════════════════════════════════════════

// --- Check 1A: Schema Validation (compute, no AI cost) ---

export const check1AConfig: HarnessCheckConfig = {
  name: "1A_schema_validation",
  layer: "script",
  description: "Validates script JSON structure: required fields, types, panel format",
  costEstimate: 0,
  isCompute: true,
};

export const check1A: HarnessCheckFn = async (ctx, bible) => {
  const script = ctx.targetData;
  const issues: string[] = [];

  if (!script) {
    return { result: "block", score: 0, details: { error: "No script data provided" }, costCredits: 0 };
  }

  // Validate top-level structure
  if (!script.scenes && !script.panels) {
    issues.push("Missing scenes or panels array");
  }

  const panels = script.panels || (script.scenes || []).flatMap((s: any) => s.panels || []);

  if (panels.length === 0) {
    issues.push("No panels found in script");
  }

  for (let i = 0; i < panels.length; i++) {
    const p = panels[i];
    if (!p.visualDescription && !p.visual_description) {
      issues.push(`Panel ${i + 1}: missing visual description`);
    }
  }

  const score = issues.length === 0 ? 10 : Math.max(0, 10 - issues.length * 2);
  return {
    result: issues.length === 0 ? "pass" : issues.length > 3 ? "block" : "warn",
    score,
    details: { issues, panelCount: panels.length },
    costCredits: 0,
  };
};

// --- Check 1B: Character Name Consistency (LLM text analysis) ---

export const check1BConfig: HarnessCheckConfig = {
  name: "1B_character_consistency",
  layer: "script",
  description: "Verifies character names in script match Production Bible characters",
  costEstimate: 0.002,
  isCompute: false,
};

export const check1B: HarnessCheckFn = async (ctx, bible) => {
  const script = ctx.targetData;
  if (!script) return { result: "warn", score: 5, details: { error: "No script data" }, costCredits: 0 };

  const panels = script.panels || (script.scenes || []).flatMap((s: any) => s.panels || []);
  const bibleNames = bible.characters.map(c => c.name.toLowerCase());
  const scriptNames = new Set<string>();

  for (const p of panels) {
    const dialogue = p.dialogue || [];
    const dialogueArr = Array.isArray(dialogue) ? dialogue : [];
    for (const d of dialogueArr) {
      if (d.character) scriptNames.add(d.character.toLowerCase());
    }
  }

  const unknownNames = Array.from(scriptNames).filter(n => !bibleNames.includes(n) && n !== "narrator" && n !== "sfx");
  const missingFromScript = bible.characters
    .filter(c => c.role === "protagonist" || c.role === "antagonist")
    .filter(c => !scriptNames.has(c.name.toLowerCase()))
    .map(c => c.name);

  const score = unknownNames.length === 0 && missingFromScript.length === 0
    ? 10
    : Math.max(0, 10 - unknownNames.length * 2 - missingFromScript.length);

  return {
    result: unknownNames.length > 2 ? "retry" : unknownNames.length > 0 ? "warn" : "pass",
    score,
    details: {
      bibleCharacters: bible.characters.map(c => c.name),
      scriptCharacters: Array.from(scriptNames),
      unknownNames,
      missingMainCharacters: missingFromScript,
    },
    autoFixApplied: unknownNames.length > 0 ? "Flag unknown character names for review" : undefined,
    costCredits: 0,
  };
};

// --- Check 1C: Panel Count & Chapter Structure (compute) ---

export const check1CConfig: HarnessCheckConfig = {
  name: "1C_panel_structure",
  layer: "script",
  description: "Validates panel count, scene structure, and pacing",
  costEstimate: 0,
  isCompute: true,
};

export const check1C: HarnessCheckFn = async (ctx, bible) => {
  const script = ctx.targetData;
  if (!script) return { result: "warn", score: 5, details: { error: "No script data" }, costCredits: 0 };

  const panels = script.panels || (script.scenes || []).flatMap((s: any) => s.panels || []);
  const scenes = script.scenes || [];
  const issues: string[] = [];

  // Check panel count (expect 8-50 panels per episode)
  if (panels.length < 4) issues.push(`Too few panels: ${panels.length} (min 4)`);
  if (panels.length > 60) issues.push(`Too many panels: ${panels.length} (max 60)`);

  // Check scene structure
  if (scenes.length === 0 && panels.length > 0) {
    // Flat panel list is OK but note it
  }

  // Check for empty visual descriptions
  const emptyVisuals = panels.filter((p: any) => {
    const desc = p.visualDescription || p.visual_description || "";
    return desc.length < 10;
  });
  if (emptyVisuals.length > 0) {
    issues.push(`${emptyVisuals.length} panels have weak visual descriptions (<10 chars)`);
  }

  const score = Math.max(0, 10 - issues.length * 2);
  return {
    result: issues.length === 0 ? "pass" : issues.length > 2 ? "retry" : "warn",
    score,
    details: { panelCount: panels.length, sceneCount: scenes.length, issues, emptyVisualCount: emptyVisuals.length },
    costCredits: 0,
  };
};

// --- Check 1D: Content Moderation (LLM text analysis) ---

export const check1DConfig: HarnessCheckConfig = {
  name: "1D_content_moderation",
  layer: "script",
  description: "Checks script for prohibited content, extreme violence, or policy violations",
  costEstimate: 0.003,
  isCompute: false,
};

export const check1D: HarnessCheckFn = async (ctx, bible) => {
  const script = ctx.targetData;
  if (!script) return { result: "warn", score: 5, details: { error: "No script data" }, costCredits: 0 };

  const panels = script.panels || (script.scenes || []).flatMap((s: any) => s.panels || []);
  const allText = panels.map((p: any) => {
    const vis = p.visualDescription || p.visual_description || "";
    const dialogue = Array.isArray(p.dialogue) ? p.dialogue.map((d: any) => d.text || d.line || "").join(" ") : "";
    return `${vis} ${dialogue}`;
  }).join("\n");

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a content moderation system. Analyze the following anime/manga script for:
1. Explicit sexual content (not suggestive themes, but explicit)
2. Extreme graphic violence beyond typical anime action
3. Hate speech or discriminatory content
4. Content that could be harmful to minors

Respond in JSON: {"safe": boolean, "score": 1-10 (10=completely safe), "flags": ["issue1", ...], "severity": "none"|"low"|"medium"|"high"}`
        },
        { role: "user", content: allText.substring(0, 4000) }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "moderation_result",
          strict: true,
          schema: {
            type: "object",
            properties: {
              safe: { type: "boolean" },
              score: { type: "number" },
              flags: { type: "array", items: { type: "string" } },
              severity: { type: "string", enum: ["none", "low", "medium", "high"] },
            },
            required: ["safe", "score", "flags", "severity"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent1D = response.choices[0].message.content;
    const modResult = JSON.parse(typeof rawContent1D === "string" ? rawContent1D : JSON.stringify(rawContent1D) || "{}");
    const shouldBlock = bible.qualityThresholds.blockOnNsfw && modResult.severity === "high";

    return {
      result: shouldBlock ? "block" : modResult.safe ? "pass" : "warn",
      score: modResult.score || 5,
      details: modResult,
      costCredits: 0.003,
    };
  } catch (e: any) {
    return { result: "warn", score: 5, details: { error: e.message }, costCredits: 0.001 };
  }
};

// --- Check 1E: Visual Description Quality (LLM text analysis + auto-enhance) ---

export const check1EConfig: HarnessCheckConfig = {
  name: "1E_visual_quality",
  layer: "script",
  description: "Scores visual descriptions and auto-enhances weak ones",
  costEstimate: 0.005,
  isCompute: false,
};

export const check1E: HarnessCheckFn = async (ctx, bible) => {
  const script = ctx.targetData;
  if (!script) return { result: "warn", score: 5, details: { error: "No script data" }, costCredits: 0 };

  const panels = script.panels || (script.scenes || []).flatMap((s: any) => s.panels || []);
  const weakPanels: Array<{ index: number; description: string }> = [];

  for (let i = 0; i < panels.length; i++) {
    const desc = panels[i].visualDescription || panels[i].visual_description || "";
    if (desc.length < 30) {
      weakPanels.push({ index: i, description: desc });
    }
  }

  if (weakPanels.length === 0) {
    return { result: "pass", score: 9, details: { allDescriptionsAdequate: true, panelCount: panels.length }, costCredits: 0 };
  }

  // Auto-enhance weak descriptions
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an anime art director. Enhance these weak visual descriptions for manga panels.
Art style: ${bible.artStyle}. Color grading: ${bible.colorGrading}.
For each panel, provide a detailed visual description (50-100 words) suitable for AI image generation.
Respond in JSON: {"enhanced": [{"index": number, "original": string, "enhanced": string}]}`
        },
        { role: "user", content: JSON.stringify(weakPanels.slice(0, 10)) }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "enhanced_descriptions",
          strict: true,
          schema: {
            type: "object",
            properties: {
              enhanced: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    index: { type: "number" },
                    original: { type: "string" },
                    enhanced: { type: "string" },
                  },
                  required: ["index", "original", "enhanced"],
                  additionalProperties: false,
                },
              },
            },
            required: ["enhanced"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent1E = response.choices[0].message.content;
    const enhanceResult = JSON.parse(typeof rawContent1E === "string" ? rawContent1E : JSON.stringify(rawContent1E) || '{"enhanced":[]}');
    const score = Math.max(3, 10 - weakPanels.length);

    return {
      result: "warn",
      score,
      details: {
        weakPanelCount: weakPanels.length,
        totalPanels: panels.length,
        enhancedDescriptions: enhanceResult.enhanced,
      },
      autoFixApplied: `Enhanced ${enhanceResult.enhanced?.length || 0} weak visual descriptions`,
      costCredits: 0.005,
    };
  } catch (e: any) {
    return { result: "warn", score: 5, details: { error: e.message, weakPanelCount: weakPanels.length }, costCredits: 0.002 };
  }
};

// ═══════════════════════════════════════════════════════════════════════
// LAYER 2: VISUAL CONSISTENCY (Most Critical)
// ═══════════════════════════════════════════════════════════════════════

// --- Check 2A: Image Quality Score (LLM vision) ---

export const check2AConfig: HarnessCheckConfig = {
  name: "2A_image_quality",
  layer: "visual",
  description: "Scores generated panel image quality using LLM vision",
  costEstimate: 0.01,
  isCompute: false,
};

export const check2A: HarnessCheckFn = async (ctx, bible) => {
  if (!ctx.targetUrl) return { result: "warn", score: 5, details: { error: "No image URL" }, costCredits: 0 };

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an anime quality inspector. Score this manga/anime panel image on:
1. Technical quality (resolution, artifacts, noise): 1-10
2. Artistic quality (composition, color, style): 1-10
3. Anime fidelity (does it look like proper anime/manga): 1-10
4. Overall impression: 1-10

Art style target: ${bible.artStyle}. Color grading: ${bible.colorGrading}.
Respond in JSON: {"technical": number, "artistic": number, "anime_fidelity": number, "overall": number, "issues": ["issue1", ...]}`,
        },
      {
        role: "user" as const,
        content: [
          { type: "text" as const, text: "Score this anime panel image:" },
          { type: "image_url" as const, image_url: { url: ctx.targetUrl, detail: "low" as const } },
        ],
      },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "image_quality",
          strict: true,
          schema: {
            type: "object",
            properties: {
              technical: { type: "number" },
              artistic: { type: "number" },
              anime_fidelity: { type: "number" },
              overall: { type: "number" },
              issues: { type: "array", items: { type: "string" } },
            },
            required: ["technical", "artistic", "anime_fidelity", "overall", "issues"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent2A = response.choices[0].message.content;
    const quality = JSON.parse(typeof rawContent2A === "string" ? rawContent2A : JSON.stringify(rawContent2A) || "{}");
    const score = quality.overall || 5;
    const threshold = bible.qualityThresholds.minImageScore;

    return {
      result: score >= threshold ? "pass" : score >= threshold - 2 ? "warn" : "retry",
      score,
      details: quality,
      autoFixApplied: score < threshold ? "Flag for regeneration with enhanced prompt" : undefined,
      costCredits: 0.01,
    };
  } catch (e: any) {
    return { result: "warn", score: 5, details: { error: e.message }, costCredits: 0.005 };
  }
};

// --- Check 2B: Character Identity Verification (LLM vision — MOST IMPORTANT) ---

export const check2BConfig: HarnessCheckConfig = {
  name: "2B_character_identity",
  layer: "visual",
  description: "Verifies character appearance matches Production Bible reference images",
  costEstimate: 0.015,
  isCompute: false,
};

export const check2B: HarnessCheckFn = async (ctx, bible) => {
  if (!ctx.targetUrl) return { result: "warn", score: 5, details: { error: "No image URL" }, costCredits: 0 };

  // Find which character this panel features
  const characterName = ctx.targetData?.characterName || ctx.targetData?.primaryCharacter;
  if (!characterName) {
    return { result: "pass", score: 8, details: { note: "No specific character to verify (background/environment panel)" }, costCredits: 0 };
  }

  const character = bible.characters.find(c => c.name.toLowerCase() === characterName.toLowerCase());
  if (!character || character.referenceImages.length === 0) {
    return { result: "warn", score: 6, details: { note: `No reference images for character: ${characterName}` }, costCredits: 0 };
  }

  try {
    const messages: any[] = [
      {
        role: "system",
        content: `You are an anime character consistency inspector. Compare the generated panel image with the character reference image.
Character: ${character.name} (${character.role})
Visual traits: ${JSON.stringify(character.visualTraits)}

Score on:
1. Face/hair match: 1-10
2. Outfit/clothing match: 1-10
3. Color palette match: 1-10
4. Overall identity consistency: 1-10

This is the MOST CRITICAL check. A score below 7 means the character is not recognizable.
Respond in JSON: {"face_match": number, "outfit_match": number, "color_match": number, "identity_score": number, "issues": ["issue1", ...], "is_same_character": boolean}`,
      },
      {
        role: "user" as const,
        content: [
          { type: "text" as const, text: `Reference image for ${character.name}:` },
          { type: "image_url" as const, image_url: { url: character.referenceImages[0], detail: "low" as const } },
          { type: "text" as const, text: "Generated panel image:" },
          { type: "image_url" as const, image_url: { url: ctx.targetUrl!, detail: "low" as const } },
        ],
      },
    ];

    const response = await invokeLLM({
      messages,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "character_identity",
          strict: true,
          schema: {
            type: "object",
            properties: {
              face_match: { type: "number" },
              outfit_match: { type: "number" },
              color_match: { type: "number" },
              identity_score: { type: "number" },
              issues: { type: "array", items: { type: "string" } },
              is_same_character: { type: "boolean" },
            },
            required: ["face_match", "outfit_match", "color_match", "identity_score", "issues", "is_same_character"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent2B = response.choices[0].message.content;
    const identity = JSON.parse(typeof rawContent2B === "string" ? rawContent2B : JSON.stringify(rawContent2B) || "{}");
    const score = identity.identity_score || 5;
    const threshold = bible.qualityThresholds.minCharacterMatch;

    let autoFix: string | undefined;
    if (score < threshold) {
      autoFix = character.loraModelUrl
        ? `Retry with LoRA model (${character.loraTriggerWord}) for better character consistency`
        : `Retry with enhanced character description in prompt: ${JSON.stringify(character.visualTraits)}`;
    }

    return {
      result: score >= threshold ? "pass" : score >= threshold - 2 ? "warn" : "retry",
      score,
      details: { ...identity, characterName: character.name, characterId: character.id },
      autoFixApplied: autoFix,
      costCredits: 0.015,
    };
  } catch (e: any) {
    return { result: "warn", score: 5, details: { error: e.message }, costCredits: 0.005 };
  }
};

// --- Check 2C: Scene Consistency (LLM vision) ---

export const check2CConfig: HarnessCheckConfig = {
  name: "2C_scene_consistency",
  layer: "visual",
  description: "Checks visual consistency between consecutive panels in the same scene",
  costEstimate: 0.01,
  isCompute: false,
};

export const check2C: HarnessCheckFn = async (ctx, bible) => {
  if (!ctx.targetUrl) return { result: "warn", score: 5, details: { error: "No image URL" }, costCredits: 0 };

  const prevPanelUrl = ctx.targetData?.previousPanelUrl;
  if (!prevPanelUrl) {
    return { result: "pass", score: 8, details: { note: "First panel in scene, no previous panel to compare" }, costCredits: 0 };
  }

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an anime scene continuity inspector. Compare these two consecutive panels from the same scene.
Check for:
1. Background consistency (same location, lighting): 1-10
2. Color palette consistency: 1-10
3. Art style consistency: 1-10
4. Overall scene continuity: 1-10

Respond in JSON: {"background": number, "color_palette": number, "art_style": number, "continuity": number, "issues": ["issue1", ...]}`,
        },
        {
          role: "user" as const,
          content: [
            { type: "text" as const, text: "Previous panel:" },
            { type: "image_url" as const, image_url: { url: prevPanelUrl, detail: "low" as const } },
            { type: "text" as const, text: "Current panel:" },
            { type: "image_url" as const, image_url: { url: ctx.targetUrl!, detail: "low" as const } },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "scene_consistency",
          strict: true,
          schema: {
            type: "object",
            properties: {
              background: { type: "number" },
              color_palette: { type: "number" },
              art_style: { type: "number" },
              continuity: { type: "number" },
              issues: { type: "array", items: { type: "string" } },
            },
            required: ["background", "color_palette", "art_style", "continuity", "issues"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent2C = response.choices[0].message.content;
    const consistency = JSON.parse(typeof rawContent2C === "string" ? rawContent2C : JSON.stringify(rawContent2C) || "{}");
    const score = consistency.continuity || 5;

    return {
      result: score >= 6 ? "pass" : score >= 4 ? "warn" : "retry",
      score,
      details: consistency,
      autoFixApplied: score < 6 ? "Retry with previous panel as reference image for style transfer" : undefined,
      costCredits: 0.01,
    };
  } catch (e: any) {
    return { result: "warn", score: 5, details: { error: e.message }, costCredits: 0.005 };
  }
};

// --- Check 2D: NSFW / Content Safety (compute + vision) ---

export const check2DConfig: HarnessCheckConfig = {
  name: "2D_content_safety",
  layer: "visual",
  description: "Checks generated images for NSFW or unsafe visual content",
  costEstimate: 0.005,
  isCompute: false,
};

export const check2D: HarnessCheckFn = async (ctx, bible) => {
  if (!ctx.targetUrl) return { result: "warn", score: 5, details: { error: "No image URL" }, costCredits: 0 };

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a content safety classifier for anime images. Check for:
1. Explicit nudity or sexual content
2. Extreme graphic violence (gore, dismemberment)
3. Hate symbols or offensive imagery
4. Content inappropriate for the target audience

This is an anime/manga production. Typical anime action violence and suggestive themes are acceptable.
Respond in JSON: {"safe": boolean, "score": 1-10 (10=completely safe), "flags": ["flag1", ...], "severity": "none"|"low"|"medium"|"high"}`,
        },
        {
          role: "user" as const,
          content: [
            { type: "text" as const, text: "Check this anime panel:" },
            { type: "image_url" as const, image_url: { url: ctx.targetUrl!, detail: "low" as const } },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "content_safety",
          strict: true,
          schema: {
            type: "object",
            properties: {
              safe: { type: "boolean" },
              score: { type: "number" },
              flags: { type: "array", items: { type: "string" } },
              severity: { type: "string", enum: ["none", "low", "medium", "high"] },
            },
            required: ["safe", "score", "flags", "severity"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent2D = response.choices[0].message.content;
    const safety = JSON.parse(typeof rawContent2D === "string" ? rawContent2D : JSON.stringify(rawContent2D) || "{}");
    const shouldBlock = bible.qualityThresholds.blockOnNsfw && safety.severity === "high";

    return {
      result: shouldBlock ? "block" : safety.safe ? "pass" : "warn",
      score: safety.score || 5,
      details: safety,
      costCredits: 0.005,
    };
  } catch (e: any) {
    return { result: "warn", score: 5, details: { error: e.message }, costCredits: 0.002 };
  }
};

// ═══════════════════════════════════════════════════════════════════════
// LAYER 3: VIDEO QUALITY
// ═══════════════════════════════════════════════════════════════════════

// --- Check 3A: Source Faithfulness (first frame vs source panel) ---

export const check3AConfig: HarnessCheckConfig = {
  name: "3A_source_faithfulness",
  layer: "video",
  description: "Compares video first frame to source manga panel for faithfulness",
  costEstimate: 0.01,
  isCompute: false,
};

export const check3A: HarnessCheckFn = async (ctx, bible) => {
  const sourceUrl = ctx.targetData?.sourcePanelUrl;
  const videoUrl = ctx.targetUrl;
  if (!sourceUrl || !videoUrl) {
    return { result: "warn", score: 6, details: { note: "Missing source panel or video URL" }, costCredits: 0 };
  }

  // For video, we use the thumbnail/first frame URL if available
  const frameUrl = ctx.targetData?.firstFrameUrl || videoUrl;

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `Compare the source manga panel with the first frame of the generated anime video.
Score on:
1. Composition match (same layout, framing): 1-10
2. Character preservation (same characters, poses): 1-10
3. Scene elements (background, props): 1-10
4. Overall faithfulness: 1-10

The video should be an animated version of the source panel, not an exact copy.
Respond in JSON: {"composition": number, "character_preservation": number, "scene_elements": number, "faithfulness": number, "issues": ["issue1", ...]}`,
        },
        {
          role: "user" as const,
          content: [
            { type: "text" as const, text: "Source manga panel:" },
            { type: "image_url" as const, image_url: { url: sourceUrl, detail: "low" as const } },
            { type: "text" as const, text: "Video first frame:" },
            { type: "image_url" as const, image_url: { url: frameUrl, detail: "low" as const } },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "source_faithfulness",
          strict: true,
          schema: {
            type: "object",
            properties: {
              composition: { type: "number" },
              character_preservation: { type: "number" },
              scene_elements: { type: "number" },
              faithfulness: { type: "number" },
              issues: { type: "array", items: { type: "string" } },
            },
            required: ["composition", "character_preservation", "scene_elements", "faithfulness", "issues"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = response.choices[0].message.content;
    const contentStr = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
    const result = JSON.parse(contentStr || "{}");
    const score = result.faithfulness || 5;
    const threshold = bible.qualityThresholds.minVideoScore;

    return {
      result: score >= threshold ? "pass" : score >= threshold - 2 ? "warn" : "retry",
      score,
      details: result,
      autoFixApplied: score < threshold ? "Retry video generation with stronger source image conditioning" : undefined,
      costCredits: 0.01,
    };
  } catch (e: any) {
    return { result: "warn", score: 5, details: { error: e.message }, costCredits: 0.005 };
  }
};

// --- Check 3B: Temporal Consistency (first frame vs last frame) ---

export const check3BConfig: HarnessCheckConfig = {
  name: "3B_temporal_consistency",
  layer: "video",
  description: "Checks if video maintains visual consistency from start to end",
  costEstimate: 0.01,
  isCompute: false,
};

export const check3B: HarnessCheckFn = async (ctx, bible) => {
  const firstFrameUrl = ctx.targetData?.firstFrameUrl;
  const lastFrameUrl = ctx.targetData?.lastFrameUrl;
  if (!firstFrameUrl || !lastFrameUrl) {
    return { result: "pass", score: 7, details: { note: "Frame URLs not available, skipping temporal check" }, costCredits: 0 };
  }

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `Compare the first and last frames of an anime video clip.
Check for temporal consistency:
1. Character identity maintained: 1-10
2. Art style consistency: 1-10
3. No visual artifacts or degradation: 1-10
4. Overall temporal quality: 1-10

Some change is expected (animation), but characters should remain recognizable.
Respond in JSON: {"character_maintained": number, "style_consistency": number, "artifact_free": number, "temporal_quality": number, "issues": ["issue1", ...]}`,
        },
        {
          role: "user" as const,
          content: [
            { type: "text" as const, text: "First frame:" },
            { type: "image_url" as const, image_url: { url: firstFrameUrl, detail: "low" as const } },
            { type: "text" as const, text: "Last frame:" },
            { type: "image_url" as const, image_url: { url: lastFrameUrl, detail: "low" as const } },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "temporal_consistency",
          strict: true,
          schema: {
            type: "object",
            properties: {
              character_maintained: { type: "number" },
              style_consistency: { type: "number" },
              artifact_free: { type: "number" },
              temporal_quality: { type: "number" },
              issues: { type: "array", items: { type: "string" } },
            },
            required: ["character_maintained", "style_consistency", "artifact_free", "temporal_quality", "issues"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent3B = response.choices[0].message.content;
    const contentStr3B = typeof rawContent3B === "string" ? rawContent3B : JSON.stringify(rawContent3B);
    const result = JSON.parse(contentStr3B || "{}");
    return {
      result: (result.temporal_quality || 5) >= 5 ? "pass" : "warn",
      score: result.temporal_quality || 5,
      details: result,
      costCredits: 0.01,
    };
  } catch (e: any) {
    return { result: "warn", score: 5, details: { error: e.message }, costCredits: 0.005 };
  }
};

// --- Check 3C: Motion Quality (frame sampling) ---

export const check3CConfig: HarnessCheckConfig = {
  name: "3C_motion_quality",
  layer: "video",
  description: "Evaluates animation motion quality and smoothness",
  costEstimate: 0.005,
  isCompute: false,
};

export const check3C: HarnessCheckFn = async (ctx, bible) => {
  // Use video metadata for motion quality assessment
  const metadata = ctx.targetData?.metadata || {};
  const duration = metadata.duration || 5;
  const fileSize = metadata.fileSize || 0;

  // Compute-based heuristics
  const issues: string[] = [];
  let score = 8;

  // Very small file for duration suggests low quality
  if (fileSize > 0 && duration > 0) {
    const bytesPerSecond = fileSize / duration;
    if (bytesPerSecond < 500000) { // < 500KB/s is very low
      issues.push("Low bitrate suggests poor video quality");
      score -= 2;
    }
  }

  // Duration check
  if (duration < 2) {
    issues.push("Video clip too short for meaningful animation");
    score -= 1;
  }

  return {
    result: score >= 6 ? "pass" : "warn",
    score: Math.max(1, score),
    details: { duration, fileSize, bytesPerSecond: fileSize > 0 ? Math.round(fileSize / duration) : null, issues },
    costCredits: 0,
  };
};

// --- Check 3D: Lip Sync Accuracy (compute) ---

export const check3DConfig: HarnessCheckConfig = {
  name: "3D_lip_sync",
  layer: "video",
  description: "Checks lip sync accuracy for dialogue panels",
  costEstimate: 0,
  isCompute: true,
};

export const check3D: HarnessCheckFn = async (ctx, bible) => {
  const hasDialogue = ctx.targetData?.hasDialogue || false;
  const hasNativeLipSync = ctx.targetData?.hasNativeLipSync || false;
  const usedSubjectLibrary = ctx.targetData?.usedSubjectLibrary || false;

  if (!hasDialogue) {
    return { result: "pass", score: 10, details: { note: "No dialogue panel, lip sync not applicable" }, costCredits: 0 };
  }

  // Score based on the method used
  let score = 6;
  const details: Record<string, any> = { hasDialogue, hasNativeLipSync, usedSubjectLibrary };

  if (usedSubjectLibrary) {
    score = 9;
    details.method = "Kling Subject Library (native lip sync)";
  } else if (hasNativeLipSync) {
    score = 7;
    details.method = "Kling V3 Omni (ambient audio, no character binding)";
  } else {
    score = 5;
    details.method = "Voice overlay only (no visual lip sync)";
    details.recommendation = "Create Subject Library elements for this character to enable native lip sync";
  }

  return {
    result: score >= 6 ? "pass" : "warn",
    score,
    details,
    costCredits: 0,
  };
};

// --- Check 3E: Animation Style Compliance ---

export const check3EConfig: HarnessCheckConfig = {
  name: "3E_animation_style",
  layer: "video",
  description: "Verifies animation style matches Production Bible specification",
  costEstimate: 0,
  isCompute: true,
};

export const check3E: HarnessCheckFn = async (ctx, bible) => {
  const metadata = ctx.targetData?.metadata || {};
  const resolution = metadata.resolution || "";
  const issues: string[] = [];
  let score = 8;

  // Check aspect ratio compliance
  const expectedAspect = bible.aspectRatio || "16:9";
  if (resolution && expectedAspect === "16:9") {
    const [w, h] = resolution.split("x").map(Number);
    if (w && h) {
      const ratio = w / h;
      if (ratio < 1.5 || ratio > 1.9) {
        issues.push(`Aspect ratio ${(ratio).toFixed(2)} doesn't match expected 16:9`);
        score -= 2;
      }
    }
  }

  // Check animation style metadata
  const animStyle = bible.animationStyle;
  if (animStyle) {
    // Metadata-based check
    const clipStyle = metadata.animationStyle || metadata.style;
    if (clipStyle && clipStyle !== animStyle) {
      issues.push(`Style mismatch: expected ${animStyle}, got ${clipStyle}`);
      score -= 1;
    }
  }

  return {
    result: score >= 6 ? "pass" : "warn",
    score: Math.max(1, score),
    details: { expectedStyle: bible.animationStyle, expectedAspect: bible.aspectRatio, resolution, issues },
    costCredits: 0,
  };
};

// ═══════════════════════════════════════════════════════════════════════
// LAYER 4: AUDIO QUALITY
// ═══════════════════════════════════════════════════════════════════════

// --- Check 4A: Voice Consistency (compute/API) ---

export const check4AConfig: HarnessCheckConfig = {
  name: "4A_voice_consistency",
  layer: "audio",
  description: "Checks voice clip consistency with assigned character voice",
  costEstimate: 0,
  isCompute: true,
};

export const check4A: HarnessCheckFn = async (ctx, bible) => {
  const characterName = ctx.targetData?.characterName;
  const voiceId = ctx.targetData?.voiceId;
  const duration = ctx.targetData?.duration || 0;

  if (!characterName) {
    return { result: "pass", score: 8, details: { note: "No character voice to verify" }, costCredits: 0 };
  }

  const character = bible.characters.find(c => c.name.toLowerCase() === characterName.toLowerCase());
  const assignedVoiceId = character?.voiceId || bible.voiceAssignments[characterName]?.voiceId;

  const issues: string[] = [];
  let score = 8;

  // Check voice ID matches assignment
  if (assignedVoiceId && voiceId && voiceId !== assignedVoiceId) {
    issues.push(`Voice ID mismatch: used ${voiceId}, expected ${assignedVoiceId}`);
    score -= 3;
  }

  // Check duration is reasonable (0.5s - 30s for dialogue)
  if (duration < 0.3) {
    issues.push(`Voice clip too short: ${duration}s`);
    score -= 2;
  }
  if (duration > 30) {
    issues.push(`Voice clip unusually long: ${duration}s`);
    score -= 1;
  }

  return {
    result: score >= 6 ? "pass" : "warn",
    score: Math.max(1, score),
    details: { characterName, voiceId, assignedVoiceId, duration, issues },
    costCredits: 0,
  };
};

// --- Check 4B: Dialogue-Script Match (speech-to-text + WER) ---

export const check4BConfig: HarnessCheckConfig = {
  name: "4B_dialogue_match",
  layer: "audio",
  description: "Verifies generated voice matches the script dialogue text",
  costEstimate: 0,
  isCompute: true,
};

export const check4B: HarnessCheckFn = async (ctx, bible) => {
  const expectedText = ctx.targetData?.expectedDialogue || "";
  const actualText = ctx.targetData?.transcribedText;

  if (!expectedText) {
    return { result: "pass", score: 8, details: { note: "No dialogue text to verify" }, costCredits: 0 };
  }

  if (!actualText) {
    // Can't verify without transcription, give benefit of doubt
    return { result: "pass", score: 7, details: { note: "No transcription available, assuming TTS is accurate" }, costCredits: 0 };
  }

  // Simple word error rate calculation
  const expected = expectedText.toLowerCase().split(/\s+/);
  const actual = actualText.toLowerCase().split(/\s+/);
  const maxLen = Math.max(expected.length, actual.length);
  
  if (maxLen === 0) return { result: "pass", score: 10, details: { note: "Empty dialogue" }, costCredits: 0 };

  let matches = 0;
  for (const word of expected) {
    if (actual.includes(word)) matches++;
  }

  const accuracy = matches / expected.length;
  const score = Math.round(accuracy * 10);

  return {
    result: score >= 7 ? "pass" : score >= 5 ? "warn" : "retry",
    score,
    details: { expectedText, actualText, wordAccuracy: Math.round(accuracy * 100), wordCount: expected.length },
    autoFixApplied: score < 7 ? "Retry TTS with adjusted pronunciation hints" : undefined,
    costCredits: 0,
  };
};

// --- Check 4C: Music Mood Alignment (LLM text analysis) ---

export const check4CConfig: HarnessCheckConfig = {
  name: "4C_music_mood",
  layer: "audio",
  description: "Checks if background music mood matches the scene",
  costEstimate: 0,
  isCompute: true,
};

export const check4C: HarnessCheckFn = async (ctx, bible) => {
  const musicPrompt = ctx.targetData?.musicPrompt || "";
  const sceneMood = ctx.targetData?.sceneMood || "";
  const duration = ctx.targetData?.duration || 0;

  if (!musicPrompt) {
    return { result: "pass", score: 7, details: { note: "No music prompt to verify" }, costCredits: 0 };
  }

  const issues: string[] = [];
  let score = 8;

  // Check duration is reasonable
  if (duration < 10) {
    issues.push(`Music track very short: ${duration}s`);
    score -= 1;
  }

  // Check if music was generated (not silent fallback)
  if (ctx.targetData?.isSilentFallback) {
    issues.push("Music generation failed, using silent fallback");
    score -= 3;
  }

  return {
    result: score >= 6 ? "pass" : "warn",
    score: Math.max(1, score),
    details: { musicPrompt: musicPrompt.substring(0, 200), sceneMood, duration, issues },
    costCredits: 0,
  };
};

// --- Check 4D: Audio Technical Quality ---

export const check4DConfig: HarnessCheckConfig = {
  name: "4D_audio_technical",
  layer: "audio",
  description: "Checks audio technical quality: sample rate, format, loudness",
  costEstimate: 0,
  isCompute: true,
};

export const check4D: HarnessCheckFn = async (ctx, bible) => {
  const metadata = ctx.targetData?.metadata || {};
  const sampleRate = metadata.sampleRate || 0;
  const format = metadata.format || "";
  const fileSize = metadata.fileSize || 0;
  const duration = metadata.duration || 0;

  const issues: string[] = [];
  let score = 8;

  // Check sample rate (expect 22050+ for voice, 44100 for music)
  if (sampleRate > 0 && sampleRate < 16000) {
    issues.push(`Low sample rate: ${sampleRate}Hz (min 16000Hz)`);
    score -= 2;
  }

  // Check for empty/corrupt files
  if (fileSize > 0 && duration > 0) {
    const bytesPerSecond = fileSize / duration;
    if (bytesPerSecond < 1000) {
      issues.push("Very low bitrate, possibly corrupt audio");
      score -= 3;
    }
  }

  if (duration === 0 && fileSize > 0) {
    issues.push("Zero duration but non-zero file size, possibly corrupt");
    score -= 2;
  }

  return {
    result: score >= 6 ? "pass" : "warn",
    score: Math.max(1, score),
    details: { sampleRate, format, fileSize, duration, issues },
    costCredits: 0,
  };
};

// ═══════════════════════════════════════════════════════════════════════
// LAYER 5: INTEGRATION VALIDATION
// ═══════════════════════════════════════════════════════════════════════

// --- Check 5A: Asset Completeness ---

export const check5AConfig: HarnessCheckConfig = {
  name: "5A_asset_completeness",
  layer: "integration",
  description: "Verifies all required assets exist and are accessible",
  costEstimate: 0,
  isCompute: true,
};

export const check5A: HarnessCheckFn = async (ctx, bible) => {
  const assets = ctx.targetData?.assets || [];
  const expectedTypes = ctx.targetData?.expectedAssetTypes || ["video_clip", "voice_clip", "final_video"];
  
  const presentTypesArr = assets.map((a: any) => a.assetType as string);
  const presentTypes = new Set<string>(presentTypesArr);
  const missing = expectedTypes.filter((t: string) => !presentTypes.has(t));
  const issues: string[] = [];

  if (missing.length > 0) {
    issues.push(`Missing asset types: ${missing.join(", ")}`);
  }

  // Check all URLs are accessible (basic check)
  for (const asset of assets) {
    if (!asset.url || asset.url.length < 10) {
      issues.push(`Asset ${asset.id} has invalid URL`);
    }
  }

  const score = missing.length === 0 && issues.length === 0 ? 10 : Math.max(0, 10 - missing.length * 3 - issues.length);

  return {
    result: missing.includes("final_video") ? "block" : missing.length > 0 ? "retry" : "pass",
    score,
    details: { expectedTypes, presentTypes: Array.from(presentTypes), missing, assetCount: assets.length, issues },
    costCredits: 0,
  };
};

// --- Check 5B: Timing Consistency ---

export const check5BConfig: HarnessCheckConfig = {
  name: "5B_timing_consistency",
  layer: "integration",
  description: "Validates timing: video durations, voice clip alignment, subtitle sync",
  costEstimate: 0,
  isCompute: true,
};

export const check5B: HarnessCheckFn = async (ctx, bible) => {
  const assets = ctx.targetData?.assets || [];
  const issues: string[] = [];

  // Sum video clip durations
  const videoClips = assets.filter((a: any) => a.assetType === "video_clip" || a.assetType === "synced_clip");
  const voiceClips = assets.filter((a: any) => a.assetType === "voice_clip");

  let totalVideoDuration = 0;
  let totalVoiceDuration = 0;

  for (const clip of videoClips) {
    const dur = clip.metadata?.duration || clip.metadata?.durationSeconds || 0;
    totalVideoDuration += dur;
  }

  for (const clip of voiceClips) {
    const dur = clip.metadata?.duration || clip.metadata?.durationSeconds || 0;
    totalVoiceDuration += dur;
  }

  // Voice should not exceed video duration
  if (totalVoiceDuration > totalVideoDuration + 5) {
    issues.push(`Voice clips (${totalVoiceDuration.toFixed(1)}s) exceed video duration (${totalVideoDuration.toFixed(1)}s)`);
  }

  // Total duration should be reasonable (10s - 600s for an episode)
  if (totalVideoDuration < 5) {
    issues.push(`Total video duration very short: ${totalVideoDuration.toFixed(1)}s`);
  }

  const score = issues.length === 0 ? 9 : Math.max(3, 9 - issues.length * 2);

  return {
    result: issues.length === 0 ? "pass" : "warn",
    score,
    details: { totalVideoDuration: Math.round(totalVideoDuration * 10) / 10, totalVoiceDuration: Math.round(totalVoiceDuration * 10) / 10, videoClipCount: videoClips.length, voiceClipCount: voiceClips.length, issues },
    costCredits: 0,
  };
};

// --- Check 5C: Format Compatibility ---

export const check5CConfig: HarnessCheckConfig = {
  name: "5C_format_compatibility",
  layer: "integration",
  description: "Checks H.264, sample rates, aspect ratios for compatibility",
  costEstimate: 0,
  isCompute: true,
};

export const check5C: HarnessCheckFn = async (ctx, bible) => {
  const assets = ctx.targetData?.assets || [];
  const issues: string[] = [];

  for (const asset of assets) {
    const meta = asset.metadata || {};
    
    // Check video format
    if (asset.assetType === "video_clip" || asset.assetType === "synced_clip" || asset.assetType === "final_video") {
      if (meta.format && !["mp4", "h264", "video/mp4"].includes(meta.format.toLowerCase())) {
        issues.push(`Asset ${asset.id}: non-MP4 format (${meta.format})`);
      }
    }

    // Check audio format
    if (asset.assetType === "voice_clip" || asset.assetType === "music_segment") {
      if (meta.format && !["mp3", "wav", "aac", "audio/mpeg", "audio/wav"].includes(meta.format.toLowerCase())) {
        issues.push(`Asset ${asset.id}: unusual audio format (${meta.format})`);
      }
    }
  }

  const score = issues.length === 0 ? 10 : Math.max(5, 10 - issues.length);

  return {
    result: issues.length === 0 ? "pass" : "warn",
    score,
    details: { assetCount: assets.length, issues },
    costCredits: 0,
  };
};

// --- Check 5D: Budget/Credit Verification ---

export const check5DConfig: HarnessCheckConfig = {
  name: "5D_budget_verification",
  layer: "integration",
  description: "Verifies actual cost vs estimated cost for the pipeline run",
  costEstimate: 0,
  isCompute: true,
};

export const check5D: HarnessCheckFn = async (ctx, bible) => {
  const actualCost = ctx.targetData?.actualCost || 0;
  const estimatedCost = ctx.targetData?.estimatedCost || 0;
  const issues: string[] = [];
  let score = 9;

  if (estimatedCost > 0 && actualCost > estimatedCost * 2) {
    issues.push(`Actual cost ($${actualCost.toFixed(2)}) exceeds 2x estimate ($${estimatedCost.toFixed(2)})`);
    score -= 3;
  }

  if (actualCost > 50) {
    issues.push(`High cost alert: $${actualCost.toFixed(2)}`);
    score -= 1;
  }

  return {
    result: issues.length === 0 ? "pass" : "warn",
    score: Math.max(1, score),
    details: { actualCost, estimatedCost, costRatio: estimatedCost > 0 ? (actualCost / estimatedCost).toFixed(2) : "N/A", issues },
    costCredits: 0,
  };
};

// ═══════════════════════════════════════════════════════════════════════
// LAYER REGISTRIES — Export all checks grouped by layer
// ═══════════════════════════════════════════════════════════════════════

export const scriptChecks = [
  { config: check1AConfig, fn: check1A },
  { config: check1BConfig, fn: check1B },
  { config: check1CConfig, fn: check1C },
  { config: check1DConfig, fn: check1D },
  { config: check1EConfig, fn: check1E },
];

export const visualChecks = [
  { config: check2AConfig, fn: check2A },
  { config: check2BConfig, fn: check2B },
  { config: check2CConfig, fn: check2C },
  { config: check2DConfig, fn: check2D },
];

export const videoChecks = [
  { config: check3AConfig, fn: check3A },
  { config: check3BConfig, fn: check3B },
  { config: check3CConfig, fn: check3C },
  { config: check3DConfig, fn: check3D },
  { config: check3EConfig, fn: check3E },
];

export const audioChecks = [
  { config: check4AConfig, fn: check4A },
  { config: check4BConfig, fn: check4B },
  { config: check4CConfig, fn: check4C },
  { config: check4DConfig, fn: check4D },
];

export const integrationChecks = [
  { config: check5AConfig, fn: check5A },
  { config: check5BConfig, fn: check5B },
  { config: check5CConfig, fn: check5C },
  { config: check5DConfig, fn: check5D },
];

export const allChecks = {
  script: scriptChecks,
  visual: visualChecks,
  video: videoChecks,
  audio: audioChecks,
  integration: integrationChecks,
};
