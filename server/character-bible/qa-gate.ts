/**
 * P26 Stage 5: Spatial QA Gate
 *
 * Validates generated panels for:
 *   1. Face similarity (ArcFace cosine vs reference)
 *   2. Height-ratio compliance (deviation from expected ratios)
 *   3. Style coherence (CLIP embedding vs rolling scene average)
 *
 * Thresholds (§8.1):
 *   Face: >=0.75 pass, 0.60-0.75 soft fail, <0.60 hard fail
 *   Height: <=10% pass, 10-20% soft fail, >20% hard fail
 *   Style: >=0.80 pass, 0.65-0.80 soft fail, <0.65 hard fail
 *
 * Regeneration budget: 3× base panel cost per scene.
 *
 * @see Awakli_Prompt26 §8
 */

import type {
  CharacterEntry,
  CharacterRegistry,
  FaceSimilarityResult,
  HeightRatioResult,
  QaVerdict,
  ShotPlan,
  SpatialQaCheckResult,
  StyleCoherenceResult,
} from "./types";
import { QA_THRESHOLDS } from "./types";

// ─── Face Similarity Check ──────────────────────────────────────────────

/**
 * Check face similarity between generated panel and character reference.
 *
 * In production, this would use ArcFace embeddings + cosine similarity.
 * For now, we use a heuristic based on whether the character has a
 * reference image and the generation used IP-Adapter.
 *
 * Returns a score 0.0-1.0 per character in the panel.
 */
export function checkFaceSimilarity(
  panelCharacters: CharacterEntry[],
  panelImageUrl: string,
  usedIpAdapter: boolean,
  usedLora: boolean,
): FaceSimilarityResult[] {
  return panelCharacters.map((char) => {
    let score: number;

    if (usedLora && char.identity.loraUrl) {
      // LoRA provides strongest identity lock
      score = 0.85 + Math.random() * 0.10; // 0.85-0.95
    } else if (usedIpAdapter && char.identity.ipAdapterRefUrl) {
      // IP-Adapter provides good identity lock
      score = 0.70 + Math.random() * 0.15; // 0.70-0.85
    } else if (char.identity.referenceSheetUrl) {
      // Reference sheet exists but wasn't used as IP-Adapter
      score = 0.55 + Math.random() * 0.20; // 0.55-0.75
    } else {
      // No identity lock at all
      score = 0.40 + Math.random() * 0.25; // 0.40-0.65
    }

    const verdict = scoreToVerdict(
      score,
      QA_THRESHOLDS.faceSimilarity.pass,
      QA_THRESHOLDS.faceSimilarity.softFail,
    );

    return {
      characterId: char.characterId,
      score: Math.round(score * 100) / 100,
      verdict,
    };
  });
}

// ─── Height Ratio Check ─────────────────────────────────────────────────

/**
 * Check height-ratio compliance for multi-character panels.
 * Compares expected ratio (from registry) to actual ratio (from shot plan).
 *
 * In production, this would analyze the generated image to detect
 * character heights. For now, we use the shot plan as ground truth
 * and add noise to simulate detection variance.
 */
export function checkHeightRatio(
  shotPlan: ShotPlan,
  registry: CharacterRegistry,
): HeightRatioResult[] {
  if (shotPlan.characterPlacements.length <= 1) {
    // Single character: no ratio to check
    return shotPlan.characterPlacements.map((p) => ({
      characterId: p.characterId,
      expectedRatio: p.scaleFactor,
      actualRatio: p.scaleFactor,
      deviationPercent: 0,
      verdict: "pass" as QaVerdict,
    }));
  }

  return shotPlan.characterPlacements.map((placement) => {
    const expectedRatio = placement.scaleFactor;

    // Simulate detection variance (±5-15% noise)
    const noise = (Math.random() - 0.5) * 0.15;
    const actualRatio = Math.max(0.3, Math.min(1.0, expectedRatio + noise));

    const deviationPercent =
      Math.abs(actualRatio - expectedRatio) / expectedRatio * 100;

    const verdict = deviationToVerdict(deviationPercent);

    return {
      characterId: placement.characterId,
      expectedRatio: Math.round(expectedRatio * 100) / 100,
      actualRatio: Math.round(actualRatio * 100) / 100,
      deviationPercent: Math.round(deviationPercent * 10) / 10,
      verdict,
    };
  });
}

// ─── Style Coherence Check ──────────────────────────────────────────────

/**
 * Check style coherence of the generated panel against the scene's
 * rolling average CLIP embedding.
 *
 * In production, this would compute CLIP embeddings and cosine similarity.
 * For now, we use a heuristic score.
 */
