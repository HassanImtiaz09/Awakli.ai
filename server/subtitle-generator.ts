/**
 * SRT Subtitle Generator — Slice Dialogue → SRT
 *
 * Generates SubRip (SRT) subtitle files from video slice dialogue timecodes.
 * Each slice has a dialogue JSON array with characterId, text, emotion,
 * startOffset, and endOffset (in seconds relative to slice start).
 *
 * The generator:
 *   1. Fetches all slices for an episode, ordered by sliceNumber
 *   2. Builds a slice timeline (reusing buildSliceTimeline from video-assembler)
 *   3. Maps each dialogue entry to absolute timestamps in the assembled video
 *   4. Formats as SRT with multi-speaker character name prefixes
 *   5. Auto-wraps long lines at 42 characters
 *   6. Uploads the SRT file to S3 and updates the episode record
 *
 * Pipeline position: runs after assembly, before publish.
 */

import { getSlicesByEpisode, getEpisodeById, updateEpisode } from "./db";
import { buildSliceTimeline, parseAssemblySettings } from "./video-assembler";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";

// ─── Types ────────────────────────────────────────────────────────────────

export interface DialogueEntry {
  characterId?: number | string;
  characterName?: string;
  text: string;
  emotion?: string;
  startOffset?: number; // seconds relative to slice start
  endOffset?: number;   // seconds relative to slice start
}

export interface SubtitleCue {
  index: number;
  startTime: string;      // SRT format: HH:MM:SS,mmm
  endTime: string;        // SRT format: HH:MM:SS,mmm
  startSeconds: number;   // absolute seconds in assembled video
  endSeconds: number;     // absolute seconds in assembled video
  text: string;           // formatted subtitle text (may include speaker prefix)
  characterName?: string;
  sliceNumber: number;
}

export interface SrtGenerationResult {
  success: boolean;
  srtUrl?: string;
  srtKey?: string;
  totalCues: number;
  totalDurationSeconds: number;
  error?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────

/** Maximum characters per subtitle line before auto-wrapping */
export const MAX_LINE_LENGTH = 42;

/** Default subtitle display duration when no endOffset is provided (seconds) */
export const DEFAULT_CUE_DURATION = 3.0;

/** Minimum gap between consecutive subtitles (seconds) */
export const MIN_CUE_GAP = 0.1;

/** Maximum subtitle display duration (seconds) */
export const MAX_CUE_DURATION = 8.0;

// ─── SRT Formatting Helpers ──────────────────────────────────────────────

/**
 * Convert seconds to SRT timestamp format: HH:MM:SS,mmm
 */
export function secondsToSrtTime(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const secs = Math.floor(clamped % 60);
  const millis = Math.round((clamped % 1) * 1000);

  return (
    String(hours).padStart(2, "0") +
    ":" +
    String(minutes).padStart(2, "0") +
    ":" +
    String(secs).padStart(2, "0") +
    "," +
    String(millis).padStart(3, "0")
  );
}

/**
 * Auto-wrap a subtitle line at MAX_LINE_LENGTH characters.
 * Splits at word boundaries to avoid mid-word breaks.
 * Returns at most 2 lines (SRT convention).
 */
export function wrapSubtitleText(text: string, maxLength: number = MAX_LINE_LENGTH): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;

  // Find the best split point near the middle
  const midpoint = Math.floor(trimmed.length / 2);
  let splitAt = -1;

  // Search outward from midpoint for a space
  for (let offset = 0; offset <= midpoint; offset++) {
    if (midpoint + offset < trimmed.length && trimmed[midpoint + offset] === " ") {
      splitAt = midpoint + offset;
      break;
    }
    if (midpoint - offset >= 0 && trimmed[midpoint - offset] === " ") {
      splitAt = midpoint - offset;
      break;
    }
  }

  if (splitAt === -1) {
    // No space found — force split at maxLength
    return trimmed.substring(0, maxLength) + "\n" + trimmed.substring(maxLength);
  }

  const line1 = trimmed.substring(0, splitAt).trim();
  const line2 = trimmed.substring(splitAt + 1).trim();

  // If either line is still too long, truncate (SRT convention: max 2 lines)
  return line1 + "\n" + line2;
}

/**
 * Format a dialogue entry as subtitle text with optional speaker prefix.
 * Multi-speaker format: "Character: dialogue text"
 */
export function formatSubtitleText(
  dialogue: DialogueEntry,
  includeCharacterName: boolean,
): string {
  let text = dialogue.text.trim();
  if (!text) return "";

  // Add character name prefix for multi-speaker scenes
  if (includeCharacterName && dialogue.characterName) {
    text = `${dialogue.characterName}: ${text}`;
  }

  return wrapSubtitleText(text);
}

