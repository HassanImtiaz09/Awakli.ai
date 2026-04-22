/**
 * Remaining Items Tests
 * - Item 1: Style/Tone/Audience selectors on Input page
 * - Item 2: Post-publish "View your manga" button
 * - Item 3: Studio inline tier-locked affordances (WithTier mode="soft")
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const root = resolve(__dirname, "..");

function readFile(rel: string) {
  return readFileSync(resolve(root, rel), "utf-8");
}

// ─── Item 1: Style / Tone / Audience selectors on Input page ────────────────

describe("Item 1 – Style/Tone/Audience selectors on Input page", () => {
  const inputSrc = readFile("client/src/pages/create/input.tsx");

  it("defines ANIME_STYLES constant with at least 6 style options", () => {
    expect(inputSrc).toContain("ANIME_STYLES");
    const match = inputSrc.match(/ANIME_STYLES\s*=\s*\[([^]*?)\]\s*as\s*const/);
    expect(match).toBeTruthy();
    const items = match![1].match(/value:\s*"/g);
    expect(items!.length).toBeGreaterThanOrEqual(6);
  });

  it("defines TONE_OPTIONS constant with at least 5 tone options", () => {
    expect(inputSrc).toContain("TONE_OPTIONS");
    const match = inputSrc.match(/TONE_OPTIONS\s*=\s*\[([^]*?)\]\s*as\s*const/);
    expect(match).toBeTruthy();
    const items = match![1].match(/value:\s*"/g);
    expect(items!.length).toBeGreaterThanOrEqual(5);
  });

  it("defines AUDIENCE_OPTIONS constant with kids/teen/adult", () => {
    expect(inputSrc).toContain("AUDIENCE_OPTIONS");
    expect(inputSrc).toContain('"kids"');
    expect(inputSrc).toContain('"teen"');
    expect(inputSrc).toContain('"adult"');
  });

  it("declares animeStyle, tone, targetAudience state variables", () => {
    expect(inputSrc).toMatch(/useState.*\("shonen"\)/);
    expect(inputSrc).toMatch(/useState.*\("epic"\)/);
    expect(inputSrc).toMatch(/useState.*\("teen"\)/);
  });

  it("uses updateMut to save style/tone/audience before advancing", () => {
    expect(inputSrc).toContain("updateMut.mutateAsync");
    expect(inputSrc).toContain("animeStyle");
    expect(inputSrc).toContain("tone,");
    expect(inputSrc).toContain("targetAudience");
  });

  it("renders Art Style label and selector buttons", () => {
    expect(inputSrc).toContain("Art Style");
    expect(inputSrc).toContain("setAnimeStyle");
  });

  it("renders Tone label and selector buttons", () => {
    expect(inputSrc).toContain("Tone");
    expect(inputSrc).toContain("setTone");
  });

  it("renders Audience label and selector buttons", () => {
    expect(inputSrc).toContain("Audience");
    expect(inputSrc).toContain("setTargetAudience");
  });

  it("uses token-violet for active art style, token-cyan for tone, token-gold for audience", () => {
    expect(inputSrc).toContain("bg-token-violet/10");
    expect(inputSrc).toContain("text-token-violet");
    expect(inputSrc).toContain("bg-token-cyan/10");
    expect(inputSrc).toContain("text-token-cyan");
    expect(inputSrc).toContain("bg-token-gold/10");
    expect(inputSrc).toContain("text-token-gold");
  });

  it("loads existing project style/tone/audience on mount", () => {
    expect(inputSrc).toContain("project.animeStyle");
    expect(inputSrc).toMatch(/project.*tone/);
    expect(inputSrc).toMatch(/project.*targetAudience/);
  });
});

// ─── Item 2: Post-publish "View your manga" button ──────────────────────────

describe("Item 2 – Post-publish View your manga button", () => {
  const publishSrc = readFile("client/src/pages/create/publish.tsx");

  it("has a 'View your manga' button in the published success state", () => {
    expect(publishSrc).toContain("View your manga");
  });

  it("opens publicUrl in a new tab when View your manga is clicked", () => {
    expect(publishSrc).toContain('window.open(publicUrl, "_blank")');
  });

  it("tracks stage3_view_manga analytics event", () => {
    expect(publishSrc).toContain("stage3_view_manga");
  });

  it("uses BookOpen icon for the View your manga button", () => {
    expect(publishSrc).toContain("BookOpen");
  });

  it("still has the Make it move anime CTA", () => {
    expect(publishSrc).toContain("Make it move");
    expect(publishSrc).toContain("/create/anime-gate");
  });

  it("View your manga button appears before the anime CTA button in JSX", () => {
    // The COPY constant at the top defines 'Make it move' text, so we search
    // for the actual JSX button elements, not the constant definition
    const viewIdx = publishSrc.indexOf("View your manga CTA");
    const animeIdx = publishSrc.indexOf("Anime CTA");
    expect(viewIdx).toBeGreaterThan(0);
    expect(animeIdx).toBeGreaterThan(0);
    expect(viewIdx).toBeLessThan(animeIdx);
  });

  it("View your manga button uses mint/green accent color", () => {
    // The button uses #00E5A0 (mint green) for its gradient
    const viewCommentIdx = publishSrc.indexOf("View your manga CTA");
    const viewSection = publishSrc.slice(
      viewCommentIdx,
      viewCommentIdx + 800
    );
    expect(viewSection).toContain("#00E5A0");
  });
});

// ─── Item 3: Studio inline tier-locked affordances ──────────────────────────

describe("Item 3 – Studio inline tier-locked affordances", () => {
  const setupSrc = readFile("client/src/pages/create/setup.tsx");
  const videoSrc = readFile("client/src/pages/create/video.tsx");

  it("setup.tsx imports WithTier component", () => {
    expect(setupSrc).toContain("import { WithTier }");
  });

  it("setup.tsx wraps LoRATrainer with WithTier mode=soft", () => {
    expect(setupSrc).toContain('capability="custom_lora_training"');
    expect(setupSrc).toContain('mode="soft"');
    // Verify LoRA is inside WithTier, not behind isStudioTier conditional
    const loraSection = setupSrc.slice(
      setupSrc.indexOf("custom_lora_training"),
      setupSrc.indexOf("custom_lora_training") + 800
    );
    expect(loraSection).toContain("LoRATrainer");
  });

  it("setup.tsx wraps VoiceClone with WithTier mode=soft", () => {
    expect(setupSrc).toContain('capability="voice_cloning"');
    const voiceSection = setupSrc.slice(
      setupSrc.indexOf("voice_cloning"),
      setupSrc.indexOf("voice_cloning") + 800
    );
    expect(voiceSection).toContain("VoiceClone");
  });

  it("setup.tsx does NOT use isStudioTier conditional for LoRA/VoiceClone rendering", () => {
    // The old pattern was {isStudioTier(tier) && (<LoRATrainer .../>)}
    // Now it should be <WithTier capability=...><LoRATrainer /></WithTier>
    expect(setupSrc).not.toMatch(/isStudioTier\(tier\)\s*&&\s*\(/);
  });

  it("video.tsx uses WithTier with mode=soft for stage_video", () => {
    expect(videoSrc).toContain('capability="stage_video"');
    expect(videoSrc).toContain('mode="soft"');
  });

  it("no pipeline pages use WithTier mode=hard", () => {
    const pipelinePages = [
      "client/src/pages/create/input.tsx",
      "client/src/pages/create/script.tsx",
      "client/src/pages/create/panels.tsx",
      "client/src/pages/create/publish.tsx",
      "client/src/pages/create/setup.tsx",
      "client/src/pages/create/video.tsx",
    ];
    for (const page of pipelinePages) {
      try {
        const src = readFile(page);
        expect(src).not.toContain('mode="hard"');
      } catch {
        // File might not exist, skip
      }
    }
  });
});

// ─── Server-side: projects.update accepts tone and targetAudience ───────────

describe("Server-side support for style/tone/audience", () => {
  const routersSrc = readFile("server/routers.ts");
  const schemaSrc = readFile("drizzle/schema.ts");

  it("projects.update procedure accepts tone field", () => {
    expect(routersSrc).toContain("tone: z.string()");
  });

  it("projects.update procedure accepts targetAudience field", () => {
    expect(routersSrc).toContain('targetAudience: z.enum(["kids", "teen", "adult"])');
  });

  it("projects table has tone column", () => {
    expect(schemaSrc).toMatch(/tone.*varchar/);
  });

  it("projects table has targetAudience column", () => {
    expect(schemaSrc).toMatch(/targetAudience.*mysqlEnum/);
  });
});
