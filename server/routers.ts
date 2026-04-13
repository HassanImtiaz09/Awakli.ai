import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  getProjectsByUserId, getProjectById, createProject, updateProject, deleteProject,
  createMangaUpload, getMangaUploadsByProject, getMangaUploadById,
  createProcessingJob, getJobsByUserId, getJobsByProject, getJobById,
} from "./db";
import { storagePut } from "./storage";
import { runMangaToAnimeJob } from "./pipeline";
import { nanoid } from "nanoid";

// ─── Projects Router ──────────────────────────────────────────────────────

const projectsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return getProjectsByUserId(ctx.user.id);
  }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const project = await getProjectById(input.id, ctx.user.id);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      return project;
    }),

  create: protectedProcedure
    .input(z.object({
      title: z.string().min(1).max(255),
      description: z.string().max(2000).optional(),
      genre: z.string().max(100).optional(),
      animeStyle: z.enum(["shonen", "seinen", "shoujo", "mecha", "default"]).default("default"),
      visibility: z.enum(["private", "unlisted", "public"]).default("private"),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = await createProject({
        userId: ctx.user.id,
        title: input.title,
        description: input.description,
        genre: input.genre,
        animeStyle: input.animeStyle,
        visibility: input.visibility,
        status: "draft",
      });
      return { id };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().min(1).max(255).optional(),
      description: z.string().max(2000).optional(),
      genre: z.string().max(100).optional(),
      animeStyle: z.enum(["shonen", "seinen", "shoujo", "mecha", "default"]).optional(),
      visibility: z.enum(["private", "unlisted", "public"]).optional(),
      status: z.enum(["draft", "active", "archived"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await updateProject(id, ctx.user.id, data);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteProject(input.id, ctx.user.id);
      return { success: true };
    }),
});

// ─── Uploads Router ───────────────────────────────────────────────────────

const uploadsRouter = router({
  getUploadUrl: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      fileName: z.string(),
      mimeType: z.string(),
      fileSizeBytes: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify project ownership
      const project = await getProjectById(input.projectId, ctx.user.id);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });

      // Generate unique S3 key
      const ext = input.fileName.split(".").pop() ?? "jpg";
      const fileKey = `manga-uploads/${ctx.user.id}/${input.projectId}/${nanoid()}.${ext}`;

      // Create upload record first
      const uploadId = await createMangaUpload({
        projectId: input.projectId,
        userId: ctx.user.id,
        fileName: input.fileName,
        fileKey,
        fileUrl: "", // Will be updated after upload
        mimeType: input.mimeType,
        fileSizeBytes: input.fileSizeBytes,
        status: "uploaded",
      });

      return {
        uploadId,
        fileKey,
        // Client will upload directly to S3 via the confirm endpoint
        uploadEndpoint: `/api/trpc/uploads.confirmUpload`,
      };
    }),

  confirmUpload: protectedProcedure
    .input(z.object({
      uploadId: z.number(),
      fileDataBase64: z.string(), // base64 encoded file
      mimeType: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const upload = await getMangaUploadById(input.uploadId, ctx.user.id);
      if (!upload) throw new TRPCError({ code: "NOT_FOUND", message: "Upload not found" });

      // Decode base64 and upload to S3
      const buffer = Buffer.from(input.fileDataBase64, "base64");
      const { url } = await storagePut(upload.fileKey, buffer, input.mimeType);

      // Update the upload record with the real URL
      const { getDb } = await import("./db");
      const db = await getDb();
      if (db) {
        const { mangaUploads } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await db.update(mangaUploads).set({ fileUrl: url }).where(eq(mangaUploads.id, input.uploadId));
      }

      return { uploadId: input.uploadId, fileUrl: url };
    }),

  listByProject: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ ctx, input }) => {
      return getMangaUploadsByProject(input.projectId, ctx.user.id);
    }),
});

// ─── Jobs Router ──────────────────────────────────────────────────────────

const jobsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return getJobsByUserId(ctx.user.id);
  }),

  listByProject: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ ctx, input }) => {
      return getJobsByProject(input.projectId, ctx.user.id);
    }),

  getStatus: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const job = await getJobById(input.id);
      if (!job || job.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      }
      return job;
    }),

  trigger: protectedProcedure
    .input(z.object({
      uploadId: z.number(),
      projectId: z.number(),
      animeStyle: z.enum(["shonen", "seinen", "shoujo", "mecha", "default"]).default("default"),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify upload ownership
      const upload = await getMangaUploadById(input.uploadId, ctx.user.id);
      if (!upload) throw new TRPCError({ code: "NOT_FOUND", message: "Upload not found" });
      if (!upload.fileUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "Upload has no file URL" });

      // Create the job
      const jobId = await createProcessingJob({
        uploadId: input.uploadId,
        projectId: input.projectId,
        userId: ctx.user.id,
        status: "queued",
        progress: 0,
        inputImageUrl: upload.fileUrl,
        animeStyle: input.animeStyle,
      });

      // Run pipeline asynchronously (fire-and-forget)
      runMangaToAnimeJob(jobId, ctx.user.id).catch((err) => {
        console.error(`[Pipeline] Background job ${jobId} failed:`, err);
      });

      return { jobId };
    }),
});

// ─── App Router ───────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  projects: projectsRouter,
  uploads: uploadsRouter,
  jobs: jobsRouter,
});

export type AppRouter = typeof appRouter;
