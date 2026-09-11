// Idempotent database seeder (`npm run seed`) — everything RBAC needs before this deployment
// can authorize anything. Seeds the permission catalog, the first workspace
// (SEED_WORKSPACE_NAME, defaulting below), that workspace's default roles, and (only when
// SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are set — no fallback password) an initial admin
// user and their membership. Re-running is safe and additive: every write is an upsert, nothing
// is deleted, and an existing admin keeps the password they already have.
//
// Roles seeded here belong to the seeded workspace only — `Role` is unique per
// `[workspaceId, slug]`. A workspace created later through POST /workspaces provisions its own
// from the same `rbac.defaults.ts` definition, so no workspace's roles can drift from what the
// routes demand.
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "@/lib/auth/core/crypto.js";
import { PrismaClient } from "../../../../generated/prisma/client.js";
import { DEFAULT_ROLES, PERMISSION_SLUGS, provisionDefaultRoles, SEED_SUPERADMIN_ROLES, WORKSPACE_CREATOR_ROLES } from "./rbac.defaults.js";

const DEFAULT_WORKSPACE_NAME = "Default workspace";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — the seeder cannot reach the database without it`);
  return value;
}

// Workspace names aren't unique in the schema, so re-running adopts the one it made last time.
async function seedWorkspace(prisma: PrismaClient): Promise<{ id: bigint; name: string }> {
  const name = process.env["SEED_WORKSPACE_NAME"] || DEFAULT_WORKSPACE_NAME;
  const existing = await prisma.workspace.findFirst({ where: { name }, orderBy: { createdAt: "asc" } });
  if (existing) {
    console.log(`workspace: "${name}" already exists (${existing.id})`);
    return existing;
  }
  const created = await prisma.workspace.create({ data: { name } });
  console.log(`workspace: created "${name}" (${created.id})`);
  return created;
}

async function seedRbacDefaults(prisma: PrismaClient, workspaceId: bigint): Promise<void> {
  await provisionDefaultRoles(prisma, workspaceId);
  console.log(`permissions: ${PERMISSION_SLUGS.length} slug(s) in the catalog`);
  for (const role of DEFAULT_ROLES) console.log(`role "${role.slug}": ${role.permissions.length} permission(s)${role.isDefault ? " (new-member default)" : ""}`);

  // Slugs in the database but not this build's catalog aren't an error — a deployment can
  // define its own — but a typo would otherwise silently grant nothing, so surface them.
  const rows = await prisma.permission.findMany({ select: { slug: true, isActive: true } });
  const unknown = rows.filter((row) => !(PERMISSION_SLUGS as string[]).includes(row.slug));
  if (unknown.length) console.log(`permissions: ${unknown.length} slug(s) outside this build's catalog (no route names them): ${unknown.map((r) => r.slug).join(", ")}`);
  const inactive = rows.filter((row) => !row.isActive);
  if (inactive.length) console.log(`permissions: ${inactive.length} deactivated, granting nothing: ${inactive.map((r) => r.slug).join(", ")}`);
}

async function seedAdminUser(prisma: PrismaClient, workspace: { id: bigint; name: string }): Promise<void> {
  const email = process.env["SEED_ADMIN_EMAIL"];
  const password = process.env["SEED_ADMIN_PASSWORD"];
  if (!email || !password) {
    console.log(`admin: skipped — set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to create one (there is no default password)`);
    console.log(`admin: "${workspace.name}" has no members until you re-run with them set`);
    return;
  }

  // Rewriting the password here would silently reset one the user may have already changed.
  const existing = await prisma.user.findUnique({ where: { email } });
  const user = existing ?? (await prisma.user.create({ data: { email, passwordHash: await hashPassword(password) } }));
  console.log(existing ? `admin: ${email} already exists — password left unchanged` : `admin: created ${email}`);

  const membership = await prisma.workspaceMember.upsert({
    where: { userId_workspaceId: { userId: user.id, workspaceId: workspace.id } },
    create: { userId: user.id, workspaceId: workspace.id },
    update: {},
  });
  const roles = await prisma.role.findMany({ where: { workspaceId: workspace.id, slug: { in: WORKSPACE_CREATOR_ROLES } }, select: { id: true, slug: true } });
  await prisma.roleMember.createMany({ data: roles.map((role) => ({ memberId: membership.id, roleId: role.id })), skipDuplicates: true });
  console.log(`admin: member of "${workspace.name}" with roles ${roles.map((r) => r.slug).join(", ")}`);
}

async function seedSuperAdminUser(prisma: PrismaClient, workspace: { id: bigint; name: string }): Promise<void> {
  const email = process.env["SEED_SUPERADMIN_EMAIL"];
  const password = process.env["SEED_SUPERADMIN_PASSWORD"];
  if (!email || !password) {
    console.log(`super admin: skipped — set SEED_SUPERADMIN_EMAIL and SEED_SUPERADMIN_PASSWORD to create one (there is no default password)`);
    return;
  }
  const username = process.env["SEED_SUPERADMIN_USERNAME"] || undefined;

  // Rewriting the password here would silently reset one the user may have already changed.
  const existing = await prisma.user.findUnique({ where: { email } });
  const user = existing ?? (await prisma.user.create({ data: { email, username, passwordHash: await hashPassword(password) } }));
  console.log(existing ? `super admin: ${email} already exists — password left unchanged` : `super admin: created ${email}${username ? ` (username ${username})` : ""}`);

  const membership = await prisma.workspaceMember.upsert({
    where: { userId_workspaceId: { userId: user.id, workspaceId: workspace.id } },
    create: { userId: user.id, workspaceId: workspace.id },
    update: {},
  });
  const roles = await prisma.role.findMany({ where: { workspaceId: workspace.id, slug: { in: SEED_SUPERADMIN_ROLES } }, select: { id: true, slug: true } });
  await prisma.roleMember.createMany({ data: roles.map((role) => ({ memberId: membership.id, roleId: role.id })), skipDuplicates: true });
  console.log(`super admin: member of "${workspace.name}" with roles ${roles.map((r) => r.slug).join(", ")}`);
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile();
  } catch {
    // No .env file — the environment is expected to carry the variables itself.
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: requireEnv("DATABASE_URL") }) });
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
