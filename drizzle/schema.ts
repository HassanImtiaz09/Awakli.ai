import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  json,
  bigint,
} from "drizzle-orm/mysql-core";

// ─── Users ────────────────────────────────────────────────────────────────

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Projects ─────────────────────────────────────────────────────────────

export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  genre: varchar("genre", { length: 100 }),
  coverImageUrl: text("coverImageUrl"),
  status: mysqlEnum("status", ["draft", "active", "archived"]).default("draft").notNull(),
  visibility: mysqlEnum("visibility", ["private", "unlisted", "public"]).default("private").notNull(),
  animeStyle: mysqlEnum("animeStyle", ["shonen", "seinen", "shoujo", "chibi", "cyberpunk", "watercolor", "noir", "realistic", "mecha", "default"]).default("default").notNull(),
  tone: varchar("tone", { length: 100 }),
  targetAudience: mysqlEnum("targetAudience", ["kids", "teen", "adult"]).default("teen"),
  settings: json("settings"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

// ─── Manga Uploads ────────────────────────────────────────────────────────

export const mangaUploads = mysqlTable("manga_uploads", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  fileUrl: text("fileUrl").notNull(),
  fileSizeBytes: int("fileSizeBytes"),
  mimeType: varchar("mimeType", { length: 100 }),
  pageCount: int("pageCount"),
  status: mysqlEnum("status", ["uploaded", "queued", "processing", "completed", "failed"]).default("uploaded").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MangaUpload = typeof mangaUploads.$inferSelect;
export type InsertMangaUpload = typeof mangaUploads.$inferInsert;

// ─── Processing Jobs ──────────────────────────────────────────────────────

export const processingJobs = mysqlTable("processing_jobs", {
  id: int("id").autoincrement().primaryKey(),
  uploadId: int("uploadId").notNull().references(() => mangaUploads.id, { onDelete: "cascade" }),
  projectId: int("projectId").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: mysqlEnum("status", ["queued", "processing", "completed", "failed"]).default("queued").notNull(),
  progress: int("progress").default(0),
  inputImageUrl: text("inputImageUrl"),
  resultUrls: json("resultUrls"),   // string[] of CDN URLs for generated frames
  errorMessage: text("errorMessage"),
  animeStyle: mysqlEnum("animeStyle", ["shonen", "seinen", "shoujo", "chibi", "cyberpunk", "watercolor", "noir", "realistic", "mecha", "default"]).default("default").notNull(),
  processingStartedAt: timestamp("processingStartedAt"),
  processingCompletedAt: timestamp("processingCompletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProcessingJob = typeof processingJobs.$inferSelect;
export type InsertProcessingJob = typeof processingJobs.$inferInsert;

// ─── Episodes ────────────────────────────────────────────────────────────

export const episodes = mysqlTable("episodes", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => projects.id, { onDelete: "cascade" }),
  episodeNumber: int("episodeNumber").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  synopsis: text("synopsis"),
  scriptContent: json("scriptContent"),  // Full structured JSON script
  status: mysqlEnum("status", ["draft", "generating", "generated", "approved", "locked"]).default("draft").notNull(),
  wordCount: int("wordCount").default(0),
  panelCount: int("panelCount").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Episode = typeof episodes.$inferSelect;
export type InsertEpisode = typeof episodes.$inferInsert;

// ─── Panels ──────────────────────────────────────────────────────────────

export const panels = mysqlTable("panels", {
  id: int("id").autoincrement().primaryKey(),
  episodeId: int("episodeId").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  projectId: int("projectId").notNull().references(() => projects.id, { onDelete: "cascade" }),
  sceneNumber: int("sceneNumber").notNull(),
  panelNumber: int("panelNumber").notNull(),
  visualDescription: text("visualDescription"),
  cameraAngle: mysqlEnum("cameraAngle", ["wide", "medium", "close-up", "extreme-close-up", "birds-eye"]).default("medium"),
  dialogue: json("dialogue"),  // [{character, text, emotion}]
  sfx: varchar("sfx", { length: 255 }),
  transition: mysqlEnum("transition", ["cut", "fade", "dissolve"]),
  imageUrl: text("imageUrl"),
  compositeImageUrl: text("compositeImageUrl"),  // Image with dialogue/SFX overlay
  fluxPrompt: text("fluxPrompt"),  // The actual prompt sent to image generation
  negativePrompt: text("negativePrompt"),
  status: mysqlEnum("status", ["draft", "generating", "generated", "approved", "rejected"]).default("draft").notNull(),
  reviewStatus: mysqlEnum("reviewStatus", ["pending", "approved", "rejected", "needs_revision"]).default("pending"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Panel = typeof panels.$inferSelect;
export type InsertPanel = typeof panels.$inferInsert;

// ─── Characters ──────────────────────────────────────────────────────────

export const characters = mysqlTable("characters", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  role: mysqlEnum("role", ["protagonist", "antagonist", "supporting", "background"]).default("supporting").notNull(),
  personalityTraits: json("personalityTraits"),  // string[]
  visualTraits: json("visualTraits"),  // {hairColor, eyeColor, bodyType, clothing, distinguishingFeatures}
  referenceImages: json("referenceImages"),  // string[] of CDN URLs
  bio: text("bio"),
  loraModelUrl: text("loraModelUrl"),
  loraStatus: mysqlEnum("loraStatus", ["none", "uploading", "training", "validating", "ready", "failed"]).default("none"),
  loraTriggerWord: varchar("loraTriggerWord", { length: 100 }),
  loraTrainingProgress: int("loraTrainingProgress").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Character = typeof characters.$inferSelect;
export type InsertCharacter = typeof characters.$inferInsert;
