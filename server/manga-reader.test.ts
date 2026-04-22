import { describe, it, expect } from "vitest";

// ─── Import copy strings and helpers from MangaReader ─────────────────────
import {
  MANGA_READER_COPY,
} from "../client/src/pages/MangaReader";

// ─── Import OG meta route pattern from server ─────────────────────────────
// (We test the logic inline since the route is embedded in index.ts)

// ─── Copy String Tests ────────────────────────────────────────────────────
describe("MangaReader · Copy Strings", () => {
  it("madeWith matches spec", () => {
    expect(MANGA_READER_COPY.madeWith).toBe("Made with Awakli");
  });

  it("createCta matches spec", () => {
    expect(MANGA_READER_COPY.createCta).toBe("Create your own manga");
  });

  it("watermark matches spec", () => {
    expect(MANGA_READER_COPY.watermark).toBe("Made with Awakli");
  });

  it("shareTitle matches spec", () => {
    expect(MANGA_READER_COPY.shareTitle).toBe("Share this manga");
  });

  it("copyLink matches spec", () => {
    expect(MANGA_READER_COPY.copyLink).toBe("Copy link");
  });

  it("copied matches spec", () => {
    expect(MANGA_READER_COPY.copied).toBe("Copied!");
  });

  it("openTwitter matches spec", () => {
    expect(MANGA_READER_COPY.openTwitter).toBe("Share on X");
  });

  it("openFacebook matches spec", () => {
    expect(MANGA_READER_COPY.openFacebook).toBe("Share on Facebook");
  });

  it("notFound matches spec", () => {
    expect(MANGA_READER_COPY.notFound).toBe("Manga not found");
  });

  it("notFoundSub matches spec", () => {
    expect(MANGA_READER_COPY.notFoundSub).toBe(
      "This episode may have been removed or is not yet published."
    );
  });

  it("backToDiscover matches spec", () => {
    expect(MANGA_READER_COPY.backToDiscover).toBe("Back to Discover");
  });

  it("episode matches spec", () => {
    expect(MANGA_READER_COPY.episode).toBe("Episode");
  });

  it("panels matches spec", () => {
    expect(MANGA_READER_COPY.panels).toBe("panels");
  });

  it("by matches spec", () => {
    expect(MANGA_READER_COPY.by).toBe("by");
  });

  it("fullscreen matches spec", () => {
    expect(MANGA_READER_COPY.fullscreen).toBe("Fullscreen");
  });

  it("exitFullscreen matches spec", () => {
    expect(MANGA_READER_COPY.exitFullscreen).toBe("Exit fullscreen");
  });

  it("scrollToTop matches spec", () => {
    expect(MANGA_READER_COPY.scrollToTop).toBe("Back to top");
  });

  it("nextEpisode matches spec", () => {
    expect(MANGA_READER_COPY.nextEpisode).toBe("Next episode");
  });

  it("prevEpisode matches spec", () => {
    expect(MANGA_READER_COPY.prevEpisode).toBe("Previous episode");
  });
});

