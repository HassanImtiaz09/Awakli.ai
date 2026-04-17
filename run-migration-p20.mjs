import { readFileSync } from 'fs';
import mysql from 'mysql2/promise';

const sql = readFileSync('./drizzle/0027_scene_type_router.sql', 'utf8');
const statements = sql
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

const conn = await mysql.createConnection(process.env.DATABASE_URL);
for (const stmt of statements) {
  try {
    await conn.execute(stmt);
    console.log('OK:', stmt.substring(0, 60) + '...');
  } catch (e) {
    if (e.code === 'ER_TABLE_EXISTS_ERROR' || e.code === 'ER_DUP_KEYNAME' || e.code === 'ER_DUP_ENTRY') {
      console.log('SKIP (already exists):', stmt.substring(0, 60) + '...');
    } else {
      console.error('FAIL:', e.message, '\nSQL:', stmt.substring(0, 100));
    }
  }
}
await conn.end();
console.log('Migration complete.');
