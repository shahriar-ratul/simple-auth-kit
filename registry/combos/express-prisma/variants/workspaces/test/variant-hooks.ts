// Variant hooks for the workspace variant. See test/harness.ts for the contract.
//
// Admin authority here is per workspace, so making someone an admin means giving them a
// workspace to be admin *of*, and every admin call afterwards names it. `proveVariantProperties`
// carries the security property this whole model rests on: a role held in one workspace grants
// nothing in another.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { POLICY_VERSION_KEY } from "../src/cache/permission-cache.js";
import { permissionCacheStore } from "./bootstrap.js";
import {
  renewingToken,
  type AdminSession,
  type Principal,
  type ProofContext,
  type VariantHooks,
} from "./harness.js";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env["DATABASE_URL"] }),
});

interface Workspace {
  id: string;
  name: string;
  roles: string[];
}

/** Signs up a fresh user, creates a workspace they administer, and returns both. */
async function newAdminWithWorkspace(ctx: ProofContext, label: string) {
  const email = ctx.uniqueEmail(label);
  const password = `${label}-pw-12345`;
  const tokens = await ctx.signup(email, password);
  const userId = (
    await ctx.call("GET", "/auth/me", { token: tokens.accessToken })
  ).body.sub as string;
  const created = await ctx.call("POST", "/workspaces", {
    token: tokens.accessToken,
    body: { name: `${label}-workspace` },
  });
  return {
    email,
    password,
    userId,
    token: tokens.accessToken,
    workspace: created.body as Workspace,
  };
}

