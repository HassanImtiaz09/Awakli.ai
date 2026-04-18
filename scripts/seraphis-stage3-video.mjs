/**
 * Seraphis Recognition — Stage 3-4: Generate video clips for all 32 panels
 * 
 * Strategy:
 * - Kaelis panels → V3 Omni with element_list for character consistency
 * - Non-Kaelis panels → V2.6 image-to-video (cheaper)
 * - Dialogue panels → V3 Omni with lip sync prompt
 * - Batch size: 5 concurrent tasks (Kling rate limit)
 * - Duration: per-panel from spec timecodes
 */

import mysql from 'mysql2/promise';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pool = mysql.createPool(process.env.DATABASE_URL);
const KLING_ACCESS_KEY = process.env.KLING_ACCESS_KEY;
const KLING_SECRET_KEY = process.env.KLING_SECRET_KEY;
const KAELIS_ELEMENT_ID = 308485829798538;

// ─── Kling JWT ───
function generateKlingToken() {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    iss: KLING_ACCESS_KEY, exp: now + 1800, nbf: now - 5, iat: now
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', KLING_SECRET_KEY)
    .update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

async function klingRequest(method, path, body) {
  const token = generateKlingToken();
  const res = await fetch(`https://api-singapore.klingai.com${path}`, {
    method, headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Kling ${method} ${path}: ${res.status} ${text}`);
  }
  return res.json();
}

// ─── Panel classification ───
// Kaelis panels (use Omni with element)
const KAELIS_PANELS = new Set([3,6,9,12,13,14,15,17,19,21,22,23,24,25,26,27,30,31,32]);
// Dialogue panels (use Omni with lip sync)
const DIALOGUE_PANELS = {
  4: { char: 'Ilyra', line: 'Team two by two' },
  5: { char: 'Ilyra', line: 'Weapons hot' },
  11: { char: 'Ilyra', line: 'Vern, hold here' },
  30: { char: 'Comms', line: 'Termination order confirmed' },
  31: { char: 'Kaelis', line: 'I remember.' }
};

// Duration mapping from spec (seconds) - Kling supports "5" or "10"
function getKlingDuration(specDur) {
  // Kling only supports 5s or 10s for image2video, and 3-15s for omni
  if (specDur <= 5) return '5';
  return '10';
}

// For Omni, we can use the actual duration (3-15s range)
function getOmniDuration(specDur) {
  const clamped = Math.max(3, Math.min(15, Math.round(specDur)));
  return String(clamped);
}

// Panel durations from spec
const PANEL_DURATIONS = {
  1: 3.0, 2: 3.5, 3: 3.0, 4: 2.5, 5: 3.5, 6: 4.5, 7: 2.5, 8: 2.5,
  9: 3.0, 10: 3.0, 11: 2.5, 12: 5.0, 13: 5.5, 14: 6.0, 15: 3.5, 16: 3.0,
  17: 3.5, 18: 5.0, 19: 3.5, 20: 3.0, 21: 4.0, 22: 4.5, 23: 4.0, 24: 3.0,
  25: 4.0, 26: 3.0, 27: 7.0, 28: 4.0, 29: 5.0, 30: 3.5, 31: 4.0, 32: 2.5
};

// Motion prompts per panel (what should animate)
const MOTION_PROMPTS = {
  1: 'Slow forward push toward cliff station. Ocean waves crashing below. Atmospheric haze.',
  2: 'Four silhouettes descending by cable, cloaks billowing in wind. Hold wide.',
  3: 'Camera tilts from face down to hands. Fingers curl inward. Red strobe pulses.',
  4: 'Whip pan left-to-right following arm signal. Red klaxon strobes flash.',
  5: 'Tracking forward through corridor. Red strobes pulse overhead.',
  6: 'POV advancing. Gloved hands visible. Breath fog in cold air.',
  7: 'Sudden zoom-in on guard visor. Guard rounds corner with rifle.',
  8: 'Suppressed shot. Guard falls with armor clatter. Commander signals advance.',
  9: 'Lateral tracking. Kaelis walks past fallen body without looking down.',
  10: 'Concealed door opens. Muzzle flash. Whip pan following trajectory.',
  11: 'Rook hit in shoulder. Drops to knee. Pain expression.',
  12: 'Three-strike disarm sequence. Camera orbits 180 degrees. Scar flickers cyan.',
  13: 'Slow push. Kaelis hand half-raised. Fingers curling. Ilyra eyes narrowing.',
  14: 'Door releasing with hydraulic hiss. Cyan-green light spills into red corridor.',
  15: 'Kaelis silhouette at doorway. Cyan light spills around figure. Aspect change.',
  16: 'Hold on vast chamber. Small silhouette at entrance. Ocean beyond glass.',
  17: 'Dolly forward. Kaelis pace slowing. Ilyra enters behind scanning.',
  18: 'Hold on beauty shot. Crystal ocean rippling. Submerged spirals pulsing.',
  19: 'Slow push. Back of head. Hand beginning to rise toward glass.',
  20: 'Hold on Ilyra. Weapon lowering. Expression shifting.',
  21: 'Micro push-in on face. Jaw tremor. Eyes widening slightly. Scar warming cyan.',
  22: 'Hand tracking toward glass. Fingertips making contact. Ocean beyond.',
  23: 'Hold on fingertips against glass. Breath fog. Scar glowing cyan.',
  24: 'Eye extreme close-up. Pupil dilating. Ocean reflected in eye.',
  25: 'Slow pull back. Scar pulsing bright cyan. Knees buckling.',
  26: 'Push in. Kaelis sliding down glass. Hand dragging. World closing.',
  27: 'Absolute hold. Kaelis kneeling. Hands lifted, fingers curling. 7 second stillness.',
  28: 'Extreme pull back. Tiny figure at glass. Ocean fills everything. Second figure enters.',
  29: 'Track with Ilyra walking toward kneeling figure. Quiet determination.',
  30: 'Hold. Ilyra kneeling beside Kaelis. Hand on shoulder. Cyan light on faces.',
  31: 'Hold. Two-shot. Kaelis turns slightly. Hand open. Scar sustained glow.',
  32: 'Pull back. Both rising. Ilyra switches off comms. Fade to black.'
};

async function submitVideoTask(panelNum, imageUrl) {
  const specDur = PANEL_DURATIONS[panelNum];
  const isKaelis = KAELIS_PANELS.has(panelNum);
  const dialogue = DIALOGUE_PANELS[panelNum];
  const motionPrompt = MOTION_PROMPTS[panelNum] || '';
  
  // Decide: Omni (Kaelis panels) vs image2video (all others including non-Kaelis dialogue)
  if (isKaelis) {
    // Use V3 Omni with element for Kaelis panels
    let prompt = motionPrompt;
    if (dialogue && dialogue.char === 'Kaelis') {
      prompt += ` <<<element_1>>> says: "${dialogue.line}"`;
    }
    
    // Omni with image_list only supports duration 5 or 10
    const omniDur = specDur <= 5 ? '5' : '10';
    
    const body = {
      model_name: 'kling-video-o1',
      sound: (dialogue && dialogue.char === 'Kaelis') ? 'on' : 'off',
      duration: omniDur,
      mode: 'pro',
      prompt,
      image_list: [{ image_url: imageUrl, type: 'first_frame' }],
      element_list: [{ element_id: KAELIS_ELEMENT_ID }]
    };
    
    const result = await klingRequest('POST', '/v1/videos/omni-video', body);
    return { taskId: result.data.task_id, type: 'omni-video', panelNum };
  } else {
    // Use V2.6 image-to-video (cheaper)
    const body = {
      model_name: 'kling-v2-6',
      image: imageUrl,
      prompt: motionPrompt,
      negative_prompt: 'blurry, low quality, text, watermark, manga panel, screentone',
      duration: getKlingDuration(specDur),
      mode: 'pro',
      sound: 'off'
    };
    
    const result = await klingRequest('POST', '/v1/videos/image2video', body);
    return { taskId: result.data.task_id, type: 'image2video', panelNum };
  }
}

async function pollTask(taskId, type) {
  const maxWait = 12 * 60 * 1000; // 12 min
  const start = Date.now();
  let interval = 8000;
  
  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, interval));
    const result = await klingRequest('GET', `/v1/videos/${type}/${taskId}`);
    const status = result.data?.task_status;
    
    if (status === 'succeed') {
      const video = result.data.task_result?.videos?.[0];
      return { url: video?.url, duration: video?.duration, status: 'succeed' };
    }
    if (status === 'failed') {
      return { url: null, duration: null, status: 'failed', error: result.data?.task_status_msg };
    }
    
    interval = Math.min(interval * 1.3, 30000);
  }
  return { url: null, duration: null, status: 'timeout' };
}

async function main() {
  const PROJECT_ID = 1;
  const EPISODE_NUM = 2;
  
  // Get episode ID
  const [eps] = await pool.query(
    `SELECT id FROM episodes WHERE projectId = ? AND episodeNumber = ?`, [PROJECT_ID, EPISODE_NUM]
  );
  if (eps.length === 0) throw new Error('Episode 2 not found');
  const episodeId = eps[0].id;
  
  // Get all panels with images
  const [panels] = await pool.query(
    'SELECT id, panelNumber, imageUrl, dialogue FROM panels WHERE episodeId = ? ORDER BY panelNumber',
    [episodeId]
  );
  
  console.log(`\n=== Seraphis Stage 3-4: Video Generation ===`);
  console.log(`Episode ID: ${episodeId}, Panels: ${panels.length}`);
  
  // Check which panels already have video
  const [existingAssets] = await pool.query(
    `SELECT panelId, url FROM pipeline_assets WHERE episodeId = ? AND assetType = 'video_clip'`, [episodeId]
  );
  const existingVideoMap = new Map(existingAssets.map(a => [a.panelId, a.url]));
  
  // Filter panels that need video generation
  const panelsToProcess = panels.filter(p => {
    if (!p.imageUrl) {
      console.log(`  ⚠ Panel ${p.panelNumber} has no image, skipping`);
      return false;
    }
    if (existingVideoMap.has(p.id)) {
      console.log(`  ✓ Panel ${p.panelNumber} already has video, skipping`);
      return false;
    }
    return true;
  });
  
  console.log(`\nPanels to process: ${panelsToProcess.length}`);
  
  // Create a pipeline run for tracking
  const USER_ID = 301214;
  const [runResult] = await pool.query(
    `INSERT INTO pipeline_runs (projectId, episodeId, userId, status, currentNode, progress, startedAt, createdAt, updatedAt)
     VALUES (?, ?, ?, 'running', 'video_gen', 0, NOW(), NOW(), NOW())`, [PROJECT_ID, episodeId, USER_ID]
  );
  const runId = runResult.insertId;
  console.log(`Pipeline run ID: ${runId}\n`);
  
  // Process in batches of 5
  const BATCH_SIZE = 5;
  const results = [];
  let totalCost = 0;
  
  for (let i = 0; i < panelsToProcess.length; i += BATCH_SIZE) {
    const batch = panelsToProcess.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(panelsToProcess.length / BATCH_SIZE);
    
    console.log(`\n--- Batch ${batchNum}/${totalBatches} (${batch.length} panels) ---`);
    
    // Submit all tasks in this batch
    const tasks = [];
    for (const panel of batch) {
      try {
        const task = await submitVideoTask(panel.panelNumber, panel.imageUrl);
        tasks.push({ ...task, panelId: panel.id, panelNumber: panel.panelNumber });
        const tier = KAELIS_PANELS.has(panel.panelNumber) || DIALOGUE_PANELS[panel.panelNumber] ? 'Omni' : 'V2.6';
        console.log(`  ✓ P${String(panel.panelNumber).padStart(2,'0')} submitted (${tier}, task: ${task.taskId})`);
        
        // Small delay between submissions to avoid burst rate limit
        await new Promise(r => setTimeout(r, 1000));
      } catch (err) {
        console.error(`  ✗ P${String(panel.panelNumber).padStart(2,'0')} failed to submit: ${err.message}`);
        tasks.push({ taskId: null, type: null, panelId: panel.id, panelNumber: panel.panelNumber, error: err.message });
      }
    }
    
    // Poll all tasks in this batch
    console.log(`\n  Polling ${tasks.filter(t => t.taskId).length} tasks...`);
    for (const task of tasks) {
      if (!task.taskId) {
        results.push({ panelNumber: task.panelNumber, status: 'submit_failed', error: task.error });
        continue;
      }
      
      const result = await pollTask(task.taskId, task.type);
      
      if (result.status === 'succeed' && result.url) {
        // Store the video URL in pipeline_assets
        await pool.query(
          `INSERT INTO pipeline_assets (pipelineRunId, episodeId, panelId, assetType, url, metadata, nodeSource, klingModelUsed, complexityTier, costActual, createdAt)
           VALUES (?, ?, ?, 'video_clip', ?, ?, 'video_gen', ?, ?, ?, NOW())`,
          [runId, episodeId, task.panelId, result.url, JSON.stringify({
            taskId: task.taskId, type: task.type, duration: result.duration
          }),
          task.type === 'omni-video' ? 'kling-video-o1' : 'kling-v2-6',
          task.type === 'omni-video' ? 1 : 2,
          task.type === 'omni-video' ? 1.27 : 0.84]
        );
        
        const cost = task.type === 'omni-video' ? 1.27 : 0.84;
        totalCost += cost;
        
        console.log(`  ✓ P${String(task.panelNumber).padStart(2,'0')} done (${result.duration}s, $${cost.toFixed(2)})`);
        results.push({ panelNumber: task.panelNumber, status: 'succeed', url: result.url, duration: result.duration });
      } else {
        console.log(`  ✗ P${String(task.panelNumber).padStart(2,'0')} ${result.status}: ${result.error || 'unknown'}`);
        results.push({ panelNumber: task.panelNumber, status: result.status, error: result.error });
      }
    }
    
    // Update progress
    const progress = Math.round((i + batch.length) / panelsToProcess.length * 100);
    await pool.query(`UPDATE pipeline_runs SET progress = ?, updatedAt = NOW() WHERE id = ?`, [progress, runId]);
    console.log(`\n  Progress: ${progress}%`);
    
    // Wait between batches to avoid rate limit
    if (i + BATCH_SIZE < panelsToProcess.length) {
      console.log('  Waiting 10s before next batch...');
      await new Promise(r => setTimeout(r, 10000));
    }
  }
  
  // Summary
  const succeeded = results.filter(r => r.status === 'succeed').length;
  const failed = results.filter(r => r.status !== 'succeed').length;
  
  console.log(`\n=== Video Generation Summary ===`);
  console.log(`Succeeded: ${succeeded}/${results.length}`);
  console.log(`Failed: ${failed}`);
  console.log(`Estimated cost: $${totalCost.toFixed(2)}`);
  
  // Update pipeline run
  await pool.query(
    `UPDATE pipeline_runs SET currentNode = 'video_gen_done', progress = 100, updatedAt = NOW() WHERE id = ?`,
    [runId]
  );
  
  if (failed > 0) {
    console.log('\nFailed panels:');
    results.filter(r => r.status !== 'succeed').forEach(r => {
      console.log(`  P${String(r.panelNumber).padStart(2,'0')}: ${r.status} - ${r.error || 'unknown'}`);
    });
  }
  
  await pool.end();
  console.log('\nDone!');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
