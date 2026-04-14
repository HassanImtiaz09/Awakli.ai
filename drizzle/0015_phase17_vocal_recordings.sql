-- Phase 17: Human-Reference Singing Voice Conversion

CREATE TABLE IF NOT EXISTS vocal_recordings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  projectId INT NOT NULL,
  trackType ENUM('opening', 'ending') NOT NULL,
  rawRecordingUrl TEXT,
  isolatedVocalUrl TEXT,
  convertedVocalUrl TEXT,
  finalMixUrl TEXT,
  targetVoiceModel VARCHAR(255),
  conversionSettings JSON,
  recordingMode ENUM('full_take', 'section_by_section') NOT NULL DEFAULT 'full_take',
  sectionRecordings JSON,
  status ENUM('recording', 'processing', 'ready', 'approved') NOT NULL DEFAULT 'recording',
  conversionCount INT NOT NULL DEFAULT 0,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rvc_voice_models (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  gender VARCHAR(50) NOT NULL,
  vocalRange VARCHAR(50) NOT NULL,
  styleTags TEXT,
  modelUrl TEXT,
  indexUrl TEXT,
  sampleAudioUrl TEXT,
  isActive INT NOT NULL DEFAULT 1,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed 12 diverse singing voice models
INSERT INTO rvc_voice_models (name, gender, vocalRange, styleTags, sampleAudioUrl) VALUES
('Powerful Vocalist', 'female', 'alto', 'rock,ballad,anime', '/samples/powerful-vocalist.mp3'),
('Sweet Pop Singer', 'female', 'soprano', 'pop,jpop,idol', '/samples/sweet-pop.mp3'),
('Rock Vocalist', 'male', 'tenor', 'rock,metal,punk', '/samples/rock-vocalist.mp3'),
('Smooth Baritone', 'male', 'baritone', 'rnb,jazz,ballad', '/samples/smooth-baritone.mp3'),
('Ethereal Voice', 'female', 'soprano', 'ambient,ethereal,dream', '/samples/ethereal.mp3'),
('Energetic Pop', 'male', 'tenor', 'pop,dance,boyband', '/samples/energetic-pop.mp3'),
('Emotional Ballad', 'female', 'mezzo-soprano', 'ballad,emotional,drama', '/samples/emotional-ballad.mp3'),
('Anime Hero', 'male', 'tenor', 'anime,jpop,rock', '/samples/anime-hero.mp3'),
('J-Pop Idol', 'female', 'soprano', 'jpop,idol,cute', '/samples/jpop-idol.mp3'),
('Dark & Intense', 'male', 'bass', 'metal,dark,growl', '/samples/dark-intense.mp3'),
('Androgynous Warm', 'non-binary', 'mezzo-soprano', 'indie,folk,warm', '/samples/androgynous-warm.mp3'),
('Androgynous Cool', 'non-binary', 'tenor', 'electronic,cool,ambient', '/samples/androgynous-cool.mp3');