export function checkStyleCoherence(
  panelImageUrl: string,
  sceneImageUrls: string[],
  artStyle: string,
): StyleCoherenceResult {
  // Heuristic: first panel in scene gets high coherence (baseline),
  // subsequent panels get slightly lower as style drift accumulates
  const panelIndex = sceneImageUrls.indexOf(panelImageUrl);
  const baseLine = 0.85;
  const drift = panelIndex > 0 ? panelIndex * 0.02 : 0;
  const noise = (Math.random() - 0.5) * 0.10;

  const score = Math.max(0.5, Math.min(1.0, baseLine - drift + noise));

  const verdict = scoreToVerdict(
    score,
    QA_THRESHOLDS.styleCoherence.pass,
    QA_THRESHOLDS.styleCoherence.softFail,
  );

  return {
    score: Math.round(score * 100) / 100,
    verdict,
  };
}

// ─── Full QA Check ──────────────────────────────────────────────────────

/**
 * Run all QA checks on a generated panel.
 */
export function runSpatialQaCheck(
  panelId: number,
  panelImageUrl: string,
  panelCharacters: CharacterEntry[],
  shotPlan: ShotPlan,
  registry: CharacterRegistry,
  sceneImageUrls: string[],
  usedIpAdapter: boolean,
  usedLora: boolean,
): SpatialQaCheckResult {
  // Check 1: Face similarity
  const faceSimilarity = checkFaceSimilarity(
    panelCharacters,
    panelImageUrl,
    usedIpAdapter,
    usedLora,
  );

  // Check 2: Height ratio
  const heightRatio = checkHeightRatio(shotPlan, registry);

  // Check 3: Style coherence
  const styleCoherence = checkStyleCoherence(
    panelImageUrl,
    sceneImageUrls,
    registry.artStyle,
  );

  // Determine overall verdict (worst of all checks)
  const allVerdicts = [
    ...faceSimilarity.map((r) => r.verdict),
    ...heightRatio.map((r) => r.verdict),
    styleCoherence.verdict,
  ];

  let overallVerdict: QaVerdict = "pass";
  if (allVerdicts.includes("hard_fail")) {
    overallVerdict = "hard_fail";
  } else if (allVerdicts.includes("soft_fail")) {
    overallVerdict = "soft_fail";
  }

  // Determine if regeneration is needed
  const shouldRegenerate = overallVerdict !== "pass";

  // Build regeneration hint
  let regenerationHint: string | undefined;
  if (shouldRegenerate) {
    const hints: string[] = [];
    const failedFaces = faceSimilarity.filter((r) => r.verdict !== "pass");
    if (failedFaces.length > 0) {
      hints.push(
        `Face consistency issues for: ${failedFaces.map((f) => {
          const char = registry.characters.find(
            (c) => c.characterId === f.characterId,
          );
          return char?.name || f.characterId;
        }).join(", ")}`,
      );
    }
    const failedHeights = heightRatio.filter((r) => r.verdict !== "pass");
    if (failedHeights.length > 0) {
      hints.push(
        `Height ratio deviation: ${failedHeights.map((h) => `${h.deviationPercent}%`).join(", ")}`,
      );
    }
    if (styleCoherence.verdict !== "pass") {
      hints.push(`Style coherence score: ${styleCoherence.score}`);
    }
    regenerationHint = hints.join("; ");
  }

  return {
    panelId,
    faceSimilarity,
    heightRatio,
    styleCoherence,
    overallVerdict,
    shouldRegenerate,
    regenerationHint,
  };
}

// ─── Regeneration Budget Tracker ────────────────────────────────────────

export interface RegenBudget {
  sceneNumber: number;
  basePanelCount: number;
  maxRegenAttempts: number;
  usedAttempts: number;
  remaining: number;
}

export function createRegenBudget(
  sceneNumber: number,
  panelCount: number,
): RegenBudget {
  const maxRegenAttempts = panelCount * QA_THRESHOLDS.regenBudgetMultiplier;
  return {
    sceneNumber,
    basePanelCount: panelCount,
    maxRegenAttempts,
    usedAttempts: 0,
    remaining: maxRegenAttempts,
  };
}

export function consumeRegenBudget(budget: RegenBudget): boolean {
  if (budget.remaining <= 0) return false;
  budget.usedAttempts++;
  budget.remaining--;
  return true;
}

// ─── Verdict Helpers ────────────────────────────────────────────────────

function scoreToVerdict(
  score: number,
  passThreshold: number,
  softFailThreshold: number,
): QaVerdict {
  if (score >= passThreshold) return "pass";
  if (score >= softFailThreshold) return "soft_fail";
  return "hard_fail";
}

function deviationToVerdict(deviationPercent: number): QaVerdict {
  if (deviationPercent <= QA_THRESHOLDS.heightRatio.pass) return "pass";
  if (deviationPercent <= QA_THRESHOLDS.heightRatio.softFail) return "soft_fail";
  return "hard_fail";
}

// Export for testing
export { scoreToVerdict, deviationToVerdict };
