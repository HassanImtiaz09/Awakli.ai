/**
 * Sprint 2 Tests — Background Asset Library & Targeted Inpainting
 */
import { describe, it, expect, vi } from "vitest";

// ─── Background Library Tests ───────────────────────────────────────────

// Import pure functions for testing
import {
  extractLocationTags,
  jaccardSimilarity,
} from "./background-library";

describe("Background Library — extractLocationTags", () => {
  it("extracts time-of-day tags", () => {
    expect(extractLocationTags("A dark night scene")).toContain("night");
    expect(extractLocationTags("Bright sunny day")).toContain("day");
    expect(extractLocationTags("Beautiful sunrise at dawn")).toContain("dawn");
    expect(extractLocationTags("Sunset over the horizon at dusk")).toContain("dusk");
  });

  it("extracts weather tags", () => {
    expect(extractLocationTags("Heavy rain pouring down")).toContain("rain");
    expect(extractLocationTags("Snow-covered mountain")).toContain("snow");
    expect(extractLocationTags("Foggy morning")).toContain("fog");
    expect(extractLocationTags("Windy cliff edge")).toContain("wind");
  });

  it("extracts location type tags", () => {
    expect(extractLocationTags("Downtown city skyline")).toContain("city");
    expect(extractLocationTags("Deep in the forest")).toContain("forest");
    expect(extractLocationTags("Ocean waves crashing")).toContain("ocean");
    expect(extractLocationTags("Mountain peak summit")).toContain("mountain");
    expect(extractLocationTags("Inside the classroom")).toContain("school");
    expect(extractLocationTags("Inside the classroom")).toContain("interior");
    expect(extractLocationTags("Dark alley street")).toContain("street");
    expect(extractLocationTags("Ancient temple shrine")).toContain("temple");
  });

  it("extracts multiple tags from complex descriptions", () => {
    const tags = extractLocationTags("Rainy night in the city streets");
    expect(tags).toContain("rain");
    expect(tags).toContain("night");
    expect(tags).toContain("city");
    expect(tags).toContain("street");
  });

  it("returns empty array for descriptions with no matching patterns", () => {
    expect(extractLocationTags("Two characters talking")).toEqual([]);
    expect(extractLocationTags("")).toEqual([]);
  });

  it("deduplicates tags", () => {
    const tags = extractLocationTags("night dark midnight");
    const nightCount = tags.filter(t => t === "night").length;
    expect(nightCount).toBe(1);
  });
});

describe("Background Library — jaccardSimilarity", () => {
  it("returns 1.0 for identical sets", () => {
    expect(jaccardSimilarity(["a", "b", "c"], ["a", "b", "c"])).toBe(1);
  });

  it("returns 0 for completely disjoint sets", () => {
    expect(jaccardSimilarity(["a", "b"], ["c", "d"])).toBe(0);
  });

  it("returns correct similarity for partial overlap", () => {
    // Intersection: {a, b} = 2, Union: {a, b, c, d} = 4 → 0.5
    expect(jaccardSimilarity(["a", "b", "c"], ["a", "b", "d"])).toBeCloseTo(0.5, 1);
  });

  it("handles empty arrays", () => {
    expect(jaccardSimilarity([], [])).toBe(0);
    expect(jaccardSimilarity(["a"], [])).toBe(0);
    expect(jaccardSimilarity([], ["a"])).toBe(0);
  });

  it("is case-insensitive", () => {
    expect(jaccardSimilarity(["Night", "City"], ["night", "city"])).toBe(1);
  });

  it("handles duplicates in input", () => {
    // Duplicates should be treated as a single element
    const sim = jaccardSimilarity(["a", "a", "b"], ["a", "b"]);
    expect(sim).toBe(1);
  });
});

// ─── Targeted Inpainting Tests ──────────────────────────────────────────

import {
  validateMask,
  buildInpaintPrompt,
  getMaskBoundingBox,
  getMaskAreaPercent,
  estimateInpaintCost,
  calculatePolygonArea,
  INPAINT_CREDIT_COST,
  type InpaintMask,
  type InpaintRequest,
} from "./targeted-inpainting";

describe("Targeted Inpainting — validateMask", () => {
  it("accepts valid rectangle mask", () => {
    const mask: InpaintMask = {
      type: "rectangle",
      boundingBox: { x: 0.1, y: 0.1, width: 0.3, height: 0.3 },
    };
    expect(validateMask(mask)).toBeNull();
  });

  it("rejects rectangle without bounding box", () => {
    const mask: InpaintMask = { type: "rectangle" };
    expect(validateMask(mask)).toBe("Bounding box required for rectangle mask");
  });

  it("rejects out-of-bounds rectangle", () => {
    const mask: InpaintMask = {
      type: "rectangle",
      boundingBox: { x: 0.8, y: 0.1, width: 0.5, height: 0.3 },
    };
    expect(validateMask(mask)).toContain("extends beyond");
  });

  it("rejects too-large rectangle mask", () => {
    const mask: InpaintMask = {
      type: "rectangle",
      boundingBox: { x: 0, y: 0, width: 0.9, height: 0.9 },
    };
    expect(validateMask(mask)).toContain("exceeds maximum");
  });

  it("rejects too-small rectangle mask", () => {
    const mask: InpaintMask = {
      type: "rectangle",
      boundingBox: { x: 0.5, y: 0.5, width: 0.005, height: 0.005 },
    };
    expect(validateMask(mask)).toContain("below minimum");
  });

  it("accepts valid polygon mask", () => {
    const mask: InpaintMask = {
      type: "polygon",
      points: [
        { x: 0.2, y: 0.2 },
        { x: 0.5, y: 0.2 },
        { x: 0.5, y: 0.5 },
        { x: 0.2, y: 0.5 },
      ],
    };
    expect(validateMask(mask)).toBeNull();
  });

  it("rejects polygon with fewer than 3 points", () => {
    const mask: InpaintMask = {
      type: "polygon",
      points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }],
    };
    expect(validateMask(mask)).toContain("at least 3 points");
  });

  it("rejects polygon with out-of-bounds points", () => {
    const mask: InpaintMask = {
      type: "polygon",
      points: [
        { x: -0.1, y: 0.2 },
        { x: 0.5, y: 0.2 },
        { x: 0.5, y: 0.5 },
      ],
    };
    expect(validateMask(mask)).toContain("coordinates must be 0-1");
  });

  it("rejects unknown mask type", () => {
    const mask = { type: "circle" } as any;
    expect(validateMask(mask)).toContain("Unknown mask type");
  });
});

