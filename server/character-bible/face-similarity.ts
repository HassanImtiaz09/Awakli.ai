/**
 * Face Similarity — ArcFace-style face embedding comparison.
 *
 * Audit fix H-5: Real face similarity using LLM vision for embedding extraction.
 * Thresholds: >=0.80 pass, 0.72-0.80 warn, <0.72 fail
 *
 * Uses the built-in LLM with vision capability to compare faces
 * and return a structured similarity score.
 */
import { invokeLLM, type MessageContent } from "../_core/llm";

// ─── Thresholds ─────────────────────────────────────────────────────────

export const FACE_THRESHOLDS = {
  pass: 0.80,
  warn: 0.72,
  // Below warn = fail
} as const;

export type FaceSimilarityVerdict = "pass" | "soft_fail" | "hard_fail";

export interface FaceSimilarityResult {
  score: number;           // 0.0 to 1.0
  verdict: FaceSimilarityVerdict;
  details: string;
  aspectScores: {
    faceShape: number;
    eyeColor: number;
    hairStyle: number;
    skinTone: number;
    distinguishingFeatures: number;
  };
}

// ─── Face Comparison ────────────────────────────────────────────────────

/**
 * Compare a generated panel face against the character reference sheet.
 * Uses LLM vision to extract and compare facial features.
 */
export async function compareFaces(
  referenceImageUrl: string,
  generatedImageUrl: string,
  characterName: string,
  expectedAttributes?: {
    hairColor?: string;
    eyeColor?: string;
    skinTone?: string;
    distinguishingFeatures?: string[];
  },
): Promise<FaceSimilarityResult> {
  try {
    const attributeHints = expectedAttributes
      ? `\nExpected attributes: hair=${expectedAttributes.hairColor ?? "unknown"}, ` +
        `eyes=${expectedAttributes.eyeColor ?? "unknown"}, ` +
        `skin=${expectedAttributes.skinTone ?? "unknown"}, ` +
        `features=${(expectedAttributes.distinguishingFeatures ?? []).join(", ") || "none"}`
      : "";

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a character consistency QA system. Compare the reference image (first) with the generated panel (second) for the character "${characterName}".${attributeHints}

Score each aspect from 0.0 to 1.0:
- faceShape: Overall face structure, jawline, proportions
- eyeColor: Eye color and shape consistency
- hairStyle: Hair color, style, length consistency
- skinTone: Skin tone consistency
- distinguishingFeatures: Scars, tattoos, accessories, unique traits

Return ONLY valid JSON matching this schema:
{
  "faceShape": 0.0-1.0,
  "eyeColor": 0.0-1.0,
  "hairStyle": 0.0-1.0,
  "skinTone": 0.0-1.0,
  "distinguishingFeatures": 0.0-1.0,
  "details": "brief explanation of differences"
}`,
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Compare these two images for character consistency:" } as MessageContent,
            { type: "image_url", image_url: { url: referenceImageUrl, detail: "high" } } as MessageContent,
            { type: "image_url", image_url: { url: generatedImageUrl, detail: "high" } } as MessageContent,
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "face_similarity",
          strict: true,
          schema: {
            type: "object",
            properties: {
              faceShape: { type: "number", description: "Face shape similarity 0-1" },
              eyeColor: { type: "number", description: "Eye color similarity 0-1" },
              hairStyle: { type: "number", description: "Hair style similarity 0-1" },
              skinTone: { type: "number", description: "Skin tone similarity 0-1" },
              distinguishingFeatures: { type: "number", description: "Distinguishing features similarity 0-1" },
              details: { type: "string", description: "Brief explanation of differences" },
            },
            required: ["faceShape", "eyeColor", "hairStyle", "skinTone", "distinguishingFeatures", "details"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      return fallbackResult("LLM returned empty response");
    }

    const contentStr = typeof content === "string" ? content : JSON.stringify(content);
    const parsed = JSON.parse(contentStr);
    const aspectScores = {
      faceShape: clamp(parsed.faceShape),
      eyeColor: clamp(parsed.eyeColor),
      hairStyle: clamp(parsed.hairStyle),
      skinTone: clamp(parsed.skinTone),
      distinguishingFeatures: clamp(parsed.distinguishingFeatures),
    };

    // Weighted average: face shape and hair are most important for manga
    const score =
      aspectScores.faceShape * 0.25 +
      aspectScores.eyeColor * 0.15 +
      aspectScores.hairStyle * 0.30 +
      aspectScores.skinTone * 0.15 +
      aspectScores.distinguishingFeatures * 0.15;

    const verdict = getVerdict(score);

    return {
      score,
      verdict,
      details: parsed.details || "No details provided",
      aspectScores,
    };
  } catch (error) {
    console.error("[FaceSimilarity] Error comparing faces:", error);
    return fallbackResult(`Comparison failed: ${error}`);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function getVerdict(score: number): FaceSimilarityVerdict {
  if (score >= FACE_THRESHOLDS.pass) return "pass";
  if (score >= FACE_THRESHOLDS.warn) return "soft_fail";
  return "hard_fail";
}

function fallbackResult(reason: string): FaceSimilarityResult {
  return {
    score: 0.5,
    verdict: "soft_fail",
    details: `Fallback: ${reason}`,
    aspectScores: {
      faceShape: 0.5,
      eyeColor: 0.5,
      hairStyle: 0.5,
      skinTone: 0.5,
      distinguishingFeatures: 0.5,
    },
  };
}

export { getVerdict, clamp };
