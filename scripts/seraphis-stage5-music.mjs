/**
 * Seraphis Recognition — Stage 5b: Music Generation Only
 * Uses correct MiniMax API: api.minimax.io/v1, model music-2.6-free
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pool = mysql.createPool(process.env.DATABASE_URL);
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
const FORGE_API_URL = process.env.BUILT_IN_FORGE_API_URL;
const FORGE_API_KEY = process.env.BUILT_IN_FORGE_API_KEY;

const EPISODE_ID = 2;
const RUN_ID = 90003;
const BASE_URL = 'https://api.minimax.io/v1';

async function minimaxRequest(endpoint, body) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MINIMAX_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  
  if (!res.ok) {
    throw new Error(`MiniMax HTTP error: ${res.status} ${res.statusText}`);
  }
  
  const data = await res.json();
  
  if (data.base_resp?.status_code !== 0) {
    throw new Error(`MiniMax API error ${data.base_resp?.status_code}: ${data.base_resp?.status_msg}`);
  }
  
  return data;
}

async function uploadToS3(buffer, key, contentType) {
  const formData = new FormData();
  formData.append('file', new Blob([buffer], { type: contentType }), path.basename(key));
  
  const res = await fetch(`${FORGE_API_URL}/v1/storage/upload?path=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${FORGE_API_KEY}` },
    body: formData
  });
  
  if (!res.ok) throw new Error(`S3 upload failed: ${res.status}`);
  const data = await res.json();
  return data.url;
}

async function generateMusicCue(prompt, name) {
  console.log(`  Generating "${name}"...`);
  
  const data = await minimaxRequest('/music_generation', {
    model: 'music-2.6-free',
    prompt,
    output_format: 'url',
    audio_setting: {
      sample_rate: 44100,
      bitrate: 256000,
      format: 'mp3'
    },
    is_instrumental: true,
    lyrics_optimizer: false
  });
  
  const audioUrl = data.data?.audio;
  if (!audioUrl) throw new Error('No audio URL in response');
  
  const duration = data.extra_info?.music_duration || 0;
  const size = data.extra_info?.music_size || 0;
  
  console.log(`    Audio URL received (${(duration/1000).toFixed(1)}s, ${(size/1024).toFixed(0)}KB)`);
  
  // Download from MiniMax temporary URL
  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) throw new Error(`Failed to download: ${audioRes.status}`);
  const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
  
  // Upload to S3
  const s3Key = `pipeline/${RUN_ID}/music/${name}.mp3`;
  const s3Url = await uploadToS3(audioBuffer, s3Key, 'audio/mpeg');
  
  // Store in pipeline_assets
  await pool.query(
    `INSERT INTO pipeline_assets (pipelineRunId, episodeId, assetType, url, metadata, nodeSource, createdAt)
     VALUES (?, ?, 'music_segment', ?, ?, 'music_gen', NOW())`,
    [RUN_ID, EPISODE_ID, s3Url, JSON.stringify({ name, duration, prompt: prompt.substring(0, 200) })]
  );
  
  console.log(`    ✓ Stored in S3`);
  return s3Url;
}

async function main() {
  console.log('\n=== Seraphis Stage 5b: Music Generation ===\n');
  
  const musicCues = [
    {
      name: 'tactical_percussion',
      prompt: 'Cinematic anime action soundtrack. Tight rhythmic percussion with deep sub-bass pulses. Military stealth infiltration tension. Minimal melodic elements. Electronic glitch textures. Building intensity. Dark atmospheric. No vocals. Professional film score quality. Tense and suspenseful.'
    },
    {
      name: 'rising_strings',
      prompt: 'Cinematic anime emotional soundtrack. String ensemble rising from minor key to open fourth interval. Gradual emotional ascent. Bioluminescent ocean wonder and awe. Building from single cello to full strings. Subtle crystal chime accents. No vocals. Professional film score quality. Beautiful and haunting.'
    },
    {
      name: 'crystal_drone',
      prompt: 'Cinematic ambient drone soundtrack. Single sustained low note with harmonic crystal overtones. Ethereal and meditative. Bioluminescent ocean atmosphere. Slow breathing pace. Minimal and spacious. Glass-like resonance. Fading to silence. No vocals. Professional ambient score.'
    }
  ];
  
  for (const cue of musicCues) {
    try {
      await generateMusicCue(cue.prompt, cue.name);
    } catch (err) {
      console.error(`    ✗ Failed: ${err.message}`);
    }
  }
  
  console.log('\n=== Stage 5b Complete ===');
  await pool.end();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
