/**
 * Slice Decomposer — 10-Second Clip Decomposition Engine
 *
 * Decomposes an approved episode script into 10-second video slices.
 * Each slice becomes a unit of video generation in the guided pipeline.
 *
 * Pipeline position: Stage 5 (after script approval, before core scene preview)
 *
 * Key principles:
 *   - Target 10 seconds per slice (range: 5–15s)
 *   - Never split mid-dialogue
 *   - Preserve scene boundaries where possible
 *   - Extract character and dialogue metadata per slice
 *   - Estimate timing using LLM with deterministic fallback
 */

import { invokeLLM } from "./_core/llm";

// ─── Types ────────────────────────────────────────────────────────────────

export interface PanelData {
  id: number;
  sceneNumber: number;
  panelNumber: number;
  visualDescription: string | null;
  cameraAngle: string | null;
  dialogue: Array<{ character?: string; text: string; emotion?: string }> | null;
  sfx: string | null;
  transition: string | null;
  transitionDuration: number | null;
}

export interface PanelTiming {
  panelId: number;
  estimatedDurationSeconds: number;
  wordCount: number;
  hasDialogue: boolean;
  isActionHeavy: boolean;
  isEstablishing: boolean;
  reasoning: string;
}

export interface SliceDefinition {
  sliceNumber: number;
  sceneId: number | null;
  durationSeconds: number;
  panels: PanelData[];
  panelIds: number[];
  characters: Array<{ name: string; role?: string }>;
  dialogue: Array<{ character: string; text: string; emotion: string; startOffset: number; endOffset: number }>;
  actionDescription: string;
  cameraAngle: string;
  mood: string;
  lipSyncRequired: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────

const TARGET_SLICE_DURATION = 10;  // seconds
const MIN_SLICE_DURATION = 5;      // seconds
const MAX_SLICE_DURATION = 15;     // seconds

// Deterministic timing rules (fallback when LLM is unavailable)
const WORDS_PER_SECOND = 2.5;  // Average speech rate for anime dubbing
const MIN_DIALOGUE_DURATION = 2;  // Minimum seconds for any dialogue panel
const ACTION_PANEL_DURATION = 3;  // Default for action-heavy panels
const ESTABLISHING_SHOT_DURATION = 2.5;  // Establishing/environment panels
const TRANSITION_DURATION = 1.5;  // Transition panels
const STATIC_PANEL_DURATION = 2;  // Default for static/simple panels

// ─── Panel Timing Estimation ──────────────────────────────────────────────

/**
 * Estimate duration for a single panel using deterministic rules.
 * This is the fallback when LLM timing estimation fails.
 */
export function estimatePanelTimingDeterministic(panel: PanelData): PanelTiming {
  const dialogue = panel.dialogue || [];
  const hasDialogue = dialogue.length > 0 && dialogue.some(d => (d.text || "").trim().length > 0);
  const totalWords = dialogue.reduce((sum, d) => sum + (d.text || "").split(/\s+/).filter(Boolean).length, 0);
  const visual = (panel.visualDescription || "").toLowerCase();

  // Detect action-heavy panels
  const actionKeywords = ["fight", "battle", "explosion", "chase", "run", "attack", "dodge", "clash", "punch", "kick", "slash", "transform", "flying", "crash", "impact"];
  const isActionHeavy = actionKeywords.some(k => visual.includes(k));

  // Detect establishing shots
  const establishingKeywords = ["establishing", "skyline", "landscape", "exterior", "panoramic", "cityscape", "sunrise", "sunset", "overview"];
  const isEstablishing = establishingKeywords.some(k => visual.includes(k));

  // Detect transitions
  const isTransition = panel.transition === "fade" || panel.transition === "dissolve" ||
    visual.includes("fade to") || visual.includes("title card") || visual.includes("black screen");

  let duration: number;
  let reasoning: string;

  if (isTransition) {
    duration = panel.transitionDuration || TRANSITION_DURATION;
    reasoning = "Transition panel";
  } else if (hasDialogue) {
    // Dialogue-driven timing: word count / speech rate, with minimum
    const speechDuration = totalWords / WORDS_PER_SECOND;
    duration = Math.max(MIN_DIALOGUE_DURATION, speechDuration + 0.5);  // +0.5s for pauses
    reasoning = `Dialogue: ${totalWords} words at ${WORDS_PER_SECOND} wps`;
  } else if (isActionHeavy) {
    duration = ACTION_PANEL_DURATION;
    reasoning = "Action-heavy panel";
  } else if (isEstablishing) {
    duration = ESTABLISHING_SHOT_DURATION;
    reasoning = "Establishing/environment shot";
  } else {
    duration = STATIC_PANEL_DURATION;
    reasoning = "Static/default panel";
  }

  return {
    panelId: panel.id,
    estimatedDurationSeconds: Math.round(duration * 10) / 10,  // Round to 0.1s
    wordCount: totalWords,
    hasDialogue,
    isActionHeavy,
    isEstablishing,
    reasoning,
  };
}

/**
 * Estimate timing for panels using LLM for more accurate results.
 * Falls back to deterministic rules on failure.
 */
export async function estimatePanelTimingsLLM(panels: PanelData[]): Promise<PanelTiming[]> {
  if (panels.length === 0) return [];

  // Build a compact representation for the LLM
  const panelSummaries = panels.map((p, i) => {
    const dialogueText = (p.dialogue || []).map(d => `${d.character || "?"}: "${d.text}"`).join(" | ");
    return `Panel ${i + 1} (ID:${p.id}): [${p.cameraAngle || "medium"}] ${p.visualDescription || "no description"}${dialogueText ? ` DIALOGUE: ${dialogueText}` : ""}${p.sfx ? ` SFX: ${p.sfx}` : ""}`;
  }).join("\n");

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an anime timing director. Estimate how many seconds each panel should last in a 10-second-per-clip anime video. Consider:
- Dialogue panels: ~2.5 words per second + pauses between lines
- Action panels: 2-4 seconds depending on complexity
- Establishing shots: 2-3 seconds
- Transitions: 1-2 seconds
- Emotional beats: add 0.5-1s for dramatic pauses
Return a JSON array of objects with panelId and durationSeconds (to 1 decimal place).`,
        },
        {
          role: "user",
          content: `Estimate timing for these ${panels.length} panels:\n\n${panelSummaries}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "panel_timings",
          strict: true,
          schema: {
            type: "object",
            properties: {
              timings: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    panelId: { type: "integer" },
                    durationSeconds: { type: "number" },
                    reasoning: { type: "string" },
                  },
                  required: ["panelId", "durationSeconds", "reasoning"],
                  additionalProperties: false,
                },
              },
            },
            required: ["timings"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = response.choices?.[0]?.message?.content;
    if (!rawContent) throw new Error("Empty LLM response");
    const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
    const parsed = JSON.parse(content);

    // Map LLM results back to PanelTiming format
    const llmTimings = new Map<number, { duration: number; reasoning: string }>();
    for (const t of parsed.timings || []) {
      llmTimings.set(t.panelId, { duration: t.durationSeconds, reasoning: t.reasoning });
    }

    return panels.map(panel => {
      const llmResult = llmTimings.get(panel.id);
      if (llmResult) {
        const dialogue = panel.dialogue || [];
        const hasDialogue = dialogue.length > 0 && dialogue.some(d => (d.text || "").trim().length > 0);
        const totalWords = dialogue.reduce((sum, d) => sum + (d.text || "").split(/\s+/).filter(Boolean).length, 0);
        const visual = (panel.visualDescription || "").toLowerCase();
        const actionKeywords = ["fight", "battle", "explosion", "chase", "run", "attack"];
        const isActionHeavy = actionKeywords.some(k => visual.includes(k));
        const establishingKeywords = ["establishing", "skyline", "landscape", "exterior", "panoramic"];
        const isEstablishing = establishingKeywords.some(k => visual.includes(k));

        return {
          panelId: panel.id,
          estimatedDurationSeconds: Math.round(Math.max(0.5, Math.min(10, llmResult.duration)) * 10) / 10,
          wordCount: totalWords,
          hasDialogue,
          isActionHeavy,
          isEstablishing,
          reasoning: `LLM: ${llmResult.reasoning}`,
        };
      }
      // Fallback for panels the LLM missed
      return estimatePanelTimingDeterministic(panel);
    });
  } catch (err) {
    console.error("[SliceDecomposer] LLM timing estimation failed, using deterministic fallback:", err);
    return panels.map(estimatePanelTimingDeterministic);
  }
}

