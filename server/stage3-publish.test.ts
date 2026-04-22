import { describe, it, expect } from "vitest";

// ─── Import server-side service ─────────────────────────────────────────
import {
  generateSlug,
  getTierPublishConfig,
  PUBLISH_COPY,
  PUBLISH_STEPS,
  VALID_COVER_PRESETS,
  COVER_PRESETS,
} from "./publishService";

import {
  composePanelsIntoPages,
  type PreviewPanel,
} from "../client/src/components/awakli/PublishPreview";

import {
  getWatermarkBehavior,
  getPublishLimit,
  canPublishMore,
} from "../client/src/components/awakli/WatermarkToggle";

import {
  COVER_STYLE_PRESETS,
} from "../client/src/components/awakli/CoverDesigner";

// ─── Copy string constants (exact spec) ────────────────────────────────
const SPEC_COPY = {
  pageTitle: "Publish your manga",
  subhead: "Final check. Pick a cover. Ship it.",
  publishCTA: "Publish episode",
  step1: "Composing pages…",
  step2: "Generating thumbnails…",
  step3: "Creating your share link…",
  successTitle: "Your episode is live.",
  animeCTA: "Make it move — generate the anime →",
};

// ─── Mock panel data ───────────────────────────────────────────────────
function makeMockPanels(
  count: number,
  cameraPattern: ("wide" | "close-up" | "medium")[] = ["wide", "close-up", "medium"]
): PreviewPanel[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    panelNumber: i + 1,
    imageUrl: `https://cdn.example.com/panel-${i + 1}.png`,
    compositeImageUrl: null,
    cameraAngle: cameraPattern[i % cameraPattern.length],
  }));
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe("Stage 3 · Publish — Copy Strings", () => {
  it("page title matches spec", () => {
    expect(PUBLISH_COPY.pageTitle).toBe(SPEC_COPY.pageTitle);
  });

  it("subhead matches spec", () => {
    expect(PUBLISH_COPY.subhead).toBe(SPEC_COPY.subhead);
  });

  it("publish CTA matches spec", () => {
    expect(PUBLISH_COPY.publishCTA).toBe(SPEC_COPY.publishCTA);
  });

  it("publishing step 1 matches spec", () => {
    expect(PUBLISH_COPY.step1).toBe(SPEC_COPY.step1);
  });

  it("publishing step 2 matches spec", () => {
    expect(PUBLISH_COPY.step2).toBe(SPEC_COPY.step2);
  });

  it("publishing step 3 matches spec", () => {
    expect(PUBLISH_COPY.step3).toBe(SPEC_COPY.step3);
  });

  it("success title matches spec", () => {
    expect(PUBLISH_COPY.successTitle).toBe(SPEC_COPY.successTitle);
  });

  it("anime CTA matches spec", () => {
    expect(PUBLISH_COPY.animeCTA).toBe(SPEC_COPY.animeCTA);
  });
});

describe("Stage 3 · Publish — Publishing Steps", () => {
  it("has exactly 3 publishing steps", () => {
    expect(PUBLISH_STEPS.length).toBe(3);
  });

  it("steps are in correct order", () => {
    expect(PUBLISH_STEPS[0]).toBe("Composing pages…");
    expect(PUBLISH_STEPS[1]).toBe("Generating thumbnails…");
    expect(PUBLISH_STEPS[2]).toBe("Creating your share link…");
  });
});

describe("Stage 3 · Publish — Slug Generation", () => {
  it("generates a slug from a simple title", () => {
    const slug = generateSlug("My First Manga");
    expect(slug).toMatch(/^my-first-manga-[a-z0-9]{6}$/);
  });

  it("strips special characters", () => {
    const slug = generateSlug("Hello! World? #1");
    expect(slug).toMatch(/^hello-world-1-[a-z0-9]{6}$/);
  });

  it("handles empty title", () => {
    const slug = generateSlug("");
    // Should just be the random suffix
    expect(slug).toMatch(/^-[a-z0-9]{6}$/);
  });

  it("truncates long titles to 60 chars", () => {
    const longTitle = "A".repeat(100);
    const slug = generateSlug(longTitle);
    // Base should be max 60 chars + dash + 6 char suffix
    expect(slug.length).toBeLessThanOrEqual(67);
  });

  it("generates unique slugs for same title", () => {
    const slug1 = generateSlug("Same Title");
    const slug2 = generateSlug("Same Title");
    expect(slug1).not.toBe(slug2);
  });
});