describe("Targeted Inpainting — buildInpaintPrompt", () => {
  it("uses promptOverride when provided", () => {
    const req: InpaintRequest = {
      originalImageUrl: "https://example.com/img.png",
      mimeType: "image/png",
      mask: { type: "rectangle", boundingBox: { x: 0, y: 0, width: 0.5, height: 0.5 } },
      promptOverride: "Fix the character's eyes",
      styleTag: "shonen",
    };
    const prompt = buildInpaintPrompt(req);
    expect(prompt).toContain("Fix the character's eyes");
    expect(prompt).toContain("shonen anime style");
  });

  it("falls back to original prompt when no override", () => {
    const req: InpaintRequest = {
      originalImageUrl: "https://example.com/img.png",
      mimeType: "image/png",
      mask: { type: "rectangle", boundingBox: { x: 0, y: 0, width: 0.5, height: 0.5 } },
      originalPrompt: "anime character in a forest",
    };
    const prompt = buildInpaintPrompt(req);
    expect(prompt).toContain("anime character in a forest");
    expect(prompt).toContain("seamless inpainting");
  });

  it("provides default prompt when neither override nor original", () => {
    const req: InpaintRequest = {
      originalImageUrl: "https://example.com/img.png",
      mimeType: "image/png",
      mask: { type: "rectangle", boundingBox: { x: 0, y: 0, width: 0.5, height: 0.5 } },
    };
    const prompt = buildInpaintPrompt(req);
    expect(prompt).toContain("anime illustration");
  });
});

describe("Targeted Inpainting — getMaskBoundingBox", () => {
  it("returns bounding box for rectangle mask", () => {
    const mask: InpaintMask = {
      type: "rectangle",
      boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
    };
    const bb = getMaskBoundingBox(mask);
    expect(bb).toEqual({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
  });

  it("calculates bounding box for polygon mask", () => {
    const mask: InpaintMask = {
      type: "polygon",
      points: [
        { x: 0.1, y: 0.2 },
        { x: 0.6, y: 0.3 },
        { x: 0.4, y: 0.8 },
      ],
    };
    const bb = getMaskBoundingBox(mask);
    expect(bb.x).toBeCloseTo(0.1);
    expect(bb.y).toBeCloseTo(0.2);
    expect(bb.width).toBeCloseTo(0.5);
    expect(bb.height).toBeCloseTo(0.6);
  });

  it("returns full image for empty mask", () => {
    const mask: InpaintMask = { type: "polygon" };
    const bb = getMaskBoundingBox(mask);
    expect(bb).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });
});

describe("Targeted Inpainting — calculatePolygonArea", () => {
  it("calculates area of a unit square", () => {
    const area = calculatePolygonArea([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ]);
    expect(area).toBeCloseTo(1.0);
  });

  it("calculates area of a triangle", () => {
    const area = calculatePolygonArea([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0.5, y: 1 },
    ]);
    expect(area).toBeCloseTo(0.5);
  });

  it("calculates area of a small rectangle", () => {
    const area = calculatePolygonArea([
      { x: 0.2, y: 0.2 },
      { x: 0.5, y: 0.2 },
      { x: 0.5, y: 0.5 },
      { x: 0.2, y: 0.5 },
    ]);
    expect(area).toBeCloseTo(0.09);
  });
});

describe("Targeted Inpainting — estimateInpaintCost", () => {
  it("returns base cost for small masks", () => {
    const mask: InpaintMask = {
      type: "rectangle",
      boundingBox: { x: 0.4, y: 0.4, width: 0.1, height: 0.1 },
    };
    const cost = estimateInpaintCost(mask);
    expect(cost).toBeGreaterThanOrEqual(INPAINT_CREDIT_COST);
    expect(cost).toBeLessThan(1.0);
  });

  it("returns higher cost for larger masks", () => {
    const smallMask: InpaintMask = {
      type: "rectangle",
      boundingBox: { x: 0.4, y: 0.4, width: 0.1, height: 0.1 },
    };
    const largeMask: InpaintMask = {
      type: "rectangle",
      boundingBox: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
    };
    expect(estimateInpaintCost(largeMask)).toBeGreaterThan(estimateInpaintCost(smallMask));
  });

  it("returns 0 for empty mask", () => {
    const mask: InpaintMask = { type: "polygon" };
    expect(estimateInpaintCost(mask)).toBe(INPAINT_CREDIT_COST);
  });
});

describe("Targeted Inpainting — getMaskAreaPercent", () => {
  it("calculates rectangle area percentage", () => {
    const mask: InpaintMask = {
      type: "rectangle",
      boundingBox: { x: 0, y: 0, width: 0.5, height: 0.5 },
    };
    expect(getMaskAreaPercent(mask)).toBeCloseTo(25);
  });

  it("calculates polygon area percentage", () => {
    const mask: InpaintMask = {
      type: "polygon",
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
    };
    expect(getMaskAreaPercent(mask)).toBeCloseTo(100);
  });
});