// ─── Slice Grouping ──────────────────────────────────────────────────────

/**
 * Group panels into ~10-second slices.
 * Rules:
 *   1. Accumulate panel durations until >= TARGET_SLICE_DURATION
 *   2. Never split mid-dialogue (if a panel has dialogue, it stays in the same slice)
 *   3. Prefer to split at scene boundaries
 *   4. Respect MIN/MAX slice duration constraints
 */
export function groupPanelsIntoSlices(
  panels: PanelData[],
  timings: PanelTiming[],
): SliceDefinition[] {
  if (panels.length === 0) return [];

  const timingMap = new Map(timings.map(t => [t.panelId, t]));
  const slices: SliceDefinition[] = [];
  let currentPanels: PanelData[] = [];
  let currentDuration = 0;
  let sliceNumber = 1;

  function finalizeSlice() {
    if (currentPanels.length === 0) return;

    const slice = buildSliceFromPanels(currentPanels, timingMap, sliceNumber);
    slices.push(slice);
    sliceNumber++;
    currentPanels = [];
    currentDuration = 0;
  }

  for (let i = 0; i < panels.length; i++) {
    const panel = panels[i];
    const timing = timingMap.get(panel.id) || estimatePanelTimingDeterministic(panel);
    const panelDuration = timing.estimatedDurationSeconds;

    // Check if adding this panel would exceed MAX_SLICE_DURATION
    if (currentDuration + panelDuration > MAX_SLICE_DURATION && currentPanels.length > 0) {
      // Only split if current slice is at least MIN_SLICE_DURATION
      if (currentDuration >= MIN_SLICE_DURATION) {
        finalizeSlice();
      }
    }

    // Check for scene boundary — prefer to split here if we're near target
    if (currentPanels.length > 0) {
      const prevPanel = currentPanels[currentPanels.length - 1];
      const isSceneBoundary = panel.sceneNumber !== prevPanel.sceneNumber;

      if (isSceneBoundary && currentDuration >= MIN_SLICE_DURATION) {
        finalizeSlice();
      }
    }

    // Check if we've reached the target duration
    if (currentDuration >= TARGET_SLICE_DURATION && currentPanels.length > 0) {
      // Don't split if the current panel has dialogue that continues from the previous
      const prevPanel = currentPanels.length > 0 ? currentPanels[currentPanels.length - 1] : null;
      const prevHasDialogue = prevPanel && timingMap.get(prevPanel.id)?.hasDialogue;
      const currentHasDialogue = timing.hasDialogue;

      // Check if this is a continuation of the same dialogue exchange
      const isContinuedDialogue = prevHasDialogue && currentHasDialogue &&
        prevPanel && prevPanel.sceneNumber === panel.sceneNumber;

      if (!isContinuedDialogue) {
        finalizeSlice();
      }
    }

    currentPanels.push(panel);
    currentDuration += panelDuration;
  }

  // Finalize the last slice
  finalizeSlice();

  return slices;
}

