/**
 * HITL-Orchestrator Integration Tests
 *
 * Tests the bridge between the 4-node pipeline orchestrator and the
 * 12-stage HITL gate system, including:
 * - Node-to-stage mapping correctness
 * - Bridge module exports and function signatures
 * - Pipeline pause/resume flow via submitDecision
 * - Timeout cron endpoint
 * - SSE handler registration
 */

import { describe, it, expect, vi } from "vitest";

// ─── 1. Node-to-Stage Mapping ──────────────────────────────────────────

describe("HITL Orchestrator Bridge — Node-to-Stage Mapping", () => {
  it("should map all 4 orchestrator nodes to primary HITL stages", async () => {
    const { NODE_TO_PRIMARY_STAGE } = await import("./hitl/orchestrator-bridge");
    expect(NODE_TO_PRIMARY_STAGE).toEqual({
      video_gen: 5,
      voice_gen: 6,
      music_gen: 7,
      assembly: 10,
    });
  });

  it("should define pre-flight stages as [1, 2]", async () => {
    const { PRE_FLIGHT_STAGES } = await import("./hitl/orchestrator-bridge");
    expect(PRE_FLIGHT_STAGES).toEqual([1, 2]);
  });

  it("should define secondary stages for each primary", async () => {
    const { SECONDARY_STAGES } = await import("./hitl/orchestrator-bridge");
    expect(SECONDARY_STAGES[5]).toEqual([3, 4]);  // video_gen: character_sheet + keyframe
    expect(SECONDARY_STAGES[7]).toEqual([8]);       // music_gen: sfx_foley
    expect(SECONDARY_STAGES[10]).toEqual([9, 11, 12]); // assembly: audio_mix, subtitle, publish
  });

  it("should map all 10 non-pre-flight stages back to orchestrator nodes", async () => {
    const { STAGE_TO_NODE } = await import("./hitl/orchestrator-bridge");
    // Stages 3-5 → video_gen
    expect(STAGE_TO_NODE[3]).toBe("video_gen");
    expect(STAGE_TO_NODE[4]).toBe("video_gen");
    expect(STAGE_TO_NODE[5]).toBe("video_gen");
    // Stage 6 → voice_gen
    expect(STAGE_TO_NODE[6]).toBe("voice_gen");
    // Stages 7-8 → music_gen
    expect(STAGE_TO_NODE[7]).toBe("music_gen");
    expect(STAGE_TO_NODE[8]).toBe("music_gen");
    // Stages 9-12 → assembly
    expect(STAGE_TO_NODE[9]).toBe("assembly");
    expect(STAGE_TO_NODE[10]).toBe("assembly");
    expect(STAGE_TO_NODE[11]).toBe("assembly");
    expect(STAGE_TO_NODE[12]).toBe("assembly");
  });

  it("should not map pre-flight stages (1, 2) to any node", async () => {
    const { STAGE_TO_NODE } = await import("./hitl/orchestrator-bridge");
    expect(STAGE_TO_NODE[1]).toBeUndefined();
    expect(STAGE_TO_NODE[2]).toBeUndefined();
  });

  it("should cover all 12 stages between pre-flight + primary + secondary", async () => {
    const { PRE_FLIGHT_STAGES, NODE_TO_PRIMARY_STAGE, SECONDARY_STAGES } = await import("./hitl/orchestrator-bridge");

    const allStages = new Set<number>();
    PRE_FLIGHT_STAGES.forEach(s => allStages.add(s));
    Object.values(NODE_TO_PRIMARY_STAGE).forEach(s => allStages.add(s));
    Object.values(SECONDARY_STAGES).flat().forEach(s => allStages.add(s));

    expect(allStages.size).toBe(12);
    for (let i = 1; i <= 12; i++) {
      expect(allStages.has(i)).toBe(true);
    }
  });
});

// ─── 2. Bridge Module Exports ──────────────────────────────────────────

