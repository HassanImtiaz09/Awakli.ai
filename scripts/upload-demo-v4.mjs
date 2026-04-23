/**
 * Upload V4 demo video to Cloudflare Stream and update platform config.
 * This script calls the Cloudflare Stream API directly using env vars.
 */

const VIDEO_URL = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663430072618/cHcsPupRJWHEfZur.mp4";

async function main() {
  // Load env from the server's env module
  const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
  const CLOUDFLARE_STREAM_TOKEN = process.env.CLOUDFLARE_STREAM_TOKEN;
  const DATABASE_URL = process.env.DATABASE_URL;

  if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_STREAM_TOKEN) {
    console.error("Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_STREAM_TOKEN env vars");
    process.exit(1);
  }

  console.log("=== Uploading V4 demo video to Cloudflare Stream ===");
  console.log(`Video URL: ${VIDEO_URL}`);
  console.log(`Account ID: ${CLOUDFLARE_ACCOUNT_ID.slice(0, 8)}...`);

  // Step 1: Upload from URL
  const uploadRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream/copy`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CLOUDFLARE_STREAM_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: VIDEO_URL,
        meta: { name: "awakli-demo-v4" },
      }),
    }
  );

  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    console.error(`Upload failed (${uploadRes.status}): ${text}`);
    process.exit(1);
  }

  const uploadData = await uploadRes.json();
  if (!uploadData.success) {
    console.error("Upload failed:", uploadData.errors);
    process.exit(1);
  }

  const uid = uploadData.result.uid;
  console.log(`Upload initiated: uid=${uid}`);

  // Step 2: Poll until ready
  console.log("Polling for readiness...");
  const startTime = Date.now();
  const TIMEOUT = 10 * 60 * 1000; // 10 minutes
  const INTERVAL = 5000; // 5 seconds

  while (Date.now() - startTime < TIMEOUT) {
    const statusRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream/${uid}`,
      {
        headers: {
          Authorization: `Bearer ${CLOUDFLARE_STREAM_TOKEN}`,
        },
      }
    );

    const statusData = await statusRes.json();
    const video = statusData.result;

    if (video.readyToStream) {
      console.log("Video is ready to stream!");
      
      // Derive embed URL
      const embedUrl = video.preview ? video.preview.replace("/watch", "/iframe") : `https://cloudflarestream.com/${uid}/iframe`;
      const thumbnailUrl = video.thumbnail;
      
      console.log(`\nStream UID: ${uid}`);
      console.log(`Embed URL: ${embedUrl}`);
      console.log(`Thumbnail URL: ${thumbnailUrl}`);
      console.log(`Duration: ${video.duration}s`);
      console.log(`Preview: ${video.preview}`);

      // Step 3: Update platform config in the database
      if (DATABASE_URL) {
        console.log("\n=== Updating platform config ===");
        // Use mysql2 to update the platform_config table
        const mysql = await import("mysql2/promise");
        const connection = await mysql.createConnection(DATABASE_URL);
        
        const configs = [
          ["demo_video_stream_id", uid],
          ["demo_video_embed_url", embedUrl],
          ["demo_video_poster_url", thumbnailUrl],
          ["demo_video_status", "stream_ready"],
          ["demo_video_updated_at", new Date().toISOString()],
        ];

        for (const [key, value] of configs) {
          await connection.execute(
            `INSERT INTO platform_config (\`key\`, \`value\`) VALUES (?, ?) ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`)`,
            [key, value]
          );
          console.log(`  Set ${key} = ${value.slice(0, 60)}${value.length > 60 ? "..." : ""}`);
        }

        await connection.end();
        console.log("Platform config updated successfully!");
      } else {
        console.log("\nNo DATABASE_URL — skipping platform config update.");
        console.log("Manually set these in platform_config:");
        console.log(`  demo_video_stream_id = ${uid}`);
        console.log(`  demo_video_embed_url = ${embedUrl}`);
        console.log(`  demo_video_poster_url = ${thumbnailUrl}`);
      }

      return;
    }

    const state = video.status?.state || "unknown";
    const pct = video.status?.pctComplete || "?";
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`  [${elapsed}s] Processing: state=${state}, pct=${pct}`);

    await new Promise((r) => setTimeout(r, INTERVAL));
  }

  console.error("Timeout waiting for video to be ready");
  process.exit(1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
