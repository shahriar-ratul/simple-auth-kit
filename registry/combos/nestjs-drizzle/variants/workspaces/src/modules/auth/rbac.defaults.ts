// The permission catalog and the system roles — what a fresh database is *seeded* with, and the
// type that keeps routes honest.
//
// Two different things live here, and keeping them apart is the whole point of the design:
//
//   1. **The catalog as a type.** `PermissionSlug` is `keyof typeof PERMISSION_CATALOG`, and
//      `@CheckAbility(...)` takes that type rather than `string`. A route cannot demand a
//      permission this build never defined, so "this route requires something nothing can ever
//      grant" is a compile error rather than a 403 nobody can explain. Adding an admin route
//      means adding its slug here first.
//
//   2. **The catalog as seed data.** `provisionDefaultRoles` writes these rows once and never
//      rewrites them. From then on the database is authoritative: which role carries which
//      permission, who holds which role, and whether a permission is active at all are rows an
//      administrator edits, and nothing in the request path reads this file. Editing a row
//      changes enforcement on the very next request, with no code change and no redeploy;
//      editing this file changes only what a *new* deployment starts with.
//
// That is what "code declares what a route demands; the database decides who is granted it" means
// concretely.
//
// `Role` is unique per `[workspaceId, slug]`, so role slugs in one workspace mean nothing in
// another and a new workspace genuinely starts with no roles at all. That is why the provisioning
// below is a shared function and not a step in the seeder: the seeder is not the only thing that
// creates a workspace.
//
// Callers: `src/seed.ts` (which provisions the *first* workspace) and
// `src/workspace.repository.ts` (which provisions every workspace created afterwards, inside the
// same transaction that creates it, so its creator is never locked out of a workspace they just
// made).
import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "../../common/config/db";
import { permissionRole, permissions, roles } from "@/database/schema";

/** The display metadata a seeded permission carries. `group`/`order` exist so an admin console can render a stable matrix. */
export interface PermissionSeed {
  displayName: string;
  description: string;
  group: string;
  order: number;
}

/**
 * One slug per capability the admin API actually exposes, named `noun:verb`. Reading and writing
 * the same noun are separate slugs; block and unblock share one, because they are a single
 * capability used in two directions.
 *
 * The slugs are global (so is the `Permission` table); the authority they confer is scoped to the
 * workspace the request names, because it is that workspace's roles and that membership's grants
 * that point at them.
 *
 * The slug is the whole ability. `@CheckAbility("users:read")` on a route and
 * `ability.can("users:read", ABILITY_SUBJECT)` in a client are the same string — there is no
 * action/subject pairing to keep in sync, and no rule shape a route guard could only partially
 * evaluate.
 */
export const PERMISSION_CATALOG = {
  "users:read": {
    displayName: "List members",
    description: "GET /admin/users",
    group: "Users",
    order: 1,
  },
  "users:block": {
    displayName: "Block and unblock members",
    description: "POST /admin/users/:userId/block, .../unblock",
    group: "Users",
    order: 2,
  },
  "users:manage": {
    displayName: "Edit and delete members",
    description:
      "Edit a member's profile or delete their account — PATCH /admin/users/:userId, DELETE /admin/users/:userId",
    group: "Users",
    order: 3,
  },
  "roles:manage": {
    displayName: "Define roles",
    description:
      "Create, edit, or delete this workspace's roles and say what they carry — POST/PATCH/DELETE /roles(/:roleId), POST /roles/:roleId/permissions",
    group: "Roles",
    order: 1,
  },
  "roles:assign": {
    displayName: "Assign roles",
    description:
      "Assign and revoke a member's roles — POST /admin/users/:userId/roles, .../roles/:roleSlug/revoke, PUT /workspaces/members/:memberId/roles",
    group: "Roles",
    order: 2,
  },
  "permissions:read": {
    displayName: "Read the permission catalog",
    description: "GET /permissions",
    group: "Permissions",
    order: 1,
  },
  "permissions:define": {
    displayName: "Define permissions",
    description:
      "Create a permission, rename it, or deactivate it — POST /permissions. The authority that defines all the others.",
    group: "Permissions",
    order: 2,
  },
  "permissions:grant": {
    displayName: "Grant permissions directly",
    description:
      "Grant and revoke a permission straight to a member, bypassing roles — POST /admin/users/:userId/permissions, .../permissions/:slug/revoke",
    group: "Permissions",
    order: 3,
  },
  "members:manage": {
    displayName: "Add and remove members",
    description:
      "POST /workspaces/members, DELETE /workspaces/members/:memberId",
    group: "Members",
    order: 1,
  },
  "audit-log:read": {
    displayName: "Read the audit log",
    description: "GET /audit-log",
    group: "Audit",
    order: 1,
  },
} as const satisfies Record<string, PermissionSeed>;

