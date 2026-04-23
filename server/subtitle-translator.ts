/**
 * Subtitle Translator — LLM-powered SRT translation for multi-language support
 *
 * Translates English SRT subtitles to other languages using invokeLLM.
 * Preserves SRT timing/formatting, only translates dialogue text.
 * Uploads translated SRT to S3, auto-triggers VTT conversion + Cloudflare caption upload.
 *
 * Supported languages:
 *   ja (Japanese), es (Spanish), fr (French), de (German),
 *   pt (Portuguese), ko (Korean), zh (Chinese)
 */

import { invokeLLM } from "./_core/llm";
import { convertSrtToVtt, isValidVtt } from "./srt-to-vtt";
import { uploadCaption } from "./cloudflare-stream";
import { getEpisodeById, updateEpisode } from "./db";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";
import { getDb } from "./db";
import { episodeSubtitles } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

// ─── Language Map ────────────────────────────────────────────────────

export const SUPPORTED_LANGUAGES: Record<string, { label: string; nativeName: string }> = {
  en: { label: "English", nativeName: "English" },
  ja: { label: "Japanese", nativeName: "日本語" },
  es: { label: "Spanish", nativeName: "Español" },
  fr: { label: "French", nativeName: "Français" },
  de: { label: "German", nativeName: "Deutsch" },
  pt: { label: "Portuguese", nativeName: "Português" },
  ko: { label: "Korean", nativeName: "한국어" },
  zh: { label: "Chinese", nativeName: "中文" },
};

export function isLanguageSupported(lang: string): boolean {
  return lang in SUPPORTED_LANGUAGES;
}

export function getLanguageLabel(lang: string): string {
  return SUPPORTED_LANGUAGES[lang]?.label ?? lang;
}

// ─── Types ────────────────────────────────────────────────────────────

export interface TranslationResult {
  success: boolean;
  episodeId: number;
  language: string;
  label: string;
  srtUrl: string | null;
  vttUrl: string | null;
  status: string;
  cueCount: number;
  error?: string;
}

// ─── SRT Parsing ─────────────────────────────────────────────────────

interface SrtCue {
  index: string;
  timestamp: string;
  text: string;
}

/**
 * Parse SRT content into structured cues.
 * Preserves index numbers and timestamps, extracts only dialogue text.
 */
function parseSrt(srtContent: string): SrtCue[] {
  let content = srtContent.replace(/^\uFEFF/, "");
  content = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const blocks = content.trim().split(/\n\n+/);
  const cues: SrtCue[] = [];

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 2) continue;

    let timestampLineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("-->")) {
        timestampLineIdx = i;
        break;
      }
    }
    if (timestampLineIdx === -1) continue;

    const index = timestampLineIdx > 0 ? lines[timestampLineIdx - 1].trim() : "";
    const timestamp = lines[timestampLineIdx].trim();
    const textLines = lines.slice(timestampLineIdx + 1).filter((l) => l.trim().length > 0);
    if (textLines.length === 0) continue;

    cues.push({
      index,
      timestamp,
      text: textLines.join("\n"),
    });
  }

  return cues;
}

/**
 * Reassemble SRT from cues with translated text.
 */
function assembleSrt(cues: SrtCue[]): string {
  return cues
    .map((cue) => {
      const parts: string[] = [];
      if (cue.index) parts.push(cue.index);
      parts.push(cue.timestamp);
      parts.push(cue.text);
      return parts.join("\n");
    })
    .join("\n\n") + "\n";
}

// ─── LLM Translation ────────────────────────────────────────────────

/**
 * Translate an array of subtitle texts from English to the target language.
 * Uses batching to handle large subtitle files efficiently.
 */
