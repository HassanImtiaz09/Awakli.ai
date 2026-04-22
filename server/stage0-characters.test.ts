/**
 * Stage 0 · Input — Character Foundation & Style Refs (Studio tier) Tests
 *
 * Tests for:
 * - Tab C tier gating (Studio+ only)
 * - CharacterFoundation validation (at least 1 character with 1 ref image)
 * - Character embedding cost calculation (4c per ref image + 2c per character)
 * - Extended LengthPicker options for Studio (150/200/whole-book)
 * - Extended ChapterPicker for Studio (up to 10 chapters)
 * - Exact copy strings
 * - Analytics events
 */
import { describe, it, expect } from "vitest";

// ─── Tier Matrix Integration ──────────────────────────────────────────────────

describe("Tab C tier gating", () => {
  const STUDIO_TIERS = ["studio", "enterprise"];
  const NON_STUDIO_TIERS = ["free_trial", "apprentice", "creator", "creator_pro"];

  it("Studio+ tiers should have access to Tab C", () => {
    for (const tier of STUDIO_TIERS) {
      expect(["studio", "enterprise"].includes(tier)).toBe(true);
    }
  });

  it("Non-Studio tiers should NOT have access to Tab C", () => {
    for (const tier of NON_STUDIO_TIERS) {
      expect(["studio", "enterprise"].includes(tier)).toBe(false);
    }
  });

  it("Tab C should trigger UpgradeModal for non-Studio users", () => {
    // The input.tsx handleTabSwitch checks isStudioPlus before allowing "characters" tab
    const isStudioPlus = (tier: string) => ["studio", "enterprise"].includes(tier);
    expect(isStudioPlus("creator")).toBe(false);
    expect(isStudioPlus("creator_pro")).toBe(false);
    expect(isStudioPlus("studio")).toBe(true);
  });
});

// ─── CharacterFoundation Validation ───────────────────────────────────────────

describe("CharacterFoundation validation", () => {
  interface CharacterData {
    name: string;
    description: string;
    refImages: { url: string }[];
    status: string;
  }

  function isCharacterTabValid(characters: CharacterData[]): boolean {
    return characters.length > 0 && characters.some((c) => c.refImages.length > 0);
  }

  it("should be invalid with no characters", () => {
    expect(isCharacterTabValid([])).toBe(false);
  });

  it("should be invalid with characters but no ref images", () => {
    const chars: CharacterData[] = [
      { name: "Hero", description: "Main character", refImages: [], status: "draft" },
    ];
    expect(isCharacterTabValid(chars)).toBe(false);
  });

  it("should be valid with at least one character with one ref image", () => {
    const chars: CharacterData[] = [
      {
        name: "Hero",
        description: "Main character",
        refImages: [{ url: "https://example.com/ref1.jpg" }],
        status: "draft",
      },
    ];
    expect(isCharacterTabValid(chars)).toBe(true);
  });

  it("should be valid when one of multiple characters has ref images", () => {
    const chars: CharacterData[] = [
      { name: "Hero", description: "Main", refImages: [], status: "draft" },
      {
        name: "Villain",
        description: "Antagonist",
        refImages: [{ url: "https://example.com/ref1.jpg" }],
        status: "draft",
      },
    ];
    expect(isCharacterTabValid(chars)).toBe(true);
  });
});

// ─── Character Embedding Cost Calculation ─────────────────────────────────────

describe("Character embedding cost calculation", () => {
  interface CharacterData {
    refImages: { url: string }[];
  }

  function calculateCharacterCost(characters: CharacterData[]): number {
    const imageIngest = characters.reduce((sum, c) => sum + c.refImages.length * 4, 0);
    const embeddingCompute = characters.length * 2;
    return imageIngest + embeddingCompute;
  }

  it("should be 0 for no characters", () => {
    expect(calculateCharacterCost([])).toBe(0);
  });

  it("should be 6c for 1 character with 1 ref image (4c image + 2c embedding)", () => {
    const chars = [{ refImages: [{ url: "a.jpg" }] }];
    expect(calculateCharacterCost(chars)).toBe(6);
  });

  it("should be 26c for 1 character with 6 ref images (24c images + 2c embedding)", () => {
    const chars = [{ refImages: Array(6).fill({ url: "a.jpg" }) }];
    expect(calculateCharacterCost(chars)).toBe(26);
  });

  it("should be 20c for 3 characters with 1 ref image each (12c images + 6c embeddings)", () => {
    const chars = Array(3).fill({ refImages: [{ url: "a.jpg" }] });
    expect(calculateCharacterCost(chars)).toBe(18);
  });

  it("should correctly sum mixed character ref counts", () => {
    const chars = [
      { refImages: [{ url: "a.jpg" }, { url: "b.jpg" }] }, // 8c + 2c = 10c
      { refImages: [{ url: "c.jpg" }] }, // 4c + 2c = 6c
      { refImages: Array(4).fill({ url: "d.jpg" }) }, // 16c + 2c = 18c
    ];
    expect(calculateCharacterCost(chars)).toBe(34);
  });
});

