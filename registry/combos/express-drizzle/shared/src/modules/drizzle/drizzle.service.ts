import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/database/schema";
import type { Database } from "@/common/config/db";

const ENV_PREFIX = "DB_POOL_";

function poolIntEnv(name: string, fallback: number): number {
  const raw = process.env[`${ENV_PREFIX}${name}`];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Owns the `pg.Pool` (tunable via DB_POOL_MAX / DB_POOL_MIN / DB_POOL_IDLE_TIMEOUT_MS /
 * DB_POOL_CONNECTION_TIMEOUT_MS — all optional, sane defaults if unset) and the Drizzle instance
 * built on top of it. Plain class, not a framework service — Express has no DI container, so
 * `createAuthApp` (see create-auth-app.ts) instantiates this directly and stashes it on
 * `app.locals` so a consumer can close the pool on shutdown
 * (`(app.locals["drizzle"] as DrizzleService).close()`), the same lifecycle the nestjs-drizzle
 * combo's `DrizzleService` gets for free from `onModuleDestroy`.
 */
export class DrizzleService {
  private readonly pool: Pool;
  readonly db: Database;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env["DATABASE_URL"],
      max: poolIntEnv("MAX", 10),
      min: poolIntEnv("MIN", 0),
      idleTimeoutMillis: poolIntEnv("IDLE_TIMEOUT_MS", 30000),
      connectionTimeoutMillis: poolIntEnv("CONNECTION_TIMEOUT_MS", 5000),
    });
    this.db = drizzle(this.pool, { schema });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
