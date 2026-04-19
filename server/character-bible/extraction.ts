/**
 * P26 Stage 1: Character Bible Generator — LLM Extraction
 *
 * Extracts structured character attributes from a manga script using LLM.
 * Produces a CharacterRegistry with detailed visual attributes per §3.3.
 *
 * Height defaults: protagonist 170cm, supporting ±5cm, children 120-140cm.
 * Build inference: from narrative context (fighter → athletic, scholar → slim).
 * Distinguishing features: capped at 5 per character.
 */

import { invokeLLM } from "../_core/llm";
import type {
  CharacterAttributes,
  CharacterEntry,
  CharacterIdentity,
  CharacterRegistry,
} from "./types";
import { nanoid } from "nanoid";

// ─── Height Defaults (§3.3) ─────────────────────────────────────────────

const HEIGHT_DEFAULTS: Record<string, number> = {
  child: 130,
  teen: 160,
  young_adult: 170,
  adult: 172,
  elderly: 168,
};

// ─── LLM Extraction Prompt Template (§3.3) ──────────────────────────────

function buildExtractionSystemPrompt(genre: string, artStyle: string): string {
  return `You are a professional manga character designer specializing in creating detailed, consistent character bibles for production pipelines.

Given a manga script and story context, extract EVERY named character and produce structured visual attributes for each.

RULES:
1. Height: Default protagonist to 170cm. Supporting characters ±5cm. Children 120-140cm. Elderly -5cm from adult default.
2. Build: Infer from narrative context (fighter/warrior → athletic or muscular, scholar/mage → slim, merchant → average, etc.)
3. Age bracket: Infer from dialogue style and role. Use: child, teen, young_adult, adult, elderly.
4. Distinguishing features: Maximum 5 per character. Focus on visually distinctive traits (scars, tattoos, accessories, unique markings).
5. Hair and eye descriptions must be specific enough for image generation (exact color, style, length).
6. Default outfit should match the genre (${genre}) and art style (${artStyle}).
7. Skin tone: Use descriptive terms (fair, olive, tan, dark brown, etc.)
8. Flag which fields you inferred vs. found explicitly in the script.

Genre: ${genre}
Art Style: ${artStyle}`;
}

// ─── Main Extraction Function ───────────────────────────────────────────

export async function extractCharacterBible(
  script: any,
  genre: string,
  artStyle: string,
  originalPrompt: string,
): Promise<CharacterRegistry> {
  // Step 1: Collect all character names from script dialogue
  const charNames = new Set<string>();
  const charContexts: Record<string, string[]> = {};

  for (const scene of script.scenes || []) {
    for (const panel of scene.panels || []) {
      // From dialogue
      for (const d of panel.dialogue || []) {
        if (d.character && d.character !== "Narrator" && d.character !== "SFX") {
          charNames.add(d.character);
          if (!charContexts[d.character]) charContexts[d.character] = [];
          charContexts[d.character].push(
            `Scene ${scene.scene_number}: ${d.text} (${d.emotion})`,
          );
        }
      }
      // From visual descriptions (look for character names)
      if (panel.visual_description) {
        for (const name of Array.from(charNames)) {
          if (panel.visual_description.includes(name)) {
            if (!charContexts[name]) charContexts[name] = [];
            charContexts[name].push(`Visual: ${panel.visual_description}`);
          }
        }
      }
    }
  }

  const charNamesArray = Array.from(charNames);
  if (charNamesArray.length === 0) {
    return { characters: [], tallestHeightCm: 170, artStyle, genre };
  }

  // Step 2: Build context summary for each character
  const contextSummary = charNamesArray
    .map((name) => {
      const contexts = (charContexts[name] || []).slice(0, 5);
      return `${name}:\n${contexts.join("\n")}`;
    })
    .join("\n\n");

  // Step 3: Call LLM for structured extraction
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: buildExtractionSystemPrompt(genre, artStyle),
        },
        {
          role: "user",
          content: `Story premise: ${originalPrompt.slice(0, 800)}

Characters found in script: ${charNamesArray.join(", ")}

Character context from dialogue and scenes:
${contextSummary}

For each character, provide structured attributes. Return a JSON object with a "characters" array.`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "character_bible",
          strict: true,
          schema: {
            type: "object",
            properties: {
              characters: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    role: {
                      type: "string",
                      enum: [
                        "protagonist",
                        "antagonist",
                        "supporting",
                        "background",
                      ],
                    },
                    heightCm: { type: "integer" },
                    build: {
                      type: "string",
                      enum: [
                        "slim",
                        "average",
                        "athletic",
                        "muscular",
                        "heavyset",
                      ],
                    },
                    ageBracket: {
                      type: "string",
                      enum: [
                        "child",
                        "teen",
                        "young_adult",
                        "adult",
                        "elderly",
                      ],
                    },
                    hairColor: { type: "string" },
                    hairStyle: { type: "string" },
                    eyeColor: { type: "string" },
                    skinTone: { type: "string" },
                    distinguishingFeatures: {
                      type: "array",
                      items: { type: "string" },
                    },
                    defaultOutfit: { type: "string" },
                    inferredFields: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                  required: [
                    "name",
                    "role",
                    "heightCm",
                    "build",
                    "ageBracket",
                    "hairColor",
                    "hairStyle",
                    "eyeColor",
                    "skinTone",
                    "distinguishingFeatures",
                    "defaultOutfit",
                    "inferredFields",
                  ],
                  additionalProperties: false,
                },
              },
            },
            required: ["characters"],
            additionalProperties: false,
          },
        },
      },
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw || typeof raw !== "string") {
      return buildFallbackRegistry(charNamesArray, genre, artStyle);
    }

    const parsed = JSON.parse(raw);
    return buildRegistryFromLLMOutput(
      parsed.characters || [],
      genre,
      artStyle,
    );
  } catch (error) {
    console.warn(
      "[P26] Character Bible LLM extraction failed, using fallback:",
      error,
    );
    return buildFallbackRegistry(charNamesArray, genre, artStyle);
  }
}

