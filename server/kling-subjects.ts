/**
 * Kling Subject Library Service Module
 * Manages character elements with voice binding for native lip sync in V3 Omni.
 *
 * Flow:
 * 1. Create custom voice from audio sample → get voice_id
 * 2. Create character element with reference images + voice binding → get element_id
 * 3. Use element_id in omni-video requests with <<<element_N>>> voice tags
 */

import { ENV } from "./_core/env";

// ─── Constants ──────────────────────────────────────────────────────────────
const BASE_URL = "https://api-singapore.klingai.com";
const TOKEN_TTL_SECONDS = 1800;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CreateVoiceParams {
  /** Voice name (max 20 chars) */
  voiceName: string;
  /** URL to audio file (.mp3/.wav, 5-30s, clean single speaker) */
  voiceUrl?: string;
  /** Reference a historical generated video ID for voice extraction */
  videoId?: string;
  /** Callback URL for async notification */
  callbackUrl?: string;
  /** Custom task ID for tracking */
  externalTaskId?: string;
}

export interface VoiceInfo {
  voiceId: string;
  voiceName: string;
  trialUrl?: string;
  ownedBy: string;
}

export interface VoiceTaskResponse {
  code: number;
  message: string;
  request_id: string;
  data: {
    task_id: string;
    task_info?: { external_task_id?: string };
    task_status: "submitted" | "processing" | "succeed" | "failed";
    task_status_msg?: string;
    task_result?: {
      voice_info?: VoiceInfo;
    };
    created_at: number;
    updated_at: number;
  };
}

export interface CreateElementParams {
  /** Element name (max 20 chars) */
  elementName: string;
  /** Element description (max 100 chars) */
  elementDescription: string;
  /** Reference type: image or video */
  referenceType: "image_refer" | "video_refer";
  /** For image_refer: frontal image + optional additional angles */
  imageList?: {
    frontalImage: string;
    referImages?: Array<{ imageUrl: string }>;
  };
  /** For video_refer: reference video URL */
  videoList?: {
    referVideos: Array<{ videoUrl: string }>;
  };
  /** Voice ID to bind (from custom voice API) */
  voiceId?: string;
  /** Tags: o_102 = Character, o_103 = Animal, etc. */
  tagList?: Array<{ tagId: string }>;
  /** Callback URL */
  callbackUrl?: string;
  /** Custom task ID */
  externalTaskId?: string;
}

export interface ElementInfo {
  elementId: number;
  elementName: string;
  elementDescription: string;
  referenceType: string;
  elementImageList?: Record<string, unknown>;
  elementVideoList?: Record<string, unknown>;
  elementVoiceInfo?: VoiceInfo;
  tagList?: Array<{ tagId: string }>;
  ownedBy: string;
  status: "succeed" | "deleted";
}

export interface ElementTaskResponse {
  code: number;
  message: string;
  request_id: string;
  data: {
    task_id: string;
    task_info?: { external_task_id?: string };
    task_status: "submitted" | "processing" | "succeed" | "failed";
    task_status_msg?: string;
    task_result?: {
      elements?: Array<{
        element_id: number;
        element_name: string;
        element_description: string;
        reference_type: string;
        element_image_list?: Record<string, unknown>;
        element_video_list?: Record<string, unknown>;
        element_voice_info?: {
          voice_id: string;
          voice_name: string;
          trial_url?: string;
          owned_by: string;
        };
        tag_list?: Array<{ tag_id: string }>;
        owned_by: string;
        status: string;
      }>;
    };
    final_unit_deduction?: string;
    created_at: number;
    updated_at: number;
  };
}

export interface ElementListResponse {
  code: number;
  message: string;
  request_id: string;
  data: Array<ElementTaskResponse["data"]>;
}

export interface DeleteResponse {
  code: number;
  message: string;
  request_id: string;
  data: {
    task_id: string;
    task_status: string;
  };
}

// ─── JWT Token Generation ───────────────────────────────────────────────────

async function generateToken(): Promise<string> {
  const accessKey = ENV.klingAccessKey;
  const secretKey = ENV.klingSecretKey;

  if (!accessKey || !secretKey) {
    throw new Error("Kling AI credentials not configured (KLING_ACCESS_KEY, KLING_SECRET_KEY)");
  }

  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: accessKey,
    exp: now + TOKEN_TTL_SECONDS,
    nbf: now - 5,
    iat: now,
  };

  const encode = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");

  const headerB64 = encode(header);
  const payloadB64 = encode(payload);
  const signingInput = `${headerB64}.${payloadB64}`;

  const { createHmac } = await import("crypto");
  const signature = createHmac("sha256", secretKey)
    .update(signingInput)
    .digest("base64url");

  return `${signingInput}.${signature}`;
}

