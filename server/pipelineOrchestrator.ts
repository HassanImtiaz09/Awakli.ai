/**
 * Pipeline Orchestrator — runs the 4-node anime production pipeline:
 *   video_gen → voice_gen → music_gen → assembly
 *
 * Kling V3 Omni handles video generation WITH native audio + lip sync in a single pass,
 * eliminating the need for a separate lip_sync node. When panels have dialogue,
 * the video_gen node uses the Omni endpoint with `sound: "on"` and dialogue-enriched
 * prompts so characters' mouth movements are natively synced to speech.
 */

import { generateImage } from "./_core/imageGeneration";
import { notifyOwner } from "./_core/notification";
import { storagePut } from "./storage";
import { textToSpeech, listVoices, VOICE_PRESETS, MODELS } from "./elevenlabs";
import { imageToVideo, omniVideo, queryTask } from "./kling";
import { classifyScene, calculateCost, calculateV3OmniCost, MODEL_MAP, type PanelScriptData, type SceneClassification } from "./scene-classifier";
import { createModelRoutingStat, updatePipelineAssetRouting } from "./db";
import { buildLipSyncPrompt } from "./kling-subjects";
import { generateSceneBGM } from "./minimax-music";
import { uploadFromUrl as cfUploadFromUrl } from "./cloudflare-stream";
import { assembleVideo } from "./video-assembly";
import { getOrCompileProductionBible, lockProductionBible, type ProductionBibleData } from "./production-bible";
import { runHarnessLayer, updateAssetHarnessScore, type HarnessContext, type HarnessRunSummary } from "./harness-runner";
import { scriptChecks, visualChecks, videoChecks, audioChecks, integrationChecks } from "./harness-checks";
import {
  getPipelineRunById,
  updatePipelineRun,
  createPipelineAsset,
  getPipelineAssetsByRun,
  getPanelsByEpisode,
  getEpisodeById,
  getCharactersByProject,
  getReadyElementMapForProject,
  getReadyElementsByProject,
  updateEpisode,
} from "./db";
import { nanoid } from "nanoid";

type NodeName = "video_gen" | "voice_gen" | "music_gen" | "assembly";
type NodeStatus = "pending" | "running" | "complete" | "failed" | "skipped";

interface NodeStatuses {
  video_gen: NodeStatus;
  voice_gen: NodeStatus;
  music_gen: NodeStatus;
  assembly: NodeStatus;
}

const NODE_ORDER: NodeName[] = ["video_gen", "voice_gen", "music_gen", "assembly"];

const NODE_COSTS: Record<NodeName, number> = {
  video_gen: 200,   // cents — higher because V3 Omni includes audio/lip sync
  voice_gen: 80,
  music_gen: 40,
  assembly: 20,
};

