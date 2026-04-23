/**
 * Parallel Slice Scheduler — DAG-based dependency tracker for slice generation
 *
 * Builds a dependency graph from scene boundaries and character continuity
 * constraints, then schedules independent branches for parallel execution.
 * Uses importance scores from scene-importance-scorer to prioritize.
 */

// ─── Types ──────────────────────────────────────────────────────────────

export type SliceStatus = "pending" | "queued" | "generating" | "complete" | "failed" | "cancelled";

export interface SliceNode {
  sliceId: number;
  sceneIndex: number;
  /** IDs of slices that must complete before this one can start */
  dependsOn: number[];
  /** IDs of slices that depend on this one */
  dependedBy: number[];
  /** Importance score 1-10 (higher = process first among peers) */
  importance: number;
  /** Current generation status */
  status: SliceStatus;
  /** Character IDs present in this slice (for continuity constraints) */
  characterIds: number[];
  /** Estimated generation time in seconds */
  estimatedDurationSec: number;
  /** Actual start time */
  startedAt?: number;
  /** Actual completion time */
  completedAt?: number;
  /** Error message if failed */
  error?: string;
}

export interface DAGGraph {
  episodeId: number;
  nodes: Map<number, SliceNode>;
  /** Maximum parallelism level (concurrent generations) */
  maxConcurrency: number;
  /** Total slices in the graph */
  totalSlices: number;
  /** Creation timestamp */
  createdAt: number;
}

export interface SchedulerStatus {
  episodeId: number;
  totalSlices: number;
  pending: number;
  queued: number;
  generating: number;
  complete: number;
  failed: number;
  cancelled: number;
  /** Estimated time remaining in seconds */
  estimatedTimeRemainingSec: number;
  /** Current parallelism level */
  currentConcurrency: number;
  /** Slices ready to start (all dependencies met) */
  readySlices: number[];
  /** Overall progress percentage */
  progressPercent: number;
}

export interface SliceInput {
  sliceId: number;
  sceneIndex: number;
  characterIds: number[];
  importance: number;
  estimatedDurationSec?: number;
}

// ─── Constants ──────────────────────────────────────────────────────────

/** Default max concurrent slice generations */
export const DEFAULT_MAX_CONCURRENCY = 4;

/** Default estimated duration per slice in seconds */
const DEFAULT_SLICE_DURATION_SEC = 30;

// ─── In-memory graph store (per episode) ────────────────────────────────

const activeGraphs = new Map<number, DAGGraph>();

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Build a dependency graph from a list of slices.
 *
 * Dependency rules:
 * 1. Sequential scenes: slice N+1 in the same scene depends on slice N
 * 2. Character continuity: if character C appears in slice A (scene X) and
 *    slice B (scene Y where Y > X), B depends on A for visual consistency
 * 3. Independent scenes with no shared characters can run in parallel
 */
export function buildDependencyGraph(
  episodeId: number,
  slices: SliceInput[],
  maxConcurrency = DEFAULT_MAX_CONCURRENCY,
): DAGGraph {
  const nodes = new Map<number, SliceNode>();

  // Sort by scene index, then slice ID for deterministic ordering
  const sorted = [...slices].sort((a, b) =>
    a.sceneIndex !== b.sceneIndex
      ? a.sceneIndex - b.sceneIndex
      : a.sliceId - b.sliceId,
  );

  // Initialize all nodes
  for (const s of sorted) {
    nodes.set(s.sliceId, {
      sliceId: s.sliceId,
      sceneIndex: s.sceneIndex,
      dependsOn: [],
      dependedBy: [],
      importance: s.importance,
      status: "pending",
      characterIds: s.characterIds,
      estimatedDurationSec: s.estimatedDurationSec ?? DEFAULT_SLICE_DURATION_SEC,
    });
  }

  // Rule 1: Sequential within same scene
  const byScene = new Map<number, SliceInput[]>();
  for (const s of sorted) {
    const arr = byScene.get(s.sceneIndex) ?? [];
    arr.push(s);
    byScene.set(s.sceneIndex, arr);
  }

  for (const sceneSlices of Array.from(byScene.values())) {
    for (let i = 1; i < sceneSlices.length; i++) {
      const prev = sceneSlices[i - 1];
      const curr = sceneSlices[i];
      addDependency(nodes, curr.sliceId, prev.sliceId);
    }
  }

  // Rule 2: Character continuity across scenes
  // For each character, find all slices they appear in (ordered by scene)
  const charSlices = new Map<number, SliceInput[]>();
  for (const s of sorted) {
    for (const charId of s.characterIds) {
      const arr = charSlices.get(charId) ?? [];
      arr.push(s);
      charSlices.set(charId, arr);
    }
  }

  for (const slicesForChar of Array.from(charSlices.values())) {
    // Only add dependency between first appearance in each scene
    const seenScenes = new Map<number, SliceInput>();
    for (const s of slicesForChar) {
      if (!seenScenes.has(s.sceneIndex)) {
        seenScenes.set(s.sceneIndex, s);
      }
    }

    const sceneOrder = Array.from(seenScenes.values()).sort(
      (a, b) => a.sceneIndex - b.sceneIndex,
    );

    for (let i = 1; i < sceneOrder.length; i++) {
      addDependency(nodes, sceneOrder[i].sliceId, sceneOrder[i - 1].sliceId);
    }
  }

  const graph: DAGGraph = {
    episodeId,
    nodes,
    maxConcurrency,
    totalSlices: nodes.size,
    createdAt: Date.now(),
  };

  activeGraphs.set(episodeId, graph);
  return graph;
}

