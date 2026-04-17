import fs from 'fs';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const sql = fs.readFileSync('drizzle/0030_lineart_controlnet_pipeline.sql', 'utf8');
const statements = sql
  .split(';')
  .map(s => s.replace(/--[^\n]*/g, '').trim())
  .filter(s => s.length > 0);

const conn = await mysql.createConnection(process.env.DATABASE_URL);
for (const stmt of statements) {
  console.log('Executing:', stmt.substring(0, 80) + '...');
  await conn.execute(stmt);
}
console.log(`Done — ${statements.length} statements executed.`);
await conn.end();