// ─── Registry Builder ───────────────────────────────────────────────────

function buildRegistryFromLLMOutput(
  llmCharacters: any[],
  genre: string,
  artStyle: string,
): CharacterRegistry {
  const characters: CharacterEntry[] = llmCharacters.map((c, index) => {
    const attributes: CharacterAttributes = {
      heightCm: c.heightCm || HEIGHT_DEFAULTS[c.ageBracket] || 170,
      build: c.build || "average",
      ageBracket: c.ageBracket || "young_adult",
      hairColor: c.hairColor || "black",
      hairStyle: c.hairStyle || "medium length",
      eyeColor: c.eyeColor || "brown",
      skinTone: c.skinTone || "fair",
      distinguishingFeatures: (c.distinguishingFeatures || []).slice(0, 5),
      defaultOutfit: c.defaultOutfit || "casual clothing",
    };

    const identity: CharacterIdentity = {
      identityMode: "none",
    };

    return {
      characterId: `char_${nanoid(8)}`,
      name: c.name,
      role: c.role || (index === 0 ? "protagonist" : "supporting"),
      attributes,
      identity,
      inferredFields: c.inferredFields || [],
    };
  });

  const tallestHeightCm = characters.length > 0
    ? Math.max(...characters.map((c) => c.attributes.heightCm))
    : 170;

  return { characters, tallestHeightCm, artStyle, genre };
}

function buildFallbackRegistry(
  names: string[],
  genre: string,
  artStyle: string,
): CharacterRegistry {
  const characters: CharacterEntry[] = names.map((name, index) => ({
    characterId: `char_${nanoid(8)}`,
    name,
    role: index === 0 ? "protagonist" as const : "supporting" as const,
    attributes: {
      heightCm: index === 0 ? 170 : 170 + (index % 2 === 0 ? 5 : -5),
      build: "average" as const,
      ageBracket: "young_adult" as const,
      hairColor: "black",
      hairStyle: "medium length",
      eyeColor: "brown",
      skinTone: "fair",
      distinguishingFeatures: [],
      defaultOutfit: "casual clothing",
    },
    identity: { identityMode: "none" as const },
    inferredFields: [
      "heightCm",
      "build",
      "ageBracket",
      "hairColor",
      "hairStyle",
      "eyeColor",
      "skinTone",
      "defaultOutfit",
    ],
  }));

  return {
    characters,
    tallestHeightCm: Math.max(...characters.map((c) => c.attributes.heightCm), 170),
    artStyle,
    genre,
  };
}

// ─── Appearance String Builder (for prompt injection) ───────────────────

export function buildAppearanceString(entry: CharacterEntry): string {
  const a = entry.attributes;
  const parts: string[] = [
    `${a.ageBracket.replace("_", " ")}`,
    `${a.build} build`,
    `${a.heightCm}cm tall`,
    `${a.hairColor} ${a.hairStyle} hair`,
    `${a.eyeColor} eyes`,
    `${a.skinTone} skin`,
    a.defaultOutfit,
  ];
  if (a.distinguishingFeatures.length > 0) {
    parts.push(a.distinguishingFeatures.join(", "));
  }
  return parts.join(", ");
}

// Export for testing
export { buildExtractionSystemPrompt, buildRegistryFromLLMOutput, buildFallbackRegistry, HEIGHT_DEFAULTS };
