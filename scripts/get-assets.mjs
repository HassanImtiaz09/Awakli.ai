import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();
const pool = mysql.createPool(process.env.DATABASE_URL);

const [assets] = await pool.query(
  'SELECT id, panelId, assetType, url, metadata, nodeSource FROM pipeline_assets WHERE pipelineRunId = 90003 ORDER BY assetType, panelId'
);

const byType = {};
for (const a of assets) {
  const t = a.assetType;
  if (!byType[t]) byType[t] = [];
  byType[t].push(a);
}

for (const [type, items] of Object.entries(byType)) {
  console.log('\n=== ' + type + ' (' + items.length + ') ===');
  for (const item of items) {
    const meta = typeof item.metadata === 'string' ? JSON.parse(item.metadata || '{}') : (item.metadata || {});
    console.log('  Panel:', item.panelId, '| URL:', (item.url || '').substring(0, 90));
    if (meta.character) console.log('    Character:', meta.character, '| Line:', meta.line);
    if (meta.name) console.log('    Name:', meta.name);
  }
}

const [panels] = await pool.query(
  'SELECT id, panelNumber, imageUrl FROM panels WHERE episodeId = 2 ORDER BY panelNumber'
);
console.log('\n=== Panel Ordering (32 panels) ===');
for (const p of panels) {
  console.log('  P' + String(p.panelNumber).padStart(2,'0') + ' (id:' + p.id + ')');
}

await pool.end();
