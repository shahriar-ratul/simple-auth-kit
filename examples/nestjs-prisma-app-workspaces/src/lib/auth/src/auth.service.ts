import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, HttpException, HttpStatus, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
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
  deactivateUser,
  revokeAccessToken,
  revokeAllSessionsForUser,
  revokeOtherSessionsForUser,
  revokeSession,
  rotateRefreshToken,
} from "@/lib/auth/core/session-policy.js";
import { signAccessToken, signRefreshToken, signTwoFactorChallengeToken, verifyRefreshToken, verifyTwoFactorChallengeToken } from "@/lib/auth/core/token-service.js";
import { buildTotpProvisioningUri, generateBackupCodes, generateTotpSecret, verifyTotpCode } from "@/lib/auth/core/two-factor.js";
import type { Revoker } from "@/lib/auth/core/types.js";
import { AUTH_CONFIG, AuthConfig } from "./auth.config.js";
import type { AuthzContext } from "./authz.guard.js";
import { AuditLogEntry, AuditLogListFilter, AuditLogRepository, toAuditLogEntry } from "./audit-log.repository.js";
import type { Paginated } from "./pagination.js";
import { PrismaClient } from "../generated/prisma/client.js";
import { KeyProviderService } from "./key-provider.js";
import { OAuthRepository } from "./oauth.repository.js";
import { PasswordResetRepository } from "./password-reset.repository.js";
import { InMemoryRateLimitStore } from "./rate-limit.store.js";
import { MemberListFilter, MemberListResult, MemberSummary, PermissionInput, PermissionSummary, RbacRepository, RoleSummary, toMemberSummary } from "./rbac.repository.js";
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

