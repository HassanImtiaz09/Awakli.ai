import { describe, it, expect, vi } from "vitest";

/**
 * Tests for LoRA A/B Comparison Blind Mode
 *
 * The blind mode feature randomizes version labels (Sample X / Sample Y),
 * hides scores and metrics, lets creators vote, then reveals identities
 * with match/mismatch feedback.
 *
 * Since the core logic is in the React component, we test the pure
 * functions and state machine logic that drives the blind mode behavior.
 */

// ─── Blind Assignment Randomization ─────────────────────────────────────

describe("Blind Assignment Randomization", () => {
  /** Simulates the generateBlindAssignment function from the modal */
  function generateBlindAssignment(): { xIsA: boolean } {
    return { xIsA: Math.random() < 0.5 };
  }

  it("should return an object with xIsA boolean", () => {
    const assignment = generateBlindAssignment();
    expect(typeof assignment.xIsA).toBe("boolean");
  });

  it("should produce roughly 50/50 distribution over many runs", () => {
    let xIsACount = 0;
    const runs = 1000;
    for (let i = 0; i < runs; i++) {
      if (generateBlindAssignment().xIsA) xIsACount++;
    }
    // Should be roughly 50% — allow 35-65% range for randomness
    expect(xIsACount).toBeGreaterThan(runs * 0.35);
    expect(xIsACount).toBeLessThan(runs * 0.65);
  });

  it("should generate different assignments across calls (not deterministic)", () => {
    const results = new Set<boolean>();
    for (let i = 0; i < 20; i++) {
      results.add(generateBlindAssignment().xIsA);
    }
    // Over 20 runs, we should see both true and false
    expect(results.size).toBe(2);
  });
});

// ─── Label Mapping Logic ────────────────────────────────────────────────

describe("Blind Mode Label Mapping", () => {
  const trueALabel = "v3";
  const trueBLabel = "v2";

  function getLabels(blindMode: boolean, revealed: boolean, xIsA: boolean) {
    const isBlindActive = blindMode && !revealed;

    const leftLabel = isBlindActive
      ? "Sample X"
      : xIsA ? trueALabel : trueBLabel;

    const rightLabel = isBlindActive
      ? "Sample Y"
      : xIsA ? trueBLabel : trueALabel;

    const leftTrueLabel = xIsA ? trueALabel : trueBLabel;
    const rightTrueLabel = xIsA ? trueBLabel : trueALabel;

    return { leftLabel, rightLabel, leftTrueLabel, rightTrueLabel, isBlindActive };
  }

  it("should show Sample X / Sample Y in active blind mode", () => {
    const labels = getLabels(true, false, true);
    expect(labels.leftLabel).toBe("Sample X");
    expect(labels.rightLabel).toBe("Sample Y");
    expect(labels.isBlindActive).toBe(true);
  });

  it("should show true labels when blind mode is off", () => {
    const labels = getLabels(false, false, true);
    expect(labels.leftLabel).toBe("v3");
    expect(labels.rightLabel).toBe("v2");
    expect(labels.isBlindActive).toBe(false);
  });

  it("should show true labels after reveal in blind mode", () => {
    const labels = getLabels(true, true, true);
    expect(labels.leftLabel).toBe("v3");
    expect(labels.rightLabel).toBe("v2");
    expect(labels.isBlindActive).toBe(false);
  });

  it("should swap labels when xIsA is false", () => {
    const labels = getLabels(false, false, false);
    expect(labels.leftLabel).toBe("v2"); // B is on left
    expect(labels.rightLabel).toBe("v3"); // A is on right
  });

  it("should preserve true labels regardless of blind state when xIsA is false", () => {
    const labels = getLabels(true, false, false);
    expect(labels.leftTrueLabel).toBe("v2");
    expect(labels.rightTrueLabel).toBe("v3");
  });

  it("should show Sample X/Y even when xIsA is false in blind mode", () => {
    const labels = getLabels(true, false, false);
    expect(labels.leftLabel).toBe("Sample X");
    expect(labels.rightLabel).toBe("Sample Y");
  });

  it("should reveal correct mapping after reveal with xIsA=false", () => {
    const labels = getLabels(true, true, false);
    expect(labels.leftLabel).toBe("v2"); // B was on left
    expect(labels.rightLabel).toBe("v3"); // A was on right
  });
});

