import fs from 'fs';
import mysql from 'mysql2/promise';

const sql = fs.readFileSync('drizzle/0022_byo_manga_upload.sql', 'utf8');
// Split on semicolons, strip comments, filter empty
const statements = sql
  .replace(/--[^\n]*/g, '')
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0);

const conn = await mysql.createConnection(process.env.DATABASE_URL);
for (const stmt of statements) {
  try {
    await conn.execute(stmt);
    console.log('OK:', stmt.substring(0, 60) + '...');
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME' || e.code === 'ER_TABLE_EXISTS_ERROR') {
      console.log('SKIP (already exists):', stmt.substring(0, 60) + '...');
    } else {
      console.error('FAIL:', e.message);
      console.error('Statement:', stmt.substring(0, 100));
    }
  }
}
await conn.end();
console.log('Migration complete');