// ─── Slice Building ──────────────────────────────────────────────────────

/**
 * Extract characters from a set of panels.
 */
export function extractSliceCharacters(panels: PanelData[]): Array<{ name: string; role?: string }> {
  const characterMap = new Map<string, { name: string; role?: string }>();

  for (const panel of panels) {
    if (!panel.dialogue) continue;
    for (const d of panel.dialogue) {
      const name = (d.character || "").trim();
      if (name && name !== "?" && name.toLowerCase() !== "narrator") {
        if (!characterMap.has(name.toLowerCase())) {
          characterMap.set(name.toLowerCase(), { name });
        }
      }
    }
  }

  // Also extract from visual descriptions
  // (Characters mentioned in descriptions like "Akira stands on the rooftop")
  // This is a best-effort extraction; the LLM-based character extraction in Stage 3 is more reliable
  return Array.from(characterMap.values());
}

/**
 * Extract dialogue entries with timing offsets within the slice.
 */
export function extractSliceDialogue(
  panels: PanelData[],
  timingMap: Map<number, PanelTiming>,
): Array<{ character: string; text: string; emotion: string; startOffset: number; endOffset: number }> {
  const dialogueEntries: Array<{ character: string; text: string; emotion: string; startOffset: number; endOffset: number }> = [];
  let currentOffset = 0;

  for (const panel of panels) {
    const timing = timingMap.get(panel.id);
    const panelDuration = timing?.estimatedDurationSeconds || 2;

    if (panel.dialogue && panel.dialogue.length > 0) {
      const dialogueLines = panel.dialogue.filter(d => (d.text || "").trim().length > 0);
      if (dialogueLines.length > 0) {
        // Distribute dialogue evenly within the panel's duration
        const lineInterval = panelDuration / dialogueLines.length;
        for (let i = 0; i < dialogueLines.length; i++) {
          const d = dialogueLines[i];
          const words = (d.text || "").split(/\s+/).filter(Boolean).length;
          const speechDuration = Math.max(0.5, words / WORDS_PER_SECOND);
          const startOffset = currentOffset + (i * lineInterval);

          dialogueEntries.push({
            character: d.character || "Unknown",
            text: d.text || "",
            emotion: d.emotion || "neutral",
            startOffset: Math.round(startOffset * 10) / 10,
            endOffset: Math.round((startOffset + speechDuration) * 10) / 10,
          });
        }
      }
    }

    currentOffset += panelDuration;
  }

  return dialogueEntries;
}

/**
 * Determine the dominant camera angle for a slice.
 */
function determineDominantCameraAngle(panels: PanelData[]): string {
  const angleCounts = new Map<string, number>();
  for (const panel of panels) {
    const angle = (panel.cameraAngle || "medium").toLowerCase();
    angleCounts.set(angle, (angleCounts.get(angle) || 0) + 1);
  }

  let maxCount = 0;
  let dominant = "medium";
  for (const [angle, count] of Array.from(angleCounts.entries())) {
    if (count > maxCount) {
      maxCount = count;
      dominant = angle;
    }
  }
  return dominant;
}

