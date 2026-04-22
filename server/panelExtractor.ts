/**
 * Panel Extractor Service
 *
 * Server-side service for extracting individual panels from uploaded manga pages.
 * Uses sharp for image processing and gutter detection to auto-split pages into panels.
 */
import sharp from "sharp";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";

export interface ExtractedPanel {
  id: string;
  index: number;
  url: string;
  fileKey: string;
  width: number;
  height: number;
  sourcePageIndex: number;
}

export interface ExtractionResult {
  panels: ExtractedPanel[];
  totalPages: number;
  totalPanels: number;
}

/**
 * Extract panels from a list of page image buffers.
 * Uses horizontal/vertical gutter detection to split pages into panels.
 */
export async function extractPanelsFromPages(
  pageBuffers: Buffer[],
  userId: number,
  projectId: number
): Promise<ExtractionResult> {
  const allPanels: ExtractedPanel[] = [];
  let panelIndex = 0;

  for (let pageIdx = 0; pageIdx < pageBuffers.length; pageIdx++) {
    const pageBuffer = pageBuffers[pageIdx];
    const panels = await splitPageIntoPanels(pageBuffer);

    for (const panelBuf of panels) {
      const meta = await sharp(panelBuf).metadata();
      const id = nanoid(12);
      const fileKey = `panel-extracts/${userId}/${projectId}/${id}.webp`;

      // Convert to webp for efficiency and upload
      const webpBuffer = await sharp(panelBuf)
        .webp({ quality: 85 })
        .toBuffer();

      const { url } = await storagePut(fileKey, webpBuffer, "image/webp");

      allPanels.push({
        id,
        index: panelIndex++,
        url,
        fileKey,
        width: meta.width ?? 0,
        height: meta.height ?? 0,
        sourcePageIndex: pageIdx,
      });
    }
  }

  return {
    panels: allPanels,
    totalPages: pageBuffers.length,
    totalPanels: allPanels.length,
  };
}

/**
 * Split a single manga page into panels using gutter detection.
 *
 * Strategy:
 * 1. Convert to grayscale
 * 2. Detect horizontal gutters (white/light rows spanning most of the width)
 * 3. For each horizontal strip, detect vertical gutters
 * 4. Extract each panel region
 *
 * Falls back to returning the full page if no gutters detected.
 */
async function splitPageIntoPanels(pageBuffer: Buffer): Promise<Buffer[]> {
  const image = sharp(pageBuffer);
  const meta = await image.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;

  if (width === 0 || height === 0) return [pageBuffer];

  // Get raw pixel data (grayscale)
  const { data: grayData } = await sharp(pageBuffer)
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Detect horizontal gutters (rows where average brightness > threshold)
  const GUTTER_THRESHOLD = 240; // Near-white
  const MIN_GUTTER_HEIGHT = Math.max(3, Math.floor(height * 0.01));
  const MIN_PANEL_HEIGHT = Math.floor(height * 0.08);

  const rowBrightness: number[] = [];
  for (let y = 0; y < height; y++) {
    let sum = 0;
    // Sample every 4th pixel for speed
    const sampleStep = Math.max(1, Math.floor(width / 100));
    let sampleCount = 0;
    for (let x = 0; x < width; x += sampleStep) {
      sum += grayData[y * width + x];
      sampleCount++;
    }
    rowBrightness.push(sum / sampleCount);
  }

  // Find horizontal gutter regions
  const hGutters = findGutterRegions(rowBrightness, GUTTER_THRESHOLD, MIN_GUTTER_HEIGHT);

  // Split into horizontal strips
  const hStrips = splitByGutters(height, hGutters, MIN_PANEL_HEIGHT);

  if (hStrips.length <= 1) {
    // No horizontal splits — try vertical splits on the full page
    const vPanels = await splitStripVertically(pageBuffer, width, height, grayData, width);
    return vPanels.length > 0 ? vPanels : [pageBuffer];
  }

  // For each horizontal strip, try vertical splits
  const panels: Buffer[] = [];
  for (const strip of hStrips) {
    const stripBuffer = await sharp(pageBuffer)
      .extract({ left: 0, top: strip.start, width, height: strip.end - strip.start })
      .toBuffer();

    const stripHeight = strip.end - strip.start;
    const { data: stripGray } = await sharp(stripBuffer)
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const vPanels = await splitStripVertically(
      stripBuffer, width, stripHeight, stripGray, width
    );

    if (vPanels.length > 0) {
      panels.push(...vPanels);
    } else {
      panels.push(stripBuffer);
    }
  }

  return panels;
}