// ─── Vote Match/Mismatch Logic ──────────────────────────────────────────

describe("Blind Vote Match/Mismatch Detection", () => {
  function determineMatch(
    userPick: "left" | "right",
    metricsWinner: "A" | "B" | "tie",
    xIsA: boolean
  ): boolean | null {
    if (metricsWinner === "tie") return null;

    // "left" in blind view = Sample X
    // If xIsA is true: left = A, right = B
    // If xIsA is false: left = B, right = A
    const userPickedA = xIsA ? (userPick === "left") : (userPick === "right");
    const metricsPickedA = metricsWinner === "A";
    return userPickedA === metricsPickedA;
  }

  it("should return true when user picks left (A) and metrics say A wins (xIsA=true)", () => {
    expect(determineMatch("left", "A", true)).toBe(true);
  });

  it("should return false when user picks left (A) but metrics say B wins (xIsA=true)", () => {
    expect(determineMatch("left", "B", true)).toBe(false);
  });

  it("should return true when user picks right (B) and metrics say B wins (xIsA=true)", () => {
    expect(determineMatch("right", "B", true)).toBe(true);
  });

  it("should return false when user picks right (B) but metrics say A wins (xIsA=true)", () => {
    expect(determineMatch("right", "A", true)).toBe(false);
  });

  it("should return null when metrics say tie regardless of pick", () => {
    expect(determineMatch("left", "tie", true)).toBeNull();
    expect(determineMatch("right", "tie", true)).toBeNull();
  });

  // Swapped assignment (xIsA = false)
  it("should correctly detect match when xIsA is false — left is B", () => {
    // User picks left = Sample X = version B (since xIsA is false)
    // Metrics say B wins → match
    expect(determineMatch("left", "B", false)).toBe(true);
  });

  it("should correctly detect mismatch when xIsA is false — left is B", () => {
    // User picks left = Sample X = version B (since xIsA is false)
    // Metrics say A wins → mismatch
    expect(determineMatch("left", "A", false)).toBe(false);
  });

  it("should correctly detect match when xIsA is false — right is A", () => {
    // User picks right = Sample Y = version A (since xIsA is false)
    // Metrics say A wins → match
    expect(determineMatch("right", "A", false)).toBe(true);
  });

  it("should correctly detect mismatch when xIsA is false — right is A", () => {
    // User picks right = Sample Y = version A (since xIsA is false)
    // Metrics say B wins → mismatch
    expect(determineMatch("right", "B", false)).toBe(false);
  });
});

// ─── Blind Mode State Machine ───────────────────────────────────────────

