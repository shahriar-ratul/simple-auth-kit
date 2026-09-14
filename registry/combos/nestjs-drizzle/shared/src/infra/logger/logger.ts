import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import pino, { type Logger } from "pino";

export type LogModule =
  "auth" | "admin" | "roles" | "permissions" | "audit-log";

type LogLevel = "debug" | "info" | "warn" | "error";

const MODULES: readonly LogModule[] = [
  "auth",
  "admin",
  "roles",
  "permissions",
  "audit-log",
];

/**
 * Production-standard shape: string level labels ("info", not pino's raw numeric 30) and
 * ISO-8601 timestamps — what a log shipper / ELK stack expects a `level`/`time` field to look
 * like, versus pino's terser wire defaults. `level: "debug"` disables pino's own per-logger
 * filtering — each destination here is already dedicated to exactly one level by construction
 * (moduleLogger/combinedLogger are keyed by level), so pino's default "info" floor would
 * otherwise silently drop every `log.debug(...)` call before it ever reached the file.
 */
const PINO_OPTIONS: pino.LoggerOptions = {
  level: "debug",
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
};

function logDir(): string {
  return process.env.LOG_DIR ?? "./logs";
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * One pino destination per `(date, level, module)` — for local/manual browsing — plus one
 * combined destination per `(date, level)` at the date folder's root, for a log shipper to tail.
 * Lazily opened, and swapped for a fresh destination the moment the date rolls over; no
 * cron/interval needed. Keyed loggers (not raw destinations) so pino's own `.info/.warn/.error`
 * stamp the standard `level`/`time` fields on each line.
 *
 * Nothing here ever deletes an old date folder — retention/cleanup is an ops decision made
 * outside this library (cron, logrotate, a shipper's own retention policy, etc.), not something
 * this registry automates.
 */
class FileLoggerRegistry {
  private date = "";
  private perModule = new Map<string, Logger>();
  private combined = new Map<LogLevel, Logger>();

  private rolloverIfNeeded(): void {
    const today = todayKey();
    if (today === this.date) return;
    this.date = today;
    this.perModule.clear();
    this.combined.clear();
  }

  private moduleLogger(level: LogLevel, module: LogModule): Logger {
    this.rolloverIfNeeded();
    const key = `${level}:${module}`;
    let logger = this.perModule.get(key);
    if (!logger) {
      const dest = join(logDir(), this.date, level, `${module}.log`);
      logger = pino(
        PINO_OPTIONS,
        pino.destination({ dest, mkdir: true, sync: false }),
      );
      this.perModule.set(key, logger);
    }
    return logger;
  }

  private combinedLogger(level: LogLevel): Logger {
    this.rolloverIfNeeded();
    let logger = this.combined.get(level);
    if (!logger) {
      const dest = join(logDir(), this.date, `${level}.log`);
      logger = pino(
        PINO_OPTIONS,
        pino.destination({ dest, mkdir: true, sync: false }),
      );
      this.combined.set(level, logger);
    }
    return logger;
  }

  write(
    level: LogLevel,
    module: LogModule,
    msg: string,
    meta?: Record<string, unknown>,
  ): void {
    const traceId = requestContext.getStore()?.traceId;
    const entry =
      traceId && !meta?.["traceId"] ? { traceId, ...meta } : (meta ?? {});
    this.moduleLogger(level, module)[level](entry, msg);
    this.combinedLogger(level)[level]({ module, ...entry }, msg);
  }
}

const registry = new FileLoggerRegistry();

/**
 * Plain `{debug, info, warn, error}` namespace, one call site shape for every log line — matches
 * the repo's "no class/interface, plain functions" convention. `meta` may nest arbitrarily deep
 * (it's passed straight through to pino, which serializes it as-is) — run it through `redact()`
 * first if it might carry a request/response body.
 */
export const log = {
  debug(module: LogModule, msg: string, meta?: Record<string, unknown>): void {
    registry.write("debug", module, msg, meta);
  },
  info(module: LogModule, msg: string, meta?: Record<string, unknown>): void {
    registry.write("info", module, msg, meta);
  },
  warn(module: LogModule, msg: string, meta?: Record<string, unknown>): void {
    registry.write("warn", module, msg, meta);
  },
  error(module: LogModule, msg: string, meta?: Record<string, unknown>): void {
    registry.write("error", module, msg, meta);
  },
};

interface RequestLogContext {
  traceId: string;
}

/**
 * Ties every log line emitted during one request — including calls made deep inside a service or
 * repository that never sees `req`/`res` — to the same `traceId`, without threading it through
 * every function signature. The NestJS interceptor / Express middleware are the only two call
 * sites that open this context (see `request-logger.interceptor.ts` /
 * `request-logger.middleware.ts`); everything else just calls `log.info(...)` and gets tagged for
 * free via `FileLoggerRegistry.write` reading `requestContext.getStore()`.
 */
const requestContext = new AsyncLocalStorage<RequestLogContext>();

export function newTraceId(): string {
  return randomUUID();
}

export function withTraceId<T>(traceId: string, fn: () => T): T {
  return requestContext.run({ traceId }, fn);
}

/**
 * First path segment matching one of this combo's 5 feature modules, e.g.
 * "/api/v1/auth/login" -> "auth". Independent of the deployment's API prefix depth, so it works
 * whether the consumer mounts routes under "/api", "/api/v1", or nothing at all. Shared by the
 * NestJS interceptor and Express middleware so module detection isn't duplicated per framework.
 */
export function deriveModule(path: string): LogModule | undefined {
  const segments = path.split("?")[0]?.split("/").filter(Boolean) ?? [];
  return segments.find((segment): segment is LogModule =>
    (MODULES as readonly string[]).includes(segment),
  );
}

/** Any key matching this — at any nesting depth — has its value masked before it reaches a log file. */
const SENSITIVE_KEY_PATTERN =
  /password|secret|token|authorization|api[-_]?key|credential|otp|totp/i;

const REDACTED = "[redacted]";

/**
 * Deep-clones `value`, masking any object key matching `SENSITIVE_KEY_PATTERN` — used on request
 * and response bodies before they're logged, since these are auth endpoints (login/signup carry
 * plaintext passwords, tokens come back on every successful auth call) and writing that to a log
 * file on disk would be a real credential leak, not just noise.
 */
export function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redact(item, seen));
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redact(val, seen);
  }
  return out;
}
