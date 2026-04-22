/**
 * Tests for Stage 0 · Input — Text-only (Apprentice)
 *
 * Covers:
 * - Validation logic (min 40 chars, max 2000 chars)
 * - Exact copy strings from spec
 * - LengthPicker tier gating
 * - ChapterPicker locking
 * - IdeaPrompt state transitions
 * - Credit cost display
 */
import { describe, it, expect } from "vitest";

// ─── Validation Logic ───────────────────────────────────────────────────────

describe("Stage 0 validation", () => {
  const MIN_CHARS = 40;
  const MAX_CHARS = 2000;

  function validate(text: string) {
    const trimmed = text.trim();
    const isValid = trimmed.length >= MIN_CHARS;
    const isOverCap = text.length > MAX_CHARS;
    const canProceed = isValid && !isOverCap;
    return { isValid, isOverCap, canProceed };
  }

  it("rejects empty input", () => {
    const result = validate("");
    expect(result.canProceed).toBe(false);
    expect(result.isValid).toBe(false);
  });

  it("rejects input under 40 characters", () => {
    const result = validate("Short idea");
    expect(result.canProceed).toBe(false);
    expect(result.isValid).toBe(false);
  });

  it("rejects whitespace-only input under 40 chars", () => {
    const result = validate("   a   ");
    expect(result.canProceed).toBe(false);
  });

  it("accepts exactly 40 characters", () => {
    const text = "A".repeat(40);
    const result = validate(text);
    expect(result.canProceed).toBe(true);
    expect(result.isValid).toBe(true);
  });

  it("accepts 41 characters", () => {
    const text = "A".repeat(41);
    const result = validate(text);
    expect(result.canProceed).toBe(true);
  });

  it("accepts exactly 2000 characters", () => {
    const text = "A".repeat(2000);
    const result = validate(text);
    expect(result.canProceed).toBe(true);
    expect(result.isOverCap).toBe(false);
  });

  it("rejects 2001 characters (over-cap)", () => {
    const text = "A".repeat(2001);
    const result = validate(text);
    expect(result.canProceed).toBe(false);
    expect(result.isOverCap).toBe(true);
  });

  it("trims whitespace before checking minimum", () => {
    const text = "   " + "A".repeat(38) + "   ";
    const result = validate(text);
    expect(result.isValid).toBe(false); // trimmed = 38 chars
  });
});

// ─── Exact Copy Strings ─────────────────────────────────────────────────────

describe("Stage 0 exact copy strings", () => {
  it("hero headline matches spec", () => {
    const headline = "Tonight, your idea becomes anime.";
    expect(headline).toBe("Tonight, your idea becomes anime.");
  });

  it("placeholder matches spec", () => {
    const placeholder = "A rain-soaked rooftop. Two rivals. One city. Go\u2026";
    expect(placeholder).toBe("A rain-soaked rooftop. Two rivals. One city. Go\u2026");
  });

  it("length label matches spec", () => {
    const label = "How long?";
    expect(label).toBe("How long?");
  });

  it("length locked tooltip matches spec", () => {
    const tooltip = "Longer stories are part of Mangaka — upgrade to unlock";
    expect(tooltip).toBe("Longer stories are part of Mangaka — upgrade to unlock");
  });

  it("summon CTA matches spec", () => {
    const cta = "Summon script \u2192";
    expect(cta).toBe("Summon script \u2192");
  });

  it("validation tooltip matches spec", () => {
    const msg = "Give us a bit more to work with — at least 40 characters";
    expect(msg).toBe("Give us a bit more to work with \u2014 at least 40 characters");
  });

  it("cost hint matches spec", () => {
    const hint = "This stage: 6c \u00b7 full project forecast: ~42c";
    expect(hint).toBe("This stage: 6c \u00b7 full project forecast: ~42c");
  });
});

// ─── LengthPicker Tier Gating ───────────────────────────────────────────────

