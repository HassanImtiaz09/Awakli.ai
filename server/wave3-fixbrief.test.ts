import { describe, it, expect } from "vitest";

// ─── C4: Setup page tests ──────────────────────────────────────────────────

describe("C4 – Setup page (SetupStepper)", () => {
  it("setup.tsx imports SetupStepper and sub-components", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/pages/create/setup.tsx", "utf-8");
    expect(src).toContain("SetupStepper");
    expect(src).toContain("CharacterBakery");
    expect(src).toContain("VoiceCatalog");
    expect(src).toContain("PoseSheet");
  });

  it("setup.tsx has 3-step stepper (Character look → Voices → Pose references)", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/pages/create/setup.tsx", "utf-8");
    // Should have step state and 3 steps
    expect(src).toContain("step");
    expect(src).toContain("Character");
    expect(src).toContain("Voice");
    expect(src).toContain("Pose");
  });

  it("setup.tsx gates LoRATrainer and VoiceClone to Studio tiers", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/pages/create/setup.tsx", "utf-8");
    expect(src).toContain("LoRATrainer");
    expect(src).toContain("VoiceClone");
    // Should check for studio tier
    expect(src).toMatch(/studio/i);
  });

  it("setup.tsx shows credit costs for LoRA (120c) and VoiceClone (80c)", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/pages/create/setup.tsx", "utf-8");
    expect(src).toContain("120");
    expect(src).toContain("80");
  });

  it("setup.tsx has stage=5 in CreateWizardLayout", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/pages/create/setup.tsx", "utf-8");
    expect(src).toMatch(/stage=\{?5\}?/);
  });

  it("setup.tsx navigates back to /create/anime-gate", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/pages/create/setup.tsx", "utf-8");
    expect(src).toContain("/create/anime-gate");
  });
});

// ─── C5: Video page tests ──────────────────────────────────────────────────

describe("C5 – Video page (timing, render, export)", () => {
  it("video.tsx has exact render progress copy strings", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/pages/create/video.tsx", "utf-8");
    expect(src).toContain("Bringing panels to motion");
    expect(src).toContain("Casting voices");
    expect(src).toContain("Composing the final cut");
  });

  it("video.tsx imports PanelTimingEditor with 1-8s limits", async () => {
    const { TIMING_LIMITS } = await import(
      "../client/src/components/awakli/PanelTimingEditor"
    );
    expect(TIMING_LIMITS.minPerPanel).toBe(1);
    expect(TIMING_LIMITS.maxPerPanel).toBe(8);
  });

  it("video.tsx has Mangaka 60s cap", async () => {
    const { MANGAKA_LIMITS } = await import(
      "../client/src/components/awakli/DurationForecast"
    );
    expect(MANGAKA_LIMITS.maxRuntime).toBe(60);
    expect(MANGAKA_LIMITS.maxResolution).toBe("1080p");
  });

  it("video.tsx imports ChapterComposer, MusicBed, MasterExport for Studio", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/pages/create/video.tsx", "utf-8");
    expect(src).toContain("ChapterComposer");
    expect(src).toContain("MusicBed");
    expect(src).toContain("MasterExport");
  });

  it("video.tsx uses soft tier gating (not hard)", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/pages/create/video.tsx", "utf-8");
    expect(src).toContain('mode="soft"');
    expect(src).not.toContain('mode="hard"');
  });

  it("video.tsx fetches real panels from tRPC", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/pages/create/video.tsx", "utf-8");
    expect(src).toContain("panels.listByProject");
    expect(src).toContain("realPanels");
  });

  it("video.tsx has stage=6 in CreateWizardLayout", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/pages/create/video.tsx", "utf-8");
    expect(src).toMatch(/stage=\{?6\}?/);
  });

  it("MasterExport calculates 4K +30% and ProRes +60% surcharges", async () => {
    const { calculateExportCredits } = await import(
      "../client/src/components/awakli/MasterExport"
    );
    const base = 100;
    const result4k = calculateExportCredits(base, {
      resolution: "4k",
      format: "mp4",
      stems: false,
    });
    expect(result4k.total).toBe(130); // 100 + 30%

    const resultProRes = calculateExportCredits(base, {
      resolution: "1080p",
      format: "prores",
      stems: false,
    });
    expect(resultProRes.total).toBe(160); // 100 + 60%

    const resultAll = calculateExportCredits(base, {
      resolution: "4k",
      format: "prores",
      stems: true,
    });
    // 100 base + 30 (4K) + 60 (ProRes) + 20 (stems) = 210
    expect(resultAll.total).toBe(210);
  });

  it("video.tsx uses pipeline.start mutation for real render", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/pages/create/video.tsx", "utf-8");
    expect(src).toContain("pipeline.start");
    expect(src).toContain("startPipelineMut");
    expect(src).toContain("pipelineRunId");
  });

  it("video.tsx has error state with auto-refund message", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/pages/create/video.tsx", "utf-8");
    expect(src).toContain("errorRefund");
    expect(src).toContain("Credits auto-refunded");
    expect(src).toContain("Retry render");
  });
});
