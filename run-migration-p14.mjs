import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) { console.error("No DATABASE_URL"); process.exit(1); }

const conn = await mysql.createConnection(url);

// Check if preferences column exists
const [rows] = await conn.query(
  `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'preferences' AND TABLE_SCHEMA = DATABASE()`
);

if (rows.length === 0) {
  console.log("Adding preferences column to users table...");
  await conn.query("ALTER TABLE `users` ADD `preferences` json");
  console.log("  ✓ Added");
} else {
  console.log("  ✓ users.preferences already exists");
}

await conn.end();
console.log("Migration complete!");
