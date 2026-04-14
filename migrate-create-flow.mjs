import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
const conn = await mysql.createConnection(url);

const statements = [
  "ALTER TABLE `projects` ADD `originalPrompt` text",
  "ALTER TABLE `projects` ADD `creationMode` enum('quick_create','studio','upload') DEFAULT 'quick_create'",
  "ALTER TABLE `projects` ADD `animeEligible` int DEFAULT 0",
];

for (const sql of statements) {
  try {
    await conn.execute(sql);
    console.log("OK:", sql.slice(0, 60));
  } catch (e) {
    if (e.code === "ER_DUP_FIELDNAME") {
      console.log("SKIP (exists):", sql.slice(0, 60));
    } else {
      console.error("FAIL:", e.message);
    }
  }
}

await conn.end();
console.log("Migration complete.");