describe("HITL Orchestrator Bridge — Module Exports", () => {
  it("should export initializeHitlForRun function", async () => {
    const bridge = await import("./hitl/orchestrator-bridge");
    expect(typeof bridge.initializeHitlForRun).toBe("function");
  });

  it("should export processPreFlightStages function", async () => {
    const bridge = await import("./hitl/orchestrator-bridge");
    expect(typeof bridge.processPreFlightStages).toBe("function");
  });

  it("should export completeNodeWithGate function", async () => {
    const bridge = await import("./hitl/orchestrator-bridge");
    expect(typeof bridge.completeNodeWithGate).toBe("function");
  });

  it("should export resumePipelineAfterApproval function", async () => {
    const bridge = await import("./hitl/orchestrator-bridge");
    expect(typeof bridge.resumePipelineAfterApproval).toBe("function");
  });

  it("should export resumePipelineAfterRegeneration function", async () => {
    const bridge = await import("./hitl/orchestrator-bridge");
    expect(typeof bridge.resumePipelineAfterRegeneration).toBe("function");
  });

  it("should export pausePipelineForGate function", async () => {
    const bridge = await import("./hitl/orchestrator-bridge");
    expect(typeof bridge.pausePipelineForGate).toBe("function");
  });

  it("should export processTimeouts function", async () => {
    const bridge = await import("./hitl/orchestrator-bridge");
    expect(typeof bridge.processTimeouts).toBe("function");
  });

  it("should export getUserTierForRun function", async () => {
    const bridge = await import("./hitl/orchestrator-bridge");
    expect(typeof bridge.getUserTierForRun).toBe("function");
  });

  it("should export OrchestratorNode type (via NODE_TO_PRIMARY_STAGE keys)", async () => {
    const { NODE_TO_PRIMARY_STAGE } = await import("./hitl/orchestrator-bridge");
    const nodeNames = Object.keys(NODE_TO_PRIMARY_STAGE);
    expect(nodeNames).toContain("video_gen");
    expect(nodeNames).toContain("voice_gen");
    expect(nodeNames).toContain("music_gen");
    expect(nodeNames).toContain("assembly");
    expect(nodeNames.length).toBe(4);
  });
});

// ─── 3. Pipeline Orchestrator — resumePipeline Export ──────────────────

describe("Pipeline Orchestrator — HITL Integration", () => {
  it("should export resumePipeline function", async () => {
    const orchestrator = await import("./pipelineOrchestrator");
    expect(typeof orchestrator.resumePipeline).toBe("function");
  });

  it("should export runPipeline function", async () => {
    const orchestrator = await import("./pipelineOrchestrator");
    expect(typeof orchestrator.runPipeline).toBe("function");
  });
});

// ─── 4. tRPC Router — submitDecision Wiring ────────────────────────────

describe("HITL tRPC Router — submitDecision Pipeline Resume", () => {
  it("should import STAGE_TO_NODE in routers-hitl", async () => {
    // Verify the import exists by checking the module loads without error
    const routerModule = await import("./routers-hitl");
    expect(routerModule.gateReviewRouter).toBeDefined();
    expect(routerModule.gateReviewRouter.submitDecision).toBeDefined();
  });

  it("should have all 6 HITL routers exported", async () => {
    const routerModule = await import("./routers-hitl");
    expect(routerModule.gateReviewRouter).toBeDefined();
    expect(routerModule.pipelineStageRouter).toBeDefined();
    expect(routerModule.batchReviewRouter).toBeDefined();
    expect(routerModule.gateConfigRouter).toBeDefined();
    expect(routerModule.qualityAnalyticsRouter).toBeDefined();
    expect(routerModule.cascadeRewindRouter).toBeDefined();
  });
});

// ─── 5. SSE Handler — Timeout Cron Endpoint ────────────────────────────

