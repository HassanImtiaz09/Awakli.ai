import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf-8");
}

/* ═══════════════════════════════════════════════════════════════════════
   B6-Phase1 — Hotfix: React error #310 + Trending filter
   ═══════════════════════════════════════════════════════════════════════ */
describe("B6-Phase1: WatchProject defensive guards", () => {
  const src = read("client/src/pages/WatchProject.tsx");

  it("useMemo for jsonLd is null-safe (checks for p before accessing properties)", () => {
    // The jsonLd useMemo should have a null guard
    const jsonLdIdx = src.indexOf("const jsonLd = useMemo");
    expect(jsonLdIdx).toBeGreaterThan(-1);
    const memoBlock = src.slice(jsonLdIdx, jsonLdIdx + 200);
    expect(memoBlock).toContain("if (!p)");
  });
});

describe("B6-Phase1: Home.tsx Trending filter", () => {
  const src = read("client/src/pages/Home.tsx");

  it("filters live titles before rendering", () => {
    expect(src).toContain("filterLiveTitles");
  });

  it("shows 'More coming tonight' fallback when catalog is empty", () => {
    expect(src).toContain("More titles coming tonight");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   B5 — Nav rename + regroup
   ═══════════════════════════════════════════════════════════════════════ */
describe("B5: Navigation rename and regroup", () => {
  const topNav = read("client/src/components/awakli/TopNav.tsx");
  const footer = read("client/src/components/awakli/MarketingFooter.tsx");

  it("TopNav uses 'Watch' instead of 'Feed'", () => {
    // Should have Watch label, not Feed
    expect(topNav).toContain("Watch");
    expect(topNav).not.toMatch(/label:\s*["']Feed["']/);
  });

  it("TopNav uses 'Characters' instead of 'Codex'", () => {
    expect(topNav).toContain("Characters");
    expect(topNav).not.toMatch(/label:\s*["']Codex["']/);
  });

  it("TopNav uses 'Vote' instead of 'Compete'", () => {
    expect(topNav).toContain("Vote");
    expect(topNav).not.toMatch(/label:\s*["']Compete["']/);
  });

  it("TopNav includes Pricing tab", () => {
    expect(topNav).toContain("Pricing");
  });

  it("TopNav has creator and audience nav clusters", () => {
    expect(topNav).toContain("CREATOR_NAV");
    expect(topNav).toContain("AUDIENCE_NAV");
  });

  it("Footer labels match new nav names", () => {
    expect(footer).toContain("Watch");
    expect(footer).toContain("Characters");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   B2 — Logo system
   ═══════════════════════════════════════════════════════════════════════ */
describe("B2: Logo component", () => {
  const logo = read("client/src/components/awakli/Logo.tsx");
  const topNav = read("client/src/components/awakli/TopNav.tsx");

  it("Logo.tsx exports Logo component with variant and theme props", () => {
    expect(logo).toContain("variant");
    expect(logo).toContain("theme");
    expect(logo).toMatch(/mark|horizontal|stacked/);
  });

  it("Logo.tsx contains SVG mark", () => {
    expect(logo).toContain("<svg");
    expect(logo).toContain("viewBox");
  });

  it("TopNav imports and uses Logo component instead of text-only AWAKLI", () => {
    expect(topNav).toContain("Logo");
    // Should import from Logo.tsx
    expect(topNav).toMatch(/import.*Logo/);
  });

  it("Logo has animated stroke-reveal class", () => {
    expect(logo).toContain("logo-stroke-reveal");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   B1 — Typography
   ═══════════════════════════════════════════════════════════════════════ */
describe("B1: Typography update", () => {
  const indexHtml = read("client/index.html");
  const indexCss = read("client/src/index.css");

  it("index.html loads Klee One from Google Fonts", () => {
    expect(indexHtml).toContain("Klee+One");
  });

  it("index.html loads Inter Tight from Google Fonts", () => {
    expect(indexHtml).toContain("Inter+Tight");
  });

  it("CSS tokens use Klee One for display font", () => {
    expect(indexCss).toContain("Klee One");
  });

  it("CSS tokens use Inter Tight for body font", () => {
    expect(indexCss).toContain("Inter Tight");
  });

  it("Hero font size is scaled down (clamp with 6.5rem max)", () => {
    expect(indexCss).toMatch(/6\.5rem/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   B3 — Demo video section
   ═══════════════════════════════════════════════════════════════════════ */
describe("B3: WatchItHappen component", () => {
  const comp = read("client/src/components/awakli/WatchItHappen.tsx");
  const home = read("client/src/pages/Home.tsx");

  it("WatchItHappen has autoplay-on-scroll video element", () => {
    expect(comp).toContain("<video");
    expect(comp).toContain("muted");
    expect(comp).toContain("playsInline");
  });

  it("WatchItHappen has 'Try the demo prompt' CTA", () => {
    expect(comp).toContain("Try the demo prompt");
  });

  it("WatchItHappen has 3-up proof strip", () => {
    expect(comp).toContain("PROOF_STAGES");
    expect(comp).toContain("Prompt");
    expect(comp).toContain("Script + Panels");
    expect(comp).toContain("Anime Ready");
  });

  it("WatchItHappen is imported and rendered in Home.tsx", () => {
    expect(home).toContain("WatchItHappen");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   B4 — Streaming rail
   ═══════════════════════════════════════════════════════════════════════ */
describe("B4: Streaming rail", () => {
  const streaming = read("client/src/components/awakli/StreamingTonight.tsx");
  const marquee = read("client/src/components/awakli/MarqueeStrip.tsx");
  const home = read("client/src/pages/Home.tsx");

  it("StreamingTonight has 'Free to watch' label", () => {
    expect(streaming).toContain("Free to watch");
  });

  it("StreamingTonight shows genre chips", () => {
    expect(streaming).toContain("genre");
    expect(streaming).toContain("GENRE_COLORS");
  });

  it("StreamingTonight has play overlay on hover", () => {
    expect(streaming).toContain("Play");
  });

  it("MarqueeStrip has CSS animation", () => {
    expect(marquee).toContain("marquee-track");
  });

  it("Home.tsx has second hero CTA 'Watch what the community made'", () => {
    expect(home).toContain("Watch what the community made");
  });

  it("Home.tsx renders StreamingTonight and MarqueeStrip", () => {
    expect(home).toContain("StreamingTonight");
    expect(home).toContain("MarqueeStrip");
  });

  it("Home.tsx section order: Hero → WatchItHappen → StreamingTonight → MarqueeStrip → Proof", () => {
    const heroIdx = home.indexOf("ActOneHero");
    const watchIdx = home.indexOf("WatchItHappen", heroIdx);
    const streamIdx = home.indexOf("StreamingTonight", watchIdx);
    const marqueeIdx = home.indexOf("MarqueeStrip", streamIdx);
    const proofIdx = home.indexOf("ActTwoProof", marqueeIdx);
    expect(heroIdx).toBeGreaterThan(-1);
    expect(watchIdx).toBeGreaterThan(heroIdx);
    expect(streamIdx).toBeGreaterThan(watchIdx);
    expect(marqueeIdx).toBeGreaterThan(streamIdx);
    expect(proofIdx).toBeGreaterThan(marqueeIdx);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   B6-Phase2/3 — Seed content + self-healing
   ═══════════════════════════════════════════════════════════════════════ */
describe("B6-Phase2/3: Defensive rendering + rerank job", () => {
  it("rerankTrending job skeleton exists and exports rerankTrending function", () => {
    const job = read("server/jobs/rerankTrending.ts");
    expect(job).toContain("export async function rerankTrending");
    expect(job).toContain("MINIMUM_LIVE_THRESHOLD");
  });

  it("Home.tsx has 'More titles coming tonight' fallback", () => {
    const home = read("client/src/pages/Home.tsx");
    expect(home).toContain("More titles coming tonight");
  });

  it("StreamingTonight has empty state fallback", () => {
    const streaming = read("client/src/components/awakli/StreamingTonight.tsx");
    expect(streaming).toContain("More titles streaming tonight");
  });
});
