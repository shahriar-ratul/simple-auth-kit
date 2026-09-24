// Black-box proof of the full auth cycle, run against a materialized variant of this combo by
// `npm run prove-cycle`. Everything below is variant-agnostic and speaks HTTP only; the three
// places where variants genuinely differ come from ./variant-hooks.js, which each variant
// supplies. Do not branch on the variant name in this file — add a hook instead.
//
// The two exceptions to "HTTP only" are deliberate and both are about *startup*: the tier section
// below registers a route the way a developer would, and the front/back equivalence section
// imports the same `defineAbilitiesFor` a client would use. Neither reads the database.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { generateTotpCode } from "@/lib/auth/core/two-factor.js";
import {
  ABILITY_SUBJECT,
  defineAbilitiesFor,
} from "../src/common/auth/ability/ability.js";
import { AuthzCache } from "../src/common/auth/cache/authz-cache.js";
import { ability, createTieredRouter } from "../src/infra/route-tiers.js";
import { authzCache, bootstrap, capturedResetTokens } from "./bootstrap.js";
import { MapAuthzCacheStore } from "./map-authz-cache-store.js";
import {
  adminRouteProbes,
  AuthTokens,
  BASE_PORT,
  CallOptions,
  decodeJwtPayload,
  ProofContext,
  RouteProbe,
} from "./harness.js";
import { hooks } from "./variant-hooks.js";

const BASE = `http://localhost:${BASE_PORT}/api/v1`;

let failures = 0;
function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ok   ${message}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${message}`);
  }
}

async function call(
  method: string,
  path: string,
  opts: CallOptions = {},
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.workspaceId ? { "x-workspace-id": opts.workspaceId } : {}),
      ...(opts.headers ?? {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const envelope = await res.json().catch(() => undefined);
  // Every response is `{success, statusCode, data}` (success) or `{success:false, statusCode,
  // message, ...}` (error) — unwrap `data` here, once, so every assertion below reads the actual
  // payload without knowing the envelope exists. Error bodies have no `data` key, so they pass
  // through unchanged.
  const body =
    envelope && typeof envelope === "object" && "data" in envelope
      ? envelope.data
      : envelope;
  return { status: res.status, body: body as any };
}

const RUN_ID = randomUUID().slice(0, 8);
const uniqueEmail = (prefix: string) => `${prefix}-${randomUUID()}@example.com`;
/** Role slugs are unique within their scope, so each run needs its own — the proof runs against a database it does not reset. */
const ROLE_SLUG = `billing-manager-${RUN_ID}`;

async function signup(email: string, password: string): Promise<AuthTokens> {
  const res = await call("POST", "/auth/signup", { body: { email, password } });
  if (res.status !== 200 && res.status !== 201)
    throw new Error(
      `signup failed (${res.status}): ${JSON.stringify(res.body)}`,
    );
  return res.body as AuthTokens;
}

const ctx: ProofContext = { call, assert, signup, uniqueEmail };

/**
 * Registers a route on a tiered router exactly as a developer would, but naming a permission the
 * catalog does not define.
 *
 * This is the Express shape of the reference combo's "a route that declares no tier fails at
 * startup". There, a handler with no marker is caught by walking the route table at boot. Here the
 * tier is a required argument of `route()`, so a route with *no* tier is not something a running
 * program can express — it is a compile error, which is the stronger guarantee and cannot be
 * asserted at runtime. What remains runtime-checkable is the other half of the same property: a
 * route gated on a slug nothing can ever grant. `ability()` refuses it at registration, i.e. at
 * startup, so even an untyped (plain-JS) caller fails loudly at boot rather than serving a route
 * no one can reach.
 */
function registerRouteGatedOnAnUndefinedSlug(): unknown {
  const passthrough = (_req: unknown, _res: unknown, next: () => void) =>
    next();
  const router = createTieredRouter({
    authentication: passthrough as never,
    authorization: passthrough as never,
  });
  try {
    // Cast because the whole point is that TypeScript rejects this; the check being proved is the
    // runtime one, which catches a caller who is not type-checked at all.
    router.route(
      "get",
      "/__tier-proof",
      ability("no:such-permission" as never),
      ((_req: unknown, res: { json: (b: unknown) => void }) =>
        res.json({ ok: true })) as never,
    );
    return undefined;
  } catch (err) {
    return err;
  }
}

