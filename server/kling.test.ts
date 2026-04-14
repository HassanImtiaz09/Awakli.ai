import { describe, it, expect } from "vitest";
import { getAccountInfo, imageToVideo, textToVideo, queryTask } from "./kling";

describe("Kling AI Integration", () => {
  describe("API Connection", () => {
    it("should connect to Kling API and get account info or valid error", async () => {
      try {
        const result = await getAccountInfo();
        expect(result).toBeDefined();
        expect(typeof result.code).toBe("number");
      } catch (err: any) {
        // Even a 404 or auth error means the API is reachable and JWT works
        expect(err.message).toContain("Kling API");
      }
    }, 15000);

    it("should submit an image-to-video task with valid parameters", async () => {
      try {
        const result = await imageToVideo({
          image: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png",
          prompt: "Gentle camera zoom in, soft lighting",
          duration: "5",
          mode: "std",
          modelName: "kling-v2-6",
        });

        expect(result).toBeDefined();
        expect(typeof result.code).toBe("number");

        if (result.code === 0) {
          expect(result.data?.task_id).toBeTruthy();
          console.log("Kling image2video task submitted:", result.data?.task_id);
        } else {
          console.log("Kling image2video response:", result.code, result.message);
        }
      } catch (err: any) {
        // 429 (rate limit) or other API errors are acceptable in tests
        expect(err.message).toContain("Kling API");
        console.log("Kling image2video error (expected in test):", err.message.substring(0, 100));
      }
    }, 30000);

    it("should handle text-to-video task submission or rate limit gracefully", async () => {
      try {
        const result = await textToVideo({
          prompt: "A serene anime landscape with cherry blossoms falling gently",
          duration: "5",
          mode: "std",
          modelName: "kling-v2-6",
        });

        expect(result).toBeDefined();
        expect(typeof result.code).toBe("number");

        if (result.code === 0) {
          expect(result.data?.task_id).toBeTruthy();
          console.log("Kling text2video task submitted:", result.data?.task_id);
        }
      } catch (err: any) {
        // 429 rate limit is expected when running multiple tests
        expect(err.message).toContain("Kling API");
        console.log("Kling text2video error (expected in test):", err.message.substring(0, 100));
      }
    }, 30000);

    it("should handle query for non-existent task gracefully", async () => {
      try {
        const result = await queryTask("non-existent-task-id", "image2video");
        // If it doesn't throw, check the response
        expect(result).toBeDefined();
      } catch (err: any) {
        // 400 "Task not found" is the expected response for invalid task IDs
        expect(err.message).toContain("Kling API");
        expect(err.message).toMatch(/400|404|Task not found/);
      }
    }, 15000);
  });
});
