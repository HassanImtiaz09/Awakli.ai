import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { buildChapterSystemPrompt, ENHANCED_SCRIPT_SCHEMA } from "./routers-phase13";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-creator",
    email: "creator@example.com",
    name: "Test Creator",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: {
      protocol: "https",
      headers: { origin: "https://test.example.com" },
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: { origin: "https://test.example.com" },
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CHAPTER STRUCTURE SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

describe("Chapter Structure System", () => {
  describe("buildChapterSystemPrompt", () => {
    it("generates a valid system prompt with all parameters", () => {
      const prompt = buildChapterSystemPrompt({
        title: "Test Manga",
        genre: "Action",
        style: "shonen",
        originalPrompt: "A young hero fights evil",
        chapterNumber: 1,
        totalChapters: 5,
        chapterLengthPreset: "standard",
        pacingStyle: "balanced",
        chapterEndingStyle: "cliffhanger",
      });

      expect(prompt).toContain("manga screenwriter");
      expect(prompt).toContain("Test Manga");
      expect(prompt).toContain("Action");
      expect(prompt).toContain("1 of 5");
      expect(prompt).toContain("15-25 panels");
      expect(prompt).toContain("cliffhanger");
    });

    it("includes previous chapter summary when provided", () => {
      const prompt = buildChapterSystemPrompt({
        title: "Test Manga",
        genre: "Romance",
        style: "shoujo",
        originalPrompt: "Love story",
        chapterNumber: 3,
        totalChapters: 10,
        chapterLengthPreset: "long",
        pacingStyle: "dialogue_heavy",
        chapterEndingStyle: "resolution",
        previousChapterSummary: "In the last chapter, they met at the cafe.",
      });

      expect(prompt).toContain("In the last chapter");
      expect(prompt).toContain("25-40 panels");
      expect(prompt).toContain("resolution");
      expect(prompt).toContain("dialogue_heavy");
    });

    it("uses short preset with correct panel range", () => {
      const prompt = buildChapterSystemPrompt({
        title: "Quick Story",
        genre: "Comedy",
        style: "shonen",
        originalPrompt: "Funny story",
        chapterNumber: 1,
        totalChapters: 1,
        chapterLengthPreset: "short",
        pacingStyle: "action_heavy",
        chapterEndingStyle: "serialized",
      });

      expect(prompt).toContain("10-15 panels");
    });
  });

  describe("ENHANCED_SCRIPT_SCHEMA", () => {
    it("has the correct JSON schema structure", () => {
      expect(ENHANCED_SCRIPT_SCHEMA.type).toBe("json_schema");
      expect(ENHANCED_SCRIPT_SCHEMA.json_schema.name).toBe("chapter_script");
      expect(ENHANCED_SCRIPT_SCHEMA.json_schema.strict).toBe(true);

      const schema = ENHANCED_SCRIPT_SCHEMA.json_schema.schema;
      expect(schema.required).toContain("episode_title");
      expect(schema.required).toContain("synopsis");
      expect(schema.required).toContain("panel_count");
      expect(schema.required).toContain("mood_arc");
      expect(schema.required).toContain("chapter_end_type");
      expect(schema.required).toContain("next_chapter_hook");
      expect(schema.required).toContain("scenes");
    });
  });

  describe("chapterEditor.getPresets", () => {
    it("returns presets publicly without authentication", async () => {
      const caller = appRouter.createCaller(createPublicContext());
      const result = await caller.chapterEditor.getPresets();

      expect(result).toBeDefined();
      expect(result).toHaveProperty("lengthPresets");
      expect(result).toHaveProperty("pacingStyles");
      expect(result).toHaveProperty("endingStyles");

      expect(result.lengthPresets.length).toBe(3);
      expect(result.pacingStyles.length).toBe(3);
      expect(result.endingStyles.length).toBe(3);
    });

    it("length presets contain correct keys", async () => {
      const caller = appRouter.createCaller(createPublicContext());
      const result = await caller.chapterEditor.getPresets();

      const keys = result.lengthPresets.map(p => p.key);
      expect(keys).toContain("short");
      expect(keys).toContain("standard");
      expect(keys).toContain("long");
    });

    it("pacing styles contain correct keys", async () => {
      const caller = appRouter.createCaller(createPublicContext());
      const result = await caller.chapterEditor.getPresets();

      const keys = result.pacingStyles.map(p => p.key);
      expect(keys).toContain("action_heavy");
      expect(keys).toContain("dialogue_heavy");
      expect(keys).toContain("balanced");
    });

    it("ending styles contain correct keys", async () => {
      const caller = appRouter.createCaller(createPublicContext());
      const result = await caller.chapterEditor.getPresets();

      const keys = result.endingStyles.map(p => p.key);
      expect(keys).toContain("cliffhanger");
      expect(keys).toContain("resolution");
      expect(keys).toContain("serialized");
    });
  });

  describe("chapterEditor.movePanel", () => {
    it("requires authentication", async () => {
      const caller = appRouter.createCaller(createPublicContext());
      await expect(
        caller.chapterEditor.movePanel({ panelId: 1, targetEpisodeId: 2, targetPosition: 1 })
      ).rejects.toThrow();
    });

    it("throws NOT_FOUND for non-existent panel", async () => {
      const caller = appRouter.createCaller(createAuthContext());
      await expect(
        caller.chapterEditor.movePanel({ panelId: 99999, targetEpisodeId: 1, targetPosition: 1 })
      ).rejects.toThrow();
    });
  });

  describe("chapterEditor.split", () => {
    it("requires authentication", async () => {
      const caller = appRouter.createCaller(createPublicContext());
      await expect(
        caller.chapterEditor.split({ episodeId: 1, splitAtPanelId: 5 })
      ).rejects.toThrow();
    });

    it("throws NOT_FOUND for non-existent episode", async () => {
      const caller = appRouter.createCaller(createAuthContext());
      await expect(
        caller.chapterEditor.split({ episodeId: 99999, splitAtPanelId: 5 })
      ).rejects.toThrow();
    });
  });

  describe("chapterEditor.merge", () => {
    it("requires authentication", async () => {
      const caller = appRouter.createCaller(createPublicContext());
      await expect(
        caller.chapterEditor.merge({ episodeId: 1, mergeWithId: 2 })
      ).rejects.toThrow();
    });

    it("throws NOT_FOUND for non-existent episodes", async () => {
      const caller = appRouter.createCaller(createAuthContext());
      await expect(
        caller.chapterEditor.merge({ episodeId: 99999, mergeWithId: 99998 })
      ).rejects.toThrow();
    });
  });

  describe("chapterEditor.reorderScenes", () => {
    it("requires authentication", async () => {
      const caller = appRouter.createCaller(createPublicContext());
      await expect(
        caller.chapterEditor.reorderScenes({ episodeId: 1, sceneOrder: [2, 1, 3] })
      ).rejects.toThrow();
    });
  });

  describe("chapterEditor.getTimeline", () => {
    it("requires authentication", async () => {
      const caller = appRouter.createCaller(createPublicContext());
      await expect(
        caller.chapterEditor.getTimeline({ projectId: 1 })
      ).rejects.toThrow();
    });

    it("throws FORBIDDEN for non-owned project", async () => {
      const caller = appRouter.createCaller(createAuthContext());
      await expect(
        caller.chapterEditor.getTimeline({ projectId: 99999 })
      ).rejects.toThrow();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ANIME SNEAK PEEK SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

describe("Sneak Peek System", () => {
  describe("sneakPeek.getStatus", () => {
    it("is publicly accessible", async () => {
      const caller = appRouter.createCaller(createPublicContext());
      // Should throw NOT_FOUND for non-existent project, not UNAUTHORIZED
      await expect(
        caller.sneakPeek.getStatus({ projectId: 99999 })
      ).rejects.toThrow("NOT_FOUND");
    });
  });

  describe("sneakPeek.selectScene", () => {
    it("requires authentication", async () => {
      const caller = appRouter.createCaller(createPublicContext());
      await expect(
        caller.sneakPeek.selectScene({ projectId: 1 })
      ).rejects.toThrow();
    });

    it("throws NOT_FOUND for non-owned project", async () => {
      const caller = appRouter.createCaller(createAuthContext());
      await expect(
        caller.sneakPeek.selectScene({ projectId: 99999 })
      ).rejects.toThrow();
    });
  });

  describe("sneakPeek.generate", () => {
    it("requires authentication", async () => {
      const caller = appRouter.createCaller(createPublicContext());
      await expect(
        caller.sneakPeek.generate({ projectId: 1 })
      ).rejects.toThrow();
    });

    it("throws NOT_FOUND for non-owned project", async () => {
      const caller = appRouter.createCaller(createAuthContext());
      await expect(
        caller.sneakPeek.generate({ projectId: 99999 })
      ).rejects.toThrow();
    });
  });

  describe("sneakPeek.getMusicStings", () => {
    it("returns music sting library publicly", async () => {
      const caller = appRouter.createCaller(createPublicContext());
      const result = await caller.sneakPeek.getMusicStings();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(10);

      const sting = result[0];
      expect(sting).toHaveProperty("id");
      expect(sting).toHaveProperty("name");
      expect(sting).toHaveProperty("mood");
      expect(sting).toHaveProperty("durationMs");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DOWNLOAD & EXPORT SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

describe("Download & Export System", () => {
  describe("downloads.getFormats", () => {
    it("requires authentication", async () => {
      const caller = appRouter.createCaller(createPublicContext());
      await expect(
        caller.downloads.getFormats({ projectId: 1 })
      ).rejects.toThrow();
    });

    it("throws NOT_FOUND for non-existent project", async () => {
      const caller = appRouter.createCaller(createAuthContext());
      await expect(
        caller.downloads.getFormats({ projectId: 99999 })
      ).rejects.toThrow();
    });
  });

  describe("downloads.generate", () => {
    it("requires authentication", async () => {
      const caller = appRouter.createCaller(createPublicContext());
      await expect(
        caller.downloads.generate({ projectId: 1, format: "pdf" })
      ).rejects.toThrow();
    });

    it("throws NOT_FOUND for non-existent project", async () => {
      const caller = appRouter.createCaller(createAuthContext());
      await expect(
        caller.downloads.generate({ projectId: 99999, format: "pdf" })
      ).rejects.toThrow();
    });

    it("validates format enum", async () => {
      const caller = appRouter.createCaller(createAuthContext());
      await expect(
        caller.downloads.generate({ projectId: 1, format: "invalid_format" as any })
      ).rejects.toThrow();
    });
  });

  describe("downloads.getStatus", () => {
    it("requires authentication", async () => {
      const caller = appRouter.createCaller(createPublicContext());
      await expect(
        caller.downloads.getStatus({ exportId: 1 })
      ).rejects.toThrow();
    });

    it("throws NOT_FOUND for non-existent export", async () => {
      const caller = appRouter.createCaller(createAuthContext());
      await expect(
        caller.downloads.getStatus({ exportId: 99999 })
      ).rejects.toThrow();
    });
  });

  describe("downloads.listByProject", () => {
    it("requires authentication", async () => {
      const caller = appRouter.createCaller(createPublicContext());
      await expect(
        caller.downloads.listByProject({ projectId: 1 })
      ).rejects.toThrow();
    });

    it("returns empty array for project with no exports", async () => {
      const caller = appRouter.createCaller(createAuthContext());
      // This may return empty or throw depending on project existence
      // The procedure doesn't check project ownership, just filters by userId
      const result = await caller.downloads.listByProject({ projectId: 99999 });
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });

  describe("downloads.estimate", () => {
    it("requires authentication", async () => {
      const caller = appRouter.createCaller(createPublicContext());
      await expect(
        caller.downloads.estimate({ projectId: 1, format: "pdf" })
      ).rejects.toThrow();
    });

    it("returns estimate for valid format", async () => {
      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.downloads.estimate({ projectId: 99999, format: "pdf" });

      expect(result).toBeDefined();
      expect(result).toHaveProperty("format", "pdf");
      expect(result).toHaveProperty("description");
      expect(result).toHaveProperty("estimatedSizeMb");
      expect(result).toHaveProperty("estimatedSizeBytes");
      expect(result).toHaveProperty("chapterCount");
      expect(result).toHaveProperty("unlocked");
      expect(result).toHaveProperty("minTier");
      expect(result).toHaveProperty("userTier");
      expect(typeof result.estimatedSizeMb).toBe("number");
      expect(typeof result.unlocked).toBe("boolean");
    });

    it("returns correct tier for free user", async () => {
      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.downloads.estimate({ projectId: 99999, format: "pdf" });
      expect(result.userTier).toBe("free");
      expect(result.unlocked).toBe(true); // PDF is free tier
    });

    it("returns locked for studio-only formats on free tier", async () => {
      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.downloads.estimate({ projectId: 99999, format: "epub" });
      expect(result.unlocked).toBe(false);
      expect(result.minTier).toBe("studio");
    });

    it("returns DPI info for PDF format", async () => {
      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.downloads.estimate({ projectId: 99999, format: "pdf" });
      expect(result.dpi).toBe(72); // Free tier = 72 DPI
    });

    it("returns watermarked flag for free tier", async () => {
      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.downloads.estimate({ projectId: 99999, format: "pdf" });
      expect(result.watermarked).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SHARING SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

describe("Sharing System", () => {
  describe("sharing.getShareData", () => {
    it("is publicly accessible", async () => {
      const caller = appRouter.createCaller(createPublicContext());
      // Should throw NOT_FOUND for non-existent project, not UNAUTHORIZED
      await expect(
        caller.sharing.getShareData({ projectId: 99999 })
      ).rejects.toThrow("NOT_FOUND");
    });
  });

  describe("sharing.getEmbedCode", () => {
    it("requires authentication", async () => {
      const caller = appRouter.createCaller(createPublicContext());
      await expect(
        caller.sharing.getEmbedCode({ projectId: 1 })
      ).rejects.toThrow();
    });

    it("throws FORBIDDEN for free tier users", async () => {
      const caller = appRouter.createCaller(createAuthContext());
      // Free tier user should be rejected since embed requires Creator+
      await expect(
        caller.sharing.getEmbedCode({ projectId: 1 })
      ).rejects.toThrow();
    });
  });

  describe("sharing.generatePanelImage", () => {
    it("requires authentication", async () => {
      const caller = appRouter.createCaller(createPublicContext());
      await expect(
        caller.sharing.generatePanelImage({ panelId: 1, includeTitle: true })
      ).rejects.toThrow();
    });

    it("throws NOT_FOUND for non-existent panel", async () => {
      const caller = appRouter.createCaller(createAuthContext());
      await expect(
        caller.sharing.generatePanelImage({ panelId: 99999, includeTitle: true })
      ).rejects.toThrow();
    });
  });
});
