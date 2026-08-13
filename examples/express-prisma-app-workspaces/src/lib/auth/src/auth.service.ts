import { randomUUID } from "node:crypto";
import { hashPassword, verifyPassword } from "@/lib/auth/core/crypto.js";
import {
  buildAuthorizationUrl,
  APPLE_OIDC_PROVIDER,
  completeOAuthLogin,
  exchangeCodeForTokens,
  GOOGLE_OIDC_PROVIDER,
  OAuthProviderDescriptor,
  signAppleClientSecret,
  verifyIdTokenAndExtractProfile,
} from "@/lib/auth/core/oauth.js";
import { requestPasswordReset as coreRequestPasswordReset, resetPassword as coreResetPassword } from "@/lib/auth/core/password-reset.js";
import { checkRateLimit } from "@/lib/auth/core/rate-limit.js";
import {
  blockUser,
  createSession,
  revokeAccessToken,
  revokeAllSessionsForUser,
  revokeOtherSessionsForUser,
  revokeSession,
  rotateRefreshToken,
} from "@/lib/auth/core/session-policy.js";
import { signAccessToken, signRefreshToken, signTwoFactorChallengeToken, verifyRefreshToken, verifyTwoFactorChallengeToken } from "@/lib/auth/core/token-service.js";
import { buildTotpProvisioningUri, generateBackupCodes, generateTotpSecret, verifyTotpCode } from "@/lib/auth/core/two-factor.js";
import type { Revoker } from "@/lib/auth/core/types.js";
import type { AuthConfig } from "./auth.config.js";
import { HttpError } from "./http-error.js";
import type { AuthzContext } from "./authz.middleware.js";
import { AuditLogEntry, AuditLogListFilter, AuditLogRepository } from "./audit-log.repository.js";
import { PrismaClient } from "../generated/prisma/client.js";
import { KeyProviderService } from "./key-provider.js";
import { OAuthRepository } from "./oauth.repository.js";
import { PasswordResetRepository } from "./password-reset.repository.js";
import { InMemoryRateLimitStore } from "./rate-limit.store.js";
import { MemberListFilter, MemberListResult, MemberSummary, PermissionInput, PermissionSummary, RbacRepository, RoleSummary } from "./rbac.repository.js";
import { SessionRepository } from "./session.repository.js";
import { TwoFactorRepository } from "./two-factor.repository.js";
import { toId, toIdOrNull } from "./id.helper.js";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

export interface TwoFactorChallenge {
  twoFactorRequired: true;
  challengeToken: string;
}

