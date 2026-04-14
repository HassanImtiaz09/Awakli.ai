import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
const conn = await mysql.createConnection(url);

const statements = [
  `CREATE TABLE IF NOT EXISTS tier_limits (
    tier varchar(20) NOT NULL,
    maxProjects int NOT NULL,
    maxChaptersPerProject int NOT NULL,
    maxPanelsPerChapter int NOT NULL,
    maxAnimeEpisodesPerMonth int NOT NULL,
    maxLoraCharacters int NOT NULL,
    maxVoiceClones int NOT NULL,
    scriptModel varchar(100) NOT NULL,
    videoResolution varchar(20) NOT NULL,
    hasWatermark int NOT NULL DEFAULT 0,
    canUploadManga int NOT NULL DEFAULT 0,
    canMonetize int NOT NULL DEFAULT 0,
    revenueSharePercent int NOT NULL DEFAULT 0,
    updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (tier)
  )`,
  `ALTER TABLE subscriptions MODIFY COLUMN tier enum('free','pro','creator','studio') NOT NULL DEFAULT 'free'`,
  `ALTER TABLE episodes ADD COLUMN isPremium enum('free','premium','pay_per_view') DEFAULT 'free'`,
  `ALTER TABLE episodes ADD COLUMN ppvPriceCents int`,
  `ALTER TABLE projects ADD COLUMN previewVideoUrl text`,
  `ALTER TABLE projects ADD COLUMN previewGeneratedAt timestamp`,
  `ALTER TABLE users ADD COLUMN animePreviewUsed int DEFAULT 0`,
  // Seed tier_limits
  `INSERT INTO tier_limits (tier, maxProjects, maxChaptersPerProject, maxPanelsPerChapter, maxAnimeEpisodesPerMonth, maxLoraCharacters, maxVoiceClones, scriptModel, videoResolution, hasWatermark, canUploadManga, canMonetize, revenueSharePercent) VALUES
    ('free', 3, 3, 20, 0, 0, 0, 'claude-sonnet-4-20250514', '720p', 1, 0, 0, 0),
    ('creator', 10, 12, 30, 5, 3, 2, 'claude-opus-4-20250514', '1080p', 0, 0, 1, 80),
    ('studio', 999, 999, 999, 20, 999, 999, 'claude-opus-4-20250514', '4K', 0, 1, 1, 85)
  ON DUPLICATE KEY UPDATE maxProjects=VALUES(maxProjects)`,
];

for (const sql of statements) {
  try {
    await conn.execute(sql);
    console.log("OK:", sql.substring(0, 60) + "...");
  } catch (e) {
    if (e.code === "ER_DUP_FIELDNAME" || e.message.includes("Duplicate column")) {
      console.log("SKIP (already exists):", sql.substring(0, 60) + "...");
    } else {
      console.error("ERR:", e.message, "SQL:", sql.substring(0, 80));
    }
  }
}

await conn.end();
console.log("Migration complete!");
