import mysql from "mysql2/promise";
import fs from "fs";

const url = process.env.DATABASE_URL;
const conn = await mysql.createConnection(url);

const sql = fs.readFileSync("drizzle/0009_abandoned_nightmare.sql", "utf8");
const statements = sql.split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean);

for (const stmt of statements) {
  console.log("Executing:", stmt.substring(0, 80) + "...");
  try {
    await conn.execute(stmt);
    console.log("  ✓ OK");
  } catch (e) {
    if (e.code === "ER_DUP_FIELDNAME" || e.code === "ER_TABLE_EXISTS_ERROR") {
      console.log("  ⚠ Already exists, skipping");
    } else {
      console.error("  ✗ Error:", e.message);
    }
  }
}

// Seed platform_config with default thresholds
const seedStatements = [
  `INSERT IGNORE INTO platform_config (\`key\`, value) VALUES ('anime_vote_threshold', '500')`,
  `INSERT IGNORE INTO platform_config (\`key\`, value) VALUES ('anime_featured_threshold', '1000')`,
];

for (const stmt of seedStatements) {
  console.log("Seeding:", stmt.substring(0, 80) + "...");
  try {
    await conn.execute(stmt);
    console.log("  ✓ OK");
  } catch (e) {
    console.error("  ✗ Error:", e.message);
  }
}

await conn.end();
console.log("Migration complete!");
