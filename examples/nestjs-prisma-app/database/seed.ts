// Idempotent database seeder (`npm run seed`) — everything RBAC needs before this deployment
// can authorize anything. Seeds the permission catalog, the default roles, and (only when
// SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are set — no fallback password) an initial admin
// user. Re-running is safe and additive: every write is an upsert, nothing is deleted, and an
// existing admin keeps the password they already have.
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from '@/core/crypto.js';
import { PrismaClient } from '@/database/generated/prisma/client.js';
import {
  DEFAULT_ROLES,
  PERMISSION_SLUGS,
  provisionDefaultRoles,
  SEED_ADMIN_ROLES,
  SEED_SUPERADMIN_ROLES,
} from './seedData/index.js';
import { bumpAuthzVersion } from '../src/common/auth/cache/authz-version.js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — the seeder cannot reach the database without it`);
  return value;
}

async function seedRbacDefaults(prisma: PrismaClient): Promise<void> {
  await provisionDefaultRoles(prisma);
  console.log(`permissions: ${PERMISSION_SLUGS.length} slug(s) in the catalog`);
  for (const role of DEFAULT_ROLES)
    console.log(
      `role "${role.slug}": ${role.permissions.length} permission(s)${role.isDefault ? ' (signup default)' : ''}`,
    );

  // Slugs in the database but not this build's catalog aren't an error — a deployment can
  // define its own — but a typo would otherwise silently grant nothing, so surface them.
  const rows = await prisma.permission.findMany({
    select: { slug: true, isActive: true },
  });
  const unknown = rows.filter((row) => !(PERMISSION_SLUGS as string[]).includes(row.slug));
  if (unknown.length)
    console.log(
      `permissions: ${unknown.length} slug(s) outside this build's catalog (no route names them): ${unknown.map((r) => r.slug).join(', ')}`,
    );
  const inactive = rows.filter((row) => !row.isActive);
  if (inactive.length)
    console.log(
      `permissions: ${inactive.length} deactivated, granting nothing: ${inactive.map((r) => r.slug).join(', ')}`,
    );
}

async function seedAdminUser(prisma: PrismaClient): Promise<void> {
  const email = process.env['SEED_ADMIN_EMAIL'];
  const password = process.env['SEED_ADMIN_PASSWORD'];
  if (!email || !password) {
    console.log(
      'admin: skipped — set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to create one (there is no default password)',
    );
    return;
  }

  // Rewriting the password here would silently reset one the user may have already changed.
  const existing = await prisma.user.findUnique({ where: { email } });
  const user =
    existing ??
    (await prisma.user.create({
      data: { email, passwordHash: await hashPassword(password) },
    }));
  console.log(existing ? `admin: ${email} already exists — password left unchanged` : `admin: created ${email}`);

  const roles = await prisma.role.findMany({
    where: { slug: { in: SEED_ADMIN_ROLES } },
    select: { id: true, slug: true },
  });
  await prisma.roleUser.createMany({
    data: roles.map((role) => ({ userId: user.id, roleId: role.id })),
    skipDuplicates: true,
  });
  console.log(`admin: holds roles ${roles.map((r) => r.slug).join(', ')}`);
}

async function seedSuperAdminUser(prisma: PrismaClient): Promise<void> {
  const email = process.env['SEED_SUPERADMIN_EMAIL'];
  const password = process.env['SEED_SUPERADMIN_PASSWORD'];
  if (!email || !password) {
    console.log(
      'super admin: skipped — set SEED_SUPERADMIN_EMAIL and SEED_SUPERADMIN_PASSWORD to create one (there is no default password)',
    );
    return;
  }
  const username = process.env['SEED_SUPERADMIN_USERNAME'] || undefined;

  // Rewriting the password here would silently reset one the user may have already changed.
  const existing = await prisma.user.findUnique({ where: { email } });
  const user =
    existing ??
    (await prisma.user.create({
      data: { email, username, passwordHash: await hashPassword(password) },
    }));
  console.log(
    existing
      ? `super admin: ${email} already exists — password left unchanged`
      : `super admin: created ${email}${username ? ` (username ${username})` : ''}`,
  );

  const roles = await prisma.role.findMany({
    where: { slug: { in: SEED_SUPERADMIN_ROLES } },
    select: { id: true, slug: true },
  });
  await prisma.roleUser.createMany({
    data: roles.map((role) => ({ userId: user.id, roleId: role.id })),
    skipDuplicates: true,
  });
  console.log(`super admin: holds roles ${roles.map((r) => r.slug).join(', ')}`);
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile();
  } catch {
    // No .env file — the environment is expected to carry the variables itself.
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: requireEnv('DATABASE_URL') }),
  });
  try {
    await seedRbacDefaults(prisma);
    await seedAdminUser(prisma);
    await seedSuperAdminUser(prisma);
    // Clear any running app's authz cache: the seeder writes behind the app's back.
    await bumpAuthzVersion(prisma);
    console.log('seed complete.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