export const hooks: VariantHooks = {
  variant: "workspaces",

  async makeAdmin(
    ctx: ProofContext,
    principal: Principal,
  ): Promise<AdminSession> {
    const created = await ctx.call("POST", "/workspaces", {
      token: principal.tokens.accessToken,
      body: { name: "proof-workspace" },
    });
    ctx.assert(
      created.status === 201 || created.status === 200,
      `creating a workspace succeeds (got ${created.status})`,
    );
    const workspace = created.body as Workspace;
    ctx.assert(
      workspace.roles.includes("admin"),
      "the creator of a workspace is an admin member of it",
    );
    // No re-login, and no fresh token needed: the access token is workspace-agnostic and carries
    // no authorization, so the new membership is in effect immediately and the token never goes
    // stale in any way that matters to authorization. `freshToken` re-logs in anyway, because the
    // 2-second access-token TTL in test/bootstrap.ts can expire a token mid-section.
    return {
      token: principal.tokens.accessToken,
      workspaceId: workspace.id,
      freshToken: renewingToken(async () => {
        const res = await ctx.call("POST", "/auth/login", {
          body: { identifier: principal.email, password: principal.password },
        });
        return (res.body as { accessToken: string }).accessToken;
      }),
    };
  },

  async admitUser(
    ctx: ProofContext,
    admin: AdminSession,
    user: { userId: string; email: string },
  ): Promise<void> {
    const added = await ctx.call("POST", "/workspaces/members", {
      token: await admin.freshToken(),
      workspaceId: admin.workspaceId,
      body: { email: user.email },
    });
    ctx.assert(
      added.status === 201 || added.status === 200,
      `adding a user to the workspace succeeds (got ${added.status})`,
    );
  },

  async proveVariantProperties(ctx: ProofContext): Promise<void> {
    // Two independent workspaces, each with its own admin.
    const alpha = await newAdminWithWorkspace(ctx, "alpha");
    const beta = await newAdminWithWorkspace(ctx, "beta");

    ctx.assert(
      alpha.workspace.id !== beta.workspace.id,
      "two workspaces are distinct",
    );

    // --- a non-member cannot even see a workspace exists ---
    const outsider = await ctx.call("GET", "/auth/admin/users", {
      token: alpha.token,
      workspaceId: beta.workspace.id,
    });
    ctx.assert(
      outsider.status === 403,
      `an admin of one workspace is refused in a workspace they are not a member of (got ${outsider.status})`,
    );

    const bogus = await ctx.call("GET", "/auth/admin/users", {
      token: alpha.token,
      workspaceId: "00000000-0000-0000-0000-000000000000",
    });
    ctx.assert(
      bogus.status === 403,
      `an unknown workspace id is refused the same way as someone else's (got ${bogus.status})`,
    );

    const noHeader = await ctx.call("GET", "/auth/admin/users", {
      token: alpha.token,
    });
    ctx.assert(
      noHeader.status === 403,
      `a workspace-scoped route refuses a request that names no workspace (got ${noHeader.status})`,
    );

    // --- alpha joins beta as a plain member: their admin role in alpha must not follow them ---
    const added = await ctx.call("POST", "/workspaces/members", {
      token: beta.token,
      workspaceId: beta.workspace.id,
      body: { email: alpha.email },
    });
    ctx.assert(
      added.status === 201 || added.status === 200,
      `an admin can add an existing user to their workspace (got ${added.status})`,
    );
    const alphaInBeta = added.body as { memberId: string; roles: string[] };
    ctx.assert(
      alphaInBeta.roles.join() === "member",
      `a new member defaults to the member role (got ${alphaInBeta.roles.join()})`,
    );

    const meInAlpha = await ctx.call("GET", "/auth/me", {
      token: alpha.token,
      workspaceId: alpha.workspace.id,
    });
    ctx.assert(
      meInAlpha.body.roles.includes("admin"),
      "the same token is admin in its own workspace",
    );

    const meInBeta = await ctx.call("GET", "/auth/me", {
      token: alpha.token,
      workspaceId: beta.workspace.id,
    });
    ctx.assert(
      !meInBeta.body.roles.includes("admin"),
      "THE core property: the admin role held in workspace A is absent in workspace B",
    );
    ctx.assert(
      meInBeta.body.roles.includes("member"),
      "…and only the roles granted by workspace B's membership apply there",
    );

    const adminAttemptInBeta = await ctx.call("GET", "/auth/admin/users", {
      token: alpha.token,
      workspaceId: beta.workspace.id,
    });
    ctx.assert(
      adminAttemptInBeta.status === 403,
      `being an admin elsewhere does not unlock workspace B's admin endpoints (got ${adminAttemptInBeta.status})`,
    );

    // --- roles are per workspace: the same role name can mean different things ---
    const roleInBeta = await ctx.call("POST", "/auth/admin/roles", {
      token: beta.token,
      workspaceId: beta.workspace.id,
      body: { slug: "shared-name" },
    });
    const roleInAlpha = await ctx.call("POST", "/auth/admin/roles", {
      token: alpha.token,
      workspaceId: alpha.workspace.id,
      body: { slug: "shared-name" },
    });
    ctx.assert(
      roleInBeta.status === 201 && roleInAlpha.status === 201,
      "the same role name can exist independently in two workspaces",
    );

    await ctx.call(
      "POST",
      `/auth/admin/roles/${(roleInBeta.body as { id: string }).id}/permissions`,
      {
        token: beta.token,
        workspaceId: beta.workspace.id,
        body: { permission: "beta:only" },
      },
    );
    await ctx.call("POST", `/auth/admin/users/${alpha.userId}/roles`, {
      token: beta.token,
      workspaceId: beta.workspace.id,
      body: { role: "shared-name" },
    });

    const permsInBeta = await ctx.call("GET", "/auth/me", {
      token: alpha.token,
      workspaceId: beta.workspace.id,
    });
    ctx.assert(
      permsInBeta.body.permissions.includes("beta:only"),
      "a role assigned in workspace B grants its permissions in workspace B",
    );
    const permsInAlpha = await ctx.call("GET", "/auth/me", {
      token: alpha.token,
      workspaceId: alpha.workspace.id,
    });
    ctx.assert(
      !permsInAlpha.body.permissions.includes("beta:only"),
      "…and the identically-named role in workspace A does not carry them",
    );

    // --- direct grants attach to the membership, not the user ---
    const directGrant = await ctx.call(
      "POST",
      `/auth/admin/users/${alpha.userId}/permissions`,
      {
        token: beta.token,
        workspaceId: beta.workspace.id,
        body: { permission: "beta:direct" },
      },
    );
    ctx.assert(
      directGrant.status === 201 || directGrant.status === 200,
      `a direct grant inside workspace B succeeds (got ${directGrant.status})`,
    );
    const afterGrantBeta = await ctx.call("GET", "/auth/me", {
      token: alpha.token,
      workspaceId: beta.workspace.id,
    });
    ctx.assert(
      afterGrantBeta.body.permissions.includes("beta:direct"),
      "the direct grant applies in workspace B",
    );
    const afterGrantAlpha = await ctx.call("GET", "/auth/me", {
      token: alpha.token,
      workspaceId: alpha.workspace.id,
    });
    ctx.assert(
      !afterGrantAlpha.body.permissions.includes("beta:direct"),
      "the direct grant does not leak into workspace A",
    );

    // --- an admin cannot act on a user who is not in their workspace ---
    const crossBlock = await ctx.call(
      "POST",
      `/auth/admin/users/${beta.userId}/block`,
      { token: alpha.token, workspaceId: alpha.workspace.id },
    );
    ctx.assert(
      crossBlock.status === 404,
      `an admin cannot block a user who is not a member of their workspace (got ${crossBlock.status})`,
    );

    // --- audit log is scoped too ---
    const betaAudit = await ctx.call("GET", "/auth/admin/audit-log", {
      token: beta.token,
      workspaceId: beta.workspace.id,
    });
    ctx.assert(
      betaAudit.status === 200,
      `an admin can read their workspace's audit log (got ${betaAudit.status})`,
    );
    ctx.assert(
      (betaAudit.body.items as Array<{ workspaceId: string | null }>).every(
        (e) => e.workspaceId === beta.workspace.id,
      ),
      "the audit log never returns another workspace's entries",
    );

    // --- membership management ---
    const myWorkspaces = await ctx.call("GET", "/workspaces", {
      token: alpha.token,
    });
    ctx.assert(
      myWorkspaces.status === 200,
      `a user can list the workspaces they belong to (got ${myWorkspaces.status})`,
    );
    const ids = (myWorkspaces.body as Workspace[]).map((w) => w.id);
    ctx.assert(
      ids.includes(alpha.workspace.id) && ids.includes(beta.workspace.id),
      "the list covers every workspace the user is a member of",
    );

    const promote = await ctx.call(
      "PUT",
      `/workspaces/members/${alphaInBeta.memberId}/roles`,
      {
        token: beta.token,
        workspaceId: beta.workspace.id,
        body: { roles: ["member", "shared-name"] },
      },
    );
    ctx.assert(
      promote.status === 200,
      `an admin can set a member's roles (got ${promote.status})`,
    );

    const memberList = await ctx.call("GET", "/workspaces/members", {
      token: alpha.token,
      workspaceId: beta.workspace.id,
    });
    ctx.assert(
      memberList.status === 200 && memberList.body.length === 2,
      `any member can list the workspace's members (got ${memberList.status})`,
    );

    const removed = await ctx.call(
      "DELETE",
      `/workspaces/members/${alphaInBeta.memberId}`,
      { token: beta.token, workspaceId: beta.workspace.id },
    );
    ctx.assert(
      removed.status === 200,
      `an admin can remove a member (got ${removed.status})`,
    );

    const afterRemoval = await ctx.call("GET", "/auth/me", {
      token: alpha.token,
      workspaceId: beta.workspace.id,
    });
    ctx.assert(
      afterRemoval.status === 403,
      `a removed member loses access to the workspace immediately (got ${afterRemoval.status})`,
    );

    const stillInAlpha = await ctx.call("GET", "/auth/me", {
      token: alpha.token,
      workspaceId: alpha.workspace.id,
    });
    ctx.assert(
      stillInAlpha.status === 200 && stillInAlpha.body.roles.includes("admin"),
      "…while their own workspace is untouched — the same login still works",
    );

    // --- revocation is immediate here: the context is resolved per request, not per token ---
    const immediate = await ctx.call(
      "POST",
      `/auth/admin/users/${beta.userId}/permissions`,
      {
        token: beta.token,
        workspaceId: beta.workspace.id,
        body: { permission: "probe:immediate" },
      },
    );
    ctx.assert(
      immediate.status === 201 || immediate.status === 200,
      `a direct grant to oneself succeeds (got ${immediate.status})`,
    );
    const seen = await ctx.call("GET", "/auth/me", {
      token: beta.token,
      workspaceId: beta.workspace.id,
    });
    ctx.assert(
      seen.body.permissions.includes("probe:immediate"),
      "the grant is visible on the very next request, with no re-login",
    );
    await ctx.call(
      "POST",
      `/auth/admin/users/${beta.userId}/permissions/${encodeURIComponent("probe:immediate")}/revoke`,
      {
        token: beta.token,
        workspaceId: beta.workspace.id,
      },
    );
    const gone = await ctx.call("GET", "/auth/me", {
      token: beta.token,
      workspaceId: beta.workspace.id,
    });
    ctx.assert(
      !gone.body.permissions.includes("probe:immediate"),
      "…and the revocation lands on the very next request too, on the same token",
    );

    await proveNewWorkspaceIsProvisioned(ctx);
    await proveWorkspaceHeaderCannotBeSkipped(ctx, alpha);
    await proveTheCacheIsScopedAndReal(ctx, alpha, beta);
    await proveARawDatabaseEditChangesEnforcement(ctx, beta);
  },
};

