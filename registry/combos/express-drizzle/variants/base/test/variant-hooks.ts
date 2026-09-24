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
import { bumpAuthzVersion } from "../src/common/auth/cache/authz-version.js";
import { toId } from "../src/common/helpers/id.helper.js";
import {
  provisionDefaultRoles,
  SEED_ADMIN_ROLES,
} from "../database/seedData/index.js";
import * as schema from "@/database/schema.js";
import {
  permissionUser,
  permissions,
  roleUser,
  roles,
} from "@/database/schema.js";
import { authzCache } from "./bootstrap.js";
import {
  renewingToken,
  type AdminSession,
  type AuthTokens,
  type Principal,
  type ProofContext,
  type VariantHooks,
} from "./harness.js";

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
      // Behind the running app's back, so bump the version the app's own writes would have —
      // otherwise a context cached before this (e.g. from /auth/me) would be served until the TTL.
      await bumpAuthzVersion(db);
    });

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

    // --- authorization is not in the token, so a change lands on the next *request* ---
    //
    // This section used to assert the opposite, and the change is deliberate. Permissions were
    // baked into the access token at issue time, which made the check free but meant a revocation
    // did not apply until the caller's next token — a window bounded only by the access-token TTL,
    // documented as a sharp edge and asserted in both directions right here. Authorization is now
    // resolved from the database on the request that uses it, so
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
  },
};

/**
 * Writes made straight to the database don't bump `authz_version` — nothing in the app sees them —
 * so they apply once any cached context expires. bootstrap.ts sets `authzCacheTtlSeconds` to 1.
 */
const waitForAuthzCacheTtl = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 1200));

/**
 * The admin API already proves that editing the catalog changes enforcement, but it is the API
 * doing the writing — this rules out any possibility that it is also doing something in memory.
 * A `psql` session would look exactly like this: nothing tells the app, so each change applies
 * once the cached context expires (`authzCacheTtlSeconds`).
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
  // The authz cache: identical requests with nothing changed in between resolve once, and every
  // one after that is a hit. Waiting out the TTL first means the first request must resolve,
  // whatever an earlier section left cached.
  const stats = authzCache!.stats;
  await waitForAuthzCacheTtl();
  const beforeRepeat = stats.resolutions;
  const repeated = [];
  for (let i = 0; i < 5; i++)
    repeated.push(
      (await ctx.call("GET", "/audit-log", { token: tokens.accessToken }))
        .status,
    );
  ctx.assert(
    repeated.every((status) => status === 200),
    "a direct grant opens the audit log",
  );
  ctx.assert(
    stats.resolutions - beforeRepeat === 1,
    `5 identical authorized requests resolve authorization exactly once — the rest are cache hits (resolved ${stats.resolutions - beforeRepeat} time(s))`,
  );

  const setActive = async (isActive: boolean) => {
    // Written straight to the table, with no code change, no redeploy, and nothing telling the
    // app — so it applies once the cached context expires.
    await withDb((db) =>
      db
        .update(permissions)
        .set({ isActive })
        .where(eq(permissions.slug, "audit-log:read")),
    );
  };

  await setActive(false);
  await waitForAuthzCacheTtl();
  const denied = await ctx.call("GET", "/audit-log", {
    token: tokens.accessToken,
  });
  ctx.assert(
    denied.status === 403,
    `a permission deactivated by a raw database write stops opening its route once the cache TTL passes (got ${denied.status})`,
  );

  await setActive(true);
  await waitForAuthzCacheTtl();
  const restored = await ctx.call("GET", "/audit-log", {
    token: tokens.accessToken,
  });
  ctx.assert(
    restored.status === 200,
    `…and reactivating it in the database opens the route again (got ${restored.status})`,
  );

  // Revocations, straight in the database with nothing telling the app: once the cache TTL passes,
  // the next request on the same token is denied.
  const auditLogRead = async () =>
    (
      await withDb((db) =>
        db
          .select({ id: permissions.id })
          .from(permissions)
          .where(eq(permissions.slug, "audit-log:read")),
      )
    )[0]!.id;
  await withDb(async (db) =>
    db
      .delete(permissionUser)
      .where(
        and(
          eq(permissionUser.userId, toId(userId)),
          eq(permissionUser.permissionId, await auditLogRead()),
        ),
      ),
  );
  await waitForAuthzCacheTtl();
  const afterGrantDeleted = await ctx.call("GET", "/audit-log", {
    token: tokens.accessToken,
  });
  ctx.assert(
    afterGrantDeleted.status === 403,
    `a direct grant deleted by a raw database write denies the next request after the cache TTL, same token (got ${afterGrantDeleted.status})`,
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
  const viaRole = await ctx.call("GET", "/audit-log", {
    token: tokens.accessToken,
  });
  ctx.assert(
    viaRole.status === 200,
    `a role carrying the permission opens the route (got ${viaRole.status})`,
  );
  await ctx.call("POST", `/admin/users/${userId}/roles/${roleSlug}/revoke`, {
    token: await admin.freshToken(),
  });
  const apiRevoked = await ctx.call("GET", "/audit-log", {
    token: tokens.accessToken,
  });
  ctx.assert(
    apiRevoked.status === 403,
    `a role revoked through the API denies the very next request, same token — the write bumped the authz version (got ${apiRevoked.status})`,
  );
  await ctx.call("POST", `/admin/users/${userId}/roles`, {
    token: await admin.freshToken(),
    body: { role: roleSlug },
  });
  const reassigned = await ctx.call("GET", "/audit-log", {
    token: tokens.accessToken,
  });
  ctx.assert(
    reassigned.status === 200,
    `…and re-assigning it through the API opens the route on the very next request (got ${reassigned.status})`,
  );
  await withDb((db) =>
    db
      .delete(roleUser)
      .where(
        and(
          eq(roleUser.userId, toId(userId)),
          eq(roleUser.roleId, toId((role.body as { id: string }).id)),
        ),
      ),
  );
  await waitForAuthzCacheTtl();
  const afterRoleDeleted = await ctx.call("GET", "/audit-log", {
    token: tokens.accessToken,
  });
  ctx.assert(
    afterRoleDeleted.status === 403,
    `a role assignment deleted by a raw database write denies the next request after the cache TTL, same token (got ${afterRoleDeleted.status})`,
  );
}
