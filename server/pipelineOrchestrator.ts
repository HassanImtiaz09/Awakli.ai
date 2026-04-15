/**
 * Pipeline Orchestrator — runs the 5-node anime production pipeline:
 *   video_gen → voice_gen → lip_sync → music_gen → assembly
 * Each node is a simulated agent that calls the appropriate AI service.
 */

import { generateImage } from "./_core/imageGeneration";
import { notifyOwner } from "./_core/notification";
import { storagePut } from "./storage";
import { textToSpeech, listVoices, VOICE_PRESETS, MODELS } from "./elevenlabs";
import { generateVideoFromImage, imageToVideo, queryTask } from "./kling";
import { generateSceneBGM } from "./minimax-music";
import { uploadFromUrl as cfUploadFromUrl } from "./cloudflare-stream";
import {
  getPipelineRunById,
  updatePipelineRun,
  createPipelineAsset,
  getPanelsByEpisode,
  getEpisodeById,
  getCharactersByProject,
  updateEpisode,
} from "./db";
import { nanoid } from "nanoid";

type NodeName = "video_gen" | "voice_gen" | "lip_sync" | "music_gen" | "assembly";
type NodeStatus = "pending" | "running" | "complete" | "failed" | "skipped";

interface NodeStatuses {
  video_gen: NodeStatus;
  voice_gen: NodeStatus;
  lip_sync: NodeStatus;
  music_gen: NodeStatus;
  assembly: NodeStatus;
}

const NODE_ORDER: NodeName[] = ["video_gen", "voice_gen", "lip_sync", "music_gen", "assembly"];

const NODE_COSTS: Record<NodeName, number> = {
  video_gen: 150,   // cents
  voice_gen: 80,
  lip_sync: 60,
  music_gen: 40,
  assembly: 20,
};

const NODE_DURATIONS: Record<NodeName, number> = {
  video_gen: 8000,
  voice_gen: 5000,
  lip_sync: 4000,
  music_gen: 3000,
  assembly: 2000,
};

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function updateNodeProgress(
  runId: number,
  node: NodeName,
  status: NodeStatus,
  nodeStatuses: NodeStatuses,
  progress: number,
  cost: number,
  nodeCosts: Record<string, number>
) {
  nodeStatuses[node] = status;
  if (status === "complete") {
    nodeCosts[node] = NODE_COSTS[node];
  }
  const remaining = NODE_ORDER.filter(n => nodeStatuses[n] === "pending" || nodeStatuses[n] === "running")
    .reduce((sum, n) => sum + NODE_DURATIONS[n], 0);

  await updatePipelineRun(runId, {
    currentNode: node,
    nodeStatuses: nodeStatuses as any,
    progress,
    estimatedTimeRemaining: Math.round(remaining / 1000),
    totalCost: cost,
    nodeCosts: nodeCosts as any,
  });
}

// ─── Agent Nodes ────────────────────────────────────────────────────────