async function main() {
  console.log(
    "0. fail-closed at startup: a route gated on a permission nothing can grant stops the app from booting",
  );
  const bootError = registerRouteGatedOnAnUndefinedSlug();
  const bootMessage =
    bootError instanceof Error ? bootError.message : String(bootError);
  assert(
    bootError !== undefined,
    "registering a route gated on a slug outside PERMISSION_SLUGS throws at registration, not at request time",
  );
  assert(
    bootMessage.includes("no:such-permission") &&
      bootMessage.includes("PERMISSION_SLUGS"),
    `…and the error names the offending permission (got: ${bootMessage.split("\n")[0]})`,
  );

  const app = await bootstrap(BASE_PORT);
  assert(
    true,
    "…and a router whose routes all name catalog slugs builds fine — the check is about the slug, not the boot path",
  );
  console.log(`variant: ${hooks.variant}\n`);

  try {
    console.log("1. signup (session A)");
    const emailA = uniqueEmail("a");
    const signupA = await call("POST", "/auth/signup", {
      body: { email: emailA, password: "correct-horse-battery" },
    });
    assert(
      signupA.status === 201 || signupA.status === 200,
      `signup succeeds with only email + password in the body (got ${signupA.status})`,
    );
    const tokensA = signupA.body as AuthTokens;
    assert(
      !!tokensA.accessToken && !!tokensA.refreshToken,
      "signup returns access + refresh tokens",
    );

    // Asserted as an exact set rather than a list of absences, and kept exact on purpose: this is
    // the assertion that stops authorization data creeping back into the token later. There is no
    // `roles` claim and no `permissions` claim — not empty ones, none. A token that carries
    // permissions is a snapshot that keeps working after the grant behind it is gone, for as long
    // as the token lives; everything here is resolved server-side on the request that uses it.
    const claimsA = decodeJwtPayload(tokensA.accessToken);
    assert(
      Object.keys(claimsA).sort().join(",") === "exp,iat,jti,sessionId,sub",
      `the access token carries exactly the expected claims — identity and session only (got ${Object.keys(claimsA).sort().join(",")})`,
    );
    assert(
      claimsA.sub ===
        (await call("GET", "/auth/me", { token: tokensA.accessToken })).body
          .sub,
      "the token's subject is the user",
    );

    const meSignup = await call("GET", "/auth/me", {
      token: tokensA.accessToken,
    });
    assert(
      hooks.variant === "workspaces"
        ? meSignup.body.roles.length === 0
        : meSignup.body.roles.length > 0,
      `a new signup's roles come from the database, not the token (got ${JSON.stringify(meSignup.body.roles)})`,
    );

    console.log("2. login (session B, a second device for the same user)");
    const loginB = await call("POST", "/auth/login", {
      body: { identifier: emailA, password: "correct-horse-battery" },
    });
    const tokensB = loginB.body as AuthTokens;
    assert(
      loginB.status === 201 || loginB.status === 200,
      `login succeeds (got ${loginB.status})`,
    );
    assert(
      tokensB.sessionId !== tokensA.sessionId,
      "login creates a distinct session from signup's",
    );

    console.log("2b. login with wrong password is rejected");
    const badLogin = await call("POST", "/auth/login", {
      body: { identifier: emailA, password: "wrong" },
    });
    assert(
      badLogin.status === 401,
      `wrong password rejected (got ${badLogin.status})`,
    );

    console.log(
      "2c. a second signup with the same email is rejected — email is globally unique",
    );
    const duplicate = await call("POST", "/auth/signup", {
      body: { email: emailA, password: "another-password-1" },
    });
    assert(
      duplicate.status === 409,
      `duplicate email rejected (got ${duplicate.status})`,
    );

    console.log(
      "3. protected route: GET /auth/me with session A's access token",
    );
    const meA = await call("GET", "/auth/me", { token: tokensA.accessToken });
    assert(
      meA.status === 200,
      `me succeeds with a valid token (got ${meA.status})`,
    );
    assert(
      meA.body?.sessionId === tokensA.sessionId,
      "me reflects session A's identity",
    );

    console.log("3b. protected route rejects a missing token");
    const meNoAuth = await call("GET", "/auth/me");
    assert(
      meNoAuth.status === 401,
      `me rejects no token (got ${meNoAuth.status})`,
    );

    console.log("3c. the three route tiers, from the outside");
    // Tier 1: no token at all. Each of these is marked @Public() in the source; the assertion is
    // that the marker and the behaviour agree. "Reached" is asserted as "not refused for want of
    // a bearer token" — several of them answer 401 for a bad *credential*, which is the handler
    // running, not the guard refusing.
    const MISSING_TOKEN = "missing bearer token";
    const publicProbes: Array<[string, string, unknown]> = [
      [
        "POST",
        "/auth/login",
        { identifier: emailA, password: "wrong-on-purpose" },
      ],
      ["POST", "/auth/refresh", { refreshToken: "not-a-real-token" }],
      ["POST", "/auth/password/forgot", { email: uniqueEmail("nobody") }],
      ["POST", "/auth/login/2fa", { challengeToken: "nope", code: "000000" }],
      [
        "POST",
        "/auth/password/reset",
        { token: "nope", newPassword: "irrelevant-1" },
      ],
      ["GET", "/auth/oauth/google/start", undefined],
    ];
    for (const [method, path, body] of publicProbes) {
      const res = await call(method, path, { body });
      assert(
        res.body?.message !== MISSING_TOKEN,
        `${method} ${path} is reachable with no token (got ${res.status} ${res.body?.message ?? ""})`,
      );
    }

    // Tier 2: any authenticated caller, no permission. `tokensA` holds no administrative
    // permission whatsoever, and these must still answer.
    for (const path of ["/auth/me", "/auth/sessions"]) {
      const authed = await call("GET", path, { token: tokensA.accessToken });
      assert(
        authed.status === 200,
        `GET ${path} is open to any authenticated user (got ${authed.status})`,
      );
      const anon = await call("GET", path);
      assert(
        anon.status === 401,
        `…and refuses an anonymous caller (got ${anon.status})`,
      );
    }

    console.log("4. refresh session A's token");
    const refreshed = await call("POST", "/auth/refresh", {
      body: { refreshToken: tokensA.refreshToken },
    });
    assert(
      refreshed.status === 200 || refreshed.status === 201,
      `refresh succeeds (got ${refreshed.status})`,
    );
    const rotatedA = refreshed.body as {
      accessToken: string;
      refreshToken: string;
    };
    assert(
      rotatedA.refreshToken !== tokensA.refreshToken,
      "refresh issues a new refresh token (rotation)",
    );

    console.log(
      "4b. reuse of the now-dead original refresh token is detected and kills the whole session family",
    );
    const reuse = await call("POST", "/auth/refresh", {
      body: { refreshToken: tokensA.refreshToken },
    });
    assert(
      reuse.status === 401,
      `stale/reused refresh token rejected (got ${reuse.status})`,
    );

    const reuseFalloutB = await call("POST", "/auth/refresh", {
      body: { refreshToken: tokensB.refreshToken },
    });
    assert(
      reuseFalloutB.status === 401,
      `reuse detection also killed session B's refresh (got ${reuseFalloutB.status})`,
    );

    // Self-contained on purpose: the reuse detection just above kills every session belonging to
    // user A, so anything asserting on a *live* session has to bring its own.
    console.log(
      "4c. a session's lifetime: an absolute expiry that refreshing does not extend",
    );
    type LiveSession = {
      id: string;
      createdAt: string;
      expiresAt: string;
      provider?: string;
    };
    const lifetimeEmail = uniqueEmail("lifetime");
    const lifetimeFirst = await signup(lifetimeEmail, "lifetime-pw-123");
    const lifetimeSessionId = decodeJwtPayload(lifetimeFirst.accessToken)
      .sessionId as string;

    const listSessions = async (token: string) =>
      (await call("GET", "/auth/sessions", { token })).body as LiveSession[];
    const live = (await listSessions(lifetimeFirst.accessToken)).find(
      (s) => s.id === lifetimeSessionId,
    );
    assert(!!live, "the caller's own session is listed");
    assert(
      !!live &&
        new Date(live.expiresAt).getTime() > new Date(live.createdAt).getTime(),
      `a session expires strictly after it was created (got ${live?.createdAt} → ${live?.expiresAt})`,
    );
    assert(
      !live?.provider,
      "a password login records no OAuth provider on the session",
    );

    // The point of `expires_at` being written once and never rewritten: rotation issues a fresh
    // refresh token every time, so without an absolute cap a continuously active client would hold
    // one session open forever.
    const lifetimeRotated = (
      await call("POST", "/auth/refresh", {
        body: { refreshToken: lifetimeFirst.refreshToken },
      })
    ).body as AuthTokens;
    const afterRefresh = (await listSessions(lifetimeRotated.accessToken)).find(
      (s) => s.id === lifetimeSessionId,
    );
    assert(
      afterRefresh?.expiresAt === live?.expiresAt,
      `refreshing does not push the session's expiry out (got ${afterRefresh?.expiresAt})`,
    );

    // A second device for the same user, so the list can be read after the first one is revoked.
    const lifetimeSecond = (
      await call("POST", "/auth/login", {
        body: { identifier: lifetimeEmail, password: "lifetime-pw-123" },
      })
    ).body as AuthTokens;
    assert(
      (await listSessions(lifetimeSecond.accessToken)).some(
        (s) => s.id === lifetimeSessionId,
      ),
      "a second device sees the first device's session",
    );

    await call("POST", "/auth/logout", { token: lifetimeRotated.accessToken });
    // Revocation is never a delete: the row survives with `is_revoked` set, and what changes is
    // that it stops counting as active.
    assert(
      !(await listSessions(lifetimeSecond.accessToken)).some(
        (s) => s.id === lifetimeSessionId,
      ),
      "a revoked session stops being listed as active",
    );

    console.log(
      "5. logout-one-device: revoke session A specifically using its (rotated) access token",
    );
    const logoutA = await call("POST", "/auth/logout", {
      token: rotatedA.accessToken,
    });
    assert(
      logoutA.status === 200 || logoutA.status === 201,
      `logout succeeds (got ${logoutA.status})`,
    );

    const meAAfterLogout = await call("GET", "/auth/me", {
      token: rotatedA.accessToken,
    });
    assert(
      meAAfterLogout.status === 401,
      `session A's access token is denylisted after logout (got ${meAAfterLogout.status})`,
    );

    console.log("6. block/unblock (admin-scoped)");
    const adminEmail = uniqueEmail("admin");
    const adminSignup = await signup(adminEmail, "admin-pw-123");
    const adminUserId = (
      await call("GET", "/auth/me", { token: adminSignup.accessToken })
    ).body.sub as string;
    const admin = await hooks.makeAdmin(ctx, {
      userId: adminUserId,
      email: adminEmail,
      password: "admin-pw-123",
      tokens: adminSignup,
    });

    const victimEmail = uniqueEmail("victim");
    const victimTokens = await signup(victimEmail, "victim-pw-123");
    const victimId = (
      await call("GET", "/auth/me", { token: victimTokens.accessToken })
    ).body.sub as string;
    await hooks.admitUser(ctx, admin, { userId: victimId, email: victimEmail });

    console.log("6a. a non-admin cannot block anyone");
    const forbiddenBlock = await call(
      "POST",
      `/admin/users/${victimId}/block`,
      { token: victimTokens.accessToken, workspaceId: admin.workspaceId },
    );
    assert(
      forbiddenBlock.status === 403,
      `non-admin block attempt rejected (got ${forbiddenBlock.status})`,
    );

    console.log("6b. an admin cannot block themselves");
    const selfBlock = await call("POST", `/admin/users/${adminUserId}/block`, {
      token: await admin.freshToken(),
      workspaceId: admin.workspaceId,
    });
    assert(
      selfBlock.status === 403,
      `admin self-block rejected (got ${selfBlock.status})`,
    );

    console.log("6b-ii. an admin cannot revoke their own role");
    // Self-revoking `admin` strips the permission that authorised the call. In a workspace
    // there is no way back in afterwards, so the route refuses it the same way self-block does.
    const selfRevoke = await call(
      "POST",
      `/admin/users/${adminUserId}/roles/admin/revoke`,
      { token: await admin.freshToken(), workspaceId: admin.workspaceId },
    );
    assert(
      selfRevoke.status === 403,
      `admin self-role-revoke rejected (got ${selfRevoke.status})`,
    );
    const stillAdmin = await call("GET", "/admin/users", {
      token: await admin.freshToken(),
      workspaceId: admin.workspaceId,
    });
    assert(
      stillAdmin.status === 200,
      `admin still authorised after the refused self-revoke (got ${stillAdmin.status})`,
    );

    console.log("6c. admin blocks the victim");
    const block = await call("POST", `/admin/users/${victimId}/block`, {
      token: await admin.freshToken(),
      workspaceId: admin.workspaceId,
    });
    assert(
      block.status === 200 || block.status === 201,
      `block succeeds (got ${block.status})`,
    );

    console.log(
      "7. get-rejected-after-block: victim cannot log in or refresh anymore",
    );
    const victimLoginAfterBlock = await call("POST", "/auth/login", {
      body: { identifier: victimEmail, password: "victim-pw-123" },
    });
    assert(
      victimLoginAfterBlock.status === 401,
      `blocked user cannot log in (got ${victimLoginAfterBlock.status})`,
    );

    const victimRefreshAfterBlock = await call("POST", "/auth/refresh", {
      body: { refreshToken: victimTokens.refreshToken },
    });
    assert(
      victimRefreshAfterBlock.status === 401,
      `blocked user's refresh token rejected (got ${victimRefreshAfterBlock.status})`,
    );

    console.log("7b. unblock restores access");
    const unblock = await call("POST", `/admin/users/${victimId}/unblock`, {
      token: await admin.freshToken(),
      workspaceId: admin.workspaceId,
    });
    assert(
      unblock.status === 200 || unblock.status === 201,
      `unblock succeeds (got ${unblock.status})`,
    );
    const victimLoginAfterUnblock = await call("POST", "/auth/login", {
      body: { identifier: victimEmail, password: "victim-pw-123" },
    });
    assert(
      victimLoginAfterUnblock.status === 200 ||
        victimLoginAfterUnblock.status === 201,
      `unblocked user can log in again (got ${victimLoginAfterUnblock.status})`,
    );

    console.log(
      "7c. deactivate is a distinct toggle from block — both independently deny login, neither implies the other",
    );
    const deactivate = await call(
      "POST",
      `/admin/users/${victimId}/deactivate`,
      { token: await admin.freshToken(), workspaceId: admin.workspaceId },
    );
    assert(
      deactivate.status === 200 || deactivate.status === 201,
      `deactivate succeeds (got ${deactivate.status})`,
    );

    const victimLoginAfterDeactivate = await call("POST", "/auth/login", {
      body: { identifier: victimEmail, password: "victim-pw-123" },
    });
    assert(
      victimLoginAfterDeactivate.status === 401,
      `deactivated (but not blocked) user cannot log in either (got ${victimLoginAfterDeactivate.status})`,
    );

    const usersAfterDeactivate = await call("GET", "/admin/users", {
      token: await admin.freshToken(),
      workspaceId: admin.workspaceId,
    });
    const victimAfterDeactivate = (
      usersAfterDeactivate.body as {
        items: Array<{
          id?: string;
          userId?: string;
          blocked: boolean;
          isActive: boolean;
        }>;
      }
    ).items.find((u) => (u.id ?? u.userId) === victimId);
    assert(
      victimAfterDeactivate?.isActive === false,
      "…and the user list reflects isActive=false",
    );
    assert(
      victimAfterDeactivate?.blocked === false,
      "…while blocked stays false — deactivating never sets it, they are independent flags",
    );

    const reactivate = await call("POST", `/admin/users/${victimId}/activate`, {
      token: await admin.freshToken(),
      workspaceId: admin.workspaceId,
    });
    assert(
      reactivate.status === 200 || reactivate.status === 201,
      `activate succeeds (got ${reactivate.status})`,
    );
    const victimLoginAfterReactivate = await call("POST", "/auth/login", {
      body: { identifier: victimEmail, password: "victim-pw-123" },
    });
    assert(
      victimLoginAfterReactivate.status === 200 ||
        victimLoginAfterReactivate.status === 201,
      `reactivated user can log in again (got ${victimLoginAfterReactivate.status})`,
    );

    console.log(
      "8. two-factor: enroll -> confirm -> login now requires 2FA -> complete challenge -> logout",
    );
    const tfaEmail = uniqueEmail("tfa");
    const tfaTokens = await signup(tfaEmail, "tfa-pw-12345");

    const enroll = await call("POST", "/auth/2fa/enroll", {
      token: tfaTokens.accessToken,
    });
    assert(
      enroll.status === 200 || enroll.status === 201,
      `2fa enroll succeeds (got ${enroll.status})`,
    );
    const { secret } = enroll.body as {
      secret: string;
      provisioningUri: string;
    };

    const confirm = await call("POST", "/auth/2fa/confirm", {
      token: tfaTokens.accessToken,
      body: { code: generateTotpCode(secret) },
    });
    assert(
      confirm.status === 200 || confirm.status === 201,
      `2fa confirm succeeds (got ${confirm.status})`,
    );
    const { backupCodes } = confirm.body as { backupCodes: string[] };
    assert(
      backupCodes.length === 10,
      `2fa confirm returns backup codes (got ${backupCodes.length})`,
    );

    const tfaLogin = await call("POST", "/auth/login", {
      body: { identifier: tfaEmail, password: "tfa-pw-12345" },
    });
    const tfaChallenge = tfaLogin.body as {
      twoFactorRequired: true;
      challengeToken: string;
    };
    assert(
      tfaChallenge.twoFactorRequired === true,
      `login now returns a 2fa challenge instead of tokens (got status ${tfaLogin.status})`,
    );

    const tfaComplete = await call("POST", "/auth/login/2fa", {
      body: {
        challengeToken: tfaChallenge.challengeToken,
        code: generateTotpCode(secret),
      },
    });
    assert(
      tfaComplete.status === 200 || tfaComplete.status === 201,
      `2fa challenge completes login (got ${tfaComplete.status})`,
    );
    const tfaSessionTokens = tfaComplete.body as { accessToken: string };

    const tfaBadChallenge = await call("POST", "/auth/login/2fa", {
      body: { challengeToken: tfaChallenge.challengeToken, code: "000000" },
    });
    assert(
      tfaBadChallenge.status === 401,
      `wrong 2fa code rejected (got ${tfaBadChallenge.status})`,
    );

    const tfaLogout = await call("POST", "/auth/logout", {
      token: tfaSessionTokens.accessToken,
    });
    assert(
      tfaLogout.status === 200 || tfaLogout.status === 201,
      `logout after 2fa login succeeds (got ${tfaLogout.status})`,
    );

    console.log(
      "9. forgot/reset password -> old password stops working -> old sessions revoked",
    );
    const resetEmail = uniqueEmail("reset");
    const resetTokens = await signup(resetEmail, "original-password-1");

    const forgot = await call("POST", "/auth/password/forgot", {
      body: { email: resetEmail },
    });
    assert(
      forgot.status === 200 || forgot.status === 201,
      `forgot-password always reports success (got ${forgot.status})`,
    );
    const rawResetToken = capturedResetTokens.get(resetEmail);
    assert(
      !!rawResetToken,
      "the reset token reached the sendPasswordResetEmail hook",
    );

    const badReset = await call("POST", "/auth/password/reset", {
      body: { token: "not-a-real-token", newPassword: "irrelevant-1" },
    });
    assert(
      badReset.status === 401,
      `reset with an invalid token is rejected (got ${badReset.status})`,
    );

    const reset = await call("POST", "/auth/password/reset", {
      body: { token: rawResetToken, newPassword: "new-password-2" },
    });
    assert(
      reset.status === 200 || reset.status === 201,
      `reset with a valid token succeeds (got ${reset.status})`,
    );

    // Session revocation bumps sessionVersion/revokedAt, which invalidates future *refreshes*
    // immediately; it does not retroactively invalidate an already-issued, still-unexpired
    // access token (same "denylist is for instant per-token kill, sessionVersion is for
    // refresh-time revocation" split that /auth/logout relies on elsewhere in this file).
    const refreshAfterReset = await call("POST", "/auth/refresh", {
      body: { refreshToken: resetTokens.refreshToken },
    });
    assert(
      refreshAfterReset.status === 401,
      `pre-reset session's refresh token is invalid after password reset (got ${refreshAfterReset.status})`,
    );

    const loginWithOldPassword = await call("POST", "/auth/login", {
      body: { identifier: resetEmail, password: "original-password-1" },
    });
    assert(
      loginWithOldPassword.status === 401,
      `old password no longer works (got ${loginWithOldPassword.status})`,
    );

    const loginWithNewPassword = await call("POST", "/auth/login", {
      body: { identifier: resetEmail, password: "new-password-2" },
    });
    assert(
      loginWithNewPassword.status === 200 ||
        loginWithNewPassword.status === 201,
      `new password works (got ${loginWithNewPassword.status})`,
    );

    console.log(
      "10. RBAC: create role, attach permission, assign to user, permission takes effect",
    );
    const rbacEmail = uniqueEmail("rbac");
    const rbacTokens = await signup(rbacEmail, "rbac-pw-12345");
    const rbacUserId = (
      await call("GET", "/auth/me", { token: rbacTokens.accessToken })
    ).body.sub as string;
    await hooks.admitUser(ctx, admin, { userId: rbacUserId, email: rbacEmail });

    const createRole = await call("POST", "/roles", {
      token: await admin.freshToken(),
      workspaceId: admin.workspaceId,
      body: { slug: ROLE_SLUG, displayName: "Billing manager" },
    });
    assert(
      createRole.status === 200 || createRole.status === 201,
      `admin can create a role (got ${createRole.status})`,
    );
    const role = createRole.body as {
      id: string;
      slug: string;
      displayName: string;
    };
    assert(
      role.slug === ROLE_SLUG && role.displayName === "Billing manager",
      "a role carries a stable slug and a separate human label",
    );

    const attachPermission = await call(
      "POST",
      `/roles/${role.id}/permissions`,
      {
        token: await admin.freshToken(),
        workspaceId: admin.workspaceId,
        body: { permission: "billing:manage" },
      },
    );
    assert(
      attachPermission.status === 200 || attachPermission.status === 201,
      `admin can attach a permission to a role (got ${attachPermission.status})`,
    );

    const assignRole = await call("POST", `/admin/users/${rbacUserId}/roles`, {
      token: await admin.freshToken(),
      workspaceId: admin.workspaceId,
      body: { role: ROLE_SLUG },
    });
    assert(
      assignRole.status === 200 || assignRole.status === 201,
      `admin can assign a role to a user (got ${assignRole.status})`,
    );

    const rbacDirect = await call(
      "POST",
      `/admin/users/${rbacUserId}/permissions`,
      {
        token: await admin.freshToken(),
        workspaceId: admin.workspaceId,
        body: { permission: "reports:export" },
      },
    );
    assert(
      rbacDirect.status === 200 || rbacDirect.status === 201,
      `admin can grant a permission directly (got ${rbacDirect.status})`,
    );

    // No re-login. Nothing about authorization lives in the token in either variant, so both
    // grants are in effect on the caller's very next request, on the token they already hold.
    const rbacMe = await call("GET", "/auth/me", {
      token: rbacTokens.accessToken,
      workspaceId: admin.workspaceId,
    });
    assert(
      (rbacMe.body?.permissions ?? []).includes("billing:manage"),
      "the assigned role's permission is in effect on the user's existing token",
    );
    assert(
      (rbacMe.body?.permissions ?? []).includes("reports:export"),
      "a direct grant is unioned with the role-derived permissions",
    );
    assert(
      (rbacMe.body?.roles ?? []).includes(ROLE_SLUG),
      "…and /auth/me reports the role by slug",
    );

    console.log(
      "11. admin audit log: the role_assigned event from step 10 is readable back",
    );
    const auditList = await call(
      "GET",
      `/audit-log?userId=${rbacUserId}&action=role_assigned`,
      {
        token: await admin.freshToken(),
        workspaceId: admin.workspaceId,
      },
    );
    assert(
      auditList.status === 200,
      `admin can list the audit log (got ${auditList.status})`,
    );
    const auditEntries = (
      auditList.body as {
        items: Array<{ action: string; name: string; userId: string | null }>;
      }
    ).items;
    assert(
      auditEntries.some(
        (e) => e.action === "role_assigned" && e.userId === rbacUserId,
      ),
      "the role_assigned event for this user shows up in the audit log",
    );
    assert(
      auditEntries.every((e) => e.name === "Role assigned"),
      "audit entries carry a human-readable name alongside the action",
    );

    const auditForbidden = await call("GET", "/audit-log", {
      token: rbacTokens.accessToken,
      workspaceId: admin.workspaceId,
    });
    assert(
      auditForbidden.status === 403,
      `non-admin cannot list the audit log (got ${auditForbidden.status})`,
    );

    console.log(
      "11b. user/role CRUD: fetch, edit, and soft-delete both — on disposable rows, so the shared probe target/role are untouched",
    );
    const crudUserEmail = uniqueEmail("crud-user");
    const crudUserTokens = await signup(crudUserEmail, "crud-user-pw-12345");
    const crudUserId = (
      await call("GET", "/auth/me", { token: crudUserTokens.accessToken })
    ).body.sub as string;
    await hooks.admitUser(ctx, admin, {
      userId: crudUserId,
      email: crudUserEmail,
    });

    const getUser = await call("GET", `/admin/users/${crudUserId}`, {
      token: await admin.freshToken(),
      workspaceId: admin.workspaceId,
    });
    assert(
      getUser.status === 200,
      `admin can fetch a single user (got ${getUser.status})`,
    );
    assert(
      (getUser.body as { email: string }).email === crudUserEmail,
      "…and it's the right one",
    );

    const updateUser = await call("PATCH", `/admin/users/${crudUserId}`, {
      token: await admin.freshToken(),
      workspaceId: admin.workspaceId,
      body: { displayName: "CRUD Test User" },
    });
    assert(
      updateUser.status === 200,
      `admin can edit a user's profile (got ${updateUser.status})`,
    );
    assert(
      (updateUser.body as { displayName: string | null }).displayName ===
        "CRUD Test User",
      "…and the edit is reflected in the response",
    );

    const crudRoleSlug = `crud-role-${RUN_ID}`;
    const createCrudRole = await call("POST", "/roles", {
      token: await admin.freshToken(),
      workspaceId: admin.workspaceId,
      body: { slug: crudRoleSlug },
    });
    assert(
      createCrudRole.status === 201,
      `admin can create a disposable role for the delete test (got ${createCrudRole.status})`,
    );
    const crudRoleId = (createCrudRole.body as { id: string }).id;

    const updateRole = await call("PATCH", `/roles/${crudRoleId}`, {
      token: await admin.freshToken(),
      workspaceId: admin.workspaceId,
      body: { displayName: "CRUD Test Role" },
    });
    assert(
      updateRole.status === 200,
      `admin can edit a role (got ${updateRole.status})`,
    );
    assert(
      (updateRole.body as { displayName: string }).displayName ===
        "CRUD Test Role",
      "…and the edit is reflected in the response",
    );

    const assignCrudRole = await call(
      "POST",
      `/admin/users/${crudUserId}/roles`,
      {
        token: await admin.freshToken(),
        workspaceId: admin.workspaceId,
        body: { role: crudRoleSlug },
      },
    );
    assert(
      assignCrudRole.status === 201,
      `the disposable role can be assigned before it's deleted (got ${assignCrudRole.status})`,
    );

    const deleteRole = await call("DELETE", `/roles/${crudRoleId}`, {
      token: await admin.freshToken(),
      workspaceId: admin.workspaceId,
      body: { reason: "prove-cycle cleanup" },
    });
    assert(
      deleteRole.status === 200,
      `admin can delete a role (got ${deleteRole.status})`,
    );

    const rolesAfterDelete = await call("GET", "/roles", {
      token: await admin.freshToken(),
      workspaceId: admin.workspaceId,
    });
    assert(
      !(rolesAfterDelete.body as { roles: Array<{ id: string }> }).roles.some(
        (r) => r.id === crudRoleId,
      ),
      "a deleted role no longer appears in the role list",
    );

    const meAfterRoleDelete = await call("GET", "/auth/me", {
      token: crudUserTokens.accessToken,
      workspaceId: admin.workspaceId,
    });
    assert(
      !(meAfterRoleDelete.body?.roles ?? []).includes(crudRoleSlug),
      "…and a member who held it no longer resolves it, with no re-login",
    );

    const deleteUser = await call("DELETE", `/admin/users/${crudUserId}`, {
      token: await admin.freshToken(),
      workspaceId: admin.workspaceId,
    });
    assert(
      deleteUser.status === 200,
      `admin can delete a user (got ${deleteUser.status})`,
    );

    const usersAfterDelete = await call("GET", "/admin/users", {
      token: await admin.freshToken(),
      workspaceId: admin.workspaceId,
    });
    assert(
      !(usersAfterDelete.body as { items: Array<{ id: string }> }).items.some(
        (u) => u.id === crudUserId,
      ),
      "a deleted user no longer appears in the user list",
    );

    const getDeletedUser = await call("GET", `/admin/users/${crudUserId}`, {
      token: await admin.freshToken(),
      workspaceId: admin.workspaceId,
    });
    assert(
      getDeletedUser.status === 404,
      `…and fetching them directly by id now 404s (got ${getDeletedUser.status})`,
    );

    const loginAsDeletedUser = await call("POST", "/auth/login", {
      body: { identifier: crudUserEmail, password: "crud-user-pw-12345" },
    });
    assert(
      loginAsDeletedUser.status === 401,
      `…and they can no longer log in (got ${loginAsDeletedUser.status})`,
    );

    const selfDeleteAttempt = await call(
      "DELETE",
      `/admin/users/${(await call("GET", "/auth/me", { token: await admin.freshToken() })).body.sub}`,
      {
        token: await admin.freshToken(),
        workspaceId: admin.workspaceId,
      },
    );
    assert(
      selfDeleteAttempt.status === 403,
      `an admin cannot delete their own account (got ${selfDeleteAttempt.status})`,
    );

    console.log(
      "11c. login accepts a username or a phone number in place of the email, same password",
    );
    const identEmail = uniqueEmail("ident");
    const identTokens = await signup(identEmail, "ident-user-pw-12345");
    const identUserId = (
      await call("GET", "/auth/me", { token: identTokens.accessToken })
    ).body.sub as string;
    await hooks.admitUser(ctx, admin, {
      userId: identUserId,
      email: identEmail,
    });

    const identUsername = `ident-user-${RUN_ID}`;
    const identPhone = `+1-555-${RUN_ID}`;
    const setIdentFields = await call("PATCH", `/admin/users/${identUserId}`, {
      token: await admin.freshToken(),
      workspaceId: admin.workspaceId,
      body: { username: identUsername, phone: identPhone },
    });
    assert(
      setIdentFields.status === 200,
      `admin can set a user's username and phone (got ${setIdentFields.status})`,
    );

    const loginByUsername = await call("POST", "/auth/login", {
      body: { identifier: identUsername, password: "ident-user-pw-12345" },
    });
    assert(
      loginByUsername.status === 201 || loginByUsername.status === 200,
      `login by username succeeds (got ${loginByUsername.status})`,
    );
    assert(
      (loginByUsername.body as AuthTokens).accessToken !== undefined,
      "…and returns a real access token",
    );

    const loginByPhone = await call("POST", "/auth/login", {
      body: { identifier: identPhone, password: "ident-user-pw-12345" },
    });
    assert(
      loginByPhone.status === 201 || loginByPhone.status === 200,
      `login by phone succeeds (got ${loginByPhone.status})`,
    );

    const loginByEmailStill = await call("POST", "/auth/login", {
      body: { identifier: identEmail, password: "ident-user-pw-12345" },
    });
    assert(
      loginByEmailStill.status === 201 || loginByEmailStill.status === 200,
      `login by email still works once username/phone are also set (got ${loginByEmailStill.status})`,
    );

    const loginByUsernameWrongPassword = await call("POST", "/auth/login", {
      body: { identifier: identUsername, password: "wrong" },
    });
    assert(
      loginByUsernameWrongPassword.status === 401,
      `login by username with the wrong password is still rejected (got ${loginByUsernameWrongPassword.status})`,
    );

    const loginByUnknownIdentifier = await call("POST", "/auth/login", {
      body: { identifier: `nobody-${RUN_ID}`, password: "whatever" },
    });
    assert(
      loginByUnknownIdentifier.status === 401,
      `an identifier matching no email/username/phone is rejected the same way (got ${loginByUnknownIdentifier.status})`,
    );

    console.log(
      "11d. change password: wrong current password rejected, right one rotates it and revokes every other session but this one",
    );
    const otherDeviceLogin = await call("POST", "/auth/login", {
      body: { identifier: identEmail, password: "ident-user-pw-12345" },
    });
    const otherDeviceTokens = otherDeviceLogin.body as AuthTokens;
    assert(
      otherDeviceTokens.sessionId !== identTokens.sessionId,
      "a second session for the identifier-test user exists, distinct from the signup session",
    );

    const wrongCurrentPassword = await call("POST", "/auth/password/change", {
      token: identTokens.accessToken,
      body: {
        currentPassword: "not-the-real-password",
        newPassword: "ident-new-pw-67890",
      },
    });
    assert(
      wrongCurrentPassword.status === 401,
      `changing the password with the wrong current password is rejected (got ${wrongCurrentPassword.status})`,
    );

    const changePassword = await call("POST", "/auth/password/change", {
      token: identTokens.accessToken,
      body: {
        currentPassword: "ident-user-pw-12345",
        newPassword: "ident-new-pw-67890",
      },
    });
    assert(
      changePassword.status === 201 || changePassword.status === 200,
      `change-password succeeds with the right current password (got ${changePassword.status})`,
    );

    const oldPasswordNowFails = await call("POST", "/auth/login", {
      body: { identifier: identEmail, password: "ident-user-pw-12345" },
    });
    assert(
      oldPasswordNowFails.status === 401,
      `the old password no longer works (got ${oldPasswordNowFails.status})`,
    );

    const newPasswordWorks = await call("POST", "/auth/login", {
      body: { identifier: identEmail, password: "ident-new-pw-67890" },
    });
    assert(
      newPasswordWorks.status === 201 || newPasswordWorks.status === 200,
      `the new password works (got ${newPasswordWorks.status})`,
    );

    const callingSessionSurvives = await call("GET", "/auth/me", {
      token: identTokens.accessToken,
    });
    assert(
      callingSessionSurvives.status === 200,
      `the session that called change-password is left alone, not logged out by its own request (got ${callingSessionSurvives.status})`,
    );

    // Revocation lands on the session row (checked at refresh time), not an instant denylist of
    // the still-live access token — same split `logout()` vs. `logoutOthers()` relies on elsewhere.
    const otherSessionRefreshRevoked = await call("POST", "/auth/refresh", {
      body: { refreshToken: otherDeviceTokens.refreshToken },
    });
    assert(
      otherSessionRefreshRevoked.status === 401,
      `…while the other, unrelated session for the same user can no longer refresh (got ${otherSessionRefreshRevoked.status})`,
    );

    console.log(
      "11d-2. self-service profile update: no admin permission required, own row only",
    );
    const selfProfileUpdate = await call("PATCH", "/auth/me", {
      token: identTokens.accessToken,
      body: {
        displayName: "Self Updated",
        photo: "data:image/png;base64,AAAA",
      },
    });
    assert(
      selfProfileUpdate.status === 200,
      `a user can update their own profile with no admin permission (got ${selfProfileUpdate.status})`,
    );
    const selfProfile = selfProfileUpdate.body as {
      id: string;
      displayName: string | null;
      photo: string | null;
    };
    assert(
      selfProfile.displayName === "Self Updated",
      "…and the response reflects the new value",
    );
    assert(
      selfProfile.photo === "data:image/png;base64,AAAA",
      "…including the photo field",
    );

    console.log(
      "11d-3. profile uniqueness: shared names are fine, a taken phone is a 409 (not a 500)",
    );
    const nameTwinTokens = await signup(
      uniqueEmail("name-twin"),
      "lifetime-pw-123",
    );
    const sharedName = {
      firstName: `Ada-${RUN_ID}`,
      lastName: `Lovelace-${RUN_ID}`,
    };
    const firstNameOwner = await call("PATCH", "/auth/me", {
      token: identTokens.accessToken,
      body: sharedName,
    });
    const secondNameOwner = await call("PATCH", "/auth/me", {
      token: nameTwinTokens.accessToken,
      body: sharedName,
    });
    assert(
      firstNameOwner.status === 200 && secondNameOwner.status === 200,
      `two users can share a first and last name (got ${firstNameOwner.status}, ${secondNameOwner.status})`,
    );
    const takenPhone = `+1-555-${RUN_ID}`;
    const phoneOwner = await call("PATCH", "/auth/me", {
      token: identTokens.accessToken,
      body: { phone: takenPhone },
    });
    const phoneClash = await call("PATCH", "/auth/me", {
      token: nameTwinTokens.accessToken,
      body: { phone: takenPhone },
    });
    assert(
      phoneOwner.status === 200 && phoneClash.status === 409,
      `taking another user's phone is a 409 conflict, not a 500 (got ${phoneOwner.status}, ${phoneClash.status})`,
    );
    assert(
      phoneClash.body?.message === "phone is already in use",
      `…and the message names the field (got ${JSON.stringify(phoneClash.body)})`,
    );

    const selfProfileRejectsNoToken = await call("PATCH", "/auth/me", {
      body: { displayName: "No Auth" },
    });
    assert(
      selfProfileRejectsNoToken.status === 401,
      `updating a profile without a token is rejected (got ${selfProfileRejectsNoToken.status})`,
    );

    const meAfterProfileUpdate = await call("GET", "/auth/me", {
      token: identTokens.accessToken,
    });
    assert(
      (meAfterProfileUpdate.body as { displayName: string | null })
        .displayName === "Self Updated",
      `…and GET /auth/me reflects the same update, no separate refetch path (got ${JSON.stringify(meAfterProfileUpdate.body)})`,
    );

    console.log(
      "11e. admin creates a user directly — no signup, usable immediately",
    );
    const createdEmail = uniqueEmail("admin-created");
    const createUser = await call("POST", "/admin/users", {
      token: await admin.freshToken(),
      workspaceId: admin.workspaceId,
      body: {
        email: createdEmail,
        password: "admin-created-pw-12345",
        displayName: "Admin Created",
      },
    });
    assert(
      createUser.status === 201 || createUser.status === 200,
      `admin can create a user directly (got ${createUser.status})`,
    );
    const createdUser = createUser.body as {
      id: string;
      email: string;
      displayName: string | null;
      roles: string[];
    };
    assert(
      createdUser.email === createdEmail,
      "…and the response is the new user, not something stale",
    );
    assert(
      createdUser.displayName === "Admin Created",
      "…with the profile fields given at creation time",
    );

    const createdUserCanLogin = await call("POST", "/auth/login", {
      body: { identifier: createdEmail, password: "admin-created-pw-12345" },
    });
    assert(
      createdUserCanLogin.status === 201 || createdUserCanLogin.status === 200,
      `the account is usable immediately, no separate activation step (got ${createdUserCanLogin.status})`,
    );

    const duplicateCreate = await call("POST", "/admin/users", {
      token: await admin.freshToken(),
      workspaceId: admin.workspaceId,
      body: { email: createdEmail, password: "another-pw-12345" },
    });
    assert(
      duplicateCreate.status === 409,
      `creating a second account with the same email is rejected (got ${duplicateCreate.status})`,
    );

    const createWithRole = await call("POST", "/admin/users", {
      token: await admin.freshToken(),
      workspaceId: admin.workspaceId,
      body: {
        email: uniqueEmail("admin-created-role"),
        password: "admin-created-pw-67890",
        roles: [ROLE_SLUG],
      },
    });
    assert(
      createWithRole.status === 201 || createWithRole.status === 200,
      `admin can name specific roles at creation time (got ${createWithRole.status})`,
    );
    assert(
      (createWithRole.body as { roles: string[] }).roles.includes(ROLE_SLUG),
      `…and the named role — not the default — is what the new account actually holds (got ${JSON.stringify((createWithRole.body as { roles: string[] }).roles)})`,
    );

    console.log(
      "12. permission enforcement: each admin route is opened by its own permission and by nothing else",
    );
    // The point of this section is that permissions — not roles — are the boundary. Every probe
    // user below holds a real role that carries nothing, so "has a role" can never be mistaken
    // for "has authority", and the only thing that ever changes between them is which single
    // permission was granted directly.
    const NO_PERMS_ROLE = `probe-no-perms-${RUN_ID}`;
    const ASSIGNABLE_ROLE = `probe-assignable-${RUN_ID}`;

    const noPermsRole = await call("POST", "/roles", {
      token: await admin.freshToken(),
      workspaceId: admin.workspaceId,
      body: { slug: NO_PERMS_ROLE },
    });
    const assignableRole = await call("POST", "/roles", {
      token: await admin.freshToken(),
      workspaceId: admin.workspaceId,
      body: { slug: ASSIGNABLE_ROLE },
    });
    assert(
      noPermsRole.status === 201 && assignableRole.status === 201,
      "the probe roles are created (neither carries any permission)",
    );

    const probeTargetEmail = uniqueEmail("probe-target");
    const probeTargetTokens = await signup(
      probeTargetEmail,
      "probe-target-pw-1",
    );
    const probeTargetId = (
      await call("GET", "/auth/me", { token: probeTargetTokens.accessToken })
    ).body.sub as string;
    await hooks.admitUser(ctx, admin, {
      userId: probeTargetId,
      email: probeTargetEmail,
    });

    const probesFor = (seq: number) =>
      adminRouteProbes({
        targetUserId: probeTargetId,
        roleId: (assignableRole.body as { id: string }).id,
        roleSlug: ASSIGNABLE_ROLE,
        newRoleSlug: `${ASSIGNABLE_ROLE}-new-${seq}`,
        newPermissionSlug: `probe:defined-${RUN_ID}-${seq}`,
      });

    /** Runs every admin route as one caller and reports what each answered. Leaves the target user as it found it. */
    async function runProbes(token: string, seq: number) {
      const results: Array<{ probe: RouteProbe; status: number }> = [];
      for (const probe of probesFor(seq)) {
        const res = await call(probe.method, probe.path, {
          token,
          workspaceId: admin.workspaceId,
          body: probe.body,
        });
        results.push({ probe, status: res.status });
      }
      return results;
    }

    const succeeded = (status: number) => status === 200 || status === 201;
    const refused = (rs: Array<{ probe: { label: string }; status: number }>) =>
      rs
        .filter((r) => r.status !== 403)
        .map((r) => `${r.probe.label} -> ${r.status}`)
        .join(", ");

    /** A user with the empty role, plus exactly the permissions named — granted directly, never through a role. */
    async function probeUser(label: string, grants: string[]) {
      const email = uniqueEmail(label);
      const password = `${label}-pw-12345`;
      const tokens = await signup(email, password);
      const userId = (
        await call("GET", "/auth/me", { token: tokens.accessToken })
      ).body.sub as string;
      await hooks.admitUser(ctx, admin, { userId, email });
      await call("POST", `/admin/users/${userId}/roles`, {
        token: await admin.freshToken(),
        workspaceId: admin.workspaceId,
        body: { role: NO_PERMS_ROLE },
      });
      for (const permission of grants) {
        await call("POST", `/admin/users/${userId}/permissions`, {
          token: await admin.freshToken(),
          workspaceId: admin.workspaceId,
          body: { permission },
        });
      }
      // No re-login: authorization is read from the database on every request in both variants,
      // so the token this user already holds sees the grants immediately.
      return { email, password, userId, token: tokens.accessToken };
    }

    console.log(
      "12a. holding a role that carries no permissions opens nothing",
    );
    const bare = await probeUser("probe-bare", []);
    const bareMe = await call("GET", "/auth/me", {
      token: bare.token,
      workspaceId: admin.workspaceId,
    });
    assert(
      bareMe.body?.roles?.includes(NO_PERMS_ROLE),
      "the probe user really does hold a role — it just carries no permissions",
    );
    const bareResults = await runProbes(bare.token, 0);
    assert(
      bareResults.every((r) => r.status === 403),
      `all ${bareResults.length} admin routes refuse them (offenders: ${refused(bareResults) || "none"})`,
    );

    console.log(
      "12b. one directly-granted permission opens exactly the routes it names, and no others",
    );
    const permissions = [...new Set(probesFor(0).map((p) => p.permission))];
    let probeSeq = 1;
    /** Kept for 12d: one caller holding exactly one permission is the sharpest case for the equivalence check. */
    let singleGrantUser: { token: string; permission: string } | undefined;
    for (const permission of permissions) {
      const holder = await probeUser(
        `probe-${permission.replace(/[^a-z]/g, "")}`,
        [permission],
      );
      if (permission === "users:read")
        singleGrantUser = { token: holder.token, permission };
      const results = await runProbes(holder.token, probeSeq++);
      for (const r of results.filter(
        (r) => r.probe.permission === permission,
      )) {
        assert(
          succeeded(r.status),
          `"${permission}" opens ${r.probe.label} (got ${r.status})`,
        );
      }
      const others = results.filter((r) => r.probe.permission !== permission);
      assert(
        others.every((r) => r.status === 403),
        `…and "${permission}" opens nothing else (offenders: ${refused(others) || "none"})`,
      );
    }

    console.log(
      "12c. revoking a permission takes it away again — on the same token, with no re-login",
    );
    const revokee = await probeUser("probe-revokee", ["users:read"]);
    const beforeRevoke = await call("GET", "/admin/users", {
      token: revokee.token,
      workspaceId: admin.workspaceId,
    });
    assert(
      beforeRevoke.status === 200,
      `the grant is in effect to begin with (got ${beforeRevoke.status})`,
    );

    const revoked = await call(
      "POST",
      `/admin/users/${revokee.userId}/permissions/${encodeURIComponent("users:read")}/revoke`,
      {
        token: await admin.freshToken(),
        workspaceId: admin.workspaceId,
      },
    );
    assert(
      succeeded(revoked.status),
      `admin can revoke a direct grant (got ${revoked.status})`,
    );

    const afterRevokeCall = await call("GET", "/admin/users", {
      token: revokee.token,
      workspaceId: admin.workspaceId,
    });
    assert(
      afterRevokeCall.status === 403,
      `and the route closes again on the very next request (got ${afterRevokeCall.status})`,
    );

    console.log(
      "12d. front/back equivalence: an ability rebuilt from /auth/me answers exactly as the server enforces",
    );
    // This is the property the whole flat-slug model exists for. The client is given permission
    // slugs and builds its ability with the *same* `defineAbilitiesFor` the server's guard used.
    // Comparing predicted allow/deny against the real HTTP status for every gated route is what
    // makes "the console cannot offer a button the API refuses" a fact rather than a hope.
    async function proveEquivalence(label: string, token: string) {
      const me = await call("GET", "/auth/me", {
        token,
        workspaceId: admin.workspaceId,
      });
      const ability = defineAbilitiesFor(
        (me.body?.permissions ?? []) as string[],
      );
      const results = await runProbes(token, probeSeq++);

      const disagreements = results
        .map((r) => ({
          label: r.probe.label,
          predicted: ability.can(r.probe.permission, ABILITY_SUBJECT),
          served: r.status !== 403,
        }))
        .filter((r) => r.predicted !== r.served);
      assert(
        disagreements.length === 0,
        `${label}: all ${results.length} gated routes answer exactly as the client-side ability predicts` +
          (disagreements.length
            ? ` (disagreements: ${disagreements.map((d) => `${d.label} predicted=${d.predicted}`).join(", ")})`
            : ""),
      );
      return new Set(
        results.filter((r) => r.status !== 403).map((r) => r.probe.label),
      );
    }

    const adminAllows = await proveEquivalence(
      "admin",
      await admin.freshToken(),
    );
    const bareAllows = await proveEquivalence(
      "a member holding a role with no permissions",
      bare.token,
    );
    const grantAllows = await proveEquivalence(
      `a user holding only "${singleGrantUser!.permission}"`,
      singleGrantUser!.token,
    );
    assert(
      adminAllows.size > grantAllows.size &&
        grantAllows.size > bareAllows.size &&
        bareAllows.size === 0,
      `…and the three callers genuinely differ, so the comparison is not vacuous (admin=${adminAllows.size}, single-grant=${grantAllows.size}, bare=${bareAllows.size})`,
    );

    console.log(
      "12e. a permission edited in the database changes enforcement, with no code change and no redeploy",
    );
    // `isActive: false` is the deny: the row stops appearing in any ability that would have
    // carried it, without unpicking a single grant. Written here through the admin API — each
    // variant's hooks prove the same thing again with a raw database write, to rule out the API
    // doing anything in memory.
    const deactivated = await call("POST", "/permissions", {
      token: await admin.freshToken(),
      workspaceId: admin.workspaceId,
      body: { slug: "users:read", isActive: false },
    });
    assert(
      succeeded(deactivated.status),
      `an admin can deactivate a permission (got ${deactivated.status})`,
    );

    const listAfterDeactivate = await call("GET", "/permissions", {
      token: await admin.freshToken(),
      workspaceId: admin.workspaceId,
    });
    assert(
      (listAfterDeactivate.body?.permissions ?? []).some(
        (p: { slug: string; isActive: boolean }) =>
          p.slug === "users:read" && p.isActive === false,
      ),
      "the catalog reports it as inactive",
    );

    const deniedByEdit = await call("GET", "/admin/users", {
      token: singleGrantUser!.token,
      workspaceId: admin.workspaceId,
    });
    assert(
      deniedByEdit.status === 403,
      `the route it opened is now refused for a user whose grant is untouched (got ${deniedByEdit.status})`,
    );

    const adminDeniedToo = await call("GET", "/admin/users", {
      token: await admin.freshToken(),
      workspaceId: admin.workspaceId,
    });
    assert(
      adminDeniedToo.status === 403,
      `…including for the administrator, whose role still carries it (got ${adminDeniedToo.status})`,
    );

    const reactivated = await call("POST", "/permissions", {
      token: await admin.freshToken(),
      workspaceId: admin.workspaceId,
      body: { slug: "users:read", isActive: true },
    });
    assert(
      succeeded(reactivated.status),
      `an admin can reactivate it (got ${reactivated.status})`,
    );
    const restored = await call("GET", "/admin/users", {
      token: singleGrantUser!.token,
      workspaceId: admin.workspaceId,
    });
    assert(
      restored.status === 200,
      `and every grant that pointed at it works again immediately (got ${restored.status})`,
    );

    console.log("13. Prometheus metrics");
    // `/metrics` is not on the tiered route table — it is operator plumbing, mounted the way
    // `/docs` is, and gated by METRICS_TOKEN rather than by a permission slug. The assertions
    // below are the proof of the three properties that placement was chosen for: that the
    // exposition escapes the response envelope, that requests the guard chain rejects are still
    // counted, and that the route label cannot be used to exhaust Prometheus's memory.
    const scrapeMetrics = async (token?: string) => {
      const res = await fetch(`http://localhost:${BASE_PORT}/metrics`, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });
      return {
        status: res.status,
        contentType: res.headers.get("content-type") ?? "",
        body: await res.text(),
      };
    };

    // One unauthenticated call against a route whose path carries an id — it proves two separate
    // things below, because the route matches (so the pattern is recorded) before the
    // authentication middleware refuses it.
    const scannedId = randomUUID();
    const guardRejected = await call("GET", `/admin/users/${scannedId}`);
    assert(
      guardRejected.status === 401,
      `an unauthenticated admin call is rejected (got ${guardRejected.status})`,
    );

    const metrics = await scrapeMetrics();
    assert(
      metrics.status === 200,
      `GET /metrics responds (got ${metrics.status})`,
    );
    assert(
      metrics.contentType.startsWith("text/plain"),
      `...as Prometheus text rather than JSON (got "${metrics.contentType}")`,
    );
    assert(
      !metrics.body.trimStart().startsWith("{"),
      "...and escapes the {success, statusCode, message, data} envelope",
    );
    assert(
      metrics.body.includes("http_requests_total"),
      "...exposing the HTTP request counter",
    );
    assert(
      metrics.body.includes("http_request_duration_seconds_bucket"),
      "...and the latency histogram's buckets, which is what makes a quantile computable",
    );
    assert(
      metrics.body.includes("process_cpu_seconds_total"),
      "...alongside the Node runtime metrics",
    );
    // The whole reason collection is middleware and not an interceptor or a tiered route:
    // guards run first, so anything registered at route level never observes the 401 it raised.
    assert(
      /http_requests_total\{[^}]*status_code="401"/.test(metrics.body),
      "requests rejected by the guard chain are counted, not invisible to the collector",
    );
    assert(
      metrics.body.includes('route="/api/v1/admin/users/:userId"'),
      "the route label is the matched route pattern",
    );
    assert(
      !metrics.body.includes(scannedId),
      "...and never the raw path, so an unauthenticated caller cannot mint one series per request",
    );
    assert(
      !metrics.body.includes('route="/metrics"'),
      "a scrape does not record itself",
    );

    // METRICS_TOKEN is read per request rather than captured when the handler is built, which is
    // what lets one running app prove both sides of the gate.
    const metricsToken = `proof-metrics-${RUN_ID}`;
    process.env["METRICS_TOKEN"] = metricsToken;
    try {
      const anonymous = await scrapeMetrics();
      assert(
        anonymous.status === 401,
        `with METRICS_TOKEN set, an unauthenticated scrape is refused (got ${anonymous.status})`,
      );
      const wrongToken = await scrapeMetrics("not-the-metrics-token");
      assert(
        wrongToken.status === 401,
        `...and so is a wrong token (got ${wrongToken.status})`,
      );
      const authorized = await scrapeMetrics(metricsToken);
      assert(
        authorized.status === 200,
        `...while the matching one is served (got ${authorized.status})`,
      );
    } finally {
      delete process.env["METRICS_TOKEN"];
    }

    console.log(
      "13b. authorization cache configuration (AuthzCache, no server)",
    );
    await proveAuthzCacheConfiguration();

    console.log(
      "13c. the authorization-cache admin endpoints: gated, scoped, and clear really invalidates",
    );
    for (const [method, path] of [
      ["GET", "/admin/authz-cache"],
      ["POST", "/admin/authz-cache/clear"],
    ] as const) {
      const denied = await call(method, path, {
        token: bare.token,
        workspaceId: admin.workspaceId,
      });
      assert(
        denied.status === 403,
        `an ordinary user is refused ${method} ${path} (got ${denied.status})`,
      );
    }

    const cacheAdminToken = await admin.freshToken();
    const cacheProbe = await probeUser("cache-probe", ["users:read"]);
    // One authorized request, so this user's resolved authorization is now in the store.
    await call("GET", "/admin/users", {
      token: cacheProbe.token,
      workspaceId: admin.workspaceId,
    });
    const inspected = await call("GET", "/admin/authz-cache", {
      token: cacheAdminToken,
      workspaceId: admin.workspaceId,
    });
    type InspectedEntry = {
      key: string;
      userId: string;
      workspaceId?: string;
      roles: string[];
      permissions: string[];
    };
    const inspectedEntries = (inspected.body?.entries ??
      []) as InspectedEntry[];
    const probeEntry = inspectedEntries.find(
      (e) => e.userId === cacheProbe.userId,
    );
    assert(
      inspected.status === 200 && inspected.body?.active === true,
      `the admin sees an active cache (got ${inspected.status}, active=${inspected.body?.active})`,
    );
    assert(
      !!probeEntry &&
        probeEntry.permissions.includes("users:read") &&
        probeEntry.roles.includes(NO_PERMS_ROLE),
      `…with an entry for a user who just made an authorized request, carrying their roles and permissions (got ${JSON.stringify(probeEntry)})`,
    );
    if (admin.workspaceId !== undefined) {
      const wsPrefix = `simpleauthkit:authz:${admin.workspaceId}:`;
      assert(
        inspectedEntries.length > 0 &&
          inspectedEntries.every(
            (e) =>
              e.workspaceId === admin.workspaceId && e.key.startsWith(wsPrefix),
          ),
        `…and every listed entry belongs to the workspace the request named — no other workspace's entries leak (${inspectedEntries.length} entries)`,
      );
    }

    const cleared = await call("POST", "/admin/authz-cache/clear", {
      token: cacheAdminToken,
      workspaceId: admin.workspaceId,
    });
    assert(
      cleared.status === 201 &&
        cleared.body?.version ===
          (BigInt(inspected.body.version as string) + 1n).toString() &&
        (cleared.body?.removed as number) >= 1,
      `clearing bumps the version by one and deletes the stored entries (got ${cleared.status}, ${JSON.stringify(cleared.body)}, previous version ${inspected.body?.version})`,
    );
    const afterClear = await call("GET", "/admin/authz-cache", {
      token: cacheAdminToken,
      workspaceId: admin.workspaceId,
    });
    assert(
      !((afterClear.body?.entries ?? []) as InspectedEntry[]).some(
        (e) => e.userId === cacheProbe.userId,
      ),
      "…after which the cleared user's entry is gone",
    );
    const beforeRecall = { ...authzCache.stats };
    const recall = await call("GET", "/admin/users", {
      token: cacheProbe.token,
      workspaceId: admin.workspaceId,
    });
    assert(
      recall.status === 200 &&
        authzCache.stats.resolutions - beforeRecall.resolutions === 1,
      `…and their next authorized request re-resolves from the database (got ${recall.status}, resolutions +${authzCache.stats.resolutions - beforeRecall.resolutions})`,
    );

    console.log(`14. ${hooks.variant}-specific properties`);
    await hooks.proveVariantProperties(ctx, admin);
  } finally {
    await app.close();
  }

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log("\nAll assertions passed.");
}

