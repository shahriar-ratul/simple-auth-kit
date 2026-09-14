// Shared scaffolding for prove-cycle.ts, plus the contract each variant's
// `variant-hooks.ts` implements. Everything here is variant-agnostic: it talks to the running
// app over HTTP only, so it compiles against either variant's generated Prisma client.
import { createHmac, randomUUID } from "node:crypto";

// Distinct from the other combos' ports so every proof can run at the same time.
export const BASE_PORT = 4030;

export interface CallOptions {
  token?: string;
  body?: unknown;
  /** Sent as `X-Workspace-Id`. Ignored by variants that have no workspaces. */
  workspaceId?: string;
  /**
   * Raw headers, merged last. The escape hatch for asserting what happens on malformed input —
   * `workspaceId` above cannot express "sent, but empty", which is exactly a case worth proving.
   */
  headers?: Record<string, string>;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

/** Everything a variant hook is allowed to use. Kept small on purpose — hooks drive the app, they do not reach around it. */
export interface ProofContext {
  call(
    method: string,
    path: string,
    opts?: CallOptions,
  ): Promise<{ status: number; body: any }>;
  assert(condition: boolean, message: string): void;
  signup(email: string, password: string): Promise<AuthTokens>;
  uniqueEmail(prefix: string): string;
}

/** The freshly-signed-up user a variant is asked to promote. */
export interface Principal {
  userId: string;
  email: string;
  password: string;
  tokens: AuthTokens;
}

/** How admin-scoped requests are made in this variant: which token, and what scope (if any) they name. */
export interface AdminSession {
  token: string;
  /** Set only where admin authority is scoped to something narrower than the deployment. */
  workspaceId?: string;
  /**
   * A freshly minted admin token. The proof's own admin token is created once and reused across
   * a run that makes hundreds of calls, and `test/bootstrap.ts` deliberately runs a 2-second
   * access-token TTL — so any section that makes several admin calls must re-mint rather than
   * carry a token that may expire mid-section. That was a real 1-in-10 flake, not a hypothetical.
   */
  freshToken(): Promise<string>;
}

/**
 * The three things that genuinely differ between variants when proving the same auth cycle.
 * A variant supplies them from `variants/<variant>/test/variant-hooks.ts`.
 */
export interface VariantHooks {
  variant: string;
  /** Give the just-signed-up user administrative authority, and return how to make admin calls as them. */
  makeAdmin(ctx: ProofContext, principal: Principal): Promise<AdminSession>;
  /** Bring a user into the admin session's scope, so admin endpoints can act on them. No-op where the scope is the whole deployment. */
  admitUser(
    ctx: ProofContext,
    admin: AdminSession,
    user: { userId: string; email: string },
  ): Promise<void>;
  /** Assertions that only make sense for this variant. Runs last, after the shared cycle has passed. */
  proveVariantProperties(ctx: ProofContext, admin: AdminSession): Promise<void>;
}

/** One admin route, and the single permission slug that is supposed to open it. */
export interface RouteProbe {
  permission: string;
  /** How the route reads in the mapping table, for assertion messages. */
  label: string;
  method: string;
  path: string;
  body?: unknown;
}

/**
 * Every ability-gated route across the admin/roles/permissions/audit-log modules, paired with
 * its `@CheckAbility` slug. Both variants expose exactly this surface — the workspace variant
 * adds `/workspaces/*` routes on top, which its own hooks cover, so this list stays
 * variant-agnostic.
 *
 * The order is load-bearing where a pair of routes undoes itself: assign before revoke, block
 * before unblock. A caller can therefore run the whole list against one target user repeatedly
 * and leave it exactly as it found it, which is what lets the proof run it once per permission.
 */
export function adminRouteProbes(args: {
  targetUserId: string;
  roleId: string;
  roleSlug: string;
  newRoleSlug: string;
  newPermissionSlug: string;
}): RouteProbe[] {
  const { targetUserId, roleId, roleSlug, newRoleSlug, newPermissionSlug } =
    args;
  const granted = encodeURIComponent("probe:granted");
  return [
    {
      permission: "users:read",
      label: "GET /admin/users",
      method: "GET",
      path: "/admin/users",
    },
    {
      permission: "users:read",
      label: "GET /admin/users/:userId",
      method: "GET",
      path: `/admin/users/${targetUserId}`,
    },
    {
      permission: "users:manage",
      label: "PATCH /admin/users/:userId",
      method: "PATCH",
      path: `/admin/users/${targetUserId}`,
      body: { displayName: "Probe User" },
    },
    {
      permission: "audit-log:read",
      label: "GET /audit-log",
      method: "GET",
      path: "/audit-log",
    },
    {
      permission: "permissions:read",
      label: "GET /permissions",
      method: "GET",
      path: "/permissions",
    },
    {
      permission: "permissions:define",
      label: "POST /permissions",
      method: "POST",
      path: "/permissions",
      body: {
        slug: newPermissionSlug,
        displayName: "Probe permission",
        group: "Probe",
      },
    },
    {
      permission: "roles:manage",
      label: "GET /roles",
      method: "GET",
      path: "/roles",
    },
    {
      permission: "roles:manage",
      label: "POST /roles",
      method: "POST",
      path: "/roles",
      body: { slug: newRoleSlug },
    },
    {
      permission: "roles:manage",
      label: "POST /roles/:roleId/permissions",
      method: "POST",
      path: `/roles/${roleId}/permissions`,
      body: { permission: "probe:attached" },
    },
    {
      permission: "roles:manage",
      label: "PATCH /roles/:roleId",
      method: "PATCH",
      path: `/roles/${roleId}`,
      body: { displayName: "Probe Role" },
    },
    {
      permission: "roles:assign",
      label: "POST /admin/users/:userId/roles",
      method: "POST",
      path: `/admin/users/${targetUserId}/roles`,
      body: { role: roleSlug },
    },
    {
      permission: "roles:assign",
      label: "POST /admin/users/:userId/roles/:roleSlug/revoke",
      method: "POST",
      path: `/admin/users/${targetUserId}/roles/${encodeURIComponent(roleSlug)}/revoke`,
    },
    {
      permission: "permissions:grant",
      label: "POST /admin/users/:userId/permissions",
      method: "POST",
      path: `/admin/users/${targetUserId}/permissions`,
      body: { permission: "probe:granted" },
    },
    {
      permission: "permissions:grant",
      label: "POST /admin/users/:userId/permissions/:permissionSlug/revoke",
      method: "POST",
      path: `/admin/users/${targetUserId}/permissions/${granted}/revoke`,
    },
    {
      permission: "users:block",
      label: "POST /admin/users/:userId/block",
      method: "POST",
      path: `/admin/users/${targetUserId}/block`,
    },
    {
      permission: "users:block",
      label: "POST /admin/users/:userId/unblock",
      method: "POST",
      path: `/admin/users/${targetUserId}/unblock`,
    },
  ];
}

/** Reads a JWT's payload without verifying it — the proof only inspects which claims are present. */
export function decodeJwtPayload(token: string): Record<string, unknown> {
  return JSON.parse(
    Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
  );
}

/**
 * Signs a minimal HS256 JWT under an arbitrary secret, built by hand rather than through
 * whatever library the app itself signs with (jose or @nestjs/jwt, depending on the combo) — the
 * point is to prove the server actually verifies the signature against its own configured
 * secret, not just that its own signer round-trips.
 */
export function forgeHs256Jwt(
  payload: Record<string, unknown>,
  secret: string,
): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

/** A same-shaped access-token payload under a wrong secret — the caller supplies `sub`/`sessionId`. */
export function forgeAccessToken(
  claims: { sub: string; sessionId: string },
  secret = "wrong-secret-entirely-different-from-the-real-one",
): string {
  const now = Math.floor(Date.now() / 1000);
  return forgeHs256Jwt(
    {
      sub: claims.sub,
      sessionId: claims.sessionId,
      jti: randomUUID(),
      iat: now,
      exp: now + 900,
    },
    secret,
  );
}

/** A same-shaped refresh-token payload under a wrong secret — the caller supplies `sub`/`sessionId`/`sv`. */
export function forgeRefreshToken(
  claims: { sub: string; sessionId: string; sv: number },
  secret = "wrong-secret-entirely-different-from-the-real-one",
): string {
  const now = Math.floor(Date.now() / 1000);
  return forgeHs256Jwt(
    {
      sub: claims.sub,
      sessionId: claims.sessionId,
      sv: claims.sv,
      jti: randomUUID(),
      iat: now,
      exp: now + 60 * 60 * 24 * 30,
    },
    secret,
  );
}

/**
 * A token accessor that re-mints only when the one it holds is about to expire.
 *
 * The proof's admin makes hundreds of calls, and reusing one token across all of them is what
 * produced a real 1-in-10 flake: with a 2-second access-token TTL the token could expire
 * mid-section, and the resulting 401 surfaced as a confusing failure of a later assertion. The
 * naive fix — log in before every admin call — is worse: core rate-limits login to 5 per minute
 * per email, so the run would 429 itself.
 *
 * So: hold the token, check its `exp`, and log in again only inside the last `SKEW_SECONDS`. No
 * call ever runs on a token that is about to die, and the login count stays at one per admin.
 */
const SKEW_SECONDS = 30;

export function renewingToken(
  login: () => Promise<string>,
): () => Promise<string> {
  let token: string | undefined;
  return async () => {
    if (token) {
      const exp = decodeJwtPayload(token).exp as number;
      if (exp * 1000 - Date.now() > SKEW_SECONDS * 1000) return token;
    }
    token = await login();
    return token;
  };
}
