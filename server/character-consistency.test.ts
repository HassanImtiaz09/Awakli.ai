import { describe, it, expect, beforeEach } from "vitest";
import {
  hashStringToSeed,
  buildConsistentPanelPrompt,
  activeGenerations,
  getOrCreateProgress,
  updatePanelStep,
} from "./routers-create";

// ─── hashStringToSeed ──────────────────────────────────────────────────

describe("hashStringToSeed", () => {
  it("returns a positive integer", () => {
    const seed = hashStringToSeed("TestCharacter");
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(2147483647);
    expect(Number.isInteger(seed)).toBe(true);
  });

  it("returns the same seed for the same input", () => {
    const seed1 = hashStringToSeed("Akira-shonen-Fantasy");
    const seed2 = hashStringToSeed("Akira-shonen-Fantasy");
    expect(seed1).toBe(seed2);
  });

  it("returns different seeds for different inputs", () => {
    const seed1 = hashStringToSeed("Akira-shonen-Fantasy");
    const seed2 = hashStringToSeed("Yuki-seinen-SciFi");
    expect(seed1).not.toBe(seed2);
  });

  it("handles empty string", () => {
    const seed = hashStringToSeed("");
    expect(seed).toBe(0);
  });

  it("handles very long strings", () => {
    const longStr = "a".repeat(10000);
    const seed = hashStringToSeed(longStr);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(2147483647);
  });

  it("handles unicode characters", () => {
    const seed = hashStringToSeed("アキラ-少年-ファンタジー");
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(seed)).toBe(true);
  });
});

// ─── buildConsistentPanelPrompt ────────────────────────────────────────

describe("buildConsistentPanelPrompt", () => {
  const characterProfiles = [
    {
      name: "Akira",
      role: "protagonist" as const,
      appearance: "spiky black hair, amber eyes, lean muscular build, dark cloak over white tunic",
      seed: 12345,
    },
    {
      name: "Yuki",
      role: "supporting" as const,
      appearance: "long silver hair, blue eyes, slender build, white kimono with blue trim",
      seed: 67890,
    },
  ];

  it("includes style prefix for non-default styles", () => {
    const panel = {
      visual_description: "A warrior standing on a cliff",
      dialogue: [],
    };
    const { prompt } = buildConsistentPanelPrompt(panel, "shonen", characterProfiles);
    expect(prompt).toContain("shonen manga style");
  });

  it("uses 'manga style' for default style", () => {
    const panel = {
      visual_description: "A warrior standing on a cliff",
      dialogue: [],
    };
    const { prompt } = buildConsistentPanelPrompt(panel, "default", characterProfiles);
    expect(prompt).toContain("manga style");
    expect(prompt).not.toContain("default manga style");
  });

  it("includes character appearance when character appears in dialogue", () => {
    const panel = {
      visual_description: "Two characters facing each other",
      dialogue: [
        { character: "Akira", text: "Let's fight!", emotion: "determined" },
      ],
    };
    const { prompt } = buildConsistentPanelPrompt(panel, "shonen", characterProfiles);
    expect(prompt).toContain("[Akira: spiky black hair");
    expect(prompt).toContain("consistent character design");
  });

  it("includes multiple character descriptions when multiple characters appear", () => {
    const panel = {
      visual_description: "Two characters facing each other",
      dialogue: [
        { character: "Akira", text: "Let's fight!", emotion: "determined" },
        { character: "Yuki", text: "I accept!", emotion: "calm" },
      ],
    };
    const { prompt } = buildConsistentPanelPrompt(panel, "shonen", characterProfiles);
    expect(prompt).toContain("[Akira:");
    expect(prompt).toContain("[Yuki:");
  });

  it("falls back to protagonist description when no characters in dialogue", () => {
    const panel = {
      visual_description: "A vast landscape with mountains",
      dialogue: [],
    };
    const { prompt } = buildConsistentPanelPrompt(panel, "shonen", characterProfiles);
    expect(prompt).toContain("[Akira:");
  });

  it("excludes Narrator and SFX from character matching", () => {
    const panel = {
      visual_description: "A dark room",
      dialogue: [
        { character: "Narrator", text: "The night was dark...", emotion: "neutral" },
        { character: "SFX", text: "BOOM!", emotion: "none" },
      ],
    };
    const { prompt } = buildConsistentPanelPrompt(panel, "shonen", characterProfiles);
    // Should fall back to protagonist since Narrator and SFX are excluded
    expect(prompt).toContain("[Akira:");
  });

  it("handles panels with no dialogue array", () => {
    const panel = {
      visual_description: "A silent landscape",
      dialogue: undefined as any,
    };
    const { prompt } = buildConsistentPanelPrompt(panel, "shonen", characterProfiles);
    expect(prompt).toContain("manga style");
    expect(prompt).toContain("A silent landscape");
  });

  it("returns referenceUrl when characterRefUrl is provided", () => {
    const panel = {
      visual_description: "A scene",
      dialogue: [],
    };
    const { referenceUrl } = buildConsistentPanelPrompt(
      panel, "shonen", characterProfiles, "https://example.com/ref.png"
    );
    expect(referenceUrl).toBe("https://example.com/ref.png");
  });

  it("returns undefined referenceUrl when no characterRefUrl", () => {
    const panel = {
      visual_description: "A scene",
      dialogue: [],
    };
    const { referenceUrl } = buildConsistentPanelPrompt(panel, "shonen", characterProfiles);
    expect(referenceUrl).toBeUndefined();
  });

  it("handles case-insensitive character name matching", () => {
    const panel = {
      visual_description: "A scene",
      dialogue: [
        { character: "akira", text: "Hello", emotion: "happy" },
      ],
    };
    const { prompt } = buildConsistentPanelPrompt(panel, "shonen", characterProfiles);
    expect(prompt).toContain("[Akira:");
  });

  it("handles empty character profiles", () => {
    const panel = {
      visual_description: "A scene",
      dialogue: [
        { character: "Unknown", text: "Who am I?", emotion: "confused" },
      ],
    };
    const { prompt } = buildConsistentPanelPrompt(panel, "shonen", []);
    expect(prompt).toContain("manga style");
    expect(prompt).not.toContain("[");
  });
});