/**
 * Every slug the catalog defines, as a type. This is what `@CheckAbility` takes.
 *
 * Deployments may invent slugs at runtime — `POST /permissions` accepts any string —
 * and those work exactly like these do at the database level. What they cannot do is gate a route
 * shipped by this library, because a route's slug is checked against this type at compile time.
 */
export type PermissionSlug = keyof typeof PERMISSION_CATALOG;

export const PERMISSION_SLUGS = Object.keys(
  PERMISSION_CATALOG,
) as PermissionSlug[];

/** Groups, in the order an admin console should render them. Derived from the catalog so it cannot drift from it. */
export const PERMISSION_GROUP_ORDER: string[] = [
  ...new Set(PERMISSION_SLUGS.map((slug) => PERMISSION_CATALOG[slug].group)),
];

/** The display metadata a seeded role carries, plus what it starts out granting. */
export interface RoleSeed {
  slug: string;
  displayName: string;
  description: string;
  /** Given to every newly signed-up user. Exactly one role should carry it. */
  isDefault: boolean;
  order: number;
  permissions: readonly PermissionSlug[];
}

/**
 * The system-defined roles every workspace is provisioned with. `admin` carries the whole
 * catalog; `member` is the new-membership default and carries nothing, because every slug above
 * is an administrative capability and the safe default is the empty set.
 *
 * Note what the names are and are not: no guard checks for the literal string "admin" — authority
 * comes only from the permissions a role carries. Renaming `admin` here does not open a hole, it
 * just leaves new workspaces with no role that carries the catalog. And `member` is the default a
 * new membership gets because `isDefault` says so on the row, not because any code spells
 * "member".
 */
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
    slug: "superadmin",
    displayName: "Super Administrator",
    description: "Carries every permission in the catalog.",
    isDefault: false,
    order: 1,
    permissions: PERMISSION_SLUGS,
  },
  {
    slug: "member",
    displayName: "Member",
    description:
      "The default for a new membership. Carries no administrative permission.",
    isDefault: true,
    order: 2,
    permissions: [],
  },
];

/**
 * The role slugs a workspace's creator gets — and the same pair the seeded admin gets. They are
 * meaningful only because `provisionDefaultRoles` puts the matching `Role` rows in the same
 * workspace: a slug with no `Role` row behind it resolves to zero permissions.
 */
export const WORKSPACE_CREATOR_ROLES: string[] = ["admin", "member"];

/** Role slugs given to the seeded super_admin's membership. `member` is included so they're also an ordinary member. */
export const SEED_SUPERADMIN_ROLES: string[] = ["superadmin", "member"];

/**
 * Anything that can write the catalog tables. Drizzle has no client class to name (see `db.ts`),
 * so this is the structural equivalent of the reference combo's `Pick<PrismaClient, ...>`: a
 * transaction handle exposes the same `insert`/`select` builders as the database handle, which is
 * what `WorkspaceRepository.create` passes straight through.
 */
export type RbacWriter = Pick<Database, "insert" | "select">;

/**
 * Writes the starting catalog, and one workspace's roles, into `db` — which may be a transaction
 * client, which is what `WorkspaceRepository.create` passes, so the workspace, its creator's
 * membership and its roles all land together or not at all.
 *
 * Idempotent and safe to run concurrently: every insert is `ON CONFLICT DO NOTHING` on the natural
 * unique key, and nothing is ever deleted or updated. Re-running is additive on purpose — a
 * permission attached to a seeded role by hand survives it, and so does a permission an
 * administrator deactivated or renamed.
 */
// Takes bigint directly: both callers (`WorkspaceRepository.create`, `seed.ts`) already have the
// workspace row's id in hand from their own database call.
export async function provisionDefaultRoles(
  db: RbacWriter,
  workspaceId: bigint,
): Promise<void> {
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
        groupOrder: PERMISSION_GROUP_ORDER.indexOf(
          PERMISSION_CATALOG[slug].group,
        ),
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
        workspaceId,
        slug: role.slug,
        name: role.displayName,
        displayName: role.displayName,
        description: role.description,
        isDefault: role.isDefault,
        order: role.order,
      })),
    )
    .onConflictDoNothing({ target: [roles.workspaceId, roles.slug] });
  const roleRows = await db
    .select({ id: roles.id, slug: roles.slug })
    .from(roles)
    .where(
      and(
        eq(roles.workspaceId, workspaceId),
        inArray(
          roles.slug,
          DEFAULT_ROLES.map((r) => r.slug),
        ),
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
