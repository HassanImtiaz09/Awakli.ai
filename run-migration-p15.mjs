import mysql from "mysql2/promise";
import fs from "fs";

const url = process.env.DATABASE_URL;
const conn = await mysql.createConnection(url);

const sql = fs.readFileSync("drizzle/0013_phase15_preproduction.sql", "utf8");
const statements = sql.split(";").map(s => s.trim()).filter(s => s.length > 0);

for (const stmt of statements) {
  try {
    await conn.execute(stmt);
    console.log("OK:", stmt.substring(0, 60));
  } catch (e) {
    if (e.code === "ER_TABLE_EXISTS_ERROR") {
      console.log("SKIP (exists):", stmt.substring(0, 60));
    } else {
      console.error("ERR:", e.message, "\n", stmt.substring(0, 80));
    }
  }
}

await conn.end();
console.log("Migration complete");
