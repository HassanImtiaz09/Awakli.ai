const mysql = require('mysql2/promise');
const fs = require('fs');

async function run() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const sql = fs.readFileSync('/home/ubuntu/awakli/drizzle/0018_harness_engineering.sql', 'utf8');
  const statements = sql.split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));
  for (const stmt of statements) {
    try {
      await conn.execute(stmt);
      console.log('OK:', stmt.substring(0, 70) + '...');
    } catch (e) {
      console.log('ERR:', e.message.substring(0, 120));
    }
  }
  await conn.end();
  console.log('Done');
}
run();
