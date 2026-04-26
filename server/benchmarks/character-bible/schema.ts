/**
 * C1: Structured Character Bible Schema
 *
 * Replaces prose CHARACTER_LOCK with typed JSON files.
 * The Critic LLM validates ONLY against fields in this schema —
 * no hallucinated markers, no invented scars or streaks.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Types ───────────────────────────────────────────────────────────────

export interface CharacterHair {
  color: string;
  style: string;
  accents: string;
  accent_color: string;
}

export interface CharacterEyes {
  color: string;
  glow: boolean;
}

export interface CharacterUniform {
  type: string;
  components: string[];
}

export interface CharacterProsthetic {
  side: string;
  material: string;
  glow_color: string;
  glow_pattern: string;
}

export interface CharacterBible {
  character: string;
  gender: string;
  age: string;
  build: string;
  hair: CharacterHair;
  eyes: CharacterEyes;
  uniform: CharacterUniform;
  distinguishing_marks: string[];
  prosthetic: CharacterProsthetic;
  expression_default: string;
  descriptor: string;
  pronoun: string;
  must_not: string[];
}

// ─── Style Lock (C2) ────────────────────────────────────────────────────

export interface StyleLock {
  primary: string;
  secondary_allowed: string[];
  forbidden: string[];
}

export const STYLE_LOCK: StyleLock = {
  primary: "2D anime cel-shaded illustration",
  secondary_allowed: [],
  forbidden: [
    "3D render",
    "photorealistic",
    "Pixar style",
    "Disney 3D",
    "CGI",
    "real photograph",
    "live action",
  ],
};

// ─── Critic Issue Categories (C1) ────────────────────────────────────────

/**
 * Exhaustive enum of issue categories the Critic may flag.
 * Anything outside this enum CANNOT trigger a retry.
 */
export const CRITIC_ISSUE_CATEGORIES = [
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
] as const;

export type CriticIssueCategory = (typeof CRITIC_ISSUE_CATEGORIES)[number];

// ─── Loader ──────────────────────────────────────────────────────────────

const _cache: Record<string, CharacterBible> = {};

/**
 * Load a character bible JSON by name (e.g., "Mira" or "Ren").
 * Caches after first read.
 */
export function loadCharacterBible(name: string): CharacterBible {
  const key = name.toLowerCase();
  if (_cache[key]) return _cache[key];

  const filePath = path.join(__dirname, `${key}.json`);
  const raw = fs.readFileSync(filePath, "utf-8");
  const bible: CharacterBible = JSON.parse(raw);
  _cache[key] = bible;
  return bible;
}

/**
 * Load all character bibles and return as a Record<name, CharacterBible>.
 */
export function loadAllCharacterBibles(): Record<string, CharacterBible> {
  const mira = loadCharacterBible("Mira");
  const ren = loadCharacterBible("Ren");
  return { Mira: mira, Ren: ren };
}

/**
 * Build a prose CHARACTER_LOCK string from the structured JSON.
 * Used as backward-compatible input for D2 Prompt Engineer.
 */
export function buildCharacterLockText(bible: CharacterBible): string {
  const parts: string[] = [];
  parts.push(`${bible.gender === "female" ? "Young woman" : "Young man"}`);
  parts.push(`${bible.hair.color.replace(/_/g, " ")} hair with ${bible.hair.accents.replace(/_/g, " ")} in ${bible.hair.style.replace(/_/g, " ")}`);
  parts.push(`glowing ${bible.eyes.color.replace(/_/g, " ").toUpperCase()} eyes`);
  parts.push(`${bible.uniform.type.replace(/_/g, " ")}`);

  if (bible.prosthetic.side !== "NONE") {
    parts.push(
      `${bible.prosthetic.material.replace(/_/g, " ")} prosthetic ${bible.prosthetic.side.replace(/_/g, " ")} with ${bible.prosthetic.glow_color} ${bible.prosthetic.glow_pattern.replace(/_/g, " ")}`
    );
  }

  parts.push(`${bible.build.replace(/_/g, " ")} build`);
  parts.push(`${bible.expression_default} expression`);

  return parts.join(", ") + ".";
}

/**
 * Build a structured JSON string for the Critic to validate against.
 * Contains ONLY the fields the Critic should check.
 */
export function buildCriticChecklistJSON(bible: CharacterBible): string {
  return JSON.stringify(
    {
      character: bible.character,
      gender: bible.gender,
      hair_color: bible.hair.color,
      hair_style: bible.hair.style,
      hair_accents: bible.hair.accents,
      eye_color: bible.eyes.color,
      uniform_type: bible.uniform.type,
      prosthetic_side: bible.prosthetic.side,
      prosthetic_glow_color: bible.prosthetic.glow_color,
      must_not: bible.must_not,
    },
    null,
    2
  );
}

/**
 * Build CHARACTER_LOCK records from structured bibles.
 * Returns Record<name, prose_lock_text> for backward compatibility.
 */
export function buildCharacterLocks(): Record<string, string> {
  const bibles = loadAllCharacterBibles();
  const locks: Record<string, string> = {};
  for (const [name, bible] of Object.entries(bibles)) {
    locks[name] = buildCharacterLockText(bible);
  }
  return locks;
}

/**
 * Build Critic checklists for all characters.
 * Returns Record<name, JSON_checklist_string>.
 */
export function buildCriticChecklists(): Record<string, string> {
  const bibles = loadAllCharacterBibles();
  const checklists: Record<string, string> = {};
  for (const [name, bible] of Object.entries(bibles)) {
    checklists[name] = buildCriticChecklistJSON(bible);
  }
  return checklists;
}