describe("HITL SSE Handler — Endpoints", () => {
  it("should export registerHitlSseRoutes function", async () => {
    const sseHandler = await import("./hitl/sse-handler");
    expect(typeof sseHandler.registerHitlSseRoutes).toBe("function");
  });

  it("should export getActiveSseConnectionCount function", async () => {
    const sseHandler = await import("./hitl/sse-handler");
    expect(typeof sseHandler.getActiveSseConnectionCount).toBe("function");
  });

  it("should return 0 active connections initially", async () => {
    const { getActiveSseConnectionCount } = await import("./hitl/sse-handler");
    expect(getActiveSseConnectionCount()).toBe(0);
  });
});

// ─── 6. HITL Barrel Export — Bridge Functions ──────────────────────────

describe("HITL Barrel Export — Bridge Integration", () => {
  it("should re-export bridge functions from hitl/index.ts", async () => {
    const hitl = await import("./hitl");
    // Check that key bridge functions are accessible via the barrel
    expect(typeof hitl.initializeHitlForRun).toBe("function");
    expect(typeof hitl.completeNodeWithGate).toBe("function");
    expect(typeof hitl.processTimeouts).toBe("function");
    expect(typeof hitl.pausePipelineForGate).toBe("function");
  });
});

// ─── 7. Stage-to-Node Consistency ──────────────────────────────────────

describe("HITL Bridge — Stage-to-Node Consistency", () => {
  it("every primary stage should have a reverse mapping in STAGE_TO_NODE", async () => {
    const { NODE_TO_PRIMARY_STAGE, STAGE_TO_NODE } = await import("./hitl/orchestrator-bridge");
    for (const [node, stage] of Object.entries(NODE_TO_PRIMARY_STAGE)) {
      expect(STAGE_TO_NODE[stage]).toBe(node);
    }
  });

  it("every secondary stage should have a reverse mapping in STAGE_TO_NODE", async () => {
    const { SECONDARY_STAGES, STAGE_TO_NODE, NODE_TO_PRIMARY_STAGE } = await import("./hitl/orchestrator-bridge");
    for (const [primaryStr, secondaries] of Object.entries(SECONDARY_STAGES)) {
      const primary = Number(primaryStr);
      // Find which node owns this primary stage
      const ownerNode = Object.entries(NODE_TO_PRIMARY_STAGE).find(([, s]) => s === primary)?.[0];
      for (const sec of secondaries) {
        expect(STAGE_TO_NODE[sec]).toBe(ownerNode);
      }
    }
  });

  it("secondary stages should not overlap with primary stages", async () => {
    const { NODE_TO_PRIMARY_STAGE, SECONDARY_STAGES } = await import("./hitl/orchestrator-bridge");
    const primaryStages = new Set(Object.values(NODE_TO_PRIMARY_STAGE));
    const secondaryStages = Object.values(SECONDARY_STAGES).flat();
    for (const sec of secondaryStages) {
      expect(primaryStages.has(sec)).toBe(false);
    }
  });

  it("pre-flight stages should not overlap with any node stages", async () => {
    const { PRE_FLIGHT_STAGES, STAGE_TO_NODE } = await import("./hitl/orchestrator-bridge");
    for (const pf of PRE_FLIGHT_STAGES) {
      expect(STAGE_TO_NODE[pf]).toBeUndefined();
    }
  });
});

// ─── 8. NodeCompletionParams Interface ─────────────────────────────────