// ─── Page Composition Tests ───────────────────────────────────────────────
describe("MangaReader · Page Composition", () => {
  it("exports MANGA_READER_COPY as a non-empty object", () => {
    expect(MANGA_READER_COPY).toBeDefined();
    expect(typeof MANGA_READER_COPY).toBe("object");
    expect(Object.keys(MANGA_READER_COPY).length).toBeGreaterThan(10);
  });

  it("all copy keys are non-empty strings", () => {
    for (const [key, value] of Object.entries(MANGA_READER_COPY)) {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it("no dark-pattern urgency language in copy", () => {
    const urgencyWords = ["hurry", "limited time", "act now", "don't miss", "expires soon", "last chance"];
    for (const value of Object.values(MANGA_READER_COPY)) {
      for (const word of urgencyWords) {
        expect(value.toLowerCase()).not.toContain(word);
      }
    }
  });
});

// ─── incrementView Router Tests ───────────────────────────────────────────
describe("MangaReader · incrementView Procedure", () => {
  it("publicContentRouter exports incrementView (router file compiles)", async () => {
    // Dynamic import to verify the router file compiles without error
    const mod = await import("./routers-public-content");
    expect(mod.publicContentRouter).toBeDefined();
    // Check that the router has the incrementView procedure
    const routerDef = (mod.publicContentRouter as any)._def;
    expect(routerDef).toBeDefined();
    // The router record should have incrementView
    const procedures = routerDef.procedures || routerDef.record;
    expect(procedures).toBeDefined();
    expect(procedures.incrementView).toBeDefined();
  });
});

// ─── OG Meta Injection Tests ──────────────────────────────────────────────
describe("MangaReader · OG Meta Injection", () => {
  // These test the social bot regex pattern used in server/_core/index.ts
  const SOCIAL_BOT_RE = /facebookexternalhit|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|TelegramBot|Googlebot|bingbot|Baiduspider/i;

  it("detects Facebook crawler", () => {
    expect(SOCIAL_BOT_RE.test("facebookexternalhit/1.1")).toBe(true);
  });

  it("detects Twitter bot", () => {
    expect(SOCIAL_BOT_RE.test("Twitterbot/1.0")).toBe(true);
  });

  it("detects LinkedIn bot", () => {
    expect(SOCIAL_BOT_RE.test("LinkedInBot/1.0")).toBe(true);
  });

  it("detects Slack bot", () => {
    expect(SOCIAL_BOT_RE.test("Slackbot-LinkExpanding 1.0")).toBe(true);
  });

  it("detects Discord bot", () => {
    expect(SOCIAL_BOT_RE.test("Discordbot/2.0")).toBe(true);
  });

  it("detects WhatsApp", () => {
    expect(SOCIAL_BOT_RE.test("WhatsApp/2.21.4.22")).toBe(true);
  });

  it("detects Telegram bot", () => {
    expect(SOCIAL_BOT_RE.test("TelegramBot (like TwitterBot)")).toBe(true);
  });

  it("detects Googlebot", () => {
    expect(SOCIAL_BOT_RE.test("Googlebot/2.1")).toBe(true);
  });

  it("does NOT match regular browser UA", () => {
    expect(SOCIAL_BOT_RE.test("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")).toBe(false);
  });

  it("does NOT match mobile Safari UA", () => {
    expect(SOCIAL_BOT_RE.test("Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15")).toBe(false);
  });
});

// ─── Route Registration Tests ─────────────────────────────────────────────
describe("MangaReader · Route Registration", () => {
  it("App.tsx imports MangaReader", async () => {
    const fs = await import("fs");
    const appContent = fs.readFileSync("client/src/App.tsx", "utf-8");
    expect(appContent).toContain('import MangaReader from "./pages/MangaReader"');
  });

  it("App.tsx registers /m/:slug route", async () => {
    const fs = await import("fs");
    const appContent = fs.readFileSync("client/src/App.tsx", "utf-8");
    expect(appContent).toContain('/m/:slug');
    expect(appContent).toContain('component={MangaReader}');
  });

  it("sitemap includes /m/ URLs for published projects", async () => {
    const fs = await import("fs");
    const indexContent = fs.readFileSync("server/_core/index.ts", "utf-8");
    expect(indexContent).toContain("/m/${p.slug}");
  });
});

// ─── SEO Tests ────────────────────────────────────────────────────────────
describe("MangaReader · SEO", () => {
  it("server OG meta injection route is registered before tRPC", async () => {
    const fs = await import("fs");
    const indexContent = fs.readFileSync("server/_core/index.ts", "utf-8");
    const ogMetaPos = indexContent.indexOf("OG Meta Injection");
    const trpcPos = indexContent.indexOf("/api/trpc");
    expect(ogMetaPos).toBeGreaterThan(-1);
    expect(trpcPos).toBeGreaterThan(-1);
    expect(ogMetaPos).toBeLessThan(trpcPos);
  });

  it("OG meta includes required OpenGraph tags", async () => {
    const fs = await import("fs");
    const indexContent = fs.readFileSync("server/_core/index.ts", "utf-8");
    expect(indexContent).toContain('og:title');
    expect(indexContent).toContain('og:description');
    expect(indexContent).toContain('og:image');
    expect(indexContent).toContain('og:url');
    expect(indexContent).toContain('og:site_name');
    expect(indexContent).toContain('twitter:card');
    expect(indexContent).toContain('twitter:title');
    expect(indexContent).toContain('twitter:image');
  });

  it("OG meta uses summary_large_image Twitter card", async () => {
    const fs = await import("fs");
    const indexContent = fs.readFileSync("server/_core/index.ts", "utf-8");
    expect(indexContent).toContain('summary_large_image');
  });

  it("MangaReader uses SEOHead component", async () => {
    const fs = await import("fs");
    const readerContent = fs.readFileSync("client/src/pages/MangaReader.tsx", "utf-8");
    expect(readerContent).toContain("SEOHead");
    expect(readerContent).toContain('type="article"');
  });
});

// ─── Analytics Tests ──────────────────────────────────────────────────────
describe("MangaReader · Analytics", () => {
  it("MangaReader calls incrementView on load", async () => {
    const fs = await import("fs");
    const readerContent = fs.readFileSync("client/src/pages/MangaReader.tsx", "utf-8");
    expect(readerContent).toContain("incrementView.mutate");
    expect(readerContent).toContain("trpc.publicContent.incrementView.useMutation");
  });
});
