// The authorization cache's version counter: the single `authz_version` row (id = 1), read and
// written only through Prisma. Every app write that changes what `resolveAuthzContext` returns
// calls `bumpAuthzVersion` (inside its transaction, where it has one), which makes every cached
// authorization answer stale on the very next request — on every app instance, since the counter
// lives in the shared database. Direct database edits don't bump it; the cache's TTL
// (`authzCacheTtlSeconds`) bounds how long those can go unseen.
import type { PrismaClient } from '@/database/generated/prisma/client';

/** The client or a transaction client — anything that can reach the `authz_version` table. */
export type AuthzVersionDb = Pick<PrismaClient, 'authzVersion'>;

/**
 * Increments the version, creating the row on first use. Returns the Prisma promise unawaited so
 * it can also be passed to an array `$transaction([...])`.
 */
export function bumpAuthzVersion(db: AuthzVersionDb) {
  return db.authzVersion.upsert({
    where: { id: 1 },
    create: { id: 1, version: 1n },
    update: { version: { increment: 1n } },
    select: { version: true },
  });
}

/** The current version; a database that has never been bumped is at version 0. */
export async function readAuthzVersion(db: AuthzVersionDb): Promise<bigint> {
  const row = await db.authzVersion.findUnique({
    where: { id: 1 },
    select: { version: true },
  });
  return row?.version ?? 0n;
}
