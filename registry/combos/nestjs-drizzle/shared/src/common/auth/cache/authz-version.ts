// The authz cache's invalidation signal: the single `authz_version` row, bumped by the application
// in the same write path (and, where there is one, the same transaction) as every change to what
// `resolveAuthzContext` returns. `AuthzCache` compares it on each request. Writes made behind the
// app's back — a raw SQL session — don't bump it; those are covered by the cache's TTL instead.
import { eq, sql } from "drizzle-orm";
import type { Database } from "@/common/config/db";
import { authzVersion } from "@/database/schema";

/** The database handle or a transaction handle — both expose the same builders. */
export type AuthzVersionDb = Pick<Database, "insert" | "select">;

/** The current version; a missing row (a database nothing has written RBAC to yet) reads as 0. */
export async function readAuthzVersion(db: AuthzVersionDb): Promise<number> {
  const [row] = await db
    .select({ version: authzVersion.version })
    .from(authzVersion)
    .where(eq(authzVersion.id, 1))
    .limit(1);
  return row?.version ?? 0;
}

/** Moves the version on: creates the row on first use, increments it after that. */
export async function bumpAuthzVersion(db: AuthzVersionDb): Promise<void> {
  await db
    .insert(authzVersion)
    .values({ id: 1, version: 1 })
    .onConflictDoUpdate({
      target: authzVersion.id,
      set: { version: sql`${authzVersion.version} + 1` },
    });
}