/**
 * Determine the mood for a slice based on panel content.
 */
function determineSliceMood(panels: PanelData[]): string {
  const visual = panels.map(p => p.visualDescription || "").join(" ").toLowerCase();

  const moodKeywords: Record<string, string[]> = {
    "tense": ["tension", "tense", "suspense", "danger", "threat", "ominous"],
    "dramatic": ["dramatic", "emotional", "intense", "powerful", "revelation"],
    "action": ["fight", "battle", "chase", "explosion", "attack", "combat"],
    "calm": ["peaceful", "serene", "quiet", "gentle", "tranquil", "relaxed"],
    "comedic": ["funny", "humor", "comedy", "laugh", "silly", "gag"],
    "romantic": ["romantic", "love", "tender", "intimate", "affection"],
    "dark": ["dark", "grim", "sinister", "evil", "horror", "terrifying"],
    "melancholic": ["sad", "melancholy", "grief", "loss", "tears", "crying"],
    "triumphant": ["victory", "triumph", "celebration", "success", "heroic"],
  };

  let bestMood = "neutral";
  let bestScore = 0;

  for (const [mood, keywords] of Object.entries(moodKeywords)) {
    const score = keywords.filter(k => visual.includes(k)).length;
    if (score > bestScore) {
      bestScore = score;
      bestMood = mood;
    }
  }

  return bestMood;
}

/**
 * Build a complete slice definition from a group of panels.
 */
function buildSliceFromPanels(
  panels: PanelData[],
  timingMap: Map<number, PanelTiming>,
  sliceNumber: number,
): SliceDefinition {
  const totalDuration = panels.reduce((sum, p) => {
    const timing = timingMap.get(p.id);
    return sum + (timing?.estimatedDurationSeconds || 2);
  }, 0);

  const characters = extractSliceCharacters(panels);
  const dialogue = extractSliceDialogue(panels, timingMap);
  const lipSyncRequired = dialogue.length > 0;

  // Build action description from visual descriptions
  const actionDescription = panels
    .map(p => p.visualDescription || "")
    .filter(Boolean)
    .join(". ");

  const cameraAngle = determineDominantCameraAngle(panels);
  const mood = determineSliceMood(panels);

  // Use the scene number from the first panel (slices can span scenes, but we track the primary one)
  const sceneId = panels[0]?.sceneNumber ?? null;

  return {
    sliceNumber,
    sceneId,
    durationSeconds: Math.round(totalDuration * 10) / 10,
    panels,
    panelIds: panels.map(p => p.id),
    characters,
    dialogue,
    actionDescription,
    cameraAngle,
    mood,
    lipSyncRequired,
  };
}

// ─── Main Decomposition ──────────────────────────────────────────────────

export interface DecompositionResult {
  slices: SliceDefinition[];
  totalDurationSeconds: number;
  totalPanels: number;
  averageSliceDuration: number;
  timingMethod: "llm" | "deterministic";
  panelTimings: PanelTiming[];
}

/**
 * Decompose an episode's panels into 10-second video slices.
 *
 * @param panels - Ordered panels from the episode
 * @param useLLM - Whether to use LLM for timing estimation (default: true)
 * @returns DecompositionResult with slices and metadata
 */
export async function decomposeScript(
  panels: PanelData[],
  useLLM: boolean = true,
): Promise<DecompositionResult> {
  if (panels.length === 0) {
    return {
      slices: [],
      totalDurationSeconds: 0,
      totalPanels: 0,
      averageSliceDuration: 0,
      timingMethod: "deterministic",
      panelTimings: [],
    };
  }

  // Step 1: Estimate timing for each panel
  let timings: PanelTiming[];
  let timingMethod: "llm" | "deterministic";

  if (useLLM) {
    timings = await estimatePanelTimingsLLM(panels);
    timingMethod = timings.some(t => t.reasoning.startsWith("LLM:")) ? "llm" : "deterministic";
  } else {
    timings = panels.map(estimatePanelTimingDeterministic);
    timingMethod = "deterministic";
  }

  // Step 2: Group panels into slices
  const slices = groupPanelsIntoSlices(panels, timings);

  // Step 3: Calculate summary
  const totalDuration = slices.reduce((sum, s) => sum + s.durationSeconds, 0);

  return {
    slices,
    totalDurationSeconds: Math.round(totalDuration * 10) / 10,
    totalPanels: panels.length,
    averageSliceDuration: slices.length > 0 ? Math.round((totalDuration / slices.length) * 10) / 10 : 0,
    timingMethod,
    panelTimings: timings,
  };
}
