/**
 * Production Bible Compiler
 * 
 * Assembles a comprehensive "Production Bible" from all pre-production approvals.
 * The Bible is the single source of truth for all harness checks — character identities,
 * voice assignments, animation style, color grading, and more.
 * 
 * Once locked, the Bible is immutable for the duration of the pipeline run.
 */

import { getDb } from "./db";
import { eq, and, desc } from "drizzle-orm";
import {
  productionBibles,
  preProductionConfigs,
  characters,
  characterVersions,
  episodes,
  panels,
  projects,
  type ProductionBible,
} from "../drizzle/schema";

// ─── Types ─────────────────────────────────────────────────────────────

export interface CharacterBibleEntry {
  id: number;
  name: string;
  role: string;
  personalityTraits: string[];
  visualTraits: Record<string, any>;
  referenceImages: string[];
  voiceId: string | null;
  voiceCloneUrl: string | null;
  voiceSettings: Record<string, any> | null;
  loraModelUrl: string | null;
  loraTriggerWord: string | null;
}

export interface EpisodeBibleEntry {
  id: number;
  episodeNumber: number;
  title: string;
  synopsis: string;
  panelCount: number;
  dialoguePanelCount: number;
  characters: string[];  // character names appearing in this episode
}

export interface ProductionBibleData {
  version: number;
  projectId: number;
  projectTitle: string;
  genre: string[];
  artStyle: string;
  compiledAt: string;

  // Character identities — the core reference for visual consistency checks
  characters: CharacterBibleEntry[];
  characterNameMap: Record<string, number>;  // name → characterId for quick lookup

  // Animation & visual style
  animationStyle: string;
  styleMixing: Record<string, string> | null;
  colorGrading: string;
  atmosphericEffects: Record<string, string[]> | null;
  aspectRatio: string;

  // Audio configuration
  voiceAssignments: Record<string, any>;
  audioConfig: Record<string, any> | null;
  musicConfig: Record<string, any> | null;

  // Structure
  openingStyle: string;
  endingStyle: string;
  pacing: string;
  subtitleConfig: Record<string, any> | null;

  // Episode summaries
  episodes: EpisodeBibleEntry[];

  // Quality thresholds (configurable per project)
  qualityThresholds: {
    minImageScore: number;       // default 6.0
    minCharacterMatch: number;   // default 7.0 (most critical)
    minVideoScore: number;       // default 5.5
    minAudioScore: number;       // default 6.0
    maxRetries: number;          // default 3
    blockOnNsfw: boolean;        // default true
  };
}

// ─── Compiler ──────────────────────────────────────────────────────────

