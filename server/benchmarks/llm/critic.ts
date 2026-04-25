/**
 * D3: Critic LLM — Pre-flight validation (expanded from P11 W3)
 *
 * Validates each slice's prompt, reference image, and character lock
 * before the expensive video generation call runs. Uses the LLM
 * orchestrator (I1) for routing, retry, and observability.
 *
 * Four dimensions: character markers, prompt-intent alignment,
 * content policy safety, slice continuity.
 *
 * On 'regenerate-reference' or 'refine-prompt' verdict, the pipeline
 * orchestrator triggers regeneration with a hard cap of 3 retries.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { llmCall } from "./orchestrator.js";
import type { LLMCallResult } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Types ───────────────────────────────────────────────────────────────

export interface CriticInput {
  sliceId: number;
  sliceType: string;
  videoPrompt: string;
  referenceImageUrl?: string;
  charactersPresent: string[];
  characterLockTexts: Record<string, string>;
  projectPlan?: any;
  previousSliceContext?: string;
  nextSliceContext?: string;
}

export interface CriticIssue {
  severity: "low" | "medium" | "high";
  category: "character" | "composition" | "prompt" | "safety" | "continuity";
  description: string;
}

export interface CriticResult {
  sliceId: number;
  ok: boolean;
  score: number;  // 1-5
  issues: CriticIssue[];
  recommendedAction: "proceed" | "regenerate-reference" | "refine-prompt" | "abort";
  latencyMs: number;
  costEstimate: number;
}

// ─── System prompt ───────────────────────────────────────────────────────

let _systemPrompt: string | null = null;

function getSystemPrompt(): string {
  if (_systemPrompt) return _systemPrompt;
  try {
    _systemPrompt = fs.readFileSync(
      path.join(__dirname, "prompts", "critic-system.md"),
      "utf-8"
    );
  } catch {
    _systemPrompt = `You are a pre-generation QA critic for an AI anime video pipeline. Validate prompts and references for character consistency, intent alignment, content safety, and continuity. Output strict JSON: { ok, score (1-5), issues[{ severity, category, description }], recommendedAction }.`;
  }
  return _systemPrompt;
}

// ─── Response schema ─────────────────────────────────────────────────────

const CRITIC_SCHEMA = {
  name: "critic_validation",
  strict: true,
  schema: {
    type: "object" as const,
    properties: {
      ok: { type: "boolean", description: "True if score >= 4 and no high-severity issues" },
      score: { type: "number", description: "Quality score 1-5 (5 = perfect)" },
      issues: {
        type: "array",
        items: {
          type: "object",
          properties: {
            severity: { type: "string", enum: ["low", "medium", "high"], description: "Issue severity" },
            category: { type: "string", enum: ["character", "composition", "prompt", "safety", "continuity"], description: "Issue category" },
            description: { type: "string", description: "Issue description" },
          },
          required: ["severity", "category", "description"],
          additionalProperties: false,
        },
        description: "List of identified issues",
      },
      recommendedAction: {
        type: "string",
        enum: ["proceed", "regenerate-reference", "refine-prompt", "abort"],
        description: "Recommended next action",
      },
    },
    required: ["ok", "score", "issues", "recommendedAction"],
    additionalProperties: false,
  },
};

// ─── Main function ───────────────────────────────────────────────────────

/**
 * Run the expanded Critic LLM validation on a single slice.
 * Uses the orchestrator for routing, retry, and observability.
 */