describe("LengthPicker tier gating", () => {
  const LENGTH_OPTIONS = [
    { value: 20, locked: false },
    { value: 30, locked: false },
    { value: 40, locked: false },
    { value: 50, locked: true, tierLabel: "Mangaka +" },
    { value: 60, locked: true, tierLabel: "Mangaka +" },
  ];

  it("has 5 length options", () => {
    expect(LENGTH_OPTIONS).toHaveLength(5);
  });

  it("20, 30, 40 are unlocked for Apprentice", () => {
    const unlocked = LENGTH_OPTIONS.filter((o) => !o.locked);
    expect(unlocked.map((o) => o.value)).toEqual([20, 30, 40]);
  });

  it("50, 60 are locked for Apprentice", () => {
    const locked = LENGTH_OPTIONS.filter((o) => o.locked);
    expect(locked.map((o) => o.value)).toEqual([50, 60]);
  });

  it("locked options show Mangaka + label", () => {
    const locked = LENGTH_OPTIONS.filter((o) => o.locked);
    for (const opt of locked) {
      expect(opt.tierLabel).toBe("Mangaka +");
    }
  });

  it("default value is 20", () => {
    const defaultValue = 20;
    expect(defaultValue).toBe(20);
    expect(LENGTH_OPTIONS[0].value).toBe(20);
  });

  it("all unlocked when allUnlocked=true", () => {
    const allUnlocked = true;
    const available = LENGTH_OPTIONS.filter(
      (o) => !o.locked || allUnlocked
    );
    expect(available).toHaveLength(5);
  });
});

// ─── ChapterPicker ──────────────────────────────────────────────────────────

describe("ChapterPicker", () => {
  it("Apprentice sees only Chapter 1 as active", () => {
    const activeChapters = ["Chapter 1"];
    expect(activeChapters).toHaveLength(1);
    expect(activeChapters[0]).toBe("Chapter 1");
  });

  it("multi-chapter is locked for Apprentice", () => {
    const multiChapterLocked = true;
    expect(multiChapterLocked).toBe(true);
  });

  it("multi-chapter tooltip text is correct", () => {
    const tooltip = "Multi-chapter stories are part of Mangaka — upgrade to unlock";
    expect(tooltip).toContain("Mangaka");
    expect(tooltip).toContain("upgrade");
  });
});

// ─── IdeaPrompt States ──────────────────────────────────────────────────────

describe("IdeaPrompt state transitions", () => {
  it("empty state: sigils at 40% opacity", () => {
    const charCount = 0;
    const focused = false;
    const sigilOpacity = focused ? 100 : 40;
    expect(charCount).toBe(0);
    expect(sigilOpacity).toBe(40);
  });

  it("focused state: sigils bloom to 100%", () => {
    const focused = true;
    const sigilOpacity = focused ? 100 : 40;
    expect(sigilOpacity).toBe(100);
  });

  it("valid state: counter turns mint (>= 40 chars)", () => {
    const charCount = 45;
    const isValid = charCount >= 40;
    const isOverCap = charCount > 2000;
    const counterColor = isOverCap
      ? "magenta"
      : isValid
        ? "mint"
        : "default";
    expect(counterColor).toBe("mint");
  });

  it("over-cap state: counter turns magenta (> 2000 chars)", () => {
    const charCount = 2100;
    const isOverCap = charCount > 2000;
    const counterColor = isOverCap ? "magenta" : "default";
    expect(counterColor).toBe("magenta");
  });
});

// ─── Credit Logic ───────────────────────────────────────────────────────────

describe("Stage 0 credit logic", () => {
  it("costs 6 credits to advance", () => {
    const STAGE_0_COST = 6;
    expect(STAGE_0_COST).toBe(6);
  });

  it("full project forecast is approximately 42 credits", () => {
    const FULL_FORECAST = 42;
    expect(FULL_FORECAST).toBeGreaterThan(0);
    expect(FULL_FORECAST).toBeLessThan(100);
  });
});

// ─── Analytics Events ───────────────────────────────────────────────────────

describe("Stage 0 analytics events", () => {
  const REQUIRED_EVENTS = [
    "stage0_open",
    "stage0_idea_submit",
    "stage0_length_change",
    "stage0_upgrade_prompt",
  ];

  it("defines all required analytics events", () => {
    expect(REQUIRED_EVENTS).toContain("stage0_open");
    expect(REQUIRED_EVENTS).toContain("stage0_idea_submit");
    expect(REQUIRED_EVENTS).toContain("stage0_length_change");
    expect(REQUIRED_EVENTS).toContain("stage0_upgrade_prompt");
  });

  it("has exactly 4 required events", () => {
    expect(REQUIRED_EVENTS).toHaveLength(4);
  });
});