/**
 * `AuthConfig.authzCache` is a public surface, so each setting is proved against the class
 * directly, with a stub resolver and a stub version source — no server, no database.
 */
async function proveAuthzCacheConfiguration(): Promise<void> {
  const ctxValue = { roles: ["r"], permissions: ["p:read"] };
  let versionReads = 0;
  const source = {
    readAuthzVersion: async () => {
      versionReads += 1;
      return 1n;
    },
    bumpAuthzVersion: async () => 2n,
    // Never exercised here — this suite only drives .get(), never the admin .inspect() endpoint.
    readProfileSummaries: async () => new Map(),
  };
  let resolves = 0;
  const resolver = async () => {
    resolves += 1;
    return ctxValue;
  };

  const disabled = new AuthzCache(source, {
    enabled: false,
    revalidate: true,
    ttlSeconds: 30,
  });
  for (let i = 0; i < 3; i += 1) await disabled.get("u1", resolver);
  assert(
    resolves === 3 && versionReads === 0 && disabled.stats.hits === 0,
    `enabled: false resolves on every call and never reads the version (resolves ${resolves}, version reads ${versionReads})`,
  );

  resolves = 0;
  versionReads = 0;
  const storeless = new AuthzCache(source, {
    enabled: true,
    revalidate: true,
    ttlSeconds: 30,
  });
  for (let i = 0; i < 3; i += 1) await storeless.get("u1", resolver);
  assert(
    resolves === 3 && versionReads === 0 && !storeless.active,
    `no store = no cache: enabled but storeless resolves on every call and never reads the version (resolves ${resolves}, version reads ${versionReads})`,
  );

  resolves = 0;
  versionReads = 0;
  const trusting = new AuthzCache(source, {
    enabled: true,
    revalidate: false,
    ttlSeconds: 1,
    store: new MapAuthzCacheStore(),
  });
  for (let i = 0; i < 3; i += 1) await trusting.get("u1", resolver);
  assert(
    resolves === 1 && versionReads === 0 && trusting.stats.hits === 2,
    `revalidate: false reuses the entry without reading the version (resolves ${resolves}, version reads ${versionReads}, hits ${trusting.stats.hits})`,
  );
  await new Promise((r) => setTimeout(r, 1200));
  await trusting.get("u1", resolver);
  assert(
    resolves === 2,
    `…until ttlSeconds passes, then it resolves again (resolves ${resolves})`,
  );

  const calls: string[] = [];
  const backing = new MapAuthzCacheStore();
  const customStore = {
    get: async (key: string) => {
      calls.push(`get ${key}`);
      return backing.get(key);
    },
    set: async (key: string, value: string, ttlSeconds: number) => {
      calls.push(`set ${key} ${ttlSeconds}`);
      return backing.set(key, value, ttlSeconds);
    },
  };
  resolves = 0;
  const pluggable = new AuthzCache(source, {
    enabled: true,
    revalidate: true,
    ttlSeconds: 7,
    store: customStore,
  });
  await pluggable.get("u2", resolver);
  await pluggable.get("u2", resolver);
  assert(
    calls.join("|") ===
      "get simpleauthkit:authz:u2|set simpleauthkit:authz:u2 7|get simpleauthkit:authz:u2" &&
      resolves === 1,
    `a custom store receives the cache's get/set calls, namespaced and with the configured TTL (got ${calls.join(" | ")})`,
  );

  resolves = 0;
  const neverCached = new AuthzCache(source, {
    enabled: true,
    revalidate: true,
    ttlSeconds: 30,
    store: new MapAuthzCacheStore(),
  });
  await neverCached.get("u3", async () => {
    resolves += 1;
    return null;
  });
  await neverCached.get("u3", async () => {
    resolves += 1;
    return null;
  });
  assert(resolves === 2, "a null answer (not a member) is never cached");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
