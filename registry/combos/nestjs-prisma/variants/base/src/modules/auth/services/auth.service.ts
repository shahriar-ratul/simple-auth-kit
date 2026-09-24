import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { hashPassword, verifyPassword } from "@/lib/auth/core/crypto";
import {
  buildAuthorizationUrl,
  APPLE_OIDC_PROVIDER,
  completeOAuthLogin,
  exchangeCodeForTokens,
  GOOGLE_OIDC_PROVIDER,
  OAuthProviderDescriptor,
  signAppleClientSecret,
  verifyIdTokenAndExtractProfile,
} from "@/lib/auth/core/oauth";
import {
  requestPasswordReset as coreRequestPasswordReset,
  resetPassword as coreResetPassword,
} from "@/lib/auth/core/password-reset";
import { checkRateLimit, type RateLimitDeps } from "@/lib/auth/core/rate-limit";
import {
  createSession,
  revokeAccessToken,
  revokeAllSessionsForUser,
  revokeOtherSessionsForUser,
  revokeSession,
  rotateRefreshToken,
} from "@/lib/auth/core/session-policy";
import {
  buildTotpProvisioningUri,
  generateBackupCodes,
  generateTotpSecret,
  verifyTotpCode,
} from "@/lib/auth/core/two-factor";
import type { Revoker } from "@/lib/auth/core/types";
import { AUTH_CONFIG, AuthConfig } from "@/common/config/auth.config";
import { PrismaService } from "@/modules/prisma/prisma.service";
import { AuthTokenService } from "@/common/auth/token.service";
import { OAuthRepository } from "@/common/repositories/oauth.repository";
import { PasswordResetRepository } from "@/common/repositories/password-reset.repository";
import { RATE_LIMIT_STORE } from "@/common/auth/cache/rate-limit.store";
import {
  RbacRepository,
  UserSummary,
} from "@/common/repositories/rbac.repository";
import { SessionRepository } from "@/common/repositories/session.repository";
import { TwoFactorRepository } from "@/common/repositories/two-factor.repository";
import { toId } from "@/common/helpers/id.helper";
import { AuthzCache } from "@/common/auth/cache/authz-cache";

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

