import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { sql } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const connection = await mysql.createConnection(DATABASE_URL);
const db = drizzle(connection);

// Get projects
const [projects] = await connection.execute("SELECT id, title, animeStyle, genre, tone, status FROM projects LIMIT 5");
console.log("\n=== PROJECTS ===");
console.log(JSON.stringify(projects, null, 2));

// Get episodes for project 1
const [episodes] = await connection.execute("SELECT id, projectId, episodeNumber, title, status, synopsis FROM episodes WHERE projectId = 1 ORDER BY episodeNumber");
console.log("\n=== EPISODES (Project 1) ===");
console.log(JSON.stringify(episodes, null, 2));

if (episodes.length > 0) {
  const ep1 = episodes[0];
  
  // Get panels for episode 1
  const [panels] = await connection.execute(
    "SELECT id, episodeId, sceneNumber, panelNumber, visualDescription, cameraAngle, dialogue, sfx, transition, imageUrl, reviewStatus FROM panels WHERE episodeId = ? ORDER BY sceneNumber, panelNumber",
    [ep1.id]
  );
  console.log(`\n=== PANELS (Episode ${ep1.id}) === Total: ${panels.length}`);
  for (const p of panels) {
    const dialogueStr = p.dialogue ? (typeof p.dialogue === 'string' ? p.dialogue : JSON.stringify(p.dialogue)).slice(0, 100) : 'none';
    console.log(`  Panel ${p.sceneNumber}.${p.panelNumber}: camera=${p.cameraAngle}, status=${p.reviewStatus}, hasImage=${!!p.imageUrl}, dialogue=${dialogueStr}`);
  }
  
  // Count panels with images
  const panelsWithImages = panels.filter(p => p.imageUrl);
  console.log(`\n  Panels with images: ${panelsWithImages.length}/${panels.length}`);
}

// Get characters for project 1
const [characters] = await connection.execute("SELECT id, name, role, visualTraits, loraModelUrl, loraStatus FROM characters WHERE projectId = 1");
console.log("\n=== CHARACTERS (Project 1) ===");
for (const c of characters) {
  console.log(`  ${c.name} (${c.role}): loraStatus=${c.loraStatus || 'none'}, hasLora=${!!c.loraModelUrl}`);
}

// Check existing pipeline runs
const [runs] = await connection.execute("SELECT id, episodeId, status, progress, currentNode, totalCost FROM pipeline_runs WHERE projectId = 1 ORDER BY id DESC LIMIT 5");
console.log("\n=== PIPELINE RUNS (Project 1) ===");
console.log(JSON.stringify(runs, null, 2));

// Check pipeline assets
const [assets] = await connection.execute("SELECT id, pipelineRunId, assetType, url, nodeSource FROM pipeline_assets WHERE pipelineRunId IN (SELECT id FROM pipeline_runs WHERE projectId = 1) ORDER BY id DESC LIMIT 10");
console.log("\n=== PIPELINE ASSETS ===");
console.log(JSON.stringify(assets, null, 2));

await connection.end();
console.log("\nDone.");