// Plain class, manually constructed with its dependencies (see create-auth-app.ts) —
// no Nest DI container, no decorators. Wires registry/core functions to the
// Prisma-backed repositories/key-provider/rate-limit exactly like the reference combo.
export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly sessions: SessionRepository,
    private readonly keys: KeyProviderService,
    private readonly rateLimit: InMemoryRateLimitStore,
    private readonly auditLog: AuditLogRepository,
    private readonly rbac: RbacRepository,
    private readonly twoFactor: TwoFactorRepository,
    private readonly oauth: OAuthRepository,
    private readonly passwordReset: PasswordResetRepository,
    private readonly config: AuthConfig,
  ) {}

  /** Creates the user and nothing else. Joining or creating a workspace is a separate, explicit call — see WorkspaceController. */
  async signup(input: { email: string; password: string; userAgent?: string; ip?: string }): Promise<AuthTokens> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new HttpError(409, "email already registered");

    const passwordHash = await hashPassword(input.password);
    const user = await this.prisma.user.create({ data: { email: input.email, passwordHash } });
    return this.issueSessionTokens(user, { userAgent: input.userAgent, ip: input.ip });
  }

  /** Returns full tokens directly, or a short-lived challenge if the account has 2FA enabled — see `loginTwoFactor`. */
  async login(input: { email: string; password: string; userAgent?: string; ip?: string }): Promise<AuthTokens | TwoFactorChallenge> {
    const { allowed } = await checkRateLimit(this.rateLimit, "login", input.email);
    if (!allowed) throw new HttpError(429, "too many login attempts");

    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user || user.blocked || user.isDeleted || !user.passwordHash) throw new HttpError(401, "invalid credentials");

    const valid = await verifyPassword(user.passwordHash, input.password);
    if (!valid) throw new HttpError(401, "invalid credentials");

    if (user.twoFactorEnabled) {
      const key = await this.keys.getActiveKey();
      const { token } = await signTwoFactorChallengeToken({ activeKey: key }, user.id.toString()); // core-facing: sub must be string
      return { twoFactorRequired: true, challengeToken: token };
    }

    return this.issueSessionTokens(user, { userAgent: input.userAgent, ip: input.ip });
  }

  /** Completes the challenge `login()` returned when 2FA is enabled — a TOTP code or an unused backup code. */
  async loginTwoFactor(input: { challengeToken: string; code: string; userAgent?: string; ip?: string }): Promise<AuthTokens> {
    const { sub } = await verifyTwoFactorChallengeToken({ secret: this.keys.secret }, input.challengeToken);

    const user = await this.prisma.user.findUnique({ where: { id: toId(sub) } });
    if (!user || user.blocked || user.isDeleted || !user.twoFactorEnabled || !user.twoFactorSecret) throw new HttpError(401, "invalid credentials");

    const validTotp = verifyTotpCode(user.twoFactorSecret, input.code);
    const validBackup = !validTotp && (await this.twoFactor.consumeBackupCode(user.id, input.code));
    if (!validTotp && !validBackup) {
      await this.sessions.appendAuditEvent({ type: "two_factor_challenge_failed", userId: user.id.toString() }); // core-facing: string
      throw new HttpError(401, "invalid two-factor code");
    }

    return this.issueSessionTokens(user, { userAgent: input.userAgent, ip: input.ip });
  }

  async enrollTwoFactor(userId: string): Promise<{ secret: string; provisioningUri: string }> {
    const idBig = toId(userId);
    const user = await this.getUserOrThrow(userId);
    const secret = generateTotpSecret();
    // Not enabled yet — confirmTwoFactor() flips that, so an abandoned enrollment never locks the account out.
    await this.prisma.user.update({ where: { id: idBig }, data: { twoFactorSecret: secret, twoFactorEnabled: false } });
    return { secret, provisioningUri: buildTotpProvisioningUri({ secret, accountName: user.email, issuer: this.config.twoFactorIssuer }) };
  }

  async confirmTwoFactor(userId: string, code: string): Promise<{ backupCodes: string[] }> {
    const idBig = toId(userId);
    const user = await this.getUserOrThrow(userId);
    if (!user.twoFactorSecret) throw new HttpError(400, "call enrollTwoFactor first");
    if (!verifyTotpCode(user.twoFactorSecret, code)) throw new HttpError(401, "invalid two-factor code");

    const backupCodes = generateBackupCodes();
    await this.twoFactor.saveBackupCodes(idBig, backupCodes.map((c) => c.hash));
    await this.prisma.user.update({ where: { id: idBig }, data: { twoFactorEnabled: true } });
    await this.sessions.appendAuditEvent({ type: "two_factor_enabled", userId });
    return { backupCodes: backupCodes.map((c) => c.code) };
  }

  async disableTwoFactor(userId: string, code: string): Promise<void> {
    const idBig = toId(userId);
    const user = await this.getUserOrThrow(userId);
    if (!user.twoFactorEnabled || !user.twoFactorSecret) throw new HttpError(400, "two-factor is not enabled");

    const validTotp = verifyTotpCode(user.twoFactorSecret, code);
    const validBackup = !validTotp && (await this.twoFactor.consumeBackupCode(idBig, code));
    if (!validTotp && !validBackup) throw new HttpError(401, "invalid two-factor code");

    await this.prisma.user.update({ where: { id: idBig }, data: { twoFactorEnabled: false, twoFactorSecret: null } });
    await this.twoFactor.clearBackupCodes(idBig);
    await this.sessions.appendAuditEvent({ type: "two_factor_disabled", userId });
  }

  /** Always succeeds from the caller's point of view — an unknown email or a throttled request looks identical, to avoid enumeration. */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.isDeleted) return;

    const { allowed } = await checkRateLimit(this.rateLimit, "password-reset", email);
    if (!allowed) return;

    const { token } = await coreRequestPasswordReset(this.passwordReset, user.id.toString());
    if (this.config.sendPasswordResetEmail) await this.config.sendPasswordResetEmail(email, token);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const { userId } = await coreResetPassword(this.passwordReset, token, newPassword);
    // The old password is no longer trusted, so neither are its sessions. The revoker is the user
    // themselves — they proved control of the account by consuming the reset token.
    await revokeAllSessionsForUser(this.sessions, userId, { userId });
  }

  /** Builds the redirect URL for `provider`. `state` is an opaque anti-CSRF nonce the provider echoes back verbatim. */
  async startOAuth(provider: string): Promise<{ url: string }> {
    const state = Buffer.from(JSON.stringify({ nonce: randomUUID() })).toString("base64url");

    if (provider === "google") {
      const creds = this.config.oauthProviders.google;
      if (!creds) throw new HttpError(400, "google OAuth is not configured");
      return { url: buildAuthorizationUrl(GOOGLE_OIDC_PROVIDER, { clientId: creds.clientId, redirectUri: creds.redirectUri, state }) };
    }
    if (provider === "apple") {
      const creds = this.config.oauthProviders.apple;
      if (!creds) throw new HttpError(400, "apple OAuth is not configured");
      return { url: buildAuthorizationUrl(APPLE_OIDC_PROVIDER, { clientId: creds.clientId, redirectUri: creds.redirectUri, state }) };
    }
    throw new HttpError(400, `unknown OAuth provider "${provider}"`);
  }

  async completeOAuthCallback(provider: string, code: string, _state: string): Promise<AuthTokens> {
    let providerDescriptor: OAuthProviderDescriptor;
    let clientId: string;
    let idToken: string;

    if (provider === "google") {
      const creds = this.config.oauthProviders.google;
      if (!creds) throw new HttpError(400, "google OAuth is not configured");
      providerDescriptor = GOOGLE_OIDC_PROVIDER;
      clientId = creds.clientId;
      idToken = (
        await exchangeCodeForTokens(GOOGLE_OIDC_PROVIDER, { clientId: creds.clientId, clientSecret: creds.clientSecret, redirectUri: creds.redirectUri, code })
      ).idToken;
    } else if (provider === "apple") {
      const creds = this.config.oauthProviders.apple;
      if (!creds) throw new HttpError(400, "apple OAuth is not configured");
      providerDescriptor = APPLE_OIDC_PROVIDER;
      clientId = creds.clientId;
      const clientSecret = await signAppleClientSecret({ teamId: creds.teamId, clientId: creds.clientId, keyId: creds.keyId, privateKeyPem: creds.privateKey });
      idToken = (await exchangeCodeForTokens(APPLE_OIDC_PROVIDER, { clientId: creds.clientId, clientSecret, redirectUri: creds.redirectUri, code })).idToken;
    } else {
      throw new HttpError(400, `unknown OAuth provider "${provider}"`);
    }

    const profile = await verifyIdTokenAndExtractProfile(providerDescriptor, { clientId, idToken });
    const { userId } = await completeOAuthLogin(this.oauth, { provider, profile });

    const user = await this.getUserOrThrow(userId);
    if (user.blocked || user.isDeleted) throw new HttpError(401, "account is blocked");
    return this.issueSessionTokens(user, { provider });
  }

  /** Pinned to the caller's workspace — the filter argument cannot widen it. */
  async listAuditLog(ctx: AuthzContext, filter: AuditLogListFilter): Promise<{ entries: AuditLogEntry[]; nextCursor: string | null }> {
    return this.auditLog.list({ ...filter, workspaceId: ctx.workspaceId });
  }

  /** `req.auth` (the JWT claims) never carries 2FA status, so `/auth/me` fetches it fresh — the one bit of the response that isn't just echoing the token. */
  async getTwoFactorStatus(userId: string): Promise<{ twoFactorEnabled: boolean }> {
    const user = await this.getUserOrThrow(userId);
    return { twoFactorEnabled: user.twoFactorEnabled };
  }

  async listActiveSessions(userId: string): Promise<Array<{ id: string; createdAt: string; expiresAt: string; provider?: string; userAgent?: string; ip?: string }>> {
    // "Active" is now three conditions, not one: not revoked, and not past its own absolute
    // expiry. `sessions_user_active_idx` is (user_id, is_revoked, expires_at) for exactly this read.
    const rows = await this.prisma.session.findMany({
      where: { userId: toId(userId), isRevoked: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => ({
      id: row.id.toString(),
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      provider: row.provider ?? undefined,
      userAgent: row.userAgent ?? undefined,
      ip: row.ip ?? undefined,
    }));
  }

  // ---- workspace-scoped administration ----
  //
  // Every method below takes the caller's AuthzContext, and every one of them reaches the
  // database through a workspace-scoped query. That is the security property this model rests on:
  // an admin of one workspace has no expressible way to name a row in another.

  async listUsers(ctx: AuthzContext, filter: MemberListFilter): Promise<MemberListResult> {
    return this.rbac.listMembers(ctx.workspaceId, filter);
  }

  async getUser(ctx: AuthzContext, userId: string): Promise<MemberSummary> {
    return this.rbac.getMember(ctx.workspaceId, userId);
  }

  async updateUser(
    ctx: AuthzContext,
    userId: string,
    input: {
      firstName?: string | null;
      lastName?: string | null;
      displayName?: string | null;
      phone?: string | null;
      username?: string | null;
      photo?: string | null;
      dob?: string | null;
      gender?: string | null;
      joinedDate?: string;
    },
    actorUserId: string | null,
  ): Promise<MemberSummary> {
    return this.rbac.updateMember(ctx.workspaceId, userId, input, actorUserId);
  }

  async deleteUser(ctx: AuthzContext, userId: string, actorUserId: string | null, reason?: string): Promise<void> {
    await this.rbac.deleteMember(ctx.workspaceId, userId, actorUserId, reason);
  }

  /**
   * The whole authorization vocabulary of the deployment, for a console's permission matrix. The
   * catalog is global; what is workspace-scoped is which of this workspace's roles point at it.
   */
  async listPermissions(): Promise<{ permissions: PermissionSummary[] }> {
    return { permissions: await this.rbac.listPermissions() };
  }

  /** Defines a permission, or edits one — including deactivating it. The write path for "the catalog is editable in the database". */
  async definePermission(input: PermissionInput, actorUserId: string | null): Promise<PermissionSummary> {
    return this.rbac.upsertPermission(input, actorUserId);
  }

  async listRoles(ctx: AuthzContext): Promise<{ roles: RoleSummary[] }> {
    return { roles: await this.rbac.listRoles(ctx.workspaceId) };
  }

  async createRole(
    ctx: AuthzContext,
    input: { slug: string; name?: string; displayName?: string; description?: string | null; isDefault?: boolean; isActive?: boolean },
    actorUserId: string | null,
  ): Promise<RoleSummary> {
    return this.rbac.createRole(ctx.workspaceId, input, actorUserId);
  }

  async updateRole(
    ctx: AuthzContext,
    roleId: string,
    input: { name?: string; displayName?: string; description?: string | null; isDefault?: boolean; isActive?: boolean },
    actorUserId: string | null,
  ): Promise<RoleSummary> {
    return this.rbac.updateRole(ctx.workspaceId, roleId, input, actorUserId);
  }

  async deleteRole(ctx: AuthzContext, roleId: string, actorUserId: string | null, reason?: string): Promise<void> {
    await this.rbac.deleteRole(ctx.workspaceId, roleId, actorUserId, reason);
  }

  async attachPermissionToRole(ctx: AuthzContext, roleId: string, permissionSlug: string, actorUserId: string | null): Promise<void> {
    await this.rbac.attachPermissionToRole(ctx.workspaceId, roleId, permissionSlug, actorUserId);
  }

  async assignRole(ctx: AuthzContext, userId: string, roleSlug: string): Promise<void> {
    await this.rbac.assignRoleToMember(ctx.workspaceId, userId, roleSlug);
    await this.auditLog.append({ type: "role_assigned", userId, role: roleSlug }, { workspaceId: ctx.workspaceId });
  }

  async revokeRole(ctx: AuthzContext, userId: string, roleSlug: string): Promise<void> {
    await this.rbac.revokeRoleFromMember(ctx.workspaceId, userId, roleSlug);
    await this.auditLog.append({ type: "role_revoked", userId, role: roleSlug }, { workspaceId: ctx.workspaceId });
  }

  async grantPermission(ctx: AuthzContext, userId: string, permissionSlug: string, actorUserId: string | null): Promise<void> {
    await this.rbac.grantPermissionToMember(ctx.workspaceId, userId, permissionSlug, actorUserId);
    await this.auditLog.append({ type: "permission_granted", userId, permission: permissionSlug }, { workspaceId: ctx.workspaceId });
  }

  async revokePermission(ctx: AuthzContext, userId: string, permissionSlug: string): Promise<void> {
    await this.rbac.revokePermissionFromMember(ctx.workspaceId, userId, permissionSlug);
    await this.auditLog.append({ type: "permission_revoked", userId, permission: permissionSlug }, { workspaceId: ctx.workspaceId });
  }

  async refresh(refreshToken: string): Promise<Omit<AuthTokens, "sessionId">> {
    const key = await this.keys.getActiveKey();
    const presented = await verifyRefreshToken({ secret: this.keys.secret }, refreshToken);
    const { session, nextJti } = await rotateRefreshToken(this.sessions, presented);

    const user = await this.prisma.user.findUnique({ where: { id: toId(session.userId) } });
    if (!user || user.blocked || user.isDeleted) throw new HttpError(401, "invalid credentials");

    const access = await signAccessToken(
      { activeKey: key },
      { sub: user.id.toString(), sessionId: session.id },
      { ttlSeconds: this.config.accessTokenTtlSeconds },
    );
    const refresh = await signRefreshToken(
      { activeKey: key },
      { sub: user.id.toString(), sessionId: session.id, sv: session.sessionVersion },
      { jti: nextJti, ttlSeconds: this.config.refreshTokenTtlSeconds },
    );
    return { accessToken: access.token, refreshToken: refresh.token };
  }

  async logout(sessionId: string, accessJti: string, accessRemainingTtlSeconds: number, revoker?: Revoker): Promise<void> {
    await revokeSession(this.sessions, sessionId, revoker);
    await revokeAccessToken(this.sessions, accessJti, accessRemainingTtlSeconds);
  }

  async logoutAll(userId: string, revoker?: Revoker): Promise<void> {
    await revokeAllSessionsForUser(this.sessions, userId, revoker);
  }

  async logoutOthers(userId: string, keepSessionId: string, revoker?: Revoker): Promise<void> {
    await revokeOtherSessionsForUser(this.sessions, userId, keepSessionId, revoker);
  }

  /**
   * Blocking is an account-level action, so it is gated on the target being a member of the
   * caller's workspace — otherwise an admin of one workspace could disable an account they
   * have no relationship with.
   */
  async block(ctx: AuthzContext, userId: string, revoker?: Revoker): Promise<void> {
    await this.rbac.requireMember(ctx.workspaceId, userId);
    await this.prisma.user.update({ where: { id: toId(userId) }, data: { blocked: true, updatedBy: toIdOrNull(revoker?.userId) } });
    // The administrator, not the blocked user, is what lands in `sessions.revoked_by`.
    await blockUser(this.sessions, userId, revoker);
    // Belt and braces. The block is enforced on the authentication path — login and refresh both
    // refuse a blocked user, and AuthGuard never consults the permission cache — so a warm entry
    // cannot defeat it. Dropping the entry anyway means nothing about a blocked account is being
    // served from memory.
    await this.rbac.invalidateMember(userId, ctx.workspaceId);
  }

  async unblock(ctx: AuthzContext, userId: string, revoker?: Revoker): Promise<void> {
    await this.rbac.requireMember(ctx.workspaceId, userId);
    await this.prisma.user.update({ where: { id: toId(userId) }, data: { blocked: false, updatedBy: toIdOrNull(revoker?.userId) } });
  }

  /** Nest's filter turns Prisma's `findUniqueOrThrow` into a 404; without one, this does it by hand. */
  private async getUserOrThrow(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: toId(userId) } });
    if (!user) throw new HttpError(404, `user "${userId}" not found`);
    return user;
  }

  /**
   * The access token identifies the user and the session, and carries no authorization: roles
   * and permissions belong to a workspace membership, and this token is valid in all of them.
   * Each request resolves its own — see AuthzGuard. Takes the raw Prisma user row (bigint id) —
   * every call site already has one in hand.
   */
  private async issueSessionTokens(user: { id: bigint }, meta: { userAgent?: string; ip?: string; provider?: string }): Promise<AuthTokens> {
    const session = await createSession(this.sessions, { userId: user.id.toString(), ...meta });
    const key = await this.keys.getActiveKey();

    const access = await signAccessToken(
      { activeKey: key },
      { sub: user.id.toString(), sessionId: session.id },
      { ttlSeconds: this.config.accessTokenTtlSeconds },
    );
    const refresh = await signRefreshToken(
      { activeKey: key },
      { sub: user.id.toString(), sessionId: session.id, sv: session.sessionVersion },
      { jti: session.currentRefreshJti, ttlSeconds: this.config.refreshTokenTtlSeconds },
    );

    return { accessToken: access.token, refreshToken: refresh.token, sessionId: session.id };
  }
}