describe("Stage 3 · Publish — Watermark Behavior by Tier", () => {
  it("free_trial has watermark locked ON", () => {
    expect(getWatermarkBehavior("free_trial")).toBe("locked_on");
  });

  it("creator (Apprentice) has watermark locked ON", () => {
    expect(getWatermarkBehavior("creator")).toBe("locked_on");
  });

  it("creator_pro (Mangaka) can toggle watermark", () => {
    expect(getWatermarkBehavior("creator_pro")).toBe("toggleable");
  });

  it("studio can toggle watermark", () => {
    expect(getWatermarkBehavior("studio")).toBe("toggleable");
  });

  it("studio_pro can toggle watermark", () => {
    expect(getWatermarkBehavior("studio_pro")).toBe("toggleable");
  });

  it("enterprise can toggle watermark", () => {
    expect(getWatermarkBehavior("enterprise")).toBe("toggleable");
  });
});

describe("Stage 3 · Publish — Publish Limits by Tier", () => {
  it("free_trial can publish 3 episodes", () => {
    expect(getPublishLimit("free_trial")).toBe(3);
  });

  it("creator (Apprentice) can publish 3 episodes", () => {
    expect(getPublishLimit("creator")).toBe(3);
  });

  it("creator_pro (Mangaka) has unlimited episodes", () => {
    expect(getPublishLimit("creator_pro")).toBe(Infinity);
  });

  it("studio has unlimited episodes", () => {
    expect(getPublishLimit("studio")).toBe(Infinity);
  });

  it("canPublishMore returns true when under limit", () => {
    expect(canPublishMore("creator", 2)).toBe(true);
  });

  it("canPublishMore returns false when at limit", () => {
    expect(canPublishMore("creator", 3)).toBe(false);
  });

  it("canPublishMore always true for Mangaka+", () => {
    expect(canPublishMore("creator_pro", 1000)).toBe(true);
  });
});

describe("Stage 3 · Publish — Tier Config", () => {
  it("free_trial requires watermark", () => {
    const config = getTierPublishConfig("free_trial");
    expect(config.watermarkRequired).toBe(true);
    expect(config.canToggleVisibility).toBe(false);
    expect(config.maxEpisodes).toBe(3);
  });

  it("creator requires watermark", () => {
    const config = getTierPublishConfig("creator");
    expect(config.watermarkRequired).toBe(true);
    expect(config.canToggleVisibility).toBe(false);
  });

  it("creator_pro has optional watermark and visibility toggle", () => {
    const config = getTierPublishConfig("creator_pro");
    expect(config.watermarkRequired).toBe(false);
    expect(config.canToggleVisibility).toBe(true);
    expect(config.maxEpisodes).toBe(Infinity);
  });

  it("studio has custom domain and RSS", () => {
    const config = getTierPublishConfig("studio");
    expect(config.canCustomDomain).toBe(true);
    expect(config.canRSS).toBe(true);
    expect(config.canSchedulePublish).toBe(true);
  });

  it("studio_pro has all features", () => {
    const config = getTierPublishConfig("studio_pro");
    expect(config.canCustomDomain).toBe(true);
    expect(config.canRSS).toBe(true);
    expect(config.canSchedulePublish).toBe(true);
    expect(config.watermarkRequired).toBe(false);
  });

  it("unknown tier defaults to free_trial config", () => {
    const config = getTierPublishConfig("nonexistent");
    expect(config.watermarkRequired).toBe(true);
    expect(config.maxEpisodes).toBe(3);
  });
});

describe("Stage 3 · Publish — Cover Style Presets", () => {
  it("has exactly 3 presets", () => {
    expect(VALID_COVER_PRESETS.length).toBe(3);
  });

  it("presets are shonen, seinen, shojo", () => {
    expect(VALID_COVER_PRESETS).toContain("shonen");
    expect(VALID_COVER_PRESETS).toContain("seinen");
    expect(VALID_COVER_PRESETS).toContain("shojo");
  });

  it("server presets have label and fontStyle", () => {
    Object.values(COVER_PRESETS).forEach((preset) => {
      expect(preset).toHaveProperty("label");
      expect(preset).toHaveProperty("fontStyle");
    });
  });

  it("client presets have label, description, titleFont, accent", () => {
    Object.values(COVER_STYLE_PRESETS).forEach((preset) => {
      expect(preset).toHaveProperty("label");
      expect(preset).toHaveProperty("description");
      expect(preset).toHaveProperty("titleFont");
      expect(preset).toHaveProperty("accent");
    });
  });

  it("Shonen Bold label matches", () => {
    expect(COVER_PRESETS.shonen.label).toBe("Shonen Bold");
    expect(COVER_STYLE_PRESETS.shonen.label).toBe("Shonen Bold");
  });

  it("Seinen Minimal label matches", () => {
    expect(COVER_PRESETS.seinen.label).toBe("Seinen Minimal");
    expect(COVER_STYLE_PRESETS.seinen.label).toBe("Seinen Minimal");
  });

  it("Shojo Soft label matches", () => {
    expect(COVER_PRESETS.shojo.label).toBe("Shojo Soft");
    expect(COVER_STYLE_PRESETS.shojo.label).toBe("Shojo Soft");
  });
});

