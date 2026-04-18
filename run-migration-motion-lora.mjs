import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const statements = [
  `CREATE TABLE IF NOT EXISTS motion_loras (
    id int AUTO_INCREMENT PRIMARY KEY,
    characterId int NOT NULL,
    userId int NOT NULL,
    version int NOT NULL DEFAULT 1,
    trainingPath enum('sdxl_kohya','wan_fork') NOT NULL,
    status enum('queued','training','evaluating','promoted','blocked','needs_review','retired') NOT NULL DEFAULT 'queued',
    artifactUrl text,
    artifactKey text,
    triggerToken varchar(100),
    trainingSteps int DEFAULT 3500,
    trainingClipCount int,
    frameCount int DEFAULT 16,
    baseWeight float DEFAULT 0.60,
    evaluationResults json,
    evaluationVerdict enum('promoted','blocked','needs_review'),
    evaluationCostUsd float,
    trainingCostCredits float,
    trainingStartedAt timestamp NULL,
    trainingCompletedAt timestamp NULL,
    evaluatedAt timestamp NULL,
    createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT motion_loras_characterId_fk FOREIGN KEY (characterId) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT motion_loras_userId_fk FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS motion_lora_configs (
    id int AUTO_INCREMENT PRIMARY KEY,
    motionLoraId int NOT NULL,
    config json NOT NULL,
    trainingPath enum('sdxl_kohya','wan_fork') NOT NULL,
    learningRate float,
    \`rank\` int,
    alpha int,
    networkDim int,
    batchSize int,
    resolution varchar(20),
    schedulerType varchar(50),
    optimizerType varchar(50),
    captionTemplate text,
    createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT motion_lora_configs_motionLoraId_fk FOREIGN KEY (motionLoraId) REFERENCES motion_loras(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS motion_coverage_matrix (
    id int AUTO_INCREMENT PRIMARY KEY,
    characterId int NOT NULL,
    motionLoraId int NOT NULL,
    sceneType varchar(50) NOT NULL,
    clipCount int NOT NULL DEFAULT 0,
    qualityScore float,
    passed int DEFAULT 0,
    evaluatedAt timestamp NULL,
    createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT motion_coverage_characterId_fk FOREIGN KEY (characterId) REFERENCES characters(id) ON DELETE CASCADE,
    CONSTRAINT motion_coverage_motionLoraId_fk FOREIGN KEY (motionLoraId) REFERENCES motion_loras(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX idx_motion_loras_characterId ON motion_loras(characterId)`,
  `CREATE INDEX idx_motion_loras_status ON motion_loras(status)`,
  `CREATE INDEX idx_motion_lora_configs_motionLoraId ON motion_lora_configs(motionLoraId)`,
  `CREATE INDEX idx_motion_coverage_characterId ON motion_coverage_matrix(characterId)`,
  `CREATE INDEX idx_motion_coverage_sceneType ON motion_coverage_matrix(sceneType)`,
];

async function run() {
  const conn = await mysql.createConnection(DATABASE_URL);
  console.log('Connected to database');
  
  for (const stmt of statements) {
    try {
      await conn.execute(stmt);
      const firstLine = stmt.trim().split('\n')[0].substring(0, 80);
      console.log('OK:', firstLine);
    } catch (err) {
      console.error('ERROR:', err.message);
    }
  }
  
  await conn.end();
  console.log('Migration complete');
}

run().catch(console.error);
