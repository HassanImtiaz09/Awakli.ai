import mysql2 from "mysql2/promise";
import fs from "fs";
import { config } from "dotenv";
config();

const sql = fs.readFileSync("drizzle/0043_caption_delivery.sql", "utf-8");
const statements = sql
  .split("\n")
  .map(l => l.trim())
  .filter(l => l.length > 0 && !l.startsWith("--"))
  .join("\n")
  .split(";")
  .map(s => s.trim())
  .filter(s => s.length > 0);

const conn = await mysql2.createConnection(process.env.DATABASE_URL);
for (const stmt of statements) {
  try {
    await conn.execute(stmt);
    console.log("OK:", stmt.substring(0, 60));
  } catch (e) {
    if (e.code === "ER_DUP_FIELDNAME") {
      console.log("SKIP (already exists):", stmt.substring(0, 60));
    } else {
      console.error("FAIL:", e.message);
    }
  }
}
await conn.end();
console.log("Migration 0043 complete");
