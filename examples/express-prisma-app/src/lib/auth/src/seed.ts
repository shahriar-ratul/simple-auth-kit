// Idempotent database seeder — everything RBAC needs before this deployment can authorize
// anything. Roles are system-defined with fixed permission sets, so a fresh database has no
// Permission rows and no Role rows, and every authorization check has nothing to check against.
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
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "@/lib/auth/core/crypto.js";
import { PrismaClient } from "../../../../generated/prisma/client.js";
import { DEFAULT_ROLES, PERMISSION_SLUGS, provisionDefaultRoles, SEED_ADMIN_ROLES, SEED_SUPERADMIN_ROLES } from "./rbac.defaults.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — the seeder cannot reach the database without it`);
  return value;
}

/** The catalog and the roles come from rbac.defaults.ts; this only reports what it wrote. */
async function seedRbacDefaults(prisma: PrismaClient): Promise<void> {
  await provisionDefaultRoles(prisma);
  console.log(`permissions: ${PERMISSION_SLUGS.length} slug(s) in the catalog`);
  for (const role of DEFAULT_ROLES) console.log(`role "${role.slug}": ${role.permissions.length} permission(s)${role.isDefault ? " (signup default)" : ""}`);

  // Slugs that exist in the database but not in this build's catalog. They are not an error —
  // `POST /auth/admin/permissions` exists so a deployment can define its own, and a grant can
  // create one — but a slug no route names grants nothing, so a typo would otherwise be a
  // permission that mysteriously never works. Printing them is what makes it visible.
  const rows = await prisma.permission.findMany({ select: { slug: true, isActive: true } });
  const unknown = rows.filter((row) => !(PERMISSION_SLUGS as string[]).includes(row.slug));
  if (unknown.length) console.log(`permissions: ${unknown.length} slug(s) outside this build's catalog (no route names them): ${unknown.map((r) => r.slug).join(", ")}`);
  const inactive = rows.filter((row) => !row.isActive);
  if (inactive.length) console.log(`permissions: ${inactive.length} deactivated, granting nothing: ${inactive.map((r) => r.slug).join(", ")}`);
}

/** Roles are global here, so administrative authority is a property of the user row itself. */
async function seedAdminUser(prisma: PrismaClient): Promise<void> {
  const email = process.env["SEED_ADMIN_EMAIL"];
  const password = process.env["SEED_ADMIN_PASSWORD"];
  if (!email || !password) {
    console.log("admin: skipped — set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to create one (there is no default password)");
    return;
  }

  // Their password may have been changed since; rewriting it here would silently reset it.
  const existing = await prisma.user.findUnique({ where: { email } });
  // Hashed by the same function signup uses, so the seeded admin can actually log in.
  const user = existing ?? (await prisma.user.create({ data: { email, passwordHash: await hashPassword(password) } }));
  console.log(existing ? `admin: ${email} already exists — password left unchanged` : `admin: created ${email}`);

  const roles = await prisma.role.findMany({ where: { slug: { in: SEED_ADMIN_ROLES } }, select: { id: true, slug: true } });
  await prisma.roleUser.createMany({ data: roles.map((role) => ({ userId: user.id, roleId: role.id })), skipDuplicates: true });
  console.log(`admin: holds roles ${roles.map((r) => r.slug).join(", ")}`);
}

/** Roles are global here; a second seeded account with the same full-catalog authority as admin. */
async function seedSuperAdminUser(prisma: PrismaClient): Promise<void> {
  const email = process.env["SEED_SUPERADMIN_EMAIL"];
  const password = process.env["SEED_SUPERADMIN_PASSWORD"];
  if (!email || !password) {
    console.log("super admin: skipped — set SEED_SUPERADMIN_EMAIL and SEED_SUPERADMIN_PASSWORD to create one (there is no default password)");
    return;
  }
  const username = process.env["SEED_SUPERADMIN_USERNAME"] || undefined;

  // Their password may have been changed since; rewriting it here would silently reset it.
  const existing = await prisma.user.findUnique({ where: { email } });
  // Hashed by the same function signup uses, so the seeded super admin can actually log in.
  const user = existing ?? (await prisma.user.create({ data: { email, username, passwordHash: await hashPassword(password) } }));
  console.log(existing ? `super admin: ${email} already exists — password left unchanged` : `super admin: created ${email}${username ? ` (username ${username})` : ""}`);

  const roles = await prisma.role.findMany({ where: { slug: { in: SEED_SUPERADMIN_ROLES } }, select: { id: true, slug: true } });
  await prisma.roleUser.createMany({ data: roles.map((role) => ({ userId: user.id, roleId: role.id })), skipDuplicates: true });
  console.log(`super admin: holds roles ${roles.map((r) => r.slug).join(", ")}`);
}

async function main(): Promise<void> {
  // Loads .env from the working directory if there is one. It never overrides a variable the
  // process was already given, so an explicit `SEED_ADMIN_PASSWORD=... npm run seed` still wins.
  try {
    process.loadEnvFile();
  } catch {
    // No .env here — the environment is expected to carry the variables itself (docker, CI, ...).
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: requireEnv("DATABASE_URL") }) });
  try {
    await seedRbacDefaults(prisma);
    await seedAdminUser(prisma);
    await seedSuperAdminUser(prisma);
    console.log("seed complete.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