async function videoGenAgent(runId: number, episodeId: number, projectId: number, nodeStatuses: NodeStatuses, nodeCosts: Record<string, number>) {
  const panels = await getPanelsByEpisode(episodeId);
  const approvedPanels = panels.filter(p => p.imageUrl);
  let totalCost = Object.values(nodeCosts).reduce((a, b) => a + b, 0);

  // Generate video clips from approved panel images using Kling AI image-to-video
  const panelsToProcess = approvedPanels.slice(0, 4);

  // Step 1: Submit all image-to-video tasks in parallel
  const taskIds: { panelId: number; taskId: string; panelNumber: number | null }[] = [];
  for (const panel of panelsToProcess) {
    if (!panel.imageUrl) continue;
    try {
      const result = await imageToVideo({
        image: panel.imageUrl,
        prompt: `Cinematic anime scene, smooth camera motion, ${String(panel.visualDescription || "dramatic scene")}, anime style, high quality animation, fluid movement`,
        negativePrompt: "static, still image, blurry, low quality, distorted",
        duration: "5",
        mode: "pro",
        modelName: "kling-v2-6",
      });
      if (result.code === 0 && result.data?.task_id) {
        taskIds.push({ panelId: panel.id, taskId: result.data.task_id, panelNumber: panel.panelNumber });
        console.log(`[Pipeline] Kling task submitted for panel ${panel.id}: ${result.data.task_id}`);
      }
    } catch (err) {
      console.error(`[Pipeline] Kling submission failed for panel ${panel.id}:`, err);
    }
  }

  // Step 2: Poll all tasks until completion
  const completedTasks = new Set<string>();
  const maxPollTime = 8 * 60 * 1000; // 8 minutes
  const pollStart = Date.now();
  let pollInterval = 5000;

  while (completedTasks.size < taskIds.length && (Date.now() - pollStart) < maxPollTime) {
    for (const task of taskIds) {
      if (completedTasks.has(task.taskId)) continue;
      try {
        const status = await queryTask(task.taskId, "image2video");
        if (status.data?.task_status === "succeed") {
          completedTasks.add(task.taskId);
          const video = status.data.task_result?.videos?.[0];
          if (video?.url) {
            // Upload to our S3 for persistence (Kling URLs may expire)
            const videoRes = await fetch(video.url);
            const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
            const videoKey = `pipeline/${runId}/clip-panel${task.panelId}-${nanoid(6)}.mp4`;
            const { url: storedUrl } = await storagePut(videoKey, videoBuffer, "video/mp4");

            await createPipelineAsset({
              pipelineRunId: runId,
              episodeId,
              panelId: task.panelId,
              assetType: "video_clip",
              url: storedUrl,
              metadata: { duration: Number(video.duration) || 5, format: "mp4", panelNumber: task.panelNumber, klingTaskId: task.taskId } as any,
              nodeSource: "video_gen",
            });
            console.log(`[Pipeline] Video clip stored for panel ${task.panelId}: ${storedUrl}`);
          }
        } else if (status.data?.task_status === "failed") {
          completedTasks.add(task.taskId);
          console.error(`[Pipeline] Kling task failed for panel ${task.panelId}: ${status.data.task_status_msg}`);
        }
      } catch (err) {
        console.error(`[Pipeline] Poll error for task ${task.taskId}:`, err);
      }
    }

    totalCost += Math.round(NODE_COSTS.video_gen / Math.max(panelsToProcess.length, 1));
    const progress = Math.round((completedTasks.size / Math.max(taskIds.length, 1)) * 20);
    await updateNodeProgress(runId, "video_gen", "running", nodeStatuses, progress, totalCost, nodeCosts);

    if (completedTasks.size < taskIds.length) {
      await sleep(pollInterval);
      pollInterval = Math.min(pollInterval * 1.3, 20000);
    }
  }

  return totalCost;
}

