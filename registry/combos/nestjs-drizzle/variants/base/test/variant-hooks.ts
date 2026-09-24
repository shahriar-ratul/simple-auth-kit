// Variant hooks for the no-workspaces variant. See test/harness.ts for the contract.
//
// Admin authority here is global: it is the `admin` role, and the role's permissions are what
// confer it. There is no scope to admit a user into — every user is already in range of the admin
// endpoints.
import "dotenv/config";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { Database } from "../src/common/config/db.js";
import { toId } from "../src/common/helpers/id.helper.js";
import {
  provisionDefaultRoles,
  SEED_ADMIN_ROLES,
} from "../database/seedData/index.js";
import * as schema from "@/database/schema.js";
import {
  permissions,
  permissionUser,
  roleUser,
  roles,
} from "@/database/schema.js";
import {
  renewingToken,
  type AdminSession,
  type AuthTokens,
  type Principal,
  type ProofContext,
  type VariantHooks,
} from "./harness.js";
import { authzCache, waitOutAuthzCache } from "./bootstrap.js";
import { bumpAuthzVersion } from "../src/common/auth/cache/authz-version.js";

/** One short-lived pool per call, closed on the way out, so the proof process has no lingering handle to wait on. */
async function withDb<T>(fn: (db: Database) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
  try {
    return await fn(drizzle(pool, { schema }));
  } finally {
    await pool.end();
  }
}

/** Remembered by `makeAdmin` so `freshToken()` can mint a new one whenever a section needs it. */
let adminCredentials: { identifier: string; password: string } | undefined;

export const hooks: VariantHooks = {
  variant: "base",

  async makeAdmin(
    ctx: ProofContext,
    principal: Principal,
  ): Promise<AdminSession> {
    // The role slug on its own confers nothing — no guard checks for the string "admin". Authority
    // comes from the permission_role rows behind it, and in this variant the seeder is the only
    // thing that writes them, so the hook does what `npm run seed` does: calls the same
    // provisioning function, from the same definition the routes are typed against. Idempotent,
    // so it is safe against a database that has already been seeded.
    await withDb(async (db) => {
      await provisionDefaultRoles(db);
      const adminRoles = await db
        .select({ id: roles.id })
        .from(roles)
        .where(inArray(roles.slug, SEED_ADMIN_ROLES));
      await db
        .insert(roleUser)
        .values(
          adminRoles.map((role) => ({
            userId: toId(principal.userId),
            roleId: role.id,
          })),
        )
        .onConflictDoNothing({ target: [roleUser.userId, roleUser.roleId] });
      // Written behind the app's back, so bump the version the way the app's own writes do —
      // otherwise an answer cached earlier (e.g. from /auth/me) would be served until the TTL.
      await bumpAuthzVersion(db);
    });

    adminCredentials = {
      identifier: principal.email,
      password: principal.password,
    };
    // Those writes went straight to the database, behind the running app's back. Nothing is
    // cached, so the very next request already sees them.
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
    // resolved from the live database on every request that uses it, so
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
    await proveAuthzIsCachedUntilTheDatabaseChanges(ctx, admin);
  },
};

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

  const setActive = async (isActive: boolean) => {
    // Written straight to the table, with no code change and no redeploy. The app never sees
    // this write, so it applies once the cached answer's TTL runs out.
    await withDb((db) =>
      db
        .update(permissions)
        .set({ isActive })
        .where(eq(permissions.slug, "audit-log:read")),
    );
    await waitOutAuthzCache();
  };

  await setActive(false);
  const denied = await ctx.call("GET", "/audit-log", {
    token: tokens.accessToken,
  });
  ctx.assert(
    denied.status === 403,
    `a permission deactivated by a raw database write stops opening its route (got ${denied.status})`,
  );

  await setActive(true);
  const restored = await ctx.call("GET", "/audit-log", {
    token: tokens.accessToken,
  });
  ctx.assert(
    restored.status === 200,
    `…and reactivating it in the database opens the route again (got ${restored.status})`,
  );

  // --- a revoke written straight to the database lands once the cache TTL runs out ---
  const deleteGrant = async () =>
    withDb(async (db) => {
      const [permission] = await db
        .select({ id: permissions.id })
        .from(permissions)
        .where(eq(permissions.slug, "audit-log:read"))
        .limit(1);
      await db
        .delete(permissionUser)
        .where(
          and(
            eq(permissionUser.userId, toId(userId)),
            eq(permissionUser.permissionId, permission.id),
          ),
        );
    });
  await deleteGrant();
  await waitOutAuthzCache();
  const grantDeleted = await ctx.call("GET", "/audit-log", {
    token: tokens.accessToken,
  });
  ctx.assert(
    grantDeleted.status === 403,
    `deleting a direct grant with raw SQL denies the next request after the cache TTL, on the same token (got ${grantDeleted.status})`,
  );

  const roleSlug = `raw-revoke-${Date.now()}`;
  const role = await ctx.call("POST", "/roles", {
    token: await admin.freshToken(),
    body: { slug: roleSlug },
  });
  await ctx.call(
    "POST",
    `/roles/${(role.body as { id: string }).id}/permissions`,
    {
      token: await admin.freshToken(),
      body: { permission: "audit-log:read" },
    },
  );
  await ctx.call("POST", `/admin/users/${userId}/roles`, {
    token: await admin.freshToken(),
    body: { role: roleSlug },
  });
  ctx.assert(
    (await ctx.call("GET", "/audit-log", { token: tokens.accessToken }))
      .status === 200,
    "a role carrying audit-log:read opens the audit log",
  );
  await withDb(async (db) => {
    const [row] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.slug, roleSlug))
      .limit(1);
    await db
      .delete(roleUser)
      .where(
        and(eq(roleUser.userId, toId(userId)), eq(roleUser.roleId, row.id)),
      );
  });
  await waitOutAuthzCache();
  const roleDeleted = await ctx.call("GET", "/audit-log", {
    token: tokens.accessToken,
  });
  ctx.assert(
    roleDeleted.status === 403,
    `deleting a role assignment with raw SQL denies the next request after the cache TTL, on the same token (got ${roleDeleted.status})`,
  );
}

