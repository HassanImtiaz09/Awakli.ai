import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  json,
  bigint,
  float,
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
  animePreviewUsed: int("animePreviewUsed").default(0),
  preferences: json("preferences"),  // {preferred_style, preferred_tone, preferred_chapter_length, preferred_audience, last_used_style}
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
  slug: varchar("slug", { length: 255 }).unique(),
  originalPrompt: text("originalPrompt"),
  creationMode: mysqlEnum("creationMode", ["quick_create", "studio", "upload"]).default("quick_create"),
  animeEligible: int("animeEligible").default(0),
  featured: int("featured").default(0),
  viewCount: int("viewCount").default(0),
  voteScore: int("voteScore").default(0),
  totalVotes: int("totalVotes").default(0),
  animeStatus: mysqlEnum("animeStatus", ["not_eligible", "eligible", "in_production", "completed"]).default("not_eligible").notNull(),
  animePromotedAt: timestamp("animePromotedAt"),
  trailerVideoUrl: text("trailerVideoUrl"),
  previewVideoUrl: text("previewVideoUrl"),
  previewGeneratedAt: timestamp("previewGeneratedAt"),
  sneakPeekUrl: text("sneak_peek_url"),
  sneakPeekStatus: mysqlEnum("sneak_peek_status", ["none", "generating", "ready", "failed"]).default("none"),
  sneakPeekSceneId: int("sneak_peek_scene_id"),
  sneakPeekGeneratedAt: timestamp("sneak_peek_generated_at"),
  chapterLengthPreset: mysqlEnum("chapter_length_preset", ["short", "standard", "long"]).default("standard"),
  pacingStyle: mysqlEnum("pacing_style", ["action_heavy", "dialogue_heavy", "balanced"]).default("balanced"),
  chapterEndingStyle: mysqlEnum("chapter_ending_style", ["cliffhanger", "resolution", "serialized"]).default("cliffhanger"),
  publicationStatus: mysqlEnum("publication_status", ["draft", "private", "published", "archived"]).default("draft").notNull(),
  publishedAt: timestamp("publishedAt"),
  sourceType: mysqlEnum("source_type", ["text_prompt", "upload_ai", "upload_digital", "upload_hand_drawn"]).default("text_prompt"),
  uploadMetadata: json("upload_metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

// ─── Content Views (anonymous + authenticated) ──────────────────────────────
export const contentViews = mysqlTable("content_views", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  contentType: mysqlEnum("content_type", ["manga_chapter", "anime_episode", "project"]).notNull(),
  contentId: int("content_id").notNull(),
  projectId: int("project_id").references(() => projects.id, { onDelete: "cascade" }),
  viewerHash: varchar("viewer_hash", { length: 64 }).notNull(),
  sessionId: varchar("session_id", { length: 64 }),
  userId: int("user_id").references(() => users.id, { onDelete: "set null" }),
  durationSeconds: int("duration_seconds"),
  source: mysqlEnum("source", ["direct", "search", "social", "internal", "embed"]).default("direct"),
  viewedAt: timestamp("viewed_at").defaultNow().notNull(),
});
export type ContentView = typeof contentViews.$inferSelect;
export type InsertContentView = typeof contentViews.$inferInsert;

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
  status: mysqlEnum("status", ["draft", "generating", "generated", "approved", "locked", "pipeline", "review", "published"]).default("draft").notNull(),
  wordCount: int("wordCount").default(0),
  panelCount: int("panelCount").default(0),
  viewCount: int("viewCount").default(0),
  duration: int("duration").default(0),
  videoUrl: text("videoUrl"),
  thumbnailUrl: text("thumbnailUrl"),
  narratorEnabled: int("narratorEnabled").default(1),
  narratorVoiceId: varchar("narratorVoiceId", { length: 255 }),
  sfxData: json("sfxData"),  // Generated SFX timeline [{sfxType, timestampMs, volume, durationMs, url}]
  scriptModerationStatus: mysqlEnum("scriptModerationStatus", ["pending", "clean", "flagged", "revised"]).default("pending"),
  scriptModerationFlags: json("scriptModerationFlags"),  // [{category, severity, description, lineNumber}]
  estimatedCostCents: int("estimatedCostCents"),
  isPremium: mysqlEnum("isPremium", ["free", "premium", "pay_per_view"]).default("free"),
  ppvPriceCents: int("ppvPriceCents"),
  chapterEndType: mysqlEnum("chapter_end_type", ["cliffhanger", "resolution", "serialized"]),
  nextChapterHook: text("next_chapter_hook"),
  estimatedReadTime: int("estimated_read_time"),  // in seconds
  moodArc: json("mood_arc"),  // string[] e.g. ["tense", "calm", "building", "climax", "cliffhanger"]
  publishedAt: timestamp("publishedAt"),
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
  transition: mysqlEnum("transition", ["cut", "fade", "dissolve", "cross-dissolve"]).default("cut"),
  transitionDuration: float("transition_duration").default(0.5),  // seconds (0.2–2.0)
  imageUrl: text("imageUrl"),
  compositeImageUrl: text("compositeImageUrl"),  // Image with dialogue/SFX overlay
  fluxPrompt: text("fluxPrompt"),  // The actual prompt sent to image generation
  negativePrompt: text("negativePrompt"),
  status: mysqlEnum("status", ["draft", "generating", "generated", "approved", "rejected"]).default("draft").notNull(),
  reviewStatus: mysqlEnum("reviewStatus", ["pending", "approved", "rejected", "needs_revision"]).default("pending"),
  qualityScore: int("qualityScore"),  // 1-100 (average of 5 criteria * 10)
  qualityDetails: json("qualityDetails"),  // {promptAdherence, anatomy, styleConsistency, composition, characterAccuracy}
  generationAttempts: int("generationAttempts").default(1),
  upscaledImageUrl: text("upscaledImageUrl"),
  moderationStatus: mysqlEnum("moderationStatus", ["pending", "clean", "flagged", "acknowledged"]).default("pending"),
  moderationFlags: json("moderationFlags"),  // [{category, severity, description}]
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
  voiceId: varchar("voiceId", { length: 255 }),
  voiceCloneUrl: text("voiceCloneUrl"),
  voiceSettings: json("voiceSettings"),  // {stability, similarity_boost}
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Character = typeof characters.$inferSelect;
export type InsertCharacter = typeof characters.$inferInsert;

