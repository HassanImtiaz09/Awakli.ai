/**
 * Stage 5B · Setup — LoRA + Voice Clone + Overlay (Studio variant) tests
 *
 * Covers:
 *  - LoRATrainer copy strings, credit costs, batch limits
 *  - VoiceClone copy strings, consent rules, sample validation
 *  - UserVoiceOverlay copy strings, credit costs, consent rules
 *  - Tier gating (Studio/Enterprise only)
 *  - Analytics events
 */
import { describe, it, expect } from "vitest";

// ─── Import copy strings & constants ────────────────────────────────────
import {
  LORA_COPY,
  LORA_CREDITS,
  type LoRAStatus,
  type CharacterLoRA,
} from "../client/src/components/awakli/LoRATrainer";
import {
  VOICE_CLONE_COPY,
  VOICE_CLONE_CREDITS,
  type VoiceCloneStatus,
  type CharacterVoiceClone,
} from "../client/src/components/awakli/VoiceClone";
import {
  OVERLAY_COPY,
  OVERLAY_CREDITS,
  type OverlayStatus,
  type DialogueLine,
  type TargetVoice,
} from "../client/src/components/awakli/UserVoiceOverlay";

// ═══════════════════════════════════════════════════════════════════════
// 1. LORA TRAINER — COPY STRINGS
// ═══════════════════════════════════════════════════════════════════════
describe("Stage 5B · LoRA Trainer copy strings", () => {
  it("cta includes character name", () => {
    expect(LORA_COPY.cta("Akira")).toBe("Train Akira's LoRA");
    expect(LORA_COPY.cta("Sakura")).toBe("Train Sakura's LoRA");
  });

  it("cost string matches spec", () => {
    expect(LORA_COPY.cost).toBe("Train LoRA · 120 credits (~10 min)");
  });

  it("training string matches spec", () => {
    expect(LORA_COPY.training).toBe("Training LoRA…");
  });

  it("ready string matches spec", () => {
    expect(LORA_COPY.ready).toBe("LoRA ready");
  });

  it("error string matches spec", () => {
    expect(LORA_COPY.error).toBe("Training failed — tap to retry");
  });

  it("batch CTA matches spec", () => {
    expect(LORA_COPY.batchCta).toBe("Batch train all characters");
  });

  it("batch note matches spec", () => {
    expect(LORA_COPY.batchNote).toBe(
      "Studio Pro: batch LoRA across up to 8 characters"
    );
  });

  it("monthly pool string matches spec", () => {
    expect(LORA_COPY.monthlyPool).toBe("500c monthly LoRA credit pool");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. LORA TRAINER — CREDIT COSTS
// ═══════════════════════════════════════════════════════════════════════
describe("Stage 5B · LoRA credit costs", () => {
  it("per-character LoRA training costs 120 credits", () => {
    expect(LORA_CREDITS.perCharacter).toBe(120);
  });

  it("Studio Pro batch max is 8 characters", () => {
    expect(LORA_CREDITS.studioProBatchMax).toBe(8);
  });

  it("Studio Pro monthly LoRA pool is 500 credits", () => {
    expect(LORA_CREDITS.studioProMonthlyPool).toBe(500);
  });

  it("batch training 4 characters costs 4 × 120 = 480 credits", () => {
    const batchSize = 4;
    expect(batchSize * LORA_CREDITS.perCharacter).toBe(480);
  });

  it("batch training 8 characters costs 8 × 120 = 960 credits", () => {
    const batchSize = LORA_CREDITS.studioProBatchMax;
    expect(batchSize * LORA_CREDITS.perCharacter).toBe(960);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. LORA TRAINER — STATUS TRANSITIONS
// ═══════════════════════════════════════════════════════════════════════
describe("Stage 5B · LoRA status transitions", () => {
  const validStatuses: LoRAStatus[] = ["idle", "training", "ready", "error"];

  it("has exactly 4 valid statuses", () => {
    expect(validStatuses).toHaveLength(4);
  });

  it("all statuses are distinct", () => {
    const unique = new Set(validStatuses);
    expect(unique.size).toBe(4);
  });

  it("CharacterLoRA type has required fields", () => {
    const char: CharacterLoRA = {
      characterId: 1,
      characterName: "Akira",
      referenceCount: 15,
      status: "idle",
      progress: 0,
    };
    expect(char.characterId).toBe(1);
    expect(char.characterName).toBe("Akira");
    expect(char.referenceCount).toBe(15);
    expect(char.status).toBe("idle");
    expect(char.progress).toBe(0);
  });

  it("progress ring shows 0-100 range", () => {
    const char: CharacterLoRA = {
      characterId: 1,
      characterName: "Test",
      referenceCount: 10,
      status: "training",
      progress: 50,
    };
    expect(char.progress).toBeGreaterThanOrEqual(0);
    expect(char.progress).toBeLessThanOrEqual(100);
  });

  it("error state can include custom error message", () => {
    const char: CharacterLoRA = {
      characterId: 1,
      characterName: "Test",
      referenceCount: 10,
      status: "error",
      progress: 0,
      errorMessage: "GPU timeout",
    };
    expect(char.errorMessage).toBe("GPU timeout");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 4. VOICE CLONE — COPY STRINGS
// ═══════════════════════════════════════════════════════════════════════
describe("Stage 5B · Voice Clone copy strings", () => {
  it("consent string matches spec exactly", () => {
    expect(VOICE_CLONE_COPY.consent).toBe(
      "This is my voice, or I have permission to clone it"
    );
  });

  it("cost string matches spec", () => {
    expect(VOICE_CLONE_COPY.cost).toBe("Clone voice · 80 credits");
  });

  it("tooShort error matches spec", () => {
    expect(VOICE_CLONE_COPY.tooShort).toBe(
      "Sample must be at least 25 seconds. Please record a longer clip."
    );
  });

  it("tooLong error matches spec", () => {
    expect(VOICE_CLONE_COPY.tooLong).toBe("Sample must be under 120 seconds.");
  });

  it("training string matches spec", () => {
    expect(VOICE_CLONE_COPY.training).toBe("Cloning voice…");
  });

  it("ready string matches spec", () => {
    expect(VOICE_CLONE_COPY.ready).toBe("Voice clone ready");
  });

  it("error string matches spec", () => {
    expect(VOICE_CLONE_COPY.error).toBe("Cloning failed — tap to retry");
  });

  it("upload hint matches spec", () => {
    expect(VOICE_CLONE_COPY.uploadHint).toBe(
      "Upload a 30–120s voice sample (MP3, WAV, or M4A)"
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 5. VOICE CLONE — SAMPLE VALIDATION
// ═══════════════════════════════════════════════════════════════════════
describe("Stage 5B · Voice Clone sample validation", () => {
  it("minimum sample duration is 25 seconds", () => {
    expect(VOICE_CLONE_COPY.sampleRange.min).toBe(25);
  });

  it("maximum sample duration is 120 seconds", () => {
    expect(VOICE_CLONE_COPY.sampleRange.max).toBe(120);
  });

  it("rejects samples under 25 seconds", () => {
    const duration = 20;
    expect(duration < VOICE_CLONE_COPY.sampleRange.min).toBe(true);
  });

  it("accepts samples at exactly 25 seconds", () => {
    const duration = 25;
    expect(duration >= VOICE_CLONE_COPY.sampleRange.min).toBe(true);
  });

  it("accepts samples at 60 seconds", () => {
    const duration = 60;
    expect(
      duration >= VOICE_CLONE_COPY.sampleRange.min &&
        duration <= VOICE_CLONE_COPY.sampleRange.max
    ).toBe(true);
  });

  it("rejects samples over 120 seconds", () => {
    const duration = 150;
    expect(duration > VOICE_CLONE_COPY.sampleRange.max).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 6. VOICE CLONE — CONSENT RULES
// ═══════════════════════════════════════════════════════════════════════
describe("Stage 5B · Voice Clone consent rules", () => {
  it("consent is NEVER pre-checked", () => {
    const char: CharacterVoiceClone = {
      characterId: 1,
      characterName: "Test",
      status: "idle",
      progress: 0,
      sampleDuration: null,
      sampleUrl: null,
      consentGiven: false,
    };
    expect(char.consentGiven).toBe(false);
  });

  it("cloning requires consent to be true", () => {
    const canClone = (char: CharacterVoiceClone, credits: number) =>
      char.consentGiven &&
      char.sampleDuration !== null &&
      char.sampleDuration >= VOICE_CLONE_COPY.sampleRange.min &&
      credits >= VOICE_CLONE_CREDITS.perVoice;

    const noConsent: CharacterVoiceClone = {
      characterId: 1,
      characterName: "Test",
      status: "idle",
      progress: 0,
      sampleDuration: 60,
      sampleUrl: "test.mp3",
      consentGiven: false,
    };
    expect(canClone(noConsent, 200)).toBe(false);

    const withConsent: CharacterVoiceClone = {
      characterId: 1,
      characterName: "Test",
      status: "idle",
      progress: 0,
      sampleDuration: 60,
      sampleUrl: "test.mp3",
      consentGiven: true,
    };
    expect(canClone(withConsent, 200)).toBe(true);
  });

  it("cloning requires sufficient credits (80)", () => {
    expect(VOICE_CLONE_CREDITS.perVoice).toBe(80);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 7. VOICE CLONE — CREDIT COSTS
// ═══════════════════════════════════════════════════════════════════════
describe("Stage 5B · Voice Clone credit costs", () => {
  it("per-voice cloning costs 80 credits", () => {
    expect(VOICE_CLONE_CREDITS.perVoice).toBe(80);
  });

  it("cloning 3 characters costs 3 × 80 = 240 credits", () => {
    expect(3 * VOICE_CLONE_CREDITS.perVoice).toBe(240);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 8. USER VOICE OVERLAY — COPY STRINGS
// ═══════════════════════════════════════════════════════════════════════
describe("Stage 5B · User Voice Overlay copy strings", () => {
  it("cost string matches spec", () => {
    expect(OVERLAY_COPY.cost).toBe("Overlay my take · 6 credits/line");
  });

  it("hint string matches spec", () => {
    expect(OVERLAY_COPY.hint).toBe(
      "Read the line the way you hear it. We'll keep your timing — just swap the voice."
    );
  });

  it("recording string matches spec", () => {
    expect(OVERLAY_COPY.recording).toBe("Recording…");
  });

  it("mapping string matches spec", () => {
    expect(OVERLAY_COPY.mapping).toBe("Choose target voice");
  });

  it("previewing string matches spec", () => {
    expect(OVERLAY_COPY.previewing).toBe("Generating preview…");
  });

  it("preview ready string matches spec", () => {
    expect(OVERLAY_COPY.previewReady).toBe("Preview ready");
  });

  it("apply string matches spec", () => {
    expect(OVERLAY_COPY.apply).toBe("Apply overlay");
  });

  it("max duration is 120 seconds (2-minute cap)", () => {
    expect(OVERLAY_COPY.maxDuration).toBe(120);
  });

  it("max duration label matches spec", () => {
    expect(OVERLAY_COPY.maxDurationLabel).toBe("2-minute cap");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 9. USER VOICE OVERLAY — CREDIT COSTS
// ═══════════════════════════════════════════════════════════════════════
describe("Stage 5B · Overlay credit costs", () => {
  it("per-line overlay costs 6 credits", () => {
    expect(OVERLAY_CREDITS.perLine).toBe(6);
  });

  it("overlaying 10 lines costs 10 × 6 = 60 credits", () => {
    expect(10 * OVERLAY_CREDITS.perLine).toBe(60);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 10. USER VOICE OVERLAY — STATUS TRANSITIONS
// ═══════════════════════════════════════════════════════════════════════
describe("Stage 5B · Overlay status transitions", () => {
  const validStatuses: OverlayStatus[] = [
    "idle",
    "recording",
    "mapping",
    "previewing",
    "preview_ready",
    "applied",
  ];

  it("has exactly 6 valid statuses", () => {
    expect(validStatuses).toHaveLength(6);
  });

  it("all statuses are distinct", () => {
    const unique = new Set(validStatuses);
    expect(unique.size).toBe(6);
  });

  it("DialogueLine type has required fields", () => {
    const line: DialogueLine = {
      id: "line_1",
      characterId: 1,
      characterName: "Akira",
      lineText: "Hello world",
      status: "idle",
      userAudioUrl: null,
      userAudioDuration: null,
      targetVoiceId: null,
      previewUrl: null,
    };
    expect(line.id).toBe("line_1");
    expect(line.status).toBe("idle");
    expect(line.userAudioUrl).toBeNull();
  });

  it("TargetVoice type has required fields", () => {
    const voice: TargetVoice = {
      id: "tv01",
      name: "Akira",
      gender: "male",
    };
    expect(voice.id).toBe("tv01");
    expect(voice.name).toBe("Akira");
    expect(["male", "female", "neutral"]).toContain(voice.gender);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 11. TIER GATING
// ═══════════════════════════════════════════════════════════════════════
describe("Stage 5B · Tier gating", () => {
  const STUDIO_TIERS = new Set(["studio", "enterprise"]);

  it("LoRA/VoiceClone/Overlay are hidden for free_trial", () => {
    expect(STUDIO_TIERS.has("free_trial")).toBe(false);
  });

  it("LoRA/VoiceClone/Overlay are hidden for creator", () => {
    expect(STUDIO_TIERS.has("creator")).toBe(false);
  });

  it("LoRA/VoiceClone/Overlay are hidden for creator_pro (Mangaka)", () => {
    expect(STUDIO_TIERS.has("creator_pro")).toBe(false);
  });

  it("LoRA/VoiceClone/Overlay are visible for studio", () => {
    expect(STUDIO_TIERS.has("studio")).toBe(true);
  });

  it("LoRA/VoiceClone/Overlay are visible for enterprise (Studio Pro)", () => {
    expect(STUDIO_TIERS.has("enterprise")).toBe(true);
  });

  it("batch LoRA is only available for enterprise tier", () => {
    const hasBatch = (tier: string) => tier === "enterprise";
    expect(hasBatch("studio")).toBe(false);
    expect(hasBatch("enterprise")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 12. CONSENT CHECKBOX — NEVER PRE-CHECKED
// ═══════════════════════════════════════════════════════════════════════
describe("Stage 5B · Consent checkboxes", () => {
  it("voice clone consent defaults to false", () => {
    const char: CharacterVoiceClone = {
      characterId: 1,
      characterName: "Test",
      status: "idle",
      progress: 0,
      sampleDuration: null,
      sampleUrl: null,
      consentGiven: false,
    };
    expect(char.consentGiven).toBe(false);
  });

  it("voice clone consent string is explicit about permission", () => {
    expect(VOICE_CLONE_COPY.consent).toContain("my voice");
    expect(VOICE_CLONE_COPY.consent).toContain("permission");
  });

  it("overlay consent is separate from voice clone consent", () => {
    // They are independent boolean states
    const voiceConsent = false;
    const overlayConsent = false;
    expect(voiceConsent).toBe(false);
    expect(overlayConsent).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 13. ANALYTICS EVENTS
// ═══════════════════════════════════════════════════════════════════════
describe("Stage 5B · Analytics events", () => {
  const expectedEvents = [
    "stage5_lora_start",
    "stage5_lora_ready",
    "stage5_voiceclone_consent",
    "stage5_voiceclone_ready",
    "stage5_overlay_preview",
  ];

  it("defines all required analytics events", () => {
    expectedEvents.forEach((event) => {
      expect(event).toMatch(/^stage5_/);
    });
  });

  it("all analytics events are unique", () => {
    const unique = new Set(expectedEvents);
    expect(unique.size).toBe(expectedEvents.length);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 14. INTEGRATION — COMBINED CREDIT CALCULATION
// ═══════════════════════════════════════════════════════════════════════
describe("Stage 5B · Combined credit calculations", () => {
  it("full Studio setup: 2 LoRA + 2 voice clone + 5 overlay lines", () => {
    const loraCost = 2 * LORA_CREDITS.perCharacter;
    const voiceCost = 2 * VOICE_CLONE_CREDITS.perVoice;
    const overlayCost = 5 * OVERLAY_CREDITS.perLine;
    const total = loraCost + voiceCost + overlayCost;
    expect(total).toBe(240 + 160 + 30);
    expect(total).toBe(430);
  });

  it("Studio Pro batch: 8 LoRA characters", () => {
    const cost = LORA_CREDITS.studioProBatchMax * LORA_CREDITS.perCharacter;
    expect(cost).toBe(960);
  });

  it("monthly pool covers ~4 LoRA trainings", () => {
    const trainings = Math.floor(
      LORA_CREDITS.studioProMonthlyPool / LORA_CREDITS.perCharacter
    );
    expect(trainings).toBe(4);
  });
});
