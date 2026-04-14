import mysql from "mysql2/promise";
import fs from "fs";

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const sql = fs.readFileSync("drizzle/0014_phase16_music.sql", "utf8");
const statements = sql.split(";").map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith("--"));

for (const stmt of statements) {
  try {
    await conn.execute(stmt);
    console.log("OK:", stmt.substring(0, 60));
  } catch (e) {
    if (e.code === "ER_DUP_FIELDNAME" || e.code === "ER_TABLE_EXISTS_ERROR") {
      console.log("SKIP (already exists):", stmt.substring(0, 60));
    } else {
      console.error("FAIL:", e.message, "\n  SQL:", stmt.substring(0, 80));
    }
  }
}
await conn.end();
console.log("Migration complete");