// ─── HTTP Helper ────────────────────────────────────────────────────────────

async function klingRequest<T>(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
  timeoutMs = 30000
): Promise<T> {
  const token = await generateToken();
  const url = `${BASE_URL}${path}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Kling API ${method} ${path} failed: ${res.status} ${res.statusText} — ${text}`);
    }

    const json = (await res.json()) as T;
    return json;
  } finally {
    clearTimeout(timer);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOM VOICE API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a custom voice from an audio sample.
 * The audio should be clean, 5-30s, single speaker.
 */
export async function createCustomVoice(
  params: CreateVoiceParams
): Promise<VoiceTaskResponse> {
  const body: Record<string, unknown> = {
    voice_name: params.voiceName,
  };

  if (params.voiceUrl) body.voice_url = params.voiceUrl;
  if (params.videoId) body.video_id = params.videoId;
  if (params.callbackUrl) body.callback_url = params.callbackUrl;
  if (params.externalTaskId) body.external_task_id = params.externalTaskId;

  return klingRequest<VoiceTaskResponse>("POST", "/v1/general/custom-voices", body);
}

/**
 * Query a custom voice task by task ID.
 */
export async function queryCustomVoice(
  taskId: string
): Promise<VoiceTaskResponse> {
  return klingRequest<VoiceTaskResponse>("GET", `/v1/general/custom-voices/${taskId}`);
}

/**
 * List all custom voices (paginated).
 */
export async function listCustomVoices(
  pageNum = 1,
  pageSize = 30
): Promise<{ code: number; message: string; data: VoiceTaskResponse["data"][] }> {
  return klingRequest("GET", `/v1/general/custom-voices?pageNum=${pageNum}&pageSize=${pageSize}`);
}

/**
 * List preset voices available from Kling.
 */
export async function listPresetVoices(
  pageNum = 1,
  pageSize = 30
): Promise<{ code: number; message: string; data: VoiceTaskResponse["data"][] }> {
  return klingRequest("GET", `/v1/general/presets-voices?pageNum=${pageNum}&pageSize=${pageSize}`);
}

/**
 * Delete a custom voice.
 */
export async function deleteCustomVoice(
  voiceId: string
): Promise<DeleteResponse> {
  return klingRequest<DeleteResponse>("POST", "/v1/general/delete-voices", {
    voice_id: voiceId,
  });
}

/**
 * Poll a custom voice task until it succeeds or fails.
 */
export async function pollVoiceUntilReady(
  taskId: string,
  opts?: { maxWaitMs?: number; intervalMs?: number; onProgress?: (status: string) => void }
): Promise<VoiceTaskResponse> {
  const maxWait = opts?.maxWaitMs ?? 5 * 60 * 1000; // 5 min default
  const interval = opts?.intervalMs ?? 5000;
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    const result = await queryCustomVoice(taskId);
    const status = result.data.task_status;

    opts?.onProgress?.(status);

    if (status === "succeed") return result;
    if (status === "failed") {
      throw new Error(`Voice creation failed: ${result.data.task_status_msg || "unknown error"}`);
    }

    await new Promise((r) => setTimeout(r, interval));
  }

  throw new Error(`Voice creation timed out after ${maxWait / 1000}s`);
}

/**
 * Full voice creation pipeline: submit → poll → return voice info.
 */
