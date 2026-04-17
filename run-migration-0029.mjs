import fs from "fs";
import mysql from "mysql2/promise";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const sql = fs.readFileSync("drizzle/0029_fix_drift_jobs.sql", "utf8");
const statements = sql
  .replace(/--[^\n]*/g, "")  // strip SQL comments
  .split(";")
  .map(s => s.trim())
  .filter(s => s.length > 5);

async function run() {
  const conn = await mysql.createConnection(DATABASE_URL + "&multipleStatements=true");
  console.log("Connected to database");

  for (const stmt of statements) {
    const preview = stmt.substring(0, 80).replace(/\n/g, " ");
    try {
      await conn.execute(stmt);
      console.log("OK:", preview + "...");
    } catch (err) {
      if (err.code === "ER_TABLE_EXISTS_ERROR" || err.code === "ER_DUP_KEYNAME") {
        console.log("SKIP (already exists):", preview + "...");
      } else {
        console.error("FAIL:", preview + "...");
        console.error(err.message);
        throw err;
      }
    }
  }

  await conn.end();
  console.log("Migration 0029 complete!");
}

run().catch(e => { console.error(e); process.exit(1); });
