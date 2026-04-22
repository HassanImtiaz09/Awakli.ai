/**
 * Stage 6 · Video — Short-form Render (Mangaka) — vitest tests
 *
 * Covers: PanelTimingEditor logic, DurationForecast credit formula,
 * RenderReview copy strings, VIDEO_COPY exact strings, tier limits.
 */
import { describe, it, expect } from "vitest";

// ─── PanelTimingEditor constants ────────────────────────────────────
import {
  TIMING_LIMITS,
  TIMING_COPY,
  BULK_PRESETS,
} from "../client/src/components/awakli/PanelTimingEditor";

// ─── DurationForecast credit formula + constants ────────────────────
import {
  VIDEO_CREDITS,
  MANGAKA_LIMITS,
  FORECAST_COPY,
  calculateCredits,
} from "../client/src/components/awakli/DurationForecast";

// ─── RenderReview copy ──────────────────────────────────────────────
import { REVIEW_COPY } from "../client/src/components/awakli/RenderReview";

// ─── Video page copy ────────────────────────────────────────────────
import { VIDEO_COPY } from "../client/src/pages/create/video";

import type { PanelTiming } from "../client/src/components/awakli/PanelTimingEditor";

// ─── Helpers ────────────────────────────────────────────────────────
function makePanels(count: number, duration?: number): PanelTiming[] {
  return Array.from({ length: count }, (_, i) => ({
    panelIndex: i,
    imageUrl: null,
    duration: duration ?? TIMING_LIMITS.defaultPerPanel,
  }));
}

// =====================================================================
// PanelTimingEditor — limits & presets
// =====================================================================
describe("PanelTimingEditor — TIMING_LIMITS", () => {
  it("default per-panel is 2s", () => {
    expect(TIMING_LIMITS.defaultPerPanel).toBe(2);
  });

  it("min per-panel is 1s", () => {
    expect(TIMING_LIMITS.minPerPanel).toBe(1);
  });

  it("max per-panel is 8s", () => {
    expect(TIMING_LIMITS.maxPerPanel).toBe(8);
  });

  it("has expected keys", () => {
    expect(TIMING_LIMITS.minPerPanel).toBeDefined();
    expect(TIMING_LIMITS.maxPerPanel).toBeDefined();
    expect(TIMING_LIMITS.defaultPerPanel).toBeDefined();
  });
});

describe("PanelTimingEditor — BULK_PRESETS", () => {
  it("has at least 3 presets", () => {
    expect(BULK_PRESETS.length).toBeGreaterThanOrEqual(3);
  });

  it("each preset has label and value within limits", () => {
    for (const preset of BULK_PRESETS) {
      expect(preset.label).toBeTruthy();
      expect(preset.value).toBeGreaterThanOrEqual(TIMING_LIMITS.minPerPanel);
      expect(preset.value).toBeLessThanOrEqual(TIMING_LIMITS.maxPerPanel);
    }
  });
});

describe("PanelTimingEditor — TIMING_COPY", () => {
  it("has preset labels", () => {
    expect(TIMING_COPY.presetFast).toBeTruthy();
    expect(TIMING_COPY.presetNormal).toBeTruthy();
    expect(TIMING_COPY.presetCinematic).toBeTruthy();
  });
});

// =====================================================================
// DurationForecast — credit formula
// =====================================================================
describe("DurationForecast — VIDEO_CREDITS", () => {
  it("perPanelMotion is 12", () => {
    expect(VIDEO_CREDITS.perPanelMotion).toBe(12);
  });

  it("perSecondVoice is 4", () => {
    expect(VIDEO_CREDITS.perSecondVoice).toBe(4);
  });

  it("compose is 6", () => {
    expect(VIDEO_CREDITS.compose).toBe(6);
  });

  it("redoPanel is 18", () => {
    expect(VIDEO_CREDITS.redoPanel).toBe(18);
  });
});

describe("DurationForecast — MANGAKA_LIMITS", () => {
  it("maxRuntime is 60s", () => {
    expect(MANGAKA_LIMITS.maxRuntime).toBe(60);
  });

  it("maxResolution is 1080p", () => {
    expect(MANGAKA_LIMITS.maxResolution).toBe("1080p");
  });

  it("maxRendersPerEpisodePerMonth is 3", () => {
    expect(MANGAKA_LIMITS.maxRendersPerEpisodePerMonth).toBe(3);
  });
});

