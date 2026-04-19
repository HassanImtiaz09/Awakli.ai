/**
 * Rate Limiting Middleware — In-process LRU-based rate limiter.
 *
 * Audit fix H-4: Prevents abuse on auth, generation, and extraction endpoints.
 *
 * Buckets:
 *   auth.*           → 20 requests / 5 min per IP
 *   image/panel gen  → 30 requests / hour per user
 *   character-bible  → 10 requests / hour per user
 *   default          → 300 requests / min per user
 */
import type { Request, Response, NextFunction } from "express";

// ─── Token Bucket ───────────────────────────────────────────────────────

interface Bucket {
  tokens: number;
  lastRefill: number;
}

interface RateLimitConfig {
  maxTokens: number;
  refillRate: number; // tokens per second
  windowMs: number;   // for Retry-After calculation
}

// LRU-ish map with TTL eviction
class RateLimitStore {
  private buckets = new Map<string, Bucket>();
  private maxEntries = 10000;

  get(key: string, config: RateLimitConfig): Bucket {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: config.maxTokens, lastRefill: now };
      this.set(key, bucket);
      return bucket;
    }

    // Refill tokens based on elapsed time
    const elapsed = (now - bucket.lastRefill) / 1000;
    const refill = Math.floor(elapsed * config.refillRate);
    if (refill > 0) {
      bucket.tokens = Math.min(config.maxTokens, bucket.tokens + refill);
      bucket.lastRefill = now;
    }

    return bucket;
  }

  private set(key: string, bucket: Bucket): void {
    // Evict oldest entries if over capacity
    if (this.buckets.size >= this.maxEntries) {
      const firstKey = this.buckets.keys().next().value;
      if (firstKey) this.buckets.delete(firstKey);
    }
    this.buckets.set(key, bucket);
  }

  consume(key: string, config: RateLimitConfig): { allowed: boolean; retryAfterSec: number } {
    const bucket = this.get(key, config);
    if (bucket.tokens > 0) {
      bucket.tokens--;
      return { allowed: true, retryAfterSec: 0 };
    }
    // Calculate when the next token will be available
    const retryAfterSec = Math.ceil(1 / config.refillRate);
    return { allowed: false, retryAfterSec };
  }
}

const store = new RateLimitStore();

// ─── Rate Limit Configs ─────────────────────────────────────────────────

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  // auth.*: 20 requests per 5 minutes per IP
  auth: {
    maxTokens: 20,
    refillRate: 20 / (5 * 60), // ~0.067 tokens/sec
    windowMs: 5 * 60 * 1000,
  },
  // image/panel generation: 30 requests per hour per user
  generation: {
    maxTokens: 30,
    refillRate: 30 / 3600, // ~0.0083 tokens/sec
    windowMs: 60 * 60 * 1000,
  },
  // character-bible extraction: 10 requests per hour per user
  characterBible: {
    maxTokens: 10,
    refillRate: 10 / 3600, // ~0.0028 tokens/sec
    windowMs: 60 * 60 * 1000,
  },
  // default: 300 requests per minute per user
  default: {
    maxTokens: 300,
    refillRate: 300 / 60, // 5 tokens/sec
    windowMs: 60 * 1000,
  },
};

// ─── Route Classification ───────────────────────────────────────────────

function classifyRoute(path: string): { bucket: string; config: RateLimitConfig } {
  // tRPC paths: /api/trpc/auth.login, /api/trpc/quickCreate.start, etc.
  const trpcMatch = path.match(/\/api\/trpc\/([^?]+)/);
  if (trpcMatch) {
    const procedure = trpcMatch[1];
    if (procedure.startsWith("auth.")) {
      return { bucket: "auth", config: RATE_LIMITS.auth };
    }
    if (
      procedure.startsWith("quickCreate.") ||
      procedure.startsWith("generation.") ||
      procedure.includes("regeneratePanel") ||
      procedure.includes("submitBatch")
    ) {
      return { bucket: "generation", config: RATE_LIMITS.generation };
    }
    if (procedure.startsWith("characterBible.")) {
      return { bucket: "characterBible", config: RATE_LIMITS.characterBible };
    }
  }
  return { bucket: "default", config: RATE_LIMITS.default };
}

function getClientKey(req: Request, bucket: string): string {
  // For auth routes, use IP (no user context yet)
  if (bucket === "auth") {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    return `ip:${ip}:${bucket}`;
  }
  // For other routes, prefer user ID from context, fallback to IP
  const userId = (req as any).__rateLimitUserId;
  if (userId) {
    return `user:${userId}:${bucket}`;
  }
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  return `ip:${ip}:${bucket}`;
}

// ─── Express Middleware ─────────────────────────────────────────────────

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip health checks and static assets
  if (req.path === "/api/health" || !req.path.startsWith("/api/")) {
    return next();
  }

  const { bucket, config } = classifyRoute(req.path);
  const key = getClientKey(req, bucket);
  const result = store.consume(key, config);

  if (!result.allowed) {
    res.setHeader("Retry-After", String(result.retryAfterSec));
    res.status(429).json({
      error: "Too Many Requests",
      message: `Rate limit exceeded for ${bucket}. Please retry after ${result.retryAfterSec} seconds.`,
      retryAfterSec: result.retryAfterSec,
    });
    return;
  }

  next();
}

// ─── Exported for Testing ───────────────────────────────────────────────

export { classifyRoute, RATE_LIMITS, RateLimitStore };
