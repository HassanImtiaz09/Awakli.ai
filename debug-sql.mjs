import { readFileSync } from 'fs';
const sql = readFileSync('drizzle/0033_motion_lora_tables.sql', 'utf8');
const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0 && !s.startsWith('--'));
console.log('Total statements:', statements.length);
statements.forEach((s, i) => console.log(i, ':', s.substring(0, 80)));