/**
 * THE lockout test. `Role` is unique per `[workspaceId, name]`, so a workspace created through
 * POST /workspaces has no `Role` rows of its own — its creator's `["admin", "member"]` would be
 * two names with nothing behind them. Before `WorkspaceRepository.create` provisioned the
 * default roles in the same transaction, every assertion below returned 403: the creator was
 * locked out of the workspace they had just made, with no way back in, because the seeder only
 * ever provisions the workspace *it* creates.
 *
 * So this walks the entire administrative surface of a brand-new workspace, in order, as the
 * person who created it thirty milliseconds earlier.
 */
async function proveNewWorkspaceIsProvisioned(
  ctx: ProofContext,
): Promise<void> {
  const creator = await newAdminWithWorkspace(ctx, "fresh");
  const ws = creator.workspace.id;
  const as = { token: creator.token, workspaceId: ws };
  ctx.assert(
    creator.workspace.roles.includes("admin"),
    "the creator of a brand-new workspace holds the admin role in it",
  );

  const guestEmail = ctx.uniqueEmail("fresh-guest");
  const guestTokens = await ctx.signup(guestEmail, "fresh-guest-pw-1");
  const guestId = (
    await ctx.call("GET", "/auth/me", { token: guestTokens.accessToken })
  ).body.sub as string;

  const ok = (res: { status: number }) =>
    res.status === 200 || res.status === 201;

  const added = await ctx.call("POST", "/workspaces/members", {
    ...as,
    body: { email: guestEmail },
  });
  ctx.assert(
    ok(added),
    `members:manage — the creator can add a member (got ${added.status})`,
  );
  const memberId = (added.body as { memberId: string }).memberId;

  ctx.assert(
    ok(await ctx.call("GET", "/auth/admin/users", as)),
    "users:read — the creator can list the members",
  );
  ctx.assert(
    ok(await ctx.call("GET", "/auth/admin/audit-log", as)),
    "audit-log:read — the creator can read the audit log",
  );

  const role = await ctx.call("POST", "/auth/admin/roles", {
    ...as,
    body: { slug: "fresh-role" },
  });
  ctx.assert(
    ok(role),
    `roles:manage — the creator can define a role (got ${role.status})`,
  );
  const attach = await ctx.call(
    "POST",
    `/auth/admin/roles/${(role.body as { id: string }).id}/permissions`,
    { ...as, body: { permission: "fresh:probe" } },
  );
  ctx.assert(
    ok(attach),
    `roles:manage — the creator can say what that role carries (got ${attach.status})`,
  );

  ctx.assert(
    ok(
      await ctx.call("POST", `/auth/admin/users/${guestId}/roles`, {
        ...as,
        body: { role: "fresh-role" },
      }),
    ),
    "roles:assign — assign a role",
  );
  ctx.assert(
    ok(
      await ctx.call(
        "POST",
        `/auth/admin/users/${guestId}/roles/fresh-role/revoke`,
        as,
      ),
    ),
    "roles:assign — revoke a role",
  );

  ctx.assert(
    ok(
      await ctx.call("POST", `/auth/admin/users/${guestId}/permissions`, {
        ...as,
        body: { permission: "fresh:direct" },
      }),
    ),
    "permissions:grant — grant directly",
  );
  ctx.assert(
    ok(
      await ctx.call(
        "POST",
        `/auth/admin/users/${guestId}/permissions/${encodeURIComponent("fresh:direct")}/revoke`,
        as,
      ),
    ),
    "permissions:grant — revoke a direct grant",
  );

  ctx.assert(
    ok(await ctx.call("POST", `/auth/admin/users/${guestId}/block`, as)),
    "users:block — block a member",
  );
  ctx.assert(
    ok(await ctx.call("POST", `/auth/admin/users/${guestId}/unblock`, as)),
    "users:block — unblock a member",
  );

  ctx.assert(
    ok(
      await ctx.call("PUT", `/workspaces/members/${memberId}/roles`, {
        ...as,
        body: { roles: ["member"] },
      }),
    ),
    "roles:assign — set a member's roles",
  );
  ctx.assert(
    ok(await ctx.call("DELETE", `/workspaces/members/${memberId}`, as)),
    "members:manage — remove a member",
  );

  // The other half of the same property: the roles are provisioned, not inherited. A second
  // workspace's "admin" is a different row that happens to share a name.
  const other = await newAdminWithWorkspace(ctx, "fresh-other");
  const trespass = await ctx.call("GET", "/auth/admin/users", {
    token: creator.token,
    workspaceId: other.workspace.id,
  });
  ctx.assert(
    trespass.status === 403,
    `being provisioned as admin of one new workspace grants nothing in another (got ${trespass.status})`,
  );
}

