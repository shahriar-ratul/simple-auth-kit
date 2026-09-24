// Writes the seed permissions and roles into the database. Only `database/seed.ts` (and the
// proof harness) call this; the app never does.
import type { PrismaClient } from '@/database/generated/prisma/client';
import { PERMISSION_SLUGS } from '../../src/modules/auth/permission-slugs.js';
import { PERMISSION_CATALOG, PERMISSION_GROUP_ORDER } from './permissions.js';
import { DEFAULT_ROLES } from './roles.js';

/** Anything that can write the catalog tables: the PrismaClient, or a `$transaction` client. */
export type RbacWriter = Pick<PrismaClient, 'permission' | 'role' | 'permissionRole'>;

/**
 * Writes the starting catalog, and one workspace's roles, into `db` (which may be a transaction
 * client).
 *
 * Idempotent and safe to run concurrently: every insert is `skipDuplicates` (`ON CONFLICT DO
 * NOTHING`) on the natural unique key, and nothing is ever deleted or updated. Re-running is
 * additive on purpose — a permission attached to a seeded role by hand survives it, and so does a
 * permission an administrator deactivated or renamed.
 */
export async function provisionDefaultRoles(db: RbacWriter, workspaceId: bigint): Promise<void> {
  await db.permission.createMany({
    data: PERMISSION_SLUGS.map((slug) => ({
      slug,
      name: PERMISSION_CATALOG[slug].displayName,
      displayName: PERMISSION_CATALOG[slug].displayName,
      description: PERMISSION_CATALOG[slug].description,
      group: PERMISSION_CATALOG[slug].group,
      groupOrder: PERMISSION_GROUP_ORDER.indexOf(PERMISSION_CATALOG[slug].group),
      order: PERMISSION_CATALOG[slug].order,
    })),
    skipDuplicates: true,
  });
  const permissions = await db.permission.findMany({
    where: { slug: { in: PERMISSION_SLUGS } },
    select: { id: true, slug: true },
  });
  const permissionId = new Map(permissions.map((p) => [p.slug, p.id]));

  await db.role.createMany({
    data: DEFAULT_ROLES.map((role) => ({
      workspaceId,
      slug: role.slug,
      name: role.displayName,
      displayName: role.displayName,
      description: role.description,
      isDefault: role.isDefault,
      order: role.order,
    })),
    skipDuplicates: true,
  });
  const roles = await db.role.findMany({
    where: { workspaceId, slug: { in: DEFAULT_ROLES.map((r) => r.slug) } },
    select: { id: true, slug: true },
  });
  const seedBySlug = new Map(DEFAULT_ROLES.map((role) => [role.slug, role]));

  const rolePermissions = roles.flatMap((role) =>
    (seedBySlug.get(role.slug)?.permissions ?? []).map((slug) => ({
      roleId: role.id,
      permissionId: permissionId.get(slug)!,
    })),
  );
  if (rolePermissions.length)
    await db.permissionRole.createMany({
      data: rolePermissions,
      skipDuplicates: true,
    });
}