/**
 * Try to split a horizontal strip into vertical panels.
 */
async function splitStripVertically(
  stripBuffer: Buffer,
  width: number,
  height: number,
  grayData: Buffer,
  rowWidth: number
): Promise<Buffer[]> {
  const GUTTER_THRESHOLD = 240;
  const MIN_GUTTER_WIDTH = Math.max(3, Math.floor(width * 0.01));
  const MIN_PANEL_WIDTH = Math.floor(width * 0.1);

  // Compute column brightness
  const colBrightness: number[] = [];
  const sampleStep = Math.max(1, Math.floor(height / 50));
  for (let x = 0; x < width; x++) {
    let sum = 0;
    let sampleCount = 0;
    for (let y = 0; y < height; y += sampleStep) {
      sum += grayData[y * rowWidth + x];
      sampleCount++;
    }
    colBrightness.push(sum / sampleCount);
  }

  const vGutters = findGutterRegions(colBrightness, GUTTER_THRESHOLD, MIN_GUTTER_WIDTH);
  const vStrips = splitByGutters(width, vGutters, MIN_PANEL_WIDTH);

  if (vStrips.length <= 1) return [];

  const panels: Buffer[] = [];
  for (const strip of vStrips) {
    const panelBuffer = await sharp(stripBuffer)
      .extract({ left: strip.start, top: 0, width: strip.end - strip.start, height })
      .toBuffer();
    panels.push(panelBuffer);
  }
  return panels;
}

/**
 * Find contiguous regions where brightness exceeds threshold.
 */
function findGutterRegions(
  values: number[],
  threshold: number,
  minLength: number
): Array<{ start: number; end: number }> {
  const gutters: Array<{ start: number; end: number }> = [];
  let gutterStart = -1;

  for (let i = 0; i < values.length; i++) {
    if (values[i] >= threshold) {
      if (gutterStart === -1) gutterStart = i;
    } else {
      if (gutterStart !== -1 && i - gutterStart >= minLength) {
        gutters.push({ start: gutterStart, end: i });
      }
      gutterStart = -1;
    }
  }

  // Handle trailing gutter
  if (gutterStart !== -1 && values.length - gutterStart >= minLength) {
    gutters.push({ start: gutterStart, end: values.length });
  }

  return gutters;
}

/**
 * Given gutters, compute the content strips between them.
 */
function splitByGutters(
  totalLength: number,
  gutters: Array<{ start: number; end: number }>,
  minStripLength: number
): Array<{ start: number; end: number }> {
  if (gutters.length === 0) return [{ start: 0, end: totalLength }];

  const strips: Array<{ start: number; end: number }> = [];
  let cursor = 0;

  for (const gutter of gutters) {
    if (gutter.start - cursor >= minStripLength) {
      strips.push({ start: cursor, end: gutter.start });
    }
    cursor = gutter.end;
  }

  // Trailing strip
  if (totalLength - cursor >= minStripLength) {
    strips.push({ start: cursor, end: totalLength });
  }

  return strips;
}

/**
 * Process an uploaded image file (single page) and return extracted panels.
 */
export async function extractPanelsFromImage(
  imageBuffer: Buffer,
  userId: number,
  projectId: number,
  pageIndex: number = 0
): Promise<ExtractedPanel[]> {
  const result = await extractPanelsFromPages([imageBuffer], userId, projectId);
  return result.panels.map(p => ({ ...p, sourcePageIndex: pageIndex }));
}