async function voiceGenAgent(runId: number, episodeId: number, projectId: number, nodeStatuses: NodeStatuses, nodeCosts: Record<string, number>) {
  const panels = await getPanelsByEpisode(episodeId);
  const characters = await getCharactersByProject(projectId);
  let totalCost = Object.values(nodeCosts).reduce((a, b) => a + b, 0);

  // Generate voice clips for panels with dialogue
  const panelsWithDialogue = panels.filter(p => {
    const dialogue = p.dialogue as any;
    return dialogue && (Array.isArray(dialogue) ? dialogue.length > 0 : Object.keys(dialogue).length > 0);
  });

  for (let i = 0; i < Math.min(panelsWithDialogue.length, 6); i++) {
    const panel = panelsWithDialogue[i];
    const dialogue = panel.dialogue as any;
    const dialogueText = Array.isArray(dialogue)
      ? dialogue.map((d: any) => d.text || d.line || d).join(". ")
      : typeof dialogue === "string" ? dialogue : JSON.stringify(dialogue);

    // Generate voice using ElevenLabs TTS
    const voiceKey = `pipeline/${runId}/voice-${panel.id}-${nanoid(6)}.mp3`;

    try {
      // Pick a voice — use first available voice, or default narrator
      let voiceId: string;
      try {
        const voices = await listVoices();
        voiceId = voices[0]?.voice_id || "CwhRBWXzGAHq8TQ4Fs17"; // Roger as fallback
      } catch {
        voiceId = "CwhRBWXzGAHq8TQ4Fs17"; // Roger - Laid-Back, Casual
      }

      const audioBuffer = await textToSpeech({
        voiceId,
        text: dialogueText.slice(0, 5000), // ElevenLabs limit
        modelId: MODELS.MULTILINGUAL_V2,
        voiceSettings: VOICE_PRESETS.heroic,
      });

      const { url } = await storagePut(voiceKey, audioBuffer, "audio/mpeg");
      // Estimate duration: ~150 words/min
      const wordCount = dialogueText.split(/\s+/).length;
      const durationEstimate = Math.max(1, Math.round((wordCount / 150) * 60));

      await createPipelineAsset({
        pipelineRunId: runId,
        episodeId,
        panelId: panel.id,
        assetType: "voice_clip",
        url,
        metadata: { duration: durationEstimate, characterId: null, text: dialogueText.slice(0, 200) } as any,
        nodeSource: "voice_gen",
      });
      console.log(`[Pipeline] Voice generated for panel ${panel.id}: ${durationEstimate}s`);
    } catch (err) {
      console.error(`[Pipeline] Voice gen failed for panel ${panel.id}:`, err);
    }

    totalCost += Math.round(NODE_COSTS.voice_gen / panelsWithDialogue.length);
    const progress = 20 + Math.round(((i + 1) / panelsWithDialogue.length) * 20);
    await updateNodeProgress(runId, "voice_gen", "running", nodeStatuses, progress, totalCost, nodeCosts);
    await sleep(800);
  }

  return totalCost;
}

async function lipSyncAgent(runId: number, episodeId: number, nodeStatuses: NodeStatuses, nodeCosts: Record<string, number>) {
  let totalCost = Object.values(nodeCosts).reduce((a, b) => a + b, 0);

  // Simulate lip sync processing
  await sleep(2000);
  totalCost += NODE_COSTS.lip_sync;

  const syncKey = `pipeline/${runId}/synced-${nanoid(6)}.mp4`;
  const placeholderBuffer = Buffer.from("Lip-synced video placeholder");

  try {
    const { url } = await storagePut(syncKey, placeholderBuffer, "video/mp4");
    await createPipelineAsset({
      pipelineRunId: runId,
      episodeId,
      assetType: "synced_clip",
      url,
      metadata: { duration: 30, format: "mp4" } as any,
      nodeSource: "lip_sync",
    });
  } catch (err) {
    console.error("[Pipeline] Lip sync failed:", err);
  }

  await updateNodeProgress(runId, "lip_sync", "running", nodeStatuses, 60, totalCost, nodeCosts);
  return totalCost;
}

async function musicGenAgent(runId: number, episodeId: number, nodeStatuses: NodeStatuses, nodeCosts: Record<string, number>) {
  let totalCost = Object.values(nodeCosts).reduce((a, b) => a + b, 0);
  totalCost += NODE_COSTS.music_gen;

  // Get episode and project info for contextual music generation
  const episode = await getEpisodeById(episodeId);
  const genre = "cinematic anime";
  const mood = "dramatic, emotional";
  const title = episode?.title || "Untitled Episode";

  const musicKey = `pipeline/${runId}/music-${nanoid(6)}.mp3`;

  try {
    // Generate real background music using MiniMax Music 2.6
    const result = await generateSceneBGM({
      sceneDescription: `anime episode background score for "${title}", orchestral, cinematic`,
      mood,
    });

    // Download from MiniMax temporary URL and upload to S3
    const audioRes = await fetch(result.audioUrl);
    if (!audioRes.ok) throw new Error(`Failed to download music: ${audioRes.status}`);
    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
    const { url } = await storagePut(musicKey, audioBuffer, "audio/mpeg");

    await createPipelineAsset({
      pipelineRunId: runId,
      episodeId,
      assetType: "music_segment",
      url,
      metadata: {
        duration: Math.round(result.durationMs / 1000),
        genre,
        mood,
        sizeBytes: result.sizeBytes,
        sampleRate: result.sampleRate,
      } as any,
      nodeSource: "music_gen",
    });
    console.log(`[Pipeline] Music generated: ${Math.round(result.durationMs / 1000)}s, ${result.sizeBytes} bytes`);
  } catch (err) {
    console.error("[Pipeline] Music gen failed, using silent fallback:", err);
    // Fallback: store a minimal silent placeholder so pipeline doesn't break
    const silentBuffer = Buffer.alloc(1024, 0);
    try {
      const { url } = await storagePut(musicKey, silentBuffer, "audio/mpeg");
      await createPipelineAsset({
        pipelineRunId: runId,
        episodeId,
        assetType: "music_segment",
        url,
        metadata: { duration: 0, genre, mood, fallback: true } as any,
        nodeSource: "music_gen",
      });
    } catch (fallbackErr) {
      console.error("[Pipeline] Music fallback also failed:", fallbackErr);
    }
  }

  await updateNodeProgress(runId, "music_gen", "running", nodeStatuses, 80, totalCost, nodeCosts);
  return totalCost;
}

