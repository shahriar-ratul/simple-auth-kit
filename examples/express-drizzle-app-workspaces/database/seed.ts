// Idempotent database seeder — everything RBAC needs before this deployment can authorize
// anything. Roles are system-defined with fixed permission sets, so a fresh database has no
// Permission rows and no Role rows, and every authorization check has nothing to check against.
//
//   npm run seed
//
// It seeds four things, in order:
//
//   1. the permission catalog — one slug per capability the admin API exposes. Global, not
//      workspace-scoped, exactly like the Permission table itself;
//   2. the first workspace (SEED_WORKSPACE_NAME, defaulting below) — roles here are scoped to a
//      workspace, so there has to be one for them to live in;
//   3. that workspace's default roles and their permission sets;
//   4. an initial admin user and their membership of that workspace, but only when
//      SEED_ADMIN_EMAIL *and* SEED_ADMIN_PASSWORD are set. There is deliberately no fallback
//      password: a seeder that invents one puts the same known credential on every fresh
//      deployment. With the variables unset it says so and carries on.
//
// Re-running is safe: every write is an upsert and nothing is ever deleted. That also means it
// is additive, on purpose — a permission you attached to a role by hand survives a re-run, and
// an admin who already exists keeps the password they have now (the seeder never rewrites a
// password it did not set).
//
// Roles seeded here belong to the seeded workspace only — `Role` is unique per
// `[workspaceId, slug]`, so there is no such thing as a role that exists in all of them. A
// workspace created later through POST /workspaces builds its own roles from the database (see
// `WorkspaceRepository.create`), not from this seed data. (1) and (3) are defined in
// `database/seedData/`, which the app never imports: after seeding, the database is the only
// source of truth.
import { and, asc, eq, inArray, notInArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { hashPassword } from '@/core/crypto.js';
import type { Database } from '../src/common/config/db.js';
import {
  DEFAULT_ROLES,
  DEFAULT_WORKSPACE_NAME,
  PERMISSION_SLUGS,
  provisionDefaultRoles,
  SEED_ADMIN_ROLES,
  SEED_SUPERADMIN_ROLES,
} from './seedData/index.js';
import * as schema from './schema.js';
import { permissions, roleMember, roles, users, workspaceMembers, workspaces } from './schema.js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — the seeder cannot reach the database without it`);
  return value;
}

/** Workspace names are not unique in the schema, so re-running adopts the one it made last time rather than making another. */
async function seedWorkspace(db: Database): Promise<{ id: bigint; name: string }> {
  const name = process.env['SEED_WORKSPACE_NAME'] || DEFAULT_WORKSPACE_NAME;
  const [existing] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.name, name))
    .orderBy(asc(workspaces.createdAt))
    .limit(1);
  if (existing) {
    console.log(`workspace: "${name}" already exists (${existing.id})`);
    return existing;
  }
  const [created] = await db.insert(workspaces).values({ name }).returning();
  console.log(`workspace: created "${name}" (${created.id})`);
  return created;
}

/** The catalog and this workspace's roles come from `database/seedData/`; this only reports what it wrote. */
async function seedRbacDefaults(db: Database, workspaceId: bigint): Promise<void> {
  await provisionDefaultRoles(db, workspaceId);
  console.log(`permissions: ${PERMISSION_SLUGS.length} slug(s) in the catalog`);
  for (const role of DEFAULT_ROLES)
    console.log(
      `role "${role.slug}": ${role.permissions.length} permission(s)${role.isDefault ? ' (new-member default)' : ''}`,
    );

  // Slugs that exist in the database but not in this build's catalog. They are not an error —
  // `POST /api/v1/permissions` exists so a deployment can define its own, and a grant can
  // create one — but a slug no route names grants nothing, so a typo would otherwise be a
  // permission that mysteriously never works. Printing them is what makes it visible.
  const unknown = await db
    .select({ slug: permissions.slug })
    .from(permissions)
    .where(notInArray(permissions.slug, PERMISSION_SLUGS));
  if (unknown.length)
    console.log(
      `permissions: ${unknown.length} slug(s) outside this build's catalog (no route names them): ${unknown.map((r) => r.slug).join(', ')}`,
    );
  const inactive = await db.select({ slug: permissions.slug }).from(permissions).where(eq(permissions.isActive, false));
  if (inactive.length)
    console.log(
      `permissions: ${inactive.length} deactivated, granting nothing: ${inactive.map((r) => r.slug).join(', ')}`,
    );
}

