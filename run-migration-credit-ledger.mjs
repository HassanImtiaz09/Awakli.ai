import mysql from "mysql2/promise";
import fs from "fs";

const url = process.env.DATABASE_URL;
if (!url) { console.error("No DATABASE_URL"); process.exit(1); }

const sql = fs.readFileSync("drizzle/0023_pricing_credit_ledger.sql", "utf8");

// Split by semicolons and clean up comment-only lines
const rawStatements = sql.split(";").map(s => s.trim()).filter(s => s.length > 0);
const cleanStatements = rawStatements.map(s =>
  s.split("\n").filter(line => !line.trim().startsWith("--")).join("\n").trim()
).filter(s => s.length > 0);

const conn = await mysql.createConnection(url);
let success = 0, failed = 0;
for (const stmt of cleanStatements) {
  try {
    const short = stmt.replace(/\s+/g, " ").substring(0, 80);
    console.log(`Executing: ${short}...`);
    await conn.execute(stmt);
    success++;
    console.log("  OK");
  } catch (err) {
    if (err.message.includes("Duplicate column") || err.message.includes("already exists")) {
      console.log("  SKIPPED (already exists)");
      success++;
    } else {
      failed++;
      console.error(`  FAIL: ${err.message.substring(0, 150)}`);
    }
  }
}
await conn.end();
console.log(`\nDone: ${success} succeeded, ${failed} failed`);
