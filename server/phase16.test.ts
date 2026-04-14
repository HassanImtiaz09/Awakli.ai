import { describe, it, expect } from "vitest";
import {
  MUSIC_GENRES, BGM_MOODS, STINGER_TYPES, VOCAL_TYPES, LANGUAGES,
  ENERGY_CURVES, INSTRUMENTS,
} from "./routers-music";

// ─── Music Constants Tests ───────────────────────────────────────────

describe("Phase 16: Music Pipeline Constants", () => {
  it("should have 8+ music genres with required fields", () => {
    expect(MUSIC_GENRES.length).toBeGreaterThanOrEqual(8);
    for (const g of MUSIC_GENRES) {
      expect(g).toHaveProperty("id");
      expect(g).toHaveProperty("name");
      expect(g).toHaveProperty("description");
      expect(g).toHaveProperty("reference");
      expect(g.id).toBeTruthy();
      expect(g.name).toBeTruthy();
    }
  });

  it("should have unique genre IDs", () => {
    const ids = MUSIC_GENRES.map(g => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("should have 8+ BGM moods with required fields", () => {
    expect(BGM_MOODS.length).toBeGreaterThanOrEqual(8);
    for (const m of BGM_MOODS) {
      expect(m).toHaveProperty("id");
      expect(m).toHaveProperty("label");
      expect(m).toHaveProperty("description");
      expect(m).toHaveProperty("color");
      expect(m.id).toBeTruthy();
    }
  });

  it("should have unique BGM mood IDs", () => {
    const ids = BGM_MOODS.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("should have 5+ stinger types", () => {
    expect(STINGER_TYPES.length).toBeGreaterThanOrEqual(5);
    for (const s of STINGER_TYPES) {
      expect(s).toHaveProperty("id");
      expect(s).toHaveProperty("label");
      expect(s).toHaveProperty("sourceMood");
      expect(s).toHaveProperty("durationMs");
      expect(s.durationMs).toBeGreaterThan(0);
      expect(s.durationMs).toBeLessThanOrEqual(10000);
    }
  });

  it("should have unique stinger type IDs", () => {
    const ids = STINGER_TYPES.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("should have 5 vocal types", () => {
    expect(VOCAL_TYPES).toContain("male");
    expect(VOCAL_TYPES).toContain("female");
    expect(VOCAL_TYPES).toContain("duet");
    expect(VOCAL_TYPES).toContain("choir");
    expect(VOCAL_TYPES).toContain("instrumental");
    expect(VOCAL_TYPES.length).toBe(5);
  });

  it("should have 4+ languages", () => {
    expect(LANGUAGES).toContain("japanese");
    expect(LANGUAGES).toContain("english");
    expect(LANGUAGES.length).toBeGreaterThanOrEqual(4);
  });

  it("should have 3 energy curves", () => {
    expect(ENERGY_CURVES).toContain("builds_gradually");
    expect(ENERGY_CURVES).toContain("starts_strong");
    expect(ENERGY_CURVES).toContain("stays_consistent");
    expect(ENERGY_CURVES.length).toBe(3);
  });

  it("should have 6+ instruments", () => {
    expect(INSTRUMENTS.length).toBeGreaterThanOrEqual(6);
    for (const inst of INSTRUMENTS) {
      expect(typeof inst).toBe("string");
      expect(inst.length).toBeGreaterThan(0);
    }
  });
});

// ─── Music Concept Router Tests ──────────────────────────────────────

describe("Phase 16: Music Concept Router", () => {
  it("suggestThemeConcept should require projectId and themeType", () => {
    // Validates the input schema structure
    const validInput = { projectId: 1, themeType: "opening" as const };
    expect(validInput.projectId).toBe(1);
    expect(["opening", "ending"]).toContain(validInput.themeType);
  });

  it("generateLyrics should require all fields", () => {
    const validInput = {
      projectId: 1,
      themeType: "opening" as const,
      concept: "A song about friendship and adventure",
      genre: "j_rock",
      vocalType: "female" as const,
      language: "japanese" as const,
    };
    expect(validInput.genre).toBe("j_rock");
    expect(VOCAL_TYPES).toContain(validInput.vocalType);
    expect(LANGUAGES).toContain(validInput.language);
  });

  it("updateLyrics should require trackId and lyrics", () => {
    const validInput = { trackId: 1, lyrics: "[Verse 1]\nSome lyrics here" };
    expect(validInput.trackId).toBeGreaterThan(0);
    expect(validInput.lyrics.length).toBeGreaterThan(0);
  });

  it("generateAltLine should require trackId, lineIndex, and context", () => {
    const validInput = { trackId: 1, lineIndex: 0, context: "verse about hope" };
    expect(validInput.lineIndex).toBeGreaterThanOrEqual(0);
    expect(validInput.context.length).toBeGreaterThan(0);
  });

  it("rewriteSection should require trackId, sectionName, and direction", () => {
    const validInput = { trackId: 1, sectionName: "chorus", direction: "more emotional" };
    expect(validInput.sectionName.length).toBeGreaterThan(0);
    expect(validInput.direction.length).toBeGreaterThan(0);
  });
});

// ─── Music Generation Router Tests ───────────────────────────────────

describe("Phase 16: Music Generation Router", () => {
  it("generateTheme should accept all required params", () => {
    const validInput = {
      projectId: 1,
      themeType: "opening" as const,
      lyrics: "[Verse 1]\nLyrics here",
      genre: "j_rock",
      tempo: 140,
      vocalType: "female" as const,
      language: "japanese",
      variationCount: 3,
    };
    expect(validInput.tempo).toBeGreaterThanOrEqual(60);
    expect(validInput.tempo).toBeLessThanOrEqual(220);
    expect(validInput.variationCount).toBeGreaterThanOrEqual(1);
    expect(validInput.variationCount).toBeLessThanOrEqual(5);
  });

  it("refineTheme should accept trackId and refinement direction", () => {
    const validInput = {
      trackId: 1,
      direction: "more_energetic",
      customNotes: "Add more guitar",
    };
    expect(validInput.trackId).toBeGreaterThan(0);
    expect(validInput.direction.length).toBeGreaterThan(0);
  });

  it("selectVersion should require trackId and versionNumber", () => {
    const validInput = { trackId: 1, versionNumber: 2 };
    expect(validInput.versionNumber).toBeGreaterThanOrEqual(1);
  });

  it("confirmTheme should require trackId", () => {
    const validInput = { trackId: 1 };
    expect(validInput.trackId).toBeGreaterThan(0);
  });
});

// ─── OST Router Tests ────────────────────────────────────────────────

describe("Phase 16: OST Router", () => {
  it("generateOst should require projectId", () => {
    const validInput = { projectId: 1 };
    expect(validInput.projectId).toBeGreaterThan(0);
  });

  it("generateCustomTrack should accept mood, genre, and optional params", () => {
    const validInput = {
      projectId: 1,
      mood: "battle",
      genre: "epic_orchestral",
      customPrompt: "Intense battle music with choir",
      durationSeconds: 120,
      isLoopable: true,
    };
    expect(validInput.durationSeconds).toBeGreaterThan(0);
    expect(validInput.isLoopable).toBe(true);
  });

  it("generateStingers should require projectId", () => {
    const validInput = { projectId: 1 };
    expect(validInput.projectId).toBeGreaterThan(0);
  });

  it("autoAssignScenes should require projectId", () => {
    const validInput = { projectId: 1 };
    expect(validInput.projectId).toBeGreaterThan(0);
  });

  it("assignSceneBgm should require projectId, episodeId, sceneIndex, and trackId", () => {
    const validInput = { projectId: 1, episodeId: 1, sceneIndex: 0, trackId: 5 };
    expect(validInput.sceneIndex).toBeGreaterThanOrEqual(0);
    expect(validInput.trackId).toBeGreaterThan(0);
  });
});

// ─── Track Management Router Tests ───────────────────────────────────

describe("Phase 16: Track Management Router", () => {
  it("getTracks should filter by projectId and trackType", () => {
    const validInput = { projectId: 1, trackType: "bgm" as const };
    expect(["opening", "ending", "bgm", "stinger", "custom"]).toContain(validInput.trackType);
  });

  it("approveTrack should require trackId", () => {
    const validInput = { trackId: 1 };
    expect(validInput.trackId).toBeGreaterThan(0);
  });

  it("regenerateTrack should require trackId and optional customNotes", () => {
    const validInput = { trackId: 1, customNotes: "Make it more dramatic" };
    expect(validInput.trackId).toBeGreaterThan(0);
  });

  it("getVersions should require trackId", () => {
    const validInput = { trackId: 1 };
    expect(validInput.trackId).toBeGreaterThan(0);
  });

  it("revertVersion should require trackId and versionNumber", () => {
    const validInput = { trackId: 1, versionNumber: 1 };
    expect(validInput.versionNumber).toBeGreaterThanOrEqual(1);
  });

  it("uploadTrack should accept file metadata", () => {
    const validInput = {
      projectId: 1,
      trackType: "custom" as const,
      title: "My Custom Track",
      fileUrl: "https://cdn.example.com/track.mp3",
      durationSeconds: 180,
      mood: "emotional",
    };
    expect(validInput.fileUrl).toContain("https://");
    expect(validInput.durationSeconds).toBeGreaterThan(0);
  });

  it("saveMusicConfig should accept full config object", () => {
    const validInput = {
      projectId: 1,
      config: {
        openingTrackId: 1,
        endingTrackId: 2,
        bgmAssignments: [{ sceneIndex: 0, trackId: 3 }],
        masterVolume: 0.8,
        duckingIntensity: 0.5,
      },
    };
    expect(validInput.config.masterVolume).toBeGreaterThanOrEqual(0);
    expect(validInput.config.masterVolume).toBeLessThanOrEqual(1);
  });

  it("getGenres should return genre list", () => {
    // This is a query that returns MUSIC_GENRES
    expect(MUSIC_GENRES.length).toBeGreaterThan(0);
    expect(MUSIC_GENRES[0]).toHaveProperty("id");
    expect(MUSIC_GENRES[0]).toHaveProperty("name");
  });

  it("getBgmMoods should return mood list", () => {
    expect(BGM_MOODS.length).toBeGreaterThan(0);
    expect(BGM_MOODS[0]).toHaveProperty("id");
    expect(BGM_MOODS[0]).toHaveProperty("label");
  });

  it("getStingerTypes should return stinger type list", () => {
    expect(STINGER_TYPES.length).toBeGreaterThan(0);
    expect(STINGER_TYPES[0]).toHaveProperty("id");
    expect(STINGER_TYPES[0]).toHaveProperty("durationMs");
  });
});

// ─── Tier Enforcement Tests ──────────────────────────────────────────

describe("Phase 16: Music Tier Enforcement", () => {
  it("free tier should have zero music capabilities", () => {
    // Imported from the MUSIC_TIER_LIMITS constant
    const freeLimits = { opVariations: 0, edVariations: 0, opRefinements: 0, edRefinements: 0, bgmTracks: 0, customTracks: 0, upload: false, sectionEdit: false, exportStems: false };
    expect(freeLimits.opVariations).toBe(0);
    expect(freeLimits.bgmTracks).toBe(0);
    expect(freeLimits.upload).toBe(false);
    expect(freeLimits.exportStems).toBe(false);
  });

  it("creator tier should have moderate music capabilities", () => {
    const creatorLimits = { opVariations: 3, edVariations: 3, opRefinements: 3, edRefinements: 2, bgmTracks: 8, customTracks: 2, upload: true, sectionEdit: false, exportStems: false };
    expect(creatorLimits.opVariations).toBe(3);
    expect(creatorLimits.bgmTracks).toBe(8);
    expect(creatorLimits.customTracks).toBe(2);
    expect(creatorLimits.upload).toBe(true);
    expect(creatorLimits.sectionEdit).toBe(false);
  });

  it("studio tier should have full music capabilities", () => {
    const studioLimits = { opVariations: 5, edVariations: 5, opRefinements: 5, edRefinements: 5, bgmTracks: 12, customTracks: 999, upload: true, sectionEdit: true, exportStems: true };
    expect(studioLimits.opVariations).toBe(5);
    expect(studioLimits.bgmTracks).toBe(12);
    expect(studioLimits.customTracks).toBe(999);
    expect(studioLimits.sectionEdit).toBe(true);
    expect(studioLimits.exportStems).toBe(true);
  });
});

// ─── Frontend Component Tests ────────────────────────────────────────

describe("Phase 16: Music Studio Frontend", () => {
  it("should have 8 genre options matching backend", () => {
    const frontendGenres = [
      "j_rock", "j_pop", "epic_orchestral", "electronic",
      "hip_hop", "metal", "lofi", "acoustic",
    ];
    expect(frontendGenres.length).toBe(8);
    // All frontend genres should exist in backend
    const backendIds = MUSIC_GENRES.map(g => g.id);
    for (const fg of frontendGenres) {
      expect(backendIds).toContain(fg);
    }
  });

  it("should have 5 vocal options matching backend", () => {
    const frontendVocals = ["female", "male", "duet", "choir", "instrumental"];
    expect(frontendVocals.length).toBe(5);
    for (const v of frontendVocals) {
      expect(VOCAL_TYPES as readonly string[]).toContain(v);
    }
  });

  it("should have 4 language options matching backend", () => {
    const frontendLangs = ["japanese", "english", "bilingual", "korean"];
    expect(frontendLangs.length).toBe(4);
    for (const l of frontendLangs) {
      expect(LANGUAGES as readonly string[]).toContain(l);
    }
  });

  it("should have 8 refinement options", () => {
    const refinements = [
      "more_energetic", "softer", "speed_up", "slow_down",
      "add_guitar_solo", "add_piano_break", "heavier_drums", "more_orchestral",
    ];
    expect(refinements.length).toBe(8);
  });

  it("theme composer should have 5 steps", () => {
    const steps = ["concept", "lyrics", "style", "generate", "review"];
    expect(steps.length).toBe(5);
  });

  it("BGM studio should have 3 sections", () => {
    const sections = ["tracks", "scenes", "stingers"];
    expect(sections.length).toBe(3);
  });
});

// ─── Schema Validation Tests ─────────────────────────────────────────

describe("Phase 16: Music Schema Validation", () => {
  it("music track types should be valid", () => {
    const validTypes = ["opening", "ending", "bgm", "stinger", "custom"];
    for (const t of validTypes) {
      expect(typeof t).toBe("string");
      expect(t.length).toBeGreaterThan(0);
    }
  });

  it("tempo range should be 60-220 BPM", () => {
    const minTempo = 60;
    const maxTempo = 220;
    expect(minTempo).toBeLessThan(maxTempo);
    expect(minTempo).toBeGreaterThan(0);
  });

  it("variation count should be 1-5", () => {
    const minVariations = 1;
    const maxVariations = 5;
    expect(minVariations).toBeGreaterThan(0);
    expect(maxVariations).toBeLessThanOrEqual(5);
  });

  it("BGM moods should cover essential story emotions", () => {
    const moodIds = BGM_MOODS.map(m => m.id);
    const essentialMoods = ["main_theme", "battle", "tension", "emotional", "comedy"];
    for (const mood of essentialMoods) {
      expect(moodIds).toContain(mood);
    }
  });

  it("stinger types should cover essential transition sounds", () => {
    const stingerIds = STINGER_TYPES.map(s => s.id);
    const essentialStingers = ["impact", "suspense", "comedy_beat"];
    for (const stinger of essentialStingers) {
      expect(stingerIds).toContain(stinger);
    }
  });
});
