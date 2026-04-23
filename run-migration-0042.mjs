import mysql2 from 'mysql2/promise';
import fs from 'fs';

const conn = await mysql2.createConnection(process.env.DATABASE_URL);
const sql = fs.readFileSync('drizzle/0042_batch_assembly_analytics.sql', 'utf8');

// Remove all comment lines first, then split by semicolons
const cleaned = sql.split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
const stmts = cleaned.split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0);

for (const s of stmts) {
  try {
    await conn.execute(s);
    console.log('OK:', s.slice(0, 70));
  } catch (e) {
    console.log('ERR:', e.message.slice(0, 120));
  }
}
await conn.end();
console.log('Migration 0042 complete');