/**
 * Identity/session endpoints only — signup/login/2FA/OAuth/password-reset/self-profile. User
 * management, roles, permissions, audit-log, and block/deactivate now live in their own modules
 * (AdminModule, RoleModule, PermissionModule, AuditLogModule), each with its own thin service
 * wrapping RbacRepository/AuditLogRepository directly.
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthzCache) private readonly cache: AuthzCache,
    @Inject(SessionRepository) private readonly sessions: SessionRepository,
    @Inject(AuthTokenService) private readonly tokens: AuthTokenService,
    @Inject(RATE_LIMIT_STORE) private readonly rateLimit: RateLimitDeps,
    @Inject(RbacRepository) private readonly rbac: RbacRepository,
    @Inject(TwoFactorRepository)
    private readonly twoFactor: TwoFactorRepository,
    @Inject(OAuthRepository) private readonly oauth: OAuthRepository,
    @Inject(PasswordResetRepository)
    private readonly passwordReset: PasswordResetRepository,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

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
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
    });
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
    // Signup default = whichever roles are flagged `isDefault` in the database, not a code literal.
    await this.rbac.assignDefaultRoles(user.id);
    return this.issueSessionTokens(user, {
      userAgent: input.userAgent,
      ip: input.ip,
    });
  }

  async login(input: {
    identifier: string;
    password: string;
    userAgent?: string;
    ip?: string;
  }): Promise<AuthTokens | TwoFactorChallenge> {
    const { allowed } = await checkRateLimit(
      this.rateLimit,
      "login",
      input.identifier,
    );
    if (!allowed)
      throw new HttpException(
        "too many login attempts",
        HttpStatus.TOO_MANY_REQUESTS,
      );

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: input.identifier },
          { username: input.identifier },
          { phone: input.identifier },
        ],
      },
    });
    if (
      !user ||
      user.blocked ||
      !user.isActive ||
      user.isDeleted ||
      !user.passwordHash
    )
      throw new UnauthorizedException("invalid credentials");

    const valid = await verifyPassword(user.passwordHash, input.password);
    if (!valid) throw new UnauthorizedException("invalid credentials");

    if (user.twoFactorEnabled) {
      const { token } = await this.tokens.signTwoFactorChallengeToken(
        user.id.toString(),
      ); // core-facing: sub must be string
      return { twoFactorRequired: true, challengeToken: token };
    }

    return this.issueSessionTokens(user, {
      userAgent: input.userAgent,
      ip: input.ip,
    });
  }

  async loginTwoFactor(input: {
    challengeToken: string;
    code: string;
    userAgent?: string;
    ip?: string;
  }): Promise<AuthTokens> {
    const { sub } = await this.tokens.verifyTwoFactorChallengeToken(
      input.challengeToken,
    );

    const user = await this.prisma.user.findUnique({
      where: { id: toId(sub) },
    });
    if (
      !user ||
      user.blocked ||
      !user.isActive ||
      user.isDeleted ||
      !user.twoFactorEnabled ||
      !user.twoFactorSecret
    )
      throw new UnauthorizedException("invalid credentials");

    const validTotp = verifyTotpCode(user.twoFactorSecret, input.code);
    const validBackup =
      !validTotp &&
      (await this.twoFactor.consumeBackupCode(user.id, input.code));
    if (!validTotp && !validBackup) {
      await this.sessions.appendAuditEvent({
        type: "two_factor_challenge_failed",
        userId: user.id.toString(),
      }); // core-facing: string
      throw new UnauthorizedException("invalid two-factor code");
    }

    return this.issueSessionTokens(user, {
      userAgent: input.userAgent,
      ip: input.ip,
    });
  }

  async enrollTwoFactor(
    userId: string,
  ): Promise<{ secret: string; provisioningUri: string }> {
    const idBig = toId(userId);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: idBig },
    });
    const secret = generateTotpSecret();
    // Not enabled yet — confirmTwoFactor() flips that.
    await this.prisma.user.update({
      where: { id: idBig },
      data: { twoFactorSecret: secret, twoFactorEnabled: false },
    });
    return {
      secret,
      provisioningUri: buildTotpProvisioningUri({
        secret,
        accountName: user.email,
        issuer: this.config.twoFactorIssuer,
      }),
    };
  }

  async confirmTwoFactor(
    userId: string,
    code: string,
  ): Promise<{ backupCodes: string[] }> {
    const idBig = toId(userId);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: idBig },
    });
    if (!user.twoFactorSecret)
      throw new BadRequestException("call enrollTwoFactor first");
    if (!verifyTotpCode(user.twoFactorSecret, code))
      throw new UnauthorizedException("invalid two-factor code");

    const backupCodes = generateBackupCodes();
    await this.twoFactor.saveBackupCodes(
      idBig,
      backupCodes.map((c) => c.hash),
    );
    await this.prisma.user.update({
      where: { id: idBig },
      data: { twoFactorEnabled: true },
    });
    await this.cache.invalidateProfile(idBig);
    await this.sessions.appendAuditEvent({
      type: "two_factor_enabled",
      userId,
    });
    return { backupCodes: backupCodes.map((c) => c.code) };
  }

  async disableTwoFactor(userId: string, code: string): Promise<void> {
    const idBig = toId(userId);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: idBig },
    });
    if (!user.twoFactorEnabled || !user.twoFactorSecret)
      throw new BadRequestException("two-factor is not enabled");

    const validTotp = verifyTotpCode(user.twoFactorSecret, code);
    const validBackup =
      !validTotp && (await this.twoFactor.consumeBackupCode(idBig, code));
    if (!validTotp && !validBackup)
      throw new UnauthorizedException("invalid two-factor code");

    await this.prisma.user.update({
      where: { id: idBig },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });
    await this.cache.invalidateProfile(idBig);
    await this.twoFactor.clearBackupCodes(idBig);
    await this.sessions.appendAuditEvent({
      type: "two_factor_disabled",
      userId,
    });
  }

  // Always succeeds from the caller's point of view — an unknown email or a throttled request
  // looks identical, to avoid enumeration.
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.isDeleted) return;

    const { allowed } = await checkRateLimit(
      this.rateLimit,
      "password-reset",
      email,
    );
    if (!allowed) return;

    const { token } = await coreRequestPasswordReset(
      this.passwordReset,
      user.id.toString(),
    );
    if (this.config.sendPasswordResetEmail)
      await this.config.sendPasswordResetEmail(email, token);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const { userId } = await coreResetPassword(
      this.passwordReset,
      token,
      newPassword,
    );
    // The old password is no longer trusted, so neither are its sessions.
    await revokeAllSessionsForUser(this.sessions, userId, { userId });
  }

  async startOAuth(provider: string): Promise<{ url: string }> {
    const state = Buffer.from(JSON.stringify({ nonce: randomUUID() })).toString(
      "base64url",
    );

    if (provider === "google") {
      const creds = this.config.oauthProviders.google;
      if (!creds)
        throw new BadRequestException("google OAuth is not configured");
      return {
        url: buildAuthorizationUrl(GOOGLE_OIDC_PROVIDER, {
          clientId: creds.clientId,
          redirectUri: creds.redirectUri,
          state,
        }),
      };
    }
    if (provider === "apple") {
      const creds = this.config.oauthProviders.apple;
      if (!creds)
        throw new BadRequestException("apple OAuth is not configured");
      return {
        url: buildAuthorizationUrl(APPLE_OIDC_PROVIDER, {
          clientId: creds.clientId,
          redirectUri: creds.redirectUri,
          state,
        }),
      };
    }
    throw new BadRequestException(`unknown OAuth provider "${provider}"`);
  }

  async completeOAuthCallback(
    provider: string,
    code: string,
    _state: string,
  ): Promise<AuthTokens> {
    let providerDescriptor: OAuthProviderDescriptor;
    let clientId: string;
    let idToken: string;

    if (provider === "google") {
      const creds = this.config.oauthProviders.google;
      if (!creds)
        throw new BadRequestException("google OAuth is not configured");
      providerDescriptor = GOOGLE_OIDC_PROVIDER;
      clientId = creds.clientId;
      idToken = (
        await exchangeCodeForTokens(GOOGLE_OIDC_PROVIDER, {
          clientId: creds.clientId,
          clientSecret: creds.clientSecret,
          redirectUri: creds.redirectUri,
          code,
        })
      ).idToken;
    } else if (provider === "apple") {
      const creds = this.config.oauthProviders.apple;
      if (!creds)
        throw new BadRequestException("apple OAuth is not configured");
      providerDescriptor = APPLE_OIDC_PROVIDER;
      clientId = creds.clientId;
      const clientSecret = await signAppleClientSecret({
        teamId: creds.teamId,
        clientId: creds.clientId,
        keyId: creds.keyId,
        privateKeyPem: creds.privateKey,
      });
      idToken = (
        await exchangeCodeForTokens(APPLE_OIDC_PROVIDER, {
          clientId: creds.clientId,
          clientSecret,
          redirectUri: creds.redirectUri,
          code,
        })
      ).idToken;
    } else {
      throw new BadRequestException(`unknown OAuth provider "${provider}"`);
    }

    const profile = await verifyIdTokenAndExtractProfile(providerDescriptor, {
      clientId,
      idToken,
    });
    const { userId } = await completeOAuthLogin(this.oauth, {
      provider,
      profile,
    });

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: toId(userId) },
    });
    if (user.blocked || !user.isActive || user.isDeleted)
      throw new UnauthorizedException("account is blocked");
    // Guarded on "holds no roles" rather than "was just created", so this can never re-add a
    // role an administrator revoked from an existing user.
    if (!(await this.rbac.hasAnyRole(user.id)))
      await this.rbac.assignDefaultRoles(user.id);
    return this.issueSessionTokens(user, { provider });
  }

  async getTwoFactorStatus(
    userId: string,
  ): Promise<{ twoFactorEnabled: boolean }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: toId(userId) },
      select: { twoFactorEnabled: true },
    });
    return { twoFactorEnabled: user.twoFactorEnabled };
  }

  async listActiveSessions(userId: string): Promise<
    Array<{
      id: string;
      createdAt: string;
      expiresAt: string;
      provider?: string;
      userAgent?: string;
      ip?: string;
    }>
  > {
    const rows = await this.prisma.session.findMany({
      where: {
        userId: toId(userId),
        isRevoked: false,
        expiresAt: { gt: new Date() },
      },
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

  async refresh(refreshToken: string): Promise<Omit<AuthTokens, "sessionId">> {
    const presented = await this.tokens.verifyRefreshToken(refreshToken);
    const { session, nextJti } = await rotateRefreshToken(
      this.sessions,
      presented,
    );

    const user = await this.prisma.user.findUnique({
      where: { id: toId(session.userId) },
    });
    if (!user || user.blocked || !user.isActive || user.isDeleted)
      throw new UnauthorizedException("invalid credentials");

    // Identity only. Authorization is resolved from the database on every request (AuthzGuard),
    // so a token issued before a grant is as authoritative as one issued after it.
    const access = await this.tokens.signAccessToken(
      { sub: user.id.toString(), sessionId: session.id },
      { ttlSeconds: this.config.accessTokenTtlSeconds },
    );
    const refresh = await this.tokens.signRefreshToken(
      {
        sub: user.id.toString(),
        sessionId: session.id,
        sv: session.sessionVersion,
      },
      { jti: nextJti, ttlSeconds: this.config.refreshTokenTtlSeconds },
    );
    return { accessToken: access.token, refreshToken: refresh.token };
  }

  async logout(
    sessionId: string,
    accessJti: string,
    accessRemainingTtlSeconds: number,
    revoker?: Revoker,
  ): Promise<void> {
    await revokeSession(this.sessions, sessionId, revoker);
    await revokeAccessToken(
      this.sessions,
      accessJti,
      accessRemainingTtlSeconds,
    );
  }

  async logoutAll(userId: string, revoker?: Revoker): Promise<void> {
    await revokeAllSessionsForUser(this.sessions, userId, revoker);
  }

  async logoutOthers(
    userId: string,
    keepSessionId: string,
    revoker?: Revoker,
  ): Promise<void> {
    await revokeOtherSessionsForUser(
      this.sessions,
      userId,
      keepSessionId,
      revoker,
    );
  }

  async changePassword(
    userId: string,
    currentSessionId: string,
    input: { currentPassword: string; newPassword: string },
  ): Promise<void> {
    const userIdBig = toId(userId);
    const user = await this.prisma.user.findUnique({
      where: { id: userIdBig },
    });
    if (
      !user ||
      user.blocked ||
      !user.isActive ||
      user.isDeleted ||
      !user.passwordHash
    )
      throw new UnauthorizedException("invalid credentials");

    const valid = await verifyPassword(
      user.passwordHash,
      input.currentPassword,
    );
    if (!valid) throw new UnauthorizedException("invalid credentials");

    const passwordHash = await hashPassword(input.newPassword);
    await this.prisma.user.update({
      where: { id: userIdBig },
      data: { passwordHash, updatedBy: userIdBig },
    });
    // The old password is no longer trusted everywhere else it's signed in — but leave the
    // session making this very call alone, the same courtesy `logoutOthers` extends.
    await revokeOtherSessionsForUser(this.sessions, userId, currentSessionId, {
      userId,
    });
  }

  /** Backs both `GET`- and `PATCH /auth/me` — roles/blocked/lastLogin are an admin's business, not this endpoint's. */
  private toSelfProfile(user: UserSummary): SelfProfile {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: user.displayName,
      phone: user.phone,
      username: user.username,
      photo: user.photo,
      createdAt: user.createdAt,
    };
  }

  /** Self-service — no `users:manage` permission required, callable by anyone on their own row. */
  async getProfile(userId: string): Promise<SelfProfile> {
    return this.toSelfProfile(await this.rbac.getUser(userId));
  }

  /**
   * Self-service — no `users:manage` permission required, the caller's own row only. Reuses the
   * admin update path (the actor named is the caller themselves), then trims the response to
   * `SelfProfile`: roles/blocked/lastLogin are an admin's business, not this endpoint's.
   */
  async updateProfile(
    userId: string,
    input: {
      firstName?: string | null;
      lastName?: string | null;
      displayName?: string | null;
      phone?: string | null;
      username?: string | null;
      photo?: string | null;
    },
  ): Promise<SelfProfile> {
    return this.toSelfProfile(
      await this.rbac.updateUser(userId, input, userId),
    );
  }

  // refresh() does not call this, so a token rotation never counts as a fresh login.
  // Takes the raw Prisma user row (bigint id) — every call site already has one in hand.
  private async issueSessionTokens(
    user: { id: bigint },
    meta: { userAgent?: string; ip?: string; provider?: string },
  ): Promise<AuthTokens> {
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });
    const session = await createSession(this.sessions, {
      userId: user.id.toString(),
      ...meta,
    });

    const access = await this.tokens.signAccessToken(
      { sub: user.id.toString(), sessionId: session.id },
      { ttlSeconds: this.config.accessTokenTtlSeconds },
    );
    const refresh = await this.tokens.signRefreshToken(
      {
        sub: user.id.toString(),
        sessionId: session.id,
        sv: session.sessionVersion,
      },
      {
        jti: session.currentRefreshJti,
        ttlSeconds: this.config.refreshTokenTtlSeconds,
      },
    );

    return {
      accessToken: access.token,
      refreshToken: refresh.token,
      sessionId: session.id,
    };
  }
}