describe("Blind Mode State Machine", () => {
  interface BlindState {
    blindMode: boolean;
    blindVote: "left" | "right" | null;
    revealed: boolean;
    xIsA: boolean;
  }

  function initialState(): BlindState {
    return { blindMode: false, blindVote: null, revealed: false, xIsA: true };
  }

  function enableBlind(state: BlindState): BlindState {
    return {
      ...state,
      blindMode: true,
      blindVote: null,
      revealed: false,
      xIsA: Math.random() < 0.5, // re-randomize
    };
  }

  function disableBlind(state: BlindState): BlindState {
    return { ...state, blindMode: false, blindVote: null, revealed: false };
  }

  function vote(state: BlindState, pick: "left" | "right"): BlindState {
    if (!state.blindMode || state.revealed) return state; // no-op
    return { ...state, blindVote: pick, revealed: true };
  }

  function reRunBlind(state: BlindState): BlindState {
    if (!state.blindMode) return state;
    return {
      ...state,
      blindVote: null,
      revealed: false,
      xIsA: Math.random() < 0.5, // re-randomize
    };
  }

  it("should start in non-blind state", () => {
    const s = initialState();
    expect(s.blindMode).toBe(false);
    expect(s.blindVote).toBeNull();
    expect(s.revealed).toBe(false);
  });

  it("should transition to blind mode with reset vote and reveal", () => {
    let s = initialState();
    s = enableBlind(s);
    expect(s.blindMode).toBe(true);
    expect(s.blindVote).toBeNull();
    expect(s.revealed).toBe(false);
  });

  it("should record vote and reveal on vote action", () => {
    let s = enableBlind(initialState());
    s = vote(s, "left");
    expect(s.blindVote).toBe("left");
    expect(s.revealed).toBe(true);
    expect(s.blindMode).toBe(true); // still in blind mode
  });

  it("should ignore vote when not in blind mode", () => {
    let s = initialState();
    s = vote(s, "right");
    expect(s.blindVote).toBeNull(); // no change
    expect(s.revealed).toBe(false);
  });

  it("should ignore second vote after reveal", () => {
    let s = enableBlind(initialState());
    s = vote(s, "left");
    const prevVote = s.blindVote;
    s = vote(s, "right"); // should be no-op
    expect(s.blindVote).toBe(prevVote); // unchanged
  });

  it("should reset vote and reveal on re-run", () => {
    let s = enableBlind(initialState());
    s = vote(s, "left");
    expect(s.revealed).toBe(true);
    s = reRunBlind(s);
    expect(s.blindVote).toBeNull();
    expect(s.revealed).toBe(false);
    expect(s.blindMode).toBe(true); // still blind
  });

  it("should fully reset on disable blind", () => {
    let s = enableBlind(initialState());
    s = vote(s, "right");
    s = disableBlind(s);
    expect(s.blindMode).toBe(false);
    expect(s.blindVote).toBeNull();
    expect(s.revealed).toBe(false);
  });

  it("should not re-run when not in blind mode", () => {
    let s = initialState();
    const before = { ...s };
    s = reRunBlind(s);
    expect(s).toEqual(before);
  });
});

// ─── UI Visibility Rules ────────────────────────────────────────────────

describe("Blind Mode UI Visibility Rules", () => {
  function getVisibility(blindMode: boolean, revealed: boolean) {
    const isBlindActive = blindMode && !revealed;
    return {
      showVersionSelectors: !isBlindActive,
      showCustomPromptToggle: !isBlindActive,
      showMetricBars: !isBlindActive,
      showWinnerBanner: !blindMode || revealed,
      showAggregatedMetrics: !blindMode || revealed,
      showConfidenceMeter: !blindMode || revealed,
      showVotingPanel: isBlindActive, // only before vote
      showRevealBanner: blindMode && revealed,
      showBlindInfoBanner: isBlindActive,
      showReRunBlindButton: blindMode && revealed,
      showBlindToggleButton: true, // always visible when comparison loaded
      blindToggleDisabled: blindMode && revealed, // disabled after reveal
    };
  }

  it("should show everything in normal mode", () => {
    const v = getVisibility(false, false);
    expect(v.showVersionSelectors).toBe(true);
    expect(v.showCustomPromptToggle).toBe(true);
    expect(v.showMetricBars).toBe(true);
    expect(v.showWinnerBanner).toBe(true);
    expect(v.showAggregatedMetrics).toBe(true);
    expect(v.showConfidenceMeter).toBe(true);
    expect(v.showVotingPanel).toBe(false);
    expect(v.showRevealBanner).toBe(false);
    expect(v.showBlindInfoBanner).toBe(false);
    expect(v.showReRunBlindButton).toBe(false);
  });

  it("should hide scores and show voting in active blind mode", () => {
    const v = getVisibility(true, false);
    expect(v.showVersionSelectors).toBe(false);
    expect(v.showCustomPromptToggle).toBe(false);
    expect(v.showMetricBars).toBe(false);
    expect(v.showWinnerBanner).toBe(false);
    expect(v.showAggregatedMetrics).toBe(false);
    expect(v.showConfidenceMeter).toBe(false);
    expect(v.showVotingPanel).toBe(true);
    expect(v.showRevealBanner).toBe(false);
    expect(v.showBlindInfoBanner).toBe(true);
    expect(v.showReRunBlindButton).toBe(false);
  });

  it("should show everything plus reveal banner after vote", () => {
    const v = getVisibility(true, true);
    expect(v.showVersionSelectors).toBe(true);
    expect(v.showCustomPromptToggle).toBe(true);
    expect(v.showMetricBars).toBe(true);
    expect(v.showWinnerBanner).toBe(true);
    expect(v.showAggregatedMetrics).toBe(true);
    expect(v.showConfidenceMeter).toBe(true);
    expect(v.showVotingPanel).toBe(false);
    expect(v.showRevealBanner).toBe(true);
    expect(v.showBlindInfoBanner).toBe(false);
    expect(v.showReRunBlindButton).toBe(true);
    expect(v.blindToggleDisabled).toBe(true);
  });
});

