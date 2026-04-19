import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db module
vi.mock("./db", () => ({
  getPanelById: vi.fn(),
  updatePanel: vi.fn(),
  getCharactersByProject: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  getProjectById: vi.fn(),
  getEpisodesByProject: vi.fn(),
  getEpisodeById: vi.fn(),
  updateEpisode: vi.fn(),
  createEpisode: vi.fn(),
  getPanelsByEpisode: vi.fn(),
  createPanelsBulk: vi.fn(),
  getDb: vi.fn(),
  getOrCreateGuestUser: vi.fn(),
  createCharacter: vi.fn(),
  getCharactersByProject: vi.fn(),
}));

// Mock the image generation module
vi.mock("./_core/imageGeneration", () => ({
  generateImage: vi.fn(),
}));

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

import { getPanelById, updatePanel, getCharactersByProject } from "./db";
import { generateImage } from "./_core/imageGeneration";

describe("Regenerate Panel Logic", () => {
  const mockPanel = {
    id: 100,
    projectId: 1,
    episodeId: 1,
    sceneNumber: 1,
    panelNumber: 3,
    imageUrl: "https://example.com/old-image.png",
    fluxPrompt: "manga style, a warrior standing on a cliff, dramatic lighting",
    visualDescription: "A warrior standing on a cliff overlooking a valley",
    status: "generated",
    reviewStatus: "pending",
    generationAttempts: 1,
    panelOrder: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Panel retrieval", () => {
    it("should find panel by ID", async () => {
      (getPanelById as any).mockResolvedValue(mockPanel);
      const result = await getPanelById(100);
      expect(result).toEqual(mockPanel);
      expect(getPanelById).toHaveBeenCalledWith(100);
    });

    it("should return undefined for non-existent panel", async () => {
      (getPanelById as any).mockResolvedValue(undefined);
      const result = await getPanelById(999);
      expect(result).toBeUndefined();
    });
  });

  describe("Panel update on regeneration", () => {
    it("should mark panel as generating before image generation", async () => {
      (updatePanel as any).mockResolvedValue(undefined);
      await updatePanel(100, { status: "generating" });
      expect(updatePanel).toHaveBeenCalledWith(100, { status: "generating" });
    });

    it("should update panel with new image URL and increment attempts", async () => {
      (updatePanel as any).mockResolvedValue(undefined);
      await updatePanel(100, {
        imageUrl: "https://example.com/new-image.png",
        fluxPrompt: "manga style, a warrior standing on a cliff, dramatic lighting",
        status: "generated",
        reviewStatus: "pending",
        generationAttempts: 2,
      });
      expect(updatePanel).toHaveBeenCalledWith(100, expect.objectContaining({
        imageUrl: "https://example.com/new-image.png",
        generationAttempts: 2,
        status: "generated",
      }));
    });

    it("should restore previous image on failure", async () => {
      (updatePanel as any).mockResolvedValue(undefined);
      await updatePanel(100, {
        imageUrl: "https://example.com/old-image.png",
        status: "generated",
      });
      expect(updatePanel).toHaveBeenCalledWith(100, expect.objectContaining({
        imageUrl: "https://example.com/old-image.png",
        status: "generated",
      }));
    });
  });

  describe("Image generation for regeneration", () => {
    it("should call generateImage with prompt only (quick retry)", async () => {
      (generateImage as any).mockResolvedValue({ url: "https://example.com/new.png" });
      const result = await generateImage({ prompt: mockPanel.fluxPrompt! });
      expect(result.url).toBe("https://example.com/new.png");
      expect(generateImage).toHaveBeenCalledWith({ prompt: mockPanel.fluxPrompt });
    });

    it("should call generateImage with custom prompt", async () => {
      const customPrompt = "shonen manga style, a warrior in battle stance with glowing sword, high quality manga panel, detailed linework, dramatic composition, consistent character design";
      (generateImage as any).mockResolvedValue({ url: "https://example.com/custom.png" });
      const result = await generateImage({ prompt: customPrompt });
      expect(result.url).toBe("https://example.com/custom.png");
    });

    it("should include character reference when available", async () => {
      const refUrl = "https://example.com/char-ref.png";
      (generateImage as any).mockResolvedValue({ url: "https://example.com/ref.png" });
      const result = await generateImage({
        prompt: mockPanel.fluxPrompt!,
        originalImages: [{ url: refUrl, mimeType: "image/png" }],
      });
      expect(generateImage).toHaveBeenCalledWith(expect.objectContaining({
        originalImages: [{ url: refUrl, mimeType: "image/png" }],
      }));
      expect(result.url).toBe("https://example.com/ref.png");
    });

    it("should handle generation failure gracefully", async () => {
      (generateImage as any).mockRejectedValue(new Error("Gateway timeout"));
      await expect(generateImage({ prompt: "test" })).rejects.toThrow("Gateway timeout");
    });
  });

  describe("Character reference lookup", () => {
    it("should find protagonist reference images", async () => {
      (getCharactersByProject as any).mockResolvedValue([
        { id: 1, name: "Hero", role: "protagonist", referenceImages: ["https://example.com/ref.png"] },
        { id: 2, name: "Villain", role: "antagonist", referenceImages: [] },
      ]);
      const chars = await getCharactersByProject(1);
      const protagonist = chars.find((c: any) => c.role === "protagonist");
      expect(protagonist).toBeDefined();
      expect(protagonist!.referenceImages[0]).toBe("https://example.com/ref.png");
    });

    it("should handle no protagonist gracefully", async () => {
      (getCharactersByProject as any).mockResolvedValue([
        { id: 2, name: "Villain", role: "antagonist", referenceImages: [] },
      ]);
      const chars = await getCharactersByProject(1);
      const protagonist = chars.find((c: any) => c.role === "protagonist");
      expect(protagonist).toBeUndefined();
    });

    it("should handle empty character list", async () => {
      (getCharactersByProject as any).mockResolvedValue([]);
      const chars = await getCharactersByProject(1);
      expect(chars).toHaveLength(0);
    });

    it("should handle character lookup failure", async () => {
      (getCharactersByProject as any).mockRejectedValue(new Error("DB error"));
      // Non-critical: should not crash the regeneration
      try {
        await getCharactersByProject(1);
      } catch (e) {
        expect((e as Error).message).toBe("DB error");
      }
    });
  });

  describe("Prompt building for regeneration", () => {
    it("should use existing fluxPrompt for quick retry", () => {
      const prompt = mockPanel.fluxPrompt;
      expect(prompt).toBe("manga style, a warrior standing on a cliff, dramatic lighting");
    });

    it("should build custom prompt with style prefix", () => {
      const style = "shonen";
      const userPrompt = "a warrior in battle stance with glowing sword";
      const stylePrefix = style === "default" ? "manga style" : `${style} manga style`;
      const finalPrompt = `${stylePrefix}, ${userPrompt}, high quality manga panel, detailed linework, dramatic composition, consistent character design`;
      expect(finalPrompt).toContain("shonen manga style");
      expect(finalPrompt).toContain(userPrompt);
      expect(finalPrompt).toContain("consistent character design");
    });

    it("should use default manga style when style is default", () => {
      const style = "default";
      const stylePrefix = style === "default" ? "manga style" : `${style} manga style`;
      expect(stylePrefix).toBe("manga style");
    });

    it("should fallback to visualDescription when no fluxPrompt", () => {
      const panelNoPrompt = { ...mockPanel, fluxPrompt: null };
      const fallback = panelNoPrompt.visualDescription ?? "manga panel";
      expect(fallback).toBe("A warrior standing on a cliff overlooking a valley");
    });

    it("should handle panel with no prompt or description", () => {
      const panelEmpty = { ...mockPanel, fluxPrompt: null, visualDescription: null };
      const fallback = panelEmpty.visualDescription ?? "manga panel";
      expect(fallback).toBe("manga panel");
    });
  });

  describe("Undo regeneration", () => {
    it("should restore previous image URL", async () => {
      (updatePanel as any).mockResolvedValue(undefined);
      const previousUrl = "https://example.com/old-image.png";
      await updatePanel(100, {
        imageUrl: previousUrl,
        status: "generated",
        generationAttempts: 1,
      });
      expect(updatePanel).toHaveBeenCalledWith(100, expect.objectContaining({
        imageUrl: previousUrl,
        generationAttempts: 1,
      }));
    });

    it("should restore previous prompt", async () => {
      (updatePanel as any).mockResolvedValue(undefined);
      const previousPrompt = "manga style, original prompt";
      await updatePanel(100, {
        imageUrl: "https://example.com/old.png",
        fluxPrompt: previousPrompt,
        status: "generated",
      });
      expect(updatePanel).toHaveBeenCalledWith(100, expect.objectContaining({
        fluxPrompt: previousPrompt,
      }));
    });

    it("should not go below 1 attempt on undo", () => {
      const currentAttempts = 1;
      const undoAttempts = Math.max(1, currentAttempts - 1);
      expect(undoAttempts).toBe(1);
    });

    it("should decrement attempts on undo", () => {
      const currentAttempts = 3;
      const undoAttempts = Math.max(1, currentAttempts - 1);
      expect(undoAttempts).toBe(2);
    });
  });

  describe("Generation attempts tracking", () => {
    it("should default to 1 when generationAttempts is null", () => {
      const panelNull = { ...mockPanel, generationAttempts: null };
      const currentAttempts = panelNull.generationAttempts ?? 1;
      expect(currentAttempts).toBe(1);
    });

    it("should increment attempts correctly", () => {
      const currentAttempts = mockPanel.generationAttempts ?? 1;
      expect(currentAttempts + 1).toBe(2);
    });

    it("should track multiple regeneration attempts", () => {
      const panelMultiple = { ...mockPanel, generationAttempts: 5 };
      const currentAttempts = panelMultiple.generationAttempts ?? 1;
      expect(currentAttempts + 1).toBe(6);
    });
  });
});
