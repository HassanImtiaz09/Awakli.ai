/**
 * P26 Character Bible & Spatial Consistency — tRPC Router
 *
 * Exposes the character bible pipeline via tRPC procedures:
 *   - getRegistry / updateRegistry / getRegistryHistory
 *   - lockCharacter (switch identity mode)
 *   - getQaResults (per panel / per project)
 *   - getPipelineState
 *   - triggerReferenceRegeneration
 */

import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "./_core/trpc";
import {
  getCharacterRegistry,
  upsertCharacterRegistry,
  getRegistryHistory,
  getQaResultsForPanel,
  getQaResultsForProject,
  getPipelineState,
} from "./character-bible";
import type { CharacterRegistry, CharacterEntry } from "./character-bible/types";

export const characterBibleRouter = router({
  // ─── Get Registry ───────────────────────────────────────────────────
  getRegistry: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const result = await getCharacterRegistry(input.projectId);
      if (!result) return null;
      return {
        id: result.id,
        registry: result.registry,
        version: result.version,
      };
    }),

  // ─── Get Registry History ─────────────────────────────────────────
  getRegistryHistory: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const rows = await getRegistryHistory(input.projectId);
      return rows.map((r) => ({
        id: r.id,
        version: r.version,
        createdAt: r.createdAt,
        characterCount: (r.registryJson as CharacterRegistry)?.characters?.length ?? 0,
      }));
    }),

  // ─── Update Character Attributes ──────────────────────────────────
  updateCharacter: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        characterId: z.string(),
        updates: z.object({
          heightCm: z.number().optional(),
          build: z.enum(["slim", "average", "athletic", "muscular", "heavyset"]).optional(),
          hairColor: z.string().optional(),
          hairStyle: z.string().optional(),
          eyeColor: z.string().optional(),
          skinTone: z.string().optional(),
          defaultOutfit: z.string().optional(),
          distinguishingFeatures: z.array(z.string()).optional(),
        }),
      }),
    )
    .mutation(async ({ input }) => {
      const existing = await getCharacterRegistry(input.projectId);
      if (!existing) throw new Error("No character registry found");

      const registry = existing.registry;
      const charIdx = registry.characters.findIndex(
        (c) => c.characterId === input.characterId,
      );
      if (charIdx < 0) throw new Error("Character not found in registry");

      // Apply updates
      const char = registry.characters[charIdx];
      const updatedAttributes = { ...char.attributes };
      for (const [key, value] of Object.entries(input.updates)) {
        if (value !== undefined) {
          (updatedAttributes as any)[key] = value;
        }
      }

      registry.characters[charIdx] = {
        ...char,
        attributes: updatedAttributes,
      };

      // Recalculate tallest height
      registry.tallestHeightCm = Math.max(
        ...registry.characters.map((c) => c.attributes.heightCm),
      );

      const result = await upsertCharacterRegistry(input.projectId, registry);
      return { success: true, version: result.version };
    }),

  // ─── Lock Character Identity Mode ─────────────────────────────────
  lockCharacter: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        characterId: z.string(),
        identityMode: z.enum(["none", "ip_adapter", "lora"]),
      }),
    )
    .mutation(async ({ input }) => {
      const existing = await getCharacterRegistry(input.projectId);
      if (!existing) throw new Error("No character registry found");

      const registry = existing.registry;
      const charIdx = registry.characters.findIndex(
        (c) => c.characterId === input.characterId,
      );
      if (charIdx < 0) throw new Error("Character not found in registry");

      const char = registry.characters[charIdx];

      // Validate mode is possible
      if (input.identityMode === "lora" && !char.identity.loraUrl) {
        throw new Error("LoRA model not available for this character. Train a LoRA first.");
      }
      if (input.identityMode === "ip_adapter" && !char.identity.ipAdapterRefUrl) {
        throw new Error("No reference image available for IP-Adapter.");
      }

      registry.characters[charIdx] = {
        ...char,
        identity: {
          ...char.identity,
          identityMode: input.identityMode,
        },
      };

      const result = await upsertCharacterRegistry(input.projectId, registry);
      return { success: true, version: result.version, identityMode: input.identityMode };
    }),

  // ─── QA Results ───────────────────────────────────────────────────
  getQaResultsForPanel: protectedProcedure
    .input(z.object({ panelId: z.number() }))
    .query(async ({ input }) => {
      return getQaResultsForPanel(input.panelId);
    }),

  getQaResultsForProject: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      return getQaResultsForProject(input.projectId);
    }),

  // ─── Pipeline State ───────────────────────────────────────────────
  getPipelineState: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(({ input }) => {
      const state = getPipelineState(input.projectId);
      return state ?? null;
    }),
});
