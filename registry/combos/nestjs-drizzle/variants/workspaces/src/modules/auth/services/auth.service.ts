import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { and, desc, eq, gt, or } from "drizzle-orm";
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
import { AUTH_CONFIG, AuthConfig } from "@/common/config/auth.config";
import { DRIZZLE_DB, type Database } from "@/common/config/db";
import { AuthTokenService } from "@/common/auth/token.service";
import { OAuthRepository } from "@/modules/auth/repositories/oauth.repository";
import { PasswordResetRepository } from "@/modules/auth/repositories/password-reset.repository";
import { RATE_LIMIT_STORE } from "@/common/auth/cache/rate-limit.store";
import type { Revoker } from "@/lib/auth/core/types";
import { sessions, users } from "@/database/schema";
import { SessionRepository } from "@/modules/auth/repositories/session.repository";
import { TwoFactorRepository } from "@/modules/auth/repositories/two-factor.repository";
import { toId } from "@/common/helpers/id.helper";

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
 * wrapping RbacRepository/AuditLogRepository directly. Workspace membership itself
 * (WorkspaceController) stays alongside identity — see auth.module.ts.
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    @Inject(SessionRepository) private readonly sessions: SessionRepository,
    @Inject(AuthTokenService) private readonly tokens: AuthTokenService,
    @Inject(RATE_LIMIT_STORE) private readonly rateLimit: RateLimitDeps,
    @Inject(TwoFactorRepository)
    private readonly twoFactor: TwoFactorRepository,
    @Inject(OAuthRepository) private readonly oauth: OAuthRepository,
    @Inject(PasswordResetRepository)
    private readonly passwordReset: PasswordResetRepository,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  /** Creates the user and nothing else. Joining or creating a workspace is a separate, explicit call — see WorkspaceController. */
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
    const [existing] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);
    if (existing) throw new ConflictException("email already registered");

    const passwordHash = await hashPassword(input.password);
    const [user] = await this.db
      .insert(users)
      .values({
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        displayName: input.displayName,
        phone: input.phone,
        username: input.username,
      })
      .returning();
    return this.issueSessionTokens(user, {
      userAgent: input.userAgent,
      ip: input.ip,
    });
  }

  /** Returns full tokens directly, or a short-lived challenge if the account has 2FA enabled — see `loginTwoFactor`. */
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

    const [user] = await this.db
      .select()
      .from(users)
      .where(
        or(
          eq(users.email, input.identifier),
          eq(users.username, input.identifier),
          eq(users.phone, input.identifier),
        ),
      )
      .limit(1);
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

  /** Completes the challenge `login()` returned when 2FA is enabled — a TOTP code or an unused backup code. */
  async loginTwoFactor(input: {
    challengeToken: string;
    code: string;
    userAgent?: string;
    ip?: string;
  }): Promise<AuthTokens> {
    const { sub } = await this.tokens.verifyTwoFactorChallengeToken(
      input.challengeToken,
    );

    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, toId(sub)))
      .limit(1);
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
    const user = await this.getUserOrThrow(userId);
    const secret = generateTotpSecret();
    // Not enabled yet — confirmTwoFactor() flips that, so an abandoned enrollment never locks the account out.
    await this.db
      .update(users)
      .set({ twoFactorSecret: secret, twoFactorEnabled: false })
      .where(eq(users.id, idBig));
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
    const user = await this.getUserOrThrow(userId);
    if (!user.twoFactorSecret)
      throw new BadRequestException("call enrollTwoFactor first");
    if (!verifyTotpCode(user.twoFactorSecret, code))
      throw new UnauthorizedException("invalid two-factor code");

    const backupCodes = generateBackupCodes();
    await this.twoFactor.saveBackupCodes(
      idBig,
      backupCodes.map((c) => c.hash),
    );
    await this.db
      .update(users)
      .set({ twoFactorEnabled: true })
      .where(eq(users.id, idBig));
    await this.sessions.appendAuditEvent({
      type: "two_factor_enabled",
      userId,
    });
    return { backupCodes: backupCodes.map((c) => c.code) };
  }

  async disableTwoFactor(userId: string, code: string): Promise<void> {
    const idBig = toId(userId);
    const user = await this.getUserOrThrow(userId);
    if (!user.twoFactorEnabled || !user.twoFactorSecret)
      throw new BadRequestException("two-factor is not enabled");

    const validTotp = verifyTotpCode(user.twoFactorSecret, code);
    const validBackup =
      !validTotp && (await this.twoFactor.consumeBackupCode(idBig, code));
    if (!validTotp && !validBackup)
      throw new UnauthorizedException("invalid two-factor code");

    await this.db
      .update(users)
      .set({ twoFactorEnabled: false, twoFactorSecret: null })
      .where(eq(users.id, idBig));
    await this.twoFactor.clearBackupCodes(idBig);
    await this.sessions.appendAuditEvent({
      type: "two_factor_disabled",
      userId,
    });
  }

  /** Always succeeds from the caller's point of view — an unknown email or a throttled request looks identical, to avoid enumeration. */
  async requestPasswordReset(email: string): Promise<void> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
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
    // The old password is no longer trusted, so neither are its sessions. The revoker is the user
    // themselves — they proved control of the account by consuming the reset token.
    await revokeAllSessionsForUser(this.sessions, userId, { userId });
  }

  /** Builds the redirect URL for `provider`. `state` is an opaque anti-CSRF nonce the provider echoes back verbatim. */
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

    const user = await this.getUserOrThrow(userId);
    if (user.blocked || !user.isActive || user.isDeleted)
      throw new UnauthorizedException("account is blocked");
    return this.issueSessionTokens(user, { provider });
  }

  /** `req.auth` (the JWT claims) never carries 2FA status, so `/auth/me` fetches it fresh — the one bit of the response that isn't just echoing the token. */
  async getTwoFactorStatus(
    userId: string,
  ): Promise<{ twoFactorEnabled: boolean }> {
    const [user] = await this.db
      .select({ twoFactorEnabled: users.twoFactorEnabled })
      .from(users)
      .where(eq(users.id, toId(userId)))
      .limit(1);
    if (!user) throw new NotFoundException(`user "${userId}" not found`);
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
    // "Active" is now two conditions, not one: not revoked, and not past its own absolute expiry.
    // `sessions_user_active_idx` is (user_id, is_revoked, expires_at) for exactly this read.
    const rows = await this.db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, toId(userId)),
          eq(sessions.isRevoked, false),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(sessions.createdAt));
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

    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, toId(session.userId)))
      .limit(1);
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
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userIdBig))
      .limit(1);
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
    await this.db
      .update(users)
      .set({ passwordHash, updatedBy: userIdBig })
      .where(eq(users.id, userIdBig));
    // The old password is no longer trusted everywhere else it's signed in — but leave the
    // session making this very call alone, the same courtesy `logoutOthers` extends.
    await revokeOtherSessionsForUser(this.sessions, userId, currentSessionId, {
      userId,
    });
  }

  /** Backs both `GET`- and `PATCH /auth/me` — deliberately not workspace-scoped, see `updateProfile`. */
  private toSelfProfile(user: typeof users.$inferSelect): SelfProfile {
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
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, userIdBig), eq(users.isDeleted, false)))
      .limit(1);
    if (!user) throw new UnauthorizedException("invalid credentials");
    return this.toSelfProfile(user);
  }

  /**
   * Self-service — no `users:manage` permission required, the caller's own row only, and
   * deliberately not workspace-scoped: a profile belongs to the account, not to any one
   * membership, so this updates the same `users` row `updateMember` would, without requiring an
   * `X-Workspace-Id` or a membership in it.
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
    const userIdBig = toId(userId);
    const [existing] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, userIdBig), eq(users.isDeleted, false)))
      .limit(1);
    if (!existing) throw new UnauthorizedException("invalid credentials");

    const changed = Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    );
    const [user] = await this.db
      .update(users)
      .set({ ...changed, updatedBy: userIdBig })
      .where(eq(users.id, userIdBig))
      .returning();
    return this.toSelfProfile(user);
  }

  private async getUserOrThrow(
    userId: string,
  ): Promise<typeof users.$inferSelect> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, toId(userId)))
      .limit(1);
    if (!user) throw new NotFoundException(`user "${userId}" not found`);
    return user;
  }

  /**
   * The access token identifies the user and the session, and carries no authorization: roles
   * and permissions belong to a workspace membership, and this token is valid in all of them.
   * Each request resolves its own — see AuthzGuard. Takes the raw database user row (bigint id)
   * — every call site already has one in hand.
   */
  private async issueSessionTokens(
    user: { id: bigint },
    meta: { userAgent?: string; ip?: string; provider?: string },
  ): Promise<AuthTokens> {
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
