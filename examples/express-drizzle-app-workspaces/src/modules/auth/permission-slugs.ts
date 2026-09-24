// The permission slugs this build's routes are gated on — the one part of RBAC that is code
// rather than data. `PermissionSlug` is what `ability(...)` accepts, so a route can't demand a slug
// this list doesn't name. Everything else — which permissions a deployment has, what they're
// called, which roles carry them, who holds those roles — lives only in the database.
// `database/seedData/` is an optional starting point for that data; nothing under `src/`
// imports it, so the app builds and runs with it deleted.
const SLUGS = [
  'users:read',
  'users:block',
  'users:manage',
  'roles:manage',
  'roles:assign',
  'permissions:read',
  'permissions:define',
  'permissions:grant',
  'members:manage',
  'audit-log:read',
] as const;

export type PermissionSlug = (typeof SLUGS)[number];

export const PERMISSION_SLUGS: PermissionSlug[] = [...SLUGS];
