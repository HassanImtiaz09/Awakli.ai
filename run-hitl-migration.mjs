/**
 * Run HITL Gate Architecture migration (Prompt 17)
 * Splits SQL by tracking parentheses depth to handle CREATE TABLE correctly
 */
import { readFileSync } from "fs";
import mysql from "mysql2/promise";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const raw = readFileSync("./drizzle/0025_hitl_gate_architecture.sql", "utf-8");

// Remove comment-only lines
const lines = raw.split("\n").filter(l => !l.trim().startsWith("--"));
const cleaned = lines.join("\n");

// Split into statements respecting parentheses depth
function splitStatements(sql) {
  const stmts = [];
  let current = "";
  let depth = 0;
  
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === ";" && depth === 0) {
      const trimmed = current.trim();
      if (trimmed.length > 0) stmts.push(trimmed);
      current = "";
      continue;
    }
    current += ch;
  }
  const trimmed = current.trim();
  if (trimmed.length > 0) stmts.push(trimmed);
  return stmts;
}

const statements = splitStatements(cleaned);
console.log(`Found ${statements.length} SQL statements to execute\n`);

const connection = await mysql.createConnection(DATABASE_URL);

let success = 0;
let skipped = 0;
let failed = 0;

for (let i = 0; i < statements.length; i++) {
  const stmt = statements[i];
  const preview = stmt.substring(0, 100).replace(/\n/g, " ").replace(/\s+/g, " ");
  try {
    await connection.execute(stmt);
    success++;
    console.log(`[${i + 1}/${statements.length}] ✓ ${preview}...`);
  } catch (err) {
    if (
      err.code === "ER_DUP_FIELDNAME" ||
      err.code === "ER_TABLE_EXISTS_ERROR" ||
      err.code === "ER_DUP_KEYNAME" ||
      err.code === "ER_FK_DUP_NAME" ||
      err.message.includes("Duplicate column name") ||
      err.message.includes("already exists")
    ) {
      skipped++;
      console.log(`[${i + 1}/${statements.length}] ⊘ Already exists, skipping: ${preview.substring(0, 60)}...`);
    } else {
      failed++;
      console.error(`[${i + 1}/${statements.length}] ✗ FAILED: ${preview}`);
      console.error(`  Error [${err.code}]: ${err.message}\n`);
    }
  }
}

await connection.end();
console.log(`\n═══ Migration Summary ═══`);
console.log(`  Succeeded: ${success}`);
console.log(`  Skipped:   ${skipped}`);
console.log(`  Failed:    ${failed}`);
console.log(`  Total:     ${statements.length}`);
process.exit(failed > 0 ? 1 : 0);