/** `PATCH /auth/me`'s return shape — the same across every combo, workspace-scoped or not, since a profile isn't a workspace concept. */
export interface SelfProfile {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  phone: string | null;
  username: string | null;
  photo: string | null;
  createdAt: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(SessionRepository) private readonly sessions: SessionRepository,
    @Inject(KeyProviderService) private readonly keys: KeyProviderService,
    @Inject(InMemoryRateLimitStore) private readonly rateLimit: InMemoryRateLimitStore,
    @Inject(AuditLogRepository) private readonly auditLog: AuditLogRepository,
    @Inject(RbacRepository) private readonly rbac: RbacRepository,
    @Inject(TwoFactorRepository) private readonly twoFactor: TwoFactorRepository,
    @Inject(OAuthRepository) private readonly oauth: OAuthRepository,
    @Inject(PasswordResetRepository) private readonly passwordReset: PasswordResetRepository,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  // Joining or creating a workspace is a separate, explicit call — see WorkspaceController.
  async signup(input: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    displayName?: string;
    phone?: string;
    username?: string;
    userAgent?: string;
    ip?: string;
  }): Promise<AuthTokens> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException("email already registered");

    const passwordHash = await hashPassword(input.password);
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        displayName: input.displayName,
        phone: input.phone,
        username: input.username,
      },
    });
    return this.issueSessionTokens(user, { userAgent: input.userAgent, ip: input.ip });
  }

  async login(input: { identifier: string; password: string; userAgent?: string; ip?: string }): Promise<AuthTokens | TwoFactorChallenge> {
    const { allowed } = await checkRateLimit(this.rateLimit, "login", input.identifier);
    if (!allowed) throw new HttpException("too many login attempts", HttpStatus.TOO_MANY_REQUESTS);

    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: input.identifier }, { username: input.identifier }, { phone: input.identifier }] },
    });
    if (!user || user.blocked || !user.isActive || user.isDeleted || !user.passwordHash) throw new UnauthorizedException("invalid credentials");

    const valid = await verifyPassword(user.passwordHash, input.password);
    if (!valid) throw new UnauthorizedException("invalid credentials");

    if (user.twoFactorEnabled) {
      const key = await this.keys.getActiveKey();
      const { token } = await signTwoFactorChallengeToken({ activeKey: key }, user.id.toString()); // core-facing: sub must be string
      return { twoFactorRequired: true, challengeToken: token };
    }

    return this.issueSessionTokens(user, { userAgent: input.userAgent, ip: input.ip });
  }

  async loginTwoFactor(input: { challengeToken: string; code: string; userAgent?: string; ip?: string }): Promise<AuthTokens> {
    const { sub } = await verifyTwoFactorChallengeToken({ secret: this.keys.secret }, input.challengeToken);

    const user = await this.prisma.user.findUnique({ where: { id: toId(sub) } });
    if (!user || user.blocked || !user.isActive || user.isDeleted || !user.twoFactorEnabled || !user.twoFactorSecret) throw new UnauthorizedException("invalid credentials");

    const validTotp = verifyTotpCode(user.twoFactorSecret, input.code);
    const validBackup = !validTotp && (await this.twoFactor.consumeBackupCode(user.id, input.code));
    if (!validTotp && !validBackup) {
      await this.sessions.appendAuditEvent({ type: "two_factor_challenge_failed", userId: user.id.toString() }); // core-facing: string
      throw new UnauthorizedException("invalid two-factor code");
    }

    return this.issueSessionTokens(user, { userAgent: input.userAgent, ip: input.ip });
  }

  async enrollTwoFactor(userId: string): Promise<{ secret: string; provisioningUri: string }> {
    const idBig = toId(userId);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: idBig } });
    const secret = generateTotpSecret();
    // Not enabled yet — confirmTwoFactor() flips that.
    await this.prisma.user.update({ where: { id: idBig }, data: { twoFactorSecret: secret, twoFactorEnabled: false } });
    return { secret, provisioningUri: buildTotpProvisioningUri({ secret, accountName: user.email, issuer: this.config.twoFactorIssuer }) };
  }

  async confirmTwoFactor(userId: string, code: string): Promise<{ backupCodes: string[] }> {
    const idBig = toId(userId);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: idBig } });
    if (!user.twoFactorSecret) throw new BadRequestException("call enrollTwoFactor first");
    if (!verifyTotpCode(user.twoFactorSecret, code)) throw new UnauthorizedException("invalid two-factor code");

    const backupCodes = generateBackupCodes();
    await this.twoFactor.saveBackupCodes(idBig, backupCodes.map((c) => c.hash));
    await this.prisma.user.update({ where: { id: idBig }, data: { twoFactorEnabled: true } });
    await this.sessions.appendAuditEvent({ type: "two_factor_enabled", userId });
    return { backupCodes: backupCodes.map((c) => c.code) };
  }

  async disableTwoFactor(userId: string, code: string): Promise<void> {
    const idBig = toId(userId);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: idBig } });
    if (!user.twoFactorEnabled || !user.twoFactorSecret) throw new BadRequestException("two-factor is not enabled");

    const validTotp = verifyTotpCode(user.twoFactorSecret, code);
    const validBackup = !validTotp && (await this.twoFactor.consumeBackupCode(idBig, code));
    if (!validTotp && !validBackup) throw new UnauthorizedException("invalid two-factor code");

    await this.prisma.user.update({ where: { id: idBig }, data: { twoFactorEnabled: false, twoFactorSecret: null } });
    await this.twoFactor.clearBackupCodes(idBig);
    await this.sessions.appendAuditEvent({ type: "two_factor_disabled", userId });
  }

  // Always succeeds from the caller's point of view — an unknown email or a throttled request
  // looks identical, to avoid enumeration.
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
    // The old password is no longer trusted, so neither are its sessions.
    await revokeAllSessionsForUser(this.sessions, userId, { userId });
  }

  async startOAuth(provider: string): Promise<{ url: string }> {
    const state = Buffer.from(JSON.stringify({ nonce: randomUUID() })).toString("base64url");

    if (provider === "google") {
      const creds = this.config.oauthProviders.google;
      if (!creds) throw new BadRequestException("google OAuth is not configured");
      return { url: buildAuthorizationUrl(GOOGLE_OIDC_PROVIDER, { clientId: creds.clientId, redirectUri: creds.redirectUri, state }) };
    }
    if (provider === "apple") {
      const creds = this.config.oauthProviders.apple;
      if (!creds) throw new BadRequestException("apple OAuth is not configured");
      return { url: buildAuthorizationUrl(APPLE_OIDC_PROVIDER, { clientId: creds.clientId, redirectUri: creds.redirectUri, state }) };
    }
    throw new BadRequestException(`unknown OAuth provider "${provider}"`);
  }

  async completeOAuthCallback(provider: string, code: string, _state: string): Promise<AuthTokens> {
    let providerDescriptor: OAuthProviderDescriptor;
    let clientId: string;
    let idToken: string;

    if (provider === "google") {
      const creds = this.config.oauthProviders.google;
      if (!creds) throw new BadRequestException("google OAuth is not configured");
      providerDescriptor = GOOGLE_OIDC_PROVIDER;
      clientId = creds.clientId;
      idToken = (
        await exchangeCodeForTokens(GOOGLE_OIDC_PROVIDER, { clientId: creds.clientId, clientSecret: creds.clientSecret, redirectUri: creds.redirectUri, code })
      ).idToken;
    } else if (provider === "apple") {
      const creds = this.config.oauthProviders.apple;
      if (!creds) throw new BadRequestException("apple OAuth is not configured");
      providerDescriptor = APPLE_OIDC_PROVIDER;
      clientId = creds.clientId;
      const clientSecret = await signAppleClientSecret({ teamId: creds.teamId, clientId: creds.clientId, keyId: creds.keyId, privateKeyPem: creds.privateKey });
      idToken = (await exchangeCodeForTokens(APPLE_OIDC_PROVIDER, { clientId: creds.clientId, clientSecret, redirectUri: creds.redirectUri, code })).idToken;
    } else {
      throw new BadRequestException(`unknown OAuth provider "${provider}"`);
    }

    const profile = await verifyIdTokenAndExtractProfile(providerDescriptor, { clientId, idToken });
    const { userId } = await completeOAuthLogin(this.oauth, { provider, profile });

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: toId(userId) } });
    if (user.blocked || !user.isActive || user.isDeleted) throw new UnauthorizedException("account is blocked");
    return this.issueSessionTokens(user, { provider });
  }

  // Pinned to the caller's workspace — the filter argument cannot widen it.
  async listAuditLog(ctx: AuthzContext, filter: AuditLogListFilter): Promise<Paginated<AuditLogEntry>> {
    const { items, meta } = await this.auditLog.list({ ...filter, workspaceId: ctx.workspaceId });
    return { items: items.map(toAuditLogEntry), meta };
  }

  async getTwoFactorStatus(userId: string): Promise<{ twoFactorEnabled: boolean }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: toId(userId) }, select: { twoFactorEnabled: true } });
    return { twoFactorEnabled: user.twoFactorEnabled };
  }

  async listActiveSessions(userId: string): Promise<Array<{ id: string; createdAt: string; expiresAt: string; provider?: string; userAgent?: string; ip?: string }>> {
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

  // Every method below takes the caller's AuthzContext and reaches the database through a
  // workspace-scoped query — an admin of one workspace has no expressible way to name a row in
  // another.

  async listUsers(ctx: AuthzContext, filter: MemberListFilter): Promise<MemberListResult> {
    const { items, meta } = await this.rbac.listMembers(ctx.workspaceId, filter);
    return { items: items.map(toMemberSummary), meta };
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

  // The catalog is global; what is workspace-scoped is which of this workspace's roles point at it.
  async listPermissions(activeOnly?: boolean): Promise<{ permissions: PermissionSummary[] }> {
    return { permissions: await this.rbac.listPermissions(activeOnly) };
  }

  async definePermission(input: PermissionInput, actorUserId: string | null): Promise<PermissionSummary> {
    return this.rbac.upsertPermission(input, actorUserId);
  }

  async listRoles(ctx: AuthzContext, activeOnly?: boolean): Promise<{ roles: RoleSummary[] }> {
    return { roles: await this.rbac.listRoles(ctx.workspaceId, activeOnly) };
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

  async detachPermissionFromRole(ctx: AuthzContext, roleId: string, permissionSlug: string): Promise<void> {
    await this.rbac.detachPermissionFromRole(ctx.workspaceId, roleId, permissionSlug);
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
    if (!user || user.blocked || !user.isActive || user.isDeleted) throw new UnauthorizedException("invalid credentials");

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

  async changePassword(userId: string, currentSessionId: string, input: { currentPassword: string; newPassword: string }): Promise<void> {
    const userIdBig = toId(userId);
    const user = await this.prisma.user.findUnique({ where: { id: userIdBig } });
    if (!user || user.blocked || !user.isActive || user.isDeleted || !user.passwordHash) throw new UnauthorizedException("invalid credentials");

    const valid = await verifyPassword(user.passwordHash, input.currentPassword);
    if (!valid) throw new UnauthorizedException("invalid credentials");

    const passwordHash = await hashPassword(input.newPassword);
    await this.prisma.user.update({ where: { id: userIdBig }, data: { passwordHash, updatedBy: userIdBig } });
    // The old password is no longer trusted everywhere else it's signed in — but leave the
    // session making this very call alone, the same courtesy `logoutOthers` extends.
    await revokeOtherSessionsForUser(this.sessions, userId, currentSessionId, { userId });
  }

  /** Backs both `GET`- and `PATCH /auth/me` — deliberately not workspace-scoped, see `updateProfile`. */
  private toSelfProfile(user: { id: bigint; email: string; firstName: string | null; lastName: string | null; displayName: string | null; phone: string | null; username: string | null; photo: string | null; createdAt: Date }): SelfProfile {
    return {
      id: user.id.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: user.displayName,
      phone: user.phone,
      username: user.username,
      photo: user.photo,
      createdAt: user.createdAt.toISOString(),
    };
  }

  /** Self-service — no `users:manage` permission required, callable by anyone on their own row, and deliberately not workspace-scoped, see `updateProfile`. */
  async getProfile(userId: string): Promise<SelfProfile> {
    const userIdBig = toId(userId);
    const user = await this.prisma.user.findUnique({ where: { id: userIdBig, isDeleted: false } });
    if (!user) throw new UnauthorizedException("invalid credentials");
    return this.toSelfProfile(user);
  }

  /**
   * Self-service — no `users:manage` permission required, the caller's own row only, and
   * deliberately not workspace-scoped: a profile belongs to the account, not to any one
   * membership, so this updates the same `User` row `updateMember` would, without requiring an
   * `X-Workspace-Id` or a membership in it.
   */
  async updateProfile(
    userId: string,
    input: { firstName?: string | null; lastName?: string | null; displayName?: string | null; phone?: string | null; username?: string | null; photo?: string | null },
  ): Promise<SelfProfile> {
    const userIdBig = toId(userId);
    const existing = await this.prisma.user.findUnique({ where: { id: userIdBig, isDeleted: false } });
    if (!existing) throw new UnauthorizedException("invalid credentials");
    const user = await this.prisma.user.update({ where: { id: userIdBig }, data: { ...input, updatedBy: userIdBig } });
    return this.toSelfProfile(user);
  }

  // Gated on the target being a member of the caller's workspace — otherwise an admin of one
  // workspace could disable an account they have no relationship with.
  async block(ctx: AuthzContext, userId: string, revoker?: Revoker): Promise<void> {
    await this.rbac.requireMember(ctx.workspaceId, userId);
    await this.prisma.user.update({ where: { id: toId(userId) }, data: { blocked: true, updatedBy: toIdOrNull(revoker?.userId) } });
    await blockUser(this.sessions, userId, revoker);
    // Belt and braces: the block is already enforced on the authentication path, but drop the
    // cache entry anyway so nothing about a blocked account is served from memory.
    await this.rbac.invalidateMember(userId, ctx.workspaceId);
  }

  async unblock(ctx: AuthzContext, userId: string, revoker?: Revoker): Promise<void> {
    await this.rbac.requireMember(ctx.workspaceId, userId);
    await this.prisma.user.update({ where: { id: toId(userId) }, data: { blocked: false, updatedBy: toIdOrNull(revoker?.userId) } });
  }

  /**
   * A routine administrative on/off toggle — distinct from `block`/`unblock`, which is a
   * security/moderation action. Both independently deny login; see the note on the `User` model.
   */
  async deactivate(ctx: AuthzContext, userId: string, revoker?: Revoker): Promise<void> {
    await this.rbac.requireMember(ctx.workspaceId, userId);
    await this.prisma.user.update({ where: { id: toId(userId) }, data: { isActive: false, updatedBy: toIdOrNull(revoker?.userId) } });
    await deactivateUser(this.sessions, userId, revoker);
    await this.rbac.invalidateMember(userId, ctx.workspaceId);
  }

  async activate(ctx: AuthzContext, userId: string, revoker?: Revoker): Promise<void> {
    await this.rbac.requireMember(ctx.workspaceId, userId);
    await this.prisma.user.update({ where: { id: toId(userId) }, data: { isActive: true, updatedBy: toIdOrNull(revoker?.userId) } });
  }

  // The access token carries no authorization: roles/permissions belong to a workspace
  // membership, and this token is valid in all of them — each request resolves its own (see
  // AuthzGuard). refresh() does not call this, so a token rotation never counts as a fresh login.
  // Takes the raw Prisma user row (bigint id) — every call site already has one in hand.
  private async issueSessionTokens(user: { id: bigint }, meta: { userAgent?: string; ip?: string; provider?: string }): Promise<AuthTokens> {
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
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