/**
 * Format a single SRT cue block.
 */
export function formatSrtCue(cue: SubtitleCue): string {
  return `${cue.index}\n${cue.startTime} --> ${cue.endTime}\n${cue.text}\n`;
}

/**
 * Format a complete SRT file from an array of cues.
 */
export function formatSrtFile(cues: SubtitleCue[]): string {
  if (cues.length === 0) return "";
  return cues.map(formatSrtCue).join("\n");
}

// ─── Dialogue Extraction ─────────────────────────────────────────────────

/**
 * Parse the dialogue JSON from a video slice.
 * Handles both array and single-object formats.
 */
export function parseSliceDialogue(dialogue: unknown): DialogueEntry[] {
  if (!dialogue) return [];

  if (Array.isArray(dialogue)) {
    return dialogue
      .filter((d: any) => d && typeof d.text === "string" && d.text.trim().length > 0)
      .map((d: any) => ({
        characterId: d.characterId,
        characterName: d.characterName || d.character || undefined,
        text: d.text.trim(),
        emotion: d.emotion,
        startOffset: typeof d.startOffset === "number" ? d.startOffset : undefined,
        endOffset: typeof d.endOffset === "number" ? d.endOffset : undefined,
      }));
  }

  if (typeof dialogue === "object" && (dialogue as any).text) {
    const d = dialogue as any;
    return [{
      characterId: d.characterId,
      characterName: d.characterName || d.character || undefined,
      text: d.text.trim(),
      emotion: d.emotion,
      startOffset: typeof d.startOffset === "number" ? d.startOffset : undefined,
      endOffset: typeof d.endOffset === "number" ? d.endOffset : undefined,
    }];
  }

  return [];
}

// ─── Core: generateSubtitleCues ──────────────────────────────────────────

/**
 * Generate subtitle cues from episode slices.
 * Maps dialogue entries to absolute timestamps in the assembled video timeline.
 *
 * @param slices - Video slices with dialogue data
 * @param transitionDuration - Transition overlap between slices (seconds)
 * @param transitionType - Transition type (affects overlap calculation)
 * @returns Array of subtitle cues with absolute timestamps
 */
export function generateSubtitleCues(
  slices: Array<{
    id: number;
    sliceNumber: number;
    durationSeconds: number;
    dialogue: unknown;
    voiceAudioUrl: string | null;
    voiceAudioDurationMs: number | null;
    lipSyncRequired: number;
    mood: string | null;
    videoClipUrl: string;
  }>,
  transitionDuration: number = 0.3,
  transitionType: string = "cross-dissolve",
): SubtitleCue[] {
  if (!slices || slices.length === 0) return [];

  // Build timeline to get absolute start times for each slice
  const timeline = buildSliceTimeline(
    slices.map((s) => ({
      id: s.id,
      sliceNumber: s.sliceNumber,
      durationSeconds: s.durationSeconds,
      videoClipUrl: s.videoClipUrl,
      voiceAudioUrl: s.voiceAudioUrl,
      voiceAudioDurationMs: s.voiceAudioDurationMs,
      dialogue: s.dialogue,
      lipSyncRequired: s.lipSyncRequired,
      mood: s.mood,
    })),
    transitionDuration,
    transitionType,
  );

  // Determine if this is a multi-speaker episode (show character names)
  const allDialogues: Array<{ sliceIdx: number; entry: DialogueEntry }> = [];
  const speakerSet = new Set<string>();

  for (let i = 0; i < slices.length; i++) {
    const entries = parseSliceDialogue(slices[i].dialogue);
    for (const entry of entries) {
      allDialogues.push({ sliceIdx: i, entry });
      if (entry.characterName) speakerSet.add(entry.characterName);
    }
  }

  const isMultiSpeaker = speakerSet.size > 1;

  // Generate cues
  const cues: SubtitleCue[] = [];
  let cueIndex = 1;

  for (const { sliceIdx, entry } of allDialogues) {
    const slice = slices[sliceIdx];
    const timelineEntry = timeline.slices.find((t) => t.sliceNumber === slice.sliceNumber);
    if (!timelineEntry) continue;

    const sliceStartAbsolute = timelineEntry.startTimeSeconds;

    // Calculate absolute start/end times
    let startSeconds: number;
    let endSeconds: number;

    if (entry.startOffset !== undefined) {
      startSeconds = sliceStartAbsolute + entry.startOffset;
    } else {
      // Default: start at the beginning of the slice
      startSeconds = sliceStartAbsolute;
    }

    if (entry.endOffset !== undefined) {
      endSeconds = sliceStartAbsolute + entry.endOffset;
    } else {
      // Default: display for DEFAULT_CUE_DURATION or until slice end
      endSeconds = Math.min(
        startSeconds + DEFAULT_CUE_DURATION,
        timelineEntry.endTimeSeconds,
      );
    }

    // Clamp duration
    const duration = endSeconds - startSeconds;
    if (duration <= 0) continue;
    if (duration > MAX_CUE_DURATION) {
      endSeconds = startSeconds + MAX_CUE_DURATION;
    }

    // Ensure minimum gap from previous cue
    if (cues.length > 0) {
      const prevEnd = cues[cues.length - 1].endSeconds;
      if (startSeconds < prevEnd + MIN_CUE_GAP) {
        startSeconds = prevEnd + MIN_CUE_GAP;
        if (startSeconds >= endSeconds) continue; // Skip overlapping cue
      }
    }

    // Format text
    const text = formatSubtitleText(entry, isMultiSpeaker);
    if (!text) continue;

    cues.push({
      index: cueIndex++,
      startTime: secondsToSrtTime(startSeconds),
      endTime: secondsToSrtTime(endSeconds),
      startSeconds,
      endSeconds,
      text,
      characterName: entry.characterName,
      sliceNumber: slice.sliceNumber,
    });
  }

  return cues;
}

