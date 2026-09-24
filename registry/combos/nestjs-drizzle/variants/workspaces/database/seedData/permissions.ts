// Seed data: the permission rows a fresh database starts with. Only `database/seed.ts` (and the
// proof harness) read this — the app never imports anything under `database/seedData/`, so a
// deployment can edit, trim, or delete this folder and manage permissions purely through the
// database. Keyed by `PermissionSlug`: every slug a route is gated on gets a row here, and a
// row for a slug no route names is a compile error.
import type { PermissionSlug } from "../../src/modules/auth/permission-slugs.js";

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
} as const satisfies Record<PermissionSlug, PermissionSeed>;

/** Groups, in render order for an admin console. Derived from the catalog so it can't drift. */
export const PERMISSION_GROUP_ORDER: string[] = [
  ...new Set(Object.values(PERMISSION_CATALOG).map((p) => p.group)),
];
