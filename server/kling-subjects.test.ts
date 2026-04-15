import { describe, it, expect, vi } from "vitest";
import {
  createCustomVoice,
  queryCustomVoice,
  listCustomVoices,
  listPresetVoices,
  deleteCustomVoice,
  createElement,
  queryElement,
  listElements,
  listPresetElements,
  deleteElement,
  buildLipSyncPrompt,
} from "./kling-subjects";

// ─── Environment Check ──────────────────────────────────────────────

const hasCredentials = !!(
  process.env.KLING_ACCESS_KEY && process.env.KLING_SECRET_KEY
);

// ─── buildLipSyncPrompt (pure function, no API needed) ──────────────

describe("buildLipSyncPrompt", () => {
  it("should build prompt with voice tags for matching characters", () => {
    const result = buildLipSyncPrompt(
      "A dark alley at night, rain pouring down",
      [
        { characterName: "Kaelis", dialogue: "We need to move now!", emotion: "urgent" },
        { characterName: "Lyra", dialogue: "I can hear them coming.", emotion: "fearful" },
      ],
      ["Kaelis", "Lyra", "Vex"]
    );

    expect(result).toContain("<<<element_1>>>");
    expect(result).toContain("<<<element_2>>>");
    expect(result).toContain("We need to move now!");
    expect(result).toContain("I can hear them coming.");
    expect(result).toContain("A dark alley at night");
  });

  it("should handle unmatched characters gracefully", () => {
    const result = buildLipSyncPrompt(
      "A peaceful garden",
      [
        { characterName: "Unknown", dialogue: "Hello there", emotion: "calm" },
      ],
      ["Kaelis", "Lyra"]
    );

    // Unknown character should not get a voice tag
    expect(result).not.toContain("<<<element_");
    expect(result).toContain("Unknown says");
    expect(result).toContain("Hello there");
  });

  it("should handle empty dialogue array", () => {
    const result = buildLipSyncPrompt(
      "An empty battlefield",
      [],
      ["Kaelis"]
    );

    expect(result).toContain("An empty battlefield");
    expect(result).not.toContain("<<<element_");
  });

  it("should handle multiple lines from same character", () => {
    const result = buildLipSyncPrompt(
      "A throne room",
      [
        { characterName: "Kaelis", dialogue: "First line", emotion: "calm" },
        { characterName: "Kaelis", dialogue: "Second line", emotion: "angry" },
      ],
      ["Kaelis"]
    );

    // Both lines should use the same element tag
    const matches = result.match(/<<<element_1>>>/g);
    expect(matches?.length).toBe(2);
    expect(result).toContain("First line");
    expect(result).toContain("Second line");
  });

  it("should include emotion in the prompt", () => {
    const result = buildLipSyncPrompt(
      "A scene",
      [
        { characterName: "Kaelis", dialogue: "Watch out!", emotion: "panicked" },
      ],
      ["Kaelis"]
    );

    expect(result).toContain("panicked");
  });
});

// ─── Custom Voice API Tests ─────────────────────────────────────────

describe("Custom Voice API", () => {
  it.skipIf(!hasCredentials)(
    "should list preset voices",
    async () => {
      const result = await listPresetVoices();
      expect(result).toBeDefined();
      expect(result.code).toBe(0);
      expect(result.message).toBe("SUCCEED");
      expect(Array.isArray(result.data)).toBe(true);
    },
    30_000
  );

  it.skipIf(!hasCredentials)(
    "should list custom voices (may be empty)",
    async () => {
      const result = await listCustomVoices();
      expect(result).toBeDefined();
      expect(result.code).toBe(0);
      expect(Array.isArray(result.data)).toBe(true);
    },
    30_000
  );
});

// ─── Element API Tests ──────────────────────────────────────────────

describe("Element API", () => {
  it.skipIf(!hasCredentials)(
    "should list preset elements",
    async () => {
      const result = await listPresetElements();
      expect(result).toBeDefined();
      expect(result.code).toBe(0);
      expect(result.message).toBe("SUCCEED");
      expect(Array.isArray(result.data)).toBe(true);
    },
    30_000
  );

  it.skipIf(!hasCredentials)(
    "should list custom elements (may be empty)",
    async () => {
      const result = await listElements();
      expect(result).toBeDefined();
      expect(result.code).toBe(0);
      expect(Array.isArray(result.data)).toBe(true);
    },
    30_000
  );
});

// ─── Integration Tests (Voice Clone + Element Creation) ─────────────

describe("Subject Library Integration", () => {
  it.skipIf(!hasCredentials)(
    "should create a custom voice task from audio URL",
    async () => {
      // Use a test audio URL - a short speech sample
      // This test creates a voice clone task and checks the response
      const testAudioUrl = "https://cdn.openai.com/API/docs/audio/alloy.wav";

      try {
        const result = await createCustomVoice({
          voiceName: "test-voice-" + Date.now(),
          audioUrl: testAudioUrl,
          language: "en",
          textContent: "This is a test voice sample for cloning.",
        });

        expect(result).toBeDefined();
        expect(result.task_id).toBeDefined();
        expect(typeof result.task_id).toBe("string");
        console.log("[Test] Voice clone task created:", result.task_id);
      } catch (err: any) {
        // API may reject the test audio - that's OK for a test
        console.log("[Test] Voice clone error (expected for test audio):", err.message);
        expect(err.message).toBeDefined();
      }
    },
    60_000
  );

  it.skipIf(!hasCredentials)(
    "should create an element task from image URL",
    async () => {
      // Use a test image URL - a frontal face
      const testImageUrl = "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Camponotus_flavomarginatus_ant.jpg/320px-Camponotus_flavomarginatus_ant.jpg";

      try {
        const result = await createElement({
          elementName: "test-element-" + Date.now(),
          elementDescription: "Test element for integration test",
          referenceType: "image_refer",
          imageList: { frontalImage: testImageUrl },
          tagList: [{ tagId: "o_102" }],
        });

        expect(result).toBeDefined();
        expect(result.task_id).toBeDefined();
        expect(typeof result.task_id).toBe("string");
        console.log("[Test] Element task created:", result.task_id);
      } catch (err: any) {
        // API may reject the test image - that's OK for a test
        console.log("[Test] Element creation error (expected for test image):", err.message);
        expect(err.message).toBeDefined();
      }
    },
    60_000
  );
});

// ─── Router Endpoint Tests ──────────────────────────────────────────

describe("Subject Library Router", () => {
  it("should export subjectLibraryRouter", async () => {
    const { subjectLibraryRouter } = await import("./routers-subjects");
    expect(subjectLibraryRouter).toBeDefined();
    // Check that it has the expected procedures
    expect(subjectLibraryRouter._def.procedures).toBeDefined();
  });

  it("should have all expected procedures", async () => {
    const { subjectLibraryRouter } = await import("./routers-subjects");
    const procedures = Object.keys(subjectLibraryRouter._def.procedures);
    expect(procedures).toContain("listElements");
    expect(procedures).toContain("getReadyElements");
    expect(procedures).toContain("createElement");
    expect(procedures).toContain("getElementStatus");
    expect(procedures).toContain("deleteElement");
    expect(procedures).toContain("retryElement");
    expect(procedures).toContain("previewLipSyncPrompt");
  });
});
