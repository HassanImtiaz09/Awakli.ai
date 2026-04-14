/**
 * Pipeline Orchestrator — runs the 5-node anime production pipeline:
 *   video_gen → voice_gen → lip_sync → music_gen → assembly
 * Each node is a simulated agent that calls the appropriate AI service.
 */

import { generateImage } from "./_core/imageGeneration";
import { notifyOwner } from "./_core/notification";
import { storagePut } from "./storage";
import { textToSpeech, listVoices, VOICE_PRESETS, MODELS } from "./elevenlabs";
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

  // Generate video clips from approved panel images
  for (let i = 0; i < Math.min(approvedPanels.length, 4); i++) {
    const panel = approvedPanels[i];
    try {
      // Use image generation to create an animated version of the panel
      const result = await generateImage({
        prompt: `Cinematic anime scene animation frame, smooth motion, ${String(panel.visualDescription || "dramatic scene")}, anime style, high quality`,
        originalImages: panel.imageUrl ? [{ url: panel.imageUrl, mimeType: "image/png" }] : undefined,
      });

      if (result?.url) {
        await createPipelineAsset({
          pipelineRunId: runId,
          episodeId,
          panelId: panel.id,
          assetType: "video_clip",
          url: result.url,
          metadata: { duration: 3, format: "mp4", panelNumber: panel.panelNumber } as any,
          nodeSource: "video_gen",
        });
      }
    } catch (err) {
      console.error(`[Pipeline] Video gen failed for panel ${panel.id}:`, err);
    }

    totalCost += Math.round(NODE_COSTS.video_gen / approvedPanels.length);
    const progress = Math.round(((i + 1) / approvedPanels.length) * 20);
    await updateNodeProgress(runId, "video_gen", "running", nodeStatuses, progress, totalCost, nodeCosts);
    await sleep(1000); // Simulate processing time
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

  // Simulate music generation
  await sleep(2000);
  totalCost += NODE_COSTS.music_gen;

  const musicKey = `pipeline/${runId}/music-${nanoid(6)}.mp3`;
  const placeholderBuffer = Buffer.from("Background music placeholder");

  try {
    const { url } = await storagePut(musicKey, placeholderBuffer, "audio/mpeg");
    await createPipelineAsset({
      pipelineRunId: runId,
      episodeId,
      assetType: "music_segment",
      url,
      metadata: { duration: 60, genre: "cinematic", mood: "dramatic" } as any,
      nodeSource: "music_gen",
    });
  } catch (err) {
    console.error("[Pipeline] Music gen failed:", err);
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