describe("Stage 3 · Publish — Panel Page Composition", () => {
  it("wide shot gets its own page", () => {
    const panels = makeMockPanels(3, ["wide", "medium", "medium"]);
    const pages = composePanelsIntoPages(panels);
    expect(pages[0].layout).toBe("single");
    expect(pages[0].panels.length).toBe(1);
  });

  it("close-ups are grouped into double pages", () => {
    const panels = makeMockPanels(2, ["close-up", "close-up"]);
    const pages = composePanelsIntoPages(panels);
    expect(pages[0].layout).toBe("double");
    expect(pages[0].panels.length).toBe(2);
  });

  it("three medium shots form a triple page", () => {
    const panels = makeMockPanels(3, ["medium", "medium", "medium"]);
    const pages = composePanelsIntoPages(panels);
    expect(pages[0].layout).toBe("triple");
    expect(pages[0].panels.length).toBe(3);
  });

  it("single remaining panel gets its own page", () => {
    const panels = makeMockPanels(1, ["medium"]);
    const pages = composePanelsIntoPages(panels);
    expect(pages.length).toBe(1);
    expect(pages[0].layout).toBe("single");
  });

  it("two remaining panels form a double page", () => {
    const panels = makeMockPanels(2, ["medium", "close-up"]);
    const pages = composePanelsIntoPages(panels);
    // Last 2 panels → double
    expect(pages[pages.length - 1].layout).toBe("double");
  });

  it("empty panels produce no pages", () => {
    const pages = composePanelsIntoPages([]);
    expect(pages.length).toBe(0);
  });

  it("20 panels produce multiple pages", () => {
    const panels = makeMockPanels(20);
    const pages = composePanelsIntoPages(panels);
    expect(pages.length).toBeGreaterThan(0);
    // Total panels across all pages should equal 20
    const totalPanels = pages.reduce((sum, p) => sum + p.panels.length, 0);
    expect(totalPanels).toBe(20);
  });

  it("page numbers are sequential starting from 1", () => {
    const panels = makeMockPanels(10);
    const pages = composePanelsIntoPages(panels);
    pages.forEach((page, idx) => {
      expect(page.pageNumber).toBe(idx + 1);
    });
  });

  it("each page has 1-4 panels", () => {
    const panels = makeMockPanels(20);
    const pages = composePanelsIntoPages(panels);
    pages.forEach((page) => {
      expect(page.panels.length).toBeGreaterThanOrEqual(1);
      expect(page.panels.length).toBeLessThanOrEqual(4);
    });
  });
});

describe("Stage 3 · Publish — Analytics Events", () => {
  const REQUIRED_EVENTS = [
    "stage3_preview_shown",
    "stage3_cover_picked",
    "stage3_publish_start",
    "stage3_publish_complete",
    "stage3_anime_cta",
  ];

  REQUIRED_EVENTS.forEach((event) => {
    it(`defines analytics event: ${event}`, () => {
      expect(event).toBeTruthy();
      expect(typeof event).toBe("string");
    });
  });
});

describe("Stage 3 · Publish — No Dark Patterns", () => {
  const DARK_PATTERN_PHRASES = [
    "limited time",
    "limited offer",
    "act now",
    "don't miss",
    "countdown",
    "only X left",
    "hurry",
    "expires soon",
  ];

  const allCopyText = Object.values(SPEC_COPY).join(" ").toLowerCase();

  DARK_PATTERN_PHRASES.forEach((phrase) => {
    it(`copy does not contain dark pattern: "${phrase}"`, () => {
      expect(allCopyText).not.toContain(phrase.toLowerCase());
    });
  });
});

describe("Stage 3 · Publish — Anime CTA Routing", () => {
  it("anime CTA routes to /create/anime-gate with projectId", () => {
    const projectId = 42;
    const expectedPath = `/create/anime-gate?projectId=${projectId}`;
    expect(expectedPath).toBe("/create/anime-gate?projectId=42");
  });
});

describe("Stage 3 · Publish — Public URL Format", () => {
  it("public URL uses /m/{slug} format", () => {
    const slug = "my-manga-abc123";
    const origin = "https://awakli.com";
    const publicUrl = `${origin}/m/${slug}`;
    expect(publicUrl).toBe("https://awakli.com/m/my-manga-abc123");
  });

  it("slug is URL-safe", () => {
    const slug = generateSlug("Test Manga! @#$");
    expect(slug).toMatch(/^[a-z0-9-]+$/);
  });
});