export async function createAndWaitForVoice(
  params: CreateVoiceParams,
  opts?: { maxWaitMs?: number; onProgress?: (status: string) => void }
): Promise<{ taskId: string; voiceId: string; voiceName: string; trialUrl?: string }> {
  const createResult = await createCustomVoice(params);
  if (createResult.code !== 0) {
    throw new Error(`Voice creation failed: ${createResult.message}`);
  }

  const taskId = createResult.data.task_id;
  console.log(`[Kling Subjects] Voice task created: ${taskId} for "${params.voiceName}"`);

  const finalResult = await pollVoiceUntilReady(taskId, opts);

  const voiceInfo = finalResult.data.task_result?.voice_info;
  if (!voiceInfo?.voiceId) {
    // The voice_id might be in a different format from the API
    // Try to extract from the raw response
    const raw = finalResult.data.task_result as Record<string, unknown> | undefined;
    const rawVoiceInfo = raw?.voice_info as Record<string, unknown> | undefined;
    const voiceId = rawVoiceInfo?.voice_id as string | undefined;
    if (!voiceId) {
      throw new Error(`Voice task ${taskId} succeeded but no voice_id returned`);
    }
    return {
      taskId,
      voiceId,
      voiceName: (rawVoiceInfo?.voice_name as string) ?? params.voiceName,
      trialUrl: rawVoiceInfo?.trial_url as string | undefined,
    };
  }

  return {
    taskId,
    voiceId: voiceInfo.voiceId,
    voiceName: voiceInfo.voiceName,
    trialUrl: voiceInfo.trialUrl,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ELEMENT (CHARACTER) API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a character element with optional voice binding.
 * For image-based elements: provide frontal image + optional additional angles.
 * For video-based elements: provide a 3-8s reference video.
 */
export async function createElement(
  params: CreateElementParams
): Promise<ElementTaskResponse> {
  const body: Record<string, unknown> = {
    element_name: params.elementName,
    element_description: params.elementDescription,
    reference_type: params.referenceType,
  };

  if (params.imageList) {
    body.element_image_list = {
      frontal_image: params.imageList.frontalImage,
      refer_images: params.imageList.referImages?.map((img) => ({
        image_url: img.imageUrl,
      })),
    };
  }

  if (params.videoList) {
    body.element_video_list = {
      refer_videos: params.videoList.referVideos.map((v) => ({
        video_url: v.videoUrl,
      })),
    };
  }

  if (params.voiceId) body.element_voice_id = params.voiceId;
  if (params.tagList) {
    body.tag_list = params.tagList.map((t) => ({ tag_id: t.tagId }));
  }
  if (params.callbackUrl) body.callback_url = params.callbackUrl;
  if (params.externalTaskId) body.external_task_id = params.externalTaskId;

  return klingRequest<ElementTaskResponse>("POST", "/v1/general/advanced-custom-elements", body);
}

/**
 * Query a character element task by task ID.
 */
export async function queryElement(
  taskId: string
): Promise<ElementTaskResponse> {
  return klingRequest<ElementTaskResponse>("GET", `/v1/general/advanced-custom-elements/${taskId}`);
}

/**
 * List all custom elements (paginated).
 */
export async function listElements(
  pageNum = 1,
  pageSize = 30
): Promise<ElementListResponse> {
  return klingRequest<ElementListResponse>(
    "GET",
    `/v1/general/advanced-custom-elements?pageNum=${pageNum}&pageSize=${pageSize}`
  );
}

/**
 * List preset elements from Kling's library.
 */
export async function listPresetElements(
  pageNum = 1,
  pageSize = 30
): Promise<ElementListResponse> {
  return klingRequest<ElementListResponse>(
    "GET",
    `/v1/general/advanced-presets-elements?pageNum=${pageNum}&pageSize=${pageSize}`
  );
}

/**
 * Delete a custom element by element_id.
 */
export async function deleteElement(
  elementId: string
): Promise<DeleteResponse> {
  return klingRequest<DeleteResponse>("POST", "/v1/general/delete-elements", {
    element_id: elementId,
  });
}

/**
 * Poll an element creation task until it succeeds or fails.
 */
export async function pollElementUntilReady(
  taskId: string,
  opts?: { maxWaitMs?: number; intervalMs?: number; onProgress?: (status: string) => void }
): Promise<ElementTaskResponse> {
  const maxWait = opts?.maxWaitMs ?? 10 * 60 * 1000; // 10 min default
  const interval = opts?.intervalMs ?? 5000;
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    const result = await queryElement(taskId);
    const status = result.data.task_status;

    opts?.onProgress?.(status);

    if (status === "succeed") return result;
    if (status === "failed") {
      throw new Error(`Element creation failed: ${result.data.task_status_msg || "unknown error"}`);
    }

    await new Promise((r) => setTimeout(r, interval));
  }

  throw new Error(`Element creation timed out after ${maxWait / 1000}s`);
}

/**
 * Full element creation pipeline: submit → poll → return element info.
 * Creates a character element with image references and optional voice binding.
 */
export async function createAndWaitForElement(
  params: CreateElementParams,
  opts?: { maxWaitMs?: number; onProgress?: (status: string) => void }
): Promise<{
  taskId: string;
  elementId: number;
  elementName: string;
  voiceInfo?: { voiceId: string; voiceName: string; trialUrl?: string };
}> {
  const createResult = await createElement(params);
  if (createResult.code !== 0) {
    throw new Error(`Element creation failed: ${createResult.message}`);
  }

  const taskId = createResult.data.task_id;
  console.log(`[Kling Subjects] Element task created: ${taskId} for "${params.elementName}"`);

  const finalResult = await pollElementUntilReady(taskId, opts);

  const elements = finalResult.data.task_result?.elements;
  if (!elements || elements.length === 0) {
    throw new Error(`Element task ${taskId} succeeded but no elements returned`);
  }

  const element = elements[0];
  const voiceInfo = element.element_voice_info;

  console.log(
    `[Kling Subjects] Element created: ID=${element.element_id}, name="${element.element_name}"` +
      (voiceInfo ? `, voice="${voiceInfo.voice_name}"` : ", no voice bound")
  );

  return {
    taskId,
    elementId: element.element_id,
    elementName: element.element_name,
    voiceInfo: voiceInfo
      ? {
          voiceId: voiceInfo.voice_id,
          voiceName: voiceInfo.voice_name,
          trialUrl: voiceInfo.trial_url,
        }
      : undefined,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HIGH-LEVEL: Create Character with Voice for Lip Sync
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Full character creation pipeline for native lip sync:
 * 1. Create custom voice from audio sample
 * 2. Create character element with image references + voice binding
 * 3. Return element_id ready for use in omni-video element_list
 *
 * @param characterName - Character name (max 20 chars)
 * @param characterDescription - Character description (max 100 chars)
 * @param frontalImageUrl - URL to frontal reference image
 * @param voiceAudioUrl - URL to voice audio sample (.mp3/.wav, 5-30s)
 * @param additionalImages - Optional additional reference images
 */
export async function createCharacterForLipSync(params: {
  characterName: string;
  characterDescription: string;
  frontalImageUrl: string;
  voiceAudioUrl: string;
  additionalImages?: string[];
  onProgress?: (step: string, status: string) => void;
}): Promise<{
  elementId: number;
  voiceId: string;
  voiceTaskId: string;
  elementTaskId: string;
}> {
  const { characterName, characterDescription, frontalImageUrl, voiceAudioUrl, additionalImages, onProgress } = params;

  // Step 1: Create custom voice
  onProgress?.("voice", "creating");
  const voiceResult = await createAndWaitForVoice(
    { voiceName: `${characterName}-voice`, voiceUrl: voiceAudioUrl },
    { onProgress: (status) => onProgress?.("voice", status) }
  );
  onProgress?.("voice", "ready");
  console.log(`[Kling Subjects] Voice ready: ${voiceResult.voiceId} for "${characterName}"`);

  // Step 2: Create character element with voice binding
  onProgress?.("element", "creating");
  const elementResult = await createAndWaitForElement(
    {
      elementName: characterName,
      elementDescription: characterDescription,
      referenceType: "image_refer",
      imageList: {
        frontalImage: frontalImageUrl,
        referImages: additionalImages?.map((url) => ({ imageUrl: url })),
      },
      voiceId: voiceResult.voiceId,
      tagList: [{ tagId: "o_102" }], // Character tag
    },
    { onProgress: (status) => onProgress?.("element", status) }
  );
  onProgress?.("element", "ready");

  console.log(
    `[Kling Subjects] Character "${characterName}" ready for lip sync: ` +
      `elementId=${elementResult.elementId}, voiceId=${voiceResult.voiceId}`
  );

  return {
    elementId: elementResult.elementId,
    voiceId: voiceResult.voiceId,
    voiceTaskId: voiceResult.taskId,
    elementTaskId: elementResult.taskId,
  };
}

/**
 * Build a prompt with voice tags for native lip sync.
 * Maps character names to their element positions in the element_list.
 *
 * @example
 * buildLipSyncPrompt(
 *   "A dramatic scene in a dark corridor.",
 *   [
 *     { characterName: "Kaelis", dialogue: "We need to move. Now." },
 *     { characterName: "Mira", dialogue: "I can't leave them behind!" },
 *   ],
 *   ["Kaelis", "Mira"] // element_list order
 * )
 * // Returns: "A dramatic scene in a dark corridor. <<<element_1>>> says, 'We need to move. Now.' <<<element_2>>> responds, 'I can't leave them behind!'"
 */
export function buildLipSyncPrompt(
  sceneDescription: string,
  dialogueLines: Array<{ characterName: string; dialogue: string; emotion?: string }>,
  elementOrder: string[]
): string {
  const parts = [sceneDescription];

  for (const line of dialogueLines) {
    const elementIndex = elementOrder.indexOf(line.characterName) + 1;
    if (elementIndex <= 0) {
      // Character not in element_list — include dialogue without voice tag
      parts.push(`${line.characterName} says, '${line.dialogue}'`);
      continue;
    }

    const emotionPrefix = line.emotion ? `${line.emotion}, ` : "";
    parts.push(`<<<element_${elementIndex}>>> ${emotionPrefix}says, '${line.dialogue}'`);
  }

  return parts.join(" ");
}
