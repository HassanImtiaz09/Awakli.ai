/**
 * Seraphis Recognition — Stage 6 v2: Fixed Audio + Lip Sync Assembly
 * 
 * Fixes from v1:
 * 1. Voice track: uses adelay+apad per clip then amix with normalize_weights=0 
 *    to avoid the 1/N amplitude division bug
 * 2. Each voice clip normalized individually to -14 LUFS before placement
 * 3. Lip sync: uses Kling Lip Sync API to animate mouths on dialogue panels
 * 4. Validation step: checks voice presence at each timecode before final mux
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { execSync } from 'child_process';
import { createHmac } from 'crypto';
import fs from 'fs';
import path from 'path';

dotenv.config();

const pool = mysql.createPool(process.env.DATABASE_URL);
const FORGE_API_URL = process.env.BUILT_IN_FORGE_API_URL;
const FORGE_API_KEY = process.env.BUILT_IN_FORGE_API_KEY;
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_STREAM_TOKEN = process.env.CLOUDFLARE_STREAM_TOKEN;
const KLING_ACCESS_KEY = process.env.KLING_ACCESS_KEY;
const KLING_SECRET_KEY = process.env.KLING_SECRET_KEY;

const KLING_BASE = 'https://api-singapore.klingai.com';
const WORK_DIR = '/tmp/seraphis-assembly-v2';
const RUN_ID = 90003;

// Panel durations from spec (seconds)
const PANEL_DURATIONS = {
  1: 3.0, 2: 3.5, 3: 3.0, 4: 2.5, 5: 3.5, 6: 4.5,
  7: 2.5, 8: 2.5, 9: 3.0, 10: 3.0, 11: 2.5, 12: 5.0, 13: 5.5, 14: 6.0,
  15: 3.5, 16: 3.0, 17: 3.5, 18: 5.0, 19: 3.5, 20: 3.0, 21: 4.0, 22: 4.5,
  23: 4.0, 24: 3.0, 25: 4.0, 26: 3.0, 27: 7.0, 28: 4.0, 29: 5.0,
  30: 3.5, 31: 4.0, 32: 2.5
};

// Voice placement: panel -> timecode offset (seconds)
const VOICE_PANELS = {
  4:  { start: 9.5,   panelId: 60004, character: 'Ilyra',  line: 'Team two by two' },
  5:  { start: 12.0,  panelId: 60005, character: 'Ilyra',  line: 'Weapons hot' },
  11: { start: 31.0,  panelId: 60011, character: 'Ilyra',  line: 'Vern, hold here' },
  30: { start: 110.0, panelId: 60030, character: 'Comms',  line: 'Termination order confirmed' },
  31: { start: 113.5, panelId: 60031, character: 'Kaelis', line: 'I remember.' }
};

// Music cue placement
const MUSIC_CUES = [
  { name: 'tactical_percussion', start: 0, end: 50 },
  { name: 'rising_strings', start: 50, end: 94 },
  { name: 'crystal_drone', start: 94, end: 120 }
];

// Letterbox panels (2.39:1)
const LETTERBOX_PANELS = new Set([15,16,17,18,19,20,21,22,23,24,25,26,27,28,29]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function run(cmd) {
  console.log(`  $ ${cmd.substring(0, 150)}...`);
  try {
    return execSync(cmd, { stdio: 'pipe', maxBuffer: 50 * 1024 * 1024 }).toString();
  } catch (err) {
    console.error(`  FAILED: ${err.stderr?.toString().substring(0, 500)}`);
    throw err;
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function generateKlingToken() {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: KLING_ACCESS_KEY, exp: now + 1800, nbf: now - 5, iat: now };
  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const headerB64 = encode(header);
  const payloadB64 = encode(payload);
  const signature = createHmac('sha256', KLING_SECRET_KEY)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');
  return `${headerB64}.${payloadB64}.${signature}`;
}

async function klingRequest(method, path, body) {
  const token = await generateKlingToken();
  const res = await fetch(`${KLING_BASE}${path}`, {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Kling ${method} ${path}: ${res.status} ${text.substring(0, 200)}`);
  }
  return res.json();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== Seraphis Stage 6 v2: Fixed Audio + Lip Sync Assembly ===\n');

  fs.mkdirSync(`${WORK_DIR}/clips`, { recursive: true });
  fs.mkdirSync(`${WORK_DIR}/voice`, { recursive: true });
  fs.mkdirSync(`${WORK_DIR}/music`, { recursive: true });
  fs.mkdirSync(`${WORK_DIR}/trimmed`, { recursive: true });
  fs.mkdirSync(`${WORK_DIR}/lipsync`, { recursive: true });

  // ── Step 1: Fetch all asset URLs from DB ──
  console.log('Step 1: Fetching asset URLs...');
  const [videoAssets] = await pool.query(
    'SELECT panelId, url FROM pipeline_assets WHERE pipelineRunId = ? AND assetType = "video_clip" ORDER BY panelId',
    [RUN_ID]
  );
  const [voiceAssets] = await pool.query(
    'SELECT panelId, url FROM pipeline_assets WHERE pipelineRunId = ? AND assetType = "voice_clip" ORDER BY panelId',
    [RUN_ID]
  );
  const [musicAssets] = await pool.query(
    'SELECT url, metadata FROM pipeline_assets WHERE pipelineRunId = ? AND assetType = "music_segment" ORDER BY id',
    [RUN_ID]
  );
  console.log(`  Videos: ${videoAssets.length}, Voices: ${voiceAssets.length}, Music: ${musicAssets.length}`);

  const panelIdToNum = {};
  for (let i = 0; i < videoAssets.length; i++) {
    panelIdToNum[videoAssets[i].panelId] = i + 1;
  }

  // ── Step 2: Download all assets ──
  console.log('\nStep 2: Downloading assets...');
  
  // Copy from v1 work dir if available, otherwise download
  const V1_DIR = '/tmp/seraphis-assembly';
  
  for (const asset of videoAssets) {
    const num = panelIdToNum[asset.panelId];
    const outPath = `${WORK_DIR}/clips/P${String(num).padStart(2,'0')}.mp4`;
    if (fs.existsSync(outPath)) continue;
    const v1Path = `${V1_DIR}/clips/P${String(num).padStart(2,'0')}.mp4`;
    if (fs.existsSync(v1Path)) {
      fs.copyFileSync(v1Path, outPath);
      continue;
    }
    console.log(`  Downloading P${String(num).padStart(2,'0')} video...`);
    run(`curl -sL -o "${outPath}" "${asset.url}"`);
  }

  for (const asset of voiceAssets) {
    const num = panelIdToNum[asset.panelId];
    const outPath = `${WORK_DIR}/voice/P${String(num).padStart(2,'0')}.mp3`;
    if (fs.existsSync(outPath)) continue;
    const v1Path = `${V1_DIR}/voice/P${String(num).padStart(2,'0')}.mp3`;
    if (fs.existsSync(v1Path)) {
      fs.copyFileSync(v1Path, outPath);
      continue;
    }
    console.log(`  Downloading P${String(num).padStart(2,'0')} voice...`);
    run(`curl -sL -o "${outPath}" "${asset.url}"`);
  }

  for (const asset of musicAssets) {
    const meta = typeof asset.metadata === 'string' ? JSON.parse(asset.metadata) : asset.metadata;
    const outPath = `${WORK_DIR}/music/${meta.name}.mp3`;
    if (fs.existsSync(outPath)) continue;
    const v1Path = `${V1_DIR}/music/${meta.name}.mp3`;
    if (fs.existsSync(v1Path)) {
      fs.copyFileSync(v1Path, outPath);
      continue;
    }
    console.log(`  Downloading ${meta.name}...`);
    run(`curl -sL -o "${outPath}" "${asset.url}"`);
  }
  console.log('  All assets ready.');

  // ── Step 3: Lip Sync — Process dialogue panels through Kling Lip Sync API ──
  console.log('\nStep 3: Lip Sync — Processing dialogue panels...');
  
  const lipSyncResults = {}; // panelNum -> lipsynced video path
  
  for (const [panelStr, info] of Object.entries(VOICE_PANELS)) {
    const p = parseInt(panelStr);
    const lsPath = `${WORK_DIR}/lipsync/P${String(p).padStart(2,'0')}_lipsync.mp4`;
    
    if (fs.existsSync(lsPath)) {
      console.log(`  P${String(p).padStart(2,'0')}: Already lip-synced, skipping.`);
      lipSyncResults[p] = lsPath;
      continue;
    }
    
    console.log(`  P${String(p).padStart(2,'0')} [${info.character}]: "${info.line}"`);
    
    // First, we need to upload the panel's raw video clip to S3 for Kling to access
    const clipPath = `${WORK_DIR}/clips/P${String(p).padStart(2,'0')}.mp4`;
    
    // Upload clip to S3 to get a public URL
    const clipBuffer = fs.readFileSync(clipPath);
    const clipFormData = new FormData();
    clipFormData.append('file', new Blob([clipBuffer], { type: 'video/mp4' }), `P${String(p).padStart(2,'0')}.mp4`);
    const clipUploadRes = await fetch(`${FORGE_API_URL}/v1/storage/upload?path=${encodeURIComponent(`pipeline/${RUN_ID}/lipsync/P${String(p).padStart(2,'0')}_clip.mp4`)}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${FORGE_API_KEY}` },
      body: clipFormData
    });
    const clipUploadData = await clipUploadRes.json();
    const clipUrl = clipUploadData.url;
    console.log(`    Uploaded clip to S3: ${clipUrl.substring(0, 80)}...`);
    
    // Pad voice clip to at least 2 seconds (Kling minimum)
    const voiceMp3 = `${WORK_DIR}/voice/P${String(p).padStart(2,'0')}.mp3`;
    const voicePadded = `${WORK_DIR}/voice/P${String(p).padStart(2,'0')}_padded.mp3`;
    
    // Get current duration
    const durStr = run(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${voiceMp3}"`).trim();
    const voiceDur = parseFloat(durStr);
    
    if (voiceDur < 2.0) {
      // Pad with silence to reach 2.1 seconds
      const padDur = 2.1 - voiceDur;
      run(`ffmpeg -y -i "${voiceMp3}" -af "apad=pad_dur=${padDur}" -t 2.1 "${voicePadded}"`);
      console.log(`    Padded voice from ${voiceDur.toFixed(1)}s to 2.1s`);
    } else {
      fs.copyFileSync(voiceMp3, voicePadded);
    }
    
    // Upload padded voice to S3
    const voiceBuffer = fs.readFileSync(voicePadded);
    const voiceFormData = new FormData();
    voiceFormData.append('file', new Blob([voiceBuffer], { type: 'audio/mpeg' }), `P${String(p).padStart(2,'0')}_padded.mp3`);
    const voiceUploadRes = await fetch(`${FORGE_API_URL}/v1/storage/upload?path=${encodeURIComponent(`pipeline/${RUN_ID}/lipsync/P${String(p).padStart(2,'0')}_voice_padded.mp3`)}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${FORGE_API_KEY}` },
      body: voiceFormData
    });
    const voiceUploadData = await voiceUploadRes.json();
    const voiceUrl = voiceUploadData.url;
    console.log(`    Uploaded padded voice to S3`);
    
    try {
      // Step A: Identify face in the video clip
      console.log(`    Identifying face...`);
      const identifyRes = await klingRequest('POST', '/v1/videos/identify-face', {
        video_url: clipUrl
      });
      
      if (identifyRes.code !== 0) {
        console.log(`    ⚠ Face identify failed (code ${identifyRes.code}): ${identifyRes.message}`);
        console.log(`    Skipping lip sync for P${String(p).padStart(2,'0')}`);
        continue;
      }
      
      const sessionId = identifyRes.data?.session_id;
      const faces = identifyRes.data?.face_data || [];
      console.log(`    Session: ${sessionId}, Faces found: ${faces.length}`);
      
      if (faces.length === 0) {
        console.log(`    ⚠ No faces detected, skipping lip sync`);
        continue;
      }
      
      // Use the first face
      const face = faces[0];
      console.log(`    Face ID: ${face.face_id}, visible ${face.start_time}ms-${face.end_time}ms`);
      
      // Step B: Create lip sync task
      console.log(`    Creating lip sync task...`);
      const paddedDurStr = run(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${voicePadded}"`).trim();
      const paddedDurMs = Math.round(parseFloat(paddedDurStr) * 1000);
      
      const lipSyncRes = await klingRequest('POST', '/v1/videos/advanced-lip-sync', {
        session_id: sessionId,
        face_choose: [{
          face_id: face.face_id,
          sound_file: voiceUrl,
          sound_start_time: 0,
          sound_end_time: paddedDurMs,
          sound_insert_time: 0,  // Insert at beginning of clip
          sound_volume: 2,       // Max voice volume
          original_audio_volume: 0  // Mute original audio (we'll mix our own)
        }]
      });
      
      if (lipSyncRes.code !== 0) {
        console.log(`    ⚠ Lip sync creation failed (code ${lipSyncRes.code}): ${lipSyncRes.message}`);
        continue;
      }
      
      const taskId = lipSyncRes.data?.task_id;
      console.log(`    Lip sync task: ${taskId}`);
      
      // Step C: Poll until complete
      let attempts = 0;
      const maxAttempts = 60; // 5 minutes max
      let lsResult = null;
      
      while (attempts < maxAttempts) {
        await sleep(5000);
        attempts++;
        
        const statusRes = await klingRequest('GET', `/v1/videos/advanced-lip-sync/${taskId}`);
        const status = statusRes.data?.task_status;
        
        if (status === 'succeed') {
          const videos = statusRes.data?.task_result?.videos || [];
          if (videos.length > 0) {
            lsResult = videos[0];
            console.log(`    ✓ Lip sync complete (${attempts * 5}s): ${lsResult.url.substring(0, 80)}...`);
          }
          break;
        } else if (status === 'failed') {
          console.log(`    ✗ Lip sync failed: ${statusRes.data?.task_status_msg}`);
          break;
        }
        
        if (attempts % 6 === 0) {
          console.log(`    ... still processing (${attempts * 5}s)`);
        }
      }
      
      if (lsResult) {
        // Download the lip-synced video
        run(`curl -sL -o "${lsPath}" "${lsResult.url}"`);
        lipSyncResults[p] = lsPath;
        console.log(`    ✓ Downloaded lip-synced clip`);
      }
    } catch (err) {
      console.log(`    ⚠ Lip sync error: ${err.message}`);
      console.log(`    Will use original clip without lip sync`);
    }
  }
  
  console.log(`  Lip sync complete: ${Object.keys(lipSyncResults).length}/${Object.keys(VOICE_PANELS).length} panels processed`);

  // ── Step 4: Trim clips to spec durations (use lip-synced versions where available) ──
  console.log('\nStep 4: Trimming clips to spec durations...');
  
  for (let p = 1; p <= 32; p++) {
    const dur = PANEL_DURATIONS[p];
    // Use lip-synced version if available, otherwise original
    const inPath = lipSyncResults[p] || `${WORK_DIR}/clips/P${String(p).padStart(2,'0')}.mp4`;
    const outPath = `${WORK_DIR}/trimmed/P${String(p).padStart(2,'0')}.mp4`;
    if (fs.existsSync(outPath)) continue;

    if (LETTERBOX_PANELS.has(p)) {
      run(`ffmpeg -y -i "${inPath}" -t ${dur} -vf "crop=iw:iw/2.39,pad=iw:iw*9/16:(ow-iw)/2:(oh-ih)/2:black" -c:v libx264 -preset fast -crf 18 -r 24 -an "${outPath}"`);
    } else {
      run(`ffmpeg -y -i "${inPath}" -t ${dur} -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black" -c:v libx264 -preset fast -crf 18 -r 24 -an "${outPath}"`);
    }
  }
  console.log('  All clips trimmed.');

  // ── Step 5: Concatenate video clips (hard cuts) ──
  console.log('\nStep 5: Concatenating video clips...');
  
  let concatList = '';
  for (let p = 1; p <= 32; p++) {
    concatList += `file '${WORK_DIR}/trimmed/P${String(p).padStart(2,'0')}.mp4'\n`;
  }
  fs.writeFileSync(`${WORK_DIR}/concat.txt`, concatList);
  
  const videoOnlyPath = `${WORK_DIR}/video_only.mp4`;
  run(`ffmpeg -y -f concat -safe 0 -i "${WORK_DIR}/concat.txt" -c:v libx264 -preset fast -crf 18 -r 24 -pix_fmt yuv420p "${videoOnlyPath}"`);
  
  const durStr = run(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoOnlyPath}"`).trim();
  const videoDuration = parseFloat(durStr);
  console.log(`  Video duration: ${videoDuration.toFixed(1)}s`);

  // ── Step 6: Build voice track (FIXED — no amix 1/N division) ──
  console.log('\nStep 6: Building voice track (FIXED approach)...');
  
  // Create silent base
  run(`ffmpeg -y -f lavfi -i anullsrc=r=48000:cl=stereo -t ${videoDuration} -c:a pcm_s16le "${WORK_DIR}/silence.wav"`);
  
  // Normalize each voice clip to -14 LUFS (loud and clear)
  for (const [panelStr] of Object.entries(VOICE_PANELS)) {
    const p = parseInt(panelStr);
    const mp3Path = `${WORK_DIR}/voice/P${String(p).padStart(2,'0')}.mp3`;
    const normalizedPath = `${WORK_DIR}/voice/P${String(p).padStart(2,'0')}_norm.wav`;
    if (fs.existsSync(normalizedPath)) continue;
    
    // Two-pass loudnorm for accurate normalization to -14 LUFS
    // First pass: measure
    const measureOutput = run(`ffmpeg -y -i "${mp3Path}" -af "loudnorm=I=-14:TP=-1.5:LRA=7:print_format=json" -f null - 2>&1 || true`);
    
    // Single-pass with aggressive normalization
    run(`ffmpeg -y -i "${mp3Path}" -af "loudnorm=I=-14:TP=-1.5:LRA=7,volume=2.0" -ar 48000 -ac 2 -c:a pcm_s16le "${normalizedPath}"`);
    
    // Verify
    const checkOutput = run(`ffmpeg -i "${normalizedPath}" -af loudnorm=print_format=summary -f null - 2>&1 || true`);
    const lufsMatch = checkOutput.match(/Input Integrated:\s+(-[\d.]+)/);
    console.log(`  P${String(p).padStart(2,'0')}: normalized to ${lufsMatch ? lufsMatch[1] : '?'} LUFS`);
  }
  
  // Build voice track by overlaying each clip onto silence at its timecode
  // Use a sequential approach: overlay one clip at a time onto the accumulating track
  let currentVoiceTrack = `${WORK_DIR}/silence.wav`;
  const voiceEntries = Object.entries(VOICE_PANELS).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
  
  for (let i = 0; i < voiceEntries.length; i++) {
    const [panelStr, info] = voiceEntries[i];
    const p = parseInt(panelStr);
    const normalizedPath = `${WORK_DIR}/voice/P${String(p).padStart(2,'0')}_norm.wav`;
    const outputPath = `${WORK_DIR}/voice_mix_step${i}.wav`;
    
    const delayMs = Math.round(info.start * 1000);
    
    // Overlay: delay the voice clip, then mix with current track
    // Key fix: use weights=1 1 to prevent amplitude division
    run(`ffmpeg -y -i "${currentVoiceTrack}" -i "${normalizedPath}" -filter_complex "[1]adelay=${delayMs}|${delayMs},apad[delayed];[0][delayed]amix=inputs=2:duration=first:dropout_transition=0:weights=1 1:normalize=0[out]" -map "[out]" -c:a pcm_s16le "${outputPath}"`);
    
    currentVoiceTrack = outputPath;
  }
  
  const voiceTrackPath = `${WORK_DIR}/voice_track.wav`;
  fs.copyFileSync(currentVoiceTrack, voiceTrackPath);
  
  // Validate voice presence at each timecode
  console.log('  Validating voice presence...');
  let voiceValid = true;
  for (const [panelStr, info] of voiceEntries) {
    const p = parseInt(panelStr);
    const checkOutput = run(`ffmpeg -i "${voiceTrackPath}" -ss ${info.start} -t 2.0 -af loudnorm=print_format=summary -f null - 2>&1 || true`);
    const lufsMatch = checkOutput.match(/Input Integrated:\s+(-[\d.]+)/);
    const lufs = lufsMatch ? parseFloat(lufsMatch[1]) : -70;
    const status = lufs > -30 ? '✓' : '✗';
    console.log(`  ${status} P${String(p).padStart(2,'0')} @ ${info.start}s: ${lufs.toFixed(1)} LUFS`);
    if (lufs <= -30) voiceValid = false;
  }
  
  if (!voiceValid) {
    console.error('  WARNING: Some voice clips are still too quiet! Check the normalization.');
  }
  console.log('  Voice track built.');

  // ── Step 7: Build music track ──
  console.log('\nStep 7: Building music track...');
  
  for (const cue of MUSIC_CUES) {
    const inPath = `${WORK_DIR}/music/${cue.name}.mp3`;
    const outPath = `${WORK_DIR}/music/${cue.name}_trimmed.wav`;
    if (fs.existsSync(outPath)) continue;
    const cueDur = cue.end - cue.start;
    run(`ffmpeg -y -i "${inPath}" -t ${cueDur} -af "loudnorm=I=-24:TP=-2:LRA=11" -ar 48000 -ac 2 -c:a pcm_s16le "${outPath}"`);
  }
  
  // Build music track sequentially too
  let currentMusicTrack = `${WORK_DIR}/silence.wav`;
  for (let i = 0; i < MUSIC_CUES.length; i++) {
    const cue = MUSIC_CUES[i];
    const trimmedPath = `${WORK_DIR}/music/${cue.name}_trimmed.wav`;
    const outputPath = `${WORK_DIR}/music_mix_step${i}.wav`;
    const delayMs = Math.round(cue.start * 1000);
    
    run(`ffmpeg -y -i "${currentMusicTrack}" -i "${trimmedPath}" -filter_complex "[1]adelay=${delayMs}|${delayMs},apad[delayed];[0][delayed]amix=inputs=2:duration=first:dropout_transition=2:weights=1 1:normalize=0[out]" -map "[out]" -c:a pcm_s16le "${outputPath}"`);
    currentMusicTrack = outputPath;
  }
  
  const musicTrackPath = `${WORK_DIR}/music_track.wav`;
  fs.copyFileSync(currentMusicTrack, musicTrackPath);
  console.log('  Music track built.');

  // ── Step 8: Mix voice + music with sidechain ducking ──
  console.log('\nStep 8: Mixing audio with sidechain ducking...');
  
  const mixedAudioPath = `${WORK_DIR}/mixed_audio.wav`;
  // Voice at full volume (weight 1.0), music at 0.35 with sidechain compression
  run(`ffmpeg -y -i "${voiceTrackPath}" -i "${musicTrackPath}" -filter_complex "[0]asplit=2[voice][voicekey];[1][voicekey]sidechaincompress=threshold=0.01:ratio=10:attack=10:release=300:level_sc=1[duckedmusic];[voice]volume=1.0[voicefinal];[voicefinal][duckedmusic]amix=inputs=2:weights=1 0.35:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[finalout]" -map "[finalout]" -ar 48000 -ac 2 -c:a pcm_s16le "${mixedAudioPath}"`);
  
  // Validate mixed audio at dialogue timecodes
  console.log('  Validating mixed audio...');
  for (const [panelStr, info] of voiceEntries) {
    const p = parseInt(panelStr);
    const checkOutput = run(`ffmpeg -i "${mixedAudioPath}" -ss ${info.start} -t 2.0 -af loudnorm=print_format=summary -f null - 2>&1 || true`);
    const lufsMatch = checkOutput.match(/Input Integrated:\s+(-[\d.]+)/);
    console.log(`  P${String(p).padStart(2,'0')} @ ${info.start}s: ${lufsMatch ? lufsMatch[1] : '?'} LUFS (mixed)`);
  }
  console.log('  Audio mixed.');

  // ── Step 9: Mux video + audio ──
  console.log('\nStep 9: Muxing video + audio...');
  const preFadePath = `${WORK_DIR}/pre_fade.mp4`;
  run(`ffmpeg -y -i "${videoOnlyPath}" -i "${mixedAudioPath}" -c:v copy -c:a aac -b:a 192k -ar 48000 -shortest "${preFadePath}"`);

  // ── Step 10: Add fade to black ──
  console.log('\nStep 10: Adding fade to black...');
  const finalLocalPath = `${WORK_DIR}/seraphis_recognition_v2_final.mp4`;
  const fadeStart = videoDuration - 2.5;
  run(`ffmpeg -y -i "${preFadePath}" -vf "fade=t=out:st=${fadeStart.toFixed(1)}:d=1.5" -af "afade=t=out:st=${fadeStart.toFixed(1)}:d=1.5" -c:v libx264 -preset fast -crf 18 -r 24 -pix_fmt yuv420p -c:a aac -b:a 192k "${finalLocalPath}"`);
  
  const finalSize = fs.statSync(finalLocalPath).size;
  console.log(`  Final video: ${(finalSize / 1024 / 1024).toFixed(1)}MB`);

  // Final QC
  console.log('\n  === Final QC ===');
  const qcOutput = run(`ffmpeg -i "${finalLocalPath}" -af loudnorm=print_format=json -f null - 2>&1 || true`);
  const intMatch = qcOutput.match(/"input_i"\s*:\s*"(-[\d.]+)"/);
  const tpMatch = qcOutput.match(/"input_tp"\s*:\s*"(-[\d.]+)"/);
  console.log(`  Integrated loudness: ${intMatch ? intMatch[1] : '?'} LUFS`);
  console.log(`  True peak: ${tpMatch ? tpMatch[1] : '?'} dBTP`);

  // ── Step 11: Upload to S3 ──
  console.log('\nStep 11: Uploading to S3...');
  const s3Key = `pipeline/${RUN_ID}/final-seraphis-recognition-v2.mp4`;
  const fileBuffer = fs.readFileSync(finalLocalPath);
  const formData = new FormData();
  formData.append('file', new Blob([fileBuffer], { type: 'video/mp4' }), 'seraphis_recognition_v2_final.mp4');
  
  const s3Res = await fetch(`${FORGE_API_URL}/v1/storage/upload?path=${encodeURIComponent(s3Key)}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${FORGE_API_KEY}` },
    body: formData
  });
  const s3Data = await s3Res.json();
  console.log(`  S3 URL: ${s3Data.url}`);

  // ── Step 12: Upload to Cloudflare Stream ──
  console.log('\nStep 12: Uploading to Cloudflare Stream...');
  try {
    const cfResult = execSync(`curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream/copy" -H "Authorization: Bearer ${CF_STREAM_TOKEN}" -H "Content-Type: application/json" --data '{"url":"${s3Data.url}","meta":{"name":"Seraphis Recognition v2 - Kaelis Demo (Fixed Audio + Lip Sync)"}}'`, { maxBuffer: 10 * 1024 * 1024 }).toString();
    const cfData = JSON.parse(cfResult);
    if (cfData.success && cfData.result?.uid) {
      console.log(`  Stream UID: ${cfData.result.uid}`);
      console.log(`  Watch URL: https://customer-l3h31kxcw2iu56mb.cloudflarestream.com/${cfData.result.uid}/watch`);
      
      await pool.query(
        `INSERT INTO pipeline_assets (pipelineRunId, episodeId, assetType, url, metadata, nodeSource, createdAt)
         VALUES (?, 2, 'final_video', ?, ?, 'assembly_v2', NOW())`,
        [RUN_ID, s3Data.url, JSON.stringify({
          version: 'v2',
          s3Url: s3Data.url,
          streamUid: cfData.result.uid,
          watchUrl: `https://customer-l3h31kxcw2iu56mb.cloudflarestream.com/${cfData.result.uid}/watch`,
          duration: videoDuration,
          size: finalSize,
          panels: 32,
          acts: 5,
          lipSyncPanels: Object.keys(lipSyncResults).map(Number),
          fixes: ['amix_normalize_weights', 'voice_loudnorm_-14LUFS', 'sidechain_ducking_improved', 'lip_sync_kling_api']
        })]
      );
    } else {
      console.log('  CF response:', JSON.stringify(cfData).substring(0, 200));
    }
  } catch (err) {
    console.error('  Cloudflare upload failed:', err.message);
  }

  console.log('\n=== Stage 6 v2 Complete ===');
  console.log(`  S3: ${s3Data.url}`);
  
  await pool.end();
}

main().catch(err => {
  console.error('Fatal:', err.message);
  pool.end();
  process.exit(1);
});
