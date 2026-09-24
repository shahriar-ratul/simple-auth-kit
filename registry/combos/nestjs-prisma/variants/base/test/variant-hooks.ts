// Variant hooks for the no-workspaces variant. See test/harness.ts for the contract. Admin
// authority here is global (the `admin` role) — there's no scope to admit a user into.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/database/generated/prisma/client.js";
import { toId } from "../src/common/helpers/id.helper.js";
import {
  provisionDefaultRoles,
  SEED_ADMIN_ROLES,
} from "../database/seedData/index.js";
import {
  renewingToken,
  type AdminSession,
  type AuthTokens,
  type Principal,
  type ProofContext,
  type VariantHooks,
} from "./harness.js";
import { proofHandles } from "./bootstrap.js";
import { bumpAuthzVersion } from "../src/common/auth/cache/authz-version.js";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env["DATABASE_URL"] }),
});

/** Remembered by `makeAdmin` so `freshToken()` can mint a new one whenever a section needs it. */
let adminCredentials: { identifier: string; password: string } | undefined;

export const hooks: VariantHooks = {
  variant: "base",

  async makeAdmin(
    ctx: ProofContext,
    principal: Principal,
  ): Promise<AdminSession> {
    // Calls the same provisioning function `npm run seed` does — idempotent, safe against an
    // already-seeded database.
    await provisionDefaultRoles(prisma);
    const roles = await prisma.role.findMany({
      where: { slug: { in: SEED_ADMIN_ROLES } },
      select: { id: true },
    });
    await prisma.roleUser.createMany({
      data: roles.map((role) => ({
        userId: toId(principal.userId),
        roleId: role.id,
      })),
      skipDuplicates: true,
    });
    // Written behind the app's back, like admin tooling would; bump the version the same way the
    // app's own write paths do so the grant is seen immediately rather than after the cache TTL.
    await bumpAuthzVersion(prisma);

    adminCredentials = {
      identifier: principal.email,
      password: principal.password,
    };
    const login = await ctx.call("POST", "/auth/login", {
      body: { identifier: principal.email, password: principal.password },
    });
    const token = (login.body as AuthTokens).accessToken;
    ctx.assert(!!token, `the seeded admin can log in (got ${login.status})`);
    return {
      token,
      freshToken: renewingToken(async () => {
        const res = await ctx.call("POST", "/auth/login", {
          body: adminCredentials!,
        });
        return (res.body as AuthTokens).accessToken;
      }),
    };
  },

  async admitUser(): Promise<void> {
    // Nothing to do: admin endpoints operate on the whole deployment.
  },

  async proveVariantProperties(
    ctx: ProofContext,
    admin: AdminSession,
  ): Promise<void> {
    const listed = await ctx.call("GET", "/admin/users", {
      token: await admin.freshToken(),
    });
    ctx.assert(
      listed.status === 200,
      `admin can list every user in the deployment (got ${listed.status})`,
    );
    ctx.assert(
      Array.isArray(listed.body?.items) && listed.body.items.length > 0,
      "the user list is non-empty",
    );

    const workspaces = await ctx.call("GET", "/workspaces", {
      token: await admin.freshToken(),
    });
    ctx.assert(
      workspaces.status === 404,
      `no workspace endpoints exist in this variant (got ${workspaces.status})`,
    );

    const me = await ctx.call("GET", "/auth/me", {
      token: await admin.freshToken(),
    });
    ctx.assert(
      me.body?.roles?.includes("admin"),
      "roles are global: they apply to every request this user makes",
    );

    // Authorization is not in the token, so a grant/revoke lands on the caller's next request.
    const email = ctx.uniqueEmail("immediate");
    const password = "immediate-pw-12345";
    const tokens = await ctx.signup(email, password);
    const userId = (
      await ctx.call("GET", "/auth/me", { token: tokens.accessToken })
    ).body.sub as string;

    const beforeGrant = await ctx.call("GET", "/admin/users", {
      token: tokens.accessToken,
    });
    ctx.assert(
      beforeGrant.status === 403,
      `a user with no grant is refused (got ${beforeGrant.status})`,
    );

    const granted = await ctx.call(
      "POST",
      `/admin/users/${userId}/permissions`,
      { token: await admin.freshToken(), body: { permission: "users:read" } },
    );
    ctx.assert(
      granted.status === 200 || granted.status === 201,
      `admin can grant a permission directly (got ${granted.status})`,
    );

    const afterGrant = await ctx.call("GET", "/admin/users", {
      token: tokens.accessToken,
    });
    ctx.assert(
      afterGrant.status === 200,
      `…and the grant is in effect on the very next request, on the token they already held (got ${afterGrant.status})`,
    );

    const revoked = await ctx.call(
      "POST",
      `/admin/users/${userId}/permissions/${encodeURIComponent("users:read")}/revoke`,
      {
        token: await admin.freshToken(),
      },
    );
    ctx.assert(
      revoked.status === 200 || revoked.status === 201,
      `admin can revoke the direct grant (got ${revoked.status})`,
    );

    const afterRevoke = await ctx.call("GET", "/admin/users", {
      token: tokens.accessToken,
    });
    ctx.assert(
      afterRevoke.status === 403,
      `and the revocation lands on the very next request too, on the same token (got ${afterRevoke.status})`,
    );

    await proveARawDatabaseEditChangesEnforcement(ctx, admin);
    await proveAuthzIsCachedUntilItChanges(ctx, admin);
  },
};

