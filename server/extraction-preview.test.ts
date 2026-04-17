/**
 * Tests for the Extraction Preview feature (Prompt 21 extension)
 * Covers: previewExtraction, getOverallQuality, bounding boxes, confidence scoring, warnings
 */
import { describe, it, expect } from "vitest";
import {
  previewExtraction,
  getOverallQuality,
  extractReferenceImages,
  cropToCharacter,
  resizeTo512,
  autoCaptionImage,
  buildTriggerWord,
  preprocessCharacterSheet,
  EXTRACTION_CONFIDENCE_THRESHOLDS,
} from "./lora-training-pipeline";

// ─── previewExtraction ──────────────────────────────────────────────────

describe("previewExtraction", () => {
  const sheetUrl = "https://cdn.example.com/chars/sakura_sheet.png";
  const charName = "Sakura Haruno";

  it("returns all 5 default views", () => {
    const result = previewExtraction(sheetUrl, charName);
    expect(result.views).toHaveLength(5);
    const angles = result.views.map(v => v.viewAngle);
    expect(angles).toEqual(["front", "side", "back", "three_quarter", "expression"]);
  });

  it("returns correct character name and trigger word", () => {
    const result = previewExtraction(sheetUrl, charName);
    expect(result.characterName).toBe(charName);
    expect(result.triggerWord).toBe("awakli_sakura_haruno");
    expect(result.referenceSheetUrl).toBe(sheetUrl);
  });

  it("each view has a valid bounding box (0-1 range)", () => {
    const result = previewExtraction(sheetUrl, charName);
    for (const view of result.views) {
      expect(view.boundingBox.x).toBeGreaterThanOrEqual(0);
      expect(view.boundingBox.x).toBeLessThanOrEqual(1);
      expect(view.boundingBox.y).toBeGreaterThanOrEqual(0);
      expect(view.boundingBox.y).toBeLessThanOrEqual(1);
      expect(view.boundingBox.width).toBeGreaterThan(0);
      expect(view.boundingBox.width).toBeLessThanOrEqual(1);
      expect(view.boundingBox.height).toBeGreaterThan(0);
      expect(view.boundingBox.height).toBeLessThanOrEqual(1);
      // Bounding box should not exceed image bounds
      expect(view.boundingBox.x + view.boundingBox.width).toBeLessThanOrEqual(1.001);
      expect(view.boundingBox.y + view.boundingBox.height).toBeLessThanOrEqual(1.001);
    }
  });

  it("each view has a confidence between 0 and 1", () => {
    const result = previewExtraction(sheetUrl, charName);
    for (const view of result.views) {
      expect(view.confidence).toBeGreaterThanOrEqual(0);
      expect(view.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("each view has a human-readable label", () => {
    const result = previewExtraction(sheetUrl, charName);
    const labels = result.views.map(v => v.label);
    expect(labels).toContain("Front View");
    expect(labels).toContain("Side View");
    expect(labels).toContain("Back View");
    expect(labels).toContain("3/4 View");
    expect(labels).toContain("Expression Sheet");
  });

  it("each view has a cropped URL derived from the reference sheet", () => {
    const result = previewExtraction(sheetUrl, charName);
    for (const view of result.views) {
      expect(view.croppedUrl).toContain("sakura_sheet");
      expect(view.croppedUrl).toContain(view.viewAngle);
      expect(view.croppedUrl).toContain("_cropped_512.png");
    }
  });

  it("computes overall confidence as average of view confidences", () => {
    const result = previewExtraction(sheetUrl, charName);
    const manualAvg = result.views.reduce((s, v) => s + v.confidence, 0) / result.views.length;
    expect(result.overallConfidence).toBeCloseTo(manualAvg, 10);
  });

  it("assigns an overall quality rating based on confidence", () => {
    const result = previewExtraction(sheetUrl, charName);
    expect(["excellent", "good", "fair", "poor"]).toContain(result.overallQuality);
  });

  it("supports custom view angles subset", () => {
    const result = previewExtraction(sheetUrl, charName, ["front", "side"]);
    expect(result.views).toHaveLength(2);
    expect(result.views[0].viewAngle).toBe("front");
    expect(result.views[1].viewAngle).toBe("side");
  });

  it("returns warnings array (may be empty)", () => {
    const result = previewExtraction(sheetUrl, charName);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it("warns when fewer than 3 views are requested", () => {
    const result = previewExtraction(sheetUrl, charName, ["front"]);
    expect(result.warnings.some(w => w.includes("Only 1 views detected"))).toBe(true);
  });

  it("produces deterministic results for the same inputs", () => {
    const r1 = previewExtraction(sheetUrl, charName);
    const r2 = previewExtraction(sheetUrl, charName);
    expect(r1.overallConfidence).toBe(r2.overallConfidence);
    expect(r1.views.map(v => v.confidence)).toEqual(r2.views.map(v => v.confidence));
  });

  it("produces different confidences for different character names", () => {
    const r1 = previewExtraction(sheetUrl, "Sakura");
    const r2 = previewExtraction(sheetUrl, "Naruto Uzumaki");
    // At least some view confidences should differ due to seed variation
    const c1 = r1.views.map(v => v.confidence);
    const c2 = r2.views.map(v => v.confidence);
    const allSame = c1.every((c, i) => c === c2[i]);
    expect(allSame).toBe(false);
  });

  it("bounding boxes do not overlap (views are side by side)", () => {
    const result = previewExtraction(sheetUrl, charName);
    const sorted = [...result.views].sort((a, b) => a.boundingBox.x - b.boundingBox.x);
    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i];
      const next = sorted[i + 1];
      const currentRight = current.boundingBox.x + current.boundingBox.width;
      expect(currentRight).toBeLessThanOrEqual(next.boundingBox.x + 0.01);
    }
  });
});

// ─── getOverallQuality ──────────────────────────────────────────────────

describe("getOverallQuality", () => {
  it("returns 'excellent' for confidence >= 0.92", () => {
    expect(getOverallQuality(0.92)).toBe("excellent");
    expect(getOverallQuality(0.99)).toBe("excellent");
    expect(getOverallQuality(1.0)).toBe("excellent");
  });

  it("returns 'good' for confidence >= 0.80 and < 0.92", () => {
    expect(getOverallQuality(0.80)).toBe("good");
    expect(getOverallQuality(0.85)).toBe("good");
    expect(getOverallQuality(0.919)).toBe("good");
  });

  it("returns 'fair' for confidence >= 0.65 and < 0.80", () => {
    expect(getOverallQuality(0.65)).toBe("fair");
    expect(getOverallQuality(0.70)).toBe("fair");
    expect(getOverallQuality(0.799)).toBe("fair");
  });

  it("returns 'poor' for confidence < 0.65", () => {
    expect(getOverallQuality(0.64)).toBe("poor");
    expect(getOverallQuality(0.50)).toBe("poor");
    expect(getOverallQuality(0.0)).toBe("poor");
  });

  it("threshold constants are consistent", () => {
    expect(EXTRACTION_CONFIDENCE_THRESHOLDS.excellent).toBe(0.92);
    expect(EXTRACTION_CONFIDENCE_THRESHOLDS.good).toBe(0.80);
    expect(EXTRACTION_CONFIDENCE_THRESHOLDS.fair).toBe(0.65);
  });
});

// ─── Quality warnings ───────────────────────────────────────────────────

describe("quality warnings", () => {
  it("views with low confidence get quality warnings", () => {
    // Use a single view to isolate
    const result = previewExtraction("https://cdn.example.com/test.png", "X", ["expression"]);
    const exprView = result.views[0];
    // Expression views tend to have lower base confidence
    // The warning field should be non-null for low confidence or null for high
    if (exprView.confidence < 0.85) {
      expect(exprView.qualityWarning).not.toBeNull();
    }
  });

  it("front view typically has highest confidence", () => {
    const result = previewExtraction("https://cdn.example.com/test.png", "TestChar");
    const frontView = result.views.find(v => v.viewAngle === "front")!;
    const otherViews = result.views.filter(v => v.viewAngle !== "front");
    // Front should be >= most others (it has the highest base difficulty)
    const higherCount = otherViews.filter(v => v.confidence > frontView.confidence).length;
    expect(higherCount).toBeLessThanOrEqual(1); // At most 1 other view might be higher due to variation
  });

  it("qualityWarning is null for high-confidence views", () => {
    const result = previewExtraction("https://cdn.example.com/test.png", "TestChar");
    const highConfViews = result.views.filter(v => v.confidence >= 0.85);
    for (const view of highConfViews) {
      // High confidence views for front/side/three_quarter should have no warning
      if (view.viewAngle !== "back" && view.viewAngle !== "expression") {
        expect(view.qualityWarning).toBeNull();
      }
    }
  });
});

// ─── Integration with preprocessing pipeline ────────────────────────────

describe("extraction preview integrates with preprocessing", () => {
  const sheetUrl = "https://cdn.example.com/chars/naruto.png";
  const charName = "Naruto Uzumaki";

  it("preview view angles match preprocessing view angles", () => {
    const preview = previewExtraction(sheetUrl, charName);
    const processed = preprocessCharacterSheet(sheetUrl, charName);
    
    const previewAngles = preview.views.map(v => v.viewAngle);
    const processedAngles = processed.images.map(img => img.viewAngle);
    expect(previewAngles).toEqual(processedAngles);
  });

  it("preview trigger word matches preprocessing trigger word", () => {
    const preview = previewExtraction(sheetUrl, charName);
    const processed = preprocessCharacterSheet(sheetUrl, charName);
    expect(preview.triggerWord).toBe(processed.triggerWord);
  });

  it("preview view count matches preprocessing image count", () => {
    const preview = previewExtraction(sheetUrl, charName);
    const processed = preprocessCharacterSheet(sheetUrl, charName);
    expect(preview.views.length).toBe(processed.totalImages);
  });

  it("custom view angles are respected in both preview and preprocessing", () => {
    const angles: ("front" | "side" | "back")[] = ["front", "side", "back"];
    const preview = previewExtraction(sheetUrl, charName, angles);
    const processed = preprocessCharacterSheet(sheetUrl, charName, {}, angles);
    expect(preview.views.length).toBe(3);
    expect(processed.totalImages).toBe(3);
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────

describe("extraction preview edge cases", () => {
  it("handles single-character names", () => {
    const result = previewExtraction("https://cdn.example.com/a.png", "A");
    expect(result.triggerWord).toBe("awakli_a");
    expect(result.views).toHaveLength(5);
  });

  it("handles names with special characters", () => {
    const result = previewExtraction("https://cdn.example.com/test.png", "L'Arc-en-Ciel");
    expect(result.triggerWord).toBe("awakli_l_arc_en_ciel");
  });

  it("handles very long names", () => {
    const longName = "A".repeat(100);
    const result = previewExtraction("https://cdn.example.com/test.png", longName);
    expect(result.views).toHaveLength(5);
    expect(result.overallConfidence).toBeGreaterThan(0);
  });

  it("handles empty view angles array", () => {
    const result = previewExtraction("https://cdn.example.com/test.png", "Test", []);
    expect(result.views).toHaveLength(0);
    expect(result.overallConfidence).toBe(0);
    expect(result.overallQuality).toBe("poor");
  });

  it("handles URL with no extension", () => {
    const result = previewExtraction("https://cdn.example.com/chars/test", "Test");
    expect(result.views).toHaveLength(5);
    // Cropped URLs should still be generated
    for (const view of result.views) {
      expect(view.croppedUrl).toBeTruthy();
    }
  });
});
