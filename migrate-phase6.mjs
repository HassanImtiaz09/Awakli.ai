import { createConnection } from 'mysql2/promise';
import { readFileSync } from 'fs';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }

const conn = await createConnection(url);

const statements = [
  `CREATE TABLE IF NOT EXISTS \`moderation_queue\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`contentType\` enum('project','episode','comment','panel') NOT NULL,
    \`contentId\` int NOT NULL,
    \`reportedBy\` int,
    \`reason\` text,
    \`status\` enum('pending','approved','removed','dismissed') NOT NULL DEFAULT 'pending',
    \`reviewedBy\` int,
    \`reviewedAt\` timestamp,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT \`moderation_queue_id\` PRIMARY KEY(\`id\`)
  )`,
  `CREATE TABLE IF NOT EXISTS \`subscriptions\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`userId\` int NOT NULL,
    \`tier\` enum('free','pro','studio') NOT NULL DEFAULT 'free',
    \`stripeCustomerId\` varchar(255),
    \`stripeSubscriptionId\` varchar(255),
    \`status\` enum('active','past_due','canceled','trialing','incomplete') NOT NULL DEFAULT 'active',
    \`currentPeriodStart\` timestamp,
    \`currentPeriodEnd\` timestamp,
    \`cancelAtPeriodEnd\` int DEFAULT 0,
    \`billingInterval\` enum('monthly','annual') DEFAULT 'monthly',
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`subscriptions_id\` PRIMARY KEY(\`id\`)
  )`,
  `CREATE TABLE IF NOT EXISTS \`tips\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`fromUserId\` int NOT NULL,
    \`toUserId\` int NOT NULL,
    \`episodeId\` int NOT NULL,
    \`amountCents\` int NOT NULL,
    \`creatorShareCents\` int NOT NULL,
    \`platformShareCents\` int NOT NULL,
    \`stripePaymentIntentId\` varchar(255),
    \`status\` enum('pending','completed','failed','refunded') NOT NULL DEFAULT 'pending',
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT \`tips_id\` PRIMARY KEY(\`id\`)
  )`,
  `CREATE TABLE IF NOT EXISTS \`usage_records\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`userId\` int NOT NULL,
    \`actionType\` enum('script','panel','video','voice','lora_train') NOT NULL,
    \`creditsUsed\` int NOT NULL,
    \`projectId\` int,
    \`episodeId\` int,
    \`metadata\` json,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT \`usage_records_id\` PRIMARY KEY(\`id\`)
  )`,
  `ALTER TABLE \`moderation_queue\` ADD CONSTRAINT \`moderation_queue_reportedBy_users_id_fk\` FOREIGN KEY (\`reportedBy\`) REFERENCES \`users\`(\`id\`) ON DELETE cascade ON UPDATE no action`,
  `ALTER TABLE \`subscriptions\` ADD CONSTRAINT \`subscriptions_userId_users_id_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE cascade ON UPDATE no action`,
  `ALTER TABLE \`tips\` ADD CONSTRAINT \`tips_fromUserId_users_id_fk\` FOREIGN KEY (\`fromUserId\`) REFERENCES \`users\`(\`id\`) ON DELETE cascade ON UPDATE no action`,
  `ALTER TABLE \`tips\` ADD CONSTRAINT \`tips_toUserId_users_id_fk\` FOREIGN KEY (\`toUserId\`) REFERENCES \`users\`(\`id\`) ON DELETE cascade ON UPDATE no action`,
  `ALTER TABLE \`tips\` ADD CONSTRAINT \`tips_episodeId_episodes_id_fk\` FOREIGN KEY (\`episodeId\`) REFERENCES \`episodes\`(\`id\`) ON DELETE cascade ON UPDATE no action`,
  `ALTER TABLE \`usage_records\` ADD CONSTRAINT \`usage_records_userId_users_id_fk\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE cascade ON UPDATE no action`,
];

for (const stmt of statements) {
  try {
    await conn.execute(stmt);
    console.log('OK:', stmt.substring(0, 60) + '...');
  } catch (err) {
    if (err.code === 'ER_TABLE_EXISTS_ERROR' || err.code === 'ER_DUP_KEYNAME' || err.errno === 1061) {
      console.log('SKIP (already exists):', stmt.substring(0, 60) + '...');
    } else {
      console.error('FAIL:', err.message, '\n  Statement:', stmt.substring(0, 80));
    }
  }
}

await conn.end();
console.log('Phase 6 migration complete.');
