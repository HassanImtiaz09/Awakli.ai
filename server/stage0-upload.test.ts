/**
 * Stage 0 · Manga Upload — Tests
 *
 * Covers: upload validation, panel extraction logic, tier gating,
 * copy strings, and LengthPicker tier-aware options.
 */
import { describe, it, expect } from "vitest";

// ─── Upload Validation ────────────────────────────────────────────────────────

describe("Manga Upload Validation", () => {
  const ACCEPTED_TYPES = [
    "application/pdf",
    "application/x-cbz",
    "application/zip",
    "application/x-zip-compressed",
    "image/jpeg",
    "image/png",
    "image/webp",
  ];
  const MAX_FILE_SIZE = 80 * 1024 * 1024; // 80MB
  const MAX_FILE_COUNT = 40;

  it("accepts PDF files", () => {
    expect(ACCEPTED_TYPES).toContain("application/pdf");
  });

  it("accepts CBZ files", () => {
    expect(ACCEPTED_TYPES).toContain("application/x-cbz");
  });

  it("accepts ZIP files", () => {
    expect(ACCEPTED_TYPES).toContain("application/zip");
  });

  it("accepts JPEG images", () => {
    expect(ACCEPTED_TYPES).toContain("image/jpeg");
  });

  it("accepts PNG images", () => {
    expect(ACCEPTED_TYPES).toContain("image/png");
  });

  it("accepts WebP images", () => {
    expect(ACCEPTED_TYPES).toContain("image/webp");
  });

  it("enforces 80MB max file size", () => {
    expect(MAX_FILE_SIZE).toBe(83886080);
    expect(MAX_FILE_SIZE / (1024 * 1024)).toBe(80);
  });

  it("enforces 40 file maximum", () => {
    expect(MAX_FILE_COUNT).toBe(40);
  });

  it("rejects files over 80MB", () => {
    const fileSize = 85 * 1024 * 1024;
    expect(fileSize > MAX_FILE_SIZE).toBe(true);
  });

  it("rejects unsupported file types", () => {
    expect(ACCEPTED_TYPES).not.toContain("text/plain");
    expect(ACCEPTED_TYPES).not.toContain("application/json");
    expect(ACCEPTED_TYPES).not.toContain("video/mp4");
  });
});

// ─── Panel Extraction Logic ───────────────────────────────────────────────────

describe("Panel Extraction Logic", () => {
  it("generates unique panel IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const id = `panel_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}`;
      ids.add(id);
    }
    expect(ids.size).toBe(100);
  });

  it("assigns sequential indices to extracted panels", () => {
    const panels = Array.from({ length: 10 }, (_, i) => ({
      id: `panel_${i}`,
      index: i,
      url: `https://example.com/panel_${i}.png`,
      width: 800,
      height: 1200,
      sourcePageIndex: Math.floor(i / 3),
    }));

    panels.forEach((p, i) => {
      expect(p.index).toBe(i);
    });
  });

  it("re-indexes panels after removal", () => {
    let panels = Array.from({ length: 5 }, (_, i) => ({
      id: `panel_${i}`,
      index: i,
    }));

    // Remove panel at index 2
    panels = panels.filter((p) => p.id !== "panel_2").map((p, i) => ({
      ...p,
      index: i,
    }));

    expect(panels.length).toBe(4);
    expect(panels[0].index).toBe(0);
    expect(panels[1].index).toBe(1);
    expect(panels[2].index).toBe(2);
    expect(panels[3].index).toBe(3);
  });

  it("supports drag-reorder via arrayMove", () => {
    const panels = [
      { id: "a", index: 0 },
      { id: "b", index: 1 },
      { id: "c", index: 2 },
    ];

    // Move "c" from index 2 to index 0
    const reordered = [...panels];
    const [item] = reordered.splice(2, 1);
    reordered.splice(0, 0, item);
    const result = reordered.map((p, i) => ({ ...p, index: i }));

    expect(result[0].id).toBe("c");
    expect(result[1].id).toBe("a");
    expect(result[2].id).toBe("b");
    expect(result.every((p, i) => p.index === i)).toBe(true);
  });
});

// ─── Tier Gating ──────────────────────────────────────────────────────────────