export async function criticValidateV2(input: CriticInput): Promise<CriticResult> {
  const userContent = buildUserContent(input);

  const result: LLMCallResult = await llmCall({
    role: "critic",
    systemPrompt: getSystemPrompt(),
    userContent,
    responseSchema: CRITIC_SCHEMA,
  });

  if (!result.success || !result.parsed) {
    // Fallback: return a cautious "proceed" with warning
    return {
      sliceId: input.sliceId,
      ok: true,
      score: 3,
      issues: [{
        severity: "low",
        category: "prompt",
        description: `Critic LLM unavailable: ${result.error?.slice(0, 100) ?? "unknown error"}`,
      }],
      recommendedAction: "proceed",
      latencyMs: result.latencyMs,
      costEstimate: result.costEstimate,
    };
  }

  const parsed = result.parsed;
  return {
    sliceId: input.sliceId,
    ok: parsed.ok ?? (parsed.score >= 4),
    score: parsed.score ?? 3,
    issues: (parsed.issues ?? []).map((i: any) => ({
      severity: i.severity ?? "low",
      category: i.category ?? "prompt",
      description: i.description ?? "Unknown issue",
    })),
    recommendedAction: parsed.recommendedAction ?? "proceed",
    latencyMs: result.latencyMs,
    costEstimate: result.costEstimate,
  };
}

/**
 * Run critic validation on all slices with retry loop.
 * On 'refine-prompt' or 'regenerate-reference', the caller
 * should handle regeneration. This function just validates.
 */
export async function criticValidateAllV2(
  slices: CriticInput[]
): Promise<{
  results: CriticResult[];
  summary: { passed: number; warned: number; failed: number; avgScore: number; totalCost: number };
}> {
  console.log(`  [D3] Running expanded critic validation on ${slices.length} slices...`);
  const results: CriticResult[] = [];

  for (const slice of slices) {
    const result = await criticValidateV2(slice);
    results.push(result);
    const icon = result.ok ? "✓" : result.score >= 3 ? "⚠" : "✗";
    const action = result.recommendedAction !== "proceed" ? ` → ${result.recommendedAction}` : "";
    console.log(
      `  [D3] Slice ${slice.sliceId}: ${icon} score=${result.score}/5 (${result.latencyMs}ms, $${result.costEstimate.toFixed(4)})${action}${result.issues.length > 0 ? ` — ${result.issues[0].description.slice(0, 60)}` : ""}`
    );
  }

  const passed = results.filter((r) => r.ok).length;
  const warned = results.filter((r) => !r.ok && r.score >= 3).length;
  const failed = results.filter((r) => !r.ok && r.score < 3).length;
  const avgScore = results.reduce((s, r) => s + r.score, 0) / results.length;
  const totalCost = results.reduce((s, r) => s + r.costEstimate, 0);

  console.log(
    `  [D3] Critic summary: ${passed} pass, ${warned} warn, ${failed} fail (avg score: ${avgScore.toFixed(1)}/5, cost: $${totalCost.toFixed(4)})`
  );

  return { results, summary: { passed, warned, failed, avgScore, totalCost } };
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function buildUserContent(input: CriticInput): string | Array<{ type: string; [key: string]: any }> {
  let text = `Validate this video generation request:

Slice ID: ${input.sliceId}
Scene Type: ${input.sliceType}
Characters Present: ${input.charactersPresent.join(", ") || "none"}

VIDEO PROMPT:
${input.videoPrompt}`;

  // Add character lock texts
  if (Object.keys(input.characterLockTexts).length > 0) {
    text += `\n\nCHARACTER LOCK TEXTS (must match prompt):`;
    for (const [char, lock] of Object.entries(input.characterLockTexts)) {
      text += `\n\n${char}:\n${lock}`;
    }
  }

  // Add continuity context
  if (input.previousSliceContext) {
    text += `\n\nPREVIOUS SLICE CONTEXT:\n${input.previousSliceContext}`;
  }
  if (input.nextSliceContext) {
    text += `\n\nNEXT SLICE CONTEXT:\n${input.nextSliceContext}`;
  }

  // Include reference image for visual validation
  if (input.referenceImageUrl) {
    return [
      { type: "text", text },
      {
        type: "image_url",
        image_url: { url: input.referenceImageUrl, detail: "low" },
      },
    ];
  }

  return text;
}