async function translateTexts(
  texts: string[],
  targetLanguage: string,
): Promise<string[]> {
  const langInfo = SUPPORTED_LANGUAGES[targetLanguage];
  if (!langInfo) throw new Error(`Unsupported language: ${targetLanguage}`);

  // Batch texts to avoid token limits (max ~40 cues per batch)
  const BATCH_SIZE = 40;
  const translated: string[] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);

    // Build a numbered list for the LLM
    const numberedInput = batch.map((t, idx) => `[${idx + 1}] ${t}`).join("\n");

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a professional subtitle translator. Translate the following English subtitle lines to ${langInfo.label} (${langInfo.nativeName}). Rules:
1. Translate ONLY the dialogue text, preserving the numbered format [N].
2. Keep translations natural and conversational, appropriate for anime subtitles.
3. Maintain the same number of lines as the input.
4. Do NOT add explanations, notes, or extra text.
5. Output format: one line per subtitle, starting with [N] followed by the translated text.
6. If a line contains sound effects like [music], [laughter], etc., translate them appropriately for the target language.`,
        },
        {
          role: "user",
          content: numberedInput,
        },
      ],
    });

    const responseText = String(response.choices?.[0]?.message?.content ?? "");

    // Parse the numbered response
    const lines = responseText.trim().split("\n");
    const batchTranslated: string[] = [];

    for (const line of lines) {
      const match = line.match(/^\[(\d+)\]\s*(.+)$/);
      if (match) {
        batchTranslated.push(match[2].trim());
      }
    }

    // If parsing failed or count mismatch, fall back to line-by-line
    if (batchTranslated.length !== batch.length) {
      console.warn(
        `[SubtitleTranslator] Batch translation count mismatch: expected ${batch.length}, got ${batchTranslated.length}. Using fallback.`,
      );
      // Pad with original text if we got fewer translations
      for (let j = 0; j < batch.length; j++) {
        translated.push(batchTranslated[j] ?? batch[j]);
      }
    } else {
      translated.push(...batchTranslated);
    }
  }

  return translated;
}

// ─── Core: translateSrt ─────────────────────────────────────────────

/**
 * Full translation pipeline for an episode's subtitles.
 *
 * Flow:
 *   1. Fetch English SRT from episode
 *   2. Parse SRT into cues
 *   3. Translate dialogue text via LLM
 *   4. Reassemble translated SRT
 *   5. Upload translated SRT to S3
 *   6. Convert to VTT and upload to S3
 *   7. Upload VTT to Cloudflare Stream as caption track
 *   8. Create/update episode_subtitles record
 */
export async function translateSrt(
  episodeId: number,
  targetLanguage: string,
): Promise<TranslationResult> {
  const langInfo = SUPPORTED_LANGUAGES[targetLanguage];
  if (!langInfo) {
    return {
      success: false,
      episodeId,
      language: targetLanguage,
      label: targetLanguage,
      srtUrl: null,
      vttUrl: null,
      status: "error",
      cueCount: 0,
      error: `Unsupported language: ${targetLanguage}`,
    };
  }

  const db = await getDb();
  if (!db) {
    return {
      success: false,
      episodeId,
      language: targetLanguage,
      label: langInfo.label,
      srtUrl: null,
      vttUrl: null,
      status: "error",
      cueCount: 0,
      error: "Database not available",
    };
  }

  // Check if translation already exists
  const existing = await db
    .select()
    .from(episodeSubtitles)
    .where(and(eq(episodeSubtitles.episodeId, episodeId), eq(episodeSubtitles.language, targetLanguage)))
    .limit(1);

  let subtitleRecordId: number;

  if (existing.length > 0) {
    subtitleRecordId = existing[0].id;
    // Reset status
    await db
      .update(episodeSubtitles)
      .set({ status: "translating", error: null, srtUrl: null, vttUrl: null })
      .where(eq(episodeSubtitles.id, subtitleRecordId));
  } else {
    // Create new record
    const [result] = await db.insert(episodeSubtitles).values({
      episodeId,
      language: targetLanguage,
      label: langInfo.label,
      status: "translating",
    });
    subtitleRecordId = (result as any).insertId;
  }

  try {
    // 1. Get episode and its English SRT
    const episode = await getEpisodeById(episodeId);
    if (!episode) throw new Error(`Episode ${episodeId} not found`);

    const ep = episode as any;
    if (!ep.srtUrl) throw new Error(`Episode ${episodeId} has no English SRT subtitles`);

    console.log(`[SubtitleTranslator] Episode ${episodeId}: translating to ${langInfo.label}`);

    // 2. Fetch SRT content
    const srtResponse = await fetch(ep.srtUrl);
    if (!srtResponse.ok) throw new Error(`Failed to fetch SRT: HTTP ${srtResponse.status}`);
    const srtContent = await srtResponse.text();
    if (!srtContent.trim()) throw new Error("SRT file is empty");

    // 3. Parse SRT
    const cues = parseSrt(srtContent);
    if (cues.length === 0) throw new Error("No subtitle cues found in SRT");

    console.log(`[SubtitleTranslator] Episode ${episodeId}: parsed ${cues.length} cues`);

    // 4. Translate dialogue texts
    const originalTexts = cues.map((c) => c.text);
    const translatedTexts = await translateTexts(originalTexts, targetLanguage);

    // 5. Reassemble translated SRT
    const translatedCues = cues.map((cue, i) => ({
      ...cue,
      text: translatedTexts[i] ?? cue.text,
    }));
    const translatedSrt = assembleSrt(translatedCues);

    // 6. Upload translated SRT to S3
    await db
      .update(episodeSubtitles)
      .set({ status: "converting" })
      .where(eq(episodeSubtitles.id, subtitleRecordId));

    const srtKey = `subtitles/ep-${episodeId}-${targetLanguage}-${nanoid(8)}.srt`;
    const srtBuffer = Buffer.from(translatedSrt, "utf-8");
    const { url: srtUrl } = await storagePut(srtKey, srtBuffer, "text/plain");

    console.log(`[SubtitleTranslator] Episode ${episodeId}: SRT uploaded to ${srtKey}`);

    // 7. Convert to VTT and upload
    const conversion = convertSrtToVtt(translatedSrt);
    if (!conversion.success || !conversion.vttContent) {
      throw new Error(`VTT conversion failed: ${conversion.error}`);
    }

    await db
      .update(episodeSubtitles)
      .set({ status: "uploading" })
      .where(eq(episodeSubtitles.id, subtitleRecordId));

    const vttKey = `captions/ep-${episodeId}-${targetLanguage}-${nanoid(8)}.vtt`;
    const vttBuffer = Buffer.from(conversion.vttContent, "utf-8");
    const { url: vttUrl } = await storagePut(vttKey, vttBuffer, "text/vtt");

    console.log(`[SubtitleTranslator] Episode ${episodeId}: VTT uploaded to ${vttKey}`);

    // 8. Upload to Cloudflare Stream (if stream is ready)
    if (ep.streamUid && ep.streamStatus === "ready") {
      try {
        await uploadCaption(ep.streamUid, targetLanguage, conversion.vttContent);
        console.log(`[SubtitleTranslator] Episode ${episodeId}: caption uploaded to Cloudflare Stream (${targetLanguage})`);
      } catch (cfErr) {
        console.warn(`[SubtitleTranslator] Cloudflare caption upload failed (non-fatal):`, cfErr);
        // Non-fatal: VTT is still available as fallback
      }
    }

    // 9. Update record as ready
    await db
      .update(episodeSubtitles)
      .set({ status: "ready", srtUrl, vttUrl, error: null })
      .where(eq(episodeSubtitles.id, subtitleRecordId));

    console.log(`[SubtitleTranslator] Episode ${episodeId}: ${langInfo.label} translation complete`);

    return {
      success: true,
      episodeId,
      language: targetLanguage,
      label: langInfo.label,
      srtUrl,
      vttUrl,
      status: "ready",
      cueCount: cues.length,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[SubtitleTranslator] Episode ${episodeId} (${targetLanguage}) failed: ${errorMsg}`);

    await db
      .update(episodeSubtitles)
      .set({ status: "error", error: errorMsg })
      .where(eq(episodeSubtitles.id, subtitleRecordId));

    return {
      success: false,
      episodeId,
      language: targetLanguage,
      label: langInfo.label,
      srtUrl: null,
      vttUrl: null,
      status: "error",
      cueCount: 0,
      error: errorMsg,
    };
  }
}

