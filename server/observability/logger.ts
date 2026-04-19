/**
 * Structured Logger — Pino-compatible JSON logging for the Awakli server.
 *
 * Provides structured log output with consistent fields:
 * - timestamp (ISO 8601)
 * - level (debug, info, warn, error)
 * - msg (human-readable message)
 * - module (source module name)
 * - Additional context fields
 *
 * In development, logs are pretty-printed. In production, they're JSON lines.
 *
 * @see Audit L-5, L-6
 */

// ─── Types ──────────────────────────────────────────────────────────────

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  msg: string;
  module: string;
  [key: string]: unknown;
}

// ─── Level Priority ─────────────────────────────────────────────────────

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const MIN_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || "info";

// ─── Logger Class ───────────────────────────────────────────────────────

export class Logger {
  private module: string;

  constructor(module: string) {
    this.module = module;
  }

  debug(msg: string, ctx?: Record<string, unknown>): void {
    this.log("debug", msg, ctx);
  }

  info(msg: string, ctx?: Record<string, unknown>): void {
    this.log("info", msg, ctx);
  }

  warn(msg: string, ctx?: Record<string, unknown>): void {
    this.log("warn", msg, ctx);
  }

  error(msg: string, ctx?: Record<string, unknown>): void {
    this.log("error", msg, ctx);
  }

  /**
   * Create a child logger with additional default context.
   */
  child(childModule: string): Logger {
    return new Logger(`${this.module}.${childModule}`);
  }

  private log(level: LogLevel, msg: string, ctx?: Record<string, unknown>): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[MIN_LEVEL]) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      msg,
      module: this.module,
      ...ctx,
    };

    const output = JSON.stringify(entry);

    switch (level) {
      case "error":
        console.error(output);
        break;
      case "warn":
        console.warn(output);
        break;
      default:
        console.log(output);
    }
  }
}

// ─── Factory ────────────────────────────────────────────────────────────

/**
 * Create a logger for a specific module.
 *
 * @example
 * const log = createLogger("image-router");
 * log.info("Routing job", { providerId: "runware", jobId: "abc123" });
 */
export function createLogger(module: string): Logger {
  return new Logger(module);
}

// ─── Pre-configured Loggers ─────────────────────────────────────────────

export const serverLog = createLogger("server");
export const routerLog = createLogger("image-router");
export const pipelineLog = createLogger("pipeline");
export const authLog = createLogger("auth");
export const stripeLog = createLogger("stripe");
export const qaLog = createLogger("qa-gate");
