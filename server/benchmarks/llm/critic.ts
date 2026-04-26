/**
 * D3: Critic LLM — Pre-flight validation (P13 C1 rewrite)
 *
 * Validates each slice's prompt against the STRUCTURED character bible
 * JSON schema. Only flags issues from the exhaustive category enum.
 * No hallucinated markers, no invented scars or streaks.
 *
 * Uses the LLM orchestrator (I1) for routing, retry, and observability.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { llmCall } from "./orchestrator.js";
import type { LLMCallResult } from "./types.js";
import type { StyleLock, CriticIssueCategory } from "../character-bible/schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Types ───────────────────────────────────────────────────────────────

export interface CriticInput {
  sliceId: number;
  sliceType: string;
  videoPrompt: string;
  referenceImageUrl?: string;
  charactersPresent: string[];
  /** Structured JSON checklists per character (from buildCriticChecklists) */
  characterChecklists: Record<string, string>;
  /** Style lock for visual style validation */
  styleLock?: StyleLock;
  /** Project plan context */
  projectPlan?: any;
  previousSliceContext?: string;
  nextSliceContext?: string;
}

export interface CriticIssue {
  severity: "low" | "medium" | "high";
  category: CriticIssueCategory;
  description: string;
}

export interface CriticResult {
  sliceId: number;
  ok: boolean;
  score: number;  // 1-5
  issues: CriticIssue[];
  recommendedAction: "proceed" | "refine-prompt" | "abort";
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
    _systemPrompt = `You are a pre-generation QA critic. Validate prompts against the structured character checklist JSON. ONLY flag issues from the enum: gender_mismatch, hair_color_mismatch, hair_style_mismatch, eye_color_mismatch, uniform_mismatch, prosthetic_side_mismatch, prosthetic_glow_color_mismatch, must_not_violation, style_violation, content_safety, continuity_break, prompt_intent_mismatch. Output JSON: { ok, score, issues[], recommendedAction }.`;
  }
  return _systemPrompt;
}

// ─── Valid categories for filtering ─────────────────────────────────────

const VALID_CATEGORIES = new Set<string>([
  "gender_mismatch",
  "hair_color_mismatch",
  "hair_style_mismatch",
  "eye_color_mismatch",
  "uniform_mismatch",
  "prosthetic_side_mismatch",
  "prosthetic_glow_color_mismatch",
  "must_not_violation",
  "style_violation",
  "content_safety",
  "continuity_break",
  "prompt_intent_mismatch",
]);

// ─── Response schema ─────────────────────────────────────────────────────

const CRITIC_SCHEMA = {
  name: "critic_validation_v3",
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
            category: {
              type: "string",
              enum: [
                "gender_mismatch", "hair_color_mismatch", "hair_style_mismatch",
                "eye_color_mismatch", "uniform_mismatch", "prosthetic_side_mismatch",
                "prosthetic_glow_color_mismatch", "must_not_violation", "style_violation",
                "content_safety", "continuity_break", "prompt_intent_mismatch",
              ],
              description: "Issue category from the exhaustive enum",
            },
            description: { type: "string", description: "Issue description" },
          },
          required: ["severity", "category", "description"],
          additionalProperties: false,
        },
        description: "List of identified issues (ONLY from the enum categories)",
      },
      recommendedAction: {
        type: "string",
        enum: ["proceed", "refine-prompt", "abort"],
        description: "Recommended next action",
      },
    },
    required: ["ok", "score", "issues", "recommendedAction"],
    additionalProperties: false,
  },
};

// ─── Main function ───────────────────────────────────────────────────────

/**
 * Run the Critic LLM validation on a single slice.
 * Uses structured character checklists — no prose locks.
 */
