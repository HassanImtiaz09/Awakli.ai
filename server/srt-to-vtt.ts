/**
 * SRT → WebVTT Converter
 *
 * Converts SubRip (SRT) subtitle format to WebVTT format for Cloudflare Stream
 * caption upload. The conversion handles:
 *   - Header: adds "WEBVTT" header
 *   - Timestamps: converts comma-separated milliseconds to dot-separated
 *   - Cue numbering: preserves or strips cue indices
 *   - Encoding: ensures UTF-8 output
 *
 * WebVTT spec: https://www.w3.org/TR/webvtt1/
 */

// ─── Types ────────────────────────────────────────────────────────────

export interface VttConversionResult {
  success: boolean;
  vttContent?: string;
  cueCount: number;
  error?: string;
}

// ─── Core: convertSrtToVtt ──────────────────────────────────────────

/**
 * Convert SRT content string to WebVTT format.
 *
 * SRT format:
 *   1
 *   00:00:01,000 --> 00:00:04,000
 *   Hello world
 *
 * WebVTT format:
 *   WEBVTT
 *
 *   1
 *   00:00:01.000 --> 00:00:04.000
 *   Hello world
 */
export function convertSrtToVtt(srtContent: string): VttConversionResult {
  if (!srtContent || srtContent.trim().length === 0) {
    return { success: false, cueCount: 0, error: "Empty SRT content" };
  }

  try {
    // Strip BOM if present
    let content = srtContent.replace(/^\uFEFF/, "");

    // Normalize line endings to \n
    content = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    // Split into cue blocks (separated by blank lines)
    const blocks = content.trim().split(/\n\n+/);

    if (blocks.length === 0) {
      return { success: false, cueCount: 0, error: "No subtitle cues found in SRT" };
    }

    const vttCues: string[] = [];
    let cueCount = 0;

    for (const block of blocks) {
      const lines = block.trim().split("\n");
      if (lines.length < 2) continue;

      // Find the timestamp line (contains "-->")
      let timestampLineIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("-->")) {
          timestampLineIdx = i;
          break;
        }
      }

      if (timestampLineIdx === -1) continue;

      // Convert SRT timestamps (comma) to VTT timestamps (dot)
      const timestampLine = lines[timestampLineIdx].replace(/,/g, ".");

      // Get the cue index (line before timestamp, if it's a number)
      let cueIndex = "";
      if (timestampLineIdx > 0) {
        const potentialIndex = lines[timestampLineIdx - 1].trim();
        if (/^\d+$/.test(potentialIndex)) {
          cueIndex = potentialIndex;
        }
      }

      // Get subtitle text (lines after timestamp)
      const textLines = lines.slice(timestampLineIdx + 1).filter((l) => l.trim().length > 0);
      if (textLines.length === 0) continue;

      // Build VTT cue
      const cueParts: string[] = [];
      if (cueIndex) cueParts.push(cueIndex);
      cueParts.push(timestampLine);
      cueParts.push(...textLines);

      vttCues.push(cueParts.join("\n"));
      cueCount++;
    }

    if (cueCount === 0) {
      return { success: false, cueCount: 0, error: "No valid subtitle cues found after parsing" };
    }

    // Assemble VTT file
    const vttContent = "WEBVTT\n\n" + vttCues.join("\n\n") + "\n";

    return {
      success: true,
      vttContent,
      cueCount,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, cueCount: 0, error: `SRT to VTT conversion failed: ${errorMsg}` };
  }
}

/**
 * Validate that a string is valid WebVTT format.
 * Basic validation: starts with "WEBVTT" and contains at least one timestamp arrow.
 */
export function isValidVtt(content: string): boolean {
  if (!content) return false;
  const trimmed = content.trim();
  return trimmed.startsWith("WEBVTT") && trimmed.includes("-->");
}

/**
 * Convert SRT timestamp to VTT timestamp.
 * SRT: 00:01:23,456 → VTT: 00:01:23.456
 */
export function srtTimestampToVtt(srtTimestamp: string): string {
  return srtTimestamp.replace(/,/g, ".");
}