describe("DurationForecast — calculateCredits", () => {
  it("calculates correctly for 10 panels at 3s each", () => {
    const panels = makePanels(10, 3);
    const result = calculateCredits(panels);
    expect(result.motionCredits).toBe(120); // 10 × 12
    expect(result.voiceCredits).toBe(120);  // ceil(30) × 4
    expect(result.composeCredits).toBe(6);
    expect(result.totalCredits).toBe(246);  // 120 + 120 + 6
    expect(result.totalRuntime).toBe(30);
  });

  it("calculates correctly for 1 panel at 1s", () => {
    const panels = makePanels(1, 1);
    const result = calculateCredits(panels);
    expect(result.motionCredits).toBe(12);
    expect(result.voiceCredits).toBe(4);
    expect(result.composeCredits).toBe(6);
    expect(result.totalCredits).toBe(22);
    expect(result.totalRuntime).toBe(1);
  });

  it("calculates correctly for 20 panels at 3s (max Mangaka runtime)", () => {
    const panels = makePanels(20, 3);
    const result = calculateCredits(panels);
    expect(result.totalRuntime).toBe(60);
    expect(result.motionCredits).toBe(240); // 20 × 12
    expect(result.voiceCredits).toBe(240);  // ceil(60) × 4
    expect(result.totalCredits).toBe(486);  // 240 + 240 + 6
  });

  it("handles fractional durations with ceil for voice", () => {
    const panels = makePanels(3, 2.5);
    const result = calculateCredits(panels);
    // Runtime: 7.5s
    expect(result.totalRuntime).toBe(7.5);
    // Voice: ceil(7.5) × 4 = 32
    expect(result.voiceCredits).toBe(32);
  });

  it("empty panels array returns compose-only cost", () => {
    const result = calculateCredits([]);
    expect(result.motionCredits).toBe(0);
    expect(result.voiceCredits).toBe(0);
    expect(result.composeCredits).toBe(6);
    expect(result.totalCredits).toBe(6);
    expect(result.totalRuntime).toBe(0);
  });

  it("over-budget detection: 21 panels × 3s = 63s > 60s", () => {
    const panels = makePanels(21, 3);
    const result = calculateCredits(panels);
    expect(result.totalRuntime).toBe(63);
    expect(result.totalRuntime).toBeGreaterThan(MANGAKA_LIMITS.maxRuntime);
  });
});

describe("DurationForecast — FORECAST_COPY", () => {
  it("renderCta formats correctly", () => {
    const cta = FORECAST_COPY.renderCta(30, 246);
    expect(cta).toContain("30s");
    expect(cta).toContain("246");
    expect(cta).toContain("credits");
    expect(cta).toContain("Render");
  });

  it("overBudget message mentions 60s and upgrade", () => {
    expect(FORECAST_COPY.overBudget).toBe(
      "Mangaka caps at 60s — trim or upgrade"
    );
  });

  it("rendersRemaining formats singular correctly", () => {
    expect(FORECAST_COPY.rendersRemaining(1)).toBe("1 render remaining this month");
  });

  it("rendersRemaining formats plural correctly", () => {
    expect(FORECAST_COPY.rendersRemaining(3)).toBe("3 renders remaining this month");
  });
});

// =====================================================================
// RenderReview — copy strings
// =====================================================================
describe("RenderReview — REVIEW_COPY", () => {
  it("approve is exact spec string", () => {
    expect(REVIEW_COPY.approve).toBe("Approve & download");
  });

  it("redo is exact spec string", () => {
    expect(REVIEW_COPY.redo).toBe("Redo a panel");
  });

  it("redoCost is 18", () => {
    expect(REVIEW_COPY.redoCost).toBe(18);
  });

  it("redoCta is exact spec string", () => {
    expect(REVIEW_COPY.redoCta).toBe("Redo · 18 credits");
  });

  it("selectPanel is exact spec string", () => {
    expect(REVIEW_COPY.selectPanel).toBe("Select the panel to redo");
  });
});

