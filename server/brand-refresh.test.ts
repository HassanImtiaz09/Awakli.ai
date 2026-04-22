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

  it("TopNav uses 'Discover' instead of 'Watch' or 'Feed'", () => {
    expect(topNav).toContain("Discover");
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
    expect(footer).toContain("Discover");
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
    expect(topNav).toMatch(/import.*Logo/);
  });

  it("Logo has animated stroke-reveal class", () => {
    expect(logo).toContain("logo-stroke-reveal");
  });

  it("Logo uses Bebas Neue display font for wordmark", () => {
    expect(logo).toContain("font-display");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   B1 — Typography
   ═══════════════════════════════════════════════════════════════════════ */
describe("B1: Typography update", () => {
  const indexHtml = read("client/index.html");
  const indexCss = read("client/src/index.css");

  it("index.html loads Bebas Neue from Google Fonts", () => {
    expect(indexHtml).toContain("Bebas+Neue");
  });

  it("index.html loads Space Grotesk from Google Fonts", () => {
    expect(indexHtml).toContain("Space+Grotesk");
  });

  it("index.html loads Inter Tight from Google Fonts", () => {
    expect(indexHtml).toContain("Inter+Tight");
  });

  it("CSS tokens use Bebas Neue for display font", () => {
    expect(indexCss).toContain("Bebas Neue");
  });

  it("CSS tokens use Space Grotesk for heading font", () => {
    expect(indexCss).toContain("Space Grotesk");
  });

  it("CSS tokens use Inter Tight for body font", () => {
    expect(indexCss).toContain("Inter Tight");
  });

  it("Hero font size is scaled down (clamp with 6.5rem max)", () => {
    expect(indexCss).toMatch(/6\.5rem/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   B3/B4 — Homepage section trim (UI Improvement Brief)
   Sections WatchItHappen, StreamingTonight, MarqueeStrip are commented
   out in Home.tsx and deferred until real content exists.
   ═══════════════════════════════════════════════════════════════════════ */
describe("Homepage trim: 5-section layout", () => {
  const home = read("client/src/pages/Home.tsx");

  it("WatchItHappen, StreamingTonight, MarqueeStrip imports are commented out", () => {
    // Should NOT have active imports
    expect(home).not.toMatch(/^import.*WatchItHappen/m);
    expect(home).not.toMatch(/^import.*StreamingTonight/m);
    expect(home).not.toMatch(/^import.*MarqueeStrip/m);
  });

  it("Removed sections are preserved as comments for future re-enable", () => {
    expect(home).toContain("re-enable when real content exists");
  });

  it("Home.tsx section order: Hero → Proof → FeatureStrip → Content → Invitation", () => {
    const heroIdx = home.indexOf("ActOneHero");
    const proofIdx = home.indexOf("ActTwoProof", heroIdx);
    const featureIdx = home.indexOf("FeatureStrip", proofIdx);
    const invitationIdx = home.indexOf("ActThreeInvitation", featureIdx);
    expect(heroIdx).toBeGreaterThan(-1);
    expect(proofIdx).toBeGreaterThan(heroIdx);
    expect(featureIdx).toBeGreaterThan(proofIdx);
    expect(invitationIdx).toBeGreaterThan(featureIdx);
  });

  it("Scroll indicator is removed", () => {
    expect(home).not.toContain("tracking-widest font-mono\">Scroll</span>");
  });

  it("Home.tsx has 'More titles coming tonight' fallback", () => {
    expect(home).toContain("More titles coming tonight");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   B3/B4 — Component files still exist (not deleted, just unused)
   ═══════════════════════════════════════════════════════════════════════ */
describe("Deferred components still exist for future use", () => {
  it("WatchItHappen.tsx still exists", () => {
    const comp = read("client/src/components/awakli/WatchItHappen.tsx");
    expect(comp).toContain("<video");
  });

  it("StreamingTonight.tsx still exists", () => {
    const comp = read("client/src/components/awakli/StreamingTonight.tsx");
    expect(comp).toContain("Free to watch");
  });

  it("MarqueeStrip.tsx still exists", () => {
    const comp = read("client/src/components/awakli/MarqueeStrip.tsx");
    expect(comp).toContain("marquee-track");
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

  it("StreamingTonight has empty state fallback", () => {
    const streaming = read("client/src/components/awakli/StreamingTonight.tsx");
    expect(streaming).toContain("More titles streaming tonight");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   UI Improvement Brief — Navigation cleanup
   ═══════════════════════════════════════════════════════════════════════ */
describe("UI Brief: Navigation transparency + contrast", () => {
  const topNav = read("client/src/components/awakli/TopNav.tsx");

  it("TopNav uses scroll-based opacity transition (transparent-to-solid)", () => {
    expect(topNav).toContain("scrollY");
    expect(topNav).toMatch(/bg-\[#0D0D1A\]/);
  });

  it("TopNav inactive links use higher contrast text (not /20 or /30)", () => {
    // Inactive links should use at least text-white/60 or similar
    expect(topNav).toMatch(/text-\[#(9494B8|F0F0F5|B8B8CC)\]/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   UI Improvement Brief — Pricing page view toggle
   ═══════════════════════════════════════════════════════════════════════ */
describe("UI Brief: Pricing comparison toggle", () => {
  const pricing = read("client/src/pages/Pricing.tsx");

  it("Pricing page has Cards and Compare view toggle buttons", () => {
    expect(pricing).toContain("Cards");
    expect(pricing).toContain("Compare");
  });

  it("Pricing page imports LayoutGrid and Table2 icons", () => {
    expect(pricing).toContain("LayoutGrid");
    expect(pricing).toContain("Table2");
  });

  it("Pricing page has PricingView state type", () => {
    expect(pricing).toContain("PricingView");
    expect(pricing).toMatch(/\"cards\"\s*\|\s*\"table\"/);
  });

  it("Pricing page conditionally renders cards or table based on view state", () => {
    expect(pricing).toContain('view === "cards"');
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   UI Improvement Brief — Discover page cleanup
   ═══════════════════════════════════════════════════════════════════════ */
describe("UI Brief: Discover page badge removal", () => {
  const discover = read("client/src/pages/Discover.tsx");

  it("Just Created row does NOT have AI Generated badge", () => {
    expect(discover).not.toContain("AI Generated");
  });

  it("Just Created row still has the Wand2 icon", () => {
    expect(discover).toContain("Wand2");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   UI Improvement Brief — Leaderboard progress rings
   ═══════════════════════════════════════════════════════════════════════ */
describe("UI Brief: Leaderboard circular progress rings", () => {
  const leaderboard = read("client/src/pages/Leaderboard.tsx");

  it("RisingRow uses SVG circle elements for progress ring", () => {
    expect(leaderboard).toContain("<circle");
    expect(leaderboard).toContain("strokeDasharray");
  });

  it("Progress ring has gradient definition", () => {
    expect(leaderboard).toContain("ring-grad-row");
    expect(leaderboard).toContain("linearGradient");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   UI Improvement Brief — Characters empty state
   ═══════════════════════════════════════════════════════════════════════ */
describe("UI Brief: Characters empty state redesign", () => {
  const chars = read("client/src/pages/CharacterLibrary.tsx");

  it("Toolbar is conditionally hidden when character list is empty", () => {
    expect(chars).toMatch(/characters\s*&&\s*characters\.length\s*>\s*0\s*&&\s*<div/);
  });

  it("Empty state has how-it-works mini-steps", () => {
    expect(chars).toContain("Create");
    expect(chars).toContain("Upload");
    expect(chars).toContain("Train");
    expect(chars).toContain("Animate");
    expect(chars).toContain("Reference sheets");
  });

  it("Empty state has decorative spinning ring", () => {
    expect(chars).toContain("spin_20s_linear_infinite");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   UI Improvement Brief — Create dashboard cleanup
   ═══════════════════════════════════════════════════════════════════════ */
describe("UI Brief: Create dashboard cleanup", () => {
  const create = read("client/src/pages/CreateDashboard.tsx");

  it("Active projects grid does NOT have a duplicate New Project card", () => {
    // The grid should not contain a dashed border new-project card
    const gridSection = create.slice(
      create.indexOf("Active projects grid"),
      create.indexOf("Archived projects")
    );
    expect(gridSection).not.toContain("border-dashed");
    expect(gridSection).not.toContain("New Project");
  });

  it("Header still has the New Project button", () => {
    const headerSection = create.slice(
      create.indexOf("Header"),
      create.indexOf("Loading state")
    );
    expect(headerSection).toContain("New Project");
  });
});
