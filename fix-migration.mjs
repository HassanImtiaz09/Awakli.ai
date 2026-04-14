import mysql from "mysql2/promise";
import { readFileSync } from "fs";

const url = process.env.DATABASE_URL;
if (!url) { console.error("No DATABASE_URL"); process.exit(1); }

const conn = await mysql.createConnection(url);

// Check which columns exist and add missing ones
const checks = [
  // Episodes columns
  { table: "episodes", column: "chapter_end_type", sql: "ALTER TABLE `episodes` ADD `chapter_end_type` enum('cliffhanger','resolution','serialized')" },
  { table: "episodes", column: "next_chapter_hook", sql: "ALTER TABLE `episodes` ADD `next_chapter_hook` text" },
  { table: "episodes", column: "estimated_read_time", sql: "ALTER TABLE `episodes` ADD `estimated_read_time` int" },
  { table: "episodes", column: "mood_arc", sql: "ALTER TABLE `episodes` ADD `mood_arc` json" },
  // Projects columns
  { table: "projects", column: "sneak_peek_url", sql: "ALTER TABLE `projects` ADD `sneak_peek_url` text" },
  { table: "projects", column: "sneak_peek_status", sql: "ALTER TABLE `projects` ADD `sneak_peek_status` enum('none','generating','ready','failed') DEFAULT 'none'" },
  { table: "projects", column: "sneak_peek_scene_id", sql: "ALTER TABLE `projects` ADD `sneak_peek_scene_id` int" },
  { table: "projects", column: "sneak_peek_generated_at", sql: "ALTER TABLE `projects` ADD `sneak_peek_generated_at` timestamp" },
  { table: "projects", column: "chapter_length_preset", sql: "ALTER TABLE `projects` ADD `chapter_length_preset` enum('short','standard','long') DEFAULT 'standard'" },
  { table: "projects", column: "pacing_style", sql: "ALTER TABLE `projects` ADD `pacing_style` enum('action_heavy','dialogue_heavy','balanced') DEFAULT 'balanced'" },
  { table: "projects", column: "chapter_ending_style", sql: "ALTER TABLE `projects` ADD `chapter_ending_style` enum('cliffhanger','resolution','serialized') DEFAULT 'cliffhanger'" },
];

for (const check of checks) {
  try {
    const [rows] = await conn.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = ? AND COLUMN_NAME = ? AND TABLE_SCHEMA = DATABASE()`,
      [check.table, check.column]
    );
    if (rows.length === 0) {
      console.log(`Adding ${check.table}.${check.column}...`);
      await conn.query(check.sql);
      console.log(`  ✓ Added`);
    } else {
      console.log(`  ✓ ${check.table}.${check.column} already exists`);
    }
  } catch (err) {
    console.error(`  ✗ Error adding ${check.table}.${check.column}:`, err.message);
  }
}

// Check exports table
try {
  const [rows] = await conn.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'exports' AND TABLE_SCHEMA = DATABASE()`
  );
  if (rows.length === 0) {
    console.log("Creating exports table...");
    await conn.query(`CREATE TABLE \`exports\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`userId\` int NOT NULL,
      \`projectId\` int,
      \`episodeId\` int,
      \`format\` enum('pdf','png_zip','epub','cbz','mp4_1080','mp4_4k','prores','stems','srt','tiff_zip','thumbnail') NOT NULL,
      \`status\` enum('generating','ready','expired','failed') NOT NULL DEFAULT 'generating',
      \`fileUrl\` text,
      \`fileKey\` text,
      \`fileSizeBytes\` bigint,
      \`watermarked\` int DEFAULT 0,
      \`resolution\` varchar(20),
      \`dpi\` int,
      \`chapterNumber\` int,
      \`expiresAt\` timestamp,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      CONSTRAINT \`exports_id\` PRIMARY KEY(\`id\`)
    )`);
    console.log("  ✓ Created");
    
    // Add foreign keys
    try { await conn.query(`ALTER TABLE \`exports\` ADD CONSTRAINT \`exports_userId_users_id_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE cascade ON UPDATE no action`); } catch(e) {}
    try { await conn.query(`ALTER TABLE \`exports\` ADD CONSTRAINT \`exports_projectId_projects_id_fk\` FOREIGN KEY (\`projectId\`) REFERENCES \`projects\`(\`id\`) ON DELETE cascade ON UPDATE no action`); } catch(e) {}
    try { await conn.query(`ALTER TABLE \`exports\` ADD CONSTRAINT \`exports_episodeId_episodes_id_fk\` FOREIGN KEY (\`episodeId\`) REFERENCES \`episodes\`(\`id\`) ON DELETE cascade ON UPDATE no action`); } catch(e) {}
    console.log("  ✓ Foreign keys added");
  } else {
    console.log("  ✓ exports table already exists");
  }
} catch (err) {
  console.error("Error with exports table:", err.message);
}

await conn.end();
console.log("Migration fix complete!");
