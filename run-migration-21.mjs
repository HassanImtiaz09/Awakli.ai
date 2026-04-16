import mysql from 'mysql2/promise';
import fs from 'fs';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const sql = fs.readFileSync('drizzle/0021_free_viewing_model.sql', 'utf8');

// Remove comment lines, then split by semicolons
const cleaned = sql.split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n');

const statements = cleaned.split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0);

console.log(`Found ${statements.length} statements`);

for (const stmt of statements) {
  try {
    const short = stmt.replace(/\s+/g, ' ').substring(0, 80);
    console.log(`Executing: ${short}...`);
    await conn.execute(stmt);
    console.log('  OK');
  } catch (e) {
    if (e.message.includes('Duplicate column') || e.message.includes('already exists')) {
      console.log('  SKIPPED (already exists)');
    } else {
      console.log(`  Error: ${e.message}`);
    }
  }
}

await conn.end();
console.log('Migration complete');
