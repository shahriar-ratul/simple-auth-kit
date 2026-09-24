// Seed data: the permission rows a fresh database starts with. Only `database/seed.ts` (and the
// proof harness) read this — the app never imports anything under `database/seedData/`, so a
// deployment can edit, trim, or delete this folder and manage permissions purely through the
// database. Keyed by `PermissionSlug`: every slug a route is gated on gets a row here, and a
// row for a slug no route names is a compile error.
import type { PermissionSlug } from '../../src/modules/auth/permission-slugs.js';

export interface PermissionSeed {
  displayName: string;
  description: string;
  group: string;
  order: number;
}

// One slug per capability the admin API exposes, named `noun:verb`. The slugs are global (so
// is the `Permission` table); the authority they confer is scoped to the workspace the request
// names, because it's that workspace's roles and that membership's grants that point at them.
export const PERMISSION_CATALOG = {
  'users:read': {
    displayName: 'List members',
    description: 'GET /api/v1/admin/users, GET /api/v1/admin/users/:userId',
    group: 'Users',
    order: 1,
  },
  'users:block': {
    displayName: 'Block and unblock members',
    description: 'POST /api/v1/admin/users/:userId/block, .../unblock',
    group: 'Users',
    order: 2,
  },
  'users:manage': {
    displayName: 'Create, edit, and delete members',
    description:
      "Create a user and add them to this workspace, edit a member's profile, or delete their account — POST /api/v1/admin/users, PATCH /api/v1/admin/users/:userId, DELETE /api/v1/admin/users/:userId",
    group: 'Users',
    order: 3,
  },
  'roles:manage': {
    displayName: 'Define roles',
    description:
      "Create, edit, or delete this workspace's roles and say what they carry — POST/PATCH/DELETE /api/v1/roles(/:roleId), POST /api/v1/roles/:roleId/permissions",
    group: 'Roles',
    order: 1,
  },
  'roles:assign': {
    displayName: 'Assign roles',
    description:
      "Assign and revoke a member's roles — POST /api/v1/admin/users/:userId/roles, .../roles/:roleSlug/revoke, PUT /api/v1/workspaces/members/:memberId/roles",
    group: 'Roles',
    order: 2,
  },
  'permissions:read': {
    displayName: 'Read the permission catalog',
    description: 'GET /api/v1/permissions',
    group: 'Permissions',
    order: 1,
  },
  'permissions:define': {
    displayName: 'Define permissions',
    description:
      'Create a permission, rename it, or deactivate it — POST /api/v1/permissions. The authority that defines all the others.',
    group: 'Permissions',
    order: 2,
  },
  'permissions:grant': {
    displayName: 'Grant permissions directly',
    description:
      'Grant and revoke a permission straight to a member, bypassing roles — POST /api/v1/admin/users/:userId/permissions, .../permissions/:slug/revoke',
    group: 'Permissions',
    order: 3,
  },
  'members:manage': {
    displayName: 'Add and remove members',
    description: 'POST /workspaces/members, DELETE /workspaces/members/:memberId',
    group: 'Members',
    order: 1,
  },
  'audit-log:read': {
    displayName: 'Read the audit log',
    description: 'GET /api/v1/audit-log',
    group: 'Audit',
    order: 1,
  },

  'countries:read': {
    displayName: 'List countries',
    description: 'GET /api/v1/admin/countries, GET /api/v1/admin/countries/:countryId',
    group: 'Countries',
    order: 1,
  },
  'countries:manage': {
    displayName: 'Create, edit, and delete countries',
    description:
      'POST /api/v1/admin/countries, PATCH /api/v1/admin/countries/:countryId, DELETE /api/v1/admin/countries/:countryId',
    group: 'Countries',
    order: 2,
  },
  'countries:status': {
    displayName: 'Activate and deactivate countries',
    description: 'POST /api/v1/admin/countries/:countryId/activate, .../deactivate',
    group: 'Countries',
    order: 3,
  },

  'languages:read': {
    displayName: 'List languages',
    description: 'GET /api/v1/admin/languages, GET /api/v1/admin/languages/:languageId',
    group: 'Languages',
    order: 1,
  },
  'languages:manage': {
    displayName: 'Create, edit, and delete languages',
    description:
      'POST /api/v1/admin/languages, PATCH /api/v1/admin/languages/:languageId, DELETE /api/v1/admin/languages/:languageId',
    group: 'Languages',
    order: 2,
  },
  'languages:status': {
    displayName: 'Activate and deactivate languages',
    description: 'POST /api/v1/admin/languages/:languageId/activate, .../deactivate',
    group: 'Languages',
    order: 3,
  },

  'customers:read': {
    displayName: 'List customers',
    description: 'GET /api/v1/admin/customers, GET /api/v1/admin/customers/:customerId',
    group: 'Customers',
    order: 1,
  },
  'customers:manage': {
    displayName: 'Create, edit, and delete customers',
    description:
      'POST /api/v1/admin/customers, PATCH /api/v1/admin/customers/:customerId, DELETE /api/v1/admin/customers/:customerId',
    group: 'Customers',
    order: 2,
  },
  'customers:status': {
    displayName: 'Activate and deactivate customers',
    description: 'POST /api/v1/admin/customers/:customerId/activate, .../deactivate',
    group: 'Customers',
    order: 3,
  },
} as const satisfies Record<PermissionSlug, PermissionSeed>;

/** Groups, in render order for an admin console. Derived from the catalog so it can't drift. */
export const PERMISSION_GROUP_ORDER: string[] = [...new Set(Object.values(PERMISSION_CATALOG).map((p) => p.group))];
