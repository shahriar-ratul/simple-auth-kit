// Idempotent database seeder — everything RBAC needs before this deployment can authorize
// anything. Roles are system-defined with fixed permission sets, so a fresh database has no
// permission rows and no role rows, and every authorization check has nothing to check against.
//
//   npm run seed
//
// It seeds three things, in order:
//
//   1. the permission catalog — one slug per capability the admin API exposes;
//   2. the default roles and their permission sets;
//   3. an initial admin user, but only when SEED_ADMIN_EMAIL *and* SEED_ADMIN_PASSWORD are set.
//      There is deliberately no fallback password: a seeder that invents one puts the same known
//      credential on every fresh deployment. With the variables unset it says so and carries on.
//
// Re-running is safe: every write is an upsert and nothing is ever deleted. That also means it
// is additive, on purpose — a permission you attached to a role by hand survives a re-run, and
// an admin who already exists keeps the password they have now (the seeder never rewrites a
// password it did not set).
//
// (1) and (2) are not defined here: they live in `rbac.defaults.ts`, which is also what types
// `@CheckAbility` on the routes. The seeder is a caller of that definition, not its owner — so
// what gets seeded and what the routes demand cannot drift apart.
import { eq, inArray, notInArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { hashPassword } from "@/lib/auth/core/crypto.js";
import type { Database } from "../src/common/config/db.js";
import {
  DEFAULT_ROLES,
  PERMISSION_SLUGS,
  SEED_ADMIN_ROLES,
  SEED_SUPERADMIN_ROLES,
  provisionDefaultRoles,
} from "../src/modules/auth/rbac.defaults.js";
import * as schema from "./schema.js";
import { permissions, roleUser, roles, users } from "./schema.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(
      `${name} is not set — the seeder cannot reach the database without it`,
    );
  return value;
}

/** The catalog and the roles come from rbac.defaults.ts; this only reports what it wrote. */
async function seedRbacDefaults(db: Database): Promise<void> {
  await provisionDefaultRoles(db);
  console.log(`permissions: ${PERMISSION_SLUGS.length} slug(s) in the catalog`);
  for (const role of DEFAULT_ROLES)
    console.log(
      `role "${role.slug}": ${role.permissions.length} permission(s)${role.isDefault ? " (signup default)" : ""}`,
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
      `permissions: ${unknown.length} slug(s) outside this build's catalog (no route names them): ${unknown.map((r) => r.slug).join(", ")}`,
    );
  const inactive = await db
    .select({ slug: permissions.slug })
    .from(permissions)
    .where(eq(permissions.isActive, false));
  if (inactive.length)
    console.log(
      `permissions: ${inactive.length} deactivated, granting nothing: ${inactive.map((r) => r.slug).join(", ")}`,
    );
}

/** Roles are global here, so administrative authority is a property of the user row itself. */
async function seedAdminUser(db: Database): Promise<void> {
  const email = process.env["SEED_ADMIN_EMAIL"];
  const password = process.env["SEED_ADMIN_PASSWORD"];
  if (!email || !password) {
    console.log(
      "admin: skipped — set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to create one (there is no default password)",
    );
    return;
  }

  // Their password may have been changed since; rewriting it here would silently reset it.
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  // Hashed by the same function signup uses, so the seeded admin can actually log in.
  const user =
    existing ??
    (
      await db
        .insert(users)
        .values({ email, passwordHash: await hashPassword(password) })
        .returning({ id: users.id })
    )[0];
  console.log(
    existing
      ? `admin: ${email} already exists — password left unchanged`
      : `admin: created ${email}`,
  );

  const adminRoles = await db
    .select({ id: roles.id, slug: roles.slug })
    .from(roles)
    .where(inArray(roles.slug, SEED_ADMIN_ROLES));
  if (adminRoles.length) {
    await db
      .insert(roleUser)
      .values(adminRoles.map((role) => ({ userId: user.id, roleId: role.id })))
      .onConflictDoNothing({ target: [roleUser.userId, roleUser.roleId] });
  }
  console.log(`admin: holds roles ${adminRoles.map((r) => r.slug).join(", ")}`);
}

/** Same shape as seedAdminUser, for the seeded super_admin account — a distinct account holding the "superadmin" role. */
async function seedSuperAdminUser(db: Database): Promise<void> {
  const email = process.env["SEED_SUPERADMIN_EMAIL"];
  const password = process.env["SEED_SUPERADMIN_PASSWORD"];
  if (!email || !password) {
    console.log(
      "super admin: skipped — set SEED_SUPERADMIN_EMAIL and SEED_SUPERADMIN_PASSWORD to create one (there is no default password)",
    );
    return;
  }
  const username = process.env["SEED_SUPERADMIN_USERNAME"] || undefined;

  // Their password may have been changed since; rewriting it here would silently reset it.
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  // Hashed by the same function signup uses, so the seeded super admin can actually log in.
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
      : `super admin: created ${email}${username ? ` (username ${username})` : ""}`,
  );

  const superAdminRoles = await db
    .select({ id: roles.id, slug: roles.slug })
    .from(roles)
    .where(inArray(roles.slug, SEED_SUPERADMIN_ROLES));
  if (superAdminRoles.length) {
    await db
      .insert(roleUser)
      .values(
        superAdminRoles.map((role) => ({ userId: user.id, roleId: role.id })),
      )
      .onConflictDoNothing({ target: [roleUser.userId, roleUser.roleId] });
  }
  console.log(
    `super admin: holds roles ${superAdminRoles.map((r) => r.slug).join(", ")}`,
  );
}

async function main(): Promise<void> {
  // Loads .env from the working directory if there is one. It never overrides a variable the
  // process was already given, so an explicit `SEED_ADMIN_PASSWORD=... npm run seed` still wins.
  try {
    process.loadEnvFile();
  } catch {
    // No .env here — the environment is expected to carry the variables itself (docker, CI, ...).
  }

  const pool = new Pool({ connectionString: requireEnv("DATABASE_URL") });
  try {
    const db: Database = drizzle(pool, { schema });
    await seedRbacDefaults(db);
    await seedAdminUser(db);
    await seedSuperAdminUser(db);
    console.log("seed complete.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