/**
 * `X-Workspace-Id` is the only thing that says which workspace a request acts in, so "the header
 * is missing or junk" must never be a way to reach a handler with no workspace resolved. The
 * failure mode being ruled out is a permissive empty context, a silent fall-back to some default
 * workspace, or a handler running with `req.authz` undefined.
 *
 * All of them must deny, and deny the same way a workspace you are not a member of does — a
 * caller must not be able to tell "no such workspace" from "not yours" from "you sent nothing".
 */
async function proveWorkspaceHeaderCannotBeSkipped(
  ctx: ProofContext,
  member: { token: string; workspace: Workspace },
): Promise<void> {
  const cases: Array<[string, Record<string, string>]> = [
    ["absent", {}],
    ["empty", { "x-workspace-id": "" }],
    ["whitespace", { "x-workspace-id": "   " }],
    ["not a uuid", { "x-workspace-id": "not-a-uuid" }],
    ["a sql fragment", { "x-workspace-id": "' OR 1=1 --" }],
    ["absurdly long", { "x-workspace-id": "x".repeat(4096) }],
  ];

  for (const [label, headers] of cases) {
    const admin = await ctx.call("GET", "/auth/admin/users", {
      token: member.token,
      headers,
    });
    ctx.assert(
      admin.status === 403,
      `a permission-gated admin route denies a request whose workspace id is ${label} (got ${admin.status})`,
    );

    const members = await ctx.call("GET", "/workspaces/members", {
      token: member.token,
      headers,
    });
    ctx.assert(
      members.status === 403,
      `a member-gated workspace route denies a request whose workspace id is ${label} (got ${members.status})`,
    );
  }

  // Indistinguishability, spelled out: an id that exists but is not yours and an id that exists
  // nowhere must be the same answer, body included, or the 403 becomes a workspace oracle.
  const stranger = await newAdminWithWorkspace(ctx, "stranger");
  const notYours = await ctx.call("GET", "/auth/admin/users", {
    token: member.token,
    workspaceId: stranger.workspace.id,
  });
  const notReal = await ctx.call("GET", "/auth/admin/users", {
    token: member.token,
    workspaceId: "00000000-0000-0000-0000-000000000000",
  });
  ctx.assert(
    notYours.status === notReal.status &&
      notYours.body?.message === notReal.body?.message,
    `someone else's workspace and a nonexistent one answer identically (${notYours.status}/${notYours.body?.message} vs ${notReal.status}/${notReal.body?.message})`,
  );

  // /auth/me is the one route that works either way, because clients call it before they know
  // which workspaces exist. It must answer with an empty authorization context, never with one
  // borrowed from an arbitrary workspace the user happens to belong to.
  const meNoHeader = await ctx.call("GET", "/auth/me", { token: member.token });
  ctx.assert(
    meNoHeader.status === 200,
    `GET /auth/me answers without a workspace header (got ${meNoHeader.status})`,
  );
  ctx.assert(
    Array.isArray(meNoHeader.body?.roles) &&
      meNoHeader.body.roles.length === 0 &&
      meNoHeader.body.permissions.length === 0,
    `…with empty roles and permissions rather than some workspace's (got roles=${JSON.stringify(meNoHeader.body?.roles)})`,
  );
  ctx.assert(
    meNoHeader.body?.sub && meNoHeader.body?.sessionId,
    "…while still identifying the user, which is what makes it callable before any workspace is chosen",
  );

  const meEmptyHeader = await ctx.call("GET", "/auth/me", {
    token: member.token,
    headers: { "x-workspace-id": "" },
  });
  ctx.assert(
    meEmptyHeader.status === 200 && meEmptyHeader.body.roles.length === 0,
    `an empty workspace header is treated as naming no workspace, not as naming one (got ${meEmptyHeader.status})`,
  );

  const meBogusHeader = await ctx.call("GET", "/auth/me", {
    token: member.token,
    workspaceId: "00000000-0000-0000-0000-000000000000",
  });
  ctx.assert(
    meBogusHeader.status === 403,
    `but a workspace id that is named and not yours is refused outright, even here (got ${meBogusHeader.status})`,
  );
}