/**
 * Get slices that are ready to start (all dependencies complete).
 * Returns them sorted by importance (highest first).
 */
export function getReadySlices(episodeId: number): number[] {
  const graph = activeGraphs.get(episodeId);
  if (!graph) return [];

  const ready: SliceNode[] = [];

  for (const node of Array.from(graph.nodes.values())) {
    if (node.status !== "pending") continue;

    const allDepsMet = node.dependsOn.every((depId: number) => {
      const dep = graph.nodes.get(depId);
      return dep?.status === "complete";
    });

    if (allDepsMet) {
      ready.push(node);
    }
  }

  // Sort by importance (highest first), then by scene index (earlier first)
  ready.sort((a, b) => {
    if (b.importance !== a.importance) return b.importance - a.importance;
    return a.sceneIndex - b.sceneIndex;
  });

  // Respect concurrency limit
  const currentlyGenerating = Array.from(graph.nodes.values()).filter(
    (n) => n.status === "generating",
  ).length;
  const slotsAvailable = graph.maxConcurrency - currentlyGenerating;

  return ready.slice(0, Math.max(0, slotsAvailable)).map((n) => n.sliceId);
}

/**
 * Mark a slice as started.
 */
export function markSliceStarted(episodeId: number, sliceId: number): boolean {
  const graph = activeGraphs.get(episodeId);
  if (!graph) return false;

  const node = graph.nodes.get(sliceId);
  if (!node || node.status !== "pending") return false;

  node.status = "generating";
  node.startedAt = Date.now();
  return true;
}

/**
 * Mark a slice as complete.
 */
export function markSliceComplete(episodeId: number, sliceId: number): boolean {
  const graph = activeGraphs.get(episodeId);
  if (!graph) return false;

  const node = graph.nodes.get(sliceId);
  if (!node || node.status !== "generating") return false;

  node.status = "complete";
  node.completedAt = Date.now();
  return true;
}

/**
 * Mark a slice as failed.
 */
export function markSliceFailed(episodeId: number, sliceId: number, error: string): boolean {
  const graph = activeGraphs.get(episodeId);
  if (!graph) return false;

  const node = graph.nodes.get(sliceId);
  if (!node) return false;

  node.status = "failed";
  node.error = error;
  node.completedAt = Date.now();
  return true;
}

/**
 * Cancel all pending slices for an episode.
 */
export function cancelEpisode(episodeId: number): number {
  const graph = activeGraphs.get(episodeId);
  if (!graph) return 0;

  let cancelled = 0;
  for (const node of Array.from(graph.nodes.values())) {
    if (node.status === "pending" || node.status === "queued") {
      node.status = "cancelled";
      cancelled++;
    }
  }
  return cancelled;
}

/**
 * Get the full status of an episode's generation progress.
 */
