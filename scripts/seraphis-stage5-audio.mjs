/**
 * Seraphis Recognition — Stage 5: Voice + Music Generation
 * 
 * Voice lines:
 * - P04: Ilyra (comms) "Team two by two" — comms burst, -22 LUFS
 * - P05: Ilyra (comms) "Weapons hot" — comms burst
 * - P11: Ilyra "Vern, hold here" — direct, urgent
 * - P30: Comms "Termination order confirmed" — tinny, distant
 * - P31: Kaelis "I remember." — low, flat, breath-forward
 * 
 * Music cues:
 * 1. Tactical percussion + sub-bass (0:00-0:50)
 * 2. Rising strings minor to open-fourth (0:50-1:34)
 * 3. Sustained crystal drone (1:34-2:00)
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pool = mysql.createPool(process.env.DATABASE_URL);
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
const FORGE_API_URL = process.env.BUILT_IN_FORGE_API_URL;
const FORGE_API_KEY = process.env.BUILT_IN_FORGE_API_KEY;

const EPISODE_ID = 2;
const RUN_ID = 90003;

// Voice IDs
const KAELIS_VOICE = 'SOYHLrjzK2X1ezoPC6cr'; // Harry - Fierce Warrior
// We'll list available voices and pick one for Ilyra

// Dialogue lines
const DIALOGUE_LINES = [
  { panel: 4, character: 'Ilyra', line: 'Team two by two', style: 'comms_burst', stability: 0.6, similarity: 0.7 },
  { panel: 5, character: 'Ilyra', line: 'Weapons hot', style: 'comms_burst', stability: 0.6, similarity: 0.7 },
  { panel: 11, character: 'Ilyra', line: 'Vern, hold here', style: 'direct_urgent', stability: 0.5, similarity: 0.75 },
  { panel: 30, character: 'Comms', line: 'Termination order confirmed', style: 'radio_tinny', stability: 0.8, similarity: 0.5 },
  { panel: 31, character: 'Kaelis', line: 'I remember.', style: 'low_flat_breath', stability: 0.3, similarity: 0.85 },
];

async function listVoices() {
  const res = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': ELEVENLABS_API_KEY }
  });
  const data = await res.json();
  return data.voices || [];
}

async function generateVoice(voiceId, text, settings = {}) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: settings.stability || 0.5,
        similarity_boost: settings.similarity || 0.75,
        style: settings.style_val || 0.0,
        use_speaker_boost: true
      }
    })
  });
  
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs TTS failed: ${res.status} ${err}`);
  }
  
  return Buffer.from(await res.arrayBuffer());
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

async function generateMusic(prompt, durationSeconds) {
  console.log(`  Generating music (${durationSeconds}s): ${prompt.substring(0, 60)}...`);
  
  const res = await fetch('https://api.minimax.chat/v1/music_generation', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MINIMAX_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'music-01',
      prompt,
      duration_seconds: durationSeconds
    })
  });
  
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`MiniMax music gen failed: ${res.status} ${err}`);
  }
  
  const data = await res.json();
  
  if (data.data?.audio_hex) {
    return Buffer.from(data.data.audio_hex, 'hex');
  } else if (data.data?.audio) {
    return Buffer.from(data.data.audio, 'base64');
  }
  
  throw new Error('No audio data in MiniMax response');
}

async function main() {
  console.log('\n=== Seraphis Stage 5: Voice + Music Generation ===\n');
  
  // Step 1: List voices and pick Ilyra voice
  console.log('Step 1: Listing available voices...');
  const voices = await listVoices();
  
  // Find a suitable female voice for Ilyra (measured alto, slight rasp)
  const femaleVoices = voices.filter(v => 
    v.labels?.gender === 'female' || 
    v.name?.toLowerCase().includes('female') ||
    v.name?.toLowerCase().includes('woman')
  );
  
  console.log(`  Found ${voices.length} voices, ${femaleVoices.length} female`);
  
  // Pick a good female voice - prefer one with "mature" or "strong" quality
  let ilyraVoice = femaleVoices.find(v => 
    v.name?.toLowerCase().includes('rachel') || 
    v.name?.toLowerCase().includes('bella') ||
    v.name?.toLowerCase().includes('elli')
  );
  
  if (!ilyraVoice && femaleVoices.length > 0) {
    ilyraVoice = femaleVoices[0];
  }
  
  // Fallback: use a specific known voice
  const ILYRA_VOICE = ilyraVoice?.voice_id || '21m00Tcm4TlvDq8ikWAM'; // Rachel as fallback
  const COMMS_VOICE = '29vD33N1CtxCmqQRPOHJ'; // Drew - neutral male for comms
  
  console.log(`  Kaelis voice: ${KAELIS_VOICE} (Harry - Fierce Warrior)`);
  console.log(`  Ilyra voice: ${ILYRA_VOICE} (${ilyraVoice?.name || 'Rachel fallback'})`);
  console.log(`  Comms voice: ${COMMS_VOICE}`);
  
  // Get panel IDs from DB
  const [panels] = await pool.query(
    'SELECT id, panelNumber FROM panels WHERE episodeId = ? ORDER BY panelNumber',
    [EPISODE_ID]
  );
  const panelMap = new Map(panels.map(p => [p.panelNumber, p.id]));
  
  // Step 2: Generate voice clips
  console.log('\nStep 2: Generating voice clips...');
  
  for (const dl of DIALOGUE_LINES) {
    const voiceId = dl.character === 'Kaelis' ? KAELIS_VOICE :
                    dl.character === 'Comms' ? COMMS_VOICE : ILYRA_VOICE;
    
    console.log(`  P${String(dl.panel).padStart(2,'0')} [${dl.character}]: "${dl.line}"`);
    
    try {
      const audioBuffer = await generateVoice(voiceId, dl.line, {
        stability: dl.stability,
        similarity: dl.similarity,
        style_val: dl.style === 'low_flat_breath' ? 0.8 : 0.0
      });
      
      // Upload to S3
      const s3Key = `pipeline/${RUN_ID}/voice/P${String(dl.panel).padStart(2,'0')}_${dl.character.toLowerCase()}.mp3`;
      const url = await uploadToS3(audioBuffer, s3Key, 'audio/mpeg');
      
      // Store in pipeline_assets
      const panelId = panelMap.get(dl.panel);
      await pool.query(
        `INSERT INTO pipeline_assets (pipelineRunId, episodeId, panelId, assetType, url, metadata, nodeSource, createdAt)
         VALUES (?, ?, ?, 'voice_clip', ?, ?, 'voice_gen', NOW())`,
        [RUN_ID, EPISODE_ID, panelId, url, JSON.stringify({
          character: dl.character, line: dl.line, voiceId, style: dl.style
        })]
      );
      
      console.log(`    ✓ Stored (${(audioBuffer.length / 1024).toFixed(1)} KB)`);
    } catch (err) {
      console.error(`    ✗ Failed: ${err.message}`);
    }
  }
  
  // Step 3: Generate music cues
  console.log('\nStep 3: Generating music cues...');
  
  const musicCues = [
    {
      name: 'tactical_percussion',
      duration: 50,
      prompt: 'Cinematic anime action soundtrack. Tight rhythmic percussion with deep sub-bass pulses. Military stealth infiltration tension. Minimal melodic elements. Electronic glitch textures. Building intensity. Dark atmospheric. No vocals. Professional film score quality.'
    },
    {
      name: 'rising_strings',
      duration: 44,
      prompt: 'Cinematic anime emotional soundtrack. String ensemble rising from minor key to open fourth interval. Gradual emotional ascent. Bioluminescent ocean wonder. Awe and recognition. Building from single cello to full strings. Subtle crystal chime accents. No vocals. Professional film score quality.'
    },
    {
      name: 'crystal_drone',
      duration: 26,
      prompt: 'Cinematic ambient drone. Single sustained low A note with harmonic crystal overtones. Ethereal, meditative. Bioluminescent ocean atmosphere. Slow breathing pace. Minimal, spacious. Glass-like resonance. Fade to silence at end. No vocals. Professional film score quality.'
    }
  ];
  
  for (const cue of musicCues) {
    console.log(`  Generating "${cue.name}" (${cue.duration}s)...`);
    
    try {
      const audioBuffer = await generateMusic(cue.prompt, cue.duration);
      
      // Upload to S3
      const s3Key = `pipeline/${RUN_ID}/music/${cue.name}.mp3`;
      const url = await uploadToS3(audioBuffer, s3Key, 'audio/mpeg');
      
      // Store in pipeline_assets
      await pool.query(
        `INSERT INTO pipeline_assets (pipelineRunId, episodeId, assetType, url, metadata, nodeSource, createdAt)
         VALUES (?, ?, 'music_segment', ?, ?, 'music_gen', NOW())`,
        [RUN_ID, EPISODE_ID, url, JSON.stringify({
          name: cue.name, duration: cue.duration, prompt: cue.prompt.substring(0, 200)
        })]
      );
      
      console.log(`    ✓ Stored (${(audioBuffer.length / 1024).toFixed(1)} KB)`);
    } catch (err) {
      console.error(`    ✗ Failed: ${err.message}`);
    }
  }
  
  console.log('\n=== Stage 5 Complete ===');
  await pool.end();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
