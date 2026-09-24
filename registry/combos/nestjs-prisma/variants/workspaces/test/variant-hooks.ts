// Variant hooks for the workspace variant. See test/harness.ts for the contract. Admin
// authority here is per workspace — making someone an admin means giving them a workspace to be
// admin of. `proveVariantProperties` carries the core security property: a role held in one
// workspace grants nothing in another.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/database/generated/prisma/client.js";
import { toId } from "../src/common/helpers/id.helper.js";
import {
  renewingToken,
  type AdminSession,
  type Principal,
  type ProofContext,
  type VariantHooks,
} from "./harness.js";
import { proofHandles } from "./bootstrap.js";

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
    // No re-login needed: the access token is workspace-agnostic and carries no authorization,
    // so the membership is in effect immediately. freshToken() re-logs in anyway because the
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
    const outsider = await ctx.call("GET", "/admin/users", {
      token: alpha.token,
      workspaceId: beta.workspace.id,
    });
    ctx.assert(
      outsider.status === 403,
      `an admin of one workspace is refused in a workspace they are not a member of (got ${outsider.status})`,
    );

    const bogus = await ctx.call("GET", "/admin/users", {
      token: alpha.token,
      workspaceId: "00000000-0000-0000-0000-000000000000",
    });
    ctx.assert(
      bogus.status === 403,
      `an unknown workspace id is refused the same way as someone else's (got ${bogus.status})`,
    );

    const noHeader = await ctx.call("GET", "/admin/users", {
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

    const adminAttemptInBeta = await ctx.call("GET", "/admin/users", {
      token: alpha.token,
      workspaceId: beta.workspace.id,
    });
    ctx.assert(
      adminAttemptInBeta.status === 403,
      `being an admin elsewhere does not unlock workspace B's admin endpoints (got ${adminAttemptInBeta.status})`,
    );

    // --- roles are per workspace: the same role name can mean different things ---
    const roleInBeta = await ctx.call("POST", "/roles", {
      token: beta.token,
      workspaceId: beta.workspace.id,
      body: { slug: "shared-name" },
    });
    const roleInAlpha = await ctx.call("POST", "/roles", {
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
      `/roles/${(roleInBeta.body as { id: string }).id}/permissions`,
      {
        token: beta.token,
        workspaceId: beta.workspace.id,
        body: { permission: "beta:only" },
      },
    );
    await ctx.call("POST", `/admin/users/${alpha.userId}/roles`, {
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
      `/admin/users/${alpha.userId}/permissions`,
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
      `/admin/users/${beta.userId}/block`,
      { token: alpha.token, workspaceId: alpha.workspace.id },
    );
    ctx.assert(
      crossBlock.status === 404,
      `an admin cannot block a user who is not a member of their workspace (got ${crossBlock.status})`,
    );

    // --- audit log is scoped too ---
    const betaAudit = await ctx.call("GET", "/audit-log", {
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
      `/admin/users/${beta.userId}/permissions`,
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
      `/admin/users/${beta.userId}/permissions/${encodeURIComponent("probe:immediate")}/revoke`,
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
    await proveGrantsAreScopedToTheirWorkspace(ctx, alpha, beta);
    await proveARawDatabaseEditChangesEnforcement(ctx, beta);
    await proveAuthzIsCachedUntilItChanges(ctx, beta);
  },
};

// The lockout test: without `WorkspaceRepository.create` provisioning default roles in the same
// transaction, a brand-new workspace has no `Role` rows, and its creator's ["admin", "member"]
// would be names with nothing behind them — locked out with no way back in. Walks the entire
// administrative surface of a brand-new workspace as the person who just created it.
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
    ok(await ctx.call("GET", "/admin/users", as)),
    "users:read — the creator can list the members",
  );
  ctx.assert(
    ok(await ctx.call("GET", "/audit-log", as)),
    "audit-log:read — the creator can read the audit log",
  );

  const role = await ctx.call("POST", "/roles", {
    ...as,
    body: { slug: "fresh-role" },
  });
  ctx.assert(
    ok(role),
    `roles:manage — the creator can define a role (got ${role.status})`,
  );
  const attach = await ctx.call(
    "POST",
    `/roles/${(role.body as { id: string }).id}/permissions`,
    { ...as, body: { permission: "fresh:probe" } },
  );
  ctx.assert(
    ok(attach),
    `roles:manage — the creator can say what that role carries (got ${attach.status})`,
  );

  ctx.assert(
    ok(
      await ctx.call("POST", `/admin/users/${guestId}/roles`, {
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
        `/admin/users/${guestId}/roles/fresh-role/revoke`,
        as,
      ),
    ),
    "roles:assign — revoke a role",
  );

  ctx.assert(
    ok(
      await ctx.call("POST", `/admin/users/${guestId}/permissions`, {
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
        `/admin/users/${guestId}/permissions/${encodeURIComponent("fresh:direct")}/revoke`,
        as,
      ),
    ),
    "permissions:grant — revoke a direct grant",
  );

  ctx.assert(
    ok(await ctx.call("POST", `/admin/users/${guestId}/block`, as)),
    "users:block — block a member",
  );
  ctx.assert(
    ok(await ctx.call("POST", `/admin/users/${guestId}/unblock`, as)),
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

  // A second workspace's "admin" is a different row that happens to share a name.
  const other = await newAdminWithWorkspace(ctx, "fresh-other");
  const trespass = await ctx.call("GET", "/admin/users", {
    token: creator.token,
    workspaceId: other.workspace.id,
  });
  ctx.assert(
    trespass.status === 403,
    `being provisioned as admin of one new workspace grants nothing in another (got ${trespass.status})`,
  );
}

// `X-Workspace-Id` is the only thing that says which workspace a request acts in, so a missing
// or junk header must never reach a handler with no workspace resolved — and must deny the same
// way a workspace you aren't a member of does, so a caller can't tell the two apart.
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
    const admin = await ctx.call("GET", "/admin/users", {
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

  // An id that exists but isn't yours and one that exists nowhere must answer identically, body
  // included, or the 403 becomes a workspace oracle.
  const stranger = await newAdminWithWorkspace(ctx, "stranger");
  const notYours = await ctx.call("GET", "/admin/users", {
    token: member.token,
    workspaceId: stranger.workspace.id,
  });
  const notReal = await ctx.call("GET", "/admin/users", {
    token: member.token,
    workspaceId: "00000000-0000-0000-0000-000000000000",
  });
  ctx.assert(
    notYours.status === notReal.status &&
      notYours.body?.message === notReal.body?.message,
    `someone else's workspace and a nonexistent one answer identically (${notYours.status}/${notYours.body?.message} vs ${notReal.status}/${notReal.body?.message})`,
  );

  // /auth/me works either way, since clients call it before they know which workspaces exist —
  // it must answer with an empty context, never one borrowed from a workspace the user belongs to.
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

// A grant made inside one workspace belongs to that membership: it shows up in that workspace
// on the very next request and never in the same person's other workspaces.
async function proveGrantsAreScopedToTheirWorkspace(
  ctx: ProofContext,
  alpha: { token: string; workspace: Workspace },
  beta: { token: string; userId: string; workspace: Workspace },
): Promise<void> {
  await ctx.call("POST", `/admin/users/${beta.userId}/permissions`, {
    token: beta.token,
    workspaceId: beta.workspace.id,
    body: { permission: "probe:scope" },
  });
  const alphaAfter = await ctx.call("GET", "/auth/me", {
    token: alpha.token,
    workspaceId: alpha.workspace.id,
  });
  ctx.assert(
    alphaAfter.status === 200 &&
      !(alphaAfter.body?.permissions ?? []).includes("probe:scope"),
    "a grant made in workspace B does not show up in the caller's membership of workspace A",
  );
  const betaAfter = await ctx.call("GET", "/auth/me", {
    token: beta.token,
    workspaceId: beta.workspace.id,
  });
  ctx.assert(
    (betaAfter.body?.permissions ?? []).includes("probe:scope"),
    "…while workspace B sees the grant on its very next request",
  );
  await ctx.call(
    "POST",
    `/admin/users/${beta.userId}/permissions/${encodeURIComponent("probe:scope")}/revoke`,
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
    !(betaRevoked.body?.permissions ?? []).includes("probe:scope"),
    "…and loses it again on the request after the revoke",
  );
}

// Writes rows directly rather than through the admin API, with nothing telling the app it
// happened — a `psql` session would look exactly like this. Authorization is read from the
// database on every request, so each edit is enforced on the very next one.
async function proveARawDatabaseEditChangesEnforcement(
  ctx: ProofContext,
  beta: { token: string; userId: string; workspace: Workspace },
): Promise<void> {
  const opened = await ctx.call("GET", "/audit-log", {
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
  await pastAuthzCacheTtl();
  const denied = await ctx.call("GET", "/audit-log", {
    token: beta.token,
    workspaceId: beta.workspace.id,
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
    token: beta.token,
    workspaceId: beta.workspace.id,
  });
  ctx.assert(
    restored.status === 200,
    `…and reactivating it in the database opens the route again (got ${restored.status})`,
  );

  const member = await prisma.workspaceMember.findUniqueOrThrow({
    where: {
      userId_workspaceId: {
        userId: toId(beta.userId),
        workspaceId: toId(beta.workspace.id),
      },
    },
    select: { id: true },
  });
  const adminRole = await prisma.role.findFirstOrThrow({
    where: { workspaceId: toId(beta.workspace.id), slug: "admin" },
    select: { id: true },
  });
  const auditLogRead = await prisma.permission.findUniqueOrThrow({
    where: { slug: "audit-log:read" },
    select: { id: true },
  });

  // The membership's role assignment, deleted straight from the join table.
  await prisma.roleMember.deleteMany({
    where: { memberId: member.id, roleId: adminRole.id },
  });
  await pastAuthzCacheTtl();
  const afterRawRoleDelete = await ctx.call("GET", "/audit-log", {
    token: beta.token,
    workspaceId: beta.workspace.id,
  });
  ctx.assert(
    afterRawRoleDelete.status === 403,
    `a role assignment deleted by a raw database write is enforced once the cache TTL passes, same token (got ${afterRawRoleDelete.status})`,
  );

  // A direct grant inserted and then deleted the same way.
  await prisma.permissionMember.create({
    data: { memberId: member.id, permissionId: auditLogRead.id },
  });
  await pastAuthzCacheTtl();
  const viaGrant = await ctx.call("GET", "/audit-log", {
    token: beta.token,
    workspaceId: beta.workspace.id,
  });
  ctx.assert(
    viaGrant.status === 200,
    `a direct grant inserted by a raw database write opens the route once the cache TTL passes (got ${viaGrant.status})`,
  );
  await prisma.permissionMember.deleteMany({
    where: { memberId: member.id, permissionId: auditLogRead.id },
  });
  await pastAuthzCacheTtl();
  const afterRawGrantDelete = await ctx.call("GET", "/audit-log", {
    token: beta.token,
    workspaceId: beta.workspace.id,
  });
  ctx.assert(
    afterRawGrantDelete.status === 403,
    `a direct grant deleted by a raw database write is enforced once the cache TTL passes, same token (got ${afterRawGrantDelete.status})`,
  );

  // Put the admin role back so nothing after this section inherits a stripped membership.
  await prisma.roleMember.create({
    data: { memberId: member.id, roleId: adminRole.id },
  });
  await pastAuthzCacheTtl();
}

// `AuthzCache`: identical requests cost one resolution between them; a change made through the
// API bumps `authz_version` and is enforced on the very next request; a raw database write
// bypasses the bump, so it is served from the cache until the TTL passes, then enforced.
async function proveAuthzIsCachedUntilItChanges(
  ctx: ProofContext,
  beta: { token: string; workspace: Workspace },
): Promise<void> {
  const cache = proofHandles.authzCache!;
  const admin = {
    freshToken: async () => beta.token,
    workspaceId: beta.workspace.id,
  };
  const read = async () =>
    (
      await ctx.call("GET", "/audit-log", {
        token: beta.token,
        workspaceId: beta.workspace.id,
      })
    ).status;

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
      workspaceId: admin.workspaceId,
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

/** Waits out `authzCache.ttlSeconds` (1s in the proof, see bootstrap.ts). */
const pastAuthzCacheTtl = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 1_200));