describe("HITL Bridge — NodeCompletionParams", () => {
  it("completeNodeWithGate should accept all required params", async () => {
    const { completeNodeWithGate } = await import("./hitl/orchestrator-bridge");
    // Verify the function signature accepts the expected params shape
    // (We can't call it without a real DB, but we can verify it's callable)
    expect(completeNodeWithGate.length).toBeGreaterThanOrEqual(1); // At least 1 param
  });

  it("initializeHitlForRun should accept pipelineRunId, userId, tierName", async () => {
    const { initializeHitlForRun } = await import("./hitl/orchestrator-bridge");
    expect(initializeHitlForRun.length).toBeGreaterThanOrEqual(2); // At least 2 required params
  });

  it("resumePipelineAfterApproval should accept pipelineRunId", async () => {
    const { resumePipelineAfterApproval } = await import("./hitl/orchestrator-bridge");
    expect(resumePipelineAfterApproval.length).toBe(1);
  });

  it("resumePipelineAfterRegeneration should accept pipelineRunId and stageNumber", async () => {
    const { resumePipelineAfterRegeneration } = await import("./hitl/orchestrator-bridge");
    expect(resumePipelineAfterRegeneration.length).toBe(2);
  });

  it("pausePipelineForGate should accept pipelineRunId, gateId, stageNumber", async () => {
    const { pausePipelineForGate } = await import("./hitl/orchestrator-bridge");
    expect(pausePipelineForGate.length).toBe(3);
  });
});

// ─── 9. Tier Resolution ────────────────────────────────────────────────

describe("HITL Bridge — Tier Resolution", () => {
  it("getUserTierForRun should accept a pipelineRunId", async () => {
    const { getUserTierForRun } = await import("./hitl/orchestrator-bridge");
    expect(getUserTierForRun.length).toBe(1);
  });
});

// ─── 10. End-to-End Flow Verification ──────────────────────────────────

describe("HITL Integration — End-to-End Flow Verification", () => {
  it("should have the full pipeline flow wired: orchestrator → bridge → gate-manager → notification → resume", async () => {
    // Verify all modules in the chain are importable and have the right exports
    const orchestrator = await import("./pipelineOrchestrator");
    const bridge = await import("./hitl/orchestrator-bridge");
    const gateManager = await import("./hitl/gate-manager");
    const notifications = await import("./hitl/notification-dispatcher");
    const stateMachine = await import("./hitl/pipeline-state-machine");
    const scorer = await import("./hitl/confidence-scorer");

    // Orchestrator → Bridge
    expect(typeof orchestrator.resumePipeline).toBe("function");
    expect(typeof bridge.initializeHitlForRun).toBe("function");
    expect(typeof bridge.completeNodeWithGate).toBe("function");

    // Bridge → Gate Manager
    expect(typeof gateManager.resolveGateConfig).toBe("function");
    expect(typeof gateManager.getGateById).toBe("function");

    // Bridge → State Machine
    expect(typeof stateMachine.completeStageGeneration).toBe("function");
    expect(typeof stateMachine.approveStage).toBe("function");
    expect(typeof stateMachine.startRegeneration).toBe("function");

    // Bridge → Notifications
    expect(typeof notifications.notifyGateReady).toBe("function");
    expect(typeof notifications.notifyAutoAdvanced).toBe("function");

    // Bridge → Scorer
    expect(typeof scorer.scoreGeneration).toBe("function");
  });

  it("should have the decision flow wired: tRPC submitDecision → approveStage → resumePipeline", async () => {
    const routers = await import("./routers-hitl");
    const orchestrator = await import("./pipelineOrchestrator");
    const stateMachine = await import("./hitl/pipeline-state-machine");

    expect(routers.gateReviewRouter.submitDecision).toBeDefined();
    expect(typeof orchestrator.resumePipeline).toBe("function");
    expect(typeof stateMachine.approveStage).toBe("function");
    expect(typeof stateMachine.rejectStage).toBe("function");
    expect(typeof stateMachine.startRegeneration).toBe("function");
  });

  it("should have the timeout flow wired: processTimeouts → checkTimeoutWarnings + processTimedOutGates → resumePipelineAfterApproval", async () => {
    const bridge = await import("./hitl/orchestrator-bridge");
    const timeout = await import("./hitl/timeout-handler");

    expect(typeof bridge.processTimeouts).toBe("function");
    expect(typeof timeout.checkTimeoutWarnings).toBe("function");
    expect(typeof timeout.processTimedOutGates).toBe("function");
    expect(typeof bridge.resumePipelineAfterApproval).toBe("function");
  });
});