/**
 * The permission cache is keyed on the *membership*, not the user, so invalidating one workspace
 * must not flush another — and a cache nobody can prove is working is a bug surface. These
 * assertions read the very store the app resolves through (`test/bootstrap.ts` hands it to
 * `AuthModule.forRoot`), so "the second request did not touch the database" is a measurement.
 */
async function proveTheCacheIsScopedAndReal(
  ctx: ProofContext,
  alpha: { token: string; workspace: Workspace },
  beta: { token: string; userId: string; workspace: Workspace },
): Promise<void> {
  const N = 8;
  await ctx.call("GET", "/auth/me", {
    token: alpha.token,
    workspaceId: alpha.workspace.id,
  }); // warm
  const before = { ...permissionCacheStore.stats };
  for (let i = 0; i < N; i += 1)
    await ctx.call("GET", "/auth/me", {
      token: alpha.token,
      workspaceId: alpha.workspace.id,
    });
  const after = permissionCacheStore.stats;
  ctx.assert(
    after.misses === before.misses && after.hits === before.hits + N,
    `${N} identical workspace-scoped requests resolve the membership 0 further times — all ${N} were cache hits (misses +${after.misses - before.misses}, hits +${after.hits - before.hits})`,
  );

  // A grant inside beta must invalidate beta's entry and leave alpha's alone: the cache subject is
  // the (user, workspace) pair, so one workspace's churn cannot cost another workspace its cache.
  await ctx.call("POST", `/auth/admin/users/${beta.userId}/permissions`, {
    token: beta.token,
    workspaceId: beta.workspace.id,
    body: { permission: "probe:cache" },
  });
  const beforeAlpha = { ...permissionCacheStore.stats };
  const alphaAfter = await ctx.call("GET", "/auth/me", {
    token: alpha.token,
    workspaceId: alpha.workspace.id,
  });
  ctx.assert(
    permissionCacheStore.stats.misses === beforeAlpha.misses &&
      alphaAfter.status === 200,
    "a grant made in workspace B does not invalidate the caller's cached membership of workspace A",
  );
  const betaAfter = await ctx.call("GET", "/auth/me", {
    token: beta.token,
    workspaceId: beta.workspace.id,
  });
  ctx.assert(
    (betaAfter.body?.permissions ?? []).includes("probe:cache"),
    "…while workspace B sees the grant on its very next request",
  );
  await ctx.call(
    "POST",
    `/auth/admin/users/${beta.userId}/permissions/${encodeURIComponent("probe:cache")}/revoke`,
    {
      token: beta.token,
      workspaceId: beta.workspace.id,
    },
  );
  const betaRevoked = await ctx.call("GET", "/auth/me", {
    token: beta.token,
    workspaceId: beta.workspace.id,
  });
  ctx.assert(
    !(betaRevoked.body?.permissions ?? []).includes("probe:cache"),
    "…and loses it again on the request after the revoke",
  );
}

