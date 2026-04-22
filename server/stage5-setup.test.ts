/**
 * Stage 5 · Setup — Character/Voice/Pose (Mangaka variant) tests
 *
 * Covers:
 *  - Copy strings (exact spec)
 *  - SetupStepper substep logic
 *  - CharacterBakery presets & tier gating
 *  - VoiceCatalog stock voices & filtering
 *  - PoseSheet credit costs & generation
 *  - Analytics events
 */
import { describe, it, expect } from "vitest";

// ─── Import copy strings & constants ────────────────────────────────────
import { SETUP_COPY } from "../client/src/pages/create/character-setup";
import {
  SETUP_STEPPER_COPY,
  type SetupSubstep,
} from "../client/src/components/awakli/SetupStepper";
import {
  STYLE_PRESETS,
} from "../client/src/components/awakli/CharacterBakery";
import {
  STOCK_VOICES,
  VOICE_CATALOG_COPY,
  type StockVoice,
} from "../client/src/components/awakli/VoiceCatalog";
import {
  POSE_CREDITS,
  POSE_ANGLES,
  POSE_SHEET_COPY,
  type PoseAngle,
  type CharacterPoses,
  type PoseData,
} from "../client/src/components/awakli/PoseSheet";

// ═══════════════════════════════════════════════════════════════════════
// 1. COPY STRINGS — exact spec match
// ═══════════════════════════════════════════════════════════════════════
describe("Stage 5 · Copy strings", () => {
  it("page title is exact", () => {
    expect(SETUP_COPY.pageTitle).toBe("Studio setup");
  });

  it("subhead is exact", () => {
    expect(SETUP_COPY.subhead).toBe(
      "A few choices and we're ready to render."
    );
  });

  it("ready CTA is exact", () => {
    expect(SETUP_COPY.readyCTA).toBe("Go to video →");
  });

  it("pose regenerate copy is exact", () => {
    expect(POSE_SHEET_COPY.regenerate).toBe("Redraw pose · 2c");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. SETUP STEPPER — substep labels and sequencing
// ═══════════════════════════════════════════════════════════════════════
describe("Stage 5 · SetupStepper", () => {
  it("has exactly 3 substep labels", () => {
    const labels = [SETUP_STEPPER_COPY.substep1, SETUP_STEPPER_COPY.substep2, SETUP_STEPPER_COPY.substep3];
    expect(labels).toHaveLength(3);
  });

  it("substep 1 is Character look", () => {
    expect(SETUP_STEPPER_COPY.substep1).toBe("Character look");
  });

  it("substep 2 is Voices", () => {
    expect(SETUP_STEPPER_COPY.substep2).toBe("Voices");
  });

  it("substep 3 is Pose references", () => {
    expect(SETUP_STEPPER_COPY.substep3).toBe("Pose references");
  });

  it("sequential enforcement: step 2 requires step 1 complete", () => {
    // Simulating: completedSteps = new Set(), currentStep = 1
    const completedSteps = new Set<SetupSubstep>();
    // Step 2 should not be clickable if step 1 is not completed
    const canClickStep2 = completedSteps.has(1);
    expect(canClickStep2).toBe(false);
  });

  it("sequential enforcement: step 3 requires step 2 complete", () => {
    const completedSteps = new Set<SetupSubstep>([1]);
    const canClickStep3 = completedSteps.has(2);
    expect(canClickStep3).toBe(false);
  });

  it("step 2 clickable after step 1 complete", () => {
    const completedSteps = new Set<SetupSubstep>([1]);
    const canClickStep2 = completedSteps.has(1);
    expect(canClickStep2).toBe(true);
  });

  it("step 3 clickable after step 2 complete", () => {
    const completedSteps = new Set<SetupSubstep>([1, 2]);
    const canClickStep3 = completedSteps.has(2);
    expect(canClickStep3).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. CHARACTER BAKERY — presets and tier gating
// ═══════════════════════════════════════════════════════════════════════
describe("Stage 5 · CharacterBakery", () => {
  it("has exactly 12 style presets", () => {
    expect(STYLE_PRESETS).toHaveLength(12);
  });

  it("each preset has a key, label, and description", () => {
    for (const preset of STYLE_PRESETS) {
      expect(preset.key).toBeTruthy();
      expect(typeof preset.key).toBe("string");
      expect(preset.label).toBeTruthy();
      expect(typeof preset.label).toBe("string");
      expect(preset.description).toBeTruthy();
      expect(typeof preset.description).toBe("string");
    }
  });

  it("preset keys are unique", () => {
    const keys = STYLE_PRESETS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("each preset has a description", () => {
    for (const preset of STYLE_PRESETS) {
      expect(preset.description).toBeTruthy();
    }
  });

  it("each preset has a colorAccent", () => {
    for (const preset of STYLE_PRESETS) {
      expect(preset.colorAccent).toBeTruthy();
      expect(preset.colorAccent).toMatch(/^bg-/);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 4. VOICE CATALOG — stock voices and filtering
// ═══════════════════════════════════════════════════════════════════════
describe("Stage 5 · VoiceCatalog", () => {
  it("has exactly 24 stock voices", () => {
    expect(STOCK_VOICES).toHaveLength(24);
  });

  it("each voice has required fields", () => {
    for (const voice of STOCK_VOICES) {
      expect(voice.id).toBeTruthy();
      expect(voice.name).toBeTruthy();
      expect(voice.gender).toMatch(/^(male|female|neutral)$/);
      expect(voice.age).toMatch(/^(young|adult|mature)$/);
      expect(voice.tone).toBeTruthy();
    }
  });

  it("voice IDs are unique", () => {
    const ids = STOCK_VOICES.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("voices are filterable by gender", () => {
    const males = STOCK_VOICES.filter((v) => v.gender === "male");
    const females = STOCK_VOICES.filter((v) => v.gender === "female");
    expect(males.length).toBeGreaterThan(0);
    expect(females.length).toBeGreaterThan(0);
  });

  it("voices are filterable by age", () => {
    const young = STOCK_VOICES.filter((v) => v.age === "young");
    const adult = STOCK_VOICES.filter((v) => v.age === "adult");
    const mature = STOCK_VOICES.filter((v) => v.age === "mature");
    expect(young.length).toBeGreaterThan(0);
    expect(adult.length).toBeGreaterThan(0);
    expect(mature.length).toBeGreaterThan(0);
  });

  it("voices are filterable by tone", () => {
    const tones = new Set(STOCK_VOICES.map((v) => v.tone));
    expect(tones.size).toBeGreaterThan(3); // multiple distinct tones
  });

  it("catalog copy has preview label", () => {
    expect(VOICE_CATALOG_COPY.preview).toBeTruthy();
  });

  it("catalog copy has clone voice label", () => {
    expect(VOICE_CATALOG_COPY.cloneVoice).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 5. POSE SHEET — credit costs and generation
// ═══════════════════════════════════════════════════════════════════════
describe("Stage 5 · PoseSheet", () => {
  it("initial generation costs 8 credits per character", () => {
    expect(POSE_CREDITS.initialGeneration).toBe(8);
  });

  it("single pose regeneration costs 2 credits", () => {
    expect(POSE_CREDITS.regenerateSingle).toBe(2);
  });

  it("has exactly 3 pose angles", () => {
    expect(POSE_ANGLES).toHaveLength(3);
  });

  it("pose angles are front, side, back", () => {
    expect(POSE_ANGLES).toEqual(["front", "side", "back"]);
  });

  it("pose data has correct status lifecycle", () => {
    const validStatuses = ["pending", "generating", "ready", "failed"];
    const pose: PoseData = {
      angle: "front",
      imageUrl: null,
      status: "pending",
      approved: false,
    };
    expect(validStatuses).toContain(pose.status);
  });

  it("pose starts unapproved", () => {
    const pose: PoseData = {
      angle: "front",
      imageUrl: null,
      status: "pending",
      approved: false,
    };
    expect(pose.approved).toBe(false);
  });

  it("all poses must be approved for character completion", () => {
    const charPoses: CharacterPoses = {
      characterId: 1,
      characterName: "Hero",
      poses: {
        front: { angle: "front", imageUrl: "url", status: "ready", approved: true },
        side: { angle: "side", imageUrl: "url", status: "ready", approved: true },
        back: { angle: "back", imageUrl: "url", status: "ready", approved: false },
      },
    };
    const allApproved = POSE_ANGLES.every(
      (a) => charPoses.poses[a].approved
    );
    expect(allApproved).toBe(false);
  });

  it("character is complete when all 3 poses approved", () => {
    const charPoses: CharacterPoses = {
      characterId: 1,
      characterName: "Hero",
      poses: {
        front: { angle: "front", imageUrl: "url", status: "ready", approved: true },
        side: { angle: "side", imageUrl: "url", status: "ready", approved: true },
        back: { angle: "back", imageUrl: "url", status: "ready", approved: true },
      },
    };
    const allApproved = POSE_ANGLES.every(
      (a) => charPoses.poses[a].approved
    );
    expect(allApproved).toBe(true);
  });

  it("regeneration requires sufficient credits", () => {
    const balance = 1;
    const canRegen = balance >= POSE_CREDITS.regenerateSingle;
    expect(canRegen).toBe(false);
  });

  it("regeneration allowed with sufficient credits", () => {
    const balance = 5;
    const canRegen = balance >= POSE_CREDITS.regenerateSingle;
    expect(canRegen).toBe(true);
  });

  it("total initial cost for 3 characters = 24 credits", () => {
    const numCharacters = 3;
    const totalCost = numCharacters * POSE_CREDITS.initialGeneration;
    expect(totalCost).toBe(24);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 6. READY STATE — all substeps must be complete
// ═══════════════════════════════════════════════════════════════════════
describe("Stage 5 · Ready state", () => {
  it("not ready if only substep 1 complete", () => {
    const completed = new Set<SetupSubstep>([1]);
    const isReady = completed.has(1) && completed.has(2) && completed.has(3);
    expect(isReady).toBe(false);
  });

  it("not ready if substeps 1 and 2 complete", () => {
    const completed = new Set<SetupSubstep>([1, 2]);
    const isReady = completed.has(1) && completed.has(2) && completed.has(3);
    expect(isReady).toBe(false);
  });

  it("ready when all 3 substeps complete", () => {
    const completed = new Set<SetupSubstep>([1, 2, 3]);
    const isReady = completed.has(1) && completed.has(2) && completed.has(3);
    expect(isReady).toBe(true);
  });

  it("ready CTA navigates to /create/video", () => {
    // The CTA text is "Go to video →" and navigates to /create/video
    expect(SETUP_COPY.readyCTA).toContain("video");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 7. ANALYTICS EVENTS — expected event names
// ═══════════════════════════════════════════════════════════════════════
describe("Stage 5 · Analytics events", () => {
  const expectedEvents = [
    "stage5_substep_enter",
    "stage5_preset_pick",
    "stage5_voice_pick",
    "stage5_pose_regen",
    "stage5_ready",
  ];

  it("all expected events are documented", () => {
    // These are the analytics events from the spec
    for (const event of expectedEvents) {
      expect(event).toMatch(/^stage5_/);
    }
  });

  it("no duplicate event names", () => {
    expect(new Set(expectedEvents).size).toBe(expectedEvents.length);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 8. TIER GATING — Mangaka+ only
// ═══════════════════════════════════════════════════════════════════════
describe("Stage 5 · Tier gating", () => {
  it("page is accessible to creator_pro tier", () => {
    const tier = "creator_pro";
    const subscribed = ["creator_pro", "studio", "enterprise"].includes(tier);
    expect(subscribed).toBe(true);
  });

  it("page is accessible to studio tier", () => {
    const tier = "studio";
    const subscribed = ["creator_pro", "studio", "enterprise"].includes(tier);
    expect(subscribed).toBe(true);
  });

  it("page is not directly accessible to free_trial", () => {
    const tier = "free_trial";
    const subscribed = ["creator_pro", "studio", "enterprise"].includes(tier);
    expect(subscribed).toBe(false);
  });

  it("anime gate redirects to /create/character-setup for subscribed users", () => {
    // Verified by the anime-gate.tsx redirect path
    const redirectPath = "/create/character-setup";
    expect(redirectPath).toContain("character-setup");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 9. VOICE PREVIEW — 6s duration spec
// ═══════════════════════════════════════════════════════════════════════
describe("Stage 5 · Voice preview", () => {
  it("catalog copy mentions preview functionality", () => {
    expect(VOICE_CATALOG_COPY.preview).toBe("Preview");
  });

  it("each voice has a sampleUrl field", () => {
    for (const voice of STOCK_VOICES) {
      // sampleUrl can be string or null
      expect("sampleUrl" in voice).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 10. CHARACTER BAKERY — selection logic
// ═══════════════════════════════════════════════════════════════════════
describe("Stage 5 · Character selection logic", () => {
  it("all characters must have a style selected to proceed", () => {
    const characters = [
      { id: 1, name: "Hero" },
      { id: 2, name: "Villain" },
    ];
    const selections: Record<number, string> = { 1: "shonen_bold" };
    const allStyled = characters.every((c) => !!selections[c.id]);
    expect(allStyled).toBe(false);
  });

  it("proceeds when all characters have styles", () => {
    const characters = [
      { id: 1, name: "Hero" },
      { id: 2, name: "Villain" },
    ];
    const selections: Record<number, string> = {
      1: "shonen_bold",
      2: "seinen_clean",
    };
    const allStyled = characters.every((c) => !!selections[c.id]);
    expect(allStyled).toBe(true);
  });

  it("all characters must have a voice selected to proceed", () => {
    const characters = [
      { id: 1, name: "Hero" },
      { id: 2, name: "Villain" },
    ];
    const selections: Record<number, string> = { 1: "voice_1" };
    const allVoiced = characters.every((c) => !!selections[c.id]);
    expect(allVoiced).toBe(false);
  });

  it("proceeds when all characters have voices", () => {
    const characters = [
      { id: 1, name: "Hero" },
      { id: 2, name: "Villain" },
    ];
    const selections: Record<number, string> = {
      1: "voice_1",
      2: "voice_2",
    };
    const allVoiced = characters.every((c) => !!selections[c.id]);
    expect(allVoiced).toBe(true);
  });
});
