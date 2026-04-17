/**
 * Set Episode 1 to "locked" status and trigger the pipeline via tRPC API.
 * Uses jose to create a proper session JWT matching the server's auth.
 */
import mysql from "mysql2/promise";
import { SignJWT } from "jose";

const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;
const APP_ID = process.env.VITE_APP_ID;
const BASE_URL = "http://localhost:3000";

if (!DATABASE_URL || !JWT_SECRET) {
  console.error("Missing env vars:", { DATABASE_URL: !!DATABASE_URL, JWT_SECRET: !!JWT_SECRET });
  process.exit(1);
}

const connection = await mysql.createConnection(DATABASE_URL);

// Step 1: Set episode status to "locked"
console.log("Setting Episode 1 status to 'locked'...");
await connection.execute("UPDATE episodes SET status = 'locked' WHERE id = 1");
const [ep] = await connection.execute("SELECT id, title, status FROM episodes WHERE id = 1");
console.log(`Episode 1: "${ep[0].title}" — status: ${ep[0].status}`);

// Step 2: Get user info
const [users] = await connection.execute("SELECT id, openId, name FROM users LIMIT 1");
if (users.length === 0) {
  console.error("No users found");
  process.exit(1);
}
const user = users[0];
console.log(`User: ${user.name} (ID: ${user.id}, openId: ${user.openId})`);

// Step 3: Create a proper session JWT using jose (same as server)
const secretKey = new TextEncoder().encode(JWT_SECRET);
const token = await new SignJWT({
  openId: user.openId,
  appId: APP_ID || "awakli",
  name: user.name || "",
})
  .setProtectedHeader({ alg: "HS256", typ: "JWT" })
  .setExpirationTime("1h")
  .sign(secretKey);

console.log(`Session token created (${token.length} chars)`);

// Step 4: Call the tRPC pipeline.start mutation
const tRPCUrl = `${BASE_URL}/api/trpc/pipeline.start`;
console.log(`\nCalling ${tRPCUrl}...`);

const resp = await fetch(tRPCUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Cookie": `app_session_id=${token}`,
  },
  body: JSON.stringify({
    json: { episodeId: 1, projectId: 1 },
  }),
});

const responseText = await resp.text();
console.log(`Response: ${resp.status}`);

if (resp.ok) {
  try {
    const data = JSON.parse(responseText);
    const runId = data?.result?.data?.json?.runId;
    if (runId) {
      console.log(`\n✓ Pipeline started successfully! Run ID: ${runId}`);
      console.log(`\nMonitor progress:`);
      console.log(`  - UI: /studio/project/1/pipeline`);
      console.log(`  - Logs: tail -f .manus-logs/devserver.log | grep Pipeline`);
    } else {
      console.log("Response:", responseText.slice(0, 500));
    }
  } catch (e) {
    console.log("Response:", responseText.slice(0, 500));
  }
} else {
  console.error(`Failed: ${resp.status}`);
  console.error(responseText.slice(0, 500));
}

// Clean up the manually created run from previous attempt
await connection.execute("DELETE FROM pipeline_runs WHERE id IN (60001, 60002)");
console.log("Cleaned up manual pipeline runs");

await connection.end();