// =====================================================================
// Video page — VIDEO_COPY exact strings
// =====================================================================
describe("Video page — VIDEO_COPY", () => {
  it("pageTitle is exact spec string", () => {
    expect(VIDEO_COPY.pageTitle).toBe("Your anime");
  });

  it("subhead is exact spec string", () => {
    expect(VIDEO_COPY.subhead).toBe("How long should each moment breathe?");
  });

  it("renderPhase1 is exact spec string", () => {
    expect(VIDEO_COPY.renderPhase1).toBe("Bringing panels to motion…");
  });

  it("renderPhase2 is exact spec string", () => {
    expect(VIDEO_COPY.renderPhase2).toBe("Casting voices…");
  });

  it("renderPhase3 is exact spec string", () => {
    expect(VIDEO_COPY.renderPhase3).toBe("Composing the final cut…");
  });

  it("errorRetry is exact spec string", () => {
    expect(VIDEO_COPY.errorRetry).toBe("Retry render");
  });

  it("errorRefund is exact spec string", () => {
    expect(VIDEO_COPY.errorRefund).toBe("Credits auto-refunded");
  });
});

// =====================================================================
// Credit formula — acceptance criteria
// =====================================================================
describe("Acceptance criteria — credit math", () => {
  it("4 panels × 3s = 12 motion + 12 voice + 6 compose = 60 total", () => {
    const panels = makePanels(4, 3);
    const result = calculateCredits(panels);
    expect(result.motionCredits).toBe(48); // 4 × 12
    expect(result.voiceCredits).toBe(48); // ceil(12) × 4
    expect(result.composeCredits).toBe(6);
    expect(result.totalCredits).toBe(102);
  });

  it("redo cost is exactly 18 credits per panel", () => {
    expect(VIDEO_CREDITS.redoPanel).toBe(18);
  });

  it("Mangaka max runtime is 60s", () => {
    expect(MANGAKA_LIMITS.maxRuntime).toBe(60);
  });

  it("Mangaka max renders per episode per month is 3", () => {
    expect(MANGAKA_LIMITS.maxRendersPerEpisodePerMonth).toBe(3);
  });
});

// =====================================================================
// Timing constraints
// =====================================================================
describe("Timing constraints", () => {
  it("all panels at min duration (1s) stays within budget for 20 panels", () => {
    const panels = makePanels(20, TIMING_LIMITS.minPerPanel);
    const result = calculateCredits(panels);
    expect(result.totalRuntime).toBe(20);
    expect(result.totalRuntime).toBeLessThanOrEqual(MANGAKA_LIMITS.maxRuntime);
  });

  it("default duration (2s) for 12 panels = 24s within budget", () => {
    const panels = makePanels(12);
    const result = calculateCredits(panels);
    expect(result.totalRuntime).toBe(24);
    expect(result.totalRuntime).toBeLessThanOrEqual(MANGAKA_LIMITS.maxRuntime);
  });

  it("all panels at max duration (8s) with 8+ panels exceeds budget", () => {
    const panels = makePanels(8, TIMING_LIMITS.maxPerPanel);
    const result = calculateCredits(panels);
    expect(result.totalRuntime).toBe(64);
    expect(result.totalRuntime).toBeGreaterThan(MANGAKA_LIMITS.maxRuntime);
  });

  it("mixed durations sum correctly", () => {
    const panels: PanelTiming[] = [
      { panelIndex: 0, imageUrl: null, duration: 2 },
      { panelIndex: 1, imageUrl: null, duration: 5 },
      { panelIndex: 2, imageUrl: null, duration: 3.5 },
      { panelIndex: 3, imageUrl: null, duration: 1 },
    ];
    const result = calculateCredits(panels);
    expect(result.totalRuntime).toBeCloseTo(11.5);
    expect(result.motionCredits).toBe(48); // 4 × 12
    expect(result.voiceCredits).toBe(48); // ceil(11.5) × 4
  });
});

// =====================================================================
// No dark patterns
// =====================================================================
describe("No dark patterns in video render", () => {
  it("VIDEO_COPY contains no urgency language", () => {
    const allCopy = Object.values(VIDEO_COPY).join(" ");
    const urgencyTerms = [
      "hurry",
      "limited time",
      "act now",
      "don't miss",
      "last chance",
      "expires",
      "countdown",
      "only left",
    ];
    for (const term of urgencyTerms) {
      expect(allCopy.toLowerCase()).not.toContain(term);
    }
  });

  it("FORECAST_COPY contains no urgency language", () => {
    const staticCopy = FORECAST_COPY.overBudget;
    const urgencyTerms = ["hurry", "limited time", "act now"];
    for (const term of urgencyTerms) {
      expect(staticCopy.toLowerCase()).not.toContain(term);
    }
  });
});