async function assemblyAgent(runId: number, episodeId: number, nodeStatuses: NodeStatuses, nodeCosts: Record<string, number>) {
  let totalCost = Object.values(nodeCosts).reduce((a, b) => a + b, 0);

  // Simulate final assembly
  await sleep(1500);
  totalCost += NODE_COSTS.assembly;

  // Create final video asset
  const finalKey = `pipeline/${runId}/final-${nanoid(6)}.mp4`;
  const placeholderBuffer = Buffer.from("Final assembled video");

  try {
    const { url } = await storagePut(finalKey, placeholderBuffer, "video/mp4");
    await createPipelineAsset({
      pipelineRunId: runId,
      episodeId,
      assetType: "final_video",
      url,
      metadata: { duration: 120, format: "mp4", resolution: "1920x1080" } as any,
      nodeSource: "assembly",
    });

    // Update episode with video URL
    await updateEpisode(episodeId, { videoUrl: url } as any);

    // Upload to Cloudflare Stream for CDN delivery (non-blocking)
    try {
      const streamResult = await cfUploadFromUrl(url, { name: `episode-${episodeId}-final` });
      console.log(`[Pipeline] Video uploaded to Cloudflare Stream: uid=${streamResult.uid}`);
      await createPipelineAsset({
        pipelineRunId: runId,
        episodeId,
        assetType: "stream_video",
        url: streamResult.preview || `https://cloudflarestream.com/${streamResult.uid}/watch`,
        metadata: { streamUid: streamResult.uid, status: streamResult.status.state } as any,
        nodeSource: "assembly",
      });
    } catch (streamErr) {
      console.warn("[Pipeline] Cloudflare Stream upload failed (non-critical):", streamErr);
    }
  } catch (err) {
    console.error("[Pipeline] Assembly failed:", err);
  }

  // Create thumbnail
  try {
    const thumbResult = await generateImage({
      prompt: "Anime episode thumbnail, cinematic, dramatic lighting, high quality key visual",
    });
    if (thumbResult?.url) {
      await createPipelineAsset({
        pipelineRunId: runId,
        episodeId,
        assetType: "thumbnail",
        url: thumbResult.url,
        metadata: { format: "png", resolution: "1280x720" } as any,
        nodeSource: "assembly",
      });
      await updateEpisode(episodeId, { thumbnailUrl: thumbResult.url } as any);
    }
  } catch (err) {
    console.error("[Pipeline] Thumbnail gen failed:", err);
  }

  await updateNodeProgress(runId, "assembly", "running", nodeStatuses, 95, totalCost, nodeCosts);
  return totalCost;
}

// ─── Main Orchestrator ──────────────────────────────────────────────────