// ─── Reveal Banner Content Logic ────────────────────────────────────────

describe("Reveal Banner Content", () => {
  function getRevealContent(
    userPick: "left" | "right",
    metricsWinner: "A" | "B" | "tie",
    xIsA: boolean
  ) {
    const userPickedA = xIsA ? (userPick === "left") : (userPick === "right");
    const metricsPickedA = metricsWinner === "A";
    const isMatch = metricsWinner === "tie" ? null : userPickedA === metricsPickedA;

    const leftBlindLabel = "Sample X";
    const rightBlindLabel = "Sample Y";
    const leftTrueLabel = xIsA ? "v3" : "v2";
    const rightTrueLabel = xIsA ? "v2" : "v3";

    const pickedBlindLabel = userPick === "left" ? leftBlindLabel : rightBlindLabel;
    const pickedTrueLabel = userPick === "left" ? leftTrueLabel : rightTrueLabel;

    return { isMatch, pickedBlindLabel, pickedTrueLabel, leftTrueLabel, rightTrueLabel };
  }

  it("should show match when user picks left=A and A wins (xIsA=true)", () => {
    const r = getRevealContent("left", "A", true);
    expect(r.isMatch).toBe(true);
    expect(r.pickedBlindLabel).toBe("Sample X");
    expect(r.pickedTrueLabel).toBe("v3"); // A = v3
  });

  it("should show mismatch when user picks left=A but B wins (xIsA=true)", () => {
    const r = getRevealContent("left", "B", true);
    expect(r.isMatch).toBe(false);
    expect(r.pickedTrueLabel).toBe("v3");
  });

  it("should show null match for tie", () => {
    const r = getRevealContent("left", "tie", true);
    expect(r.isMatch).toBeNull();
  });

  it("should correctly map labels when xIsA=false", () => {
    const r = getRevealContent("left", "B", false);
    // left = Sample X = v2 (B), metrics say B wins → match
    expect(r.isMatch).toBe(true);
    expect(r.pickedTrueLabel).toBe("v2");
    expect(r.leftTrueLabel).toBe("v2");
    expect(r.rightTrueLabel).toBe("v3");
  });

  it("should show correct blind-to-true mapping in reveal", () => {
    const r = getRevealContent("right", "A", false);
    // right = Sample Y = v3 (A), metrics say A wins → match
    expect(r.isMatch).toBe(true);
    expect(r.pickedBlindLabel).toBe("Sample Y");
    expect(r.pickedTrueLabel).toBe("v3");
  });
});