// ─── Progress Tracking ─────────────────────────────────────────────────

describe("Progress Tracking", () => {
  beforeEach(() => {
    activeGenerations.clear();
  });

  describe("getOrCreateProgress", () => {
    it("creates a new progress entry", () => {
      const progress = getOrCreateProgress(999);
      expect(progress.projectId).toBe(999);
      expect(progress.phase).toBe("script");
      expect(progress.panelProgress).toEqual([]);
      expect(progress.avgPanelTimeMs).toBe(12000);
    });

    it("returns existing progress entry", () => {
      const p1 = getOrCreateProgress(999);
      p1.phase = "panels";
      const p2 = getOrCreateProgress(999);
      expect(p2.phase).toBe("panels");
      expect(p2).toBe(p1);
    });

    it("creates separate entries for different projects", () => {
      const p1 = getOrCreateProgress(1);
      const p2 = getOrCreateProgress(2);
      expect(p1).not.toBe(p2);
      expect(p1.projectId).toBe(1);
      expect(p2.projectId).toBe(2);
    });
  });

  describe("updatePanelStep", () => {
    it("updates panel step correctly", () => {
      const progress = getOrCreateProgress(100);
      progress.panelProgress = [
        { panelId: 1, sceneNumber: 1, panelNumber: 1, step: "queued", attempt: 1 },
        { panelId: 2, sceneNumber: 1, panelNumber: 2, step: "queued", attempt: 1 },
      ];

      updatePanelStep(100, 1, "generating");
      expect(progress.panelProgress[0].step).toBe("generating");
      expect(progress.panelProgress[0].startedAt).toBeDefined();
    });

    it("sets startedAt on first generating step", () => {
      const progress = getOrCreateProgress(101);
      progress.panelProgress = [
        { panelId: 1, sceneNumber: 1, panelNumber: 1, step: "queued", attempt: 1 },
      ];

      const before = Date.now();
      updatePanelStep(101, 1, "generating");
      const after = Date.now();

      expect(progress.panelProgress[0].startedAt).toBeGreaterThanOrEqual(before);
      expect(progress.panelProgress[0].startedAt).toBeLessThanOrEqual(after);
    });

    it("sets completedAt on complete step", () => {
      const progress = getOrCreateProgress(102);
      progress.panelProgress = [
        { panelId: 1, sceneNumber: 1, panelNumber: 1, step: "generating", startedAt: Date.now() - 5000, attempt: 1 },
      ];

      updatePanelStep(102, 1, "complete");
      expect(progress.panelProgress[0].completedAt).toBeDefined();
      expect(progress.panelProgress[0].step).toBe("complete");
    });

    it("updates rolling average on completion", () => {
      const progress = getOrCreateProgress(103);
      const startTime = Date.now() - 10000;
      progress.panelProgress = [
        { panelId: 1, sceneNumber: 1, panelNumber: 1, step: "generating", startedAt: startTime, attempt: 1 },
      ];

      updatePanelStep(103, 1, "complete");
      expect(progress.completedTimes.length).toBe(1);
      expect(progress.avgPanelTimeMs).toBeGreaterThan(0);
    });

    it("increments attempt on retrying", () => {
      const progress = getOrCreateProgress(104);
      progress.panelProgress = [
        { panelId: 1, sceneNumber: 1, panelNumber: 1, step: "generating", attempt: 1 },
      ];

      updatePanelStep(104, 1, "retrying");
      expect(progress.panelProgress[0].attempt).toBe(2);
    });

    it("does nothing for non-existent project", () => {
      // Should not throw
      updatePanelStep(9999, 1, "generating");
    });

    it("does nothing for non-existent panel", () => {
      const progress = getOrCreateProgress(105);
      progress.panelProgress = [
        { panelId: 1, sceneNumber: 1, panelNumber: 1, step: "queued", attempt: 1 },
      ];

      // Should not throw
      updatePanelStep(105, 999, "generating");
      expect(progress.panelProgress[0].step).toBe("queued");
    });

    it("calculates rolling average from last 5 panels", () => {
      const progress = getOrCreateProgress(106);
      // Pre-fill with 6 completed times
      progress.completedTimes = [10000, 11000, 12000, 13000, 14000];
      progress.panelProgress = [
        { panelId: 6, sceneNumber: 2, panelNumber: 1, step: "generating", startedAt: Date.now() - 8000, attempt: 1 },
      ];

      updatePanelStep(106, 6, "complete");
      // Should use last 5 values (11000, 12000, 13000, 14000, ~8000)
      expect(progress.completedTimes.length).toBe(6);
      // Rolling average uses last 5
      const last5 = progress.completedTimes.slice(-5);
      const expected = last5.reduce((a, b) => a + b, 0) / 5;
      expect(progress.avgPanelTimeMs).toBeCloseTo(expected, -2);
    });
  });
});
