import fs from "fs";
import mysql from "mysql2/promise";

const sql = fs.readFileSync("drizzle/0031_tier_sampler_esg.sql", "utf8");
const statements = sql
  .split(";")
  .map(s => s.replace(/--[^\n]*/g, "").trim())
  .filter(s => s.length > 0);

const conn = await mysql.createConnection(process.env.DATABASE_URL);
for (const stmt of statements) {
  console.log("Running:", stmt.slice(0, 80) + "...");
  await conn.execute(stmt);
}
console.log(`Done — ${statements.length} statements executed.`);
await conn.end();