// ─── Core: generateSrt ──────────────────────────────────────────────────

/**
 * Generate SRT subtitles for an episode and upload to S3.
 *
 * Flow:
 *   1. Fetch all slices for the episode
 *   2. Parse assembly settings for transition config
 *   3. Generate subtitle cues from dialogue timecodes
 *   4. Format as SRT file
 *   5. Upload to S3
 *   6. Update episode record with srtUrl and srtGeneratedAt
 *
 * @param episodeId - The episode to generate subtitles for
 * @returns SRT generation result with URL and metadata
 */
export async function generateSrt(episodeId: number): Promise<SrtGenerationResult> {
  try {
    // 1. Fetch episode and slices
    const episode = await getEpisodeById(episodeId);
    if (!episode) {
      return {
        success: false,
        totalCues: 0,
        totalDurationSeconds: 0,
        error: `Episode ${episodeId} not found`,
      };
    }

    const slices = await getSlicesByEpisode(episodeId);
    if (!slices || slices.length === 0) {
      return {
        success: false,
        totalCues: 0,
        totalDurationSeconds: 0,
        error: `Episode ${episodeId} has no slices`,
      };
    }

    // 2. Parse assembly settings for transition config
    const config = parseAssemblySettings(episode.assemblySettings);

    // 3. Generate subtitle cues
    const cues = generateSubtitleCues(
      slices.map((s) => ({
        id: s.id,
        sliceNumber: s.sliceNumber,
        durationSeconds: s.durationSeconds,
        dialogue: s.dialogue,
        voiceAudioUrl: s.voiceAudioUrl,
        voiceAudioDurationMs: s.voiceAudioDurationMs,
        lipSyncRequired: s.lipSyncRequired,
        mood: s.mood || null,
        videoClipUrl: s.videoClipUrl || "",
      })),
      config.transitionDuration,
      config.transitionType,
    );

    if (cues.length === 0) {
      return {
        success: true,
        totalCues: 0,
        totalDurationSeconds: 0,
        error: "No dialogue found in episode slices",
      };
    }

    // 4. Format as SRT
    const srtContent = formatSrtFile(cues);
    const totalDuration = cues[cues.length - 1].endSeconds;

    // 5. Upload to S3
    const srtKey = `subtitles/ep-${episodeId}-${nanoid(8)}.srt`;
    const srtBuffer = Buffer.from(srtContent, "utf-8");
    const { url: srtUrl } = await storagePut(srtKey, srtBuffer, "text/srt");

    // 6. Update episode record
    await updateEpisode(episodeId, {
      srtUrl,
      srtGeneratedAt: new Date(),
    } as any);

    console.log(
      `[SubtitleGenerator] Episode ${episodeId}: generated ${cues.length} subtitle cues, duration ${totalDuration.toFixed(1)}s`,
    );

    return {
      success: true,
      srtUrl,
      srtKey,
      totalCues: cues.length,
      totalDurationSeconds: totalDuration,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[SubtitleGenerator] Episode ${episodeId} failed: ${errorMsg}`);
    return {
      success: false,
      totalCues: 0,
      totalDurationSeconds: 0,
      error: errorMsg,
    };
  }
}
