// HS256: one symmetric secret signs and verifies. `kid` is header-only metadata, not consulted
// on the verify path — there is only ever one secret to check against.
export interface JwtSigningKey {
  kid: string;
  secret: Uint8Array;
}

export interface AccessTokenClaims {
  sub: string;
  sessionId: string;
  roles: string[];
  permissions: string[];
  jti: string;
}

// `roles`/`permissions` omitted (not empty arrays) means "resolve authorization elsewhere" —
// a combo that resolves it from the database per request passes neither field.
export interface AccessTokenInput {
  sub: string;
  sessionId: string;
  roles?: string[];
  permissions?: string[];
}

export interface RefreshTokenClaims {
  sub: string;
  sessionId: string;
  sv: number;
  jti: string;
}

// Holds no usable credential: `currentRefreshJti` is the id of the valid refresh token, never
// the token itself — a read of this table hands an attacker nothing they can present.
export interface SessionRecord {
  id: string;
  userId: string;
  sessionVersion: number;
  currentRefreshJti: string;
  /** Which login produced this session — an OAuth provider name, or absent for a password login. */
  provider?: string;
  expiresAt: string;
  revokedAt: string | null;
  /** The user who revoked it. Absent when it was revoked by something other than a person. */
  revokedBy?: string;
  revokedByIp?: string;
  createdAt: string;
  userAgent?: string;
  ip?: string;
}

// Optional throughout: a revocation with no actor (a refresh-reuse kill) is a real case, and
// writing a wrong actor would be worse than writing none.
export interface Revoker {
  userId?: string;
  ip?: string;
}

export type AuditEvent =
  | { type: "session_created"; sessionId: string; userId: string }
  | { type: "session_revoked"; sessionId: string; userId: string }
  | { type: "all_sessions_revoked"; userId: string }
  | { type: "other_sessions_revoked"; userId: string; keepSessionId: string }
  | { type: "refresh_reuse_detected"; sessionId: string; userId: string }
  | { type: "user_blocked"; userId: string }
  | { type: "user_deactivated"; userId: string }
  | { type: "password_reset_requested"; userId: string }
  | { type: "password_reset_completed"; userId: string }
  | { type: "two_factor_enabled"; userId: string }
  | { type: "two_factor_disabled"; userId: string }
  | { type: "two_factor_challenge_failed"; userId: string }
  | { type: "oauth_account_linked"; userId: string; provider: string }
  | { type: "role_assigned"; userId: string; role: string }
  | { type: "role_revoked"; userId: string; role: string }
  | { type: "permission_granted"; userId: string; permission: string }
  | { type: "permission_revoked"; userId: string; permission: string };

export class AuthCoreError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "AuthCoreError";
  }
}

export class RefreshInvalidError extends AuthCoreError {
  constructor(message = "refresh token is invalid or revoked") {
    super(message, "REFRESH_INVALID");
  }
}

export class RefreshReuseDetectedError extends AuthCoreError {
  constructor(message = "refresh token reuse detected, session family revoked") {
    super(message, "REFRESH_REUSE_DETECTED");
  }
}

export class AccessTokenInvalidError extends AuthCoreError {
  constructor(message = "access token is invalid, expired, or revoked") {
    super(message, "ACCESS_TOKEN_INVALID");
  }
}

export class TwoFactorChallengeInvalidError extends AuthCoreError {
  constructor(message = "two-factor challenge token is invalid or expired") {
    super(message, "TWO_FACTOR_CHALLENGE_INVALID");
  }
}

export class PasswordResetTokenInvalidError extends AuthCoreError {
  constructor(message = "password reset token is invalid, expired, or already used") {
    super(message, "PASSWORD_RESET_TOKEN_INVALID");
  }
}

export class OAuthExchangeError extends AuthCoreError {
  constructor(message = "OAuth code exchange with the provider failed") {
    super(message, "OAUTH_EXCHANGE_FAILED");
  }
}

export class OAuthProfileInvalidError extends AuthCoreError {
  constructor(message = "OAuth provider id_token is invalid or could not be verified") {
    super(message, "OAUTH_PROFILE_INVALID");
  }
}
