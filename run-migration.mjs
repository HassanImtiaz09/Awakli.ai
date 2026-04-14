import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const statements = [
  // Projects: sneak peek columns
  "ALTER TABLE `projects` ADD `sneak_peek_url` text",
  "ALTER TABLE `projects` ADD `sneak_peek_status` enum('none','generating','ready','failed') DEFAULT 'none'",
  "ALTER TABLE `projects` ADD `sneak_peek_scene_id` int",
  "ALTER TABLE `projects` ADD `sneak_peek_generated_at` timestamp",
  // Projects: chapter structure columns
  "ALTER TABLE `projects` ADD `chapter_length_preset` enum('short','standard','long') DEFAULT 'standard'",
  "ALTER TABLE `projects` ADD `pacing_style` enum('action_heavy','dialogue_heavy','balanced') DEFAULT 'balanced'",
  "ALTER TABLE `projects` ADD `chapter_ending_style` enum('cliffhanger','resolution','serialized') DEFAULT 'cliffhanger'",
  // Episodes: chapter metadata
  "ALTER TABLE `episodes` ADD `chapter_end_type` enum('cliffhanger','resolution','serialized')",
  "ALTER TABLE `episodes` ADD `next_chapter_hook` text",
  "ALTER TABLE `episodes` ADD `estimated_read_time` int",
  "ALTER TABLE `episodes` ADD `mood_arc` json",
  // Exports table
  `CREATE TABLE exports (
    id int AUTO_INCREMENT NOT NULL,
    userId int NOT NULL,
    projectId int,
    episodeId int,
    format enum('pdf','png_zip','epub','cbz','mp4_1080','mp4_4k','prores','stems','srt','tiff_zip','thumbnail') NOT NULL,
    status enum('generating','ready','expired','failed') NOT NULL DEFAULT 'generating',
    fileUrl text,
    fileKey text,
    fileSizeBytes bigint,
    watermarked int DEFAULT 0,
    resolution varchar(20),
    dpi int,
    chapterNumber int,
    expiresAt timestamp,
    createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT exports_id PRIMARY KEY(id)
  )`,
  // Foreign keys
  "ALTER TABLE exports ADD CONSTRAINT exports_userId_fk FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE",
  "ALTER TABLE exports ADD CONSTRAINT exports_projectId_fk FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE",
  "ALTER TABLE exports ADD CONSTRAINT exports_episodeId_fk FOREIGN KEY (episodeId) REFERENCES episodes(id) ON DELETE CASCADE",
];

for (const stmt of statements) {
  try {
    const short = stmt.replace(/\s+/g, ' ').substring(0, 80);
    console.log(`Executing: ${short}...`);
    await conn.execute(stmt);
    console.log('  OK');
  } catch (e) {
    if (e.message.includes('Duplicate column') || e.message.includes('already exists')) {
      console.log('  SKIPPED (already exists)');
    } else {
      console.log(`  Error: ${e.message}`);
    }
  }
}

await conn.end();
console.log('Migration complete');
