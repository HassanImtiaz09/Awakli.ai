/**
 * Generate manga panel images for all Episode 1 panels that don't have images yet.
 * Uses the internal ImageService API and storage upload (same as server helpers).
 */
import mysql from "mysql2/promise";
import crypto from "crypto";

const DATABASE_URL = process.env.DATABASE_URL;
const FORGE_API_URL = process.env.BUILT_IN_FORGE_API_URL;
const FORGE_API_KEY = process.env.BUILT_IN_FORGE_API_KEY;

if (!DATABASE_URL || !FORGE_API_URL || !FORGE_API_KEY) {
  console.error("Missing env vars");
  process.exit(1);
}

const connection = await mysql.createConnection(DATABASE_URL);

function ensureTrailingSlash(v) { return v.endsWith("/") ? v : `${v}/`; }
function normalizeKey(k) { return k.replace(/^\/+/, ""); }
function appendHashSuffix(relKey) {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const segmentStart = relKey.lastIndexOf("/");
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1 || lastDot <= segmentStart) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

async function storagePut(relKey, buffer, contentType) {
  const baseUrl = FORGE_API_URL.replace(/\/+$/, "");
  const key = appendHashSuffix(normalizeKey(relKey));
  const url = new URL("v1/storage/upload", ensureTrailingSlash(baseUrl));
  url.searchParams.set("path", normalizeKey(key));
  
  const blob = new Blob([buffer], { type: contentType });
  const form = new FormData();
  form.append("file", blob, key.split("/").pop() ?? key);
  
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${FORGE_API_KEY}` },
    body: form,
  });
  
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Storage upload failed: ${resp.status} ${text}`);
  }
  
  const data = await resp.json();
  return { url: data.url, key };
}

async function generateImage(prompt) {
  const baseUrl = ensureTrailingSlash(FORGE_API_URL);
  const fullUrl = new URL("images.v1.ImageService/GenerateImage", baseUrl).toString();
  
  const resp = await fetch(fullUrl, {
    method: "POST",
    headers: {
      "accept": "application/json",
      "content-type": "application/json",
      "connect-protocol-version": "1",
      "authorization": `Bearer ${FORGE_API_KEY}`,
    },
    body: JSON.stringify({
      prompt,
      original_images: [],
    }),
  });
  
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Image gen failed: ${resp.status} ${text}`);
  }
  
  const data = await resp.json();
  const base64Data = data.image?.b64Json;
  if (!base64Data) throw new Error("No image data in response");
  
  const buffer = Buffer.from(base64Data, "base64");
  const key = `generated/panel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
  const { url } = await storagePut(key, buffer, data.image.mimeType || "image/png");
  return url;
}

// Get all panels for Episode 1
const [panels] = await connection.execute(
  "SELECT id, sceneNumber, panelNumber, visualDescription, cameraAngle, dialogue, sfx FROM panels WHERE episodeId = 1 ORDER BY sceneNumber, panelNumber"
);

console.log(`Found ${panels.length} panels for Episode 1\n`);

const STYLE_PROMPT = "shonen anime style, dynamic action, bold lines, vibrant colors";
const CAMERA_MAP = {
  "wide": "wide angle shot, establishing shot",
  "medium": "medium shot, waist-up framing",
  "close-up": "close-up shot, face detail",
  "extreme-close-up": "extreme close-up, eye detail",
  "birds-eye": "bird's eye view, top-down perspective",
};
const KAEL_DESC = "young male warrior with spiky dark hair, determined eyes, wearing a rugged hunter's outfit with leather armor, athletic build";

let generated = 0;
let skipped = 0;

for (const panel of panels) {
  const [existing] = await connection.execute("SELECT imageUrl FROM panels WHERE id = ?", [panel.id]);
  if (existing[0]?.imageUrl) {
    console.log(`Panel ${panel.sceneNumber}.${panel.panelNumber}: already has image, skipping`);
    skipped++;
    continue;
  }

  const cameraDesc = CAMERA_MAP[panel.cameraAngle] || "medium shot";
  const prompt = [
    STYLE_PROMPT,
    cameraDesc,
    panel.visualDescription || "anime scene",
    `featuring ${KAEL_DESC}`,
    "high quality, detailed, professional manga art, cinematic lighting",
    "fantasy mountain village setting, misty ancient forest, mystical cave, glowing sword",
  ].filter(Boolean).join(", ");

  console.log(`Generating Panel ${panel.sceneNumber}.${panel.panelNumber} (ID: ${panel.id})...`);

  try {
    const imageUrl = await generateImage(prompt);
    await connection.execute("UPDATE panels SET imageUrl = ?, fluxPrompt = ? WHERE id = ?", [imageUrl, prompt, panel.id]);
    console.log(`  ✓ Done: ${imageUrl.slice(0, 80)}...`);
    generated++;
  } catch (err) {
    console.error(`  ✗ Failed: ${err.message}`);
  }

  await new Promise(r => setTimeout(r, 2000));
}

console.log(`\n=== Summary ===`);
console.log(`Generated: ${generated}, Skipped: ${skipped}, Failed: ${panels.length - generated - skipped}`);

const [finalPanels] = await connection.execute("SELECT id, imageUrl FROM panels WHERE episodeId = 1");
const withImages = finalPanels.filter(p => p.imageUrl);
console.log(`Panels with images: ${withImages.length}/${finalPanels.length}`);

await connection.end();
