import { describe, expect, it } from "vitest";
import {
  STAGE_NAMES,
  ERROR_MESSAGES,
  getStageCreditCost,
  getTierProjectLimit,
} from "./projectService";

describe("F3: Project Persistence — Unit Tests", () => {
  describe("STAGE_NAMES", () => {
    it("has exactly 7 stages", () => {
      expect(STAGE_NAMES).toHaveLength(7);
    });

    it("maps stage indices to correct names", () => {
      expect(STAGE_NAMES[0]).toBe("input");
      expect(STAGE_NAMES[1]).toBe("setup");
      expect(STAGE_NAMES[2]).toBe("script");
      expect(STAGE_NAMES[3]).toBe("panels");
      expect(STAGE_NAMES[4]).toBe("anime-gate");
      expect(STAGE_NAMES[5]).toBe("video");
      expect(STAGE_NAMES[6]).toBe("publish");
    });
  });

  describe("getStageCreditCost", () => {
    it("input → setup is free (0 credits)", () => {
      expect(getStageCreditCost(0)).toBe(0);
    });

    it("setup → script is free (0 credits)", () => {
      expect(getStageCreditCost(1)).toBe(0);
    });

    it("script → panels costs 2 credits", () => {
      expect(getStageCreditCost(2)).toBe(2);
    });

    it("panels → anime-gate costs 5 credits", () => {
      expect(getStageCreditCost(3)).toBe(5);
    });

    it("anime-gate → video is free (0 credits)", () => {
      expect(getStageCreditCost(4)).toBe(0);
    });

    it("video → publish costs 10 credits", () => {
      expect(getStageCreditCost(5)).toBe(10);
    });

    it("returns 0 for unknown stages", () => {
      expect(getStageCreditCost(99)).toBe(0);
    });
  });

  describe("getTierProjectLimit", () => {
    it("free_trial allows 3 active projects", () => {
      expect(getTierProjectLimit("free_trial")).toBe(3);
    });

    it("creator allows 10 active projects", () => {
      expect(getTierProjectLimit("creator")).toBe(10);
    });

    it("creator_pro allows 25 active projects", () => {
      expect(getTierProjectLimit("creator_pro")).toBe(25);
    });

    it("studio allows 100 active projects", () => {
      expect(getTierProjectLimit("studio")).toBe(100);
    });

    it("enterprise allows unlimited active projects", () => {
      expect(getTierProjectLimit("enterprise")).toBe(Infinity);
    });

    it("unknown tier defaults to 3", () => {
      expect(getTierProjectLimit("unknown")).toBe(3);
    });
  });

  describe("ERROR_MESSAGES", () => {
    it("insufficientCredits includes the needed amount", () => {
      const msg = ERROR_MESSAGES.insufficientCredits(18);
      expect(msg).toBe("You need 18 more credits to continue. Top up or upgrade to Mangaka.");
    });

    it("tierLocked matches exact spec string", () => {
      expect(ERROR_MESSAGES.tierLocked).toBe(
        "Studio Pro unlocks voice cloning. Upgrade to proceed."
      );
    });

    it("validationFailed provides a clear message", () => {
      expect(ERROR_MESSAGES.validationFailed).toBe(
        "Please complete all required fields before advancing."
      );
    });

    it("projectArchived provides a clear message", () => {
      expect(ERROR_MESSAGES.projectArchived).toBe(
        "This project has been archived and cannot be modified."
      );
    });

    it("stageNotReached matches stage rail tooltip", () => {
      expect(ERROR_MESSAGES.stageNotReached).toBe(
        "Complete the previous stage first."
      );
    });

    it("projectLimitReached includes the limit number", () => {
      const msg = ERROR_MESSAGES.projectLimitReached(3);
      expect(msg).toContain("3");
      expect(msg).toContain("active projects");
    });
  });
});

describe("F3: tRPC Router — Procedure Existence", () => {
  it("projectsRouter exposes advanceStage procedure", async () => {
    const { appRouter } = await import("./routers");
    // Verify the procedure exists on the router
    expect(appRouter._def.procedures).toHaveProperty("projects.advanceStage");
  });

  it("projectsRouter exposes checkpoints procedure", async () => {
    const { appRouter } = await import("./routers");
    expect(appRouter._def.procedures).toHaveProperty("projects.checkpoints");
  });

  it("projectsRouter exposes creditBalance procedure", async () => {
    const { appRouter } = await import("./routers");
    expect(appRouter._def.procedures).toHaveProperty("projects.creditBalance");
  });

  it("projectsRouter exposes archive procedure", async () => {
    const { appRouter } = await import("./routers");
    expect(appRouter._def.procedures).toHaveProperty("projects.archive");
  });

  it("projectsRouter exposes listMine procedure", async () => {
    const { appRouter } = await import("./routers");
    expect(appRouter._def.procedures).toHaveProperty("projects.listMine");
  });
});

describe("F3: Schema — project_checkpoints table", () => {
  it("projectCheckpoints schema is exported from schema.ts", async () => {
    const schema = await import("../drizzle/schema");
    expect(schema.projectCheckpoints).toBeDefined();
    // Verify it's a Drizzle table with column definitions
    expect((schema.projectCheckpoints as any).id).toBeDefined();
    expect((schema.projectCheckpoints as any).projectId).toBeDefined();
    expect((schema.projectCheckpoints as any).stageFrom).toBeDefined();
    expect((schema.projectCheckpoints as any).stageTo).toBeDefined();
  });

  it("projects schema includes wizardStage and projectState fields", async () => {
    const schema = await import("../drizzle/schema");
    // Verify the column definitions exist
    const projectCols = schema.projects as any;
    expect(projectCols.wizardStage).toBeDefined();
    expect(projectCols.projectState).toBeDefined();
  });
});
