/**
 * Seraphis Recognition — Lip Sync Fix
 * 
 * Fixes: sound_end_time was exceeding actual audio duration.
 * Solution: Use floor(actual_duration_ms) - 1 for sound_end_time.
 * Also: pad to 2.5s (not 2.1s) to give more margin.
 * Also: convert padded audio to WAV for more accurate duration reporting.
 * 
 * After lip sync, re-trims dialogue panels and re-assembles the final video.
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

const PANEL_DURATIONS = {
  1: 3.0, 2: 3.5, 3: 3.0, 4: 2.5, 5: 3.5, 6: 4.5,
  7: 2.5, 8: 2.5, 9: 3.0, 10: 3.0, 11: 2.5, 12: 5.0, 13: 5.5, 14: 6.0,
  15: 3.5, 16: 3.0, 17: 3.5, 18: 5.0, 19: 3.5, 20: 3.0, 21: 4.0, 22: 4.5,
  23: 4.0, 24: 3.0, 25: 4.0, 26: 3.0, 27: 7.0, 28: 4.0, 29: 5.0,
  30: 3.5, 31: 4.0, 32: 2.5
};

const VOICE_PANELS = {
  4:  { start: 9.5,   panelId: 60004, character: 'Ilyra',  line: 'Team two by two' },
  5:  { start: 12.0,  panelId: 60005, character: 'Ilyra',  line: 'Weapons hot' },
  11: { start: 31.0,  panelId: 60011, character: 'Ilyra',  line: 'Vern, hold here' },
  30: { start: 110.0, panelId: 60030, character: 'Comms',  line: 'Termination order confirmed' },
  31: { start: 113.5, panelId: 60031, character: 'Kaelis', line: 'I remember.' }
};

const MUSIC_CUES = [
  { name: 'tactical_percussion', start: 0, end: 50 },
  { name: 'rising_strings', start: 50, end: 94 },
  { name: 'crystal_drone', start: 94, end: 120 }
];

const LETTERBOX_PANELS = new Set([15,16,17,18,19,20,21,22,23,24,25,26,27,28,29]);

function run(cmd) {
  console.log(`  $ ${cmd.substring(0, 150)}...`);
  try {
    return execSync(cmd, { stdio: 'pipe', maxBuffer: 50 * 1024 * 1024 }).toString();
  } catch (err) {
    console.error(`  FAILED: ${err.stderr?.toString().substring(0, 500)}`);
    throw err;
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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
    throw new Error(`Kling ${method} ${path}: ${res.status} ${text.substring(0, 300)}`);
  }
  return res.json();
}

async function uploadToS3(localPath, s3Key, contentType) {
  const buffer = fs.readFileSync(localPath);
  const formData = new FormData();
  formData.append('file', new Blob([buffer], { type: contentType }), path.basename(s3Key));
  const res = await fetch(`${FORGE_API_URL}/v1/storage/upload?path=${encodeURIComponent(s3Key)}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${FORGE_API_KEY}` },
    body: formData
  });
  const data = await res.json();
  return data.url;
}

async function main() {
  console.log('\n=== Seraphis Lip Sync Fix + Re-Assembly ===\n');
  
  fs.mkdirSync(`${WORK_DIR}/lipsync`, { recursive: true });
  
  const lipSyncResults = {};
  
  for (const [panelStr, info] of Object.entries(VOICE_PANELS)) {
    const p = parseInt(panelStr);
    const lsPath = `${WORK_DIR}/lipsync/P${String(p).padStart(2,'0')}_lipsync.mp4`;
    
    if (fs.existsSync(lsPath)) {
      console.log(`P${String(p).padStart(2,'0')}: Already lip-synced, skipping.`);
      lipSyncResults[p] = lsPath;
      continue;
    }
    
    console.log(`\nP${String(p).padStart(2,'0')} [${info.character}]: "${info.line}"`);
    
    const clipPath = `${WORK_DIR}/clips/P${String(p).padStart(2,'0')}.mp4`;
    
    // Upload clip to S3
    const clipUrl = await uploadToS3(clipPath, `pipeline/${RUN_ID}/lipsync/P${String(p).padStart(2,'0')}_clip_v2.mp4`, 'video/mp4');
    console.log(`  Clip uploaded: ${clipUrl.substring(0, 60)}...`);
    
    // Create padded WAV (more reliable duration than MP3)
    const voiceMp3 = `${WORK_DIR}/voice/P${String(p).padStart(2,'0')}.mp3`;
    const voicePaddedWav = `${WORK_DIR}/lipsync/P${String(p).padStart(2,'0')}_padded.wav`;
    
    // Pad to exactly 3.0 seconds (well above 2s minimum, gives plenty of margin)
    run(`ffmpeg -y -i "${voiceMp3}" -af "apad=whole_dur=3" -t 3.0 -ar 44100 -ac 1 -c:a pcm_s16le "${voicePaddedWav}"`);
    
    // Convert to MP3 for upload (Kling accepts mp3/wav/m4a/aac)
    const voicePaddedMp3 = `${WORK_DIR}/lipsync/P${String(p).padStart(2,'0')}_padded.mp3`;
    run(`ffmpeg -y -i "${voicePaddedWav}" -c:a libmp3lame -b:a 128k "${voicePaddedMp3}"`);
    
    // Get exact duration of the padded MP3
    const paddedDurStr = run(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${voicePaddedMp3}"`).trim();
    const paddedDurMs = Math.floor(parseFloat(paddedDurStr) * 1000) - 50; // 50ms safety margin
    console.log(`  Padded voice: ${parseFloat(paddedDurStr).toFixed(2)}s, using end_time=${paddedDurMs}ms`);
    
    // Upload padded voice
    const voiceUrl = await uploadToS3(voicePaddedMp3, `pipeline/${RUN_ID}/lipsync/P${String(p).padStart(2,'0')}_voice_v2.mp3`, 'audio/mpeg');
    
    try {
      // Step A: Identify face
      console.log(`  Identifying face...`);
      const identifyRes = await klingRequest('POST', '/v1/videos/identify-face', {
        video_url: clipUrl
      });
      
      if (identifyRes.code !== 0) {
        console.log(`  ⚠ No face detected (code ${identifyRes.code}): ${identifyRes.message}`);
        continue;
      }
      
      const sessionId = identifyRes.data?.session_id;
      const faces = identifyRes.data?.face_data || [];
      console.log(`  Session: ${sessionId}, Faces: ${faces.length}`);
      
      if (faces.length === 0) {
        console.log(`  ⚠ No faces, skipping`);
        continue;
      }
      
      // For P30/P31 two-shot, pick the face that matches the speaking character
      // P30: Comms (use face 0 - Ilyra since she has the earpiece)
      // P31: Kaelis speaks - pick face that is more to the right (Kaelis is frame-right per spec)
      let faceId = faces[0].face_id;
      if (faces.length > 1 && (p === 31)) {
        // Kaelis is frame-right per spec, so pick the second face if available
        faceId = faces[1]?.face_id || faces[0].face_id;
        console.log(`  Using face_id=${faceId} for Kaelis (frame-right)`);
      }
      
      console.log(`  Face: ${faceId}, visible ${faces[0].start_time}ms-${faces[0].end_time}ms`);
      
      // Step B: Create lip sync task
      console.log(`  Creating lip sync task...`);
      const lipSyncRes = await klingRequest('POST', '/v1/videos/advanced-lip-sync', {
        session_id: sessionId,
        face_choose: [{
          face_id: String(faceId),
          sound_file: voiceUrl,
          sound_start_time: 0,
          sound_end_time: paddedDurMs,
          sound_insert_time: 0,
          sound_volume: 2,
          original_audio_volume: 0
        }]
      });
      
      if (lipSyncRes.code !== 0) {
        console.log(`  ⚠ Lip sync creation failed: ${lipSyncRes.message}`);
        continue;
      }
      
      const taskId = lipSyncRes.data?.task_id;
      console.log(`  Task: ${taskId}`);
      
      // Step C: Poll
      let attempts = 0;
      let lsResult = null;
      
      while (attempts < 60) {
        await sleep(5000);
        attempts++;
        
        const statusRes = await klingRequest('GET', `/v1/videos/advanced-lip-sync/${taskId}`);
        const status = statusRes.data?.task_status;
        
        if (status === 'succeed') {
          const videos = statusRes.data?.task_result?.videos || [];
          if (videos.length > 0) {
            lsResult = videos[0];
            console.log(`  ✓ Complete (${attempts * 5}s)`);
          }
          break;
        } else if (status === 'failed') {
          console.log(`  ✗ Failed: ${statusRes.data?.task_status_msg}`);
          break;
        }
        
        if (attempts % 6 === 0) console.log(`  ... processing (${attempts * 5}s)`);
      }
      
      if (lsResult) {
        run(`curl -sL -o "${lsPath}" "${lsResult.url}"`);
        lipSyncResults[p] = lsPath;
        console.log(`  ✓ Downloaded lip-synced clip`);
      }
    } catch (err) {
      console.log(`  ⚠ Error: ${err.message}`);
    }
  }
  
  const lsCount = Object.keys(lipSyncResults).length;
  console.log(`\nLip sync results: ${lsCount}/${Object.keys(VOICE_PANELS).length} panels`);
  
  if (lsCount === 0) {
    console.log('No lip sync panels succeeded. Proceeding with audio-only fix (v2 already has audible dialogue).');
    console.log('The v2 video with fixed audio is already uploaded and ready.');
    await pool.end();
    return;
  }
  
  // Re-trim only the lip-synced panels
  console.log('\nRe-trimming lip-synced panels...');
  for (const [pStr, lsPath] of Object.entries(lipSyncResults)) {
    const p = parseInt(pStr);
    const dur = PANEL_DURATIONS[p];
    const outPath = `${WORK_DIR}/trimmed/P${String(p).padStart(2,'0')}.mp4`;
    
    // Remove old trimmed version
    if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
    
    if (LETTERBOX_PANELS.has(p)) {
      run(`ffmpeg -y -i "${lsPath}" -t ${dur} -vf "crop=iw:iw/2.39,pad=iw:iw*9/16:(ow-iw)/2:(oh-ih)/2:black" -c:v libx264 -preset fast -crf 18 -r 24 -an "${outPath}"`);
    } else {
      run(`ffmpeg -y -i "${lsPath}" -t ${dur} -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black" -c:v libx264 -preset fast -crf 18 -r 24 -an "${outPath}"`);
    }
  }
  
  // Re-concatenate
  console.log('\nRe-concatenating...');
  let concatList = '';
  for (let p = 1; p <= 32; p++) {
    concatList += `file '${WORK_DIR}/trimmed/P${String(p).padStart(2,'0')}.mp4'\n`;
  }
  fs.writeFileSync(`${WORK_DIR}/concat.txt`, concatList);
  
  const videoOnlyPath = `${WORK_DIR}/video_only_v3.mp4`;
  run(`ffmpeg -y -f concat -safe 0 -i "${WORK_DIR}/concat.txt" -c:v libx264 -preset fast -crf 18 -r 24 -pix_fmt yuv420p "${videoOnlyPath}"`);
  
  const durStr = run(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoOnlyPath}"`).trim();
  const videoDuration = parseFloat(durStr);
  console.log(`  Duration: ${videoDuration.toFixed(1)}s`);
  
  // Mux with existing mixed audio
  console.log('\nMuxing with fixed audio...');
  const mixedAudioPath = `${WORK_DIR}/mixed_audio.wav`;
  const preFadePath = `${WORK_DIR}/pre_fade_v3.mp4`;
  run(`ffmpeg -y -i "${videoOnlyPath}" -i "${mixedAudioPath}" -c:v copy -c:a aac -b:a 192k -ar 48000 -shortest "${preFadePath}"`);
  
  // Fade to black
  const finalPath = `${WORK_DIR}/seraphis_recognition_v3_final.mp4`;
  const fadeStart = videoDuration - 2.5;
  run(`ffmpeg -y -i "${preFadePath}" -vf "fade=t=out:st=${fadeStart.toFixed(1)}:d=1.5" -af "afade=t=out:st=${fadeStart.toFixed(1)}:d=1.5" -c:v libx264 -preset fast -crf 18 -r 24 -pix_fmt yuv420p -c:a aac -b:a 192k "${finalPath}"`);
  
  const finalSize = fs.statSync(finalPath).size;
  console.log(`  Final: ${(finalSize / 1024 / 1024).toFixed(1)}MB`);
  
  // Upload
  console.log('\nUploading to S3...');
  const s3Key = `pipeline/${RUN_ID}/final-seraphis-recognition-v3.mp4`;
  const s3Url = await uploadToS3(finalPath, s3Key, 'video/mp4');
  console.log(`  S3: ${s3Url}`);
  
  console.log('\nUploading to Cloudflare Stream...');
  try {
    const cfResult = execSync(`curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream/copy" -H "Authorization: Bearer ${CF_STREAM_TOKEN}" -H "Content-Type: application/json" --data '{"url":"${s3Url}","meta":{"name":"Seraphis Recognition v3 - Fixed Audio + Lip Sync"}}'`, { maxBuffer: 10 * 1024 * 1024 }).toString();
    const cfData = JSON.parse(cfResult);
    if (cfData.success && cfData.result?.uid) {
      console.log(`  Stream: ${cfData.result.uid}`);
      console.log(`  Watch: https://customer-l3h31kxcw2iu56mb.cloudflarestream.com/${cfData.result.uid}/watch`);
      
      await pool.query(
        `INSERT INTO pipeline_assets (pipelineRunId, episodeId, assetType, url, metadata, nodeSource, createdAt)
         VALUES (90003, 2, 'final_video', ?, ?, 'assembly', NOW())`,
        [s3Url, JSON.stringify({
          version: 'v3',
          streamUid: cfData.result.uid,
          watchUrl: `https://customer-l3h31kxcw2iu56mb.cloudflarestream.com/${cfData.result.uid}/watch`,
          lipSyncPanels: Object.keys(lipSyncResults).map(Number)
        })]
      );
    }
  } catch (err) {
    console.error('  CF error:', err.message);
  }
  
  console.log('\n=== Lip Sync Fix Complete ===');
  await pool.end();
}

main().catch(err => {
  console.error('Fatal:', err.message);
  pool.end();
  process.exit(1);
});