export function getSchedulerStatus(episodeId: number): SchedulerStatus | null {
  const graph = activeGraphs.get(episodeId);
  if (!graph) return null;

  const counts = { pending: 0, queued: 0, generating: 0, complete: 0, failed: 0, cancelled: 0 };

  for (const node of Array.from(graph.nodes.values())) {
    (counts as any)[node.status]++
  }

  // Estimate remaining time
  const remainingSlices = counts.pending + counts.queued + counts.generating;
  const avgDuration =
    Array.from(graph.nodes.values())
      .filter((n) => n.status === "complete" && n.startedAt && n.completedAt)
      .reduce((sum, n) => sum + (n.completedAt! - n.startedAt!), 0) /
    Math.max(1, counts.complete) /
    1000;

  const effectiveDuration = avgDuration > 0 ? avgDuration : DEFAULT_SLICE_DURATION_SEC;
  const estimatedTimeRemainingSec = Math.ceil(
    (remainingSlices * effectiveDuration) / Math.max(1, graph.maxConcurrency),
  );

  const readySlices = getReadySlices(episodeId);

  return {
    episodeId,
    totalSlices: graph.totalSlices,
    ...counts,
    estimatedTimeRemainingSec,
    currentConcurrency: counts.generating,
    readySlices,
    progressPercent: graph.totalSlices > 0
      ? Math.round((counts.complete / graph.totalSlices) * 100)
      : 0,
  };
}

/**
 * Get the dependency graph for visualization.
 */
export function getGraphForVisualization(episodeId: number): {
  nodes: Array<{
    id: number;
    sceneIndex: number;
    importance: number;
    status: SliceStatus;
    dependsOn: number[];
  }>;
  edges: Array<{ from: number; to: number }>;
  parallelLanes: number[][];
} | null {
  const graph = activeGraphs.get(episodeId);
  if (!graph) return null;

  const nodes: Array<{
    id: number;
    sceneIndex: number;
    importance: number;
    status: SliceStatus;
    dependsOn: number[];
  }> = [];

  const edges: Array<{ from: number; to: number }> = [];

  for (const node of Array.from(graph.nodes.values())) {
    nodes.push({
      id: node.sliceId,
      sceneIndex: node.sceneIndex,
      importance: node.importance,
      status: node.status,
      dependsOn: node.dependsOn,
    });

    for (const depId of node.dependsOn) {
      edges.push({ from: depId, to: node.sliceId });
    }
  }

  // Compute parallel lanes (groups of slices that can run concurrently)
  const parallelLanes = computeParallelLanes(graph);

  return { nodes, edges, parallelLanes };
}

/**
 * Remove a completed/cancelled graph from memory.
 */
export function cleanupGraph(episodeId: number): boolean {
  return activeGraphs.delete(episodeId);
}

/**
 * Get all active episode graphs (for monitoring).
 */
export function getActiveEpisodes(): number[] {
  return Array.from(activeGraphs.keys());
}

// ─── Internal Helpers ───────────────────────────────────────────────────

function addDependency(nodes: Map<number, SliceNode>, childId: number, parentId: number): void {
  if (childId === parentId) return;

  const child = nodes.get(childId);
  const parent = nodes.get(parentId);
  if (!child || !parent) return;

  // Avoid duplicate dependencies
  if (!child.dependsOn.includes(parentId)) {
    child.dependsOn.push(parentId);
  }
  if (!parent.dependedBy.includes(childId)) {
    parent.dependedBy.push(childId);
  }
}

function computeParallelLanes(graph: DAGGraph): number[][] {
  // Topological sort with level assignment
  const levels = new Map<number, number>();
  const visited = new Set<number>();

  function getLevel(nodeId: number): number {
    if (levels.has(nodeId)) return levels.get(nodeId)!;
    if (visited.has(nodeId)) return 0; // cycle protection
    visited.add(nodeId);

    const node = graph.nodes.get(nodeId);
    if (!node || node.dependsOn.length === 0) {
      levels.set(nodeId, 0);
      return 0;
    }

    const maxParentLevel = Math.max(...node.dependsOn.map(getLevel));
    const level = maxParentLevel + 1;
    levels.set(nodeId, level);
    return level;
  }

  for (const nodeId of Array.from(graph.nodes.keys())) {
    getLevel(nodeId);
  }

  // Group by level
  const laneMap = new Map<number, number[]>();
  for (const [nodeId, level] of Array.from(levels.entries())) {
    const lane = laneMap.get(level) ?? [];
    lane.push(nodeId);
    laneMap.set(level, lane);
  }

  // Sort lanes by level, sort nodes within each lane by importance
  const sortedLevels = Array.from(laneMap.keys()).sort((a, b) => a - b);
  return sortedLevels.map((level) => {
    const lane = laneMap.get(level)!;
    return lane.sort((a, b) => {
      const nodeA = graph.nodes.get(a)!;
      const nodeB = graph.nodes.get(b)!;
      return nodeB.importance - nodeA.importance;
    });
  });
}