// ─── Pipeline Runs ─────────────────────────────────────────────────────

export const pipelineRuns = mysqlTable("pipeline_runs", {
  id: int("id").autoincrement().primaryKey(),
  episodeId: int("episodeId").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  projectId: int("projectId").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: mysqlEnum("status", ["pending", "running", "completed", "failed", "cancelled"]).default("pending").notNull(),
  currentNode: mysqlEnum("currentNode", ["quality_check", "upscale", "content_mod", "video_gen", "voice_gen", "narrator_gen", "lip_sync", "music_gen", "sfx_gen", "assembly", "qa_review", "none"]).default("none"),
  nodeStatuses: json("nodeStatuses"),  // {video_gen: 'complete', voice_gen: 'running', ...}
  progress: int("progress").default(0),
  estimatedTimeRemaining: int("estimatedTimeRemaining"),  // seconds
  totalCost: int("totalCost").default(0),  // cents
  nodeCosts: json("nodeCosts"),  // {video_gen: 120, voice_gen: 50, ...}
  errors: json("errors"),  // [{node, message, timestamp}]
  qaIssues: json("qaIssues"),  // [{type, description, node}]
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PipelineRun = typeof pipelineRuns.$inferSelect;
export type InsertPipelineRun = typeof pipelineRuns.$inferInsert;

// ─── Pipeline Assets ───────────────────────────────────────────────────

export const pipelineAssets = mysqlTable("pipeline_assets", {
  id: int("id").autoincrement().primaryKey(),
  pipelineRunId: int("pipelineRunId").notNull().references(() => pipelineRuns.id, { onDelete: "cascade" }),
  episodeId: int("episodeId").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  panelId: int("panelId"),
  assetType: mysqlEnum("assetType", ["video_clip", "voice_clip", "synced_clip", "music_segment", "sfx_clip", "narrator_clip", "upscaled_panel", "subtitle_srt", "final_video", "thumbnail", "stream_video"]).notNull(),
  url: text("url").notNull(),
  metadata: json("metadata"),  // {duration, fileSize, format, characterId, ...}
  nodeSource: mysqlEnum("nodeSource", ["quality_check", "upscale", "content_mod", "video_gen", "voice_gen", "narrator_gen", "lip_sync", "music_gen", "sfx_gen", "assembly"]).notNull(),
  harnessScore: float("harnessScore"),  // overall quality score from harness (0-10)
  harnessResult: varchar("harnessResult", { length: 20 }),  // pass/warn/retry/block/human_review
  harnessDetails: json("harnessDetails"),  // full harness check output for this asset
  // ─── Smart Model Router fields ───
  klingModelUsed: varchar("klingModelUsed", { length: 30 }),  // v3-omni, v2-6, v2-1, v1-6
  complexityTier: int("complexityTier"),  // 1-4
  lipSyncMethod: varchar("lipSyncMethod", { length: 20 }),  // native, post_sync, none
  classificationReasoning: text("classificationReasoning"),
  costActual: float("costActual"),  // actual cost in dollars
  costIfV3Omni: float("costIfV3Omni"),  // what it would have cost with V3 Omni
  userOverride: int("userOverride").default(0),  // 1 if user manually overrode model
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PipelineAsset = typeof pipelineAssets.$inferSelect;
export type InsertPipelineAsset = typeof pipelineAssets.$inferInsert;

// ─── Votes ──────────────────────────────────────────────────────────────

export const votes = mysqlTable("votes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  episodeId: int("episodeId").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  voteType: mysqlEnum("voteType", ["up", "down"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Vote = typeof votes.$inferSelect;
export type InsertVote = typeof votes.$inferInsert;

// ─── Comments ───────────────────────────────────────────────────────────

export const comments = mysqlTable("comments", {
  id: int("id").autoincrement().primaryKey(),
  episodeId: int("episodeId").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  parentId: int("parentId"),
  content: text("content").notNull(),
  upvotes: int("upvotes").default(0),
  downvotes: int("downvotes").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Comment = typeof comments.$inferSelect;
export type InsertComment = typeof comments.$inferInsert;

// ─── Follows ────────────────────────────────────────────────────────────

export const follows = mysqlTable("follows", {
  id: int("id").autoincrement().primaryKey(),
  followerId: int("followerId").notNull().references(() => users.id, { onDelete: "cascade" }),
  followingId: int("followingId").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Follow = typeof follows.$inferSelect;
export type InsertFollow = typeof follows.$inferInsert;

// ─── Watchlist ──────────────────────────────────────────────────────────

export const watchlist = mysqlTable("watchlist", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectId: int("projectId").notNull().references(() => projects.id, { onDelete: "cascade" }),
  lastEpisodeId: int("lastEpisodeId"),
  progress: int("progress").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Watchlist = typeof watchlist.$inferSelect;
export type InsertWatchlist = typeof watchlist.$inferInsert;

// ─── Notifications ──────────────────────────────────────────────────────

export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: mysqlEnum("type", ["new_episode", "reply", "vote_milestone", "new_follower", "anime_eligible", "anime_started", "anime_completed"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content"),
  linkUrl: varchar("linkUrl", { length: 512 }),
  isRead: int("isRead").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

// ─── Notification Types Update ──────────────────────────────────────────

// ─── Subscriptions ─────────────────────────────────────────────────────

export const subscriptions = mysqlTable("subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  tier: mysqlEnum("tier", ["free", "pro", "creator", "studio"]).default("free").notNull(),
  stripeCustomerId: varchar("stripeCustomerId", { length: 255 }),
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 255 }),
  status: mysqlEnum("status", ["active", "past_due", "canceled", "trialing", "incomplete"]).default("active").notNull(),
  currentPeriodStart: timestamp("currentPeriodStart"),
  currentPeriodEnd: timestamp("currentPeriodEnd"),
  cancelAtPeriodEnd: int("cancelAtPeriodEnd").default(0),
  billingInterval: mysqlEnum("billingInterval", ["monthly", "annual"]).default("monthly"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;

// ─── Usage Records ─────────────────────────────────────────────────────

export const usageRecords = mysqlTable("usage_records", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  actionType: mysqlEnum("actionType", ["script", "panel", "video", "voice", "lora_train"]).notNull(),
  creditsUsed: int("creditsUsed").notNull(),
  projectId: int("projectId"),
  episodeId: int("episodeId"),
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type UsageRecord = typeof usageRecords.$inferSelect;
export type InsertUsageRecord = typeof usageRecords.$inferInsert;

// ─── Tips ──────────────────────────────────────────────────────────────

export const tips = mysqlTable("tips", {
  id: int("id").autoincrement().primaryKey(),
  fromUserId: int("fromUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  toUserId: int("toUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  episodeId: int("episodeId").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  amountCents: int("amountCents").notNull(),
  creatorShareCents: int("creatorShareCents").notNull(),
  platformShareCents: int("platformShareCents").notNull(),
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 255 }),
  status: mysqlEnum("status", ["pending", "completed", "failed", "refunded"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Tip = typeof tips.$inferSelect;
export type InsertTip = typeof tips.$inferInsert;

// ─── Moderation Queue ──────────────────────────────────────────────────

export const moderationQueue = mysqlTable("moderation_queue", {
  id: int("id").autoincrement().primaryKey(),
  contentType: mysqlEnum("contentType", ["project", "episode", "comment", "panel"]).notNull(),
  contentId: int("contentId").notNull(),
  reportedBy: int("reportedBy").references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason"),
  status: mysqlEnum("status", ["pending", "approved", "removed", "dismissed"]).default("pending").notNull(),
  reviewedBy: int("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ModerationItem = typeof moderationQueue.$inferSelect;
export type InsertModerationItem = typeof moderationQueue.$inferInsert;

// ─── Platform Config ──────────────────────────────────────────────────

export const platformConfig = mysqlTable("platform_config", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PlatformConfig = typeof platformConfig.$inferSelect;
export type InsertPlatformConfig = typeof platformConfig.$inferInsert;

// ─── Anime Promotions ─────────────────────────────────────────────────

export const animePromotions = mysqlTable("anime_promotions", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => projects.id, { onDelete: "cascade" }),
  voteCountAtPromotion: int("voteCountAtPromotion").notNull(),
  promotedAt: timestamp("promotedAt").defaultNow().notNull(),
  productionStartedAt: timestamp("productionStartedAt"),
  productionCompletedAt: timestamp("productionCompletedAt"),
  status: mysqlEnum("status", ["pending_creator", "in_production", "completed", "cancelled"]).default("pending_creator").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AnimePromotion = typeof animePromotions.$inferSelect;
export type InsertAnimePromotion = typeof animePromotions.$inferInsert;

// ─── Scenes (for consistency tracking) ───────────────────────────────

export const scenes = mysqlTable("scenes", {
  id: int("id").autoincrement().primaryKey(),
  episodeId: int("episodeId").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  projectId: int("projectId").notNull().references(() => projects.id, { onDelete: "cascade" }),
  sceneNumber: int("sceneNumber").notNull(),
  location: text("location"),
  timeOfDay: varchar("timeOfDay", { length: 50 }),
  mood: varchar("mood", { length: 50 }),
  sceneContext: json("sceneContext"),  // Extracted visual context from first panel
  environmentLoraUrl: text("environmentLoraUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Scene = typeof scenes.$inferSelect;
export type InsertScene = typeof scenes.$inferInsert;

// ─── Episode SFX ─────────────────────────────────────────────────────

export const episodeSfx = mysqlTable("episode_sfx", {
  id: int("id").autoincrement().primaryKey(),
  episodeId: int("episodeId").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  panelId: int("panelId").references(() => panels.id, { onDelete: "cascade" }),
  sfxType: varchar("sfxType", { length: 100 }).notNull(),  // explosion, footsteps, rain, etc.
  sfxUrl: text("sfxUrl"),
  timestampMs: int("timestampMs").default(0),
  volume: int("volume").default(80),  // 0-100
  durationMs: int("durationMs"),
  source: mysqlEnum("source", ["generated", "library"]).default("library").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type EpisodeSfx = typeof episodeSfx.$inferSelect;
export type InsertEpisodeSfx = typeof episodeSfx.$inferInsert;

// ─── Tier Limits (configuration table) ──────────────────────────────

export const tierLimits = mysqlTable("tier_limits", {
  tier: varchar("tier", { length: 20 }).primaryKey(),
  maxProjects: int("maxProjects").notNull(),
  maxChaptersPerProject: int("maxChaptersPerProject").notNull(),
  maxPanelsPerChapter: int("maxPanelsPerChapter").notNull(),
  maxAnimeEpisodesPerMonth: int("maxAnimeEpisodesPerMonth").notNull(),
  maxLoraCharacters: int("maxLoraCharacters").notNull(),
  maxVoiceClones: int("maxVoiceClones").notNull(),
  scriptModel: varchar("scriptModel", { length: 100 }).notNull(),
  videoResolution: varchar("videoResolution", { length: 20 }).notNull(),
  hasWatermark: int("hasWatermark").default(0).notNull(),
  canUploadManga: int("canUploadManga").default(0).notNull(),
  canMonetize: int("canMonetize").default(0).notNull(),
  revenueSharePercent: int("revenueSharePercent").default(0).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TierLimit = typeof tierLimits.$inferSelect;
export type InsertTierLimit = typeof tierLimits.$inferInsert;

// ─── Exports (download tracking) ────────────────────────────────────

export const exports = mysqlTable("exports", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectId: int("projectId").references(() => projects.id, { onDelete: "cascade" }),
  episodeId: int("episodeId").references(() => episodes.id, { onDelete: "cascade" }),
  format: mysqlEnum("format", ["pdf", "png_zip", "epub", "cbz", "mp4_1080", "mp4_4k", "prores", "stems", "srt", "tiff_zip", "thumbnail"]).notNull(),
  status: mysqlEnum("status", ["generating", "ready", "expired", "failed"]).default("generating").notNull(),
  fileUrl: text("fileUrl"),
  fileKey: text("fileKey"),
  fileSizeBytes: bigint("fileSizeBytes", { mode: "number" }),
  watermarked: int("watermarked").default(0),
  resolution: varchar("resolution", { length: 20 }),
  dpi: int("dpi"),
  chapterNumber: int("chapterNumber"),  // null = all chapters
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Export = typeof exports.$inferSelect;
export type InsertExport = typeof exports.$inferInsert;

// ─── Pre-Production Configs ────────────────────────────────────────────

export const preProductionConfigs = mysqlTable("pre_production_configs", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => projects.id, { onDelete: "cascade" }),
  status: mysqlEnum("status", ["in_progress", "locked", "archived"]).default("in_progress").notNull(),
  currentStage: int("currentStage").default(1).notNull(),  // 1-6
  characterApprovals: json("characterApprovals"),  // {characterId: {approved, versionId, lockedAt}}
  voiceAssignments: json("voiceAssignments"),  // {characterId: {voiceId, cloneId, directionNotes, source}}
  animationStyle: varchar("animationStyle", { length: 50 }),  // limited/sakuga/cel_shaded/rotoscope/motion_comic
  styleMixing: json("styleMixing"),  // {sceneId: animationStyle}
  colorGrading: varchar("colorGrading", { length: 50 }),  // warm/cool/vivid/muted/neon/pastel
  atmosphericEffects: json("atmosphericEffects"),  // {sceneId: [effects]}
  aspectRatio: varchar("aspectRatio", { length: 20 }).default("16:9"),
  openingStyle: varchar("openingStyle", { length: 50 }).default("title_card"),
  endingStyle: varchar("endingStyle", { length: 50 }).default("credits_roll"),
  pacing: varchar("pacing", { length: 50 }).default("standard_tv"),
  subtitleConfig: json("subtitleConfig"),  // {primaryLang, additionalLangs[], style, fontSize, burnedIn}
  audioConfig: json("audioConfig"),  // {musicVolume, sfxVolume, duckingIntensity}
  environmentApprovals: json("environmentApprovals"),  // {locationId: {approvedUrl, timeVariants}}
  musicConfig: json("musicConfig"),  // {opening_theme, ending_theme, ost_tracks[], scene_bgm_mapping[], stingers[]}
  estimatedCostCredits: int("estimatedCostCredits"),
  lockedAt: timestamp("lockedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PreProductionConfig = typeof preProductionConfigs.$inferSelect;
export type InsertPreProductionConfig = typeof preProductionConfigs.$inferInsert;

// ─── Character Versions ────────────────────────────────────────────────

export const characterVersions = mysqlTable("character_versions", {
  id: int("id").autoincrement().primaryKey(),
  characterId: int("characterId").notNull().references(() => characters.id, { onDelete: "cascade" }),
  versionNumber: int("versionNumber").notNull(),
  images: json("images"),  // {portrait, fullBody, threeQuarter, action, expressions} URLs
  descriptionUsed: text("descriptionUsed"),
  qualityScores: json("qualityScores"),  // per-image quality scores
  isApproved: int("isApproved").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CharacterVersion = typeof characterVersions.$inferSelect;
export type InsertCharacterVersion = typeof characterVersions.$inferInsert;

// ─── Voice Auditions ───────────────────────────────────────────────────

export const voiceAuditions = mysqlTable("voice_auditions", {
  id: int("id").autoincrement().primaryKey(),
  characterId: int("characterId").notNull().references(() => characters.id, { onDelete: "cascade" }),
  voiceId: varchar("voiceId", { length: 255 }).notNull(),
  voiceName: varchar("voiceName", { length: 255 }),
  dialogueText: text("dialogueText"),
  audioUrl: text("audioUrl"),
  isSelected: int("isSelected").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type VoiceAudition = typeof voiceAuditions.$inferSelect;
export type InsertVoiceAudition = typeof voiceAuditions.$inferInsert;

// ─── Music Tracks ─────────────────────────────────────────────────────

export const musicTracks = mysqlTable("music_tracks", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => projects.id, { onDelete: "cascade" }),
  trackType: mysqlEnum("trackType", ["opening", "ending", "bgm", "stinger", "custom"]).notNull(),
  mood: varchar("mood", { length: 100 }),  // for BGM: action, romance, tension, etc.
  title: varchar("title", { length: 255 }),
  lyrics: text("lyrics"),  // for OP/ED with vocals
  stylePrompt: text("stylePrompt"),  // the Suno prompt used
  trackUrl: text("trackUrl"),  // S3/R2 URL
  durationSeconds: float("durationSeconds"),
  isVocal: int("isVocal").default(0),
  isLoopable: int("isLoopable").default(0),  // for BGM tracks
  versionNumber: int("versionNumber").default(1).notNull(),
  isApproved: int("isApproved").default(0),
  isUserUploaded: int("isUserUploaded").default(0),
  sunoGenerationId: varchar("sunoGenerationId", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MusicTrack = typeof musicTracks.$inferSelect;
export type InsertMusicTrack = typeof musicTracks.$inferInsert;

// ─── Music Versions ───────────────────────────────────────────────────

export const musicVersions = mysqlTable("music_versions", {
  id: int("id").autoincrement().primaryKey(),
  musicTrackId: int("musicTrackId").notNull().references(() => musicTracks.id, { onDelete: "cascade" }),
  versionNumber: int("versionNumber").notNull(),
  trackUrl: text("trackUrl"),
  stylePrompt: text("stylePrompt"),
  refinementNotes: text("refinementNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MusicVersion = typeof musicVersions.$inferSelect;
export type InsertMusicVersion = typeof musicVersions.$inferInsert;

// ─── Vocal Recordings (Phase 17) ─────────────────────────────────────

export const vocalRecordings = mysqlTable("vocal_recordings", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => projects.id, { onDelete: "cascade" }),
  trackType: mysqlEnum("trackType", ["opening", "ending"]).notNull(),
  rawRecordingUrl: text("rawRecordingUrl"),
  isolatedVocalUrl: text("isolatedVocalUrl"),
  convertedVocalUrl: text("convertedVocalUrl"),
  finalMixUrl: text("finalMixUrl"),
  targetVoiceModel: varchar("targetVoiceModel", { length: 255 }),
  conversionSettings: json("conversionSettings"),
  recordingMode: mysqlEnum("recordingMode", ["full_take", "section_by_section"]).default("full_take").notNull(),
  sectionRecordings: json("sectionRecordings"),
  status: mysqlEnum("status", ["recording", "processing", "ready", "approved"]).default("recording").notNull(),
  conversionCount: int("conversionCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type VocalRecording = typeof vocalRecordings.$inferSelect;
export type InsertVocalRecording = typeof vocalRecordings.$inferInsert;

// ─── RVC Voice Models (Phase 17) ─────────────────────────────────────

export const rvcVoiceModels = mysqlTable("rvc_voice_models", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  gender: varchar("gender", { length: 50 }).notNull(),
  vocalRange: varchar("vocalRange", { length: 50 }).notNull(),
  styleTags: text("styleTags"),  // comma-separated: "rock,pop,ballad"
  modelUrl: text("modelUrl"),
  indexUrl: text("indexUrl"),
  sampleAudioUrl: text("sampleAudioUrl"),
  isActive: int("isActive").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RvcVoiceModel = typeof rvcVoiceModels.$inferSelect;
export type InsertRvcVoiceModel = typeof rvcVoiceModels.$inferInsert;

// ─── Kling Character Elements (Subject Library) ─────────────────────────

export const characterElements = mysqlTable("character_elements", {
  id: int("id").autoincrement().primaryKey(),
  characterId: int("characterId").notNull().references(() => characters.id, { onDelete: "cascade" }),
  projectId: int("projectId").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),

  // Kling Voice API
  klingVoiceTaskId: varchar("klingVoiceTaskId", { length: 255 }),
  klingVoiceId: varchar("klingVoiceId", { length: 255 }),
  voiceSourceUrl: text("voiceSourceUrl"),  // audio sample used for voice cloning

  // Kling Element API
  klingElementTaskId: varchar("klingElementTaskId", { length: 255 }),
  klingElementId: int("klingElementId"),  // the element_id from Kling API
  referenceImageUrl: text("referenceImageUrl"),  // frontal image used
  additionalImageUrls: json("additionalImageUrls"),  // string[] of additional reference images

  // Status tracking
  status: mysqlEnum("status", [
    "pending",
    "creating_voice",
    "voice_ready",
    "creating_element",
    "ready",
    "failed",
  ]).default("pending").notNull(),
  errorMessage: text("errorMessage"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CharacterElement = typeof characterElements.$inferSelect;
export type InsertCharacterElement = typeof characterElements.$inferInsert;

// ─── Production Bibles ─────────────────────────────────────────────────

export const productionBibles = mysqlTable("production_bibles", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => projects.id, { onDelete: "cascade" }),
  bibleData: json("bibleData").notNull(),  // Full Production Bible JSONB
  version: int("version").default(1).notNull(),
  lockedAt: timestamp("lockedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProductionBible = typeof productionBibles.$inferSelect;
export type InsertProductionBible = typeof productionBibles.$inferInsert;

// ─── Model Routing Stats ──────────────────────────────────────────────

export const modelRoutingStats = mysqlTable("model_routing_stats", {
  id: int("id").autoincrement().primaryKey(),
  episodeId: int("episodeId").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  pipelineRunId: int("pipelineRunId").references(() => pipelineRuns.id, { onDelete: "cascade" }),
  totalPanels: int("totalPanels").notNull(),
  tier1Count: int("tier1Count").default(0).notNull(),
  tier2Count: int("tier2Count").default(0).notNull(),
  tier3Count: int("tier3Count").default(0).notNull(),
  tier4Count: int("tier4Count").default(0).notNull(),
  actualCost: float("actualCost").notNull(),  // total actual cost in dollars
  v3OmniCost: float("v3OmniCost").notNull(),  // what all-V3-Omni would have cost
  savings: float("savings").notNull(),  // v3OmniCost - actualCost
  savingsPercent: float("savingsPercent").notNull(),  // (savings / v3OmniCost) * 100
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ModelRoutingStat = typeof modelRoutingStats.$inferSelect;
export type InsertModelRoutingStat = typeof modelRoutingStats.$inferInsert;

// ─── Harness Results ───────────────────────────────────────────────────

export const harnessResults = mysqlTable("harness_results", {
  id: int("id").autoincrement().primaryKey(),
  episodeId: int("episodeId").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  pipelineRunId: int("pipelineRunId").references(() => pipelineRuns.id, { onDelete: "cascade" }),
  layer: mysqlEnum("layer", ["script", "visual", "video", "audio", "integration"]).notNull(),
  checkName: varchar("checkName", { length: 100 }).notNull(),  // e.g., '2B_character_identity'
  targetId: int("targetId"),  // panel_id, clip_id, or episode_id depending on layer
  targetType: varchar("targetType", { length: 50 }),  // 'panel', 'clip', 'episode', 'asset'
  result: mysqlEnum("result", ["pass", "warn", "retry", "block", "human_review"]).notNull(),
  score: float("score"),  // overall score for this check (0-10)
  details: json("details"),  // full check output, scores per criterion, flagged issues
  autoFixApplied: text("autoFixApplied"),  // description of auto-fix if retry
  attemptNumber: int("attemptNumber").default(1).notNull(),
  costCredits: float("costCredits").default(0),  // cost of this harness check in dollars
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type HarnessResult = typeof harnessResults.$inferSelect;
export type InsertHarnessResult = typeof harnessResults.$inferInsert;

// ─── Uploaded Assets (BYO Manga) ──────────────────────────────────────────
export const uploadedAssets = mysqlTable("uploaded_assets", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => projects.id, { onDelete: "cascade" }),
  originalUrl: text("originalUrl").notNull(),
  cleanedUrl: text("cleanedUrl"),
  lineArtUrl: text("lineArtUrl"),
  processedUrl: text("processedUrl"),
  panelNumber: int("panelNumber").notNull(),
  sourceType: mysqlEnum("source_type", ["ai_generated", "digital_art", "hand_drawn"]).default("ai_generated"),
  processingApplied: json("processing_applied"),  // string[] of steps applied
  styleTransferOption: mysqlEnum("style_transfer_option", ["none", "enhance_only", "hybrid", "full_restyle"]).default("none"),
  ocrExtracted: json("ocr_extracted"),  // detected dialogue, bubbles, SFX
  panelMetadata: json("panel_metadata"),  // scene desc, camera angle, mood, etc.
  segmentationData: json("segmentation_data"),  // bounding box if from full page
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type UploadedAsset = typeof uploadedAssets.$inferSelect;
export type InsertUploadedAsset = typeof uploadedAssets.$inferInsert;