export async function compileProductionBible(projectId: number): Promise<ProductionBibleData> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Fetch project
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new Error(`Project ${projectId} not found`);

  // Fetch pre-production config
  const [preConfig] = await db.select().from(preProductionConfigs)
    .where(eq(preProductionConfigs.projectId, projectId))
    .orderBy(desc(preProductionConfigs.id))
    .limit(1);

  // Fetch all characters
  const chars = await db.select().from(characters)
    .where(eq(characters.projectId, projectId));

  // Fetch episodes with panel counts
  const eps = await db.select().from(episodes)
    .where(eq(episodes.projectId, projectId));

  const episodeBible: EpisodeBibleEntry[] = [];
  for (const ep of eps) {
    const epPanels = await db.select().from(panels)
      .where(eq(panels.episodeId, ep.id));
    
    const dialoguePanels = epPanels.filter((p: any) => {
      const dialogue = p.dialogue as any;
      return dialogue && (Array.isArray(dialogue) ? dialogue.length > 0 : Object.keys(dialogue).length > 0);
    });

    // Extract character names from panel dialogue
    const charNames = new Set<string>();
    for (const p of epPanels) {
      const dialogue = p.dialogue as any;
      if (Array.isArray(dialogue)) {
        dialogue.forEach((d: any) => { if (d.character) charNames.add(d.character); });
      }
    }

    episodeBible.push({
      id: ep.id,
      episodeNumber: ep.episodeNumber,
      title: ep.title || `Episode ${ep.episodeNumber}`,
      synopsis: ep.synopsis || "",
      panelCount: epPanels.length,
      dialoguePanelCount: dialoguePanels.length,
      characters: Array.from(charNames),
    });
  }

  // Build character name map
  const characterNameMap: Record<string, number> = {};
  for (const c of chars) {
    characterNameMap[c.name.toLowerCase()] = c.id;
  }

  const settings = (project.settings || {}) as Record<string, any>;

  const bible: ProductionBibleData = {
    version: 1,
    projectId,
    projectTitle: project.title,
    genre: Array.isArray(settings.genre) ? settings.genre : [],
    artStyle: (settings.artStyle as string) || "anime",
    compiledAt: new Date().toISOString(),

    characters: chars.map((c: any) => ({
      id: c.id,
      name: c.name,
      role: c.role,
      personalityTraits: (c.personalityTraits as string[]) || [],
      visualTraits: (c.visualTraits as Record<string, any>) || {},
      referenceImages: (c.referenceImages as string[]) || [],
      voiceId: c.voiceId,
      voiceCloneUrl: c.voiceCloneUrl,
      voiceSettings: c.voiceSettings as Record<string, any> | null,
      loraModelUrl: c.loraModelUrl,
      loraTriggerWord: c.loraTriggerWord,
    })),
    characterNameMap,

    animationStyle: preConfig?.animationStyle || "motion_comic",
    styleMixing: preConfig?.styleMixing as Record<string, string> | null,
    colorGrading: preConfig?.colorGrading || "vivid",
    atmosphericEffects: preConfig?.atmosphericEffects as Record<string, string[]> | null,
    aspectRatio: preConfig?.aspectRatio || "16:9",

    voiceAssignments: (preConfig?.voiceAssignments as Record<string, any>) || {},
    audioConfig: (preConfig?.audioConfig as Record<string, any>) || null,
    musicConfig: (preConfig?.musicConfig as Record<string, any>) || null,

    openingStyle: preConfig?.openingStyle || "title_card",
    endingStyle: preConfig?.endingStyle || "credits_roll",
    pacing: preConfig?.pacing || "standard_tv",
    subtitleConfig: (preConfig?.subtitleConfig as Record<string, any>) || null,

    episodes: episodeBible,

    qualityThresholds: {
      minImageScore: 6.0,
      minCharacterMatch: 7.0,
      minVideoScore: 5.5,
      minAudioScore: 6.0,
      maxRetries: 3,
      blockOnNsfw: true,
    },
  };

  return bible;
}

// ─── Storage ───────────────────────────────────────────────────────────

export async function saveProductionBible(projectId: number, bible: ProductionBibleData): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check for existing bible
  const [existing] = await db.select().from(productionBibles)
    .where(eq(productionBibles.projectId, projectId))
    .orderBy(desc(productionBibles.version))
    .limit(1);

  if (existing?.lockedAt) {
    throw new Error("Production Bible is locked and cannot be updated. Create a new version.");
  }

  if (existing) {
    // Update existing unlocked bible
    await db.update(productionBibles)
      .set({ bibleData: bible, version: existing.version + 1 })
      .where(eq(productionBibles.id, existing.id));
    return existing.id;
  }

  // Create new
  const [result] = await db.insert(productionBibles).values({
    projectId,
    bibleData: bible,
    version: 1,
  });
  return Number(result.insertId);
}

export async function lockProductionBible(projectId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [existing] = await db.select().from(productionBibles)
    .where(eq(productionBibles.projectId, projectId))
    .orderBy(desc(productionBibles.version))
    .limit(1);

  if (!existing) throw new Error("No Production Bible found to lock");
  if (existing.lockedAt) return; // already locked

  await db.update(productionBibles)
    .set({ lockedAt: new Date() })
    .where(eq(productionBibles.id, existing.id));
}

export async function getProductionBible(projectId: number): Promise<ProductionBibleData | null> {
  const db = await getDb();
  if (!db) return null;
  const [existing] = await db.select().from(productionBibles)
    .where(eq(productionBibles.projectId, projectId))
    .orderBy(desc(productionBibles.version))
    .limit(1);

  if (!existing) return null;
  return existing.bibleData as unknown as ProductionBibleData;
}

export async function getOrCompileProductionBible(projectId: number): Promise<ProductionBibleData> {
  const existing = await getProductionBible(projectId);
  if (existing) return existing;

  // Auto-compile if none exists
  const bible = await compileProductionBible(projectId);
  await saveProductionBible(projectId, bible);
  return bible;
}
