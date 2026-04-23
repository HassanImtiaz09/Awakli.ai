import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Execute each statement separately
try {
  await conn.execute(`
    CREATE TABLE video_slices (
      id int AUTO_INCREMENT NOT NULL,
      episodeId int NOT NULL,
      projectId int NOT NULL,
      sceneId int,
      sliceNumber int NOT NULL,
      durationSeconds float NOT NULL DEFAULT 10,
      characters json,
      dialogue json,
      actionDescription text,
      cameraAngle enum('wide','medium','close-up','extreme-close-up','birds-eye','panning','tracking') DEFAULT 'medium',
      mood varchar(100),
      panelIds json,
      complexityTier int NOT NULL DEFAULT 1,
      complexityReason text,
      klingModel enum('v3_omni','v2_6','v2_1','v1_6') NOT NULL DEFAULT 'v3_omni',
      klingMode enum('professional','standard') NOT NULL DEFAULT 'professional',
      lipSyncRequired int NOT NULL DEFAULT 0,
      userOverrideTier int,
      coreScenePrompt text,
      coreSceneImageUrl text,
      coreSceneStatus enum('pending','generating','generated','approved','rejected') NOT NULL DEFAULT 'pending',
      coreSceneAttempts int DEFAULT 0,
      videoClipUrl text,
      videoClipStatus enum('pending','generating','generated','approved','rejected','failed') NOT NULL DEFAULT 'pending',
      videoClipAttempts int DEFAULT 0,
      videoClipDurationMs int,
      voiceAudioUrl text,
      voiceAudioDurationMs int,
      estimatedCredits int DEFAULT 0,
      actualCredits int,
      createdAt timestamp NOT NULL DEFAULT (now()),
      updatedAt timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT video_slices_id PRIMARY KEY(id),
      CONSTRAINT video_slices_episodeId_fk FOREIGN KEY (episodeId) REFERENCES episodes(id) ON DELETE CASCADE ON UPDATE NO ACTION,
      CONSTRAINT video_slices_projectId_fk FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE ON UPDATE NO ACTION
    )
  `);
  console.log('OK: CREATE TABLE video_slices');
} catch (e) {
  console.error('ERR CREATE TABLE:', e.message);
}

try {
  await conn.execute('CREATE INDEX video_slices_episode_idx ON video_slices (episodeId, sliceNumber)');
  console.log('OK: CREATE INDEX video_slices_episode_idx');
} catch (e) {
  console.error('ERR INDEX 1:', e.message);
}

try {
  await conn.execute('CREATE INDEX video_slices_project_idx ON video_slices (projectId)');
  console.log('OK: CREATE INDEX video_slices_project_idx');
} catch (e) {
  console.error('ERR INDEX 2:', e.message);
}

await conn.end();
console.log('Migration complete');