const NODE_DURATIONS: Record<NodeName, number> = {
  video_gen: 12000,  // longer — Omni generates video + audio together
  voice_gen: 5000,
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

// ─── Harness Gates ──────────────────────────────────────────────────────

/**
 * Run a harness gate between pipeline stages.
 * Returns the summary. If shouldBlock is true, the pipeline should halt.
 */
async function runHarnessGate(
  layerName: string,
  checks: Array<{ config: any; fn: any }>,
  context: HarnessContext,
  bible: ProductionBibleData,
  runId: number,
): Promise<HarnessRunSummary> {
  console.log(`[Harness] Running ${layerName} gate (${checks.length} checks)...`);
  const summary = await runHarnessLayer(checks, context, bible);
  console.log(`[Harness] ${layerName}: ${summary.passed}/${summary.totalChecks} passed, score=${summary.overallScore}, cost=$${summary.totalCost}`);

  if (summary.shouldBlock) {
    console.warn(`[Harness] ${layerName}: BLOCKED — pipeline will halt`);
    await notifyOwner({
      title: `Pipeline Blocked: ${layerName}`,
      content: `Pipeline run #${runId} blocked by ${layerName} harness. ${summary.blocked} check(s) returned BLOCK. Flagged items: ${summary.flaggedItems.map(f => f.checkName).join(", ")}`,
    });
  }

  if (summary.flaggedItems.length > 0) {
    console.log(`[Harness] ${layerName}: ${summary.flaggedItems.length} flagged item(s): ${summary.flaggedItems.map(f => `${f.checkName}(${f.score})`).join(", ")}`);
  }

  return summary;
}

// ─── Agent Nodes ────────────────────────────────────────────────────────

/**
 * Video Generation Agent — Smart Kling Model Router
 *
 * Routes each panel to the most cost-effective Kling model:
 *   Tier 1: V3 Omni  — lip sync critical (close-up dialogue)
 *   Tier 2: V2.6     — high complexity (action, complex movement)
 *   Tier 3: V2.1     — medium complexity (establishing shots, minimal movement)
 *   Tier 4: V1.6     — simple (transitions, title cards)
 *
 * Deterministic rules handle ~40-50% of panels instantly (zero cost).
 * Remaining panels are classified by LLM (~$0.005 each).
 *
 * When Subject Library elements are available for Tier 1 panels:
 *   - Uses element_list with <<<element_N>>> voice tags for true lip-synced animation
 *
 * Lip Sync Preservation Strategies:
 *   Strategy 1 (default): Anime convention — no lip sync on non-V3 clips (zero cost)
 *   Strategy 2 (optional): Post-sync via Sync.so for lip_sync_beneficial panels
 *   Strategy 3: User override — Force V3 Omni per panel (Studio tier)
 */
async function videoGenAgent(runId: number, episodeId: number, projectId: number, nodeStatuses: NodeStatuses, nodeCosts: Record<string, number>) {
  const panels = await getPanelsByEpisode(episodeId);
  const approvedPanels = panels.filter(p => p.imageUrl);
  let totalCost = Object.values(nodeCosts).reduce((a, b) => a + b, 0);

  const panelsToProcess = approvedPanels.slice(0, 4);

  // ─── Subject Library: look up ready character elements ───────────────
  const elementMap = await getReadyElementMapForProject(projectId);
  const readyElements = await getReadyElementsByProject(projectId);
  const hasSubjectLibrary = elementMap.size > 0;

  const elementList: Array<{ element_id: number }> = [];
  const elementOrder: string[] = [];
  if (hasSubjectLibrary) {
    for (const [charName, elementId] of Array.from(elementMap.entries())) {
      elementList.push({ element_id: elementId });
      elementOrder.push(charName);
    }
    console.log(`[Pipeline] Subject Library active: ${elementList.length} character elements loaded (${elementOrder.join(", ")})`);
  } else {
    console.log(`[Pipeline] No Subject Library elements found — using fallback Omni mode`);
  }

  // ─── Step 1: Classify all panels via Smart Model Router ───────────────
  console.log(`[Pipeline] Smart Model Router: classifying ${panelsToProcess.length} panels...`);

  // Get the production bible's animation style for Sakuga override
  let projectAnimationStyle = "default";
  try {
    const bible = await getOrCompileProductionBible(projectId);
    projectAnimationStyle = bible.animationStyle || "default";
  } catch { /* use default */ }

  const classifications: Map<number, SceneClassification> = new Map();
  let classificationCost = 0;
  const tierCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };

  for (const panel of panelsToProcess) {
    const dialogue = panel.dialogue as any;
    const dialogueArray: Array<{ character?: string; text: string; emotion?: string }> = [];
    if (Array.isArray(dialogue)) {
      for (const d of dialogue) {
        if (typeof d === "string") dialogueArray.push({ text: d });
        else if (d && typeof d === "object") dialogueArray.push({ character: d.character || d.speaker, text: d.text || d.line || d.dialogue || "", emotion: d.emotion });
      }
    } else if (typeof dialogue === "string" && dialogue.trim()) {
      dialogueArray.push({ text: dialogue });
    }

    const panelData: PanelScriptData = {
      panelId: panel.id,
      visualDescription: String(panel.visualDescription || ""),
      cameraAngle: panel.cameraAngle || undefined,
      dialogue: dialogueArray.length > 0 ? dialogueArray : undefined,
      mood: undefined,
      sceneType: panel.transition === "fade" || panel.transition === "dissolve" ? "transition" : undefined,
      animationStyle: projectAnimationStyle,
      characterCount: dialogueArray.length > 0 ? new Set(dialogueArray.map(d => d.character).filter(Boolean)).size || 1 : undefined,
    };

    const classification = await classifyScene(panelData);
    classifications.set(panel.id, classification);
    classificationCost += classification.classificationCostUsd;
    tierCounts[classification.tier]++;

    console.log(`[Router] Panel ${panel.id}: Tier ${classification.tier} → ${classification.model} (${classification.deterministic ? "deterministic" : "LLM"}) — ${classification.reasoning}`);
  }

  console.log(`[Router] Classification complete: T1=${tierCounts[1]} T2=${tierCounts[2]} T3=${tierCounts[3]} T4=${tierCounts[4]}, cost=$${classificationCost.toFixed(3)}`);

  // ─── Step 2: Submit video generation tasks based on classification ────
  interface TaskInfo {
    panelId: number;
    taskId: string;
    panelNumber: number | null;
    taskType: "image2video" | "omni-video";
    hasDialogue: boolean;
    hasNativeLipSync: boolean;
    classification: SceneClassification;
  }
  const taskIds: TaskInfo[] = [];

  for (const panel of panelsToProcess) {
    if (!panel.imageUrl) continue;

    const classification = classifications.get(panel.id);
    if (!classification) continue;

    const dialogue = panel.dialogue as any;
    const hasDialogue = classification.hasDialogue;

    // Extract dialogue lines for prompt building
    const dialogueLines: Array<{ characterName: string; dialogue: string; emotion?: string }> = [];
    if (hasDialogue && Array.isArray(dialogue)) {
      for (const d of dialogue) {
        if (typeof d === "string") dialogueLines.push({ characterName: "narrator", dialogue: d });
        else if (d && typeof d === "object") dialogueLines.push({ characterName: d.character || d.speaker || "narrator", dialogue: d.text || d.line || d.dialogue || "", emotion: d.emotion });
      }
    } else if (hasDialogue && typeof dialogue === "string") {
      dialogueLines.push({ characterName: "narrator", dialogue });
    }
    const dialogueText = dialogueLines.map(d => d.dialogue).filter(Boolean).join(". ");

    try {
      if (classification.tier === 1 && hasDialogue && dialogueText) {
        // ─── TIER 1: V3 Omni with native lip sync ───
        const panelCharNames = dialogueLines.map(d => d.characterName);
        const hasMatchingElements = hasSubjectLibrary && panelCharNames.some(name => elementMap.has(name));

        let omniPrompt: string;
        let omniElementList: Array<{ element_id: number }> | undefined;

        if (hasMatchingElements) {
          omniPrompt = buildLipSyncPrompt(
            `Cinematic anime scene, ${String(panel.visualDescription || "dramatic scene")}. Anime style, high quality animation, fluid movement, expressive character performance.`,
            dialogueLines,
            elementOrder
          );
          omniElementList = elementList;
          console.log(`[Pipeline] Panel ${panel.id}: Tier 1 + Subject Library lip sync (${panelCharNames.filter(n => elementMap.has(n)).join(", ")})`);
        } else {
          omniPrompt = `Cinematic anime scene, ${String(panel.visualDescription || "dramatic scene")}. The character says: "${dialogueText.slice(0, 500)}". Anime style, high quality animation, fluid movement, expressive character performance.`;
          omniElementList = undefined;
        }

        const result = await omniVideo({
          prompt: omniPrompt,
          imageList: [{ image_url: panel.imageUrl, type: "first_frame" }],
          elementList: omniElementList,
          sound: "on",
          duration: "5",
          mode: "pro",
          modelName: "kling-video-o1",
          aspectRatio: "16:9",
        });

        if (result.code === 0 && result.data?.task_id) {
          taskIds.push({
            panelId: panel.id,
            taskId: result.data.task_id,
            panelNumber: panel.panelNumber,
            taskType: "omni-video",
            hasDialogue: true,
            hasNativeLipSync: !!hasMatchingElements,
            classification,
          });
          console.log(`[Pipeline] Tier 1 V3 Omni task: panel ${panel.id} (${hasMatchingElements ? "native lip sync" : "fallback"}): ${result.data.task_id}`);
        }
      } else {
        // ─── TIER 2/3/4: Use appropriate model via image2video ───
        const modelName = classification.modelName;
        const prompt = `Cinematic anime scene, smooth camera motion, ${String(panel.visualDescription || "dramatic scene")}, anime style, high quality animation, fluid movement`;

        const result = await imageToVideo({
          image: panel.imageUrl,
          prompt,
          negativePrompt: "static, still image, blurry, low quality, distorted",
          duration: "5",
          mode: "pro",
          modelName,
        });

        if (result.code === 0 && result.data?.task_id) {
          taskIds.push({
            panelId: panel.id,
            taskId: result.data.task_id,
            panelNumber: panel.panelNumber,
            taskType: "image2video",
            hasDialogue,
            hasNativeLipSync: false,
            classification,
          });
          console.log(`[Pipeline] Tier ${classification.tier} ${classification.model} task: panel ${panel.id}: ${result.data.task_id}`);
        }
      }
    } catch (err) {
      console.error(`[Pipeline] Kling submission failed for panel ${panel.id}:`, err);
    }
  }

  // ─── Step 3: Poll all tasks until completion ──────────────────────────
  const completedTasks = new Set<string>();
  const maxPollTime = 10 * 60 * 1000;
  const pollStart = Date.now();
  let pollInterval = 5000;
  let totalActualCostUsd = 0;
  let totalV3OmniCostUsd = 0;

  while (completedTasks.size < taskIds.length && (Date.now() - pollStart) < maxPollTime) {
    for (const task of taskIds) {
      if (completedTasks.has(task.taskId)) continue;
      try {
        const status = await queryTask(task.taskId, task.taskType);
        if (status.data?.task_status === "succeed") {
          completedTasks.add(task.taskId);
          const video = status.data.task_result?.videos?.[0];
          if (video?.url) {
            const videoRes = await fetch(video.url);
            const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
            const suffix = task.classification.tier === 1 ? "omni-lipsync" : `t${task.classification.tier}-clip`;
            const videoKey = `pipeline/${runId}/${suffix}-panel${task.panelId}-${nanoid(6)}.mp4`;
            const { url: storedUrl } = await storagePut(videoKey, videoBuffer, "video/mp4");

            const durationSec = Number(video.duration) || 5;
            const actualCost = calculateCost(task.classification.tier, durationSec, "pro");
            const v3OmniCost = calculateV3OmniCost(durationSec, "pro");
            totalActualCostUsd += actualCost;
            totalV3OmniCostUsd += v3OmniCost;

            const assetType = task.classification.tier === 1 ? "synced_clip" : "video_clip";
            const lipSyncMethod = task.classification.tier === 1
              ? (task.hasNativeLipSync ? "native" : "native")
              : task.classification.lipSyncBeneficial ? "post_sync" : "none";

            const assetId = await createPipelineAsset({
              pipelineRunId: runId,
              episodeId,
              panelId: task.panelId,
              assetType,
              url: storedUrl,
              metadata: {
                duration: durationSec,
                format: "mp4",
                panelNumber: task.panelNumber,
                klingTaskId: task.taskId,
                klingModel: task.classification.model,
                hasNativeAudio: task.classification.tier === 1,
                hasLipSync: task.classification.tier === 1,
                hasNativeLipSync: task.hasNativeLipSync,
                usedSubjectLibrary: task.hasNativeLipSync,
                complexityTier: task.classification.tier,
                lipSyncBeneficial: task.classification.lipSyncBeneficial,
              } as any,
              nodeSource: "video_gen",
              klingModelUsed: task.classification.model,
              complexityTier: task.classification.tier,
              lipSyncMethod,
              classificationReasoning: task.classification.reasoning,
              costActual: actualCost,
              costIfV3Omni: v3OmniCost,
              userOverride: 0,
            });

            const lipSyncLabel = task.hasNativeLipSync ? "Native lip-synced" : task.classification.tier === 1 ? "Omni audio" : `Tier ${task.classification.tier}`;
            console.log(`[Pipeline] ${lipSyncLabel} video stored for panel ${task.panelId}: ${storedUrl} ($${actualCost.toFixed(3)} vs $${v3OmniCost.toFixed(3)} V3)`);
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
    const progress = Math.round((completedTasks.size / Math.max(taskIds.length, 1)) * 25);
    await updateNodeProgress(runId, "video_gen", "running", nodeStatuses, progress, totalCost, nodeCosts);

    if (completedTasks.size < taskIds.length) {
      await sleep(pollInterval);
      pollInterval = Math.min(pollInterval * 1.3, 20000);
    }
  }

  // ─── Step 4: Save model routing stats ─────────────────────────────────
  const savings = totalV3OmniCostUsd - totalActualCostUsd;
  const savingsPercent = totalV3OmniCostUsd > 0 ? (savings / totalV3OmniCostUsd) * 100 : 0;

  try {
    await createModelRoutingStat({
      episodeId,
      pipelineRunId: runId,
      totalPanels: panelsToProcess.length,
      tier1Count: tierCounts[1],
      tier2Count: tierCounts[2],
      tier3Count: tierCounts[3],
      tier4Count: tierCounts[4],
      actualCost: totalActualCostUsd,
      v3OmniCost: totalV3OmniCostUsd,
      savings,
      savingsPercent,
    });
    console.log(`[Router] Stats saved: actual=$${totalActualCostUsd.toFixed(2)}, v3=$${totalV3OmniCostUsd.toFixed(2)}, saved=$${savings.toFixed(2)} (${savingsPercent.toFixed(0)}%)`);
  } catch (err) {
    console.error(`[Router] Failed to save routing stats:`, err);
  }

  return totalCost;
}

async function voiceGenAgent(runId: number, episodeId: number, projectId: number, nodeStatuses: NodeStatuses, nodeCosts: Record<string, number>) {
  const panels = await getPanelsByEpisode(episodeId);
  const characters = await getCharactersByProject(projectId);
  let totalCost = Object.values(nodeCosts).reduce((a, b) => a + b, 0);

  // Generate standalone voice clips for panels with dialogue
  // (These supplement the native Omni audio — useful for narration, voiceover, or higher-quality TTS)
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

    const voiceKey = `pipeline/${runId}/voice-${panel.id}-${nanoid(6)}.mp3`;

    try {
      let voiceId: string;
      try {
        const voices = await listVoices();
        voiceId = voices[0]?.voice_id || "CwhRBWXzGAHq8TQ4Fs17";
      } catch {
        voiceId = "CwhRBWXzGAHq8TQ4Fs17"; // Roger - Laid-Back, Casual
      }

      const audioBuffer = await textToSpeech({
        voiceId,
        text: dialogueText.slice(0, 5000),
        modelId: MODELS.MULTILINGUAL_V2,
        voiceSettings: VOICE_PRESETS.heroic,
      });

      const { url } = await storagePut(voiceKey, audioBuffer, "audio/mpeg");
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
    const progress = 25 + Math.round(((i + 1) / panelsWithDialogue.length) * 25);
    await updateNodeProgress(runId, "voice_gen", "running", nodeStatuses, progress, totalCost, nodeCosts);
    await sleep(800);
  }

  return totalCost;
}

async function musicGenAgent(runId: number, episodeId: number, nodeStatuses: NodeStatuses, nodeCosts: Record<string, number>) {
  let totalCost = Object.values(nodeCosts).reduce((a, b) => a + b, 0);
  totalCost += NODE_COSTS.music_gen;

  const episode = await getEpisodeById(episodeId);
  const genre = "cinematic anime";
  const mood = "dramatic, emotional";
  const title = episode?.title || "Untitled Episode";

  const musicKey = `pipeline/${runId}/bgm-${nanoid(6)}.mp3`;

  // Retry logic for transient network errors (e.g., socket closed)
  const MAX_RETRIES = 3;
  let lastError: any = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[Pipeline] Music gen attempt ${attempt}/${MAX_RETRIES}`);
      const result = await generateSceneBGM({
        sceneDescription: `anime episode background score for "${title}", orchestral, cinematic`,
        mood,
      });

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
      lastError = null;
      break; // Success — exit retry loop
    } catch (err: any) {
      lastError = err;
      console.error(`[Pipeline] Music gen attempt ${attempt} failed:`, err.message || err);
      if (attempt < MAX_RETRIES) {
        const backoff = attempt * 3000; // 3s, 6s
        console.log(`[Pipeline] Retrying music gen in ${backoff / 1000}s...`);
        await sleep(backoff);
      }
    }
  }

  // If all retries failed, use silent fallback
  if (lastError) {
    console.error("[Pipeline] Music gen failed after all retries, using silent fallback");
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

  await updateNodeProgress(runId, "music_gen", "running", nodeStatuses, 75, totalCost, nodeCosts);
  return totalCost;
}

async function assemblyAgent(runId: number, episodeId: number, nodeStatuses: NodeStatuses, nodeCosts: Record<string, number>) {
  let totalCost = Object.values(nodeCosts).reduce((a, b) => a + b, 0);
  totalCost += NODE_COSTS.assembly;

  const finalKey = `pipeline/${runId}/final-${nanoid(6)}.mp4`;

  try {
    // Gather all pipeline assets from previous nodes
    const allAssets = await getPipelineAssetsByRun(runId);

    // Collect video clips (sorted by panel number)
    const videoClips = allAssets
      .filter(a => a.assetType === "video_clip" || a.assetType === "synced_clip")
      .map(a => {
        const meta = (a.metadata || {}) as any;
        return {
          url: a.url,
          panelId: a.panelId || 0,
          panelNumber: meta.panelNumber ?? a.panelId ?? 0,
          duration: meta.duration || 5,
          hasNativeAudio: meta.hasNativeAudio || false,
        };
      });

    // Collect voice clips
    const voiceClips = allAssets
      .filter(a => a.assetType === "voice_clip")
      .map(a => {
        const meta = (a.metadata || {}) as any;
        return {
          url: a.url,
          panelId: a.panelId || 0,
          duration: meta.duration || 3,
          text: meta.text || "",
        };
      });

    // Collect music track
    const musicAsset = allAssets.find(a => a.assetType === "music_segment");
    const musicTrack = musicAsset ? {
      url: musicAsset.url,
      duration: ((musicAsset.metadata as any)?.duration) || 0,
      isFallback: ((musicAsset.metadata as any)?.fallback) || false,
    } : null;

    if (videoClips.length === 0) {
      console.error("[Pipeline] No video clips found for assembly");
      throw new Error("No video clips available for assembly");
    }

    console.log(`[Pipeline] Assembly: ${videoClips.length} video clips, ${voiceClips.length} voice clips, music: ${musicTrack ? (musicTrack.isFallback ? 'fallback' : 'yes') : 'none'}`);

    await updateNodeProgress(runId, "assembly", "running", nodeStatuses, 82, totalCost, nodeCosts);

    // Run the real ffmpeg assembly
    const episode = await getEpisodeById(episodeId);
    const result = await assembleVideo({
      videoClips,
      voiceClips,
      musicTrack,
      episodeTitle: episode?.title || "Untitled Episode",
    });

    await updateNodeProgress(runId, "assembly", "running", nodeStatuses, 90, totalCost, nodeCosts);

    // Upload assembled video to S3
    const { url } = await storagePut(finalKey, result.videoBuffer, "video/mp4");
    await createPipelineAsset({
      pipelineRunId: runId,
      episodeId,
      assetType: "final_video",
      url,
      metadata: {
        duration: result.totalDuration,
        format: result.format,
        resolution: result.resolution,
        sizeBytes: result.videoBuffer.length,
        clipCount: videoClips.length,
        voiceClipCount: voiceClips.length,
        hasMusic: musicTrack ? !musicTrack.isFallback : false,
      } as any,
      nodeSource: "assembly",
    });

    await updateEpisode(episodeId, { videoUrl: url } as any);
    console.log(`[Pipeline] Final video assembled: ${result.totalDuration.toFixed(1)}s, ${(result.videoBuffer.length / 1024 / 1024).toFixed(1)}MB`);

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
    music_gen: "pending",
    assembly: "pending",
  };
  const nodeCosts: Record<string, number> = {};
  let totalCost = 0;
  let harnessCost = 0;

  await updatePipelineRun(runId, {
    status: "running",
    startedAt: new Date(),
    nodeStatuses: nodeStatuses as any,
    currentNode: "video_gen",
  });

  // Update episode status
  await updateEpisode(run.episodeId, { status: "pipeline" } as any);

  // Compile Production Bible for harness checks
  let bible: ProductionBibleData;
  try {
    bible = await getOrCompileProductionBible(run.projectId);
    console.log(`[Pipeline] Production Bible compiled for project ${run.projectId}`);
  } catch (err) {
    console.warn(`[Pipeline] Production Bible compilation failed, using defaults:`, err);
    bible = {
      version: 1,
      projectId: run.projectId,
      projectTitle: "Unknown",
      genre: ["unknown"],
      artStyle: "default",
      compiledAt: new Date().toISOString(),
      characters: [],
      characterNameMap: {},
      animationStyle: "default",
      styleMixing: null,
      colorGrading: "neutral",
      atmosphericEffects: null,
      aspectRatio: "16:9",
      voiceAssignments: {},
      audioConfig: null,
      musicConfig: null,
      openingStyle: "standard",
      endingStyle: "standard",
      pacing: "normal",
      subtitleConfig: null,
      episodes: [],
      qualityThresholds: {
        minImageScore: 6.0,
        minCharacterMatch: 7.0,
        minVideoScore: 5.5,
        minAudioScore: 6.0,
        maxRetries: 3,
        blockOnNsfw: true,
      },
    };
  }

  const baseContext: HarnessContext = {
    episodeId: run.episodeId,
    pipelineRunId: runId,
  };

  try {
    // ── Layer 1: Script Validation (pre-flight) ──
    console.log(`[Pipeline] Running Layer 1: Script Validation...`);
    const scriptSummary = await runHarnessGate(
      "Layer 1: Script Validation",
      scriptChecks,
      { ...baseContext, targetType: "episode" },
      bible,
      runId,
    );
    harnessCost += scriptSummary.totalCost;
    if (scriptSummary.shouldBlock) {
      throw new Error(`Pipeline blocked by Script Validation harness: ${scriptSummary.flaggedItems.map(f => f.checkName).join(", ")}`);
    }

    // Node 1: Video Generation (with native lip sync via Kling V3 Omni for dialogue panels)
    await updateNodeProgress(runId, "video_gen", "running", nodeStatuses, 5, totalCost, nodeCosts);
    totalCost = await videoGenAgent(runId, run.episodeId, run.projectId, nodeStatuses, nodeCosts);
    nodeStatuses.video_gen = "complete";
    nodeCosts.video_gen = NODE_COSTS.video_gen;
    await updateNodeProgress(runId, "video_gen", "complete", nodeStatuses, 22, totalCost, nodeCosts);

    // ── Layer 2+3: Visual + Video Quality (after video_gen) ──
    console.log(`[Pipeline] Running Layer 2: Visual Consistency + Layer 3: Video Quality...`);
    const visualSummary = await runHarnessGate(
      "Layer 2: Visual Consistency",
      visualChecks,
      { ...baseContext, targetType: "panel" },
      bible,
      runId,
    );
    harnessCost += visualSummary.totalCost;
    if (visualSummary.shouldBlock) {
      throw new Error(`Pipeline blocked by Visual Consistency harness: ${visualSummary.flaggedItems.map(f => f.checkName).join(", ")}`);
    }

    const videoSummary = await runHarnessGate(
      "Layer 3: Video Quality",
      videoChecks,
      { ...baseContext, targetType: "clip" },
      bible,
      runId,
    );
    harnessCost += videoSummary.totalCost;
    if (videoSummary.shouldBlock) {
      throw new Error(`Pipeline blocked by Video Quality harness: ${videoSummary.flaggedItems.map(f => f.checkName).join(", ")}`);
    }
    await updateNodeProgress(runId, "video_gen", "complete", nodeStatuses, 25, totalCost, nodeCosts);

    // Node 2: Voice Generation (supplementary high-quality TTS via ElevenLabs)
    await updateNodeProgress(runId, "voice_gen", "running", nodeStatuses, 30, totalCost, nodeCosts);
    totalCost = await voiceGenAgent(runId, run.episodeId, run.projectId, nodeStatuses, nodeCosts);
    nodeStatuses.voice_gen = "complete";
    nodeCosts.voice_gen = NODE_COSTS.voice_gen;
    await updateNodeProgress(runId, "voice_gen", "complete", nodeStatuses, 47, totalCost, nodeCosts);

    // ── Layer 4: Audio Quality (after voice_gen) ──
    console.log(`[Pipeline] Running Layer 4: Audio Quality...`);
    const audioSummary = await runHarnessGate(
      "Layer 4: Audio Quality",
      audioChecks,
      { ...baseContext, targetType: "clip" },
      bible,
      runId,
    );
    harnessCost += audioSummary.totalCost;
    if (audioSummary.shouldBlock) {
      throw new Error(`Pipeline blocked by Audio Quality harness: ${audioSummary.flaggedItems.map(f => f.checkName).join(", ")}`);
    }
    await updateNodeProgress(runId, "voice_gen", "complete", nodeStatuses, 50, totalCost, nodeCosts);

    // Node 3: Music Generation (MiniMax Music 2.6)
    await updateNodeProgress(runId, "music_gen", "running", nodeStatuses, 55, totalCost, nodeCosts);
    totalCost = await musicGenAgent(runId, run.episodeId, nodeStatuses, nodeCosts);
    nodeStatuses.music_gen = "complete";
    nodeCosts.music_gen = NODE_COSTS.music_gen;
    await updateNodeProgress(runId, "music_gen", "complete", nodeStatuses, 75, totalCost, nodeCosts);

    // Node 4: Assembly (final video + Cloudflare Stream + thumbnail)
    await updateNodeProgress(runId, "assembly", "running", nodeStatuses, 80, totalCost, nodeCosts);
    totalCost = await assemblyAgent(runId, run.episodeId, nodeStatuses, nodeCosts);
    nodeStatuses.assembly = "complete";
    nodeCosts.assembly = NODE_COSTS.assembly;
    await updateNodeProgress(runId, "assembly", "complete", nodeStatuses, 95, totalCost, nodeCosts);

    // ── Layer 5: Integration Validation (after assembly) ──
    console.log(`[Pipeline] Running Layer 5: Integration Validation...`);
    const integrationSummary = await runHarnessGate(
      "Layer 5: Integration Validation",
      integrationChecks,
      { ...baseContext, targetType: "episode" },
      bible,
      runId,
    );
    harnessCost += integrationSummary.totalCost;
    // Layer 5 blocks don't stop the pipeline (video is already assembled)
    // but they flag the episode for human review
    if (integrationSummary.shouldBlock) {
      console.warn(`[Pipeline] Layer 5 BLOCK — episode flagged for human review`);
    }

    // Compute overall harness score across all layers
    const allSummaries = [scriptSummary, visualSummary, videoSummary, audioSummary, integrationSummary];
    const overallHarnessScore = allSummaries.reduce((sum, s) => sum + s.overallScore, 0) / allSummaries.length;
    const totalFlagged = allSummaries.reduce((sum, s) => sum + s.flaggedItems.length, 0);
    const totalPassed = allSummaries.reduce((sum, s) => sum + s.passed, 0);
    const totalChecks = allSummaries.reduce((sum, s) => sum + s.totalChecks, 0);

    console.log(`[Pipeline] Harness complete: ${totalPassed}/${totalChecks} passed, score=${overallHarnessScore.toFixed(1)}, cost=$${harnessCost.toFixed(3)}, flagged=${totalFlagged}`);

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
      content: `Episode pipeline run #${runId} completed. Harness: ${totalPassed}/${totalChecks} passed (score: ${overallHarnessScore.toFixed(1)}/10). Cost: $${(totalCost / 100).toFixed(2)} + $${harnessCost.toFixed(3)} harness. ${totalFlagged > 0 ? `${totalFlagged} item(s) flagged for review.` : "No issues found."}`,
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
