/**
 * Quality Escalation Queue
 *
 * Catches issues that survive both H1 and D5 retries (max 2 attempts per slice).
 * Logs them for human review with full context.
 *
 * In production, this would integrate with an admin dashboard or notification system.
 * For now, it writes to a JSON file and logs to console.
 */

import fs from "fs";
import path from "path";
import type { EscalationEntry } from "../benchmarks/harness/types.js";

const QUEUE_DIR = path.join(process.cwd(), "data", "escalation-queue");

export interface EscalationQueueEntry extends EscalationEntry {
  /** Additional context for human reviewer */
  context?: {
    videoPath?: string;
    sliceKeyframes?: string[];
    checkResults?: any;
    d5Review?: any;
  };
  /** Resolution status */
  status: "pending" | "reviewed" | "resolved" | "dismissed";
  resolvedBy?: string;
  resolvedAt?: string;
  resolution?: string;
}

/**
 * Add entries to the escalation queue.
 * Writes to a JSON file per episode for easy retrieval.
 */
export function addToEscalationQueue(
  entries: EscalationEntry[],
  context?: {
    videoPath?: string;
    sliceKeyframes?: string[];
    checkResults?: any;
    d5Review?: any;
  }
): void {
  if (entries.length === 0) return;

  fs.mkdirSync(QUEUE_DIR, { recursive: true });

  const episodeId = entries[0].episodeId;
  const queueFile = path.join(QUEUE_DIR, `${episodeId}.json`);

  // Load existing entries if any
  let existing: EscalationQueueEntry[] = [];
  if (fs.existsSync(queueFile)) {
    try {
      existing = JSON.parse(fs.readFileSync(queueFile, "utf-8"));
    } catch {
      existing = [];
    }
  }

  // Add new entries
  const newEntries: EscalationQueueEntry[] = entries.map((e) => ({
    ...e,
    context,
    status: "pending" as const,
  }));

  const all = [...existing, ...newEntries];
  fs.writeFileSync(queueFile, JSON.stringify(all, null, 2));

  // Log to console
  console.log(`\n  ⚠ QUALITY ESCALATION — ${entries.length} issue(s) for episode ${episodeId}:`);
  for (const entry of entries) {
    console.log(`    • ${entry.failureCategory}${entry.sliceId !== undefined ? ` (slice ${entry.sliceId})` : ""}: ${entry.reason}`);
    console.log(`      Source: ${entry.source}, Attempts: ${entry.attempts}`);
  }
  console.log(`  Queue file: ${queueFile}\n`);
}

/**
 * Get all pending escalations for an episode.
 */
export function getPendingEscalations(episodeId: string): EscalationQueueEntry[] {
  const queueFile = path.join(QUEUE_DIR, `${episodeId}.json`);
  if (!fs.existsSync(queueFile)) return [];

  try {
    const all: EscalationQueueEntry[] = JSON.parse(fs.readFileSync(queueFile, "utf-8"));
    return all.filter((e) => e.status === "pending");
  } catch {
    return [];
  }
}

/**
 * Get all escalations across all episodes.
 */
export function getAllPendingEscalations(): EscalationQueueEntry[] {
  if (!fs.existsSync(QUEUE_DIR)) return [];

  const files = fs.readdirSync(QUEUE_DIR).filter((f) => f.endsWith(".json"));
  const all: EscalationQueueEntry[] = [];

  for (const file of files) {
    try {
      const entries: EscalationQueueEntry[] = JSON.parse(
        fs.readFileSync(path.join(QUEUE_DIR, file), "utf-8")
      );
      all.push(...entries.filter((e) => e.status === "pending"));
    } catch {
      // skip corrupt files
    }
  }

  return all;
}

/**
 * Resolve an escalation entry.
 */
export function resolveEscalation(
  episodeId: string,
  index: number,
  resolution: string,
  resolvedBy: string
): boolean {
  const queueFile = path.join(QUEUE_DIR, `${episodeId}.json`);
  if (!fs.existsSync(queueFile)) return false;

  try {
    const all: EscalationQueueEntry[] = JSON.parse(fs.readFileSync(queueFile, "utf-8"));
    if (index < 0 || index >= all.length) return false;

    all[index].status = "resolved";
    all[index].resolution = resolution;
    all[index].resolvedBy = resolvedBy;
    all[index].resolvedAt = new Date().toISOString();

    fs.writeFileSync(queueFile, JSON.stringify(all, null, 2));
    return true;
  } catch {
    return false;
  }
}
