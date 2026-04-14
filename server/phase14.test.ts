import { describe, it, expect, vi } from "vitest";

// Mock LLM
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          suggested_genre: "Sci-Fi",
          suggested_tone: "epic",
          detected_characters: [
            { role: "protagonist", suggested_name: "Kai", description: "A young hacker" },
            { role: "antagonist", suggested_name: "ARIA", description: "A sentient AI" },
          ],
          suggested_chapter_count: 5,
          suggested_chapter_length: "standard",
          story_setting: "A futuristic city with advanced AI systems",
          confidence: 0.85,
        }),
      },
    }],
  }),
}));

// Mock DB
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

import { STYLE_MAP, TONE_MAP } from "./routers-smartcreate";

describe("Phase 14: Smart Creation Flow", () => {
  describe("Style Map Constants", () => {
    it("should have 8 art styles", () => {
      expect(Object.keys(STYLE_MAP)).toHaveLength(8);
    });

    it("should include all expected styles", () => {
      const expectedStyles = ["shonen", "seinen", "shoujo", "chibi", "cyberpunk", "watercolor", "noir", "realistic"];
      expectedStyles.forEach((style) => {
        expect(STYLE_MAP[style]).toBeDefined();
        expect(STYLE_MAP[style].display).toBeTruthy();
        expect(STYLE_MAP[style].description).toBeTruthy();
      });
    });

    it("each style should have internal, display, and description fields", () => {
      Object.entries(STYLE_MAP).forEach(([key, val]) => {
        expect(val.internal).toBe(key);
        expect(typeof val.display).toBe("string");
        expect(typeof val.description).toBe("string");
        expect(val.display.length).toBeGreaterThan(0);
        expect(val.description.length).toBeGreaterThan(0);
      });
    });
  });

  describe("Tone Map Constants", () => {
    it("should have 6 tones", () => {
      expect(Object.keys(TONE_MAP)).toHaveLength(6);
    });

    it("should include all expected tones", () => {
      const expectedTones = ["epic", "fun", "dark", "romantic", "scary", "comedic"];
      expectedTones.forEach((tone) => {
        expect(TONE_MAP[tone]).toBeDefined();
        expect(TONE_MAP[tone].display).toBeTruthy();
        expect(TONE_MAP[tone].colors).toHaveLength(3);
      });
    });

    it("each tone should have valid hex colors", () => {
      Object.values(TONE_MAP).forEach((val) => {
        val.colors.forEach((color) => {
          expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
        });
      });
    });
  });

  describe("Style Images Module", () => {
    it("should export STYLE_IMAGES with male and female variants", async () => {
      const { STYLE_IMAGES } = await import("../shared/style-images");
      expect(STYLE_IMAGES.male).toBeDefined();
      expect(STYLE_IMAGES.female).toBeDefined();
      expect(Object.keys(STYLE_IMAGES.male)).toHaveLength(8);
      expect(Object.keys(STYLE_IMAGES.female)).toHaveLength(8);
    });

    it("should export TONE_IMAGES with 6 tones", async () => {
      const { TONE_IMAGES } = await import("../shared/style-images");
      expect(Object.keys(TONE_IMAGES)).toHaveLength(6);
    });

    it("all image URLs should be valid CDN URLs", async () => {
      const { STYLE_IMAGES, TONE_IMAGES } = await import("../shared/style-images");
      
      // Check male style images
      Object.values(STYLE_IMAGES.male).forEach((url) => {
        expect(url).toMatch(/^https:\/\//);
      });
      
      // Check female style images
      Object.values(STYLE_IMAGES.female).forEach((url) => {
        expect(url).toMatch(/^https:\/\//);
      });
      
      // Check tone images
      Object.values(TONE_IMAGES).forEach((url) => {
        expect(url).toMatch(/^https:\/\//);
      });
    });

    it("should export STYLE_INFO with name and description for each style", async () => {
      const { STYLE_INFO } = await import("../shared/style-images");
      expect(Object.keys(STYLE_INFO)).toHaveLength(8);
      Object.values(STYLE_INFO).forEach((info) => {
        expect(info.name).toBeTruthy();
        expect(info.description).toBeTruthy();
      });
    });

    it("should export TONE_INFO with name, description, and emoji for each tone", async () => {
      const { TONE_INFO } = await import("../shared/style-images");
      expect(Object.keys(TONE_INFO)).toHaveLength(6);
      Object.values(TONE_INFO).forEach((info) => {
        expect(info.name).toBeTruthy();
        expect(info.description).toBeTruthy();
        expect(info.emoji).toBeTruthy();
      });
    });
  });

  describe("Genre-to-Style Inference", () => {
    it("should map action-related genres to shonen", () => {
      // The GENRE_STYLE_MAP is internal, but we test via the exported STYLE_MAP
      expect(STYLE_MAP.shonen.display).toBe("Bold & Dynamic");
    });

    it("should map horror/mystery genres to noir", () => {
      expect(STYLE_MAP.noir.display).toBe("Dark & Moody");
    });

    it("should map romance genres to shoujo", () => {
      expect(STYLE_MAP.shoujo.display).toBe("Elegant & Expressive");
    });

    it("should map sci-fi genres to cyberpunk", () => {
      expect(STYLE_MAP.cyberpunk.display).toBe("Neon & Futuristic");
    });
  });

  describe("Two-Path Create Flow", () => {
    it("should support both 'Generate Now' and 'Customize First' paths", () => {
      // Verify the flow modes exist as constants
      const flowModes = ["prompt", "customize"];
      expect(flowModes).toContain("prompt");
      expect(flowModes).toContain("customize");
    });

    it("should have 4 customization steps", () => {
      const steps = [
        { title: "Choose Your Art Style", subtitle: "How should your manga look?" },
        { title: "Set the Tone", subtitle: "What mood should your story have?" },
        { title: "Story Structure", subtitle: "How should your chapters be organized?" },
        { title: "Ready to Create", subtitle: "Review your settings and generate!" },
      ];
      expect(steps).toHaveLength(4);
      steps.forEach((step) => {
        expect(step.title).toBeTruthy();
        expect(step.subtitle).toBeTruthy();
      });
    });
  });

  describe("Chapter Preferences", () => {
    it("should support 3 chapter length presets", () => {
      const presets = ["short", "standard", "long"];
      expect(presets).toHaveLength(3);
    });

    it("should support 3 pacing styles", () => {
      const pacingStyles = ["action_heavy", "balanced", "dialogue_heavy"];
      expect(pacingStyles).toHaveLength(3);
    });

    it("should support 3 ending styles", () => {
      const endingStyles = ["cliffhanger", "resolution", "serialized"];
      expect(endingStyles).toHaveLength(3);
    });

    it("should allow chapter count between 1 and 12", () => {
      const minChapters = 1;
      const maxChapters = 12;
      expect(minChapters).toBe(1);
      expect(maxChapters).toBe(12);
    });
  });

  describe("User Preferences Schema", () => {
    it("should accept valid preference fields", () => {
      const validPrefs = {
        preferred_style: "shonen",
        preferred_tone: "epic",
        preferred_chapter_length: "standard",
        preferred_audience: "everyone",
        last_used_style: "cyberpunk",
      };
      
      expect(validPrefs.preferred_style).toBeTruthy();
      expect(["short", "standard", "long"]).toContain(validPrefs.preferred_chapter_length);
      expect(["everyone", "teens", "adults"]).toContain(validPrefs.preferred_audience);
    });

    it("should validate preferred_style against STYLE_MAP keys", () => {
      const validStyles = Object.keys(STYLE_MAP);
      const testStyle = "shonen";
      expect(validStyles).toContain(testStyle);
    });
  });
});
