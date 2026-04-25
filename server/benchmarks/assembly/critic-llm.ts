/**
 * P5: Critic LLM — Pre-generation validation pass
 *
 * Before dispatching an expensive video generation call, the critic
 * validates each slice's prompt, reference image, and character lock
 * for consistency. This catches issues like:
 *   - Prompt mentioning wrong character for the reference image
 *   - Character lock description contradicting the prompt
 *   - Reference image not matching the scene type
 *   - Prompt containing content-filter trigger words
 *
 * Uses the Built-In Forge LLM (Gemini 2.5 Flash) with structured JSON output.
 */

import { invokeLLM, type MessageContent } from "../../_core/llm.js";

export interface CriticResult {
  sliceId: number;
  verdict: "pass" | "warn" | "fail";
  score: number;           // 0.0 to 1.0
  issues: string[];
  suggestions: string[];
  revisedPrompt?: string;  // Only if verdict is "warn" — suggested fix
}

export interface CriticInput {
  sliceId: number;
  type: string;
  prompt: string;
  referenceImageUrl?: string;
  characterLock?: string;
  character?: string;
  dialogueText?: string;
  emotion?: string;
}

// Content filter trigger words to flag
const CONTENT_FILTER_TRIGGERS = [
  "weapon", "gun", "sword", "knife", "blood", "gore", "violence",
  "kill", "murder", "death", "corpse", "nude", "naked", "sexual",
  "drug", "explosive", "bomb", "terrorist",
];

/**
 * Run the critic LLM validation on a single slice.
 *
 * The critic checks:
 * 1. Prompt-character consistency (does the prompt describe the right character?)
 * 2. Character lock alignment (does the lock match the prompt?)
 * 3. Content filter safety (any trigger words?)
 * 4. Scene type coherence (does the prompt match the slice type?)
 */
export async function criticValidate(input: CriticInput): Promise<CriticResult> {
  // Quick local checks first (no LLM call needed)
  const localIssues: string[] = [];
  const localSuggestions: string[] = [];

  // Check for content filter triggers
  const promptLower = input.prompt.toLowerCase();
  for (const trigger of CONTENT_FILTER_TRIGGERS) {
    if (promptLower.includes(trigger)) {
      localIssues.push(`Content filter trigger word detected: "${trigger}"`);
      localSuggestions.push(`Replace "${trigger}" with a softer alternative`);
    }
  }

  // Check character consistency
  if (input.character && input.characterLock) {
    const lockLower = input.characterLock.toLowerCase();
    // If the prompt mentions a different character's features
    if (input.character === "Mira" && promptLower.includes("spiky dark hair")) {
      localIssues.push("Prompt describes Ren's features but character is Mira");
    }
    if (input.character === "Ren" && promptLower.includes("silver-white hair")) {
      localIssues.push("Prompt describes Mira's features but character is Ren");
    }
  }

  // If local checks found critical issues, skip the LLM call
  if (localIssues.length > 2) {
    return {
      sliceId: input.sliceId,
      verdict: "fail",
      score: 0.3,
      issues: localIssues,
      suggestions: localSuggestions,
    };
  }

  // LLM-based validation for deeper consistency checks
  try {
    const systemPrompt = buildCriticSystemPrompt();
    const userContent = buildCriticUserContent(input);

    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "critic_validation",
          strict: true,
          schema: {
            type: "object",
            properties: {
              promptCharacterConsistency: {
                type: "number",
                description: "Score 0-1: Does the prompt correctly describe the intended character?",
              },
              sceneTypeCoherence: {
                type: "number",
                description: "Score 0-1: Does the prompt match the expected scene type?",
              },
              contentSafety: {
                type: "number",
                description: "Score 0-1: Is the prompt safe for content filters?",
              },
              visualClarity: {
                type: "number",
                description: "Score 0-1: Is the prompt specific enough for video generation?",
              },
              issues: {
                type: "array",
                items: { type: "string" },
                description: "List of identified issues",
              },
              suggestions: {
                type: "array",
                items: { type: "string" },
                description: "List of improvement suggestions",
              },
              revisedPrompt: {
                type: "string",
                description: "Suggested revised prompt if improvements needed, or empty string if prompt is fine",
              },
            },
            required: [
              "promptCharacterConsistency",
              "sceneTypeCoherence",
              "contentSafety",
              "visualClarity",
              "issues",
              "suggestions",
              "revisedPrompt",
            ],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      return fallbackResult(input.sliceId, "LLM returned empty response", localIssues);
    }

    const contentStr = typeof content === "string" ? content : JSON.stringify(content);
    const parsed = JSON.parse(contentStr);

    // Compute weighted score
    const score =
      parsed.promptCharacterConsistency * 0.35 +
      parsed.sceneTypeCoherence * 0.20 +
      parsed.contentSafety * 0.30 +
      parsed.visualClarity * 0.15;

    const allIssues = [...localIssues, ...(parsed.issues ?? [])];
    const allSuggestions = [...localSuggestions, ...(parsed.suggestions ?? [])];

    const verdict: "pass" | "warn" | "fail" =
      score >= 0.80 ? "pass" :
      score >= 0.60 ? "warn" :
      "fail";

    return {
      sliceId: input.sliceId,
      verdict,
      score,
      issues: allIssues,
      suggestions: allSuggestions,
      revisedPrompt: parsed.revisedPrompt || undefined,
    };
  } catch (err: any) {
    console.warn(`  [P5] Critic LLM failed for slice ${input.sliceId}: ${err.message?.slice(0, 100)}`);
    return fallbackResult(input.sliceId, err.message, localIssues);
  }
}