export async function criticValidateV3(input: CriticInput): Promise<CriticResult> {
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
        category: "prompt_intent_mismatch",
        description: `Critic LLM unavailable: ${result.error?.slice(0, 100) ?? "unknown error"}`,
      }],
      recommendedAction: "proceed",
      latencyMs: result.latencyMs,
      costEstimate: result.costEstimate,
    };
  }

  const parsed = result.parsed;

  // CRITICAL: Filter out any issues with categories not in our enum
  const validIssues = (parsed.issues ?? [])
    .filter((i: any) => VALID_CATEGORIES.has(i.category))
    .map((i: any) => ({
      severity: i.severity ?? "low",
      category: i.category as CriticIssueCategory,
      description: i.description ?? "Unknown issue",
    }));

  const filteredCount = (parsed.issues ?? []).length - validIssues.length;
  if (filteredCount > 0) {
    console.log(`  [D3] Filtered out ${filteredCount} issues with invalid categories (hallucination guard)`);
  }

  // Recalculate ok based on filtered issues only
  const hasHighSeverity = validIssues.some((i: CriticIssue) => i.severity === "high");
  const score = parsed.score ?? 3;
  const ok = score >= 4 && !hasHighSeverity;

  return {
    sliceId: input.sliceId,
    ok,
    score,
    issues: validIssues,
    recommendedAction: ok ? "proceed" : (parsed.recommendedAction ?? "refine-prompt"),
    latencyMs: result.latencyMs,
    costEstimate: result.costEstimate,
  };
}

// ─── P2: Retry wrapper with fail-soft ────────────────────────────────────

/** P13 P2: Reduce retry cap from 3 to 2, fail-soft on 3rd attempt */
export const MAX_CRITIC_RETRIES = 2;

/**
 * Run critic validation with retry loop.
 * On retry cap exhaustion, fail-soft: log warning, return last result with ok=true.
 */
export async function criticValidateWithRetry(
  input: CriticInput,
  onRefine?: (issues: CriticIssue[]) => Promise<string>,
): Promise<{ result: CriticResult; attempts: number; failSoft: boolean }> {
  let attempts = 0;
  let lastResult: CriticResult | null = null;
  let currentInput = { ...input };

  while (attempts <= MAX_CRITIC_RETRIES) {
    attempts++;
    lastResult = await criticValidateV3(currentInput);

    if (lastResult.ok || lastResult.recommendedAction === "proceed") {
      return { result: lastResult, attempts, failSoft: false };
    }

    // If we haven't exhausted retries and have a refine callback, try to fix
    if (attempts <= MAX_CRITIC_RETRIES && onRefine) {
      console.log(`  [D3] Slice ${input.sliceId}: attempt ${attempts}/${MAX_CRITIC_RETRIES + 1} — ${lastResult.issues.length} issues, refining...`);
      const refinedPrompt = await onRefine(lastResult.issues);
      currentInput = { ...currentInput, videoPrompt: refinedPrompt };
    } else {
      break;
    }
  }

  // P2: Fail-soft — proceed with warning after exhausting retries
  console.warn(`  [D3] ⚠ Slice ${input.sliceId}: fail-soft after ${attempts} attempts (score ${lastResult!.score}/5, ${lastResult!.issues.length} issues remaining)`);
  return {
    result: {
      ...lastResult!,
      ok: true,
      recommendedAction: "proceed",
    },
    attempts,
    failSoft: true,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function buildUserContent(input: CriticInput): string | Array<{ type: string; [key: string]: any }> {
  let text = `Validate this video generation request:

Slice ID: ${input.sliceId}
Scene Type: ${input.sliceType}
Characters Present: ${input.charactersPresent.join(", ") || "none"}

VIDEO PROMPT:
${input.videoPrompt}`;

  // Add structured character checklists (NOT prose locks)
  if (Object.keys(input.characterChecklists).length > 0) {
    text += `\n\nCHARACTER CHECKLISTS (validate ONLY these fields):`;
    for (const [char, checklist] of Object.entries(input.characterChecklists)) {
      text += `\n\n${char}:\n${checklist}`;
    }
  }

  // Add style lock
  if (input.styleLock) {
    text += `\n\nSTYLE_LOCK:`;
    text += `\nPrimary: ${input.styleLock.primary}`;
    text += `\nForbidden: ${input.styleLock.forbidden.join(", ")}`;
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