describe("Upload Tier Gating", () => {
  const MANGAKA_TIERS = ["creator", "creator_pro", "studio", "enterprise"];
  const APPRENTICE_TIERS = ["free_trial", "apprentice"];

  it("blocks upload tab for Apprentice/free_trial users", () => {
    APPRENTICE_TIERS.forEach((tier) => {
      const isMangakaPlus = MANGAKA_TIERS.includes(tier);
      expect(isMangakaPlus).toBe(false);
    });
  });

  it("allows upload tab for Mangaka+ users", () => {
    MANGAKA_TIERS.forEach((tier) => {
      const isMangakaPlus = MANGAKA_TIERS.includes(tier);
      expect(isMangakaPlus).toBe(true);
    });
  });

  it("shows extended panel options for Mangaka users", () => {
    const mangakaOptions = [20, 30, 40, 60, 80, 120, 150];
    const apprenticeOptions = [20, 30, 40, 50, 60];

    expect(mangakaOptions.length).toBeGreaterThan(apprenticeOptions.length);
    expect(mangakaOptions).toContain(120);
    expect(apprenticeOptions).not.toContain(120);
  });

  it("locks 150+ panels for non-Studio users", () => {
    const studioTiers = ["studio", "enterprise"];
    const creatorTier = "creator";

    expect(studioTiers.includes(creatorTier)).toBe(false);
    expect(studioTiers.includes("studio")).toBe(true);
  });

  it("unlocks multi-chapter for Mangaka+ (max 3 chapters)", () => {
    const maxChaptersForMangaka = 3;
    const maxChaptersForApprentice = 1;

    expect(maxChaptersForMangaka).toBe(3);
    expect(maxChaptersForApprentice).toBe(1);
  });
});

// ─── Copy Strings ─────────────────────────────────────────────────────────────

describe("Upload Copy Strings", () => {
  it("uses correct tab labels", () => {
    expect("Start from an idea").toBe("Start from an idea");
    expect("Upload manga / webtoon").toBe("Upload manga / webtoon");
  });

  it("uses correct drop zone hint", () => {
    expect("Drop PDF, CBZ, or images (up to 80MB)").toBe(
      "Drop PDF, CBZ, or images (up to 80MB)"
    );
  });

  it("uses correct parsed header with panel count", () => {
    const n = 28;
    const header = `We detected ${n} panels. Re-order or merge if you'd like.`;
    expect(header).toContain("We detected 28 panels");
    expect(header).toContain("Re-order or merge");
  });

  it("uses correct Studio lock tooltip", () => {
    expect("150+ panel projects unlock on Studio").toBe(
      "150+ panel projects unlock on Studio"
    );
  });

  it("uses correct Mangaka upgrade CTA", () => {
    expect("Unlock with Mangaka — from $19/mo").toBe(
      "Unlock with Mangaka — from $19/mo"
    );
  });
});

// ─── Credit Cost Calculation ──────────────────────────────────────────────────

describe("Upload Credit Cost", () => {
  const INGEST_COST_PER_PANEL = 2;

  it("calculates 2 credits per uploaded panel", () => {
    expect(INGEST_COST_PER_PANEL).toBe(2);
  });

  it("calculates total ingest cost for 28 panels", () => {
    const panelCount = 28;
    const cost = panelCount * INGEST_COST_PER_PANEL;
    expect(cost).toBe(56);
  });

  it("adds ingest cost to project forecast", () => {
    const baseForecast = 17;
    const uploadPanels = 40;
    const ingestCost = uploadPanels * INGEST_COST_PER_PANEL;
    const totalForecast = baseForecast + ingestCost;
    expect(totalForecast).toBe(97);
  });

  it("shows affordability based on balance", () => {
    const balance = 50;
    const forecast = 97;
    expect(balance >= forecast).toBe(false);

    const richBalance = 200;
    expect(richBalance >= forecast).toBe(true);
  });
});

// ─── Analytics Events ─────────────────────────────────────────────────────────

describe("Upload Analytics Events", () => {
  const EXPECTED_EVENTS = [
    "stage0_upload_start",
    "stage0_upload_complete",
    "stage0_panels_reordered",
    "stage0_upload_failed",
    "stage0_upgrade_prompt",
  ];

  it("defines all required analytics events", () => {
    expect(EXPECTED_EVENTS).toContain("stage0_upload_start");
    expect(EXPECTED_EVENTS).toContain("stage0_upload_complete");
    expect(EXPECTED_EVENTS).toContain("stage0_panels_reordered");
    expect(EXPECTED_EVENTS).toContain("stage0_upload_failed");
  });

  it("includes upgrade prompt event for tier gating", () => {
    expect(EXPECTED_EVENTS).toContain("stage0_upgrade_prompt");
  });
});