/**
 * Run critic validation on all slices in a script.
 * Returns results and a summary.
 */
export async function criticValidateAll(
  slices: CriticInput[]
): Promise<{
  results: CriticResult[];
  summary: { passed: number; warned: number; failed: number; avgScore: number };
}> {
  console.log(`  [P5] Running critic validation on ${slices.length} slices...`);
  const results: CriticResult[] = [];

  for (const slice of slices) {
    const result = await criticValidate(slice);
    results.push(result);
    const icon = result.verdict === "pass" ? "✓" : result.verdict === "warn" ? "⚠" : "✗";
    console.log(`  [P5] Slice ${slice.sliceId}: ${icon} ${result.verdict} (${result.score.toFixed(2)}) ${result.issues.length > 0 ? `— ${result.issues[0]}` : ""}`);
  }

  const passed = results.filter((r) => r.verdict === "pass").length;
  const warned = results.filter((r) => r.verdict === "warn").length;
  const failed = results.filter((r) => r.verdict === "fail").length;
  const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;

  console.log(`  [P5] Critic summary: ${passed} pass, ${warned} warn, ${failed} fail (avg score: ${avgScore.toFixed(2)})`);

  return {
    results,
    summary: { passed, warned, failed, avgScore },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function buildCriticSystemPrompt(): string {
  return `You are a pre-generation QA critic for an AI anime video pipeline. Your job is to validate that each video generation request is internally consistent and safe before it's dispatched to an expensive video model.

You check for:
1. PROMPT-CHARACTER CONSISTENCY: Does the visual description in the prompt match the intended character? (e.g., Mira has silver-white hair with cerulean blue tips, Ren has spiky dark hair with cyan streaks)
2. SCENE TYPE COHERENCE: Does the prompt match the expected scene type? (establishing = wide/environmental, dialogue_closeup = character focus, action = dynamic movement)
3. CONTENT SAFETY: Could any part of the prompt trigger a content filter? (weapons, violence, nudity, etc.)
4. VISUAL CLARITY: Is the prompt specific enough for a video model to produce a good result?

Score each dimension 0.0 to 1.0. Return structured JSON.`;
}

function buildCriticUserContent(input: CriticInput): string | MessageContent[] {
  let text = `Validate this video generation request:

Slice ID: ${input.sliceId}
Scene Type: ${input.type}
Character: ${input.character ?? "none"}
Emotion: ${input.emotion ?? "none"}
Dialogue: ${input.dialogueText ?? "none"}

PROMPT:
${input.prompt}`;

  if (input.characterLock) {
    text += `\n\nCHARACTER LOCK (must match prompt):
${input.characterLock}`;
  }

  // If reference image is available, include it for visual validation
  if (input.referenceImageUrl) {
    return [
      { type: "text", text } as MessageContent,
      {
        type: "image_url",
        image_url: { url: input.referenceImageUrl, detail: "low" },
      } as MessageContent,
    ];
  }

  return text;
}

function fallbackResult(
  sliceId: number,
  error: string,
  localIssues: string[] = []
): CriticResult {
  return {
    sliceId,
    verdict: localIssues.length > 0 ? "warn" : "pass",
    score: localIssues.length > 0 ? 0.65 : 0.85,
    issues: [...localIssues, `Critic LLM unavailable: ${error?.slice(0, 100)}`],
    suggestions: ["Manual review recommended"],
  };
}
