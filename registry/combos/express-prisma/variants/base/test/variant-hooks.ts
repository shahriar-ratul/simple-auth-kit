// Variant hooks for the no-workspaces variant. See test/harness.ts for the contract.
//
// Admin authority here is global: it is the `admin` role, and the role's permissions are what
// confer it. There is no scope to admit a user into — every user is already in range of the admin
// endpoints.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/database/generated/prisma/client.js";
import { toId } from "../src/common/helpers/id.helper.js";
import {
  provisionDefaultRoles,
  SEED_ADMIN_ROLES,
} from "../database/seedData/index.js";
import { POLICY_VERSION_KEY } from "../src/common/auth/cache/permission-cache.js";
import { permissionCacheStore } from "./bootstrap.js";
import {
  renewingToken,
  type AdminSession,
  type AuthTokens,
  type Principal,
  type ProofContext,
  type VariantHooks,
} from "./harness.js";

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
    // The role slug on its own confers nothing — no guard checks for the string "admin". Authority
    // comes from the PermissionRole rows behind it, and in this variant the seeder is the only
    // thing that writes them, so the hook does what `npm run seed` does: calls the same
    // provisioning function, from the same definition the routes are typed against. Idempotent,
    // so it is safe against a database that has already been seeded.
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

    adminCredentials = {
      identifier: principal.email,
      password: principal.password,
    };
    // Those writes went straight to the database, behind the running app's back, so nothing
    // bumped a version counter and the caller's already-cached (empty) permissions would still be
    // served. Bumping the policy counter is exactly what an out-of-band writer is supposed to do —
    // see permission-cache.ts. Logging in would not have helped: nothing about authorization is
    // in the token.
    await permissionCacheStore.bump(POLICY_VERSION_KEY);
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

    // --- authorization is not in the token, so a change lands on the next *request* ---
    //
    // This section used to assert the opposite, and the change is deliberate. Permissions were
    // baked into the access token at issue time, which made the check free but meant a revocation
    // did not apply until the caller's next token — a window bounded only by the access-token TTL,
    // documented as a sharp edge and asserted in both directions right here. Authorization is now
    // resolved from the database (through a version-keyed cache) on the request that uses it, so
    // the window is gone and the assertions that described it have been replaced by the ones that
    // describe what actually happens.
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

    // The status of this revoke used to be the one admin call in the whole run that was never
    // asserted, which is exactly why a token that had quietly expired surfaced as a confusing
    // failure of the *next* assertion instead of this one.
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

    await proveTheCacheIsReal(ctx, admin, tokens.accessToken);
    await proveARawDatabaseEditChangesEnforcement(ctx, admin);
  },
};

/**
 * A cache nobody can prove is working is a bug surface. These assertions read the very store the
 * app resolves through (`test/bootstrap.ts` hands it to `AuthModule.forRoot`), so "the second
 * request did not touch the database" is a measurement rather than a claim.
 */
async function proveTheCacheIsReal(
  ctx: ProofContext,
  admin: AdminSession,
  token: string,
): Promise<void> {
  const N = 8;
  await ctx.call("GET", "/auth/me", { token }); // warm, so the measurement is of the steady state
  const before = { ...permissionCacheStore.stats };
  for (let i = 0; i < N; i += 1) await ctx.call("GET", "/auth/me", { token });
  const after = permissionCacheStore.stats;

  ctx.assert(
    after.misses === before.misses && after.hits === before.hits + N,
    `${N} identical authorized requests resolve permissions 0 further times — all ${N} were cache hits (misses +${after.misses - before.misses}, hits +${after.hits - before.hits})`,
  );

  const userId = (await ctx.call("GET", "/auth/me", { token })).body
    .sub as string;
  const beforeGrant = { ...permissionCacheStore.stats };
  await ctx.call("POST", `/admin/users/${userId}/permissions`, {
    token: await admin.freshToken(),
    body: { permission: "probe:cache" },
  });
  const afterGrantCall = await ctx.call("GET", "/auth/me", { token });
  ctx.assert(
    permissionCacheStore.stats.misses > beforeGrant.misses,
    "a grant bumps this user's version counter, so the next request misses the cache and re-resolves rather than serving a stale entry",
  );
  ctx.assert(
    (afterGrantCall.body?.permissions ?? []).includes("probe:cache"),
    "…and the freshly resolved answer contains the new permission",
  );
  await ctx.call(
    "POST",
    `/admin/users/${userId}/permissions/${encodeURIComponent("probe:cache")}/revoke`,
    { token: await admin.freshToken() },
  );
}

/**
 * The admin API already proves that editing the catalog changes enforcement, but it is the API
 * doing the writing — this rules out any possibility that it is also doing something in memory.
 * A `psql` session would look exactly like this.
 */
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

  // Written straight to the table, with no code change and no redeploy. The bump that follows is
  // the out-of-band writer's half of the cache contract (permission-cache.ts) — without it the
  // edit would still land, but only once the cached entry expired.
  await prisma.permission.update({
    where: { slug: "audit-log:read" },
    data: { isActive: false },
  });
  await permissionCacheStore.bump(POLICY_VERSION_KEY);
  const denied = await ctx.call("GET", "/audit-log", {
    token: tokens.accessToken,
  });
  ctx.assert(
    denied.status === 403,
    `a permission deactivated by a raw database write stops opening its route (got ${denied.status})`,
  );

  await prisma.permission.update({
    where: { slug: "audit-log:read" },
    data: { isActive: true },
  });
  await permissionCacheStore.bump(POLICY_VERSION_KEY);
  const restored = await ctx.call("GET", "/audit-log", {
    token: tokens.accessToken,
  });
  ctx.assert(
    restored.status === 200,
    `…and reactivating it in the database opens the route again (got ${restored.status})`,
  );
}