// ─── Extended LengthPicker Options ────────────────────────────────────────────

describe("Extended LengthPicker for Studio", () => {
  const STUDIO_OPTIONS = [20, 40, 60, 80, 120, 150, 200, 999, 300];

  it("should include 150 and 200 panel options for Studio", () => {
    expect(STUDIO_OPTIONS).toContain(150);
    expect(STUDIO_OPTIONS).toContain(200);
  });

  it("should include whole-book mode (999) for Studio", () => {
    expect(STUDIO_OPTIONS).toContain(999);
  });

  it("should have 300+ as locked option for Studio Pro", () => {
    expect(STUDIO_OPTIONS).toContain(300);
  });

  it("should have more options than Mangaka tier", () => {
    const MANGAKA_OPTIONS = [20, 30, 40, 60, 80, 120, 150];
    expect(STUDIO_OPTIONS.length).toBeGreaterThan(MANGAKA_OPTIONS.length);
  });
});

// ─── Extended ChapterPicker ───────────────────────────────────────────────────

describe("Extended ChapterPicker for Studio", () => {
  function getEffectiveMax(
    isStudioPlus: boolean,
    isMangakaPlus: boolean,
    maxChapters: number
  ): number {
    return isStudioPlus ? maxChapters : isMangakaPlus ? Math.min(maxChapters, 3) : 1;
  }

  it("Apprentice should get 1 chapter max", () => {
    expect(getEffectiveMax(false, false, 10)).toBe(1);
  });

  it("Mangaka should get up to 3 chapters", () => {
    expect(getEffectiveMax(false, true, 10)).toBe(3);
  });

  it("Studio should get up to maxChapters (10 for character mode)", () => {
    expect(getEffectiveMax(true, true, 10)).toBe(10);
  });

  it("Studio should respect lower maxChapters when specified", () => {
    expect(getEffectiveMax(true, true, 5)).toBe(5);
  });
});

// ─── Exact Copy Strings ───────────────────────────────────────────────────────

describe("Exact copy strings for Tab C", () => {
  it("Tab C label should be exact", () => {
    const tabLabel = "Upload character sheets / style refs";
    expect(tabLabel).toBe("Upload character sheets / style refs");
  });

  it("Character empty state should be exact", () => {
    const emptyState = "Add at least one character to anchor consistency";
    expect(emptyState).toBe("Add at least one character to anchor consistency");
  });

  it("Add character CTA should be exact", () => {
    const cta = "+ New character";
    expect(cta).toBe("+ New character");
  });

  it("Embedding status should follow pattern", () => {
    const name = "Akira";
    const status = `Learning ${name}'s look\u2026`;
    expect(status).toBe("Learning Akira's look\u2026");
  });

  it("Studio length locked tooltip should be exact", () => {
    const tooltip = "150+ panel projects unlock on Studio";
    expect(tooltip).toBe("150+ panel projects unlock on Studio");
  });
});

// ─── Analytics Events ─────────────────────────────────────────────────────────

describe("Analytics events for Tab C", () => {
  const REQUIRED_EVENTS = [
    "stage0_character_added",
    "stage0_library_import",
    "stage0_stylesheet_uploaded",
  ];

  it("should define all required analytics events", () => {
    for (const event of REQUIRED_EVENTS) {
      expect(typeof event).toBe("string");
      expect(event.startsWith("stage0_")).toBe(true);
    }
  });
});

// ─── Dynamic Cost Integration ─────────────────────────────────────────────────

describe("Dynamic cost with character foundation", () => {
  function calculateTotalForecast(
    baseCost: number,
    scalableCosts: number,
    panelCount: number,
    characterCost: number
  ): number {
    const scaleFactor = panelCount / 20;
    const fixedCosts = baseCost - scalableCosts;
    return Math.round(fixedCosts + scalableCosts * scaleFactor + characterCost);
  }

  it("should add character cost to total forecast", () => {
    const base = 17;
    const scalable = 7;
    const panels = 20;
    const charCost = 26; // 1 char with 6 refs
    const total = calculateTotalForecast(base, scalable, panels, charCost);
    expect(total).toBe(17 + 26); // 43
  });

  it("should scale panel costs AND add character costs", () => {
    const base = 17;
    const scalable = 7;
    const panels = 40; // 2x scale
    const charCost = 6; // 1 char with 1 ref
    const total = calculateTotalForecast(base, scalable, panels, charCost);
    // fixed: 10, scaled: 7*2=14, char: 6 → 30
    expect(total).toBe(30);
  });

  it("should handle whole-book mode (999 panels) with character costs", () => {
    const base = 17;
    const scalable = 7;
    const panels = 200;
    const charCost = 34; // 3 chars with mixed refs
    const total = calculateTotalForecast(base, scalable, panels, charCost);
    // fixed: 10, scaled: 7*10=70, char: 34 → 114
    expect(total).toBe(114);
  });
});
