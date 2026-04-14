import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
const conn = await mysql.createConnection(url);

const statements = [
  `CREATE TABLE IF NOT EXISTS \`episode_sfx\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`episodeId\` int NOT NULL,
    \`panelId\` int,
    \`sfxType\` varchar(100) NOT NULL,
    \`sfxUrl\` text,
    \`timestampMs\` int DEFAULT 0,
    \`volume\` int DEFAULT 80,
    \`durationMs\` int,
    \`source\` enum('generated','library') NOT NULL DEFAULT 'library',
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT \`episode_sfx_id\` PRIMARY KEY(\`id\`)
  )`,
  `CREATE TABLE IF NOT EXISTS \`scenes\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`episodeId\` int NOT NULL,
    \`projectId\` int NOT NULL,
    \`sceneNumber\` int NOT NULL,
    \`location\` text,
    \`timeOfDay\` varchar(50),
    \`mood\` varchar(50),
    \`sceneContext\` json,
    \`environmentLoraUrl\` text,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`scenes_id\` PRIMARY KEY(\`id\`)
  )`,
  `ALTER TABLE \`pipeline_assets\` MODIFY COLUMN \`assetType\` enum('video_clip','voice_clip','synced_clip','music_segment','sfx_clip','narrator_clip','upscaled_panel','subtitle_srt','final_video','thumbnail') NOT NULL`,
  `ALTER TABLE \`pipeline_assets\` MODIFY COLUMN \`nodeSource\` enum('quality_check','upscale','content_mod','video_gen','voice_gen','narrator_gen','lip_sync','music_gen','sfx_gen','assembly') NOT NULL`,
  `ALTER TABLE \`pipeline_runs\` MODIFY COLUMN \`currentNode\` enum('quality_check','upscale','content_mod','video_gen','voice_gen','narrator_gen','lip_sync','music_gen','sfx_gen','assembly','qa_review','none') DEFAULT 'none'`,
  `ALTER TABLE \`episodes\` ADD COLUMN \`narratorEnabled\` int DEFAULT 1`,
  `ALTER TABLE \`episodes\` ADD COLUMN \`narratorVoiceId\` varchar(255)`,
  `ALTER TABLE \`episodes\` ADD COLUMN \`sfxData\` json`,
  `ALTER TABLE \`episodes\` ADD COLUMN \`scriptModerationStatus\` enum('pending','clean','flagged','revised') DEFAULT 'pending'`,
  `ALTER TABLE \`episodes\` ADD COLUMN \`scriptModerationFlags\` json`,
  `ALTER TABLE \`episodes\` ADD COLUMN \`estimatedCostCents\` int`,
  `ALTER TABLE \`panels\` ADD COLUMN \`qualityScore\` int`,
  `ALTER TABLE \`panels\` ADD COLUMN \`qualityDetails\` json`,
  `ALTER TABLE \`panels\` ADD COLUMN \`generationAttempts\` int DEFAULT 1`,
  `ALTER TABLE \`panels\` ADD COLUMN \`upscaledImageUrl\` text`,
  `ALTER TABLE \`panels\` ADD COLUMN \`moderationStatus\` enum('pending','clean','flagged','acknowledged') DEFAULT 'pending'`,
  `ALTER TABLE \`panels\` ADD COLUMN \`moderationFlags\` json`,
  `ALTER TABLE \`episode_sfx\` ADD CONSTRAINT \`episode_sfx_episodeId_episodes_id_fk\` FOREIGN KEY (\`episodeId\`) REFERENCES \`episodes\`(\`id\`) ON DELETE cascade ON UPDATE no action`,
  `ALTER TABLE \`episode_sfx\` ADD CONSTRAINT \`episode_sfx_panelId_panels_id_fk\` FOREIGN KEY (\`panelId\`) REFERENCES \`panels\`(\`id\`) ON DELETE cascade ON UPDATE no action`,
  `ALTER TABLE \`scenes\` ADD CONSTRAINT \`scenes_episodeId_episodes_id_fk\` FOREIGN KEY (\`episodeId\`) REFERENCES \`episodes\`(\`id\`) ON DELETE cascade ON UPDATE no action`,
  `ALTER TABLE \`scenes\` ADD CONSTRAINT \`scenes_projectId_projects_id_fk\` FOREIGN KEY (\`projectId\`) REFERENCES \`projects\`(\`id\`) ON DELETE cascade ON UPDATE no action`,
];

for (const sql of statements) {
  try {
    await conn.execute(sql);
    console.log("OK:", sql.slice(0, 80));
  } catch (e) {
    if (e.code === "ER_DUP_FIELDNAME" || e.code === "ER_TABLE_EXISTS_ERROR" || e.code === "ER_DUP_KEYNAME") {
      console.log("SKIP (already exists):", sql.slice(0, 80));
    } else {
      console.error("FAIL:", sql.slice(0, 80), e.message);
    }
  }
}

await conn.end();
console.log("Pipeline enhancement migration complete!");
