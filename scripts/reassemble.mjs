import 'dotenv/config';
import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';

const FORGE_API_URL = process.env.BUILT_IN_FORGE_API_URL;
const FORGE_API_KEY = process.env.BUILT_IN_FORGE_API_KEY;

// Cloudflare Stream
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_STREAM_TOKEN = process.env.CLOUDFLARE_STREAM_TOKEN;

const WORK_DIR = '/tmp/reassembly';

// Video clips (from run 60005, ordered by panel)
const videoClips = [
  { panel: 1, scene: 1, url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/pipeline/60005/t2-clip-panel1-_NecKp_0f212e2f.mp4" },
  { panel: 2, scene: 1, url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/pipeline/60005/omni-lipsync-panel2-s8iFKj_accdef7b.mp4" },
  { panel: 3, scene: 1, url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/pipeline/60005/t3-clip-panel3-1x8HwR_26262db8.mp4" },
  { panel: 4, scene: 2, url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/pipeline/60005/omni-lipsync-panel4-lhNcgP_06e430ae.mp4" },
  { panel: 5, scene: 2, url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/pipeline/60005/omni-lipsync-panel5-kJwPK8_bf4a076f.mp4" },
  { panel: 6, scene: 2, url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/pipeline/60005/t2-clip-panel6-mHV0Z8_044583f4.mp4" },
  { panel: 7, scene: 3, url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/pipeline/60005/omni-lipsync-panel7-lFyRqi_f7179106.mp4" },
  { panel: 8, scene: 3, url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/pipeline/60005/t2-clip-panel8-pwnEjb_26977f53.mp4" },
  { panel: 9, scene: 3, url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/pipeline/60005/omni-lipsync-panel9-Oi_Iuc_c213466b.mp4" },
  { panel: 10, scene: 3, url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/pipeline/60005/omni-lipsync-panel10-HEwilJ_4bbc5d27.mp4" },
  { panel: 11, scene: 4, url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/pipeline/60005/t2-clip-panel11-lDJmlX_4d9d2cb3.mp4" },
  { panel: 12, scene: 4, url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/pipeline/60005/omni-lipsync-panel12-JbFcKJ_fd646c0d.mp4" },
  { panel: 13, scene: 4, url: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/pipeline/60005/t4-clip-panel13-OfZeSp_b9a34956.mp4" },
];

const musicUrl = "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/pipeline/60005/bgm-r1ZFQi_fc0f3573.mp3";

// New voice clips (from /tmp/voice-clips-v2.json)
const voiceData = JSON.parse(fs.readFileSync("/tmp/voice-clips-v2.json", "utf8"));

function appendHashSuffix(relKey) {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

async function uploadToS3(relKey, filePath, contentType) {
  const key = appendHashSuffix(relKey.replace(/^\/+/, ""));
  const baseUrl = FORGE_API_URL.endsWith("/") ? FORGE_API_URL : FORGE_API_URL + "/";
  const uploadUrl = new URL("v1/storage/upload", baseUrl);
  uploadUrl.searchParams.set("path", key);

  const buffer = fs.readFileSync(filePath);
  const blob = new Blob([buffer], { type: contentType });
  const formData = new FormData();
  formData.append("file", blob, path.basename(filePath));

  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${FORGE_API_KEY}` },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`S3 upload failed (${res.status}): ${errText}`);
  }
  const data = await res.json();
  return data.url;
}

async function downloadFile(url, destPath) {
  console.log(`  Downloading: ${url.substring(0, 70)}...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
  return destPath;
}

async function main() {
  // Setup - don't clean if files already exist from previous partial run
  if (!fs.existsSync(WORK_DIR)) {
  fs.mkdirSync(WORK_DIR, { recursive: true });

  // Step 1: Download all video clips
  console.log("=== STEP 1: Downloading video clips ===");
  const localVideos = [];
  for (const clip of videoClips) {
    const localPath = path.join(WORK_DIR, `video_panel${clip.panel}.mp4`);
    await downloadFile(clip.url, localPath);
    localVideos.push({ ...clip, localPath });
  }

  // Step 2: Download new voice clips
  console.log("\n=== STEP 2: Downloading new voice clips ===");
  const localVoices = [];
  for (const clip of voiceData.clips) {
    const localPath = path.join(WORK_DIR, `voice_panel${clip.panelId}.mp3`);
    await downloadFile(clip.url, localPath);
    localVoices.push({ panelId: clip.panelId, localPath });
  }

  // Step 3: Download music
  console.log("\n=== STEP 3: Downloading BGM ===");
  const musicPath = path.join(WORK_DIR, "bgm.mp3");
  await downloadFile(musicUrl, musicPath);

  // Step 4: Normalize each voice clip with loudnorm and boost volume
  console.log("\n=== STEP 4: Normalizing voice clips ===");
  for (const voice of localVoices) {
    const normalizedPath = voice.localPath.replace(".mp3", "_norm.mp3");
    execSync(
      `ffmpeg -y -i "${voice.localPath}" -af "loudnorm=I=-16:TP=-1.5:LRA=11,volume=1.5" "${normalizedPath}"`,
      { stdio: 'pipe' }
    );
    voice.normalizedPath = normalizedPath;
    // Get duration
    const durStr = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${normalizedPath}"`,
      { encoding: 'utf8' }
    ).trim();
    voice.duration = parseFloat(durStr);
    console.log(`  Panel ${voice.panelId}: ${voice.duration.toFixed(2)}s`);
  }

  // Step 5: Normalize each video clip to consistent format
  console.log("\n=== STEP 5: Normalizing video clips ===");
  for (const video of localVideos) {
    const normalizedPath = video.localPath.replace(".mp4", "_norm.mp4");
    execSync(
      `ffmpeg -y -i "${video.localPath}" -c:v libx264 -preset fast -crf 18 -r 30 -s 1280x720 -an "${normalizedPath}"`,
      { stdio: 'pipe' }
    );
    video.normalizedPath = normalizedPath;
    // Get duration
    const durStr = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${normalizedPath}"`,
      { encoding: 'utf8' }
    ).trim();
    video.duration = parseFloat(durStr);
    console.log(`  Panel ${video.panel}: ${video.duration.toFixed(2)}s`);
  }

  // Step 6: Concatenate video clips with varied transitions
  // Scene transitions: dissolve (1s) between scenes, fade (0.5s) within scenes
  console.log("\n=== STEP 6: Building video with transitions ===");
  
  // Build concat file for simple approach - use xfade for transitions
  // Within same scene: 0.3s crossfade (quick cuts)
  // Between scenes: 1.0s dissolve
  const clips = localVideos.map(v => v.normalizedPath);
  
  // Build xfade filter chain
  let filterParts = [];
  let prevLabel = "[0:v]";
  let offset = 0;
  
  for (let i = 0; i < clips.length - 1; i++) {
    const currentScene = videoClips[i].scene;
    const nextScene = videoClips[i + 1].scene;
    const isSceneChange = currentScene !== nextScene;
    
    // Transition type and duration based on context
    let transType, transDur;
    if (isSceneChange) {
      transType = "dissolve";
      transDur = 0.8;
    } else {
      // Within scene: use quick cuts for action (scene 3), fades for others
      if (currentScene === 3) {
        transType = "fade";
        transDur = 0.3;
      } else {
        transType = "fade";
        transDur = 0.5;
      }
    }
    
    offset += localVideos[i].duration - transDur;
    const nextLabel = i < clips.length - 2 ? `[v${i}]` : "[vout]";
    const inputB = `[${i + 1}:v]`;
    
    filterParts.push(
      `${prevLabel}${inputB}xfade=transition=${transType}:duration=${transDur}:offset=${offset.toFixed(3)}${nextLabel}`
    );
    prevLabel = nextLabel;
  }
  
  // Build input args
  const inputArgs = clips.map(c => `-i "${c}"`).join(" ");
  const filterComplex = filterParts.join(";\n");
  
  const videoOnlyPathBuild = path.join(WORK_DIR, "video_only.mp4");
  
  // Write filter to file to avoid shell escaping issues
  const filterPath = path.join(WORK_DIR, "xfade_filter.txt");
  fs.writeFileSync(filterPath, filterComplex);
  
  console.log("  Building xfade graph...");
  console.log(`  Total transitions: ${filterParts.length}`);
  
  execSync(
    `ffmpeg -y ${inputArgs} -filter_complex_script "${filterPath}" -map "[vout]" -c:v libx264 -preset fast -crf 18 "${videoOnlyPathBuild}"`,
    { stdio: 'pipe', timeout: 300000 }
  );
  
  // Get final video duration
  const videoDurStrBuild = execSync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoOnlyPathBuild}"`,
    { encoding: 'utf8' }
  ).trim();
  console.log(`  Video duration: ${parseFloat(videoDurStrBuild).toFixed(2)}s`);

  // Step 7: Build voice track - place each voice clip at the start of its panel's time
  console.log("\n=== STEP 7: Building voice track ===");
  
  // Calculate panel start times (accounting for transitions)
  const panelStarts = [];
  let cumTime = 0;
  for (let i = 0; i < localVideos.length; i++) {
    panelStarts.push(cumTime);
    if (i < localVideos.length - 1) {
      const currentScene = videoClips[i].scene;
      const nextScene = videoClips[i + 1].scene;
      const isSceneChange = currentScene !== nextScene;
      let transDur;
      if (isSceneChange) {
        transDur = 0.8;
      } else if (currentScene === 3) {
        transDur = 0.3;
      } else {
        transDur = 0.5;
      }
      cumTime += localVideos[i].duration - transDur;
    }
  }
  
  console.log("  Panel start times:");
  for (let i = 0; i < panelStarts.length; i++) {
    console.log(`    Panel ${i + 1}: ${panelStarts[i].toFixed(2)}s`);
  }
  
  // Build voice overlay: place each voice clip 1s after panel start (give visual context first)
  const voiceInputs = localVoices.map(v => `-i "${v.normalizedPath}"`).join(" ");
  
  // Build amerge filter: delay each voice clip to its panel start + 1s offset
  let voiceFilterParts = [];
  let voiceLabels = [];
  
  for (let i = 0; i < localVoices.length; i++) {
    const panelIdx = localVoices[i].panelId - 1;
    const startTime = panelStarts[panelIdx] + 1.0; // 1s delay for visual context
    const delayMs = Math.round(startTime * 1000);
    voiceFilterParts.push(`[${i}:a]adelay=${delayMs}|${delayMs},aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[v${i}]`);
    voiceLabels.push(`[v${i}]`);
  }
  
  voiceFilterParts.push(`${voiceLabels.join("")}amix=inputs=${localVoices.length}:duration=longest:dropout_transition=0:normalize=0[voiceout]`);
  
  const voiceFilterStr = voiceFilterParts.join(";\n");
  const voiceFilterPath = path.join(WORK_DIR, "voice_filter.txt");
  fs.writeFileSync(voiceFilterPath, voiceFilterStr);
  
  const voiceTrackPathBuild = path.join(WORK_DIR, "voice_track.wav");
  execSync(
    `ffmpeg -y ${voiceInputs} -filter_complex_script "${voiceFilterPath}" -map "[voiceout]" -t ${parseFloat(videoDurStrBuild).toFixed(2)} "${voiceTrackPathBuild}"`,
    { stdio: 'pipe', timeout: 120000 }
  );
  console.log("  Voice track built.");

  } // end of download/normalize block

  // Check if we can skip steps 1-7 (files already exist from previous run)
  const videoOnlyPath = path.join(WORK_DIR, "video_only.mp4");
  const voiceTrackPath = path.join(WORK_DIR, "voice_track.wav");
  
  if (!fs.existsSync(videoOnlyPath) || !fs.existsSync(voiceTrackPath)) {
    console.error("Missing intermediate files. Please run the full script (clean WORK_DIR first).");
    process.exit(1);
  }
  
  const videoDurStr2 = execSync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoOnlyPath}"`,
    { encoding: 'utf8' }
  ).trim();
  const videoDuration = parseFloat(videoDurStr2);
  console.log(`\nVideo duration: ${videoDuration.toFixed(2)}s`);
  
  // Step 8: Mix voice + BGM with proper levels
  // Voice: loud and clear (volume 1.0 after normalization)
  // BGM: quiet background (volume 0.06), with sidechain ducking when voice is present
  console.log("\n=== STEP 8: Mixing voice + BGM ===");
  
  const mixedAudioPath = path.join(WORK_DIR, "mixed_audio.wav");
  
  // Use sidechaincompress to duck BGM when voice plays
  // Voice on input 0, BGM on input 1
  // The sidechain compress will lower BGM volume when voice is detected
   const mixFilter = [
    // Voice: already normalized, apply slight boost, then split for sidechain + mix
    `[0:a]volume=1.8,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,asplit=2[voice_mix][voice_sc]`,
    // BGM: low volume base
    `[1:a]volume=0.06,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[bgm_quiet]`,
    // Sidechain compress: use voice_sc as sidechain to duck BGM when voice plays
    `[bgm_quiet][voice_sc]sidechaincompress=threshold=0.02:ratio=6:attack=50:release=400:level_sc=1[bgm_ducked]`,
    // Mix voice + ducked BGM
    `[voice_mix][bgm_ducked]amix=inputs=2:duration=first:dropout_transition=3:weights=1 0.8:normalize=0[mixout]`,
  ].join(";\n");
  
  const mixFilterPath = path.join(WORK_DIR, "mix_filter.txt");
  fs.writeFileSync(mixFilterPath, mixFilter);
  
  const musicPathFinal = path.join(WORK_DIR, "bgm.mp3");
  execSync(
    `ffmpeg -y -i "${voiceTrackPath}" -i "${musicPathFinal}" -filter_complex_script "${mixFilterPath}" -map "[mixout]" -t ${videoDuration.toFixed(2)} "${mixedAudioPath}"`,
    { stdio: 'pipe', timeout: 120000 }
  );
  console.log("  Audio mixed with sidechain ducking.");

  // Step 9: Combine video + mixed audio into final output
  console.log("\n=== STEP 9: Final mux ===");
  const finalPath = path.join(WORK_DIR, "episode1_v2_final.mp4");
  const videoOnlyFinal = path.join(WORK_DIR, "video_only.mp4");
  execSync(
    `ffmpeg -y -i "${videoOnlyFinal}" -i "${mixedAudioPath}" -c:v copy -c:a aac -b:a 192k -shortest "${finalPath}"`,
    { stdio: 'pipe', timeout: 120000 }
  );
  
  const finalSize = fs.statSync(finalPath).size;
  const finalDurStr = execSync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${finalPath}"`,
    { encoding: 'utf8' }
  ).trim();
  console.log(`  Final video: ${finalPath}`);
  console.log(`  Duration: ${parseFloat(finalDurStr).toFixed(2)}s`);
  console.log(`  Size: ${(finalSize / 1024 / 1024).toFixed(1)}MB`);

  // Step 10: Upload to S3
  console.log("\n=== STEP 10: Uploading to S3 ===");
  const s3Url = await uploadToS3(
    "pipeline/60005/final-v2-improved.mp4",
    finalPath,
    "video/mp4"
  );
  console.log(`  S3 URL: ${s3Url}`);

  // Step 11: Upload to Cloudflare Stream
  console.log("\n=== STEP 11: Uploading to Cloudflare Stream ===");
  try {
    const fileBuffer = fs.readFileSync(finalPath);
    const cfForm = new FormData();
    cfForm.append("file", new Blob([fileBuffer], { type: "video/mp4" }), "episode1_v2.mp4");
    cfForm.append("meta", JSON.stringify({
      name: "The Whispering Blade - Episode 1 (Improved v2)",
    }));

    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${CF_STREAM_TOKEN}` },
        body: cfForm,
      }
    );

    if (cfRes.ok) {
      const cfData = await cfRes.json();
      const uid = cfData.result?.uid;
      const streamUrl = `https://customer-l3h31kxcw2iu56mb.cloudflarestream.com/${uid}/watch`;
      console.log(`  Stream UID: ${uid}`);
      console.log(`  Stream URL: ${streamUrl}`);
    } else {
      const errText = await cfRes.text();
      console.log(`  Cloudflare upload failed (${cfRes.status}): ${errText}`);
      console.log("  S3 URL is still available for direct download.");
    }
  } catch (err) {
    console.log(`  Cloudflare upload error: ${err.message}`);
    console.log("  S3 URL is still available for direct download.");
  }

  console.log("\n=== DONE ===");
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
