// Writes the seed permissions and roles into the database. Only `database/seed.ts` (and the
// proof harness) call this; the app never does.
import { inArray } from 'drizzle-orm';
import type { Database } from '@/common/config/db';
import { permissionRole, permissions, roles } from '@/database/schema';
import { PERMISSION_SLUGS } from '../../src/modules/auth/permission-slugs.js';
import { PERMISSION_CATALOG, PERMISSION_GROUP_ORDER } from './permissions.js';
import { DEFAULT_ROLES } from './roles.js';

/**
 * Anything that can write the catalog tables. Drizzle has no client class to name (see `db.ts`),
 * so this is the structural equivalent of the reference combo's `Pick<PrismaClient, ...>`: a
 * transaction handle exposes the same `insert`/`select` builders as the database handle, so a
 * caller inside `db.transaction(...)` can pass `tx` straight through.
 */
export type RbacWriter = Pick<Database, 'insert' | 'select'>;

/**
 * Writes the starting catalog and roles above into `db`, which may be a transaction client — so a
 * caller that has to provision roles atomically alongside other rows can.
 *
 * Idempotent and safe to run concurrently: every insert is `ON CONFLICT DO NOTHING` on the natural
 * unique key, and nothing is ever deleted or updated. Re-running is additive on purpose — a
 * permission attached to a seeded role by hand survives it, and so does a permission an
 * administrator deactivated or renamed.
 */
export async function provisionDefaultRoles(db: RbacWriter): Promise<void> {
  // Insert-then-read rather than `.returning()`: ON CONFLICT DO NOTHING returns no row for the
  // slugs that already existed, and the ids of *those* are exactly the ones a re-run needs.
  await db
    .insert(permissions)
    .values(
      PERMISSION_SLUGS.map((slug) => ({
        slug,
        name: PERMISSION_CATALOG[slug].displayName,
        displayName: PERMISSION_CATALOG[slug].displayName,
        description: PERMISSION_CATALOG[slug].description,
        group: PERMISSION_CATALOG[slug].group,
        groupOrder: PERMISSION_GROUP_ORDER.indexOf(PERMISSION_CATALOG[slug].group),
        order: PERMISSION_CATALOG[slug].order,
      })),
    )
    .onConflictDoNothing({ target: permissions.slug });
  const permissionRows = await db
    .select({ id: permissions.id, slug: permissions.slug })
    .from(permissions)
    .where(inArray(permissions.slug, PERMISSION_SLUGS));
  const permissionId = new Map(permissionRows.map((p) => [p.slug, p.id]));

  await db
    .insert(roles)
    .values(
      DEFAULT_ROLES.map((role) => ({
        slug: role.slug,
        name: role.displayName,
        displayName: role.displayName,
        description: role.description,
        isDefault: role.isDefault,
        order: role.order,
      })),
    )
    .onConflictDoNothing({ target: roles.slug });
  const roleRows = await db
    .select({ id: roles.id, slug: roles.slug })
    .from(roles)
    .where(
      inArray(
        roles.slug,
        DEFAULT_ROLES.map((r) => r.slug),
      ),
    );
  const seedBySlug = new Map(DEFAULT_ROLES.map((role) => [role.slug, role]));

  const pairs = roleRows.flatMap((role) =>
    (seedBySlug.get(role.slug)?.permissions ?? []).map((slug) => ({
      roleId: role.id,
      permissionId: permissionId.get(slug)!,
    })),
  );
  if (pairs.length) {
    await db
      .insert(permissionRole)
      .values(pairs)
      .onConflictDoNothing({
        target: [permissionRole.permissionId, permissionRole.roleId],
      });
  }
}
