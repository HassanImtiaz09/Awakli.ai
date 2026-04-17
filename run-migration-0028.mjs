import { readFileSync } from 'fs';
import mysql from 'mysql2/promise';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }

const sql = readFileSync('./drizzle/0028_character_lora_pipeline.sql', 'utf8');
const statements = sql
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

const conn = await mysql.createConnection(url);
for (const stmt of statements) {
  try {
    await conn.execute(stmt);
    console.log('OK:', stmt.substring(0, 60) + '...');
  } catch (e) {
    if (e.code === 'ER_TABLE_EXISTS_ERROR' || e.code === 'ER_DUP_FIELDNAME' || e.code === 'ER_DUP_KEYNAME') {
      console.log('SKIP (already exists):', stmt.substring(0, 60) + '...');
    } else {
      console.error('FAIL:', e.message, '\n  Statement:', stmt.substring(0, 80));
    }
  }
}
await conn.end();
console.log('Migration 0028 complete.');
