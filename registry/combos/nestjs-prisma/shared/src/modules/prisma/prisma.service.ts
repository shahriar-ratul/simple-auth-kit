import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "@/database/generated/prisma/client";

const ENV_PREFIX = "DB_POOL_";

function poolIntEnv(name: string, fallback: number): number {
  const raw = process.env[`${ENV_PREFIX}${name}`];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Wraps PrismaClient with a real `pg.Pool` (tunable via DB_POOL_MAX / DB_POOL_MIN /
 * DB_POOL_IDLE_TIMEOUT_MS / DB_POOL_CONNECTION_TIMEOUT_MS — all optional, sane defaults if unset)
 * and real NestJS lifecycle hooks. Provided as a real DI provider (see prisma.module.ts) rather
 * than the bare `{ provide: PrismaClient, useValue: new PrismaClient(...) }` this replaces —
 * that never ran onModuleInit/onModuleDestroy, so the pool relied on Prisma's lazy auto-connect
 * on first query and was never explicitly closed on shutdown.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly pool: Pool;

  constructor() {
    const pool = new Pool({
      connectionString: process.env["DATABASE_URL"],
      max: poolIntEnv("MAX", 10),
      min: poolIntEnv("MIN", 0),
      idleTimeoutMillis: poolIntEnv("IDLE_TIMEOUT_MS", 30000),
      connectionTimeoutMillis: poolIntEnv("CONNECTION_TIMEOUT_MS", 5000),
    });
    super({ adapter: new PrismaPg(pool) });
    this.pool = pool;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    await this.pool.end();
  }
}
