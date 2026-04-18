/**
 * Seraphis Recognition — Stage 6: Final Assembly
 * 
 * 32 panels, 5 acts, 4-bus audio, aspect ratio changes, hard cuts
 * Target: 1080p 24fps H.264 MP4, stereo 48kHz AAC, EBU R128 -16 LUFS
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { execSync, exec } from 'child_process';
import fs from 'fs';
import path from 'path';

dotenv.config();

const pool = mysql.createPool(process.env.DATABASE_URL);
const FORGE_API_URL = process.env.BUILT_IN_FORGE_API_URL;
const FORGE_API_KEY = process.env.BUILT_IN_FORGE_API_KEY;
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_STREAM_TOKEN = process.env.CLOUDFLARE_STREAM_TOKEN;

const WORK_DIR = '/tmp/seraphis-assembly';
const RUN_ID = 90003;

// Panel durations from the spec (in seconds)
const PANEL_DURATIONS = {
  1: 3.0, 2: 3.5, 3: 3.0, 4: 2.5, 5: 3.5, 6: 4.5,     // Act 1: 20s
  7: 2.5, 8: 2.5, 9: 3.0, 10: 3.0, 11: 2.5, 12: 5.0, 13: 5.5, 14: 6.0,  // Act 2: 30s
  15: 3.5, 16: 3.0, 17: 3.5, 18: 5.0, 19: 3.5, 20: 3.0, 21: 4.0, 22: 4.5,  // Act 3: 30s
  23: 4.0, 24: 3.0, 25: 4.0, 26: 3.0, 27: 7.0, 28: 4.0, 29: 5.0,  // Act 4: 30s
  30: 3.5, 31: 4.0, 32: 2.5   // Act 5: 10s
};

// Voice placement: panel number -> timecode offset in seconds
const VOICE_PANELS = {
  4: { start: 9.5, panelId: 60004 },   // Ilyra: "Team two by two"
  5: { start: 12.0, panelId: 60005 },  // Ilyra: "Weapons hot"
  11: { start: 31.0, panelId: 60011 }, // Ilyra: "Vern, hold here"
  30: { start: 110.0, panelId: 60030 }, // Comms: "Termination order confirmed"
  31: { start: 113.5, panelId: 60031 }  // Kaelis: "I remember."
};

// Music cue placement
const MUSIC_CUES = [
  { name: 'tactical_percussion', start: 0, end: 50 },
  { name: 'rising_strings', start: 50, end: 94 },
  { name: 'crystal_drone', start: 94, end: 120 }
];

// Aspect ratio: Acts 3-4 use 2.39:1 (P15-P29), rest 16:9
const LETTERBOX_PANELS = new Set([15,16,17,18,19,20,21,22,23,24,25,26,27,28,29]);

function run(cmd) {
  console.log(`  $ ${cmd.substring(0, 120)}...`);
  try {
    execSync(cmd, { stdio: 'pipe', maxBuffer: 50 * 1024 * 1024 });
  } catch (err) {
    console.error(`  FAILED: ${err.stderr?.toString().substring(0, 300)}`);
    throw err;
  }
}

async function main() {
  console.log('\n=== Seraphis Stage 6: Final Assembly ===\n');
  
  // Setup
  fs.mkdirSync(`${WORK_DIR}/clips`, { recursive: true });
  fs.mkdirSync(`${WORK_DIR}/voice`, { recursive: true });
  fs.mkdirSync(`${WORK_DIR}/music`, { recursive: true });
  fs.mkdirSync(`${WORK_DIR}/trimmed`, { recursive: true });

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
  
  // Map panel IDs to panel numbers
  const panelIdToNum = {};
  for (let i = 0; i < videoAssets.length; i++) {
    panelIdToNum[videoAssets[i].panelId] = i + 1;
  }

  // ── Step 2: Download all assets ──
  console.log('\nStep 2: Downloading assets...');
  
  // Download video clips
  for (const asset of videoAssets) {
    const num = panelIdToNum[asset.panelId];
    const outPath = `${WORK_DIR}/clips/P${String(num).padStart(2,'0')}.mp4`;
    if (fs.existsSync(outPath)) { continue; }
    console.log(`  Downloading P${String(num).padStart(2,'0')} video...`);
    run(`curl -sL -o "${outPath}" "${asset.url}"`);
  }
  
  // Download voice clips
  for (const asset of voiceAssets) {
    const num = panelIdToNum[asset.panelId];
    const outPath = `${WORK_DIR}/voice/P${String(num).padStart(2,'0')}.mp3`;
    if (fs.existsSync(outPath)) { continue; }
    console.log(`  Downloading P${String(num).padStart(2,'0')} voice...`);
    run(`curl -sL -o "${outPath}" "${asset.url}"`);
  }
  
  // Download music cues
  for (const asset of musicAssets) {
    const meta = typeof asset.metadata === 'string' ? JSON.parse(asset.metadata) : asset.metadata;
    const outPath = `${WORK_DIR}/music/${meta.name}.mp3`;
    if (fs.existsSync(outPath)) { continue; }
    console.log(`  Downloading ${meta.name}...`);
    run(`curl -sL -o "${outPath}" "${asset.url}"`);
  }
  
  console.log('  All assets downloaded.');

  // ── Step 3: Trim each video clip to spec duration ──
  console.log('\nStep 3: Trimming clips to spec durations...');
  for (let p = 1; p <= 32; p++) {
    const dur = PANEL_DURATIONS[p];
    const inPath = `${WORK_DIR}/clips/P${String(p).padStart(2,'0')}.mp4`;
    const outPath = `${WORK_DIR}/trimmed/P${String(p).padStart(2,'0')}.mp4`;
    if (fs.existsSync(outPath)) { continue; }
    
    // For letterbox panels (2.39:1), add black bars
    if (LETTERBOX_PANELS.has(p)) {
      // Crop to 2.39:1 then pad back to 16:9 with black bars
      run(`ffmpeg -y -i "${inPath}" -t ${dur} -vf "crop=iw:iw/2.39,pad=iw:iw*9/16:(ow-iw)/2:(oh-ih)/2:black" -c:v libx264 -preset fast -crf 18 -r 24 -an "${outPath}"`);
    } else {
      run(`ffmpeg -y -i "${inPath}" -t ${dur} -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black" -c:v libx264 -preset fast -crf 18 -r 24 -an "${outPath}"`);
    }
  }
  console.log('  All clips trimmed.');

  // ── Step 4: Concatenate all video clips with hard cuts ──
  console.log('\nStep 4: Concatenating video clips (hard cuts)...');
  
  // Create concat file
  let concatList = '';
  for (let p = 1; p <= 32; p++) {
    concatList += `file '${WORK_DIR}/trimmed/P${String(p).padStart(2,'0')}.mp4'\n`;
  }
  fs.writeFileSync(`${WORK_DIR}/concat.txt`, concatList);
  
  const videoOnlyPath = `${WORK_DIR}/video_only.mp4`;
  if (!fs.existsSync(videoOnlyPath)) {
    run(`ffmpeg -y -f concat -safe 0 -i "${WORK_DIR}/concat.txt" -c:v libx264 -preset fast -crf 18 -r 24 -pix_fmt yuv420p "${videoOnlyPath}"`);
  }
  
  // Check duration
  const durStr = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoOnlyPath}"`).toString().trim();
  console.log(`  Video duration: ${parseFloat(durStr).toFixed(1)}s`);

  // ── Step 5: Build voice track ──
  console.log('\nStep 5: Building voice track...');
  const videoDuration = parseFloat(durStr);
  
  // Create silent base track
  run(`ffmpeg -y -f lavfi -i anullsrc=r=48000:cl=stereo -t ${videoDuration} -c:a pcm_s16le "${WORK_DIR}/silence.wav"`);
  
  // Normalize each voice clip and convert to wav
  for (const [panelStr, info] of Object.entries(VOICE_PANELS)) {
    const p = parseInt(panelStr);
    const voicePath = `${WORK_DIR}/voice/P${String(p).padStart(2,'0')}.mp3`;
    const wavPath = `${WORK_DIR}/voice/P${String(p).padStart(2,'0')}.wav`;
    if (fs.existsSync(wavPath)) continue;
    
    // Normalize voice to -20 LUFS (spec target), boost volume
    run(`ffmpeg -y -i "${voicePath}" -af "loudnorm=I=-16:TP=-1.5:LRA=11,volume=1.5" -ar 48000 -ac 2 -c:a pcm_s16le "${wavPath}"`);
  }
  
  // Build voice mix with amerge — place each voice at its timecode
  let voiceFilterComplex = '';
  let voiceInputs = `-i "${WORK_DIR}/silence.wav" `;
  let inputIdx = 1;
  const voiceEntries = Object.entries(VOICE_PANELS);
  
  for (const [panelStr, info] of voiceEntries) {
    const p = parseInt(panelStr);
    const wavPath = `${WORK_DIR}/voice/P${String(p).padStart(2,'0')}.wav`;
    voiceInputs += `-i "${wavPath}" `;
    voiceFilterComplex += `[${inputIdx}]adelay=${Math.round(info.start * 1000)}|${Math.round(info.start * 1000)}[v${p}];`;
    inputIdx++;
  }
  
  // Mix all voice clips onto the silent base
  voiceFilterComplex += `[0]`;
  for (const [panelStr] of voiceEntries) {
    voiceFilterComplex += `[v${parseInt(panelStr)}]`;
  }
  voiceFilterComplex += `amix=inputs=${voiceEntries.length + 1}:duration=first:dropout_transition=0[voiceout]`;
  
  const voiceTrackPath = `${WORK_DIR}/voice_track.wav`;
  if (!fs.existsSync(voiceTrackPath)) {
    run(`ffmpeg -y ${voiceInputs} -filter_complex "${voiceFilterComplex}" -map "[voiceout]" -c:a pcm_s16le "${voiceTrackPath}"`);
  }
  console.log('  Voice track built.');

  // ── Step 6: Build music track ──
  console.log('\nStep 6: Building music track...');
  
  // Trim each music cue to its segment and normalize to -24 LUFS
  for (const cue of MUSIC_CUES) {
    const inPath = `${WORK_DIR}/music/${cue.name}.mp3`;
    const outPath = `${WORK_DIR}/music/${cue.name}_trimmed.wav`;
    if (fs.existsSync(outPath)) continue;
    
    const cueDur = cue.end - cue.start;
    // Normalize music to -24 LUFS (quieter than voice)
    run(`ffmpeg -y -i "${inPath}" -t ${cueDur} -af "loudnorm=I=-24:TP=-2:LRA=11" -ar 48000 -ac 2 -c:a pcm_s16le "${outPath}"`);
  }
  
  // Concatenate music cues with crossfades
  const musicTrackPath = `${WORK_DIR}/music_track.wav`;
  if (!fs.existsSync(musicTrackPath)) {
    // Place each cue at its start time on a silent base
    let musicFilter = '';
    let musicInputs = `-i "${WORK_DIR}/silence.wav" `;
    let mIdx = 1;
    
    for (const cue of MUSIC_CUES) {
      musicInputs += `-i "${WORK_DIR}/music/${cue.name}_trimmed.wav" `;
      musicFilter += `[${mIdx}]adelay=${Math.round(cue.start * 1000)}|${Math.round(cue.start * 1000)}[m${mIdx}];`;
      mIdx++;
    }
    
    musicFilter += `[0]`;
    for (let i = 1; i < mIdx; i++) {
      musicFilter += `[m${i}]`;
    }
    musicFilter += `amix=inputs=${mIdx}:duration=first:dropout_transition=2[musicout]`;
    
    run(`ffmpeg -y ${musicInputs} -filter_complex "${musicFilter}" -map "[musicout]" -c:a pcm_s16le "${musicTrackPath}"`);
  }
  console.log('  Music track built.');

  // ── Step 7: Mix voice + music with sidechain ducking ──
  console.log('\nStep 7: Mixing audio with sidechain ducking...');
  
  const mixedAudioPath = `${WORK_DIR}/mixed_audio.wav`;
  if (!fs.existsSync(mixedAudioPath)) {
    // Voice at full volume, music ducked when voice is present
    // Split voice for sidechain detection, compress music when voice is active
    run(`ffmpeg -y -i "${voiceTrackPath}" -i "${musicTrackPath}" -filter_complex "[0]asplit=2[voice][voicekey];[1][voicekey]sidechaincompress=threshold=0.015:ratio=8:attack=20:release=200:level_sc=1[duckedmusic];[voice][duckedmusic]amix=inputs=2:weights=1 0.4:duration=first:dropout_transition=0,loudnorm=I=-16:TP=-1.5:LRA=11[finalout]" -map "[finalout]" -ar 48000 -ac 2 -c:a pcm_s16le "${mixedAudioPath}"`);
  }
  console.log('  Audio mixed with ducking.');

  // ── Step 8: Mux video + audio ──
  console.log('\nStep 8: Muxing video + audio...');
  
  const preFadePath = `${WORK_DIR}/pre_fade.mp4`;
  if (!fs.existsSync(preFadePath)) {
    run(`ffmpeg -y -i "${videoOnlyPath}" -i "${mixedAudioPath}" -c:v copy -c:a aac -b:a 192k -ar 48000 -shortest "${preFadePath}"`);
  }

  // ── Step 9: Add fade to black at the end (P32 spec) ──
  console.log('\nStep 9: Adding fade to black at end...');
  
  const finalLocalPath = `${WORK_DIR}/seraphis_recognition_final.mp4`;
  if (!fs.existsSync(finalLocalPath)) {
    const fadeStart = videoDuration - 2.5; // Last panel is 2.5s, fade over last 1.5s
    run(`ffmpeg -y -i "${preFadePath}" -vf "fade=t=out:st=${fadeStart.toFixed(1)}:d=1.5" -af "afade=t=out:st=${fadeStart.toFixed(1)}:d=1.5" -c:v libx264 -preset fast -crf 18 -r 24 -pix_fmt yuv420p -c:a aac -b:a 192k "${finalLocalPath}"`);
  }
  
  const finalSize = fs.statSync(finalLocalPath).size;
  console.log(`  Final video: ${(finalSize / 1024 / 1024).toFixed(1)}MB`);

  // ── Step 10: Upload to S3 ──
  console.log('\nStep 10: Uploading to S3...');
  
  const s3Key = `pipeline/${RUN_ID}/final-seraphis-recognition.mp4`;
  const fileBuffer = fs.readFileSync(finalLocalPath);
  
  const formData = new FormData();
  formData.append('file', new Blob([fileBuffer], { type: 'video/mp4' }), 'seraphis_recognition_final.mp4');
  
  const s3Res = await fetch(`${FORGE_API_URL}/v1/storage/upload?path=${encodeURIComponent(s3Key)}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${FORGE_API_KEY}` },
    body: formData
  });
  const s3Data = await s3Res.json();
  console.log(`  S3 URL: ${s3Data.url}`);

  // ── Step 11: Upload to Cloudflare Stream ──
  console.log('\nStep 11: Uploading to Cloudflare Stream...');
  
  try {
    const cfResult = execSync(`curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream/copy" -H "Authorization: Bearer ${CF_STREAM_TOKEN}" -H "Content-Type: application/json" --data '{"url":"${s3Data.url}","meta":{"name":"Seraphis Recognition - Kaelis Demo"}}'`, { maxBuffer: 10 * 1024 * 1024 }).toString();
    const cfData = JSON.parse(cfResult);
    if (cfData.success && cfData.result?.uid) {
      console.log(`  Stream UID: ${cfData.result.uid}`);
      console.log(`  Watch URL: https://customer-l3h31kxcw2iu56mb.cloudflarestream.com/${cfData.result.uid}/watch`);
      
      // Store in pipeline_assets
      await pool.query(
        `INSERT INTO pipeline_assets (pipelineRunId, episodeId, assetType, url, metadata, nodeSource, createdAt)
         VALUES (?, 2, 'final_video', ?, ?, 'assembly', NOW())`,
        [RUN_ID, s3Data.url, JSON.stringify({
          s3Url: s3Data.url,
          streamUid: cfData.result.uid,
          watchUrl: `https://customer-l3h31kxcw2iu56mb.cloudflarestream.com/${cfData.result.uid}/watch`,
          duration: videoDuration,
          size: finalSize,
          panels: 32,
          acts: 5
        })]
      );
    } else {
      console.log('  Cloudflare upload response:', JSON.stringify(cfData).substring(0, 200));
    }
  } catch (err) {
    console.error('  Cloudflare upload failed:', err.message);
    console.log('  S3 URL is still available for direct playback.');
  }

  console.log('\n=== Stage 6 Complete ===');
  console.log(`  S3: ${s3Data.url}`);
  
  await pool.end();
}

main().catch(err => {
  console.error('Fatal:', err.message);
  pool.end();
  process.exit(1);
});