// ─── List Languages ─────────────────────────────────────────────────

/**
 * List all subtitle languages for an episode (both generated and available).
 */
export async function listSubtitleLanguages(episodeId: number) {
  const db = await getDb();
  if (!db) return { existing: [], available: [] };

  // Get existing translations
  const existing = await db
    .select()
    .from(episodeSubtitles)
    .where(eq(episodeSubtitles.episodeId, episodeId));

  // Check if English SRT exists on the episode
  const episode = await getEpisodeById(episodeId);
  const ep = episode as any;
  const hasEnglishSrt = !!ep?.srtUrl;

  // Build list of existing languages (include English from episode record)
  const existingLangs = existing.map((sub) => ({
    id: sub.id,
    language: sub.language,
    label: sub.label,
    status: sub.status,
    srtUrl: sub.srtUrl,
    vttUrl: sub.vttUrl,
    error: sub.error,
    createdAt: sub.createdAt,
  }));

  // Add English if it has SRT but no record in episode_subtitles
  if (hasEnglishSrt && !existingLangs.find((l) => l.language === "en")) {
    existingLangs.unshift({
      id: 0,
      language: "en",
      label: "English",
      status: "ready",
      srtUrl: ep.srtUrl,
      vttUrl: ep.vttUrl || null,
      error: null,
      createdAt: ep.createdAt,
    });
  }

  // Available languages (not yet translated)
  const existingCodes = new Set(existingLangs.map((l) => l.language));
  const available = Object.entries(SUPPORTED_LANGUAGES)
    .filter(([code]) => !existingCodes.has(code))
    .map(([code, info]) => ({
      language: code,
      label: info.label,
      nativeName: info.nativeName,
    }));

  return { existing: existingLangs, available };
}

// ─── Delete Language ────────────────────────────────────────────────

/**
 * Delete a specific language subtitle for an episode.
 * Also removes the caption from Cloudflare Stream if applicable.
 */
export async function deleteSubtitleLanguage(
  episodeId: number,
  language: string,
): Promise<{ success: boolean; error?: string }> {
  if (language === "en") {
    return { success: false, error: "Cannot delete the original English subtitles" };
  }

  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  // Delete from DB
  await db
    .delete(episodeSubtitles)
    .where(and(eq(episodeSubtitles.episodeId, episodeId), eq(episodeSubtitles.language, language)));

  // Try to remove from Cloudflare Stream
  const episode = await getEpisodeById(episodeId);
  const ep = episode as any;
  if (ep?.streamUid) {
    try {
      const { deleteCaption } = await import("./cloudflare-stream");
      await deleteCaption(ep.streamUid, language);
    } catch {
      // Non-fatal
    }
  }

  console.log(`[SubtitleTranslator] Episode ${episodeId}: deleted ${language} subtitle`);
  return { success: true };
}