/**
 * The admin API already proves that editing the catalog changes enforcement, but it is the API
 * doing the writing — this rules out any possibility that it is also doing something in memory.
 * A `psql` session would look exactly like this, bump included: an out-of-band writer is outside
 * the invalidation protocol and says so by bumping the policy counter (see permission-cache.ts).
 */
async function proveARawDatabaseEditChangesEnforcement(
  ctx: ProofContext,
  beta: { token: string; workspace: Workspace },
): Promise<void> {
  const opened = await ctx.call("GET", "/auth/admin/audit-log", {
    token: beta.token,
    workspaceId: beta.workspace.id,
  });
  ctx.assert(
    opened.status === 200,
    `the workspace admin can read the audit log to begin with (got ${opened.status})`,
  );

  await prisma.permission.update({
    where: { slug: "audit-log:read" },
    data: { isActive: false },
  });
  await permissionCacheStore.bump(POLICY_VERSION_KEY);
  const denied = await ctx.call("GET", "/auth/admin/audit-log", {
    token: beta.token,
    workspaceId: beta.workspace.id,
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
  const restored = await ctx.call("GET", "/auth/admin/audit-log", {
    token: beta.token,
    workspaceId: beta.workspace.id,
  });
  ctx.assert(
    restored.status === 200,
    `…and reactivating it in the database opens the route again (got ${restored.status})`,
  );
}
