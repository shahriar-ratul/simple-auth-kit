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
// workspace created later through POST /workspaces provisions its own from the same definition:
// (1) and (3) both live in `rbac.defaults.ts`, which is also what types `@CheckAbility` on the
// routes. The seeder is a caller of that definition, not its owner, so the roles a workspace
// gets, whichever path created it, and the permissions the routes demand cannot drift apart.
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "@/lib/auth/core/crypto.js";
import { PrismaClient } from "@/database/generated/prisma/client.js";
import {
  DEFAULT_ROLES,
  PERMISSION_SLUGS,
  provisionDefaultRoles,
  SEED_SUPERADMIN_ROLES,
  WORKSPACE_CREATOR_ROLES,
} from "../src/modules/auth/rbac.defaults.js";

const DEFAULT_WORKSPACE_NAME = "Default workspace";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(
      `${name} is not set — the seeder cannot reach the database without it`,
    );
  return value;
}

/** Workspace names are not unique in the schema, so re-running adopts the one it made last time rather than making another. */
async function seedWorkspace(
  prisma: PrismaClient,
): Promise<{ id: bigint; name: string }> {
  const name = process.env["SEED_WORKSPACE_NAME"] || DEFAULT_WORKSPACE_NAME;
  const existing = await prisma.workspace.findFirst({
    where: { name },
    orderBy: { createdAt: "asc" },
  });
  if (existing) {
    console.log(`workspace: "${name}" already exists (${existing.id})`);
    return existing;
  }
  const created = await prisma.workspace.create({ data: { name } });
  console.log(`workspace: created "${name}" (${created.id})`);
  return created;
}

/** The catalog and this workspace's roles come from rbac.defaults.ts; this only reports what it wrote. */
async function seedRbacDefaults(
  prisma: PrismaClient,
  workspaceId: bigint,
): Promise<void> {
  await provisionDefaultRoles(prisma, workspaceId);
  console.log(`permissions: ${PERMISSION_SLUGS.length} slug(s) in the catalog`);
  for (const role of DEFAULT_ROLES)
    console.log(
      `role "${role.slug}": ${role.permissions.length} permission(s)${role.isDefault ? " (new-member default)" : ""}`,
    );

  // Slugs that exist in the database but not in this build's catalog. They are not an error —
  // `POST /permissions` exists so a deployment can define its own, and a grant can
  // create one — but a slug no route names grants nothing, so a typo would otherwise be a
  // permission that mysteriously never works. Printing them is what makes it visible.
  const rows = await prisma.permission.findMany({
    select: { slug: true, isActive: true },
  });
  const unknown = rows.filter(
    (row) => !(PERMISSION_SLUGS as string[]).includes(row.slug),
  );
  if (unknown.length)
    console.log(
      `permissions: ${unknown.length} slug(s) outside this build's catalog (no route names them): ${unknown.map((r) => r.slug).join(", ")}`,
    );
  const inactive = rows.filter((row) => !row.isActive);
  if (inactive.length)
    console.log(
      `permissions: ${inactive.length} deactivated, granting nothing: ${inactive.map((r) => r.slug).join(", ")}`,
    );
}

/** The user is the authentication principal; the membership below is the authorization one. */
async function seedAdminUser(
  prisma: PrismaClient,
  workspace: { id: bigint; name: string },
): Promise<void> {
  const email = process.env["SEED_ADMIN_EMAIL"];
  const password = process.env["SEED_ADMIN_PASSWORD"];
  if (!email || !password) {
    console.log(
      `admin: skipped — set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to create one (there is no default password)`,
    );
    console.log(
      `admin: "${workspace.name}" has no members until you re-run with them set`,
    );
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  // Their password may have been changed since; rewriting it here would silently reset it.
  const user =
    existing ??
    (await prisma.user.create({
      data: { email, passwordHash: await hashPassword(password) },
    }));
  console.log(
    existing
      ? `admin: ${email} already exists — password left unchanged`
      : `admin: created ${email}`,
  );

  const membership = await prisma.workspaceMember.upsert({
    where: {
      userId_workspaceId: { userId: user.id, workspaceId: workspace.id },
    },
    create: { userId: user.id, workspaceId: workspace.id },
    update: {},
  });
  const roles = await prisma.role.findMany({
    where: { workspaceId: workspace.id, slug: { in: WORKSPACE_CREATOR_ROLES } },
    select: { id: true, slug: true },
  });
  await prisma.roleMember.createMany({
    data: roles.map((role) => ({ memberId: membership.id, roleId: role.id })),
    skipDuplicates: true,
  });
  console.log(
    `admin: member of "${workspace.name}" with roles ${roles.map((r) => r.slug).join(", ")}`,
  );
}

/** A second seeded account and membership, held by the "superadmin" role — same full-catalog authority as admin. */
async function seedSuperAdminUser(
  prisma: PrismaClient,
  workspace: { id: bigint; name: string },
): Promise<void> {
  const email = process.env["SEED_SUPERADMIN_EMAIL"];
  const password = process.env["SEED_SUPERADMIN_PASSWORD"];
  if (!email || !password) {
    console.log(
      `super admin: skipped — set SEED_SUPERADMIN_EMAIL and SEED_SUPERADMIN_PASSWORD to create one (there is no default password)`,
    );
    return;
  }
  const username = process.env["SEED_SUPERADMIN_USERNAME"] || undefined;

  const existing = await prisma.user.findUnique({ where: { email } });
  // Their password may have been changed since; rewriting it here would silently reset it.
  const user =
    existing ??
    (await prisma.user.create({
      data: { email, username, passwordHash: await hashPassword(password) },
    }));
  console.log(
    existing
      ? `super admin: ${email} already exists — password left unchanged`
      : `super admin: created ${email}${username ? ` (username ${username})` : ""}`,
  );

  const membership = await prisma.workspaceMember.upsert({
    where: {
      userId_workspaceId: { userId: user.id, workspaceId: workspace.id },
    },
    create: { userId: user.id, workspaceId: workspace.id },
    update: {},
  });
  const roles = await prisma.role.findMany({
    where: { workspaceId: workspace.id, slug: { in: SEED_SUPERADMIN_ROLES } },
    select: { id: true, slug: true },
  });
  await prisma.roleMember.createMany({
    data: roles.map((role) => ({ memberId: membership.id, roleId: role.id })),
    skipDuplicates: true,
  });
  console.log(
    `super admin: member of "${workspace.name}" with roles ${roles.map((r) => r.slug).join(", ")}`,
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

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: requireEnv("DATABASE_URL") }),
  });
  try {
    const workspace = await seedWorkspace(prisma);
    await seedRbacDefaults(prisma, workspace.id);
    await seedAdminUser(prisma, workspace);
    await seedSuperAdminUser(prisma, workspace);
    console.log("seed complete.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