// Writes the row directly rather than through the admin API, ruling out any in-memory side
// channel — a `psql` session would look exactly like this.
async function proveARawDatabaseEditChangesEnforcement(
  ctx: ProofContext,
  admin: AdminSession,
): Promise<void> {
  const email = ctx.uniqueEmail("rawedit");
  const tokens = await ctx.signup(email, "rawedit-pw-12345");
  const userId = (
    await ctx.call("GET", "/auth/me", { token: tokens.accessToken })
  ).body.sub as string;
  await ctx.call("POST", `/admin/users/${userId}/permissions`, {
    token: await admin.freshToken(),
    body: { permission: "audit-log:read" },
  });
  ctx.assert(
    (
      await ctx.call("GET", "/audit-log", {
        token: tokens.accessToken,
      })
    ).status === 200,
    "a direct grant opens the audit log",
  );

  // Written straight to the table, with no code change, no redeploy, and nothing telling the app
  // it happened: it doesn't bump `authz_version`, so the cached authorization stands until
  // `authzCacheTtlSeconds` passes, and the request after that sees it.
  await prisma.permission.update({
    where: { slug: "audit-log:read" },
    data: { isActive: false },
  });
  await pastAuthzCacheTtl();
  const denied = await ctx.call("GET", "/audit-log", {
    token: tokens.accessToken,
  });
  ctx.assert(
    denied.status === 403,
    `a permission deactivated by a raw database write stops opening its route once the cache TTL passes (got ${denied.status})`,
  );

  await prisma.permission.update({
    where: { slug: "audit-log:read" },
    data: { isActive: true },
  });
  await pastAuthzCacheTtl();
  const restored = await ctx.call("GET", "/audit-log", {
    token: tokens.accessToken,
  });
  ctx.assert(
    restored.status === 200,
    `…and reactivating it in the database opens the route again (got ${restored.status})`,
  );

  // A direct grant deleted straight from the join table — no API call, no signal to the app.
  const auditLogRead = await prisma.permission.findUniqueOrThrow({
    where: { slug: "audit-log:read" },
    select: { id: true },
  });
  await prisma.permissionUser.deleteMany({
    where: { userId: toId(userId), permissionId: auditLogRead.id },
  });
  await pastAuthzCacheTtl();
  const afterRawGrantDelete = await ctx.call("GET", "/audit-log", {
    token: tokens.accessToken,
  });
  ctx.assert(
    afterRawGrantDelete.status === 403,
    `a direct grant deleted by a raw database write is enforced once the cache TTL passes, same token (got ${afterRawGrantDelete.status})`,
  );

  // Same for a role assignment: granted through the API, revoked by deleting the row.
  await ctx.call("POST", `/admin/users/${userId}/roles`, {
    token: await admin.freshToken(),
    body: { role: "admin" },
  });
  const viaRole = await ctx.call("GET", "/audit-log", {
    token: tokens.accessToken,
  });
  ctx.assert(
    viaRole.status === 200,
    `the admin role opens the audit log (got ${viaRole.status})`,
  );
  await prisma.roleUser.deleteMany({
    where: { userId: toId(userId), role: { slug: "admin" } },
  });
  await pastAuthzCacheTtl();
  const afterRawRoleDelete = await ctx.call("GET", "/audit-log", {
    token: tokens.accessToken,
  });
  ctx.assert(
    afterRawRoleDelete.status === 403,
    `a role assignment deleted by a raw database write is enforced once the cache TTL passes, same token (got ${afterRawRoleDelete.status})`,
  );
}

