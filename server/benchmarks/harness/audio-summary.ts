/**
 * D5 Support · Audio Summary
 *
 * Produces a waveform analysis JSON for the D5 visual reviewer:
 * - Per-slice loudness (LUFS)
 * - Silence regions
 * - Overall loudness profile
 *
 * This gives D5 audio context without sending raw audio to the vision model.
 */

import { execSync } from "child_process";
import type { HarnessCheckResult } from "./types.js";

export interface SliceAudioProfile {
  sliceId: number;
  startSec: number;
  endSec: number;
  meanVolume: number;      // dB
  maxVolume: number;       // dB
  hasSilence: boolean;     // any silence > 0.5s in this slice
  silenceRegions: Array<{ startSec: number; endSec: number; durationSec: number }>;
}

export interface AudioSummary {
  overallLufs: number;
  overallLra: number;
  overallTruePeak: number;
  totalDurationSec: number;
  sliceProfiles: SliceAudioProfile[];
  silenceRegions: Array<{ startSec: number; endSec: number; durationSec: number }>;
}

export interface AudioSummaryOptions {
  videoPath: string;
  slices: Array<{
    sliceId: number;
    startSec: number;
    durationSec: number;
  }>;
  titleCardDurationSec: number;
}

export function generateAudioSummary(options: AudioSummaryOptions): AudioSummary {
  const { videoPath, slices, titleCardDurationSec } = options;

  // 1. Overall loudness
  let overallLufs = -16;
  let overallLra = 8;
  let overallTruePeak = -1;

  try {
    const loudnormOut = execSync(
      `ffmpeg -i "${videoPath}" -af loudnorm=print_format=json -f null - 2>&1 || true`,
      { timeout: 30000 }
    ).toString();

    const jsonMatch = loudnormOut.match(/\{[^}]*"input_i"[^}]*\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      overallLufs = parseFloat(data.input_i) || overallLufs;
      overallLra = parseFloat(data.input_lra) || overallLra;
      overallTruePeak = parseFloat(data.input_tp) || overallTruePeak;
    }
  } catch {
    console.warn("  [audio-summary] Failed to get overall loudness");
  }

  // 2. Silence detection
  const silenceRegions: Array<{ startSec: number; endSec: number; durationSec: number }> = [];
  try {
    const silenceOut = execSync(
      `ffmpeg -i "${videoPath}" -af silencedetect=noise=-30dB:d=0.5 -f null - 2>&1 || true`,
      { timeout: 30000 }
    ).toString();

    const startRegex = /silence_start:\s*([\d.]+)/g;
    const endRegex = /silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g;

    const starts: number[] = [];
    let match: RegExpExecArray | null;
    while ((match = startRegex.exec(silenceOut)) !== null) {
      starts.push(parseFloat(match[1]));
    }

    let idx = 0;
    while ((match = endRegex.exec(silenceOut)) !== null) {
      const endSec = parseFloat(match[1]);
      const durationSec = parseFloat(match[2]);
      const startSec = starts[idx] ?? endSec - durationSec;
      silenceRegions.push({ startSec, endSec, durationSec });
      idx++;
    }
  } catch {
    console.warn("  [audio-summary] Failed to detect silence regions");
  }

  // 3. Get total duration
  let totalDurationSec = 0;
  try {
    const durOut = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoPath}" 2>/dev/null`
    ).toString().trim();
    totalDurationSec = parseFloat(durOut) || 0;
  } catch {
    // estimate from slices
    const lastSlice = slices[slices.length - 1];
    if (lastSlice) {
      totalDurationSec = titleCardDurationSec + lastSlice.startSec + lastSlice.durationSec + 5;
    }
  }

  // 4. Per-slice volume analysis
  const sliceProfiles: SliceAudioProfile[] = slices.map((slice) => {
    const absStart = titleCardDurationSec + slice.startSec;
    const absEnd = absStart + slice.durationSec;

    let meanVolume = -20;
    let maxVolume = -10;

    try {
      const volOut = execSync(
        `ffmpeg -i "${videoPath}" -ss ${absStart.toFixed(2)} -t ${slice.durationSec.toFixed(2)} -af volumedetect -f null - 2>&1 || true`,
        { timeout: 10000 }
      ).toString();

      const meanMatch = volOut.match(/mean_volume:\s*([-\d.]+)\s*dB/);
      const maxMatch = volOut.match(/max_volume:\s*([-\d.]+)\s*dB/);
      if (meanMatch) meanVolume = parseFloat(meanMatch[1]);
      if (maxMatch) maxVolume = parseFloat(maxMatch[1]);
    } catch {
      // use defaults
    }

    // Check for silence within this slice's time range
    const sliceSilences = silenceRegions.filter(
      (s) => s.endSec > absStart && s.startSec < absEnd && s.durationSec > 0.5
    );

    return {
      sliceId: slice.sliceId,
      startSec: absStart,
      endSec: absEnd,
      meanVolume,
      maxVolume,
      hasSilence: sliceSilences.length > 0,
      silenceRegions: sliceSilences,
    };
  });

  return {
    overallLufs,
    overallLra,
    overallTruePeak,
    totalDurationSec,
    sliceProfiles,
    silenceRegions,
  };
}