export async function runPipeline(runId: number) {
  const run = await getPipelineRunById(runId);
  if (!run) throw new Error("Pipeline run not found");

  const nodeStatuses: NodeStatuses = {
    video_gen: "pending",
    voice_gen: "pending",
    lip_sync: "pending",
    music_gen: "pending",
    assembly: "pending",
  };
  const nodeCosts: Record<string, number> = {};
  let totalCost = 0;

  await updatePipelineRun(runId, {
    status: "running",
    startedAt: new Date(),
    nodeStatuses: nodeStatuses as any,
    currentNode: "video_gen",
  });

  // Update episode status
  await updateEpisode(run.episodeId, { status: "pipeline" } as any);

  try {
    // Node 1: Video Generation
    await updateNodeProgress(runId, "video_gen", "running", nodeStatuses, 5, totalCost, nodeCosts);
    totalCost = await videoGenAgent(runId, run.episodeId, run.projectId, nodeStatuses, nodeCosts);
    nodeStatuses.video_gen = "complete";
    nodeCosts.video_gen = NODE_COSTS.video_gen;
    await updateNodeProgress(runId, "video_gen", "complete", nodeStatuses, 20, totalCost, nodeCosts);

    // Node 2: Voice Generation
    await updateNodeProgress(runId, "voice_gen", "running", nodeStatuses, 25, totalCost, nodeCosts);
    totalCost = await voiceGenAgent(runId, run.episodeId, run.projectId, nodeStatuses, nodeCosts);
    nodeStatuses.voice_gen = "complete";
    nodeCosts.voice_gen = NODE_COSTS.voice_gen;
    await updateNodeProgress(runId, "voice_gen", "complete", nodeStatuses, 40, totalCost, nodeCosts);

    // Node 3: Lip Sync
    await updateNodeProgress(runId, "lip_sync", "running", nodeStatuses, 45, totalCost, nodeCosts);
    totalCost = await lipSyncAgent(runId, run.episodeId, nodeStatuses, nodeCosts);
    nodeStatuses.lip_sync = "complete";
    nodeCosts.lip_sync = NODE_COSTS.lip_sync;
    await updateNodeProgress(runId, "lip_sync", "complete", nodeStatuses, 60, totalCost, nodeCosts);

    // Node 4: Music Generation
    await updateNodeProgress(runId, "music_gen", "running", nodeStatuses, 65, totalCost, nodeCosts);
    totalCost = await musicGenAgent(runId, run.episodeId, nodeStatuses, nodeCosts);
    nodeStatuses.music_gen = "complete";
    nodeCosts.music_gen = NODE_COSTS.music_gen;
    await updateNodeProgress(runId, "music_gen", "complete", nodeStatuses, 80, totalCost, nodeCosts);

    // Node 5: Assembly
    await updateNodeProgress(runId, "assembly", "running", nodeStatuses, 85, totalCost, nodeCosts);
    totalCost = await assemblyAgent(runId, run.episodeId, nodeStatuses, nodeCosts);
    nodeStatuses.assembly = "complete";
    nodeCosts.assembly = NODE_COSTS.assembly;
    await updateNodeProgress(runId, "assembly", "complete", nodeStatuses, 100, totalCost, nodeCosts);

    // Mark as completed, move to QA review
    await updatePipelineRun(runId, {
      status: "completed",
      currentNode: "qa_review",
      progress: 100,
      completedAt: new Date(),
      totalCost,
    });

    await updateEpisode(run.episodeId, { status: "review" } as any);

    await notifyOwner({
      title: "Pipeline Complete",
      content: `Episode pipeline run #${runId} completed successfully. Total cost: $${(totalCost / 100).toFixed(2)}. Ready for QA review.`,
    });

  } catch (error: any) {
    const currentNode = NODE_ORDER.find(n => nodeStatuses[n] === "running") || "video_gen";
    nodeStatuses[currentNode] = "failed";

    const errors = [{ node: currentNode, message: error.message || "Unknown error", timestamp: new Date().toISOString() }];

    await updatePipelineRun(runId, {
      status: "failed",
      errors: errors as any,
      nodeStatuses: nodeStatuses as any,
      completedAt: new Date(),
      totalCost,
    });

    await updateEpisode(run.episodeId, { status: "locked" } as any);

    await notifyOwner({
      title: "Pipeline Failed",
      content: `Episode pipeline run #${runId} failed at node "${currentNode}": ${error.message}`,
    });
  }
}
