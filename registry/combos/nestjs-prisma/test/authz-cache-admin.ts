// The authz-cache admin endpoints, end to end, identical for both variants: gated on
// "authz-cache:manage", listing (only this scope's) cached entries, and clearing them by bumping
// `authz_version` and deleting the entries.
import type { AuthzCache } from "../src/common/auth/cache/authz-cache.js";
import type { AdminSession, ProofContext, VariantHooks } from "./harness.js";

export async function proveAuthzCacheAdminEndpoints(
  ctx: ProofContext,
  admin: AdminSession,
  hooks: VariantHooks,
  cache: AuthzCache,
): Promise<void> {
  const workspaceId = admin.workspaceId;
  const email = ctx.uniqueEmail("cachewatch");
  const tokens = await ctx.signup(email, "cachewatch-pw-12345");
  const userId = (
    await ctx.call("GET", "/auth/me", { token: tokens.accessToken })
  ).body.sub as string;
  await hooks.admitUser(ctx, admin, { userId, email });

  for (const [method, path] of [
    ["GET", "/admin/authz-cache"],
    ["POST", "/admin/authz-cache/clear"],
  ] as const) {
    const res = await ctx.call(method, path, {
      token: tokens.accessToken,
      workspaceId,
    });
    ctx.assert(
      res.status === 403,
      `an ordinary user is refused ${method} ${path} (got ${res.status})`,
    );
  }

  // An authorized request by the user caches their resolved authorization; the admin's GET right
  // after (well inside the 1s proof TTL) lists it.
  const me = await ctx.call("GET", "/auth/me", {
    token: tokens.accessToken,
    workspaceId,
  });
  const inspected = await ctx.call("GET", "/admin/authz-cache", {
    token: await admin.freshToken(),
    workspaceId,
  });
  const body = inspected.body;
  const entry = body?.entries?.find(
    (e: { userId: string }) => e.userId === userId,
  );
  ctx.assert(
    inspected.status === 200 && body.active === true && body.canList === true,
    `the admin inspects the cache: active, with a listable store (got ${inspected.status}, active=${body?.active})`,
  );
  ctx.assert(
    !!entry &&
      JSON.stringify([...entry.roles].sort()) ===
        JSON.stringify([...me.body.roles].sort()) &&
      JSON.stringify([...entry.permissions].sort()) ===
        JSON.stringify([...me.body.permissions].sort()) &&
      entry.stale === false,
    `…and it lists the user who just made a request, with their roles and permissions (got ${JSON.stringify(entry)})`,
  );
  if (workspaceId !== undefined) {
    ctx.assert(
      body.entries.length > 0 &&
        body.entries.every(
          (e: { key: string; workspaceId?: string }) =>
            e.workspaceId === workspaceId &&
            e.key.startsWith(`simpleauthkit:authz:${workspaceId}:`),
        ),
      "…and every listed entry belongs to the workspace the request names",
    );
  }

  const cleared = await ctx.call("POST", "/admin/authz-cache/clear", {
    token: await admin.freshToken(),
    workspaceId,
  });
  ctx.assert(
    cleared.status === 201 &&
      BigInt(cleared.body.version) === BigInt(body.version) + 1n &&
      cleared.body.removed >= 1,
    `clearing bumps the version by one and removes the entries (got ${cleared.status}, version ${body.version} -> ${cleared.body?.version}, removed ${cleared.body?.removed})`,
  );

  const after = await ctx.call("GET", "/admin/authz-cache", {
    token: await admin.freshToken(),
    workspaceId,
  });
  ctx.assert(
    after.status === 200 &&
      !after.body.entries.some((e: { userId: string }) => e.userId === userId),
    "…and the user's entry is gone afterwards",
  );
  const before = cache.stats.resolutions;
  await ctx.call("GET", "/auth/me", { token: tokens.accessToken, workspaceId });
  ctx.assert(
    cache.stats.resolutions === before + 1,
    `…and the user's next authorized request re-resolves (got ${cache.stats.resolutions - before} resolution(s))`,
  );
}
