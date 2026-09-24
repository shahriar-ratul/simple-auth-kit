// The counter `AuthzCache` keys on: one `authz_version` row (id = 1). Every write this app makes
// that changes what `resolveAuthzContext` returns calls `bumpAuthzVersion`, inside the same
// transaction when there is one, so the next request anywhere in this process re-resolves.
// Writes made outside the app (raw SQL, another tool) don't bump it; the cache's TTL
// (`authzCacheTtlSeconds`) bounds how long those can go unseen.
import type { PrismaClient } from "@/database/generated/prisma/client";

/** The client or a transaction client — anything with the `authzVersion` delegate. */
export type AuthzVersionDb = Pick<PrismaClient, "authzVersion">;

/** Not `async`: returns the Prisma promise itself, so it can also go in an array `$transaction`. */
export function bumpAuthzVersion(db: AuthzVersionDb) {
  return db.authzVersion.upsert({
    where: { id: 1 },
    create: { id: 1, version: 1 },
    update: { version: { increment: 1 } },
    select: { version: true },
  });
}

/** A missing row (nothing has been bumped yet) reads as version 0. */
export async function readAuthzVersion(db: AuthzVersionDb): Promise<string> {
  const row = await db.authzVersion.findUnique({
    where: { id: 1 },
    select: { version: true },
  });
  return (row?.version ?? 0n).toString();
}
