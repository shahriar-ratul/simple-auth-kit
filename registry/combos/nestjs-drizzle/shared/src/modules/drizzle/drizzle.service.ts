import { Injectable, OnModuleDestroy } from "@nestjs/common";
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
 * Owns the real `pg.Pool` (tunable via DB_POOL_MAX / DB_POOL_MIN / DB_POOL_IDLE_TIMEOUT_MS /
 * DB_POOL_CONNECTION_TIMEOUT_MS — all optional, sane defaults if unset) and the Drizzle instance
 * built on top of it, with a real NestJS lifecycle hook to close the pool on shutdown. Drizzle
 * has no client *class* the way Prisma has PrismaClient (see db.ts's own note on that), so there
 * is no `extends` here and no eager $connect() step — `pg.Pool` connects lazily per query, same
 * as before this existed; the thing this adds is the pool actually getting closed on
 * onModuleDestroy, which the previous bare `new Pool()` construction in core-auth.module.ts never
 * did.
 */
@Injectable()
export class DrizzleService implements OnModuleDestroy {
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

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
