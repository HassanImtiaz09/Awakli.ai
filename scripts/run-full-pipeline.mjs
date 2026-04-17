/**
 * Full Pipeline Runner — Manual orchestration script
 * 
 * This script:
 * 1. Polls the 5 existing Kling tasks from run 60004
 * 2. Submits remaining 8 panels in batches of 5 (waiting between batches)
 * 3. Generates voice for all dialogue panels
 * 4. Generates background music
 * 5. Assembles the final video
 */
import mysql from "mysql2/promise";
import { SignJWT } from "jose";

const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;
const APP_ID = process.env.VITE_APP_ID;
const BASE_URL = "http://localhost:3000";

const conn = await mysql.createConnection(DATABASE_URL);

// Get user for auth
const [users] = await conn.execute("SELECT id, openId, name FROM users LIMIT 1");
const user = users[0];

// Create session token
const secretKey = new TextEncoder().encode(JWT_SECRET);
const token = await new SignJWT({ openId: user.openId, appId: APP_ID || "awakli", name: user.name || "" })
  .setProtectedHeader({ alg: "HS256", typ: "JWT" })
  .setExpirationTime("2h")
  .sign(secretKey);

const authHeaders = {
  "Content-Type": "application/json",
  "Cookie": `app_session_id=${token}`,
};

// Helper: call tRPC
async function trpcCall(procedure, input) {
  const url = `${BASE_URL}/api/trpc/${procedure}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ json: input }),
  });
  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

// Helper: call tRPC query
async function trpcQuery(procedure, input) {
  const encoded = encodeURIComponent(JSON.stringify({ json: input }));
  const url = `${BASE_URL}/api/trpc/${procedure}?input=${encoded}`;
  const resp = await fetch(url, { headers: authHeaders });
  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

// Step 1: Reset run 60004 and create a fresh run with the new batched code
console.log("=== Step 1: Reset and start fresh pipeline run ===");
await conn.execute("UPDATE pipeline_runs SET status = 'failed' WHERE id = 60004");
await conn.execute("UPDATE episodes SET status = 'locked' WHERE id = 1");

console.log("Starting new pipeline run...");
const startResult = await trpcCall("pipeline.start", { episodeId: 1, projectId: 1 });
const runId = startResult?.result?.data?.json?.runId;

if (!runId) {
  console.error("Failed to start pipeline:", JSON.stringify(startResult).slice(0, 500));
  process.exit(1);
}

console.log(`✓ Pipeline run started: ID=${runId}`);
console.log("Pipeline is now running asynchronously on the server.");
console.log("The batched video gen will submit 5 panels at a time, wait for completion, then submit the next batch.");
console.log("\nMonitor with: grep 'Pipeline\\|Router\\|Voice\\|Music\\|Assembly' .manus-logs/devserver.log | tail -50");

await conn.end();
