// The permission catalog and system roles — what a fresh database is seeded with, and the type
// that keeps routes honest. `PermissionSlug` (`keyof typeof PERMISSION_CATALOG`) is what
// `@CheckAbility` takes, so a route can't demand a permission this build never defined.
// `provisionDefaultRoles` writes these rows once at seed time; from then on the database is
// authoritative and nothing in the request path reads this file. Callers: `src/seed.ts` and
// `variants/base/test/variant-hooks.ts`.
import type { PrismaClient } from "../generated/prisma/client.js";

export interface PermissionSeed {
  displayName: string;
  description: string;
  group: string;
  order: number;
}

// One slug per capability the admin API exposes, named `noun:verb`. Reading and writing the
// same noun are separate slugs; block and unblock share one since they're a single capability
// used in two directions.
export const PERMISSION_CATALOG = {
  "users:read": { displayName: "List users", description: "GET /auth/admin/users, GET /auth/admin/users/:userId", group: "Users", order: 1 },
  "users:block": { displayName: "Block and unblock users", description: "POST /auth/admin/users/:userId/block, .../unblock", group: "Users", order: 2 },
  "users:manage": {
    displayName: "Create, edit, and delete users",
    description:
      "Create a user directly, edit a user's profile, or delete their account — POST /auth/admin/users, PATCH /auth/admin/users/:userId, DELETE /auth/admin/users/:userId",
    group: "Users",
    order: 3,
  },
  "roles:manage": {
    displayName: "Define roles",
    description: "Create, edit, or delete roles and say what they carry — POST/PATCH/DELETE /auth/admin/roles(/:roleId), POST /auth/admin/roles/:roleId/permissions",
    group: "Roles",
    order: 1,
  },
  "roles:assign": {
    displayName: "Assign roles",
    description: "Assign and revoke a user's roles — POST /auth/admin/users/:userId/roles, .../roles/:roleSlug/revoke",
    group: "Roles",
    order: 2,
  },
  "permissions:read": { displayName: "Read the permission catalog", description: "GET /auth/admin/permissions", group: "Permissions", order: 1 },
  "permissions:define": {
    displayName: "Define permissions",
    description: "Create a permission, rename it, or deactivate it — POST /auth/admin/permissions. The authority that defines all the others.",
    group: "Permissions",
    order: 2,
  },
  "permissions:grant": {
    displayName: "Grant permissions directly",
    description: "Grant and revoke a permission straight to a user, bypassing roles — POST /auth/admin/users/:userId/permissions, .../permissions/:slug/revoke",
    group: "Permissions",
    order: 3,
  },
  "audit-log:read": { displayName: "Read the audit log", description: "GET /auth/admin/audit-log", group: "Audit", order: 1 },

  "countries:read": { displayName: "List countries", description: "GET /auth/admin/countries, GET /auth/admin/countries/:countryId", group: "Countries", order: 1 },
  "countries:manage": {
    displayName: "Create, edit, and delete countries",
    description: "POST /auth/admin/countries, PATCH /auth/admin/countries/:countryId, DELETE /auth/admin/countries/:countryId",
    group: "Countries",
    order: 2,
  },
  "countries:status": {
    displayName: "Activate and deactivate countries",
    description: "POST /auth/admin/countries/:countryId/activate, .../deactivate",
    group: "Countries",
    order: 3,
  },

  "languages:read": { displayName: "List languages", description: "GET /auth/admin/languages, GET /auth/admin/languages/:languageId", group: "Languages", order: 1 },
  "languages:manage": {
    displayName: "Create, edit, and delete languages",
    description: "POST /auth/admin/languages, PATCH /auth/admin/languages/:languageId, DELETE /auth/admin/languages/:languageId",
    group: "Languages",
    order: 2,
  },
  "languages:status": {
    displayName: "Activate and deactivate languages",
    description: "POST /auth/admin/languages/:languageId/activate, .../deactivate",
    group: "Languages",
    order: 3,
  },

  "customers:read": { displayName: "List customers", description: "GET /auth/admin/customers, GET /auth/admin/customers/:customerId", group: "Customers", order: 1 },
  "customers:manage": {
    displayName: "Create, edit, and delete customers",
    description: "POST /auth/admin/customers, PATCH /auth/admin/customers/:customerId, DELETE /auth/admin/customers/:customerId",
    group: "Customers",
    order: 2,
  },
  "customers:status": {
    displayName: "Activate and deactivate customers",
    description: "POST /auth/admin/customers/:customerId/activate, .../deactivate",
    group: "Customers",
    order: 3,
  },
} as const satisfies Record<string, PermissionSeed>;

// Deployments may invent slugs at runtime (`POST /auth/admin/permissions` accepts any string),
// but they can't gate a route shipped by this library — a route's slug is checked against this
// type at compile time.
export type PermissionSlug = keyof typeof PERMISSION_CATALOG;

export const PERMISSION_SLUGS = Object.keys(PERMISSION_CATALOG) as PermissionSlug[];

/** Groups, in render order for an admin console. Derived from the catalog so it can't drift. */
export const PERMISSION_GROUP_ORDER: string[] = [...new Set(PERMISSION_SLUGS.map((slug) => PERMISSION_CATALOG[slug].group))];

export interface RoleSeed {
  slug: string;
  displayName: string;
  description: string;
  /** Given to every newly signed-up user. Exactly one role should carry it. */
  isDefault: boolean;
  order: number;
  permissions: readonly PermissionSlug[];
}

// `admin` carries the whole catalog; `member` is the signup default and carries nothing. No
// guard checks for the literal string "admin" — authority comes only from the permissions a
// role carries.
export const DEFAULT_ROLES: readonly RoleSeed[] = [
  {
    slug: "admin",
    displayName: "Administrator",
    description: "Carries every permission in the catalog.",
    isDefault: false,
    order: 0,
    permissions: PERMISSION_SLUGS,
  },
  {
    slug: "member",
    displayName: "Member",
    description: "The signup default. Carries no administrative permission.",
    isDefault: true,
    order: 1,
    permissions: [],
  },
];

/** Role slugs given to the seeded admin. `member` is included so the admin is also an ordinary user. */
export const SEED_ADMIN_ROLES: string[] = ["admin", "member"];

export type RbacWriter = Pick<PrismaClient, "permission" | "role" | "permissionRole">;

// Idempotent and safe to run concurrently: every insert is `skipDuplicates` on the natural
// unique key, and nothing is ever deleted or updated.
export async function provisionDefaultRoles(db: RbacWriter): Promise<void> {
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
  const permissions = await db.permission.findMany({ where: { slug: { in: PERMISSION_SLUGS } }, select: { id: true, slug: true } });
  const permissionId = new Map(permissions.map((p) => [p.slug, p.id]));

  await db.role.createMany({
    data: DEFAULT_ROLES.map((role) => ({
      slug: role.slug,
      name: role.displayName,
      displayName: role.displayName,
      description: role.description,
      isDefault: role.isDefault,
      order: role.order,
    })),
    skipDuplicates: true,
  });
  const roles = await db.role.findMany({ where: { slug: { in: DEFAULT_ROLES.map((r) => r.slug) } }, select: { id: true, slug: true } });
  const seedBySlug = new Map(DEFAULT_ROLES.map((role) => [role.slug, role]));

  const rolePermissions = roles.flatMap((role) =>
    (seedBySlug.get(role.slug)?.permissions ?? []).map((slug) => ({ roleId: role.id, permissionId: permissionId.get(slug)! })),
  );
  if (rolePermissions.length) await db.permissionRole.createMany({ data: rolePermissions, skipDuplicates: true });
}
