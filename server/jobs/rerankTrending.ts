/**
 * B6-Phase3 — Nightly re-rank job skeleton
 *
 * Intended to run as a cron job (e.g., every night at 03:00 UTC).
 * Re-ranks trending by watch count, new releases by publishedAt.
 * Regenerates 404 covers (placeholder — needs image generation wiring).
 * Collapses to "More coming tonight" if < 12 live titles.
 *
 * USAGE:
 *   node --loader tsx server/jobs/rerankTrending.ts
 *   Or wire into a cron schedule / serverless function.
 */

import { getPublicProjects } from "../db";

/* ─── Types ──────────────────────────────────────────────────────────── */
interface RerankResult {
  trendingCount: number;
  newReleasesCount: number;
  brokenCovers: number;
  totalLive: number;
  belowThreshold: boolean;
}

/* ─── Constants ──────────────────────────────────────────────────────── */
const MINIMUM_LIVE_THRESHOLD = 12;

/* ─── Main ───────────────────────────────────────────────────────────── */
export async function rerankTrending(): Promise<RerankResult> {
  console.log("[rerank] Starting nightly re-rank job...");

  // 1. Fetch all published projects
  const allProjects = await getPublicProjects({ limit: 100, offset: 0, sort: "trending" });

  // 2. Separate into trending (by watch count) and new releases (by publishedAt)
  const withWatchCount = allProjects
    .filter((p: any) => p.title && p.coverUrl && p.slug)
    .sort((a: any, b: any) => (b.watchCount ?? 0) - (a.watchCount ?? 0));

  const byPublishedAt = [...withWatchCount]
    .sort((a: any, b: any) => {
      const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return dateB - dateA;
    });

  // 3. Detect broken covers (placeholder — would need HTTP HEAD check or image validation)
  const brokenCovers = allProjects.filter((p: any) => !p.coverUrl).length;

  // 4. Check threshold
  const totalLive = withWatchCount.length;
  const belowThreshold = totalLive < MINIMUM_LIVE_THRESHOLD;

  if (belowThreshold) {
    console.log(`[rerank] Only ${totalLive} live titles (< ${MINIMUM_LIVE_THRESHOLD}). Frontend will show "More coming tonight".`);
  }

  const result: RerankResult = {
    trendingCount: withWatchCount.length,
    newReleasesCount: byPublishedAt.length,
    brokenCovers,
    totalLive,
    belowThreshold,
  };

  console.log("[rerank] Complete:", result);
  return result;
}

/* ─── Direct execution ───────────────────────────────────────────────── */
if (import.meta.url === `file://${process.argv[1]}`) {
  rerankTrending()
    .then((r) => {
      console.log("[rerank] Done:", JSON.stringify(r, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error("[rerank] Failed:", err);
      process.exit(1);
    });
}