/** The user is the authentication principal; the membership below is the authorization one. */
async function seedAdminUser(db: Database, workspace: { id: bigint; name: string }): Promise<void> {
  const email = process.env['SEED_ADMIN_EMAIL'];
  const password = process.env['SEED_ADMIN_PASSWORD'];
  if (!email || !password) {
    console.log(
      `admin: skipped — set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to create one (there is no default password)`,
    );
    console.log(`admin: "${workspace.name}" has no members until you re-run with them set`);
    return;
  }

  // Their password may have been changed since; rewriting it here would silently reset it.
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  const user =
    existing ??
    (
      await db
        .insert(users)
        .values({ email, passwordHash: await hashPassword(password) })
        .returning({ id: users.id })
    )[0];
  console.log(existing ? `admin: ${email} already exists — password left unchanged` : `admin: created ${email}`);

  const [existingMembership] = await db
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.userId, user.id), eq(workspaceMembers.workspaceId, workspace.id)))
    .limit(1);
  const membership =
    existingMembership ??
    (
      await db
        .insert(workspaceMembers)
        .values({ userId: user.id, workspaceId: workspace.id })
        .returning({ id: workspaceMembers.id })
    )[0];

  const adminRoles = await db
    .select({ id: roles.id, slug: roles.slug })
    .from(roles)
    .where(and(eq(roles.workspaceId, workspace.id), inArray(roles.slug, SEED_ADMIN_ROLES)));
  if (adminRoles.length) {
    await db
      .insert(roleMember)
      .values(
        adminRoles.map((role) => ({
          memberId: membership.id,
          roleId: role.id,
        })),
      )
      .onConflictDoNothing({
        target: [roleMember.memberId, roleMember.roleId],
      });
  }
  console.log(`admin: member of "${workspace.name}" with roles ${adminRoles.map((r) => r.slug).join(', ')}`);
}

/** Same shape as seedAdminUser, for the seeded super_admin account — a distinct account and membership holding the "superadmin" role. */
async function seedSuperAdminUser(db: Database, workspace: { id: bigint; name: string }): Promise<void> {
  const email = process.env['SEED_SUPERADMIN_EMAIL'];
  const password = process.env['SEED_SUPERADMIN_PASSWORD'];
  if (!email || !password) {
    console.log(
      `super admin: skipped — set SEED_SUPERADMIN_EMAIL and SEED_SUPERADMIN_PASSWORD to create one (there is no default password)`,
    );
    return;
  }
  const username = process.env['SEED_SUPERADMIN_USERNAME'] || undefined;

  // Their password may have been changed since; rewriting it here would silently reset it.
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  const user =
    existing ??
    (
      await db
        .insert(users)
        .values({ email, username, passwordHash: await hashPassword(password) })
        .returning({ id: users.id })
    )[0];
  console.log(
    existing
      ? `super admin: ${email} already exists — password left unchanged`
      : `super admin: created ${email}${username ? ` (username ${username})` : ''}`,
  );

  const [existingMembership] = await db
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.userId, user.id), eq(workspaceMembers.workspaceId, workspace.id)))
    .limit(1);
  const membership =
    existingMembership ??
    (
      await db
        .insert(workspaceMembers)
        .values({ userId: user.id, workspaceId: workspace.id })
        .returning({ id: workspaceMembers.id })
    )[0];

  const superAdminRoles = await db
    .select({ id: roles.id, slug: roles.slug })
    .from(roles)
    .where(and(eq(roles.workspaceId, workspace.id), inArray(roles.slug, SEED_SUPERADMIN_ROLES)));
  if (superAdminRoles.length) {
    await db
      .insert(roleMember)
      .values(
        superAdminRoles.map((role) => ({
          memberId: membership.id,
          roleId: role.id,
        })),
      )
      .onConflictDoNothing({
        target: [roleMember.memberId, roleMember.roleId],
      });
  }
  console.log(`super admin: member of "${workspace.name}" with roles ${superAdminRoles.map((r) => r.slug).join(', ')}`);
}

async function main(): Promise<void> {
  // Loads .env from the working directory if there is one. It never overrides a variable the
  // process was already given, so an explicit `SEED_ADMIN_PASSWORD=... npm run seed` still wins.
  try {
    process.loadEnvFile();
  } catch {
    // No .env here — the environment is expected to carry the variables itself (docker, CI, ...).
  }

  const pool = new Pool({ connectionString: requireEnv('DATABASE_URL') });
  try {
    const db: Database = drizzle(pool, { schema });
    const workspace = await seedWorkspace(db);
    await seedRbacDefaults(db, workspace.id);
    await seedAdminUser(db, workspace);
    await seedSuperAdminUser(db, workspace);
    console.log('seed complete.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