// `AuthzCache`: identical requests cost one resolution between them; a change made through the
// API bumps `authz_version` and is enforced on the very next request; a raw database write
// bypasses the bump, so it is served from the cache until the TTL passes, then enforced.
async function proveAuthzIsCachedUntilItChanges(
  ctx: ProofContext,
  admin: AdminSession,
): Promise<void> {
  const cache = proofHandles.authzCache!;
  const email = ctx.uniqueEmail("cached");
  const tokens = await ctx.signup(email, "cached-pw-12345");
  const userId = (
    await ctx.call("GET", "/auth/me", { token: tokens.accessToken })
  ).body.sub as string;
  await ctx.call("POST", `/admin/users/${userId}/permissions`, {
    token: await admin.freshToken(),
    body: { permission: "audit-log:read" },
  });
  const read = async () =>
    (await ctx.call("GET", "/audit-log", { token: tokens.accessToken })).status;

  await read();
  const before = cache.stats.resolutions;
  const statuses = [
    await read(),
    await read(),
    await read(),
    await read(),
    await read(),
  ];
  ctx.assert(
    statuses.every((s) => s === 200) && cache.stats.resolutions === before,
    `5 identical authorized requests are served from the cache — no new resolution (got ${cache.stats.resolutions - before})`,
  );

  // Through the API: bumps authz_version, so the very next request re-resolves.
  const define = async (isActive: boolean) =>
    ctx.call("POST", "/permissions", {
      token: await admin.freshToken(),
      body: { slug: "audit-log:read", isActive },
    });
  await define(false);
  const apiDenied = await read();
  ctx.assert(
    apiDenied === 403,
    `a permission deactivated through the API is enforced on the very next request (got ${apiDenied})`,
  );
  await define(true);
  ctx.assert(
    (await read()) === 200,
    "…and reactivating it through the API is seen on the very next request too",
  );

  // Straight to the table: no bump, so the cached answer stands until the TTL passes.
  await read();
  const beforeRaw = cache.stats.resolutions;
  await prisma.permission.update({
    where: { slug: "audit-log:read" },
    data: { isActive: false },
  });
  const stillCached = await read();
  ctx.assert(
    stillCached === 200 && cache.stats.resolutions === beforeRaw,
    `a raw database write is not seen before the cache TTL — the entry is still served (got ${stillCached})`,
  );
  await pastAuthzCacheTtl();
  const rawDenied = await read();
  ctx.assert(
    rawDenied === 403 && cache.stats.resolutions === beforeRaw + 1,
    `…and once the TTL passes the next request re-resolves and enforces it (got ${rawDenied})`,
  );
  await prisma.permission.update({
    where: { slug: "audit-log:read" },
    data: { isActive: true },
  });
  await pastAuthzCacheTtl();
  ctx.assert(
    (await read()) === 200,
    "…and the reverse raw write is enforced after the TTL too",
  );
}

/** Waits out `authzCacheTtlSeconds` (1s in the proof, see bootstrap.ts). */
const pastAuthzCacheTtl = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 1_200));