/**
 * Authorization is cached: repeated requests are answered from memory. A change made through the
 * API bumps `authz_version`, so it applies on the very next request; a raw SQL write (which the
 * app never sees) is served from the cache until the TTL runs out, then applies.
 */
async function proveAuthzIsCachedUntilTheDatabaseChanges(
  ctx: ProofContext,
  admin: AdminSession,
): Promise<void> {
  const cache = authzCache!;
  const email = ctx.uniqueEmail("cached");
  const tokens = await ctx.signup(email, "cached-pw-12345");
  const userId = (
    await ctx.call("GET", "/auth/me", { token: tokens.accessToken })
  ).body.sub as string;
  await ctx.call("POST", `/admin/users/${userId}/permissions`, {
    token: await admin.freshToken(),
    body: { permission: "audit-log:read" },
  });
  const as = { token: tokens.accessToken };

  const before = cache.stats.resolutions;
  for (let i = 0; i < 5; i++) await ctx.call("GET", "/audit-log", as);
  ctx.assert(
    cache.stats.resolutions - before === 1,
    `5 identical authorized requests cause exactly one database resolution (got ${cache.stats.resolutions - before})`,
  );

  await ctx.call(
    "POST",
    `/admin/users/${userId}/permissions/audit-log:read/revoke`,
    { token: await admin.freshToken() },
  );
  const revoked = await ctx.call("GET", "/audit-log", as);
  ctx.assert(
    revoked.status === 403,
    `a revoke made through the API applies on the very next request (got ${revoked.status})`,
  );
  await ctx.call("POST", `/admin/users/${userId}/permissions`, {
    token: await admin.freshToken(),
    body: { permission: "audit-log:read" },
  });
  const regranted = await ctx.call("GET", "/audit-log", as);
  ctx.assert(
    regranted.status === 200,
    `…and a grant made through the API applies on the very next request (got ${regranted.status})`,
  );

  await withDb((db) =>
    db
      .update(permissions)
      .set({ isActive: false })
      .where(eq(permissions.slug, "audit-log:read")),
  );
  const beforeTtl = cache.stats.resolutions;
  const stillCached = await ctx.call("GET", "/audit-log", as);
  ctx.assert(
    stillCached.status === 200 && cache.stats.resolutions === beforeTtl,
    `a raw SQL write is served from the cache until the TTL runs out (got ${stillCached.status}, resolutions +${cache.stats.resolutions - beforeTtl})`,
  );
  await waitOutAuthzCache();
  const afterTtl = cache.stats.resolutions;
  const denied = await ctx.call("GET", "/audit-log", as);
  ctx.assert(
    denied.status === 403 && cache.stats.resolutions - afterTtl === 1,
    `…and applies on the next request after the TTL (got ${denied.status}, resolutions +${cache.stats.resolutions - afterTtl})`,
  );
  await withDb((db) =>
    db
      .update(permissions)
      .set({ isActive: true })
      .where(eq(permissions.slug, "audit-log:read")),
  );
  await waitOutAuthzCache();
}
