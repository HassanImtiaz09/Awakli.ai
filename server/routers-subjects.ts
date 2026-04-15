import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { eq, and, desc } from "drizzle-orm";
import {
  characterElements,
  characters,
  projects,
  subscriptions,
} from "../drizzle/schema";
import { TRPCError } from "@trpc/server";
import {
  createCharacterForLipSync,
  queryElement,
  listElements,
  deleteElement,
  buildLipSyncPrompt,
} from "./kling-subjects";
import {
  createCharacterElement,
  updateCharacterElement,
  getCharacterElementById,
  getReadyElementsByProject,
  getReadyElementMapForProject,
  deleteCharacterElement,
  getCharacterElementsByProject,
} from "./db";

// ─── Helpers ─────────────────────────────────────────────────────────────

async function requireCreatorOrStudio(userId: number) {
  const db = (await getDb())!;
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);
  const tier = sub?.tier ?? "free";
  if (tier === "free" || tier === "pro") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Subject Library requires Creator or Studio tier",
    });
  }
  return tier as "creator" | "studio";
}

async function requireProjectOwner(projectId: number, userId: number) {
  const db = (await getDb())!;
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  if (!project) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
  }
  return project;
}

// ─── Subject Library Router ──────────────────────────────────────────────

export const subjectLibraryRouter = router({
  /**
   * List all character elements for a project.
   */
  listElements: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireProjectOwner(input.projectId, ctx.user.id);
      const elements = await getCharacterElementsByProject(input.projectId);

      // Join with character names
      const db = (await getDb())!;
      const chars = await db
        .select({ id: characters.id, name: characters.name, referenceImages: characters.referenceImages })
        .from(characters)
        .where(eq(characters.projectId, input.projectId));
      const charMap = new Map(chars.map((c) => [c.id, c]));

      return elements.map((el) => ({
        ...el,
        characterName: charMap.get(el.characterId)?.name ?? "Unknown",
        characterImage: (() => {
          const refs = charMap.get(el.characterId)?.referenceImages;
          if (Array.isArray(refs) && refs.length > 0) return refs[0] as string;
          return null;
        })(),
      }));
    }),

  /**
   * Get ready elements map for a project (character name → element ID).
   * Used by the pipeline to check if Subject Library is available.
   */
  getReadyElements: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireProjectOwner(input.projectId, ctx.user.id);
      const elements = await getReadyElementsByProject(input.projectId);

      const db = (await getDb())!;
      const chars = await db
        .select({ id: characters.id, name: characters.name })
        .from(characters)
        .where(eq(characters.projectId, input.projectId));
      const charMap = new Map(chars.map((c) => [c.id, c.name]));

      return {
        count: elements.length,
        elements: elements.map((el) => ({
          id: el.id,
          characterId: el.characterId,
          characterName: charMap.get(el.characterId) ?? "Unknown",
          klingElementId: el.klingElementId,
          status: el.status,
        })),
      };
    }),

  /**
   * Create a character element with voice binding for native lip sync.
   * This is the main workflow: voice clone → element creation → ready for pipeline.
   *
   * Requires:
   * - Character must have at least one reference image (frontal)
   * - A voice audio sample URL (5-30s MP3/WAV)
   */
  createElement: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        characterId: z.number(),
        voiceAudioUrl: z.string().url(),
        frontalImageUrl: z.string().url().optional(),
        additionalImageUrls: z.array(z.string().url()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireCreatorOrStudio(ctx.user.id);
      await requireProjectOwner(input.projectId, ctx.user.id);

      // Get character info
      const db = (await getDb())!;
      const [character] = await db
        .select()
        .from(characters)
        .where(
          and(
            eq(characters.id, input.characterId),
            eq(characters.projectId, input.projectId)
          )
        )
        .limit(1);

      if (!character) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Character not found" });
      }

      // Determine frontal image
      const frontalImage =
        input.frontalImageUrl ??
        (Array.isArray(character.referenceImages) && character.referenceImages.length > 0
          ? (character.referenceImages[0] as string)
          : null);

      if (!frontalImage) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Character must have at least one reference image for element creation",
        });
      }

      // Check if element already exists for this character
      const existing = await db
        .select()
        .from(characterElements)
        .where(
          and(
            eq(characterElements.characterId, input.characterId),
            eq(characterElements.projectId, input.projectId)
          )
        )
        .limit(1);

      if (existing.length > 0 && existing[0].status === "ready") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Character already has a ready element. Delete it first to recreate.",
        });
      }

      // Create DB record in pending state
      const elementRecord = await createCharacterElement({
        characterId: input.characterId,
        projectId: input.projectId,
        userId: ctx.user.id,
        voiceSourceUrl: input.voiceAudioUrl,
        referenceImageUrl: frontalImage,
        additionalImageUrls: input.additionalImageUrls ?? [],
        status: "creating_voice",
      });

      const elementId = elementRecord;

      // Run the full creation pipeline in the background
      (async () => {
        try {
          console.log(`[SubjectLibrary] Starting element creation for character "${character.name}" (element DB ID: ${elementId})`);

          const result = await createCharacterForLipSync({
            characterName: character.name.slice(0, 20),
            characterDescription: `${character.role} character from anime project. ${(character.bio ?? "").slice(0, 60)}`,
            frontalImageUrl: frontalImage,
            voiceAudioUrl: input.voiceAudioUrl,
            additionalImages: input.additionalImageUrls,
            onProgress: async (step, status) => {
              console.log(`[SubjectLibrary] ${character.name}: ${step} → ${status}`);
              if (step === "voice" && status === "ready") {
                await updateCharacterElement(elementId, { status: "voice_ready" });
              } else if (step === "element" && status === "creating") {
                await updateCharacterElement(elementId, { status: "creating_element" });
              }
            },
          });

          // Update DB with Kling IDs and mark as ready
          await updateCharacterElement(elementId, {
            klingVoiceTaskId: result.voiceTaskId,
            klingVoiceId: result.voiceId,
            klingElementTaskId: result.elementTaskId,
            klingElementId: result.elementId,
            status: "ready",
          });

          console.log(
            `[SubjectLibrary] ✓ Character "${character.name}" element ready: ` +
              `klingElementId=${result.elementId}, voiceId=${result.voiceId}`
          );
        } catch (err: any) {
          console.error(`[SubjectLibrary] Element creation failed for "${character.name}":`, err);
          await updateCharacterElement(elementId, {
            status: "failed",
            errorMessage: err.message?.slice(0, 500) ?? "Unknown error",
          });
        }
      })();

      return {
        id: elementId,
        characterId: input.characterId,
        characterName: character.name,
        status: "creating_voice",
        message: "Element creation started. Voice cloning in progress...",
      };
    }),

  /**
   * Check the status of a character element creation.
   */
  getElementStatus: protectedProcedure
    .input(z.object({ elementId: z.number() }))
    .query(async ({ ctx, input }) => {
      const element = await getCharacterElementById(input.elementId);
      if (!element) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Element not found" });
      }
      await requireProjectOwner(element.projectId, ctx.user.id);

      // Get character name
      const db = (await getDb())!;
      const [character] = await db
        .select({ name: characters.name })
        .from(characters)
        .where(eq(characters.id, element.characterId))
        .limit(1);

      return {
        ...element,
        characterName: character?.name ?? "Unknown",
      };
    }),

  /**
   * Delete a character element (removes from both DB and Kling API).
   */
  deleteElement: protectedProcedure
    .input(z.object({ elementId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const element = await getCharacterElementById(input.elementId);
      if (!element) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Element not found" });
      }
      await requireProjectOwner(element.projectId, ctx.user.id);

      // Delete from Kling API if we have an element ID
      if (element.klingElementId) {
        try {
          await deleteElement(String(element.klingElementId));
          console.log(`[SubjectLibrary] Deleted Kling element ${element.klingElementId}`);
        } catch (err) {
          console.warn(`[SubjectLibrary] Failed to delete Kling element ${element.klingElementId}:`, err);
          // Continue with local deletion even if Kling API fails
        }
      }

      await deleteCharacterElement(input.elementId);

      return { deleted: true };
    }),

  /**
   * Retry a failed element creation.
   */
  retryElement: protectedProcedure
    .input(z.object({ elementId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const element = await getCharacterElementById(input.elementId);
      if (!element) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Element not found" });
      }
      if (element.status !== "failed") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Can only retry failed elements",
        });
      }
      await requireProjectOwner(element.projectId, ctx.user.id);

      // Get character info
      const db = (await getDb())!;
      const [character] = await db
        .select()
        .from(characters)
        .where(eq(characters.id, element.characterId))
        .limit(1);

      if (!character) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Character not found" });
      }

      // Reset status and retry
      await updateCharacterElement(input.elementId, {
        status: "creating_voice",
        errorMessage: null,
      });

      // Run creation in background (same as createElement)
      (async () => {
        try {
          const result = await createCharacterForLipSync({
            characterName: character.name.slice(0, 20),
            characterDescription: `${character.role} character. ${(character.bio ?? "").slice(0, 60)}`,
            frontalImageUrl: element.referenceImageUrl!,
            voiceAudioUrl: element.voiceSourceUrl!,
            additionalImages: element.additionalImageUrls as string[] | undefined,
            onProgress: async (step, status) => {
              if (step === "voice" && status === "ready") {
                await updateCharacterElement(input.elementId, { status: "voice_ready" });
              } else if (step === "element" && status === "creating") {
                await updateCharacterElement(input.elementId, { status: "creating_element" });
              }
            },
          });

          await updateCharacterElement(input.elementId, {
            klingVoiceTaskId: result.voiceTaskId,
            klingVoiceId: result.voiceId,
            klingElementTaskId: result.elementTaskId,
            klingElementId: result.elementId,
            status: "ready",
          });
        } catch (err: any) {
          await updateCharacterElement(input.elementId, {
            status: "failed",
            errorMessage: err.message?.slice(0, 500) ?? "Unknown error",
          });
        }
      })();

      return { status: "creating_voice", message: "Retrying element creation..." };
    }),

  /**
   * Preview what a lip-synced prompt would look like for a given scene.
   * Useful for debugging and understanding how voice tags work.
   */
  previewLipSyncPrompt: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        sceneDescription: z.string(),
        dialogueLines: z.array(
          z.object({
            characterName: z.string(),
            dialogue: z.string(),
            emotion: z.string().optional(),
          })
        ),
      })
    )
    .query(async ({ ctx, input }) => {
      await requireProjectOwner(input.projectId, ctx.user.id);

      const elementMap = await getReadyElementMapForProject(input.projectId);
      const elementOrder = Array.from(elementMap.keys());

      const prompt = buildLipSyncPrompt(
        input.sceneDescription,
        input.dialogueLines,
        elementOrder
      );

      return {
        prompt,
        elementOrder,
        matchedCharacters: input.dialogueLines
          .map((d) => d.characterName)
          .filter((name) => elementMap.has(name)),
        unmatchedCharacters: input.dialogueLines
          .map((d) => d.characterName)
          .filter((name) => !elementMap.has(name)),
      };
    }),
});
